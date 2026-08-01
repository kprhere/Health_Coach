import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultState,
  parseHealthParams,
  recoveryScore,
  resolveNutrition,
  resolveWorkout,
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
