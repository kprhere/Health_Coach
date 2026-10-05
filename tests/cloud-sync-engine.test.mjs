// ============================================================
// cloud-sync-engine.test.mjs - the sync engine against a fake server
// (fast, scriptable failures) and against the real SQL in PGlite.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine, classifyError } from '../src/cloud/syncEngine.js';
import { createMemoryOutbox } from '../src/cloud/memoryOutbox.js';
import {
  makeDb, newUser, asUser,
} from './cloud-pg.mjs';

const ACCT = 'acct-1';
const netErr = () => Object.assign(new Error('Failed to fetch'), { code: 'NETWORK' });

// A JS model of push_ops / pull_changes (ungrouped), plus failure injection.
function fakeServer() {
  const rows = new Map();
  const applied = new Map();
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const k = (c, key) => `${c}|${key}`;
  const server = {
    rows, applied, online: true, calls: [], failWith: [], loseResponse: 0, hold: null,
    snapshot: (c, key) => rows.get(k(c, key)),
    _apply(ops) {
      const res = { applied: [], duplicates: [], conflicts: [], rolled_back: [] };
      for (const o of ops) {
        if (applied.has(o.op_id)) { res.duplicates.push({ op_id: o.op_id, version: applied.get(o.op_id) }); continue; }
        const cur = rows.get(k(o.collection, o.key));
        if ((o.expected_version ?? 0) !== (cur?.version ?? 0)) {
          res.conflicts.push({ op_id: o.op_id, server: { ...cur } });
          continue;
        }
        clock += 1000;
        const row = {
          collection: o.collection, key: o.key, data: o.delete ? (cur?.data ?? {}) : o.data,
          version: (cur?.version ?? 0) + 1, updated_at: new Date(clock).toISOString(), deleted_at: o.delete ? new Date(clock).toISOString() : null,
        };
        rows.set(k(o.collection, o.key), row);
        applied.set(o.op_id, row.version);
        res.applied.push({ op_id: o.op_id, version: row.version });
      }
      return res;
    },
    transport() {
      return {
        pushOps: async (ops) => {
          server.calls.push(structuredClone(ops));
          if (!server.online) throw netErr();
          const f = server.failWith.shift();
          if (f) { if (f.afterApply) server._apply(ops); throw f.error; }
          if (server.hold) await server.hold;
          const res = server._apply(ops);
          if (server.loseResponse > 0) { server.loseResponse -= 1; throw netErr(); }
          return res;
        },
        pullChanges: async (since, limit = 1000) => {
          if (!server.online) throw netErr();
          const s = since ? Date.parse(since) : -Infinity;
          return [...rows.values()]
            .filter((r) => Date.parse(r.updated_at) >= s)
            .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
            .slice(0, limit)
            .map((r) => ({ collection: r.collection, key: r.key, data: r.data, version: r.version, updatedAt: r.updated_at, deletedAt: r.deleted_at }));
        },
      };
    },
  };
  return server;
}

function fakeTimers() {
  const t = { queue: [], delays: [] };
  t.setTimer = (fn, ms) => { const h = { fn, ms }; t.queue.push(h); t.delays.push(ms); return h; };
  t.clearTimer = (h) => { t.queue = t.queue.filter((x) => x !== h); };
  t.fire = async () => { const h = t.queue.shift(); if (h) await h.fn(); return !!h; };
  return t;
}

function device(server, opts = {}) {
  const outbox = createMemoryOutbox();
  const timers = fakeTimers();
  const conflicts = [];
  const statuses = [];
  const engine = createSyncEngine({
    accountId: ACCT, outbox, transport: server.transport(), onConflict: (c) => conflicts.push(c),
    onStatus: (s) => statuses.push(s), setTimer: timers.setTimer, clearTimer: timers.clearTimer, random: () => 0.5, ...opts,
  });
  return { outbox, engine, timers, conflicts, statuses };
}
const write = (d, collection, key, data, extra = {}) => d.outbox.enqueue(ACCT, { collection, key, data, ...extra });

