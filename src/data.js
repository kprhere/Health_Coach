// ============================================================
// data.js - all static content for Body Recomp OS
// Program uses first-class BLOCKS: single | superset | circuit | finisher | dropset.
// Schedule + rules live here and in helpers only, never scattered in the UI.
// ============================================================

export const STORAGE_KEY = 'recomp-os-v1';

// ---- profile / goal seeded from the latest Evolt 360 scan (07-08-2026) ----
export const PROFILE_DEFAULT = {
  name: 'Krishnaprasath',
  heightIn: 71,
  age: 34,
  gender: 'Male',
  startWeightLb: 191.1,
  startBodyFatPct: 24.3,
  startFatMassLb: 46.5,
  startWaistIn: 37.2,
  goalBodyFatPct: 15,
  goalFatLossLb: 22,
  goalWaistIn: 33,
  timelineMonths: 11,
};

export const SETTINGS_DEFAULT = {
  eggAllowed: true,
  units: 'imperial',
  proteinTarget: 190,
  waterTargetL: 3.75,
  stepsTarget: 10000,
  sleepTargetH: 7.5,
  deficitPercent: 20,                  // fat-loss deficit vs maintenance (drives all calorie + food targets)
  // ---- program calendar (all editable in More, week/day recalculate from these) ----
  programStartDate: '2026-07-14',      // program day 1
  restartPhaseStartDate: '2026-07-14', // restart phase day 1
  nextBodyScanDate: '',                // blank = auto (last scan or start + scanFrequencyDays)
  scanFrequencyDays: 30,               // monthly scan cadence
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
};

