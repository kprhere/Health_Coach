-- 0001_init.sql
-- Per-user record store, idempotency log, quota counter, RLS, sync RPCs.
-- Requires the Supabase-provided pieces: auth.users, auth.uid(), and the
-- roles anon / authenticated / service_role (all exist on every project).

-- ---------------------------------------------------------------- tables
create table if not exists public.records (
  user_id    uuid not null references auth.users (id) on delete cascade,
  collection text not null check (collection ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  key        text not null check (char_length(key) between 1 and 256),
  data       jsonb not null,  -- any JSON value (objects, arrays, scalars, null) as the store produces
  version    int  not null default 1,
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  op_id      uuid,
  primary key (user_id, collection, key)
);
create index if not exists records_user_updated_idx on public.records (user_id, updated_at);
create index if not exists records_deleted_idx on public.records (deleted_at) where deleted_at is not null;

create table if not exists public.applied_ops (
  user_id    uuid not null references auth.users (id) on delete cascade,
  op_id      uuid not null,
  version    int,
  applied_at timestamptz not null default now(),
  primary key (user_id, op_id)
);
create index if not exists applied_ops_applied_at_idx on public.applied_ops (applied_at);

-- Row counter per user so the row cap is O(1) to check.
create table if not exists public.user_usage (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  row_count int not null default 0
);

-- ------------------------------------------------------------------- RLS
alter table public.records     enable row level security;
alter table public.records     force  row level security;
alter table public.applied_ops enable row level security;
alter table public.applied_ops force  row level security;
alter table public.user_usage  enable row level security;
alter table public.user_usage  force  row level security;

drop policy if exists records_select on public.records;
drop policy if exists records_insert on public.records;
drop policy if exists records_update on public.records;
drop policy if exists records_delete on public.records;
create policy records_select on public.records for select to authenticated using (user_id = auth.uid());
create policy records_insert on public.records for insert to authenticated with check (user_id = auth.uid());
create policy records_update on public.records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy records_delete on public.records for delete to authenticated using (user_id = auth.uid());

drop policy if exists applied_ops_select on public.applied_ops;
drop policy if exists applied_ops_insert on public.applied_ops;
drop policy if exists applied_ops_update on public.applied_ops;
drop policy if exists applied_ops_delete on public.applied_ops;
create policy applied_ops_select on public.applied_ops for select to authenticated using (user_id = auth.uid());
create policy applied_ops_insert on public.applied_ops for insert to authenticated with check (user_id = auth.uid());
create policy applied_ops_update on public.applied_ops for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy applied_ops_delete on public.applied_ops for delete to authenticated using (user_id = auth.uid());

drop policy if exists user_usage_select on public.user_usage;
create policy user_usage_select on public.user_usage for select to authenticated using (user_id = auth.uid());

-- Supabase grants everything on new public tables to anon/authenticated by
-- default. Take it all back, then grant only what is needed.
revoke all on public.records, public.applied_ops, public.user_usage from public, anon, authenticated;
grant select, insert, update, delete on public.records, public.applied_ops to authenticated;
grant select on public.user_usage to authenticated;
grant all on public.records, public.applied_ops, public.user_usage to service_role;

-- --------------------------------------------------- guard + quota triggers
-- Invoker function: current_user is the real caller role.
--  * caps one row at 1 MB of JSON and one user at 200000 rows
--  * for end users (authenticated/anon) the server owns version/updated_at,
--    so a client can never forge a version, even with a direct table write.
--    Privileged roles (service_role, restore scripts) keep what they send.
create or replace function public.records_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  n int;
begin
  if octet_length(new.data::text) > 1048576 then
    raise exception 'record too large (max 1 MB)' using errcode = '54000';
  end if;

  if tg_op = 'INSERT' then
    select row_count into n from public.user_usage where user_id = new.user_id;
    if coalesce(n, 0) >= 200000 and not exists (
      select 1 from public.records r
      where r.user_id = new.user_id and r.collection = new.collection and r.key = new.key
    ) then
      raise exception 'record limit reached (max 200000 rows)' using errcode = '54000';
    end if;
  else
    if new.user_id <> old.user_id or new.collection <> old.collection or new.key <> old.key then
      raise exception 'record identity is immutable' using errcode = '42501';
    end if;
  end if;

  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.version := 1;
    else
      new.version := old.version + 1;
    end if;
    new.updated_at := clock_timestamp();
  elsif tg_op = 'UPDATE' and new.updated_at is not distinct from old.updated_at then
    new.updated_at := clock_timestamp();
  end if;
  return new;
end $$;

drop trigger if exists records_guard_trg on public.records;
create trigger records_guard_trg before insert or update on public.records
  for each row execute function public.records_guard();

create or replace function public.records_usage_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into public.user_usage (user_id, row_count) values (new.user_id, 1)
    on conflict (user_id) do update set row_count = public.user_usage.row_count + 1;
  elsif tg_op = 'DELETE' then
    update public.user_usage set row_count = greatest(row_count - 1, 0) where user_id = old.user_id;
  end if;
  return null;
end $$;
revoke all on function public.records_usage_after() from public, anon, authenticated;

drop trigger if exists records_usage_trg on public.records;
create trigger records_usage_trg after insert or delete on public.records
  for each row execute function public.records_usage_after();

-- --------------------------------------------------------------- push_ops
-- ops: [{op_id, collection, key, expected_version|null, data, delete, atomic_group?}]
-- Semantics, per op, in order:
--   * op_id already applied            -> duplicates (nothing changes)
--   * expected_version != server row's -> conflict (server row returned)
--   * else upsert with version + 1, record op_id in applied_ops
-- Ops sharing an atomic_group succeed or fail together: one conflict drops the
-- whole group (reported in rolled_back). Ops without a group are independent.
-- A missing row has version 0; expected_version null means "create".
-- A soft-deleted row keeps its version, so a stale client can neither edit
-- nor re-create it; only an op carrying the tombstone's exact version
-- (a deliberate undelete) can.
create or replace function public.push_ops(ops jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  n int;
  i int;
  op jsonb;
  g text;
  k text;
  cur int;
  expv int;
  oid uuid;
  vers jsonb;
  seen uuid[];
  st text[];
  newv int[];
  failed_groups text[] := '{}';
  trig int[] := '{}';
  restart boolean;
  isdel boolean;
  v int;
  applied jsonb := '[]'::jsonb;
  dups jsonb := '[]'::jsonb;
  confs jsonb := '[]'::jsonb;
  rolled jsonb := '[]'::jsonb;
  srv jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if ops is null or jsonb_typeof(ops) <> 'array' then
    raise exception 'ops must be a json array' using errcode = '22023';
  end if;
  n := jsonb_array_length(ops);
  if n > 500 then
    raise exception 'too many ops in one call (max 500)' using errcode = '54000';
  end if;

  for i in 0 .. n - 1 loop
    op := ops -> i;
    if jsonb_typeof(op) <> 'object'
       or (op ->> 'op_id') is null
       or (op ->> 'collection') is null or (op ->> 'collection') !~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'
       or (op ->> 'key') is null or char_length(op ->> 'key') not between 1 and 256 then
      raise exception 'malformed op at index %', i using errcode = '22023';
    end if;
    perform (op ->> 'op_id')::uuid;
    if coalesce((op ->> 'delete')::boolean, false) = false and (op -> 'data') is null then
      raise exception 'op % needs a data value', i using errcode = '22023';
    end if;
    if (op -> 'expected_version') is not null and jsonb_typeof(op -> 'expected_version') not in ('number', 'null') then
      raise exception 'op % has a bad expected_version', i using errcode = '22023';
    end if;
  end loop;

  -- Pass 1: decide the outcome of every op without writing anything.
  <<planning>>
  loop
    vers := '{}'::jsonb;
    seen := '{}';
    st := array_fill('apply'::text, array[greatest(n, 1)]);
    restart := false;
    for i in 0 .. n - 1 loop
      op := ops -> i;
      g := nullif(op ->> 'atomic_group', '');
      if g is not null and g = any (failed_groups) then
        st[i + 1] := 'skipped';
        continue;
      end if;
      oid := (op ->> 'op_id')::uuid;
      if oid = any (seen) or exists (select 1 from public.applied_ops a where a.user_id = uid and a.op_id = oid) then
        st[i + 1] := 'dup';
        continue;
      end if;
      k := (op ->> 'collection') || '|' || (op ->> 'key');
      if vers ? k then
        cur := (vers ->> k)::int;
      else
        select r.version into cur from public.records r
        where r.user_id = uid and r.collection = op ->> 'collection' and r.key = op ->> 'key';
        cur := coalesce(cur, 0);
        vers := vers || jsonb_build_object(k, cur);
      end if;
      expv := coalesce((op ->> 'expected_version')::int, 0);
      if expv <> cur then
        if g is null then
          st[i + 1] := 'conflict';
        else
          failed_groups := failed_groups || g;
          trig := trig || i;
          restart := true;
          exit;
        end if;
      else
        vers := vers || jsonb_build_object(k, cur + 1);
        seen := seen || oid;
      end if;
    end loop;
    exit planning when not restart;
  end loop;
  foreach i in array trig loop
    st[i + 1] := 'conflict';
  end loop;

  -- Pass 2: apply.
  newv := array_fill(0, array[greatest(n, 1)]);
  for i in 0 .. n - 1 loop
    if st[i + 1] <> 'apply' then continue; end if;
    op := ops -> i;
    oid := (op ->> 'op_id')::uuid;
    isdel := coalesce((op ->> 'delete')::boolean, false);
    insert into public.records as r (user_id, collection, key, data, version, updated_at, deleted_at, op_id)
    values (uid, op ->> 'collection', op ->> 'key',
            case when isdel then coalesce(op -> 'data', '{}'::jsonb) else op -> 'data' end,
            1, clock_timestamp(), case when isdel then clock_timestamp() end, oid)
    on conflict (user_id, collection, key) do update set
      data = case when isdel then r.data else excluded.data end,
      version = r.version + 1,
      updated_at = clock_timestamp(),
      deleted_at = case when isdel then coalesce(r.deleted_at, clock_timestamp()) else null end,
      op_id = excluded.op_id
    returning r.version into v;
    newv[i + 1] := v;
    insert into public.applied_ops (user_id, op_id, version) values (uid, oid, v);
  end loop;

  -- Report.
  for i in 0 .. n - 1 loop
    op := ops -> i;
    oid := (op ->> 'op_id')::uuid;
    if st[i + 1] = 'apply' then
      applied := applied || jsonb_build_object('op_id', oid, 'version', newv[i + 1]);
    elsif st[i + 1] = 'dup' then
      select a.version into v from public.applied_ops a where a.user_id = uid and a.op_id = oid;
      dups := dups || jsonb_build_object('op_id', oid, 'version', v);
    elsif st[i + 1] = 'conflict' then
      select jsonb_build_object('collection', r.collection, 'key', r.key, 'data', r.data,
                                'version', r.version, 'updated_at', r.updated_at, 'deleted_at', r.deleted_at)
        into srv
        from public.records r
        where r.user_id = uid and r.collection = op ->> 'collection' and r.key = op ->> 'key';
      confs := confs || jsonb_build_object('op_id', oid, 'server', srv);
    elsif st[i + 1] = 'skipped' then
      rolled := rolled || to_jsonb(oid);
    end if;
  end loop;

  return jsonb_build_object('applied', applied, 'duplicates', dups, 'conflicts', confs, 'rolled_back', rolled);
end $$;

-- ------------------------------------------------------------ pull_changes
-- Rows changed at or after `since` (inclusive on purpose: clients dedupe by
-- version, which makes the cursor safe against rows that commit out of order).
create or replace function public.pull_changes(since timestamptz default null, max_rows int default 1000)
returns setof public.records
language sql security invoker stable set search_path = public, pg_temp as $$
  select * from public.records r
  where r.user_id = auth.uid() and (since is null or r.updated_at >= since)
  order by r.updated_at, r.collection, r.key
  limit least(greatest(coalesce(max_rows, 1000), 1), 5000)
$$;

-- -------------------------------------------------------- delete_my_account
-- Removes everything the caller owns, including their auth user. NOTE: on a
-- real project, deleting storage.objects rows does not delete the underlying
-- file bytes; the client (or scripts/account.mjs) must remove files through the
-- Storage API first. See docs/SETUP_SUPABASE.md.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.records where user_id = uid;
  delete from public.applied_ops where user_id = uid;
  delete from public.user_usage where user_id = uid;
  if to_regclass('public.ai_usage') is not null then
    execute 'delete from public.ai_usage where user_id = $1' using uid;
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'delete from storage.objects where bucket_id = ''uploads'' and (storage.foldername(name))[1] = $1'
      using uid::text;
  end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ------------------------------------------------------------ purge_deleted
create or replace function public.purge_deleted(retention interval default interval '30 days') returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r int;
  a int;
begin
  delete from public.records where deleted_at is not null and deleted_at < now() - retention;
  get diagnostics r = row_count;
  delete from public.applied_ops where applied_at < now() - interval '180 days';
  get diagnostics a = row_count;
  return jsonb_build_object('records', r, 'applied_ops', a);
end $$;
revoke all on function public.purge_deleted(interval) from public, anon, authenticated;
grant execute on function public.purge_deleted(interval) to service_role;

revoke all on function public.push_ops(jsonb) from public, anon;
grant execute on function public.push_ops(jsonb) to authenticated;
revoke all on function public.pull_changes(timestamptz, int) from public, anon;
grant execute on function public.pull_changes(timestamptz, int) to authenticated;
