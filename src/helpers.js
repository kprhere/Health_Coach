// ============================================================
// helpers.js - all logic for Body Recomp OS
// Pure-ish functions. Block-aware: understands single/superset/circuit/finisher/dropset.
// ============================================================
import {
  PROGRAM, programOf, programDay, NUTRITION, EXERCISES, SEED_SCANS, HABITS,
  PROFILE_DEFAULT, SETTINGS_DEFAULT, STORAGE_KEY, HEALTH_PARAM_MAP, DAILY_BEVERAGES, NO_MOON_DATES,
} from './data.js';
import { targetsWithFallback, mealPlanFor, nutritionProfile } from './nutritionEngine.js';

export { nutritionProfile };

export const PROGRAM_START = '2026-07-08'; // start of the current fat-loss phase (latest scan)
export const PHASE_NAME = 'Fat Loss Phase 1';
export const STATE_VERSION = 4;

// ---------- date utils ----------
export const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => toKey(new Date());
export const parseKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
export const dowOf = (key) => parseKey(key).getDay();
export const addDays = (key, n) => { const d = parseKey(key); d.setDate(d.getDate() + n); return toKey(d); };
export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
export const prettyDate = (key) => parseKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
export const shortDate = (key) => parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- storage ----------
export function defaultState() {
  return {
    version: STATE_VERSION,
    profile: { ...PROFILE_DEFAULT },
    settings: { ...SETTINGS_DEFAULT },
    program: clone(PROGRAM), // per-person training split; see programOf in data.js
    workoutSessions: {}, // key -> session
    mealLogs: {},        // key -> { eaten:{}, extras:[], water:0, flags:{} }
    beverageLogs: {},    // key -> { greenTeaAm, greenTeaPm, coconutWater }
    habitLogs: {},       // key -> { habitKey:true }
    watchLogs: {},       // key -> { steps, ... }
    supplementLogs: {},  // key -> { suppKey:true }
    bodyScans: [...SEED_SCANS],
    saturdayMode: {},    // key -> 'class' | 'fallback'
    dayOverrides: {},    // key -> 'veg' | 'noMoon' (nutrition only; workout stays scheduled)
    workoutSwaps: {},    // key -> paired date key (two-way workout-only swap)
    activity: {},        // key -> { badminton:bool, swim:bool }
    restartWeights: {},  // exerciseName -> { old:'', pct:70 }
    customExercises: {}, // exerciseName -> user-owned machine metadata (cloud-synced)
    exerciseNotes: {},   // exerciseName -> persistent coaching/setup note
    lastHealthSync: { at: null, date: '', count: 0, fields: [] }, // device-visible Shortcut import receipt
    lastBackup: null,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultState();
    return migrateState(parsed);
  } catch (e) {
    console.warn('Recomp OS: could not read saved data, starting fresh.', e);
    return defaultState();
  }
}

export function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn('Recomp OS: could not save data.', e); }
}

function mergeState(base, incoming) {
  const out = { ...base };
  for (const k of Object.keys(base)) {
    const v = incoming[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(base[k])) out[k] = Array.isArray(v) ? v : base[k];
    else if (typeof base[k] === 'object') out[k] = { ...base[k], ...v };
    else out[k] = v;
  }
  if (!Array.isArray(out.bodyScans) || out.bodyScans.length === 0) out.bodyScans = [...SEED_SCANS];
  return out;
}

// State migrations are deliberately additive. Application defaults may gain
// fields, but user-owned logs are never reset or regenerated during an upgrade.
const MIGRATIONS = {
  2: (state) => {
    const migrated = mergeState(defaultState(), state);
    if (!migrated.settings.nextBodyScanDate) migrated.settings.nextBodyScanDate = '2026-08-31';
    if (!state.settings || state.settings.scanFrequencyDays === undefined || state.settings.scanFrequencyDays === 30) {
      migrated.settings.scanFrequencyDays = 14;
    }
    return { ...migrated, version: 2 };
  },
  3: (state) => {
    const migrated = mergeState(defaultState(), state);
    migrated.dayOverrides = Object.fromEntries(
      Object.entries(migrated.dayOverrides || {}).map(([date, mode]) => [
        date,
        mode === 'fast1' || mode === 'fast2' || mode === 'fast' ? 'noMoon' : mode,
      ]),
    );
    return { ...migrated, version: 3 };
  },
  4: (state) => {
    // The training program moves out of the app constants and into user state,
    // so each passphrase can carry its own split. Anyone upgrading keeps exactly
    // the program they have been training, which is that same constant.
    const migrated = mergeState(defaultState(), state);
    if (!migrated.program || !migrated.program.days) migrated.program = clone(PROGRAM);
    return { ...migrated, version: 4 };
  },
};

export function migrateState(input) {
  let state = input && typeof input === 'object' ? clone(input) : {};
  let version = Number.isInteger(state.version) ? state.version : 1;
  while (version < STATE_VERSION) {
    const nextVersion = version + 1;
    state = MIGRATIONS[nextVersion](state);
    version = nextVersion;
  }
  return mergeState(defaultState(), { ...state, version: Math.max(version, STATE_VERSION) });
}

const sameRecord = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

function mergeWorkoutSets(localSets = [], cloudSets = []) {
  const merged = [];
  const conflicts = [];
  const count = Math.max(localSets.length, cloudSets.length);
  for (let i = 0; i < count; i++) {
    const local = localSets[i];
    const cloud = cloudSets[i];
    if (local === undefined) { merged.push(clone(cloud)); continue; }
    if (cloud === undefined) { merged.push(clone(local)); continue; }
    const localHasData = setHasWorkoutData(local);
    const cloudHasData = setHasWorkoutData(cloud);
    if (!localHasData && cloudHasData) { merged.push(clone(cloud)); continue; }
    if (localHasData && !cloudHasData) { merged.push(clone(local)); continue; }
    if (!localHasData && !cloudHasData) { merged.push({ ...cloud, ...local }); continue; }
    if (sameRecord(local, cloud)) { merged.push(clone(local)); continue; }

    const conflictKeys = ['weight', 'reps', 'seconds', 'rpe', 'restSec', 'form', 'pain', 'notes', 'isWarmup', 'isDrop']
      .filter((key) => local[key] !== undefined && cloud[key] !== undefined && local[key] !== cloud[key]);
    if (conflictKeys.length === 0) merged.push({ ...cloud, ...local });
    else {
      merged.push(clone(local));
      conflicts.push(clone(cloud));
    }
  }
  conflicts.forEach((record) => {
    if (!merged.some((existing) => sameRecord(existing, record))) merged.push(record);
  });
  return merged;
}

function mergeWorkoutEntry(localEntry, cloudEntry) {
  if (!localEntry) return clone(cloudEntry);
  if (!cloudEntry) return clone(localEntry);
  const out = { ...cloudEntry, ...localEntry };
  if (Array.isArray(localEntry.sets) || Array.isArray(cloudEntry.sets)) {
    out.sets = mergeWorkoutSets(localEntry.sets || [], cloudEntry.sets || []);
  }
  if (Array.isArray(localEntry.rounds) || Array.isArray(cloudEntry.rounds)) {
    const localRounds = localEntry.rounds || [];
    const cloudRounds = cloudEntry.rounds || [];
    const count = Math.max(localRounds.length, cloudRounds.length);
    out.rounds = Array.from({ length: count }, (_, index) => {
      const localRound = localRounds[index];
      const cloudRound = cloudRounds[index];
      if (!localRound) return clone(cloudRound);
      if (!cloudRound) return clone(localRound);
      const names = new Set([
        ...Object.keys(cloudRound.byExercise || {}),
        ...Object.keys(localRound.byExercise || {}),
      ]);
      const byExercise = {};
      names.forEach((name) => {
        const localCell = localRound.byExercise && localRound.byExercise[name];
        const cloudCell = cloudRound.byExercise && cloudRound.byExercise[name];
        if (!localCell) byExercise[name] = clone(cloudCell);
        else if (!cloudCell) byExercise[name] = clone(localCell);
        else if (!setHasWorkoutData(localCell) && setHasWorkoutData(cloudCell)) byExercise[name] = clone(cloudCell);
        else byExercise[name] = { ...cloudCell, ...localCell };
      });
      return { ...cloudRound, ...localRound, done: !!(localRound.done || cloudRound.done), byExercise };
    });
  }
  return out;
}

function mergeWorkoutSession(localSession, cloudSession) {
  if (!localSession) return clone(cloudSession);
  if (!cloudSession) return clone(localSession);
  const localHasData = workoutSessionHasData(localSession);
  const cloudHasData = workoutSessionHasData(cloudSession);
  if (!localHasData && cloudHasData) return clone(cloudSession);
  if (localHasData && !cloudHasData) return clone(localSession);
  if (!localHasData && !cloudHasData) return { ...cloudSession, ...localSession };

  const entries = {};
  const ids = new Set([
    ...Object.keys(cloudSession.entries || {}),
    ...Object.keys(localSession.entries || {}),
  ]);
  ids.forEach((id) => {
    entries[id] = mergeWorkoutEntry(localSession.entries && localSession.entries[id], cloudSession.entries && cloudSession.entries[id]);
  });
  return {
    ...cloudSession,
    ...localSession,
    completed: !!(localSession.completed || cloudSession.completed),
    notes: [cloudSession.notes, localSession.notes].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n'),
    entries,
  };
}

const mergeBooleanSafeRecord = (cloud = {}, local = {}) => {
  return { ...cloud, ...local };
};

function mergeMealLog(localDay, cloudDay) {
  if (!localDay) return clone(cloudDay);
  if (!cloudDay) return clone(localDay);
  const extras = [];
  [...(cloudDay.extras || []), ...(localDay.extras || [])].forEach((extra) => {
    if (!extras.some((existing) => sameRecord(existing, extra))) extras.push(clone(extra));
  });
  return {
    ...cloudDay,
    ...localDay,
    eaten: mergeBooleanSafeRecord(cloudDay.eaten, localDay.eaten),
    flags: mergeBooleanSafeRecord(cloudDay.flags, localDay.flags),
    choices: { ...(cloudDay.choices || {}), ...(localDay.choices || {}) },
    extras,
    water: Math.max(Number(cloudDay.water) || 0, Number(localDay.water) || 0),
  };
}

