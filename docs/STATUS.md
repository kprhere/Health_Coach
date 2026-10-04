# Build status

Implemented = merged on `feature/multi-user-coach`, tested. Placeholder = module may exist but is not wired
into the app and sits behind a flag in `src/features/flags.js`. Blocked = needs something outside the code.

| # | Item | State | Next step |
|---|---|---|---|
| 1 | Verified backup + merge/replace import | Implemented | - |
| 2 | Unknown fields preserved through migrate/merge | Implemented | - |
| 3 | State v6, personal assumptions in settings, migration | Implemented | - |
| 4 | Domain modules, tokens, self-hosted fonts, reduced motion | Implemented | - |
| 5 | Opt-in service-worker updates (banner UI) | Placeholder (event fired, no banner yet) | Add banner in `BodyRecompOS` |
| 6 | Plan generator, plan compare, AI wrapper (modules) | Implemented, tested | - |
| 7 | Plan setup screen (`features/onboarding/PlanSetup.jsx`) | Placeholder (flag `planSetup`) | Wire into onboarding + More |
| 8 | Coach engine (metrics, rules, proposals, overrides) | Agent building | Wire `applyOverrides` into `resolveWorkout`; Coach tab (flag `adaptiveCoach`) |
| 9 | IndexedDB store, outbox, localStorage migration | Agent building | Async boot gate; Saved/Pending/Synced/Failed pill |
| 10 | Supabase schema, RLS, edge functions, sync engine, access codes | Agent building | Account screen (flag `accounts`) |
| 11 | Scan + plan parsers | Agent building | Upload + review screens (flags `scanUpload`, `planUpload`) |
| 12 | Session RPE x duration inputs | Placeholder | Two optional fields on "Mark complete" |
| 13 | README (single), ARCHITECTURE, COACHING docs; delete `README-root.md` | Pending | After 8-11 report formulas and APIs |
| 14 | Browser verification, screenshots, offline check | Pending | After 7-11 |
| 15 | 21st plugin for UI references | Blocked: tools load on session restart | Restart session |

## Cannot be verified in this environment
- Live Supabase Auth, Storage and Edge runtime (no project exists; SQL is tested in PGlite instead).
- OCR (Tesseract needs a browser).
- Real iPhone Safari / installed PWA behaviour.
