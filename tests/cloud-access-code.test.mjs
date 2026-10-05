import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  BASE32, SECRET_ENTROPY_BITS, enforceUserLimit, generateAccessCode, isSyntheticEmail, maxUsersFrom,
  parseAccessCode, userEmailFor, userTagFromEmail,
} from '../src/cloud/accessCode.js';
import { runAccountCommand } from '../src/cloud/accountAdmin.js';

const rb = (n) => new Uint8Array(randomBytes(n));

test('access code has the documented shape and entropy', () => {
  const { userTag, secret, code } = generateAccessCode({ randomBytes: rb });
  assert.match(code, /^[A-Z2-7]{6}-[A-Z2-7]{24}$/);
  assert.equal(userTag.length, 6);
  assert.equal(secret.length, 24);
  assert.equal(SECRET_ENTROPY_BITS, 120);
  assert.ok(code.length >= 20, 'long enough for the 20 character password minimum');
  assert.ok([...code.replace('-', '')].every((c) => BASE32.includes(c)));
});

test('codes are unique and use the whole alphabet (no stuck bits)', () => {
  const seen = new Set();
  const chars = new Set();
  for (let i = 0; i < 400; i += 1) {
    const { code, secret } = generateAccessCode({ randomBytes: rb });
    seen.add(code);
    [...secret].forEach((c) => chars.add(c));
  }
  assert.equal(seen.size, 400);
  assert.equal(chars.size, 32);
});

test('generation uses the injected randomness, byte & 31, unbiased', () => {
  const zeros = generateAccessCode({ randomBytes: (n) => new Uint8Array(n) });
  assert.equal(zeros.code, 'AAAAAA-AAAAAAAAAAAAAAAAAAAAAAAA');
  const hi = generateAccessCode({ randomBytes: (n) => new Uint8Array(n).fill(255) });
  assert.equal(hi.secret, '7'.repeat(24));
  assert.throws(() => generateAccessCode({ randomBytes: () => new Uint8Array(2) }), /too few/);
});

test('parse accepts case and spacing, rejects everything else', () => {
  const { code, userTag, secret } = generateAccessCode({ randomBytes: rb });
  assert.deepEqual(parseAccessCode(code), { userTag, secret, code });
  assert.equal(parseAccessCode(`  ${code.toLowerCase()}\n`).code, code);
  assert.equal(parseAccessCode(code.replace('-', ' - ')).code, code);
  for (const bad of ['', 'abc', null, undefined, 42, `${code}X`, code.slice(1), code.replace('-', ''), `${userTag}-${secret.slice(0, 23)}1`, `${userTag}_${secret}`, 'AAAAA1-AAAAAAAAAAAAAAAAAAAAAAAA']) {
    assert.equal(parseAccessCode(bad), null, String(bad));
  }
});

test('synthetic email round-trips and refuses real addresses', () => {
  assert.equal(userEmailFor('ABC234'), 'abc234@users.recomp.invalid');
  assert.equal(userTagFromEmail('abc234@users.recomp.invalid'), 'ABC234');
  assert.equal(isSyntheticEmail('me@gmail.com'), false);
  assert.equal(userTagFromEmail('me@gmail.com'), null);
});

test('user limit is enforced and configurable', () => {
  assert.throws(() => enforceUserLimit({ activeUsers: 5 }), (e) => e.code === 'USER_LIMIT');
  assert.throws(() => enforceUserLimit({ activeUsers: 2, max: 2 }), /limit reached/);
  assert.equal(enforceUserLimit({ activeUsers: 4 }).remaining, 0);
  assert.equal(enforceUserLimit({ activeUsers: 0, max: '3' }).remaining, 2);
  assert.equal(maxUsersFrom(undefined), 5);
  assert.equal(maxUsersFrom('garbage'), 5);
  assert.equal(maxUsersFrom('-1'), 5);
  assert.equal(maxUsersFrom('9'), 9);
});

