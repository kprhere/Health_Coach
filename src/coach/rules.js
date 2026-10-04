// ============================================================
// coach/rules.js - deterministic rules over an assessment.
//
// evaluate() returns candidate findings; it never writes state and never
// reads the clock. Thresholds are heuristics from constants.js, not
// validated injury predictions, and nothing here diagnoses.
//
// Hard limits baked in:
//  - volume is only ever reduced; missed-session volume is NEVER added to a
//    later session
//  - increases are always proposed for acceptance (requiresAcceptance)
//  - a hard session is never moved onto a fasting day when the person's
//    restriction says so
//
// Ops carry an explicit `date` so one finding can touch several sessions.
// Finding: { rule, kind, targetDates, evidence:[{label,value,window}], missing,
//            rationale, confidence, changes:[op] }
// ============================================================
import {
  addDays, dayFlags, dowOf, exerciseLibrary, exerciseMeta, increment, resolveWorkout,
} from '../helpers.js';
import { CLINICIAN_NOTE, mergeConfig } from './constants.js';
import { hasSessionData, upcomingTrainingDates } from './metrics.js';
import { isDroppableBlock } from './overrides.js';

const exOf = (b) => (b.exercises || []);
const blockSets = (b) => ((b.blockType === 'single' || b.blockType === 'dropset') ? (exOf(b)[0] && exOf(b)[0].sets) : b.rounds) || 0;

const finding = (f) => ({
  targetDates: [], evidence: [], missing: [], changes: [], confidence: 'low', ...f,
});

const isHard = (date, state) => /^hard$/i.test(resolveWorkout(date, state).intensity || '');
const restrictsFastLifting = (state) => !!(state.settings && state.settings.restrictions && state.settings.restrictions.noHardLiftingOnFastDays === true);

// Recovery status shared by the low-recovery and progression rules.
export function recoveryState(assessment, cfg) {
  const r = assessment.recovery;
  const sleepLow = r.sleepAvg7 != null && r.sleepDays >= 3 && r.sleepAvg7 < cfg.sleepLowH;
  const rhrUp = !r.rhr.baselineMissing && r.rhr.delta != null && r.rhr.delta >= cfg.rhrElevatedBpm;
  return { sleepLow, rhrUp, ok: !sleepLow && !rhrUp };
}

function painRule(a, state, asOf, cfg) {
  const out = [];
  const lib = exerciseLibrary(state);
  Object.entries(a.pain.byExercise).forEach(([name, p]) => {
    if (p.exposures < cfg.painRepeatCount) return;
    const evidence = [
      { label: `${name}: sessions with pain >= ${cfg.painBlockLevel}`, value: p.exposures, window: 14 },
      { label: `${name}: highest pain logged`, value: p.maxPain, window: 14 },
    ];
    const sub = exerciseMeta(name, state).sub;
    const canSub = sub && sub !== name && lib[sub] && !(a.pain.byExercise[sub] && a.pain.byExercise[sub].exposures >= cfg.painRepeatCount);
    const changes = [];
    const dates = [];
    for (let i = 0; i <= 14 && dates.length < 2; i++) {
      const date = addDays(asOf, i);
      if (hasSessionData(state, date)) continue;
      const block = resolveWorkout(date, state).blocks.find((b) => exOf(b).some((e) => e.name === name));
      if (!block) continue;
      if (canSub) changes.push({ op: 'substitute', blockId: block.id, from: name, to: sub, date });
      else if (blockSets(block) >= 2) {
        const n = blockSets(block);
        changes.push({ op: 'scale-sets', blockId: block.id, factor: (n - 1) / n, minSets: 1, date });
      } else continue;
      dates.push(date);
    }
    out.push(finding({
      rule: 'pain-block', kind: !changes.length ? 'info' : canSub ? 'substitute' : 'reduce',
      targetDates: dates, evidence, changes, confidence: 'high',
      blocksProgression: [name], note: CLINICIAN_NOTE,
      rationale: `Pain of ${cfg.painBlockLevel}/10 or more was logged on ${name} in ${p.exposures} sessions over the last 14 days. `
        + (changes.length ? (canSub ? `Swap to ${sub} ` : 'Cut one set ') + 'for the next sessions and hold progression on it. ' : 'No upcoming session includes it; hold progression on it. ')
        + `This is a load-management suggestion, not an assessment of the cause - ${CLINICIAN_NOTE}.`,
    }));
  });
  return out;
}

