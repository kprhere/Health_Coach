// ============================================================
// cloud-glue.test.mjs - the account pointer, the sync controller (hook core) and
// the explicit move-to-cloud flow, against a fake server and real IndexedDB
// (fake-indexeddb). Synthetic data only; no network.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

const { createLocalStore } = await import('../src/store/localStore.js');
const { defaultState, clone } = await import('../src/helpers.js');
const {
  ACTIVE_ACCOUNT_KEY, getActiveAccountId, setActiveAccountId, accountStorageKey, clearSensitiveMemory,
} = await import('../src/cloud/activeAccount.js');
const {
  createCloudSyncController, runMove, previewMove, stableOpId, readAllRemote, SESSION_EXPIRED_MESSAGE,
} = await import('../src/cloud/useCloudSync.js');

const ACCT = 'acct-1';
const OTHER = 'acct-2';
const GOOD_CODE = `ABCDEF-${'A'.repeat(24)}`;
const netErr = () => Object.assign(new Error('Failed to fetch'), { code: 'NETWORK' });
let n = 0;
const freshDb = () => { globalThis.indexedDB = new IDBFactory(); n += 1; };

// ---------- fakes ----------
function fakeServer() {
  const rows = new Map();
  const applied = new Map();
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const k = (c, key) => `${c}|${key}`;
  const server = {
    rows, online: true, pushCalls: 0, pullCalls: 0, corruptReads: false, dropKey: null,
    seed(collection, key, data) {
      clock += 1000;
      rows.set(k(collection, key), { collection, key, data, version: 1, updated_at: new Date(clock).toISOString(), deleted_at: null });
    },
    transport: () => ({
      pushOps: async (ops) => {
        server.pushCalls += 1;
        if (!server.online) throw netErr();
        const res = { applied: [], duplicates: [], conflicts: [], rolled_back: [] };
        for (const o of ops) {
          if (applied.has(o.op_id)) { res.duplicates.push({ op_id: o.op_id, version: applied.get(o.op_id) }); continue; }
          const cur = rows.get(k(o.collection, o.key));
          if ((o.expected_version ?? 0) !== (cur?.version ?? 0)) { res.conflicts.push({ op_id: o.op_id, server: { ...cur } }); continue; }
          clock += 1000;
          const row = {
            collection: o.collection, key: o.key, data: o.delete ? (cur?.data ?? {}) : o.data, version: (cur?.version ?? 0) + 1,
            updated_at: new Date(clock).toISOString(), deleted_at: o.delete ? new Date(clock).toISOString() : null,
          };
          rows.set(k(o.collection, o.key), row);
          applied.set(o.op_id, row.version);
          res.applied.push({ op_id: o.op_id, version: row.version });
        }
        return res;
      },
      pullChanges: async (since, limit = 1000) => {
        server.pullCalls += 1;
        if (!server.online) throw netErr();
        const s = since ? Date.parse(since) : -Infinity;
        return [...rows.values()]
          .filter((r) => Date.parse(r.updated_at) >= s)
          .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
          .slice(0, limit)
          .filter((r) => !(server.dropKey && r.key === server.dropKey))
          .map((r) => ({
            collection: r.collection, key: r.key,
            data: server.corruptReads && r.collection === 'workoutSessions' ? { tampered: true } : r.data,
            version: r.version, updatedAt: r.updated_at, deletedAt: r.deleted_at,
          }));
      },
    }),
  };
  return server;
}

function fakeClient(server, { userId = ACCT, signedIn = true } = {}) {
  const listeners = new Set();
  let current = signedIn ? { user: { id: userId, email: 'abcdef@users.recomp.invalid' }, expires_at: 9e9 } : null;
  const c = {
    calls: { login: 0, logout: 0, ensure: 0 },
    transport: server.transport(),
    async ensureSession() { c.calls.ensure += 1; return current; },
    async loginWithAccessCode(code) {
      c.calls.login += 1;
      if (c.nextLogin) return c.nextLogin;
      current = { user: { id: userId, email: 'abcdef@users.recomp.invalid' }, expires_at: 9e9, access_token: 'SECRET-TOKEN' };
      return { ok: true, accountId: userId, userTag: code.slice(0, 6), session: current };
    },
    async logout() { c.calls.logout += 1; current = null; return { ok: true }; },
    onAuthStateChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    emit(kind) { if (kind === 'SESSION_EXPIRED') current = null; listeners.forEach((cb) => cb(kind, null)); },
  };
  return c;
}

