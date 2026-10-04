// ============================================================
// coach/constants.js - versioning and tunable thresholds for the
// deterministic coaching engine.
//
// Every number below is a HEURISTIC chosen to be conservative. None of them
// is a validated injury or overtraining predictor, and the engine never
// diagnoses. Anything here can be overridden per person through
// state.coach.settings.config.
// ============================================================

// Bump when a rule's behaviour changes so old proposals/audit rows stay
// attributable to the rules that produced them.
export const RULE_VERSION = 'coach-rules-1';

// Trailing windows (in days, ending on and including the as-of date).
export const WINDOWS = [3, 7, 14, 28];

export const DEFAULT_CONFIG = {
  painBlockLevel: 3,        // 0-10 pain on a set at/above this counts as an exposure
  painRepeatCount: 2,       // exposures (in 14d) before the rule acts
  sleepLowH: 6,             // 7-day average sleep below this is "low"
  rhrElevatedBpm: 7,        // recent resting HR above personal baseline by this much
  minRhrBaselineDays: 7,    // baseline needs at least this many RHR values
  minHrvBaselineDays: 14,   // HRV is ignored without this many baseline values
  loadSpikeRatio: 1.5,      // 7d sets vs average weekly sets of the prior 21d
  restartGapDays: 14,       // days since last workout that trigger a restart
  maxReductionPct: 25,      // largest set reduction a manual proposal may carry
  autoMaxReductionPct: 20,  // same cap when mode is 'auto'
  cooldownDays: 3,          // min days between applied changes to the same date range
  maxAppliedPer7Days: 3,    // applied proposals allowed in any 7 days
};

// The only ops that exist. Everything (rules, proposals, overrides) shares it.
export const OPS = ['scale-sets', 'drop-block', 'substitute', 'move', 'recovery-day', 'increase'];

// Ops allowed without a person accepting each one. Increases and moves are
// never automatic.
export const AUTO_OPS = ['scale-sets', 'drop-block', 'substitute', 'recovery-day'];

export const KINDS = ['reduce', 'substitute', 'move', 'recovery', 'increase', 'restart', 'question', 'info'];

export const CLINICIAN_NOTE = 'persistent or concerning pain: consider evaluation by a qualified clinician';

export const mergeConfig = (...parts) => Object.assign({}, DEFAULT_CONFIG, ...parts.filter(Boolean));