function recoveryRule(a, state, asOf, cfg) {
  const rs = recoveryState(a, cfg);
  if (!rs.sleepLow) return [];
  const r = a.recovery;
  const evidence = [{ label: 'average sleep (h)', value: r.sleepAvg7, window: 7 }];
  const missing = [];
  if (rs.rhrUp) evidence.push({ label: 'resting HR over personal baseline (bpm)', value: r.rhr.delta, window: 3 });
  else if (r.rhr.baselineMissing) missing.push('rhr baseline');
  const dates = upcomingTrainingDates(state, asOf, rs.rhrUp ? 2 : 1);
  if (!dates.length) return [];
  const severe = rs.rhrUp && r.sleepAvg7 <= cfg.sleepLowH - 1.5;
  if (severe) {
    return [finding({
      rule: 'low-recovery', kind: 'recovery', targetDates: [dates[0]], evidence, missing, confidence: 'low',
      changes: [{ op: 'recovery-day', date: dates[0] }],
      rationale: 'Sleep has been well under target and resting heart rate is up on your own baseline. '
        + 'Consider an easy walk or mobility day in place of the next lift.',
    })];
  }
  const factor = rs.rhrUp ? 0.8 : 0.9;
  return [finding({
    rule: 'low-recovery', kind: 'reduce', targetDates: dates, evidence, missing,
    confidence: rs.rhrUp ? 'medium' : 'low',
    changes: dates.map((date) => ({ op: 'scale-sets', factor, minSets: 1, date })),
    rationale: rs.rhrUp
      ? 'Sleep is low and resting heart rate is above your baseline, so trim sets for the next sessions.'
      : 'Sleep has been low this week. A small trim to the next session keeps quality up; no other recovery signal was available to confirm.',
  })];
}

function loadSpikeRule(a, state, asOf, cfg) {
  const prior = a.weeklySets.slice(1);
  const withData = prior.filter((n) => n > 0);
  if (withData.length < 2) return [];
  const avg = withData.reduce((s, n) => s + n, 0) / withData.length;
  const now = a.weeklySets[0];
  if (!(avg > 0) || now <= cfg.loadSpikeRatio * avg) return [];
  const dates = upcomingTrainingDates(state, asOf, 2);
  if (!dates.length) return [];
  return [finding({
    rule: 'load-spike', kind: 'reduce', targetDates: dates, confidence: 'medium',
    evidence: [
      { label: 'working sets this week', value: now, window: 7 },
      { label: 'average weekly sets, prior weeks with data', value: Math.round(avg * 10) / 10, window: 28 },
    ],
    changes: dates.map((date) => ({ op: 'scale-sets', factor: 0.85, minSets: 1, date })),
    rationale: `Working sets this week are above ${cfg.loadSpikeRatio}x your recent weekly average. Trimming the next sessions a little lets the jump settle.`,
  })];
}

function restartRule(a, state, asOf, cfg) {
  const g = a.inactivity;
  if (g.gapDays == null || g.gapDays < cfg.restartGapDays) return [];
  const evidence = [{ label: 'days since last workout', value: g.gapDays, window: 28 }];
  if (!g.otherLoggingInGap && !g.confirmed) {
    return [finding({
      rule: 'restart', kind: 'question', evidence, confidence: 'low',
      missing: ['logging during the gap'],
      rationale: `No workout for ${g.gapDays} days and nothing else logged since. Were you on a break? Tell me and I can suggest an easier restart. Nothing has been changed.`,
    })];
  }
  const dates = upcomingTrainingDates(state, asOf, 2);
  if (!dates.length) return [];
  const changes = [];
  dates.forEach((date) => {
    changes.push({ op: 'scale-sets', factor: 0.8, minSets: 1, date });
    resolveWorkout(date, state).blocks.filter(isDroppableBlock).forEach((b) => changes.push({ op: 'drop-block', blockId: b.id, date }));
  });
  return [finding({
    rule: 'restart', kind: 'restart', targetDates: dates, evidence, changes, confidence: 'medium',
    rationale: `It has been ${g.gapDays} days since your last workout. Ease back in: about 20% fewer sets and no optional finishers for the first two sessions.`,
  })];
}

