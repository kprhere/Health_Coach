// ============================================================
// nutritionEngine.js - goal + body-composition aware nutrition
// ------------------------------------------------------------
// Everything here is DERIVED from two real inputs:
//   1. your latest Evolt 360 scan  (weight, lean mass, BMR, TEE)
//   2. your goal                   (fat to lose, body-fat %, timeline)
// so the calorie + macro targets and the food options update by
// themselves whenever you log a new scan or change the goal.
//
// It intentionally has NO dependency on helpers.js (helpers imports
// this), so the scan picker is re-implemented locally and small.
// ============================================================
import { NUTRITION, PROGRAM } from './data.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const LB_PER_KG = 2.20462;

// local, dependency-free "latest scan" so we never import helpers
function pickLatestScan(state) {
  const scans = (state && state.bodyScans) || [];
  if (!scans.length) return null;
  return [...scans].sort((a, b) => a.date.localeCompare(b.date))[scans.length - 1];
}

// ============================================================
// 1. NUTRITION PROFILE  (the "why these numbers" engine)
// ============================================================
// Returns the personalized daily anchor: maintenance calories, the
// fat-loss deficit, and protein / fat floors that protect muscle and
// hair in a deficit. Carbs are whatever calories are left after that.
export function nutritionProfile(state) {
  const scan = pickLatestScan(state);
  const profile = (state && state.profile) || {};
  const settings = (state && state.settings) || {};

  const bw = scan?.weight || profile.startWeightLb || 190;      // lb
  const bfPct = scan?.bodyFatPct ?? profile.startBodyFatPct ?? 24;
  const leanMass = scan?.leanMass || Math.round(bw * (1 - bfPct / 100) * 10) / 10; // lb
  const bmr = scan?.bmr || Math.round(370 + 21.6 * (leanMass / LB_PER_KG));
  // Maintenance: prefer the scan's measured total energy expenditure,
  // otherwise estimate from BMR and a light-active multiplier.
  const tdee = scan?.tee || Math.round(bmr * 1.55);

  // ---- deficit sized for steady, hair-safe fat loss ----
  // Default 20% below maintenance = a moderate cut (~0.5-0.7% bodyweight
  // per week), which the app's own hair guidance calls the safe ceiling.
  const deficitPct = Number(settings.deficitPercent) > 0 ? Number(settings.deficitPercent) : 20;
  const calFloor = Math.max(1500, Math.round(bmr * 1.1)); // never diet below this
  const baseCals = Math.max(Math.round((tdee * (100 - deficitPct)) / 100), calFloor);

  // ---- protein: anchored to LEAN MASS, held high to keep muscle + hair ----
  // 1.3 g per lb of lean mass, clamped to 1.6-2.4 g/kg bodyweight.
  const bwKg = bw / LB_PER_KG;
  const protein = Math.round(clamp(leanMass * 1.3, bwKg * 1.6, bwKg * 2.4) / 5) * 5;

  // ---- fat: 0.35 g/lb bodyweight (hormones), kept moderate for LDL 123 ----
  const fat = Math.round((bw * 0.35) / 5) * 5;

  // ---- water: 35 ml per kg bodyweight, rounded to a friendly value ----
  const waterL = Math.round((bwKg * 0.035) * 4) / 4;

  // weekly deficit -> expected loss, and time to the goal
  const weeklyDeficit = (tdee - baseCals) * 7;
  const lbPerWeek = Math.round((weeklyDeficit / 3500) * 100) / 100;
  const goalFat = profile.goalFatLossLb || 20;
  const weeksToGoal = lbPerWeek > 0 ? Math.round(goalFat / lbPerWeek) : null;

  return {
    scanDate: scan?.date || null,
    hasScan: !!scan,
    bw, bfPct, leanMass, bmr, tdee,
    deficitPct, baseCals, calFloor,
    protein, fat, waterL,
    lbPerWeek, weeksToGoal, weeklyDeficit,
    goalFat,
    goalBodyFatPct: profile.goalBodyFatPct || 15,
    goalWaistIn: profile.goalWaistIn || null,
    // human-readable rationale lines for the "targets from your scan" card
    explain: [
      `Maintenance ${tdee} kcal comes from your ${scan?.date || 'latest'} scan (TEE${scan?.tee ? '' : ' est.'}).`,
      `A ${deficitPct}% cut sets ${baseCals} kcal/day — about ${lbPerWeek} lb/week, a hair-safe pace.`,
      `Protein ${protein} g is 1.3 g per lb of your ${leanMass} lb lean mass, to hold muscle and hair.`,
      `Fat ${fat} g (~0.35 g/lb) supports hormones while staying LDL-friendly; carbs fill the rest.`,
    ],
  };
}

