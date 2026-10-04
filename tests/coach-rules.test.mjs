import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, clone } from '../src/helpers.js';
import { PROGRAM, finisher } from '../src/data.js';
import { assess } from '../src/coach/metrics.js';
import { evaluate } from '../src/coach/rules.js';
import {
  ASOF, baseState, session, singleEntry, withSessions, work, setWatch, steadyHistory,
} from './coach-fixtures.mjs';

const run = (s) => evaluate(assess(s, ASOF), s, ASOF);
const byRule = (list, rule) => list.filter((f) => f.rule === rule);

function lowSleep(s, { rhr = false, hours = 5 } = {}) {
  for (let i = 0; i < 7; i++) setWatch(s, addDays(ASOF, -i), { sleepH: hours });
  if (rhr) {
    for (let i = 3; i <= 20; i++) setWatch(s, addDays(ASOF, -i), { restingHR: 55 });
    for (let i = 0; i < 3; i++) setWatch(s, addDays(ASOF, -i), { restingHR: 66 });
  }
  return s;
}

test('pain-block fires on repeated pain, holds progression, and never diagnoses', () => {
  const s = withSessions(baseState(), [
    session(addDays(ASOF, -2), [singleEntry('Back Squat', [{ weight: 100, reps: 5, pain: 3 }])]),
    session(addDays(ASOF, -5), [singleEntry('Back Squat', [{ weight: 100, reps: 5, pain: 4 }])]),
  ]);
  const [f] = byRule(run(s), 'pain-block');
  assert.ok(f);
  assert.ok(['substitute', 'reduce'].includes(f.kind));
  assert.deepEqual(f.blocksProgression, ['Back Squat']);
  assert.match(f.rationale, /consider evaluation by a qualified clinician/);
  assert.equal(f.note, 'persistent or concerning pain: consider evaluation by a qualified clinician');
  assert.doesNotMatch(f.rationale, /diagnos|injur|tendin|tear|strain|rupture/i);
  assert.ok(f.changes.every((c) => c.date >= ASOF));
});

test('a single painful exposure does not trigger pain-block', () => {
  const s = withSessions(baseState(), [session(addDays(ASOF, -2), [singleEntry('Back Squat', [{ weight: 100, reps: 5, pain: 4 }])])]);
  assert.equal(byRule(run(s), 'pain-block').length, 0);
});

test('pain on an exercise blocks its progression proposal', () => {
  const s = baseState();
  withSessions(s, [
    session('2026-09-28', [singleEntry('Barbell Bench Press', [{ weight: 135, reps: 8, rpe: 7, pain: 1 }])]),
    session('2026-10-01', [singleEntry('Barbell Bench Press', [{ weight: 135, reps: 8, rpe: 7 }])]),
  ]);
  assert.equal(byRule(run(s), 'progression').length, 0);
});

test('low-recovery: sleep plus elevated RHR trims more than sleep alone; fine sleep does nothing', () => {
  const both = byRule(run(lowSleep(baseState(), { rhr: true })), 'low-recovery')[0];
  assert.equal(both.kind, 'reduce');
  assert.equal(both.changes[0].factor, 0.8);
  const alone = byRule(run(lowSleep(baseState())), 'low-recovery')[0];
  assert.equal(alone.changes[0].factor, 0.9);
  assert.ok(alone.missing.includes('rhr baseline'));
  const fine = baseState();
  for (let i = 0; i < 7; i++) setWatch(fine, addDays(ASOF, -i), { sleepH: 7.5 });
  assert.equal(byRule(run(fine), 'low-recovery').length, 0);
  // elevated RHR without low sleep is not enough on its own
  const rhrOnly = lowSleep(baseState(), { rhr: true, hours: 8 });
  assert.equal(byRule(run(rhrOnly), 'low-recovery').length, 0);
});

test('very low sleep with elevated RHR proposes an easy day instead', () => {
  const [f] = byRule(run(lowSleep(baseState(), { rhr: true, hours: 4 })), 'low-recovery');
  assert.equal(f.kind, 'recovery');
  assert.equal(f.changes[0].op, 'recovery-day');
});

