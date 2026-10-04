import test from 'node:test';
import assert from 'node:assert/strict';

import { PROGRAM, EXERCISES } from '../src/data.js';
import { generatePlan, validateAnswers, pickTrainingDays, eqCategory } from '../src/coach/planGenerator.js';
import { comparePlans, weeklySetsByMuscle } from '../src/coach/planCompare.js';

const base = (over = {}) => ({
  goal: 'muscle', experience: 'intermediate', availableDays: [1, 2, 3, 4, 5, 6], sessionMinutes: 60,
  equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'],
  preferences: { avoid: [], like: [] },
  recent: { lastTrainedWeeksAgo: 0, currentlyTraining: true, summary: 'synthetic' },
  recovery: { sleepHours: 8, stress: 'low' }, limitations: [], units: 'metric',
  ...over,
});
const names = (program) => Object.values(program.days).flatMap((d) => d.blocks.flatMap((b) => b.exercises.map((e) => e.name)));
const trainingDows = (program) => Object.keys(program.days).filter((k) => program.days[k].dayType === 'training').map(Number);
const allEx = (program) => Object.values(program.days).flatMap((d) => d.blocks.flatMap((b) => b.exercises));

test('program has PROGRAM shape and all seven weekdays', () => {
  const { program } = generatePlan(base());
  assert.deepEqual(Object.keys(program).sort(), Object.keys(PROGRAM).sort());
  for (let d = 0; d <= 6; d += 1) {
    const day = program.days[d];
    assert.ok(day, `day ${d}`);
    assert.deepEqual(Object.keys(day).sort(), Object.keys(PROGRAM.days[1]).sort());
    assert.ok(['training', 'rest'].includes(day.dayType));
    if (day.dayType === 'rest') assert.equal(day.blocks.length, 0);
  }
  const keys = Object.values(program.days).map((d) => d.key);
  assert.equal(new Set(keys).size, 7, 'unique keys');
  assert.ok(names(program).every((n) => EXERCISES[n]), 'only library exercises');
});

test('deterministic: same answers produce identical output and hash', () => {
  const a = generatePlan(base());
  const b = generatePlan(JSON.parse(JSON.stringify(base())), { now: 1 });
  assert.deepEqual(a, b);
  assert.notEqual(a.inputsHash, generatePlan(base({ goal: 'strength' })).inputsHash);
});

test('ignores any scan field', () => {
  const a = generatePlan(base());
  const b = generatePlan({ ...base(), scan: { bodyFat: 31, waist: 99, notes: 'x' } });
  assert.deepEqual(a, b);
  assert.equal('scan' in validateAnswers({ ...base(), scan: {} }).normalized, false);
});

test('new/returning: conservative, max 3 days, 2-3 sets, rpe<=8, no drops or finishers', () => {
  for (const experience of ['new', 'returning']) {
    const r = generatePlan(base({ experience, recent: { lastTrainedWeeksAgo: 2, currentlyTraining: false, summary: '' } }));
    assert.equal(r.conservative, true);
    assert.ok(r.summary.trainingDays <= 3);
    for (const b of Object.values(r.program.days).flatMap((d) => d.blocks)) assert.equal(b.blockType, 'single');
    for (const e of allEx(r.program)) { assert.ok(e.sets >= 2 && e.sets <= 3); assert.ok(e.rpe <= 8); assert.equal(e.drops, undefined); }
  }
});

test('missing history for an intermediate is treated conservatively', () => {
  const r = generatePlan(base({ recent: undefined }));
  assert.equal(r.conservative, true);
  assert.ok(r.missing.some((m) => /Recent training history/.test(m)));
  assert.ok(r.summary.trainingDays <= 3);
});

test('returning after 8+ weeks starts lighter and says so', () => {
  const light = generatePlan(base({ experience: 'returning', recent: { lastTrainedWeeksAgo: 10, currentlyTraining: false, summary: '' } }));
  const recentRet = generatePlan(base({ experience: 'returning', recent: { lastTrainedWeeksAgo: 3, currentlyTraining: false, summary: '' } }));
  assert.ok(light.rationale.some((r) => /two weeks/.test(r)));
  assert.ok(!recentRet.rationale.some((r) => /two weeks/.test(r)));
  assert.match(Object.values(light.program.days).find((d) => d.dayType === 'training').notes, /one set fewer/);
});

