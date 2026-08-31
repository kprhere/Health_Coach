import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultState, exerciseProgressSeries, recentPersonalRecords, trainingActivity, trainingConsistency,
} from '../src/helpers.js';

const workout = (date, weight, reps) => ({
  date,
  entries: {
    bench: {
      blockType: 'single', exName: 'Bench Press',
      sets: [{ weight: String(weight), reps: String(reps), rpe: '8', isWarmup: false }],
    },
  },
});

test('exercise progression summarizes each session without mixing exercises', () => {
  const state = defaultState();
  state.workoutSessions['2026-08-01'] = workout('2026-08-01', 100, 10);
  state.workoutSessions['2026-08-08'] = workout('2026-08-08', 110, 8);

  assert.deepEqual(exerciseProgressSeries('Bench Press', state).map((point) => ({
    date: point.date, weight: point.weight, volume: point.volume,
  })), [
    { date: '2026-08-01', weight: 100, volume: 1000 },
    { date: '2026-08-08', weight: 110, volume: 880 },
  ]);
});

test('personal records exclude the baseline and include later strength improvements', () => {
  const state = defaultState();
  state.workoutSessions['2026-08-01'] = workout('2026-08-01', 100, 8);
  state.workoutSessions['2026-08-08'] = workout('2026-08-08', 105, 8);
  state.workoutSessions['2026-08-15'] = workout('2026-08-15', 100, 8);

  const prs = recentPersonalRecords(state);
  assert.equal(prs.length, 1);
  assert.equal(prs[0].date, '2026-08-08');
  assert.equal(prs[0].name, 'Bench Press');
  assert.ok(prs[0].improvementPct > 0);
});

test('personal records keep only the best improvement from one exercise session', () => {
  const state = defaultState();
  state.workoutSessions['2026-08-01'] = workout('2026-08-01', 100, 8);
  state.workoutSessions['2026-08-08'] = workout('2026-08-08', 105, 8);
  state.workoutSessions['2026-08-08'].entries.bench.sets.push({ weight: '110', reps: '8', isWarmup: false });

  const prs = recentPersonalRecords(state);
  assert.equal(prs.length, 1);
  assert.equal(prs[0].weight, 110);
});

test('activity and consistency count only dates with logged working sets', () => {
  const state = defaultState();
  state.workoutSessions['2026-08-28'] = workout('2026-08-28', 100, 8);
  state.workoutSessions['2026-08-30'] = workout('2026-08-30', 105, 8);

  const activity = trainingActivity(state, 4, '2026-08-31');
  assert.deepEqual(activity.map((day) => day.sets), [1, 0, 1, 0]);
  assert.deepEqual(trainingConsistency(state, 4, '2026-08-31'), {
    workouts: 2, sets: 2, volume: 1640, streak: 0,
  });
});
