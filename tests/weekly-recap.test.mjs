import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../src/helpers.js';
import { weeklyRecap } from '../src/domain/weeklyRecap.js';

const session = (weight, reps) => ({
  entries: { b: { blockType: 'single', exName: 'Bench Press', sets: [{ weight: String(weight), reps: String(reps), rpe: '8', isWarmup: false }] } },
});

test('recap reports no data as null change, not zero', () => {
  const r = weeklyRecap(defaultState(), '2026-08-20');
  assert.equal(r.hasData, false);
  assert.equal(r.volumeChangePct, null);
  assert.equal(r.prCount, 0);
});

test('recap compares this week with the previous week and counts PRs', () => {
  const s = defaultState();
  s.workoutSessions['2026-08-10'] = { date: '2026-08-10', ...session(100, 10) }; // prior week, 1000
  s.workoutSessions['2026-08-18'] = { date: '2026-08-18', ...session(110, 10) }; // this week, 1100, a PR
  const r = weeklyRecap(s, '2026-08-20');
  assert.equal(r.hasData, true);
  assert.equal(r.current.workouts, 1);
  assert.equal(r.prior.workouts, 1);
  assert.equal(r.volumeChangePct, 10);
  assert.equal(r.prCount, 1);
  assert.equal(r.topPr.name, 'Bench Press');
});

test('only a first-ever lift is a baseline, not a PR', () => {
  const s = defaultState();
  s.workoutSessions['2026-08-18'] = { date: '2026-08-18', ...session(110, 10) };
  assert.equal(weeklyRecap(s, '2026-08-20').prCount, 0);
});
