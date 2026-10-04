# Data inventory

Everything the app stores, where it lives today (state v5, localStorage), and how it is protected.
Counted by `recordCounts()` in `src/storage.js` where marked **counted**: a write that lowers a counted
total takes a snapshot first.

| State key | Contents | Keyed by | Counted |
|---|---|---|---|
| `workoutSessions` | Sets (weight, reps, seconds, RPE, rest, form, pain, notes, warm-up/drop flags), rounds per exercise, skips, replacements, unplanned exercises, completion, notes | date | yes |
| `bodyScans` | Scan date, weight, body-fat %, fat/lean/skeletal/protein/mineral/water mass, visceral measures, waist, BMR/TEE | scan id | yes |
| `mealLogs` | Eaten meals, meal choices, extras, water, flags | date | yes |
| `habitLogs`, `watchLogs`, `supplementLogs` | Manual habits; steps/sleep/resting HR/HRV etc.; supplements taken | date | yes |
| `beverageLogs`, `activity` | Drinks; swim/badminton/walk | date | no |
| `exerciseNotes`, `customExercises` | Per-exercise notes; user equipment and machine metadata | exercise name | yes |
| `restartWeights` | Old working weight + restart % per exercise | exercise name | no |
| `workoutSwaps`, `saturdayMode`, `dayOverrides` | Swapped workout dates; class/fallback choice; food-plan overrides | date | no |
| `program` | The person's training split (blocks, targets, rationale) | - | no |
| `profile`, `settings` | Body profile and goals; program/restart/scan dates, targets, units, sync URL | - | no |
| `lastBackup`, `lastHealthSync` | Receipts | - | no |
| *(any other key)* | Carried through untouched by `migrateState` and `mergeSyncedState` (added in stage 1) | - | no |

Outside the state blob: `recomp-os-v1.backup` (previous good copy), `recomp-os-v1.unreadable` (quarantined
bytes), `recomp-os-v1.snapshot.*` (up to 5 labelled snapshots), `recomp-sync-secret` (sync passphrase, plain
localStorage), `recomp-sync-updated`, `recomp-no-moon-reminder-dismissed`.

## Backup file (schema 2)

`{ format, schema, stateVersion, exportedAt, owner, counts, sha256, state }`. Import verifies the checksum and
the counts before anything is touched, refuses files from a newer build, and asks for merge or replace. Replace
needs the typed word REPLACE, shows exactly which counted records exist only on the device, and snapshots first.
Older bare-state exports still import and are labelled unverified.

## Known limits

Browser storage can be cleared by the user, by Safari after inactivity, or lost with the device. Snapshots live
in the same storage and do not protect against that; only an exported file (or, later, the account copy) does.
