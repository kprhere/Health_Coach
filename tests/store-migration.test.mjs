// store-migration: localStorage blob -> IndexedDB records, verified, reversible, never destructive.
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

class FakeStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const { STORAGE_KEY } = await import('../src/data.js');
const { BACKUP_KEY, QUARANTINE_KEY, SNAPSHOT_PREFIX, listSnapshots, recordCounts } = await import('../src/storage.js');
const { defaultState, migrateState, clone, STATE_VERSION } = await import('../src/helpers.js');
const idb = await import('../src/store/idb.js');
const mig = await import('../src/store/migrateFromLocalStorage.js');
const { createLocalStore } = await import('../src/store/localStore.js');
const { explodeState } = await import('../src/store/records.js');

// A v5 state with synthetic (not personal) history.
const legacyState = () => {
  const s = defaultState();
  s.version = 5;
  s.profile = { ...s.profile, name: 'Test Person' };
  s.settings = { ...s.settings, onboardedAt: '2026-01-01T00:00:00.000Z' };
  s.workoutSessions = {
    '2026-02-02': { completed: true, notes: 'felt strong', entries: { bench: { sets: [{ weight: '135', reps: '8', rpe: '8', pain: 0, notes: 'paused', isWarmup: false }, { weight: '145', reps: '6', rpe: '9', pain: 1 }] } } },
    '2026-02-04': { completed: false, notes: '', entries: { squat: { sets: [{ weight: '185.5', reps: '5' }] } } },
  };
  s.bodyScans = [
    { id: 'scan-1', date: '2026-01-05', weight: 200.4, bodyFatPct: 25.1, fatMass: 50.3, leanMass: 150.1, waist: 36.5, visceral: 11 },
    { id: 'scan-2', date: '2026-02-05', weight: 197.8, bodyFatPct: 24.2, fatMass: 47.9, leanMass: 149.9, waist: 35.9, visceral: null },
  ];
  s.mealLogs = { '2026-02-02': { eaten: { breakfast: true }, extras: [{ n: 'apple' }], water: 3, flags: {} } };
  s.exerciseNotes = { 'Leg Press': 'seat 5, narrow stance', Bench: 'pause on chest' };
  s.customExercises = { 'Cable Row 2': { muscle: 'back', equipment: 'cable' } };
  s.restartWeights = { Squat: { old: '225', pct: 70 } };
  s.workoutSwaps = { '2026-02-09': '2026-02-11', '2026-02-11': '2026-02-09' };
  s.habitLogs = { '2026-02-02': { water: true } };
  s.watchLogs = { '2026-02-02': { steps: 9000 } };
  s.supplementLogs = { '2026-02-02': { creatine: true } };
  s.futureField = { keepMe: [1, 2, 3] };
  return s;
};

let ls;
const setup = (state = legacyState(), { withBackup = true } = {}) => {
  globalThis.indexedDB = new IDBFactory();
  ls = new FakeStorage();
  globalThis.localStorage = ls;
  if (state) ls.setItem(STORAGE_KEY, JSON.stringify(state));
  if (state && withBackup) ls.setItem(BACKUP_KEY, JSON.stringify({ ...state, version: 5, profile: { ...state.profile, name: 'Older Copy' } }));
  return state;
};
const rawOf = () => ({ primary: ls.getItem(STORAGE_KEY), backup: ls.getItem(BACKUP_KEY) });
const openLocal = () => idb.openAccountDb('local');

