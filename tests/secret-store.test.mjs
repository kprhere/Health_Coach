// The cloud passphrase must survive iOS clearing localStorage. These run the
// real secretStore against an in-memory localStorage and IndexedDB.
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
const store = await import('../src/secretStore.js');
const settle = () => new Promise((r) => setTimeout(r, 30));

test('passphrase and sync URL come back after localStorage is cleared', async () => {
  store.setSyncSecret('long secret only I know');
  store.mirrorSyncUrl('https://acp-sync.example.workers.dev');
  await settle();

  localStorage.clear(); // what iOS did after an update
  assert.equal(store.getSyncSecret(), '');

  const out = await store.restoreSyncCredentials();
  assert.equal(out.restored, true);
  assert.equal(out.secret, 'long secret only I know');
  assert.equal(out.url, 'https://acp-sync.example.workers.dev');
  assert.equal(store.getSyncSecret(), 'long secret only I know', 'back in localStorage for the sync code');
});

test('clearing the passphrase on purpose clears both copies', async () => {
  store.setSyncSecret('to be removed');
  await settle();
  store.setSyncSecret('');
  await settle();
  localStorage.clear();
  const out = await store.restoreSyncCredentials();
  assert.equal(out.secret, '');
  assert.equal(out.restored, false);
});

test('an intact localStorage copy is kept as is and re-mirrored', async () => {
  store.setSyncSecret('kept');
  await settle();
  const out = await store.restoreSyncCredentials();
  assert.equal(out.secret, 'kept');
  assert.equal(out.restored, false);
});
