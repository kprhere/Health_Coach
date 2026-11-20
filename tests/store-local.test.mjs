// store-local: transactions, status model, quota, crash safety, outbox, isolation, schema upgrade.
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

const idb = await import('../src/store/idb.js');
const { createLocalStore, verifyIsolation } = await import('../src/store/localStore.js');
const { assembleState } = await import('../src/store/records.js');
const { classifyFailure, exportUnsavedState, estimateStorage } = await import('../src/store/quota.js');
const { defaultState, clone } = await import('../src/helpers.js');

let n = 0;
const fresh = () => { globalThis.indexedDB = new IDBFactory(); n += 1; return `acct-${n}`; };

const withDay = (s, date, water) => {
  const next = clone(s);
  next.mealLogs[date] = { eaten: {}, extras: [], water, flags: {} };
  return next;
};

test('account ids are strictly sanitized and name the database', () => {
  assert.equal(idb.dbNameFor(null), 'recomp-local');
  assert.equal(idb.dbNameFor('abc-123_X'), 'recomp-abc-123_X');
  for (const bad of ['../x', 'a b', 'a/b', 'x'.repeat(65), '-lead', 'ünï', 'a.b', 5]) {
    assert.throws(() => idb.sanitizeAccountId(bad), (e) => e.reason === 'invalid-account-id', String(bad));
  }
});

test('commit writes record and outbox op together, with stable opIds and a shared group', async () => {
  const id = fresh();
  const store = createLocalStore(id);
  const base = defaultState();
  const next = clone(base);
  next.workoutSwaps = { '2026-03-03': '2026-03-05', '2026-03-05': '2026-03-03' };
  next.planOverrides = { '2026-03-04': { day: 'legs' } };
  let i = 0;
  const res = await store.commit(base, next, { accountMode: true, opIdFactory: () => `op-${++i}` });
  assert.equal(res.ok, true);
  assert.equal(res.ops.length, 3); // 2 swaps + 1 planOverride; the local-only $fields record is never queued
  const pending = await store.outbox.listPending(id);
  assert.equal(pending.length, res.ops.length);
  assert.ok(pending.every((p) => p.group && p.group === pending[0].group));
  assert.ok(pending.every((p) => p.baseVersion === 0 && p.attempts === 0 && p.deleted === false));
  assert.ok(!pending.some((p) => p.collection === 'meta' && p.key === '$fields'));
  const loaded = await store.load();
  assert.deepEqual(loaded.state.workoutSwaps, next.workoutSwaps);
  assert.equal(await store.pendingCount(), pending.length);
});

test('no outbox entries for a no-op diff, nor when accountMode is off', async () => {
  const id = fresh();
  const store = createLocalStore(id);
  const s = defaultState();
  assert.deepEqual((await store.commit(s, clone(s), { accountMode: true })).ops, []);
  assert.equal(await store.pendingCount(), 0);
  await store.commit(s, withDay(s, '2026-01-01', 1), { accountMode: false });
  assert.equal(await store.pendingCount(), 0);
  assert.ok((await store.load()).state.mealLogs['2026-01-01']);
});

test('a transaction aborted midway leaves neither the record nor the op', async () => {
  const id = fresh();
  const hooks = { afterRecordPut: (change, i) => { if (i === 1) throw new Error('boom'); } };
  const store = createLocalStore(id, { hooks });
  const s = defaultState();
  const next = clone(s);
  next.activity = { '2026-01-01': { swim: true }, '2026-01-02': { swim: true }, '2026-01-03': { swim: true } };
  const res = await store.commit(s, next, { accountMode: true });
  assert.equal(res.ok, false);
  assert.equal(await store.pendingCount(), 0);
  const loaded = await store.load();
  assert.equal(loaded.state, null); // nothing partial was written
  assert.equal(store.getSaveStatus().status, 'failed');
  assert.deepEqual(store.getUnsaved(), next);
});

test("'saved' is never emitted before the transaction completes", async () => {
  const id = fresh();
  const real = await idb.openAccountDb(id);
  let release;
  const gate = new Promise((r) => { release = r; });
  const delayed = {
    name: real.name,
    tx: (...args) => real.tx(...args).then(async (v) => { await gate; return v; }), // completes, but is reported late
    getAll: (...a) => real.getAll(...a),
    getMeta: (...a) => real.getMeta(...a),
    setMeta: (...a) => real.setMeta(...a),
    get: (...a) => real.get(...a),
    put: (...a) => real.put(...a),
    close: () => real.close(),
  };
  const store = createLocalStore(id, { db: delayed });
  const seen = [];
  store.subscribe((st) => seen.push(st.status));
  const s = defaultState();
  const p = store.commit(s, withDay(s, '2026-01-01', 2), { accountMode: true });
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(seen, ['saving']);
  assert.equal(store.getSaveStatus().status, 'saving');
  release();
  const res = await p;
  assert.equal(res.ok, true);
  assert.equal(seen.at(-1), 'saved');
  assert.ok(seen.indexOf('saved') > seen.indexOf('saving'));
});