test('offline writes stay pending, back off, and sync when the network returns', async () => {
  const server = fakeServer();
  server.online = false;
  const d = device(server);
  write(d, 'mealLogs', '2026-03-01', { kcal: 500 });
  write(d, 'mealLogs', '2026-03-02', { kcal: 600 });
  const r = await d.engine.flush();
  assert.equal(r.error.code, 'NETWORK');
  assert.equal(d.engine.status(), 'offline');
  assert.equal(r.remaining, 2);
  assert.equal(d.outbox.listPending(ACCT).length, 2);
  assert.equal(d.timers.queue.length, 1, 'a retry is scheduled');

  // still offline when the retry fires: backs off further, nothing lost
  await d.timers.fire();
  assert.equal(d.outbox.listPending(ACCT).length, 2);
  assert.ok(d.timers.delays[1] > d.timers.delays[0]);

  server.online = true;
  await d.timers.fire();
  assert.equal(d.outbox.listPending(ACCT).length, 0);
  assert.equal(d.engine.status(), 'synced');
  assert.equal(server.rows.size, 2);
  assert.equal(d.outbox.getRecordVersion(ACCT, 'mealLogs', '2026-03-01'), 1);
  assert.ok(d.statuses.includes('offline'));
});

test('an interrupted flush keeps what landed and resumes with the rest', async () => {
  const server = fakeServer();
  const real = server.transport();
  let calls = 0;
  const flaky = {
    pullChanges: real.pullChanges,
    pushOps: async (ops) => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error('boom'), { status: 503 });
      return real.pushOps(ops);
    },
  };
  const d = device(server);
  const engine = createSyncEngine({
    accountId: ACCT, outbox: d.outbox, transport: flaky, setTimer: d.timers.setTimer, clearTimer: d.timers.clearTimer, random: () => 0, batchSize: 2,
  });
  for (let i = 0; i < 5; i += 1) write(d, 'habitLogs', `e${i}`, { i });
  const r = await engine.flush();
  assert.ok(r.error);
  assert.equal(r.applied, 2);
  assert.equal(d.outbox.listPending(ACCT).length, 3);
  assert.equal(d.outbox.listPending(ACCT)[0].attempts, 1, 'server errors count as attempts');
  assert.equal(server.rows.size, 2);
  await engine.flush();
  assert.equal(d.outbox.listPending(ACCT).length, 0);
  assert.equal(server.rows.size, 5);
});

test('server applied but the response was lost: the retry is a duplicate, not a second write', async () => {
  const server = fakeServer();
  const d = device(server);
  write(d, 'workoutSessions', '2026-03-05', { sets: 3 });
  server.loseResponse = 1;
  const first = await d.engine.flush();
  assert.equal(first.error.code, 'NETWORK');
  assert.equal(d.outbox.listPending(ACCT).length, 1);
  const opId = d.outbox.listPending(ACCT)[0].opId;
  const second = await d.engine.flush();
  assert.equal(second.duplicates, 1);
  assert.equal(second.conflicts, 0);
  assert.equal(d.outbox.listPending(ACCT).length, 0);
  assert.equal(server.snapshot('workoutSessions', '2026-03-05').version, 1);
  assert.equal([...server.calls.flat()].filter((o) => o.op_id === opId).length, 2, 'op id was stable across the retry');
  assert.equal(d.outbox.getRecordVersion(ACCT, 'workoutSessions', '2026-03-05'), 1);
});

test('duplicate delivery of a whole batch is harmless', async () => {
  const server = fakeServer();
  const d = device(server);
  write(d, 'mealLogs', 'a', { n: 1 });
  write(d, 'mealLogs', 'b', { n: 1 });
  const ops = [...d.outbox.listPending(ACCT)];
  await d.engine.flush();
  const replay = server._apply(ops.map((o) => ({ op_id: o.opId, collection: o.collection, key: o.key, expected_version: null, data: { n: 'replayed' }, delete: false })));
  assert.equal(replay.duplicates.length, 2);
  assert.deepEqual(server.snapshot('mealLogs', 'a').data, { n: 1 });
});

test('several local edits to one key chain without conflicting with themselves', async () => {
  const server = fakeServer();
  const d = device(server, { batchSize: 2 });
  for (let i = 1; i <= 5; i += 1) write(d, 'dayOverrides', '2026-04-01', { rev: i });
  const r = await d.engine.flush();
  assert.equal(r.conflicts, 0);
  assert.equal(r.applied, 5);
  assert.equal(server.snapshot('dayOverrides', '2026-04-01').version, 5);
  assert.deepEqual(server.snapshot('dayOverrides', '2026-04-01').data, { rev: 5 });
  // and again in a later session (fresh engine, outbox remembers the version)
  write(d, 'dayOverrides', '2026-04-01', { rev: 6 });
  const fresh = createSyncEngine({ accountId: ACCT, outbox: d.outbox, transport: server.transport(), setTimer: d.timers.setTimer, clearTimer: d.timers.clearTimer });
  assert.equal((await fresh.flush()).conflicts, 0);
  assert.equal(server.snapshot('dayOverrides', '2026-04-01').version, 6);
});

