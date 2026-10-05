// ============================================================
// activeAccount.js - which account this browser is using, and the helpers that
// keep every piece of local data scoped to it.
//
// The active id is a plain pointer in localStorage. It is NOT a secret and it
// grants nothing: the IndexedDB database `recomp-<id>` is only ever opened by a
// store built for that id, and a database stamped for another account refuses
// to open (see store/idb.js). Changing the pointer never moves or merges data.
// ============================================================
import { sanitizeAccountId } from '../store/idb.js';

export const ACTIVE_ACCOUNT_KEY = 'recomp-active-account';
export const LOCAL_ACCOUNT = 'local';

const defaultStorage = () => {
  try { return globalThis.localStorage || null; } catch { return null; }
};

// 'local' unless a valid id was stored. A corrupt or hand-edited value falls
// back to the local account rather than guessing at another person's id.
export function getActiveAccountId(storage = defaultStorage()) {
  if (!storage) return LOCAL_ACCOUNT;
  try {
    const raw = storage.getItem(ACTIVE_ACCOUNT_KEY);
    if (raw === null || raw === undefined || raw === '') return LOCAL_ACCOUNT;
    return sanitizeAccountId(raw);
  } catch {
    return LOCAL_ACCOUNT;
  }
}

// Throws on an invalid id (same rule as the store). Returns { ok, accountId };
// ok is false when the browser would not persist the pointer.
export function setActiveAccountId(accountId, storage = defaultStorage()) {
  const id = sanitizeAccountId(accountId);
  if (!storage) return { ok: false, accountId: id, reason: 'unavailable' };
  try {
    storage.setItem(ACTIVE_ACCOUNT_KEY, id);
    if (storage.getItem(ACTIVE_ACCOUNT_KEY) !== id) return { ok: false, accountId: id, reason: 'verify-failed' };
    return { ok: true, accountId: id };
  } catch (error) {
    return { ok: false, accountId: id, reason: 'error', error };
  }
}

export const isLocalAccount = (accountId) => sanitizeAccountId(accountId) === LOCAL_ACCOUNT;

// Any browser-side cache, queue or preference that belongs to a person must be
// keyed through this, so account A's entry can never be read as account B's.
export const accountStorageKey = (accountId, name) => {
  if (typeof name !== 'string' || !name) throw new Error('storage key name is required');
  return `recomp:${sanitizeAccountId(accountId)}:${name}`;
};

// Drops every in-memory reference to a session: engine stopped, client and
// session released, optional extra clearers run. Persisted data (IndexedDB,
// the unsynced queue) is NOT touched. `holder` is any object with some of
// { engine, client, session, unsubs[], clearers[] }; its fields are nulled.
// Always resolves, even if a clearer throws.
export async function clearSensitiveMemory(holder) {
  if (!holder || typeof holder !== 'object') return;
  const run = async (fn) => { try { await fn(); } catch { /* clearing must never fail the caller */ } };
  if (holder.engine && typeof holder.engine.stop === 'function') await run(() => holder.engine.stop());
  for (const fn of holder.unsubs || []) if (typeof fn === 'function') await run(fn);
  for (const fn of holder.clearers || []) if (typeof fn === 'function') await run(fn);
  if ('engine' in holder) holder.engine = null;
  if ('client' in holder) holder.client = null;
  if ('session' in holder) holder.session = null;
  if ('unsubs' in holder) holder.unsubs = [];
}