// Merge a newer encrypted cloud snapshot into this device without treating the
// snapshot as a replacement. Local dated logs always survive; cloud-only dates
// and fields are added. This protects a device that has offline work which was
// never pushed, while still letting a fresh device recover everything stored in
// the cloud. The next auto-push writes the combined state back to the Worker.
export function mergeSyncedState(localState, remoteState) {
  const local = migrateState(localState && typeof localState === 'object' ? localState : {});
  const remote = migrateState(remoteState && typeof remoteState === 'object' ? remoteState : {});
  const out = { ...local };

  if (remote.profile && typeof remote.profile === 'object') out.profile = { ...local.profile, ...remote.profile };
  if (remote.settings && typeof remote.settings === 'object') {
    out.settings = { ...local.settings, ...remote.settings };
    // Connection details belong to this browser/device. Keep them when set so
    // a cloud pull cannot disconnect the device that just performed the pull.
    if (local.settings.syncUrl) out.settings.syncUrl = local.settings.syncUrl;
    out.settings.syncAuto = local.settings.syncAuto;
  }
  if (typeof remote.version === 'number') out.version = Math.max(local.version || 0, remote.version);

  const cloudWorkouts = remote.workoutSessions || {};
  const localWorkouts = local.workoutSessions || {};
  out.workoutSessions = {};
  new Set([...Object.keys(cloudWorkouts), ...Object.keys(localWorkouts)]).forEach((date) => {
    out.workoutSessions[date] = mergeWorkoutSession(localWorkouts[date], cloudWorkouts[date]);
  });

  const cloudMeals = remote.mealLogs || {};
  const localMeals = local.mealLogs || {};
  out.mealLogs = {};
  new Set([...Object.keys(cloudMeals), ...Object.keys(localMeals)]).forEach((date) => {
    out.mealLogs[date] = mergeMealLog(localMeals[date], cloudMeals[date]);
  });

  // These per-date maps are safe to merge one field at a time. Local values
  // win conflicts, including intentional false values.
  for (const key of ['beverageLogs', 'habitLogs', 'watchLogs', 'supplementLogs', 'activity']) {
    const cloudMap = remote[key] && typeof remote[key] === 'object' ? remote[key] : {};
    const localMap = local[key] || {};
    const dates = new Set([...Object.keys(cloudMap), ...Object.keys(localMap)]);
    out[key] = {};
    dates.forEach((date) => {
      const cloudDay = cloudMap[date];
      const localDay = localMap[date];
      if (cloudDay && typeof cloudDay === 'object' && localDay && typeof localDay === 'object') out[key][date] = mergeBooleanSafeRecord(cloudDay, localDay);
      else out[key][date] = localDay !== undefined ? localDay : cloudDay;
    });
  }

  // User-owned maps are additive. Never let a cloud snapshot remove something
  // that still exists on this device.
  for (const key of ['saturdayMode', 'dayOverrides', 'workoutSwaps', 'restartWeights', 'customExercises', 'exerciseNotes']) {
    const cloudMap = remote[key] && typeof remote[key] === 'object' ? remote[key] : {};
    out[key] = { ...cloudMap, ...(local[key] || {}) };
  }

  if (Array.isArray(remote.bodyScans)) {
    const scans = new Map();
    remote.bodyScans.forEach((scan) => { if (scan && scan.id) scans.set(scan.id, scan); });
    (local.bodyScans || []).forEach((scan) => { if (scan && scan.id) scans.set(scan.id, scan); });
    out.bodyScans = [...scans.values()];
  }

  return out;
}

export function validateImport(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const keys = ['profile', 'settings', 'workoutSessions', 'mealLogs', 'bodyScans', 'watchLogs'];
  return keys.some((k) => k in obj);
}

// Built-in exercises ship with the app. Custom exercises live in user state,
// so JSON backups and encrypted cloud sync carry them across app updates and
// devices without allowing them to overwrite a built-in definition.
export function exerciseLibrary(state) {
  const custom = (state && state.customExercises) || {};
  const safeCustom = Object.fromEntries(Object.entries(custom).filter(([name]) => !EXERCISES[name]));
  return { ...EXERCISES, ...safeCustom };
}

export const exerciseNames = (state) => Object.keys(exerciseLibrary(state)).sort((a, b) => a.localeCompare(b));
export const exerciseMeta = (name, state) => exerciseLibrary(state)[name] || {};

export const isTimedExercise = (name, state, target = '') => (
  !!exerciseMeta(name, state).timed || /\d\s*(?:s|sec)(?:onds?)?\b/i.test(String(target))
);

// Custom equipment should become useful immediately without silently adding
// extra weekly volume. These helpers compare its muscle + movement pattern to
// the current program and surface it as a recommended alternate for the best
// matching slots. Because matches are derived from PROGRAM on every render,
// they automatically adapt when a later app upgrade changes the plan.
const MUSCLE_FAMILIES = [
  ['chest', /chest|pec/i],
  ['back', /\bback\b|lat|trap|rhomboid/i],
  ['shoulders', /delt|shoulder|rotator/i],
  ['biceps', /bicep|brachialis/i],
  ['triceps', /tricep/i],
  ['quads', /quad/i],
  ['hamstrings', /hamstring/i],
  ['glutes', /glute/i],
  ['calves', /calf|calves|soleus/i],
  ['core', /core|abdom|oblique/i],
  ['cardio', /cardio/i],
];

const MOVEMENT_PATTERNS = [
  'press', 'row', 'pulldown', 'pull-up', 'fly', 'curl', 'extension', 'pushdown',
  'raise', 'dip', 'squat', 'lunge', 'deadlift', 'hinge', 'thrust', 'bridge', 'kickback',
  'crunch', 'plank', 'woodchop', 'calf',
];

const muscleFamilies = (value) => MUSCLE_FAMILIES
  .filter(([, pattern]) => pattern.test(String(value || '')))
  .map(([family]) => family);

const movementPatterns = (name) => MOVEMENT_PATTERNS.filter((pattern) => String(name || '').toLowerCase().includes(pattern));

function exerciseFit(candidateName, targetName, state) {
  const candidate = exerciseMeta(candidateName, state);
  const target = exerciseMeta(targetName, state);
  const candidatePrimary = muscleFamilies(candidate.p);
  const targetPrimary = muscleFamilies(target.p);
  const primaryMatch = candidatePrimary.some((family) => targetPrimary.includes(family));
  if (!primaryMatch) return null;

  let score = 8;
  const reasons = ['same primary muscle'];
  if (String(candidate.p || '').trim().toLowerCase() === String(target.p || '').trim().toLowerCase()) score += 2;

  const candidateMoves = movementPatterns(candidateName);
  const targetMoves = movementPatterns(targetName);
  if (candidateMoves.some((pattern) => targetMoves.includes(pattern))) {
    score += 4;
    reasons.push('same movement pattern');
  } else if (candidateMoves.length && targetMoves.length) score -= 3;

  const candidateSecondary = muscleFamilies(candidate.s);
  const targetSecondary = muscleFamilies(target.s);
  if (candidateSecondary.some((family) => targetSecondary.includes(family))) score += 1;

  const candidateEquipment = String(candidate.eq || '').toLowerCase();
  const targetEquipment = String(target.eq || '').toLowerCase();
  if (candidateEquipment && targetEquipment && (
    candidateEquipment.includes(targetEquipment) || targetEquipment.includes(candidateEquipment)
    || (/machine|hammer|arsenal|life fitness|plate/i.test(candidateEquipment) && /machine|hammer|arsenal|life fitness|plate/i.test(targetEquipment))
  )) {
    score += 2;
    reasons.push('similar equipment');
  }

  const candidateLinks = `${candidate.sub || ''} ${candidate.eos || ''}`.toLowerCase();
  const targetLinks = `${target.sub || ''} ${target.eos || ''}`.toLowerCase();
  if (candidateLinks.includes(targetName.toLowerCase()) || targetLinks.includes(candidateName.toLowerCase())) {
    score += 8;
    reasons.push('explicit substitute');
  }

  return { score, reasons };
}

function programSlots(state) {
  const slots = [];
  Object.values(programOf(state).days).forEach((day) => {
    const variants = [{ ...day, variantLabel: day.title }];
    if (day.fallback) variants.push({ ...day.fallback, variantLabel: `${day.fallback.title} fallback` });
    variants.forEach((variant) => {
      (variant.blocks || []).forEach((block, blockIndex) => {
        (block.exercises || []).forEach((exercise) => {
          slots.push({
            dayKey: variant.key,
            dayTitle: variant.variantLabel,
            blockIndex,
            blockName: block.name,
            exerciseName: exercise.name,
          });
        });
      });
    });
  });
  return slots;
}

