// ============================================================
// planGenerator.js - deterministic onboarding plan generator.
// Pure: no React, no network, no clock, no randomness.
// Same answers => same output. Body-scan data is NOT an input;
// any `scan` field on the answers is ignored.
// ============================================================
import { EXERCISES, single, DAY_SHORT } from '../data.js';
import { weeklySetsByMuscle } from './planCompare.js';

export const GOALS = ['fat-loss', 'muscle', 'recomp', 'strength', 'general'];
export const EXPERIENCES = ['new', 'returning', 'intermediate', 'advanced'];
export const AREAS = ['shoulder', 'knee', 'lower-back', 'elbow', 'wrist', 'hip', 'ankle', 'neck', 'other'];
export const EQUIPMENT_CATEGORIES = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'bands'];
const STRESS = ['low', 'medium', 'high'];

const EQUIP_ALIASES = {
  barbell: 'barbell', barbells: 'barbell', bar: 'barbell',
  dumbbell: 'dumbbell', dumbbells: 'dumbbell',
  cable: 'cable', cables: 'cable',
  machine: 'machine', machines: 'machine',
  bodyweight: 'bodyweight', 'body weight': 'bodyweight', none: 'bodyweight',
  band: 'bands', bands: 'bands',
};

// Library eq string -> equipment category.
const LIB_EQ = {
  Barbell: 'barbell', 'EZ Bar': 'barbell',
  Dumbbell: 'dumbbell', Dumbbells: 'dumbbell',
  Cable: 'cable',
  Machine: 'machine', 'Smith Machine': 'machine', 'Assisted Dip Machine': 'machine', 'Plate Loaded': 'machine',
  'Hammer Strength': 'machine', Arsenal: 'machine', 'Life Fitness': 'machine', 'Body Builder': 'machine',
  Bodyweight: 'bodyweight', None: 'bodyweight', Band: 'bands',
};
export const eqCategory = (name) => LIB_EQ[(EXERCISES[name] || {}).eq] || null;

const DIFF_RANK = { Beginner: 0, Intermediate: 1, Advanced: 2 };
const EXP_MAX_DIFF = { new: 0, returning: 0, intermediate: 1, advanced: 2 };

// ---- limitations ------------------------------------------------------
// Documented area -> exercises that load that area. Predicates run over the
// exercise name and its library entry. The user's free-text note is stored,
// never interpreted; only the chosen `area` drives any change.
export const LIMITATION_MAP = {
  shoulder: {
    why: 'overhead pressing, dips, flys, incline and barbell pressing, lateral raises and pull-ups load the shoulder joint',
    loads: (n) => /Overhead|Shoulder Press|Arnold|Landmine|Body Builder|Dip|Incline|Fly|Pec Deck|Lateral|Pull-up|Barbell Bench|Hammer Strength Bench/i.test(n),
  },
  knee: {
    why: 'squat, lunge, leg press and leg extension patterns (all quad-dominant work) load the knee',
    loads: (n, m) => /Quads/.test(m.p || '') && !/Hip Thrust/.test(n),
  },
  'lower-back': {
    why: 'deadlifts, good mornings, hinges, barbell squats and heavy unsupported rows load the lower back',
    loads: (n) => /Deadlift|Good Morning|Hip Hinge|Back Squat|Front Squat|T-Bar|Single Arm Dumbbell Row|Hip Thrust/i.test(n),
  },
  elbow: {
    why: 'curls, triceps extensions, dips and close-grip pressing load the elbow',
    loads: (n, m) => /Bicep|Tricep|Brachialis/.test(m.p || '') || /Dip|Close Grip/.test(n),
  },
  wrist: {
    why: 'barbell curls, skullcrushers, front squats, planks and weight-bearing work load the wrist',
    loads: (n) => /Barbell Curl|Skullcrusher|Front Squat|Plank|Ab Wheel|Dip|Close Grip|Barbell Bench/i.test(n),
  },
  hip: {
    why: 'lunges, split squats, abductor and kickback work, and hip-hinge lifts load the hip',
    loads: (n) => /Lunge|Split Squat|Abductor|Kickback|Hip Thrust|Glute Bridge|Back Squat|Deadlift|Good Morning|Hip Hinge/i.test(n),
  },
  ankle: {
    why: 'calf raises, lunges and split squats load the ankle',
    loads: (n, m) => /Calves/.test(m.p || '') || /Lunge|Split Squat/.test(n),
  },
  neck: {
    why: 'barbell squats and overhead or pull-up work load the neck and upper traps',
    loads: (n) => /Back Squat|Front Squat|Overhead|Pull-up|Shoulder Press|Arnold|Body Builder/i.test(n),
  },
  other: { why: 'an unspecified area: no exercises are removed automatically', loads: () => false },
};

