// Scenario sweep for weekly set counts, the 7/30-day span and lagging-muscle
// hints, using the shapes the loggers actually save.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setsByMuscleWindow, loggedSpanDays, muscleBalance, muscleGroupsOf, muscleGroupOf,
  allSetRecords, todayKey, addDays,
} from '../src/helpers.js';

const END = '2026-11-21';
const day = (n, end = END) => addDays(end, -n);
const straight = (exName, sets, extra = {}) => ({ exName, sets, ...extra });
const circuit = (rounds) => ({ blockType: 'circuit', rounds: rounds.map((byExercise) => ({ byExercise })) });
const reps = (n, weight = '') => ({ weight, reps: String(n) });
const sessions = (map) => ({ workoutSessions: Object.fromEntries(Object.entries(map).map(([d, entries]) => [d, { entries }])) });

test('no data: empty counts, one-week span, no hints', () => {
  assert.deepEqual(setsByMuscleWindow({}, 7, END), {});
  assert.equal(loggedSpanDays({}, 30, END), 7);
  const b = muscleBalance({});
  assert.equal(b.enough, false);
  assert.deepEqual(b.hints, []);
});

test('data only inside the window: 30 days averages from the first set', () => {
  const st = sessions({ [day(20)]: { a: straight('Barbell Bench Press', [reps(8, 135), reps(8, 135), reps(8, 135)]) } });
  assert.deepEqual(setsByMuscleWindow(st, 7, END), {});
  assert.deepEqual(setsByMuscleWindow(st, 30, END), { Chest: 3 });
  assert.equal(loggedSpanDays(st, 30, END), 21);
});

test('window edges: day 7 back is out, today is in, future is out', () => {
  const st = sessions({
    [day(7)]: { a: straight('Plank', [{ seconds: '30' }]) },
    [day(6)]: { a: straight('Plank', [{ seconds: '30' }]) },
    [END]: { a: straight('Plank', [{ seconds: '30' }]) },
    [addDays(END, 1)]: { a: straight('Plank', [{ seconds: '30' }]) },
  });
  assert.deepEqual(setsByMuscleWindow(st, 7, END), { Core: 2 });
});

test('long history: 30-day span is the full window', () => {
  const map = {};
  for (let i = 0; i < 60; i += 2) map[day(i)] = { a: straight('Barbell Bench Press', [reps(8, 135)]) };
  const st = sessions(map);
  assert.equal(loggedSpanDays(st, 30, END), 30); // history before the window -> full window
  assert.equal(setsByMuscleWindow(st, 30, END).Chest, 15);
  assert.equal(loggedSpanDays(st, 7, END), 7);
});

test('bodyweight, timed and unit-suffixed entries all count', () => {
  const st = sessions({ [END]: {
    a: straight('Plank', [{ weight: '', reps: '', seconds: '45s' }, { seconds: '1:00' }, { seconds: '60' }]),
    b: straight('Dead Bug', [reps(10), reps('8-10')]),
    c: circuit([{ 'Reverse Crunch': reps(15), Plank: { seconds: '40 sec' } }]),
  } });
  assert.equal(setsByMuscleWindow(st, 7, END).Core, 7);
});

test('warm-ups, drop rows, skips, blanks and zero reps do not count', () => {
  const st = sessions({ [END]: {
    a: straight('Barbell Bench Press', [
      { ...reps(10, 95), isWarmup: true }, reps(8, 185), { ...reps(6, 135), isDrop: true }, { ...reps(6, 95), isDrop: true },
      { weight: '185', reps: '' }, reps(0, 185),
    ]),
    b: straight('Dead Bug', [reps(10)], { skipped: true }),
    c: circuit([{ 'Reverse Crunch': { ...reps(15), skipped: true }, 'Dead Bug': reps(10) }, { 'Reverse Crunch': { reps: '' } }]),
  } });
  assert.deepEqual(setsByMuscleWindow(st, 7, END), { Chest: 1, Core: 1 });
});

