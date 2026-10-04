// ============================================================
// profiles/krishna.js - Krishnaprasath's own baseline.
//
// This used to live in data.js as SEED_SCANS and PROFILE_DEFAULT, which meant
// every install started life carrying one real person's body. It is kept here
// instead: still recoverable, no longer an app default, and - because only the
// tests import it - no longer bundled into the JavaScript anyone else loads.
//
// A starter profile is one person's measured starting point plus the settings
// audited against it. Add a sibling file per person if anyone else wants a
// seeded baseline rather than starting from the setup screen.
// ============================================================

import { single, dropset, superset, circuit, finisher } from '../data.js';

export const KRISHNA = {
  id: 'krishna',
  label: 'Krishnaprasath - Fat Loss Phase 1',

  profile: {
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
  },

  // Targets audited against the scans below rather than against the device's
  // own guesses. The Evolt assumed activity factor 1.54 because it counted
  // badminton that was not happening; observed weight change over 07-08 to
  // 08-13 implies 1.374 for that schedule, and 1.44 is the reworked week
  // (4 lifts + 2 swims + 5 walks + BodyBalance). Protein is 1.45 g per lb of
  // lean mass, raised from 1.3 after 08-13 showed lean loss at the lower anchor.
  settings: {
    proteinTarget: 205,
    waterTargetL: 3.75,
    activityFactor: 1.44,
    programStartDate: '2026-07-14',
    restartPhaseStartDate: '2026-07-14',
    nextBodyScanDate: '2026-08-31',
    scanFrequencyDays: 14,
    phaseName: 'Fat Loss Phase 1',
    timezone: 'America/Chicago',
    puratasiStartDate: '2026-09-17',
    puratasiEndDate: '2026-10-17',
    scheduleTags: { swimDows: [2, 4], badmintonDows: [1, 2, 3, 4, 5], classDow: 6, fastDow: 4, vegDow: 6 },
    // Chicago Panchang amavasya dates; extend when the next annual list is published.
    noMoonDates: ['2026-08-12', '2026-09-10', '2026-10-10', '2026-11-08', '2026-12-08', '2027-01-07', '2027-02-06', '2027-03-07', '2027-04-06'],
    d3Dose: '2000 IU', magElementalMg: '200 mg', biotinDose: '50,000 mcg',
  },

  // Evolt 360 result sheets, oldest first.
  scans: [
    { id: 'seed-2025-10-29', date: '2025-10-29', weight: 182.3, bodyFatPct: 23.1, fatMass: 42.1, leanMass: 140.2, skeletalMuscle: 77.8, protein: 28.7, mineral: 10.6, bodyWater: 101.0, subcutFat: 36.6, visceralFatLevel: 8, visceralFatArea: 76, waist: 36.1, waistHip: 0.82, bmr: 1743, tee: 2684, bioAge: 35, bwi: 7.2 },
    { id: 'seed-2026-04-20', date: '2026-04-20', weight: 189.4, bodyFatPct: 24.8, fatMass: 47.0, leanMass: 142.4, skeletalMuscle: 78.9, protein: 28.9, mineral: 11.0, bodyWater: 102.5, subcutFat: 40.6, visceralFatLevel: 9, visceralFatArea: 80, waist: 37.3, waistHip: 0.83, bmr: 1765, tee: 2718, bioAge: 36, bwi: 6.9 },
    { id: 'seed-2026-07-08', date: '2026-07-08', weight: 191.1, bodyFatPct: 24.3, fatMass: 46.5, leanMass: 144.6, skeletalMuscle: 80.2, protein: 29.5, mineral: 10.8, bodyWater: 104.3, subcutFat: 40.1, visceralFatLevel: 9, visceralFatArea: 78, waist: 37.2, waistHip: 0.83, bmr: 1786, tee: 2750, bioAge: 36, bwi: 6.9 },
    { id: 'seed-2026-08-13', date: '2026-08-13', weight: 187.8, bodyFatPct: 24.0, fatMass: 45.0, leanMass: 142.9, skeletalMuscle: 79.1, protein: 29.1, mineral: 11.0, bodyWater: 102.7, subcutFat: 38.8, visceralFatLevel: 9, visceralFatArea: 77, waist: 36.8, waistHip: 0.83, bmr: 1769, tee: 2724, bioAge: 35, bwi: 7.2 },
  ],
};