// ---- the admin CLI logic against a fake Supabase admin client ------------
function fakeAdmin() {
  const users = [];
  const removed = [];
  const calls = { signOut: [], signIn: [] };
  const files = { list: {} };
  const admin = {
    users,
    removed,
    calls,
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [...users] }, error: null }),
        createUser: async ({ email, password, email_confirm, user_metadata }) => {
          assert.equal(email_confirm, true);
          const u = { id: `id-${users.length + 1}`, email, password, user_metadata, created_at: 'now' };
          users.push(u);
          return { data: { user: u }, error: null };
        },
        updateUserById: async (id, patch) => { users.find((u) => u.id === id).password = patch.password; return { error: null }; },
        signOut: async (jwt, scope) => { calls.signOut.push({ jwt, scope }); return { error: null }; },
        deleteUser: async (id) => { users.splice(users.findIndex((u) => u.id === id), 1); return { error: null }; },
      },
    },
    storage: {
      from: () => ({
        list: async (folder) => ({ data: files.list[folder] || [], error: null }),
        remove: async (paths) => { removed.push(...paths); return { error: null }; },
      }),
    },
  };
  admin.files = files;
  return admin;
}
const run = async (admin, argv, env = {}, extra = {}) => {
  const lines = [];
  const result = await runAccountCommand({ argv, admin, env, out: (l) => lines.push(l), randomBytes: rb, ...extra });
  return { result, lines };
};

test('create makes a confirmed synthetic-email user whose password is the code, printed once', async () => {
  const admin = fakeAdmin();
  const { result, lines } = await run(admin, ['create', 'Alex', 'phone']);
  const u = admin.users[0];
  assert.equal(u.password, result.code);
  assert.equal(u.email, userEmailFor(result.userTag));
  assert.equal(u.user_metadata.label, 'Alex phone');
  assert.equal(lines.filter((l) => l.includes(result.code)).length, 1);
  const { lines: listing } = await run(admin, ['list']);
  assert.ok(!listing.join('\n').includes(result.code), 'list never shows secrets');
});

test('create refuses past MAX_USERS (default 5)', async () => {
  const admin = fakeAdmin();
  for (let i = 0; i < 5; i += 1) await run(admin, ['create', `u${i}`]);
  await assert.rejects(run(admin, ['create', 'sixth']), (e) => e.code === 'USER_LIMIT');
  assert.equal(admin.users.length, 5);
  await run(admin, ['create', 'sixth'], { MAX_USERS: '6' });
  assert.equal(admin.users.length, 6);
  await assert.rejects(run(admin, ['create']), /usage/);
});

test('regenerate keeps the tag, changes the secret, and revokes sessions', async () => {
  const admin = fakeAdmin();
  const { result: made } = await run(admin, ['create', 'Sam']);
  const signInClient = () => ({ auth: { signInWithPassword: async ({ email, password }) => {
    admin.calls.signIn.push({ email, password });
    return { data: { session: { access_token: 'jwt-123' } }, error: null };
  } } });
  const { result } = await run(admin, ['regenerate', made.userTag.toLowerCase()], {}, { makeSignInClient: signInClient });
  assert.equal(result.userTag, made.userTag);
  assert.notEqual(result.code, made.code);
  assert.equal(parseAccessCode(result.code).userTag, made.userTag);
  assert.notEqual(parseAccessCode(result.code).secret, parseAccessCode(made.code).secret);
  assert.equal(admin.users[0].password, result.code);
  assert.deepEqual(admin.calls.signOut, [{ jwt: 'jwt-123', scope: 'global' }]);
  assert.equal(result.sessionsRevoked, true);
  await assert.rejects(run(admin, ['regenerate', 'ZZZZZZ']), /no such user/);
});

test('delete needs --yes, removes files then the user', async () => {
  const admin = fakeAdmin();
  const { result: made } = await run(admin, ['create', 'Del']);
  const uid = admin.users[0].id;
  admin.files.list[uid] = [{ name: 'scan', id: null }];
  admin.files.list[`${uid}/scan`] = [{ name: 'a.png', id: 'x' }, { name: 'b.png', id: 'y' }];
  const dry = await run(admin, ['delete', made.userTag]);
  assert.equal(dry.result.deleted, false);
  assert.equal(admin.users.length, 1);
  const real = await run(admin, ['delete', made.userTag, '--yes']);
  assert.equal(real.result.deleted, true);
  assert.deepEqual(admin.removed.sort(), [`${uid}/scan/a.png`, `${uid}/scan/b.png`]);
  assert.equal(admin.users.length, 0);
});

test('unknown command prints usage', async () => {
  await assert.rejects(run(fakeAdmin(), ['frobnicate']), /usage/);
});