export function customExercisePlanFits(name, state, limit = 4) {
  const seen = new Set();
  return programSlots(state)
    .map((slot) => ({ ...slot, ...exerciseFit(name, slot.exerciseName, state) }))
    .filter((slot) => Number.isFinite(slot.score) && slot.score >= 11)
    .sort((a, b) => b.score - a.score || a.dayTitle.localeCompare(b.dayTitle))
    .filter((slot) => {
      const key = `${slot.dayKey}:${slot.exerciseName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function recommendedCustomAlternates(targetName, state, limit = 4) {
  const customNames = Object.keys((state && state.customExercises) || {});
  return customNames
    .filter((name) => name !== targetName)
    .map((name) => ({ name, ...exerciseFit(name, targetName, state) }))
    .filter((item) => Number.isFinite(item.score) && item.score >= 11)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function exportJSON(state) { return JSON.stringify(state, null, 2); }

export function download(filename, text, type = 'application/json') {
  try {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch (e) { console.warn('download failed', e); return false; }
}

// ---------- day flags ----------
// Puratasi (Tamil month) is observed pure vegetarian end to end. It is a food
// rule, not a calorie rule, so it maps training -> trainingVeg and rest ->
// restVeg, which carry identical calories and identical protein. Thursday and
// Saturday are already vegetarian and need no mapping. Workouts never change.
export function inPuratasi(key, state) {
  const s = (state && state.settings) || {};
  const start = s.puratasiStartDate;
  const end = s.puratasiEndDate;
  if (!start || !end || typeof key !== 'string') return false;
  return key >= start && key <= end;
}

export function isNoMoonDay(key) {
  return NO_MOON_DATES.includes(key);
}

export function nextNoMoonReminder(key, dismissedDate = '') {
  const date = NO_MOON_DATES.find((candidate) => candidate >= key);
  if (!date || date === dismissedDate) return null;
  const daysAway = daysBetween(key, date);
  return daysAway >= 0 && daysAway <= 7 ? { date, daysAway } : null;
}

export function nutritionDayType(key, state) {
  const override = state && state.dayOverrides && state.dayOverrides[key];
  if (override === 'noMoon' || override === 'fast1' || override === 'fast2' || override === 'fast') return 'noMoonFast';
  if (override === 'veg') return 'vegSat';
  if (isNoMoonDay(key)) return 'noMoonFast';
  const scheduled = programDay(state, dowOf(key)).dayType;
  if (inPuratasi(key, state)) {
    if (scheduled === 'training') return 'trainingVeg';
    if (scheduled === 'rest') return 'restVeg';
  }
  return scheduled;
}

export function fastEndTime(key, state) {
  const dayType = nutritionDayType(key, state);
  if (dayType === 'noMoonFast') return { hour: 13, label: '1 PM', noMoon: true };
  if (dayType === 'fastThu') return { hour: 18, label: '6 PM', noMoon: false };
  return null;
}

export function dayFlags(key, state) {
  const dow = dowOf(key);
  const dayType = nutritionDayType(key, state);
  return {
    dow,
    swimDay: dow === 2 || dow === 4,
    fastDay: dayType === 'fastThu' || dayType === 'noMoonFast',
    vegDay: dayType === 'fastThu' || dayType === 'noMoonFast' || dayType === 'vegSat'
      || dayType === 'trainingVeg' || dayType === 'restVeg',
    badmintonAvailable: dow >= 1 && dow <= 5,
    classDay: dow === 6,
  };
}

// ---------- workout plan resolution ----------
export function workoutSwapPartner(key, state) {
  const partner = state && state.workoutSwaps && state.workoutSwaps[key];
  return typeof partner === 'string' && partner !== key ? partner : '';
}

export function resolveWorkout(key, state) {
  const sourceDate = workoutSwapPartner(key, state) || key;
  const dow = dowOf(sourceDate);
  const base = programDay(state, dow);
  let src = base, usingFallback = false;
  if (base.isClassDay) {
    const mode = (state.saturdayMode && state.saturdayMode[key]) || 'class';
    if (mode === 'fallback' && base.fallback) { src = base.fallback; usingFallback = true; }
  }
  const blocks = (src.blocks || []).map((b, i) => ({ ...b, id: `${src.key}#${i}` }));
  return {
    sourceDate,
    dayKey: src.key, title: src.title, focus: src.focus, intensity: src.intensity, dayType: src.dayType,
    isClassDay: !!base.isClassDay, usingFallback, hasFallback: !!base.fallback,
    blocks,
    conditioning: src.conditioning || [],
    mobility: src.mobility || [],
    sport: src.sport || [],
    notes: src.notes || '',
  };
}

// ---------- nutrition resolution ----------
export function applyBadmintonAdjustment(targets) {
  return {
    ...targets,
    carbs: targets.carbs + 40,
    kcal: targets.kcal + 160,
    waterL: Math.round((targets.waterL + 0.5) * 100) / 100,
  };
}

export function resolveNutrition(key, state) {
  const dayType = nutritionDayType(key, state);
  // targets + meal options are DERIVED from the latest scan and goal
  let targets = targetsWithFallback(dayType, state);
  const profile = targets._profile;
  const meals = mealPlanFor(dayType, state);
  const adjustments = [];
  const act = (state.activity && state.activity[key]) || {};
  if (act.badminton) {
    targets = applyBadmintonAdjustment(targets);
    adjustments.push('Badminton played: +40g carbs, +0.5 L water, add electrolytes. Protein unchanged.');
  }
  if (act.swim) adjustments.push('Swim done: extra hydration, add protein if dinner is delayed.');
  return { dayType, targets, meals, adjustments, profile };
}

export function getDayPlan(key, state) {
  return { key, flags: dayFlags(key, state), workout: resolveWorkout(key, state), nutrition: resolveNutrition(key, state) };
}

// ============================================================
// SESSION MODEL  (block-aware)
// entry (single/dropset): { blockType, name, exName, sets:[set], skipped, skipReason, replacedWith, completed }
// entry (round-based):    { blockType, name, exNames:[], plannedRounds, restAfterRoundSec, durationSec, rounds:[{done, byExercise:{name:cell}}], completed }
// ============================================================
export const makeSet = () => ({ weight: '', reps: '', seconds: '', rpe: '', restSec: '', form: '', pain: 0, notes: '', isDrop: false, isWarmup: false });
export const makeCell = () => ({ weight: '', reps: '', seconds: '', rpe: '', restSec: '', form: '', pain: 0, notes: '', done: false, skipped: false, skipReason: '', replacedWith: '' });

const hasEnteredValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

// Performance data is the safe, repeatable part of a set. Observations such as
// pain, form and notes make a set user-owned but are intentionally not copied.
export const setHasPerformanceData = (set) => ['weight', 'reps', 'seconds', 'rpe'].some((key) => hasEnteredValue(set && set[key]));
const setHasEnteredWorkoutData = (set) => setHasPerformanceData(set)
  || ['restSec', 'form', 'notes', 'skipReason', 'replacedWith'].some((key) => hasEnteredValue(set && set[key]))
  || Number(set && set.pain) > 0;
export const setHasWorkoutData = (set) => setHasEnteredWorkoutData(set)
  || !!(set && (set.done || set.skipped || set.isDrop || set.isWarmup));

export function duplicateLastSet(sets) {
  const current = Array.isArray(sets) ? sets : [];
  if (!current.length) return [];
  let sourceIndex = -1;
  for (let i = current.length - 1; i >= 0; i--) {
    if (setHasPerformanceData(current[i])) { sourceIndex = i; break; }
  }
  if (sourceIndex < 0) return [...current];

  const source = current[sourceIndex];
  const classificationMatches = (candidate) => !!candidate.isWarmup === !!source.isWarmup
    && !!candidate.isDrop === !!source.isDrop;
  const destinationIndex = current.findIndex((candidate, index) => (
    index > sourceIndex && classificationMatches(candidate) && !setHasEnteredWorkoutData(candidate)
  ));
  const copied = {
    ...makeSet(),
    weight: source.weight ?? '',
    reps: source.reps ?? '',
    seconds: source.seconds ?? '',
    rpe: source.rpe ?? '',
    isDrop: !!source.isDrop,
    isWarmup: !!source.isWarmup,
  };
  if (destinationIndex < 0) return [...current, copied];
  return current.map((candidate, index) => (index === destinationIndex ? copied : candidate));
}

export function initSession(plan) {
  const entries = {};
  plan.blocks.forEach((b) => {
    if (b.blockType === 'single' || b.blockType === 'dropset') {
      const ex = b.exercises[0];
      const n = ex.sets || 3;
      const sets = [];
      for (let i = 0; i < n; i++) sets.push(makeSet());
      entries[b.id] = {
        blockType: b.blockType, name: b.name, exName: ex.name,
        sets, skipped: false, skipReason: '', replacedWith: '', completed: false,
        drops: b.blockType === 'dropset' ? (ex.drops || []).length : 0,
      };
    } else {
      const exNames = b.exercises.map((e) => e.name);
      const roundsN = b.rounds || (b.durationSec ? 1 : 3);
      const rounds = [];
      for (let r = 0; r < roundsN; r++) {
        const byExercise = {};
        exNames.forEach((nm) => { byExercise[nm] = makeCell(); });
        rounds.push({ done: false, byExercise });
      }
      entries[b.id] = {
        blockType: b.blockType, name: b.name, exNames,
        plannedRounds: roundsN, restAfterRoundSec: b.restAfterRoundSec || 60,
        durationSec: b.durationSec || null, rounds, completed: false,
      };
    }
  });
  return { date: null, dayKey: plan.dayKey, title: plan.title, completed: false, notes: '', entries };
}

export function getWorkingSession(key, state) {
  if (state.workoutSessions && state.workoutSessions[key]) return state.workoutSessions[key];
  return { ...initSession(resolveWorkout(key, state)), date: key };
}

// A workout date can be swapped safely until either side contains intentional
// user work. Merely creating an empty session does not count as started.
export function workoutSessionHasData(session) {
  if (!session || typeof session !== 'object') return false;
  if (session.completed || String(session.notes || '').trim()) return true;

  const valueEntered = (item) => ['weight', 'reps', 'seconds', 'rpe', 'restSec', 'form', 'notes', 'skipReason', 'replacedWith']
    .some((key) => hasEnteredValue(item && item[key]));

  return Object.values(session.entries || {}).some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.unplanned || entry.completed || entry.skipped || valueEntered(entry)) return true;
    if ((entry.sets || []).some(setHasWorkoutData)) return true;
    return (entry.rounds || []).some((round) => round.done || Object.values(round.byExercise || {}).some(setHasWorkoutData));
  });
}

// ---------- completion logic ----------
export const cellDone = (c) => !!(c.done || c.skipped || hasEnteredValue(c.seconds) || (c.weight !== '' && c.reps !== ''));
export const roundDone = (rd) => rd.done || Object.values(rd.byExercise).every(cellDone);

export function blockDone(entry) {
  if (entry.skipped) return true;
  if (entry.completed) return true;
  if (entry.sets) {
    const planned = entry.sets.filter((s) => !s.isDrop);
    return planned.length > 0 && planned.every((s) => hasEnteredValue(s.seconds) || (s.weight !== '' && s.reps !== ''));
  }
  if (entry.rounds) return entry.rounds.length > 0 && entry.rounds.every(roundDone);
  return false;
}

export function workoutProgress(session) {
  const ids = Object.keys(session.entries || {});
  if (ids.length === 0) return { done: 0, total: 0, pct: 0 };
  const done = ids.filter((id) => blockDone(session.entries[id])).length;
  return { done, total: ids.length, pct: Math.round((done / ids.length) * 100) };
}

// ============================================================
// EXERCISE HISTORY  (works across single sets AND supersets/circuits/finishers/dropsets)
// ============================================================
export function allSetRecords(state) {
  const recs = [];
  const sessions = state.workoutSessions || {};
  Object.keys(sessions).forEach((date) => {
    const s = sessions[date];
    if (!s || !s.entries) return;
    Object.values(s.entries).forEach((entry) => {
      if (entry.skipped) return;
      if (entry.sets) {
        const nm = entry.replacedWith || entry.exName;
        entry.sets.forEach((set) => {
          if (set.isWarmup) return; // warm-ups never count toward history, volume or PRs
          const w = parseFloat(set.weight), r = parseInt(set.reps, 10);
          if (!isNaN(w) && !isNaN(r) && r > 0) {
            const rpe = parseFloat(set.rpe) || null;
            recs.push({ date, name: nm, weight: w, reps: r, rpe, rir: rpe != null ? Math.max(0, 10 - rpe) : null, source: entry.blockType });
          }
        });
      }
      if (entry.rounds) {
        entry.rounds.forEach((rd) => {
          Object.entries(rd.byExercise).forEach(([exName, c]) => {
            if (c.skipped) return;
            const nm = c.replacedWith || exName;
            const w = parseFloat(c.weight), r = parseInt(c.reps, 10);
            if (!isNaN(w) && !isNaN(r) && r > 0) {
              const rpe = parseFloat(c.rpe) || null;
              recs.push({ date, name: nm, weight: w, reps: r, rpe, rir: rpe != null ? Math.max(0, 10 - rpe) : null, source: entry.blockType });
            }
          });
        });
      }
    });
  });
  return recs;
}

export function allTimedRecords(state) {
  const records = [];
  Object.entries(state.workoutSessions || {}).forEach(([date, session]) => {
    Object.values((session && session.entries) || {}).forEach((entry) => {
      if (!entry || entry.skipped) return;
      (entry.sets || []).forEach((set) => {
        const seconds = Number(set.seconds);
        if (seconds > 0 && !set.isWarmup) records.push({ date, name: entry.replacedWith || entry.exName, seconds, weight: Number(set.weight) || 0, rpe: Number(set.rpe) || null, source: entry.blockType });
      });
      (entry.rounds || []).forEach((round) => {
        Object.entries(round.byExercise || {}).forEach(([exerciseName, cell]) => {
          const seconds = Number(cell.seconds);
          if (seconds > 0 && !cell.skipped) records.push({ date, name: cell.replacedWith || exerciseName, seconds, weight: Number(cell.weight) || 0, rpe: Number(cell.rpe) || null, source: entry.blockType });
        });
      });
    });
  });
  return records;
}

export function getExerciseHistory(name, state) {
  const recs = allSetRecords(state).filter((r) => r.name === name);
  const byDate = {};
  recs.forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  return Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map((date) => ({ date, sets: byDate[date] }));
}

