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
  const alternates = recommendedCustomAlternates('Barbell Bench Press', state);

  assert.ok(fits.some((fit) => fit.exerciseName === 'Barbell Bench Press'));
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

test('replace-with search matches name, muscle and equipment, every word must match', async () => {
  const { searchExercises, suggestedReplacements, defaultState } = await import('../src/helpers.js');
  const state = defaultState();
  assert.deepEqual(searchExercises('hammer row', state), ['Hammer Strength High Row', 'Hammer Strength Row']);
  assert.equal(searchExercises('lat', state)[0], 'Lat Pulldown');
  // Main-muscle matches rank above exercises that only list it as secondary.
  const triceps = searchExercises('triceps', state, 'Close Grip Bench');
  assert.ok(triceps.slice(0, 5).every((n) => !/Bench Press|Arnold/.test(n)));
  assert.deepEqual(searchExercises('zzzz', state), []);
  assert.deepEqual(searchExercises('   ', state), []);
  assert.ok(!searchExercises('close grip', state, 'Close Grip Bench').includes('Close Grip Bench'));
  const swaps = suggestedReplacements('Barbell Bench Press', state);
  assert.equal(swaps[0], 'Dumbbell Bench Press');
  // The EOS note says "Hammer Strength Chest Press"; the library calls it
  // Hammer Strength Bench Press. It is found by search and ranked second.
  assert.equal(swaps[1], 'Hammer Strength Bench Press');
  assert.ok(!swaps.includes('Barbell Bench Press'));
});

test('equipment at this EOS: no Body Builder Standing Press anywhere in the plan, dual low pulley curls available', async () => {
  const { searchExercises, suggestedReplacements, exerciseNames, defaultState, migrateState, STATE_VERSION } = await import('../src/helpers.js');
  const state = defaultState();
  // Never planned, searched, suggested, or offered in the add-exercise list.
  const planned = Object.values(PROGRAM.days).flatMap((day) => (day.blocks || []).flatMap((b) => [b.name, ...(b.exercises || []).map((e) => e.name)]));
  assert.ok(!planned.includes('Body Builder Standing Press'));
  assert.ok(planned.every((name) => !EXERCISES[name] || !EXERCISES[name].retired), 'no retired exercise in the template plan');
  assert.ok(!exerciseNames(state).includes('Body Builder Standing Press'));
  assert.deepEqual(searchExercises('body builder', state), []);
  for (const name of Object.keys(EXERCISES)) assert.ok(!suggestedReplacements(name, state).includes('Body Builder Standing Press'), name);
  // Friday's overhead press is the standing barbell press (plate loader works on it).
  const friday = PROGRAM.days[5].blocks.map((b) => b.name);
  assert.ok(friday.includes('Overhead Press'));
  assert.equal(EXERCISES['Overhead Press'].eq, 'Barbell');
  // Dual low pulley: searchable and offered as a curl swap.
  assert.deepEqual(searchExercises('pulley', state), ['Dual Low Pulley Curl', 'Dual Pulley Bayesian Curl']);
  assert.ok(suggestedReplacements('Cable Curl', state).includes('Dual Low Pulley Curl'));
  assert.ok(suggestedReplacements('Incline DB Curl', state).includes('Dual Pulley Bayesian Curl'));

  // A saved v6 program that still has the machine is upgraded in place;
  // planned sets, reps and rest are kept, and logs are untouched.
  const v6 = migrateState({ version: 4 });
  v6.version = 6;
  const blk = v6.program.days[5].blocks.find((b) => b.name === 'Overhead Press');
  blk.name = 'Body Builder Standing Press';
  blk.exercises[0] = { ...blk.exercises[0], name: 'Body Builder Standing Press', sets: 4, repLow: 6, note: 'Overhead shoulder press' };
  v6.workoutSessions = { '2026-11-13': { entries: { press: { name: 'Body Builder Standing Press', sets: [{ weight: '50', reps: '10' }] } } } };
  const after = migrateState(v6);
  assert.equal(after.version, STATE_VERSION);
  const up = after.program.days[5].blocks.find((b) => b.name === 'Overhead Press');
  assert.ok(up, 'block renamed');
  assert.equal(up.exercises[0].name, 'Overhead Press');
  assert.equal(up.exercises[0].sets, 4);
  assert.equal(up.exercises[0].repLow, 6);
  assert.match(up.exercises[0].note, /barbell/i);
  assert.deepEqual(after.workoutSessions, v6.workoutSessions);
});

test('no Cable Crunch in the plan: loaded days get Weighted Decline Crunch, the light core day gets Reverse Crunch', async () => {
  const { migrateState, STATE_VERSION } = await import('../src/helpers.js');
  const names = (day) => (day.blocks || []).flatMap((b) => (b.exercises || []).map((e) => e.name));
  for (const day of Object.values(PROGRAM.days)) assert.ok(!names(day).includes('Cable Crunch'), day.title);
  assert.ok(names(PROGRAM.days[2]).includes('Weighted Decline Crunch'));
  assert.ok(names(PROGRAM.days[0]).includes('Weighted Decline Crunch'));
  assert.ok(names(PROGRAM.days[3]).includes('Reverse Crunch'));
  for (const n of ['Weighted Decline Crunch', 'Reverse Crunch']) assert.equal(EXERCISES[n].p, 'Abs');

  // A saved v7 program that still has Cable Crunch is upgraded in place.
  const v7 = migrateState({ version: 4 });
  v7.version = 7;
  const put = (dayIdx, from) => v7.program.days[dayIdx].blocks.forEach((b) => (b.exercises || []).forEach((e) => { if (e.name === from) { e.name = 'Cable Crunch'; e.targetReps = '9-11'; } }));
  put(3, 'Reverse Crunch');
  v7.workoutSessions = { '2026-11-17': { entries: { abs: { name: 'Cable Crunch' } } } };
  const after = migrateState(v7);
  assert.equal(after.version, STATE_VERSION);
  for (const day of Object.values(after.program.days)) assert.ok(!names(day).includes('Cable Crunch'), day.title);
  // Wednesday is not replaced by later upgrades, so its planned reps survive.
  const wed = after.program.days[3].blocks.flatMap((b) => b.exercises || []).find((e) => e.name === 'Reverse Crunch');
  assert.equal(wed.targetReps, '9-11', 'planned reps kept');
  assert.deepEqual(after.workoutSessions, v7.workoutSessions);
});

test('plate inventory: the loader only uses the plates this gym has', async () => {
  const { platesOf, plateBreakdown, defaultState } = await import('../src/helpers.js');
  const state = defaultState();
  assert.deepEqual(platesOf(state), [45, 35, 25, 10, 5, 2.5]);
  state.settings.plates = [25, 45, '10', 45, 0, 'x'];
  assert.deepEqual(platesOf(state), [45, 25, 10], 'cleaned, unique, heaviest first');
  // 205 with a 45 bar = 80 a side: 45 + 35 normally, but without 35s it is 45 + 25 + 10.
  const r = plateBreakdown(205, 45, platesOf(state));
  assert.deepEqual(r.plates.map(({ plate, count }) => `${count}x${plate}`), ['1x45', '1x25', '1x10']);
  state.settings.plates = [];
  assert.deepEqual(platesOf(state), [45, 35, 25, 10, 5, 2.5], 'an empty list falls back to standard plates');
});
