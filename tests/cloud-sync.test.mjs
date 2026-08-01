import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../cloudflare/src/worker.js';
import { decryptJSON, deriveSync, encryptJSON, pullRemote, pushRemote } from '../src/sync.js';

function memoryEnvironment() {
  const values = new Map();
  return {
    ACP_SYNC: {
      async get(key) { return values.get(key) ?? null; },
      async put(key, value) { values.set(key, value); },
    },
  };
}

test('encrypted state round-trips and a wrong passphrase fails', async () => {
  const correct = await deriveSync('correct regression-test passphrase');
  const wrong = await deriveSync('wrong regression-test passphrase');
  const state = { workouts: [{ name: 'Upper B', complete: true }] };
  const first = await encryptJSON(correct.key, state);
  const second = await encryptJSON(correct.key, state);

  assert.notEqual(first, second);
  assert.deepEqual(await decryptJSON(correct.key, first), state);
  await assert.rejects(() => decryptJSON(wrong.key, first));
});

test('client push and pull complete through the Worker contract', async () => {
  const env = memoryEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => worker.fetch(new Request(input, init), env);
  try {
    const { syncId, key } = await deriveSync('end-to-end regression-test passphrase');
    const state = { settings: { units: 'lb' }, logs: { today: ['walk', 'lift'] } };
    const updatedAt = await pushRemote('https://worker.test/', syncId, key, state);
    const pulled = await pullRemote('https://worker.test', syncId, key);
    assert.equal(pulled.updatedAt, updatedAt);
    assert.deepEqual(pulled.state, state);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Worker rejects malformed and oversized payloads', async () => {
  const env = memoryEnvironment();
  const id = 'a'.repeat(40);
  let response = await worker.fetch(new Request(`https://worker.test/sync/${id}`, { method: 'PUT', body: '{' }), env);
  assert.equal(response.status, 400);
  response = await worker.fetch(new Request(`https://worker.test/sync/${id}`, {
    method: 'PUT', body: JSON.stringify({ cipher: 'x'.repeat(2_000_001) }),
  }), env);
  assert.equal(response.status, 413);
});
