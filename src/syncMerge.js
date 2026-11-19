// Field-level sync merge.
//
// Every tracked piece of state (one habit tick, one setting, one logged
// exercise, one meal day, one body scan, one program day) carries the time it
// last changed in state._stamps, and a deletion leaves a time in
// state._deleted. When two devices meet, each piece goes to whichever device
// touched it last, and something deleted stays deleted instead of coming back
// from the other device's copy.
//
// Data written before this existed has no stamps; for it the older merge
// rules in helpers.mergeSyncedState still decide (this device wins, logs are
// additive). Stamps and tombstones older than KEEP_DAYS are dropped to keep
// the saved state small; such pieces simply fall back to those older rules.

export const KEEP_DAYS = 120;
const DAY_MS = 86400000;

// Device-local settings never sync.
const LOCAL_ONLY_SETTINGS = new Set(['syncUrl', 'syncAuto']);
const PER_FIELD_BY_DATE = ['habitLogs', 'watchLogs', 'supplementLogs', 'activity', 'beverageLogs'];
const PER_KEY = ['mealLogs', 'saturdayMode', 'dayOverrides', 'workoutSwaps', 'restartWeights', 'customExercises', 'exerciseNotes', 'missedDismissed'];
export const TRACKED_KEYS = ['settings', 'profile', 'program', 'workoutSessions', 'bodyScans', ...PER_FIELD_BY_DATE, ...PER_KEY];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const key = (segs) => JSON.stringify(segs);
const enc = (v) => JSON.stringify(v === undefined ? null : v);

// Leaves of one top-level part of state, as Map(pathKey -> JSON value).
function leavesOf(top, value, out) {
  if (value === undefined || value === null) return out;
  if (top === 'settings' || top === 'profile') {
    if (isObj(value)) Object.entries(value).forEach(([k, v]) => { if (!(top === 'settings' && LOCAL_ONLY_SETTINGS.has(k))) out.set(key([top, k]), enc(v)); });
  } else if (PER_FIELD_BY_DATE.includes(top)) {
    if (isObj(value)) Object.entries(value).forEach(([date, day]) => {
      if (isObj(day)) Object.entries(day).forEach(([f, v]) => out.set(key([top, date, f]), enc(v)));
    });
  } else if (PER_KEY.includes(top)) {
    if (isObj(value)) Object.entries(value).forEach(([k, v]) => out.set(key([top, k]), enc(v)));
  } else if (top === 'workoutSessions') {
    if (isObj(value)) Object.entries(value).forEach(([date, sess]) => {
      if (!isObj(sess)) return;
      Object.entries(sess).forEach(([f, v]) => {
        if (f === 'entries' && isObj(v)) Object.entries(v).forEach(([id, entry]) => out.set(key([top, date, 'entries', id]), enc(entry)));
        else if (f !== 'entries') out.set(key([top, date, f]), enc(v));
      });
    });
  } else if (top === 'bodyScans') {
    if (Array.isArray(value)) value.forEach((scan) => { if (scan && scan.id) out.set(key([top, scan.id]), enc(scan)); });
  } else if (top === 'program') {
    if (isObj(value)) Object.entries(value).forEach(([k, v]) => {
      if (k === 'days' && isObj(v)) Object.entries(v).forEach(([dow, day]) => out.set(key([top, 'days', dow]), enc(day)));
      else if (k !== 'days') out.set(key([top, k]), enc(v));
    });
  }
  return out;
}

export function flattenTracked(state, only = TRACKED_KEYS) {
  const out = new Map();
  if (!state) return out;
  only.forEach((top) => leavesOf(top, state[top], out));
  return out;
}

function pruneOld(map, now) {
  const cutoff = now - KEEP_DAYS * DAY_MS;
  const out = {};
  Object.entries(map || {}).forEach(([p, t]) => { if (t >= cutoff) out[p] = t; });
  return out;
}

// Called after every local change. Stamps what changed and records deletions.
// Returns `next` unchanged (same object) when nothing tracked changed, so the
// caller can tell whether a second save is needed. A state produced by a sync
// merge (new _mergedAt) is not re-stamped: its stamps came from the merge.
export function stampChanges(prev, next, now = Date.now()) {
  if (!prev || !next || prev === next) return next;
  if ((next._mergedAt || 0) !== (prev._mergedAt || 0)) return next;
  const changedTops = TRACKED_KEYS.filter((top) => prev[top] !== next[top]);
  if (!changedTops.length) return next;
  const before = flattenTracked(prev, changedTops);
  const after = flattenTracked(next, changedTops);
  const stamps = { ...(next._stamps || {}) };
  const deleted = { ...(next._deleted || {}) };
  let touched = false;
  after.forEach((v, p) => {
    if (before.get(p) !== v) { stamps[p] = now; delete deleted[p]; touched = true; }
  });
  before.forEach((_, p) => {
    if (!after.has(p)) { deleted[p] = now; delete stamps[p]; touched = true; }
  });
  if (!touched) return next;
  return { ...next, _stamps: pruneOld(stamps, now), _deleted: pruneOld(deleted, now) };
}