// shown on Home + README
export const PROGRAM_RATIONALE =
  'Chosen split: 4-day Upper / Lower hybrid around swimming, badminton and one mobility class. ' +
  'After a 40-day layoff and while eating in a fat-loss deficit, recovery is the limiter, so a 6-day PPL is too much. ' +
  'Upper / Lower hits every muscle about 2x per week at moderate volume, which is the sweet spot for holding muscle while losing fat. ' +
  'Tuesday and Thursday evening swims plus optional morning badminton already cover conditioning, so no extra cardio is forced. ' +
  'Thursday stays a true recovery day (fast + no heavy lifting + swim). Saturday is the BodyBalance mobility slot with a lifting fallback.';

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
  'Overhead Press': X('Front Delts', 'Triceps, Upper Chest', 'Barbell', 'Intermediate', 'Pressing strength overhead', 'Dumbbell Shoulder Press', 'Body Builder Standing Press', 'Squeeze glutes, bar over mid-foot, head through', 'Leaning back into the lower spine'),
  'Dumbbell Shoulder Press': X('Front Delts', 'Triceps', 'Dumbbells', 'Beginner', 'Shoulder hypertrophy', 'Machine Shoulder Press', 'Hammer Strength Iso Shoulder Press', 'Elbows slightly forward, no lockout slam', 'Arching back and flaring elbows wide'),
  'Machine Shoulder Press': X('Front Delts', 'Triceps', 'Machine', 'Beginner', 'Low-fatigue shoulder volume', 'Dumbbell Shoulder Press', 'Hammer Strength Iso Shoulder Press', 'Seat so handles at shoulder height', 'Seat too low, wrists bend back'),
  'Arnold Press': X('Front Delts', 'Side Delts, Triceps', 'Dumbbells', 'Intermediate', 'Full-delt pressing', 'Dumbbell Shoulder Press', 'Hammer Strength Iso Shoulder Press', 'Rotate palms out as you press', 'Rushing the rotation and losing control'),
  'Landmine Press': X('Front Delts', 'Upper Chest, Triceps', 'Barbell', 'Beginner', 'Shoulder-friendly pressing', 'Machine Shoulder Press', 'Body Builder Standing Press', 'Press up and slightly in, ribs down', 'Leaning away from the bar'),
  'Lateral Raise': X('Side Delts', '-', 'Dumbbells', 'Beginner', 'Delt width', 'Cable Lateral Raise', 'Arsenal Standing Lateral Raise', 'Lead with elbows, pour-the-jug tilt', 'Swinging and using traps'),
  'Cable Lateral Raise': X('Side Delts', '-', 'Cable', 'Beginner', 'Constant-tension side delts', 'Lateral Raise', 'Arsenal Standing Lateral Raise', 'Cable behind body, smooth arc', 'Yanking with body English'),
  'Rear Delt Fly': X('Rear Delts', 'Traps', 'Dumbbells', 'Beginner', 'Rear delt balance', 'Reverse Pec Deck', 'Arsenal Reverse Fly', 'Hinge over, pinkies up, wide arc', 'Using back instead of rear delts'),
  'Reverse Pec Deck': X('Rear Delts', 'Traps', 'Machine', 'Beginner', 'Isolated rear delts', 'Rear Delt Fly', 'Reverse Pec Deck', 'Slight elbow bend, squeeze back', 'Jerking the handles'),

  // ---- Biceps ----
  'Barbell Curl': X('Biceps', 'Forearms', 'Barbell', 'Beginner', 'Overloaded biceps', 'Dumbbell Curl', 'EZ-Bar Curl', 'Elbows pinned, no swing', 'Rocking the torso to lift'),
  'Dumbbell Curl': X('Biceps', 'Forearms', 'Dumbbells', 'Beginner', 'Balanced biceps', 'Cable Curl', 'Life Fitness Bicep Curl', 'Supinate hard at the top', 'Swinging and half reps'),
  'Incline DB Curl': X('Biceps (long head)', 'Forearms', 'Dumbbells', 'Beginner', 'Biceps stretch and peak', 'Dumbbell Curl', 'Life Fitness Bicep Curl', 'Arms behind body, full stretch', 'Coming forward and shortening range'),
  'Hammer Curl': X('Brachialis, Biceps', 'Forearms', 'Dumbbells', 'Beginner', 'Arm thickness and grip', 'Cable Curl', 'Life Fitness Bicep Curl', 'Neutral grip, elbows still', 'Swinging the weight up'),
  'Cable Curl': X('Biceps', 'Forearms', 'Cable', 'Beginner', 'Constant-tension biceps', 'Dumbbell Curl', 'Life Fitness Bicep Curl', 'Keep tension at the bottom', 'Letting the stack rest each rep'),
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
  'Hanging Leg Raise': X('Abs', 'Hip Flexors', 'Bodyweight', 'Intermediate', 'Lower ab strength', 'Lying Leg Raise', 'Captains Chair Leg Raise', 'Posterior tilt, control the swing', 'Swinging and using momentum'),
  'Lying Leg Raise': X('Abs', 'Hip Flexors', 'Bodyweight', 'Beginner', 'Lower ab control', 'Hanging Leg Raise', 'Bench Leg Raise', 'Press low back down, slow lower', 'Arching the lower back'),
  'Ab Wheel': X('Abs', 'Obliques, Lats', 'Wheel', 'Advanced', 'Anti-extension strength', 'Plank', 'Ab Wheel', 'Ribs down, roll only as far as control', 'Letting the hips sag'),
  'Plank': X('Abs', 'Obliques, Shoulders', 'Bodyweight', 'Beginner', 'Core stability base', 'Dead Bug', 'Plank', 'Squeeze glutes, straight line', 'Hips sagging or piking up'),
  'Side Plank': X('Obliques', 'Abs, Glutes', 'Bodyweight', 'Beginner', 'Lateral core', 'Pallof Press', 'Side Plank', 'Stack hips, drive them up', 'Hips dropping toward floor'),
  'Pallof Press': X('Obliques', 'Abs, Deep Core', 'Cable', 'Beginner', 'Anti-rotation core', 'Side Plank', 'Cable Pallof Press', 'Resist the twist, press straight out', 'Letting the torso rotate'),
  'Cable Woodchop': X('Obliques', 'Abs, Shoulders', 'Cable', 'Beginner', 'Rotational core power', 'Pallof Press', 'Cable Woodchop', 'Rotate from the trunk, arms follow', 'Only moving the arms'),
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
  'Body Builder Standing Press': X('Front Delts', 'Triceps, Upper Chest', 'Body Builder', 'Intermediate', 'Standing overhead press', 'Overhead Press', 'Body Builder Standing Press', 'Ribs down, squeeze glutes', 'Leaning back into the spine'),
};

export const EXERCISE_NAMES = Object.keys(EXERCISES).sort();
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Cardio', 'Mobility'];

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

