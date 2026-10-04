# Local storage, sync queue and backups

How data is kept on a device, how it waits to be synced, and what to do when something goes wrong.
Code: `src/store/` (records, idb, localStore, migrateFromLocalStorage, quota), `src/storage.js`, `src/backup.js`.
Sync-server setup lives in `docs/SETUP_SUPABASE.md`.

## 1. Local store (IndexedDB)

One IndexedDB database per account: `recomp-<accountId>` (`recomp-local` for a device that is not signed in).
The account id is validated strictly (`[A-Za-z0-9_-]`, 1-64 chars) and stamped into the database on first open;
a database stamped for a different account is refused. Accounts never share a store, an outbox or a conflict list.
Deleting an account is explicit (`store.outbox.clearAccount(id)`) and deletes that one database only.

Object stores (schema version `DB_VERSION`, currently 2):

| Store | Holds |
|---|---|
| `records` | one row per record: `{collection, key, data, version, deleted, updatedAt}` |
| `outbox` | unsent changes (see section 2) |
| `conflicts` | both sides of any conflict, until resolved |
| `meta` | cursor, account stamp, migration flags |
| `files` | blobs waiting to upload (scan photos) |
| `staging` | migration staging area, never read by `load()` |

State is split into records so one day's log is one row: per-date maps (`workoutSessions`, `mealLogs`, ...),
`bodyScans` and `planVersions` by id, `coach.proposals` / `coach.audit`, the singletons `profile`, `settings`,
`program`, and `meta` for every other top-level field, including ones from future versions. Nothing is dropped:
`assembleState(explodeState(s))` equals `s`. Array order is kept in `meta` records named `order:<field>`;
`$fields` records which containers exist (so an empty map stays an empty map) and is device-local.

Schema upgrades are cumulative functions in `SCHEMA_UPGRADES`. They only ever add stores or indexes. A database
written by a newer schema is refused (`version-newer`) rather than downgraded. If another tab holds the database
open during an upgrade the old connection closes itself (`onversionchange`) and the app is told to reload.

### Saving states

`commit(prev, next, {accountMode})` is the only write path. It diffs the two states, then, in ONE transaction,
upserts the changed records and (when `accountMode`) appends one outbox op per change. After a crash either both
the record and its op exist, or neither does. No-op diffs write nothing.

`saveStatus` is one of:

* `saving` - a transaction is in flight.
* `saved` - emitted ONLY after the transaction's `oncomplete`. A request succeeding is not "saved".
* `failed` - the transaction aborted. `status.reason` says why (`quota`, `aborted`, `closed`, `unavailable`...).

While failed, the store keeps the newest state that is not on disk (`getUnsaved()`) and the last state that is,
so later edits still include the change that failed. `retry()` re-commits it; `exportUnsavedState(store)` builds a
verified backup of it. The UI must show `failed` prominently and offer Retry and Export.
`pendingCount()` is the number of changes not yet acknowledged by the server ("pending sync"); a held conflict still counts.

## 2. Outbox

Each change made in account mode becomes an op:
`{opId (uuid), collection, key, baseVersion, data, deleted, group, createdAt, attempts}`.

* `baseVersion` is the server version this device last saw for that record (0 if never synced).
* `group` ties together ops from one user action (one commit), e.g. a workout swap's two dates plus its `planOverrides`;
  the sync engine should send a group together.
* Several edits to the same record queue several ops in order. When one is applied, later ones for the same record
  are rebased onto the new server version.
* `markApplied(opId, serverVersion)` removes the op and records the version. `markFailed` increments `attempts`.
* `applyRemote(records)` writes server records but never over a record that still has a pending op, and never
  moves a record to an older version.
* Device-local meta (`$fields`) is never queued.
* The op ids are generated once at commit and stored: a crash and restart finds the same ops, never duplicates.

## 3. Conflicts

When the server rejects an op because its `baseVersion` is stale, the engine calls
`recordConflict({opId, local, server})`. Both versions are stored and the op is HELD (not retried, still counted as pending).
`resolveConflict(id, 'local' | 'server' | mergedData)`:

