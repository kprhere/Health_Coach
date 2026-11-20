import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../src/helpers.js';
import { muscleRecovery } from '../src/domain/muscleRecovery.js';

const sess = (n) => ({ entries: { b: { blockType: 'single', exName: 'Barbell Bench Press',
  sets: Array.from({ length: n }, () => ({ weight: '100', reps: '8', rpe: '8', isWarmup: false })) } } });

test('untrained muscles are not-logged, never a fake 100%', () => {
  const r = muscleRecovery(defaultState(), '2026-08-20');
  assert.ok(r.every((m) => m.pct === null && m.status === 'not-logged'));
});

test('recovery rises with days since the last session', () => {
  const s = defaultState();
  s.workoutSessions['2026-08-19'] = { date: '2026-08-19', ...sess(4) };
  const chest = (end) => muscleRecovery(s, end).find((m) => m.muscle === 'Chest');
  assert.equal(chest('2026-08-20').pct, 33);
  assert.equal(chest('2026-08-20').status, 'fatigued');
  assert.equal(chest('2026-08-22').status, 'ready');
});

test('a high-set session needs longer', () => {
  const s = defaultState();
  s.workoutSessions['2026-08-19'] = { date: '2026-08-19', ...sess(10) };
  assert.equal(muscleRecovery(s, '2026-08-22').find((m) => m.muscle === 'Chest').pct, 75);
});