// ============================================================
// PROGRAM  (day index = JS getDay: 0 Sun ... 6 Sat)
// ============================================================
export const PROGRAM = {
  name: 'Recomp Upper / Lower Hybrid',
  days: {
    1: {
      key: 'upperA', title: 'Upper Body A', focus: 'Strength', dayType: 'training', intensity: 'Hard',
      blocks: [
        single('Hammer Strength Bench Press', 4, 6, 8, 7, 150, '3-1-1', 'Main press. Restart block: stop 2 reps short, no grinding'),
        single('Hammer Strength High Row', 4, 8, 10, 8, 120, '2-1-1', 'Opposite pattern to the press'),
        single('Hammer Strength Iso Shoulder Press', 3, 8, 10, 8, 105, '2-0-1', 'Secondary press for delts'),
        single('Lat Pulldown', 3, 10, 12, 8, 90, '2-1-1', 'Second pull for lat width'),
        single('Life Fitness Bicep Curl', 3, 10, 12, 9, 75, '2-0-1', 'Direct biceps'),
        single('Life Fitness Tricep Press', 3, 10, 12, 9, 75, '2-0-1', 'Direct triceps'),
        superset('Lateral Raise + Face Pull', 3, 60, [
          { name: 'Arsenal Standing Lateral Raise', targetReps: '12-15', targetRpe: 9 },
          { name: 'Face Pull', targetReps: '15-20', targetRpe: 8 },
        ], 'Delts and shoulder health. No rest between the two, 60s after each round'),
        finisher('Arm Burnout', { rounds: 2, restAfterRoundSec: 45 }, [
          { name: 'Incline DB Curl', targetReps: '12-15', targetRpe: 9 },
          { name: 'Rope Pushdown', targetReps: '12-15', targetRpe: 9 },
        ], 'Biceps then triceps, back to back'),
      ],
      conditioning: [], mobility: [],
      sport: [{ name: 'Badminton', detail: 'Optional 5:30-7:00 AM. If played, lift after and add electrolytes + 30-50g carbs.' }],
      notes: 'First hard upper session. Quality reps over load. Direct biceps and triceps included. Log everything so next targets auto-calc.',
    },
    2: {
      key: 'lowerA', title: 'Lower Body A', focus: 'Strength', dayType: 'training', intensity: 'Hard',
      blocks: [
        single('Back Squat', 4, 6, 8, 7, 180, '3-1-1', 'Main squat. Arsenal Squat is the backup if the rack is taken'),
        single('Romanian Deadlift', 4, 8, 10, 8, 150, '3-1-1', 'Hip hinge. Feel the hamstring stretch'),
        single('Hammer Strength Leg Press', 3, 10, 12, 8, 120, '2-0-1', 'Secondary quad and glute'),
        single('Seated Leg Curl', 3, 10, 12, 9, 90, '2-1-1', 'Direct hamstring'),
        single('Standing Calf Raise', 4, 12, 15, 9, 60, '2-1-2', 'Calves, full stretch and pause'),
        single('Bulgarian Split Squat', 3, 10, 12, 8, 90, '2-0-1', 'Unilateral, per leg'),
        circuit('Core Circuit', 3, 60, [
          { name: 'Hanging Leg Raise', targetReps: '10-15', targetRpe: 8 },
          { name: 'Cable Woodchop', targetReps: '10 / side', targetRpe: 8 },
        ], 'Core before the pool'),
      ],
      conditioning: [], mobility: [],
      sport: [{ name: 'Easy Laps', detail: 'Swimming class this evening. Technique-focused, legs already worked.' }],
      notes: 'Swim class tonight. Fuel carbs around the swim and hydrate well.',
    },
    3: {
      key: 'coreRecovery', title: 'Core + Recovery', focus: 'Active Recovery', dayType: 'rest', intensity: 'Light',
      blocks: [
        circuit('Core Circuit', 3, 60, [
          { name: 'Cable Crunch', targetReps: '12-15', targetRpe: 8 },
          { name: 'Pallof Press', targetReps: '10 / side', targetRpe: 7 },
          { name: 'Dead Bug', targetReps: '8-10', targetRpe: 6 },
          { name: 'Plank', targetReps: '30-45s', targetRpe: 6 },
        ], 'Move station to station, rest 60s after the full round'),
      ],
      conditioning: [{ name: 'Incline Walk', detail: '20-25 min zone 2, incline 8-12%. Drives steps and fat loss.' }],
      mobility: [
        { name: 'Hip Flexor Stretch', detail: '2 x 30s per side' },
        { name: 'Thoracic Rotation', detail: '2 x 8 per side' },
        { name: 'Foam Rolling', detail: 'Quads, back, calves' },
      ],
      sport: [{ name: 'Badminton', detail: 'Optional morning session if recovery feels good.' }],
      notes: 'Deliberately easy. Recover from Mon and Tue, keep steps and water up.',
    },
    4: {
      key: 'fastRest', title: 'Fast + Recovery', focus: 'Rest + Swim', dayType: 'fastThu', intensity: 'Recovery',
      blocks: [],
      conditioning: [{ name: 'Easy Laps', detail: 'Swimming class this evening, easy to moderate.' }],
      mobility: [
        { name: 'Shoulder Mobility', detail: '2 x 10 slow passes' },
        { name: 'Hamstring Stretch', detail: '2 x 30s per side' },
        { name: 'Foam Rolling', detail: 'Full body, gentle' },
      ],
      sport: [],
      notes: 'Fasting until 6 PM: water, black coffee, green tea only. Emergency = one fruit OR one glass of milk. No heavy lifting. Break the fast gently, protein first.',
    },
    5: {
      key: 'upperB', title: 'Upper Body B', focus: 'Hypertrophy', dayType: 'training', intensity: 'Hard',
      blocks: [
        single('Hammer Strength Incline Press', 4, 8, 10, 8, 120, '3-1-1', 'Main upper chest press'),
        single('Hammer Strength Row', 4, 10, 12, 8, 90, '2-1-1', 'Back thickness'),
        single('Arsenal Laying Pec Fly', 3, 12, 15, 9, 75, '2-1-2', 'Chest isolation and stretch'),
        single('Body Builder Standing Press', 3, 10, 12, 8, 90, '2-0-1', 'Overhead shoulder press'),
        single('Incline DB Curl', 3, 10, 12, 9, 75, '2-0-1', 'Direct biceps, long-head stretch'),
        single('Overhead Tricep Extension', 3, 12, 15, 9, 75, '2-1-2', 'Direct triceps, long head'),
        superset('Lateral + Rear Delt', 3, 60, [
          { name: 'Arsenal Standing Lateral Raise', targetReps: '12-15', targetRpe: 9 },
          { name: 'Rear Delt Fly', targetReps: '15-20', targetRpe: 9 },
        ], 'Side and rear delts, no rest between'),
        finisher('Arm + Shoulder Finisher', { rounds: 2, restAfterRoundSec: 45 }, [
          { name: 'Hammer Curl', targetReps: '12-15', targetRpe: 9 },
          { name: 'Rope Pushdown', targetReps: '12-15', targetRpe: 9 },
        ]),
      ],
      conditioning: [], mobility: [],
      sport: [{ name: 'Badminton', detail: 'Optional morning. If played, lift after and refuel.' }],
      notes: 'Pump-focused with direct arms. Controlled tempo, add reps before adding weight.',
    },
    6: {
      key: 'saturday', title: 'BodyBalance', focus: 'Mobility Class', dayType: 'vegSat', intensity: 'Light', isClassDay: true,
      blocks: [],
      conditioning: [],
      mobility: [{ name: 'BodyBalance Class', detail: 'Les Mills BodyBalance, 45-55 min. Yoga, tai chi and pilates blend for flexibility, balance and core.' }],
      sport: [],
      notes: 'Vegetarian day. If BodyBalance is missed, switch to the Full Body fallback below and keep protein high (whey, paneer, dal, Greek yogurt).',
      fallback: {
        key: 'saturdayFallback', title: 'Full Body Pump (fallback)', focus: 'Full Body', dayType: 'vegSat', intensity: 'Moderate',
        blocks: [
          single('Hammer Strength Leg Press', 3, 12, 15, 8, 90, '2-0-1', 'Legs'),
          single('Hammer Strength Bench Press', 3, 10, 12, 8, 90, '2-1-1', 'Chest'),
          single('Hammer Strength Row', 3, 10, 12, 8, 90, '2-1-1', 'Back'),
          single('Hammer Strength Iso Shoulder Press', 3, 10, 12, 8, 75, '2-0-1', 'Shoulders'),
          superset('Curl + Pushdown', 3, 45, [
            { name: 'Life Fitness Bicep Curl', targetReps: '12-15', targetRpe: 9 },
            { name: 'Life Fitness Tricep Press', targetReps: '12-15', targetRpe: 9 },
          ], 'Direct arms superset'),
          circuit('Core Finisher', 3, 45, [
            { name: 'Hanging Leg Raise', targetReps: '10-15', targetRpe: 8 },
            { name: 'Cable Woodchop', targetReps: '10 / side', targetRpe: 8 },
          ]),
        ],
        conditioning: [], mobility: [], sport: [],
        notes: 'Vegetarian day fallback. Moderate full-body pump, do not clash with Sunday legs.',
      },
    },
    0: {
      key: 'lowerB', title: 'Lower Body B', focus: 'Hypertrophy', dayType: 'training', intensity: 'Hard',
      blocks: [
        single('Hack Squat', 4, 8, 10, 8, 150, '3-1-1', 'Main quad. Arsenal Inverted Leg Press is the alternative'),
        single('Hip Thrust', 4, 10, 12, 8, 120, '2-1-2', 'Hip hinge and glutes, full lockout squeeze'),
        single('Life Fitness Leg Press', 3, 12, 15, 8, 90, '2-0-1', 'Secondary quad and glute'),
        superset('Leg Curl + Leg Extension', 3, 75, [
          { name: 'Lying Leg Curl', targetReps: '12-15', targetRpe: 9 },
          { name: 'Leg Extension', targetReps: '15', targetRpe: 9 },
        ], 'Hamstring then quad, no rest between'),
        dropset('Seated Calf Raise', 3, 12, 15, 10, 45, '2-1-2', [
          { label: 'Drop 1 (-20%)', targetReps: 'to failure' },
          { label: 'Drop 2 (-20%)', targetReps: 'to failure' },
        ], 'Top set ~1 rep shy, then strip the weight twice and keep going'),
        single('Bulgarian Split Squat', 3, 10, 12, 8, 90, '2-0-1', 'Unilateral, per leg'),
        circuit('Core Circuit', 3, 45, [
          { name: 'Cable Woodchop', targetReps: '10 / side', targetRpe: 8 },
          { name: 'Lying Leg Raise', targetReps: '12-15', targetRpe: 8 },
        ]),
      ],
      conditioning: [], mobility: [],
      sport: [],
      notes: 'Last hard session of the week. If performance has stalled two weeks running, take an easy deload next week.',
    },
  },
};

