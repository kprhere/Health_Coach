// ============================================================
// data.js - all static content for Body Recomp OS
// Program uses first-class BLOCKS: single | superset | circuit | finisher | dropset.
// Schedule + rules live here and in helpers only, never scattered in the UI.
// ============================================================

export const STORAGE_KEY = 'recomp-os-v1';

// ---- profile / goal reset from the 09-25-2026 Evolt 360 scan ----
// Goal is whole-body definition: about 10% body fat while holding the 144 lb
// of lean mass. 144.0 / 0.90 = 160 lb, so fat mass falls from 47.6 to about
// 16 lb, a loss of roughly 32 lb. See DEFINITION_MILESTONES for the stages.
export const PROFILE_DEFAULT = {
  name: 'Krishnaprasath',
  heightIn: 71,
  age: 34,
  gender: 'Male',
  // Baseline moved to the 2026-11-13 restart scan (was 2026-09-25: 191.6 lb,
  // 24.8%, 47.6 lb fat, 37.5 in). 10% at 149.9 lb lean is about 166.6 lb,
  // so about 30 lb of fat at roughly 1 lb a week.
  startWeightLb: 197.1,
  startBodyFatPct: 23.9,
  startFatMassLb: 47.2,
  startWaistIn: 37.4,
  goalBodyFatPct: 10,
  goalFatLossLb: 30,
  goalWaistIn: 33,
  timelineMonths: 8,
};

// What becomes visible at each body-fat level for a man, used by the goal card.
// Fat leaves in the body's own order; lower belly and thighs usually go last,
// so training a spot shapes the muscle underneath but does not remove its fat.
export const DEFINITION_MILESTONES = [
  { bf: 15, label: 'Shoulders and arms take shape, upper abs faint' },
  { bf: 12, label: 'Abs visible, arm separation, outer thigh line' },
  { bf: 10, label: 'Full six-pack, thigh muscles separate' },
  { bf: 9, label: 'Arm and lower-leg veins, inner thigh sharp' },
];

export const SETTINGS_DEFAULT = {
  units: 'imperial',
  plates: [45, 35, 25, 10, 5, 2.5], // plate sizes (lb) this gym has; the plate loader uses only these
  proteinTarget: 205,
  waterTargetL: 3.75,
  stepsTarget: 12000,
  sleepTargetH: 7.5,
  deficitPercent: 15,                  // fat-loss deficit vs maintenance (drives all calorie + food targets)
  // Maintenance = BMR x this, and it OVERRIDES the scan's own TEE. The Evolt
  // guessed 1.54 because it assumed the badminton sessions; observed weight
  // change over 07-08 -> 08-13 implies 1.374 for the old schedule. 1.44 is the
  // reworked week (4 lifts + 2 swims + 5 scheduled walks + BodyBalance).
  // If the walks stop happening, drop this toward 1.37 or the targets lie.
  activityFactor: 1.44,
  // ---- Puratasi: pure vegetarian for the whole Tamil month ----
  // Calories and the 15% deficit are UNCHANGED across it, and protein stays at
  // the full target — going veg is a food restriction, not a reason to eat less
  // or accept less protein. Dates are approximate (the month turns when the sun
  // enters Kanya, around Sept 17); confirm against your almanac and edit here.
  // Thursday is a normal (non-veg) day by default. Turn this on in More to
  // make every Thursday vegetarian again; calories and protein stay the same.
  thursdayVeg: false,
  puratasiStartDate: '2026-09-17',
  puratasiEndDate: '2026-10-17',
  // ---- program calendar (all editable in More, week/day recalculate from these) ----
  programStartDate: '2026-07-14',      // program day 1
  restartPhaseStartDate: '2026-07-14', // restart phase day 1
  nextBodyScanDate: '2026-08-31',      // current two-week measurement checkpoint
  scanFrequencyDays: 14,               // short controlled measurement window, editable after the scan
  restartLoadEnabled: false,           // feature flag: show restart-load suggestions in Train
  defaultRestartLoadPercent: 70,       // restart load % of old working weight
  // ---- supplement + lab settings (editable in More) ----
  d3Dose: '2000 IU',                   // total daily D3 (track total across products)
  magElementalMg: '200 mg',            // elemental magnesium, not capsule weight
  biotinDose: '50,000 mcg',            // high-dose
  labWarningOn: true,                  // show biotin lab-interference warnings
  upcomingLabDate: '',                 // YYYY-MM-DD, blank = none scheduled
  pauseBiotinBeforeLabs: true,         // remind to pause biotin before blood work
  // ---- encrypted cross-device sync (passphrase is stored separately, never here) ----
  syncUrl: '',                         // your Cloudflare Worker URL, e.g. https://acp-sync.<you>.workers.dev
  syncAuto: false,                     // pull on open + push on change
  keepScreenAwake: true,               // prevent screen sleep while the Train tab is open
};

// Amavasya observance dates for Chicago, Illinois. Panchang dates are
// location-specific, so this list intentionally uses the user's local city
// rather than a generic astronomical new-moon timestamp. Review and extend
// the list when the next annual Chicago Panchang is published.
export const NO_MOON_DATES = [
  '2026-08-12',
  '2026-09-10',
  '2026-10-10',
  '2026-11-08',
  '2026-12-08',
  '2027-01-07',
  '2027-02-06',
  '2027-03-07',
  '2027-04-06',
];

// shown on Home + README
export const PROGRAM_RATIONALE =
  'Weekdays carry the whole plan (2026-11-19): weekend gym is unreliable, so Monday to Friday holds every essential session. Legs train twice, each day with its own heavy lift done fresh: Tuesday squat and quads, Thursday hinge and glutes. Arms get Monday and Friday finishers plus an optional Sunday session. Saturday and Sunday are optional extras and are never counted as missed. ' +
  'Chosen split: 4-day Upper / Lower hybrid around swimming and one mobility class. ' +
  'After a 40-day layoff and while eating in a fat-loss deficit, recovery is the limiter, so a 6-day PPL is too much. ' +
  'Upper / Lower hits every muscle about 2x per week at moderate volume, which is the sweet spot for holding muscle while losing fat. ' +
  'Conditioning is now SCHEDULED, not assumed: zone 2 walks after the Monday and Friday lifts and on Wednesday (weekend walks are a bonus) plus the Tuesday and Thursday swims, and a 12,000 step target. ' +
  'Wednesday also carries the single hard cardio session of the week, 8 x 1 min bike intervals. It sits there because Wednesday has no lifting, and zone 2 walking alone does not move VO2 max. Bike over sprints keeps it non-impact. Cut this first if recovery slips. ' +
  'The earlier version leaned on optional morning badminton to cover conditioning. That badminton never happened, so the real activity level came in far below what the Evolt scan assumed and the plan quietly stopped working. ' +
  'Badminton is still welcome as a bonus and simply replaces that day\'s walk when it happens, but nothing in the plan depends on it any more. ' +
  'Goal: whole-body definition at about 10% body fat. The Thursday fast is gone. Thursday is now a fed arms, shoulders and abs session with the evening swim, so arms get a third direct day and abs are loaded three times a week. ' +
  'The 09-25-2026 scan flagged upper and lower body as unbalanced and the left leg slightly behind, so both leg days add inner-thigh work and start single-leg sets on the left. ' +
  'Saturday is the BodyBalance mobility slot with a lifting fallback.';

// ============================================================
// EXERCISE LIBRARY
// p=primary, s=secondary, eq=equipment, diff=difficulty,
// use=best use case, sub=substitute, eos=EOS machine option,
// cue=coaching cue, err=common mistake
// ============================================================
const X = (p, s, eq, diff, use, sub, eos, cue, err) => ({ p, s, eq, diff, use, sub, eos, cue, err });

