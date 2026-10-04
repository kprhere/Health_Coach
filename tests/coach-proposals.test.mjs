import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, resolveWorkout } from '../src/helpers.js';
import { assess } from '../src/coach/metrics.js';
import {
  buildProposal, validateProposal, applyProposal, rejectProposal, keepCurrent, undoProposal, generateProposals,
} from '../src/coach/proposals.js';
import { applyOverrides } from '../src/coach/overrides.js';
import {
  ASOF, NOW_MS, baseState, session, singleEntry, withSessions, work, setWatch,
} from './coach-fixtures.mjs';

const MON = '2026-10-05', WED = '2026-10-07', FRI = '2026-10-09', SAT = '2026-10-10';
const opts = { todayKey: ASOF, nowMs: NOW_MS };

// A state with low sleep (reduce proposal on Mon) plus unrelated data that must survive.
function scenario() {
  const s = baseState();
  for (let i = 0; i < 7; i++) setWatch(s, addDays(ASOF, -i), { sleepH: 5 });
  withSessions(s, [session(addDays(ASOF, -1), [work('Seated Cable Row', 3, 100, 10)])]);
  s.exerciseNotes = { 'Back Squat': 'keep the heels down' };
  s.customExercises = { 'My Machine': { p: 'Chest', eq: 'Machine' } };
  s.restartWeights = { 'Back Squat': { old: '200', pct: 70 } };
  s.mealLogs[ASOF] = { eaten: { b: true }, extras: [], water: 2, flags: {} };
  s.activity[ASOF] = { swim: true };
  return s;
}
const reduceProposal = (s) => {
  const { proposals } = generateProposals(s, ASOF, NOW_MS);
  const p = proposals.find((x) => x.rules.includes('low-recovery'));
  assert.ok(p, 'expected a low-recovery proposal');
  return p;
};
const mkMove = (s, from, to) => buildProposal({
  rule: 'availability', kind: 'move', targetDates: [from, to], evidence: [], confidence: 'high', rationale: 'x',
  changes: [{ op: 'move', from, to }],
}, s, ASOF, NOW_MS);
const mkScale = (s, factor, dates = [MON]) => buildProposal({
  rule: 'test', kind: 'reduce', targetDates: dates, evidence: [], confidence: 'low', rationale: 'x',
  changes: dates.map((date) => ({ op: 'scale-sets', factor, minSets: 1, date })),
}, s, ASOF, NOW_MS);

test('buildProposal is deterministic and carries provenance', () => {
  const s = scenario();
  const a = reduceProposal(s), b = reduceProposal(s);
  assert.equal(a.id, b.id);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.equal(a.status, 'pending');
  assert.equal(a.ruleVersion, 'coach-rules-1');
  assert.equal(a.sourceVersion, assess(s, ASOF).sourceVersion);
  assert.ok(a.id.startsWith(ASOF));
  assert.ok(a.windows.length > 0);
});

test('a valid proposal applies, writes a versioned override and audit, and leaves everything else alone', () => {
  const s = scenario();
  const before = structuredClone(s);
  const p = reduceProposal(s);
  const r = applyProposal(s, p, opts);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.deepEqual(s, before, 'input never mutated');
  const o = r.state.planOverrides[MON];
  assert.equal(o.version, 1);
  assert.equal(o.proposalId, p.id);
  assert.equal(o.baseTitle, 'Full Body A');
  assert.equal(r.state.coach.proposals[p.id].status, 'applied');
  assert.equal(r.state.coach.audit.at(-1).action, 'applied');
  assert.equal(r.state.coach.audit.at(-1).ruleVersion, 'coach-rules-1');
  assert.deepEqual(r.state.coach.settings.mode, 'recommend');
  for (const key of Object.keys(before)) {
    if (['planOverrides', 'coach'].includes(key)) continue;
    assert.deepEqual(r.state[key], before[key], `${key} must be untouched`);
  }
  // the plan actually shrinks for that date only
  const plan = applyOverrides(resolveWorkout(MON, r.state), MON, r.state);
  assert.ok(plan.adjusted);
  assert.equal(applyOverrides(resolveWorkout(WED, r.state), WED, r.state).adjusted, undefined);
});

test('stale proposals are rejected when the logged data changes', () => {
  const s = scenario();
  const p = reduceProposal(s);
  s.workoutSessions[addDays(ASOF, -1)].entries['blk#0'].sets[0].weight = '110';
  assert.ok(validateProposal(p, s, opts).errors.some((e) => /stale/.test(e)));
  // logging after asOf does not stale it
  const s2 = scenario();
  const p2 = reduceProposal(s2);
  setWatch(s2, addDays(ASOF, 1), { sleepH: 8 });
  assert.equal(validateProposal(p2, s2, opts).ok, true);
});