test('concurrent edits on two devices become preserved conflicts; neither side is overwritten', async () => {
  const server = fakeServer();
  const phone = device(server);
  const laptop = device(server);
  write(phone, 'profile', 'singleton', { goal: 'cut' });
  await phone.engine.sync();
  await laptop.engine.sync();
  assert.equal(laptop.outbox.getRecordVersion(ACCT, 'profile', 'singleton'), 1);

  write(phone, 'profile', 'singleton', { goal: 'phone-edit' });
  write(laptop, 'profile', 'singleton', { goal: 'laptop-edit' });
  await phone.engine.flush();
  const res = await laptop.engine.flush();

  assert.equal(res.conflicts, 1);
  assert.equal(laptop.engine.status(), 'conflict');
  assert.equal(laptop.conflicts.length, 1);
  const [c] = laptop.outbox.listConflicts(ACCT);
  assert.deepEqual(c.local.data, { goal: 'laptop-edit' });
  assert.deepEqual(c.server.data, { goal: 'phone-edit' });
  assert.equal(c.server.version, 2);
  assert.deepEqual(server.snapshot('profile', 'singleton').data, { goal: 'phone-edit' }, 'server not overwritten');
  assert.deepEqual(laptop.outbox.getRecord(ACCT, 'profile', 'singleton').data, { goal: 'laptop-edit' }, 'local not overwritten');
  assert.equal(laptop.outbox.listPending(ACCT).length, 0);

  // a later pull must not silently replace the preserved local side either
  const pull = await laptop.engine.pull();
  assert.equal(pull.applied, 0);
  assert.deepEqual(laptop.outbox.getRecord(ACCT, 'profile', 'singleton').data, { goal: 'laptop-edit' });

  // once the person resolves it (new op based on the server version) it syncs
  laptop.outbox.resolveConflict(ACCT, c.opId);
  laptop.outbox.setRecordVersion(ACCT, 'profile', 'singleton', c.server.version);
  write(laptop, 'profile', 'singleton', { goal: 'merged' });
  assert.equal((await laptop.engine.flush()).applied, 1);
  assert.equal(laptop.engine.status(), 'synced');
  assert.deepEqual(server.snapshot('profile', 'singleton').data, { goal: 'merged' });
});

test('a delayed request from an old device cannot overwrite newer data', async () => {
  const server = fakeServer();
  const oldPhone = device(server);
  const laptop = device(server);
  write(oldPhone, 'bodyScans', 's1', { kg: 80 });
  await oldPhone.engine.sync();
  await laptop.engine.sync();

  // old phone edits and its request gets stuck in the network
  write(oldPhone, 'bodyScans', 's1', { kg: 'stale' });
  let release;
  server.hold = new Promise((r) => { release = r; });
  const before = server.calls.length;
  const inFlight = oldPhone.engine.flush();
  while (server.calls.length === before) await new Promise((r) => setImmediate(r));

  server.hold = null;
  write(laptop, 'bodyScans', 's1', { kg: 79 });
  await laptop.engine.flush();
  write(laptop, 'bodyScans', 's1', { kg: 78 });
  await laptop.engine.flush();

  release();
  const late = await inFlight;
  assert.equal(late.conflicts, 1);
  assert.deepEqual(server.snapshot('bodyScans', 's1').data, { kg: 78 });
  assert.equal(oldPhone.outbox.listConflicts(ACCT)[0].local.data.kg, 'stale', 'the stale edit is kept, not applied');
});

test('pull merges newer remote records but never touches keys with pending local ops', async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  write(a, 'mealLogs', 'shared', { by: 'a1' });
  write(a, 'mealLogs', 'only-a', { by: 'a' });
  await a.engine.sync();
  await b.engine.sync();
  assert.equal(b.outbox.getRecord(ACCT, 'mealLogs', 'only-a').data.by, 'a');

  write(a, 'mealLogs', 'shared', { by: 'a2' });
  write(a, 'mealLogs', 'only-a', { by: 'a-new' });
  await a.engine.flush();
  write(b, 'mealLogs', 'shared', { by: 'b-pending' }); // b has an unsent edit

  const pull = await b.engine.pull();
  assert.equal(pull.applied, 1);
  assert.equal(b.outbox.getRecord(ACCT, 'mealLogs', 'only-a').data.by, 'a-new');
  assert.equal(b.outbox.getRecord(ACCT, 'mealLogs', 'shared').data.by, 'b-pending', 'pending write protected');
  assert.equal(b.outbox.listPending(ACCT).length, 1);

  // pulling again changes nothing (equal versions are skipped)
  assert.equal((await b.engine.pull()).applied, 0);
  // and when b finally pushes, the server tells it about the clash
  assert.equal((await b.engine.flush()).conflicts, 1);
});