// ---- slots: movement patterns, candidates in preference order ---------
const SLOTS = {
  squat: { main: true, c: ['Leg Press', 'Back Squat', 'Smith Squat', 'Hammer Strength Leg Press', 'Life Fitness Leg Press', 'Arsenal Squat', 'Hack Squat', 'Reverse Lunge', 'Split Squat', 'Walking Lunge', 'Bulgarian Split Squat'] },
  hinge: { main: true, c: ['Romanian Deadlift', 'Hip Hinge Machine', 'Hip Thrust', 'Glute Bridge', 'Deadlift'] },
  hpush: { main: true, c: ['Dumbbell Bench Press', 'Chest Press Machine', 'Hammer Strength Bench Press', 'Barbell Bench Press', 'Dips', 'Chest-Assisted Dip'] },
  incline: { main: true, c: ['Incline Dumbbell Press', 'Hammer Strength Incline Press', 'Incline Barbell Press', 'Dumbbell Bench Press', 'Chest Press Machine'] },
  vpush: { main: true, c: ['Dumbbell Shoulder Press', 'Machine Shoulder Press', 'Hammer Strength Iso Shoulder Press', 'Landmine Press', 'Overhead Press'] },
  hpull: { main: true, c: ['Seated Cable Row', 'Chest Supported Row', 'Machine Row', 'Hammer Strength Row', 'Single Arm Dumbbell Row', 'T-Bar Row'] },
  vpull: { main: true, c: ['Lat Pulldown', 'Assisted Pull-up', 'Hammer Strength High Row', 'Pull-up', 'Straight Arm Pulldown'] },
  legcurl: { c: ['Seated Leg Curl', 'Lying Leg Curl'] },
  quadiso: { c: ['Leg Extension'] },
  glute: { c: ['Hip Thrust', 'Glute Bridge', 'Cable Kickback', 'Abductor Machine'] },
  calf: { c: ['Standing Calf Raise', 'Seated Calf Raise', 'Leg Press Calf Raise'] },
  lateral: { c: ['Lateral Raise', 'Cable Lateral Raise', 'Arsenal Standing Lateral Raise'] },
  reardelt: { c: ['Face Pull', 'Reverse Pec Deck', 'Rear Delt Fly'] },
  chestiso: { c: ['Pec Deck', 'Cable Fly', 'Arsenal Laying Pec Fly'] },
  biceps: { c: ['Dumbbell Curl', 'Cable Curl', 'Hammer Curl', 'Life Fitness Bicep Curl', 'Barbell Curl'] },
  triceps: { c: ['Rope Pushdown', 'Cable Extension', 'Overhead Tricep Extension', 'Life Fitness Tricep Press', 'Assisted Dip'] },
  core: { c: ['Dead Bug', 'Plank', 'Lying Leg Raise', 'Pallof Press', 'Cable Crunch', 'Side Plank'] },
};

const TEMPLATES = {
  fullA: { title: 'Full Body A', focus: 'Squat + Press', slots: ['squat', 'hpush', 'hpull', 'legcurl', 'lateral', 'core'] },
  fullB: { title: 'Full Body B', focus: 'Hinge + Pull', slots: ['hinge', 'vpull', 'vpush', 'quadiso', 'biceps', 'core'] },
  fullC: { title: 'Full Body C', focus: 'Legs + Upper', slots: ['squat', 'incline', 'hpull', 'triceps', 'calf', 'reardelt'] },
  upper1: { title: 'Upper 1', focus: 'Press + Pull', slots: ['hpush', 'hpull', 'vpush', 'vpull', 'lateral', 'triceps', 'biceps', 'reardelt'] },
  lower1: { title: 'Lower 1', focus: 'Squat + Hamstrings', slots: ['squat', 'hinge', 'legcurl', 'quadiso', 'calf', 'core'] },
  upper2: { title: 'Upper 2', focus: 'Incline + Vertical Pull', slots: ['incline', 'vpull', 'hpull', 'vpush', 'reardelt', 'biceps', 'triceps', 'lateral'] },
  lower2: { title: 'Lower 2', focus: 'Hinge + Glutes', slots: ['hinge', 'squat', 'glute', 'legcurl', 'calf', 'core'] },
  push: { title: 'Push', focus: 'Chest + Shoulders + Triceps', slots: ['hpush', 'vpush', 'incline', 'lateral', 'chestiso', 'triceps'] },
  pull: { title: 'Pull', focus: 'Back + Biceps', slots: ['vpull', 'hpull', 'reardelt', 'biceps', 'core'] },
  legs: { title: 'Legs', focus: 'Quads + Hamstrings + Calves', slots: ['squat', 'hinge', 'legcurl', 'quadiso', 'calf', 'core'] },
};

