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
import { NUTRITION, programOf } from './data.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const LB_PER_KG = 2.20462;
const PROTEIN_CEILING_G = 210;

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
  // ---- maintenance ----
  // The Evolt TEE is BMR times an activity level the device GUESSES. When that
  // guess is wrong every downstream target is wrong, and it was: the 08-13-2026
  // scan assumed factor 1.54 (badminton included) while the observed weight
  // change implies 1.37. So an explicit activityFactor, checked against real
  // scale movement, wins over the device's number whenever it is set.
  const activityFactor = Number(settings.activityFactor) > 0 ? Number(settings.activityFactor) : 0;
  const tdee = activityFactor > 0
    ? Math.round(bmr * activityFactor)
    : (scan?.tee || Math.round(bmr * 1.55));

  // ---- deficit sized for steady, hair-safe fat loss ----
  // 15% below a TRUTHFUL maintenance. The lean-mass loss on 08-13-2026 happened
  // at a real deficit of only ~166 kcal/day, so the deficit was never the
  // problem and cutting it further only pushes the goal out of reach. Protein
  // and training stimulus are the levers that protect muscle here.
  const deficitPct = Number(settings.deficitPercent) > 0 ? Number(settings.deficitPercent) : 15;
  const calFloor = Math.max(1500, Math.round(bmr * 1.1)); // never diet below this
  const baseCals = Math.max(Math.round((tdee * (100 - deficitPct)) / 100), calFloor);

  // ---- protein: anchored to LEAN MASS, held high to keep muscle + hair ----
  // 1.45 g per lb of lean mass, clamped to 1.7-2.6 g/kg bodyweight.
  // Raised from 1.3 after the 08-13-2026 scan: at 1.3 (190 g) more than half
  // the weight lost came off lean mass, so the anchor was too low to protect
  // muscle at this training load. 1.45 also matches Evolt's own 204-212 g call.
  // Capped at 210 g: the 11-13-2026 scan's lean mass (149.9 lb) is about
  // 4 lb of water, which would push the target to 215 g. Past ~1 g per lb of
  // bodyweight extra protein protects no more muscle, and 215 g is out of
  // reach on the no-moon fast day's meal plan.
  const bwKg = bw / LB_PER_KG;
  const protein = Math.min(PROTEIN_CEILING_G, Math.round(clamp(leanMass * 1.45, bwKg * 1.7, bwKg * 2.6) / 5) * 5);

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
      activityFactor > 0
        ? `Maintenance ${tdee} kcal is your ${bmr} BMR x ${activityFactor} activity, checked against real scale movement (the scan's own TEE assumes badminton you are not playing).`
        : `Maintenance ${tdee} kcal comes from your ${scan?.date || 'latest'} scan (TEE${scan?.tee ? '' : ' est.'}).`,
      `A ${deficitPct}% cut sets ${baseCals} kcal/day — about ${lbPerWeek} lb/week, a hair-safe pace.`,
      `Protein ${protein} g is 1.45 g per lb of your ${leanMass} lb lean mass, to hold muscle and hair.`,
      `Fat ${fat} g (~0.35 g/lb) supports hormones while staying LDL-friendly; carbs fill the rest.`,
    ],
  };
}

// day-type calorie multipliers around the personal base (calorie cycling)
// trainingVeg / restVeg are the vegetarian twins of training / rest (Thursday
// and Puratasi): identical calories and identical protein, vegetarian food only.
// Going veg must not quietly become a calorie cut.
//
// v5 retired the Thursday fast (0.91) and made Thursday a trainingVeg day.
// Training and rest were trimmed so the template week still sums to the same
// total: old 4 x 1.09 + 0.955 + 0.91 + 0.977 = 7.202, new 5 x 1.06 + 0.93 +
// 0.977 = 7.207. Removing the fast must not raise weekly intake.
// A test locks this.
export const DAY_CAL_MULT = { training: 1.06, trainingVeg: 1.06, rest: 0.93, restVeg: 0.93, fastThu: 0.91, noMoonFast: 0.955, vegSat: 0.977 };
const DAY_FAT_MULT = { training: 1.0, trainingVeg: 1.0, rest: 1.0, restVeg: 1.0, fastThu: 0.9, noMoonFast: 0.9, vegSat: 0.95 };
// Protein never flexes with the day in the current template. fastThu (legacy,
// unscheduled since v5) kept its 80% because a 4-hour eating window cannot
// hold the full target.
const DAY_PROTEIN_MULT = { fastThu: 0.8 };

