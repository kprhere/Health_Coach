import test from 'node:test';
import assert from 'node:assert/strict';
import { HABITS, NUTRITION } from '../src/data.js';
import { FOODS, mealPlanFor } from '../src/nutritionEngine.js';

import {
  defaultState,
  dayFlags,
  fastEndTime,
  isNoMoonDay,
  nextNoMoonReminder,
  nutritionDayType,
  nutritionActuals,
  parseHealthParams,
  plannedWalkingMinutes,
  progressWindowSummary,
  postScanCoaching,
  recoveryScore,
  resolveNutrition,
  resolveWorkout,
  workoutSessionHasData,
  workoutSwapPartner,
  addDays,
  initSession,
} from '../src/helpers.js';

const eightValues = 'date=2026-07-31&steps=9412&sleep=7.3&rhr=58&hrv=64&sleepScore=88&vo2max=44&spo2=98&active=540';

test('parses the privacy-safe Health fragment and legacy query format', () => {
  const fragment = parseHealthParams(`#health?${eightValues}`);
  const query = parseHealthParams(`?${eightValues}`);

  assert.deepEqual(fragment, query);
  assert.equal(fragment.count, 8);
  assert.equal(fragment.date, '2026-07-31');
  assert.deepEqual(fragment.patch, {
    steps: '9412', activeCal: '540', restingHR: '58', sleepH: '7.3',
    sleepScore: '88', hrv: '64', vo2max: '44', spo2: '98',
  });
});

test('a completed 40-minute evening walk satisfies but does not double-count the scheduled walk', () => {
  const state = defaultState();
  const date = '2026-08-17';
  const target = plannedWalkingMinutes(date, state);
  assert.equal(target, 20);
  state.activity[date] = { eveningWalk: true, eveningWalkMin: '40', eveningWalkHR: '108' };
  state.watchLogs[date] = { exerciseMin: '25', steps: '9000', sleepH: '7.5' };

  assert.equal(progressWindowSummary(state, date).walkingMinutes, 40);
  assert.equal(progressWindowSummary(state, date).strengthWorkouts, 0);
});

const scanState = (currentPatch = {}, tracked = true) => {
  const state = defaultState();
  state.bodyScans = [
    { id: 'before', date: '2026-08-01', weight: 190, fatMass: 45, leanMass: 145, bodyFatPct: 23.7 },
    { id: 'after', date: '2026-08-11', weight: 188, fatMass: 43, leanMass: 145, bodyFatPct: 22.9, ...currentPatch },
  ];
  if (tracked) {
    for (let i = 1; i <= 10; i++) state.activity[addDays('2026-08-01', i)] = { eveningWalk: true, eveningWalkMin: '40' };
  }
  return state;
};

test('post-scan coaching covers keep-plan, muscle-warning and insufficient-data outcomes', () => {
  assert.equal(postScanCoaching(scanState()).code, 'keep');
  assert.equal(postScanCoaching(scanState({ leanMass: 141 })).code, 'warning');
  assert.equal(postScanCoaching(scanState({}, false)).code, 'insufficient');
});

test('post-scan coaching requests calibration after strong adherence without fat loss', () => {
  const state = scanState({ weight: 190, fatMass: 45, leanMass: 145 });
  for (let i = 1; i <= 10; i++) {
    const date = addDays('2026-08-01', i);
    const nutrition = resolveNutrition(date, state).targets;
    state.mealLogs[date] = { eaten: {}, extras: [{ p: nutrition.protein, c: nutrition.carbs, f: nutrition.fat, kcal: nutrition.kcal }], water: nutrition.waterL, flags: {}, choices: {} };
    state.watchLogs[date] = { steps: '10000', sleepH: '8', restingHR: '58' };
    state.habitLogs[date] = Object.fromEntries(HABITS.map((habit) => [habit.key, true]));
    const plan = resolveWorkout(date, state);
    if (plan.blocks.length) {
      const session = initSession(plan);
      Object.values(session.entries).forEach((entry) => { entry.completed = true; });
      state.workoutSessions[date] = session;
    }
  }
  const result = postScanCoaching(state);
  assert.ok(result.adherencePct >= 80);
  assert.equal(result.code, 'calibrate');
});

