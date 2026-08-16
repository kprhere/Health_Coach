import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../cloudflare/src/worker.js';
import { decryptJSON, deriveSync, encryptJSON, pullRemote, pushRemote } from '../src/sync.js';
import { defaultState, exerciseMeta, exerciseNames, mergeSyncedState, muscleGroupOf } from '../src/helpers.js';

function memoryEnvironment() {
  const values = new Map();
  return {
    ACP_SYNC: {
      async get(key) { return values.get(key) ?? null; },
      async put(key, value) { values.set(key, value); },
    },
  };
}

test('encrypted state round-trips and a wrong passphrase fails', async () => {
  const correct = await deriveSync('correct regression-test passphrase');
  const wrong = await deriveSync('wrong regression-test passphrase');
  const state = { workouts: [{ name: 'Upper B', complete: true }] };
  const first = await encryptJSON(correct.key, state);
  const second = await encryptJSON(correct.key, state);

  assert.notEqual(first, second);
  assert.deepEqual(await decryptJSON(correct.key, first), state);
  await assert.rejects(() => decryptJSON(wrong.key, first));
});

test('client push and pull complete through the Worker contract', async () => {
  const env = memoryEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => worker.fetch(new Request(input, init), env);
  try {
    const { syncId, key } = await deriveSync('end-to-end regression-test passphrase');
    const state = { settings: { units: 'lb' }, logs: { today: ['walk', 'lift'] } };
    const updatedAt = await pushRemote('https://worker.test/', syncId, key, state);
    const pulled = await pullRemote('https://worker.test', syncId, key);
    assert.equal(pulled.updatedAt, updatedAt);
    assert.deepEqual(pulled.state, state);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Worker rejects malformed and oversized payloads', async () => {
  const env = memoryEnvironment();
  const id = 'a'.repeat(40);
  let response = await worker.fetch(new Request(`https://worker.test/sync/${id}`, { method: 'PUT', body: '{' }), env);
  assert.equal(response.status, 400);
  response = await worker.fetch(new Request(`https://worker.test/sync/${id}`, {
    method: 'PUT', body: JSON.stringify({ cipher: 'x'.repeat(2_000_001) }),
  }), env);
  assert.equal(response.status, 413);
});

test('custom machines remain first-class data through encrypted cloud sync', async () => {
  const env = memoryEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => worker.fetch(new Request(input, init), env);
  try {
    const state = defaultState();
    state.customExercises['Gym80 Glute Drive'] = {
      p: 'Glutes', s: 'Hamstrings', eq: 'Plate loaded', use: 'Stable hip extension',
      defaultSets: 4, repLow: 8, repHigh: 12, rpe: 8, restSec: 120, custom: true,
    };
    state.dayOverrides['2026-08-03'] = 'fast2';
    state.workoutSwaps['2026-08-03'] = '2026-08-05';
    state.workoutSwaps['2026-08-05'] = '2026-08-03';
    state.beverageLogs['2026-08-03'] = { greenTeaAm: true, greenTeaPm: true, coconutWater: false };
    assert.ok(exerciseNames(state).includes('Gym80 Glute Drive'));
    assert.equal(exerciseMeta('Gym80 Glute Drive', state).defaultSets, 4);
    assert.equal(muscleGroupOf('Gym80 Glute Drive', state), 'Glutes');

    const { syncId, key } = await deriveSync('custom-machine-regression-passphrase');
    await pushRemote('https://worker.test', syncId, key, state);
    const pulled = await pullRemote('https://worker.test', syncId, key);
    assert.deepEqual(pulled.state.customExercises, state.customExercises);
    assert.deepEqual(pulled.state.dayOverrides, state.dayOverrides);
    assert.deepEqual(pulled.state.workoutSwaps, state.workoutSwaps);
    assert.deepEqual(pulled.state.beverageLogs, state.beverageLogs);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cloud restore adds remote data without deleting local logs', () => {
  const local = defaultState();
  local.settings.syncUrl = 'https://this-device.worker.test';
  local.settings.syncAuto = true;
  local.workoutSessions['2026-08-05'] = { date: '2026-08-05', entries: { local: { sets: [{ weight: '100', reps: '10' }] } } };
  local.watchLogs['2026-08-05'] = { steps: '12000' };
  local.habitLogs['2026-08-05'] = { workout_done: true, no_junk: false };
  local.bodyScans.push({ id: 'local-scan', date: '2026-08-05', weight: 180 });

  const remote = defaultState();
  remote.settings.syncUrl = 'https://other-device.worker.test';
  remote.settings.syncAuto = false;
  remote.workoutSessions['2026-08-04'] = { date: '2026-08-04', entries: { cloud: { sets: [{ weight: '90', reps: '12' }] } } };
  remote.workoutSessions['2026-08-05'] = { date: '2026-08-05', entries: { stale: { sets: [] } } };
  remote.watchLogs['2026-08-05'] = { sleepH: '8', steps: '8000' };
  remote.habitLogs['2026-08-05'] = { protein_hit: true, no_junk: true };
  remote.bodyScans.push({ id: 'cloud-scan', date: '2026-08-04', weight: 181 });

  const merged = mergeSyncedState(local, remote);
  assert.deepEqual(merged.workoutSessions['2026-08-05'], local.workoutSessions['2026-08-05']);
  assert.deepEqual(merged.workoutSessions['2026-08-04'], remote.workoutSessions['2026-08-04']);
  assert.deepEqual(merged.watchLogs['2026-08-05'], { sleepH: '8', steps: '12000' });
  assert.deepEqual(merged.habitLogs['2026-08-05'], { protein_hit: true, no_junk: false, workout_done: true });
  assert.ok(merged.bodyScans.some((scan) => scan.id === 'local-scan'));
  assert.ok(merged.bodyScans.some((scan) => scan.id === 'cloud-scan'));
  assert.equal(merged.settings.syncUrl, local.settings.syncUrl);
  assert.equal(merged.settings.syncAuto, true);
});
