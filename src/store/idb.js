// ============================================================
// idb.js - a thin, strict wrapper over IndexedDB.
//
// Rules this file exists to enforce:
//   * a write promise resolves ONLY on transaction.oncomplete - a request's
//     onsuccess means "queued", not "durable";
//   * an aborted transaction (including a quota failure) always rejects, with
//     a machine-readable `reason`;
//   * every account has a database of its own, so one account's records can
//     never be read or written while another is signed in;
//   * schema changes are versioned upgrades that never drop a store that
//     holds user data.
// ============================================================

export const DB_VERSION = 2;
export const DB_PREFIX = 'recomp-';

export const STORES = ['records', 'outbox', 'conflicts', 'meta', 'files', 'staging'];

export class StoreError extends Error {
  constructor(reason, message, cause) {
    super(message || reason);
    this.name = 'StoreError';
    this.reason = reason;
    if (cause) this.cause = cause;
  }
}

// Map any thrown thing (DOMException, our own StoreError, a string) to a
// StoreError whose `reason` the UI can act on.
export function toStoreError(err, fallback = 'error') {
  if (err instanceof StoreError) return err;
  const name = err && err.name;
  const message = err && err.message ? err.message : String(err || fallback);
  let reason = fallback;
  if (name === 'QuotaExceededError' || (err && err.code === 22)) reason = 'quota';
  else if (name === 'VersionError') reason = 'version-newer';
  else if (name === 'InvalidStateError' || name === 'TransactionInactiveError') reason = 'closed';
  else if (name === 'AbortError') reason = 'aborted';
  else if (name === 'SecurityError' || name === 'UnknownError' || name === 'NotAllowedError') reason = 'unavailable';
  return new StoreError(reason, message, err);
}

// ---------- account database naming ----------
const ACCOUNT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

// Strict on purpose: the id becomes part of a database name and is the only
// thing keeping two people's data apart. Anything unexpected is refused, not
// "cleaned up" into something that might collide with another id.
export function sanitizeAccountId(accountId) {
  if (accountId === undefined || accountId === null || accountId === '') return 'local';
  if (typeof accountId !== 'string' || !ACCOUNT_ID_RE.test(accountId)) {
    throw new StoreError('invalid-account-id', 'Account id must be 1-64 characters of letters, digits, "-" or "_".');
  }
  return accountId;
}

export const dbNameFor = (accountId) => `${DB_PREFIX}${sanitizeAccountId(accountId)}`;

// ---------- support detection ----------
export function isSupported(idb = globalThis.indexedDB) {
  try { return !!idb && typeof idb.open === 'function'; } catch { return false; }
}

// The sync check passes in Safari/Firefox private modes that then fail on the
// first open. This actually opens (and discards) a probe database.
export async function probeSupport(idb = globalThis.indexedDB) {
  if (!isSupported(idb)) return { supported: false, reason: 'unavailable' };
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const req = idb.open('recomp-probe', 1);
      req.onupgradeneeded = () => { /* empty database is enough */ };
      req.onsuccess = () => { try { req.result.close(); } catch { /* ignore */ } done({ supported: true }); };
      req.onerror = () => done({ supported: false, reason: toStoreError(req.error, 'unavailable').reason });
      req.onblocked = () => done({ supported: false, reason: 'blocked' });
    } catch (e) {
      done({ supported: false, reason: toStoreError(e, 'unavailable').reason });
    }
  });
}

// ---------- request / transaction helpers ----------
export const reqP = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// ---------- schema ----------
// Upgrades are cumulative and idempotent. NEVER delete a store here: v1 users
// have records in it. New versions add stores or indexes only.
export const SCHEMA_UPGRADES = {
  1(db) {
    db.createObjectStore('records', { keyPath: ['collection', 'key'] });
    const outbox = db.createObjectStore('outbox', { keyPath: 'opId' });
    outbox.createIndex('createdAt', 'createdAt');
    db.createObjectStore('meta', { keyPath: 'key' });
  },
  2(db, tx) {
    if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    // Migration staging area: same shape as records, never read by load().
    if (!db.objectStoreNames.contains('staging')) db.createObjectStore('staging', { keyPath: ['collection', 'key'] });
    const outbox = tx.objectStore('outbox');
    if (!outbox.indexNames.contains('byKey')) outbox.createIndex('byKey', ['collection', 'key']);
  },
};

