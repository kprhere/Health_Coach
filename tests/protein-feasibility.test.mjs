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

import { mealPlanFor, personalTargets } from '../src/nutritionEngine.js';
import { nutritionDayType, inPuratasi } from '../src/helpers.js';
import { SEED_SCANS, SETTINGS_DEFAULT, PROFILE_DEFAULT } from '../src/data.js';

const baseState = () => ({
  bodyScans: [...SEED_SCANS],
  settings: { ...SETTINGS_DEFAULT },
  profile: { ...PROFILE_DEFAULT },
  dayOverrides: {},
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

const DAY_TYPES = ['training', 'trainingVeg', 'rest', 'restVeg', 'fastThu', 'noMoonFast1', 'noMoonFast2', 'vegSat'];

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

test('no vegetarian day ever offers meat or eggs', () => {
  const state = baseState();
  for (const dayType of ['trainingVeg', 'restVeg', 'fastThu', 'noMoonFast1', 'noMoonFast2', 'vegSat']) {
    for (const s of mealPlanFor(dayType, state)) {
      for (const o of s.options) {
        assert.ok(o.veg, `${dayType} / ${s.name} offers a non-vegetarian option: ${o.items.join(', ')}`);
      }
    }
  }
});

test('an unset Puratasi window disables the whole feature', () => {
  const state = baseState();
  state.settings.puratasiStartDate = '';
  state.settings.puratasiEndDate = '';
  assert.equal(inPuratasi('2026-09-21', state), false);
  assert.equal(nutritionDayType('2026-09-21', state), 'training');
});