function fakeTimers() {
  const t = { queue: [] };
  t.setTimer = (fn, ms) => { const h = { fn, ms }; t.queue.push(h); return h; };
  t.clearTimer = (h) => { t.queue = t.queue.filter((x) => x !== h); };
  return t;
}

function fakeWindow() {
  const l = {};
  return {
    addEventListener: (t, fn) => { (l[t] ||= new Set()).add(fn); },
    removeEventListener: (t, fn) => { l[t]?.delete(fn); },
    fire: (t) => [...(l[t] || [])].forEach((fn) => fn()),
    count: (t) => (l[t] ? l[t].size : 0),
  };
}

const dayState = (days) => {
  const s = defaultState();
  for (const [d, water] of Object.entries(days)) s.mealLogs[d] = { eaten: {}, extras: [], water, flags: {} };
  return s;
};

async function setup({ client: clientOpts, controller: ctlOpts = {}, serverOnline = true } = {}) {
  freshDb();
  const server = fakeServer();
  server.online = serverOnline;
  const client = fakeClient(server, clientOpts);
  const store = createLocalStore(ACCT);
  const timers = fakeTimers();
  const win = fakeWindow();
  const applied = [];
  const loggedOut = [];
  let clientCreated = 0;
  const ctl = createCloudSyncController({
    url: 'https://example.invalid', anonKey: 'anon-test', enabled: true, accountId: ACCT, store,
    clientFactory: () => { clientCreated += 1; return client; },
    onRemoteApplied: (s) => applied.push(s), onLoggedOut: (i) => loggedOut.push(i),
    win, isOnline: () => true, engineOptions: { setTimer: timers.setTimer, clearTimer: timers.clearTimer, random: () => 0.5 },
    ...ctlOpts,
  });
  return {
    server, client, store, ctl, timers, win, applied, loggedOut, created: () => clientCreated,
  };
}

// ---------- activeAccount ----------
test('active account: defaults to local, validates, and keys are account scoped', () => {
  const mem = new Map();
  const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  assert.equal(getActiveAccountId(ls), 'local');
  assert.deepEqual(setActiveAccountId('acct-9', ls), { ok: true, accountId: 'acct-9' });
  assert.equal(mem.get(ACTIVE_ACCOUNT_KEY), 'acct-9');
  assert.equal(getActiveAccountId(ls), 'acct-9');
  mem.set(ACTIVE_ACCOUNT_KEY, '../evil');
  assert.equal(getActiveAccountId(ls), 'local', 'a corrupt pointer falls back to the local account');
  assert.throws(() => setActiveAccountId('a b', ls), (e) => e.reason === 'invalid-account-id');
  assert.equal(accountStorageKey('acct-9', 'cache'), 'recomp:acct-9:cache');
  assert.notEqual(accountStorageKey('a', 'x'), accountStorageKey('b', 'x'));
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(getActiveAccountId(broken), 'local');
  assert.equal(setActiveAccountId('acct-1', broken).ok, false);
});

test('clearSensitiveMemory releases references and never throws', async () => {
  let stopped = 0;
  const holder = { engine: { stop: () => { stopped += 1; } }, client: {}, session: { x: 1 }, unsubs: [() => { throw new Error('x'); }], clearers: [] };
  await clearSensitiveMemory(holder);
  assert.equal(stopped, 1);
  assert.equal(holder.engine, null);
  assert.equal(holder.client, null);
  assert.equal(holder.session, null);
  await clearSensitiveMemory(null);
});