* `local` - keep this device's version, rebase the op onto the server version, send it.
* `server` - take the server's version, drop the held op.
* merged - store the merged data as the record and re-queue it.

Nothing is auto-resolved by overwriting. Any local record with unsent work is protected from remote overwrite.

## 4. Quota and storage pressure

`estimateStorage()` wraps `navigator.storage.estimate()`; `requestPersistence()` asks the browser not to evict
this origin (iOS may ignore it). A write that hits the quota rejects with `reason: 'quota'`; `classifyFailure()`
returns a user message plus `needsExport`. Photos are kept in the `files` store only until uploaded. Free space,
then Retry; if the user cannot free space, Export first.

## 5. Export and import

Backups are `src/backup.js` schema 2: `{format, schema:2, stateVersion, exportedAt, owner, counts, sha256, state}`.
Import verifies the checksum and record counts before anything touches the device, and previews what a merge
(additive) or a replace (shows what would be lost) would do. Any operation that lowers a record count takes a
snapshot first. Export from a failed save uses `exportUnsavedState` / `downloadUnsavedState`, so the file holds
the unsaved changes too.

## 6. Recovery tiers (what to try, in order)

1. **Retry** the failed save (frees space, reconnects).
2. **Export now** to a file; that file restores everything on any device.
3. **Server copy** (signed-in accounts): sign in on the device and let sync pull; local pending ops are protected.
4. **Local snapshots** in localStorage (`pre-idb-migration`, `pre-idb-rollback`, `records-removed`, `pre-migration-v*`;
   newest 5 kept) restore from the snapshot list.
5. **Backup copy** (`recomp-os-v1.backup`) and **quarantined** unreadable data (`recomp-os-v1.unreadable`): the
   previous good copy and the raw bytes of anything that could not be parsed. Nothing unreadable is discarded.
6. **Migration rollback**: `rollbackMigration()` returns to the legacy blob (see section 7).

## 7. Migration from the old localStorage blob

`bootState()` is called once at start-up. On a device that has not migrated it:

1. snapshots the legacy state (`pre-idb-migration`),
2. runs `migrateState`, explodes it and writes it to the STAGING store,
3. verifies: record counts equal, assembled state deep-equals the migrated state, and every workout set, scan field,
   note, custom exercise, restart weight and swap compares identical (strict, including types),
4. only then activates in one transaction (`migration:activated`).

The localStorage blob, its backup and its snapshots are never modified or deleted. Until activation, and whenever
verification fails or is interrupted, the legacy path stays the source of truth (`source: 'legacy'` with a `degraded`
reason) and the migration is retried on the next boot. If IndexedDB is unsupported or fails to open, the app runs on
the legacy path and reports `degraded`.

After activation, new edits go to IndexedDB only. `rollbackMigration()` ignores IndexedDB again; edits made since
activation are preserved in a localStorage snapshot (`pre-idb-rollback`) and parked in the database, and the device
stays on the legacy path until a forced re-migration. Because legacy storage is no longer updated, a rollback
returns to the pre-migration data plus whatever the user restores from that snapshot.

## 8. Browser data can be lost

IndexedDB and localStorage are the browser's to delete. Clearing site data, "Clear history and website data" on iOS,
uninstalling the home-screen app, or iOS removing data from a site not opened for about seven days can erase everything
on a device that has never synced or exported. Tell users:

* signed-in devices are protected by the server copy once the pending count reaches zero;
* devices that are not signed in should export regularly (the app tracks `lastBackup`);
* pending (unsynced) changes exist only on that device until they sync.

## 9. Retention

* Snapshots: newest 5 in localStorage (`MAX_SNAPSHOTS`); oldest are dropped first when space is needed.
* Backup copy: one previous good copy.
* Tombstones (deleted records kept so the delete can sync): purge with `purgeTombstones({olderThanMs})`
  (default 30 days) once no op is pending for them.
* Conflicts and held ops: kept until the user resolves them.
* Staging data: discarded after verification or failure; migration-parked rows are kept until the user clears them.
