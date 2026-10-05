// ============================================================
// cloud-db.test.mjs - the real migrations, run in real Postgres (PGlite).
// Supabase's own pieces (auth.uid(), roles, storage tables) are stubbed by
// tests/cloud-prelude.sql, never by the migrations.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDb, asUser, as, push, op, uuid, newUser, rows,
} from './cloud-pg.mjs';

const db = await makeDb();
const del = (collection, key, expected, extra = {}) => ({
  op_id: uuid(), collection, key, expected_version: expected, data: {}, delete: true, ...extra,
});
const q = (sub, sql, params = []) => asUser(db, sub, async () => (await db.query(sql, params)).rows);

test('RLS is enabled AND forced on every table', async () => {
  const { rows: r } = await db.query(`select relname, relrowsecurity, relforcerowsecurity from pg_class
    where relnamespace = 'public'::regnamespace and relname in ('records','applied_ops','user_usage','ai_usage')`);
  assert.equal(r.length, 4);
  for (const t of r) assert.ok(t.relrowsecurity && t.relforcerowsecurity, `${t.relname} must force RLS`);
});

test('user A cannot read, update, delete or insert as user B', async () => {
  const [a, b] = [await newUser(db), await newUser(db)];
  await push(db, a, [op('profile', 'singleton', { name: 'A' })]);
  await push(db, b, [op('profile', 'singleton', { name: 'B' })]);

  assert.deepEqual((await rows(db, b)).map((r) => r.data.name), ['B']);
  assert.deepEqual((await rows(db, a)).map((r) => r.data.name), ['A']);

  // Direct writes aimed at the other user's row touch nothing.
  const upd = await asUser(db, b, () => db.query("update public.records set data = '{\"name\":\"pwned\"}' where user_id = $1", [a]));
  assert.equal(upd.affectedRows, 0);
  const dl = await asUser(db, b, () => db.query('delete from public.records where user_id = $1', [a]));
  assert.equal(dl.affectedRows, 0);
  // Inserting a row owned by someone else is rejected by the policy.
  await assert.rejects(asUser(db, b, () => db.query(
    "insert into public.records (user_id, collection, key, data) values ($1, 'profile', 'evil', '{}')", [a])), /row-level security/);
  // applied_ops and usage are private too.
  assert.equal((await q(b, 'select * from public.applied_ops where user_id = $1', [a])).length, 0);
  assert.equal((await q(b, 'select * from public.user_usage where user_id = $1', [a])).length, 0);

  const { rows: still } = await db.query('select data from public.records where user_id = $1', [a]);
  assert.deepEqual(still[0].data, { name: 'A' });
});

test('no JWT, anon, and group membership grant nothing', async () => {
  const [a, b] = [await newUser(db), await newUser(db)];
  await push(db, a, [op('profile', 'singleton', { name: 'A' })]);
  // authenticated with no subject
  assert.equal((await rows(db, null)).length, 0);
  // anon has no table privileges at all
  await assert.rejects(as(db, 'anon', null, () => db.query('select * from public.records')), /permission denied/);
  // A role that is a member of `authenticated` (or even of service_role's peers) is still bound by RLS.
  await db.exec('create role member_x nologin; grant authenticated to member_x;');
  await db.exec('grant select on public.records to member_x');
  const seen = await as(db, 'member_x', b, async () => (await db.query('select * from public.records')).rows);
  assert.equal(seen.length, 0, 'member of authenticated with B subject must not see A rows');
  const seenNull = await as(db, 'member_x', '', async () => (await db.query('select * from public.records')).rows);
  assert.equal(seenNull.length, 0);
});

test('a client cannot forge versions or identity with direct table writes', async () => {
  const a = await newUser(db);
  await push(db, a, [op('profile', 'singleton', { n: 1 })]);
  await asUser(db, a, () => db.query("update public.records set version = 99, data = '{\"n\":2}' where collection = 'profile'"));
  const [row] = await rows(db, a);
  assert.equal(row.version, 2);
  await assert.rejects(asUser(db, a, () => db.query("update public.records set key = 'moved' where collection = 'profile'")), /immutable/);
});