// ---------- login gate ----------
test('a malformed code is refused before any client exists or any network call happens', async () => {
  const t = await setup({ client: { signedIn: false } });
  await t.ctl.start();
  const created = t.created();
  for (const bad of ['', 'nope', 'ABCDEF-SHORT', `ABCDEF-${'1'.repeat(24)}`, null, 12345]) {
    const r = await t.ctl.login(bad);
    assert.deepEqual(r, { ok: false, error: 'invalid-format' }, String(bad));
  }
  assert.equal(t.client.calls.login, 0);
  assert.equal(t.server.pushCalls + t.server.pullCalls, 0);
  assert.equal(t.created(), created);
  await t.ctl.dispose();
});

test('login with a good code signs in, syncs, and exposes no token', async () => {
  const t = await setup({ client: { signedIn: false } });
  await t.ctl.start();
  assert.equal(t.ctl.getSnapshot().status, 'signed-out');
  const r = await t.ctl.login(`abcdef-${'a'.repeat(24)}`.replace(/(.{6})/, '$1 ')); // lowercase + stray space (paste)
  assert.equal(r.ok, true);
  assert.equal(r.switchRequired, false);
  const s = t.ctl.getSnapshot();
  assert.equal(s.status, 'synced');
  assert.deepEqual(Object.keys(s.session).sort(), ['expiresAt', 'userId', 'userTag']);
  assert.ok(!JSON.stringify(s).includes('SECRET-TOKEN'));
  assert.ok(!JSON.stringify(s).includes('AAAAAAAAAAAAAAAAAAAAAAAA'));
  await t.ctl.dispose();
});

test('signing in uploads nothing: no ops are created and nothing is pushed', async () => {
  const t = await setup({ client: { signedIn: false } });
  const local = dayState({ '2026-03-01': 1 });
  await t.store.commit(defaultState(), local, { accountMode: false });
  await t.ctl.start();
  await t.ctl.login(GOOD_CODE);
  assert.equal(await t.store.pendingCount(), 0);
  assert.equal(t.server.pushCalls, 0, 'nothing was pushed');
  assert.equal(t.server.rows.size, 0);
  await t.ctl.dispose();
});

test('login as an account other than the bound store reports switchRequired and never syncs into this store', async () => {
  const t = await setup({ client: { signedIn: false, userId: OTHER } });
  await t.ctl.start();
  const r = await t.ctl.login(GOOD_CODE);
  assert.equal(r.ok, true);
  assert.equal(r.switchRequired, true);
  assert.equal(r.accountId, OTHER);
  const s = t.ctl.getSnapshot();
  assert.equal(s.status, 'signed-out');
  assert.equal(s.needsAccountSwitch, OTHER);
  assert.equal(t.server.pushCalls + t.server.pullCalls, 0);
  await t.ctl.dispose();
});

test('wrong code and network failure are passed through as distinct, secret-free errors', async () => {
  const t = await setup({ client: { signedIn: false } });
  await t.ctl.start();
  t.client.nextLogin = { ok: false, error: 'invalid-credentials' };
  assert.deepEqual(await t.ctl.login(GOOD_CODE), { ok: false, error: 'invalid-credentials' });
  t.client.nextLogin = { ok: false, error: 'network' };
  assert.deepEqual(await t.ctl.login(GOOD_CODE), { ok: false, error: 'network' });
  await t.ctl.dispose();
});

test('disabled controller never builds a client', async () => {
  freshDb();
  let built = 0;
  const ctl = createCloudSyncController({ enabled: false, accountId: ACCT, store: createLocalStore(ACCT), clientFactory: () => { built += 1; } });
  await ctl.start();
  assert.equal(ctl.getSnapshot().status, 'disabled');
  assert.deepEqual(await ctl.login(GOOD_CODE), { ok: false, error: 'disabled' });
  assert.equal(built, 0);
});

