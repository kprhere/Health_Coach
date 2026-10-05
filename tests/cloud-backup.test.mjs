import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDb, newUser, push, op, uuid,
} from './cloud-pg.mjs';
import {
  createBackup, verifyBackup, restoreBackup, serializeRecords, parseRecords, countByCollection,
} from '../src/cloud/backupManifest.js';
import { sha256Hex } from '../src/cloud/uploadChecks.js';

const enc = new TextEncoder();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 9, 9, 9]);

const memWriter = () => {
  const files = new Map();
  return { files, write: async (p, d) => { files.set(p, typeof d === 'string' ? d : new Uint8Array(d)); } };
};
const memReader = (files) => ({
  readText: async (p) => { if (!files.has(p)) throw new Error('missing'); const d = files.get(p); return typeof d === 'string' ? d : new TextDecoder().decode(d); },
  readBytes: async (p) => { if (!files.has(p)) throw new Error('missing'); const d = files.get(p); return typeof d === 'string' ? enc.encode(d) : d; },
});

// A "source project": two users, tombstones, versions > 1, uploaded files.
async function seedSource() {
  const db = await makeDb();
  const [a, b] = [await newUser(db), await newUser(db)];
  const blobs = new Map();
  await push(db, a, [op('profile', 'singleton', { name: 'Ann' }), op('mealLogs', '2026-01-01', { kcal: 1 }), op('bodyScans', 's1', { kg: 80 })]);
  await push(db, a, [op('mealLogs', '2026-01-01', { kcal: 2200 }, 1)]);
  await push(db, a, [{ op_id: uuid(), collection: 'bodyScans', key: 's1', expected_version: 1, data: {}, delete: true }]);
  await push(db, b, [op('settings', 'singleton', { units: 'kg' })]);
  for (const [uid, path, bytes] of [[a, `${a}/scan/s1.png`, PNG], [a, `${a}/plan/p1.pdf`, PDF], [b, `${b}/scan/x.png`, PNG]]) {
    blobs.set(path, bytes);
    await db.query("insert into storage.objects (bucket_id, name, owner) values ('uploads', $1, $2)", [path, uid]);
  }
  const source = {
    listUsers: async () => (await db.query('select id, email from auth.users order by id')).rows.filter((u) => [a, b].includes(u.id))
      .map((u) => ({ ...u, created_at: '2026-01-01T00:00:00Z', user_metadata: { label: u.id === a ? 'Ann' : 'Bo', userTag: 'TAG' } })),
    fetchRecords: async (id) => (await db.query('select * from public.records where user_id = $1', [id])).rows
      .map((r) => ({ ...r, updated_at: r.updated_at.toISOString(), deleted_at: r.deleted_at ? r.deleted_at.toISOString() : null })),
    listFiles: async (id) => [...blobs.keys()].filter((p) => p.startsWith(`${id}/`)),
    downloadFile: async (_id, p) => blobs.get(p),
  };
  return { db, a, b, source, blobs };
}

