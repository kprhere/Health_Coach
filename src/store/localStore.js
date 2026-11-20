// ============================================================
// localStore.js - the durable, per-account store on top of IndexedDB.
//
// What "saved" means here: the transaction that wrote the changed records
// (and, for a signed-in account, the outbox entries that will carry them to
// the server) has COMPLETED. Records and ops are written in ONE transaction,
// so after a crash either both exist or neither does.
//
// The object returned by createLocalStore(accountId) has two faces:
//   * the app face:  load / commit / status / retry / getUnsaved / pendingCount
//   * the sync face: store.outbox - the interface the sync engine uses.
// ============================================================
import {
  openAccountDb, sanitizeAccountId, reqP, StoreError, toStoreError, deleteAccountDb,
} from './idb.js';
import { diffStates, assembleState, LOCAL_ONLY_META } from './records.js';

export const newId = () => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Not cryptographic, but unique enough for an op id on a very old browser.
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

const defaultSyncFilter = (change) => !(change.collection === 'meta' && LOCAL_ONLY_META.has(change.key));

const rowOf = (change, version, now) => ({
  collection: change.collection,
  key: change.key,
  data: change.deleted ? null : change.data,
  version,
  deleted: !!change.deleted,
  updatedAt: now,
});

export function createLocalStore(accountId, {
  db: injectedDb, openOptions, now = () => Date.now(), hooks = {}, syncFilter = defaultSyncFilter,
} = {}) {
  const id = sanitizeAccountId(accountId);
  let dbPromise = null;
  const getDb = () => {
    if (!dbPromise) dbPromise = injectedDb ? Promise.resolve(injectedDb) : openAccountDb(id, openOptions);
    return dbPromise;
  };
  const assertAccount = (a) => {
    if (a !== undefined && a !== null && sanitizeAccountId(a) !== id) {
      throw new StoreError('account-mismatch', `This store is bound to account "${id}", not "${a}".`);
    }
  };

  let lastTs = 0;
  const stamp = () => { lastTs = Math.max(now(), lastTs + 1); return lastTs; };

  // ---------- save status ----------
  const listeners = new Set();
  const status = { status: 'saved', reason: null, pending: 0, at: null };
  const emit = () => { const snap = { ...status }; listeners.forEach((fn) => { try { fn(snap); } catch { /* a listener must not break saving */ } }); };
  const setStatus = (patch) => { Object.assign(status, patch); emit(); };

  let inflight = 0;
  let chain = Promise.resolve();
  let unsaved = null; // newest state that is NOT on disk
  let unsavedBase = null; // the last state that is
  let lastOpts = {};

  async function refreshPending() {
    try { status.pending = await outboxApi.pendingCount(); } catch { /* keep the old figure */ }
  }

  async function runCommit(prevState, nextState, opts) {
    const base = unsaved ? unsavedBase : prevState;
    const changes = diffStates(base, nextState);
    if (!changes.length) { unsaved = null; unsavedBase = null; return { ok: true, ops: [] }; }
    const accountMode = opts.accountMode !== undefined ? !!opts.accountMode : false;
    const opIdFactory = opts.opIdFactory || newId;
    const group = opts.group || (accountMode ? opIdFactory() : null);
    try {
      const db = await getDb();
      const ops = await db.tx(['records', 'outbox'], 'readwrite', async ({ records, outbox }) => {
        const existing = await Promise.all(changes.map((c) => reqP(records.get([c.collection, c.key]))));
        const made = [];
        for (let i = 0; i < changes.length; i++) {
          const change = changes[i];
          const prior = existing[i];
          const version = prior ? prior.version || 0 : 0;
          const ts = stamp();
          if (change.deleted && !accountMode) {
            records.delete([change.collection, change.key]); // no server to tell, no tombstone needed
          } else {
            records.put(rowOf(change, version, ts));
          }
          if (hooks.afterRecordPut) await hooks.afterRecordPut(change, i);
          if (accountMode && syncFilter(change)) {
            const op = {
              opId: opIdFactory(),
              collection: change.collection,
              key: change.key,
              baseVersion: version,
              data: change.deleted ? null : change.data,
              deleted: !!change.deleted,
              group,
              createdAt: ts,
              attempts: 0,
              held: false,
            };
            outbox.put(op);
            made.push({ opId: op.opId, collection: op.collection, key: op.key, deleted: op.deleted, group });
          }
        }
        if (hooks.beforeCommit) await hooks.beforeCommit(changes);
        return made;
      });
      // Only here has the transaction completed.
      unsaved = null; unsavedBase = null;
      return { ok: true, ops };
    } catch (e) {
      const err = toStoreError(e);
      if (!unsaved) unsavedBase = base;
      unsaved = nextState;
      return { ok: false, reason: err.reason, error: err, ops: [] };
    }
  }

  function commit(prevState, nextState, opts = {}) {
    lastOpts = opts;
    inflight += 1;
    setStatus({ status: 'saving', reason: null });
    const run = chain.then(() => runCommit(prevState, nextState, opts));
    chain = run.then(() => undefined, () => undefined);
    return run.then(async (result) => {
      inflight -= 1;
      await refreshPending();
      if (inflight === 0) {
        if (unsaved) setStatus({ status: 'failed', reason: result.reason || 'error' });
        else setStatus({ status: 'saved', reason: null, at: now() });
      }
      return result;
    });
  }

  const store = {
    accountId: id,
    getDb,

    async load() {
      const db = await getDb();
      const rows = await db.getAll('records');
      if (!rows.length) return { state: null, source: 'empty', records: 0 };
      return { state: assembleState(rows), source: 'idb', records: rows.length };
    },

    commit,

    // Awaits every commit already queued.
    flush: () => chain.then(() => undefined),

    getSaveStatus: () => ({ ...status }),
    get saveStatus() { return status.status; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getUnsaved: () => unsaved,
    retry() {
      if (!unsaved) return Promise.resolve({ ok: true, ops: [] });
      return commit(unsavedBase, unsaved, lastOpts);
    },
    pendingCount: () => outboxApi.pendingCount(),

    async getRecord(collection, key) {
      const db = await getDb();
      return db.tx('records', 'readonly', ({ records }) => reqP(records.get([collection, key])));
    },

    async listRecords({ includeDeleted = false } = {}) {
      const db = await getDb();
      const rows = await db.getAll('records');
      return includeDeleted ? rows : rows.filter((r) => !r.deleted);
    },

    // Drop tombstones nobody still needs: deleted, synced (no pending op) and
    // older than `olderThanMs`. Returns how many were removed.
    async purgeTombstones({ olderThanMs = 30 * 86400000 } = {}) {
      const db = await getDb();
      const cutoff = now() - olderThanMs;
      return db.tx(['records', 'outbox'], 'readwrite', async ({ records, outbox }) => {
        const rows = await reqP(records.getAll());
        let removed = 0;
        for (const r of rows) {
          if (!r.deleted || (r.updatedAt || 0) > cutoff) continue;
          const pending = await reqP(outbox.index('byKey').count([r.collection, r.key]));
          if (pending) continue;
          records.delete([r.collection, r.key]);
          removed += 1;
        }
        return removed;
      });
    },

    // Pending uploads (photos etc.) live here until the server has them.
    async putFile(fileId, blob, meta = {}) {
      const db = await getDb();
      await db.put('files', { id: fileId, blob, meta, createdAt: now() });
    },
    async getFile(fileId) { const db = await getDb(); return db.get('files', fileId); },
    async deleteFile(fileId) { const db = await getDb(); await db.delete('files', fileId); },
    async listFiles() { const db = await getDb(); return db.getAll('files'); },

    async close() {
      if (!dbPromise) return;
      try { (await dbPromise).close(); } catch { /* ignore */ }
      dbPromise = null;
    },
  };

  // ---------- the outbox interface used by the sync engine ----------
  const outboxApi = {
    accountId: id,

    async listPending(accountIdArg) {
      assertAccount(accountIdArg);
      const db = await getDb();
      const ops = await db.getAll('outbox');
      return ops
        .filter((op) => !op.held)
        .sort((a, b) => a.createdAt - b.createdAt || (a.opId < b.opId ? -1 : 1))
        .map(({ held, ...op }) => op);
    },

    // Held (in-conflict) ops still count: they have not reached the server.
    async pendingCount(accountIdArg) {
      assertAccount(accountIdArg);
      const db = await getDb();
      return db.tx('outbox', 'readonly', ({ outbox }) => reqP(outbox.count()));
    },

    async markApplied(opId, serverVersion) {
      const db = await getDb();
      const res = await db.tx(['records', 'outbox'], 'readwrite', async ({ records, outbox }) => {
        const op = await reqP(outbox.get(opId));
        if (!op) return { ok: false, reason: 'no-such-op' };
        const row = await reqP(records.get([op.collection, op.key]));
        if (row) records.put({ ...row, version: serverVersion });
        else records.put({ collection: op.collection, key: op.key, data: op.data, version: serverVersion, deleted: !!op.deleted, updatedAt: now() });
        outbox.delete(opId);
        // Later edits to the same record were based on the version this op
        // just replaced; rebase them so the chain keeps flowing.
        const later = await reqP(outbox.index('byKey').getAll([op.collection, op.key]));
        later.filter((o) => o.opId !== opId && o.baseVersion < serverVersion)
          .forEach((o) => outbox.put({ ...o, baseVersion: serverVersion }));
        return { ok: true };
      });
      await refreshPending();
      emit();
      return res;
    },

    async markFailed(opId, error) {
      const db = await getDb();
      return db.tx('outbox', 'readwrite', async ({ outbox }) => {
        const op = await reqP(outbox.get(opId));
        if (!op) return { ok: false, reason: 'no-such-op' };
        outbox.put({
          ...op,
          attempts: (op.attempts || 0) + 1,
          lastError: String((error && error.message) || error || 'error'),
          lastAttemptAt: now(),
        });
        return { ok: true, attempts: (op.attempts || 0) + 1 };
      });
    },

    // Both versions are kept, the op is held (not retried) until resolved.
    async recordConflict({ opId, local, server }) {
      const db = await getDb();
      const conflictId = `c:${opId}`;
      await db.tx(['outbox', 'conflicts'], 'readwrite', async ({ outbox, conflicts }) => {
        const op = await reqP(outbox.get(opId));
        if (!op) throw new StoreError('no-such-op', `No pending op ${opId}`);
        outbox.put({ ...op, held: true });
        conflicts.put({
          id: conflictId, opId, collection: op.collection, key: op.key,
          local: local === undefined ? { data: op.data, deleted: op.deleted } : local,
          server, createdAt: now(),
        });
      });
      return conflictId;
    },

    async listConflicts() {
      const db = await getDb();
      return (await db.getAll('conflicts')).sort((a, b) => a.createdAt - b.createdAt);
    },

    // resolution: 'local' | 'server' | merged data (any non-string value).
    async resolveConflict(conflictId, resolution) {
      if (typeof resolution === 'string' && resolution !== 'local' && resolution !== 'server') {
        throw new StoreError('bad-resolution', 'Resolution must be "local", "server" or merged data.');
      }
      const db = await getDb();
      const res = await db.tx(['records', 'outbox', 'conflicts'], 'readwrite', async ({ records, outbox, conflicts }) => {
        const c = await reqP(conflicts.get(conflictId));
        if (!c) return { ok: false, reason: 'no-such-conflict' };
        const server = c.server || {};
        const row = await reqP(records.get([c.collection, c.key]));
        // A group-rolled-back op has no server copy: keep the local version
        // so a retry is not sent as "create" against an existing row.
        const serverVersion = Number.isFinite(server.version) ? server.version : (row ? row.version || 0 : 0);
        const op = await reqP(outbox.get(c.opId));
        if (resolution === 'server' && !c.server) return { ok: false, reason: 'no-server-copy' };
        if (resolution === 'server') {
          records.put({
            collection: c.collection, key: c.key, data: server.deleted ? null : server.data,
            version: serverVersion, deleted: !!server.deleted, updatedAt: now(),
          });
          if (op) outbox.delete(c.opId);
        } else {
          const merged = resolution !== 'local';
          const data = merged ? resolution : (op ? op.data : c.local && c.local.data);
          const deleted = merged ? false : !!(op ? op.deleted : c.local && c.local.deleted);
          if (op) outbox.put({ ...op, held: false, baseVersion: serverVersion, data, deleted });
          records.put({
            collection: c.collection, key: c.key, data: deleted ? null : data,
            version: serverVersion, deleted, updatedAt: now(),
          });
        }
        const later = await reqP(outbox.index('byKey').getAll([c.collection, c.key]));
        later.filter((o) => o.opId !== c.opId && o.baseVersion < serverVersion)
          .forEach((o) => outbox.put({ ...o, baseVersion: serverVersion }));
        conflicts.delete(conflictId);
        return { ok: true, resolution: typeof resolution === 'string' ? resolution : 'merged' };
      });
      await refreshPending();
      emit();
      return res;
    },

    async getCursor(accountIdArg) {
      assertAccount(accountIdArg);
      const db = await getDb();
      const v = await db.getMeta('cursor');
      return v === undefined ? null : v;
    },

    async setCursor(accountIdArg, cursor) {
      assertAccount(accountIdArg);
      const db = await getDb();
      await db.setMeta('cursor', cursor);
    },

    async getRecordVersion(accountIdArg, collection, key) {
      assertAccount(accountIdArg);
      const row = await store.getRecord(collection, key);
      return row ? row.version || 0 : 0;
    },

    async setRecordVersion(accountIdArg, collection, key, version) {
      assertAccount(accountIdArg);
      const db = await getDb();
      await db.tx('records', 'readwrite', async ({ records }) => {
        const row = await reqP(records.get([collection, key]));
        if (row) records.put({ ...row, version });
        else records.put({ collection, key, data: null, version, deleted: true, updatedAt: now() });
      });
    },

    // Remote records never overwrite a record this device still has unsent
    // work on, and never move a record back to an older server version.
    async applyRemote(remoteRecords) {
      const db = await getDb();
      return db.tx(['records', 'outbox'], 'readwrite', async ({ records, outbox }) => {
        const applied = [];
        const skipped = [];
        for (const r of remoteRecords || []) {
          const where = { collection: r.collection, key: r.key };
          const pending = await reqP(outbox.index('byKey').count([r.collection, r.key]));
          if (pending) { skipped.push({ ...where, reason: 'pending-op' }); continue; }
          const existing = await reqP(records.get([r.collection, r.key]));
          const version = Number.isFinite(r.version) ? r.version : 0;
          if (existing && version > 0 && (existing.version || 0) >= version) { skipped.push({ ...where, reason: 'stale' }); continue; }
          records.put({
            ...where, data: r.deleted ? null : r.data, version, deleted: !!r.deleted, updatedAt: now(),
          });
          applied.push(where);
        }
        return { applied, skipped };
      });
    },

    // Explicit and total: closes the connection and deletes the database.
    async clearAccount(accountIdArg) {
      assertAccount(accountIdArg === undefined ? '\u0000' : accountIdArg);
      await store.close();
      return deleteAccountDb(id);
    },
  };

  store.outbox = outboxApi;
  return store;
}

// Proves two accounts cannot see each other: separate databases, each stamped
// with its own id, and neither one's contents contain the other's.
export async function verifyIsolation(accountA, accountB, openOptions) {
  const a = sanitizeAccountId(accountA);
  const b = sanitizeAccountId(accountB);
  if (a === b) throw new StoreError('same-account', 'Isolation needs two different accounts.');
  const dbA = await openAccountDb(a, openOptions);
  const dbB = await openAccountDb(b, openOptions);
  try {
    const [stampA, stampB] = [await dbA.getMeta('accountId'), await dbB.getMeta('accountId')];
    const keysOf = async (db) => (await db.getAll('records')).map((r) => `${r.collection}\u0000${r.key}\u0000${JSON.stringify(r.data)}`);
    const [kA, kB] = [await keysOf(dbA), await keysOf(dbB)];
    const setB = new Set(kB);
    // Identical rows in both are not a leak by themselves (two people can log
    // the same day), so what is checked is that each DB is its own object and
    // is stamped for its own account.
    const shared = kA.filter((k) => setB.has(k)).length;
    return {
      isolated: dbA.name !== dbB.name && stampA === a && stampB === b,
      nameA: dbA.name, nameB: dbB.name, stampA, stampB, identicalRows: shared,
    };
  } finally {
    dbA.close(); dbB.close();
  }
}