// day-type calorie multipliers around the personal base (calorie cycling)
const DAY_CAL_MULT = { training: 1.09, rest: 0.955, fastThu: 0.91, vegSat: 0.977 };
const DAY_FAT_MULT = { training: 1.0, rest: 1.0, fastThu: 0.9, vegSat: 0.95 };

// ============================================================
// 2. PER-DAY TARGETS  (replaces the hardcoded NUTRITION.targets)
// ============================================================
export function personalTargets(dayType, state) {
  const p = nutritionProfile(state);
  const calMult = DAY_CAL_MULT[dayType] ?? 1;
  const fatMult = DAY_FAT_MULT[dayType] ?? 1;

  const kcal = Math.round((p.baseCals * calMult) / 10) * 10;
  const protein = p.protein; // protein never flexes with the day
  const fat = Math.round((p.fat * fatMult) / 5) * 5;
  const carbs = Math.max(60, Math.round((kcal - protein * 4 - fat * 9) / 4 / 5) * 5);
  const fiber = clamp(Math.round((kcal / 1000) * 15), 28, 45);
  const waterL = dayType === 'training' || dayType === 'fastThu'
    ? Math.round((p.waterL + 0.25) * 100) / 100
    : p.waterL;

  return { kcal, protein, carbs, fat, fiber, waterL, _profile: p };
}

// ============================================================
// 3. FOOD DATABASE  (portion baked into each entry -> macros are exact)
// veg:false = contains chicken/fish. tags drive the goal chips.
//   lean  = high protein per calorie (fat-loss friendly)
//   ldl   = low saturated fat / good for LDL 123
//   gi    = low-GI or carbs paired with protein (good for HbA1c 5.6)
//   omega = omega-3 source
// ============================================================
const F = (label, per, p, c, f, kcal, veg, tags = []) => ({ label, per, p, c, f, kcal, veg, tags });
export const FOODS = {
  // proteins
  chicken:   F('Grilled chicken breast', '150 g', 46, 0, 6, 250, false, ['lean', 'ldl', 'gi']),
  fish:      F('Grilled fish (rohu / tilapia)', '150 g', 34, 0, 9, 220, false, ['lean', 'omega', 'ldl', 'gi']),
  eggmix:    F('4 egg whites + 1 whole egg', '', 20, 1, 5, 120, true, ['lean', 'gi']),
  whey15:    F('Whey', '1.5 scoops', 36, 5, 2, 180, true, ['lean', 'gi']),
  whey1:     F('Whey', '1 scoop', 24, 3, 1, 120, true, ['lean', 'gi']),
  gyog:      F('Greek yogurt', '200 g', 20, 9, 5, 165, true, ['lean', 'gi']),
  paneer:    F('Low-fat paneer', '100 g', 18, 4, 8, 160, true, ['ldl', 'gi']),
  tofu:      F('Tofu', '150 g', 17, 3, 9, 170, true, ['ldl', 'gi', 'omega']),
  dal:       F('Dal', '1 bowl', 12, 30, 4, 200, true, ['gi', 'ldl']),
  rajma:     F('Rajma / chana', '1 bowl', 13, 32, 3, 210, true, ['gi', 'ldl']),
  // carbs
  oats:      F('Oats (in almond milk)', '50 g', 6, 30, 3, 170, true, ['gi']),
  brownrice: F('Brown rice', '1 cup', 5, 45, 2, 215, true, ['gi']),
  quinoa:    F('Quinoa', '1 cup', 8, 39, 4, 220, true, ['gi']),
  roti2:     F('Roti', '2', 6, 36, 6, 220, true, ['gi']),
  millet2:   F('Millet / bajra roti', '2', 6, 40, 4, 220, true, ['gi']),
  idli2:     F('Idli', '2', 4, 24, 1, 130, true, ['gi']),
  banana:    F('Banana', '1', 1, 27, 0, 105, true, []),
  // fruit / fat / veg
  berries:   F('Mixed berries', '1 cup', 1, 15, 0, 60, true, ['gi']),
  almonds:   F('Soaked almonds', '10', 3, 3, 6, 70, true, ['ldl']),
  chiaflax:  F('Chia + flax', '1 tbsp', 3, 6, 5, 90, true, ['omega', 'ldl']),
  salad:     F('Large salad + olive oil', '', 2, 8, 6, 90, true, ['ldl']),
  sabzi:     F('Mixed veg sabzi', '', 3, 10, 5, 90, true, ['ldl']),
  buttermilk:F('Buttermilk', '1 glass', 4, 6, 2, 70, true, ['gi']),
};

