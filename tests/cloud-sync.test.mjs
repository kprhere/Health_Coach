import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../cloudflare/src/worker.js';
import { canAutoPush, decryptJSON, deriveSync, encryptJSON, pullRemote, pushRemote } from '../src/sync.js';
import {
  defaultState, exerciseMeta, exerciseNames, getBestPerformance, getLastSession,
  duplicateLastSet, loadState, makeSet, mergeSyncedState, migrateState, muscleGroupOf, saveState,
} from '../src/helpers.js';

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

test('Worker rejects a stale device write and preserves the newer encrypted snapshot', async () => {
  const env = memoryEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => worker.fetch(new Request(input, init), env);
  try {
    const { syncId, key } = await deriveSync('concurrency regression passphrase');
    const first = { workoutSessions: { '2026-08-15': workout('2026-08-15', 185) } };
    const stale = { workoutSessions: { '2026-08-14': workout('2026-08-14', 100) } };
    await pushRemote('https://worker.test', syncId, key, first, 0);
    await assert.rejects(
      () => pushRemote('https://worker.test', syncId, key, stale, 0),
      (error) => error.code === 'SYNC_CONFLICT',
    );
    assert.deepEqual((await pullRemote('https://worker.test', syncId, key)).state, first);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('automatic push remains gated until cloud hydration finishes', () => {
  const settings = { syncAuto: true, syncUrl: 'https://worker.test' };
  assert.equal(canAutoPush(settings, 'connecting'), false);
  assert.equal(canAutoPush(settings, 'restoring'), false);
  assert.equal(canAutoPush(settings, 'hydrated'), true);
  assert.equal(canAutoPush(settings, 'synced'), true);
  assert.equal(canAutoPush({ ...settings, syncAuto: false }, 'hydrated'), false);
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
    state.dayOverrides['2026-08-03'] = 'noMoon';
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

test('encrypted backup round-trip includes every permanent health and configuration collection', async () => {
  const env = memoryEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => worker.fetch(new Request(input, init), env);
  try {
    const state = defaultState();
    const date = '2026-08-15';
    state.workoutSessions[date] = workout(date, 185);
    state.mealLogs[date] = { eaten: { 0: true } };
    state.watchLogs[date] = { steps: '10000' };
    state.habitLogs[date] = { protein_hit: true };
    state.beverageLogs[date] = { greenTeaAm: true };
    state.supplementLogs[date] = { creatine: true };
    state.bodyScans.push({ id: 'backup-scan', date, weight: 185 });
    state.activity[date] = { eveningWalk: true, eveningWalkMin: '40' };
    state.workoutSwaps[date] = '2026-08-16';
    state.restartWeights['Bench Press'] = { old: '185', pct: 70 };
    state.customExercises.Custom = { p: 'Chest', custom: true };
    state.exerciseNotes['Bench Press'] = 'Rack pin 8, medium grip';
    state.dayOverrides[date] = 'veg';
    state.profile.name = 'Backup Test';
    state.settings.syncAuto = true;
    const keys = [
      'workoutSessions', 'mealLogs', 'watchLogs', 'habitLogs', 'beverageLogs',
      'supplementLogs', 'bodyScans', 'activity', 'workoutSwaps', 'restartWeights',
      'customExercises', 'exerciseNotes', 'dayOverrides', 'profile', 'settings',
    ];
    const sync = await deriveSync('all-collections-regression-passphrase');
    await pushRemote('https://worker.test', sync.syncId, sync.key, state, 0);
    const restored = (await pullRemote('https://worker.test', sync.syncId, sync.key)).state;
    keys.forEach((keyName) => assert.deepEqual(restored[keyName], state[keyName], `${keyName} survives encrypted cloud backup`));
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

const workout = (date, weight, reps = '8') => ({
  date,
  entries: {
    bench: {
      blockType: 'single', exName: 'Bench Press',
      sets: [{ weight: String(weight), reps: String(reps), rpe: '8', isWarmup: false, isDrop: false }],
    },
  },
});

test('populated cloud workout wins over an empty initialized local session on the same date', () => {
  const local = defaultState();
  const remote = defaultState();
  local.workoutSessions['2026-08-15'] = { date: '2026-08-15', entries: { bench: { blockType: 'single', exName: 'Bench Press', sets: [{ weight: '', reps: '', rpe: '' }] } } };
  remote.workoutSessions['2026-08-15'] = workout('2026-08-15', 185);

  const merged = mergeSyncedState(local, remote);
  assert.equal(merged.workoutSessions['2026-08-15'].entries.bench.sets[0].weight, '185');
});

test('populated local workout wins over an empty cloud session on the same date', () => {
  const local = defaultState();
  const remote = defaultState();
  local.workoutSessions['2026-08-15'] = workout('2026-08-15', 190);
  remote.workoutSessions['2026-08-15'] = { date: '2026-08-15', entries: {} };

  const merged = mergeSyncedState(local, remote);
  assert.equal(merged.workoutSessions['2026-08-15'].entries.bench.sets[0].weight, '190');
});

test('cloud merge retains unrelated workout dates from two devices', () => {
  const local = defaultState();
  const remote = defaultState();
  local.workoutSessions['2026-08-16'] = workout('2026-08-16', 190);
  remote.workoutSessions['2026-08-15'] = workout('2026-08-15', 185);

  const merged = mergeSyncedState(local, remote);
  assert.deepEqual(Object.keys(merged.workoutSessions).sort(), ['2026-08-15', '2026-08-16']);
});

test('same-date populated workout conflicts preserve both distinct sets', () => {
  const local = defaultState();
  const remote = defaultState();
  local.workoutSessions['2026-08-15'] = workout('2026-08-15', 190, '7');
  remote.workoutSessions['2026-08-15'] = workout('2026-08-15', 185, '8');

  const sets = mergeSyncedState(local, remote).workoutSessions['2026-08-15'].entries.bench.sets;
  assert.deepEqual(sets.map((set) => [set.weight, set.reps]), [['190', '7'], ['185', '8']]);
});

test('same-date meal, habit, activity, beverage and supplement logs merge without erasing completions', () => {
  const local = defaultState();
  const remote = defaultState();
  const date = '2026-08-15';
  local.mealLogs[date] = { eaten: { 0: false, 1: true }, choices: { 1: 2 }, extras: [{ label: 'Local fruit' }], water: 2 };
  remote.mealLogs[date] = { eaten: { 0: true }, choices: { 0: 1 }, extras: [{ label: 'Cloud yogurt' }], water: 3 };
  local.habitLogs[date] = { protein_hit: false, workout_done: true };
  remote.habitLogs[date] = { protein_hit: true };
  local.activity[date] = { eveningWalk: true, eveningWalkMin: '40' };
  remote.activity[date] = { swim: true };
  local.beverageLogs[date] = { greenTeaAm: true };
  remote.beverageLogs[date] = { coconutWater: true };
  local.supplementLogs[date] = { creatine: true };
  remote.supplementLogs[date] = { magnesium: true };

  const merged = mergeSyncedState(local, remote);
  assert.deepEqual(merged.mealLogs[date].eaten, { 0: false, 1: true });
  assert.equal(merged.mealLogs[date].extras.length, 2);
  assert.equal(merged.mealLogs[date].water, 3);
  assert.deepEqual(merged.habitLogs[date], { protein_hit: false, workout_done: true });
  assert.deepEqual(merged.activity[date], { swim: true, eveningWalk: true, eveningWalkMin: '40' });
  assert.deepEqual(merged.beverageLogs[date], { coconutWater: true, greenTeaAm: true });
  assert.deepEqual(merged.supplementLogs[date], { magnesium: true, creatine: true });
});

test('state migration is additive, idempotent, and preserves old workout history', () => {
  const old = {
    version: 1,
    workoutSessions: {
      '2026-08-13': workout('2026-08-13', 175, '10'),
      '2026-08-15': workout('2026-08-15', 195, '5'),
    },
  };

  const migrated = migrateState(old);
  const migratedAgain = migrateState(migrated);
  assert.deepEqual(migratedAgain, migrated);
  assert.deepEqual(migrated.workoutSessions, old.workoutSessions);
  assert.ok(migrated.version > old.version);
  assert.equal(migrated.settings.nextBodyScanDate, '2026-08-31');
  assert.equal(migrated.settings.scanFrequencyDays, 14);
});

test('state migration converts every legacy manual fast to the 1 PM no-moon rule', () => {
  const migrated = migrateState({
    version: 2,
    dayOverrides: {
      '2026-08-01': 'fast1',
      '2026-08-02': 'fast2',
      '2026-08-03': 'fast',
      '2026-08-04': 'veg',
    },
  });

  assert.deepEqual(migrated.dayOverrides, {
    '2026-08-01': 'noMoon',
    '2026-08-02': 'noMoon',
    '2026-08-03': 'noMoon',
    '2026-08-04': 'veg',
  });
});

test('PR and previous-session results survive migration and cloud round-trip merge', () => {
  const local = migrateState({
    version: 1,
    workoutSessions: {
      '2026-08-12': workout('2026-08-12', 175, '10'),
      '2026-08-13': workout('2026-08-13', 185, '8'),
      '2026-08-14': workout('2026-08-14', 195, '5'),
    },
  });
  const beforeBest = getBestPerformance('Bench Press', local);
  const beforeLast = getLastSession('Bench Press', local);

  const restored = migrateState(mergeSyncedState(defaultState(), local));
  assert.deepEqual(getBestPerformance('Bench Press', restored), beforeBest);
  assert.deepEqual(getLastSession('Bench Press', restored), beforeLast);
  assert.equal(getBestPerformance('Bench Press', restored).maxWeight, 195);
});

test('copied and independently edited sets survive local save and reload', () => {
  const originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  try {
    const state = defaultState();
    let sets = duplicateLastSet([
      { ...makeSet(), weight: '185', reps: '8', rpe: '8' }, makeSet(), makeSet(),
    ]);
    sets[1] = { ...sets[1], reps: '7', rpe: '8.5' };
    sets = duplicateLastSet(sets);
    sets = duplicateLastSet(sets);
    state.workoutSessions['2026-08-17'] = {
      date: '2026-08-17', entries: { bench: { blockType: 'single', exName: 'Bench Press', sets } },
    };
    saveState(state);
    const restored = loadState();
    assert.deepEqual(restored.workoutSessions['2026-08-17'].entries.bench.sets, sets);
    assert.deepEqual(sets.map((set) => [set.weight, set.reps, set.rpe]), [
      ['185', '8', '8'], ['185', '7', '8.5'], ['185', '7', '8.5'], ['185', '7', '8.5'],
    ]);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});
