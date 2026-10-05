# Health_Coach / Body Recomp OS - instructions for coding agents

Read this before editing. `CLAUDE.md` imports this file, so Claude Code and OpenCode see the same rules.

## What this is
A React 18 + Vite PWA for 4-5 private users: training log, plan, nutrition, body scans, adaptive coaching.
Local-first. Optional Supabase accounts and sync. Deterministic coaching that works offline; AI is optional and off by default.
Authoritative docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/COACHING.md`, `docs/DATA_INVENTORY.md`, `docs/SYNC_AND_BACKUP.md`, `docs/DESIGN_SYSTEM.md`, `docs/STATUS.md`.

## Non-negotiable rules
1. **Never lose user data.** No resetting storage, seeding over an account, or replacing unreadable data with an empty state. Follow `.claude/skills/data-safe-change/SKILL.md` for anything touching state, storage, sync, import/export or coaching writes.
2. **No "saved" before the write completes.** Success states come from a completed transaction.
3. **Synthetic data only** in tests, fixtures, docs and screenshots. Never copy anyone's real scans or logs.
4. **Secrets**: `.env.local` and `.claude/settings.local.json` are git-ignored. Never print, commit or log keys. The service-role key is for admin scripts only, never a `VITE_` variable.
5. **No paid services, deploys, pushes or merges** without the owner's explicit say-so.
6. **Coaching is not medical advice.** Never diagnose. Pain and recovery scores are not clearance. Thresholds are heuristics.
7. Don't claim zero data loss. Say what is protected and what is not.

## Commands
```
npm install
npm run dev          # local dev server
npm test             # node --test tests/*.test.mjs, then vitest .test.jsx
npx vite build       # production build
```
A change is done when `npm test` and `npx vite build` pass and docs reflect it.

## Layout
- `src/helpers.js` state, migrations (`MIGRATIONS`, `STATE_VERSION`), plan resolution, analytics. `src/domain/` extracted pure helpers.
- `src/coach/` deterministic engine (`metrics`, `rules`, `proposals`, `overrides`, `effective`), `planGenerator`, `ai` (optional).
- `src/store/` IndexedDB store, outbox, localStorage migration. `src/storage.js` legacy verified-write layer and snapshots.
- `src/cloud/` Supabase client, sync engine, access codes. `supabase/` SQL migrations and edge functions.
- `src/imports/` scan and plan parsers. `src/features/` screens. `src/ui/tokens.css` design tokens.

## Conventions
- Calculations stay out of React. State changes go through new numbered migrations; never edit an old one.
- Dates are `YYYY-MM-DD` keys from the device clock (`src/domain/dates.js`). Units are explicit in names or labels.
- Missing data is `null`/absent and shown as "not logged"; never default it to a number that looks like data.
- Reuse existing components (`Card`, `Chip`, `Banner`, `Sheet`, `EmptyState`) and tokens before adding new ones.
- Match surrounding comment density; explain why, not what.

## Delegating to another agent (prompt template)
State: the goal; the files this agent OWNS (it edits nothing else); the tests that gate it; "do not commit, push or deploy";
"synthetic data only"; "report exported API and anything you could not verify". Keep high-stakes work (migrations, sync,
conflict handling, coach write paths) on the strongest model and review it; weaker or free models fit docs, CSS, fixtures
and test-gated pure modules. Never send real health data to a hosted model.
