// ============================================================
// effective.js - the plan a person actually trains on a date.
//
// Precedence, lowest to highest (documented in docs/COACHING.md):
//   base program < workout swap < manual edits / unplanned entries
//   < accepted adaptive override
// resolveWorkout() yields base + swap. Overrides are layered on top here so the
// coach can keep reasoning about the base plan without stacking its own edits.
// A date whose session already holds data is never altered.
// ============================================================
import { resolveWorkout } from '../helpers.js';
import { applyOverrides } from './overrides.js';

export const effectiveWorkout = (key, state) => applyOverrides(resolveWorkout(key, state), key, state);
