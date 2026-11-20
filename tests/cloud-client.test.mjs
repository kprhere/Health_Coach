import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCloudClient, sessionStorageKeyFor, accountScopedKey, isSessionExpired,
} from '../src/cloud/client.js';
import { generateAccessCode, userEmailFor } from '../src/cloud/accessCode.js';

function mockSupabase() {
  const state = { listener: null, signIns: [], rpcs: [], signOuts: 0, opts: null, nextSignIn: null, nextRpc: null };
  const factory = (url, key, opts) => {
    state.opts = { url, key, opts };
    return {
      auth: {
        onAuthStateChange: (cb) => { state.listener = cb; },
        signInWithPassword: async (cred) => {
          state.signIns.push(cred);
          return state.nextSignIn || { data: { user: { id: 'u1' }, session: { expires_at: 9e12 } }, error: null };
        },
        signOut: async () => { state.signOuts += 1; state.listener('SIGNED_OUT', null); return { error: null }; },
        getSession: async () => ({ data: { session: state.session || null } }),
        refreshSession: async () => ({ data: { session: { expires_at: 9e12 } }, error: null }),
      },
      rpc: async (name, args) => { state.rpcs.push({ name, args }); return state.nextRpc || { data: { applied: [] }, error: null, status: 200 }; },
    };
  };
  return { state, factory };
}
const make = (m) => createCloudClient({ url: 'https://abcdef.supabase.co', anonKey: 'anon', supabaseFactory: m.factory });

test('client config: persisted, auto-refreshing, project-scoped session key', () => {
  const m = mockSupabase();
  make(m);
  const { auth } = m.state.opts.opts;
  assert.equal(auth.persistSession, true);
  assert.equal(auth.autoRefreshToken, true);
  assert.equal(auth.detectSessionInUrl, false);
  assert.equal(auth.storageKey, sessionStorageKeyFor('https://abcdef.supabase.co'));
  assert.notEqual(sessionStorageKeyFor('https://abcdef.supabase.co'), sessionStorageKeyFor('https://zzzzzz.supabase.co'));
  assert.equal(accountScopedKey('u1', 'outbox'), 'recomp:u1:outbox');
  assert.throws(() => createCloudClient({ url: '', anonKey: '' }));
});

test('login turns an access code into the synthetic email + code password', async () => {
  const m = mockSupabase();
  const c = make(m);
  const { code, userTag } = generateAccessCode();
  const r = await c.loginWithAccessCode(` ${code.toLowerCase()} `);
  assert.equal(r.ok, true);
  assert.equal(r.accountId, 'u1');
  assert.deepEqual(m.state.signIns[0], { email: userEmailFor(userTag), password: code });
  assert.deepEqual(await c.loginWithAccessCode('not a code'), { ok: false, error: 'invalid-format' });
  assert.equal(m.state.signIns.length, 1, 'malformed codes never reach the server');
  m.state.nextSignIn = { data: {}, error: { status: 400, message: 'Invalid login credentials' } };
  assert.equal((await c.loginWithAccessCode(code)).error, 'invalid-credentials');
  m.state.nextSignIn = { data: {}, error: { message: 'Failed to fetch' } };
  assert.equal((await c.loginWithAccessCode(code)).error, 'network');
});

test('logout is refused with pending changes unless forced; session death is distinguishable', async () => {
  const m = mockSupabase();
  const c = make(m);
  const events = [];
  c.onAuthStateChange((e) => events.push(e));
  const pending = { canSwitchAccount: async () => ({ ok: false, pendingCount: 3 }) };
  assert.deepEqual(await c.logout({ engine: pending }), { ok: false, reason: 'pending-changes', pendingCount: 3 });
  assert.equal(m.state.signOuts, 0);
  m.state.listener('SIGNED_OUT', null); // token revoked / refresh failed
  assert.equal((await c.logout({ engine: pending, force: true })).ok, true);
  assert.deepEqual(events, ['SESSION_EXPIRED', 'LOGGED_OUT']);
});

test('expiry helper and refresh', async () => {
  assert.equal(isSessionExpired(null), true);
  assert.equal(isSessionExpired({ expires_at: 1000 }, 1_000_000 + 1), true);
  assert.equal(isSessionExpired({ expires_at: 1000 }, 900_000), false);
  assert.equal(isSessionExpired({ expires_at: 1000 }, 980_000), true, 'within the skew window');
  const m = mockSupabase();
  const c = make(m);
  m.state.session = { expires_at: 1 };
  assert.equal((await c.ensureSession()).expires_at, 9e12);
  m.state.session = null;
  assert.equal(await c.ensureSession(), null);
});

test('transport maps RPC results and errors for the sync engine', async () => {
  const m = mockSupabase();
  const c = make(m);
  assert.deepEqual(await c.transport.pushOps([{ op_id: 'x' }]), { applied: [] });
  assert.equal(m.state.rpcs[0].name, 'push_ops');
  m.state.nextRpc = { data: [{ collection: 'a', key: 'k', data: {}, version: 2, updated_at: 't', deleted_at: null }], error: null };
  assert.deepEqual(await c.transport.pullChanges('2026-01-01T00:00:00Z', 10), [{ collection: 'a', key: 'k', data: {}, version: 2, updatedAt: 't', deletedAt: null, deleted: false }]);
  assert.deepEqual(m.state.rpcs[1].args, { since: '2026-01-01T00:00:00Z', max_rows: 10 });
  m.state.nextRpc = { data: null, error: { message: 'Failed to fetch' }, status: 0 };
  await assert.rejects(c.transport.pushOps([]), (e) => e.code === 'NETWORK');
  m.state.nextRpc = { data: null, error: { message: 'bad', code: '22023' }, status: 400 };
  await assert.rejects(c.transport.pushOps([]), (e) => e.status === 400);
  m.state.nextRpc = { data: null, error: { message: 'jwt expired', code: 'PGRST301' }, status: 401 };
  await assert.rejects(c.transport.pullChanges(null), (e) => e.status === 401);
});