const SPLITS = {
  1: ['fullA'],
  2: ['fullA', 'fullB'],
  3: ['fullA', 'fullB', 'fullC'],
  4: ['upper1', 'lower1', 'upper2', 'lower2'],
  5: ['upper1', 'lower1', 'push', 'pull', 'legs'],
};
const SPLIT_NAMES = {
  1: 'Single Full Body Day', 2: 'Two-Day Full Body', 3: 'Three-Day Full Body',
  4: 'Upper / Lower', 5: 'Upper / Lower + Push / Pull / Legs',
};

// ---- helpers ----------------------------------------------------------
const uniq = (arr) => [...new Set(arr)];
const isInt = (n) => Number.isInteger(n);

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  return v;
}
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// ---- validation -------------------------------------------------------
export function validateAnswers(answers) {
  const errors = [];
  const a = answers && typeof answers === 'object' ? answers : {};
  if (answers != null && typeof answers !== 'object') errors.push('answers must be an object');

  const n = {};
  if (a.goal == null) n.goal = null;
  else if (GOALS.includes(a.goal)) n.goal = a.goal;
  else { errors.push(`goal must be one of ${GOALS.join(', ')}`); n.goal = null; }

  if (a.experience == null) n.experience = null;
  else if (EXPERIENCES.includes(a.experience)) n.experience = a.experience;
  else { errors.push(`experience must be one of ${EXPERIENCES.join(', ')}`); n.experience = null; }

  if (a.availableDays == null) n.availableDays = null;
  else if (!Array.isArray(a.availableDays) || a.availableDays.some((d) => !isInt(d) || d < 0 || d > 6)) {
    errors.push('availableDays must be an array of integers 0 (Sunday) to 6 (Saturday)');
    n.availableDays = null;
  } else n.availableDays = uniq(a.availableDays).sort((x, y) => x - y);

  if (a.sessionMinutes == null) n.sessionMinutes = null;
  else if (typeof a.sessionMinutes !== 'number' || !Number.isFinite(a.sessionMinutes) || a.sessionMinutes < 15 || a.sessionMinutes > 240) {
    errors.push('sessionMinutes must be a number between 15 and 240');
    n.sessionMinutes = null;
  } else n.sessionMinutes = Math.round(a.sessionMinutes);

  n.unrecognisedEquipment = [];
  if (a.equipment == null) n.equipment = null;
  else if (!Array.isArray(a.equipment) || a.equipment.some((e) => typeof e !== 'string')) {
    errors.push('equipment must be an array of strings');
    n.equipment = null;
  } else {
    const cats = [];
    a.equipment.forEach((e) => {
      const c = EQUIP_ALIASES[e.trim().toLowerCase()];
      if (c) cats.push(c); else n.unrecognisedEquipment.push(e);
    });
    n.equipment = uniq(cats).sort();
  }

  const pref = a.preferences && typeof a.preferences === 'object' ? a.preferences : {};
  const strList = (v, label) => {
    if (v == null) return [];
    if (!Array.isArray(v) || v.some((s) => typeof s !== 'string')) { errors.push(`${label} must be an array of strings`); return []; }
    return uniq(v);
  };
  n.preferences = { avoid: strList(pref.avoid, 'preferences.avoid'), like: strList(pref.like, 'preferences.like') };

  const r = a.recent && typeof a.recent === 'object' ? a.recent : null;
  if (!r) n.recent = null;
  else {
    const w = r.lastTrainedWeeksAgo;
    if (w != null && (typeof w !== 'number' || !Number.isFinite(w) || w < 0)) errors.push('recent.lastTrainedWeeksAgo must be a non-negative number or null');
    n.recent = {
      lastTrainedWeeksAgo: typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : null,
      currentlyTraining: r.currentlyTraining === true,
      summary: typeof r.summary === 'string' ? r.summary : '',
    };
  }

  const rec = a.recovery && typeof a.recovery === 'object' ? a.recovery : null;
  if (!rec) n.recovery = { sleepHours: null, stress: null };
  else {
    if (rec.sleepHours != null && (typeof rec.sleepHours !== 'number' || rec.sleepHours < 0 || rec.sleepHours > 24)) errors.push('recovery.sleepHours must be a number 0-24 or null');
    if (rec.stress != null && !STRESS.includes(rec.stress)) errors.push('recovery.stress must be low, medium, high or null');
    n.recovery = {
      sleepHours: typeof rec.sleepHours === 'number' && rec.sleepHours >= 0 && rec.sleepHours <= 24 ? rec.sleepHours : null,
      stress: STRESS.includes(rec.stress) ? rec.stress : null,
    };
  }

  if (a.limitations == null) n.limitations = null;
  else if (!Array.isArray(a.limitations)) { errors.push('limitations must be an array'); n.limitations = null; }
  else {
    n.limitations = [];
    a.limitations.forEach((l, i) => {
      if (!l || typeof l !== 'object' || !AREAS.includes(l.area)) { errors.push(`limitations[${i}].area must be one of ${AREAS.join(', ')}`); return; }
      n.limitations.push({ area: l.area, note: typeof l.note === 'string' ? l.note : '', clinicianRestriction: l.clinicianRestriction === true });
    });
  }

  n.units = a.units === 'imperial' ? 'imperial' : 'metric';
  // `scan` (and any other unknown field) is deliberately not copied.
  return { ok: errors.length === 0, errors, normalized: n };
}

