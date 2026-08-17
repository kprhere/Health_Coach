// ============================================================
// Protein feasibility
// ------------------------------------------------------------
// The badminton failure was a plan that quietly assumed something that
// never happened. A protein target no plate combination can reach is the
// same class of bug, and it bites hardest during Puratasi, when chicken,
// fish and eggs all disappear at once.
//
// So: for every day type, search the actual meal options the app offers
// and assert that SOME selection of one option per slot reaches the
// protein target without blowing the calorie budget. If a future edit
// makes a day impossible to eat, this fails instead of the user finding
// out from a scan six weeks later.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FOODS, mealPlanFor, personalTargets } from '../src/nutritionEngine.js';
import { nutritionDayType, inPuratasi, observedActivityFactor } from '../src/helpers.js';
import { SEED_SCANS, SETTINGS_DEFAULT, PROFILE_DEFAULT } from '../src/data.js';

const baseState = () => ({
  bodyScans: [...SEED_SCANS],
  settings: { ...SETTINGS_DEFAULT },
  profile: { ...PROFILE_DEFAULT },
  dayOverrides: {},
  mealLogs: {},
  beverageLogs: {},
  activity: {},
});

// Highest protein the day can reach at all, ignoring calories.
function bestProtein(slots) {
  return slots.reduce(
    (acc, s) => {
      if (!s.options.length) return acc;
      const best = s.options.reduce((a, b) => (b.p > a.p ? b : a));
      return { p: acc.p + best.p, kcal: acc.kcal + best.kcal };
    },
    { p: 0, kcal: 0 },
  );
}

// Exhaustively search every combination of one option per slot (optional slots
// may also be skipped) for one that clears the protein target inside the
// calorie budget. Slots offer 2-3 options each, so this is a few hundred
// combinations — cheap, and it answers the real question rather than a greedy
// approximation of it.
function findFeasible(slots, targetP, budgetKcal) {
  let found = null;
  const walk = (i, p, kcal, picks) => {
    if (found) return;
    if (i === slots.length) {
      if (p >= targetP && kcal <= budgetKcal) found = { p, kcal, picks: [...picks] };
      return;
    }
    const s = slots[i];
    if (!s.options.length || s.optional) walk(i + 1, p, kcal, picks);
    for (const o of s.options) {
      if (found) return;
      picks.push(`${s.name}: ${o.short}`);
      walk(i + 1, p + o.p, kcal + o.kcal, picks);
      picks.pop();
    }
  };
  walk(0, 0, 0, []);
  return found;
}

const DAY_TYPES = ['training', 'trainingVeg', 'rest', 'restVeg', 'fastThu', 'noMoonFast', 'vegSat'];

test('every day type can actually reach its protein target', () => {
  const state = baseState();
  for (const dayType of DAY_TYPES) {
    const target = personalTargets(dayType, state);
    const slots = mealPlanFor(dayType, state);
    const best = bestProtein(slots);
    assert.ok(
      best.p >= target.protein,
      `${dayType}: best case reaches only ${best.p} g protein, target is ${target.protein} g`,
    );
  }
});

test('protein target is reachable inside the calorie budget', () => {
  const state = baseState();
  for (const dayType of DAY_TYPES) {
    const target = personalTargets(dayType, state);
    const slots = mealPlanFor(dayType, state);
    // 3% headroom: the targets themselves round to the nearest 10 kcal.
    const budget = Math.round(target.kcal * 1.03);
    const hit = findFeasible(slots, target.protein, budget);
    assert.ok(
      hit,
      `${dayType}: no combination of the offered meals reaches ${target.protein} g protein within ${budget} kcal`,
    );
  }
});

test('the existing whey serving is split around training instead of stacked', () => {
  const state = baseState();
  const training = mealPlanFor('training', state);
  const pre = training.find((slot) => slot.name.startsWith('Pre-workout'));
  const breakfast = training.find((slot) => slot.name === 'Post-workout breakfast');

  assert.deepEqual(pre.options[0].keys, ['whey1']);
  assert.equal(pre.time, '7:00-7:15 AM');
  assert.equal(breakfast.time, '9:00-9:30 AM');
  assert.ok(breakfast.options[0].keys.includes('whey05'));
  assert.equal(pre.options[0].p + FOODS.whey05.p, FOODS.whey15.p);
  assert.equal(pre.options[0].kcal + FOODS.whey05.kcal, FOODS.whey15.kcal);
});

