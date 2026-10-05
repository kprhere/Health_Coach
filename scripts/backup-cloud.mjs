#!/usr/bin/env node
// Dump every user's records and uploaded files to backups/<ISO timestamp>/.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The free plan has no
// automated backups: schedule this (see docs/SETUP_SUPABASE.md).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createBackup, verifyBackup } from '../src/cloud/backupManifest.js';
import { readFile } from 'node:fs/promises';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(2);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const stamp = new Date().toISOString().replace(/:/g, '-');
const root = join(process.argv[2] || 'backups', stamp);

const source = {
  async listUsers() {
    const all = [];
    for (let page = 1; page < 100; page += 1) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      all.push(...data.users);
      if (data.users.length < 200) break;
    }
    return all;
  },
  async fetchRecords(userId) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('records').select('*').eq('user_id', userId)
        .order('collection').order('key').range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  },
  async listFiles(userId) {
    const paths = [];
    const walk = async (folder) => {
      const { data, error } = await sb.storage.from('uploads').list(folder, { limit: 1000 });
      if (error) throw error;
      for (const item of data || []) {
        const p = `${folder}/${item.name}`;
        if (item.id === null || item.id === undefined) await walk(p); else paths.push(p);
      }
    };
    await walk(userId);
    return paths;
  },
  async downloadFile(_userId, path) {
    const { data, error } = await sb.storage.from('uploads').download(path);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  },
};

const writer = {
  async write(rel, data) {
    const full = join(root, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  },
};

const manifest = await createBackup({ source, writer });
const reader = {
  readText: (rel) => readFile(join(root, rel), 'utf8'),
  readBytes: async (rel) => new Uint8Array(await readFile(join(root, rel))),
};
const check = await verifyBackup({ reader });
if (!check.ok) {
  console.error(`Backup written to ${root} but FAILED verification:\n${check.problems.join('\n')}`);
  process.exit(1);
}
console.log(`Backup OK: ${root}`);
console.log(`${manifest.totals.users} users, ${manifest.totals.records} records, ${manifest.totals.files} files`);
