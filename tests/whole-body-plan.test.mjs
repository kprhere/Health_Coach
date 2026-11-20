// ============================================================
// whole-body-plan.test.mjs - the v5 rebuild: no Thursday fast,
// a fed arms and abs Thursday, a whole-body definition goal and
// segmental scan data, without raising weekly calories.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';

import { PROGRAM, HABITS, SEED_SCANS, PROFILE_DEFAULT } from '../src/data.js';
import {
  defaultState, migrateState, resolveWorkout, resolveNutrition, nutritionDayType, fastEndTime,
  habitApplicability, definitionGoal, segmentSummary, muscleGroupOf, STATE_VERSION, clone,
} from '../src/helpers.js';
import { DAY_CAL_MULT, personalTargets } from '../src/nutritionEngine.js';

const THURSDAY = '2026-11-12';

test('Thursday is a fed vegetarian hinge + glutes leg day; arms live in the optional Sunday extra', () => {
  const state = defaultState();
  const plan = resolveWorkout(THURSDAY, state);
  assert.equal(plan.title, 'Lower B: Hinge + Glutes');
  assert.equal(nutritionDayType(THURSDAY, state), 'trainingVeg');
  assert.equal(fastEndTime(THURSDAY, state), null);
  assert.ok(resolveNutrition(THURSDAY, state).meals.every((meal) => !meal.fasting));
  const sunday = PROGRAM.days[0].blocks.flatMap((b) => (b.exercises || []).map((e) => e.name));
  for (const required of ['Close Grip Bench', 'Overhead Tricep Extension', 'Incline DB Curl', 'Hammer Curl', 'Reverse Curl', 'Weighted Decline Crunch']) {
    assert.ok(sunday.includes(required), `${required} should be in the Sunday arms extra`);
  }
});

test('no habit or rule still asks for a Thursday fast', () => {
  assert.ok(HABITS.every(({ key }) => key !== 'thu_fast'));
  assert.equal('thu_fast' in habitApplicability(THURSDAY, defaultState()), false);
  assert.ok(Object.values(PROGRAM.days).every(({ dayType }) => dayType !== 'fastThu'));
});

test('Thursday protein is the full daily target, not the old 80% fast-day cut', () => {
  const state = defaultState();
  assert.equal(personalTargets('trainingVeg', state).protein, personalTargets('training', state).protein);
  assert.equal(personalTargets('trainingVeg', state).protein, personalTargets('rest', state).protein);
});

test('removing the fast does not raise weekly calories', () => {
  // The old template week: four 1.09 training days, the 0.955 Wednesday rest,
  // the 0.91 Thursday fast and the 0.977 vegetarian Saturday.
  const oldWeek = [1.09, 1.09, 1.09, 1.09, 0.955, 0.91, 0.977].reduce((a, b) => a + b, 0);
  // Since 2026-11-19 Sunday is an optional extra eaten at rest-day calories,
  // so the week is one training day (1.09) lighter by a rest day (0.955).
  const expected = oldWeek - DAY_CAL_MULT.training + DAY_CAL_MULT.rest;
  const newWeek = Object.values(PROGRAM.days).reduce((sum, day) => sum + DAY_CAL_MULT[day.dayType], 0);
  assert.ok(Math.abs(newWeek - expected) <= 0.01, `weekly multiplier ${newWeek}, expected ${expected}`);
  assert.ok(newWeek <= oldWeek);
});

test('single-leg work starts on the left and every leg day trains the inner thigh', () => {
  for (const dow of [2, 4]) {
    const names = PROGRAM.days[dow].blocks.flatMap((b) => (b.exercises || []).map((e) => e.name));
    assert.ok(names.includes('Hip Adduction'), `day ${dow} should include Hip Adduction`);
  }
  const bss = PROGRAM.days[2].blocks.find((b) => b.name === 'Bulgarian Split Squat');
  assert.match(bss.exercises[0].note, /left/i);
  assert.equal(muscleGroupOf('Hip Adduction', defaultState()), 'Quads');
  assert.equal(muscleGroupOf('Reverse Curl', defaultState()), 'Biceps');
});

