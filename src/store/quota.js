// ============================================================
// quota.js - knowing how much room there is, naming why a save failed, and
// getting data OUT of a device that can no longer hold it.
// ============================================================
import { toStoreError } from './idb.js';
import { buildBackup, backupFilename } from '../backup.js';

// navigator.storage.estimate(), guarded: absent in older browsers and some
// private modes. Never throws.
export async function estimateStorage(nav = globalThis.navigator) {
  try {
    if (!nav || !nav.storage || typeof nav.storage.estimate !== 'function') return { supported: false };
    const { usage = 0, quota = 0 } = await nav.storage.estimate();
    const persisted = typeof nav.storage.persisted === 'function' ? await nav.storage.persisted() : null;
    return {
      supported: true, usage, quota, persisted,
      free: Math.max(0, quota - usage),
      percent: quota > 0 ? Math.round((usage / quota) * 1000) / 10 : null,
    };
  } catch {
    return { supported: false };
  }
}

// Ask the browser not to evict this origin's data under storage pressure.
// iOS Safari may ignore it; the answer is reported either way.
export async function requestPersistence(nav = globalThis.navigator) {
  try {
    if (!nav || !nav.storage || typeof nav.storage.persist !== 'function') return { supported: false, persisted: false };
    return { supported: true, persisted: !!(await nav.storage.persist()) };
  } catch {
    return { supported: false, persisted: false };
  }
}

const MESSAGES = {
  quota: 'This device is out of storage space, so your latest changes are NOT saved. Export a backup now, then free up space.',
  unsupported: 'This browser cannot keep data in its database (private browsing?). Changes are held in memory only - export a backup.',
  unavailable: 'The browser refused access to its database. Changes are held in memory only - export a backup.',
  closed: 'The database connection was closed (another tab updated the app). Reload to continue; your latest changes are held in memory.',
  'version-newer': 'This data was written by a newer version of the app. Update the app before saving.',
  aborted: 'The save was interrupted and rolled back. Nothing was half-written; try again.',
  error: 'The save failed for an unknown reason. Export a backup and try again.',
};

// -> { reason, message, retryable, needsExport }
export function classifyFailure(error) {
  const reason = (error && error.reason) || toStoreError(error).reason;
  return {
    reason,
    message: MESSAGES[reason] || MESSAGES.error,
    retryable: reason === 'aborted' || reason === 'closed' || reason === 'error',
    needsExport: reason === 'quota' || reason === 'unsupported' || reason === 'unavailable',
  };
}

// Build a verified (schema 2) backup of whatever has not been saved. Accepts
// a store (uses getUnsaved(), falling back to `fallbackState`) or a state.
export async function exportUnsavedState(source, { fallbackState = null, now = new Date(), owner = null } = {}) {
  let state = null;
  if (source && typeof source.getUnsaved === 'function') state = source.getUnsaved() || fallbackState;
  else state = source || fallbackState;
  if (!state) return { ok: false, reason: 'nothing-to-export' };
  const backup = await buildBackup(state, { now, owner });
  return { ok: true, backup, text: JSON.stringify(backup, null, 2), filename: backupFilename(now) };
}

// Browser-only convenience: hand the export to the user as a file.
export async function downloadUnsavedState(source, options = {}) {
  const out = await exportUnsavedState(source, options);
  if (!out.ok) return out;
  const blob = new Blob([out.text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = out.filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return out;
}
