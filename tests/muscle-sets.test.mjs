import test from 'node:test';
import assert from 'node:assert/strict';
import { setsByMuscleWindow, allSetRecords } from '../src/helpers.js';

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