// ---------- the wrapper ----------
class Db {
  constructor(raw, name) {
    this.raw = raw;
    this.name = name;
    this.closed = false;
  }

  // Run `fn(stores)` in one transaction. `stores` is an object of
  // name -> IDBObjectStore for the requested stores. fn may be async but must
  // only await IndexedDB requests (use reqP), or the transaction will commit
  // early. Resolves with fn's result AFTER oncomplete; rejects on abort.
  tx(storeNames, mode, fn) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = this.raw.transaction(names, mode); } catch (e) { reject(toStoreError(e)); return; }
      let result;
      let failure = null;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || toStoreError(tx.error || new Error('transaction aborted'), 'aborted'));
      tx.onerror = () => { /* the abort handler reports it */ };
      const fail = (e) => {
        if (!failure) failure = toStoreError(e);
        try { tx.abort(); } catch { /* already finished */ }
      };
      try {
        const stores = {};
        names.forEach((n) => { stores[n] = tx.objectStore(n); });
        Promise.resolve(fn(stores, tx)).then((r) => { result = r; }, fail);
      } catch (e) { fail(e); }
    });
  }

  get(store, key) { return this.tx(store, 'readonly', (s) => reqP(s[store].get(key))); }

  getAll(store) { return this.tx(store, 'readonly', (s) => reqP(s[store].getAll())); }

  put(store, value) { return this.tx(store, 'readwrite', (s) => reqP(s[store].put(value))); }

  delete(store, key) { return this.tx(store, 'readwrite', (s) => reqP(s[store].delete(key))); }

  async getMeta(key) {
    const row = await this.get('meta', key);
    return row ? row.value : undefined;
  }

  setMeta(key, value) { return this.put('meta', { key, value }); }

  deleteMeta(key) { return this.delete('meta', key); }

  close() {
    this.closed = true;
    try { this.raw.close(); } catch { /* ignore */ }
  }
}

export function openDb(name, {
  version = DB_VERSION, upgrades = SCHEMA_UPGRADES, indexedDB: idb = globalThis.indexedDB,
  onBlocked, onVersionChange,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!isSupported(idb)) { reject(new StoreError('unsupported', 'IndexedDB is not available in this browser.')); return; }
    let req;
    try { req = idb.open(name, version); } catch (e) { reject(toStoreError(e, 'unavailable')); return; }
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      for (let v = event.oldVersion + 1; v <= (event.newVersion || version); v++) {
        if (!upgrades[v]) throw new StoreError('schema', `No upgrade defined for schema version ${v}`);
        upgrades[v](db, tx, event.oldVersion);
      }
    };
    // Another tab holds an older connection open and is not closing it.
    req.onblocked = () => { if (onBlocked) onBlocked({ name }); };
    req.onerror = () => reject(toStoreError(req.error, 'unavailable'));
    req.onsuccess = () => {
      const raw = req.result;
      const wrapped = new Db(raw, name);
      // A newer tab wants to upgrade or delete this database: step aside so it
      // is never blocked by us, and tell the app so it can reload.
      raw.onversionchange = () => {
        wrapped.close();
        if (onVersionChange) onVersionChange({ name });
      };
      raw.onclose = () => { wrapped.closed = true; };
      resolve(wrapped);
    };
  });
}

// Open the database that belongs to exactly one account. The account id is
// stamped into the database on first open and checked on every later open, so
// even a renamed or mis-routed database is refused rather than read.
export async function openAccountDb(accountId, options = {}) {
  const id = sanitizeAccountId(accountId);
  const db = await openDb(dbNameFor(id), options);
  db.accountId = id;
  try {
    const stamp = await db.getMeta('accountId');
    if (stamp === undefined) await db.setMeta('accountId', id);
    else if (stamp !== id) throw new StoreError('account-mismatch', `Database ${db.name} belongs to a different account.`);
  } catch (e) {
    db.close();
    throw toStoreError(e);
  }
  return db;
}

export function deleteAccountDb(accountId, idb = globalThis.indexedDB) {
  const name = dbNameFor(accountId);
  return new Promise((resolve, reject) => {
    if (!isSupported(idb)) { resolve(false); return; }
    const req = idb.deleteDatabase(name);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(toStoreError(req.error));
    // onblocked just means another connection is still closing; success follows.
  });
}
