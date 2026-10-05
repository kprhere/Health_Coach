# Supabase setup (multi-user cloud store)

Everything here was verified against PGlite (real Postgres in WASM) and mocks only. Nothing was run against the live project. Section 12 lists exactly what is unverified. Do each step, then do the checks in section 6 before trusting it with data.

Project ref: `eiuntmkhhvtscipmuurz` (URL `https://eiuntmkhhvtscipmuurz.supabase.co`). Never paste keys into chat, commits, or `.env.example`.

## 0. What you get

- Per-user records table with Row Level Security (RLS enabled and forced), versioned writes, soft deletes, idempotent batched pushes (`push_ops`), incremental pulls (`pull_changes`).
- Private `uploads` bucket (10 MB, PDF/JPEG/PNG, each user confined to their own folder).
- Login by access code only, no email. Sign-ups are disabled; accounts are created by you with `scripts/account.mjs`.
- Backup and restore scripts. **The free plan has no automated backups.**

## 1. Prerequisites

- Node 20+ and `npm install` run in this repo.
- A Supabase account with the project above (or a fresh free project; the steps are identical).
- Dashboard values (Project Settings > API): Project URL, `anon` public key, `service_role` secret key.

## 2. Run the migrations, in order

Use the dashboard SQL Editor (works regardless of network, see the IPv6 note below). For each file, open it, paste the whole text, click Run, and confirm "Success":

1. `supabase/migrations/0001_init.sql` (tables, RLS, triggers, `push_ops`, `pull_changes`, `delete_my_account`, `purge_deleted`)
2. `supabase/migrations/0002_storage.sql` (the `uploads` bucket and its policies)
3. `supabase/migrations/0003_rate_limits.sql` (daily AI usage counter)

All three are safe to re-run. Order matters: 0001 first.

**Connection note (IPv6).** Supabase's direct database host `db.eiuntmkhhvtscipmuurz.supabase.co` is, to my knowledge, IPv6-only on the free tier (IPv4 needs a paid add-on), so `psql` or `supabase db push` from an IPv4-only network can fail to connect. I could not confirm this live: verify it under Project Settings > Database > Connection string. If it applies, use the **pooler** (Supavisor) connection string shown on that page instead, or just use the SQL Editor as above. The scripts in `scripts/` talk to the HTTPS API, not to Postgres directly, so they are unaffected.

## 3. Auth settings (dashboard)

`supabase/config.toml` documents the intended settings and drives the local CLI stack. **It does not change a hosted project** until you push it with `supabase config push` (after `supabase link --project-ref eiuntmkhhvtscipmuurz`) or set the same values in the dashboard. Do one of those; the dashboard route:

Authentication > Sign In / Providers:
- Email provider: enabled. **Disable "Allow new users to sign up".**
- "Confirm email" can stay on or off: accounts are created pre-confirmed by the admin script.
- Anonymous sign-ins: disabled.
- Minimum password length: 20 (access codes are 31 characters).
- Disable every other provider (phone, OAuth, magic link not needed).

Authentication > Sessions / JWT (Project Settings > JWT):
- JWT expiry: 3600 seconds.
- Refresh token rotation: enabled; reuse interval 10 seconds.

Check: a `POST /auth/v1/signup` with the anon key must be refused ("Signups not allowed"). Do this only against your own project, with your own anon key.

## 4. Verify the storage bucket

Dashboard > Storage: bucket `uploads` exists, shows **Private**, file size limit 10 MB, allowed types `application/pdf, image/jpeg, image/png`. Dashboard > Storage > Policies: four policies on `storage.objects` (`uploads_select/insert/update/delete`), each restricting to `bucket_id = 'uploads'` and the first folder equal to `auth.uid()`. If the bucket row is missing (the migration prints a notice and skips when the storage schema is absent), create it by hand with those settings and re-run 0002.

Files are stored at `<user id>/<kind>/<id>.<ext>`, where kind is `scan` or `plan`.

## 5. Environment variables

