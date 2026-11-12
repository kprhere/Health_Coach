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

test('Thursday is a fed vegetarian arms, shoulders and abs session', () => {
  const state = defaultState();
  const plan = resolveWorkout(THURSDAY, state);
  assert.equal(plan.title, 'Arms + Shoulders + Abs');
  assert.equal(nutritionDayType(THURSDAY, state), 'trainingVeg');
  assert.equal(fastEndTime(THURSDAY, state), null);
  const names = plan.blocks.flatMap((b) => (b.exercises || []).map((e) => e.name));
  for (const required of ['Close Grip Bench', 'Overhead Tricep Extension', 'Incline DB Curl', 'Hammer Curl', 'Reverse Curl', 'Cable Crunch']) {
    assert.ok(names.includes(required), `${required} should be on Thursday`);
  }
  assert.ok(resolveNutrition(THURSDAY, state).meals.every((meal) => !meal.fasting));
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
  const newWeek = Object.values(PROGRAM.days).reduce((sum, day) => sum + DAY_CAL_MULT[day.dayType], 0);
  assert.ok(Math.abs(newWeek + -oldWeek) <= 0.01, `weekly multiplier moved from ${oldWeek} to ${newWeek}`);
});

test('single-leg work starts on the left and both leg days train the inner thigh', () => {
  for (const dow of [2, 0]) {
    const blocks = PROGRAM.days[dow].blocks;
    const names = blocks.flatMap((b) => (b.exercises || []).map((e) => e.name));
    assert.ok(names.includes('Hip Adduction'), `day ${dow} should include Hip Adduction`);
    const bss = blocks.find((b) => b.name === 'Bulgarian Split Squat');
    assert.match(bss.exercises[0].note, /left/i);
  }
  assert.equal(muscleGroupOf('Hip Adduction', defaultState()), 'Quads');
  assert.equal(muscleGroupOf('Reverse Curl', defaultState()), 'Biceps');
});

const scansThroughAugust = () => SEED_SCANS.filter((sc) => sc.date <= '2026-08-13');
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
  const goal = definitionGoal(defaultState());
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
  const state = defaultState();
  state.bodyScans = [
    ...state.bodyScans,
    { id: 'later', date: '2026-10-23', weight: 187.6, bodyFatPct: 23.2, fatMass: 43.6, leanMass: 144 },
  ];
  const goal = definitionGoal(state);
  assert.equal(goal.pace, 'on');
  assert.ok(goal.fatPerWeek < 0);
});

test('segment data shows the torso holds most of it and both legs sit above range', () => {
  const seg = segmentSummary(defaultState());
  assert.equal(seg.date, '2026-09-25');
  const byLabel = Object.fromEntries(seg.rows.map((row) => [row.label, row]));
  assert.equal(byLabel.Torso.share, 59);
  assert.equal(byLabel['Left leg'].over, 1.15);
  assert.equal(byLabel['Right leg'].over, 0.86);
  assert.equal(byLabel.Torso.delta, null);
  assert.equal(segmentSummary({ bodyScans: scansThroughAugust() }), null);
});