export const EXERCISES = {
  // ---- Chest ----
  'Barbell Bench Press': X('Chest', 'Triceps, Front Delts', 'Barbell', 'Intermediate', 'Primary chest strength', 'Dumbbell Bench Press', 'Hammer Strength Chest Press', 'Tuck elbows ~45 deg, bar to lower chest, drive feet', 'Flaring elbows and bouncing the bar'),
  'Dumbbell Bench Press': X('Chest', 'Triceps, Front Delts', 'Dumbbells', 'Beginner', 'Chest with shoulder-friendly path', 'Chest Press Machine', 'Hammer Strength Chest Press', 'Wrists stacked over elbows, slight arch', 'Dropping elbows too low and losing tension'),
  'Incline Dumbbell Press': X('Upper Chest', 'Front Delts, Triceps', 'Dumbbells', 'Beginner', 'Upper chest hypertrophy', 'Incline Barbell Press', 'Hammer Strength Incline Press', 'Bench 30 deg, press slightly back over eyes', 'Bench too steep so it becomes a shoulder press'),
  'Incline Barbell Press': X('Upper Chest', 'Front Delts, Triceps', 'Barbell', 'Intermediate', 'Upper chest strength', 'Incline Dumbbell Press', 'Hammer Strength Incline Press', 'Bar to upper chest, elbows under wrists', 'Grip too wide, shoulders shrug up'),
  'Chest Press Machine': X('Chest', 'Triceps, Front Delts', 'Machine', 'Beginner', 'Low-fatigue chest volume', 'Dumbbell Bench Press', 'Hammer Strength Chest Press', 'Set seat so handles are mid-chest, full squeeze', 'Seat too high hitting shoulders'),
  'Pec Deck': X('Chest', 'Front Delts', 'Machine', 'Beginner', 'Chest isolation and stretch', 'Cable Fly', 'Arsenal Laying Pec Fly', 'Slight elbow bend, squeeze at midline', 'Using shoulders to slam the pads'),
  'Cable Fly': X('Chest', 'Front Delts', 'Cable', 'Beginner', 'Constant-tension chest', 'Pec Deck', 'Arsenal Laying Pec Fly', 'Slight forward lean, hug motion', 'Turning it into a press'),
  'Dips': X('Chest', 'Triceps, Front Delts', 'Bodyweight', 'Intermediate', 'Lower chest and triceps', 'Chest Press Machine', 'Assisted Dip Machine', 'Lean forward for chest, control the bottom', 'Going too deep and stressing shoulders'),
  'Chest-Assisted Dip': X('Chest', 'Triceps, Front Delts', 'Assisted Dip Machine', 'Beginner', 'Lower-chest pressing with controlled assistance', 'Arsenal Laying Pec Fly', 'Assisted Dip Machine', 'Lean slightly forward, let elbows travel back, and use only the pain-free depth', 'Staying upright or sinking deeper than the shoulders tolerate'),

  // ---- Back ----
  'Deadlift': X('Back, Hamstrings', 'Glutes, Traps, Grip', 'Barbell', 'Advanced', 'Full posterior chain strength', 'Romanian Deadlift', 'Hammer Strength Deadlift', 'Brace, push floor away, bar close to shins', 'Rounding the lower back and jerking the bar'),
  'Lat Pulldown': X('Lats', 'Biceps, Rear Delts', 'Cable', 'Beginner', 'Vertical pull width', 'Assisted Pull-up', 'Hammer Strength Front Pulldown', 'Drive elbows down, chest up, slight lean', 'Pulling with biceps and swinging'),
  'Pull-up': X('Lats', 'Biceps, Core', 'Bodyweight', 'Advanced', 'Bodyweight vertical pull', 'Lat Pulldown', 'Assisted Pull-up Machine', 'Full hang, lead with chest to bar', 'Half reps and kipping'),
  'Assisted Pull-up': X('Lats', 'Biceps', 'Machine', 'Beginner', 'Building to full pull-ups', 'Lat Pulldown', 'Assisted Pull-up Machine', 'Control the descent, full stretch', 'Too much assistance to feel easy'),
  'Seated Cable Row': X('Mid Back', 'Lats, Biceps, Rear Delts', 'Cable', 'Beginner', 'Horizontal pull thickness', 'Chest Supported Row', 'Hammer Strength Low Row', 'Chest tall, pull to navel, squeeze blades', 'Rowing with lower back swing'),
  'Chest Supported Row': X('Mid Back', 'Lats, Rear Delts', 'Machine', 'Beginner', 'Strict back with no cheating', 'Seated Cable Row', 'Hammer Strength Iso Row', 'Chest on pad, elbows to hips', 'Shrugging instead of rowing'),
  'T-Bar Row': X('Mid Back', 'Lats, Biceps', 'Plate Loaded', 'Intermediate', 'Heavy back thickness', 'Seated Cable Row', 'Arsenal T-Bar Row', 'Hinge, flat back, drive elbows back', 'Standing too upright and using momentum'),
  'Single Arm Dumbbell Row': X('Lats', 'Mid Back, Biceps', 'Dumbbell', 'Beginner', 'Unilateral back balance', 'Machine Row', 'Hammer Strength Iso Row', 'Long stretch, pull to hip, no twist', 'Rotating the torso to lift heavier'),
  'Machine Row': X('Mid Back', 'Lats, Biceps', 'Machine', 'Beginner', 'Controlled back volume', 'Seated Cable Row', 'Hammer Strength Row', 'Big stretch forward, squeeze back', 'Short range and heaving'),
  'Straight Arm Pulldown': X('Lats', 'Long head Triceps', 'Cable', 'Beginner', 'Lat isolation and mind-muscle', 'Machine Row', 'Cable Straight-Arm Pulldown', 'Soft elbows, push bar to thighs', 'Bending arms into a pushdown'),
  'Face Pull': X('Rear Delts', 'Traps, Rotator Cuff', 'Cable', 'Beginner', 'Shoulder health and posture', 'Rear Delt Fly', 'Cable Rope Face Pull', 'Pull to forehead, thumbs back', 'Going too heavy and shrugging'),

  // ---- Shoulders ----
  'Overhead Press': X('Front Delts', 'Triceps, Upper Chest', 'Barbell', 'Intermediate', 'Pressing strength overhead', 'Dumbbell Shoulder Press', 'Hammer Strength Iso Shoulder Press', 'Squeeze glutes, bar over mid-foot, head through', 'Leaning back into the lower spine'),
  'Dumbbell Shoulder Press': X('Front Delts', 'Triceps', 'Dumbbells', 'Beginner', 'Shoulder hypertrophy', 'Machine Shoulder Press', 'Hammer Strength Iso Shoulder Press', 'Elbows slightly forward, no lockout slam', 'Arching back and flaring elbows wide'),
  'Machine Shoulder Press': X('Front Delts', 'Triceps', 'Machine', 'Beginner', 'Low-fatigue shoulder volume', 'Dumbbell Shoulder Press', 'Hammer Strength Iso Shoulder Press', 'Seat so handles at shoulder height', 'Seat too low, wrists bend back'),
  'Arnold Press': X('Front Delts', 'Side Delts, Triceps', 'Dumbbells', 'Intermediate', 'Full-delt pressing', 'Dumbbell Shoulder Press', 'Hammer Strength Iso Shoulder Press', 'Rotate palms out as you press', 'Rushing the rotation and losing control'),
  'Landmine Press': X('Front Delts', 'Upper Chest, Triceps', 'Barbell', 'Beginner', 'Shoulder-friendly pressing', 'Machine Shoulder Press', 'Hammer Strength Iso Shoulder Press', 'Press up and slightly in, ribs down', 'Leaning away from the bar'),
  'Lateral Raise': X('Side Delts', '-', 'Dumbbells', 'Beginner', 'Delt width', 'Cable Lateral Raise', 'Arsenal Standing Lateral Raise', 'Lead with elbows, pour-the-jug tilt', 'Swinging and using traps'),
  'Cable Lateral Raise': X('Side Delts', '-', 'Cable', 'Beginner', 'Constant-tension side delts', 'Lateral Raise', 'Arsenal Standing Lateral Raise', 'Cable behind body, smooth arc', 'Yanking with body English'),
  'Rear Delt Fly': X('Rear Delts', 'Traps', 'Dumbbells', 'Beginner', 'Rear delt balance', 'Reverse Pec Deck', 'Arsenal Reverse Fly', 'Hinge over, pinkies up, wide arc', 'Using back instead of rear delts'),
  'Reverse Pec Deck': X('Rear Delts', 'Traps', 'Machine', 'Beginner', 'Isolated rear delts', 'Rear Delt Fly', 'Reverse Pec Deck', 'Slight elbow bend, squeeze back', 'Jerking the handles'),

  // ---- Biceps ----
  'Barbell Curl': X('Biceps', 'Forearms', 'Barbell', 'Beginner', 'Overloaded biceps', 'Dumbbell Curl', 'EZ-Bar Curl', 'Elbows pinned, no swing', 'Rocking the torso to lift'),
  'Dumbbell Curl': X('Biceps', 'Forearms', 'Dumbbells', 'Beginner', 'Balanced biceps', 'Cable Curl', 'Life Fitness Bicep Curl', 'Supinate hard at the top', 'Swinging and half reps'),
  'Incline DB Curl': X('Biceps (long head)', 'Forearms', 'Dumbbells', 'Beginner', 'Biceps stretch and peak', 'Dumbbell Curl', 'Dual Pulley Bayesian Curl', 'Arms behind body, full stretch', 'Coming forward and shortening range'),
  'Hammer Curl': X('Brachialis, Brachioradialis, Biceps', 'Forearms', 'Dumbbells', 'Beginner', 'Arm thickness and grip', 'Cable Curl', 'Life Fitness Bicep Curl', 'Neutral grip, elbows still', 'Swinging the weight up'),
  'Reverse Curl': X('Brachialis, Brachioradialis', 'Forearms, Biceps', 'EZ Bar', 'Beginner', 'Forearm and brachialis size that pushes arm veins outward', 'Hammer Curl', 'Cable Reverse Curl', 'Overhand grip, wrists straight, elbows pinned', 'Curling the wrists or swinging'),
  'Dumbbell Wrist Curl': X('Forearms', 'Grip', 'Dumbbells', 'Beginner', 'Forearm flexors and grip', 'Reverse Wrist Curl', 'Barbell or cable wrist curl', 'Forearms on thighs or a bench, wrists past the edge, curl only at the wrist, full stretch at the bottom', 'Lifting with the elbows or cutting the range short'),
  'Reverse Wrist Curl': X('Forearms', 'Brachioradialis, Grip', 'Dumbbells', 'Beginner', 'Forearm extensors, balances wrist curls', 'Dumbbell Wrist Curl', 'EZ-bar reverse wrist curl', 'Palms down, forearms supported, lift the knuckles up, lower slowly', 'Using too much weight and bouncing the wrist'),
  'Cable Curl': X('Biceps', 'Forearms', 'Cable', 'Beginner', 'Constant-tension biceps', 'Dumbbell Curl', 'Dual Low Pulley Curl', 'Keep tension at the bottom', 'Letting the stack rest each rep'),
  // EOS dual low pulley station (two low cable stacks side by side).
  'Dual Low Pulley Curl': X('Biceps', 'Forearms', 'Cable', 'Beginner', 'Constant-tension biceps, both arms at once or one at a time', 'Cable Curl', 'Dual low pulley station', 'Stand between the low pulleys, elbows pinned at your sides, curl both handles and squeeze 1s at the top', 'Elbows drifting forward or leaning back to finish the rep'),
  'Dual Pulley Bayesian Curl': X('Biceps', 'Forearms', 'Cable', 'Intermediate', 'Long-head biceps stretch, cable version of the incline curl', 'Incline DB Curl', 'Dual low pulley station', 'Face away from one low pulley, arm slightly behind the body, curl without letting the elbow swing forward', 'Turning it into a front raise by moving the elbow'),
  'Preacher Curl': X('Biceps (short head)', 'Forearms', 'Machine', 'Beginner', 'Strict lower biceps', 'Incline DB Curl', 'Life Fitness Bicep Curl', 'Do not fully lock out at the bottom', 'Bouncing out of the stretch'),

  // ---- Triceps ----
  'Rope Pushdown': X('Triceps', '-', 'Cable', 'Beginner', 'Triceps pump and lateral head', 'Cable Extension', 'Cable Rope Pushdown', 'Elbows pinned, spread rope at bottom', 'Elbows drifting forward'),
  'Overhead Tricep Extension': X('Triceps (long head)', '-', 'Cable', 'Beginner', 'Long-head stretch', 'Skullcrusher', 'Cable Overhead Extension', 'Full overhead stretch, elbows in', 'Flaring elbows and using shoulders'),
  'Skullcrusher': X('Triceps', '-', 'EZ Bar', 'Intermediate', 'Triceps overload', 'Overhead Tricep Extension', 'EZ-Bar Skullcrusher', 'Lower to forehead, elbows steady', 'Elbows drifting into a press'),
  'Close Grip Bench': X('Triceps', 'Chest, Front Delts', 'Barbell', 'Intermediate', 'Heavy triceps strength', 'Skullcrusher', 'Hammer Strength Chest Press narrow', 'Grip shoulder width, elbows tucked', 'Grip too narrow straining wrists'),
  'Assisted Dip': X('Triceps', 'Chest, Front Delts', 'Machine', 'Beginner', 'Triceps with bodyweight', 'Close Grip Bench', 'Assisted Dip Machine', 'Stay upright for triceps', 'Leaning forward shifts to chest'),
  'Cable Extension': X('Triceps', '-', 'Cable', 'Beginner', 'Triceps isolation', 'Rope Pushdown', 'Life Fitness Tricep Press', 'Only the forearm moves', 'Whole arm swinging'),
  'Life Fitness Tricep Press': X('Triceps', 'Chest', 'Machine', 'Beginner', 'Machine triceps volume', 'Rope Pushdown', 'Life Fitness Tricep Press', 'Full lockout, controlled return', 'Partial reps'),

  // ---- Quads ----
  'Back Squat': X('Quads, Glutes', 'Hamstrings, Core', 'Barbell', 'Advanced', 'Primary leg strength', 'Leg Press', 'Arsenal Squat', 'Brace, knees track toes, sit between hips', 'Knees caving and heels lifting'),
  'Front Squat': X('Quads', 'Glutes, Core', 'Barbell', 'Advanced', 'Quad-biased squat', 'Hack Squat', 'Hammer Strength Belt Squat', 'Elbows high, upright torso', 'Elbows dropping and rounding'),
  'Leg Press': X('Quads, Glutes', 'Hamstrings', 'Machine', 'Beginner', 'Heavy legs with low back safety', 'Hack Squat', 'Hammer Strength Leg Press', 'Feet shoulder width, no lockout slam', 'Lowering until hips tuck under'),
  'Hack Squat': X('Quads', 'Glutes', 'Machine', 'Intermediate', 'Quad overload', 'Leg Press', 'Arsenal Inverted Leg Press', 'Full depth, push through mid-foot', 'Cutting depth short'),
  'Smith Squat': X('Quads, Glutes', 'Hamstrings', 'Smith Machine', 'Beginner', 'Fixed-path squat', 'Leg Press', 'Smith Machine Squat', 'Feet slightly forward, control down', 'Feet under bar straining knees'),
  'Leg Extension': X('Quads', '-', 'Machine', 'Beginner', 'Quad isolation and finisher', 'Smith Squat', 'Leg Extension Machine', 'Pause and squeeze at the top', 'Slamming reps with momentum'),
  'Hip Adduction': X('Adductors (inner thigh)', 'Glutes', 'Machine', 'Beginner', 'Inner-thigh muscle and leg shape', 'Copenhagen Plank', 'Hip Adduction Machine', 'Sit tall, squeeze to the middle, slow return', 'Letting the stack slam on the way out'),
  'Hip Abduction': X('Glute medius (side glutes)', 'Glutes', 'Machine', 'Beginner', 'Side-hip shape and knee stability', 'Banded Lateral Walk', 'Hip Abduction Machine', 'Lean slightly forward, push the knees out, pause at the widest point', 'Bouncing the stack or rocking the torso'),
  'Bulgarian Split Squat': X('Quads, Glutes', 'Hamstrings, Core', 'Dumbbells', 'Intermediate', 'Unilateral leg strength', 'Reverse Lunge', 'Smith Machine Split Squat', 'Front shin vertical, torso tall', 'Pushing off the back foot'),
  'Walking Lunge': X('Quads, Glutes', 'Hamstrings, Core', 'Dumbbells', 'Beginner', 'Legs plus conditioning', 'Reverse Lunge', 'Smith Machine Split Squat', 'Long steps, knee tracks toe', 'Short steps hitting the knee'),
  'Reverse Lunge': X('Quads, Glutes', 'Hamstrings', 'Dumbbells', 'Beginner', 'Knee-friendly single leg', 'Bulgarian Split Squat', 'Smith Machine Split Squat', 'Step back, drop straight down', 'Leaning forward off balance'),

  // ---- Hamstrings ----
  'Romanian Deadlift': X('Hamstrings, Glutes', 'Lower Back', 'Barbell', 'Intermediate', 'Hamstring stretch strength', 'Seated Leg Curl', 'Hammer Strength Deadlift', 'Hinge hips back, bar close, soft knees', 'Squatting it instead of hinging'),
  'Seated Leg Curl': X('Hamstrings', 'Calves', 'Machine', 'Beginner', 'Hamstring isolation', 'Lying Leg Curl', 'Seated Leg Curl Machine', 'Point toes, squeeze at full curl', 'Hips lifting off the pad'),
  'Lying Leg Curl': X('Hamstrings', 'Calves', 'Machine', 'Beginner', 'Hamstring peak contraction', 'Seated Leg Curl', 'Lying Leg Curl Machine', 'Slow negative, no hip rise', 'Bouncing the weight'),
  'Good Morning': X('Hamstrings, Glutes', 'Lower Back', 'Barbell', 'Advanced', 'Posterior chain strength', 'Romanian Deadlift', 'Hammer Strength Deadlift', 'Light load, hinge with flat back', 'Rounding under heavy load'),
  'Hip Hinge Machine': X('Hamstrings, Glutes', 'Lower Back', 'Machine', 'Beginner', 'Safe hinge pattern', 'Romanian Deadlift', 'Hammer Strength Deadlift', 'Drive hips through at the top', 'Using lower back to yank'),

  // ---- Glutes ----
  'Hip Thrust': X('Glutes', 'Hamstrings', 'Barbell', 'Beginner', 'Glute strength and shape', 'Glute Bridge', 'Hip Thrust Machine', 'Chin tucked, full lockout squeeze', 'Overarching the lower back'),
  'Glute Bridge': X('Glutes', 'Hamstrings', 'Barbell', 'Beginner', 'Glute activation', 'Hip Thrust', 'Hip Thrust Machine', 'Posterior tilt, squeeze at top', 'Pushing through the lower back'),
  'Cable Kickback': X('Glutes', '-', 'Cable', 'Beginner', 'Glute isolation', 'Abductor Machine', 'Cable Glute Kickback', 'Small controlled kick, no swing', 'Arching back to lift higher'),
  'Abductor Machine': X('Glutes (medius)', '-', 'Machine', 'Beginner', 'Side glute detail', 'Cable Kickback', 'Hip Abductor Machine', 'Slight forward lean, pause out', 'Slamming the pads shut'),
  'Split Squat': X('Quads, Glutes', 'Hamstrings', 'Dumbbells', 'Beginner', 'Static single leg', 'Bulgarian Split Squat', 'Smith Machine Split Squat', 'Feet split, drop straight down', 'Front knee sliding forward'),

  // ---- Calves ----
  'Standing Calf Raise': X('Calves', '-', 'Machine', 'Beginner', 'Calf mass (gastroc)', 'Leg Press Calf Raise', 'Standing Calf Machine', 'Full stretch bottom, pause top', 'Bouncing with short range'),
  'Seated Calf Raise': X('Calves', '-', 'Machine', 'Beginner', 'Soleus development', 'Standing Calf Raise', 'Seated Calf Machine', 'Slow tempo, squeeze at top', 'Half reps and speed'),
  'Leg Press Calf Raise': X('Calves', '-', 'Machine', 'Beginner', 'Calves via leg press', 'Standing Calf Raise', 'Hammer Strength Leg Press toes', 'Push through balls of feet, big stretch', 'Locking knees hard'),

  // ---- Core ----
  'Cable Crunch': X('Abs', 'Obliques', 'Cable', 'Beginner', 'Weighted ab flexion', 'Hanging Leg Raise', 'Cable Rope Crunch', 'Crunch ribs to pelvis, hips fixed', 'Pulling with arms and hips'),
  // Replaced Cable Crunch in the plan 2026-11-18 (user asked for something else).
  'Weighted Decline Crunch': X('Abs', 'Obliques', 'Decline Bench', 'Beginner', 'Weighted ab flexion, loaded with a plate', 'Reverse Crunch', 'Decline bench + plate', 'Hook the feet, plate on the chest, curl ribs toward hips one vertebra at a time, lower over 2s', 'Sitting all the way up with the hip flexors instead of curling the spine'),
  'Reverse Crunch': X('Abs', 'Lower Abs', 'Bodyweight', 'Beginner', 'Lower abs and posterior pelvic tilt', 'Lying Leg Raise', 'Flat bench, hold the bench behind your head', 'Curl the hips up off the bench toward the ribs, tuck the tailbone, lower slowly', 'Swinging the legs for momentum instead of curling the pelvis'),
  'Hanging Leg Raise': X('Abs', 'Hip Flexors', 'Bodyweight', 'Intermediate', 'Lower ab strength', 'Lying Leg Raise', 'Captains Chair Leg Raise', 'Posterior tilt, control the swing', 'Swinging and using momentum'),
  'Lying Leg Raise': X('Abs', 'Hip Flexors', 'Bodyweight', 'Beginner', 'Lower ab control', 'Hanging Leg Raise', 'Bench Leg Raise', 'Press low back down, slow lower', 'Arching the lower back'),
  'Ab Wheel': X('Abs', 'Obliques, Lats', 'Wheel', 'Advanced', 'Anti-extension strength', 'Plank', 'Ab Wheel', 'Ribs down, roll only as far as control', 'Letting the hips sag'),
  'Plank': { ...X('Abs', 'Obliques, Shoulders', 'Bodyweight', 'Beginner', 'Core stability base', 'Dead Bug', 'Plank', 'Squeeze glutes, straight line', 'Hips sagging or piking up'), timed: true },
  'Side Plank': { ...X('Obliques', 'Abs, Glutes', 'Bodyweight', 'Beginner', 'Lateral core', 'Pallof Press', 'Side Plank', 'Stack hips, drive them up', 'Hips dropping toward floor'), timed: true },
  'Pallof Press': X('Obliques', 'Abs, Deep Core', 'Cable', 'Beginner', 'Anti-rotation core', 'Side Plank', 'Cable Pallof Press', 'Resist the twist, press straight out', 'Letting the torso rotate'),
  'Cable Woodchop': X('Obliques', 'Abs, Shoulders', 'Cable', 'Beginner', 'Rotational core power', 'Pallof Press', 'Cable Woodchop', 'Rotate from the trunk, arms follow', 'Only moving the arms'),
  // Floor ab moves from the partner ab circuit video, added 2026-11-23.
  'Toe Touches': X('Abs', 'Hip Flexors', 'Bodyweight', 'Intermediate', 'Upper ab crunch with the legs straight up, the hardest move of the circuit', 'Reverse Crunch', 'Floor, optional light dumbbell', 'Legs straight up, reach the hands or a light dumbbell toward the toes by lifting the shoulder blades, lower slowly', 'Swinging the arms and throwing the head forward'),
  'Russian Twist': X('Obliques', 'Abs', 'Bodyweight', 'Beginner', 'Rotation work for the side abs', 'Cable Woodchop', 'Floor, optional light dumbbell', 'Lean back, chest tall, feet up if you can, turn the ribs and not just the arms, count each side', 'Swinging the arms while the torso stays still'),
  'Scissor Kicks': { ...X('Abs', 'Hip Flexors', 'Bodyweight', 'Beginner', 'Lower ab endurance', 'Lying Leg Raise', 'Floor, hands under hips', 'Press the lower back into the floor, small fast cross-overs, keep the legs low but the back flat', 'Lower back arching off the floor'), timed: true },
  'Rainbows': X('Obliques', 'Abs, Hip Flexors', 'Bodyweight', 'Beginner', 'Side abs with the legs swinging side to side', 'Russian Twist', 'Floor', 'Lean back on the hands, swing both knees in a wide arc from side to side, ribs stay still', 'Letting the shoulders collapse and the back arch'),
  'Knee Tucks': X('Abs', 'Hip Flexors', 'Bodyweight', 'Beginner', 'Lower abs, easier than leg raises', 'Reverse Crunch', 'Floor or bench', 'Lean back on the hands, pull the knees to the chest and tilt the pelvis up, then extend slowly', 'Only moving the legs and not the pelvis'),
  'Dead Bug': X('Abs', 'Hip Flexors', 'Bodyweight', 'Beginner', 'Core control and back safety', 'Plank', 'Dead Bug', 'Low back glued down, slow limbs', 'Back arching off the floor'),

  // ---- Cardio / conditioning ----
  'Incline Walk': X('Cardio', 'Calves, Glutes', 'Treadmill', 'Beginner', 'Zone 2 fat loss and steps', 'Bike', 'Treadmill Incline', 'Incline 8-12%, keep it conversational', 'Holding the rails and leaning'),
  'Bike': X('Cardio', 'Quads', 'Bike', 'Beginner', 'Low-impact conditioning', 'Elliptical', 'Upright / Recumbent Bike', 'Steady cadence, even effort', 'Coasting with no resistance'),
  'Rowing Machine': X('Cardio', 'Back, Legs', 'Rower', 'Intermediate', 'Full-body conditioning', 'Bike', 'Concept2 Rower', 'Legs, then back, then arms', 'Yanking with arms first'),
  'StairMaster': X('Cardio', 'Glutes, Calves', 'Stepper', 'Beginner', 'Glute-heavy conditioning', 'Incline Walk', 'StairMaster', 'Full steps, do not lean on rails', 'Skipping steps and hunching'),
  'Elliptical': X('Cardio', 'Legs', 'Elliptical', 'Beginner', 'Joint-friendly cardio', 'Bike', 'Elliptical', 'Push and pull the handles', 'Bouncing with no resistance'),
  'HIIT Sprints': X('Cardio', 'Legs', 'Bike', 'Advanced', 'Time-efficient conditioning', 'Rowing Machine', 'Assault Bike', 'Hard interval then full recovery', 'No real recovery between rounds'),

  // ---- Swimming ----
  'Freestyle Drill': X('Cardio', 'Shoulders, Core', 'Pool', 'Intermediate', 'Technique and conditioning', 'Easy Laps', 'Pool', 'Long reach, roll the body', 'Rushing the stroke'),
  'Breathing Drill': X('Cardio', 'Core', 'Pool', 'Beginner', 'Bilateral breathing control', 'Easy Laps', 'Pool', 'Exhale underwater, relaxed breath', 'Holding breath and rushing'),
  'Kickboard Drill': X('Cardio', 'Legs, Core', 'Pool', 'Beginner', 'Leg drive and calves', 'Easy Laps', 'Pool', 'Kick from the hip, pointed toes', 'Kicking from the knees'),
  'Easy Laps': X('Cardio', 'Full Body', 'Pool', 'Beginner', 'Recovery swim', 'Bike', 'Pool', 'Relaxed pace, smooth turns', 'Going too hard on a recovery day'),

  // ---- Badminton ----
  'Easy Rally': X('Cardio', 'Legs, Shoulders', 'Court', 'Beginner', 'Low-key movement and fun', 'Bike', 'Court', 'Light feet, controlled shots', 'Sprinting flat out when tired'),
  'Footwork Drill': X('Cardio', 'Calves, Quads', 'Court', 'Intermediate', 'Agility and conditioning', 'Easy Rally', 'Court', 'Split step, recover to center', 'Flat-footed heavy landings'),
  'Game Session': X('Cardio', 'Full Body', 'Court', 'Intermediate', 'Competitive conditioning', 'Footwork Drill', 'Court', 'Warm up first, hydrate often', 'Skipping warm-up and diving cold'),

  // ---- Mobility ----
  'Hip Flexor Stretch': X('Mobility', 'Hip Flexors', 'None', 'Beginner', 'Undo sitting, open hips', 'Foam Rolling', 'Mat', 'Tuck pelvis, squeeze rear glute', 'Arching the lower back'),
  'Hamstring Stretch': X('Mobility', 'Hamstrings', 'None', 'Beginner', 'Posterior chain length', 'Foam Rolling', 'Mat', 'Hinge with flat back', 'Rounding to reach further'),
  'Thoracic Rotation': X('Mobility', 'Upper Back', 'None', 'Beginner', 'Rotation for pressing and pulling', 'Foam Rolling', 'Mat', 'Move from the mid-back, exhale', 'Forcing the lower back to turn'),
  'Shoulder Mobility': X('Mobility', 'Shoulders', 'Band', 'Beginner', 'Overhead health', 'Foam Rolling', 'Band', 'Slow controlled passes', 'Shrugging and forcing range'),
  'Foam Rolling': X('Mobility', 'Full Body', 'Foam Roller', 'Beginner', 'Tissue prep and recovery', 'Shoulder Mobility', 'Foam Roller', 'Slow passes, pause on tight spots', 'Rolling too fast to matter'),

  // ---- EOS machines (first-class, from your equipment inventory) ----
  'Hammer Strength Bench Press': X('Chest', 'Triceps, Front Delts', 'Hammer Strength', 'Beginner', 'Heavy chest press with fixed path', 'Barbell Bench Press', 'Hammer Strength Bench Press', 'Iso handles, full stretch and squeeze', 'Half reps and shrugging'),
  'Hammer Strength Incline Press': X('Upper Chest', 'Front Delts, Triceps', 'Hammer Strength', 'Beginner', 'Upper chest with iso handles', 'Incline Dumbbell Press', 'Hammer Strength Incline Press', 'Drive up and slightly in', 'Bench angle too steep'),
  'Hammer Strength High Row': X('Lats', 'Biceps, Rear Delts', 'Hammer Strength', 'Beginner', 'Lat width with support', 'Lat Pulldown', 'Hammer Strength High Row', 'Pull to lower ribs, drive elbows down', 'Rowing with the lower back'),
  'Hammer Strength Row': X('Mid Back', 'Lats, Biceps', 'Hammer Strength', 'Beginner', 'Chest-supported back thickness', 'Chest Supported Row', 'Hammer Strength Row', 'Chest on pad, squeeze blades', 'Heaving the weight'),
  'Hammer Strength Iso Shoulder Press': X('Front Delts', 'Triceps', 'Hammer Strength', 'Beginner', 'Iso-lateral shoulder pressing', 'Dumbbell Shoulder Press', 'Hammer Strength Iso Shoulder Press', 'Press without slamming lockout', 'Seat too low, wrists bent'),
  'Hammer Strength Leg Press': X('Quads, Glutes', 'Hamstrings', 'Hammer Strength', 'Beginner', 'Heavy legs, low-back safe', 'Leg Press', 'Hammer Strength Leg Press', 'Full depth, push mid-foot', 'Letting hips tuck under'),
  'Arsenal Standing Lateral Raise': X('Side Delts', '-', 'Arsenal', 'Beginner', 'Loaded standing side delts', 'Lateral Raise', 'Arsenal Standing Lateral Raise', 'Lead with elbows, controlled', 'Swinging with the torso'),
  'Arsenal Laying Pec Fly': X('Chest', 'Front Delts', 'Arsenal', 'Beginner', 'Chest isolation and stretch', 'Pec Deck', 'Arsenal Laying Pec Fly', 'Slight elbow bend, squeeze midline', 'Turning it into a press'),
  'Arsenal Squat': X('Quads, Glutes', 'Hamstrings, Core', 'Arsenal', 'Beginner', 'Guided squat pattern', 'Back Squat', 'Arsenal Squat', 'Sit between hips, knees track toes', 'Cutting depth short'),
  'Arsenal Inverted Leg Press': X('Quads', 'Glutes', 'Arsenal', 'Beginner', 'Quad overload, hip-friendly', 'Hack Squat', 'Arsenal Inverted Leg Press', 'Control the descent, full range', 'Bouncing out of the bottom'),
  'Life Fitness Bicep Curl': X('Biceps', 'Forearms', 'Life Fitness', 'Beginner', 'Machine biceps, strict', 'Dumbbell Curl', 'Life Fitness Bicep Curl', 'Pin elbows, squeeze at top', 'Using momentum'),
  'Life Fitness Leg Press': X('Quads, Glutes', 'Hamstrings', 'Life Fitness', 'Beginner', 'Machine leg press volume', 'Leg Press', 'Life Fitness Leg Press', 'Feet shoulder width, no knee lock', 'Partial depth'),
  // Not at this EOS (2026-11). Kept only so older logs still show their
  // details; retired exercises are left out of search, swaps and new plans.
  'Body Builder Standing Press': { ...X('Front Delts', 'Triceps, Upper Chest', 'Body Builder', 'Intermediate', 'Standing overhead press', 'Overhead Press', 'Body Builder Standing Press', 'Ribs down, squeeze glutes', 'Leaning back into the spine'), retired: true },
};