test('pull pages through large changes and persists its cursor', async () => {
  const server = fakeServer();
  const a = device(server);
  for (let i = 0; i < 7; i += 1) write(a, 'activity', `d${i}`, { i });
  await a.engine.flush();
  const b = device(server, { pageSize: 3 });
  const r = await b.engine.pull();
  assert.equal(r.applied, 7);
  assert.equal(b.outbox.listRecords(ACCT).length, 7);
  assert.ok(b.outbox.getCursor(ACCT));
  const again = await b.engine.pull();
  assert.equal(again.applied, 0);
  // tombstones arrive as records
  write(a, 'activity', 'd0', {}, { deleted: true });
  await a.engine.flush();
  await b.engine.pull();
  assert.ok(b.outbox.getRecord(ACCT, 'activity', 'd0').deletedAt);
});

test('canSwitchAccount refuses while ops are pending and allows once synced', async () => {
  const server = fakeServer();
  const d = device(server);
  assert.deepEqual(await d.engine.canSwitchAccount(), { ok: true, pendingCount: 0, conflictCount: 0 });
  write(d, 'mealLogs', 'x', {});
  write(d, 'mealLogs', 'y', {});
  const guard = await d.engine.canSwitchAccount();
  assert.equal(guard.ok, false);
  assert.equal(guard.pendingCount, 2);
  server.online = false;
  await d.engine.flush();
  assert.equal((await d.engine.canSwitchAccount()).ok, false, 'offline does not make it safe');
  server.online = true;
  await d.engine.resume();
  assert.equal((await d.engine.canSwitchAccount()).ok, true);
});

test('backoff doubles, is capped, jittered within bounds, and resets on success', async () => {
  const server = fakeServer();
  server.online = false;
  const d = device(server, { baseDelayMs: 1000, maxDelayMs: 8000, random: () => 1 });
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((n) => d.engine.backoffDelay(n)), [1000, 2000, 4000, 8000, 8000, 8000]);
  const low = device(server, { baseDelayMs: 1000, maxDelayMs: 8000, random: () => 0 });
  assert.deepEqual([1, 2, 3, 4].map((n) => low.engine.backoffDelay(n)), [500, 1000, 2000, 4000]);

  write(d, 'mealLogs', 'x', {});
  await d.engine.flush();
  await d.timers.fire();
  await d.timers.fire();
  assert.deepEqual(d.timers.delays, [1000, 2000, 4000]);
  server.online = true;
  await d.timers.fire();
  write(d, 'mealLogs', 'y', {});
  server.online = false;
  await d.engine.flush();
  assert.equal(d.timers.delays.at(-1), 1000, 'counter reset after a success');
});

test('one malformed op is isolated instead of poisoning its batch', async () => {
  const server = fakeServer();
  const real = server.transport();
  const picky = {
    pullChanges: real.pullChanges,
    pushOps: async (ops) => {
      if (ops.some((o) => o.key === 'bad')) throw Object.assign(new Error('malformed op'), { status: 400 });
      return real.pushOps(ops);
    },
  };
  const d = device(server);
  const engine = createSyncEngine({ accountId: ACCT, outbox: d.outbox, transport: picky, setTimer: d.timers.setTimer, clearTimer: d.timers.clearTimer });
  write(d, 'meta', 'good1', {});
  write(d, 'meta', 'bad', {});
  write(d, 'meta', 'good2', {});
  const r = await engine.flush();
  assert.equal(r.applied, 2);
  assert.equal(engine.status(), 'failed');
  assert.equal(engine.failedOps().length, 1);
  assert.equal(d.outbox.listPending(ACCT).length, 1, 'the bad op stays queued, visible, not lost');
  assert.equal(d.timers.queue.length, 0, 'no retry storm for a permanent error');
  // the bad op is not re-sent until the app intervenes
  const before = server.calls.length;
  await engine.flush();
  assert.equal(server.calls.length, before);
});

test('auth failures stop syncing without discarding anything', async () => {
  const server = fakeServer();
  const d = device(server);
  write(d, 'meta', 'x', {});
  server.failWith = [{ error: Object.assign(new Error('jwt expired'), { status: 401 }) }];
  const r = await d.engine.flush();
  assert.ok(r.error);
  assert.equal(d.engine.status(), 'failed');
  assert.equal(d.timers.queue.length, 0);
  assert.equal(d.outbox.listPending(ACCT).length, 1);
  await d.engine.resume();
  assert.equal(d.engine.status(), 'synced');
});