// ---------- pending work blocks logout and switching ----------
test('pending ops block logout; force logs out but keeps the queue', async () => {
  const t = await setup({ serverOnline: false });
  await t.ctl.start();
  await t.store.commit(defaultState(), dayState({ '2026-03-01': 2 }), { accountMode: true });
  await t.ctl.refresh();
  assert.equal(t.ctl.getSnapshot().pendingCount, 1);

  const blocked = await t.ctl.logout();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.pendingCount, 1);
  assert.equal(t.client.calls.logout, 0, 'the session was not touched');
  assert.deepEqual(await t.ctl.canSwitchAccount(), { ok: false, pendingCount: 1, conflictCount: 0 });

  const forced = await t.ctl.logout({ force: true });
  assert.equal(forced.ok, true);
  assert.equal(t.client.calls.logout, 1);
  assert.equal(t.ctl.getSnapshot().status, 'signed-out');
  assert.equal(t.ctl.getSnapshot().session, null);
  assert.equal(await t.store.pendingCount(), 1, 'the unsynced change is still on this device');
  assert.equal(t.loggedOut.length, 1);
  assert.equal(t.loggedOut[0].forced, true);
  await t.ctl.dispose();
});

test('logout with nothing pending signs out, clears memory and calls onLoggedOut', async () => {
  const t = await setup();
  await t.ctl.start();
  assert.equal(t.ctl.getSnapshot().status, 'synced');
  const r = await t.ctl.logout();
  assert.equal(r.ok, true);
  assert.equal(t.ctl.getSnapshot().status, 'signed-out');
  assert.equal(t.loggedOut[0].forced, false);
  assert.deepEqual(await t.ctl.syncNow(), { ok: false, reason: 'signed-out' });
  await t.ctl.dispose();
});

test('a failed server sign-out leaves the session as it was and says so', async () => {
  const t = await setup();
  await t.ctl.start();
  t.client.logout = async () => ({ ok: false, reason: 'signout-failed' });
  const r = await t.ctl.logout();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'signout-failed');
  assert.equal(t.loggedOut.length, 0);
  await t.ctl.dispose();
});

test('pending ops block switching to a different access code, with no network call', async () => {
  const t = await setup({ serverOnline: false });
  await t.ctl.start();
  await t.store.commit(defaultState(), dayState({ '2026-03-01': 2 }), { accountMode: true });
  const r = await t.ctl.login(`ZZZZZZ-${'A'.repeat(24)}`);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'pending-changes');
  assert.equal(r.pendingCount, 1);
  assert.equal(t.client.calls.login, 0);
  await t.ctl.dispose();
});

// ---------- session expiry ----------
test('session expiry signs out with a clear message and keeps data and pending ops', async () => {
  const t = await setup();
  await t.ctl.start();
  t.server.online = false;
  await t.store.commit(defaultState(), dayState({ '2026-03-02': 3 }), { accountMode: true });
  await t.ctl.refresh();
  t.client.emit('SESSION_EXPIRED');
  await new Promise((r) => setImmediate(r));
  const s = t.ctl.getSnapshot();
  assert.equal(s.status, 'signed-out');
  assert.equal(s.error.code, 'session-expired');
  assert.equal(s.error.message, SESSION_EXPIRED_MESSAGE);
  assert.equal(s.pendingCount, 1, 'the unsynced change is kept');
  assert.equal((await t.store.load()).state.mealLogs['2026-03-02'].water, 3, 'local data untouched');
  assert.deepEqual(await t.ctl.syncNow(), { ok: false, reason: 'signed-out' });
  await t.ctl.dispose();
});

test('a 401 from the server with no live session ends in signed-out, not a silent failure', async () => {
  const t = await setup();
  await t.ctl.start();
  await t.store.commit(defaultState(), dayState({ '2026-03-02': 3 }), { accountMode: true });
  t.client.transport.pushOps = async () => { throw Object.assign(new Error('jwt expired'), { status: 401 }); };
  t.client.ensureSession = async () => null;
  const r = await t.ctl.syncNow();
  assert.equal(r.reason, 'session-expired');
  assert.equal(t.ctl.getSnapshot().status, 'signed-out');
  assert.equal(await t.store.pendingCount(), 1);
  await t.ctl.dispose();
});

