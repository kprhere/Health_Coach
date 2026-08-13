import test from 'node:test';
import assert from 'node:assert/strict';

import { EXERCISES, PROGRAM } from '../src/data.js';
import {
  customExercisePlanFits,
  defaultState,
  duplicateLastSet,
  recommendedCustomAlternates,
} from '../src/helpers.js';

test('Copy last appends a second set when only one set exists', () => {
  const original = [{
    weight: '135', reps: '10', rpe: '8', restSec: '', form: '', pain: 0,
    notes: '', isDrop: false, isWarmup: false,
  }];

  const copied = duplicateLastSet(original);

  assert.equal(original.length, 1, 'the existing set array is not mutated');
  assert.equal(copied.length, 2);
  assert.deepEqual(
    { weight: copied[1].weight, reps: copied[1].reps, rpe: copied[1].rpe },
    { weight: '135', reps: '10', rpe: '8' },
  );
});

test('custom chest equipment is automatically recommended for matching plan slots', () => {
  const state = defaultState();
  const name = 'Hammer Strength Iso-Lateral Decline Chest Press';
  state.customExercises[name] = {
    p: 'Chest',
    s: 'Triceps, Front Delts',
    eq: 'Hammer Strength plate loaded machine',
    use: 'Decline chest pressing',
    sub: 'Hammer Strength Bench Press',
    cue: 'Keep shoulder blades set',
    err: 'Losing chest position',
    defaultSets: 3,
    repLow: 8,
    repHigh: 12,
    rpe: 8,
    restSec: 90,
    tempo: '2-1-1',
    custom: true,
  };

  const fits = customExercisePlanFits(name, state);
  const alternates = recommendedCustomAlternates('Hammer Strength Bench Press', state);

  assert.ok(fits.some((fit) => fit.exerciseName === 'Hammer Strength Bench Press'));
  assert.equal(alternates[0].name, name);
  assert.deepEqual(recommendedCustomAlternates('Back Squat', state), []);
});

test('Chest-Assisted Dip is a chest machine movement in the current Upper B plan', () => {
  assert.deepEqual(
    { primary: EXERCISES['Chest-Assisted Dip'].p, equipment: EXERCISES['Chest-Assisted Dip'].eq },
    { primary: 'Chest', equipment: 'Assisted Dip Machine' },
  );

  const upperBExercises = PROGRAM.days[5].blocks.flatMap((block) => block.exercises.map((exercise) => exercise.name));
  assert.ok(upperBExercises.includes('Chest-Assisted Dip'));
  assert.ok(!upperBExercises.includes('Arsenal Laying Pec Fly'), 'the dip replaces chest volume instead of adding more sets');
});