test('status() reports synced, pending, offline, failed and conflict', async () => {
  const server = fakeServer();
  const d = device(server);
  await d.engine.refresh();
  assert.equal(d.engine.status(), 'synced');
  write(d, 'meta', 'a', {});
  await d.engine.refresh();
  assert.equal(d.engine.status(), 'pending');
  server.online = false;
  await d.engine.flush();
  assert.equal(d.engine.status(), 'offline');
  server.online = true;
  await d.engine.resume();
  assert.equal(d.engine.status(), 'synced');
  assert.deepEqual([...new Set(d.statuses)].sort(), ['offline', 'pending', 'synced'].sort());
});

test('classifyError', () => {
  assert.equal(classifyError(netErr()), 'network');
  assert.equal(classifyError(new TypeError('x')), 'network');
  assert.equal(classifyError({ status: 401 }), 'auth');
  assert.equal(classifyError({ status: 400 }), 'permanent');
  assert.equal(classifyError({ status: 429 }), 'server');
  assert.equal(classifyError({ status: 503 }), 'server');
});

test('an atomic group is never split, and waits behind an unresolved conflict on any of its keys', async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  write(a, 'profile', 'singleton', { v: 1 });
  await a.engine.sync();
  await b.engine.sync();
  write(a, 'profile', 'singleton', { v: 'a' });
  await a.engine.flush();
  write(b, 'profile', 'singleton', { v: 'b' }); // will conflict
  write(b, 'mealLogs', 'g1', { n: 1 }, { group: 'G' });
  write(b, 'profile', 'other', { n: 1 }, { group: 'G' });
  write(b, 'mealLogs', 'free', { n: 1 });
  const before = server.calls.length;
  await b.engine.flush();
  const sent = server.calls.slice(before).flat();
  assert.ok(sent.some((o) => o.key === 'free'));
  // g1 and other travel together or not at all
  const g = sent.filter((o) => o.atomic_group === 'G');
  assert.ok(g.length === 0 || g.length === 2);
  assert.equal(server.snapshot('mealLogs', 'g1') === undefined, server.snapshot('profile', 'other') === undefined);
});

// ------------------------------------------------------------------------
// Engine <-> real SQL. Two devices of one user through push_ops/pull_changes.
// ------------------------------------------------------------------------
test('integration: two devices sync through the real SQL, including conflicts and groups', async () => {
  const db = await makeDb();
  const uid = await newUser(db);
  const transport = {
    pushOps: async (ops) => asUser(db, uid, async () => (await db.query('select public.push_ops($1::jsonb) as r', [JSON.stringify(ops)])).rows[0].r),
    pullChanges: async (since, limit = 500) => asUser(db, uid, async () => (await db.query('select * from public.pull_changes($1::timestamptz, $2)', [since, limit])).rows
      .map((r) => ({ collection: r.collection, key: r.key, data: r.data, version: r.version, updatedAt: r.updated_at.toISOString(), deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null }))),
  };
  const mk = () => {
    const outbox = createMemoryOutbox();
    return { outbox, engine: createSyncEngine({ accountId: uid, outbox, transport, setTimer: () => 0, clearTimer: () => {}, pageSize: 4 }) };
  };
  const phone = mk();
  const laptop = mk();
  const put = (d, collection, key, data, extra) => d.outbox.enqueue(uid, { collection, key, data, ...extra });

  put(phone, 'profile', 'singleton', { name: 'x' });
  for (let i = 0; i < 6; i += 1) put(phone, 'mealLogs', `d${i}`, { i });
  await phone.engine.sync();
  await laptop.engine.sync();
  assert.equal(laptop.outbox.listRecords(uid).length, 7);

  // offline-style concurrent edit
  put(phone, 'profile', 'singleton', { name: 'phone' });
  put(laptop, 'mealLogs', 'g1', { n: 1 }, { group: 'meal-and-profile' });
  put(laptop, 'profile', 'singleton', { name: 'laptop-grouped' }, { group: 'meal-and-profile' });
  await phone.engine.flush();
  const r = await laptop.engine.flush();
  assert.equal(r.conflicts, 2);
  assert.equal(laptop.engine.status(), 'conflict');
  const serverRows = (await db.query("select key, data from public.records where collection = 'mealLogs' and key = 'g1'")).rows;
  assert.equal(serverRows.length, 0, 'the atomic group was rolled back as a whole');
  const conflicts = laptop.outbox.listConflicts(uid);
  assert.ok(conflicts.some((c) => c.reason === 'group-rolled-back'));
  assert.ok(conflicts.every((c) => c.local.data), 'every local edit is preserved');
  const profile = (await db.query("select data, version from public.records where collection = 'profile'")).rows[0];
  assert.deepEqual(profile.data, { name: 'phone' });
});