// ============================================================
// NUTRITION  (dayType targets + meal templates + quick adds)
// veg=true meals are safe for Thursday and Saturday.
// ============================================================
const M = (name, time, veg, items, kcal, p, c, f) => ({ name, time, veg, items, kcal, p, c, f });

export const NUTRITION = {
  targets: {
    training: { kcal: 2400, protein: 195, carbs: 235, fat: 70, fiber: 35, waterL: 3.75 },
    rest: { kcal: 2100, protein: 190, carbs: 165, fat: 68, fiber: 35, waterL: 3.5 },
    fastThu: { kcal: 2000, protein: 185, carbs: 150, fat: 62, fiber: 32, waterL: 3.75 },
    vegSat: { kcal: 2150, protein: 180, carbs: 190, fat: 65, fiber: 40, waterL: 3.5 },
  },
  plans: {
    training: [
      M('On waking (fasted)', '5:15 AM', true, ['Overnight soaked chia seeds heated with lemon juice', 'Warm water', '5-6 soaked almonds (skip if badminton first, have after)'], 135, 5, 14, 9),
      M('Post-workout breakfast', '7:30 AM', true, ['Overnight oats in almond milk', '1.5 scoops whey', 'Chia + flax seeds', 'Mixed berries'], 520, 48, 52, 14),
      M('Lunch', '12:30 PM', false, ['Grilled chicken or fish', 'Brown rice or quinoa', 'Dal', 'Large salad with olive oil'], 620, 52, 58, 18),
      M('Snack', '4:00 PM', true, ['Greek yogurt', 'Berries', '5-6 soaked almonds (measured)'], 300, 30, 22, 10),
      M('Dinner', '7:30 PM', false, ['Chicken, fish or paneer', 'Roti or millet', 'Sabzi', 'Salad'], 600, 50, 45, 22),
      M('Optional bedtime (if protein low)', '9:30 PM', true, ['Low-fat paneer or a casein / Greek yogurt bowl'], 180, 25, 6, 5),
    ],
    rest: [
      M('On waking (fasted)', '6:00 AM', true, ['Overnight soaked chia seeds heated with lemon juice', 'Warm water', '5-6 soaked almonds (skip if badminton first, have after)'], 135, 5, 14, 9),
      M('Breakfast', '8:00 AM', true, ['3-4 egg whites + 1 whole egg or tofu scramble', 'Oats or 2 small idli', 'Berries'], 380, 34, 30, 12),
      M('Lunch', '12:30 PM', false, ['Grilled chicken or fish', 'Small brown rice', 'Dal', 'Large salad'], 560, 50, 42, 18),
      M('Snack', '4:00 PM', true, ['Whey shake in water or almond milk', 'Apple'], 240, 28, 20, 4),
      M('Dinner', '7:30 PM', false, ['Chicken or paneer', 'Sabzi', '1-2 roti', 'Salad'], 560, 48, 38, 22),
      M('Optional bedtime (if protein low)', '9:30 PM', true, ['Greek yogurt bowl'], 160, 22, 6, 4),
    ],
    fastThu: [
      M('Fasting window until 6 PM', '5 AM - 6 PM', true, ['Water', 'Black coffee', 'Green tea', 'Emergency only: one fruit OR one glass of milk'], 40, 2, 6, 1),
      M('Break the fast (gentle)', '6:00 PM', true, ['1 fruit or 2 dates', 'Small handful soaked nuts', 'Warm water'], 200, 5, 28, 8),
      M('High-protein veg dinner', '7:30 PM', true, ['Paneer or tofu', 'Dal or rajma', 'Sabzi', 'Millet or 1-2 roti', 'Salad'], 700, 52, 55, 24),
      M('Protein before bed (if low)', '9:30 PM', true, ['Whey in almond milk or a Greek yogurt bowl'], 220, 30, 8, 6),
    ],
    vegSat: [
      M('On waking (fasted)', '6:00 AM', true, ['Overnight soaked chia seeds heated with lemon juice', 'Warm water', '5-6 soaked almonds (skip if badminton first, have after)'], 135, 5, 14, 9),
      M('Breakfast', '8:00 AM', true, ['Overnight oats in almond milk', '1.5 scoops whey', 'Chia + flax', 'Berries'], 520, 48, 52, 14),
      M('Lunch', '1:00 PM', true, ['Paneer or tofu bhurji', 'Chana or rajma', 'Brown rice or millet', 'Large salad'], 620, 44, 62, 20),
      M('Snack', '4:30 PM', true, ['Greek yogurt', 'Berries', 'Pumpkin seeds'], 280, 26, 20, 10),
      M('Dinner', '7:30 PM', true, ['Dal + paneer', 'Sabzi', '1-2 roti', 'Salad'], 580, 42, 50, 20),
    ],
  },
  // quick add buttons. meat:true items dim on Thu / Sat.
  quickAdds: [
    { label: 'Whey scoop', p: 24, c: 3, f: 1, kcal: 120, meat: false },
    { label: 'Greek yogurt', p: 17, c: 8, f: 4, kcal: 130, meat: false },
    { label: 'Egg', p: 6, c: 1, f: 5, kcal: 78, meat: false },
    { label: 'Chicken 150g', p: 46, c: 0, f: 6, kcal: 250, meat: true },
    { label: 'Fish 150g', p: 34, c: 0, f: 9, kcal: 220, meat: true },
    { label: 'Dal 1 bowl', p: 12, c: 30, f: 4, kcal: 200, meat: false },
    { label: 'Tofu 150g', p: 17, c: 3, f: 9, kcal: 170, meat: false },
    { label: 'Paneer 100g', p: 18, c: 4, f: 20, kcal: 265, meat: false },
    { label: 'Fruit', p: 1, c: 25, f: 0, kcal: 100, meat: false },
    { label: 'Rice 1 cup', p: 4, c: 45, f: 0, kcal: 200, meat: false },
    { label: 'Roti', p: 3, c: 18, f: 3, kcal: 110, meat: false },
    { label: 'Water 500 ml', water: 0.5, meat: false },
  ],
};