export const EXERCISE_NAMES = Object.keys(EXERCISES).sort();
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Cardio', 'Mobility'];

// ============================================================
// BLOCK BUILDERS  (first-class block types)
// single   -> one exercise, N straight sets
// dropset  -> one exercise, N top sets, each stripped down (drops)
// superset -> 2+ exercises, alternated for R rounds
// circuit  -> 3+ stations, cycled for R rounds
// finisher -> round-based OR duration-based burnout
// ============================================================
const single = (name, sets, repLow, repHigh, rpe, restSec, tempo, note = '') =>
  ({ blockType: 'single', name, exercises: [{ name, sets, repLow, repHigh, rpe, restSec, tempo, note }] });

const dropset = (name, sets, repLow, repHigh, rpe, restSec, tempo, drops, note = '') =>
  ({ blockType: 'dropset', name, exercises: [{ name, sets, repLow, repHigh, rpe, restSec, tempo, drops, note }] });

const superset = (name, rounds, restAfterRoundSec, exercises, note = '') =>
  ({ blockType: 'superset', name, rounds, restAfterRoundSec, exercises, note });

const circuit = (name, rounds, restAfterRoundSec, exercises, note = '') =>
  ({ blockType: 'circuit', name, rounds, restAfterRoundSec, exercises, note });

