// ============================================================
// useCloudSync - the glue between the React app, the account's local store and
// the Supabase sync engine.
//
//   createCloudSyncController(options)  framework-free, fully injectable (tested in node)
//   useCloudSync(options)               React hook over the controller
//   previewMove / runMove               the explicit "move my data to the cloud" flow
//
// Rules this file enforces:
//   * A controller is bound to ONE account id and ONE store. It never opens,
//     reads or writes another account's database. Switching accounts means a
//     new controller (the hook rebuilds on accountId/store change).
//   * Signing in uploads nothing. Only commits made with accountMode:true
//     create outbox ops, and only runMove (user-confirmed) copies old data.
//   * Pending (unsynced) work blocks logout and account switching unless the
//     caller passes force. Even then nothing is deleted: the unsent ops stay in
//     the account's own database.
//   * A dead session never touches data: status becomes 'signed-out', pending
//     ops are kept, and syncing resumes after the next sign-in.
//   * No token, code or key is stored, logged or returned. `session` exposes
//     { userId, userTag, expiresAt } only.
// ============================================================
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createCloudClient } from './client.js';
import { createSyncEngine, normalizeRecord } from './syncEngine.js';
import { parseAccessCode, userTagFromEmail } from './accessCode.js';
import { clearSensitiveMemory } from './activeAccount.js';
import { sanitizeAccountId } from '../store/idb.js';
import {
  LOCAL_ONLY_META, MAP_FIELDS, assembleState, diffStates, explodeState, recordHash, stableStringify,
} from '../store/records.js';
import { recordCounts } from '../storage.js';

export const SESSION_EXPIRED_MESSAGE = 'Your session ended. Sign in again with your access code. Everything on this device, including changes not yet synced, is kept.';

const defaultClientFactory = ({ url, anonKey }) => createCloudClient({ url, anonKey });
const defaultOnline = () => {
  try { return typeof navigator === 'undefined' || navigator.onLine !== false; } catch { return true; }
};

const publicSession = (session) => (session && (session.userId || (session.user && session.user.id)) ? {
  userId: session.userId || session.user.id,
  userTag: session.userTag || userTagFromEmail(session.user && session.user.email) || null,
  expiresAt: session.expiresAt ?? session.expires_at ?? null,
} : null);

// ---------- fresh read of everything the server holds for the signed-in user ----------
// Not a cache read: this calls the transport, so it proves what the server has.
export async function readAllRemote(transport, { pageSize = 1000, maxPages = 200 } = {}) {
  const byKey = new Map();
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const rows = (await transport.pullChanges(cursor, pageSize)).map(normalizeRecord);
    rows.forEach((r) => byKey.set(`${r.collection}\u0000${r.key}`, r));
    if (rows.length < pageSize) return { records: [...byKey.values()], complete: true };
    let maxTs = cursor;
    for (const r of rows) if (r.updatedAt && (!maxTs || Date.parse(r.updatedAt) > Date.parse(maxTs))) maxTs = r.updatedAt;
    if (!maxTs || maxTs === cursor) return { records: [...byKey.values()], complete: false };
    cursor = maxTs;
  }
  return { records: [...byKey.values()], complete: false };
}

