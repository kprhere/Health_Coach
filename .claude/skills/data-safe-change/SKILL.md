---
name: data-safe-change
description: Use before changing anything that touches saved user data in Health_Coach - state schema, migrations, storage, sync, import/export, or coaching writes. Enforces backup, versioned migration, verification and rollback.
---

# Data-safe change

Scope: any edit under `src/storage.js`, `src/store/`, `src/cloud/`, `src/backup.js`, `STATE_VERSION`, `MIGRATIONS`
in `src/helpers.js`, or code that writes `planOverrides`, `coach`, scans or sessions.

## Workflow
1. Read `docs/DATA_INVENTORY.md`. Say which collections you touch.
2. A schema change is a new numbered migration in `MIGRATIONS`. Never edit an old one. Additive only: unknown fields must survive (`mergeState` carries them).
3. Take a snapshot first (`snapshot(reason, state)` in `src/storage.js`) for anything that can lower a record count.
4. Write migrated data separately; activate only after verifying counts (`recordCounts`) and critical values (set weights/reps, scan fields, notes).
5. Keep the original bytes for rollback. On failure, keep the old data and surface recovery options.
6. Add tests with synthetic fixtures: happy path, interrupted run, corrupted input, rollback.

## Never
- Reset storage, seed over an account, or replace unreadable data with an empty state.
- Merge one account's local data into another automatically.
- Show "saved" before the write has completed.
- Put real personal data in tests, fixtures, docs or screenshots.

## Done when
`npm test` and `npx vite build` pass, the new migration has a rollback test, and the data inventory is updated.