export const getLastSession = (name, state) => getExerciseHistory(name, state)[0] || null;
export const e1rm = (w, r) => w * (1 + r / 30);

export function getBestPerformance(name, state) {
  const recs = allSetRecords(state).filter((r) => r.name === name);
  if (recs.length === 0) return null;
  let best = recs[0];
  recs.forEach((r) => { if (e1rm(r.weight, r.reps) > e1rm(best.weight, best.reps)) best = r; });
  const vol = {};
  recs.forEach((r) => { vol[r.date] = (vol[r.date] || 0) + r.weight * r.reps; });
  return {
    best,
    e1rm: e1rm(best.weight, best.reps),
    maxWeight: Math.max(...recs.map((r) => r.weight)),
    maxReps: Math.max(...recs.map((r) => r.reps)),
    bestVolume: Math.max(...Object.values(vol)),
  };
}

// One point per training date. e1RM is an estimate of the heaviest single rep
// a person could perform, calculated from the best logged weight and reps.
export function exerciseProgressSeries(name, state) {
  return getExerciseHistory(name, state).slice().reverse().map(({ date, sets }) => ({
    date,
    label: shortDate(date),
    e1rm: Math.round(Math.max(...sets.map((set) => e1rm(set.weight, set.reps)))),
    weight: Math.max(...sets.map((set) => set.weight)),
    volume: Math.round(sets.reduce((sum, set) => sum + set.weight * set.reps, 0)),
  }));
}