test('rejects lists, unit text, unresolved placeholders, ranges, and invalid dates', () => {
  const result = parseHealthParams('#health?date=2026-99-99&steps=9412%20steps&sleep=7.3,8.1&rhr=[Resting%20HR]&hrv=5000&sleepScore=88');

  assert.equal(result.count, 1);
  assert.equal(result.patch.sleepScore, '88');
  assert.notEqual(result.date, '2026-99-99');
});

test('counts aliases once and keeps the canonical value', () => {
  const result = parseHealthParams('#health?active=540&activeCal=600&rhr=58&restingHR=60');

  assert.equal(result.count, 2);
  assert.deepEqual(result.patch, { activeCal: '540', restingHR: '58' });
});

test('the documented sample produces 99 percent recovery', () => {
  const parsed = parseHealthParams(`#health?${eightValues}`);
  const state = defaultState();
  state.watchLogs[parsed.date] = parsed.patch;

  assert.deepEqual(recoveryScore(parsed.date, state), { pct: 99, sleep: 7.3, maxPain: 0, rhr: 58 });
});

test('every weekly day resolves a workout and positive nutrition targets', () => {
  const state = defaultState();
  for (let day = 8; day <= 14; day += 1) {
    const date = `2026-07-${String(day).padStart(2, '0')}`;
    const workout = resolveWorkout(date, state);
    const nutrition = resolveNutrition(date, state);
    assert.ok(Array.isArray(workout.blocks));
    assert.ok(nutrition.targets.kcal > 0);
    assert.ok(nutrition.targets.protein > 0);
  }
});

test('egg whites can be logged in the requested 3 or 4 white portions', () => {
  const byLabel = Object.fromEntries(NUTRITION.quickAdds.map((food) => [food.label, food]));
  assert.deepEqual(byLabel['3 egg whites'], { label: '3 egg whites', p: 11, c: 1, f: 0, kcal: 51, meat: false, egg: true });
  assert.deepEqual(byLabel['4 egg whites'], { label: '4 egg whites', p: 14, c: 1, f: 0, kcal: 68, meat: false, egg: true });
});

test('planned chicken meals trade chicken quantity for egg whites instead of stacking protein', () => {
  assert.deepEqual(
    { p: FOODS.chickenEgg.p, c: FOODS.chickenEgg.c, f: FOODS.chickenEgg.f, kcal: FOODS.chickenEgg.kcal },
    { p: 46, c: 1, f: 4, kcal: 243 },
  );
  const meals = mealPlanFor('training', defaultState());
  for (const name of ['Lunch', 'Dinner']) {
    const meal = meals.find((item) => item.name === name);
    assert.ok(meal.options[0].keys.includes('chickenEgg'));
    assert.ok(meal.options[0].items[0].includes('105 g chicken + 4 egg whites'));
  }
});

test('any date can override its nutrition plan to vegetarian or a 1 PM no-moon fast without changing the workout', () => {
  const date = '2026-08-03';
  const state = defaultState();
  const scheduledWorkout = resolveWorkout(date, state);

  state.dayOverrides[date] = 'veg';
  assert.equal(nutritionDayType(date, state), 'vegSat');
  assert.deepEqual(dayFlags(date, state), { dow: 1, swimDay: false, fastDay: false, vegDay: true, badmintonAvailable: true, classDay: false });
  const vegetarian = resolveNutrition(date, state);
  assert.ok(vegetarian.meals.flatMap((meal) => meal.options).every((option) => option.veg));
  assert.ok(vegetarian.meals.flatMap((meal) => meal.options).flatMap((option) => option.items).every((item) => !/egg/i.test(item)));
  assert.deepEqual(resolveWorkout(date, state), scheduledWorkout);

  state.dayOverrides[date] = 'noMoon';
  assert.equal(nutritionDayType(date, state), 'noMoonFast');
  assert.equal(dayFlags(date, state).fastDay, true);
  assert.deepEqual(fastEndTime(date, state), { hour: 13, label: '1 PM', noMoon: true });
  assert.equal(resolveNutrition(date, state).meals[0].fasting, true);
  assert.ok(resolveNutrition(date, state).meals.flatMap((meal) => meal.options).every((option) => option.veg));
  assert.ok(resolveNutrition(date, state).meals.flatMap((meal) => meal.options).flatMap((option) => option.items).every((item) => !/egg/i.test(item)));
  assert.deepEqual(resolveWorkout(date, state), scheduledWorkout);

  delete state.dayOverrides[date];
  assert.equal(nutritionDayType(date, state), scheduledWorkout.dayType);

  const scheduledThursday = '2026-08-06';
  assert.equal(nutritionDayType(scheduledThursday, state), 'fastThu');
  assert.deepEqual(fastEndTime(scheduledThursday, state), { hour: 18, label: '6 PM', noMoon: false });
  assert.ok(resolveNutrition(scheduledThursday, state).meals.flatMap((meal) => meal.options).flatMap((option) => option.items).every((item) => !/egg/i.test(item)));
});

