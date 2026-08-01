// ============================================================
// demo.js - generates realistic sample history so the Stats,
// charts and scores have something to show. Fully reversible
// with "Reset all data" (it just restores the seed scans).
//
// The training volume climbs about 12% per week (progressive
// overload), so "Training volume by week" reads as a clean
// upward staircase with the current week the tallest.
// ============================================================
import { EXERCISES, SUPPLEMENTS } from './data.js';
import { resolveWorkout, initSession, todayKey, addDays } from './helpers.js';

// small deterministic hash so same-bucket lifts get a little variety
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

// plausible working weight (lb) for an intermediate lifter, per exercise
function baseWeight(name) {
  const x = EXERCISES[name] || {};
  const p = x.p || '';
  const eq = x.eq || '';
  if (/Cardio|Mobility/i.test(p) || /Bodyweight|None|Pool|Court|Foam/i.test(eq)) return 0; // reps-only
  let w;
  if (/Leg Press/i.test(name)) w = 250;
  else if (/Hack Squat/i.test(name)) w = 180;
  else if (/Romanian/i.test(name)) w = 135;
  else if (/Deadlift/i.test(name)) w = 185;
  else if (/Back Squat|Front Squat|Smith Squat|Arsenal Squat/i.test(name)) w = 150;
  else if (/Hip Thrust|Glute Bridge/i.test(name)) w = 185;
  else if (/Leg Curl/i.test(name)) w = 95;
  else if (/Leg Extension/i.test(name)) w = 115;
  else if (/Calf/i.test(name)) w = 160;
  else if (/Incline/i.test(name)) w = 115;
  else if (/Bench|Chest Press/i.test(name)) w = 135;
  else if (/Overhead Press|Shoulder Press|Standing Press|Landmine|Arnold/i.test(name)) w = 90;
  else if (/Row|Pulldown|Pull-?up|High Row/i.test(name)) w = 120;
  else if (/Lateral|Rear Delt|Face Pull|Reverse Pec/i.test(name)) w = 25;
  else if (/Curl/i.test(name)) w = 40;
  else if (/Pushdown|Tricep|Skullcrusher|Close Grip|Overhead Tricep|Dip/i.test(name)) w = 45;
  else if (/Fly|Pec Deck/i.test(name)) w = 50;
  else if (/Split Squat|Lunge/i.test(name)) w = 45;
  else if (/Crunch|Woodchop|Pallof|Leg Raise|Plank|Dead Bug|Ab /i.test(name)) w = 30;
  else if (/Machine|Hammer|Arsenal|Life Fitness|Body Builder/i.test(eq)) w = 110;
  else w = 60;
  return Math.max(10, w + (hash(name) % 13) - 6); // ±6 lb jitter
}

const round2half = (n) => Math.round(n / 2.5) * 2.5;

// Older weeks log fewer accessory lifts (you drop the tail when short on
// time early in a program); recent weeks log everything. Combined with a
// gentle weight progression, weekly volume climbs as a clean staircase
// while the per-lift weights stay realistic.
function fillSession(sess, factor, week) {
  const entries = Object.values(sess.entries);
  const drop = Math.min(Math.max(entries.length - 2, 0), Math.round(week * 0.9));
  const fillCount = entries.length - drop;
  entries.forEach((e, idx) => {
    if (idx >= fillCount) return; // leave trailing accessories unlogged in older weeks
    if (e.sets) {
      const bw = baseWeight(e.exName);
      e.sets.forEach((s, i) => {
        s.weight = bw > 0 ? round2half(bw * factor) : 0;
        s.reps = 8 + (i % 3);         // 8-10 reps
        s.rpe = 8;
        s.restSec = 90;
      });
      e.completed = true;
    } else if (e.rounds) {
      e.rounds.forEach((rd) => {
        Object.keys(rd.byExercise).forEach((nm) => {
          const c = rd.byExercise[nm];
          const bw = baseWeight(nm);
          c.weight = bw > 0 ? round2half(bw * factor) : 0;
          c.reps = 12;
          c.rpe = 9;
          c.done = true;
        });
        rd.done = true;
      });
      e.completed = true;
    }
  });
}

export function generateDemoData(state) {
  const today = todayKey();
  const workoutSessions = {};
  const mealLogs = {};
  const habitLogs = {};
  const watchLogs = {};
  const supplementLogs = {};
  const dailySupps = SUPPLEMENTS.filter((s) => !s.conditional).map((s) => s.key);

  const WEEKS = 8;                    // 8 weeks of training history for the chart
  for (let d = 0; d < WEEKS * 7; d++) {
    const date = addDays(today, -d);
    const week = Math.floor(d / 7);   // 0 = current week ... 7 = oldest
    let factor = 0.9 + (WEEKS - 1 - week) * 0.02;  // gentle, realistic weight progression
    if (week === 0) factor *= 1.3;                 // current week logs a little heavier -> new high

    // ---- workout (progressive overload via load + accessory volume) ----
    const plan = resolveWorkout(date, state);
    if (plan.blocks.length) {
      const sess = initSession(plan);
      fillSession(sess, factor, week);
      sess.completed = week <= 1;                  // recent weeks fully complete; older ones partial
      workoutSessions[date] = { ...sess, date };
    }

    // ---- meals: eaten + on-target water (only recent 6 weeks) ----
    if (d < 42) {
      const eaten = {};
      for (let i = 0; i < 6; i++) eaten[i] = true;
      mealLogs[date] = { eaten, extras: [], water: 3.5, flags: {}, choices: {} };

      // ---- Apple Watch numbers ----
      watchLogs[date] = {
        steps: 9200 + ((d * 137) % 2600),          // ~9.2k-11.8k
        sleepH: (7 + ((d % 5) * 0.18)).toFixed(1),  // ~7.0-7.7 h
        restingHR: 58 + (d % 5),                    // 58-62 bpm
        activeCal: 520 + ((d * 53) % 240),
        exerciseMin: 45 + (d % 20),
      };

      // ---- supplements taken ----
      const sup = {};
      dailySupps.forEach((k) => { sup[k] = true; });
      supplementLogs[date] = sup;

      // ---- a few manual habit ticks (rest auto-derive from the above) ----
      habitLogs[date] = {
        no_junk: true, no_sugary: true, mobility: true,
        stress_downshift: true, morning_weight: true, workout_logged: true,
      };
    }
  }

  return { workoutSessions, mealLogs, habitLogs, watchLogs, supplementLogs };
}