function sumFoods(keys) {
  return keys.reduce(
    (acc, k) => {
      const it = FOODS[k];
      acc.p += it.p; acc.c += it.c; acc.f += it.f; acc.kcal += it.kcal;
      it.tags.forEach((t) => acc.tags.add(t));
      if (!it.veg) acc.veg = false;
      return acc;
    },
    { p: 0, c: 0, f: 0, kcal: 0, veg: true, tags: new Set() },
  );
}

// short chip name for the option switcher, taken from the headline food
const SHORT = {
  chicken: 'Chicken', fish: 'Fish', paneer: 'Paneer', tofu: 'Tofu', eggmix: 'Eggs',
  whey15: 'Whey', whey1: 'Whey', gyog: 'Yogurt', rajma: 'Rajma', dal: 'Dal',
  oats: 'Oats', banana: 'Fruit', buttermilk: 'Chaas', berries: 'Berries', chiaflax: 'Seeds',
};
const HEADLINE_ORDER = ['chicken', 'fish', 'paneer', 'tofu', 'eggmix', 'whey15', 'whey1', 'gyog', 'rajma', 'dal', 'oats', 'banana', 'buttermilk', 'berries', 'chiaflax'];

// build one option object from a list of food keys
function opt(keys, extraTags = []) {
  const s = sumFoods(keys);
  const tags = new Set([...s.tags, ...extraTags]);
  // derive fat-loss "lean" tag from actual protein density
  if (s.kcal > 0 && s.p / s.kcal >= 0.11) tags.add('lean');
  const headline = HEADLINE_ORDER.find((k) => keys.includes(k)) || keys[0];
  return {
    items: keys.map((k) => `${FOODS[k].label}${FOODS[k].per ? ` (${FOODS[k].per})` : ''}`),
    keys,
    short: SHORT[headline] || FOODS[headline].label.split(' ')[0],
    veg: s.veg,
    p: s.p, c: s.c, f: s.f, kcal: s.kcal,
    tags: [...tags],
  };
}

// ============================================================
// 4. MEAL PLAN  (slots, each with 2-3 goal-aware options)
// ============================================================
// Every option is filtered by the day's rules (veg days hide chicken /
// fish) and tagged so the UI can show WHY it fits: high-protein for the
// fat-loss goal, LDL-smart, or low-GI for HbA1c.
function slot(name, time, optionKeyLists) {
  return { name, time, options: optionKeyLists.map((k) => opt(k)) };
}

