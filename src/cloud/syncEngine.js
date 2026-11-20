// Sync engine: pushes the local outbox to the server and pulls remote changes.
// Transport and outbox are injected, so everything here is testable without a
// network or a browser. See memoryOutbox.js for the outbox interface.
//
//   transport.pushOps(ops)       -> {applied:[{op_id,version}], duplicates:[{op_id,version}|id],
//                                    conflicts:[{op_id, server}], rolled_back:[op_id]}
//   transport.pullChanges(since, limit) -> [{collection,key,data,version,updatedAt,deletedAt}]
//   Transport failures are thrown. `err.code === 'NETWORK'` (or status 0) means
//   unreachable; `err.status` carries an HTTP status when there is one.
//
// Safety rules the engine enforces:
//   * every op carries expected_version, so a delayed or replayed request can
//     never overwrite a newer server row (the server answers with a conflict)
//   * op ids are stable across retries; "duplicate" is success
//   * a conflict never overwrites either side: both are handed to
//     outbox.recordConflict and surfaced through onConflict
//   * pulled records never touch keys with pending ops or unresolved conflicts

export const normalizeRecord = (row) => (row ? {
  collection: row.collection,
  key: row.key,
  data: row.data,
  version: row.version,
  updatedAt: row.updatedAt ?? row.updated_at ?? null,
  deletedAt: row.deletedAt ?? row.deleted_at ?? null,
  // The store reads `deleted`; the server only sends a tombstone timestamp.
  deleted: !!(row.deleted ?? row.deletedAt ?? row.deleted_at),
} : null);

const tsValue = (s) => (s ? Date.parse(s) : -Infinity);
const tsMax = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const d = tsValue(a) - tsValue(b);
  if (d !== 0) return d > 0 ? a : b;
  return a >= b ? a : b;
};
const keyOf = (c, k) => `${c}\u0000${k}`;

export function classifyError(err) {
  if (!err) return 'server';
  if (err.code === 'NETWORK' || err.offline === true || err.status === 0 || err.name === 'TypeError' || err.name === 'AbortError') return 'network';
  const s = err.status;
  if (s === 401 || s === 403) return 'auth';
  if (err.permanent === true) return 'permanent';
  if (typeof s === 'number' && s >= 400 && s < 500 && s !== 408 && s !== 429) return 'permanent';
  return 'server';
}