test('load-spike needs two prior weeks and a real jump', () => {
  const spike = baseState();
  for (let w = 1; w <= 3; w++) withSessions(spike, [session(addDays(ASOF, -(w * 7 + 1)), [work('Seated Cable Row', 6, 100, 10)])]);
  withSessions(spike, [session(addDays(ASOF, -1), [work('Seated Cable Row', 12, 100, 10)])]);
  const [f] = byRule(run(spike), 'load-spike');
  assert.ok(f);
  assert.equal(f.changes[0].factor, 0.85);

  const flat = steadyHistory(baseState(), { weeks: 4, setsPerWeek: 6 });
  assert.equal(byRule(run(flat), 'load-spike').length, 0);

  const young = baseState(); // only one prior week of history
  withSessions(young, [session(addDays(ASOF, -8), [work('Seated Cable Row', 4, 100, 10)]), session(addDays(ASOF, -1), [work('Seated Cable Row', 12, 100, 10)])]);
  assert.equal(byRule(run(young), 'load-spike').length, 0);
});

test('restart: gap with other logging eases back in, dropping optional finishers', () => {
  const s = baseState();
  s.program = clone(PROGRAM);
  s.program.days[1].blocks.push(finisher('Burnout', { rounds: 3 }, [{ name: 'Plank', repLow: 0, repHigh: 0 }]));
  withSessions(s, [session(addDays(ASOF, -20), [work('Seated Cable Row', 3, 100, 10)])]);
  setWatch(s, addDays(ASOF, -4), { steps: 7000 });
  const [f] = byRule(run(s), 'restart');
  assert.equal(f.kind, 'restart');
  assert.equal(f.targetDates.length, 2);
  assert.ok(f.changes.some((c) => c.op === 'drop-block'));
  assert.ok(f.changes.filter((c) => c.op === 'scale-sets').every((c) => c.factor === 0.8));
});

test('restart: a gap with no other logging only asks a question and changes nothing', () => {
  const s = withSessions(baseState(), [session(addDays(ASOF, -20), [work('Seated Cable Row', 3, 100, 10)])]);
  const [f] = byRule(run(s), 'restart');
  assert.equal(f.kind, 'question');
  assert.deepEqual(f.changes, []);
});

test('progression proposes a small increase only at top of range, low RPE, recovered', () => {
  const mk = (rpe) => withSessions(baseState(), [
    session('2026-09-28', [singleEntry('Barbell Bench Press', [{ weight: 135, reps: 8, rpe }])]),
    session('2026-10-01', [singleEntry('Barbell Bench Press', [{ weight: 135, reps: 8, rpe }])]),
  ]);
  const [f] = byRule(run(mk(7)), 'progression');
  assert.equal(f.kind, 'increase');
  assert.equal(f.requiresAcceptance, true);
  assert.equal(f.changes[0].op, 'increase');
  assert.equal(f.changes[0].deltaWeight, 5);
  assert.equal(byRule(run(mk(9.5)), 'progression').length, 0, 'effort above target');
  const tired = lowSleep(mk(7));
  assert.equal(byRule(run(tired), 'progression').length, 0, 'recovery not ok');
});

test('availability moves a session off an unavailable weekday to the nearest free rest day', () => {
  const s = baseState();
  s.settings.availableDays = [1, 3, 6]; // Fri is out
  const [f] = byRule(run(s), 'availability');
  assert.equal(f.kind, 'move');
  assert.deepEqual(f.changes, [{ op: 'move', from: '2026-10-09', to: '2026-10-10' }]);
});

test('fasting restriction keeps hard lifting off fasting days', () => {
  const s = baseState();
  s.settings.restrictions = { noHardLiftingOnFastDays: true };
  s.dayOverrides = { '2026-10-07': 'noMoon', '2026-10-08': 'noMoon' }; // Wed (hard) and Thu fast
  const [f] = byRule(run(s), 'fasting');
  assert.equal(f.kind, 'move');
  assert.equal(f.changes[0].to, '2026-10-06');
  const off = baseState();
  off.dayOverrides = s.dayOverrides;
  off.settings.restrictions = { noHardLiftingOnFastDays: false };
  assert.equal(byRule(run(off), 'fasting').length, 0, 'not applied when the restriction is switched off');
});

test('missed sessions never add volume to later ones', () => {
  const s = baseState();
  s.dayStatus = { '2026-10-02': 'missed', '2026-09-30': 'missed', '2026-09-28': 'missed' };
  run(s).forEach((f) => f.changes.forEach((c) => { if (c.op === 'scale-sets') assert.ok(c.factor <= 1); }));
});