const finisher = (name, cfg, exercises, note = '') =>
  ({ blockType: 'finisher', name, rounds: cfg.rounds || null, restAfterRoundSec: cfg.restAfterRoundSec || null, durationSec: cfg.durationSec || null, exercises, note });

// Before-lifting posture block, added 2026-11 after progress photos showed
// the hips tipping forward (anterior pelvic tilt), which pushes the lower
// belly out. Put on every lifting day; the migration adds it to saved programs.
export const POSTURE_WARMUP = [
  { name: 'Half-Kneeling Hip Flexor Stretch', detail: 'Before lifting: 2 x 45s per side. Squeeze the back-leg glute, tuck the tailbone' },
  { name: 'Dead Bug', detail: 'Before lifting: 2 x 10 per side, lower back pressed flat to the floor' },
  { name: 'Glute Bridge', detail: 'Before lifting: 2 x 15 with a 2s squeeze at the top. All day cue: tailbone tucked, ribs down' },
];
// Side delts make the shoulders look wide; done fresh, straight after the
// press, instead of as a tired superset at the end (2026-11-19).
export const SIDE_DELT_NOTE = 'Side delts, done fresh right after the press. Light weight, lift out to the side, pause 1s at the top, 2s down. Add reps before weight';
// How every lift moves forward. Shown on the Train tab.
export const PROGRESSION_RULES = [
  { title: 'Add weight', text: 'When every set hits the top of the rep range at the target effort, add 5 lb next time on upper-body lifts and 10 lb on lower-body lifts. Machines with big jumps: add reps first, then the next pin.' },
  { title: 'Restart block', text: 'For the first 2 weeks back, stop every set with 2-3 reps still in the tank. No grinding, no failure except the last set of isolation work.' },
  { title: 'Deload', text: 'Every 6th week, or sooner if reps drop two sessions in a row on the same lift: same exercises, half the sets, about 10% lighter. Then build again.' },
  { title: 'In a calorie deficit', text: 'Holding your weights is a win. If strength drops for 2 weeks on most lifts, eat at the training-day target on rest days for a week and sleep more before cutting anything else.' },
];