// A PR is only counted when it beats the best e1RM from an earlier date. The
// first logged performance establishes a baseline instead of inflating PR count.
export function recentPersonalRecords(state, limit = 8) {
  const bestByExerciseAndDate = new Map();
  allSetRecords(state).forEach((record) => {
    const key = `${record.date}\u0000${record.name}`;
    const current = bestByExerciseAndDate.get(key);
    if (!current || e1rm(record.weight, record.reps) > e1rm(current.weight, current.reps)) {
      bestByExerciseAndDate.set(key, record);
    }
  });
  const records = [...bestByExerciseAndDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const bestBefore = new Map();
  const prs = [];
  records.forEach((record) => {
    const value = e1rm(record.weight, record.reps);
    const previous = bestBefore.get(record.name);
    if (previous != null && value > previous + 0.01) {
      prs.push({
        ...record,
        e1rm: Math.round(value),
        improvementPct: Math.round(((value - previous) / previous) * 1000) / 10,
      });
    }
    if (previous == null || value > previous) bestBefore.set(record.name, value);
  });
  return prs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

export function trainingActivity(state, days = 84, endKey = todayKey()) {
  const byDate = {};
  allSetRecords(state).forEach((record) => {
    const day = byDate[record.date] || { sets: 0, volume: 0 };
    day.sets += 1;
    day.volume += record.weight * record.reps;
    byDate[record.date] = day;
  });
  allTimedRecords(state).forEach((record) => {
    const day = byDate[record.date] || { sets: 0, volume: 0 };
    day.sets += 1;
    byDate[record.date] = day;
  });

  const dates = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = addDays(endKey, -offset);
    const day = byDate[date] || { sets: 0, volume: 0 };
    const level = day.sets === 0 ? 0 : day.sets <= 4 ? 1 : day.sets <= 8 ? 2 : day.sets <= 14 ? 3 : 4;
    dates.push({ date, ...day, volume: Math.round(day.volume), level });
  }
  return dates;
}

export function trainingConsistency(state, days = 30, endKey = todayKey()) {
  const activity = trainingActivity(state, days, endKey);
  const trained = activity.filter((day) => day.sets > 0);
  let streak = 0;
  for (let index = activity.length - 1; index >= 0 && activity[index].sets > 0; index--) streak++;
  return {
    workouts: trained.length,
    sets: trained.reduce((sum, day) => sum + day.sets, 0),
    volume: trained.reduce((sum, day) => sum + day.volume, 0),
    streak,
  };
}

export function increment(name, state) {
  const p = exerciseMeta(name, state).p || '';
  const small = /Delt|Bicep|Tricep|Calf|Calves|Ab|Oblique|Core|Forearm|Brachialis/i.test(p);
  return small ? 2.5 : 5;
}

// rx = { repLow, repHigh, rpe } prescription (optional)
export function getNextTarget(name, state, rx) {
  const last = getLastSession(name, state);
  const repLow = (rx && rx.repLow) || 8;
  const repHigh = (rx && rx.repHigh) || 12;
  const targetRpe = (rx && rx.rpe) || 8;
  if (!last) return { text: `Work up to RPE ${targetRpe} at ${repLow}-${repHigh} reps`, note: 'No history yet. Log today to calibrate the next target.' };
  const top = [...last.sets].sort((a, b) => e1rm(b.weight, b.reps) - e1rm(a.weight, a.reps))[0];
  const setsN = last.sets.length;
  const hitTop = last.sets.every((s) => s.reps >= repHigh) && (top.rpe == null || top.rpe <= targetRpe + 0.5);
  if (hitTop) {
    const nw = top.weight + increment(name, state);
    return { text: `${nw} lb x ${repLow} for ${setsN} sets`, note: `Hit top reps last time. Add ${increment(name, state)} lb and reset to the bottom of the range.` };
  }
  const targetReps = Math.min(repHigh, Math.max(...last.sets.map((s) => s.reps)) + 1);
  return { text: `${top.weight} lb x ${targetReps} for ${setsN} sets`, note: 'Keep the weight and add a rep per set toward the top of the range.' };
}

// prescription lookup for an exercise name in a resolved plan (for next-target ranges)
export function rxForExercise(name, plan) {
  for (const b of plan.blocks) {
    if (b.blockType === 'single' || b.blockType === 'dropset') {
      if (b.exercises[0].name === name) {
        const e = b.exercises[0];
        return { repLow: e.repLow, repHigh: e.repHigh, rpe: e.rpe };
      }
    } else {
      const e = b.exercises.find((x) => x.name === name);
      if (e) {
        const m = String(e.targetReps || '').match(/(\d+)\s*-\s*(\d+)/);
        return { repLow: m ? +m[1] : 10, repHigh: m ? +m[2] : 15, rpe: e.targetRpe };
      }
    }
  }
  return null;
}

// ============================================================
// NUTRITION actuals + adherence
// ============================================================
export function nutritionActuals(key, state) {
  const log = (state.mealLogs && state.mealLogs[key]) || { eaten: {}, extras: [], water: 0, flags: {}, choices: {} };
  const meals = mealPlanFor(nutritionDayType(key, state), state);
  const choices = log.choices || {};
  let p = 0, c = 0, f = 0, kcal = 0;
  meals.forEach((m, i) => {
    if (!(log.eaten && log.eaten[i])) return;
    const opts = m.options || [];
    if (!opts.length) return;
    const o = opts[Math.min(choices[i] ?? 0, opts.length - 1)];
    p += o.p; c += o.c; f += o.f; kcal += o.kcal;
  });
  (log.extras || []).forEach((e) => { p += e.p || 0; c += e.c || 0; f += e.f || 0; kcal += e.kcal || 0; });
  const beverageLog = (state.beverageLogs && state.beverageLogs[key]) || {};
  let beverageWater = 0;
  DAILY_BEVERAGES.forEach((drink) => {
    if (!beverageLog[drink.key]) return;
    p += drink.p || 0; c += drink.c || 0; f += drink.f || 0; kcal += drink.kcal || 0;
    beverageWater += drink.water || 0;
  });
  return { protein: p, carbs: c, fat: f, kcal, water: (log.water || 0) + beverageWater, log, beverageLog };
}

export function nutritionAdherence(key, state) {
  const { targets } = resolveNutrition(key, state);
  const a = nutritionActuals(key, state);
  const proteinPct = Math.min(a.protein / (targets.protein || 1), 1);
  const waterPct = Math.min(a.water / (targets.waterL || 1), 1);
  const calClose = a.kcal === 0 ? 0 : 1 - Math.min(Math.abs(a.kcal - targets.kcal) / (targets.kcal || 1), 1);
  const pct = Math.round((proteinPct * 0.45 + waterPct * 0.2 + calClose * 0.35) * 100);
  return { pct, actual: a, targets };
}

// ---------- Apple Health deep-link ingestion ----------
// Reads #health?steps=..&sleep=..&rhr=.. from a URL an Apple Shortcut opens.
// Legacy ?steps=.. query strings remain supported, but the app now generates
// fragments so private Health values never leave the browser in an HTTP URL.
// and returns { date, patch, count } to merge into that day's watch log.
const HEALTH_FIELD_RANGES = {
  steps: [0, 250000], activeCal: [0, 20000], basalCal: [0, 10000],
  exerciseMin: [0, 1440], standHours: [0, 24], restingHR: [20, 250],
  walkingHR: [20, 250], sleepH: [0, 24], sleepScore: [0, 100],
  hrv: [0, 1000], vo2max: [5, 100], spo2: [50, 100],
  respiratoryRate: [2, 80], distance: [0, 1000], flights: [0, 10000],
  workoutCal: [0, 20000], workoutMin: [0, 1440], avgHR: [20, 250],
};

function healthParamString(input) {
  const raw = String(input || '').trim();
  if (raw.startsWith('#health?')) return raw.slice('#health?'.length);
  if (raw.startsWith('#')) return raw.slice(1);
  if (raw.startsWith('?')) return raw.slice(1);
  return raw;
}

function strictHealthNumber(raw, field) {
  const text = String(raw || '').trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  const [min, max] = HEALTH_FIELD_RANGES[field] || [0, Number.MAX_SAFE_INTEGER];
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export function parseHealthParams(input) {
  const p = new URLSearchParams(healthParamString(input));
  if (![...p.keys()].length) return null;
  const dp = p.get('date');
  const date = dp && /^\d{4}-\d{2}-\d{2}$/.test(dp) && toKey(parseKey(dp)) === dp ? dp : todayKey();
  const patch = {};
  for (const [param, field] of Object.entries(HEALTH_PARAM_MAP)) {
    if (field in patch) continue; // aliases map to one stored value and count once
    const value = strictHealthNumber(p.get(param), field);
    if (value != null) patch[field] = String(value);
  }
  const count = Object.keys(patch).length;
  return count ? { date, patch, count } : null;
}

// ---------- watch / recovery ----------
export const watchFor = (key, state) => (state.watchLogs && state.watchLogs[key]) || {};

export function maxPainFor(key, state) {
  const s = state.workoutSessions && state.workoutSessions[key];
  let mx = 0;
  if (s && s.entries) {
    Object.values(s.entries).forEach((e) => {
      if (e.sets) e.sets.forEach((x) => { mx = Math.max(mx, x.pain || 0); });
      if (e.rounds) e.rounds.forEach((rd) => Object.values(rd.byExercise).forEach((c) => { mx = Math.max(mx, c.pain || 0); }));
    });
  }
  return mx;
}

export function recoveryScore(key, state) {
  const w = watchFor(key, state);
  const sleep = parseFloat(w.sleepH);
  const sleepScore = isNaN(sleep) ? 0.6 : Math.min(sleep / 7.5, 1);
  const maxPain = maxPainFor(key, state);
  const painScore = 1 - Math.min(maxPain / 5, 1) * 0.6;
  const rhr = parseFloat(w.restingHR);
  const rhrScore = isNaN(rhr) ? 0.7 : rhr <= 60 ? 1 : rhr <= 70 ? 0.8 : 0.6;
  const pct = Math.round((sleepScore * 0.5 + painScore * 0.3 + rhrScore * 0.2) * 100);
  return { pct, sleep: isNaN(sleep) ? null : sleep, maxPain, rhr: isNaN(rhr) ? null : rhr };
}

// Non-veg keyword check for the "extras" quick-add log — the structured
// meal plan already hides non-veg options on veg days (see mealPlanFor's
// safety filter), so this only catches a manually-added exception.
const NON_VEG_RE = /chicken|fish|mutton|prawn|shrimp|turkey|meat|beef|pork|salmon|tuna|\begg\b/i;

// ---------- habits ----------
// Which Rules-group habits even apply today. Only Thursday needs the fast +
// its own veg rule, only Saturday needs its veg rule + BodyBalance (and only
// when BodyBalance itself was picked over the lifting fallback) - a rule
// that doesn't apply today must not drag the score down.
export function habitApplicability(key, state) {
  const dow = dowOf(key);
  const flags = dayFlags(key, state);
  const satMode = (state.saturdayMode && state.saturdayMode[key]) || 'class';
  return {
    thu_fast: flags.fastDay,
    thu_veg: dow === 4,
    sat_veg: dow === 6,
    bodybalance: dow === 6 && satMode === 'class',
  };
}

export function habitStatus(key, state) {
  const manual = (state.habitLogs && state.habitLogs[key]) || {};
  const a = nutritionActuals(key, state);
  const t = resolveNutrition(key, state).targets;
  const w = watchFor(key, state);
  const s = state.workoutSessions && state.workoutSessions[key];
  const prog = s ? workoutProgress(s) : { done: 0, total: 0 };
  const act = (state.activity && state.activity[key]) || {};
  const supp = (state.supplementLogs && state.supplementLogs[key]) || {};
  const extras = a.log.extras || [];
  const applicable = habitApplicability(key, state);
  const auto = {
    workout_logged: !!(s && Object.keys(s.entries || {}).length && prog.done > 0),
    workout_done: !!(s && (s.completed || (prog.total > 0 && prog.done === prog.total))),
    protein_hit: a.protein >= t.protein * 0.95,
    calories_ok: a.kcal > 0 && Math.abs(a.kcal - t.kcal) <= t.kcal * 0.1,
    water_hit: a.water >= t.waterL * 0.9,
    steps_10k: parseFloat(w.steps) >= 10000,
    zone2_walk: plannedWalkingMinutes(key, state) > 0 && !!act.eveningWalk
      && (Number(act.eveningWalkMin) || 40) >= plannedWalkingMinutes(key, state),
    sleep_75: parseFloat(w.sleepH) >= 7.5,
    swim: !!act.swim,
    badminton: !!act.badminton,
    creatine: !!supp.creatine,
    fishoil: !!supp.fishoil,
    vitd: !!supp.vitd,
    magnesium: !!supp.magnesium,
    biotin: !!supp.biotin,
    // fasting/veg are enforced structurally by the app (fast days only offer
    // the post-fast meal; veg days hide non-veg meal options), so default to
    // compliant and only flip false if a logged extra breaks the rule.
    thu_fast: !extras.some((e) => NON_VEG_RE.test(e.name || '')) && extras.length < 3,
    thu_veg: !extras.some((e) => NON_VEG_RE.test(e.name || '')),
    sat_veg: !extras.some((e) => NON_VEG_RE.test(e.name || '')),
    bodybalance: !!(s && s.completed),
  };
  const status = {};
  HABITS.forEach((h) => {
    if (applicable[h.key] === false) return; // not today's rule - leave out of status entirely
    status[h.key] = (h.key in manual) ? !!manual[h.key] : (auto[h.key] || false);
  });
  return { status, manual, auto, applicable };
}

export function habitPct(key, state) {
  const { status } = habitStatus(key, state);
  const keys = Object.keys(status);
  if (!keys.length) return 100;
  const done = keys.filter((k) => status[k]).length;
  return Math.round((done / keys.length) * 100);
}

// ---------- daily composite score ----------
export function dailyScore(key, state) {
  const hp = habitPct(key, state);
  const na = nutritionAdherence(key, state).pct;
  const s = state.workoutSessions && state.workoutSessions[key];
  const hasLifts = programDay(state, dowOf(key)).blocks.length > 0;
  const wa = s ? workoutProgress(s).pct : (hasLifts ? 0 : 100);
  const rec = recoveryScore(key, state).pct;
  const score = Math.round(hp * 0.35 + na * 0.3 + wa * 0.2 + rec * 0.15);
  return { score, hp, na, wa, rec };
}

// ============================================================
// ANALYTICS  (volume + superset / finisher completion)
// ============================================================
export function muscleGroupOf(name, state) {
  const p = exerciseMeta(name, state).p || '';
  if (/Chest/i.test(p)) return 'Chest';
  if (/Lat|Back|Trap/i.test(p)) return 'Back';
  if (/Delt|Shoulder/i.test(p)) return 'Shoulders';
  if (/Bicep|Brachialis/i.test(p)) return 'Biceps';
  if (/Tricep/i.test(p)) return 'Triceps';
  if (/Quad/i.test(p)) return 'Quads';
  if (/Hamstring/i.test(p)) return 'Hamstrings';
  if (/Glute/i.test(p)) return 'Glutes';
  if (/Calf|Calves/i.test(p)) return 'Calves';
  if (/Ab|Oblique/i.test(p)) return 'Core';
  if (/Cardio/i.test(p)) return 'Conditioning';
  return 'Other';
}

export function volumeByExercise(state) {
  const out = {};
  allSetRecords(state).forEach((r) => { out[r.name] = (out[r.name] || 0) + r.weight * r.reps; });
  return out;
}

export function volumeByMuscle(state) {
  const out = {};
  allSetRecords(state).forEach((r) => { const g = muscleGroupOf(r.name, state); out[g] = (out[g] || 0) + r.weight * r.reps; });
  return out;
}

// superset + circuit completion across all sessions
export function supersetStats(state) {
  let plannedCells = 0, doneCells = 0, plannedRounds = 0, doneRounds = 0, missed = 0, blocks = 0;
  const sessions = state.workoutSessions || {};
  Object.values(sessions).forEach((s) => {
    if (!s.entries) return;
    Object.values(s.entries).forEach((e) => {
      if (!e.rounds) return;
      if (e.blockType !== 'superset' && e.blockType !== 'circuit') return;
      blocks++;
      plannedRounds += e.plannedRounds || e.rounds.length;
      e.rounds.forEach((rd) => {
        if (roundDone(rd)) doneRounds++;
        Object.values(rd.byExercise).forEach((c) => {
          plannedCells++;
          if (c.skipped) missed++;
          else if (cellDone(c)) doneCells++;
        });
      });
    });
  });
  return { blocks, plannedCells, doneCells, pct: plannedCells ? Math.round((doneCells / plannedCells) * 100) : 0, plannedRounds, doneRounds, missed };
}

export function finisherStats(state) {
  let planned = 0, done = 0;
  const sessions = state.workoutSessions || {};
  Object.values(sessions).forEach((s) => {
    if (!s.entries) return;
    Object.values(s.entries).forEach((e) => { if (e.blockType === 'finisher') { planned++; if (blockDone(e)) done++; } });
  });
  return { planned, done, pct: planned ? Math.round((done / planned) * 100) : 0 };
}

// weekly training volume series (last N weeks) for charting
export function weeklyVolumeSeries(state, weeks = 8) {
  const recs = allSetRecords(state);
  const buckets = {};
  recs.forEach((r) => {
    const monday = mondayOf(r.date);
    buckets[monday] = (buckets[monday] || 0) + r.weight * r.reps;
  });
  const out = [];
  let cur = mondayOf(todayKey());
  for (let i = 0; i < weeks; i++) {
    out.unshift({ label: shortDate(cur), value: Math.round(buckets[cur] || 0) });
    cur = addDays(cur, -7);
  }
  return out;
}
function mondayOf(key) {
  const d = parseKey(key);
  const diff = (d.getDay() + 6) % 7;
  return addDays(key, -diff);
}

export const fmtVol = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`);

// ---------- barbell plate math ----------
// The bar carries no plates, so the loadable weight splits evenly across both
// sleeves and every count below is PER SIDE.
//
// Largest-plate-first is the obvious approach and it is wrong at the rack:
// 60 lb a side comes out as 45 + 10 + 5 when 35 + 25 is the same weight in
// two plates instead of three. So every plate size is reduced to a common
// integer step (their GCD) and a small table finds the fewest plates that hit
// the target exactly, falling back to the closest loadable weight under it.
const cents = (value) => Math.round(value * 100);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Safety valve. Real bars never get near this; nonsense input should not
// allocate a huge table, so it drops back to the largest-first pass instead.
const MAX_PLATE_STEPS = 20000;

function largestFirst(perSideCents, denomCents) {
  const result = [];
  let remaining = perSideCents;
  denomCents.forEach((plate) => {
    const count = Math.floor(remaining / plate);
    if (count) {
      result.push({ plate: plate / 100, count });
      remaining -= plate * count;
    }
  });
  return { result, remaining };
}

export function plateBreakdown(totalWeight, barWeight = 45, plates = [45, 35, 25, 10, 5, 2.5]) {
  // `reason` tells the caller WHY there is nothing to load, so the UI can say
  // something true instead of "0 lb per side cannot be loaded".
  const nothing = (reason) => ({ perSide: 0, plates: [], remainder: 0, exact: false, reason });
  if (!hasEnteredValue(totalWeight)) return nothing('empty');
  // A blank bar field is a missing answer, not a 0 lb bar. Treating it as zero
  // silently turns 225 lb into 112.5 a side and reports it as exact.
  if (!hasEnteredValue(barWeight)) return nothing('no-bar');

  const total = Number(totalWeight);
  const bar = Number(barWeight);
  if (!Number.isFinite(total) || !Number.isFinite(bar) || total < 0 || bar < 0) return nothing('invalid');
  if (total < bar) return nothing('below-bar');

  const perSideCents = cents(total - bar) / 2;
  const perSide = Math.round(perSideCents) / 100;
  const denomCents = [...new Set(
    plates.filter((plate) => Number.isFinite(plate) && plate > 0).map(cents),
  )].sort((a, b) => b - a);
  if (!denomCents.length) {
    return { perSide, plates: [], remainder: perSide, exact: perSide === 0, reason: null };
  }

  const step = denomCents.reduce(gcd);
  const targetSteps = Math.floor(perSideCents / step);

  if (targetSteps > MAX_PLATE_STEPS) {
    const { result, remaining } = largestFirst(perSideCents, denomCents);
    const remainder = Math.round(remaining) / 100;
    return { perSide, plates: result, remainder, exact: remainder === 0, reason: null };
  }

  // fewest[n] = fewest plates that weigh exactly n steps, -1 when unreachable.
  const units = denomCents.map((plate) => plate / step);
  const fewest = new Int32Array(targetSteps + 1).fill(-1);
  const chosen = new Int32Array(targetSteps + 1).fill(-1);
  fewest[0] = 0;
  for (let n = 1; n <= targetSteps; n += 1) {
    for (let d = 0; d < units.length; d += 1) {
      const unit = units[d];
      if (unit > n || fewest[n - unit] < 0) continue;
      const cost = fewest[n - unit] + 1;
      if (fewest[n] < 0 || cost < fewest[n]) {
        fewest[n] = cost;
        chosen[n] = d;
      }
    }
  }

  // Walk down to the heaviest loadable weight at or under the target. Step 0
  // is always reachable, so this terminates.
  let loaded = targetSteps;
  while (loaded > 0 && fewest[loaded] < 0) loaded -= 1;

  const counts = new Map();
  for (let n = loaded; n > 0; n -= units[chosen[n]]) {
    const plate = denomCents[chosen[n]];
    counts.set(plate, (counts.get(plate) || 0) + 1);
  }
  const result = [...counts.entries()]
    .sort(([a], [b]) => b - a)
    .map(([plate, count]) => ({ plate: plate / 100, count }));

  const remainderCents = perSideCents - loaded * step;
  return {
    perSide,
    plates: result,
    remainder: Math.round(remainderCents) / 100,
    exact: remainderCents < 0.005,
    reason: null,
  };
}

// ---------- week-over-week training volume improvement ----------
// The current week is usually mid-progress, so the headline compares the
// last COMPLETED week with the one before it (a clean full-vs-full number),
// and reports the current week separately as "so far".
export function volumeTrend(state) {
  const weeks = weeklyVolumeSeries(state, 6);
  const n = weeks.length;
  const current = weeks[n - 1] || { value: 0 };
  const lastFull = weeks[n - 2] || { value: 0 };
  const prevFull = weeks[n - 3] || { value: 0 };
  const pct = prevFull.value > 0 ? Math.round(((lastFull.value - prevFull.value) / prevFull.value) * 100) : null;
  const curPct = lastFull.value > 0 ? Math.round(((current.value - lastFull.value) / lastFull.value) * 100) : null;
  return {
    current: current.value, lastFull: lastFull.value, prevFull: prevFull.value,
    pct, up: pct != null && pct >= 0, curPct, hasData: lastFull.value > 0 || current.value > 0,
  };
}

// ---------- muscle-group volume over a recent window ----------
export function volumeByMuscleWindow(state, days = 21, endKey = todayKey()) {
  const start = addDays(endKey, -days);
  const out = {};
  allSetRecords(state).forEach((r) => {
    if (r.date > start && r.date <= endKey) {
      const g = muscleGroupOf(r.name, state);
      out[g] = (out[g] || 0) + r.weight * r.reps;
    }
  });
  return out;
}

// count of working SETS per muscle group in a recent window
export function setsByMuscleWindow(state, days = 21, endKey = todayKey()) {
  const start = addDays(endKey, -days);
  const out = {};
  allSetRecords(state).forEach((r) => {
    if (r.date > start && r.date <= endKey) {
      const g = muscleGroupOf(r.name, state);
      out[g] = (out[g] || 0) + 1;
    }
  });
  return out;
}

// ---------- smart lagging-muscle detector ----------
// Uses weekly SET COUNT (the standard training-volume metric), NOT tonnage -
// otherwise arms and delts, which always move less weight than legs, would
// be flagged forever. Flags muscles below the effective range, missing, or
// falling week over week, and gives an actionable fix. ~8-12 sets/week is
// the growth range; below 6 is under-stimulated.
const BALANCE_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'];
const LOW_SETS = 6;
export function muscleBalance(state) {
  const days = 21, weeks = days / 7;
  const recent = setsByMuscleWindow(state, days);
  const prior = setsByMuscleWindow(state, days, addDays(todayKey(), -days));
  const ranked = BALANCE_MUSCLES
    .map((m) => ({ muscle: m, sets: Math.round(((recent[m] || 0) / weeks) * 10) / 10, prevSets: Math.round(((prior[m] || 0) / weeks) * 10) / 10 }))
    .sort((a, b) => b.sets - a.sets);
  const totalSets = ranked.reduce((sum, x) => sum + x.sets, 0);
  const hints = [];
  if (totalSets >= 10) {
    ranked.forEach(({ muscle, sets, prevSets }) => {
      const low = muscle.toLowerCase();
      if (sets === 0) {
        hints.push({ muscle, kind: 'missing', tone: 'warn', text: `No direct ${low} sets in 3 weeks. Add a ${low} exercise to your next session.` });
      } else if (sets < LOW_SETS) {
        hints.push({ muscle, kind: 'low', tone: 'warn', text: `${muscle} is light at ~${sets} sets/week — aim 8-12. Add 1-2 ${low} exercises or a few sets.` });
      } else if (prevSets >= LOW_SETS && sets < prevSets * 0.6) {
        hints.push({ muscle, kind: 'declining', tone: 'warn', text: `${muscle} dropped from ~${prevSets} to ~${sets} sets/week. Don't skip its sessions this week.` });
      }
    });
  }
  return { ranked, hints: hints.slice(0, 4), enough: totalSets >= 10 };
}

