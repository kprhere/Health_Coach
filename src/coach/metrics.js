// ============================================================
// coach/metrics.js - turns logged history into an assessment.
//
// Pure: nothing here reads the clock. Everything is computed "as of" a date
// key and ONLY data dated on or before it is used, so an assessment can be
// reproduced exactly later and future logs can never leak in.
//
// Rules of the road:
//  - resistance sets, timed holds and conditioning minutes are kept apart
//  - weights are only ever compared within one exercise identity
//    (replacement name when replaced, else the planned name)
//  - a missing input is listed in `missing`, never guessed
//  - an unlogged planned day is UNKNOWN, only dayStatus 'missed' is confirmed
// ============================================================
import { addDays, daysBetween, muscleGroupOf, exerciseMeta, resolveWorkout, workoutSessionHasData } from '../helpers.js';
import { WINDOWS, mergeConfig } from './constants.js';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const pos = (v) => { const n = num(v); return n != null && n > 0 ? n : null; };
const round1 = (n) => Math.round(n * 10) / 10;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------- stable hashing ----------
export function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}

// cyrb53: small, fast, 53 bits. Not cryptographic; it only has to notice change.
export function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const hashOf = (value) => hashString(stable(value));

// ---------- session cells ----------
// Flattens one session into cells, whatever the block type. Skipped entries
// and skipped round cells are dropped here; warm-ups are kept but flagged
// (pain in a warm-up still matters, volume from it does not).
export function cellsOf(session, state) {
  const cells = [];
  const push = (name, blockType, entryKey, c) => {
    cells.push({
      name, blockType, entryKey,
      bodyweight: /bodyweight/i.test(exerciseMeta(name, state).eq || ''),
      warmup: !!c.isWarmup, drop: !!c.isDrop,
      weight: num(c.weight), reps: Math.max(0, parseInt(c.reps, 10) || 0), seconds: pos(c.seconds) || 0,
      rpe: pos(c.rpe), pain: Math.max(0, num(c.pain) || 0),
    });
  };
  Object.entries((session && session.entries) || {}).forEach(([entryKey, entry]) => {
    if (!entry || typeof entry !== 'object' || entry.skipped) return;
    (entry.sets || []).forEach((set) => push(entry.replacedWith || entry.exName, entry.blockType, entryKey, set || {}));
    (entry.rounds || []).forEach((round) => {
      Object.entries((round && round.byExercise) || {}).forEach(([exName, cell]) => {
        if (!cell || cell.skipped) return;
        push(cell.replacedWith || exName, entry.blockType, entryKey, cell);
      });
    });
  });
  return cells;
}

// A cell becomes a working record or nothing. A set with seconds and no reps
// is a hold; reps with a numeric weight (or a bodyweight move with a blank
// weight) is resistance work. Blank or unfinished rows are nothing.
export function classifyCell(c) {
  if (c.warmup) return null;
  if (c.seconds > 0 && !(c.reps > 0)) return { kind: 'timed', name: c.name, seconds: c.seconds, weight: c.weight, rpe: c.rpe, isDrop: c.drop };
  if (c.reps > 0 && c.weight != null) return { kind: 'resist', name: c.name, weight: c.weight, reps: c.reps, rpe: c.rpe, isDrop: c.drop, bodyweight: false };
  if (c.reps > 0 && c.bodyweight) return { kind: 'resist', name: c.name, weight: null, reps: c.reps, rpe: c.rpe, isDrop: c.drop, bodyweight: true };
  return null;
}

// ---------- plan helpers (shared with rules) ----------
export const sessionOn = (state, date) => (state.workoutSessions && state.workoutSessions[date]) || null;
export const hasSessionData = (state, date) => workoutSessionHasData(sessionOn(state, date));
export const isPlannedTraining = (date, state) => resolveWorkout(date, state).blocks.length > 0;

// Next planned, still-untouched training dates on or after `from`.
export function upcomingTrainingDates(state, from, count = 2, horizon = 14) {
  const out = [];
  for (let i = 0; i <= horizon && out.length < count; i++) {
    const d = addDays(from, i);
    if (isPlannedTraining(d, state) && !hasSessionData(state, d)) out.push(d);
  }
  return out;
}

