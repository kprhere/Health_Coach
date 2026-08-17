import test from 'node:test';
import assert from 'node:assert/strict';

import { EXERCISES, PROGRAM } from '../src/data.js';
import {
  customExercisePlanFits,
  defaultState,
  duplicateLastSet,
  makeSet,
  recommendedCustomAlternates,
} from '../src/helpers.js';

const set = (patch = {}) => ({ ...makeSet(), ...patch });

test('Copy last fills the next blank planned row instead of appending a blank final row', () => {
  const original = [set({ weight: '185', reps: '8', rpe: '8' }), set(), set()];

  const copied = duplicateLastSet(original);

  assert.equal(copied.length, 3);
  assert.deepEqual(
    copied.map(({ weight, reps, rpe }) => ({ weight, reps, rpe })),
    [
      { weight: '185', reps: '8', rpe: '8' },
      { weight: '185', reps: '8', rpe: '8' },
      { weight: '', reps: '', rpe: '' },
    ],
  );
});

test('Copy last uses the most recent populated set and fills the next blank row', () => {
  const copied = duplicateLastSet([
    set({ weight: '185', reps: '8' }),
    set({ weight: '185', reps: '7' }),
    set(),
  ]);

  assert.equal(copied.length, 3);
  assert.deepEqual(
    { weight: copied[2].weight, reps: copied[2].reps, rpe: copied[2].rpe },
    { weight: '185', reps: '7', rpe: '' },
  );
});

test('Copy last appends only when all later compatible planned rows are populated', () => {
  const copied = duplicateLastSet([
    set({ weight: '185', reps: '8' }),
    set({ weight: '185', reps: '8' }),
    set({ weight: '185', reps: '7' }),
  ]);

  assert.equal(copied.length, 4);
  assert.deepEqual(
    { weight: copied[3].weight, reps: copied[3].reps },
    { weight: '185', reps: '7' },
  );
});

test('Copy last is a no-op when no set has entered performance data', () => {
  const original = [set(), set({ notes: 'Shoulder felt tight' })];
  const copied = duplicateLastSet(original);

  assert.deepEqual(copied, original);
  assert.notStrictEqual(copied, original);
});

test('Copy last accepts partial performance data and does not copy observations', () => {
  const copied = duplicateLastSet([
    set({ weight: '185', reps: '8', restSec: '105', form: 'Breakdown', pain: 3, notes: 'Shoulder hurt' }),
    set(),
  ]);

  assert.deepEqual(
    {
      weight: copied[1].weight, reps: copied[1].reps, rpe: copied[1].rpe,
      restSec: copied[1].restSec, form: copied[1].form, pain: copied[1].pain, notes: copied[1].notes,
    },
    { weight: '185', reps: '8', rpe: '', restSec: '', form: '', pain: 0, notes: '' },
  );
});

test('Copy last never overwrites populated sets or earlier blank gaps', () => {
  const copied = duplicateLastSet([
    set({ weight: '185', reps: '8' }),
    set(),
    set({ weight: '175', reps: '10' }),
  ]);

  assert.equal(copied.length, 4);
  assert.deepEqual(
    copied.map(({ weight, reps }) => ({ weight, reps })),
    [
      { weight: '185', reps: '8' },
      { weight: '', reps: '' },
      { weight: '175', reps: '10' },
      { weight: '175', reps: '10' },
    ],
  );
});

test('Copy last creates independent objects', () => {
  const original = [set({ weight: '100', reps: '10', rpe: '8' })];
  const copied = duplicateLastSet(original);
  copied[1].weight = '105';

  assert.equal(original[0].weight, '100');
  assert.equal(copied[0].weight, '100');
});

test('Copy last respects warm-up and drop-set classifications', () => {
  const warmupAndWork = duplicateLastSet([
    set({ weight: '95', reps: '10', isWarmup: true }),
    set({ weight: '185', reps: '8' }),
    set(),
    set(),
  ]);
  assert.deepEqual(
    { weight: warmupAndWork[2].weight, reps: warmupAndWork[2].reps, isWarmup: warmupAndWork[2].isWarmup },
    { weight: '185', reps: '8', isWarmup: false },
  );

  const dropSets = duplicateLastSet([
    set({ weight: '180', reps: '8' }),
    set({ weight: '140', reps: '10', isDrop: true }),
    set({ isDrop: true }),
  ]);
  assert.deepEqual(
    { weight: dropSets[2].weight, reps: dropSets[2].reps, isDrop: dropSets[2].isDrop },
    { weight: '140', reps: '10', isDrop: true },
  );
  assert.equal(dropSets[0].isDrop, false);
});

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
