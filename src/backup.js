// ============================================================
// backup.js - the export file format, and reading one back safely.
//
// A backup is only worth having if it can be trusted on the day it is needed.
// So the file says what it contains (record counts), which state version wrote
// it, and carries a SHA-256 of the state. Reading it back checks all three
// before anything touches the device, and reports exactly what a merge or a
// replace would do so the choice is made with the numbers in view.
//
// Plain exports from before this format (the bare state object) still import.
// They simply cannot be integrity-checked, and the preview says so.
// ============================================================
import { recordCounts, describeLoss } from './storage.js';

export const BACKUP_FORMAT = 'recomp-os-backup';
export const BACKUP_SCHEMA = 2;

const STATE_KEYS = ['profile', 'settings', 'workoutSessions', 'mealLogs', 'bodyScans', 'watchLogs'];

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// JSON.parse followed by JSON.stringify preserves key order, so hashing the
// compact serialisation is stable across an export -> import round trip.
export const stateDigest = (state) => sha256Hex(JSON.stringify(state));

export async function buildBackup(state, { now = new Date(), owner = null } = {}) {
  return {
    format: BACKUP_FORMAT,
    schema: BACKUP_SCHEMA,
    stateVersion: Number.isInteger(state && state.version) ? state.version : 1,
    exportedAt: now.toISOString(),
    owner, // { id, label } of the account this came from, or null for a local-only device
    counts: recordCounts(state),
    sha256: await stateDigest(state),
    state,
  };
}

export const backupFilename = (now = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `recomp-os-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
};

const looksLikeState = (obj) => !!obj && typeof obj === 'object' && !Array.isArray(obj)
  && STATE_KEYS.some((k) => k in obj);

// Returns { ok:true, state, kind, verified, counts, exportedAt, stateVersion, owner }
// or { ok:false, code, error }. Never throws, never returns a partial state.
export async function parseBackup(text, { maxStateVersion = Infinity } = {}) {
  let obj;
  try { obj = JSON.parse(text); } catch {
    return { ok: false, code: 'not-json', error: 'That file is not valid JSON. It may be truncated or not a backup at all.' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, code: 'not-backup', error: 'That file does not look like a Recomp OS backup.' };
  }

  if (obj.format === BACKUP_FORMAT) {
    if (!Number.isInteger(obj.schema) || obj.schema > BACKUP_SCHEMA) {
      return { ok: false, code: 'newer-format', error: 'This backup was written by a newer version of the app. Update the app, then import it.' };
    }
    if (!looksLikeState(obj.state)) {
      return { ok: false, code: 'no-state', error: 'The backup has no readable data inside it.' };
    }
    const digest = await stateDigest(obj.state);
    if (typeof obj.sha256 !== 'string' || digest !== obj.sha256) {
      return { ok: false, code: 'checksum', error: 'The backup failed its integrity check: the contents do not match the checksum written at export. Nothing was imported.' };
    }
    const counts = recordCounts(obj.state);
    const stated = obj.counts || {};
    const mismatch = Object.keys(counts).find((k) => stated[k] !== undefined && stated[k] !== counts[k]);
    if (mismatch) {
      return { ok: false, code: 'counts', error: `The backup says it holds ${stated[mismatch]} ${mismatch} but ${counts[mismatch]} were found. Nothing was imported.` };
    }
    const stateVersion = Number.isInteger(obj.state.version) ? obj.state.version : 1;
    if (stateVersion > maxStateVersion) {
      return { ok: false, code: 'newer-state', error: 'This backup holds data from a newer version of the app. Update the app, then import it.' };
    }
    return {
      ok: true, kind: 'v2', verified: true, state: obj.state, counts,
      exportedAt: obj.exportedAt || null, stateVersion, owner: obj.owner || null,
    };
  }

  if (looksLikeState(obj)) {
    const stateVersion = Number.isInteger(obj.version) ? obj.version : 1;
    if (stateVersion > maxStateVersion) {
      return { ok: false, code: 'newer-state', error: 'This backup holds data from a newer version of the app. Update the app, then import it.' };
    }
    return {
      ok: true, kind: 'legacy', verified: false, state: obj, counts: recordCounts(obj),
      exportedAt: null, stateVersion, owner: null,
    };
  }
  return { ok: false, code: 'not-backup', error: 'That file does not look like a Recomp OS backup.' };
}

// What each import mode would do to this device, in record counts.
//   merge   - additive: nothing on the device is removed (see mergeSyncedState)
//   replace - the device ends up holding exactly the file; `loss` is what goes
export function importPreview(current, incoming, merged) {
  return {
    device: recordCounts(current),
    file: recordCounts(incoming),
    afterMerge: recordCounts(merged),
    replaceLoss: describeLoss(current, incoming),
  };
}