function progressionRule(a, state, asOf, cfg) {
  if (!recoveryState(a, cfg).ok) return [];
  if (a.inactivity.gapDays != null && a.inactivity.gapDays >= cfg.restartGapDays) return [];
  const out = [];
  Object.entries(a.windows[28].topSets).forEach(([name, top]) => {
    if (a.pain.byExercise[name]) return; // any logged pain holds progression
    const last2 = top.sessions.slice(-2);
    if (last2.length < 2 || last2.some((s) => s.weight == null)) return;
    if (last2[1].date < addDays(asOf, -21) || last2[1].weight < last2[0].weight) return;
    let rx = null, date = null;
    for (let i = 0; i <= 7 && !rx; i++) {
      const d = addDays(asOf, i);
      if (hasSessionData(state, d)) continue;
      const ex = resolveWorkout(d, state).blocks.flatMap(exOf).find((e) => e.name === name);
      if (ex) { rx = ex; date = d; }
    }
    if (!rx || !(rx.repHigh > 0)) return;
    const target = Number(rx.rpe) || 10;
    if (!last2.every((s) => s.reps >= rx.repHigh && s.rpe != null && s.rpe <= target)) return;
    const delta = increment(name, state);
    out.push(finding({
      rule: 'progression', kind: 'increase', targetDates: [date], confidence: 'medium', requiresAcceptance: true,
      evidence: [
        { label: `${name}: last two top sets (reps x ${last2[1].weight})`, value: last2.map((s) => s.reps).join(', '), window: 28 },
        { label: `${name}: RPE (target ${target})`, value: last2.map((s) => s.rpe).join(', '), window: 28 },
      ],
      changes: [{ op: 'increase', exercise: name, deltaWeight: delta, date }],
      rationale: `Top of the rep range at or under target effort twice running on ${name}, with no pain and recovery fine. Suggest +${delta} for the next session. Needs your OK.`,
    }));
  });
  return out;
}

// Nearest planned-rest date within 3 days that the person can train, with no
// logged data and no swap, and (for a hard session) not a fasting day.
function moveTarget(state, from, asOf, hard) {
  const avail = state.settings && Array.isArray(state.settings.availableDays) && state.settings.availableDays.length
    ? state.settings.availableDays : null;
  const noFast = hard && restrictsFastLifting(state);
  let best = null;
  for (let off = -3; off <= 3; off++) {
    if (off === 0) continue;
    const d = addDays(from, off);
    if (d < asOf || hasSessionData(state, d)) continue;
    if (state.workoutSwaps && (state.workoutSwaps[d] || state.workoutSwaps[from])) continue;
    if (resolveWorkout(d, state).blocks.length) continue;
    if (avail && !avail.includes(dowOf(d))) continue;
    if (noFast && dayFlags(d, state).fastDay) continue;
    if (!best || Math.abs(off) < Math.abs(best.off) || (Math.abs(off) === Math.abs(best.off) && off > best.off)) best = { d, off };
  }
  return best && best.d;
}

function availabilityRule(a, state, asOf) {
  const out = [];
  const avail = state.settings && Array.isArray(state.settings.availableDays) && state.settings.availableDays.length
    ? state.settings.availableDays : null;
  const noFast = restrictsFastLifting(state);
  if (!avail && !noFast) return out;
  for (let i = 0; i < 7; i++) {
    const date = addDays(asOf, i);
    if (hasSessionData(state, date) || (state.workoutSwaps && state.workoutSwaps[date])) continue;
    if (!resolveWorkout(date, state).blocks.length) continue;
    const unavailable = avail && !avail.includes(dowOf(date));
    const hard = isHard(date, state);
    const fastClash = noFast && hard && dayFlags(date, state).fastDay;
    if (!unavailable && !fastClash) continue;
    const rule = unavailable ? 'availability' : 'fasting';
    const why = unavailable ? 'falls on a day you marked unavailable' : 'is a hard session on a fasting day';
    const to = moveTarget(state, date, asOf, hard);
    const evidence = [{ label: unavailable ? 'planned on unavailable weekday' : 'hard session on fasting day', value: date, window: 7 }];
    out.push(to
      ? finding({
        rule, kind: 'move', targetDates: [date, to].sort(), evidence, confidence: 'high',
        changes: [{ op: 'move', from: date, to }],
        rationale: `The session on ${date} ${why}. Swap it with the rest day on ${to}; nothing is added or lost.`,
      })
      : finding({
        rule, kind: 'info', targetDates: [date], evidence, confidence: 'high',
        rationale: `The session on ${date} ${why}, and no free rest day nearby fits. Move it yourself or skip it; missed volume is not made up later.`,
      }));
  }
  return out;
}

export function evaluate(assessment, state, asOf, config) {
  const cfg = mergeConfig(assessment && assessment.config, config);
  return [
    ...painRule(assessment, state, asOf, cfg),
    ...recoveryRule(assessment, state, asOf, cfg),
    ...loadSpikeRule(assessment, state, asOf, cfg),
    ...restartRule(assessment, state, asOf, cfg),
    ...progressionRule(assessment, state, asOf, cfg),
    ...availabilityRule(assessment, state, asOf),
  ];
}
