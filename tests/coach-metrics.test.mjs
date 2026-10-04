import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../src/helpers.js';
import { assess } from '../src/coach/metrics.js';
import {
  ASOF, baseState, session, singleEntry, roundsEntry, withSessions, work, setWatch,
} from './coach-fixtures.mjs';

const D1 = addDays(ASOF, -1);

test('every block type is counted once, without warm-ups, skips or blanks', () => {
  const s = withSessions(baseState(), [session(D1, [
    singleEntry('Barbell Bench Press', [
      { weight: 45, reps: 10, isWarmup: true },
      { weight: 135, reps: 8, rpe: 8 }, { weight: 135, reps: 8, rpe: 9 }, { weight: '', reps: '' },
    ]),
    singleEntry('Pec Deck', [{ weight: 100, reps: 10 }, { weight: 80, reps: 8, isDrop: true }], { blockType: 'dropset' }),
    roundsEntry('superset', 'Arms', [
      { 'Hammer Curl': { weight: 25, reps: 10 }, 'Rope Pushdown': { weight: 40, reps: 12 } },
      { 'Hammer Curl': { weight: 25, reps: 9 }, 'Rope Pushdown': { weight: 40, reps: 12, skipped: true } },
      { 'Hammer Curl': {}, 'Rope Pushdown': {} },
    ]),
    roundsEntry('circuit', 'Circ', [{ 'Goblet Squat': { weight: 30, reps: 12 }, Dips: { reps: 8 } }]),
    roundsEntry('finisher', 'Burn', [{ Plank: { seconds: 45 } }]),
    singleEntry('Leg Press', [{ weight: 200, reps: 10 }], { skipped: true }),
  ])]);
  const w = assess(s, ASOF).windows[7];
  // bench 2 + pec deck 2 (one drop) + curl 2 + pushdown 1 + goblet 1 + dips (bodyweight, blank weight) 1
  assert.equal(w.completedWorkingSets, 9);
  assert.equal(w.dropSets, 1);
  assert.equal(w.timedSeconds, 45);
  assert.equal(w.timedSets, 1);
  assert.equal(w.loggedSessionDays, 1);
  assert.equal(w.perMuscle.Chest, 5) // bench 2 + pec deck 2 + dips 1;
});

test('replaced exercises count under the replacement, and weights never cross identities', () => {
  const swapped = singleEntry('Barbell Bench Press', [{ weight: 100, reps: 8 }], { replacedWith: 'Chest Press Machine' });
  const s = withSessions(baseState(), [
    session(addDays(ASOF, -8), [work('Barbell Bench Press', 1, 185, 5)]),
    session(addDays(ASOF, -4), [swapped]),
    session(D1, [singleEntry('Chest Press Machine', [{ weight: 120, reps: 8 }])]),
  ]);
  const top = assess(s, ASOF).windows[28].topSets;
  assert.deepEqual(top['Chest Press Machine'].sessions.map((x) => x.weight), [100, 120]);
  assert.equal(top['Chest Press Machine'].change.weight, 20);
  assert.equal(top['Barbell Bench Press'].change, null, 'one barbell exposure is not compared to the machine');
});

test('timed work and conditioning stay out of resistance sets', () => {
  const s = withSessions(baseState(), [session(D1, [singleEntry('Plank', [{ seconds: 60 }, { seconds: 50 }])])]);
  s.activity[D1] = { eveningWalk: true, eveningWalkMin: 30, swim: true };
  setWatch(s, D1, { exerciseMin: 40, workoutMin: 25 });
  const w = assess(s, ASOF).windows[7];
  assert.equal(w.completedWorkingSets, 0);
  assert.equal(w.timedSeconds, 110);
  assert.equal(w.conditioning.walkMin, 30);
  assert.equal(w.conditioning.swimDays, 1);
  assert.equal(w.conditioning.watchExerciseMin, 40);
  assert.match(w.conditioning.label, /conditioning/);
});

test('data after asOf is ignored entirely', () => {
  const s = withSessions(baseState(), [session(D1, [work('Seated Cable Row', 3, 100, 10)])]);
  setWatch(s, D1, { sleepH: 7 });
  const before = assess(s, ASOF);
  const later = structuredClone(s);
  withSessions(later, [session(addDays(ASOF, 1), [work('Seated Cable Row', 9, 300, 10)])]);
  setWatch(later, addDays(ASOF, 2), { sleepH: 3, restingHR: 90 });
  later.dayStatus = { [addDays(ASOF, 3)]: 'missed' };
  later.activity[addDays(ASOF, 1)] = { swim: true };
  assert.deepEqual(assess(later, ASOF), before);
});

