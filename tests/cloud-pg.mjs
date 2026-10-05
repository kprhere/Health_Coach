// Shared PGlite harness: real Postgres, the real migrations, stubbed Supabase.
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);

export async function makeDb() {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('tests/cloud-prelude.sql', root), 'utf8'));
  const dir = new URL('supabase/migrations/', root);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(f, dir), 'utf8'));
  }
  return db;
}

export const [USER_A, USER_B, USER_C] = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
];

export async function addUsers(db, ids = [USER_A, USER_B, USER_C]) {
  for (const id of ids) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id.slice(0, 6)}@users.recomp.invalid`]);
  }
}

// Run fn(db) as a role with a JWT subject; always resets afterwards.
export async function as(db, role, sub, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false); set role ${role};`);
  try {
    return await fn(db);
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}
export const asUser = (db, sub, fn) => as(db, 'authenticated', sub, fn);

let n = 0;
export const uuid = () => {
  n += 1;
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
};

export const op = (collection, key, data, expected = null, extra = {}) => ({
  op_id: uuid(), collection, key, expected_version: expected, data, delete: false, ...extra,
});

export async function push(db, sub, ops) {
  return asUser(db, sub, async () => (await db.query('select public.push_ops($1::jsonb) as r', [JSON.stringify(ops)])).rows[0].r);
}

export async function newUser(db) {
  const id = globalThis.crypto.randomUUID();
  await addUsers(db, [id]);
  return id;
}

export const rows = async (db, sub, sql = 'select * from public.records order by collection, key', params = []) =>
  asUser(db, sub, async () => (await db.query(sql, params)).rows);