// ============================================================
// controller
// ============================================================
export function createCloudSyncController({
  url, anonKey, enabled = false, accountId, store, onRemoteApplied, onLoggedOut,
  clientFactory = defaultClientFactory, now = () => Date.now(),
  win = (typeof window !== 'undefined' ? window : null), isOnline = defaultOnline, engineOptions = {},
} = {}) {
  const configured = !!(url && anonKey);
  let boundId = null;
  let boundError = null;
  try { boundId = sanitizeAccountId(accountId); } catch (e) { boundError = e; }
  const storeMismatch = !!store && boundId !== null && store.accountId !== undefined && store.accountId !== boundId;

  const mem = { client: null, engine: null, session: null, unsubs: [] };
  const listeners = new Set();
  let gen = 0;
  let disposed = false;
  let online = isOnline();
  let sawSaving = false;
  let winUnsubs = [];

  let snap = {
    status: !enabled || !configured ? 'disabled' : 'signed-out',
    pendingCount: 0, conflicts: [], lastSyncAt: null,
    error: !enabled ? null : (!configured ? { code: 'not-configured', message: 'Cloud sync is not configured on this install.' } : null),
    session: null, needsAccountSwitch: null, syncing: false,
  };
  const set = (patch) => { snap = { ...snap, ...patch }; listeners.forEach((fn) => { try { fn(); } catch { /* listener errors never break sync */ } }); };

  function statusNow() {
    if (!enabled || !configured || boundError || storeMismatch) return 'disabled';
    if (!mem.engine) return 'signed-out';
    const es = mem.engine.status();
    if (es === 'conflict' || snap.conflicts.length > 0) return 'conflict';
    if (!online) return 'offline';
    return es;
  }

  // The queue length is read from the store (held conflicts still count).
  async function pendingNow() {
    if (store && typeof store.pendingCount === 'function') return store.pendingCount();
    if (store && store.outbox) return (await store.outbox.listPending(boundId)).length;
    return 0;
  }

  async function refreshCounts() {
    let pendingCount = snap.pendingCount;
    let conflicts = snap.conflicts;
    try { pendingCount = await pendingNow(); } catch { /* keep the previous figure */ }
    try {
      if (store && store.outbox && store.outbox.listConflicts) conflicts = await store.outbox.listConflicts(boundId);
    } catch { /* keep the previous list */ }
    set({ pendingCount, conflicts, status: statusNow(), lastSyncAt: mem.engine ? (mem.engine.lastSyncAt() ?? snap.lastSyncAt) : snap.lastSyncAt });
  }

  const recompute = () => refreshCounts();

  function expire() {
    if (mem.engine) mem.engine.stop();
    mem.engine = null;
    mem.session = null;
    set({
      session: null, needsAccountSwitch: null, status: 'signed-out',
      error: { code: 'session-expired', message: SESSION_EXPIRED_MESSAGE },
    });
    return refreshCounts();
  }

  function ensureClient() {
    if (mem.client) return mem.client;
    const client = clientFactory({ url, anonKey });
    mem.client = client;
    if (client && typeof client.onAuthStateChange === 'function') {
      mem.unsubs.push(client.onAuthStateChange((kind) => {
        if (kind === 'SESSION_EXPIRED') expire();
      }));
    }
    return client;
  }

  async function applyRemoteState(myGen) {
    if (!store || typeof onRemoteApplied !== 'function') return;
    if (typeof store.flush === 'function') await store.flush();
    // A save that failed leaves newer edits only in memory; do not replace them.
    if (typeof store.getUnsaved === 'function' && store.getUnsaved()) return;
    const loaded = await store.load();
    if (myGen !== gen || disposed || !loaded || !loaded.state) return;
    onRemoteApplied(loaded.state);
  }

  async function syncNow() {
    const engine = mem.engine;
    if (!engine) return { ok: false, reason: 'signed-out' };
    const myGen = gen;
    set({ syncing: true });
    let result;
    try {
      result = await engine.sync();
    } catch (error) {
      set({ syncing: false, error: { code: 'sync-error', message: String((error && error.message) || error) } });
      await refreshCounts();
      return { ok: false, reason: 'error', error };
    }
    if (myGen !== gen || disposed) return { ok: false, reason: 'stale' };
    set({ syncing: false });
    // 401/403 from the server: the engine reports 'failed' with no failed ops.
    if (engine.status() === 'failed' && engine.failedOps().length === 0 && mem.client) {
      let live = null;
      try { live = await mem.client.ensureSession(); } catch { live = null; }
      if (!live) { await expire(); return { ok: false, reason: 'session-expired' }; }
    }
    const applied = (result.pulled && result.pulled.applied) || 0;
    if (applied > 0) { try { await applyRemoteState(myGen); } catch { /* the records are safely in the store; the next load shows them */ } }
    const error = (result.pushed && result.pushed.error) || (result.pulled && result.pulled.error) || null;
    set({ error: error ? { code: error.code === 'NETWORK' ? 'offline' : 'sync-error', message: error.code === 'NETWORK' ? 'The server could not be reached. Your changes are kept and will sync when you are back online.' : 'The last sync did not finish. Your changes are kept and will be retried.' } : (snap.error && snap.error.code === 'session-expired' ? snap.error : null) });
    await refreshCounts();
    return { ok: !error, ...result, appliedRemote: applied };
  }

  async function adoptSession(session) {
    const pub = publicSession(session);
    if (!pub) { mem.session = null; set({ session: null, status: 'signed-out' }); await refreshCounts(); return; }
    mem.session = pub;
    if (pub.userId !== boundId) {
      // Signed in as someone other than the account this store belongs to.
      // Never sync into it; the app must switch accounts first.
      set({ session: pub, needsAccountSwitch: pub.userId, status: 'signed-out', error: null });
      await refreshCounts();
      return;
    }
    if (mem.engine) mem.engine.stop();
    mem.engine = createSyncEngine({
      accountId: boundId, outbox: store.outbox, transport: mem.client.transport,
      onStatus: () => { recompute(); }, onConflict: () => { recompute(); }, ...engineOptions,
    });
    set({ session: pub, needsAccountSwitch: null, error: null, status: statusNow() });
    await refreshCounts();
    await syncNow();
  }

  const guard = async () => {
    const pendingCount = await pendingNow();
    const conflictCount = snap.conflicts.length;
    return { ok: pendingCount === 0, pendingCount, conflictCount };
  };

  const controller = {
    getSnapshot: () => snap,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async start() {
      disposed = false;
      gen += 1;
      const myGen = gen;
      if (!enabled || !configured || boundError || storeMismatch || !store) {
        if (storeMismatch) set({ error: { code: 'store-mismatch', message: 'The local store does not belong to this account, so sync is off.' } });
        await refreshCounts();
        return;
      }
      if (win && typeof win.addEventListener === 'function') {
        const on = () => {
          online = true;
          set({ status: statusNow() });
          if (mem.engine) mem.engine.resume().then(() => (myGen === gen ? refreshCounts() : null)).catch(() => {});
        };
        const off = () => { online = false; set({ status: statusNow() }); };
        win.addEventListener('online', on);
        win.addEventListener('offline', off);
        winUnsubs = [() => win.removeEventListener('online', on), () => win.removeEventListener('offline', off)];
      }
      if (typeof store.subscribe === 'function') {
        mem.unsubs.push(store.subscribe((st) => {
          if (st.status === 'saving') sawSaving = true;
          else if (st.status === 'saved' && sawSaving) {
            sawSaving = false;
            if (mem.engine && st.pending > 0) mem.engine.notifyLocalChange();
            refreshCounts();
          }
        }));
      }
      try { ensureClient(); } catch (error) {
        set({ error: { code: 'client-error', message: 'Cloud sync could not start.' }, status: 'disabled' });
        return;
      }
      await refreshCounts();
      let session = null;
      try { session = await mem.client.ensureSession(); } catch { session = null; }
      if (myGen !== gen || disposed) return;
      await adoptSession(session);
    },

    async login(code) {
      // Shape first, before anything else happens: a typo never reaches the network.
      const parsed = parseAccessCode(code);
      if (!parsed) return { ok: false, error: 'invalid-format' };
      if (!enabled || !configured) return { ok: false, error: 'disabled' };
      if (!online) return { ok: false, error: 'offline' };
      // Signing in as a different person replaces the single session slot, so
      // unsynced work under the current account blocks it.
      if (mem.session && mem.session.userTag && mem.session.userTag !== parsed.userTag) {
        let g;
        try { g = await guard(); } catch { return { ok: false, error: 'pending-unknown' }; }
        if (!g.ok) return { ok: false, error: 'pending-changes', pendingCount: g.pendingCount };
      }
      let client;
      try { client = ensureClient(); } catch { return { ok: false, error: 'client-error' }; }
      const res = await client.loginWithAccessCode(parsed.code);
      if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'invalid-credentials' };
      const switchRequired = res.accountId !== boundId;
      await adoptSession(res.session || { userId: res.accountId, userTag: res.userTag });
      return { ok: true, accountId: res.accountId, userTag: res.userTag, switchRequired };
    },

    async logout({ force = false } = {}) {
      let g;
      try { g = await guard(); } catch {
        if (!force) return { ok: false, reason: 'pending-unknown', pendingCount: null };
        g = { pendingCount: null, conflictCount: 0, ok: false };
      }
      if (!g.ok && !force) return { ok: false, reason: 'pending-changes', pendingCount: g.pendingCount };
      if (mem.engine) mem.engine.stop();
      if (mem.client) {
        const r = await mem.client.logout({ force: true });
        if (!r.ok) return { ok: false, reason: r.reason || 'signout-failed', pendingCount: g.pendingCount };
      }
      await clearSensitiveMemory(mem);
      set({ session: null, needsAccountSwitch: null, status: 'signed-out', error: null });
      await refreshCounts();
      if (typeof onLoggedOut === 'function') onLoggedOut({ forced: !!force && g.pendingCount !== 0, pendingCount: g.pendingCount });
      return { ok: true, pendingCount: g.pendingCount };
    },

    syncNow,
    canSwitchAccount: guard,

    // 'local' keeps this device's version, 'server' takes theirs, anything else is merged data.
    async resolveConflict(conflictId, resolution) {
      if (!store || !store.outbox) return { ok: false, reason: 'no-store' };
      const res = await store.outbox.resolveConflict(conflictId, resolution);
      await refreshCounts();
      if (res && res.ok && mem.engine) {
        await syncNow();
        if (resolution === 'server') { try { await applyRemoteState(gen); } catch { /* shown on next load */ } }
      }
      return res;
    },

    // Fresh server read via the transport (never the local cache).
    async readRemote() {
      if (!mem.client) throw new Error('not signed in');
      const live = await mem.client.ensureSession();
      if (!live) { await expire(); const e = new Error('session expired'); e.code = 'SESSION_EXPIRED'; throw e; }
      const out = await readAllRemote(mem.client.transport);
      if (!out.complete) { const e = new Error('server read incomplete'); e.code = 'INCOMPLETE'; throw e; }
      return out.records;
    },

    notifyLocalChange() { if (mem.engine) mem.engine.notifyLocalChange(); return refreshCounts(); },
    refresh: refreshCounts,

    dispose() {
      disposed = true;
      gen += 1;
      winUnsubs.forEach((fn) => fn());
      winUnsubs = [];
      // Releases the engine, client and session objects. Stored data stays.
      return clearSensitiveMemory(mem);
    },
  };
  return controller;
}