export const POSTURE_DAY_KEYS = ['upperA', 'lowerA', 'lowerHinge', 'upperB', 'armsExtra', 'armsAbs', 'lowerB'];

// ============================================================
// PROGRAM  (day index = JS getDay: 0 Sun ... 6 Sat)
// ============================================================
export const PROGRAM = {
  name: 'Recomp Upper / Lower Hybrid',
  days: {
    1: {
      key: 'upperA', title: 'Upper Body A', focus: 'Strength', dayType: 'training', intensity: 'Hard',
      blocks: [
        single('Barbell Bench Press', 4, 6, 8, 7, 150, '3-1-1', 'Main press. Restart block: stop 2 reps short, no grinding'),
        single('Hammer Strength High Row', 4, 8, 10, 8, 120, '2-1-1', 'Opposite pattern to the press'),
        single('Hammer Strength Iso Shoulder Press', 3, 8, 10, 8, 105, '2-0-1', 'Secondary press for delts'),
        single('Arsenal Standing Lateral Raise', 4, 12, 15, 9, 60, '2-1-2', SIDE_DELT_NOTE),
        single('Lat Pulldown', 2, 10, 12, 8, 90, '2-1-1', 'Second pull for lat width. 2 sets keeps the session near 60 min; Friday adds 3 more'),
        superset('Curl + Tricep Press', 3, 60, [
          { name: 'Life Fitness Bicep Curl', targetReps: '10-12', targetRpe: 9 },
          { name: 'Life Fitness Tricep Press', targetReps: '10-12', targetRpe: 9 },
        ], 'Opposite muscles on side-by-side machines: no rest between, 60s after each round'),
        single('Face Pull', 2, 15, 20, 8, 60, '2-1-2', 'Rear delts and shoulder health'),
        finisher('Arm Burnout', { rounds: 1, restAfterRoundSec: 45 }, [
          { name: 'Dual Low Pulley Curl', targetReps: '12-15', targetRpe: 9 },
          { name: 'Rope Pushdown', targetReps: '12-15', targetRpe: 9 },
        ], 'One all-out round: biceps then triceps, back to back. Add a second round only on a short, fresh day'),
      ],
      conditioning: [{ name: 'Incline Walk', detail: '20 min zone 2 after lifting, incline 8-12%. Skip only if badminton actually happened.' }],
      mobility: [...POSTURE_WARMUP],
      sport: [{ name: 'Badminton', detail: 'Bonus, not required. 5:30-7:00 AM. If played it REPLACES today\'s walk: lift after and add electrolytes + 30-50g carbs.' }],
      notes: 'First hard upper session. Quality reps over load. Direct biceps and triceps included. Log everything so next targets auto-calc. The walk is part of the plan, not an extra.',
    },
    2: {
      // Legs split over two weekdays (2026-11-19): one 80-minute day left the
      // last lifts done tired. Tuesday is squat and quads, Thursday is hinge
      // and glutes, each with its own heavy main lift done fresh.
      key: 'lowerA', title: 'Lower A: Squat + Quads', focus: 'Strength + Hypertrophy', dayType: 'training', intensity: 'Hard',
      blocks: [
        single('Back Squat', 4, 5, 8, 8, 180, '3-1-1', 'Heavy main lift of the week for legs. Add 5 lb when all sets hit 8. Arsenal Squat is the backup if the rack is taken'),
        single('Hammer Strength Leg Press', 3, 10, 12, 8, 120, '2-0-1', 'Secondary quad and glute'),
        single('Bulgarian Split Squat', 2, 10, 12, 8, 90, '2-0-1', 'Per leg. Left leg first (scan shows it slightly behind), then match its reps on the right'),
        superset('Leg Extension + Leg Curl', 3, 75, [
          { name: 'Leg Extension', targetReps: '12-15', targetRpe: 9 },
          { name: 'Lying Leg Curl', targetReps: '10-12', targetRpe: 9 },
        ], 'Quad then hamstring, no rest between. Second hamstring day of the week at no extra time'),
        single('Hip Abduction', 2, 12, 15, 9, 60, '2-1-2', 'Side glutes: lean slightly forward, pause at the widest point. Shapes the hips and keeps the knees steady on split squats. Inner thighs train Thursday'),
        single('Standing Calf Raise', 4, 12, 15, 9, 60, '2-1-2', 'Calves, full stretch and pause'),
        circuit('Loaded Abs', 3, 60, [
          { name: 'Weighted Decline Crunch', targetReps: '10-15', targetRpe: 9 },
          { name: 'Ab Wheel', targetReps: '8-12', targetRpe: 8 },
        ], 'Crunch, then anti-extension. Add a heavier plate to the crunch whenever all rounds hit 15. The wheel trains the abs to hold the pelvis level (posture)'),
      ],
      conditioning: [], mobility: [...POSTURE_WARMUP],
      sport: [{ name: 'Easy Laps', detail: 'Swimming class this evening. Technique-focused, legs already worked.' }],
      notes: 'About 55-60 min. Squat first while fresh; that is the heavy lift. If time runs short, cut abduction, then calves. Swim class tonight: fuel carbs around it.',
    },


    3: {
      key: 'coreRecovery', title: 'Core + Recovery', focus: 'Active Recovery', dayType: 'rest', intensity: 'Light',
      blocks: [
        circuit('Core Circuit', 3, 60, [
          { name: 'Reverse Crunch', targetReps: '12-15', targetRpe: 8 },
          { name: 'Toe Touches', targetReps: '12-15', targetRpe: 8 },
          { name: 'Russian Twist', targetReps: '20 total', targetRpe: 7 },
          { name: 'Scissor Kicks', targetReps: '30s', targetRpe: 7 },
          { name: 'Pallof Press', targetReps: '10 / side', targetRpe: 7 },
          { name: 'Plank', targetReps: '30-45s', targetRpe: 6 },
        ], 'Move station to station, rest 60s after the full round. Lower back stays pressed into the floor on every floor move'),
      ],
      conditioning: [
        { name: 'Incline Walk', detail: '20 min zone 2, incline 8-12%. Do this first as the warm-up for the intervals.' },
        { name: 'Bike', detail: 'Intervals: 8 x (1 min hard / 1 min easy), ~16 min. The only hard cardio of the week. Bike, not sprints: no impact and almost no next-day soreness, so it will not hurt Thursday\'s RDLs. Hard means about 8/10, not all-out. This is the one session to cut first if sleep or recovery slips.' },
      ],
      mobility: [
        { name: 'Hip Flexor Stretch', detail: '2 x 30s per side' },
        { name: 'Thoracic Rotation', detail: '2 x 8 per side' },
        { name: 'Foam Rolling', detail: 'Quads, back, calves' },
      ],
      sport: [{ name: 'Badminton', detail: 'Bonus, not required. If played, shorten the walk to 15 min so this stays a recovery day.' }],
      notes: 'No lifting today, which is why the week\'s one hard cardio session sits here. Legs train Tuesday (squat) and Thursday (hinge); today is the easy day between them. Everything else stays deliberately easy: keep steps and water up.',
    },
    4: {
      key: 'lowerHinge', title: 'Lower B: Hinge + Glutes', focus: 'Strength + Hypertrophy', dayType: 'training', intensity: 'Hard',
      blocks: [
        single('Romanian Deadlift', 4, 6, 8, 8, 180, '3-1-1', 'Heavy main lift for the back of the legs. Add 5-10 lb when all sets hit 8'),
        single('Hip Thrust', 3, 8, 12, 8, 120, '2-1-2', 'Glutes, full lockout squeeze'),
        superset('Leg Curl + Adduction', 3, 60, [
          { name: 'Seated Leg Curl', targetReps: '10-12', targetRpe: 9 },
          { name: 'Hip Adduction', targetReps: '12-15', targetRpe: 8 },
        ], 'Neighbouring seated machines, different muscles: no rest between, 60s after each round'),
        dropset('Seated Calf Raise', 2, 12, 15, 10, 45, '2-1-2', [
          { label: 'Drop 1 (-20%)', targetReps: 'to failure' },
        ], 'Top set about 1 rep shy, then strip the weight once'),
        superset('Lateral + Rear Delt', 3, 60, [
          { name: 'Arsenal Standing Lateral Raise', targetReps: '15-20', targetRpe: 9 },
          { name: 'Rear Delt Fly', targetReps: '15-20', targetRpe: 9 },
        ], 'Third lateral-raise day of the week. Wider shoulders make the waist read smaller'),
        circuit('Core', 2, 45, [
          { name: 'Cable Woodchop', targetReps: '10 / side', targetRpe: 8 },
          { name: 'Ab Wheel', targetReps: '8-12', targetRpe: 8 },
        ], 'Obliques and anti-extension'),
      ],
      conditioning: [{ name: 'Easy Laps', detail: 'Swimming class this evening, easy to moderate.' }],
      mobility: [...POSTURE_WARMUP],
      sport: [],
      notes: 'About 55 min. RDL first while fresh. Two days after squats, so if the lower back is still tight, use the Hammer Strength or Smith hip hinge and keep the reps clean. Arms moved to the optional Sunday session; Monday and Friday arm work covers them.',
    },

    5: {
      key: 'upperB', title: 'Upper Body B', focus: 'Hypertrophy', dayType: 'training', intensity: 'Hard',
      blocks: [
        single('Hammer Strength Incline Press', 4, 8, 10, 8, 120, '3-1-1', 'Main upper chest press'),
        single('Hammer Strength Row', 3, 10, 12, 8, 90, '2-1-1', 'Back thickness. 3 sets: the pulldown superset adds 3 more'),
        single('Overhead Press', 4, 6, 8, 8, 150, '2-0-1', 'Heavy shoulder lift of the week. Standing barbell press, set up yourself: bar in the rack at upper-chest height, squeeze glutes, ribs down. Add 5 lb when all sets hit 8'),
        single('Arsenal Standing Lateral Raise', 4, 12, 15, 9, 60, '2-1-2', SIDE_DELT_NOTE),
        superset('Dip + Pulldown', 3, 75, [
          { name: 'Chest-Assisted Dip', targetReps: '10-12', targetRpe: 8 },
          { name: 'Lat Pulldown', targetReps: '10-12', targetRpe: 8 },
        ], 'Push then pull. Dip at a pain-free depth with 2 reps in reserve; pulldown is the second lat day of the week, done before arms tire the biceps'),
        superset('Curl + Overhead Extension', 3, 60, [
          { name: 'Dual Pulley Bayesian Curl', targetReps: '10-12 / arm', targetRpe: 9 },
          { name: 'Overhead Tricep Extension', targetReps: '12-15', targetRpe: 9 },
        ], 'Long heads of biceps and triceps, back to back. Bayesian curl on the dual low pulley: face away, arm slightly behind you, left arm first'),
        single('Rear Delt Fly', 2, 15, 20, 9, 60, '2-1-2', 'Rear delts. 2 sets: Monday face pulls and Thursday\'s superset cover the rest'),
      ],
      conditioning: [{ name: 'Incline Walk', detail: '20 min zone 2 after lifting, incline 8-12%. Skip only if badminton actually happened.' }],
      mobility: [...POSTURE_WARMUP],
      sport: [{ name: 'Badminton', detail: 'Bonus, not required. If played it REPLACES today\'s walk: lift after and refuel.' }],
      notes: 'Pump-focused with direct arms. Controlled tempo, add reps before adding weight. Finish with the walk.',
    },
    6: {
      key: 'saturday', title: 'BodyBalance', focus: 'Mobility Class', dayType: 'vegSat', intensity: 'Light', isClassDay: true, optional: true,
      blocks: [],
      conditioning: [{ name: 'Incline Walk', detail: '25 min zone 2. Do it whether or not BodyBalance happens — the class is mobility, not conditioning.' }],
      mobility: [{ name: 'BodyBalance Class', detail: 'Les Mills BodyBalance, 45-55 min. Yoga, tai chi and pilates blend for flexibility, balance and core.' }],
      sport: [],
      notes: 'Optional weekend extra and vegetarian day. Monday to Friday covers the whole plan. If you want to lift instead of the class, switch to the Full Body fallback below and keep protein high (whey, paneer, dal, Greek yogurt).',
      fallback: {
        key: 'saturdayFallback', title: 'Full Body Pump (fallback)', focus: 'Full Body', dayType: 'vegSat', intensity: 'Moderate',
        blocks: [
          single('Hammer Strength Leg Press', 3, 12, 15, 8, 90, '2-0-1', 'Legs'),
          single('Barbell Bench Press', 3, 10, 12, 8, 90, '2-1-1', 'Chest'),
          single('Hammer Strength Row', 3, 10, 12, 8, 90, '2-1-1', 'Back'),
          single('Hammer Strength Iso Shoulder Press', 3, 10, 12, 8, 75, '2-0-1', 'Shoulders'),
          superset('Curl + Pushdown', 3, 45, [
            { name: 'Life Fitness Bicep Curl', targetReps: '12-15', targetRpe: 9 },
            { name: 'Life Fitness Tricep Press', targetReps: '12-15', targetRpe: 9 },
          ], 'Direct arms superset'),
          circuit('Core Finisher', 3, 45, [
            { name: 'Reverse Crunch', targetReps: '12-15', targetRpe: 8 },
            { name: 'Cable Woodchop', targetReps: '10 / side', targetRpe: 8 },
          ]),
        ],
        conditioning: [], mobility: [], sport: [],
        notes: 'Vegetarian day fallback. Moderate full-body pump. Optional, like the rest of the weekend.',
      },
    },
    0: {
      // Optional since 2026-11-19; arms live here now that legs take Thursday.
      key: 'armsExtra', title: 'Weekend Extra: Arms + Shoulders', focus: 'Optional', dayType: 'rest', intensity: 'Moderate', optional: true,
      blocks: [
        single('Close Grip Bench', 3, 6, 10, 8, 120, '2-0-1', 'Heavy triceps. Elbows tucked, bar to low chest'),
        single('Dual Pulley Bayesian Curl', 3, 8, 12, 8, 75, '3-0-1', 'Long-head biceps stretch on the dual low pulley. One arm at a time, left first'),
        single('Overhead Tricep Extension', 3, 10, 15, 9, 75, '2-1-2', 'Long head: this is the triceps horseshoe'),
        single('Preacher Curl', 2, 10, 15, 9, 75, '2-0-1', 'Strict, no bounce out of the bottom'),
        superset('Lateral + Rear Delt', 3, 60, [
          { name: 'Arsenal Standing Lateral Raise', targetReps: '15-20', targetRpe: 9 },
          { name: 'Rear Delt Fly', targetReps: '15-20', targetRpe: 9 },
        ], 'Wider shoulders make the waist read smaller'),
        dropset('Rope Pushdown', 2, 12, 15, 10, 60, '2-0-1', [
          { label: 'Drop 1 (-25%)', targetReps: 'to failure' },
        ], 'Top set about 1 rep shy, then drop once'),
        superset('Hammer + Reverse Curl', 2, 60, [
          { name: 'Hammer Curl', targetReps: '10-12', targetRpe: 9 },
          { name: 'Reverse Curl', targetReps: '12-15', targetRpe: 9 },
        ], 'Brachialis and forearms push the biceps veins outward'),
        circuit('Loaded Abs', 3, 60, [
          { name: 'Weighted Decline Crunch', targetReps: '10-15', targetRpe: 9 },
          { name: 'Reverse Crunch', targetReps: '12-15', targetRpe: 8 },
          { name: 'Ab Wheel', targetReps: '8-12', targetRpe: 8 },
        ], 'Optional extra ab work'),
      ],
      conditioning: [{ name: 'Walk or badminton', detail: '30-45 min outdoors or on court. Worth doing even if you skip the gym.' }],
      mobility: [...POSTURE_WARMUP],
      sport: [],
      notes: 'Optional weekend extra. Monday to Friday already covers the whole plan, so skip it freely. If you come in, about 45-50 minutes; stop 1-2 reps short so Monday is not affected. Eating stays at rest-day calories; add a banana before if you lift.',
    },


  },
};