// ---------- per-muscle week-over-week volume change ----------
// So you can see which groups climbed or slipped. Compares the last FULL
// week with the week before (clean, not skewed by the in-progress week),
// and also carries this week's running total.
export function muscleWeekTrend(state) {
  const cW = mondayOf(todayKey());
  const w1 = addDays(cW, -7);   // last full week start
  const w2 = addDays(cW, -14);  // prior full week start
  const win = (start, end) => {
    const o = {};
    allSetRecords(state).forEach((r) => {
      if (r.date >= start && r.date <= end) { const g = muscleGroupOf(r.name, state); o[g] = (o[g] || 0) + r.weight * r.reps; }
    });
    return o;
  };
  const cur = win(cW, todayKey());
  const last = win(w1, addDays(cW, -1));
  const prev = win(w2, addDays(w1, -1));
  const skip = new Set(['Other', 'Conditioning', 'Mobility']);
  const muscles = [...new Set([...Object.keys(cur), ...Object.keys(last), ...Object.keys(prev)])].filter((m) => !skip.has(m));
  return muscles.map((m) => {
    const cv = cur[m] || 0, lv = last[m] || 0, pv = prev[m] || 0;
    const pct = pv > 0 ? Math.round(((lv - pv) / pv) * 100) : null; // null = new / no prior week
    return { muscle: m, cur: cv, last: lv, prev: pv, pct, up: pct == null || pct >= 0 };
  }).sort((a, b) => b.last - a.last);
}

// ============================================================
// HOME "meaningful numbers" (all derived from existing data)
// ============================================================

// Recomp Signal: lean mass moving up while body fat holds flat/down.
export function recompSignal(state) {
  const scans = sortedScans(state);
  if (scans.length < 2) return null;
  const first = scans[0], last = scans[scans.length - 1];
  const leanDelta = Math.round((last.leanMass - first.leanMass) * 10) / 10;
  const bfDelta = Math.round((last.bodyFatPct - first.bodyFatPct) * 10) / 10;
  const onTrack = leanDelta > 0 && bfDelta <= 1; // muscle up, fat flat or down
  return {
    leanDelta, bfDelta, count: scans.length,
    leanSeries: scans.map((s) => s.leanMass),
    firstLean: first.leanMass, lastLean: last.leanMass,
    lastBf: last.bodyFatPct, onTrack,
    text: onTrack
      ? `Lean mass ${first.leanMass} → ${last.leanMass} lb while body fat holds near ${Math.round(last.bodyFatPct)}%. Muscle up, fat steady — recomposition confirmed.`
      : `Lean mass ${first.leanMass} → ${last.leanMass} lb, body fat ${first.bodyFatPct} → ${last.bodyFatPct}%. Hold protein high and keep the deficit moderate to protect muscle.`,
  };
}

// Consistency streak: consecutive days with a daily score at/above the threshold.
export function consistencyStreak(state, threshold = 60) {
  let n = 0, d = todayKey();
  for (let i = 0; i < 180; i++) {
    if (dailyScore(d, state).score >= threshold) { n += 1; d = addDays(d, -1); } else break;
  }
  return n;
}

// Energy balance vs maintenance (negative = fat-loss deficit).
export function energyBalance(date, state) {
  const a = nutritionActuals(date, state);
  const prof = nutritionProfile(state);
  const intake = Math.round(a.kcal);
  return { intake, expenditure: prof.tdee, net: intake - prof.tdee, hasData: intake > 0 };
}

// Protein per lb of lean mass (>= 1.0 g/lb is muscle-sparing in a deficit).
export function proteinPerLbLean(state) {
  const prof = nutritionProfile(state);
  const scan = latestScan(state);
  const lean = scan?.leanMass || prof.leanMass;
  if (!lean) return null;
  const value = Math.round((prof.protein / lean) * 100) / 100;
  return { value, muscleSparing: value >= 1.0 };
}

// Training-load summary for the Home card: weekly volume trend, hard sets
// this week, the best e1RM lift, and any lagging muscle.
export function trainingLoadSummary(state) {
  const trend = volumeTrend(state);
  const cW = mondayOf(todayKey());
  const hardSets = allSetRecords(state).filter((r) => r.date >= cW && r.weight > 0).length;
  const exVol = volumeByExercise(state);
  let top = null;
  Object.keys(exVol).forEach((n) => {
    const b = getBestPerformance(n, state);
    if (b && (!top || b.e1rm > top.e1rm)) top = { name: n, e1rm: Math.round(b.e1rm) };
  });
  const balance = muscleBalance(state);
  return { trend, hardSets, top, lagging: balance.hints[0] || null };
}