test('a quota failure surfaces {ok:false, reason:"quota"}, keeps the unsaved state, and retry succeeds', async () => {
  const id = fresh();
  let fail = true;
  const hooks = {
    afterRecordPut: () => {
      if (fail) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
    },
  };
  const store = createLocalStore(id, { hooks });
  const s = defaultState();
  const next = withDay(s, '2026-01-01', 4);
  const res = await store.commit(s, next, { accountMode: true });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'quota');
  assert.equal(store.getSaveStatus().status, 'failed');
  assert.equal(store.getSaveStatus().reason, 'quota');
  assert.deepEqual(store.getUnsaved(), next);
  assert.equal(classifyFailure(res.error).needsExport, true);

  // The user keeps logging while the disk is full. The next diff must still
  // include the change that failed.
  const later = withDay(next, '2026-01-02', 5);
  const res2 = await store.commit(next, later, { accountMode: true });
  assert.equal(res2.ok, false);
  assert.deepEqual(store.getUnsaved(), later);

  const out = await exportUnsavedState(store);
  assert.equal(out.ok, true);
  assert.deepEqual(out.backup.state.mealLogs['2026-01-01'].water, 4);
  assert.ok(out.backup.state.mealLogs['2026-01-02']);

  fail = false;
  const retried = await store.retry();
  assert.equal(retried.ok, true);
  assert.equal(store.getSaveStatus().status, 'saved');
  assert.equal(store.getUnsaved(), null);
  const st = (await store.load()).state;
  assert.equal(st.mealLogs['2026-01-01'].water, 4);
  assert.equal(st.mealLogs['2026-01-02'].water, 5);
});

test('a real QuotaExceededError thrown by the request layer maps to quota', async () => {
  const id = fresh();
  const db = await idb.openAccountDb(id);
  await assert.rejects(
    db.tx('records', 'readwrite', ({ records }) => {
      const e = new Error('x'); e.name = 'QuotaExceededError';
      records.put = () => { throw e; };
      records.put({});
    }),
    (e) => e.reason === 'quota',
  );
});

test('crash after commit: reopening the database finds the same ops, no duplicates', async () => {
  const id = fresh();
  let store = createLocalStore(id);
  const s = defaultState();
  const next = withDay(s, '2026-04-01', 7);
  const res = await store.commit(null, next, { accountMode: true });
  const idsBefore = res.ops.map((o) => o.opId).sort();
  await store.close(); // process "dies": every connection is gone
  store = createLocalStore(id);
  const pending = await store.outbox.listPending(id);
  assert.deepEqual(pending.map((p) => p.opId).sort(), idsBefore);
  assert.equal(new Set(pending.map((p) => p.opId)).size, pending.length);
  assert.equal((await store.load()).state.mealLogs['2026-04-01'].water, 7);
  // Re-committing the same state after restart creates nothing new.
  const again = await store.commit((await store.load()).state, next, { accountMode: true });
  assert.deepEqual(again.ops, []);
  assert.equal((await store.outbox.listPending(id)).length, idsBefore.length);
});

test('outbox lifecycle: markFailed, markApplied updates version and rebases later ops', async () => {
  const id = fresh();
  const store = createLocalStore(id);
  const s = defaultState();
  const s1 = withDay(s, '2026-05-01', 1);
  const s2 = withDay(s1, '2026-05-01', 2);
  await store.commit(s, s1, { accountMode: true });
  await store.commit(s1, s2, { accountMode: true });
  let pending = (await store.outbox.listPending(id)).filter((p) => p.collection === 'mealLogs');
  assert.equal(pending.length, 2);
  assert.ok(pending[0].createdAt < pending[1].createdAt);
  assert.equal(pending[1].data.water, 2);

  await store.outbox.markFailed(pending[0].opId, new Error('network'));
  pending = (await store.outbox.listPending(id)).filter((p) => p.collection === 'mealLogs');
  assert.equal(pending[0].attempts, 1);

  await store.outbox.markApplied(pending[0].opId, 9);
  assert.equal(await store.outbox.getRecordVersion(id, 'mealLogs', '2026-05-01'), 9);
  pending = (await store.outbox.listPending(id)).filter((p) => p.collection === 'mealLogs');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].baseVersion, 9);
  assert.deepEqual((await store.load()).state.mealLogs['2026-05-01'].water, 2); // local data untouched
  assert.deepEqual(await store.outbox.markApplied('nope', 1), { ok: false, reason: 'no-such-op' });
});