// ============================================================
// React hook
// ============================================================
export function useCloudSync(options = {}) {
  const {
    url, anonKey, enabled = false, accountId, store, clientFactory,
  } = options;
  const ref = useRef(options);
  ref.current = options;

  const ctl = useMemo(() => createCloudSyncController({
    url, anonKey, enabled, accountId, store, clientFactory: clientFactory || undefined,
    onRemoteApplied: (s) => ref.current.onRemoteApplied && ref.current.onRemoteApplied(s),
    onLoggedOut: (info) => ref.current.onLoggedOut && ref.current.onLoggedOut(info),
    now: options.now, win: options.win, isOnline: options.isOnline, engineOptions: options.engineOptions,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [url, anonKey, enabled, accountId, store, clientFactory]);

  useEffect(() => {
    ctl.start();
    return () => { ctl.dispose(); };
  }, [ctl]);

  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot, ctl.getSnapshot);
  return useMemo(() => ({
    ...snap,
    login: ctl.login,
    logout: ctl.logout,
    syncNow: ctl.syncNow,
    canSwitchAccount: ctl.canSwitchAccount,
    resolveConflict: ctl.resolveConflict,
    readRemote: ctl.readRemote,
    notifyLocalChange: ctl.notifyLocalChange,
  }), [snap, ctl]);
}

// ============================================================
// Explicit migration: copy on-device data into a cloud account, verified.
// ============================================================
const sumCounts = (c) => Object.values(c || {}).reduce((a, n) => a + n, 0);
const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const liveRecords = (records) => (records || []).filter((r) => !r.deletedAt && !r.deleted && r.data !== undefined);
const isLocalOnly = (r) => r.collection === 'meta' && LOCAL_ONLY_META.has(r.key);
const idOf = (r) => `${r.collection}\u0000${r.key}`;

export const stateFromRemote = (records) => assembleState(liveRecords(records).map((r) => ({ collection: r.collection, key: r.key, data: r.data, deleted: false })));

// Deterministic uuid-shaped op id. The same record content always gets the same
// id, so a retry after a crash or timeout can never double-apply (the server
// answers "duplicate"). Not cryptographic; verification re-reads and compares.
export function stableOpId(accountId, collection, key, data) {
  const s = `${accountId}|${collection}|${key}|${stableStringify(data)}`;
  const fnv = (seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, '0');
  };
  const hex = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map(fnv).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Never overwrites: only adds what the account does not already hold.
export function fillState(accountState, localState) {
  const out = { ...(isPlain(accountState) ? accountState : {}) };
  const have = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const skipped = [];
  for (const f of Object.keys(localState || {})) {
    const lv = localState[f];
    const av = out[f];
    if (!have(out, f) || av === undefined) { out[f] = lv; continue; }
    if (MAP_FIELDS.includes(f) && isPlain(lv) && isPlain(av)) {
      const merged = { ...av };
      for (const k of Object.keys(lv)) {
        if (have(merged, k)) { if (stableStringify(merged[k]) !== stableStringify(lv[k])) skipped.push(`${f}/${k}`); } else merged[k] = lv[k];
      }
      out[f] = merged;
    } else if (Array.isArray(lv) && Array.isArray(av) && (f === 'bodyScans' || f === 'planVersions')) {
      const ids = new Set(av.map((x) => x && x.id));
      const extra = lv.filter((x) => x && x.id !== undefined && !ids.has(x.id));
      out[f] = [...av, ...extra];
      lv.filter((x) => !(x && x.id !== undefined) && !av.some((y) => stableStringify(y) === stableStringify(x))).forEach((_, i) => skipped.push(`${f}/#${i}`));
    } else if (stableStringify(av) !== stableStringify(lv)) {
      skipped.push(f);
    }
  }
  return { state: out, skipped };
}

// Intermediate states for chunked commits: big per-date maps are added in
// groups, so each atomic group stays small. Never removes anything.
export function chunkedSteps(base, target, size = 40) {
  const steps = [];
  let cur = { ...(isPlain(base) ? base : {}) };
  for (const f of Object.keys(target || {})) {
    const v = target[f];
    if (MAP_FIELDS.includes(f) && isPlain(v) && Object.keys(v).length > size) {
      const part = { ...(isPlain(cur[f]) ? cur[f] : {}) };
      const keys = Object.keys(v);
      for (let i = 0; i < keys.length; i += size) {
        keys.slice(i, i + size).forEach((k) => { part[k] = v[k]; });
        cur = { ...cur, [f]: { ...part } };
        steps.push(cur);
      }
    } else {
      cur = { ...cur, [f]: v };
      steps.push(cur);
    }
  }
  return steps;
}

// What would happen, in counts, without touching anything.
export function previewMove({ localState, remoteRecords, sameOwner = false }) {
  const remoteState = stateFromRemote(remoteRecords);
  const local = recordCounts(localState);
  const remote = recordCounts(remoteState);
  const remoteLive = liveRecords(remoteRecords).filter((r) => !isLocalOnly(r)).length;
  const remoteHasHistory = sumCounts(remote) > 0;
  const localHasHistory = sumCounts(local) > 0;
  let kind = 'empty';
  if (remoteHasHistory) kind = sameOwner ? 'same-owner' : 'populated';
  else if (remoteLive > 0) kind = 'light';
  return {
    local, remote, localHasHistory, remoteHasHistory, remoteRecordCount: remoteLive, kind,
    // A populated account of unknown ownership is refused unless the person
    // explicitly chooses an additive merge. Replace is never offered.
    blocked: kind === 'populated',
    mode: kind === 'empty' ? 'copy' : 'fill',
  };
}

const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

// destStore must be the DESTINATION account's store; localState is only read.
// Nothing on this device is written, replaced or deleted by this function.
export async function runMove({
  localState, destination, destStore, sync, readRemote, takeSnapshot, onProgress = () => {},
  allowMerge = false, sameOwner = false, allowNoSnapshot = false, mode: requestedMode, chunkSize = 40,
  maxSyncRounds = 12, now = () => Date.now(),
}) {
  const step = (name, detail = {}) => { try { onProgress({ step: name, ...detail }); } catch { /* UI errors must not stop the move */ } };
  if (requestedMode === 'replace') return fail('replace-refused', 'Replacing an account with on-device data is not supported. Nothing was changed.');
  let destId;
  try { destId = sanitizeAccountId(destination && destination.accountId); } catch { return fail('bad-destination', 'The destination account id is not valid. Nothing was changed.'); }
  if (!destStore || destStore.accountId !== destId) return fail('wrong-account', 'The local store is not the destination account\'s store. Nothing was changed.');
  if (!localState || typeof localState !== 'object') return fail('no-local-state', 'There is no on-device data to move.');

  try {
    step('snapshot');
    const key = takeSnapshot ? takeSnapshot('before-cloud-move', localState) : null;
    if (!key && !allowNoSnapshot) return fail('snapshot-failed', 'A safety snapshot could not be saved (storage may be full). Export a backup first, then try again.');

    step('check');
    let before;
    try { before = await readRemote(); } catch (e) { return fail(e && e.code === 'SESSION_EXPIRED' ? 'session-expired' : 'offline', 'The account could not be read. Check your connection and sign-in, then retry. Nothing was changed.'); }
    const pre = previewMove({ localState, remoteRecords: before, sameOwner });
    if (pre.blocked && !allowMerge) return fail('populated-account', 'This account already holds data and it is not confirmed to be yours. Nothing was changed.', { preview: pre });

    // Bring this account's local store up to the server before diffing against it.
    const first = await sync();
    if (first && first.pushed && first.pushed.error) return fail('offline', 'Could not reach the server. Nothing was changed.');
    const loaded = await destStore.load();
    const baseState = loaded.state || {};
    const copyMode = pre.mode === 'copy';
    const filled = copyMode ? { state: localState, skipped: [] } : fillState(baseState, localState);
    const finalState = filled.state;

    step('copy', { total: explodeState(finalState).length });
    let prev = baseState;
    let queued = 0;
    const steps = chunkedSteps(baseState, finalState, chunkSize);
    for (let i = 0; i < steps.length; i += 1) {
      const next = steps[i];
      const ids = explodeDiffIds(prev, next, destId);
      let n = 0;
      const res = await destStore.commit(prev, next, {
        accountMode: true, group: `mig:${destId.slice(0, 8)}:${i}:${ids[0] || 'none'}`, opIdFactory: () => ids[n++],
      });
      if (!res.ok) return fail('local-write-failed', 'The account\'s local queue could not be written. Your on-device data is untouched.', { reason: res.reason, queued });
      queued += res.ops.length;
      prev = next;
      step('copy', { done: i + 1, of: steps.length, queued });
    }

    step('sync', { queued });
    for (let round = 0; ; round += 1) {
      const r = await sync();
      const conflicts = destStore.outbox.listConflicts ? await destStore.outbox.listConflicts() : [];
      if (conflicts.length) return fail('conflicts', 'The account changed while copying, so some records conflict. Nothing was overwritten; resolve them in Account, then retry.', { conflicts: conflicts.length, queued });
      const left = await destStore.pendingCount();
      if (left === 0) break;
      if (r && r.pushed && r.pushed.error) return fail('offline', 'The connection dropped part-way. Your copied records are queued and safe on this device; retry to continue.', { remaining: left, queued });
      if (round >= maxSyncRounds) return fail('not-drained', 'Some records are still waiting to upload. Retry to continue.', { remaining: left, queued });
    }

    step('verify');
    let after;
    try { after = await readRemote(); } catch { return fail('offline', 'Uploaded, but the read-back failed. It is not marked complete. Retry to verify.', { queued }); }
    const remoteById = new Map(liveRecords(after).map((r) => [idOf(r), r]));
    const expected = explodeState(finalState).filter((r) => !isLocalOnly(r));
    const mismatches = [];
    for (const r of expected) {
      const got = remoteById.get(idOf(r));
      if (!got) mismatches.push({ collection: r.collection, key: r.key, problem: 'missing' });
      else if (recordHash(got.data) !== recordHash(r.data)) mismatches.push({ collection: r.collection, key: r.key, problem: 'different' });
    }
    const expectedCounts = recordCounts(finalState);
    const foundCounts = recordCounts(stateFromRemote(after));
    const countsOk = Object.keys(expectedCounts).every((k) => (copyMode ? foundCounts[k] === expectedCounts[k] : foundCounts[k] >= expectedCounts[k]));
    if (mismatches.length || !countsOk) {
      return fail('verify-mismatch', 'The account does not match your on-device data, so the move is NOT marked complete. Your on-device data is untouched.', {
        mismatches: mismatches.slice(0, 10), mismatchCount: mismatches.length, expectedCounts, foundCounts,
      });
    }
    step('done');
    return {
      ok: true,
      completion: { accountId: destId, completedAt: now(), counts: expectedCounts },
      copied: expected.length, skipped: filled.skipped, mode: pre.mode,
    };
  } catch (error) {
    return fail('unexpected', 'The move stopped unexpectedly. Your on-device data is untouched.', { error: String((error && error.message) || error) });
  }
}

// Op ids for exactly the records commit() will queue for prev -> next, in its order
// (same diff, same sort, same local-only filter).
function explodeDiffIds(prev, next, destId) {
  return diffStates(prev, next)
    .filter((c) => !isLocalOnly(c))
    .map((c) => stableOpId(destId, c.collection, c.key, c.deleted ? null : c.data));
}