// ---------- remote apply ----------
test('remote changes are applied to the store and handed to onRemoteApplied; pending local records are not clobbered', async () => {
  const t = await setup({ serverOnline: false });
  // Another device wrote two days; this device has an unsent edit to one of them.
  t.server.seed('mealLogs', '2026-03-01', { eaten: {}, extras: [], water: 9, flags: {} });
  t.server.seed('mealLogs', '2026-03-02', { eaten: {}, extras: [], water: 7, flags: {} });
  await t.ctl.start();
  await t.store.commit(defaultState(), dayState({ '2026-03-01': 1 }), { accountMode: true }); // pending, offline
  t.server.online = true;
  // Pull only (as after a reconnect) so the pending op is still protected during the pull.
  const mem = t.ctl; void mem;
  const engineRes = await t.ctl.syncNow();
  assert.ok(engineRes.ok !== undefined);
  // The local edit was pushed first and conflicted (server has v1, local base 0): both sides held.
  const conflicts = (await t.store.outbox.listConflicts());
  assert.equal(conflicts.length, 1);
  const local = await t.store.getRecord('mealLogs', '2026-03-01');
  assert.equal(local.data.water, 1, 'the local record was not overwritten by the remote one');
  const other = await t.store.getRecord('mealLogs', '2026-03-02');
  assert.equal(other.data.water, 7, 'the other record arrived');
  assert.ok(t.applied.length >= 1, 'onRemoteApplied received assembled state');
  const last = t.applied[t.applied.length - 1];
  assert.equal(last.mealLogs['2026-03-02'].water, 7);
  assert.equal(last.mealLogs['2026-03-01'].water, 1);
  assert.equal(t.ctl.getSnapshot().status, 'conflict');
  assert.equal(t.ctl.getSnapshot().conflicts.length, 1);
  await t.ctl.dispose();
});

test('resolveConflict keep-theirs takes the server version and clears the conflict', async () => {
  const t = await setup({ serverOnline: false });
  t.server.seed('mealLogs', '2026-03-01', { eaten: {}, extras: [], water: 9, flags: {} });
  await t.ctl.start();
  await t.store.commit(defaultState(), dayState({ '2026-03-01': 1 }), { accountMode: true });
  t.server.online = true;
  await t.ctl.syncNow();
  const [c] = await t.store.outbox.listConflicts();
  const res = await t.ctl.resolveConflict(c.id, 'server');
  assert.equal(res.ok, true);
  assert.equal((await t.store.getRecord('mealLogs', '2026-03-01')).data.water, 9);
  assert.equal(t.ctl.getSnapshot().conflicts.length, 0);
  assert.equal(await t.store.pendingCount(), 0);
  await t.ctl.dispose();
});

test('resolveConflict keep-mine re-sends this device\'s version on top of the server\'s', async () => {
  const t = await setup({ serverOnline: false });
  t.server.seed('mealLogs', '2026-03-01', { eaten: {}, extras: [], water: 9, flags: {} });
  await t.ctl.start();
  await t.store.commit(defaultState(), dayState({ '2026-03-01': 1 }), { accountMode: true });
  t.server.online = true;
  await t.ctl.syncNow();
  const [c] = await t.store.outbox.listConflicts();
  await t.ctl.resolveConflict(c.id, 'local');
  assert.equal(t.server.rows.get('mealLogs|2026-03-01').data.water, 1);
  assert.equal(await t.store.pendingCount(), 0);
  await t.ctl.dispose();
});

// ---------- offline -> online ----------
test('offline changes stay pending, show offline, and flush when the connection returns', async () => {
  const t = await setup();
  await t.ctl.start();
  t.server.online = false;
  await t.store.commit(defaultState(), dayState({ '2026-03-05': 4 }), { accountMode: true });
  const r = await t.ctl.syncNow();
  assert.equal(r.ok, false);
  assert.equal(t.ctl.getSnapshot().status, 'offline');
  assert.equal(t.ctl.getSnapshot().pendingCount, 1);

  t.win.fire('offline');
  assert.equal(t.ctl.getSnapshot().status, 'offline');

  t.server.online = true;
  t.win.fire('online');
  for (let i = 0; i < 50 && (await t.store.pendingCount()) > 0; i += 1) await new Promise((res) => setTimeout(res, 5));
  assert.equal(await t.store.pendingCount(), 0);
  assert.equal(t.server.rows.get('mealLogs|2026-03-05').data.water, 4);
  await t.ctl.refresh();
  assert.equal(t.ctl.getSnapshot().status, 'synced');
  assert.ok(t.ctl.getSnapshot().lastSyncAt);
  await t.ctl.dispose();
  assert.equal(t.win.count('online'), 0, 'listeners are removed on dispose');
});