function setLeaf(state, segs, value) {
  const [top] = segs;
  if (top === 'bodyScans') {
    const list = Array.isArray(state.bodyScans) ? state.bodyScans.slice() : [];
    const i = list.findIndex((s) => s && s.id === segs[1]);
    if (i >= 0) list[i] = value; else list.push(value);
    state.bodyScans = list;
    return;
  }
  let node = state;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    node[s] = isObj(node[s]) ? { ...node[s] } : {};
    node = node[s];
  }
  node[segs[segs.length - 1]] = value;
}

function deleteLeaf(state, segs) {
  const [top] = segs;
  if (top === 'bodyScans') {
    if (Array.isArray(state.bodyScans)) state.bodyScans = state.bodyScans.filter((s) => !(s && s.id === segs[1]));
    return;
  }
  const trail = [state];
  let node = state;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!isObj(node[s])) return;
    node[s] = { ...node[s] };
    node = node[s];
    trail.push(node);
  }
  delete node[segs[segs.length - 1]];
  // Drop containers the deletion left empty (a habit day with no ticks, a
  // workout session with no fields left), but never a top-level part.
  for (let i = segs.length - 2; i >= 1; i--) {
    const parent = trail[i];
    const child = parent[segs[i]];
    const emptyEntriesOnly = isObj(child) && Object.keys(child).every((k) => k === 'entries' && isObj(child.entries) && !Object.keys(child.entries).length);
    if (isObj(child) && (Object.keys(child).length === 0 || (segs[0] === 'workoutSessions' && i === 1 && emptyEntriesOnly))) delete parent[segs[i]];
    else break;
  }
}

// Apply stamp-decided winners on top of the older merge result `out`.
export function applyStampedMerge(out, local, remote, now = Date.now()) {
  const ls = (local && local._stamps) || {};
  const ld = (local && local._deleted) || {};
  const rs = (remote && remote._stamps) || {};
  const rd = (remote && remote._deleted) || {};
  if (!Object.keys(ls).length && !Object.keys(ld).length && !Object.keys(rs).length && !Object.keys(rd).length) return out;
  const L = flattenTracked(local);
  const R = flattenTracked(remote);
  const paths = new Set([...L.keys(), ...R.keys(), ...Object.keys(ls), ...Object.keys(ld), ...Object.keys(rs), ...Object.keys(rd)]);
  const merged = { ...out };
  TRACKED_KEYS.forEach((top) => {
    if (Array.isArray(merged[top])) merged[top] = merged[top].slice();
    else if (isObj(merged[top])) merged[top] = { ...merged[top] };
  });
  // Shallow-copied tops are mutated below; deeper levels are copied on write.
  paths.forEach((p) => {
    let segs;
    try { segs = JSON.parse(p); } catch { return; }
    if (!Array.isArray(segs) || !TRACKED_KEYS.includes(segs[0])) return;
    const lS = ls[p] || 0, lD = ld[p] || 0, rS = rs[p] || 0, rD = rd[p] || 0;
    const lt = Math.max(lS, lD), rt = Math.max(rS, rD);
    if (lt === rt) return; // both unstamped, or a true tie: keep the older merge's answer
    const [winnerDeleted, winnerValue] = rt > lt
      ? [rD > rS, R.get(p)]
      : [lD > lS, L.get(p)];
    if (winnerDeleted) deleteLeaf(merged, segs);
    else if (winnerValue !== undefined) setLeaf(merged, segs, JSON.parse(winnerValue));
  });
  const maxMap = (a, b) => {
    const m = { ...a };
    Object.entries(b).forEach(([p, t]) => { if (!(m[p] >= t)) m[p] = t; });
    return m;
  };
  merged._stamps = pruneOld(maxMap(ls, rs), now);
  merged._deleted = pruneOld(maxMap(ld, rd), now);
  // A stamp older than its own tombstone is stale: the piece is deleted.
  Object.keys(merged._deleted).forEach((p) => { if ((merged._stamps[p] || 0) <= merged._deleted[p]) delete merged._stamps[p]; });
  Object.keys(merged._stamps).forEach((p) => { if ((merged._deleted[p] || 0) < merged._stamps[p]) delete merged._deleted[p]; });
  return merged;
}