test('conflicts: both versions kept, op held, resolve local / server / merged', async () => {
  const id = fresh();
  const store = createLocalStore(id);
  const s = defaultState();
  await store.commit(s, withDay(s, '2026-06-01', 1), { accountMode: true });
  const [op] = (await store.outbox.listPending(id)).filter((p) => p.collection === 'mealLogs');
  const server = { data: { eaten: {}, extras: [], water: 9, flags: {} }, version: 5, deleted: false };
  const cid = await store.outbox.recordConflict({ opId: op.opId, local: { data: op.data, deleted: false }, server });
  assert.equal((await store.outbox.listPending(id)).some((p) => p.opId === op.opId), false); // held
  assert.equal(await store.pendingCount(), (await store.outbox.listPending(id)).length + 1);
  const [c] = await store.outbox.listConflicts();
  assert.equal(c.local.data.water, 1);
  assert.equal(c.server.data.water, 9);

  await store.outbox.resolveConflict(cid, 'local');
  const [again] = (await store.outbox.listPending(id)).filter((p) => p.opId === op.opId);
  assert.equal(again.baseVersion, 5);
  assert.equal((await store.outbox.listConflicts()).length, 0);

  const cid2 = await store.outbox.recordConflict({ opId: op.opId, server });
  await store.outbox.resolveConflict(cid2, 'server');
  assert.equal((await store.load()).state.mealLogs['2026-06-01'].water, 9);
  assert.equal((await store.outbox.listPending(id)).some((p) => p.opId === op.opId), false);
  assert.equal(await store.outbox.getRecordVersion(id, 'mealLogs', '2026-06-01'), 5);

  // merged
  const s2 = withDay(await store.load().then((l) => l.state), '2026-06-01', 3);
  await store.commit((await store.load()).state, s2, { accountMode: true });
  const [op2] = (await store.outbox.listPending(id)).filter((p) => p.collection === 'mealLogs');
  const cid3 = await store.outbox.recordConflict({ opId: op2.opId, server: { data: { water: 1 }, version: 6 } });
  await store.outbox.resolveConflict(cid3, { eaten: {}, extras: [], water: 4, flags: {} });
  assert.equal((await store.load()).state.mealLogs['2026-06-01'].water, 4);
  const [op3] = (await store.outbox.listPending(id)).filter((p) => p.opId === op2.opId);
  assert.equal(op3.data.water, 4);
  assert.equal(op3.baseVersion, 6);
  await assert.rejects(store.outbox.resolveConflict('x', 'bogus'), (e) => e.reason === 'bad-resolution');
});

test('applyRemote never overwrites a record with a pending op, nor goes backwards', async () => {
  const id = fresh();
  const store = createLocalStore(id);
  const s = defaultState();
  await store.commit(s, withDay(s, '2026-07-01', 1), { accountMode: true });
  const res = await store.outbox.applyRemote([
    { collection: 'mealLogs', key: '2026-07-01', data: { water: 99 }, version: 3, deleted: false }, // pending op -> skipped
    { collection: 'mealLogs', key: '2026-07-02', data: { water: 2 }, version: 2, deleted: false },
    { collection: 'habitLogs', key: '2026-07-02', data: { a: true }, version: 1, deleted: false },
  ]);
  assert.deepEqual(res.skipped.map((x) => x.reason), ['pending-op']);
  assert.equal(res.applied.length, 2);
  let st = (await store.load()).state;
  assert.equal(st.mealLogs['2026-07-01'].water, 1);
  assert.equal(st.mealLogs['2026-07-02'].water, 2);
  const stale = await store.outbox.applyRemote([{ collection: 'mealLogs', key: '2026-07-02', data: { water: 0 }, version: 1 }]);
  assert.equal(stale.skipped[0].reason, 'stale');
  const del = await store.outbox.applyRemote([{ collection: 'mealLogs', key: '2026-07-02', data: null, version: 4, deleted: true }]);
  assert.equal(del.applied.length, 1);
  st = (await store.load()).state;
  assert.equal(st.mealLogs['2026-07-02'], undefined);
  assert.equal(await store.outbox.getRecordVersion(id, 'mealLogs', '2026-07-02'), 4);
  assert.equal(await store.outbox.getCursor(id), null);
  await store.outbox.setCursor(id, 'cur-7');
  assert.equal(await store.outbox.getCursor(id), 'cur-7');
  await store.outbox.setRecordVersion(id, 'mealLogs', '2026-07-01', 12);
  assert.equal(await store.outbox.getRecordVersion(id, 'mealLogs', '2026-07-01'), 12);
});

