# Build status

Implemented = on `feature/multi-user-coach` and tested. In progress = being built. Blocked = needs something outside the code.
Test suite at last run: 379 node tests and 46+ UI tests passing; production build clean.

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
| 11 | Account screen, login, "move my data" flow, cloud sync wiring | In progress | flag `accounts` stays off until verified |
| 12 | Browser verification, screenshots | Pending | |
| 13 | Optional AI explanations wiring | Module done, UI toggle pending | flag `aiExplanations` off |

## Blocked / needs the owner
- `supabase login` and `supabase link`; applying migrations and auth settings to the hosted project (not done).
- Backup destination for `scripts/backup-cloud.mjs`; the 4-5 account labels.
- Real Evolt PDF/screenshot, OCR in a browser, iPhone Safari as installed PWA.
- Restart the session so the 21st plugin tools load; rotate keys shared in chat.

## Cannot be verified in this environment
Live Supabase Auth/Storage/Edge runtime, OCR (browser only), real-device Safari/PWA behaviour.
