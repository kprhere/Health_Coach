// ============================================================
// flags.js - unfinished or optional features stay behind a flag until they work
// end to end. A flag is OFF unless this file or the person's settings say so.
// A placeholder screen must say plainly that the feature is not enabled; it
// never fakes a result (no simulated login, no invented scan values, no canned
// coaching text).
// ============================================================
export const FLAGS = {
  accounts: false,        // Supabase login + cloud sync (needs a project; see docs/SETUP_SUPABASE.md)
  scanUpload: false,      // PDF/image scan import with review screen
  planUpload: false,      // CSV/JSON/PDF plan import with review screen
  adaptiveCoach: false,   // proposals, overrides, undo
  planSetup: false,       // onboarding questionnaire + generated plan
  aiExplanations: false,  // optional model-written explanations (also needs per-user opt-in)
};

export const flagOn = (name, state) => {
  const own = state && state.settings && state.settings.flags;
  if (own && Object.prototype.hasOwnProperty.call(own, name)) return own[name] === true;
  return FLAGS[name] === true;
};