test('duplicates, past dates and protected sessions are rejected', () => {
  const s = scenario();
  const p = reduceProposal(s);
  const dup = structuredClone(s);
  dup.coach = { proposals: { other: { ...p, id: 'other', status: 'pending' } } };
  assert.ok(validateProposal(p, dup, opts).errors.some((e) => /duplicate/.test(e)));

  assert.ok(validateProposal(p, s, { ...opts, todayKey: '2026-10-20' }).errors.some((e) => /past/.test(e)));

  const started = structuredClone(s);
  withSessions(started, [session(MON, [work('Back Squat', 1, 100, 5)])]);
  assert.ok(validateProposal(p, started, opts).errors.some((e) => /started or completed/.test(e)));
  const inProgress = structuredClone(s);
  inProgress.workoutSessions[MON] = { ...session(MON, []), startedAt: 123 };
  assert.ok(validateProposal(p, inProgress, opts).errors.some((e) => /started or completed/.test(e)));
});

test('unknown ops and schema violations are rejected', () => {
  const s = scenario();
  const p = { ...mkScale(s, 0.9), changes: [{ op: 'explode', date: MON }] };
  assert.equal(validateProposal(p, s, opts).ok, false);
  const bad = { ...mkScale(s, 0.9), changes: [{ op: 'scale-sets', factor: 1.2, date: MON }] };
  assert.ok(validateProposal(bad, s, opts).errors.some((e) => /never added/.test(e)));
  const dropMain = { ...mkScale(s, 0.9), changes: [{ op: 'drop-block', blockId: 'fullA#0', date: MON }] };
  assert.ok(validateProposal(dropMain, s, opts).errors.some((e) => /finisher or optional/.test(e)));
  assert.equal(validateProposal(null, s, opts).ok, false);
});

test('reduction caps apply in manual and (lower) in auto mode', () => {
  const s = scenario();
  assert.equal(validateProposal(mkScale(s, 0.5), s, opts).ok, false);
  const mid = mkScale(s, 0.75); // 13 sets -> cut 3 = ~23%
  assert.equal(validateProposal(mid, s, opts).ok, true);
  const auto = validateProposal(mid, s, { ...opts, mode: 'auto' });
  assert.ok(auto.errors.some((e) => /exceeds the 20% limit/.test(e)));
  assert.equal(validateProposal(mkScale(s, 0.9), s, { ...opts, mode: 'auto' }).ok, true);
});

test('auto mode never allows increases or moves', () => {
  const s = scenario();
  const inc = buildProposal({
    rule: 'progression', kind: 'increase', targetDates: [MON], evidence: [], confidence: 'medium', rationale: 'x', requiresAcceptance: true,
    changes: [{ op: 'increase', exercise: 'Barbell Bench Press', deltaWeight: 5 }],
  }, s, ASOF, NOW_MS);
  assert.equal(validateProposal(inc, s, opts).ok, true, 'manual acceptance is fine');
  assert.ok(validateProposal(inc, s, { ...opts, mode: 'auto' }).errors.some((e) => /auto mode/.test(e)));
  const mv = mkMove(s, FRI, SAT);
  assert.equal(validateProposal(mv, s, opts).ok, true);
  assert.ok(validateProposal(mv, s, { ...opts, mode: 'auto' }).errors.some((e) => /auto mode/.test(e)));
});

test('fasting days: a hard session cannot move onto one', () => {
  const s = scenario();
  s.settings.restrictions = { noHardLiftingOnFastDays: true };
  s.dayOverrides = { [SAT]: 'noMoon', '2026-10-06': 'noMoon' };
  const hardToFast = mkMove(s, WED, '2026-10-06');
  assert.ok(validateProposal(hardToFast, s, opts).errors.some((e) => /fasting/.test(e)));
  const softToFast = mkMove(s, FRI, SAT); // Friday is Moderate
  assert.equal(validateProposal(softToFast, s, opts).ok, true);
});

test('moves need both dates free of data and swaps', () => {
  const s = scenario();
  const p = mkMove(s, FRI, SAT);
  const swapped = structuredClone(s);
  swapped.workoutSwaps = { [SAT]: '2026-10-11', '2026-10-11': SAT };
  assert.ok(validateProposal(p, swapped, opts).errors.some((e) => /already has a swap/.test(e)));
  const data = structuredClone(s);
  withSessions(data, [session(SAT, [work('Back Squat', 1, 100, 5)])]);
  assert.equal(validateProposal(p, data, opts).ok, false);
});