test('push_ops: create, update chain, and in-batch chain', async () => {
  const a = await newUser(db);
  let r = await push(db, a, [op('mealLogs', '2026-01-01', { kcal: 1 })]);
  assert.equal(r.applied[0].version, 1);
  r = await push(db, a, [op('mealLogs', '2026-01-01', { kcal: 2 }, 1)]);
  assert.equal(r.applied[0].version, 2);
  r = await push(db, a, [op('mealLogs', '2026-01-02', { kcal: 1 }), op('mealLogs', '2026-01-02', { kcal: 2 }, 1), op('mealLogs', '2026-01-02', { kcal: 3 }, 2)]);
  assert.deepEqual(r.applied.map((x) => x.version), [1, 2, 3]);
  const data = (await rows(db, a)).find((x) => x.key === '2026-01-02').data;
  assert.deepEqual(data, { kcal: 3 });
});

test('push_ops: duplicate op ids are idempotent and change nothing', async () => {
  const a = await newUser(db);
  const first = op('habitLogs', 'd1', { done: true });
  await push(db, a, [first]);
  const again = await push(db, a, [first, { ...first, data: { done: 'DIFFERENT' } }]);
  assert.equal(again.applied.length, 0);
  assert.equal(again.duplicates.length, 2);
  assert.equal(again.duplicates[0].version, 1);
  const [row] = await rows(db, a);
  assert.deepEqual(row.data, { done: true });
  assert.equal(row.version, 1);
  // the same op id twice inside one batch applies once
  const o = op('habitLogs', 'd2', { x: 1 });
  const r = await push(db, a, [o, o]);
  assert.equal(r.applied.length, 1);
  assert.equal(r.duplicates.length, 1);
});

test('push_ops: version conflicts return the server row and write nothing', async () => {
  const a = await newUser(db);
  await push(db, a, [op('workoutSessions', '2026-02-01', { sets: 1 })]);
  await push(db, a, [op('workoutSessions', '2026-02-01', { sets: 2 }, 1)]);
  const stale = op('workoutSessions', '2026-02-01', { sets: 'stale' }, 1);
  const r = await push(db, a, [stale]);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].op_id, stale.op_id);
  assert.equal(r.conflicts[0].server.version, 2);
  assert.deepEqual(r.conflicts[0].server.data, { sets: 2 });
  assert.equal((await rows(db, a))[0].version, 2);
  // a conflicting op is NOT recorded as applied, so a corrected retry can reuse nothing by accident
  assert.equal((await q(a, 'select count(*)::int as n from public.applied_ops where op_id = $1', [stale.op_id]))[0].n, 0);
  // creating something that exists is a conflict too
  const dup = await push(db, a, [op('workoutSessions', '2026-02-01', { x: 1 }, null)]);
  assert.equal(dup.conflicts.length, 1);
});

test('push_ops: a delayed old request cannot overwrite a newer row', async () => {
  const a = await newUser(db);
  const original = op('profile', 'singleton', { v: 'one' });
  await push(db, a, [original]);
  const delayed = op('profile', 'singleton', { v: 'late-from-old-device' }, 1);
  await push(db, a, [op('profile', 'singleton', { v: 'two' }, 1)]);
  await push(db, a, [op('profile', 'singleton', { v: 'three' }, 2)]);
  const r = await push(db, a, [delayed]);
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual((await rows(db, a))[0].data, { v: 'three' });
});

test('push_ops: independent ops survive a neighbour conflict; atomic groups do not', async () => {
  const a = await newUser(db);
  await push(db, a, [op('mealLogs', 'x', { n: 1 })]);
  const r = await push(db, a, [
    op('mealLogs', 'ok1', { n: 1 }),
    op('mealLogs', 'x', { n: 'bad' }, 7), // stale, no group
    op('mealLogs', 'g1', { n: 1 }, null, { atomic_group: 'G' }),
    op('mealLogs', 'x', { n: 'bad-in-group' }, 7, { atomic_group: 'G' }),
    op('mealLogs', 'g2', { n: 1 }, null, { atomic_group: 'G' }),
    op('mealLogs', 'other-group', { n: 1 }, null, { atomic_group: 'H' }),
    op('mealLogs', 'ok2', { n: 1 }),
  ]);
  const keys = (await rows(db, a)).map((x) => x.key).sort();
  assert.deepEqual(keys, ['ok1', 'ok2', 'other-group', 'x']);
  assert.equal(r.conflicts.length, 2);
  assert.equal(r.rolled_back.length, 2); // g1 and g2
  assert.equal(r.applied.length, 3);
  assert.deepEqual((await rows(db, a)).find((x) => x.key === 'x').data, { n: 1 });
});

