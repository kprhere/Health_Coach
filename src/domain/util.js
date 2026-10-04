// ============================================================
// domain/util.js - tiny helpers shared by every domain module.
// ============================================================
export const clone = (o) => JSON.parse(JSON.stringify(o));

// A value counts as entered once it holds something other than whitespace.
export const hasEnteredValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';
