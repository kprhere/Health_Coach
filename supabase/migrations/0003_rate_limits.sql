-- 0003_rate_limits.sql
-- Per-user daily counter used by the coach-ai Edge Function.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  calls   int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
alter table public.ai_usage force  row level security;
drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage for select to authenticated using (user_id = auth.uid());
revoke all on public.ai_usage from public, anon, authenticated;
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;

-- Counts one call for the caller today. Returns {allowed, calls, limit}.
-- Security definer because end users have no write grant on the table.
create or replace function public.bump_ai_usage(daily_limit int default 30) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  c int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.ai_usage as u (user_id, day, calls) values (uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1
  returning u.calls into c;
  return jsonb_build_object('allowed', c <= daily_limit, 'calls', c, 'limit', daily_limit);
end $$;
revoke all on function public.bump_ai_usage(int) from public, anon;
grant execute on function public.bump_ai_usage(int) to authenticated;