test('Chicago Panchang no-moon days activate automatically and remind one week before', () => {
  const state = defaultState();
  const noMoonDate = '2026-09-10';

  assert.equal(isNoMoonDay(noMoonDate), true);
  assert.equal(nutritionDayType(noMoonDate, state), 'noMoonFast');
  assert.deepEqual(fastEndTime(noMoonDate, state), { hour: 13, label: '1 PM', noMoon: true });
  assert.deepEqual(nextNoMoonReminder('2026-09-03'), { date: noMoonDate, daysAway: 7 });
  assert.deepEqual(nextNoMoonReminder('2026-09-10'), { date: noMoonDate, daysAway: 0 });
  assert.equal(nextNoMoonReminder('2026-09-02'), null);
  assert.equal(nextNoMoonReminder('2026-09-03', noMoonDate), null);
  assert.deepEqual(nextNoMoonReminder('2026-12-31'), { date: '2027-01-07', daysAway: 7 });
});

test('workout dates swap in both directions without moving their nutrition plans', () => {
  const monday = '2026-08-03';
  const wednesday = '2026-08-05';
  const state = defaultState();
  const mondayWorkout = resolveWorkout(monday, state);
  const wednesdayWorkout = resolveWorkout(wednesday, state);
  const mondayNutrition = resolveNutrition(monday, state);
  const wednesdayNutrition = resolveNutrition(wednesday, state);

  state.workoutSwaps[monday] = wednesday;
  state.workoutSwaps[wednesday] = monday;

  assert.equal(workoutSwapPartner(monday, state), wednesday);
  assert.equal(workoutSwapPartner(wednesday, state), monday);
  assert.equal(resolveWorkout(monday, state).title, wednesdayWorkout.title);
  assert.equal(resolveWorkout(monday, state).sourceDate, wednesday);
  assert.equal(resolveWorkout(wednesday, state).title, mondayWorkout.title);
  assert.deepEqual(resolveNutrition(monday, state), mondayNutrition);
  assert.deepEqual(resolveNutrition(wednesday, state), wednesdayNutrition);
});

test('workout swaps distinguish untouched generated rows from logged training data', () => {
  const empty = {
    completed: false,
    notes: '',
    entries: { planned: { sets: [{ weight: '', reps: '', rpe: '', pain: 0, notes: '' }] } },
  };
  assert.equal(workoutSessionHasData(empty), false);

  const logged = structuredClone(empty);
  logged.entries.planned.sets[0].weight = '90';
  assert.equal(workoutSessionHasData(logged), true);

  const customized = structuredClone(empty);
  customized.entries.extra = { unplanned: true, sets: [] };
  assert.equal(workoutSessionHasData(customized), true);
});

test('daily green tea is zero-calorie tracking and coconut water counts toward macros and hydration', () => {
  const date = '2026-08-03';
  const state = defaultState();
  state.mealLogs[date] = { eaten: {}, extras: [], water: 1, flags: {}, choices: {} };
  state.beverageLogs[date] = { greenTeaAm: true, greenTeaPm: true, coconutWater: true };
  const actual = nutritionActuals(date, state);
  assert.equal(actual.kcal, 45);
  assert.equal(actual.carbs, 10.5);
  assert.equal(actual.protein, 0.5);
  assert.equal(actual.water, 1.25);

  state.beverageLogs[date].coconutWater = false;
  const teaOnly = nutritionActuals(date, state);
  assert.deepEqual(
    { kcal: teaOnly.kcal, carbs: teaOnly.carbs, protein: teaOnly.protein, water: teaOnly.water },
    { kcal: 0, carbs: 0, protein: 0, water: 1 },
  );
});