// PROGRAM above is only the STARTING template. The program a person actually
// trains lives in their own state, so two people syncing under different
// passphrases can run completely different splits. Read it through these two
// accessors, never off the constant directly.
//
// A hand-built program is not guaranteed to define all seven weekdays, so a
// missing day resolves to rest rather than throwing on .dayType or .blocks.
export const REST_DAY = {
  key: 'rest', title: 'Rest', focus: 'Recovery', intensity: 'Easy', dayType: 'rest',
  blocks: [], conditioning: [], mobility: [], sport: [], notes: '',
};

export const programOf = (state) => (state && state.program) || PROGRAM;
export const programDay = (state, dow) => programOf(state).days[dow] || REST_DAY;

// ============================================================
// NUTRITION  (dayType targets + meal templates + quick adds)
// veg=true meals are safe for Saturday (and Thursday when Vegetarian Thursday is on).
// ============================================================
const M = (name, time, veg, items, kcal, p, c, f) => ({ name, time, veg, items, kcal, p, c, f });

export const NUTRITION = {
  // Fallback only — used when no body scan exists. The live numbers come from
  // nutritionEngine.personalTargets(), driven by the latest scan, activityFactor
  // and deficitPercent. Kept in step with that engine (maintenance 2547 from
  // BMR 1769 x 1.44, 15% cut, 205 g protein) so the two cannot contradict.
  targets: {
    training: { kcal: 2290, protein: 205, carbs: 220, fat: 65, fiber: 34, waterL: 3.25 },
    trainingVeg: { kcal: 2290, protein: 205, carbs: 220, fat: 65, fiber: 34, waterL: 3.25 },
    rest: { kcal: 2010, protein: 205, carbs: 150, fat: 65, fiber: 30, waterL: 3.0 },
    restVeg: { kcal: 2010, protein: 205, carbs: 150, fat: 65, fiber: 30, waterL: 3.0 },
    // Legacy: the Thursday fast was retired in state v5. The day type stays
    // defined so an imported backup or a hand-built program that still uses it
    // resolves instead of throwing. Nothing in the template schedules it.
    fastThu: { kcal: 1970, protein: 165, carbs: 195, fat: 60, fiber: 30, waterL: 3.25 },
    noMoonFast: { kcal: 2070, protein: 205, carbs: 180, fat: 60, fiber: 31, waterL: 3.25 },
    vegSat: { kcal: 2120, protein: 205, carbs: 190, fat: 60, fiber: 32, waterL: 3.0 },
  },
  plans: {
    training: [
      M('On waking (fasted)', '5:15 AM', true, ['Overnight soaked chia seeds heated with lemon juice', 'Warm water', '5-6 soaked almonds (if you do play badminton first, have these after instead)'], 135, 5, 14, 9),
      M('Post-workout breakfast', '7:30 AM', true, ['Overnight oats in almond milk', '1.5 scoops whey', 'Chia + flax seeds', 'Mixed berries'], 520, 48, 52, 14),
      M('Lunch', '12:30 PM', false, ['Grilled chicken or fish', 'Brown rice (200 g cooked) or quinoa', 'Dal (250 g cooked)', 'Steamed broccoli + carrots (200 g cooked)'], 620, 52, 58, 18),
      M('Snack', '4:00 PM', true, ['Greek yogurt', 'Berries', '5-6 soaked almonds (measured)'], 300, 30, 22, 10),
      M('Dinner', '7:30 PM', false, ['Chicken, fish or paneer', 'Roti or millet', 'Sabzi', 'Steamed broccoli + carrots (200 g cooked)'], 600, 50, 45, 22),
      M('Optional bedtime (if protein low)', '9:30 PM', true, ['Low-fat paneer or a casein / Greek yogurt bowl'], 180, 25, 6, 5),
    ],
    rest: [
      M('On waking (fasted)', '6:00 AM', true, ['Overnight soaked chia seeds heated with lemon juice', 'Warm water', '5-6 soaked almonds (if you do play badminton first, have these after instead)'], 135, 5, 14, 9),
      M('Breakfast', '8:00 AM', true, ['3-4 egg whites + 1 whole egg or tofu scramble', 'Oats or 2 small idli', 'Berries'], 380, 34, 30, 12),
      M('Lunch', '12:30 PM', false, ['Grilled chicken or fish', 'Brown rice (200 g cooked)', 'Dal (250 g cooked)', 'Steamed broccoli + carrots (200 g cooked)'], 560, 50, 42, 18),
      M('Snack', '4:00 PM', true, ['Whey shake in water or almond milk', 'Apple'], 240, 28, 20, 4),
      M('Dinner', '7:30 PM', false, ['Chicken or paneer', 'Sabzi', '1-2 roti', 'Steamed broccoli + carrots (200 g cooked)'], 560, 48, 38, 22),
      M('Optional bedtime (if protein low)', '9:30 PM', true, ['Greek yogurt bowl'], 160, 22, 6, 4),
    ],
    fastThu: [
      M('Fasting window until 6 PM', '5 AM - 6 PM', true, ['Water', 'Black coffee', 'Green tea', 'Emergency only: one fruit OR one glass of milk'], 40, 2, 6, 1),
      M('Break the fast (gentle)', '6:00 PM', true, ['1 fruit or 2 dates', 'Small handful soaked nuts', 'Warm water'], 200, 5, 28, 8),
      M('High-protein veg dinner', '7:30 PM', true, ['Paneer or tofu', 'Dal (250 g cooked) or rajma', 'Sabzi', 'Millet or 1-2 roti', 'Steamed broccoli + carrots (200 g cooked)'], 700, 52, 55, 24),
      M('Protein before bed (if low)', '9:30 PM', true, ['Whey in almond milk or a Greek yogurt bowl'], 220, 30, 8, 6),
    ],
    vegSat: [
      M('On waking (fasted)', '6:00 AM', true, ['Overnight soaked chia seeds heated with lemon juice', 'Warm water', '5-6 soaked almonds (if you do play badminton first, have these after instead)'], 135, 5, 14, 9),
      M('Breakfast', '8:00 AM', true, ['Overnight oats in almond milk', '1.5 scoops whey', 'Chia + flax', 'Berries'], 520, 48, 52, 14),
      M('Lunch', '1:00 PM', true, ['Paneer or tofu bhurji', 'Chana or rajma', 'Brown rice (200 g cooked) or millet', 'Steamed broccoli + carrots (200 g cooked)'], 620, 44, 62, 20),
      M('Snack', '4:30 PM', true, ['Greek yogurt', 'Berries', 'Pumpkin seeds'], 280, 26, 20, 10),
      M('Dinner', '7:30 PM', true, ['Dal (250 g cooked) + paneer', 'Sabzi', '1-2 roti', 'Steamed broccoli + carrots (200 g cooked)'], 580, 42, 50, 20),
    ],
  },
  // quick add buttons. meat:true items dim on vegetarian days.
  quickAdds: [
    { label: 'Whey scoop', p: 24, c: 3, f: 1, kcal: 120, meat: false },
    { label: 'Greek yogurt', p: 17, c: 8, f: 4, kcal: 130, meat: false },
    { label: '3 egg whites', p: 11, c: 1, f: 0, kcal: 51, meat: false, egg: true },
    { label: '4 egg whites', p: 14, c: 1, f: 0, kcal: 68, meat: false, egg: true },
    { label: 'Egg', p: 6, c: 1, f: 5, kcal: 78, meat: false, egg: true },
    { label: 'Chicken 150g', p: 46, c: 0, f: 6, kcal: 250, meat: true },
    { label: 'Fish 150g', p: 34, c: 0, f: 9, kcal: 220, meat: true },
    { label: 'Dal 250g cooked', p: 12, c: 30, f: 4, kcal: 200, meat: false },
    { label: 'Tofu 150g', p: 17, c: 3, f: 9, kcal: 170, meat: false },
    { label: 'Paneer 100g', p: 18, c: 4, f: 20, kcal: 265, meat: false },
    { label: 'Fruit', p: 1, c: 25, f: 0, kcal: 100, meat: false },
    { label: 'Brown rice 200g cooked', p: 5, c: 45, f: 2, kcal: 215, meat: false },
    { label: 'Roti', p: 3, c: 18, f: 3, kcal: 110, meat: false },
    { label: 'Water 500 ml', water: 0.5, meat: false },
  ],
};