// ---------- Krishnaprasath's routine ----------
// The 4-day Upper/Lower hybrid built around this specific gym (Hammer
// Strength and Life Fitness plate-loaded machines), two swim days and a
// Saturday BodyBalance class. It used to be the app's PROGRAM constant,
// which meant everyone trained this split whether it suited them or not.
KRISHNA.program = {
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
      conditioning: [{ name: 'Incline Walk', detail: '20 min zone 2 after lifting, incline 8-12%. Skip only if badminton actually happened.' }],
      mobility: [],
      sport: [{ name: 'Badminton', detail: 'Bonus, not required. 5:30-7:00 AM. If played it REPLACES today\'s walk: lift after and add electrolytes + 30-50g carbs.' }],
      notes: 'First hard upper session. Quality reps over load. Direct biceps and triceps included. Log everything so next targets auto-calc. The walk is part of the plan, not an extra.',
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
      conditioning: [
        { name: 'Incline Walk', detail: '20 min zone 2, incline 8-12%. Do this first as the warm-up for the intervals.' },
        { name: 'Bike', detail: 'Intervals: 8 x (1 min hard / 1 min easy), ~16 min. The only hard cardio of the week. Bike, not sprints — no impact, no next-day soreness, so it will not touch Sunday legs. This is the one session to cut first if sleep or recovery slips.' },
      ],
      mobility: [
        { name: 'Hip Flexor Stretch', detail: '2 x 30s per side' },
        { name: 'Thoracic Rotation', detail: '2 x 8 per side' },
        { name: 'Foam Rolling', detail: 'Quads, back, calves' },
      ],
      sport: [{ name: 'Badminton', detail: 'Bonus, not required. If played, shorten the walk to 15 min so this stays a recovery day.' }],
      notes: 'No lifting today, which is exactly why the week\'s one hard cardio session sits here — Thursday is a fast and swim, so there are two easy days before Sunday legs. Everything else stays deliberately easy: keep steps and water up.',
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
        single('Chest-Assisted Dip', 3, 10, 12, 8, 90, '3-1-1', 'Lower-chest machine press. Keep 2 reps in reserve and use a pain-free depth'),
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
      conditioning: [{ name: 'Incline Walk', detail: '20 min zone 2 after lifting, incline 8-12%. Skip only if badminton actually happened.' }],
      mobility: [],
      sport: [{ name: 'Badminton', detail: 'Bonus, not required. If played it REPLACES today\'s walk: lift after and refuel.' }],
      notes: 'Pump-focused with direct arms. Controlled tempo, add reps before adding weight. Finish with the walk.',
    },
    6: {
      key: 'saturday', title: 'BodyBalance', focus: 'Mobility Class', dayType: 'vegSat', intensity: 'Light', isClassDay: true,
      blocks: [],
      conditioning: [{ name: 'Incline Walk', detail: '25 min zone 2. Do it whether or not BodyBalance happens — the class is mobility, not conditioning.' }],
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
      conditioning: [{ name: 'Incline Walk', detail: '15 min easy, low incline. Short on purpose — legs were just worked.' }],
      mobility: [],
      sport: [],
      notes: 'Last hard session of the week. If performance has stalled two weeks running, take an easy deload next week. Progressive overload is what protects muscle in a deficit, so beat last week on something: reps, load or a cleaner tempo.',
    },
  },
};

KRISHNA.program.rationale =
  'Chosen split: 4-day Upper / Lower hybrid around swimming and one mobility class. ' +
  'After a 40-day layoff and while eating in a fat-loss deficit, recovery is the limiter, so a 6-day PPL is too much. ' +
  'Upper / Lower hits every muscle about 2x per week at moderate volume, which is the sweet spot for holding muscle while losing fat. ' +
  'Conditioning is now SCHEDULED, not assumed: five zone 2 walks (20 min after Mon and Fri lifts, 20 min Wed, 25 min Sat, 15 min Sun) plus the Tuesday and Thursday swims. ' +
  'Wednesday also carries the single hard cardio session of the week, 8 x 1 min bike intervals. It is there because Wednesday has no lifting and Thursday is a fast plus easy swim, so it costs the least recovery, and because zone 2 walking alone does not move VO2 max — which this app tracks but nothing else addresses. Bike over sprints keeps it non-impact. Cut this first if recovery slips. ' +
  'The earlier version leaned on optional morning badminton to cover conditioning. That badminton never happened, so the real activity level came in far below what the Evolt scan assumed and the plan quietly stopped working. ' +
  'Badminton is still welcome as a bonus and simply replaces that day\'s walk when it happens, but nothing in the plan depends on it any more. ' +
  'Thursday stays a true recovery day (fast + no heavy lifting + swim). Saturday is the BodyBalance mobility slot with a lifting fallback.';

// The fat-loss phase this routine belongs to, and the date it started.
KRISHNA.phase = { name: 'Fat Loss Phase 1', startDate: '2026-07-08' };

export const STARTER_PROFILES = [KRISHNA];