test('cooldown and the weekly cap limit stacking of changes', () => {
  const s = scenario();
  const first = applyProposal(s, mkScale(s, 0.9), opts);
  assert.equal(first.ok, true);
  const second = mkScale(first.state, 0.95);
  assert.ok(validateProposal(second, first.state, opts).errors.some((e) => /cooldown/.test(e)));
  const elsewhere = mkScale(first.state, 0.9, [FRI]);
  assert.equal(validateProposal(elsewhere, first.state, opts).ok, true);

  const busy = scenario();
  busy.coach = { proposals: Object.fromEntries([1, 2, 3].map((i) => [`a${i}`, {
    id: `a${i}`, fingerprint: `f${i}`, status: 'applied', appliedAtMs: NOW_MS - i * 86400000, dates: [addDays(ASOF, 30 + i)],
  }])) };
  assert.ok(validateProposal(mkScale(busy, 0.9), busy, opts).errors.some((e) => /rate limit/.test(e)));
});

test('multi-day apply is atomic: one bad date means nothing is written', () => {
  const s = scenario();
  const p = mkScale(s, 0.9, [MON, WED]);
  const bad = structuredClone(s);
  withSessions(bad, [session(WED, [work('Lat Pulldown', 1, 100, 8)])]);
  const r = applyProposal(bad, p, opts);
  assert.equal(r.ok, false);
  assert.equal(r.state, bad);
  assert.equal(bad.planOverrides && bad.planOverrides[MON], undefined);
  const good = applyProposal(s, p, opts);
  assert.deepEqual(Object.keys(good.state.planOverrides).sort(), [MON, WED]);
});

test('applying a move uses workoutSwaps exactly like the manual swap', () => {
  const s = scenario();
  const r = applyProposal(s, mkMove(s, FRI, SAT), opts);
  assert.equal(r.ok, true);
  assert.equal(r.state.workoutSwaps[FRI], SAT);
  assert.equal(r.state.workoutSwaps[SAT], FRI);
  assert.equal(resolveWorkout(SAT, r.state).title, 'Full Body C');
  assert.equal(resolveWorkout(FRI, r.state).blocks.length, 0);
});

test('undo restores overrides and swaps only while sessions are untouched and in the future', () => {
  const s = scenario();
  const a = applyProposal(s, mkScale(s, 0.9), opts);
  const undone = undoProposal(a.state, mkScale(s, 0.9).id, { todayKey: ASOF, nowMs: NOW_MS });
  assert.equal(undone.ok, true);
  assert.equal(undone.state.planOverrides[MON], undefined);
  assert.equal(undone.state.coach.proposals[mkScale(s, 0.9).id].status, 'undone');
  assert.deepEqual(undone.state.coach.audit.map((x) => x.action), ['applied', 'undone']);

  const id = mkScale(s, 0.9).id;
  const touched = structuredClone(a.state);
  withSessions(touched, [session(MON, [work('Back Squat', 1, 100, 5)])]);
  assert.equal(undoProposal(touched, id, { todayKey: ASOF, nowMs: NOW_MS }).ok, false);
  assert.equal(undoProposal(a.state, id, { todayKey: MON, nowMs: NOW_MS }).ok, false, 'date is no longer in the future');

  const m = mkMove(s, FRI, SAT);
  const moved = applyProposal(s, m, opts);
  const back = undoProposal(moved.state, m.id, { todayKey: ASOF, nowMs: NOW_MS });
  assert.equal(back.ok, true);
  assert.deepEqual(back.state.workoutSwaps, {});
});

test('rejecting or keeping the current plan records it and suppresses an immediate repeat', () => {
  const s = scenario();
  const p = reduceProposal(s);
  const r = keepCurrent(s, p, { nowMs: NOW_MS });
  assert.equal(r.ok, true);
  assert.equal(r.state.coach.proposals[p.id].status, 'declined');
  const again = { ...p, id: 'again', status: 'pending' };
  assert.ok(validateProposal(again, r.state, opts).errors.some((e) => /recently declined/.test(e)));
  assert.equal(validateProposal(again, r.state, { ...opts, todayKey: addDays(ASOF, 4) }).errors.some((e) => /recently declined/.test(e)), false);
  const rej = rejectProposal(s, p, { nowMs: NOW_MS });
  assert.equal(rej.state.coach.proposals[p.id].status, 'rejected');
  assert.equal(rejectProposal(r.state, p.id, { nowMs: NOW_MS }).ok, false, 'already resolved');
  // generateProposals does not re-offer something already applied
  const applied = applyProposal(s, p, opts);
  assert.equal(generateProposals(applied.state, ASOF, NOW_MS).proposals.some((x) => x.fingerprint === p.fingerprint), false);
});