test('push_ops: a rolled-back group leaves no applied_ops trace', async () => {
  const a = await newUser(db);
  const g1 = op('mealLogs', 'a1', {}, null, { atomic_group: 'G' });
  const bad = op('mealLogs', 'a2', {}, 5, { atomic_group: 'G' });
  await push(db, a, [g1, bad]);
  assert.equal((await rows(db, a)).length, 0);
  // the exact same group can be retried once it is correct
  const r = await push(db, a, [g1, { ...bad, expected_version: null }]);
  assert.equal(r.applied.length, 2);
});

test('push_ops: soft delete, no resurrection by stale or create ops', async () => {
  const a = await newUser(db);
  await push(db, a, [op('bodyScans', 's1', { kg: 80 })]);
  const r = await push(db, a, [del('bodyScans', 's1', 1)]);
  assert.equal(r.applied[0].version, 2);
  let [row] = await rows(db, a);
  assert.ok(row.deleted_at, 'row stays as a tombstone');
  assert.deepEqual(row.data, { kg: 80 });

  // stale edit from a device that never saw the delete
  const stale = await push(db, a, [op('bodyScans', 's1', { kg: 81 }, 1)]);
  assert.equal(stale.conflicts.length, 1);
  assert.equal(stale.conflicts[0].server.deleted_at !== null, true);
  // re-create with "null expected" also refuses
  const recreate = await push(db, a, [op('bodyScans', 's1', { kg: 82 }, null)]);
  assert.equal(recreate.conflicts.length, 1);
  [row] = await rows(db, a);
  assert.ok(row.deleted_at);
  assert.equal(row.version, 2);

  // a deliberate undelete carries the tombstone version
  const undo = await push(db, a, [op('bodyScans', 's1', { kg: 80 }, 2)]);
  assert.equal(undo.applied[0].version, 3);
  [row] = await rows(db, a);
  assert.equal(row.deleted_at, null);
});

test('records hold any JSON value: scalars, arrays and null survive exactly', async () => {
  const a = await newUser(db);
  const values = { n: 6, s: 'keep the heels down', arr: [1, { x: 2 }], nul: null, obj: { deep: [true] } };
  await push(db, a, Object.entries(values).map(([k, v]) => op('meta', k, v)));
  const got = Object.fromEntries((await rows(db, a)).map((r) => [r.key, r.data]));
  assert.deepEqual(got, values);
});

test('push_ops rejects malformed input', async () => {
  const a = await newUser(db);
  const bad = async (ops) => assert.rejects(push(db, a, ops));
  await bad([{ op_id: 'not-a-uuid', collection: 'profile', key: 'k', data: {} }]);
  await bad([{ op_id: uuid(), collection: 'bad collection!', key: 'k', data: {} }]);
  await bad([{ op_id: uuid(), collection: 'profile', key: '', data: {} }]);
  await bad([{ op_id: uuid(), collection: 'profile', key: 'k' }]);
  await assert.rejects(asUser(db, null, () => db.query("select public.push_ops('[]'::jsonb)")), /not authenticated/);
  assert.equal((await rows(db, a)).length, 0);
});