Browser (Vercel > Project > Settings > Environment Variables, Production and Preview):
- `VITE_SUPABASE_URL` = `https://eiuntmkhhvtscipmuurz.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = the anon public key (safe in the browser; RLS protects data)

Redeploy after setting them (Vite inlines them at build time).

Admin scripts (your own shell only, never Vercel, never committed): copy names from `.env.example`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS: treat like a root password), optional `SUPABASE_ANON_KEY`, `MAX_USERS` (default 5).

PowerShell example for one session:

```
$env:SUPABASE_URL = "https://eiuntmkhhvtscipmuurz.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = Read-Host "service role key"
```

`.env*` is gitignored except `.env.example`; `backups/` is gitignored.

## 6. Create the first accounts

```
node scripts/account.mjs create "Alex phone"
node scripts/account.mjs list
```

`create` prints an access code like `K7Q2XM-4ZP3...` **once**. Store it in a password manager. The code is the password; nothing stores it, so it cannot be shown again. It refuses once `MAX_USERS` active users exist.

- Lost or leaked code: `node scripts/account.mjs regenerate <TAG>`. The tag stays, the secret changes, other sessions are signed out (refresh tokens die immediately; an already-issued access token can live up to 1 hour).
- Remove a person: `node scripts/account.mjs delete <TAG>` shows what would go; add `--yes` to delete their files and (by cascade) all their records.

Acceptance checks after creating the first account (do these in the SQL editor and the app):
1. Log in with the code in the app. Make an edit; it should appear in Table Editor > `records` with your user id and `version` 1.
2. Log in as a second account (create one): it must see none of the first account's data.
3. `select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('records','applied_ops','user_usage','ai_usage');` shows true/true for all four.
4. Dashboard > Authentication > Policies shows only `authenticated`-role policies on `records`.

## 7. Edge Functions (optional until the app uses them)

```
supabase login
supabase link --project-ref eiuntmkhhvtscipmuurz
supabase functions deploy validate-upload
supabase functions deploy apply-proposal
supabase functions deploy coach-ai
supabase secrets set AI_BASE_URL=... AI_API_KEY=... AI_MODEL=...   # coach-ai only
```

All three require a valid user JWT. `coach-ai` answers 503 until the three AI secrets are set, limits each user to 30 calls per day (`AI_DAILY_LIMIT` overrides), and forwards only a fixed system prompt plus the user's short prompt. `validate-upload` rechecks magic bytes, size and a 150 MB per-user quota after the client uploads, and deletes rejected files. `apply-proposal` re-runs the coach rules server-side and only writes coach-owned records. The functions import shared code from `src/` with relative paths; if deploy cannot bundle those, copy `src/cloud/uploadChecks.js`, `src/cloud/proposalWrites.js`, `src/store/records.js` and `src/coach/*` plus `src/helpers.js` dependencies beside the function.

## 8. Backups (the free plan has none)

Run by hand or schedule it:

```
node scripts/backup-cloud.mjs            # writes backups/<ISO timestamp>/
```

It dumps every user's records and downloads their files, writes `manifest.json` with counts and sha256 of everything, and re-verifies the result before reporting success. Keep copies outside this machine (an encrypted drive or a private cloud folder). Windows Task Scheduler: a daily task running `node D:\Tools\Health_Coach\scripts\backup-cloud.mjs` with the two environment variables set in the task's action (or a small wrapper `.cmd` outside the repo).

**Data-loss bound.** Free projects have no point-in-time recovery. For anything that exists only in the cloud (not on any device's local store), the maximum data loss is the time since your last successful backup. Records that still live in a device's local store are re-pushed on the next sync, so a device that has been used recently is also a backup. Free projects are **paused after 1 week of inactivity**; a paused project can be restored from the dashboard for a limited period, but do not rely on that: keep a recent backup, and open the app weekly (or any request to the API) to keep it active. Hard-deleted data (see `purge_deleted`, 30 days after a soft delete) is unrecoverable except from a backup.

Retention housekeeping, monthly, in the SQL Editor (service role): `select public.purge_deleted();` removes tombstones older than 30 days and idempotency rows older than 180 days.

## 9. Restore drill (do this once now, and after any schema change)

1. Take a backup (section 8) and note its folder.
2. Dry run: `node scripts/restore-cloud.mjs backups/<timestamp> --dry-run`. It verifies every hash and prints the counts it would restore, writing nothing.
3. Create a throwaway second project (free), run the three migrations on it, point `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` at it.
4. `node scripts/restore-cloud.mjs backups/<timestamp>`. It refuses a non-empty target (override with `--allow-non-empty`) and refuses a backup that fails verification.
5. Compare counts (Table Editor, or `select user_id, collection, count(*) from records group by 1,2`) with `manifest.json`, spot check a few `data` values, and open a restored file.
6. Users are recreated with the same ids, emails and metadata, but **access codes are not in backups** (they are never stored). Run `node scripts/account.mjs regenerate <TAG>` for each user and hand out the new codes.
7. Delete the throwaway project.

To recover the real project after a disaster: create a new project, run migrations, restore, regenerate codes, update `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Vercel and redeploy.

## 10. Local tests (no network, no keys)

```
node --test tests/cloud-*.test.mjs
node --test tests/*.test.mjs
```

The cloud tests run the real migrations in PGlite with a test-only stub of Supabase's `auth`, `storage` and roles (`tests/cloud-prelude.sql`, never a migration).

## 11. Operating notes

- A device with unsynced changes refuses logout and account switching (`canSwitchAccount`); do not clear browser data before the sync indicator says "synced".
- Conflicts (two devices editing the same record offline) are preserved as competing versions, never silently overwritten; the app must offer a choice.
- Limits per user: 1 MB per record, 200000 records, 10 MB per file, 150 MB of files.
- Deleting an account from inside the app removes files via the Storage API first (`deleteMyAccount` in `src/cloud/client.js`), then calls `delete_my_account()`. Calling the SQL function alone removes file metadata rows but may leave file bytes in storage.

## 12. What could NOT be verified live

Verified only against PGlite and mocks:
- SQL (tables, RLS, triggers, RPCs, bucket and policy SQL) ran in real Postgres, but with stubbed `auth.uid()`, roles and `storage` tables. Real Supabase differences (PostgREST role switching, `storage.objects` ownership/triggers, `auth.users` columns, default privileges on a real project) are untested. Run the section 6 checks.
- Supabase Auth: `signInWithPassword` with synthetic emails, `admin.createUser` with `email_confirm`, `admin.updateUserById` password change, global sign-out for session revocation (`regenerate` signs in once with the new code to obtain a token), `admin.createUser({ id })` during restore, sign-up being disabled, password length and JWT/refresh-rotation settings. Only mocks were used.
- Storage: file upload/download/list/remove via the API, `allowed_mime_types` and size enforcement, and orphaned bytes after SQL-level deletion.
- Edge Functions (Deno): `validate-upload`, `apply-proposal`, `coach-ai` were not executed, only their pure logic (`uploadChecks.js`, `proposalWrites.js`, rate-limit SQL) is tested. Bundling of the relative `src/` imports and CORS behavior are unverified; the upstream AI call is untested.
- `supabase config push`, the IPv6-only direct host claim, the pooler string, free-tier pause/backup behavior as described, and Vercel env var injection.
- Real network behavior of the sync transport (`src/cloud/client.js`) against PostgREST error shapes; the status mapping (`0` or no status to offline, 401/403 to auth, other 4xx to permanent) is based on documented supabase-js behavior.
