// ============================================================
// storage.js - the part of the app whose only job is that nobody's scans or
// workout history ever go missing.
//
// Three things destroy logs in a browser app, and all three used to be silent:
//
//   1. a write fails (quota, private mode, storage disabled) and the app keeps
//      running on in-memory state that looks perfectly healthy until the tab
//      closes
//   2. the stored JSON comes back unreadable, the app starts fresh, and the
//      next save overwrites the only copy that existed
//   3. someone resets, imports a file, or hits a migration bug, and there is
//      nothing to go back to
//
// So: every write is verified by reading it back, the previous good copy is
// always retained, anything unreadable is quarantined rather than discarded,
// and any operation that would reduce the number of scans or logged workouts
// takes a snapshot first.
//
// Deliberately dependency-free. helpers.js owns migrateState and imports this;
// importing helpers back would make that a cycle.
// ============================================================
import { STORAGE_KEY } from './data.js';

export const BACKUP_KEY = `${STORAGE_KEY}.backup`;
export const QUARANTINE_KEY = `${STORAGE_KEY}.unreadable`;
export const SNAPSHOT_PREFIX = `${STORAGE_KEY}.snapshot.`;

// Enough to undo a bad reset or import without eating the storage budget.
export const MAX_SNAPSHOTS = 5;

const store = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null; // Safari in lockdown throws on the property access itself
  }
};

// ---------- what counts as "history" ----------
// These are the irreplaceable records. Settings and profile can be retyped in
// a minute; a year of logged sets cannot.
export function recordCounts(state) {
  const s = state || {};
  const countDates = (map) => Object.keys(map && typeof map === 'object' ? map : {}).length;
  return {
    scans: Array.isArray(s.bodyScans) ? s.bodyScans.length : 0,
    workouts: countDates(s.workoutSessions),
    meals: countDates(s.mealLogs),
    habits: countDates(s.habitLogs),
    watch: countDates(s.watchLogs),
    supplements: countDates(s.supplementLogs),
    exerciseNotes: countDates(s.exerciseNotes),
    customExercises: countDates(s.customExercises),
  };
}

// Which record types shrank, and by how much. Empty means nothing was lost.
export function describeLoss(before, after) {
  const a = recordCounts(before);
  const b = recordCounts(after);
  return Object.keys(a)
    .filter((kind) => b[kind] < a[kind])
    .map((kind) => ({ kind, before: a[kind], after: b[kind], lost: a[kind] - b[kind] }));
}

export const summariseLoss = (loss) =>
  loss.map(({ kind, lost, before }) => `${lost} of ${before} ${kind}`).join(', ');

// ---------- raw access ----------
export function readRaw(key = STORAGE_KEY) {
  const ls = store();
  if (!ls) return null;
  try { return ls.getItem(key); } catch { return null; }
}

function writeRaw(key, value) {
  const ls = store();
  if (!ls) return { ok: false, reason: 'unavailable' };
  try {
    ls.setItem(key, value);
    // Verify by reading back. A quota failure can throw, but a truncated or
    // silently-dropped write does not, and that is the case that loses data.
    if (ls.getItem(key) !== value) return { ok: false, reason: 'verify-failed' };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error && error.name === 'QuotaExceededError' ? 'quota' : 'error', error };
  }
}

function removeRaw(key) {
  const ls = store();
  if (!ls) return;
  try { ls.removeItem(key); } catch { /* nothing useful to do */ }
}

// ---------- snapshots ----------
export function listSnapshots() {
  const ls = store();
  if (!ls) return [];
  const out = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key || !key.startsWith(SNAPSHOT_PREFIX)) continue;
      try {
        const parsed = JSON.parse(ls.getItem(key));
        if (parsed && parsed.state) {
          out.push({ key, reason: parsed.reason || 'unknown', at: parsed.at || 0, counts: recordCounts(parsed.state) });
        }
      } catch { /* a corrupt snapshot is not worth failing the list for */ }
    }
  } catch { return []; }
  // Same-millisecond snapshots tie on `at`, so fall back to the key (which
  // carries the sequence) to keep newest-first ordering stable.
  return out.sort((a, b) => b.at - a.at || b.key.localeCompare(a.key, undefined, { numeric: true }));
}

function pruneSnapshots(limit = MAX_SNAPSHOTS) {
  listSnapshots().slice(limit).forEach((snap) => removeRaw(snap.key));
}

