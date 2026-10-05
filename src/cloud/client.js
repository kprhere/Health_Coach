// Thin wrapper over supabase-js: access-code login, session persistence,
// expiry handling, and the sync transport (push_ops / pull_changes RPCs).
import { createClient } from '@supabase/supabase-js';
import { parseAccessCode, userEmailFor } from './accessCode.js';
import { normalizeRecord } from './syncEngine.js';

// One session slot per Supabase project, so two deployments never share tokens.
export function sessionStorageKeyFor(url) {
  let host = 'unknown';
  try { host = new URL(url).hostname.split('.')[0]; } catch { /* keep default */ }
  return `recomp-cloud-session:${host}`;
}

// Local data (outbox, caches) must be keyed by account too.
export const accountScopedKey = (accountId, name) => `recomp:${accountId}:${name}`;

export function isSessionExpired(session, nowMs = Date.now(), skewSeconds = 30) {
  if (!session) return true;
  const exp = session.expires_at ?? null;
  if (exp === null) return false;
  return nowMs / 1000 >= exp - skewSeconds;
}

// supabase-js reports fetch failures as errors without an HTTP status.
function toTransportError(error, status) {
  const err = new Error(error.message || 'request failed');
  const code = error.code;
  const s = status ?? error.status;
  if (s === 0 || ((s === undefined || s === null) && !code)) {
    err.code = 'NETWORK';
    return err;
  }
  err.status = typeof s === 'number' && s > 0 ? s : 400;
  err.pgCode = code;
  return err;
}

export function createCloudClient({ url, anonKey, storage, fetch: fetchImpl, supabaseFactory = createClient } = {}) {
  if (!url || !anonKey) throw new Error('Supabase URL and anon key are required');
  const supabase = supabaseFactory(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: sessionStorageKeyFor(url),
      ...(storage ? { storage } : {}),
    },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });

  let explicitLogout = false;
  const listeners = new Set();
  // Distinguish "user logged out" from "the session died" (refresh failed,
  // revoked by a regenerated code, account deleted).
  supabase.auth.onAuthStateChange((event, session) => {
    let kind = event;
    if (event === 'SIGNED_OUT') kind = explicitLogout ? 'LOGGED_OUT' : 'SESSION_EXPIRED';
    if (event === 'SIGNED_IN') explicitLogout = false;
    for (const cb of listeners) {
      try { cb(kind, session); } catch { /* listener errors must not break auth */ }
    }
  });

  const api = {
    supabase,
    async loginWithAccessCode(input) {
      const parsed = parseAccessCode(input);
      if (!parsed) return { ok: false, error: 'invalid-format' };
      const { data, error } = await supabase.auth.signInWithPassword({
        email: userEmailFor(parsed.userTag), password: parsed.code,
      });
      if (error) {
        // Same message whether the tag or the secret is wrong: do not reveal which.
        const network = !error.status;
        return { ok: false, error: network ? 'network' : 'invalid-credentials' };
      }
      return { ok: true, accountId: data.user.id, userTag: parsed.userTag, session: data.session };
    },
    // `engine` (optional) is a sync engine; logging out with unsynced work is refused.
    async logout({ engine, force = false } = {}) {
      if (engine && !force) {
        const guard = await engine.canSwitchAccount();
        if (!guard.ok) return { ok: false, reason: 'pending-changes', pendingCount: guard.pendingCount };
      }
      explicitLogout = true;
      const { error } = await supabase.auth.signOut();
      return error ? { ok: false, reason: 'signout-failed', error: error.message } : { ok: true };
    },
    async getSession() {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
    // Resolves to a live session or null; refreshes when close to expiry.
    async ensureSession() {
      const session = await api.getSession();
      if (!session) return null;
      if (!isSessionExpired(session)) return session;
      const { data, error } = await supabase.auth.refreshSession();
      return error ? null : data.session;
    },
    onAuthStateChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    // Sync transport for createSyncEngine.
    transport: {
      async pushOps(ops) {
        const { data, error, status } = await supabase.rpc('push_ops', { ops });
        if (error) throw toTransportError(error, status);
        return data;
      },
      async pullChanges(since, limit = 500) {
        const { data, error, status } = await supabase.rpc('pull_changes', { since: since ?? null, max_rows: limit });
        if (error) throw toTransportError(error, status);
        return (data || []).map(normalizeRecord);
      },
    },
    // Removes the caller's files via the Storage API first (the SQL function
    // only removes metadata rows), then the account itself.
    async deleteMyAccount() {
      const session = await api.getSession();
      if (!session) return { ok: false, error: 'not-signed-in' };
      const bucket = supabase.storage.from('uploads');
      const paths = [];
      const walk = async (folder) => {
        const { data, error } = await bucket.list(folder, { limit: 1000 });
        if (error) throw error;
        for (const item of data || []) {
          const p = `${folder}/${item.name}`;
          if (item.id === null || item.id === undefined) await walk(p); else paths.push(p);
        }
      };
      await walk(session.user.id);
      if (paths.length) {
        const { error } = await bucket.remove(paths);
        if (error) return { ok: false, error: error.message };
      }
      const { error } = await supabase.rpc('delete_my_account');
      if (error) return { ok: false, error: error.message };
      explicitLogout = true;
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      return { ok: true, removedFiles: paths.length };
    },
  };
  return api;
}