test('the controller refuses a store that belongs to another account', async () => {
  freshDb();
  const server = fakeServer();
  let built = 0;
  const ctl = createCloudSyncController({
    url: 'https://example.invalid', anonKey: 'k', enabled: true, accountId: ACCT, store: createLocalStore(OTHER),
    clientFactory: () => { built += 1; return fakeClient(server); }, win: null,
  });
  await ctl.start();
  assert.equal(ctl.getSnapshot().status, 'disabled');
  assert.equal(ctl.getSnapshot().error.code, 'store-mismatch');
  assert.equal(built, 0);
  assert.equal(server.pushCalls + server.pullCalls, 0);
});

test('two accounts keep separate local data and separate pending queues', async () => {
  freshDb();
  const a = createLocalStore('acct-a');
  const b = createLocalStore('acct-b');
  await a.commit(defaultState(), dayState({ '2026-03-01': 1 }), { accountMode: true });
  assert.equal(await a.pendingCount(), 1);
  assert.equal(await b.pendingCount(), 0);
  assert.equal((await b.load()).state, null);
});

// ---------- readAllRemote ----------
test('readAllRemote pages through the server and reports an incomplete read', async () => {
  const server = fakeServer();
  for (let i = 0; i < 7; i += 1) server.seed('mealLogs', `2026-03-0${i + 1}`, { water: i });
  const out = await readAllRemote(server.transport(), { pageSize: 3 });
  assert.equal(out.complete, true);
  assert.equal(out.records.length, 7);
  const stuck = { pullChanges: async () => [1, 2, 3].map((i) => ({ collection: 'x', key: `k${i}`, data: {}, version: 1, updatedAt: '2026-01-01T00:00:00.000Z' })) };
  const bad = await readAllRemote(stuck, { pageSize: 3 });
  assert.equal(bad.complete, false);
});

// ---------- move to cloud ----------
const localWithHistory = () => {
  const s = dayState({ '2026-03-01': 1, '2026-03-02': 2, '2026-03-03': 3 });
  s.workoutSessions['2026-03-01'] = { day: 'push', exercises: [{ name: 'Test Press', sets: [{ w: 60, r: 8 }] }] };
  s.bodyScans = [{ id: 's1', date: '2026-03-01', weightKg: 80 }];
  return s;
};

async function moveSetup({ remoteSeed = [], tweak } = {}) {
  freshDb();
  const server = fakeServer();
  for (const [c, k, d] of remoteSeed) server.seed(c, k, d);
  const client = fakeClient(server);
  const store = createLocalStore(ACCT);
  const timers = fakeTimers();
  const ctl = createCloudSyncController({
    url: 'https://example.invalid', anonKey: 'k', enabled: true, accountId: ACCT, store, clientFactory: () => client, win: null,
    engineOptions: { setTimer: timers.setTimer, clearTimer: timers.clearTimer },
  });
  await ctl.start();
  if (tweak) tweak({ server, client, store });
  return {
    server, store, ctl, snapshots: [],
    deps(extra = {}) {
      const snaps = [];
      return {
        destination: { accountId: ACCT, label: 'Test person' }, destStore: store,
        sync: () => ctl.syncNow(), readRemote: () => ctl.readRemote(),
        takeSnapshot: (reason, st) => { snaps.push({ reason, st }); return `snap-${snaps.length}`; }, snaps, ...extra,
      };
    },
  };
}

