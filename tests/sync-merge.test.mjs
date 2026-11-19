// Field-level sync: two devices editing the same data, in either order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, mergeSyncedState } from '../src/helpers.js';
import { stampChanges, flattenTracked, KEEP_DAYS } from '../src/syncMerge.js';

const T0 = Date.UTC(2026, 10, 19, 12);
const min = (m) => T0 + m * 60000;
const edit = (state, fn, at) => { const next = structuredClone(state); fn(next); return stampChanges(state, next, at); };
const both = (a, b) => [mergeSyncedState(a, b), mergeSyncedState(b, a)];

function synced() {
  // One starting point both devices share, with some history already stamped.
  let s = defaultState();
  s = edit(s, (d) => {
    d.habitLogs['2026-11-18'] = { protein_hit: true, oil_measured: true };
    d.workoutSessions['2026-11-18'] = { entries: { squat: { name: 'Back Squat', sets: [{ weight: '185', reps: '6' }] }, rdl: { name: 'Romanian Deadlift', sets: [] } } };
    d.settings.stepsTarget = 10000;
  }, min(0));
  return s;
}

test('a deletion on one device sticks, whichever device merges first', () => {
  const base = synced();
  const phone = edit(base, (d) => { delete d.habitLogs['2026-11-18'].oil_measured; }, min(10));
  const laptop = base; // still has the tick
  for (const merged of both(phone, laptop)) {
    assert.equal(merged.habitLogs['2026-11-18'].oil_measured, undefined);
    assert.equal(merged.habitLogs['2026-11-18'].protein_hit, true);
  }
});

test('the newest edit of a field wins on both devices (old rule: this device always won)', () => {
  const base = synced();
  const phone = edit(base, (d) => { d.settings.stepsTarget = 12000; }, min(5));
  const laptop = edit(base, (d) => { d.settings.stepsTarget = 9000; }, min(20));
  for (const merged of both(phone, laptop)) assert.equal(merged.settings.stepsTarget, 9000);
});

test('a removed exercise stays removed while a new one from the other device is kept', () => {
  const base = synced();
  const phone = edit(base, (d) => { delete d.workoutSessions['2026-11-18'].entries.rdl; }, min(10));
  const laptop = edit(base, (d) => { d.workoutSessions['2026-11-18'].entries.calf = { name: 'Standing Calf Raise', sets: [] }; }, min(12));
  for (const merged of both(phone, laptop)) {
    const ids = Object.keys(merged.workoutSessions['2026-11-18'].entries).sort();
    assert.deepEqual(ids, ['calf', 'squat']);
  }
});

test('a deleted body scan does not come back from the other device', () => {
  const base = edit(synced(), (d) => { d.bodyScans.push({ id: 'x1', date: '2026-11-19', weight: 197 }); }, min(1));
  const phone = edit(base, (d) => { d.bodyScans = d.bodyScans.filter((sc) => sc.id !== 'x1'); }, min(30));
  for (const merged of both(phone, base)) assert.ok(!merged.bodyScans.some((sc) => sc.id === 'x1'));
});

test('a program change on the other device arrives instead of being ignored', () => {
  const base = synced();
  const laptop = edit(base, (d) => { d.program.days[1].title = 'Upper A (edited)'; }, min(40));
  const [merged] = both(base, laptop);
  assert.equal(merged.program.days[1].title, 'Upper A (edited)');
});

test('device-only settings never travel', () => {
  const base = synced();
  const phone = edit(base, (d) => { d.settings.syncUrl = 'https://phone.example'; }, min(5));
  const laptop = edit(base, (d) => { d.settings.syncUrl = 'https://laptop.example'; }, min(9));
  assert.equal(mergeSyncedState(phone, laptop).settings.syncUrl, 'https://phone.example');
  assert.ok(!Object.keys(phone._stamps).some((p) => p.includes('syncUrl')));
});

test('stamping touches only what changed, and a merge result is not re-stamped', () => {
  const base = synced();
  const next = edit(base, (d) => { d.watchLogs['2026-11-19'] = { steps: '11000' }; }, min(50));
  const newPaths = Object.entries(next._stamps).filter(([, t]) => t === min(50)).map(([p]) => p);
  assert.deepEqual(newPaths, [JSON.stringify(['watchLogs', '2026-11-19', 'steps'])]);
  assert.equal(stampChanges(next, next, min(60)), next, 'no change, same object');
  const merged = mergeSyncedState(next, base);
  assert.equal(stampChanges(next, merged, min(70)), merged, 'merge output keeps its own stamps');
});

test('old stamps are pruned so the saved state stays small', () => {
  let s = defaultState();
  s = edit(s, (d) => { d.habitLogs['2026-01-01'] = { a: true }; }, min(0) - (KEEP_DAYS + 5) * 86400000);
  s = edit(s, (d) => { d.habitLogs['2026-11-19'] = { b: true }; }, min(0));
  assert.equal(Object.keys(s._stamps).length, 1);
  assert.ok(flattenTracked(s).size > 0);
});