// Daily drinks are stored separately from indexed meal slots so adding a new
// drink never shifts or corrupts existing meal completion history.
export const DAILY_BEVERAGES = [
  { key: 'greenTeaAm', label: 'Unsweetened green tea', timing: '10:00 AM', detail: 'First cup; count caffeine from coffee and other tea too.', p: 0, c: 0, f: 0, kcal: 0, water: 0 },
  { key: 'greenTeaPm', label: 'Unsweetened green tea', timing: '3:00 PM', detail: 'Second cup; use decaf or skip if caffeine affects sleep.', p: 0, c: 0, f: 0, kcal: 0, water: 0 },
  { key: 'coconutWater', label: 'Unsweetened coconut water', timing: '250 ml around sport', detail: 'Useful option after sweaty swim/badminton; not during a fast.', p: 0.5, c: 10.5, f: 0, kcal: 45, water: 0.25, potassiumMg: 413, sportOption: true },
];

// ============================================================
// SUPPLEMENTS (daily)
// ============================================================
export const SUPPLEMENTS = [
  { key: 'creatine', name: 'Creatine monohydrate', dose: '5 g', timing: 'Anytime, daily', withFood: 'Either', purpose: 'Strength, lean mass, muscle retention in a deficit', caution: 'Stay hydrated. Timing does not matter, consistency does.', tag: 'daily' },
  { key: 'whey', name: 'Whey protein', dose: '1 scoop before strength training', timing: '7:00-7:15 AM before the 7:45 AM gym session', withFood: 'Water; remaining planned whey stays with breakfast if shown', purpose: 'Makes the current pre-workout habit explicit while preserving daily protein', caution: 'Already counted in the meal plan. Do not add another scoop unless you deliberately choose a logged protein top-up.', tag: 'daily' },
  { key: 'vitd', name: 'Vitamin D3 + K2', dose: 'Per label', timing: 'Morning', withFood: 'With a fatty meal', purpose: 'Maintenance. Your level is 50 ng/mL, already optimal', caution: 'Maintenance only unless a doctor says otherwise. Do not stack multiple D products, track total daily IU. Recheck periodically.', tag: 'maintenance' },
  { key: 'magnesium', name: 'Magnesium glycinate', dose: 'Per label (track elemental Mg)', timing: 'Evening, 30-60 min before bed', withFood: 'Either', purpose: 'Sleep quality, relaxation, recovery', caution: 'Track elemental magnesium, not capsule weight. Loose stool means reduce or stop. Caution with kidney disease.', tag: 'daily' },
  { key: 'biotin', name: 'Hair, Skin & Nails (Biotin)', dose: '50,000 mcg', timing: 'With a meal', withFood: 'With food', purpose: 'Hair/skin/nails support', caution: 'HIGH-DOSE. High-dose biotin can skew lab tests (thyroid, troponin, vitamin D, hormones). Tell your doctor and lab before blood work, and pause if they advise. Biotin only helps hair if you are deficient, it is not a guaranteed hair-loss fix.', tag: 'high-dose' },
  { key: 'fishoil', name: 'Fish oil (omega-3)', dose: '2-3 g EPA + DHA', timing: 'With a meal', withFood: 'With food', purpose: 'Supports LDL and recovery (LDL is 123)', caution: 'Optional. Choose a low-oxidation brand.', tag: 'optional' },
  { key: 'electrolytes', name: 'Electrolytes', dose: '1 serving', timing: 'Around badminton or swimming', withFood: 'In water', purpose: 'Replace sweat losses on sport days', caution: 'Sport days only. Pick a low- or zero-sugar option to protect HbA1c.', tag: 'conditional', conditional: 'sport' },
];

// ---- labs snapshot (shown in Body > Labs) ----
export const LABS = [
  { key: 'vitd', label: 'Vitamin D', value: '50 ng/mL', status: 'good', note: 'Already optimal. Maintenance, not aggressive dosing.' },
  { key: 'tsh', label: 'TSH (thyroid)', value: '1.78', status: 'good', note: 'In range. Thyroid is not the limiter right now.' },
  { key: 'ldl', label: 'LDL', value: '123 mg/dL', status: 'watch', note: 'Slightly high. Keep paneer measured, avoid fried food, keep omega-3 and fiber up.' },
  { key: 'hba1c', label: 'HbA1c', value: '5.6 %', status: 'watch', note: 'Upper-normal. Pair carbs with protein, avoid sugary drinks, keep the deficit steady.' },
];

// ---- hair-health checklist config (drives the Hair Protection card) ----
export const HAIR_HEALTH = {
  title: 'Hair protection',
  intro: 'Fat loss done too hard can trigger shedding. These levers keep hair, muscle and recovery safe at the same time.',
  labReminders: ['Ask about ferritin and iron studies if you notice shedding', 'Thyroid (TSH 1.78) already checked and fine', 'Vitamin D 50 ng/mL already optimal', 'Re-check B12 and zinc if shedding persists'],
  disclaimer: 'This is coaching, not diagnosis. Ongoing shedding warrants a physician or dermatologist and the labs above. No supplement is promised to regrow hair.',
};


// ============================================================
// HABITS (daily checklist template)
// ============================================================
export const HABITS = [
  { key: 'workout_done', label: 'Workout completed', group: 'Training' },
  { key: 'workout_logged', label: 'Workout logged', group: 'Training' },
  { key: 'protein_hit', label: 'Protein goal reached', group: 'Nutrition' },
  { key: 'calories_ok', label: 'Calories within target', group: 'Nutrition' },
  // key kept as steps_10k so older habit logs still count; the bar is settings.stepsTarget
  { key: 'steps_10k', label: 'Daily step target', group: 'Activity' },
  { key: 'zone2_walk', label: "Zone 2 walk (today's scheduled minutes)", group: 'Activity' },
  { key: 'water_hit', label: '3.5-4 L water', group: 'Nutrition' },
  { key: 'sleep_75', label: 'Sleep 7.5 hours', group: 'Recovery' },
  { key: 'creatine', label: 'Creatine', group: 'Supplements' },
  { key: 'fishoil', label: 'Fish oil', group: 'Supplements' },
  { key: 'vitd', label: 'Vitamin D3 + K2', group: 'Supplements' },
  { key: 'magnesium', label: 'Magnesium glycinate', group: 'Supplements' },
  { key: 'biotin', label: 'Biotin / Hair Skin Nails', group: 'Supplements' },
  { key: 'stress_downshift', label: 'Stress downshift (walk / breathe)', group: 'Recovery' },
  { key: 'mobility', label: 'Stretching or mobility', group: 'Recovery' },
  { key: 'swim', label: 'Swim completed (if scheduled)', group: 'Activity' },
  { key: 'badminton', label: 'Badminton (if played)', group: 'Activity' },
  { key: 'oil_measured', label: 'Cooking oil measured (1 tsp per meal)', group: 'Nutrition' },
  { key: 'no_junk', label: 'No junk food', group: 'Nutrition' },
  { key: 'no_sugary', label: 'No sugary drinks', group: 'Nutrition' },
  { key: 'thu_veg', label: 'Thursday vegetarian followed', group: 'Rules' },
  { key: 'sat_veg', label: 'Saturday vegetarian followed', group: 'Rules' },
  { key: 'bodybalance', label: 'BodyBalance completed (if selected)', group: 'Rules' },
  { key: 'morning_weight', label: 'Morning body weight', group: 'Tracking' },
];