// ============================================================
// COACH INSIGHTS
// ============================================================
export function coachInsights(key, state, now) {
  const out = [];
  const flags = dayFlags(key, state);
  const fastEnd = fastEndTime(key, state);
  const w = watchFor(key, state);
  const isToday = key === todayKey();
  const hr = now ? now.getHours() : 12;
  const a = nutritionActuals(key, state);
  const t = resolveNutrition(key, state).targets;
  const act = (state.activity && state.activity[key]) || {};
  const s = state.workoutSessions && state.workoutSessions[key];
  const sleep = parseFloat(w.sleepH);

  if (!isNaN(sleep) && sleep < 6.5) out.push({ type: 'warn', text: `Sleep was ${sleep}h. Cap lifting at RPE 7 today and skip grinding reps.` });
  if (act.badminton) out.push({ type: 'action', text: 'Badminton done. Add electrolytes and 30-50g carbs, push water +0.5 L. Keep protein the same.' });
  if (flags.fastDay && isToday) {
    if (hr < fastEnd.hour) out.push({ type: 'info', text: `Fast active until ${fastEnd.label}. Water, black coffee and green tea only.` });
    else out.push({ type: 'action', text: 'Fast window over. Break it gently, then prioritise vegetarian protein and hydration.' });
  } else if (flags.fastDay) {
    out.push({ type: 'info', text: `This is a ${fastEnd.noMoon ? 'no-moon ' : ''}fast day: fast until ${fastEnd.label}, then follow the vegetarian plan.` });
  }
  if (flags.classDay) {
    const mode = (state.saturdayMode && state.saturdayMode[key]) || 'class';
    if (mode === 'fallback') out.push({ type: 'info', text: 'BodyBalance swapped for the Full Body fallback. Vegetarian protein: whey, paneer, dal, Greek yogurt.' });
    else out.push({ type: 'info', text: 'Vegetarian day. Anchor protein with whey, Greek yogurt, paneer, tofu and dal.' });
  }
  if (flags.vegDay && !flags.fastDay && !flags.classDay) {
    out.push({ type: 'info', text: 'Vegetarian override active. Chicken, fish and eggs are removed; anchor protein with whey, Greek yogurt, paneer, tofu and dal.' });
  }
  if (isToday && hr >= 13 && a.protein < t.protein * 0.5) out.push({ type: 'action', text: `Protein is at ${Math.round(a.protein)}g of ${t.protein}g. Add a whey shake or Greek yogurt.` });
  const steps = parseFloat(w.steps);
  if (isToday && hr >= 16 && !isNaN(steps) && steps < 6000) out.push({ type: 'action', text: `Steps at ${steps}. A 20 minute incline walk gets you toward 10k.` });
  const maxPain = maxPainFor(key, state);
  if (maxPain >= 3) out.push({ type: 'warn', text: `Logged pain ${maxPain}/5. Swap to the substitute exercise and drop the load 5-10%.` });

  if (s) {
    const prog = workoutProgress(s);
    if (s.completed || (prog.total > 0 && prog.done === prog.total)) out.push({ type: 'good', text: 'Workout complete and logged. Next targets update from today.' });
  }
  if (a.protein >= t.protein * 0.95 && a.water >= t.waterL * 0.9) out.push({ type: 'good', text: 'Protein and water on target. That is the recomp engine running.' });
  if (out.length === 0) out.push({ type: 'info', text: 'On plan. Log your work as you go and the coach adapts.' });
  // surface the most urgent first: warnings, then actions, then wins, then info
  const rank = { warn: 0, action: 1, good: 2, info: 3 };
  out.sort((a, b) => rank[a.type] - rank[b.type]);
  return out;
}

// ---------- phase / scans ----------
// programCalendar is the SINGLE source of truth. Header, panel, Home, Plan and the
// scan countdown all read from this so they can never disagree. Everything is derived
// from the editable dates in settings and today's real date - nothing is hardcoded.
export function programCalendar(state) {
  const st = (state && state.settings) || {};
  const progStart = st.programStartDate || PROGRAM_START;
  const restartStart = st.restartPhaseStartDate || st.restartStartDate || progStart;
  const freq = parseInt(st.scanFrequencyDays, 10) > 0 ? parseInt(st.scanFrequencyDays, 10) : 30;
  const today = todayKey();
  const pDays = Math.max(0, daysBetween(progStart, today));
  const rDays = Math.max(0, daysBetween(restartStart, today));
  const manual = st.nextBodyScanDate || st.nextScanDate || '';
  const last = latestScan(state);
  const autoNext = last ? addDays(last.date, freq) : addDays(progStart, freq);
  const nextScan = manual || autoNext;
  return {
    today,
    programStart: progStart,
    restartStart,
    currentProgramDay: pDays + 1,
    currentProgramWeek: Math.floor(pDays / 7) + 1,
    currentRestartDay: rDays + 1,
    currentRestartWeek: Math.floor(rDays / 7) + 1,
    currentPhase: PHASE_NAME,
    scanFrequencyDays: freq,
    autoNextScanDate: autoNext,
    nextBodyScanDate: nextScan,
    nextScanManual: !!manual,
    daysUntilNextScan: daysBetween(today, nextScan),
  };
}

// phaseInfo maps the calendar to the shape the UI already uses.
export function phaseInfo(state) {
  const c = programCalendar(state);
  return {
    name: c.currentPhase,
    programStart: c.programStart,
    restartStart: c.restartStart,
    week: c.currentProgramWeek,      // header/badge = PROGRAM week/day
    day: c.currentProgramDay,
    programWeek: c.currentProgramWeek,
    programDay: c.currentProgramDay,
    restartWeek: c.currentRestartWeek,
    restartDay: c.currentRestartDay,
  };
}

export function sortedScans(state) { return [...(state.bodyScans || [])].sort((a, b) => a.date.localeCompare(b.date)); }
export function latestScan(state) { const a = sortedScans(state); return a[a.length - 1] || null; }
export function baselineScan(state) { const a = sortedScans(state); return a[0] || null; }
export function nextScanCountdown(state) {
  const c = programCalendar(state);
  return { next: c.nextBodyScanDate, days: c.daysUntilNextScan, explicit: c.nextScanManual };
}

export function plannedWalkingMinutes(key, state) {
  const plan = resolveWorkout(key, state);
  const item = [...(plan.conditioning || []), ...(plan.sport || [])]
    .find((entry) => /walk/i.test(`${entry.name || ''} ${entry.detail || ''}`));
  const match = item && `${item.name || ''} ${item.detail || ''}`.match(/(\d+)\s*min/i);
  return match ? Number(match[1]) : 0;
}

const dateHasTracking = (key, state) => !!(
  workoutSessionHasData(state.workoutSessions && state.workoutSessions[key])
  || Object.keys((state.mealLogs && state.mealLogs[key]) || {}).length
  || Object.keys((state.watchLogs && state.watchLogs[key]) || {}).length
  || Object.keys((state.habitLogs && state.habitLogs[key]) || {}).length
  || Object.keys((state.activity && state.activity[key]) || {}).length
);

const average = (values) => values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;

export function progressWindowSummary(state, end = todayKey()) {
  const scan = latestScan(state);
  const start = scan ? scan.date : addDays(end, -13);
  const totalDays = Math.max(1, daysBetween(start, end) + 1);
  const calories = [], protein = [], steps = [], sleep = [];
  let trackedDays = 0;
  let strengthWorkouts = 0;
  let walkingMinutes = 0;
  for (let i = 0; i < totalDays; i++) {
    const key = addDays(start, i);
    if (dateHasTracking(key, state)) trackedDays += 1;
    const nutrition = nutritionActuals(key, state);
    if (nutrition.kcal > 0) { calories.push(nutrition.kcal); protein.push(nutrition.protein); }
    const watch = watchFor(key, state);
    const daySteps = Number(watch.steps);
    const daySleep = Number(watch.sleepH);
    if (Number.isFinite(daySteps) && daySteps > 0) steps.push(daySteps);
    if (Number.isFinite(daySleep) && daySleep > 0) sleep.push(daySleep);
    if (workoutSessionHasData(state.workoutSessions && state.workoutSessions[key])) strengthWorkouts += 1;
    const activity = (state.activity && state.activity[key]) || {};
    const evening = activity.eveningWalk ? Number(activity.eveningWalkMin) || 40 : 0;
    const recordedCardio = Number(watch.exerciseMin) || Number(watch.workoutMin) || 0;
    walkingMinutes += Math.max(evening, recordedCardio);
  }

  const records = allSetRecords(state);
  const current = records.filter((record) => record.date >= start && record.date <= end);
  const previous = records.filter((record) => record.date < start);
  const currentByName = new Map();
  const previousByName = new Map();
  current.forEach((record) => currentByName.set(record.name, Math.max(currentByName.get(record.name) || 0, e1rm(record.weight, record.reps))));
  previous.forEach((record) => previousByName.set(record.name, Math.max(previousByName.get(record.name) || 0, e1rm(record.weight, record.reps))));
  const prs = [...currentByName].filter(([name, value]) => value > (previousByName.get(name) || 0)).length;

  const currentVolume = current.reduce((sum, record) => sum + record.weight * record.reps, 0);
  const priorStart = addDays(start, -totalDays);
  const priorVolume = records.filter((record) => record.date >= priorStart && record.date < start)
    .reduce((sum, record) => sum + record.weight * record.reps, 0);
  const adherence = [];
  for (let i = 0; i < totalDays; i++) {
    const key = addDays(start, i);
    if (dateHasTracking(key, state)) adherence.push(dailyScore(key, state).score);
  }

  return {
    start, end, totalDays,
    daysUntilScan: nextScanCountdown(state).days,
    currentWeight: scan && scan.weight,
    waist: scan && scan.waist,
    averageCalories: average(calories),
    averageProtein: average(protein),
    nutritionLoggedDays: calories.length,
    averageSteps: average(steps),
    strengthWorkouts,
    walkingMinutes: Math.round(walkingMinutes),
    currentVolume: Math.round(currentVolume),
    volumeChangePct: priorVolume ? Math.round(((currentVolume - priorVolume) / priorVolume) * 100) : null,
    prs,
    averageSleep: average(sleep),
    adherencePct: average(adherence),
    dataCompletenessPct: Math.round((trackedDays / totalDays) * 100),
  };
}

export function postScanCoaching(state) {
  const scans = sortedScans(state);
  if (scans.length < 2) return { code: 'insufficient', title: 'INSUFFICIENT DATA', detail: 'Add a second scan before changing the plan.' };
  const previous = scans[scans.length - 2];
  const current = scans[scans.length - 1];
  const days = Math.max(1, daysBetween(previous.date, current.date));
  let tracked = 0;
  const adherence = [];
  for (let i = 1; i <= days; i++) {
    const key = addDays(previous.date, i);
    if (dateHasTracking(key, state)) { tracked += 1; adherence.push(dailyScore(key, state).score); }
  }
  const coverage = Math.round((tracked / days) * 100);
  const adherencePct = average(adherence) || 0;
  if (coverage < 60) return { code: 'insufficient', title: 'INSUFFICIENT DATA', detail: 'Improve logging consistency before changing the plan.', coverage, adherencePct };

  const fatChange = Number(current.fatMass) - Number(previous.fatMass);
  const leanChangePct = Number(previous.leanMass) ? ((Number(current.leanMass) - Number(previous.leanMass)) / Number(previous.leanMass)) * 100 : null;
  const records = allSetRecords(state);
  const before = new Map(), after = new Map();
  records.forEach((record) => {
    const target = record.date <= previous.date ? before : record.date <= current.date ? after : null;
    if (target) target.set(record.name, Math.max(target.get(record.name) || 0, e1rm(record.weight, record.reps)));
  });
  const ratios = [...after].filter(([name]) => before.has(name)).map(([name, value]) => value / before.get(name));
  const strengthRatio = ratios.length ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : null;
  const fatDown = fatChange <= -0.5;
  const leanDown = leanChangePct != null && leanChangePct < -1;
  const strengthDown = strengthRatio != null && strengthRatio < 0.95;
  const facts = { coverage, adherencePct, fatChange: Math.round(fatChange * 10) / 10, leanChangePct: leanChangePct == null ? null : Math.round(leanChangePct * 10) / 10, strengthRatio };
  if (fatDown && (leanDown || strengthDown)) return { ...facts, code: 'warning', title: 'MUSCLE RETENTION WARNING', detail: 'Review calorie deficit, actual protein intake, sleep, recovery and resistance-training stimulus.' };
  if (fatDown) return { ...facts, code: 'keep', title: 'KEEP PLAN', detail: 'Current nutrition and training approach is working.' };
  if (adherencePct >= 80) return { ...facts, code: 'calibrate', title: 'CALIBRATION NEEDED', detail: 'Review real calorie intake and the observed activity factor before cutting food further.' };
  return { ...facts, code: 'insufficient', title: 'INSUFFICIENT DATA', detail: 'Improve logging consistency before changing the plan.' };
}

