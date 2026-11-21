import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM } from '../src/data.js';
import { migrateState, defaultState, clone, loadingKind, exerciseMeta, totalFromOneSide, plateBreakdown } from '../src/helpers.js';

const names = (day) => (day.blocks || []).flatMap((b) => (b.exercises || []).map((e) => e.name));

test('the plan benches with a barbell, so the plate loader adds the bar', () => {
  assert.ok(names(PROGRAM.days[1]).includes('Barbell Bench Press'));
  assert.ok(names(PROGRAM.days[6].fallback).includes('Barbell Bench Press'));
  const all = Object.values(PROGRAM.days).flatMap((d) => [...names(d), ...(d.fallback ? names(d.fallback) : [])]);
  assert.ok(!all.includes('Hammer Strength Bench Press'));
  const kind = loadingKind('Barbell Bench Press', exerciseMeta('Barbell Bench Press', {}).eq);
  assert.equal(kind, 'barbell');
  assert.equal(totalFromOneSide(45, 45).total, 135); // one 45 a side on a 45 bar
  assert.equal(totalFromOneSide(70, 45).total, 185);
  assert.deepEqual(plateBreakdown(135, 45).plates, [{ plate: 45, count: 1 }]);
});

test('a v14 saved plan moves the bench to the barbell, keeping swaps, notes and restart weight', () => {
  const old = clone(defaultState());
  old.version = 14;
  const rename = (day) => day.blocks.forEach((b) => {
    if (b.name === 'Barbell Bench Press') b.name = 'Hammer Strength Bench Press';
    (b.exercises || []).forEach((e) => { if (e.name === 'Barbell Bench Press') e.name = 'Hammer Strength Bench Press'; });
  });
  rename(old.program.days[1]); rename(old.program.days[6].fallback);
  old.program.days[1].blocks[0].sets = 5; // a user edit that must survive
  old.exerciseNotes = { 'Hammer Strength Bench Press': 'Rack on pin 7' };
  old.restartWeights = { 'Hammer Strength Bench Press': { old: '185', pct: 70 } };
  old.workoutSessions = { '2026-11-16': { entries: { b: { exName: 'Hammer Strength Bench Press', sets: [{ weight: '90', reps: '8' }] } } } };

  const after = migrateState(old);
  assert.equal(after.program.days[1].blocks[0].name, 'Barbell Bench Press');
  assert.equal(after.program.days[1].blocks[0].exercises[0].name, 'Barbell Bench Press');
  assert.equal(after.program.days[1].blocks[0].sets, 5);
  assert.ok(names(after.program.days[6].fallback).includes('Barbell Bench Press'));
  assert.equal(after.exerciseNotes['Barbell Bench Press'], 'Rack on pin 7');
  assert.deepEqual(after.restartWeights['Barbell Bench Press'], { old: '185', pct: 70 });
  assert.equal(after.workoutSessions['2026-11-16'].entries.b.exName, 'Hammer Strength Bench Press'); // logs untouched
});

test('a slot the user already swapped to another press keeps that swap', () => {
  const old = clone(defaultState());
  old.version = 14;
  old.program.days[1].blocks[0].name = 'Hammer Strength Bench Press';
  old.program.days[1].blocks[0].exercises[0].name = 'Dumbbell Bench Press';
  const after = migrateState(old);
  assert.equal(after.program.days[1].blocks[0].exercises[0].name, 'Dumbbell Bench Press');
});