// ============================================================
// SUPPLEMENTS (daily)
// ============================================================
export const SUPPLEMENTS = [
  { key: 'creatine', name: 'Creatine monohydrate', dose: '5 g', timing: 'Anytime, daily', withFood: 'Either', purpose: 'Strength, lean mass, muscle retention in a deficit', caution: 'Stay hydrated. Timing does not matter, consistency does.', tag: 'daily' },
  { key: 'whey', name: 'Whey protein', dose: '1.5 scoops', timing: 'Post-workout breakfast', withFood: 'With oats', purpose: 'Hits the daily protein target for muscle and hair', caution: 'A food-first tool, not a meal replacement.', tag: 'daily' },
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
  { key: 'steps_10k', label: '10,000 steps', group: 'Activity' },
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
  { key: 'no_junk', label: 'No junk food', group: 'Nutrition' },
  { key: 'no_sugary', label: 'No sugary drinks', group: 'Nutrition' },
  { key: 'thu_fast', label: 'Thursday fast completed', group: 'Rules' },
  { key: 'thu_veg', label: 'Thursday vegetarian followed', group: 'Rules' },
  { key: 'sat_veg', label: 'Saturday vegetarian followed', group: 'Rules' },
  { key: 'bodybalance', label: 'BodyBalance completed (if selected)', group: 'Rules' },
  { key: 'morning_weight', label: 'Morning body weight', group: 'Tracking' },
];

