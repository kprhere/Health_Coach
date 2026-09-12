// ============================================================
// storage-safety.test.mjs - nobody's scans or workout history go missing.
//
// Each test drives a real failure mode against a stand-in localStorage:
// a full disk, a corrupted blob, storage switched off entirely, and writes
// that would silently drop records.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';

// A localStorage good enough to fail in the ways a real one does.
class FakeStorage {
  constructor({ limit = Infinity } = {}) {
    this.map = new Map();
    this.limit = limit;
    this.truncateNext = false;
  }

  get length() { return this.map.size; }

  key(i) { return [...this.map.keys()][i] ?? null; }

  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }

  setItem(k, v) {
    const others = [...this.map.entries()].filter(([key]) => key !== k)
      .reduce((sum, [key, val]) => sum + key.length + val.length, 0);
    if (others + k.length + v.length > this.limit) {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    }
    // Some engines drop bytes instead of throwing; that is the case that
    // loses data without anyone noticing.
    this.map.set(k, this.truncateNext ? v.slice(0, Math.floor(v.length / 2)) : v);
    this.truncateNext = false;
  }

  removeItem(k) { this.map.delete(k); }
}

const install = (opts) => { globalThis.localStorage = new FakeStorage(opts); return globalThis.localStorage; };

const {
  recordCounts, describeLoss, readStoredState, writeStoredState,
  snapshot, listSnapshots, readSnapshot, hasQuarantined,
  BACKUP_KEY, QUARANTINE_KEY, MAX_SNAPSHOTS,
} = await import('../src/storage.js');
const { STORAGE_KEY } = await import('../src/data.js');

const stateWith = (scans, workouts) => ({
  version: 5,
  bodyScans: Array.from({ length: scans }, (_, i) => ({ id: `s${i}`, date: '2026-01-0' + (i % 9) })),
  workoutSessions: Object.fromEntries(Array.from({ length: workouts }, (_, i) => [`2026-02-${10 + i}`, { entries: [] }])),
  mealLogs: {}, habitLogs: {},
});

test('a write that cannot be stored is reported, never swallowed', () => {
  install({ limit: 200 });
  const res = writeStoredState(stateWith(4, 30));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'quota');
});

test('a write that is silently truncated is caught by reading it back', () => {
  const ls = install();
  writeStoredState(stateWith(2, 2));
  ls.truncateNext = true;
  const res = writeStoredState(stateWith(3, 3));
  assert.equal(res.ok, false, 'a half-written blob must not be reported as saved');
  assert.equal(res.reason, 'verify-failed');
});

test('storage being unavailable entirely is reported rather than crashing', () => {
  delete globalThis.localStorage;
  assert.doesNotThrow(() => readStoredState());
  assert.deepEqual(readStoredState(), { state: null, source: 'empty' });
  const res = writeStoredState(stateWith(1, 1));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'unavailable');
});

test('unreadable saved data is quarantined and the last good copy used instead', () => {
  const ls = install();
  writeStoredState(stateWith(3, 5));   // good copy
  writeStoredState(stateWith(3, 6));   // advances BACKUP_KEY to the previous good copy
  ls.map.set(STORAGE_KEY, '{"bodyScans":[{"id"');   // corrupted mid-write

  const read = readStoredState();
  assert.equal(read.source, 'backup');
  assert.equal(read.recovered, true);
  assert.ok(read.state.bodyScans.length > 0, 'history must come back, not start empty');
  assert.ok(hasQuarantined(), 'the unreadable bytes must be kept, not thrown away');
  assert.equal(ls.getItem(QUARANTINE_KEY), '{"bodyScans":[{"id"');
});

test('corrupted data with no backup still never destroys the original', () => {
  const ls = install();
  ls.map.set(STORAGE_KEY, 'not json at all');

  const read = readStoredState();
  assert.equal(read.state, null);
  assert.equal(read.source, 'unreadable');
  assert.equal(ls.getItem(QUARANTINE_KEY), 'not json at all');
});

test('a write that would drop scans or workouts snapshots the old copy first', () => {
  install();
  writeStoredState(stateWith(4, 12));
  const res = writeStoredState(stateWith(1, 12));   // three scans vanish

  assert.equal(res.ok, true);
  assert.deepEqual(res.loss, [{ kind: 'scans', before: 4, after: 1, lost: 3 }]);

  const snaps = listSnapshots();
  assert.equal(snaps.length, 1);
  assert.equal(snaps[0].reason, 'records-removed');
  assert.equal(readSnapshot(snaps[0].key).state.bodyScans.length, 4, 'the lost scans must be recoverable');
});

test('a write that only adds records takes no snapshot', () => {
  install();
  writeStoredState(stateWith(2, 3));
  const res = writeStoredState(stateWith(3, 5));
  assert.deepEqual(res.loss, []);
  assert.deepEqual(listSnapshots(), []);
});

test('the backup only ever advances to a copy that really stored', () => {
  const ls = install();
  writeStoredState(stateWith(3, 9));
  const good = ls.getItem(STORAGE_KEY);

  ls.truncateNext = true;
  writeStoredState(stateWith(4, 10));   // fails verification

  assert.equal(ls.getItem(BACKUP_KEY), null, 'a failed write must not become the backup');
  ls.truncateNext = false;
  writeStoredState(stateWith(4, 10));
  assert.equal(ls.getItem(BACKUP_KEY), good, 'the backup is the last copy known to have stored');
});

test('snapshots are capped so the safety net cannot fill the disk', () => {
  install();
  for (let i = 0; i < MAX_SNAPSHOTS + 4; i++) snapshot('records-removed', stateWith(i + 1, i + 1));
  assert.equal(listSnapshots().length, MAX_SNAPSHOTS);
});

test('live data wins over the safety net when space runs out', () => {
  // Snapshots exist to protect history. If keeping them means today's logs
  // cannot be written, the logs come first.
  const ls = install();
  writeStoredState(stateWith(2, 2));
  for (let i = 0; i < 3; i++) snapshot('records-removed', stateWith(6, 40));

  const bulky = stateWith(3, 24);
  const used = [...ls.map.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  ls.limit = used - 200;               // no room left without giving something up

  const res = writeStoredState(bulky);
  assert.equal(res.ok, true, 'the current log must be saved even at the cost of snapshots');
  assert.equal(JSON.parse(ls.getItem(STORAGE_KEY)).workoutSessions && Object.keys(JSON.parse(ls.getItem(STORAGE_KEY)).workoutSessions).length, 24);
});

test('record counting covers every irreplaceable log, not just scans', () => {
  const counts = recordCounts({
    bodyScans: [1, 2],
    workoutSessions: { a: 1 },
    mealLogs: { a: 1, b: 1 },
    habitLogs: { a: 1 },
    watchLogs: {},
    supplementLogs: { a: 1 },
    exerciseNotes: { 'Back Squat': 'x' },
    customExercises: { 'My Machine': {} },
  });
  assert.deepEqual(counts, {
    scans: 2, workouts: 1, meals: 2, habits: 1,
    watch: 0, supplements: 1, exerciseNotes: 1, customExercises: 1,
  });
  // and every one of them is watched for loss
  const loss = describeLoss(
    { bodyScans: [1], workoutSessions: { a: 1 }, mealLogs: { a: 1 }, habitLogs: { a: 1 }, watchLogs: { a: 1 }, supplementLogs: { a: 1 }, exerciseNotes: { a: 1 }, customExercises: { a: 1 } },
    {},
  );
  assert.equal(loss.length, 8, 'every record type must be guarded');
});
