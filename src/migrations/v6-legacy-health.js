// ============================================================
// migrations/v6-legacy-health.js - the supplement plan, lab snapshot and hair
// notes that used to ship as app defaults for every install.
//
// They describe one person's health, so they no longer live in data.js. State
// migration v6 copies them into settings ONLY for an install that already has
// history, so that person sees exactly what they saw before. A new account
// never receives them.
// ============================================================
export const LEGACY_SUPPLEMENT_PLAN = [
  { key: 'creatine', name: 'Creatine monohydrate', dose: '5 g', timing: 'Anytime, daily', withFood: 'Either', purpose: 'Strength, lean mass, muscle retention in a deficit', caution: 'Stay hydrated. Timing does not matter, consistency does.', tag: 'daily' },
  { key: 'whey', name: 'Whey protein', dose: '1 scoop before strength training', timing: '7:00-7:15 AM before the 7:45 AM gym session', withFood: 'Water; remaining planned whey stays with breakfast if shown', purpose: 'Makes the current pre-workout habit explicit while preserving daily protein', caution: 'Already counted in the meal plan. Do not add another scoop unless you deliberately choose a logged protein top-up.', tag: 'daily' },
  { key: 'vitd', name: 'Vitamin D3 + K2', dose: 'Per label', timing: 'Morning', withFood: 'With a fatty meal', purpose: 'Maintenance. Your level is 50 ng/mL, already optimal', caution: 'Maintenance only unless a doctor says otherwise. Do not stack multiple D products, track total daily IU. Recheck periodically.', tag: 'maintenance' },
  { key: 'magnesium', name: 'Magnesium glycinate', dose: 'Per label (track elemental Mg)', timing: 'Evening, 30-60 min before bed', withFood: 'Either', purpose: 'Sleep quality, relaxation, recovery', caution: 'Track elemental magnesium, not capsule weight. Loose stool means reduce or stop. Caution with kidney disease.', tag: 'daily' },
  { key: 'biotin', name: 'Hair, Skin & Nails (Biotin)', dose: '50,000 mcg', timing: 'With a meal', withFood: 'With food', purpose: 'Hair/skin/nails support', caution: 'HIGH-DOSE. High-dose biotin can skew lab tests (thyroid, troponin, vitamin D, hormones). Tell your doctor and lab before blood work, and pause if they advise. Biotin only helps hair if you are deficient, it is not a guaranteed hair-loss fix.', tag: 'high-dose' },
  { key: 'fishoil', name: 'Fish oil (omega-3)', dose: '2-3 g EPA + DHA', timing: 'With a meal', withFood: 'With food', purpose: 'Supports LDL and recovery (LDL is 123)', caution: 'Optional. Choose a low-oxidation brand.', tag: 'optional' },
  { key: 'electrolytes', name: 'Electrolytes', dose: '1 serving', timing: 'Around badminton or swimming', withFood: 'In water', purpose: 'Replace sweat losses on sport days', caution: 'Sport days only. Pick a low- or zero-sugar option to protect HbA1c.', tag: 'conditional', conditional: 'sport' },
];


export const LEGACY_LAB_RESULTS = [
  { key: 'vitd', label: 'Vitamin D', value: '50 ng/mL', status: 'good', note: 'Already optimal. Maintenance, not aggressive dosing.' },
  { key: 'tsh', label: 'TSH (thyroid)', value: '1.78', status: 'good', note: 'In range. Thyroid is not the limiter right now.' },
  { key: 'ldl', label: 'LDL', value: '123 mg/dL', status: 'watch', note: 'Slightly high. Keep paneer measured, avoid fried food, keep omega-3 and fiber up.' },
  { key: 'hba1c', label: 'HbA1c', value: '5.6 %', status: 'watch', note: 'Upper-normal. Pair carbs with protein, avoid sugary drinks, keep the deficit steady.' },
];


export const LEGACY_HAIR_HEALTH = {
  title: 'Hair protection',
  intro: 'Fat loss done too hard can trigger shedding. These levers keep hair, muscle and recovery safe at the same time.',
  labReminders: ['Ask about ferritin and iron studies if you notice shedding', 'Thyroid (TSH 1.78) already checked and fine', 'Vitamin D 50 ng/mL already optimal', 'Re-check B12 and zinc if shedding persists'],
  disclaimer: 'This is coaching, not diagnosis. Ongoing shedding warrants a physician or dermatologist and the labs above. No supplement is promised to regrow hair.',
};