// ---------- logging presence ----------
const anyTruthy = (o) => !!o && typeof o === 'object' && Object.values(o).some((v) => (
  v && typeof v === 'object' ? anyTruthy(v) : v !== '' && v !== false && v !== null && v !== undefined && v !== 0));

function loggedDateSet(state, asOf) {
  const set = new Set();
  const add = (date, ok) => { if (ok && date <= asOf) set.add(date); };
  Object.entries(state.watchLogs || {}).forEach(([d, v]) => add(d, anyTruthy(v)));
  Object.entries(state.mealLogs || {}).forEach(([d, v]) => add(d, !!v && (anyTruthy(v.eaten) || (v.extras || []).length > 0 || num(v.water) > 0)));
  ['habitLogs', 'supplementLogs', 'beverageLogs', 'activity'].forEach((k) => Object.entries(state[k] || {}).forEach(([d, v]) => add(d, anyTruthy(v))));
  Object.keys(state.dayStatus || {}).forEach((d) => add(d, true));
  (state.bodyScans || []).forEach((sc) => sc && sc.date && add(sc.date, true));
  return set;
}

// ---------- source version ----------
// Hash of only the inputs this module and the rules read. Data dated after
// asOf is excluded by construction, so later logging does not stale a
// proposal about the past; editing the history it was based on does.
export function inputsHash(state, asOf) {
  const sessions = Object.keys(state.workoutSessions || {}).filter((d) => d <= asOf).sort().map((d) => {
    const s = state.workoutSessions[d];
    return [d, workoutSessionHasData(s), s && s.sessionRpe, s && s.durationMin,
      cellsOf(s, state).map((c) => [c.name, c.warmup, c.drop, c.weight, c.reps, c.seconds, c.rpe, c.pain])];
  });
  const from = addDays(asOf, -34);
  const inRange = (d) => d >= from && d <= asOf;
  const watch = Object.keys(state.watchLogs || {}).filter(inRange).sort().map((d) => {
    const w = state.watchLogs[d] || {};
    return [d, w.sleepH, w.restingHR, w.hrv, w.exerciseMin, w.workoutMin];
  });
  const activity = Object.keys(state.activity || {}).filter(inRange).sort().map((d) => {
    const a = state.activity[d] || {};
    return [d, a.eveningWalk, a.eveningWalkMin, a.swim, a.badminton];
  });
  const dayStatus = Object.keys(state.dayStatus || {}).filter((d) => d <= asOf).sort().map((d) => [d, state.dayStatus[d]]);
  const swaps = Object.keys(state.workoutSwaps || {}).filter((d) => d <= asOf).sort().map((d) => [d, state.workoutSwaps[d]]);
  const settings = state.settings || {};
  return hashOf({
    sessions, watch, activity, dayStatus, swaps,
    logged: [...loggedDateSet(state, asOf)].sort(),
    program: state.program || null,
    settings: [settings.programStartDate, settings.availableDays, settings.restrictions],
  });
}

// ---------- assessment ----------
const emptyWindow = (n, asOf) => ({
  days: n, start: addDays(asOf, -(n - 1)), end: asOf,
  loggedSessionDays: 0, completedWorkingSets: 0, dropSets: 0, perMuscle: {},
  timedSeconds: 0, timedSets: 0,
  conditioning: { label: 'conditioning (not resistance volume)', walkMin: 0, swimDays: 0, badmintonDays: 0, watchExerciseMin: 0, watchWorkoutMin: 0 },
  avgRpe: null, rpeSets: 0, topSets: {}, sessionLoads: [], loadTotal: null,
  missedDays: 0, restDays: 0, unloggedDays: 0,
});