test('weekdays carry the whole plan: legs split Tue squat / Thu hinge, weekends optional', () => {
  const day = (dow) => PROGRAM.days[dow];
  const names = (dow) => day(dow).blocks.flatMap((b) => (b.exercises || []).map((e) => e.name));
  const legDays = [1, 2, 3, 4, 5].filter((dow) => /lower/i.test(day(dow).title));
  assert.deepEqual(legDays, [2, 4], 'two leg days Monday to Friday');
  // Each leg day opens with its own heavy main lift, done fresh.
  assert.equal(day(2).blocks[0].name, 'Back Squat');
  assert.equal(day(4).blocks[0].name, 'Romanian Deadlift');
  for (const lift of ['Back Squat', 'Hammer Strength Leg Press', 'Bulgarian Split Squat', 'Leg Extension', 'Standing Calf Raise']) assert.ok(names(2).includes(lift), `${lift} on Tuesday`);
  for (const lift of ['Romanian Deadlift', 'Hip Thrust', 'Seated Leg Curl', 'Seated Calf Raise']) assert.ok(names(4).includes(lift), `${lift} on Thursday`);
  // Neither leg day is the old 80-minute marathon: at most 7 blocks each.
  assert.ok(day(2).blocks.length <= 7 && day(4).blocks.length <= 7);
  // Side delts still three days a week (Mon, Thu, Fri).
  const lateralDays = [1, 2, 3, 4, 5].filter((dow) => names(dow).includes('Arsenal Standing Lateral Raise'));
  assert.ok(lateralDays.length >= 3, `lateral raises on ${lateralDays}`);
  assert.equal(day(4).dayType, 'trainingVeg', 'Thursday stays the vegetarian training day');
  for (const dow of [1, 2, 3, 4, 5]) assert.ok(!day(dow).optional, `day ${dow} is required`);
  for (const dow of [6, 0]) assert.equal(day(dow).optional, true, `day ${dow} is optional`);
  assert.match(day(0).title, /Arms/);
  assert.equal(day(0).dayType, 'rest', 'Sunday eats at rest-day calories');
  assert.equal(habitApplicability('2026-11-22', defaultState()).workout_done, false);
  assert.equal(habitApplicability('2026-11-23', defaultState()).workout_done, true);
});

test('v10 upgrade replaces Tuesday, Thursday and Sunday only, keeps other days and every log', () => {
  const v9 = migrateState({ version: 4 });
  v9.version = 9;
  v9.program.days[1].blocks[0].exercises[0].name = 'Barbell Bench Press';
  v9.program.days[4] = { ...v9.program.days[4], key: 'armsAbs', title: 'Arms + Shoulders + Abs' };
  v9.workoutSessions = { '2026-11-19': { entries: { cgb: { name: 'Close Grip Bench' } } } };
  const after = migrateState(v9);
  assert.equal(after.version, STATE_VERSION);
  assert.equal(after.program.days[1].blocks[0].exercises[0].name, 'Barbell Bench Press', 'Monday swap kept');
  for (const dow of [2, 4, 0]) assert.deepEqual(after.program.days[dow], PROGRAM.days[dow]);
  assert.deepEqual(after.workoutSessions, v9.workoutSessions);
});

test('v9 upgrade rebuilds Tuesday and Sunday only, keeps other days and every log', () => {
  const v8 = migrateState({ version: 4 });
  v8.version = 8;
  v8.program.days[1].blocks[0].exercises[0].name = 'Barbell Bench Press';
  delete v8.program.days[6].optional;
  v8.workoutSessions = { '2026-11-15': { entries: { hack: { name: 'Hack Squat' } } } };
  const after = migrateState(v8);
  assert.equal(after.version, STATE_VERSION);
  assert.equal(after.program.days[1].blocks[0].exercises[0].name, 'Barbell Bench Press', 'Monday swap kept');
  assert.deepEqual(after.program.days[2], PROGRAM.days[2]);
  assert.deepEqual(after.program.days[0], PROGRAM.days[0]);
  assert.equal(after.program.days[6].optional, true);
  assert.deepEqual(after.workoutSessions, v8.workoutSessions);
});