// ============================================================
// SEED BODY SCANS (your three real Evolt 360 result sheets)
// ============================================================
export const SEED_SCANS = [
  { id: 'seed-2025-10-29', date: '2025-10-29', weight: 182.3, bodyFatPct: 23.1, fatMass: 42.1, leanMass: 140.2, skeletalMuscle: 77.8, protein: 28.7, mineral: 10.6, bodyWater: 101.0, subcutFat: 36.6, visceralFatLevel: 8, visceralFatArea: 76, waist: 36.1, waistHip: 0.82, bmr: 1743, tee: 2684, bioAge: 35, bwi: 7.2 },
  { id: 'seed-2026-04-20', date: '2026-04-20', weight: 189.4, bodyFatPct: 24.8, fatMass: 47.0, leanMass: 142.4, skeletalMuscle: 78.9, protein: 28.9, mineral: 11.0, bodyWater: 102.5, subcutFat: 40.6, visceralFatLevel: 9, visceralFatArea: 80, waist: 37.3, waistHip: 0.83, bmr: 1765, tee: 2718, bioAge: 36, bwi: 6.9 },
  { id: 'seed-2026-07-08', date: '2026-07-08', weight: 191.1, bodyFatPct: 24.3, fatMass: 46.5, leanMass: 144.6, skeletalMuscle: 80.2, protein: 29.5, mineral: 10.8, bodyWater: 104.3, subcutFat: 40.1, visceralFatLevel: 9, visceralFatArea: 78, waist: 37.2, waistHip: 0.83, bmr: 1786, tee: 2750, bioAge: 36, bwi: 6.9 },
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
  thursdayRule: 'Thursday is fasted until 6 PM. Break the fast gently at 6 PM, swim, then a high-protein vegetarian dinner. Do not overload the stomach before the pool.',
  coachNote: 'Do not underfuel recovery. If the swim runs late, get 30g protein in within the hour after class.',
};

// day-type -> short human reason the diet differs that day
export const DAY_VARIANTS = {
  training: { label: 'Training day', tone: 'cyan', why: 'Highest carbs and calories to fuel lifting and refill glycogen.' },
  rest:     { label: 'Rest day', tone: 'violet', why: 'Lower carbs, protein held high to keep recovery and muscle up.' },
  fastThu:  { label: 'Fast plus swim', tone: 'amber', why: 'Fasted until 6 PM, then a gentle break and a high-protein veg dinner around the swim.' },
  vegSat:   { label: 'Vegetarian day', tone: 'green', why: 'No chicken or fish. Protein anchored on whey, paneer, tofu, dal and Greek yogurt.' },
};