test('lunch portions use cooked gram weights and keep whey as a snack option', () => {
  const state = baseState();
  const training = mealPlanFor('training', state);
  const lunchItems = training.find((slot) => slot.name === 'Lunch').options[0].items;
  const snack = training.find((slot) => slot.name === 'Snack');

  assert.ok(lunchItems.includes('Dal (250 g cooked)'));
  assert.ok(lunchItems.includes('Brown rice (200 g cooked)'));
  assert.ok(lunchItems.includes('Steamed broccoli + carrots (200 g cooked)'));
  assert.ok(snack.options.some((option) => option.keys.includes('whey1')));
  assert.equal(Object.hasOwn(FOODS, 'salad'), false);
});

test('Puratasi keeps calories, deficit and protein identical to a normal day', () => {
  const state = baseState();
  const normalTraining = personalTargets('training', state);
  const vegTraining = personalTargets('trainingVeg', state);
  assert.equal(vegTraining.kcal, normalTraining.kcal, 'Puratasi must not become a calorie cut');
  assert.equal(vegTraining.protein, normalTraining.protein, 'Puratasi must not lower the protein target');
  assert.equal(vegTraining.carbs, normalTraining.carbs);
  assert.equal(vegTraining.fat, normalTraining.fat);

  const normalRest = personalTargets('rest', state);
  const vegRest = personalTargets('restVeg', state);
  assert.equal(vegRest.kcal, normalRest.kcal);
  assert.equal(vegRest.protein, normalRest.protein);
});

test('Puratasi dates switch food but never the workout', () => {
  const state = baseState();
  // 2026-09-21 is a Monday inside the configured Puratasi window.
  const inside = '2026-09-21';
  const outside = '2026-08-17'; // also a Monday, before the window
  assert.equal(inPuratasi(inside, state), true);
  assert.equal(inPuratasi(outside, state), false);
  assert.equal(nutritionDayType(inside, state), 'trainingVeg');
  assert.equal(nutritionDayType(outside, state), 'training');

  // Wednesday inside the window becomes restVeg, Thursday and Saturday are
  // already vegetarian and must be left exactly as they are.
  assert.equal(nutritionDayType('2026-09-23', state), 'restVeg');
  assert.equal(nutritionDayType('2026-09-24', state), 'fastThu');
  assert.equal(nutritionDayType('2026-09-26', state), 'vegSat');
});

test('the flex meal is optional, training-only, and food-rule-aware', () => {
  const state = baseState();
  const flexOf = (dayType) => mealPlanFor(dayType, state).find((s) => s.name.startsWith('Flex meal'));

  assert.ok(flexOf('training'), 'training days should offer a flex meal');
  assert.ok(flexOf('trainingVeg'), 'Puratasi training days should offer a flex meal too');
  assert.equal(flexOf('training').optional, true, 'the flex meal must not silently inflate the core target');
  assert.equal(flexOf('trainingVeg').options.every((o) => o.veg), true, 'trainingVeg flex options must stay vegetarian');

  for (const dayType of ['rest', 'restVeg', 'vegSat', 'fastThu', 'noMoonFast']) {
    assert.equal(flexOf(dayType), undefined, `${dayType} should not offer a flex meal — no extra demand to fuel there`);
  }

  // Skipping it must still leave the core protein target reachable — the whole
  // point is that it is a bonus, not a requirement.
  for (const dayType of ['training', 'trainingVeg']) {
    const target = personalTargets(dayType, state);
    const coreOnly = mealPlanFor(dayType, state).filter((s) => !s.name.startsWith('Flex meal'));
    const hit = findFeasible(coreOnly, target.protein, Math.round(target.kcal * 1.03));
    assert.ok(hit, `${dayType}: protein target must be reachable without ever touching the flex meal`);
  }
});

test('no vegetarian day ever offers meat or eggs', () => {
  const state = baseState();
  for (const dayType of ['trainingVeg', 'restVeg', 'fastThu', 'noMoonFast', 'vegSat']) {
    for (const s of mealPlanFor(dayType, state)) {
      for (const o of s.options) {
        assert.ok(o.veg, `${dayType} / ${s.name} offers a non-vegetarian option: ${o.items.join(', ')}`);
      }
    }
  }
});