test('happy path: staged, verified, activated; localStorage bytes unchanged', async () => {
  const state = setup();
  const before = rawOf();
  const db = await openLocal();
  const res = await mig.migrateLegacyState({ accountId: 'local', storage: ls, db });
  assert.equal(res.status, 'migrated');
  assert.equal(res.legacyUntouched, true);
  assert.deepEqual(rawOf(), before); // byte-for-byte
  assert.deepEqual(res.counts, recordCounts(migrateState(state)));
  assert.equal(res.counts.scans, 2);
  assert.equal(res.counts.workouts, 2);

  const flag = await db.getMeta(mig.META_ACTIVATED);
  assert.ok(flag && flag.at && flag.counts.scans === 2);
  assert.equal(await db.getMeta(mig.META_STAGING), undefined);
  assert.equal((await db.getAll('staging')).length, 0);

  const store = createLocalStore('local', { db });
  const loaded = (await store.load()).state;
  assert.deepEqual(loaded, migrateState(state));
  // Critical values, spelled out.
  const set = loaded.workoutSessions['2026-02-02'].entries.bench.sets[0];
  assert.equal(set.weight, '135'); assert.equal(set.reps, '8'); assert.equal(set.notes, 'paused');
  assert.equal(loaded.bodyScans[1].visceral, null);
  assert.equal(loaded.exerciseNotes['Leg Press'], 'seat 5, narrow stance');
  assert.deepEqual(loaded.futureField, { keepMe: [1, 2, 3] });
  assert.ok(listSnapshots().some((x) => x.reason === 'pre-idb-migration'));
  db.close();
});

test('an old-version legacy state is migrated (migrateState) before staging', async () => {
  const old = legacyState();
  old.version = 3;
  delete old.program;
  setup(old);
  const db = await openLocal();
  const res = await mig.migrateLegacyState({ storage: ls, db });
  assert.equal(res.status, 'migrated');
  const loaded = (await createLocalStore('local', { db }).load()).state;
  assert.equal(loaded.version, STATE_VERSION);
  assert.equal(loaded.bodyScans.length, 2);
  assert.deepEqual(JSON.parse(ls.getItem(STORAGE_KEY)).version, 3); // original still v3
  db.close();
});

test('idempotent: running again changes nothing and keeps the first activation', async () => {
  setup();
  const db = await openLocal();
  const first = await mig.migrateLegacyState({ storage: ls, db });
  const flag = await db.getMeta(mig.META_ACTIVATED);
  const rowsBefore = JSON.stringify(await db.getAll('records'));
  const again = await mig.migrateLegacyState({ storage: ls, db });
  assert.equal(first.status, 'migrated');
  assert.equal(again.status, 'already-migrated');
  assert.deepEqual(await db.getMeta(mig.META_ACTIVATED), flag);
  assert.equal(JSON.stringify(await db.getAll('records')), rowsBefore);
  db.close();
});

test('interrupted after staging: nothing is active, legacy keeps being used, re-run resumes', async () => {
  setup();
  const before = rawOf();
  const db = await openLocal();
  const res = await mig.migrateLegacyState({
    storage: ls, db, hooks: { afterStaging: () => { throw new Error('tab closed'); } },
  });
  assert.equal(res.status, 'interrupted-resumable');
  assert.match(res.reason, /tab closed/);
  assert.ok(res.counts.scans === 2);
  assert.equal(await db.getMeta(mig.META_ACTIVATED), undefined);
  assert.ok(await db.getMeta(mig.META_STAGING)); // staged but ignored
  assert.equal((await db.getAll('records')).length, 0);
  assert.deepEqual(rawOf(), before);
  db.close();

  // "Reload": boot ignores staging; with the crash gone it completes and resumes.
  const crashAgain = await mig.bootState({ storage: ls, hooks: { afterStaging: () => { throw new Error('again'); } } });
  assert.equal(crashAgain.source, 'legacy');
  assert.equal(crashAgain.degraded.reason, 'migration-interrupted-resumable');
  assert.equal(crashAgain.state.bodyScans.length, 2);
  assert.equal(crashAgain.store, null);

  const boot = await mig.bootState({ storage: ls });
  assert.equal(boot.source, 'idb');
  assert.equal(boot.migration.status, 'migrated');
  assert.equal(boot.migration.resumed, true);
  assert.deepEqual(boot.state.workoutSessions, migrateState(legacyState()).workoutSessions);
  assert.deepEqual(rawOf(), before);
  await boot.store.close();
});

