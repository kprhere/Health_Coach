import test from 'node:test';
import assert from 'node:assert/strict';
import { loggedSpanDays, setsByMuscleWindow, allSetRecords, muscleGroupsOf, muscleGroupOf } from '../src/helpers.js';
import { EXERCISES } from '../src/data.js';

const day = '2026-11-21';
const state = {
  workoutSessions: {
    [day]: {
      entries: {
        core: {
          blockType: 'circuit',
          rounds: [{
            done: true,
            byExercise: {
              'Reverse Crunch': { weight: '', reps: '15', rpe: '' },
              'Pallof Press': { weight: '', reps: '10', rpe: '' },
              'Dead Bug': { weight: '', reps: '20', rpe: '' },
              Plank: { weight: '', reps: '', seconds: '60', rpe: '' },
            },
          }, { byExercise: { 'Reverse Crunch': { weight: '', reps: '' } } }],
        },
        bench: { exName: 'Barbell Bench Press', sets: [{ weight: '135', reps: '8' }, { weight: '95', reps: '10', isWarmup: true }] },
        plank: { exName: 'Plank', sets: [{ weight: '', reps: '', seconds: '45' }] },
      },
    },
  },
};

test('bodyweight and timed core work counts toward weekly sets', () => {
  const sets = setsByMuscleWindow(state, 7, day);
  assert.equal(sets.Core, 5); // 4 circuit cells + 1 straight plank set, empty round ignored
  assert.equal(sets.Chest, 1); // warm-up excluded
});

test('tonnage records still require a load', () => {
  assert.equal(allSetRecords(state).length, 1);
});

test('compound lifts credit every primary muscle they list', () => {
  assert.deepEqual(muscleGroupsOf('Back Squat', {}), ['Quads', 'Glutes']);
  assert.deepEqual(muscleGroupsOf('Romanian Deadlift', {}), ['Hamstrings', 'Glutes']);
  assert.deepEqual(muscleGroupsOf('Deadlift', {}), ['Back', 'Hamstrings']);
  assert.deepEqual(muscleGroupsOf('Hammer Curl', {}), ['Biceps', 'Forearms']);
  assert.deepEqual(muscleGroupsOf('Reverse Curl', {}), ['Biceps', 'Forearms']);
  assert.equal(muscleGroupOf('Reverse Curl', {}), 'Biceps');
  assert.equal(muscleGroupOf('Back Squat', {}), 'Quads'); // tonnage keeps one group
  const sets = setsByMuscleWindow({ workoutSessions: { [day]: { entries: { sq: { exName: 'Back Squat', sets: [{ weight: '185', reps: '6' }] } } } } }, 7, day);
  assert.deepEqual(sets, { Quads: 1, Glutes: 1 });
});

test('every library exercise outside mobility maps to a real muscle group', () => {
  const untagged = Object.keys(EXERCISES).filter((n) => EXERCISES[n].p !== 'Mobility' && muscleGroupsOf(n, {}).includes('Other'));
  assert.deepEqual(untagged, []);
});

test('logged span starts at the first set in the window, at least a week', () => {
  assert.equal(loggedSpanDays(state, 30, day), 7); // one day of logs
  const two = { workoutSessions: { ...state.workoutSessions, '2026-11-02': { entries: { p: { exName: 'Plank', sets: [{ seconds: '30' }] } } } } };
  assert.equal(loggedSpanDays(two, 30, day), 20);
  assert.equal(loggedSpanDays({}, 30, day), 7);
});