test('deleting in account mode keeps a tombstone and queues a delete op; purge removes synced tombstones', async () => {
  const id = fresh();
  let clock = 1000;
  const store = createLocalStore(id, { now: () => clock });
  const s = withDay(defaultState(), '2026-08-01', 1);
  await store.commit(null, s, { accountMode: true });
  const gone = clone(s); delete gone.mealLogs['2026-08-01'];
  await store.commit(s, gone, { accountMode: true });
  const ops = (await store.outbox.listPending(id)).filter((p) => p.collection === 'mealLogs');
  assert.deepEqual(ops.map((o) => o.deleted), [false, true]);
  assert.equal((await store.load()).state.mealLogs['2026-08-01'], undefined);
  for (const o of ops) await store.outbox.markApplied(o.opId, 3);
  clock += 40 * 86400000;
  assert.equal(await store.purgeTombstones(), 1);
});

test('account isolation: separate databases, outboxes and conflicts', async () => {
  globalThis.indexedDB = new IDBFactory();
  const A = createLocalStore('alice');
  const B = createLocalStore('bob');
  const s = defaultState();
  await A.commit(s, withDay(s, '2026-09-01', 11), { accountMode: true });
  await B.commit(s, withDay(s, '2026-09-02', 22), { accountMode: true });
  const [opA] = (await A.outbox.listPending('alice')).filter((p) => p.collection === 'mealLogs');
  await A.outbox.recordConflict({ opId: opA.opId, server: { data: {}, version: 1 } });

  const a = (await A.load()).state;
  const b = (await B.load()).state;
  assert.ok(a.mealLogs['2026-09-01'] && !a.mealLogs['2026-09-02']);
  assert.ok(b.mealLogs['2026-09-02'] && !b.mealLogs['2026-09-01']);
  assert.equal((await B.outbox.listConflicts()).length, 0);
  assert.equal((await A.outbox.listConflicts()).length, 1);
  assert.ok((await B.outbox.listPending('bob')).every((p) => p.data === null || !('water' in p.data) || p.data.water === 22));
  await assert.rejects(A.outbox.listPending('bob'), (e) => e.reason === 'account-mismatch');
  assert.deepEqual(await A.outbox.getCursor('alice'), null);

  const proof = await verifyIsolation('alice', 'bob');
  assert.equal(proof.isolated, true);
  assert.notEqual(proof.nameA, proof.nameB);

  // Deleting one account leaves the other intact.
  await A.outbox.clearAccount('alice');
  const B2 = createLocalStore('bob');
  assert.ok((await B2.load()).state.mealLogs['2026-09-02']);
  const A2 = createLocalStore('alice');
  assert.equal((await A2.load()).state, null);
});

test('a database stamped for another account is refused', async () => {
  globalThis.indexedDB = new IDBFactory();
  const db = await idb.openDb(idb.dbNameFor('carol'));
  await db.setMeta('accountId', 'mallory');
  db.close();
  await assert.rejects(idb.openAccountDb('carol'), (e) => e.reason === 'account-mismatch');
});

test('schema upgrade: a version 1 database upgrades in place and keeps its data', async () => {
  globalThis.indexedDB = new IDBFactory();
  assert.equal(idb.DB_VERSION >= 2, true);
  const name = idb.dbNameFor('upg');
  const v1 = await idb.openDb(name, { version: 1, upgrades: { 1: idb.SCHEMA_UPGRADES[1] } });
  assert.deepEqual([...v1.raw.objectStoreNames].sort(), ['meta', 'outbox', 'records']);
  await v1.put('records', { collection: 'mealLogs', key: '2025-01-01', data: { water: 5 }, version: 2, deleted: false });
  await v1.put('outbox', { opId: 'old-op', collection: 'mealLogs', key: '2025-01-01', baseVersion: 2, data: { water: 5 }, deleted: false, group: 'g', createdAt: 1, attempts: 0 });
  await v1.setMeta('accountId', 'upg');
  v1.close();

  const store = createLocalStore('upg');
  const db = await store.getDb();
  assert.deepEqual([...db.raw.objectStoreNames].sort(), ['conflicts', 'files', 'meta', 'outbox', 'records', 'staging']);
  assert.equal(db.raw.version, idb.DB_VERSION);
  assert.equal((await store.load()).state.mealLogs['2025-01-01'].water, 5);
  const pending = await store.outbox.listPending('upg');
  assert.deepEqual(pending.map((p) => p.opId), ['old-op']);
  // The new byKey index works on pre-existing rows.
  await store.outbox.markApplied('old-op', 4);
  assert.equal(await store.outbox.getRecordVersion('upg', 'mealLogs', '2025-01-01'), 4);
});