const scansThroughAugust = () => SEED_SCANS.filter((sc) => sc.date <= '2026-08-13');
// The goal and segment cases were written against the 09-25-2026 scan, so pin
// the history there; later seed scans are covered by their own tests below.
const throughSeptember = () => ({ ...defaultState(), bodyScans: SEED_SCANS.filter((sc) => sc.date <= '2026-09-25') });
const scanOn = (list, date) => list.filter((sc) => sc.date === date);

test('the v5 upgrade replaces the fast-day program and resets the goal, keeping logs', () => {
  const oldProgram = clone(PROGRAM);
  oldProgram.days[4] = { key: 'fastRest', title: 'Fast + Recovery', focus: 'Rest + Swim', dayType: 'fastThu', intensity: 'Recovery', blocks: [], conditioning: [], mobility: [], sport: [], notes: '' };
  const before = {
    version: 4,
    program: oldProgram,
    profile: { ...PROFILE_DEFAULT, goalBodyFatPct: 15, goalFatLossLb: 22, startFatMassLb: 46.5 },
    settings: { stepsTarget: 10000 },
    bodyScans: scansThroughAugust(),
    workoutSessions: { '2026-09-15': { entries: [] } },
    habitLogs: { '2026-09-17': { thu_fast: true } },
  };
  const after = migrateState(before);
  assert.equal(after.version, STATE_VERSION);
  assert.equal(after.program.days[4].dayType, 'trainingVeg');
  assert.equal(after.profile.goalBodyFatPct, 10);
  assert.equal(after.profile.startFatMassLb, 47.6);
  assert.equal(after.settings.stepsTarget, 12000);
  assert.ok(after.workoutSessions['2026-09-15'], 'logged workouts must survive');
  assert.deepEqual(after.habitLogs['2026-09-17'], { thu_fast: true });
  const added = scanOn(after.bodyScans, '2026-09-25');
  assert.equal(added.length, 1);
  assert.equal(added[0].legLFat, 7.3);
});

test('the upgrade fills segments into a hand-entered 09-25 scan instead of duplicating it', () => {
  const manual = { id: 'mine', date: '2026-09-25', weight: 191.6, bodyFatPct: 24.8, fatMass: 47.6, leanMass: 144 };
  const after = migrateState({ version: 4, bodyScans: [...scansThroughAugust(), manual] });
  const matches = scanOn(after.bodyScans, '2026-09-25');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'mine');
  assert.equal(matches[0].trunkFat, 27.95);
});

test('a custom step target survives the upgrade', () => {
  const after = migrateState({ version: 4, settings: { stepsTarget: 15000 } });
  assert.equal(after.settings.stepsTarget, 15000);
});

test('the definition goal is measured from the latest scan and reports the real pace', () => {
  const goal = definitionGoal(throughSeptember());
  assert.equal(goal.scanDate, '2026-09-25');
  assert.equal(goal.lean, 144);
  assert.equal(goal.goalWeight, 160);
  assert.equal(goal.fatToGoal, 31.6);
  assert.deepEqual(goal.milestones.map(({ bf }) => bf), [15, 12, 10, 9]);
  assert.deepEqual(goal.milestones.map(({ weight }) => weight), [169.4, 163.6, 160, 158.2]);
  assert.equal(goal.next.bf, 15);
  // 45.0 lb on 08-13 to 47.6 lb on 09-25 means body fat went up: off pace.
  assert.equal(goal.pace, 'off');
  assert.ok(goal.fatPerWeek > 0);
});

test('the goal reports on pace once body fat falls fast enough', () => {
  const state = throughSeptember();
  state.bodyScans = [
    ...state.bodyScans,
    { id: 'later', date: '2026-10-23', weight: 187.6, bodyFatPct: 23.2, fatMass: 43.6, leanMass: 144 },
  ];
  const goal = definitionGoal(state);
  assert.equal(goal.pace, 'on');
  assert.ok(goal.fatPerWeek < 0);
});