// Fill the window between the last two scans with genuinely logged intake, so
// the audit reads real food rather than the plan's own prescription.
function withLoggedIntake(state, kcalPerDay) {
  const mealLogs = {};
  let d = new Date('2026-07-09T00:00:00');
  const end = new Date('2026-08-13T00:00:00');
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    mealLogs[key] = { eaten: {}, choices: {}, water: 0, flags: {}, extras: [{ p: 200, c: 200, f: 60, kcal: kcalPerDay }] };
    d = new Date(d.getTime() + 86400000);
  }
  return { ...state, mealLogs };
}

test('the activity factor is audited against the scan history', () => {
  const state = withLoggedIntake(baseState(), 2264);
  const r = observedActivityFactor(state);
  assert.equal(r.ok, true);
  assert.equal(r.from, '2026-07-08');
  assert.equal(r.to, '2026-08-13');
  assert.equal(r.days, 36);
  assert.equal(r.coverage, 100);
  // 1.5 lb fat + 0.4 lb protein over 36 days is ~166 kcal/day of tissue energy.
  assert.equal(r.fatLb, 1.5);
  assert.equal(r.proteinLb, 0.4);
  assert.equal(r.tissuePerDay, 166);
  assert.equal(r.intake, 2264);
  assert.equal(r.tee, 2430);
  assert.equal(r.factor, Math.round((2430 / 1769) * 1000) / 1000);
});

test('the audit refuses to run on prescribed targets alone', () => {
  // Without logged meals the only intake estimate is the plan's own target,
  // which is derived from activityFactor. Reading that back would make the
  // audit agree with whatever it was told, so it must decline instead.
  const r = observedActivityFactor(baseState());
  assert.equal(r.ok, false);
  assert.equal(r.coverage, 0);
  assert.match(r.reason, /logged meals/);
});

test('the audit flags an overstated activity factor and suggests a real one', () => {
  const state = withLoggedIntake(baseState(), 2264);
  state.settings.activityFactor = 1.9; // wildly optimistic
  const r = observedActivityFactor(state);
  assert.equal(r.drifting, true);
  assert.ok(r.gap > 0, 'a too-high factor should report a positive kcal gap');
  assert.ok(r.suggestion < 1.9);
  assert.ok(r.suggestion > 1.0);
});

test('the audit verdict does not move with the factor it is auditing', () => {
  // The whole point: logged intake is independent of activityFactor, so the
  // measured answer must be identical no matter what the setting claims.
  const a = observedActivityFactor({ ...withLoggedIntake(baseState(), 2264), settings: { ...SETTINGS_DEFAULT, activityFactor: 1.2 } });
  const b = observedActivityFactor({ ...withLoggedIntake(baseState(), 2264), settings: { ...SETTINGS_DEFAULT, activityFactor: 1.9 } });
  assert.equal(a.factor, b.factor);
  assert.equal(a.tee, b.tee);
});

test('the audit stays quiet when the factor matches reality', () => {
  const state = withLoggedIntake(baseState(), 2264);
  const probe = observedActivityFactor(state);
  state.settings.activityFactor = probe.factor;
  const r = observedActivityFactor(state);
  assert.equal(r.drifting, false);
  assert.equal(r.gap, 0);
});

test('the audit refuses to guess from too little data', () => {
  const one = { ...baseState(), bodyScans: [SEED_SCANS[0]] };
  assert.equal(observedActivityFactor(one).ok, false);

  // Two scans only twelve days apart: water noise swamps the signal.
  const close = { ...baseState(), bodyScans: [SEED_SCANS[2], { ...SEED_SCANS[3], date: '2026-07-20' }] };
  const r = observedActivityFactor(close);
  assert.equal(r.ok, false);
  assert.match(r.reason, /21\+/);
});

test('an unset Puratasi window disables the whole feature', () => {
  const state = baseState();
  state.settings.puratasiStartDate = '';
  state.settings.puratasiEndDate = '';
  assert.equal(inPuratasi('2026-09-21', state), false);
  assert.equal(nutritionDayType('2026-09-21', state), 'training');
});
