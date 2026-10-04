// ============================================================
// migrateFromLocalStorage.js - moving an existing device from the single
// localStorage blob to the IndexedDB record store WITHOUT any chance of
// losing a set, a scan or a note.
//
// The protocol:
//   1. snapshot the legacy state (storage.js snapshot, label pre-idb-migration)
//   2. migrateState() it, explode it, write the records to a STAGING store
//      (a separate object store that load() never reads)
//   3. read the staging store back and VERIFY: record counts equal, the
//      assembled state deep-equals the migrated state, and every critical
//      subtree (sets, scans, notes...) compares identical value for value
//   4. only then, in one transaction, copy staging -> records and write the
//      'migration:activated' flag
// Until step 4 the legacy path is the source of truth. The localStorage blob,
// its backup and its snapshots are NEVER modified or deleted - rolling back
// is just "ignore IndexedDB". A crash at any point leaves either nothing
// active (legacy keeps working, migration re-runs) or everything active.
// ============================================================
import { readStoredState, snapshot, recordCounts, BACKUP_KEY } from '../storage.js';
import { STORAGE_KEY } from '../data.js';
import { loadState, migrateState, defaultState } from '../helpers.js';
import {
  openAccountDb, sanitizeAccountId, probeSupport, toStoreError, reqP,
} from './idb.js';
import { createLocalStore } from './localStore.js';
import {
  explodeState, assembleState, findMismatches, recordHash,
} from './records.js';

export const META_STAGING = 'migration:staging';
export const META_ACTIVATED = 'migration:activated';
export const META_ROLLED_BACK = 'migration:rolledBack';
export const META_FAILURE = 'migration:failure';
export const META_DISPLACED = 'migration:displaced-records';

// Whole subtrees whose every leaf is compared value for value.
const CRITICAL_FIELDS = [
  'workoutSessions', 'bodyScans', 'exerciseNotes', 'customExercises',
  'restartWeights', 'workoutSwaps', 'profile', 'settings',
];

const ACTIVE = new Set(['migrated', 'already-migrated', 'nothing-to-migrate']);

const rawPair = (storage) => {
  const read = (k) => { try { return storage ? storage.getItem(k) : null; } catch { return null; } };
  return { primary: read(STORAGE_KEY), backup: read(BACKUP_KEY) };
};

async function discardStaging(db) {
  await db.tx(['staging', 'meta'], 'readwrite', ({ staging, meta }) => {
    staging.clear();
    meta.delete(META_STAGING);
  });
}

// Compare what was staged against the state it came from.
export function verifyStaged(expectedState, stagedRows, expectedRecordCount) {
  const problems = [];
  if (stagedRows.length !== expectedRecordCount) {
    problems.push(`staged ${stagedRows.length} records, expected ${expectedRecordCount}`);
  }
  const assembled = assembleState(stagedRows);
  const before = recordCounts(expectedState);
  const after = recordCounts(assembled);
  Object.keys(before).forEach((k) => {
    if (before[k] !== after[k]) problems.push(`count ${k}: ${before[k]} != ${after[k]}`);
  });
  CRITICAL_FIELDS.forEach((f) => {
    findMismatches(expectedState[f], assembled[f], f, problems);
  });
  findMismatches(expectedState, assembled, '$', problems);
  return { ok: problems.length === 0, problems: [...new Set(problems)].slice(0, 20), counts: before, assembled };
}