// Keep a labelled copy of `state` so it can be restored later. Returns the key,
// or null when storage is unavailable or too full - a snapshot must never be
// the reason a save fails.
// A counter, because two snapshots inside the same millisecond would otherwise
// share a key and the second would silently overwrite the first - exactly when
// several destructive steps run back to back.
let snapshotSeq = 0;

export function snapshot(reason, state) {
  if (!state) return null;
  const at = Date.now();
  snapshotSeq += 1;
  const key = `${SNAPSHOT_PREFIX}${at}-${snapshotSeq}`;
  const payload = JSON.stringify({ reason, at, state });
  const res = writeRaw(key, payload);
  if (!res.ok) {
    // Out of room: drop the oldest snapshot and try once more.
    const existing = listSnapshots();
    if (existing.length) {
      removeRaw(existing[existing.length - 1].key);
      if (writeRaw(key, payload).ok) { pruneSnapshots(); return key; }
    }
    return null;
  }
  pruneSnapshots();
  return key;
}

export function readSnapshot(key) {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.state ? parsed : null;
  } catch { return null; }
}

export function deleteSnapshot(key) {
  if (key && key.startsWith(SNAPSHOT_PREFIX)) removeRaw(key);
}

// ---------- load ----------
// Never discards anything it cannot read. An unreadable blob is moved aside so
// it can still be recovered by hand, and the last good copy is tried next.
export function readStoredState() {
  const raw = readRaw(STORAGE_KEY);
  if (!raw) {
    const backup = readRaw(BACKUP_KEY);
    if (!backup) return { state: null, source: 'empty' };
    try { return { state: JSON.parse(backup), source: 'backup' }; }
    catch { return { state: null, source: 'empty' }; }
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return { state: parsed, source: 'primary' };
    throw new Error('stored value is not an object');
  } catch (error) {
    // Preserve the unreadable bytes BEFORE anything else can overwrite them.
    writeRaw(QUARANTINE_KEY, raw);
    const backup = readRaw(BACKUP_KEY);
    if (backup) {
      try {
        const parsed = JSON.parse(backup);
        if (parsed && typeof parsed === 'object') {
          return { state: parsed, source: 'backup', recovered: true, error: String(error && error.message) };
        }
      } catch { /* fall through */ }
    }
    return { state: null, source: 'unreadable', quarantined: true, error: String(error && error.message) };
  }
}

export const hasQuarantined = () => !!readRaw(QUARANTINE_KEY);
export const clearQuarantined = () => removeRaw(QUARANTINE_KEY);

// ---------- save ----------
// Returns { ok, reason?, loss? }. The caller is expected to SHOW a failure:
// a save that quietly does nothing is how a day of logging disappears.
export function writeStoredState(state) {
  const serialised = JSON.stringify(state);
  const previousRaw = readRaw(STORAGE_KEY);

  let loss = [];
  if (previousRaw) {
    try {
      const previous = JSON.parse(previousRaw);
      loss = describeLoss(previous, state);
      // Anything that reduces the record count gets the old copy preserved
      // first, whether it is a bad merge, a bad migration or a misclick.
      if (loss.length) snapshot('records-removed', previous);
    } catch { /* unreadable previous value is handled on the next load */ }
  }

  const res = writeRaw(STORAGE_KEY, serialised);
  if (!res.ok) {
    // Make room by dropping snapshots oldest-first, then retry once. Live data
    // matters more than the safety net protecting it.
    const snaps = listSnapshots();
    if (snaps.length) {
      snaps.reverse().forEach((snap) => removeRaw(snap.key));
      const retry = writeRaw(STORAGE_KEY, serialised);
      if (retry.ok) return { ok: true, loss, freedSnapshots: snaps.length };
    }
    // A partial write leaves broken bytes where the good copy was, and the next
    // successful save would then adopt those as its backup. Put the last good
    // copy back so what is on disk stays readable.
    if (previousRaw && readRaw(STORAGE_KEY) !== previousRaw) writeRaw(STORAGE_KEY, previousRaw);
    return { ok: false, reason: res.reason, error: res.error, loss };
  }

  // Only once the primary write is known good does the backup advance, so the
  // backup can never be a copy of something that failed to store.
  if (previousRaw && previousRaw !== serialised) writeRaw(BACKUP_KEY, previousRaw);
  return { ok: true, loss };
}