export function mealPlanFor(dayType, state) {
  const settings = (state && state.settings) || {};
  const egg = settings.eggAllowed !== false;
  const isVegDay = dayType === 'vegSat' || dayType === 'fastThu';

  let slots;
  if (dayType === 'fastThu') {
    // fasted until 6 PM, then break gently + high-protein veg dinner
    slots = [
      { name: 'Fasting window', time: '5 AM – 6 PM', options: [opt(['buttermilk'])], fasting: true,
        note: 'Water, black coffee, green tea only. Emergency: one fruit OR one glass of milk.' },
      slot('Break the fast (gentle)', '6:00 PM', [['banana', 'almonds'], ['berries', 'buttermilk']]),
      slot('High-protein veg dinner', '7:30 PM', [
        ['paneer', 'dal', 'millet2', 'salad'],
        ['tofu', 'rajma', 'quinoa', 'salad'],
        ['paneer', 'sabzi', 'roti2', 'gyog'],
      ]),
      slot('Protein before bed', '9:30 PM', [['whey1'], ['gyog']]),
    ];
  } else {
    const wake = slot('On waking (fasted)', dayType === 'training' ? '5:15 AM' : '6:00 AM', [
      ['chiaflax', 'almonds'], ['banana', 'almonds'], ['buttermilk'],
    ]);
    const breakfast = slot(dayType === 'training' ? 'Post-workout breakfast' : 'Breakfast',
      dayType === 'training' ? '7:30 AM' : '8:00 AM', [
        ['oats', 'whey15', 'chiaflax', 'berries'],
        egg ? ['eggmix', 'idli2', 'berries'] : ['gyog', 'idli2', 'berries'],
        ['gyog', 'oats', 'berries', 'almonds'],
      ]);
    const lunch = slot('Lunch', dayType === 'vegSat' ? '1:00 PM' : '12:30 PM',
      isVegDay
        ? [['paneer', 'rajma', 'brownrice', 'salad'], ['tofu', 'dal', 'quinoa', 'salad'], ['paneer', 'dal', 'millet2', 'salad']]
        : [['chicken', 'brownrice', 'dal', 'salad'], ['fish', 'quinoa', 'salad'], ['paneer', 'rajma', 'brownrice', 'salad']]);
    const snack = slot('Snack', '4:00 PM', [
      ['whey1', 'banana'], ['gyog', 'berries', 'almonds'], ['buttermilk', 'almonds'],
    ]);
    const dinner = slot('Dinner', '7:30 PM',
      isVegDay
        ? [['paneer', 'dal', 'roti2', 'salad'], ['tofu', 'sabzi', 'quinoa', 'salad'], ['paneer', 'sabzi', 'millet2', 'gyog']]
        : [['chicken', 'millet2', 'sabzi', 'salad'], ['fish', 'sabzi', 'quinoa', 'salad'], ['paneer', 'dal', 'roti2', 'salad']]);
    const bed = { ...slot('Optional bedtime (if protein low)', '9:30 PM', [['whey1'], ['gyog']]), optional: true };
    slots = dayType === 'rest'
      ? [wake, breakfast, lunch, snack, dinner, bed]
      : [wake, breakfast, lunch, snack, dinner, bed];
  }

  // final safety filter: never show a non-veg option on a veg / fast day
  if (isVegDay) slots = slots.map((s) => ({ ...s, options: s.options.filter((o) => o.veg) }));
  return slots;
}

// tag -> short human label + tone (for chips in the UI)
export const GOAL_TAG_META = {
  lean:  { label: 'High protein', tone: 'cyan' },
  ldl:   { label: 'LDL-smart', tone: 'green' },
  gi:    { label: 'Low GI', tone: 'violet' },
  omega: { label: 'Omega-3', tone: 'amber' },
};

// fallback to the old static targets if, somehow, no scan exists
export function targetsWithFallback(dayType, state) {
  const p = nutritionProfile(state);
  if (!p.hasScan) return { ...(NUTRITION.targets[dayType] || NUTRITION.targets.training), _profile: p };
  return personalTargets(dayType, state);
}

export const dayTypeOf = (dow) => PROGRAM.days[dow]?.dayType || 'training';
