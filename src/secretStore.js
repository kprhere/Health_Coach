// Cloud sync credentials that survive iOS clearing the app's storage.
//
// The passphrase used to live in one localStorage key. iOS can clear a Home
// Screen web app's storage (low space, "Clear History and Website Data", a
// removed and re-added icon), and the passphrase disappeared after updates.
// Three defences, any one of which is enough:
//   1. iCloud Keychain: the Sync screen is a real password form, so iPhone
//      offers to save the passphrase and autofills it later (survives a wipe).
//   2. Persistent storage: ask the browser not to evict this app's data.
//   3. A second copy of the passphrase and the sync URL in IndexedDB, restored
//      into localStorage at startup if the localStorage copy went missing.
// The passphrase never goes into app state, exports or the cloud blob.

export const SYNC_SECRET_KEY = 'recomp-sync-secret';
export const SYNC_URL_BACKUP_KEY = 'recomp-sync-url-backup';
const DB_NAME = 'recomp-secrets';
const STORE = 'kv';

const ls = {
  get(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
  set(key, value) { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* blocked */ } },
};

function openDb() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function idbGet(key) {
  const db = await openDb();
  if (!db) return '';
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || '');
      req.onerror = () => resolve('');
    } catch { resolve(''); }
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      const req = value ? store.put(value, key) : store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export const getSyncSecret = () => ls.get(SYNC_SECRET_KEY);

export function setSyncSecret(value) {
  ls.set(SYNC_SECRET_KEY, value);
  idbSet(SYNC_SECRET_KEY, value);
}

// Keep a copy of the sync URL outside app state, so a wiped state can find
// its way back to the cloud copy once the passphrase is restored.
export function mirrorSyncUrl(url) {
  if (!url) return;
  ls.set(SYNC_URL_BACKUP_KEY, url);
  idbSet(SYNC_URL_BACKUP_KEY, url);
}

// Startup: put back whatever survived in the other store. Returns what is now
// available so the app can re-arm auto-sync and refill an empty sync URL.
export async function restoreSyncCredentials() {
  let secret = ls.get(SYNC_SECRET_KEY);
  let url = ls.get(SYNC_URL_BACKUP_KEY);
  let restored = false;
  if (!secret) {
    secret = await idbGet(SYNC_SECRET_KEY);
    if (secret) { ls.set(SYNC_SECRET_KEY, secret); restored = true; }
  } else {
    idbSet(SYNC_SECRET_KEY, secret);
  }
  if (!url) {
    url = await idbGet(SYNC_URL_BACKUP_KEY);
    if (url) ls.set(SYNC_URL_BACKUP_KEY, url);
  } else {
    idbSet(SYNC_URL_BACKUP_KEY, url);
  }
  return { secret, url, restored };
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* not supported */ }
  return false;
}
