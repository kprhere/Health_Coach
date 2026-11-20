# Build status

Implemented = on `feature/multi-user-coach` and tested. In progress = being built. Blocked = needs something outside the code.
Test suite at last run: 387 node tests and 72 UI tests passing; production build clean.

| # | Item | State | Notes |
|---|---|---|---|
| 1 | Verified backup + merge/replace import | Implemented | `src/backup.js` |
| 2 | Unknown fields preserved through migrate/merge | Implemented | |
| 3 | State v6, personal assumptions as settings, preserving migration | Implemented | |
| 4 | Domain modules, tokens, self-hosted fonts, reduced motion | Implemented | |
| 5 | IndexedDB store, outbox, localStorage migration with rollback | Implemented | app boots from it; honest save pill |
| 6 | Opt-in service-worker updates | Implemented | Update banner |
| 7 | Plan builder (questionnaire -> plan -> accept/edit/regenerate/keep) | Implemented | More -> Plan |
| 8 | Plan import and scan import with review screens | Implemented | OCR/PDF need a real-browser check |
| 9 | Coach engine + Coach screen + session RPE x minutes inputs | Implemented | reassess on open/data change |
| 10 | Supabase schema, RLS, sync engine, access codes, edge functions | Implemented, tested in PGlite/mocks | **not applied to the live project** |
| 11 | Account screen, login, "move my data" flow, cloud sync wiring | Implemented and wired, **flag `accounts` off** | needs a real Supabase project to verify |
| 12 | Browser verification, screenshots | Mostly done | Dev server, phone (375px) and 1280px: Home, Train (set, complete, session RPE x minutes), Plan, Coach (Reassess, Accept, Undo), More (plan builder, plan import, Account panel with flag off), scan import with a synthetic text file, keyboard focus in sheets. Not done: Coach Keep in a browser (unit/UI tests only), reduced motion (CSS rule only), offline reload (needs the production service worker), OCR, real PDFs, iPhone Safari |
| 13 | Optional AI explanations | Implemented: local model only, per-person opt-in, off by default | hosted model needs the server function, not enabled |
| 14 | Personal data out of defaults (labs, supplements, schedule, observances) | Implemented | guarded by a test; existing installs keep theirs via migration |

## Blocked / needs the owner
- `supabase login` and `supabase link`; applying migrations and auth settings to the hosted project (not done).
- Backup destination for `scripts/backup-cloud.mjs`; the 4-5 account labels.
- Real Evolt PDF/screenshot, OCR in a browser, iPhone Safari as installed PWA.
- Restart the session so the 21st plugin tools load; rotate keys shared in chat.

## Cannot be verified in this environment
Live Supabase Auth/Storage/Edge runtime, OCR (browser only), real-device Safari/PWA behaviour.

## Fixed in the branch review (2026-10-05)
- Remote deletions now apply on pull (the transport shape carried `deletedAt`, the store read `deleted`).
- Resolving a conflict from a rolled-back atomic group no longer writes empty data or resets the record version; choosing "server" is refused when no server copy exists.
- A permanent push error no longer splits an atomic group.
- An undone coach suggestion now cools down like a declined one instead of returning on the next Reassess.
- AI explanation payload kept the rule name and window from built proposals.
- Sheets restore focus and trap Tab; Banner no longer nests a div in a p; missing goals no longer print "null lb".
- Sample-data copy no longer claims it overwrites logs, and a snapshot is taken first.

## Known and not fixed
- Pull cursor can stall if a full page of rows shares one `updated_at` (only possible with restore scripts that keep timestamps).
- Plan import reads `Barbell Row 4x8 weight 100 lb` as an exercise named "Barbell Row weight".
- The legacy passphrase sync buttons are still shown in More while accounts are off.
- The exercise library and More still carry the owner's equipment and observance settings (Arsenal, Hammer Strength, Puratasi, biotin).

## Premium polish (branch `feature/premium-polish`)
- Added: weekly recap card on Home (`src/domain/weeklyRecap.js`, 7 days vs prior 7, PR count, "n/a" when a week is missing), count-up numbers (`src/ui/motion.jsx`), screen fade and staggered card rise.
- Train has no entrance animation by design. All motion is off under `prefers-reduced-motion`.
- Already present, so not re-built: rest timer, plate maths, e1RM, PR list, streaks, rings.
- Verified: `npm test`, `npx vite build`, Home in the browser pane (no console errors). Not checked: phone width, keyboard path.
- Fitbod-inspired (from its public App Store listing, features only, nothing copied): estimated muscle recovery card on Home (`src/domain/muscleRecovery.js`). Heuristic from logged sets; ignores sleep and pain. Not built yet: exercise library with video, saved workouts, Apple Watch/Strava integrations.