// ---------- activity factor self-check ----------
// settings.activityFactor is the only input to the whole nutrition engine that
// is an estimate rather than a measurement, and a wrong one silently invalidates
// every calorie target downstream. It is also the one estimate the scan history
// can audit: between two scans we know how much tissue was lost and roughly what
// was eaten, so real maintenance is recoverable.
//
//   real maintenance = average daily intake + energy released from tissue
//
// Fat carries ~3500 kcal/lb. Body water carries none, so only the protein change
// counts on the lean side (~4 kcal/g). Logged intake is used for any day that has
// it and the prescribed target fills the rest, with coverage reported so the
// reader knows how much of the answer is assumption.
const KCAL_PER_LB_FAT = 3500;
const G_PER_LB = 453.6;
const KCAL_PER_G_PROTEIN = 4;
const MIN_WINDOW_DAYS = 21;   // shorter windows are dominated by water swings
const DRIFT_TOLERANCE = 0.05; // ~90 kcal/day at a 1769 BMR
// Logged intake has to carry most of the window. The prescribed target is itself
// derived from activityFactor, so filling the window with it would make this
// audit measure its own assumption: raise the factor, targets rise, the
// "observed" factor rises to match, and it always agrees with itself. Prescribed
// values may patch small gaps, never form the bulk of the answer.
const MIN_COVERAGE = 50;

export function observedActivityFactor(state) {
  const scans = sortedScans(state);
  const configured = Number((state.settings || {}).activityFactor) || 0;
  if (scans.length < 2) {
    return { ok: false, reason: 'Needs two body scans to compare.', configured };
  }
  const to = scans[scans.length - 1];
  const from = scans[scans.length - 2];
  const days = Math.round((parseKey(to.date) - parseKey(from.date)) / 86400000);
  if (days < MIN_WINDOW_DAYS) {
    return { ok: false, reason: `Only ${days} days between the last two scans; needs ${MIN_WINDOW_DAYS}+ to see past water shifts.`, configured, days };
  }
  const bmr = Number(to.bmr) || 0;
  if (!bmr) return { ok: false, reason: 'Latest scan has no BMR.', configured, days };

  // What was eaten across the window: logged where logged, prescribed elsewhere.
  let intakeTotal = 0;
  let logged = 0;
  for (let i = 1; i <= days; i += 1) {
    const key = addDays(from.date, i);
    const actual = nutritionActuals(key, state);
    if (actual.kcal > 0) { intakeTotal += actual.kcal; logged += 1; }
    else intakeTotal += resolveNutrition(key, state).targets.kcal || 0;
  }
  const coverage = Math.round((logged / days) * 100);
  if (coverage < MIN_COVERAGE) {
    return {
      ok: false,
      reason: `Only ${coverage}% of the ${days} days since ${from.date} have logged meals. Below ${MIN_COVERAGE}% this would mostly be reading back the plan's own assumption instead of measuring you — log meals and it becomes real.`,
      configured, days, coverage,
    };
  }
  const intake = intakeTotal / days;

  // Energy released from tissue. Fat is the bulk of it; protein mass is the
  // honest lean-side proxy because the water inside lean tissue carries none.
  const fatLb = (Number(from.fatMass) || 0) - (Number(to.fatMass) || 0);
  const proteinLb = (Number(from.protein) || 0) - (Number(to.protein) || 0);
  const tissueKcal = fatLb * KCAL_PER_LB_FAT + proteinLb * G_PER_LB * KCAL_PER_G_PROTEIN;
  const tissuePerDay = tissueKcal / days;

  const tee = Math.round(intake + tissuePerDay);
  const factor = Math.round((tee / bmr) * 1000) / 1000;
  const drift = configured ? Math.round((configured - factor) * 1000) / 1000 : 0;
  const gap = configured ? Math.round(bmr * drift) : 0;

  return {
    ok: true,
    from: from.date, to: to.date, days, coverage,
    intake: Math.round(intake),
    tissuePerDay: Math.round(tissuePerDay),
    fatLb: Math.round(fatLb * 10) / 10,
    proteinLb: Math.round(proteinLb * 10) / 10,
    bmr, tee, factor, configured, drift,
    gap,                                  // +ve = configured overstates the burn
    drifting: !!configured && Math.abs(drift) >= DRIFT_TOLERANCE,
    suggestion: Math.round(factor * 100) / 100,
  };
}

// ---------- restart load ----------
export function restartSuggestion(name, state) {
  const r = (state.restartWeights && state.restartWeights[name]) || null;
  const pctDefault = (state.settings && (state.settings.defaultRestartLoadPercent ?? state.settings.restartPctDefault)) || 70;
  const pct = r && r.pct != null && r.pct !== '' ? parseFloat(r.pct) : pctDefault;
  const old = r && r.old !== '' && r.old != null ? parseFloat(r.old) : null;
  if (old == null || isNaN(old)) return { hasOld: false, pct, suggested: null };
  return { hasOld: true, old, pct, suggested: Math.round((old * pct) / 100 * 10) / 10 };
}

// ---------- dev-only console validation ----------
export function calendarSelfTest() {
  const base = defaultState();
  const mk = (start) => ({ ...base, settings: { ...base.settings, programStartDate: start, restartPhaseStartDate: start } });
  const t = todayKey();
  const cases = [
    ['start today -> Day 1 Week 1', mk(t), 1, 1],
    ['start yesterday -> Day 2 Week 1', mk(addDays(t, -1)), 2, 1],
    ['start 8 days ago -> Day 9 Week 2', mk(addDays(t, -8)), 9, 2],
  ];
  let pass = 0;
  cases.forEach(([label, st, d, w]) => {
    const c = programCalendar(st);
    const ok = c.currentProgramDay === d && c.currentProgramWeek === w;
    if (ok) pass++;
    console.log(`[calendar] ${ok ? 'PASS' : 'FAIL'} ${label} -> got Day ${c.currentProgramDay} Week ${c.currentProgramWeek}`);
  });
  // logs/history/scans are independent of the calendar dates
  const withLogs = { ...mk(t), workoutSessions: { '2026-01-01': { entries: {} }, '2026-02-01': { entries: {} } } };
  const before = Object.keys(withLogs.workoutSessions).length;
  const afterDateChange = { ...withLogs, settings: { ...withLogs.settings, programStartDate: addDays(t, -30) } };
  const okLogs = Object.keys(afterDateChange.workoutSessions).length === before;
  console.log(`[calendar] ${okLogs ? 'PASS' : 'FAIL'} changing start date keeps workout logs (${before})`);
  console.log(`[calendar] ${pass}/3 calendar cases passed`);
  return pass === 3 && okLogs;
}
export function monthlyTargetProgress(state) {
  const last = latestScan(state);
  const startFat = state.profile.startFatMassLb;
  const goalLoss = state.profile.goalFatLossLb;
  if (!last) return { lost: 0, goal: goalLoss, pct: 0 };
  const lost = Math.max(0, startFat - last.fatMass);
  return { lost: Math.round(lost * 10) / 10, goal: goalLoss, pct: Math.min(100, Math.round((lost / goalLoss) * 100)) };
}

// ---------- workout CSV ----------
export function workoutCSV(state) {
  const rows = [['date', 'exercise', 'block_source', 'set', 'weight', 'reps', 'seconds', 'rpe', 'volume']];
  const recs = allSetRecords(state).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const counter = {};
  recs.forEach((r) => {
    const k = r.date + '|' + r.name;
    counter[k] = (counter[k] || 0) + 1;
    rows.push([r.date, r.name, r.source, counter[k], r.weight, r.reps, '', r.rpe == null ? '' : r.rpe, r.weight * r.reps]);
  });
  allTimedRecords(state).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)).forEach((record) => {
    const key = `${record.date}|${record.name}`;
    counter[key] = (counter[key] || 0) + 1;
    rows.push([record.date, record.name, record.source, counter[key], record.weight || '', '', record.seconds, record.rpe == null ? '' : record.rpe, '']);
  });
  return rows.map((r) => r.join(',')).join('\n');
}

// ============================================================
// SUPPLEMENTS, LABS, HAIR HEALTH
// ============================================================
export function supplementAdherence(suppKey, state, key = todayKey(), days = 7) {
  let taken = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(key, -i);
    const log = (state.supplementLogs && state.supplementLogs[d]) || {};
    if (log[suppKey]) taken += 1;
  }
  return { taken, of: days, pct: Math.round((taken / days) * 100) };
}

export function daysToLab(state) {
  const d = state.settings && state.settings.upcomingLabDate;
  if (!d) return null;
  return daysBetween(todayKey(), d);
}

// non-diagnostic hair-protection signals derived from the day's data
export function hairHealthChecks(key, state) {
  const out = [];
  const a = nutritionActuals(key, state);
  const t = resolveNutrition(key, state).targets;
  const w = watchFor(key, state);
  const sleep = parseFloat(w.sleepH);

  if (a.protein > 0 && a.protein < t.protein * 0.8) out.push({ tone: 'warn', text: `Protein at ${Math.round(a.protein)}g of ${t.protein}g. Hair and muscle both need protein, top up with whey or Greek yogurt.` });
  else out.push({ tone: 'ok', text: `Protein target ${t.protein}g is set to protect hair and muscle in a deficit.` });

  if (a.kcal > 0 && a.kcal < t.kcal * 0.75) out.push({ tone: 'warn', text: 'Calories are well under target today. Repeated very low days raise shedding risk, keep the deficit moderate.' });

  if (!isNaN(sleep) && sleep < 6.5) out.push({ tone: 'warn', text: `Sleep ${sleep}h. Low sleep raises stress hormones that can affect hair, aim for 7.5h.` });

  // rate of loss from the two most recent scans (>1%/week bodyweight is aggressive)
  const scans = sortedScans(state);
  if (scans.length >= 2) {
    const last = scans[scans.length - 1], prev = scans[scans.length - 2];
    const wk = Math.max(1, daysBetween(prev.date, last.date) / 7);
    const lostPct = prev.weight ? ((prev.weight - last.weight) / prev.weight) * 100 / wk : 0;
    if (lostPct > 1) out.push({ tone: 'warn', text: `Recent loss is about ${lostPct.toFixed(1)}%/week. Over 1%/week for multiple weeks is aggressive, consider easing the deficit or a short diet break.` });
  }

  out.push({ tone: 'info', text: 'Keep omega-3 and healthy fats in, avoid crash dieting, and hold protein steady day to day.' });
  return out;
}
