# Body Recomp OS

Mobile-first training, nutrition and body-scan app for a small private group (4-5 people). Installs to the iPhone
home screen as a PWA and works on a laptop. **Local-first**: it all works offline on the device. Accounts and cloud
sync (Supabase) are optional. Coaching is deterministic and needs no model; AI explanations are optional and off by
default.

Feature-by-feature status: [docs/STATUS.md](docs/STATUS.md). This README describes what exists on this branch.

## Commands

```
npm install
npm run dev          # dev server
npm test             # node --test tests/*.test.mjs, then vitest (.test.jsx)
npx vite build       # production build to dist/
```

Nothing deploys or pushes automatically. Cloud setup: [docs/SETUP_SUPABASE.md](docs/SETUP_SUPABASE.md).

## What it does

Train (block-aware logging, rest timer, plate calculator), Plan (week, swaps, plan builder and plan import),
Fuel, Habits, Body (scans, scan import with review), Stats, and Coach (evidence-based suggestions you accept,
edit or keep; undo for untouched sessions). Details: [docs/COACHING.md](docs/COACHING.md).

## Your data

- Saved to IndexedDB, with a verified localStorage copy kept for rollback. The header says **Saving… / Saved on
  device / Save failed**; "saved" appears only after the write completes. A failed write stays on screen with Retry
  and Export backup.
- Export is versioned with record counts and a SHA-256. Import verifies it, previews merge vs replace, and
  snapshots first. Replace needs you to type REPLACE.
- Unreadable stored data is quarantined, never overwritten.
- **Limit:** browser data can be cleared by you, by Safari after long inactivity, or lost with the device. Snapshots
  live in the same storage. Only an exported file, or the cloud copy plus the backup script, survives that.
  See [docs/SYNC_AND_BACKUP.md](docs/SYNC_AND_BACKUP.md) and [docs/DATA_INVENTORY.md](docs/DATA_INVENTORY.md).

## Accounts and privacy

Invite-only; the owner creates up to 5 accounts with generated access codes and can regenerate a lost one. Records
and files are owned by one account and enforced in the database, not only the client. Uploads are private. Cloud
data is readable by the server (not end-to-end encrypted). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## New accounts are blank

No personal scans, history, targets, fasting or observance dates, swim/class days or program dates ship as
defaults. They are settings; existing installs keep their behaviour through state migration v6.

## Standards and contributing

[AGENTS.md](AGENTS.md) (rules for people and coding agents) · [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) ·
[docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md). Work on a feature branch. Done means `npm test` and
`npx vite build` pass, new behaviour has synthetic-fixture tests, any state change has a numbered migration with a
rollback test, and the docs are updated. No pushes, merges, deploys or paid services without the owner's approval.