export function createSyncEngine({
  accountId, outbox, transport, onConflict, onStatus,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
  random = Math.random,
  batchSize = 50, baseDelayMs = 1000, maxDelayMs = 60000, maxAttempts = 8, pageSize = 500,
} = {}) {
  if (!accountId) throw new Error('accountId is required');
  if (!outbox || !transport) throw new Error('outbox and transport are required');

  const failed = new Map(); // opId -> error (not retried until app intervenes)
  const sessionConflicts = [];
  let offline = false;
  let authError = false;
  let pendingCount = 0;
  let conflictCount = 0;
  let failures = 0;
  let retryHandle = null;
  let flushSoonHandle = null;
  let flushing = null;
  let stopped = false;
  let lastStatus = null;
  let lastSyncAt = null;

  function status() {
    if (conflictCount > 0) return 'conflict';
    if (failed.size > 0 || authError) return 'failed';
    if (offline) return 'offline';
    if (pendingCount > 0 || flushing) return 'pending';
    return 'synced';
  }
  const emit = () => {
    const s = status();
    if (s !== lastStatus) {
      lastStatus = s;
      if (onStatus) onStatus(s);
    }
  };

  async function refresh() {
    const pending = await outbox.listPending(accountId);
    pendingCount = pending.length;
    conflictCount = outbox.listConflicts ? (await outbox.listConflicts(accountId)).length : sessionConflicts.length;
    emit();
    return pending;
  }

  // delay for the nth consecutive failure: exponential, capped, half jittered
  function backoffDelay(n) {
    const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, n - 1));
    return Math.round(cap / 2 + random() * (cap / 2));
  }
  function clearRetry() {
    if (retryHandle !== null) { clearTimer(retryHandle); retryHandle = null; }
  }
  function scheduleRetry() {
    clearRetry();
    if (stopped) return;
    failures += 1;
    const delay = backoffDelay(failures);
    api.lastRetryDelayMs = delay;
    retryHandle = setTimer(() => { retryHandle = null; return api.sync().catch(() => {}); }, delay);
  }

  const toWire = (o, expected) => ({
    op_id: o.opId,
    collection: o.collection,
    key: o.key,
    expected_version: expected,
    data: o.data === undefined ? {} : o.data,
    delete: !!o.deleted,
    ...(o.group ? { atomic_group: o.group } : {}),
  });
  const localOf = (o) => ({
    opId: o.opId, accountId, collection: o.collection, key: o.key, baseVersion: o.baseVersion ?? null,
    data: o.data, deleted: !!o.deleted, group: o.group, createdAt: o.createdAt,
  });

  async function recordConflict(o, server, reason) {
    const conflict = { opId: o.opId, local: localOf(o), server: normalizeRecord(server), reason };
    await outbox.recordConflict(conflict);
    sessionConflicts.push(conflict);
    if (onConflict) onConflict(conflict);
  }

  // The outbox's recorded versions may be async, so they are resolved up front
  // once per flush (see doFlush) and read synchronously here.
  const versionCache = new Map();

  // Sends one batch. Returns 'ok' | 'stop'. Throws nothing for transport errors.
  async function sendBatch(batch, ctx) {
    const ops = batch.map((o) => {
      const k = keyOf(o.collection, o.key);
      // Own earlier writes to the same key (this flush, or a previous session
      // whose result the outbox already recorded) are our own history.
      const local = (versionCache.get(k) ?? 0);
      const expected = Math.max(o.baseVersion ?? 0, local, ctx.predicted.get(k) ?? 0);
      ctx.predicted.set(k, expected + 1);
      return toWire(o, expected === 0 ? null : expected);
    });
    let res;
    try {
      res = await transport.pushOps(ops);
    } catch (err) {
      const kind = classifyError(err);
      if (kind === 'network') {
        offline = true;
        ctx.error = err;
        return 'stop';
      }
      if (kind === 'auth') {
        authError = true;
        ctx.error = err;
        return 'stop';
      }
      if (kind === 'permanent') {
        // One bad op must not poison its neighbours: isolate it. An atomic
        // group stays together, or its all-or-nothing guarantee is lost.
        const units = [];
        for (const o of batch) {
          const u = o.group ? units.find((x) => x[0].group === o.group) : null;
          if (u) u.push(o); else units.push([o]);
        }
        if (units.length > 1) {
          for (const unit of units) {
            ctx.predicted.clear();
            const r = await sendBatch(unit, ctx);
            if (r === 'stop') return 'stop';
          }
          return 'ok';
        }
        for (const o of batch) {
          failed.set(o.opId, err);
          await outbox.markFailed(o.opId, Object.assign(err, { permanent: true }));
        }
        return 'ok';
      }
      for (const o of batch) await outbox.markFailed(o.opId, err);
      ctx.error = err;
      ctx.serverError = true;
      return 'stop';
    }

    offline = false;
    authError = false;
    failures = 0;
    const byId = new Map(batch.map((o) => [o.opId, o]));
    for (const a of res.applied || []) {
      const o = byId.get(a.op_id);
      if (!o) continue;
      await outbox.markApplied(o.opId, a.version);
      ctx.predicted.set(keyOf(o.collection, o.key), a.version);
      ctx.applied += 1;
    }
    for (const d of res.duplicates || []) {
      const id = typeof d === 'string' ? d : d.op_id;
      const o = byId.get(id);
      if (!o) continue;
      await outbox.markApplied(o.opId, typeof d === 'string' ? undefined : d.version);
      ctx.duplicates += 1;
    }
    for (const c of res.conflicts || []) {
      const o = byId.get(c.op_id);
      if (!o) continue;
      await recordConflict(o, c.server, 'version-mismatch');
      ctx.blocked.add(keyOf(o.collection, o.key));
      ctx.conflicts += 1;
    }
    for (const id of res.rolled_back || []) {
      const o = byId.get(id);
      if (!o) continue;
      await recordConflict(o, null, 'group-rolled-back');
      ctx.blocked.add(keyOf(o.collection, o.key));
      ctx.conflicts += 1;
    }
    return 'ok';
  }

  async function doFlush() {
    clearRetry();
    const summary = {
      applied: 0, duplicates: 0, conflicts: 0, remaining: 0, error: null,
    };
    const pending = await outbox.listPending(accountId);
    const ctx = {
      predicted: new Map(), blocked: new Set(), applied: 0, duplicates: 0, conflicts: 0, error: null, serverError: false,
    };
    versionCache.clear();
    for (const o of pending) {
      const k = keyOf(o.collection, o.key);
      if (!versionCache.has(k)) versionCache.set(k, await outbox.getRecordVersion(accountId, o.collection, o.key));
    }
    let work = [];
    for (const o of pending) {
      if (failed.has(o.opId)) continue;
      if ((o.attempts || 0) >= maxAttempts) {
        failed.set(o.opId, new Error(o.lastError || 'too many attempts'));
        continue;
      }
      work.push(o);
    }
    let stop = false;
    while (work.length && !stop) {
      const batch = [];
      const rest = [];
      const inBatch = new Set();
      const taken = new Set();
      for (const o of work) {
        if (taken.has(o.opId)) continue;
        // An atomic group always travels in ONE request, or atomicity is lost.
        const unit = o.group ? work.filter((x) => x.group === o.group) : [o];
        unit.forEach((x) => taken.add(x.opId));
        const keys = unit.map((x) => keyOf(x.collection, x.key));
        if (keys.some((k) => ctx.blocked.has(k))) continue; // stays pending behind its conflict
        // One op per key per request (outside a group): a later op on the same
        // key is only sent once the earlier one's real outcome is known.
        // Predicting it could let a chained op slip through after its
        // predecessor conflicted and overwrite the other side.
        const clash = keys.some((k) => inBatch.has(k)) || (!o.group && inBatch.has(keys[0]));
        const full = batch.length > 0 && batch.length + unit.length > batchSize;
        if (clash || full) { rest.push(...unit); continue; }
        batch.push(...unit);
        keys.forEach((k) => inBatch.add(k));
      }
      work = rest;
      if (!batch.length) break;
      stop = (await sendBatch(batch, ctx)) === 'stop';
    }
    Object.assign(summary, {
      applied: ctx.applied, duplicates: ctx.duplicates, conflicts: ctx.conflicts, error: ctx.error,
    });
    await refresh();
    summary.remaining = pendingCount;
    if (ctx.error && !authError) scheduleRetry();
    emit();
    return summary;
  }

  async function doPull() {
    const summary = { applied: 0, skipped: 0, error: null };
    try {
      let cursor = await outbox.getCursor(accountId);
      for (let page = 0; page < 200; page += 1) {
        const rows = (await transport.pullChanges(cursor, pageSize)).map(normalizeRecord);
        offline = false;
        authError = false;
        const pending = await outbox.listPending(accountId);
        const protectedKeys = new Set(pending.map((o) => keyOf(o.collection, o.key)));
        const conflicts = outbox.listConflicts ? await outbox.listConflicts(accountId) : sessionConflicts;
        for (const c of conflicts) if (c.local) protectedKeys.add(keyOf(c.local.collection, c.local.key));

        const fresh = [];
        for (const r of rows) {
          if (protectedKeys.has(keyOf(r.collection, r.key))) { summary.skipped += 1; continue; }
          const have = await outbox.getRecordVersion(accountId, r.collection, r.key);
          if (have !== null && have !== undefined && r.version <= have) { summary.skipped += 1; continue; }
          fresh.push(r);
        }
        if (fresh.length) await outbox.applyRemote(fresh, accountId);
        summary.applied += fresh.length;

        let maxTs = cursor;
        for (const r of rows) maxTs = tsMax(maxTs, r.updatedAt);
        const progressed = maxTs !== cursor;
        if (maxTs) await outbox.setCursor(accountId, maxTs);
        if (rows.length < pageSize || !progressed) break;
        cursor = maxTs;
      }
      lastSyncAt = now();
    } catch (err) {
      const kind = classifyError(err);
      summary.error = err;
      if (kind === 'network') offline = true;
      else if (kind === 'auth') authError = true;
      if (kind !== 'auth') scheduleRetry();
    }
    await refresh();
    return summary;
  }

  const api = {
    lastRetryDelayMs: null,
    accountId,
    status,
    refresh,
    backoffDelay,
    flush() {
      if (!flushing) {
        flushing = doFlush().finally(() => { flushing = null; emit(); });
        emit();
      }
      return flushing;
    },
    pull() { return doPull(); },
    async sync() {
      const pushed = await api.flush();
      if (pushed.error) return { pushed, pulled: null };
      const pulled = await doPull();
      return { pushed, pulled };
    },
    // Call after every local write: marks the engine dirty and flushes soon.
    notifyLocalChange(delayMs = 300) {
      pendingCount += 1;
      emit();
      if (stopped || flushSoonHandle !== null) return;
      flushSoonHandle = setTimer(() => { flushSoonHandle = null; return api.sync().catch(() => {}); }, delayMs);
    },
    // Connectivity came back, or the user asked to retry: skip the backoff wait.
    resume() {
      failures = 0;
      authError = false;
      failed.clear();
      return api.sync();
    },
    // The guard to run before logout or switching accounts.
    async canSwitchAccount() {
      const pending = await outbox.listPending(accountId);
      const conflicts = outbox.listConflicts ? (await outbox.listConflicts(accountId)).length : sessionConflicts.length;
      if (pending.length > 0) return { ok: false, pendingCount: pending.length, conflictCount: conflicts };
      return { ok: true, pendingCount: 0, conflictCount: conflicts };
    },
    lastSyncAt: () => lastSyncAt,
    failedOps: () => [...failed.entries()].map(([opId, error]) => ({ opId, error: String(error?.message || error) })),
    stop() {
      stopped = true;
      clearRetry();
      if (flushSoonHandle !== null) { clearTimer(flushSoonHandle); flushSoonHandle = null; }
    },
  };
  return api;
}