test('size caps: 1 MB per row and 200000 rows per user', async () => {
  const a = await newUser(db);
  const big = { blob: 'x'.repeat(1_100_000) };
  await assert.rejects(push(db, a, [op('meta', 'big', big)]), /record too large/);
  const ok = { blob: 'x'.repeat(900_000) };
  assert.equal((await push(db, a, [op('meta', 'ok', ok)])).applied.length, 1);
  // updates are capped too
  await assert.rejects(push(db, a, [op('meta', 'ok', big, 1)]), /record too large/);

  // The counter tracks inserts and deletes.
  assert.equal((await q(a, 'select row_count from public.user_usage'))[0].row_count, 1);
  await db.query('update public.user_usage set row_count = 200000 where user_id = $1', [a]);
  await assert.rejects(push(db, a, [op('meta', 'one-too-many', {})]), /record limit reached/);
  // existing rows can still be edited at the cap
  assert.equal((await push(db, a, [op('meta', 'ok', { blob: 'y' }, 1)])).applied.length, 1);
  await db.query('update public.user_usage set row_count = 1 where user_id = $1', [a]);
  await db.query("delete from public.records where user_id = $1 and key = 'ok'", [a]);
  assert.equal((await db.query('select row_count from public.user_usage where user_id = $1', [a])).rows[0].row_count, 0);
});

test('pull_changes returns only own rows since the cursor, tombstones included', async () => {
  const [a, b] = [await newUser(db), await newUser(db)];
  await push(db, a, [op('mealLogs', 'd1', { n: 1 })]);
  await push(db, b, [op('mealLogs', 'bd', { n: 1 })]);
  const t1 = (await rows(db, a))[0].updated_at.toISOString();
  await new Promise((r) => setTimeout(r, 5));
  await push(db, a, [op('mealLogs', 'd2', { n: 1 }), del('mealLogs', 'd1', 1)]);
  const pull = (sub, since, max = 1000) => q(sub, 'select * from public.pull_changes($1::timestamptz, $2)', [since, max]);
  assert.equal((await pull(a, null)).length, 2);
  assert.ok((await pull(a, null)).every((r) => r.user_id === a));
  const later = await pull(a, t1); // inclusive cursor: d1's tombstone and d2
  assert.deepEqual(later.map((r) => r.key).sort(), ['d1', 'd2']);
  assert.ok(later.find((r) => r.key === 'd1').deleted_at);
  assert.equal((await pull(a, null, 1)).length, 1);
  assert.deepEqual((await pull(b, null)).map((r) => r.key), ['bd']);
});

test('delete_my_account purges records, ops, files and the auth user, only for the caller', async () => {
  const [a, b] = [await newUser(db), await newUser(db)];
  await push(db, a, [op('profile', 'singleton', { n: 1 }), op('mealLogs', 'd', { n: 1 })]);
  await push(db, b, [op('profile', 'singleton', { n: 2 })]);
  await db.query(`insert into storage.objects (bucket_id, name, owner) values
    ('uploads', $1, $2), ('uploads', $3, $2), ('uploads', $4, $5)`,
  [`${a}/scan/s1.jpg`, a, `${a}/plan/p1.pdf`, `${b}/scan/s9.png`, b]);

  await assert.rejects(asUser(db, null, () => db.query('select public.delete_my_account()')), /not authenticated/);
  await assert.rejects(as(db, 'anon', null, () => db.query('select public.delete_my_account()')), /permission denied/);

  await asUser(db, a, () => db.query('select public.delete_my_account()'));
  const count = async (sql, p) => (await db.query(sql, [p])).rows[0].n;
  assert.equal(await count('select count(*)::int n from public.records where user_id = $1', a), 0);
  assert.equal(await count('select count(*)::int n from public.applied_ops where user_id = $1', a), 0);
  assert.equal(await count('select count(*)::int n from public.user_usage where user_id = $1', a), 0);
  assert.equal(await count('select count(*)::int n from auth.users where id = $1', a), 0);
  assert.equal(await count("select count(*)::int n from storage.objects where name like $1 || '/%'", a), 0);
  // B untouched
  assert.equal(await count('select count(*)::int n from public.records where user_id = $1', b), 1);
  assert.equal(await count("select count(*)::int n from storage.objects where name like $1 || '/%'", b), 1);
  assert.equal(await count('select count(*)::int n from auth.users where id = $1', b), 1);
});