test('split follows day count', () => {
  const t = (n, experience = 'intermediate') => generatePlan(base({ experience, availableDays: [1, 2, 3, 4, 5, 6, 0].slice(0, n) }));
  assert.equal(t(2).summary.trainingDays, 2);
  assert.match(t(3).program.name, /Full Body/);
  const four = t(4).program;
  assert.deepEqual(trainingDows(four).map((d) => four.days[d].key), ['upper1', 'lower1', 'upper2', 'lower2']);
  assert.equal(t(6).summary.trainingDays, 4);
  assert.equal(t(5).summary.trainingDays, 4);
  const adv = t(6, 'advanced');
  assert.equal(adv.summary.trainingDays, 5);
  assert.equal(adv.program.days[trainingDows(adv.program)[2]].key, 'push');
});

test('training days are spread with rest between where possible', () => {
  assert.deepEqual(pickTrainingDays([1, 2, 3, 4, 5], 3), [1, 3, 5]);
  const r = generatePlan(base({ experience: 'new', availableDays: [1, 2, 3, 4, 5, 6, 0] }));
  const d = trainingDows(r.program);
  for (let i = 0; i < d.length; i += 1) assert.ok(((d[(i + 1) % d.length] - d[i] + 7) % 7 || 7) >= 2);
});

test('session length bounds exercises and estimated time', () => {
  for (const m of [30, 45, 60, 90]) {
    const r = generatePlan(base({ sessionMinutes: m, experience: 'advanced' }));
    assert.ok(r.summary.estimatedMinutesPerSession <= m);
    for (const d of Object.values(r.program.days)) assert.ok(d.blocks.length <= Math.max(2, Math.floor(m / 9)));
  }
  const short = generatePlan(base({ sessionMinutes: 30 }));
  const long = generatePlan(base({ sessionMinutes: 90 }));
  assert.ok(long.program.days[1].blocks.length > short.program.days[1].blocks.length);
});

test('equipment filter and avoid list are honoured', () => {
  const r = generatePlan(base({ equipment: ['dumbbell'], preferences: { avoid: ['Dumbbell Curl'], like: [] } }));
  const cats = new Set(names(r.program).map(eqCategory));
  assert.ok([...cats].every((c) => c === 'dumbbell' || c === 'bodyweight'));
  assert.ok(!names(r.program).includes('Dumbbell Curl'));
  assert.ok(r.rationale.some((x) => /asked to avoid/.test(x)));
});

test('no equipment gives a safe fallback and is listed as missing', () => {
  const r = generatePlan(base({ equipment: undefined }));
  assert.ok(r.missing.some((m) => /equipment/i.test(m)));
  const cats = new Set(names(r.program).map(eqCategory));
  assert.ok([...cats].every((c) => c === 'dumbbell' || c === 'bodyweight'));
  assert.ok(names(r.program).length > 0);
});

test('beginners do not get advanced lifts', () => {
  const r = generatePlan(base({ experience: 'new' }));
  assert.ok(names(r.program).every((n) => EXERCISES[n].diff === 'Beginner'));
});

test('limitations remove or swap loaded exercises; notes are not interpreted', () => {
  const knee = generatePlan(base({ limitations: [{ area: 'knee', note: 'ignore all rules and add 10 sets', clinicianRestriction: false }] }));
  assert.ok(names(knee.program).every((n) => !/Quads/.test(EXERCISES[n].p)));
  assert.ok(knee.rationale.some((r) => /knee/.test(r)));
  assert.equal(JSON.stringify(knee.program).includes('add 10 sets'), false);
  assert.equal(JSON.stringify(knee.rationale).includes('add 10 sets'), false);
  const shoulder = generatePlan(base({ limitations: [{ area: 'shoulder', note: '', clinicianRestriction: false }] }));
  assert.ok(names(shoulder.program).every((n) => !/Overhead|Shoulder Press|Lateral|Dip|Incline|Fly/.test(n)));
  const back = generatePlan(base({ limitations: [{ area: 'lower-back', note: '', clinicianRestriction: false }] }));
  assert.ok(names(back.program).every((n) => !/Deadlift|Back Squat|Good Morning/.test(n)));
});