test('stableOpId is a deterministic uuid that changes with content and account', () => {
  const a = stableOpId('acct-1', 'mealLogs', 'd', { x: 1 });
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(a, stableOpId('acct-1', 'mealLogs', 'd', { x: 1 }));
  assert.notEqual(a, stableOpId('acct-1', 'mealLogs', 'd', { x: 2 }));
  assert.notEqual(a, stableOpId('acct-2', 'mealLogs', 'd', { x: 1 }));
});

test('previewMove: empty account copies; populated account of unknown owner is blocked', () => {
  const local = localWithHistory();
  const empty = previewMove({ localState: local, remoteRecords: [] });
  assert.equal(empty.kind, 'empty');
  assert.equal(empty.blocked, false);
  assert.equal(empty.local.meals, 3);
  assert.equal(empty.remote.meals, 0);
  const rec = (collection, key, data) => ({ collection, key, data, version: 1, deletedAt: null });
  const populated = previewMove({ localState: local, remoteRecords: [rec('mealLogs', '2026-01-01', { water: 1 })] });
  assert.equal(populated.kind, 'populated');
  assert.equal(populated.blocked, true);
  assert.equal(populated.remote.meals, 1);
  assert.equal(previewMove({ localState: local, remoteRecords: [rec('mealLogs', '2026-01-01', { water: 1 })], sameOwner: true }).blocked, false);
  const light = previewMove({ localState: local, remoteRecords: [rec('settings', 'singleton', { a: 1 })] });
  assert.equal(light.kind, 'light');
  assert.equal(light.blocked, false);
});

test('runMove success: snapshot, copy, drain, read back, then completion with counts; local state untouched', async () => {
  const m = await moveSetup();
  const local = localWithHistory();
  const before = JSON.stringify(local);
  const deps = m.deps();
  const steps = [];
  const res = await runMove({ localState: local, ...deps, onProgress: (p) => steps.push(p.step), chunkSize: 2 });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.completion.accountId, ACCT);
  assert.equal(res.completion.counts.meals, 3);
  assert.equal(res.completion.counts.workouts, 1);
  assert.equal(res.completion.counts.scans, 1);
  assert.ok(res.completion.completedAt);
  assert.equal(JSON.stringify(local), before, 'on-device state was not modified');
  assert.equal(deps.snaps.length, 1);
  assert.equal(deps.snaps[0].reason, 'before-cloud-move');
  assert.ok(steps.indexOf('snapshot') < steps.indexOf('copy') && steps.indexOf('copy') < steps.indexOf('verify'));
  assert.equal(await m.store.pendingCount(), 0);
  assert.equal(m.server.rows.get('mealLogs|2026-03-02').data.water, 2);
  await m.ctl.dispose();
});

test('runMove is idempotent: a retry sends the same op ids and the server never double-applies', async () => {
  const m = await moveSetup();
  const local = localWithHistory();
  const first = await runMove({ localState: local, ...m.deps() });
  assert.equal(first.ok, true);
  const versions = [...m.server.rows.values()].map((r) => r.version);
  // The account now holds this person's data, so a plain retry is refused as "populated";
  // the flow passes sameOwner on its own retries.
  const refused = await runMove({ localState: local, ...m.deps() });
  assert.equal(refused.code, 'populated-account');
  const second = await runMove({ localState: local, ...m.deps(), sameOwner: true });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.deepEqual([...m.server.rows.values()].map((r) => r.version), versions, 'no record was written twice');
  await m.ctl.dispose();
});

test('runMove refuses a populated account of unknown owner and changes nothing', async () => {
  const m = await moveSetup({ remoteSeed: [['mealLogs', '2025-12-01', { eaten: {}, extras: [], water: 5, flags: {} }]] });
  const local = localWithHistory();
  const deps = m.deps();
  const res = await runMove({ localState: local, ...deps });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'populated-account');
  assert.equal(m.server.pushCalls, 0);
  assert.equal(await m.store.pendingCount(), 0);
  const replace = await runMove({ localState: local, ...deps, mode: 'replace', allowMerge: true });
  assert.equal(replace.code, 'replace-refused');
  assert.equal(m.server.pushCalls, 0);
  await m.ctl.dispose();
});