// ============================================================
// SEED BODY SCANS (your four real Evolt 360 result sheets)
// ============================================================
export const SEED_SCANS = [
  { id: 'seed-2025-10-29', date: '2025-10-29', weight: 182.3, bodyFatPct: 23.1, fatMass: 42.1, leanMass: 140.2, skeletalMuscle: 77.8, protein: 28.7, mineral: 10.6, bodyWater: 101.0, subcutFat: 36.6, visceralFatLevel: 8, visceralFatArea: 76, waist: 36.1, waistHip: 0.82, bmr: 1743, tee: 2684, bioAge: 35, bwi: 7.2 },
  { id: 'seed-2026-04-20', date: '2026-04-20', weight: 189.4, bodyFatPct: 24.8, fatMass: 47.0, leanMass: 142.4, skeletalMuscle: 78.9, protein: 28.9, mineral: 11.0, bodyWater: 102.5, subcutFat: 40.6, visceralFatLevel: 9, visceralFatArea: 80, waist: 37.3, waistHip: 0.83, bmr: 1765, tee: 2718, bioAge: 36, bwi: 6.9 },
  { id: 'seed-2026-07-08', date: '2026-07-08', weight: 191.1, bodyFatPct: 24.3, fatMass: 46.5, leanMass: 144.6, skeletalMuscle: 80.2, protein: 29.5, mineral: 10.8, bodyWater: 104.3, subcutFat: 40.1, visceralFatLevel: 9, visceralFatArea: 78, waist: 37.2, waistHip: 0.83, bmr: 1786, tee: 2750, bioAge: 36, bwi: 6.9 },
  { id: 'seed-2026-08-13', date: '2026-08-13', weight: 187.8, bodyFatPct: 24.0, fatMass: 45.0, leanMass: 142.9, skeletalMuscle: 79.1, protein: 29.1, mineral: 11.0, bodyWater: 102.7, subcutFat: 38.8, visceralFatLevel: 9, visceralFatArea: 77, waist: 36.8, waistHip: 0.83, bmr: 1769, tee: 2724, bioAge: 35, bwi: 7.2 },
  { id: 'seed-2026-09-25', date: '2026-09-25', weight: 191.6, bodyFatPct: 24.8, fatMass: 47.6, leanMass: 144.0, skeletalMuscle: 79.8, protein: 29.3, mineral: 11.0, bodyWater: 103.6, subcutFat: 41.0, visceralFatLevel: 9, visceralFatArea: 81, waist: 37.5, waistHip: 0.83, bmr: 1780, tee: 2741, bioAge: 36, bwi: 6.9,
    armLLean: 8.18, armLFat: 2.82, armRLean: 8.11, armRFat: 2.56, trunkLean: 62.48, trunkFat: 27.95, legLLean: 20.61, legLFat: 7.30, legRLean: 20.99, legRFat: 7.01 },
  // 11-13-2026: fat mass -0.4 lb and protein +1.3 lb since 09-25, but body
  // water +4.4 lb, so most of the +5.9 lb lean jump is water (creatine, carbs,
  // hydration). Visceral 9 -> 11 does not fit flat torso fat and flat waist;
  // treat it as unconfirmed until the next scan under the same conditions.
  { id: 'seed-2026-11-13', date: '2026-11-13', weight: 197.1, bodyFatPct: 23.9, fatMass: 47.2, leanMass: 149.9, skeletalMuscle: 83.1, protein: 30.6, mineral: 11.2, bodyWater: 108.0, subcutFat: 40.6, visceralFatLevel: 11, visceralFatArea: 100, waist: 37.4, waistHip: 0.88, bmr: 1838, tee: 2830, bioAge: 36, bwi: 7.2,
    armLLean: 8.64, armLFat: 2.67, armRLean: 8.55, armRFat: 2.51, trunkLean: 65.06, trunkFat: 28.00, legLLean: 21.36, legLFat: 7.10, legRLean: 21.74, legRFat: 6.92 },
];


// Evolt 360 segmental analysis (lb). Kept apart from SCAN_FIELDS so the main
// comparison stays short; older scans simply have these blank. The Evolt
// normal ranges for this profile are printed beside each value on the sheet.
export const SEGMENT_FIELDS = [
  { key: 'armLLean', fat: 'armLFat', label: 'Left arm', fatRange: [1.59, 2.38] },
  { key: 'armRLean', fat: 'armRFat', label: 'Right arm', fatRange: [1.59, 2.38] },
  { key: 'trunkLean', fat: 'trunkFat', label: 'Torso', fatRange: [13.03, 19.53] },
  { key: 'legLLean', fat: 'legLFat', label: 'Left leg', fatRange: [4.10, 6.15] },
  { key: 'legRLean', fat: 'legRFat', label: 'Right leg', fatRange: [4.10, 6.15] },
];

export const SCAN_FIELDS = [
  { key: 'weight', label: 'Weight', unit: 'lb', good: 'down' },
  { key: 'bodyFatPct', label: 'Body Fat', unit: '%', good: 'down' },
  { key: 'fatMass', label: 'Fat Mass', unit: 'lb', good: 'down' },
  { key: 'leanMass', label: 'Lean Mass', unit: 'lb', good: 'up' },
  { key: 'skeletalMuscle', label: 'Skeletal Muscle', unit: 'lb', good: 'up' },
  { key: 'visceralFatLevel', label: 'Visceral Fat Lvl', unit: '', good: 'down' },
  { key: 'visceralFatArea', label: 'Visceral Fat Area', unit: 'cm2', good: 'down' },
  { key: 'waist', label: 'Waist', unit: 'in', good: 'down' },
  { key: 'waistHip', label: 'Waist / Hip', unit: '', good: 'down' },
  { key: 'bmr', label: 'BMR', unit: 'kcal', good: 'up' },
  { key: 'bioAge', label: 'Bio Age', unit: 'yr', good: 'down' },
  { key: 'bwi', label: 'BWI Score', unit: '/10', good: 'up' },
];

export const WATCH_FIELDS = [
  { key: 'steps', label: 'Steps', unit: '' },
  { key: 'activeCal', label: 'Active Calories', unit: 'kcal' },
  { key: 'exerciseMin', label: 'Exercise Minutes', unit: 'min' },
  { key: 'standHours', label: 'Stand Hours', unit: 'hr' },
  { key: 'restingHR', label: 'Resting HR', unit: 'bpm' },
  { key: 'sleepH', label: 'Sleep', unit: 'hr' },
  { key: 'sleepScore', label: 'Sleep Score', unit: '/100' },
  { key: 'hrv', label: 'HRV', unit: 'ms' },
  { key: 'vo2max', label: 'VO2 Max', unit: '' },
  { key: 'walkingHR', label: 'Walking HR', unit: 'bpm' },
  { key: 'spo2', label: 'Blood Oxygen', unit: '%' },
  { key: 'respiratoryRate', label: 'Respiratory Rate', unit: 'br/min' },
  { key: 'distance', label: 'Walk+Run Distance', unit: 'km' },
  { key: 'flights', label: 'Flights Climbed', unit: '' },
  { key: 'basalCal', label: 'Resting Energy', unit: 'kcal' },
  { key: 'workoutCal', label: 'Workout Calories', unit: 'kcal' },
  { key: 'workoutMin', label: 'Workout Minutes', unit: 'min' },
  { key: 'avgHR', label: 'Average HR', unit: 'bpm' },
].filter((f) => f.label);

// Apple Health Shortcut deep-link: query param -> watch field key.
// A Shortcut reads these HealthKit values and opens the app with e.g.
//   ?steps=9412&sleep=7.3&rhr=58&hrv=64&sleepScore=88&vo2max=44&active=540&spo2=98
export const HEALTH_PARAM_MAP = {
  steps: 'steps',
  active: 'activeCal', activeCal: 'activeCal',
  basal: 'basalCal', basalCal: 'basalCal',
  exercise: 'exerciseMin', exerciseMin: 'exerciseMin',
  stand: 'standHours', standHours: 'standHours',
  rhr: 'restingHR', restingHR: 'restingHR',
  walkingHR: 'walkingHR', walkHR: 'walkingHR',
  sleep: 'sleepH', sleepH: 'sleepH',
  sleepScore: 'sleepScore',
  hrv: 'hrv',
  vo2max: 'vo2max', vo2: 'vo2max',
  spo2: 'spo2', oxygen: 'spo2', bloodOxygen: 'spo2',
  respiratoryRate: 'respiratoryRate', respRate: 'respiratoryRate', resp: 'respiratoryRate',
  distance: 'distance', distanceKm: 'distance',
  flights: 'flights', flightsClimbed: 'flights',
  workoutCal: 'workoutCal',
  workoutMin: 'workoutMin', workout: 'workoutMin',
  avgHR: 'avgHR',
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================================
// SITUATIONAL FUELING (badminton + swimming) and DAY VARIANTS
// Rendered as coach cards in Fuel and surfaced on Home.
// Protein target never drops; carbs and water flex around sport.
// ============================================================
export const BADMINTON_FUEL = {
  key: 'badminton',
  title: 'Badminton fuel plan',
  window: 'Mon to Fri, 5:30 to 7:00 AM',
  sections: [
    {
      label: 'Before badminton',
      lead: 'Keep it light, no oily or heavy food before court.',
      options: [
        { tag: 'Light', items: ['1 banana or 2 dates', 'Water', 'Optional black coffee'] },
        { tag: 'Sensitive stomach', items: ['Water plus electrolytes only', 'Eat after the session instead'] },
      ],
    },
    {
      label: 'After badminton, before lifting',
      lead: 'Only if you lift after. Rehydrate first, then fast protein and carbs.',
      options: [
        { tag: 'Go-to', items: ['1.5 scoops whey plus 1 banana', 'or Greek yogurt plus berries', 'or 2 dates plus whey'], macro: { kcal: 260, p: 30, c: 34, f: 3 } },
        { tag: 'Longer gap', items: ['Small oats portion plus whey', 'Water plus electrolytes'], macro: { kcal: 320, p: 32, c: 40, f: 5 } },
      ],
    },
  ],
  hydration: 'Add 0.5 L water on badminton days and take electrolytes.',
  coachNote: 'Protein target stays the same. If sleep was poor or legs are sore, keep the session easy and low intensity.',
};

export const SWIMMING_FUEL = {
  key: 'swimming',
  title: 'Swimming fuel plan',
  window: 'Tuesday and Thursday evening class',
  sections: [
    {
      label: 'Before class (60 to 90 min prior)',
      lead: 'Light and easy to digest, avoid heavy oily food.',
      options: [
        { tag: 'If needed', items: ['1 banana or fruit', 'or Greek yogurt', 'or small oats portion', 'or buttermilk'], macro: { kcal: 150, p: 10, c: 22, f: 3 } },
        { tag: 'Minimal', items: ['Water plus electrolytes', 'Eat properly after'] },
      ],
    },
    {
      label: 'After class',
      lead: 'Protein-focused dinner and rehydrate.',
      options: [
        { tag: 'Recovery', items: ['High-protein dinner', 'or whey / Greek yogurt if dinner is delayed'], macro: { kcal: 500, p: 45, c: 40, f: 15 } },
      ],
    },
  ],
  thursdayRule: 'Thursday is a normal eating day by default: hinge and glutes in the morning, swim in the evening. Keep the pre-swim snack light and get a high-protein dinner after class. Turn on Vegetarian Thursday in More to make it a veg day.',
  coachNote: 'Do not underfuel recovery. If the swim runs late, get 30g protein in within the hour after class.',
};

// day-type -> short human reason the diet differs that day
export const DAY_VARIANTS = {
  training: { label: 'Training day', tone: 'cyan', why: 'Highest carbs and calories to fuel lifting and refill glycogen.' },
  trainingVeg: { label: 'Vegetarian training day', tone: 'green', why: 'Same calories and same protein as any training day, vegetarian only (Puratasi, or Thursdays when Vegetarian Thursday is on in More). Lead every plate with soya chunks, whey and paneer; dal and rice alone will not reach the target.' },
  rest:     { label: 'Rest day', tone: 'violet', why: 'Lower carbs, protein held high to keep recovery and muscle up.' },
  restVeg:  { label: 'Puratasi rest day', tone: 'green', why: 'Same calories and same protein as any rest day, vegetarian only. Protein is the hard part today, so front-load it.' },
  fastThu:  { label: 'Fast plus swim', tone: 'amber', why: 'Fasted until 6 PM, then a gentle break and a high-protein veg dinner around the swim.' },
  noMoonFast: { label: 'No-moon day · fast to 1 PM', tone: 'amber', why: 'Chicago Panchang no-moon day. Fast until 1 PM, followed by a fully vegetarian high-protein plan.' },
  vegSat:   { label: 'Vegetarian day', tone: 'green', why: 'No chicken, fish or eggs. Protein anchored on whey, paneer, tofu, dal and Greek yogurt.' },
};
