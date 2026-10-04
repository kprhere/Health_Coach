import test from 'node:test';
import assert from 'node:assert/strict';
import { clone, resolveWorkout } from '../src/helpers.js';
import { PROGRAM, finisher } from '../src/data.js';
import { applyOverrides, overrideSummary, totalSets } from '../src/coach/overrides.js';
import { baseState, session, work, withSessions } from './coach-fixtures.mjs';

const MON = '2026-10-05';
const withOps = (s, ops, date = MON) => {
  s.planOverrides = { [date]: { version: 2, proposalId: 'p1', ops, appliedAtMs: 1, baseTitle: 'Full Body A' } };
  return s;
};
const stateWithFinisher = () => {
  const s = baseState();
  s.program = clone(PROGRAM);
  s.program.days[1].blocks.push(finisher('Burnout', { rounds: 3 }, [{ name: 'Plank', repLow: 0, repHigh: 0 }]));
  return s;
};

test('no override means the plan is returned equal and unflagged', () => {
  const s = baseState();
  const plan = resolveWorkout(MON, s);
  assert.deepEqual(applyOverrides(plan, MON, s), plan);
});

test('drop-block keeps surviving ids and only drops optional blocks', () => {
  const s = withOps(stateWithFinisher(), [
    { op: 'drop-block', blockId: 'fullA#5', date: MON },
    { op: 'drop-block', blockId: 'fullA#0', date: MON },
  ]);
  const base = resolveWorkout(MON, s);
  const out = applyOverrides(base, MON, s);
  assert.deepEqual(out.blocks.map((b) => b.id), ['fullA#0', 'fullA#1', 'fullA#2', 'fullA#3', 'fullA#4']);
  assert.equal(out.adjusted.proposalId, 'p1');
  assert.equal(out.adjusted.version, 2);
  assert.equal(base.blocks.length, 6, 'input plan untouched');
});

test('scale-sets: block-targeted rounds, session-wide never cuts more than the nominal share', () => {
  const s = withOps(baseState(), [{ op: 'scale-sets', blockId: 'fullA#0', factor: 2 / 3, minSets: 1, date: MON }]);
  const out = applyOverrides(resolveWorkout(MON, s), MON, s);
  assert.equal(out.blocks[0].exercises[0].sets, 2);
  assert.equal(out.blocks[1].exercises[0].sets, 3);

  const wide = withOps(baseState(), [{ op: 'scale-sets', factor: 0.8, minSets: 1, date: MON }]);
  const base = resolveWorkout(MON, wide);
  const cut = totalSets(base) - totalSets(applyOverrides(base, MON, wide));
  assert.ok(cut >= 1 && cut <= Math.floor(totalSets(base) * 0.2));

  const floor = withOps(baseState(), [{ op: 'scale-sets', factor: 0.5, minSets: 1, date: MON }]);
  applyOverrides(resolveWorkout(MON, floor), MON, floor).blocks.forEach((b) => assert.ok(b.exercises[0].sets >= 1));
});

test('substitute renames the exercise; recovery-day empties the lift', () => {
  const sub = withOps(baseState(), [{ op: 'substitute', blockId: 'fullA#1', from: 'Barbell Bench Press', to: 'Dumbbell Bench Press', date: MON }]);
  const out = applyOverrides(resolveWorkout(MON, sub), MON, sub);
  assert.equal(out.blocks[1].exercises[0].name, 'Dumbbell Bench Press');
  assert.equal(out.blocks[1].id, 'fullA#1');

  const rec = withOps(baseState(), [{ op: 'recovery-day', date: MON }]);
  const r = applyOverrides(resolveWorkout(MON, rec), MON, rec);
  assert.deepEqual(r.blocks, []);
  assert.deepEqual(r.conditioning, ['20 min easy walk or mobility']);
  assert.ok(overrideSummary(rec.planOverrides[MON]).length === 1);
});

test('a date whose session has data is never altered', () => {
  const s = withOps(baseState(), [{ op: 'recovery-day', date: MON }]);
  withSessions(s, [session(MON, [work('Back Squat', 1, 100, 5)])]);
  const plan = resolveWorkout(MON, s);
  const out = applyOverrides(plan, MON, s);
  assert.equal(out.adjustedBlocked, true);
  assert.deepEqual(out.blocks, plan.blocks);
  assert.equal(out.adjusted, undefined);
});
