// ============================================================
// sync.js - end-to-end encrypted cross-device sync.
// Your passphrase never leaves the device. From it we derive:
//   - syncId : a 160-bit hash used as the cloud key (opaque)
//   - aesKey : an AES-GCM key used to encrypt/decrypt your data
// The Cloudflare Worker only stores the ciphertext.
// ============================================================
const enc = new TextEncoder();
const dec = new TextDecoder();

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// derive { syncId, key } from the passphrase (async, Web Crypto)
export async function deriveSync(passphrase) {
  const syncId = (await sha256Hex(`${passphrase}|acp-sync-id|v1`)).slice(0, 40); // 160-bit hex id
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('acp-sync-enc|v1'), iterations: 120000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { syncId, key };
}

const toB64 = (bytes) => { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function decryptJSON(key, cipher) {
  const raw = fromB64(cipher);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(dec.decode(pt));
}

const base = (url) => url.replace(/\/+$/, '');

// returns { state, updatedAt } or null if nothing stored yet.
// throws on a wrong passphrase (decrypt fails) or a network/server error.
export async function pullRemote(url, syncId, key) {
  const res = await fetch(`${base(url)}/sync/${syncId}`);
  if (!res.ok) throw new Error(`server ${res.status}`);
  const data = await res.json();
  if (!data || !data.cipher) return null;
  const state = await decryptJSON(key, data.cipher);
  return { state, updatedAt: data.updatedAt || 0 };
}

// encrypts + uploads the state, returns the updatedAt timestamp it wrote.
export async function pushRemote(url, syncId, key, state, expectedUpdatedAt = null) {
  const cipher = await encryptJSON(key, state);
  const updatedAt = Date.now();
  const res = await fetch(`${base(url)}/sync/${syncId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updatedAt, cipher, expectedUpdatedAt }),
  });
  if (res.status === 409) {
    const error = new Error('cloud changed on another device');
    error.code = 'SYNC_CONFLICT';
    throw error;
  }
  if (!res.ok) throw new Error(`server ${res.status}`);
  return updatedAt;
}

export const canAutoPush = (settings, phase) => !!(
  settings && settings.syncAuto && settings.syncUrl && ['hydrated', 'synced'].includes(phase)
);
