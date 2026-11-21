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

import { barlessBenchSessions, applyBenchBarFix, undoBenchBarFix, benchBarFixedCount, allSetRecords, getNextTarget } from '../src/helpers.js';

const benchLogs = () => ({
  workoutSessions: {
    '2026-11-16': { entries: {
      b: { exName: 'Hammer Strength Bench Press', sets: [{ weight: '50', reps: '10', isWarmup: true }, { weight: '90', reps: '8' }, { weight: '90', reps: '7' }, { weight: '', reps: '' }] },
      r: { exName: 'Hammer Strength High Row', sets: [{ weight: '90', reps: '10' }] },
    } },
    '2026-11-18': { entries: { s: { exName: 'Dumbbell Bench Press', replacedWith: 'Hammer Strength Bench Press', sets: [{ weight: '67.5', reps: '6' }] } } },
    '2026-11-20': { entries: { k: { exName: 'Hammer Strength Bench Press', sets: [{ weight: '', reps: '' }] } } }, // planned, nothing logged
  },
});

test('finds only bench entries with logged weights, oldest first', () => {
  const found = barlessBenchSessions(benchLogs());
  assert.deepEqual(found.map((f) => `${f.date}/${f.id}`), ['2026-11-16/b', '2026-11-18/s']);
  assert.deepEqual(found[0].sets.map((x) => [x.before, x.after]), [[50, 95], [90, 135], [90, 135]]);
});

test('apply adds the bar, renames to the barbell, leaves other lifts alone', () => {
  const st = benchLogs();
  assert.equal(applyBenchBarFix(st, 45), 2);
  const b = st.workoutSessions['2026-11-16'].entries.b;
  assert.deepEqual(b.sets.map((x) => x.weight), ['95', '135', '135', '']);
  assert.equal(b.exName, 'Barbell Bench Press');
  assert.equal(st.workoutSessions['2026-11-16'].entries.r.sets[0].weight, '90');
  const s = st.workoutSessions['2026-11-18'].entries.s;
  assert.equal(s.exName, 'Dumbbell Bench Press');
  assert.equal(s.replacedWith, 'Barbell Bench Press');
  assert.equal(s.sets[0].weight, '112.5');
  assert.equal(st.workoutSessions['2026-11-20'].entries.k.exName, 'Hammer Strength Bench Press');
  assert.equal(benchBarFixedCount(st), 2);
  assert.deepEqual(barlessBenchSessions(st), []);
  assert.equal(applyBenchBarFix(st, 45), 0); // never adds the bar twice
  const recs = allSetRecords(st).filter((r) => r.name === 'Barbell Bench Press');
  assert.deepEqual(recs.map((r) => r.weight), [135, 135, 112.5]);
  assert.match(getNextTarget('Barbell Bench Press', st, { repLow: 6, repHigh: 8, rpe: 7 }).text, /^135 lb|^112\.5 lb/);
});

test('undo restores the original entries exactly', () => {
  const st = benchLogs();
  const before = JSON.stringify(st);
  applyBenchBarFix(st, 45);
  assert.equal(undoBenchBarFix(st), 2);
  assert.equal(JSON.stringify(st), before);
});

test('a custom bar weight is used, and a bad one changes nothing', () => {
  const st = benchLogs();
  assert.equal(applyBenchBarFix(st, 0), 0);
  assert.equal(applyBenchBarFix(st, 'x'), 0);
  applyBenchBarFix(st, 35);
  assert.equal(st.workoutSessions['2026-11-16'].entries.b.sets[1].weight, '125');
});