test('swaps count toward the replacement exercise, in sets and in circuits', () => {
  const st = sessions({ [END]: {
    a: straight('Barbell Bench Press', [reps(10, 50)], { replacedWith: 'Dead Bug' }),
    b: circuit([{ 'Reverse Crunch': { ...reps(10, 40), replacedWith: 'Barbell Bench Press' } }]),
  } });
  assert.deepEqual(setsByMuscleWindow(st, 7, END), { Core: 1, Chest: 1 });
});

test('compound lifts credit each listed muscle; tonnage keeps the first', () => {
  const st = sessions({ [END]: {
    a: straight('Back Squat', [reps(5, 225), reps(5, 225)]),
    b: straight('Romanian Deadlift', [reps(8, 185)]),
    c: straight('Deadlift', [reps(5, 275)]),
  } });
  assert.deepEqual(setsByMuscleWindow(st, 7, END), { Quads: 2, Glutes: 3, Hamstrings: 2, Back: 1 });
  assert.equal(muscleGroupOf('Back Squat', {}), 'Quads');
  assert.equal(muscleGroupOf('Romanian Deadlift', {}), 'Hamstrings');
});

test('unknown exercises land in Other and never on the map', () => {
  const st = sessions({ [END]: { a: straight('Mystery Machine 3000', [reps(10, 50)]) } });
  assert.deepEqual(setsByMuscleWindow(st, 7, END), { Other: 1 });
});

test('custom machine labels map by whole words', () => {
  const custom = (p) => ({ customExercises: { X: { p } } });
  const cases = {
    'Hip Abductor': ['Glutes'], 'Outer thigh': ['Glutes'], 'Inner thigh': ['Quads'],
    'Lateral Delts': ['Shoulders'], 'Rear delts, Upper back': ['Shoulders', 'Back'],
    Core: ['Core'], Abs: ['Core'], 'Pecs': ['Chest'], 'Lats, Biceps': ['Back', 'Biceps'],
    Traps: ['Back'], 'Rhomboids': ['Back'], 'Soleus': ['Calves'], 'Glute medius': ['Glutes'],
    'Forearms': ['Other'], 'Hip flexors': ['Other'],
  };
  for (const [label, want] of Object.entries(cases)) assert.deepEqual(muscleGroupsOf('X', custom(label)), want, label);
});

test('tonnage records still need a load', () => {
  const st = sessions({ [END]: { a: straight('Dead Bug', [reps(10)]), b: straight('Barbell Bench Press', [reps(8, 185)]) } });
  assert.equal(allSetRecords(st).length, 1);
});

test('lagging hints on a 6-day-old plan use 6 days, not 3 weeks', () => {
  const t = todayKey();
  const map = {};
  for (let i = 0; i < 6; i++) {
    map[addDays(t, -i)] = {
      a: straight('Barbell Bench Press', [reps(8, 135), reps(8, 135)]),
      b: straight('Back Squat', [reps(5, 225), reps(5, 225)]),
      c: straight('Dead Bug', [reps(10)]),
    };
  }
  const b = muscleBalance(sessions(map));
  const chest = b.ranked.find((r) => r.muscle === 'Chest');
  assert.equal(chest.sets, 12); // 12 sets in under a week, not 12 / 3
  assert.ok(!b.hints.some((h) => h.muscle === 'Chest'));
  const missing = b.hints.find((h) => h.kind === 'missing');
  assert.match(missing.text, /in 7 days/);
});

test('lagging hints with three full weeks still average over 3 weeks', () => {
  const t = todayKey();
  const map = {};
  for (let i = 0; i < 21; i++) map[addDays(t, -i)] = { a: straight('Barbell Bench Press', [reps(8, 135)]), b: straight('Back Squat', [reps(5, 225)]) };
  const b = muscleBalance(sessions(map));
  assert.equal(b.ranked.find((r) => r.muscle === 'Chest').sets, 7);
  assert.match(b.hints.find((h) => h.kind === 'missing').text, /in 3 weeks/);
});
