import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockDone, cellDone, roundDone, workoutProgress, finishEntry, reopenEntry, completeSession, reopenSession,
  allSetRecords, setsByMuscleWindow, nextSetToFill,
} from '../src/helpers.js';

const set = (weight, reps, extra = {}) => ({ weight: String(weight), reps: String(reps), rpe: '', ...extra });
const bench = (sets) => ({ blockType: 'single', exName: 'Barbell Bench Press', sets });

test('a blank working set keeps the exercise open until it is logged or missed', () => {
  const e = bench([set(135, 8), set(135, 8), set('', '')]);
  assert.equal(blockDone(e), false);
  e.sets[2].missed = true;
  assert.equal(blockDone(e), true);
});

test('bodyweight and timed sets finish without a weight; blank warm-ups do not block', () => {
  assert.equal(blockDone({ exName: 'Dead Bug', sets: [set('', 10), set('', 8)] }), true);
  assert.equal(blockDone({ exName: 'Plank', sets: [{ weight: '', reps: '', seconds: '45' }] }), true);
  assert.equal(blockDone(bench([set('', '', { isWarmup: true }), set(135, 8)])), true);
  assert.equal(blockDone(bench([set(135, '')])), false); // weight alone is not a finished set
  assert.equal(cellDone({ weight: '', reps: '12', seconds: '' }), true);
});

test('finish marks only blank working sets missed; reopen restores them', () => {
  const e = bench([set(95, 10, { isWarmup: true }), set(135, 8), set('', ''), set('', '', { isDrop: true }), set(135, '')]);
  finishEntry(e);
  assert.deepEqual(e.sets.map((x) => !!x.missed), [false, false, true, false, true]);
  assert.equal(e.completed, true);
  assert.equal(blockDone(e), true);
  reopenEntry(e);
  assert.deepEqual(e.sets.map((x) => !!x.missed), [false, false, false, false, false]);
  assert.equal(e.completed, false);
  assert.equal(blockDone(e), false);
});

test('a manually missed set survives finish + reopen', () => {
  const e = bench([set(135, 8), set('', '', { missed: true }), set('', '')]);
  finishEntry(e); reopenEntry(e);
  assert.deepEqual(e.sets.map((x) => !!x.missed), [false, true, false]);
});

test('missed sets never count toward volume, history, set counts or the plate loader target', () => {
  const st = { workoutSessions: { '2026-11-21': { entries: { b: bench([set(135, 8), set(135, 8, { missed: true })]) } } } };
  assert.equal(allSetRecords(st).length, 1);
  assert.deepEqual(setsByMuscleWindow(st, 7, '2026-11-21'), { Chest: 1 });
  assert.equal(nextSetToFill([set(135, 8), set('', '', { missed: true }), set('', '')]), 2);
});

test('circuit: finishing closes blank cells as missed and the block counts', () => {
  const e = { blockType: 'circuit', rounds: [
    { done: true, byExercise: { 'Dead Bug': set('', 10), Plank: { weight: '', reps: '', seconds: '30' } } },
    { done: false, byExercise: { 'Dead Bug': set('', 10), Plank: { weight: '', reps: '', seconds: '' } } },
    { done: false, byExercise: { 'Dead Bug': set('', ''), Plank: { weight: '', reps: '', seconds: '' } } },
  ] };
  assert.equal(blockDone(e), false);
  finishEntry(e);
  assert.equal(blockDone(e), true);
  assert.equal(e.rounds[2].byExercise['Dead Bug'].missed, true);
  const st = { workoutSessions: { '2026-11-21': { entries: { c: e } } } };
  assert.deepEqual(setsByMuscleWindow(st, 7, '2026-11-21'), { Core: 3 });
  reopenEntry(e);
  assert.equal(e.rounds[2].byExercise['Dead Bug'].missed, undefined);
  assert.equal(roundDone(e.rounds[2]), false);
  assert.equal(roundDone(e.rounds[0]), true);
});

test('marking the workout complete finishes every block; reopening puts it back', () => {
  const session = { entries: {
    a: bench([set(135, 8), set('', '')]),
    b: { exName: 'Dead Bug', sets: [set('', 10)] },
    c: bench([set('', ''), set('', '')]),
  } };
  assert.equal(workoutProgress(session).pct, 33);
  completeSession(session);
  assert.equal(workoutProgress(session).pct, 100);
  assert.equal(session.entries.a.sets[1].missed, true);
  assert.equal(session.entries.b.autoFinished, undefined); // already done, left alone
  reopenSession(session);
  assert.equal(workoutProgress(session).pct, 33);
  assert.equal(session.entries.a.sets[1].missed, undefined);
});

test('older workouts already marked complete count as 100%', () => {
  assert.equal(workoutProgress({ completed: true, entries: { a: bench([set('', '')]) } }).pct, 100);
});