test('corrupted verification (a staged record is altered) refuses to activate; legacy remains', async () => {
  setup();
  const before = rawOf();
  const db = await openLocal();
  const res = await mig.migrateLegacyState({
    storage: ls,
    db,
    hooks: {
      afterStaging: async ({ db: d }) => {
        const rows = await d.getAll('staging');
        const row = rows.find((r) => r.collection === 'workoutSessions' && r.key === '2026-02-02');
        row.data.entries.bench.sets[0].weight = '1135'; // a silently corrupted set
        await d.put('staging', row);
      },
    },
  });
  assert.equal(res.status, 'failed');
  assert.equal(res.reason, 'verification-failed');
  assert.ok(res.problems.some((p) => p.includes('weight')), res.problems.join('|'));
  assert.equal(await db.getMeta(mig.META_ACTIVATED), undefined);
  assert.equal((await db.getAll('staging')).length, 0); // discarded
  assert.equal((await db.getAll('records')).length, 0);
  assert.ok((await db.getMeta(mig.META_FAILURE)).problems.length);
  assert.deepEqual(rawOf(), before);
  db.close();

  const boot = await mig.bootState({
    storage: ls,
    hooks: { afterStaging: async ({ db: d }) => { const r = (await d.getAll('staging')).find((x) => x.collection === 'bodyScans'); r.data.weight = 1; await d.put('staging', r); } },
  });
  assert.equal(boot.source, 'legacy');
  assert.equal(boot.degraded.reason, 'migration-failed');
  assert.equal(boot.state.bodyScans[0].weight, 200.4);
});

test('a dropped staged record is caught by the count check', async () => {
  setup();
  const db = await openLocal();
  const res = await mig.migrateLegacyState({
    storage: ls, db,
    hooks: { afterStaging: async ({ db: d }) => { await d.delete('staging', ['bodyScans', 'scan-2']); } },
  });
  assert.equal(res.status, 'failed');
  assert.ok(res.problems.some((p) => /count scans|staged/.test(p)));
  db.close();
});

test('rollback after activation: legacy ignored-IDB path restored, edits preserved, stays rolled back', async () => {
  setup();
  const before = rawOf();
  const boot = await mig.bootState({ storage: ls });
  assert.equal(boot.source, 'idb');
  // The user logs more after migration.
  const edited = clone(boot.state);
  edited.mealLogs['2026-03-01'] = { eaten: {}, extras: [], water: 8, flags: {} };
  assert.equal((await boot.store.commit(boot.state, edited)).ok, true);
  const db = await boot.store.getDb();
  const out = await mig.rollbackMigration({ db, storage: ls });
  assert.equal(out.status, 'rolled-back');
  assert.equal(out.preservedEdits, true);
  const snap = listSnapshots().find((x) => x.reason === 'pre-idb-rollback');
  assert.ok(snap);
  assert.equal(snap.counts.meals, 2);
  assert.equal(await db.getMeta(mig.META_ACTIVATED), undefined);
  assert.equal((await db.getAll('records')).length, 0);
  assert.ok((await db.getMeta('migration:rolledBack-records')).rows.length > 0);
  assert.deepEqual(rawOf(), before);
  await boot.store.close();

  const next = await mig.bootState({ storage: ls });
  assert.equal(next.source, 'legacy');
  assert.equal(next.degraded.reason, 'migration-rolled-back');
  assert.equal(next.state.mealLogs['2026-03-01'], undefined);

  // Explicit retry re-activates.
  const db2 = await openLocal();
  const again = await mig.migrateLegacyState({ storage: ls, db: db2, force: true });
  assert.equal(again.status, 'migrated');
  db2.close();
});

test('rollback with no edits since activation reports none preserved', async () => {
  setup();
  const db = await openLocal();
  const res = await mig.migrateLegacyState({ storage: ls, db });
  const out = await res.rollback();
  assert.equal(out.status, 'rolled-back');
  assert.equal(out.preservedEdits, false);
  db.close();
});

test('IndexedDB unsupported: falls back to the legacy path and reports degraded mode', async () => {
  setup();
  const saved = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  try {
    const boot = await mig.bootState({ storage: ls });
    assert.equal(boot.source, 'legacy');
    assert.equal(boot.store, null);
    assert.equal(boot.degraded.reason, 'idb-unsupported');
    assert.equal(boot.state.bodyScans.length, 2); // the app keeps working with its data
    assert.equal(boot.state.version, STATE_VERSION);
  } finally { globalThis.indexedDB = saved; }
});