test('an unlogged planned day is unknown; only dayStatus missed is confirmed', () => {
  const s = baseState(); // Fri 10-02 was a planned day
  const a = assess(s, ASOF);
  assert.equal(a.windows[7].missedDays, 0);
  assert.ok(a.windows[7].unloggedDays >= 1);
  assert.ok(a.missing.includes('unlogged planned sessions'));
  s.dayStatus = { '2026-10-02': 'missed' };
  const b = assess(s, ASOF);
  assert.equal(b.windows[7].missedDays, 1);
  assert.equal(b.windows[7].unloggedDays, a.windows[7].unloggedDays - 1);
});

test('inactivity separates other-logging from nothing at all', () => {
  const s = withSessions(baseState(), [session(addDays(ASOF, -20), [work('Seated Cable Row', 3, 100, 10)])]);
  const g = assess(s, ASOF).inactivity;
  assert.equal(g.gapDays, 20);
  assert.equal(g.otherLoggingInGap, false);
  assert.equal(g.confirmed, false);
  setWatch(s, addDays(ASOF, -5), { steps: 8000 });
  assert.equal(assess(s, ASOF).inactivity.otherLoggingInGap, true);
});

test('confirmed inactivity needs every planned day answered', () => {
  const s = withSessions(baseState(), [session('2026-09-23', [work('Seated Cable Row', 3, 100, 10)])]);
  // planned days after 09-23 up to 10-03: Fri 09-25, Mon 09-28, Wed 09-30, Fri 10-02
  s.dayStatus = { '2026-09-25': 'missed', '2026-09-28': 'rest', '2026-09-30': 'missed' };
  assert.equal(assess(s, ASOF).inactivity.confirmed, false);
  s.dayStatus['2026-10-02'] = 'missed';
  assert.equal(assess(s, ASOF).inactivity.confirmed, true);
});

test('HRV is ignored without a baseline and listed as missing', () => {
  const s = baseState();
  for (let i = 0; i < 20; i++) setWatch(s, addDays(ASOF, -i), { hrv: 50 });
  assert.equal(assess(s, ASOF).recovery.hrv.used, true);
  const few = baseState();
  for (let i = 0; i < 5; i++) setWatch(few, addDays(ASOF, -i), { hrv: 50 });
  const b = assess(few, ASOF);
  assert.equal(b.recovery.hrv.used, false);
  assert.ok(b.missing.includes('hrv baseline'));
});

test('RHR baseline needs enough history; delta is against the personal median', () => {
  const s = baseState();
  for (let i = 3; i <= 20; i++) setWatch(s, addDays(ASOF, -i), { restingHR: 55 });
  for (let i = 0; i < 3; i++) setWatch(s, addDays(ASOF, -i), { restingHR: 65 });
  const a = assess(s, ASOF).recovery.rhr;
  assert.equal(a.baseline, 55);
  assert.equal(a.delta, 10);
  const none = baseState();
  setWatch(none, ASOF, { restingHR: 65 });
  assert.equal(assess(none, ASOF).recovery.rhr.baselineMissing, true);
});

test('session load needs both RPE and duration, otherwise null and listed missing', () => {
  const s = withSessions(baseState(), [
    session(D1, [work('Seated Cable Row', 3, 100, 10)], { sessionRpe: 7 }),
    session(addDays(ASOF, -2), [work('Seated Cable Row', 3, 100, 10)], { sessionRpe: 7, durationMin: 50 }),
  ]);
  const w = assess(s, ASOF).windows[7];
  const byDate = Object.fromEntries(w.sessionLoads.map((x) => [x.date, x.load]));
  assert.equal(byDate[D1], null);
  assert.equal(byDate[addDays(ASOF, -2)], 350);
  assert.ok(assess(s, ASOF).missing.includes('session load'));
});

test('pain exposures are counted per exercise over 14 days', () => {
  const s = withSessions(baseState(), [
    session(addDays(ASOF, -2), [singleEntry('Back Squat', [{ weight: 100, reps: 5, pain: 3 }])]),
    session(addDays(ASOF, -5), [singleEntry('Back Squat', [{ weight: 100, reps: 5, pain: 4 }])]),
    session(addDays(ASOF, -30), [singleEntry('Back Squat', [{ weight: 100, reps: 5, pain: 5 }])]),
  ]);
  const p = assess(s, ASOF).pain.byExercise['Back Squat'];
  assert.equal(p.exposures, 2);
  assert.equal(p.maxPain, 4);
});

test('sourceVersion is stable and changes when used inputs change', () => {
  const s = withSessions(baseState(), [session(D1, [work('Seated Cable Row', 3, 100, 10)])]);
  const v = assess(s, ASOF).sourceVersion;
  assert.equal(assess(structuredClone(s), ASOF).sourceVersion, v);
  s.workoutSessions[D1].entries['blk#0'].sets[0].weight = '105';
  assert.notEqual(assess(s, ASOF).sourceVersion, v);
});