// ============================================================
// 2. PER-DAY TARGETS  (replaces the hardcoded NUTRITION.targets)
// ============================================================
export function personalTargets(dayType, state) {
  const p = nutritionProfile(state);
  const calMult = DAY_CAL_MULT[dayType] ?? 1;
  const fatMult = DAY_FAT_MULT[dayType] ?? 1;

  const kcal = Math.round((p.baseCals * calMult) / 10) * 10;
  const protein = Math.round((p.protein * (DAY_PROTEIN_MULT[dayType] ?? 1)) / 5) * 5;
  const fat = Math.round((p.fat * fatMult) / 5) * 5;
  const carbs = Math.max(60, Math.round((kcal - protein * 4 - fat * 9) / 4 / 5) * 5);
  const fiber = clamp(Math.round((kcal / 1000) * 15), 28, 45);
  const waterL = dayType === 'training' || dayType === 'trainingVeg' || dayType === 'fastThu'
    || dayType === 'noMoonFast'
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
  chickenEgg:F('105 g chicken + 4 egg whites (or 115 g chicken + 3 whites)', '', 46, 1, 4, 243, false, ['lean', 'gi']),
  fish:      F('Grilled fish (rohu / tilapia)', '150 g', 34, 0, 9, 220, false, ['lean', 'omega', 'ldl', 'gi']),
  salmon:    F('Grilled or baked salmon', '180 g', 42, 0, 15, 305, false, ['lean', 'omega', 'gi']),
  eggmix:    F('4 egg whites + 1 whole egg', '', 20, 1, 5, 120, false, ['lean', 'gi']),
  // Same eggs, listed as an add-on: the default dinner can be eaten without them.
  eggsOpt:   F('Eggs, optional: 4 whites + 1 whole', '', 20, 1, 5, 120, false, ['lean', 'gi']),
  whey15:    F('Whey', '1.5 scoops', 36, 5, 2, 180, true, ['lean', 'gi']),
  whey05:    F('Whey', '0.5 scoop', 12, 1.5, 0.5, 60, true, ['lean', 'gi']),
  whey1:     F('Whey', '1 scoop', 24, 3, 1, 120, true, ['lean', 'gi']),
  gyog:      F('Greek yogurt', '200 g', 20, 9, 5, 165, true, ['lean', 'gi']),
  paneer:    F('Low-fat paneer', '100 g', 18, 4, 8, 160, true, ['ldl', 'gi']),
  paneer150: F('Low-fat paneer', '150 g', 27, 6, 12, 240, true, ['ldl', 'gi']),
  tofu:      F('Tofu', '150 g', 17, 3, 9, 170, true, ['ldl', 'gi', 'omega']),
  dal:       F('Dal', '250 g cooked', 12, 30, 4, 200, true, ['gi', 'ldl']),
  rajma:     F('Rajma / chana', '1 bowl', 13, 32, 3, 210, true, ['gi', 'ldl']),
  // ---- Puratasi workhorses: the only veg foods dense enough to replace meat ----
  // Soya chunks carry 0.15 g protein per kcal, within reach of chicken's 0.18,
  // and nothing else vegetarian comes close. The pure-veg month depends on them.
  soya:      F('Soya chunks (meal maker)', '60 g dry', 31, 18, 1, 205, true, ['lean', 'gi', 'ldl']),
  soya90:    F('Soya chunks (meal maker)', '90 g dry', 47, 27, 2, 310, true, ['lean', 'gi', 'ldl']),
  gyog250:   F('Greek yogurt', '250 g', 25, 11, 6, 205, true, ['lean', 'gi']),
  milk:      F('Skim milk', '250 ml', 9, 12, 1, 88, true, ['gi']),
  curd:      F('Low-fat curd', '200 g', 7, 9, 3, 90, true, ['gi', 'ldl']),
  whey2:     F('Whey', '2 scoops', 48, 6, 2, 240, true, ['lean', 'gi']),
  // carbs
  oats:      F('Oats (in almond milk)', '50 g', 6, 30, 3, 170, true, ['gi']),
  // The overnight-oats bowl as it is actually made: 80 g oats soaked in
  // 200 ml unsweetened almond milk, 1.5 scoops whey, 10 g chia, 10 g flax,
  // 100 g berries, eaten after training with the creatine stirred in.
  oats80:    F('Rolled oats in 200 ml almond milk', '80 g', 11, 55, 8, 330, true, ['gi', 'ldl']),
  seeds20:   F('Chia 10 g + flax 10 g', '', 4, 7, 7, 102, true, ['omega', 'ldl']),
  berries100:F('Mixed berries', '100 g', 1, 12, 0, 50, true, ['gi']),
  brownrice: F('Brown rice', '200 g cooked', 5, 45, 2, 215, true, ['gi']),
  sweetpotato:F('Sweet potato', '200 g cooked', 4, 41, 0, 180, true, ['ldl']),
  quinoa:    F('Quinoa', '1 cup', 8, 39, 4, 220, true, ['gi']),
  roti2:     F('Roti', '2', 6, 36, 6, 220, true, ['gi']),
  millet2:   F('Millet / bajra roti', '2', 6, 40, 4, 220, true, ['gi']),
  idli2:     F('Idli', '2', 4, 24, 1, 130, true, ['gi']),
  banana:    F('Banana', '1', 1, 27, 0, 105, true, []),
  // fruit / fat / veg
  berries:   F('Mixed berries', '1 cup', 1, 15, 0, 60, true, ['gi']),
  almonds:   F('Soaked almonds', '10', 3, 3, 6, 70, true, ['ldl']),
  chiaflax:  F('Chia + flax', '1 tbsp', 3, 6, 5, 90, true, ['omega', 'ldl']),
  steamedVeg:F('Steamed broccoli + carrots', '200 g cooked', 4, 16, 1, 80, true, ['ldl', 'gi']),
  sabzi:     F('Mixed veg sabzi', '', 3, 10, 5, 90, true, ['ldl']),
  broccoli:  F('Steamed broccoli', '150 g', 4, 10, 0, 50, true, ['ldl', 'gi']),
  asparagus: F('Roasted asparagus', '150 g', 3, 6, 2, 50, true, ['ldl', 'gi']),
  buttermilk:F('Buttermilk', '1 glass', 4, 6, 2, 70, true, ['gi']),
  fastDrinks:F('Water, black coffee or green tea', '', 0, 0, 0, 0, true, []),
  // Cooking fat is the most-missed number in home cooking: one tablespoon is
  // 120 kcal. Every fed day budgets one measured tablespoon across all meals.
  oil1:      F('Cooking oil or ghee, measured with a spoon', '1 tbsp for the whole day', 0, 0, 14, 120, true, []),
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
  chicken: 'Chicken', chickenEgg: 'Chicken', fish: 'Fish', paneer: 'Paneer', tofu: 'Tofu', eggmix: 'Eggs', eggsOpt: 'Eggs',
  whey15: 'Whey', whey1: 'Whey', gyog: 'Yogurt', rajma: 'Rajma', dal: 'Dal',
  oats: 'Oats', oats80: 'Oats', banana: 'Fruit', soya: 'Soya', soya90: 'Soya', salmon: 'Salmon',
  paneer150: 'Paneer', gyog250: 'Yogurt', whey2: 'Whey', fastDrinks: 'Coffee / tea', oil1: 'Oil', buttermilk: 'Chaas', berries: 'Berries', chiaflax: 'Seeds',
};
const HEADLINE_ORDER = ['oats80', 'chickenEgg', 'chicken', 'fish', 'salmon', 'soya90', 'soya', 'paneer', 'paneer150', 'tofu', 'eggmix', 'whey2', 'whey15', 'whey1', 'gyog250', 'gyog', 'rajma', 'dal', 'oats', 'banana', 'buttermilk', 'berries', 'chiaflax'];

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
    headline,
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
// When two options in a slot share a headline ("Chicken" with rice and
// "Chicken" with sweet potato), the chips looked identical. Add the starch
// that tells them apart, or "low-carb" when the plate has none.
const STARCH_SHORT = {
  brownrice: 'rice', sweetpotato: 'sweet potato', quinoa: 'quinoa', millet2: 'millet roti',
  roti2: 'roti', idli2: 'idli', oats: 'oats', oats80: 'oats', banana: 'banana',
};
// Longer names used only when a shorter one would collide.
const FULL_SHORT = { chickenEgg: 'Chicken + whites' };
// Vegetable sides are on most plates, so they never name an option.
const VEG_SIDES = new Set(['steamedVeg', 'sabzi', 'broccoli', 'asparagus']);
const nameOf = (k) => (STARCH_SHORT[k] || SHORT[k] || FOODS[k].label.split(' ').slice(0, 2).join(' ')).toLowerCase();
function distinctShorts(options) {
  const groups = options.reduce((m, o) => m.set(o.short, [...(m.get(o.short) || []), o]), new Map());
  const used = new Set();
  return options.map((o, i) => {
    const dups = groups.get(o.short);
    if (dups.length < 2) return o;
    const others = dups.filter((d) => d !== o);
    const starch = o.keys.find((k) => STARCH_SHORT[k]);
    const othersHaveStarch = others.some((d) => d.keys.some((k) => STARCH_SHORT[k]));
    const tell = o.keys.find((k) => k !== o.headline && !VEG_SIDES.has(k) && others.every((d) => !d.keys.includes(k)));
    const lightest = others.every((d) => d.kcal > o.kcal);
    let short;
    if (starch && starch !== 'banana') short = `${o.short} + ${STARCH_SHORT[starch]}`;
    else if (tell) short = `${o.short} + ${nameOf(tell)}`;
    else if (othersHaveStarch) short = `${o.short} (low-carb)`;
    else if (others.every((d) => d.headline !== o.headline)) short = FULL_SHORT[o.headline] || o.short;
    else if (lightest) short = `${o.short} (lighter)`;
    else short = `${o.short} ${i + 1}`;
    if (used.has(short)) short = `${short} ${i + 1}`;
    used.add(short);
    return { ...o, short };
  });
}