test('opening a database written by a NEWER schema is refused, not downgraded', async () => {
  globalThis.indexedDB = new IDBFactory();
  const name = idb.dbNameFor('future');
  const up = { ...idb.SCHEMA_UPGRADES, 3() {} };
  const v3 = await idb.openDb(name, { version: 3, upgrades: up });
  v3.close();
  await assert.rejects(idb.openAccountDb('future'), (e) => e.reason === 'version-newer');
});

test('versionchange from another tab closes the connection and notifies', async () => {
  globalThis.indexedDB = new IDBFactory();
  let changed = 0;
  const db = await idb.openDb(idb.dbNameFor('vc'), { onVersionChange: () => { changed += 1; } });
  const up = { ...idb.SCHEMA_UPGRADES, 3() {} };
  const other = await idb.openDb(idb.dbNameFor('vc'), { version: 3, upgrades: up });
  assert.equal(changed, 1);
  assert.equal(db.closed, true);
  other.close();
});

test('support detection and storage estimate are guarded', async () => {
  assert.equal(idb.isSupported(null), false);
  assert.equal(idb.isSupported({}), false);
  assert.equal((await idb.probeSupport(undefined)).supported, true);
  assert.equal((await idb.probeSupport({ open() { throw Object.assign(new Error('denied'), { name: 'SecurityError' }); } })).supported, false);
  assert.deepEqual(await estimateStorage({}), { supported: false });
  const est = await estimateStorage({ storage: { estimate: async () => ({ usage: 50, quota: 200 }), persisted: async () => false } });
  assert.equal(est.percent, 25);
  assert.equal(est.free, 150);
  await assert.rejects(idb.openDb('x', { indexedDB: null }), (e) => e.reason === 'unsupported');
});

test('files store holds pending uploads per account', async () => {
  const id = fresh();
  const store = createLocalStore(id);
  await store.putFile('scan-1.jpg', new Uint8Array([1, 2, 3]), { scanId: 's1' });
  assert.equal((await store.listFiles()).length, 1);
  assert.deepEqual((await store.getFile('scan-1.jpg')).meta, { scanId: 's1' });
  await store.deleteFile('scan-1.jpg');
  assert.equal((await store.listFiles()).length, 0);
});

test('assembleState of a loaded store equals the committed state', async () => {
  const id = fresh();
  const store = createLocalStore(id);
  const s = defaultState();
  s.bodyScans = [{ id: 'x', date: '2026-01-01', weight: 180 }];
  s.exerciseNotes = { Row: 'note' };
  s.unknownFuture = { a: [1] };
  await store.commit(null, s, { accountMode: false });
  assert.deepEqual((await store.load()).state, s);
  assert.deepEqual(assembleState(await store.listRecords()), s);
});

test('a server tombstone from the transport shape deletes the local record', async () => {
  const { normalizeRecord } = await import('../src/cloud/syncEngine.js');
  const id = fresh();
  const store = createLocalStore(id);
  const s = defaultState();
  await store.commit(null, withDay(s, '2026-07-05', 2), { accountMode: false });
  const row = normalizeRecord({ collection: 'mealLogs', key: '2026-07-05', data: { water: 2 }, version: 2, updated_at: 't', deleted_at: '2026-07-06T00:00:00Z' });
  await store.outbox.applyRemote([row]);
  assert.equal((await store.load()).state.mealLogs['2026-07-05'], undefined);
});

test('resolving a group-rolled-back conflict keeps the local version and refuses "server"', async () => {
  const id = fresh();
  const store = createLocalStore(id);
  const s = defaultState();
  await store.commit(s, withDay(s, '2026-07-01', 1), { accountMode: true });
  await store.outbox.setRecordVersion(id, 'mealLogs', '2026-07-01', 5);
  const [op] = await store.outbox.listPending(id);
  const cid = await store.outbox.recordConflict({ opId: op.opId, local: undefined, server: null });
  const refused = await store.outbox.resolveConflict(cid, 'server');
  assert.equal(refused.ok, false);
  assert.equal((await store.load()).state.mealLogs['2026-07-01'].water, 1);
  const kept = await store.outbox.resolveConflict(cid, 'local');
  assert.equal(kept.ok, true);
  assert.equal(await store.outbox.getRecordVersion(id, 'mealLogs', '2026-07-01'), 5);
  const [again] = await store.outbox.listPending(id);
  assert.equal(again.baseVersion, 5);
});
