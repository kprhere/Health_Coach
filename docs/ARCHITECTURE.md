# Architecture

One static React/Vite app plus an optional Supabase project. No microservices.

## Why Supabase (free tier), and what it costs you

Chosen over Cloudflare-only and Appwrite for: built-in auth, Postgres row-level security, and private file storage with
signed links in one place. Verified free-tier limits (Oct 2026): 500 MB database, 1 GB files, 50 MB per file, projects
pause after about a week of inactivity, **no automated backups**. Estimated use for 5 people over a year: about 25 MB of
records and a few hundred MB of scans, inside the limits. The free plan hard-stops instead of billing; nothing paid is
enabled. Open-source vs hosted: the app and SQL are yours; the hosted Supabase free plan is a service, not self-hosting.

## Data flow

```
UI -> state (React) -> localStore.commit -> IndexedDB (records + outbox, one transaction) -> "Saved on device"
                                           -> outbox -> sync engine -> push_ops (atomic, versioned) -> Postgres
```

- **Local store** (`src/store/`): per-account IndexedDB database. Each change writes its record and, in account mode,
  an outbox entry in a single transaction. The original localStorage copy is kept as a rollback.
- **Records**: one row per dated log, scan, note, plan version, override, proposal. `version` is assigned by the
  server. Edits carry the version they were based on, so an old client or delayed request cannot overwrite newer data.
  Conflicts are preserved as competing versions, never silently resolved. Deletes are soft (30-day retention).
- **Accounts**: invite-only Supabase Auth; access code = `<tag>-<secret>`, with a synthetic email. Sign-ups disabled.
  Every table and the private `uploads` bucket are protected by row-level security on `auth.uid()`.
- **Edge functions**: `validate-upload` (magic bytes, size, quota), `apply-proposal` (server revalidation using the
  same `src/coach` code), `coach-ai` (optional, rate limited, key held server-side).
- **Account switching** opens a different database; pending changes block sign-out or switching until synced or forced.
- **Encrypted Cloudflare KV sync** (`src/sync.js`) is unchanged for local-only use and can serve as an independent
  off-site backup in account mode. Supabase data is server-readable and is not described as end-to-end encrypted.

## Backups

Sync is not a backup. `scripts/backup-cloud.mjs` dumps every user's records and files with a checksummed manifest;
`scripts/restore-cloud.mjs` restores into a clean project (restore drill tested in an in-memory Postgres). Worst-case
loss for cloud-only data = time since the last backup. Per-person export is always available in the app.

## Not verified live

The SQL is tested in PGlite with stubbed Supabase auth/storage. Real Supabase Auth, Storage, PostgREST and the edge
functions on Deno are untested here; see docs/SETUP_SUPABASE.md section 12.
