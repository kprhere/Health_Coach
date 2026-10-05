// Backup / restore logic for the cloud store. Pure orchestration: the scripts
// (scripts/backup-cloud.mjs, scripts/restore-cloud.mjs) plug in Supabase and
// the filesystem; tests plug in PGlite and memory.
//
// Layout of a backup directory:
//   manifest.json                  counts + sha256 of everything below
//   records/<userId>.jsonl         one record per line, sorted by collection,key
//   files/<userId>/<...path>       uploaded files, byte for byte
import { sha256Hex, sniffMime } from './uploadChecks.js';

export const BACKUP_FORMAT = 'recomp-cloud-backup';
export const BACKUP_VERSION = 1;

export const recordsPath = (userId) => `records/${userId}.jsonl`;
export const filePath = (path) => `files/${path}`;

const enc = new TextEncoder();
const dec = new TextDecoder();

// Everything the server stores for a row, including version and tombstone,
// so a restore reproduces the exact sync state.
export const toBackupRow = (r) => ({
  collection: r.collection,
  key: r.key,
  data: r.data,
  version: r.version,
  updated_at: r.updated_at ?? r.updatedAt ?? null,
  deleted_at: r.deleted_at ?? r.deletedAt ?? null,
  op_id: r.op_id ?? null,
});

export function serializeRecords(rows) {
  const sorted = rows.map(toBackupRow).sort((a, b) => (a.collection === b.collection
    ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    : (a.collection < b.collection ? -1 : 1)));
  return sorted.map((r) => JSON.stringify(r)).join('\n') + (sorted.length ? '\n' : '');
}

export const parseRecords = (text) => text.split('\n').filter(Boolean).map((l) => JSON.parse(l));

export function countByCollection(rows) {
  const out = {};
  for (const r of rows) out[r.collection] = (out[r.collection] || 0) + 1;
  return out;
}

const asText = (d) => (typeof d === 'string' ? d : dec.decode(d));
const asBytes = (d) => (typeof d === 'string' ? enc.encode(d) : d);

// source: {listUsers() -> [{id,email,created_at,user_metadata}], fetchRecords(userId) -> rows,
//          listFiles(userId) -> [path], downloadFile(userId, path) -> Uint8Array}
// writer: {write(relativePath, stringOrBytes)}
export async function createBackup({ source, writer, now = () => new Date() }) {
  const users = [];
  let totalRecords = 0;
  let totalFiles = 0;
  for (const u of await source.listUsers()) {
    const rows = await source.fetchRecords(u.id);
    const text = serializeRecords(rows);
    await writer.write(recordsPath(u.id), text);
    const files = [];
    for (const path of await source.listFiles(u.id)) {
      const bytes = await source.downloadFile(u.id, path);
      await writer.write(filePath(path), bytes);
      files.push({ path, bytes: bytes.length, sha256: await sha256Hex(bytes) });
    }
    files.sort((a, b) => (a.path < b.path ? -1 : 1));
    users.push({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at ?? null,
      user_metadata: u.user_metadata ?? {},
      recordCount: rows.length,
      recordsSha256: await sha256Hex(enc.encode(text)),
      collections: countByCollection(rows),
      files,
    });
    totalRecords += rows.length;
    totalFiles += files.length;
  }
  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now().toISOString(),
    totals: { users: users.length, records: totalRecords, files: totalFiles },
    users,
  };
  await writer.write('manifest.json', JSON.stringify(manifest, null, 2));
  return manifest;
}

// reader: {readText(rel), readBytes(rel)}  -> {ok, problems[], manifest}
export async function verifyBackup({ reader }) {
  const problems = [];
  let manifest;
  try {
    manifest = JSON.parse(asText(await reader.readText('manifest.json')));
  } catch (e) {
    return { ok: false, problems: [`manifest unreadable: ${e.message}`], manifest: null };
  }
  if (manifest.format !== BACKUP_FORMAT) problems.push(`unknown format ${manifest.format}`);
  if (manifest.version !== BACKUP_VERSION) problems.push(`unsupported version ${manifest.version}`);
  let records = 0;
  let files = 0;
  for (const u of manifest.users || []) {
    try {
      const text = asText(await reader.readText(recordsPath(u.id)));
      if ((await sha256Hex(enc.encode(text))) !== u.recordsSha256) problems.push(`records hash mismatch for ${u.id}`);
      const n = parseRecords(text).length;
      if (n !== u.recordCount) problems.push(`record count mismatch for ${u.id}: ${n} vs ${u.recordCount}`);
      records += n;
    } catch (e) {
      problems.push(`records missing for ${u.id}: ${e.message}`);
    }
    for (const f of u.files || []) {
      try {
        const bytes = asBytes(await reader.readBytes(filePath(f.path)));
        if (bytes.length !== f.bytes) problems.push(`size mismatch for ${f.path}`);
        if ((await sha256Hex(bytes)) !== f.sha256) problems.push(`hash mismatch for ${f.path}`);
        files += 1;
      } catch (e) {
        problems.push(`file missing: ${f.path}`);
      }
    }
  }
  if (manifest.totals && (manifest.totals.records !== records && !problems.length)) problems.push('totals do not match contents');
  if (manifest.totals && manifest.totals.files !== files && !problems.length) problems.push('file totals do not match contents');
  return { ok: problems.length === 0, problems, manifest };
}

// target: {isClean() -> bool, ensureUser(user), upsertRecords(userId, rows), uploadFile(userId, path, bytes, mime)}
// A backup that fails verification is never restored. Non-clean targets are
// refused unless allowNonEmpty is set.
export async function restoreBackup({ reader, target, dryRun = false, allowNonEmpty = false, chunk = 500 }) {
  const check = await verifyBackup({ reader });
  if (!check.ok) {
    const err = new Error(`backup failed verification: ${check.problems.join('; ')}`);
    err.code = 'BACKUP_INVALID';
    throw err;
  }
  const report = {
    dryRun, users: 0, records: 0, files: 0, collections: {},
  };
  if (!dryRun && !allowNonEmpty && target.isClean && !(await target.isClean())) {
    const err = new Error('target project is not empty; restore into a clean project (or pass --allow-non-empty)');
    err.code = 'TARGET_NOT_CLEAN';
    throw err;
  }
  for (const u of check.manifest.users) {
    const rows = parseRecords(asText(await reader.readText(recordsPath(u.id))));
    report.users += 1;
    report.records += rows.length;
    for (const [c, n] of Object.entries(countByCollection(rows))) report.collections[c] = (report.collections[c] || 0) + n;
    report.files += u.files.length;
    if (dryRun) continue;
    await target.ensureUser(u);
    for (let i = 0; i < rows.length; i += chunk) await target.upsertRecords(u.id, rows.slice(i, i + chunk));
    for (const f of u.files) {
      const bytes = asBytes(await reader.readBytes(filePath(f.path)));
      await target.uploadFile(u.id, f.path, bytes, sniffMime(bytes));
    }
  }
  return report;
}