// A "target project": clean PGlite + an in-memory bucket.
async function cleanTarget() {
  const db = await makeDb();
  const bucket = new Map();
  const target = {
    isClean: async () => (await db.query('select count(*)::int n from public.records')).rows[0].n === 0,
    ensureUser: async (u) => { await db.query('insert into auth.users (id, email) values ($1, $2) on conflict do nothing', [u.id, u.email]); },
    upsertRecords: async (uid, rows) => {
      for (const r of rows) {
        await db.query(`insert into public.records (user_id, collection, key, data, version, updated_at, deleted_at, op_id)
          values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
          on conflict (user_id, collection, key) do update set data = excluded.data, version = excluded.version, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
        [uid, r.collection, r.key, JSON.stringify(r.data), r.version, r.updated_at, r.deleted_at, r.op_id]);
      }
    },
    uploadFile: async (uid, path, bytes) => {
      bucket.set(path, bytes);
      await db.query("insert into storage.objects (bucket_id, name, owner) values ('uploads', $1, $2)", [path, uid]);
    },
  };
  return { db, bucket, target };
}

test('serialization is deterministic and lossless', () => {
  const rows = [
    { collection: 'b', key: '2', data: { x: 1 }, version: 3, updated_at: 't', deleted_at: null },
    { collection: 'a', key: '9', data: {}, version: 1, updated_at: 't', deleted_at: 'd', op_id: 'o' },
    { collection: 'a', key: '1', data: { y: [1] }, version: 2, updated_at: 't', deleted_at: null },
  ];
  const text = serializeRecords(rows);
  assert.equal(text, serializeRecords([...rows].reverse()));
  const back = parseRecords(text);
  assert.deepEqual(back.map((r) => `${r.collection}/${r.key}`), ['a/1', 'a/9', 'b/2']);
  assert.equal(back[1].deleted_at, 'd');
  assert.deepEqual(countByCollection(back), { a: 2, b: 1 });
  assert.equal(serializeRecords([]), '');
});

test('backup writes a manifest with counts and hashes that verifies', async () => {
  const { source } = await seedSource();
  const w = memWriter();
  const manifest = await createBackup({ source, writer: w, now: () => new Date('2026-05-01T00:00:00Z') });
  assert.equal(manifest.createdAt, '2026-05-01T00:00:00.000Z');
  assert.deepEqual(manifest.totals, { users: 2, records: 4, files: 3 });
  const ann = manifest.users.find((u) => u.user_metadata.label === 'Ann');
  assert.equal(ann.recordCount, 3);
  assert.deepEqual(ann.collections, { bodyScans: 1, mealLogs: 1, profile: 1 });
  assert.equal(ann.files.find((f) => f.path.endsWith('s1.png')).sha256, await sha256Hex(PNG));
  const check = await verifyBackup({ reader: memReader(w.files) });
  assert.deepEqual(check.problems, []);
  assert.ok(w.files.has('manifest.json'));
});

test('verification catches tampering, truncation and missing files', async () => {
  const { source, a } = await seedSource();
  const w = memWriter();
  await createBackup({ source, writer: w });
  const mutate = async (fn) => {
    const copy = new Map(w.files);
    fn(copy);
    return verifyBackup({ reader: memReader(copy) });
  };
  let r = await mutate((m) => m.set(`records/${a}.jsonl`, m.get(`records/${a}.jsonl`).replace('2200', '9999')));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(), /hash mismatch/);
  r = await mutate((m) => m.set(`records/${a}.jsonl`, m.get(`records/${a}.jsonl`).split('\n')[0] + '\n'));
  assert.match(r.problems.join(), /count mismatch/);
  r = await mutate((m) => m.set(`files/${a}/scan/s1.png`, new Uint8Array([1, 2, 3])));
  assert.match(r.problems.join(), /size mismatch|hash mismatch/);
  r = await mutate((m) => m.delete(`files/${a}/plan/p1.pdf`));
  assert.match(r.problems.join(), /file missing/);
  r = await mutate((m) => m.delete('manifest.json'));
  assert.equal(r.ok, false);
  r = await mutate((m) => m.set('manifest.json', '{"format":"other"}'));
  assert.equal(r.ok, false);
});

test('restore drill: backup, wipe, restore into a clean database, compare everything', async () => {
  const { db: srcDb, a, b, source } = await seedSource();
  const w = memWriter();
  await createBackup({ source, writer: w });

  const { db: dst, bucket, target } = await cleanTarget();
  const report = await restoreBackup({ reader: memReader(w.files), target });
  assert.deepEqual({ users: report.users, records: report.records, files: report.files }, { users: 2, records: 4, files: 3 });

  // counts match per user and per collection
  for (const uid of [a, b]) {
    const q = "select collection, count(*)::int n from public.records where user_id = $1 group by 1 order by 1";
    assert.deepEqual((await dst.query(q, [uid])).rows, (await srcDb.query(q, [uid])).rows);
  }
  // critical values survive byte for byte: data, version, tombstone, timestamps, ownership
  const cols = 'user_id, collection, key, data, version, updated_at, deleted_at';
  const all = 'select ' + cols + ' from public.records order by user_id, collection, key';
  assert.deepEqual((await dst.query(all)).rows, (await srcDb.query(all)).rows);
  const meal = (await dst.query("select data, version from public.records where user_id = $1 and key = '2026-01-01'", [a])).rows[0];
  assert.deepEqual(meal, { data: { kcal: 2200 }, version: 2 });
  const scan = (await dst.query("select version, deleted_at from public.records where user_id = $1 and collection = 'bodyScans'", [a])).rows[0];
  assert.equal(scan.version, 2);
  assert.ok(scan.deleted_at, 'tombstone preserved, nothing resurrected');
  // the usage counter was rebuilt by the triggers
  assert.equal((await dst.query('select row_count from public.user_usage where user_id = $1', [a])).rows[0].row_count, 3);
  // files: same bytes, same hashes, under the right owner folder
  assert.equal(bucket.size, 3);
  for (const [path, bytes] of bucket) assert.equal(await sha256Hex(bytes), await sha256Hex(source.downloadFile ? await source.downloadFile(null, path) : bytes));
  assert.deepEqual((await dst.query("select count(*)::int n from storage.objects where name like $1 || '/%'", [a])).rows[0], { n: 2 });
  // a stale client still cannot resurrect after restore
  const stale = await push(dst, a, [op('bodyScans', 's1', { kg: 1 }, 1)]);
  assert.equal(stale.conflicts.length, 1);
});

test('restore: dry run writes nothing; dirty target and corrupt backups are refused', async () => {
  const { source } = await seedSource();
  const w = memWriter();
  await createBackup({ source, writer: w });
  const { db, bucket, target } = await cleanTarget();
  const dry = await restoreBackup({ reader: memReader(w.files), target, dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.records, 4);
  assert.equal((await db.query('select count(*)::int n from public.records')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n, 0);
  assert.equal(bucket.size, 0);

  await restoreBackup({ reader: memReader(w.files), target });
  await assert.rejects(restoreBackup({ reader: memReader(w.files), target }), (e) => e.code === 'TARGET_NOT_CLEAN');
  await restoreBackup({ reader: memReader(w.files), target, allowNonEmpty: true }); // idempotent upsert
  assert.equal((await db.query('select count(*)::int n from public.records')).rows[0].n, 4);

  const bad = new Map(w.files);
  bad.set('manifest.json', bad.get('manifest.json').replace('"records": 4', '"records": 5'));
  const fresh = await cleanTarget();
  const corrupt = new Map(w.files);
  const userFile = [...corrupt.keys()].find((k) => k.startsWith('records/'));
  corrupt.set(userFile, corrupt.get(userFile) + '{"collection":"x"}\n');
  await assert.rejects(restoreBackup({ reader: memReader(corrupt), target: fresh.target }), (e) => e.code === 'BACKUP_INVALID');
  assert.equal((await fresh.db.query('select count(*)::int n from public.records')).rows[0].n, 0, 'nothing written from a bad backup');
});