test('segment data shows the torso holds most of it and both legs sit above range', () => {
  const seg = segmentSummary(throughSeptember());
  assert.equal(seg.date, '2026-09-25');
  const byLabel = Object.fromEntries(seg.rows.map((row) => [row.label, row]));
  assert.equal(byLabel.Torso.share, 59);
  assert.equal(byLabel['Left leg'].over, 1.15);
  assert.equal(byLabel['Right leg'].over, 0.86);
  assert.equal(byLabel.Torso.delta, null);
  assert.equal(segmentSummary({ bodyScans: scansThroughAugust() }), null);
});

test('the 11-13-2026 scan is the latest seed and fat mass moved down from 09-25', () => {
  const goal = definitionGoal(defaultState());
  assert.equal(goal.scanDate, '2026-11-13');
  assert.ok(goal.fatPerWeek < 0);
  const seg = segmentSummary(defaultState());
  assert.equal(seg.date, '2026-11-13');
});

test('v6 upgrade adds the 11-13 scan and the posture warm-up without touching logs or swaps', () => {
  const v5 = migrateState({ version: 4 });
  v5.version = 5;
  v5.bodyScans = v5.bodyScans.filter((sc) => sc.date !== '2026-11-13');
  v5.program.days[1].mobility = [];
  v5.program.days[1].blocks[0].exercises[0].name = 'Barbell Bench Press';
  v5.workoutSessions = { '2026-11-09': { entries: { a: 1 } } };
  const after = migrateState(v5);
  assert.equal(after.version, STATE_VERSION);
  assert.equal(after.bodyScans.filter((sc) => sc.date === '2026-11-13').length, 1);
  assert.equal(after.program.days[1].blocks[0].exercises[0].name, 'Barbell Bench Press');
  assert.deepEqual(after.program.days[1].mobility.map((m) => m.name), ['Half-Kneeling Hip Flexor Stretch', 'Dead Bug', 'Glute Bridge']);
  assert.deepEqual(after.workoutSessions, { '2026-11-09': { entries: { a: 1 } } });
  // Rest and class days do not get the lifting warm-up.
  assert.ok(!after.program.days[6].mobility.some((m) => m.name === 'Glute Bridge'));
  // Running the upgrade again never duplicates the warm-up.
  const again = migrateState({ ...after, version: 5 });
  assert.equal(again.program.days[1].mobility.filter((m) => m.name === 'Dead Bug').length, 1);
});

test('protein target is capped at 210 g even when scan lean mass is water-heavy', () => {
  const t = personalTargets('training', defaultState());
  assert.ok(t.protein <= 210);
});

test('catch-up: a missed weekday session is offered later in the week, leg day first', async () => {
  const { missedSessions } = await import('../src/helpers.js');
  const s = defaultState();
  const logged = (date) => ({ entries: { a: { name: 'X', sets: [{ weight: '100', reps: '8', done: true }] } }, completed: true });
  // Week of Mon 2026-11-16. Monday done, Tuesday (legs) and Wednesday missed.
  s.workoutSessions = { '2026-11-16': logged() };
  const thu = missedSessions('2026-11-19', s);
  assert.deepEqual(thu.map((m) => m.date), ['2026-11-17', '2026-11-18']);
  assert.match(thu[0].title, /Lower/);
  // Saturday is optional, so it becomes a catch-up day; nothing optional is ever "missed".
  const sat = missedSessions('2026-11-21', s);
  assert.ok(sat.every((m) => !['2026-11-21', '2026-11-22'].includes(m.date)));
  assert.equal(sat[0].date, '2026-11-17');
  // Monday starts a fresh week; dismissed and swapped days are not offered.
  assert.deepEqual(missedSessions('2026-11-23', s), []);
  s.missedDismissed = { '2026-11-18': true };
  s.workoutSwaps = { '2026-11-19': '2026-11-17', '2026-11-17': '2026-11-19' };
  assert.deepEqual(missedSessions('2026-11-20', s).map((m) => m.date), []);
  // Once today has its own logged workout, no offer.
  const t = defaultState();
  t.workoutSessions = { '2026-11-19': logged() };
  assert.deepEqual(missedSessions('2026-11-19', t), []);
});

