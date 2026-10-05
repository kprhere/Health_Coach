#!/usr/bin/env node
// Restore a backup directory into a CLEAN Supabase project.
//   node scripts/restore-cloud.mjs backups/<timestamp> [--dry-run] [--allow-non-empty]
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY of the TARGET project, with
// migrations 0001..0003 already applied. Users are re-created with the same
// ids, emails and metadata, but access codes are not backed up (they are never
// stored), so run `account.mjs regenerate <tag>` for each user afterwards.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { restoreBackup } from '../src/cloud/backupManifest.js';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const allowNonEmpty = args.includes('--allow-non-empty');
if (!dir) {
  console.error('usage: restore-cloud.mjs <backup dir> [--dry-run] [--allow-non-empty]');
  process.exit(2);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!dryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY of the target project first.');
  process.exit(2);
}
const sb = dryRun ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const reader = {
  readText: (rel) => readFile(join(dir, rel), 'utf8'),
  readBytes: async (rel) => new Uint8Array(await readFile(join(dir, rel))),
};

const target = dryRun ? null : {
  async isClean() {
    const { count, error } = await sb.from('records').select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count === 0;
  },
  async ensureUser(u) {
    const { error } = await sb.auth.admin.createUser({
      id: u.id,
      email: u.email,
      password: randomBytes(32).toString('base64url'), // unusable until `regenerate`
      email_confirm: true,
      user_metadata: u.user_metadata || {},
    });
    if (error && !/already|exists|registered/i.test(error.message)) throw error;
  },
  async upsertRecords(userId, rows) {
    const { error } = await sb.from('records').upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,collection,key' });
    if (error) throw error;
  },
  async uploadFile(_userId, path, bytes, mime) {
    const { error } = await sb.storage.from('uploads').upload(path, bytes, { contentType: mime || 'application/octet-stream', upsert: true });
    if (error) throw error;
  },
};

try {
  const report = await restoreBackup({ reader, target, dryRun, allowNonEmpty });
  console.log(dryRun ? 'DRY RUN (nothing written):' : 'Restored:');
  console.log(JSON.stringify(report, null, 2));
  if (!dryRun) console.log('Next: run `node scripts/account.mjs regenerate <tag>` for every user to issue fresh access codes.');
} catch (err) {
  console.error(`Restore failed: ${err.message}`);
  process.exit(1);
}