test('explicit merge only adds what the account lacks and never overwrites the account\'s records', async () => {
  const theirs = { eaten: {}, extras: [], water: 5, flags: {} };
  const m = await moveSetup({ remoteSeed: [['mealLogs', '2026-03-01', theirs]] });
  const local = localWithHistory();
  const res = await runMove({ localState: local, ...m.deps(), allowMerge: true });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.mode, 'fill');
  assert.equal(m.server.rows.get('mealLogs|2026-03-01').data.water, 5, 'their day was not overwritten');
  assert.ok(res.skipped.includes('mealLogs/2026-03-01'), 'the skipped record is reported');
  assert.equal(m.server.rows.get('mealLogs|2026-03-02').data.water, 2, 'missing days were added');
  assert.equal(local.mealLogs['2026-03-01'].water, 1, 'the local day is still on this device');
  await m.ctl.dispose();
});

test('runMove: verification mismatch is NOT complete and local data is untouched', async () => {
  const m = await moveSetup({ tweak: ({ server }) => { server.corruptReads = true; } });
  const local = localWithHistory();
  const before = JSON.stringify(local);
  const res = await runMove({ localState: local, ...m.deps() });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'verify-mismatch');
  assert.ok(res.mismatchCount >= 1);
  assert.equal(res.completion, undefined);
  assert.equal(JSON.stringify(local), before);
  await m.ctl.dispose();
});

test('runMove: a record missing on read-back fails verification', async () => {
  const m = await moveSetup({ tweak: ({ server }) => { server.dropKey = '2026-03-02'; } });
  const res = await runMove({ localState: localWithHistory(), ...m.deps() });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'verify-mismatch');
  assert.ok(res.mismatches.some((x) => x.problem === 'missing'));
  await m.ctl.dispose();
});

test('runMove: offline part-way keeps the copied records queued and reports a retryable failure', async () => {
  const m = await moveSetup();
  const local = localWithHistory();
  let calls = 0;
  const deps = m.deps({ sync: async () => { calls += 1; if (calls > 1) m.server.online = false; return m.ctl.syncNow(); } });
  const res = await runMove({ localState: local, ...deps });
  assert.equal(res.ok, false);
  assert.ok(['offline', 'not-drained'].includes(res.code), res.code);
  assert.ok(await m.store.pendingCount() > 0, 'queued records are kept');
  m.server.online = true;
  const retry = await runMove({ localState: local, ...m.deps() });
  assert.equal(retry.ok, true, JSON.stringify(retry));
  await m.ctl.dispose();
});

test('runMove: snapshot failure stops unless a backup was exported; wrong store is refused', async () => {
  const m = await moveSetup();
  const noSnap = m.deps({ takeSnapshot: () => null });
  const res = await runMove({ localState: localWithHistory(), ...noSnap });
  assert.equal(res.code, 'snapshot-failed');
  assert.equal(m.server.pushCalls, 0);
  const wrong = await runMove({ localState: localWithHistory(), ...m.deps({ destination: { accountId: OTHER } }) });
  assert.equal(wrong.code, 'wrong-account');
  const ok = await runMove({ localState: localWithHistory(), ...noSnap, allowNoSnapshot: true });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  await m.ctl.dispose();
});

test('runMove: server conflicts during the copy are surfaced, not overwritten', async () => {
  const m = await moveSetup();
  const local = localWithHistory();
  let injected = false;
  const deps = m.deps({
    sync: async () => {
      if (!injected && (await m.store.pendingCount()) > 0) { injected = true; m.server.seed('mealLogs', '2026-03-02', { water: 99 }); }
      return m.ctl.syncNow();
    },
  });
  const res = await runMove({ localState: local, ...deps });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'conflicts');
  assert.equal(m.server.rows.get('mealLogs|2026-03-02').data.water, 99, 'their value is intact');
  assert.equal((await m.store.outbox.listConflicts()).length >= 1, true, 'both versions are held for the person to decide');
  await m.ctl.dispose();
});