// ---- day selection ----------------------------------------------------
// Choose `count` of the available days, maximising the smallest circular gap
// (rest between sessions), then the evenness of the gaps; ties resolve to the
// lexicographically first set so the result is deterministic.
export function pickTrainingDays(available, count) {
  const days = uniq(available).sort((a, b) => a - b);
  if (count >= days.length) return days;
  let best = null;
  const combo = (start, chosen) => {
    if (chosen.length === count) {
      const gaps = chosen.map((d, i) => ((chosen[(i + 1) % count] - d + 7) % 7) || 7);
      const score = [Math.min(...gaps), -gaps.reduce((s, g) => s + g * g, 0)];
      if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) best = { chosen: [...chosen], score };
      return;
    }
    for (let i = start; i < days.length; i += 1) combo(i + 1, [...chosen, days[i]]);
  };
  combo(0, []);
  return best.chosen;
}

// ---- generation -------------------------------------------------------
// opts.now is accepted for API symmetry but unused: output is deterministic.
export function generatePlan(answers, opts = {}) {
  void opts;
  const v = validateAnswers(answers);
  if (!v.ok) {
    const e = new Error(`Invalid onboarding answers: ${v.errors.join('; ')}`);
    e.errors = v.errors;
    throw e;
  }
  const n = v.normalized;
  const missing = [];
  const warnings = [];
  const rationale = [];

  // defaults + missing
  const goal = n.goal || 'general';
  if (!n.goal) missing.push('Training goal (defaulted to general fitness).');
  const experience = n.experience || 'new';
  if (!n.experience) missing.push('Training experience (assumed new, the most cautious setting).');
  const equipmentGiven = !!(n.equipment && n.equipment.length);
  const equipment = equipmentGiven ? n.equipment : ['bodyweight', 'dumbbell'];
  if (!equipmentGiven) missing.push('Available equipment (using a bodyweight and dumbbell fallback).');
  const equipSet = new Set([...equipment, 'bodyweight']);
  let available = n.availableDays;
  if (!available || !available.length) {
    available = [1, 3, 5];
    missing.push('Which days you can train (defaulted to Monday, Wednesday, Friday).');
  }
  let sessionMinutes = n.sessionMinutes;
  if (!sessionMinutes) { sessionMinutes = 45; missing.push('Time available per session (assumed 45 minutes).'); }
  if (!n.recent) missing.push('Recent training history (how long since you last trained).');
  if (n.recovery.sleepHours == null) missing.push('Typical sleep hours.');
  if (n.recovery.stress == null) missing.push('Current stress level.');
  if (n.limitations == null) missing.push('Injuries, pain or limitations (none were recorded).');
  if (n.unrecognisedEquipment.length) warnings.push(`Unrecognised equipment ignored: ${n.unrecognisedEquipment.join(', ')}.`);
  const limitations = n.limitations || [];

  // conservative?
  const recent = n.recent;
  const weeksOff = recent ? recent.lastTrainedWeeksAgo : null;
  const insufficientHistory = !recent || (!recent.currentlyTraining && weeksOff == null);
  const clinician = limitations.some((l) => l.clinicianRestriction);
  const reasons = [];
  if (experience === 'new') reasons.push('you are new to lifting');
  if (experience === 'returning') reasons.push('you are returning to training');
  if (insufficientHistory && experience !== 'new' && experience !== 'returning') reasons.push('your recent training history is not known');
  if (clinician) reasons.push('a clinician restriction is on record');
  const conservative = reasons.length > 0;
  const deload = experience === 'returning' && weeksOff != null && weeksOff >= 8;

  // days
  const maxDays = conservative ? 3 : (experience === 'advanced' ? 5 : 4);
  const want = Math.min(available.length, maxDays);
  const trainingDows = pickTrainingDays(available, want);
  const count = trainingDows.length;
  const templates = SPLITS[count];
  if (available.length > count) {
    const why = conservative
      ? 'a conservative start caps training at 3 days a week'
      : experience === 'advanced' ? 'five hard days is the ceiling here'
        : 'four days covers each muscle about twice a week, and more adds fatigue faster than results';
    rationale.push(`You listed ${available.length} available days but the plan uses ${count}: ${why}. The other days stay rest or easy walking.`);
  }
  const splitWhy = count <= 3
    ? 'Full body sessions train every muscle several times a week, so a missed day costs little.'
    : count === 4 ? 'Upper/lower hits each muscle twice a week with a day of recovery between like sessions.'
      : 'An upper/lower start then push/pull/legs fits five days without repeating the same muscles on back-to-back days.';
  rationale.push(`Split: ${SPLIT_NAMES[count]} on ${trainingDows.map((d) => DAY_SHORT[d]).join(', ')}. ${splitWhy}`);
  if (count > 1) {
    const gaps = trainingDows.map((d, i) => ((trainingDows[(i + 1) % count] - d + 7) % 7) || 7);
    rationale.push(Math.min(...gaps) >= 2
      ? 'Training days were chosen from your available days to leave at least one rest day between sessions.'
      : 'Some sessions fall on consecutive days because of the days you have available.');
  }
  if (conservative) rationale.push(`Conservative settings are on because ${reasons.join(' and ')}: 2-3 sets per exercise, effort held at about 7-8 out of 10 with reps left in reserve, no failure, no drop sets or finishers.`);
  if (deload) rationale.push(`You last trained about ${Math.round(weeksOff)} weeks ago, so the first two weeks should run one set lighter than written (stop each exercise with 3+ reps in reserve) before moving to the listed sets.`);

  // volume modifiers
  const lowSleep = n.recovery.sleepHours != null && n.recovery.sleepHours < 6;
  const poorRecovery = lowSleep || n.recovery.stress === 'high';
  if (poorRecovery) {
    const why = [];
    if (lowSleep) why.push(`sleep of ${n.recovery.sleepHours}h`);
    if (n.recovery.stress === 'high') why.push('high stress');
    rationale.push(`Sets are reduced by one per exercise because of ${why.join(' and ')}: recovery capacity limits how much training you can absorb.`);
  }
  const cut = poorRecovery ? 1 : 0;
  const mainSets = Math.max(2, (conservative ? 3 : experience === 'advanced' ? 4 : 3) - cut);
  const accSets = Math.max(2, (conservative ? 2 : (goal === 'muscle' || goal === 'recomp') ? 3 : 2) - cut);
  const mainRpe = conservative ? 7 : 8;
  const accRpe = conservative ? 8 : 9;
  const strengthBias = goal === 'strength' && !conservative;
  const mainReps = strengthBias ? [4, 6] : goal === 'fat-loss' ? [8, 12] : [6, 10];
  const accReps = goal === 'fat-loss' ? [12, 15] : [10, 15];
  const mainRest = conservative ? 120 : strengthBias ? 180 : 150;
  const accRest = 75;
  rationale.push(`Goal ${goal}: main lifts at ${mainReps[0]}-${mainReps[1]} reps with ${mainRest}s rest, accessories at ${accReps[0]}-${accReps[1]} reps with ${accRest}s rest.`);

  // exercise pool
  const avoidSet = new Set(n.preferences.avoid);
  const likeSet = new Set(n.preferences.like);
  const maxDiff = EXP_MAX_DIFF[experience];
  const limitFilters = limitations.map((l) => ({ area: l.area, ...LIMITATION_MAP[l.area] }));
  const limitedBy = (name) => {
    const meta = EXERCISES[name];
    const f = limitFilters.find((x) => x.loads(name, meta));
    return f ? f.area : null;
  };
  const baseOk = (name) => {
    const meta = EXERCISES[name];
    if (!meta) return false;
    const cat = eqCategory(name);
    return !!cat && equipSet.has(cat) && DIFF_RANK[meta.diff] <= maxDiff && !avoidSet.has(name);
  };
  const swapNotes = new Set();
  const dropNotes = new Set();
  const candidatesFor = (slotId) => {
    const all = SLOTS[slotId].c.filter(baseOk);
    const ok = [];
    all.forEach((name) => {
      if (!limitedBy(name)) { if (!ok.includes(name)) ok.push(name); return; }
      // the library's own substitute, if it is allowed and unloaded
      const sub = (EXERCISES[name] || {}).sub;
      if (sub && baseOk(sub) && !limitedBy(sub) && !ok.includes(sub)) ok.push(sub);
    });
    const ordered = [...ok.filter((x) => likeSet.has(x)), ...ok.filter((x) => !likeSet.has(x))];
    const first = all[0];
    if (first && limitedBy(first)) {
      if (ordered.length) swapNotes.add(`${first} was replaced by ${ordered[0]} because the ${limitedBy(first)} limitation applies to it.`);
      else dropNotes.add(`The ${slotId} slot was dropped: no available exercise avoids the ${limitedBy(first)} limitation.`);
    } else if (!ordered.length) dropNotes.add(`The ${slotId} slot was dropped: no exercise matches your equipment and preferences.`);
    return ordered;
  };

  // choose exercises per training day
  const trainingByDow = {};
  trainingDows.forEach((dow, i) => {
    const tKey = templates[i];
    const t = TEMPLATES[tKey];
    const chosen = [];
    const used = new Set();
    t.slots.forEach((slotId) => {
      const cands = candidatesFor(slotId).filter((x) => !used.has(x));
      if (!cands.length) return;
      // full-body days rotate main lifts so each day is not a copy of the last
      const rotate = count <= 3 && i >= 1 && SLOTS[slotId].main && cands.length > 1 ? 1 : 0;
      const pick = cands[rotate];
      used.add(pick);
      chosen.push({ slotId, name: pick });
    });
    trainingByDow[dow] = { tKey, t, chosen };
  });

  // blocks, trimmed to the session length
  const WORK_SEC = 40;
  const WARMUP_MIN = 5;
  const minutesOf = (setsN, rest) => (setsN * (WORK_SEC + rest)) / 60;
  const maxBlocks = Math.max(2, Math.min(8, Math.floor(sessionMinutes / 9)));
  const programDays = {};
  let estMax = 0;
  const trainSet = new Set(trainingDows);
  let restIdx = 0;
  for (let dow = 0; dow <= 6; dow += 1) {
    if (!trainSet.has(dow)) {
      restIdx += 1;
      programDays[dow] = {
        key: restIdx === 1 ? 'rest' : `rest${restIdx}`, title: 'Rest', focus: 'Recovery', dayType: 'rest', intensity: 'Easy',
        blocks: [], conditioning: [goal === 'fat-loss' ? '25 min easy walk (optional)' : '20 min easy walk (optional)'],
        mobility: [], sport: [], notes: 'A day off from lifting. Easy walking is welcome.',
      };
      continue;
    }
    const { tKey, t, chosen } = trainingByDow[dow];
    const blocks = [];
    let est = WARMUP_MIN;
    chosen.forEach(({ slotId, name }, idx) => {
      const isMain = !!SLOTS[slotId].main && idx < 3;
      const timed = !!EXERCISES[name].timed || name === 'Plank' || name === 'Side Plank';
      const sets = isMain ? mainSets : accSets;
      const rest = isMain ? mainRest : accRest;
      const [lo, hi] = timed ? [0, 0] : isMain ? mainReps : accReps;
      const e = minutesOf(sets, rest);
      if (blocks.length >= maxBlocks || est + e > sessionMinutes) return;
      est += e;
      const note = timed ? 'Hold for time, stop before form breaks'
        : isMain ? `Main lift. Leave ${10 - mainRpe}+ reps in reserve` : 'Controlled reps, stop short of failure';
      blocks.push(single(name, sets, lo, hi, isMain ? mainRpe : accRpe, rest, '2-1-1', note));
    });
    if (blocks.length < chosen.length) {
      rationale.push(`${t.title}: ${chosen.length - blocks.length} lower-priority exercise(s) were cut so the session fits ${sessionMinutes} minutes (about 9 minutes per exercise including rest).`);
    }
    if (blocks.length < 3) warnings.push(`${t.title} has only ${blocks.length} exercise(s); consider more time, equipment or fewer exclusions.`);
    est = Math.min(Math.round(est), sessionMinutes);
    estMax = Math.max(estMax, est);
    programDays[dow] = {
      key: tKey, title: t.title, focus: t.focus, dayType: 'training',
      intensity: conservative ? 'Moderate' : count >= 4 ? 'Hard' : 'Moderate',
      blocks, conditioning: goal === 'fat-loss' ? ['10-15 min easy walk'] : [], mobility: [], sport: [],
      notes: deload ? 'First two weeks: do one set fewer than written on every exercise.' : '',
    };
  }

  // choices report
  if (avoidSet.size) rationale.push(`Exercises you asked to avoid are excluded: ${[...avoidSet].join(', ')}.`);
  if (likeSet.size) rationale.push('Exercises you like are preferred when they fit the pattern and your equipment.');
  const levelText = maxDiff === 0 ? ' and are beginner level' : maxDiff === 1 ? ' and are beginner to intermediate level' : '';
  rationale.push(`Equipment used: ${[...equipSet].join(', ')}. Only library exercises that match this equipment${levelText} are used.`);
  limitFilters.forEach((f) => rationale.push(`Limitation (${f.area}): ${f.why}; exercises that load it were removed or swapped. Your note is stored as written and was not interpreted.`));
  swapNotes.forEach((s) => rationale.push(s));
  dropNotes.forEach((s) => rationale.push(s));
  rationale.push(`Each session is capped at ${sessionMinutes} minutes (estimated about ${estMax} including a 5 minute warm-up).`);
  if (goal === 'fat-loss') rationale.push('Fat loss: strength work is kept to protect muscle, with easy walking on rest days rather than extra hard sessions.');

  // warnings
  if (clinician) warnings.push('This plan is not medical clearance. A clinician restriction is on record: review the plan with your clinician before starting.');
  if (limitations.length) warnings.push('Stop an exercise if it causes pain and have it assessed. Reported limitations were handled by area only; notes were not interpreted.');
  if (limitations.some((l) => l.area === 'other')) warnings.push('A limitation in an area not on the list was recorded but nothing was removed for it. Check each exercise against it yourself.');
  if (equipSet.size === 1) warnings.push('Bodyweight only leaves few exercises in the library (no rows or pulldowns); add dumbbells, bands or a gym to balance pulling work.');
  if (!equipmentGiven) warnings.push('No equipment was given, so a bodyweight and dumbbell fallback was used.');

  const program = {
    name: `${SPLIT_NAMES[count]} (${goal})`,
    rationale: rationale.join(' '),
    days: programDays,
  };
  return {
    program,
    summary: { trainingDays: count, weeklySetsByMuscle: weeklySetsByMuscle(program), estimatedMinutesPerSession: estMax },
    rationale,
    missing,
    warnings,
    conservative,
    inputsHash: fnv1a(JSON.stringify(canonical(n))),
    normalized: n,
  };
}