test('IndexedDB that fails to open (private mode) also falls back', async () => {
  setup();
  const boot = await mig.bootState({
    storage: ls,
    openOptions: { indexedDB: { open() { throw Object.assign(new Error('no'), { name: 'SecurityError' }); } } },
  });
  assert.equal(boot.source, 'legacy');
  assert.match(boot.degraded.reason, /^idb-/);
});

test('unreadable legacy data is never replaced: migration fails, quarantine keeps the bytes', async () => {
  setup(null);
  ls.setItem(STORAGE_KEY, '{"bodyScans":[{"id":"x"');
  const garbage = ls.getItem(STORAGE_KEY);
  const db = await openLocal();
  const res = await mig.migrateLegacyState({ storage: ls, db });
  assert.equal(res.status, 'failed');
  assert.equal(res.reason, 'legacy-unreadable');
  assert.equal(ls.getItem(STORAGE_KEY), garbage);
  assert.equal(ls.getItem(QUARANTINE_KEY), garbage);
  assert.equal(await db.getMeta(mig.META_ACTIVATED), undefined);
  db.close();
});

test('unreadable primary with a good backup migrates the backup, primary bytes untouched', async () => {
  setup();
  ls.setItem(STORAGE_KEY, 'not json');
  const db = await openLocal();
  const res = await mig.migrateLegacyState({ storage: ls, db });
  assert.equal(res.status, 'migrated');
  assert.equal(ls.getItem(STORAGE_KEY), 'not json');
  assert.equal((await db.getMeta(mig.META_ACTIVATED)).from, 'backup');
  db.close();
});

test('fresh install: nothing to migrate, boots to IndexedDB with a normal default state', async () => {
  setup(null);
  const boot = await mig.bootState({ storage: ls });
  assert.equal(boot.source, 'idb');
  assert.equal(boot.migration.status, 'nothing-to-migrate');
  assert.equal(boot.state.version, STATE_VERSION);
  assert.equal(ls.length, 0); // legacy storage not touched at all
  const again = await mig.bootState({ storage: ls });
  assert.deepEqual(again.state, boot.state);
  await boot.store.close(); await again.store.close();
});

test('boot on an activated device loads from IndexedDB, ignoring later legacy changes, and persists upgrades', async () => {
  setup();
  const first = await mig.bootState({ storage: ls });
  await first.store.close();
  ls.setItem(STORAGE_KEY, JSON.stringify({ ...legacyState(), bodyScans: [] })); // legacy now disagrees
  const second = await mig.bootState({ storage: ls });
  assert.equal(second.source, 'idb');
  assert.equal(second.state.bodyScans.length, 2);
  assert.equal(second.migration.status, 'already-migrated');
  await second.store.close();
});

test('signed-in accounts boot from their own database without touching the legacy blob', async () => {
  setup();
  const before = rawOf();
  const boot = await mig.bootState({ accountId: 'user-123', storage: ls });
  assert.equal(boot.source, 'idb');
  assert.equal(boot.migration, null);
  assert.equal(boot.state.bodyScans.length, 0); // never the device-local history
  assert.deepEqual(rawOf(), before);
  assert.equal(await boot.store.pendingCount(), 0); // normalising does not queue uploads
  await boot.store.close();
});

test('verifyStaged reports value-level mismatches and is silent on identical data', () => {
  const s = migrateState(legacyState());
  const now = Date.now();
  const rows = explodeState(s).map((r) => ({ ...r, version: 0, deleted: false, updatedAt: now }));
  assert.equal(mig.verifyStaged(s, rows, rows.length).ok, true);
  const bad = clone(rows);
  bad.find((r) => r.collection === 'bodyScans' && r.key === 'scan-1').data.waist = 36.6;
  const res = mig.verifyStaged(s, bad, bad.length);
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => p.includes('waist')));
  // type drift ('8' vs 8) is also a mismatch
  const drift = clone(rows);
  drift.find((r) => r.collection === 'workoutSessions' && r.key === '2026-02-02').data.entries.bench.sets[0].reps = 8;
  assert.equal(mig.verifyStaged(s, drift, drift.length).ok, false);
});