test('purge_deleted hard-deletes tombstones past retention, service role only', async () => {
  const a = await newUser(db);
  await push(db, a, [op('mealLogs', 'old', {}), op('mealLogs', 'recent', {}), op('mealLogs', 'live', {})]);
  await push(db, a, [del('mealLogs', 'old', 1), del('mealLogs', 'recent', 1)]);
  await db.query("update public.records set deleted_at = now() - interval '40 days' where user_id = $1 and key = 'old'", [a]);
  await db.query("update public.records set deleted_at = now() - interval '5 days' where user_id = $1 and key = 'recent'", [a]);

  await assert.rejects(asUser(db, a, () => db.query('select public.purge_deleted()')), /permission denied/);
  await assert.rejects(as(db, 'anon', null, () => db.query('select public.purge_deleted()')), /permission denied/);

  const res = await as(db, 'service_role', null, async () => (await db.query('select public.purge_deleted() as r')).rows[0].r);
  assert.equal(res.records, 1);
  const left = (await db.query('select key from public.records where user_id = $1 order by key', [a])).rows.map((r) => r.key);
  assert.deepEqual(left, ['live', 'recent']);
  // a custom retention
  const res2 = await as(db, 'service_role', null, async () => (await db.query("select public.purge_deleted(interval '1 day') as r")).rows[0].r);
  assert.equal(res2.records, 1);
});

test('storage: bucket is private, 10MB, typed; policies pin the first folder to the caller', async () => {
  const [bucket] = (await db.query("select * from storage.buckets where id = 'uploads'")).rows;
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), 10 * 1024 * 1024);
  assert.deepEqual([...bucket.allowed_mime_types].sort(), ['application/pdf', 'image/jpeg', 'image/png']);

  const [a, b] = [await newUser(db), await newUser(db)];
  await asUser(db, a, () => db.query("insert into storage.objects (bucket_id, name) values ('uploads', $1)", [`${a}/scan/mine.png`]));
  await assert.rejects(asUser(db, a, () => db.query("insert into storage.objects (bucket_id, name) values ('uploads', $1)", [`${b}/scan/theirs.png`])), /row-level security/);
  await assert.rejects(asUser(db, a, () => db.query("insert into storage.objects (bucket_id, name) values ('uploads', 'rootfile.png')")), /row-level security/);
  assert.equal((await q(b, "select * from storage.objects where bucket_id = 'uploads'")).length, 0);
  assert.equal((await q(a, "select * from storage.objects where bucket_id = 'uploads'")).length, 1);
  const upd = await asUser(db, b, () => db.query("update storage.objects set name = $2 where name = $1", [`${a}/scan/mine.png`, `${b}/scan/stolen.png`]));
  assert.equal(upd.affectedRows, 0);
  const rm = await asUser(db, b, () => db.query('delete from storage.objects where name = $1', [`${a}/scan/mine.png`]));
  assert.equal(rm.affectedRows, 0);
  // the migration is re-runnable
  const fs = await import('node:fs');
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/0002_storage.sql', import.meta.url), 'utf8'));
});

test('bump_ai_usage counts per user per day and flags the limit', async () => {
  const [a, b] = [await newUser(db), await newUser(db)];
  const bump = (sub, lim) => asUser(db, sub, async () => (await db.query('select public.bump_ai_usage($1) as r', [lim])).rows[0].r);
  assert.equal((await bump(a, 2)).allowed, true);
  assert.equal((await bump(a, 2)).allowed, true);
  const third = await bump(a, 2);
  assert.equal(third.allowed, false);
  assert.equal(third.calls, 3);
  assert.equal((await bump(b, 2)).calls, 1);
  await assert.rejects(asUser(db, a, () => db.query('insert into public.ai_usage (user_id, calls) values ($1, 0)', [a])), /permission denied/);
});

test('migrations are idempotent to re-run', async () => {
  const fs = await import('node:fs');
  for (const f of ['0001_init.sql', '0002_storage.sql', '0003_rate_limits.sql']) {
    await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));
  }
  const a = await newUser(db);
  assert.equal((await push(db, a, [op('profile', 'singleton', {})])).applied.length, 1);
});