export function assess(state, asOf, { windows = WINDOWS, config } = {}) {
  const cfg = mergeConfig(config);
  const s = state || {};
  const missing = [];

  // Per-date working records (only dates <= asOf).
  const byDate = {};
  const painByDate = {};
  Object.keys(s.workoutSessions || {}).filter((d) => d <= asOf).forEach((date) => {
    const cells = cellsOf(s.workoutSessions[date], s);
    byDate[date] = {
      records: cells.map(classifyCell).filter(Boolean),
      hasData: workoutSessionHasData(s.workoutSessions[date]),
      session: s.workoutSessions[date],
    };
    cells.forEach((c) => {
      if (c.pain <= 0) return;
      const day = (painByDate[c.name] = painByDate[c.name] || {});
      day[date] = Math.max(day[date] || 0, c.pain);
    });
  });

  // Plan status for the longest window (planned-and-unlogged is UNKNOWN).
  const progStart = (s.settings && s.settings.programStartDate) || '';
  const planStatus = [];
  const longest = Math.max(...windows);
  for (let i = longest - 1; i >= 0; i--) {
    const date = addDays(asOf, -i);
    const planned = date < asOf && (!progStart || date >= progStart) && isPlannedTraining(date, s);
    const ds = s.dayStatus && s.dayStatus[date];
    let status = 'none';
    if (byDate[date] && byDate[date].hasData) status = 'logged';
    else if (ds === 'missed' || ds === 'rest') status = ds;
    else if (planned) status = 'unlogged';
    planStatus.push({ date, planned, status });
  }
  if (planStatus.some((p) => p.status === 'unlogged')) missing.push('unlogged planned sessions');
  const statusOf = Object.fromEntries(planStatus.map((p) => [p.date, p.status]));

  const outWindows = {};
  windows.forEach((n) => {
    const w = emptyWindow(n, asOf);
    const rpes = [];
    const topByEx = {};
    for (let i = n - 1; i >= 0; i--) {
      const date = addDays(asOf, -i);
      const day = byDate[date];
      if (day && day.hasData) {
        w.loggedSessionDays += 1;
        const ss = day.session;
        w.sessionLoads.push({ date, load: pos(ss.sessionRpe) && pos(ss.durationMin) ? pos(ss.sessionRpe) * pos(ss.durationMin) : null });
        const best = {};
        day.records.forEach((r) => {
          if (r.kind === 'timed') { w.timedSeconds += r.seconds; w.timedSets += 1; return; }
          w.completedWorkingSets += 1;
          if (r.isDrop) w.dropSets += 1;
          const g = muscleGroupOf(r.name, s);
          w.perMuscle[g] = (w.perMuscle[g] || 0) + 1;
          if (r.rpe != null) rpes.push(r.rpe);
          if (r.isDrop) return; // drops are lighter by design, never a top set
          const cur = best[r.name];
          const rw = r.weight ?? -1;
          if (!cur || rw > (cur.weight ?? -1) || (rw === (cur.weight ?? -1) && r.reps > cur.reps)) {
            best[r.name] = { date, weight: r.weight, reps: r.reps, rpe: r.rpe, bodyweight: r.bodyweight };
          }
        });
        Object.entries(best).forEach(([name, top]) => { (topByEx[name] = topByEx[name] || []).push(top); });
      }
      const act = (s.activity && s.activity[date]) || {};
      const walkOn = act.eveningWalk === true || (act.eveningWalk === undefined && pos(act.eveningWalkMin));
      if (walkOn) w.conditioning.walkMin += pos(act.eveningWalkMin) || 40;
      if (act.swim) w.conditioning.swimDays += 1;
      if (act.badminton) w.conditioning.badmintonDays += 1;
      const watch = (s.watchLogs && s.watchLogs[date]) || {};
      w.conditioning.watchExerciseMin += pos(watch.exerciseMin) || 0;
      w.conditioning.watchWorkoutMin += pos(watch.workoutMin) || 0;
      const st = statusOf[date];
      if (st === 'missed') w.missedDays += 1;
      else if (st === 'rest') w.restDays += 1;
      else if (st === 'unlogged') w.unloggedDays += 1;
    }
    w.avgRpe = rpes.length ? round1(mean(rpes)) : null;
    w.rpeSets = rpes.length;
    Object.entries(topByEx).forEach(([name, list]) => {
      const first = list[0], last = list[list.length - 1];
      const both = first.weight != null && last.weight != null;
      w.topSets[name] = {
        bodyweight: !!last.bodyweight, sessions: list,
        change: list.length > 1 ? { weight: both ? round1(last.weight - first.weight) : null, reps: last.reps - first.reps } : null,
      };
    });
    const known = w.sessionLoads.map((x) => x.load).filter((x) => x != null);
    w.loadTotal = known.length ? known.reduce((a, b) => a + b, 0) : null;
    outWindows[n] = w;
  });
  const w7 = outWindows[7];
  if (w7 && w7.sessionLoads.some((x) => x.load == null)) missing.push('session load');

  // ----- recovery -----
  const watchVals = (key, from, to) => {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const v = pos(s.watchLogs && s.watchLogs[d] && s.watchLogs[d][key]);
      if (v != null) out.push(v);
    }
    return out;
  };
  const sleepVals = watchVals('sleepH', addDays(asOf, -6), asOf);
  const recovery = { sleepAvg7: sleepVals.length ? round1(mean(sleepVals)) : null, sleepDays: sleepVals.length };
  if (!sleepVals.length) missing.push('sleep');

  // Personal baseline = the 28 days BEFORE the last 3 days, so a bad
  // stretch cannot normalise itself into its own baseline.
  const recentFrom = addDays(asOf, -2);
  const baseFrom = addDays(asOf, -30), baseTo = addDays(asOf, -3);
  const rhrRecent = watchVals('restingHR', recentFrom, asOf);
  const rhrBase = watchVals('restingHR', baseFrom, baseTo);
  recovery.rhr = {
    recent: rhrRecent.length ? round1(mean(rhrRecent)) : null, baseline: null, delta: null,
    baselineDays: rhrBase.length, baselineMissing: rhrBase.length < cfg.minRhrBaselineDays,
  };
  if (!recovery.rhr.baselineMissing) {
    recovery.rhr.baseline = round1(median(rhrBase));
    if (recovery.rhr.recent != null) recovery.rhr.delta = round1(recovery.rhr.recent - recovery.rhr.baseline);
  } else missing.push('rhr baseline');
  if (!rhrRecent.length) missing.push('rhr');

  const hrvRecent = watchVals('hrv', recentFrom, asOf);
  const hrvBase = watchVals('hrv', baseFrom, baseTo);
  recovery.hrv = { used: false, recent: null, baseline: null, baselineDays: hrvBase.length };
  if (hrvBase.length >= cfg.minHrvBaselineDays && hrvRecent.length) {
    recovery.hrv = { used: true, recent: round1(mean(hrvRecent)), baseline: round1(median(hrvBase)), baselineDays: hrvBase.length };
  } else missing.push('hrv baseline');

  // ----- pain (14d): exposures per exercise at/above the block level -----
  const painFrom = addDays(asOf, -13);
  const pain = { window: 14, byExercise: {} };
  Object.entries(painByDate).forEach(([name, days]) => {
    const dates = Object.keys(days).filter((d) => d >= painFrom).sort();
    if (!dates.length) return;
    pain.byExercise[name] = {
      exposures: dates.filter((d) => days[d] >= cfg.painBlockLevel).length,
      maxPain: Math.max(...dates.map((d) => days[d])), dates,
    };
  });

  // ----- inactivity -----
  const dataDates = Object.keys(byDate).filter((d) => byDate[d].hasData).sort();
  const lastWorkoutDate = dataDates.length ? dataDates[dataDates.length - 1] : null;
  const inactivity = { lastWorkoutDate, gapDays: null, otherLoggingInGap: false, confirmed: false };
  if (lastWorkoutDate) {
    inactivity.gapDays = daysBetween(lastWorkoutDate, asOf);
    const logged = loggedDateSet(s, asOf);
    for (let d = addDays(lastWorkoutDate, 1); d <= asOf; d = addDays(d, 1)) {
      if (logged.has(d)) { inactivity.otherLoggingInGap = true; break; }
    }
    // Confirmed means every planned training day in the gap was answered
    // with an explicit rest/missed status, not merely left blank.
    const plannedInGap = planStatus.filter((p) => p.date > lastWorkoutDate && p.planned);
    inactivity.confirmed = plannedInGap.length > 0 && plannedInGap.every((p) => p.status === 'missed' || p.status === 'rest');
  }

  // Four consecutive 7-day buckets, most recent first (load-spike needs them).
  const weeklySets = [0, 1, 2, 3].map((k) => {
    let n = 0;
    for (let i = k * 7; i < k * 7 + 7; i++) {
      const day = byDate[addDays(asOf, -i)];
      if (day && day.hasData) n += day.records.filter((r) => r.kind === 'resist').length;
    }
    return n;
  });

  return {
    asOf, sourceVersion: inputsHash(s, asOf), config: cfg,
    windows: outWindows, weeklySets, recovery, pain, missing: [...new Set(missing)], inactivity, planStatus,
  };
}