export async function migrateLegacyState({
  accountId = 'local', storage = globalThis.localStorage, db, now = () => Date.now(), hooks = {}, force = false,
} = {}) {
  const id = sanitizeAccountId(accountId);
  if (!db) throw new Error('migrateLegacyState needs an open account database');
  const rollback = () => rollbackMigration({ accountId: id, db, storage });

  const activated = await db.getMeta(META_ACTIVATED);
  if (activated) return { status: 'already-migrated', counts: activated.counts, activatedAt: activated.at, rollback };

  if (!force && await db.getMeta(META_ROLLED_BACK)) {
    return { status: 'rolled-back', reason: 'rolled-back-by-user', rollback };
  }
  if (force) await db.deleteMeta(META_ROLLED_BACK);

  const interruptedBefore = !!(await db.getMeta(META_STAGING));
  const rawBefore = rawPair(storage);
  const legacy = readStoredState();

  if (legacy.source === 'unreadable') {
    return { status: 'failed', reason: 'legacy-unreadable', counts: null, rollback };
  }
  if (!legacy.state) {
    // A genuinely new device: nothing to carry over. Activate straight away so
    // later boots go to IndexedDB.
    await db.tx(['meta', 'staging'], 'readwrite', ({ meta, staging }) => {
      staging.clear();
      meta.delete(META_STAGING);
      meta.put({ key: META_ACTIVATED, value: { at: now(), counts: recordCounts({}), recordCount: 0, from: 'none' } });
    });
    return { status: 'nothing-to-migrate', counts: recordCounts({}), rollback };
  }

  // The safety net goes in BEFORE anything else happens.
  const snapshotKey = snapshot('pre-idb-migration', legacy.state);

  const migrated = migrateState(legacy.state);
  const ts = now();
  const rows = explodeState(migrated).map((r) => ({
    collection: r.collection, key: r.key, data: r.data, version: 0, deleted: false, updatedAt: ts,
  }));
  const counts = recordCounts(migrated);

  try {
    await db.tx(['staging', 'meta'], 'readwrite', ({ staging, meta }) => {
      staging.clear(); // a previous interrupted attempt is simply replaced
      rows.forEach((r) => staging.put(r));
      meta.put({ key: META_STAGING, value: { at: ts, recordCount: rows.length, counts } });
    });
    if (hooks.afterStaging) await hooks.afterStaging({ db, rows, migrated });

    const staged = await db.getAll('staging');
    const check = verifyStaged(migrated, staged, rows.length);
    if (!check.ok) {
      await discardStaging(db);
      await db.setMeta(META_FAILURE, { at: now(), reason: 'verification-failed', problems: check.problems });
      return { status: 'failed', reason: 'verification-failed', problems: check.problems, counts, snapshotKey, rollback };
    }

    if (hooks.beforeActivate) await hooks.beforeActivate({ db });

    const stateDigest = recordHash(migrated);
    await db.tx(['staging', 'records', 'meta'], 'readwrite', async ({ staging, records, meta }) => {
      const stagedNow = await reqP(staging.getAll());
      const existing = await reqP(records.getAll());
      // Nothing writes records before activation, so anything here is a
      // leftover. It is moved aside, never overwritten silently.
      if (existing.length) meta.put({ key: META_DISPLACED, value: { at: ts, rows: existing } });
      records.clear();
      stagedNow.forEach((r) => records.put(r));
      staging.clear();
      meta.delete(META_STAGING);
      meta.delete(META_FAILURE);
      meta.put({
        key: META_ACTIVATED,
        value: {
          at: ts, counts, recordCount: stagedNow.length, from: legacy.source, stateDigest, snapshotKey, resumed: interruptedBefore,
        },
      });
    });

    const rawAfter = rawPair(storage);
    return {
      status: 'migrated',
      counts,
      recordCount: rows.length,
      snapshotKey,
      resumed: interruptedBefore,
      legacyUntouched: rawAfter.primary === rawBefore.primary && rawAfter.backup === rawBefore.backup,
      rollback,
    };
  } catch (e) {
    // Anything thrown between staging and activation (including a simulated
    // crash). Staging is left in place on purpose: it is ignored, and the next
    // run replaces it. Legacy remains the source of truth.
    return {
      status: 'interrupted-resumable',
      reason: (e && e.message) || 'interrupted',
      error: toStoreError(e),
      counts,
      snapshotKey,
      rollback,
    };
  }
}

// Undo an activation, or discard unfinished staging. Never touches
// localStorage. If edits were made in IndexedDB since activation, they are
// kept: snapshotted into localStorage (restorable from the snapshot list) and
// the raw rows parked in the database.
export async function rollbackMigration({ accountId = 'local', db, storage = globalThis.localStorage, now = () => Date.now() } = {}) {
  sanitizeAccountId(accountId);
  void storage;
  const activated = await db.getMeta(META_ACTIVATED);
  if (!activated) {
    await discardStaging(db);
    return { status: 'staging-discarded' };
  }
  const rows = await db.getAll('records');
  const current = assembleState(rows);
  const edited = recordHash(current) !== activated.stateDigest;
  let snapshotKey = null;
  if (edited) snapshotKey = snapshot('pre-idb-rollback', current);
  await db.tx(['records', 'staging', 'meta'], 'readwrite', ({ records, staging, meta }) => {
    meta.put({ key: 'migration:rolledBack-records', value: { at: now(), rows } });
    records.clear();
    staging.clear();
    meta.delete(META_STAGING);
    meta.delete(META_ACTIVATED);
    meta.put({ key: META_ROLLED_BACK, value: { at: now(), edited, snapshotKey, parkedRecords: rows.length } });
  });
  return { status: 'rolled-back', preservedEdits: edited, snapshotKey, parkedRecords: rows.length };
}

// ---------- app boot ----------
// The one call the app makes at start-up. Always returns a usable state:
// if anything about IndexedDB fails, the legacy localStorage path is used and
// `degraded` says why so the UI can show a banner.
export async function bootState({
  accountId = 'local', storage = globalThis.localStorage, hooks = {},
  openOptions, loadLegacy = loadState, now,
} = {}) {
  const id = sanitizeAccountId(accountId);
  const legacy = (degradedReason, migration = null, detail = null) => ({
    state: loadLegacy(),
    store: null,
    source: 'legacy',
    migration,
    degraded: { reason: degradedReason, detail },
  });

  const probe = await probeSupport(openOptions && openOptions.indexedDB);
  if (!probe.supported) return legacy('idb-unsupported', null, probe.reason);

  let db;
  try {
    db = await openAccountDb(id, openOptions);
  } catch (e) {
    return legacy(`idb-open-failed:${toStoreError(e).reason}`, null, e && e.message);
  }

  let migration = null;
  try {
    if (id === 'local') {
      migration = await migrateLegacyState({ accountId: id, storage, db, hooks, ...(now ? { now } : {}) });
      if (!ACTIVE.has(migration.status)) {
        db.close();
        return legacy(`migration-${migration.status}`, migration, migration.reason);
      }
    }
    const store = createLocalStore(id, { db, ...(now ? { now } : {}) });
    const loaded = await store.load();
    const state = loaded.state ? migrateState(loaded.state) : migrateState(defaultState());
    // Persist version upgrades / new defaults locally. accountMode is off on
    // purpose: normalising on boot must not queue uploads.
    await store.commit(loaded.state || null, state, { accountMode: false });
    return { state, store, source: 'idb', migration, degraded: null, loadedFrom: loaded.source };
  } catch (e) {
    try { db.close(); } catch { /* ignore */ }
    return legacy(`idb-failed:${toStoreError(e).reason}`, migration, e && e.message);
  }
}