function slot(name, time, optionKeyLists) {
  return { name, time, options: distinctShorts(optionKeyLists.map((k) => opt(k))) };
}

export function mealPlanFor(dayType, state) {
  const noMoonFast = dayType === 'noMoonFast';
  const isVegDay = dayType === 'vegSat' || dayType === 'fastThu' || noMoonFast
    || dayType === 'trainingVeg' || dayType === 'restVeg';
  const isTraining = dayType === 'training' || dayType === 'trainingVeg';

  let slots;
  if (dayType === 'fastThu') {
    // fasted until 6 PM, then break gently + high-protein veg dinner
    slots = [
      { name: 'Fasting window', time: '5 AM – 6 PM', options: [opt(['fastDrinks'])], fasting: true,
        note: 'Water, black coffee, green tea only. Emergency: one fruit OR one glass of milk.' },
      slot('Break the fast (gentle)', '6:00 PM', [['whey1', 'banana'], ['banana', 'almonds'], ['berries', 'buttermilk']]),
      // The swim sits between breaking the fast and dinner, so it earns a
      // protein slot of its own. Without it Thursday tops out around 117 g and
      // the day is impossible to eat, which is what this used to be.
      slot('After the swim', '8:15 PM', [['whey2'], ['gyog250'], ['whey1', 'milk']]),
      slot('High-protein veg dinner', '8:45 PM', [
        ['soya90', 'paneer', 'millet2', 'steamedVeg'],
        ['soya', 'dal', 'sabzi', 'steamedVeg'],
        ['tofu', 'rajma', 'quinoa', 'steamedVeg'],
      ]),
      slot('Protein before bed', '9:45 PM', [['whey1', 'milk'], ['gyog250'], ['curd']]),
    ];
  } else if (noMoonFast) {
    const end = '1:00 PM';
    const lunch = '2:00 PM';
    slots = [
      { name: 'No-moon fasting window', time: `On waking – ${end}`, options: [opt(['fastDrinks'])], fasting: true,
        note: `Fast until ${end}. Water, black coffee and green tea only.` },
      slot('Break the fast (gentle)', end, [['whey1', 'banana'], ['banana', 'almonds'], ['berries', 'buttermilk']]),
      slot('High-protein vegetarian lunch', lunch, [
        ['soya', 'brownrice', 'dal', 'steamedVeg'],
        ['soya', 'sweetpotato', 'dal', 'steamedVeg'],
        ['soya', 'paneer', 'millet2', 'steamedVeg'],
        ['tofu', 'rajma', 'quinoa', 'steamedVeg'],
      ]),
      slot('Protein snack', '5:00 PM', [['whey2', 'berries'], ['gyog250', 'berries'], ['whey1', 'milk']]),
      slot('Vegetarian dinner', '8:00 PM', [
        ['soya', 'paneer', 'sabzi', 'steamedVeg'],
        ['paneer150', 'dal', 'roti2', 'steamedVeg'],
        ['tofu', 'rajma', 'millet2', 'steamedVeg'],
      ]),
      { ...slot('Optional bedtime (if protein low)', '9:30 PM', [['whey1'], ['gyog250'], ['milk']]), optional: true },
    ];
  } else {
    // Pre-workout: 1 scoop of whey (with a banana when the session is long),
    // as actually drunk before the gym. Rest days start with a plain drink;
    // the seeds are already in the oats bowl.
    const wake = isTraining
      ? slot('Pre-workout', '7:00-7:15 AM', [['whey1', 'banana'], ['whey1'], ['banana']])
      : slot('On waking', '6:00 AM', [['fastDrinks'], ['chiaflax', 'almonds'], ['buttermilk']]);
    const breakfast = slot(isTraining ? 'Post-workout breakfast' : 'Breakfast',
      isTraining ? '9:00-9:30 AM' : '8:00 AM', [
        // Same bowl every day: 1.5 scoops go in it with the creatine. The
        // pre-workout scoop is separate, in the slot above.
        ['oats80', 'whey15', 'seeds20', 'berries100'],
        isVegDay ? ['gyog250', 'idli2', 'berries', 'whey1'] : ['eggmix', 'idli2', 'berries'],
        ['gyog', 'oats', 'berries', 'almonds'],
      ]);
    // Veg lunch and dinner lead with soya chunks. Paneer- and dal-only plates
    // top out near 40 g protein, which cannot reach 205 g across the day.
    // The last option in each list is the low-carb plate: protein, sabzi and
    // steamed vegetables with the starch dropped. Rest days only budget 165 g carbs, so
    // without it no combination of full-starch plates fits the calories.
    // First option of every slot is the default day: together the defaults
    // land on the day's calorie target (a test locks this).
    const lunch = slot('Lunch', dayType === 'vegSat' ? '1:00 PM' : '12:30 PM',
      isVegDay
        ? [['soya90', 'brownrice', 'steamedVeg'], ['soya', 'sweetpotato', 'dal', 'steamedVeg'], ['soya', 'paneer', 'millet2', 'steamedVeg'], ['soya', 'paneer', 'steamedVeg']]
        : [['chickenEgg', 'brownrice', 'dal', 'steamedVeg'], ['chickenEgg', 'sweetpotato', 'dal', 'steamedVeg'], ['fish', 'quinoa', 'steamedVeg'], ['chicken', 'sabzi', 'steamedVeg']]);
    // Training days already have whey twice (pre-workout and the oats), so
    // their snack leads with yogurt. Rest days lead with the leaner whey.
    const snack = slot('Snack', '4:00 PM',
      isVegDay
        ? (isTraining ? [['gyog250', 'berries'], ['whey1', 'banana'], ['whey1', 'milk']] : [['whey1', 'berries'], ['gyog250', 'berries'], ['whey1', 'milk']])
        : (isTraining ? [['gyog', 'berries'], ['whey1', 'banana'], ['buttermilk', 'almonds']] : [['whey1', 'berries'], ['gyog', 'berries'], ['buttermilk', 'almonds']]));
    // The salmon + broccoli + asparagus option is the one thing worth adapting
    // from a friend's plan: her single most-repeated meal, no starch, two
    // distinct rotating vegetables instead of a catch-all sabzi.
    const dinner = slot('Dinner', '7:30 PM',
      isVegDay
        ? (dayType === 'vegSat'
          ? [['soya90', 'paneer', 'sabzi', 'steamedVeg'], ['paneer150', 'dal', 'roti2', 'steamedVeg'], ['soya', 'sabzi', 'steamedVeg']]
          : [['soya', 'paneer', 'sabzi', 'steamedVeg'], ['paneer150', 'dal', 'roti2', 'steamedVeg'], ['soya', 'sabzi', 'steamedVeg']])
        // Default dinner has no starch: the carbs sit around training (oats,
        // lunch rice) and the evening plate is protein and vegetables. The
        // primary plate is grilled chicken with steamed broccoli and carrots,
        // eggs optional. It took the old chicken + sabzi slot (index 0) and the
        // no-egg version went last, so logged choices keep their meaning.
        : [['chicken', 'steamedVeg', 'eggsOpt'], ['chickenEgg', 'millet2', 'sabzi', 'steamedVeg'], ['fish', 'sabzi', 'quinoa', 'steamedVeg'], ['salmon', 'broccoli', 'asparagus'], ['chicken', 'steamedVeg']]);
    if (!isVegDay) dinner.options[dinner.options.length - 1] = { ...dinner.options[dinner.options.length - 1], short: 'Chicken, no eggs' };
    const bed = { ...slot('Optional bedtime (if protein low)', '9:30 PM', [['whey1'], ['gyog']]), optional: true,
      note: 'Only when protein is still short at night. It adds to today\'s calories.' };
    // Flex meal: a genuine extra meal, not a top-up, for a day that ran hungrier
    // or harder than planned. Scoped to training days on purpose — a rest day
    // has no extra demand to fuel and only 165 g carbs of room to spend it in.
    // Logging it does push the day's actual kcal above target, same as the
    // bedtime slot above; that is correct, not a compliance failure, because
    // the day's real energy need was genuinely higher than the average target.
    const flex = isTraining
      ? { ...slot('Flex meal (optional, counts toward today)', 'As needed',
          isVegDay
            ? [['soya', 'sabzi', 'steamedVeg'], ['paneer150', 'steamedVeg'], ['tofu', 'sabzi', 'steamedVeg']]
            : [['chicken', 'sabzi', 'steamedVeg'], ['fish', 'steamedVeg'], ['chickenEgg', 'steamedVeg']]), optional: true,
        note: 'Only for a long or extra-hard day, or real hunger. The default meals already hit today\'s target, so this one goes over it.' }
      : null;
    slots = [wake, breakfast, lunch, snack, dinner, ...(flex ? [flex] : []), bed];
  }

  // Cooking oil goes last so meal-log indices of the slots above never shift.
  // The legacy Thursday fast keeps its old shape.
  if (dayType !== 'fastThu') {
    slots = [...slots, { ...slot('Cooking oil for the day', 'Across meals', [['oil1']]),
      note: 'One measured tablespoon across all meals. Pour from a spoon, never the bottle. Tick it once used.' }];
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

export const dayTypeOf = (dow, state) => programOf(state).days[dow]?.dayType || 'training';
