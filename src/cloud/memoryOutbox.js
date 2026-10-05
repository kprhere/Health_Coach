// In-memory Outbox, used by tests and as the reference for the interface the
// sync engine depends on. The IndexedDB implementation must behave the same.
//
// Interface (every method may be sync or async):
//   listPending(accountId)  -> [{opId, collection, key, baseVersion, data, deleted, group?, createdAt, attempts}]
//   markApplied(opId, serverVersion)       op leaves the queue, record version advances
//   markFailed(opId, error)                attempts++ and remember the error; op stays queued
//   recordConflict({opId, local, server})  op leaves the queue, BOTH sides are kept
//   getCursor(accountId) / setCursor(accountId, cursor)
//   getRecordVersion(accountId, collection, key) / setRecordVersion(accountId, collection, key, v)
//   applyRemote(records, accountId)        store pulled records (+ their versions)
// Optional, used when present:
//   listConflicts(accountId) -> [{opId, local, server, reason?}]
//
// Test/app helpers (not required by the engine): enqueue, resolveConflict,
// getRecord, listRecords.

const keyOf = (collection, key) => `${collection}\u0000${key}`;

export function createMemoryOutbox({ now = () => Date.now(), newId = () => globalThis.crypto.randomUUID() } = {}) {
  const accounts = new Map();
  const acct = (id) => {
    if (!accounts.has(id)) {
      accounts.set(id, { ops: [], conflicts: [], cursor: null, versions: new Map(), records: new Map() });
    }
    return accounts.get(id);
  };
  const findOp = (opId) => {
    for (const [accountId, a] of accounts) {
      const op = a.ops.find((o) => o.opId === opId);
      if (op) return { accountId, a, op };
    }
    return null;
  };
  const clone = (x) => (x === undefined ? x : structuredClone(x));

  return {
    // --- app side -------------------------------------------------------
    enqueue(accountId, { collection, key, data = {}, deleted = false, group, baseVersion, opId } = {}) {
      const a = acct(accountId);
      const base = baseVersion !== undefined ? baseVersion : (a.versions.get(keyOf(collection, key)) ?? null);
      const op = {
        opId: opId || newId(), accountId, collection, key, baseVersion: base,
        data: clone(data), deleted: !!deleted, group, createdAt: now(), attempts: 0,
      };
      a.ops.push(op);
      // Local view reflects the write immediately.
      const prev = a.records.get(keyOf(collection, key));
      a.records.set(keyOf(collection, key), {
        collection, key, data: clone(data), version: prev?.version ?? base ?? 0,
        updatedAt: null, deletedAt: deleted ? new Date(now()).toISOString() : null, local: true,
      });
      return clone(op);
    },
    resolveConflict(accountId, opId) {
      const a = acct(accountId);
      a.conflicts = a.conflicts.filter((c) => c.opId !== opId);
    },
    getRecord(accountId, collection, key) { return clone(acct(accountId).records.get(keyOf(collection, key))); },
    listRecords(accountId) { return clone([...acct(accountId).records.values()]); },

    // --- engine side ----------------------------------------------------
    listPending(accountId) { return clone(acct(accountId).ops); },
    markApplied(opId, serverVersion) {
      const f = findOp(opId);
      if (!f) return;
      f.a.ops = f.a.ops.filter((o) => o.opId !== opId);
      if (serverVersion !== undefined && serverVersion !== null) {
        f.a.versions.set(keyOf(f.op.collection, f.op.key), serverVersion);
        const rec = f.a.records.get(keyOf(f.op.collection, f.op.key));
        if (rec) rec.version = Math.max(rec.version || 0, serverVersion);
      }
    },
    markFailed(opId, error) {
      const f = findOp(opId);
      if (!f) return;
      f.op.attempts += 1;
      f.op.lastError = String(error?.message || error);
    },
    recordConflict({ opId, local, server, reason }) {
      const f = findOp(opId);
      const accountId = f ? f.accountId : local?.accountId;
      const a = acct(accountId);
      if (f) a.ops = a.ops.filter((o) => o.opId !== opId);
      a.conflicts.push({ opId, local: clone(local), server: clone(server), reason, recordedAt: now() });
    },
    listConflicts(accountId) { return clone(acct(accountId).conflicts); },
    getCursor(accountId) { return acct(accountId).cursor; },
    setCursor(accountId, cursor) { acct(accountId).cursor = cursor; },
    getRecordVersion(accountId, collection, key) { return acct(accountId).versions.get(keyOf(collection, key)) ?? null; },
    setRecordVersion(accountId, collection, key, version) { acct(accountId).versions.set(keyOf(collection, key), version); },
    applyRemote(records, accountId) {
      for (const r of records) {
        const a = acct(accountId ?? r.accountId);
        a.records.set(keyOf(r.collection, r.key), clone({ ...r, local: false }));
        a.versions.set(keyOf(r.collection, r.key), r.version);
      }
    },
  };
}
