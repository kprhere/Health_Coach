// ============================================================
// backup-and-unknown-fields.test.mjs - a backup can be trusted, and nothing a
// newer build wrote is erased by an older one. All data here is synthetic.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, migrateState, mergeSyncedState, STATE_VERSION } from '../src/helpers.js';
import { buildBackup, parseBackup, importPreview } from '../src/backup.js';

const sample = () => {
  const s = defaultState();
  s.profile.name = 'Sample Person';
  s.bodyScans = [{ id: 'scan-a', date: '2026-01-05', weight: 150, bodyFatPct: 20, fatMass: 30, leanMass: 120 }];
  s.workoutSessions = {
    '2026-01-06': { date: '2026-01-06', completed: true, notes: '', entries: { 'x#0': { blockType: 'single', exName: 'Back Squat', sets: [{ weight: '135', reps: '8', rpe: '7' }] } } },
    '2026-01-08': { date: '2026-01-08', completed: false, notes: 'felt heavy', entries: {} },
  };
  s.mealLogs = { '2026-01-06': { eaten: { 0: true }, extras: [], water: 2 } };
  return s;
};

test('unknown top-level fields survive migration', () => {
  const s = { ...sample(), version: STATE_VERSION, futureFeature: { keep: 'me', n: 3 } };
  const out = migrateState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(out.futureFeature, { keep: 'me', n: 3 });
});

test('unknown fields from an older-version file also survive the upgrade chain', () => {
  const s = { ...sample(), version: 2, customThing: [1, 2, 3] };
  const out = migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(out.version, STATE_VERSION);
  assert.deepEqual(out.customThing, [1, 2, 3]);
});

test('the load-time restoredFromBackup flag is never carried into saved state', () => {
  const out = migrateState({ ...sample(), version: STATE_VERSION, restoredFromBackup: true });
  assert.equal('restoredFromBackup' in out, false);
});

test('a sync merge keeps a field only the cloud copy has', () => {
  const local = sample();
  const remote = { ...sample(), plannerNotes: { '2026-02-01': 'deload' } };
  const merged = mergeSyncedState(local, remote);
  assert.deepEqual(merged.plannerNotes, { '2026-02-01': 'deload' });
});

test('export round-trips with matching checksum, counts and critical values', async () => {
  const s = sample();
  const file = await buildBackup(s, { now: new Date('2026-03-01T10:00:00Z') });
  assert.equal(file.counts.workouts, 2);
  assert.equal(file.counts.scans, 1);
  const res = await parseBackup(JSON.stringify(file));
  assert.equal(res.ok, true);
  assert.equal(res.verified, true);
  assert.equal(res.state.workoutSessions['2026-01-06'].entries['x#0'].sets[0].weight, '135');
  assert.equal(res.state.bodyScans[0].leanMass, 120);
});

test('a single edited value fails the integrity check and imports nothing', async () => {
  const file = await buildBackup(sample());
  const tampered = JSON.parse(JSON.stringify(file));
  tampered.state.workoutSessions['2026-01-06'].entries['x#0'].sets[0].weight = '315';
  const res = await parseBackup(JSON.stringify(tampered));
  assert.equal(res.ok, false);
  assert.equal(res.code, 'checksum');
});

test('a removed record is caught even when the checksum is recomputed to hide it', async () => {
  const file = await buildBackup(sample());
  const doctored = JSON.parse(JSON.stringify(file));
  delete doctored.state.workoutSessions['2026-01-08'];
  const { stateDigest } = await import('../src/backup.js');
  doctored.sha256 = await stateDigest(doctored.state);
  const res = await parseBackup(JSON.stringify(doctored));
  assert.equal(res.ok, false);
  assert.equal(res.code, 'counts');
});

test('truncated and non-backup files are rejected without throwing', async () => {
  const file = JSON.stringify(await buildBackup(sample()));
  assert.equal((await parseBackup(file.slice(0, file.length - 40))).code, 'not-json');
  assert.equal((await parseBackup('[1,2,3]')).code, 'not-backup');
  assert.equal((await parseBackup('{"hello":"world"}')).code, 'not-backup');
  assert.equal((await parseBackup('')).ok, false);
});

test('a backup from a newer build is refused rather than half-read', async () => {
  const file = await buildBackup({ ...sample(), version: STATE_VERSION + 1 });
  const res = await parseBackup(JSON.stringify(file), { maxStateVersion: STATE_VERSION });
  assert.equal(res.code, 'newer-state');
  const newerFormat = { ...file, schema: 99 };
  assert.equal((await parseBackup(JSON.stringify(newerFormat))).code, 'newer-format');
});

test('a legacy bare-state export still imports but is flagged unverified', async () => {
  const res = await parseBackup(JSON.stringify(sample()));
  assert.equal(res.ok, true);
  assert.equal(res.kind, 'legacy');
  assert.equal(res.verified, false);
});

test('preview shows what replace would remove and that merge removes nothing', () => {
  const device = sample();
  const file = { ...sample(), workoutSessions: { '2026-01-06': sample().workoutSessions['2026-01-06'] } };
  const merged = mergeSyncedState(device, file);
  const p = importPreview(device, file, merged);
  assert.deepEqual(p.replaceLoss, [{ kind: 'workouts', before: 2, after: 1, lost: 1 }]);
  assert.equal(p.afterMerge.workouts, 2);
});