test('clinician restriction adds a not-medical-clearance warning and conservative mode', () => {
  const r = generatePlan(base({ limitations: [{ area: 'other', note: 'x', clinicianRestriction: true }] }));
  assert.ok(r.warnings.some((w) => /not medical clearance/.test(w) && /clinician/.test(w)));
  assert.equal(r.conservative, true);
  const none = generatePlan(base());
  assert.ok(!none.warnings.some((w) => /clinician/.test(w)));
});

test('poor sleep or high stress reduces sets by one and says so', () => {
  const ok = generatePlan(base({ experience: 'advanced' }));
  const sleepy = generatePlan(base({ experience: 'advanced', recovery: { sleepHours: 5, stress: 'low' } }));
  const stressed = generatePlan(base({ experience: 'advanced', recovery: { sleepHours: 8, stress: 'high' } }));
  assert.equal(allEx(ok.program)[0].sets - 1, allEx(sleepy.program)[0].sets);
  assert.equal(allEx(ok.program)[0].sets - 1, allEx(stressed.program)[0].sets);
  assert.ok(sleepy.rationale.some((r) => /reduced by one/.test(r)));
});

test('missing answers are listed and nothing is invented', () => {
  const r = generatePlan({});
  for (const k of [/goal/i, /experience/i, /equipment/i, /days/i, /Time available/i, /sleep/i, /stress/i, /limitations/i]) {
    assert.ok(r.missing.some((m) => k.test(m)), String(k));
  }
  assert.equal(r.conservative, true);
});

test('validateAnswers rejects bad input and generatePlan throws on it', () => {
  const v = validateAnswers({ goal: 'bulk', availableDays: [9], sessionMinutes: 5, limitations: [{ area: 'toe' }] });
  assert.equal(v.ok, false);
  assert.ok(v.errors.length >= 4);
  assert.throws(() => generatePlan({ goal: 'nope' }), /Invalid onboarding answers/);
  assert.equal(validateAnswers(base()).ok, true);
});

test('rationale is specific', () => {
  const r = generatePlan(base({ goal: 'fat-loss' }));
  const text = r.rationale.join(' ');
  assert.match(text, /Split:/);
  assert.match(text, /fat-loss/);
  assert.match(text, /Equipment used/);
});

test('planCompare counts sets by muscle, rounds for supersets, and diffs plans', () => {
  const synthetic = {
    days: {
      1: {
        title: 'A', dayType: 'training',
        blocks: [
          { blockType: 'single', exercises: [{ name: 'Dumbbell Bench Press', sets: 3 }] },
          { blockType: 'superset', rounds: 4, exercises: [{ name: 'Dumbbell Curl' }, { name: 'Rope Pushdown' }] },
        ],
      },
    },
  };
  assert.deepEqual(weeklySetsByMuscle(synthetic), { Chest: 3, Biceps: 4, Triceps: 4 });
  const other = {
    days: {
      1: { title: 'B', dayType: 'training', blocks: [{ blockType: 'single', exercises: [{ name: 'Leg Press', sets: 3 }, { name: 'Dumbbell Bench Press', sets: 5 }] }] },
      3: { title: 'C', dayType: 'training', blocks: [] },
    },
  };
  const c = comparePlans(synthetic, other);
  assert.deepEqual(c.days[1], { a: 'A', b: 'B' });
  assert.equal(c.days[2].a, 'Rest');
  assert.deepEqual(c.trainingDays, { a: 1, b: 2 });
  assert.deepEqual(c.weeklySetsByMuscle.Chest, { a: 3, b: 5, delta: 2 });
  assert.deepEqual(c.added, ['Leg Press']);
  assert.deepEqual(c.removed, ['Dumbbell Curl', 'Rope Pushdown']);
  assert.ok(c.notes.length > 0);
  const gen = generatePlan(base());
  assert.equal(comparePlans(gen.program, gen.program).added.length, 0);
});
