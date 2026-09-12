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
  },

  // Evolt 360 result sheets, oldest first.
  scans: [
    { id: 'seed-2025-10-29', date: '2025-10-29', weight: 182.3, bodyFatPct: 23.1, fatMass: 42.1, leanMass: 140.2, skeletalMuscle: 77.8, protein: 28.7, mineral: 10.6, bodyWater: 101.0, subcutFat: 36.6, visceralFatLevel: 8, visceralFatArea: 76, waist: 36.1, waistHip: 0.82, bmr: 1743, tee: 2684, bioAge: 35, bwi: 7.2 },
    { id: 'seed-2026-04-20', date: '2026-04-20', weight: 189.4, bodyFatPct: 24.8, fatMass: 47.0, leanMass: 142.4, skeletalMuscle: 78.9, protein: 28.9, mineral: 11.0, bodyWater: 102.5, subcutFat: 40.6, visceralFatLevel: 9, visceralFatArea: 80, waist: 37.3, waistHip: 0.83, bmr: 1765, tee: 2718, bioAge: 36, bwi: 6.9 },
    { id: 'seed-2026-07-08', date: '2026-07-08', weight: 191.1, bodyFatPct: 24.3, fatMass: 46.5, leanMass: 144.6, skeletalMuscle: 80.2, protein: 29.5, mineral: 10.8, bodyWater: 104.3, subcutFat: 40.1, visceralFatLevel: 9, visceralFatArea: 78, waist: 37.2, waistHip: 0.83, bmr: 1786, tee: 2750, bioAge: 36, bwi: 6.9 },
    { id: 'seed-2026-08-13', date: '2026-08-13', weight: 187.8, bodyFatPct: 24.0, fatMass: 45.0, leanMass: 142.9, skeletalMuscle: 79.1, protein: 29.1, mineral: 11.0, bodyWater: 102.7, subcutFat: 38.8, visceralFatLevel: 9, visceralFatArea: 77, waist: 36.8, waistHip: 0.83, bmr: 1769, tee: 2724, bioAge: 35, bwi: 7.2 },
  ],
};

export const STARTER_PROFILES = [KRISHNA];
