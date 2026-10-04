// ============================================================
// records.js - the record model shared by the local store and the sync engine.
//
// A state object is exploded into small independent records so that a change
// to one day's log touches one row (and sends one outbox op), not the whole
// document. The mapping is LOSSLESS: assembleState(explodeState(s)) deep-equals
// s for any state, including fields this build has never heard of - those go
// to the 'meta' collection keyed by their top-level field name.
//
// record = { collection, key, data, version, deleted }
// explode/diff work on { collection, key, data } and leave version/deleted to
// the store, which is the only thing that knows server versions.
// ============================================================

// Per-date / per-name maps. One record per key; collection === field name.
export const MAP_FIELDS = [
  'workoutSessions', 'mealLogs', 'beverageLogs', 'habitLogs', 'watchLogs',
  'supplementLogs', 'activity', 'saturdayMode', 'dayOverrides', 'workoutSwaps',
  'exerciseNotes', 'customExercises', 'restartWeights', 'planOverrides',
];
// Arrays of objects with a unique id. Order is kept in meta 'order:<field>'.
export const ARRAY_FIELDS = ['bodyScans'];
// planVersions may be an array (by id) or a map (by id) - the shape is recorded.
export const EITHER_FIELDS = ['planVersions'];
export const SINGLETON_FIELDS = ['profile', 'settings', 'program'];

export const COLLECTIONS = [
  ...MAP_FIELDS, ...ARRAY_FIELDS, ...EITHER_FIELDS, ...SINGLETON_FIELDS,
  'coachProposals', 'coachAudit', 'meta',
];

export const SINGLETON_KEY = 'singleton';
export const SHAPE_KEY = '$fields'; // meta: which structured fields exist and how
export const ORDER_PREFIX = 'order:'; // meta: array order
// Meta records that describe this device's own storage rather than the user's
// data. The store never queues these for sync.
export const LOCAL_ONLY_META = new Set([SHAPE_KEY]);

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Own-property set that is safe for keys like '__proto__' (JSON.parse creates
// them as ordinary own keys and a plain assignment would swallow them).
function put(obj, k, v) {
  Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
}

// ---------- stable stringify / hash ----------
export function stableStringify(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (t === 'string' || t === 'boolean') return JSON.stringify(value);
  if (t === 'undefined' || t === 'function' || t === 'symbol') return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (t === 'object') {
    if (typeof value.toJSON === 'function') return stableStringify(value.toJSON());
    const parts = [];
    for (const k of Object.keys(value).sort()) {
      if (value[k] === undefined || typeof value[k] === 'function') continue;
      parts.push(`${JSON.stringify(k)}:${stableStringify(value[k])}`);
    }
    return `{${parts.join(',')}}`;
  }
  return 'null';
}

// Two independent FNV-1a passes + length. A compact fingerprint; the diff
// itself compares the full canonical string so a collision can never swallow
// a change.
export function recordHash(data) {
  const s = stableStringify(data);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}-${s.length.toString(16)}`;
}

// ---------- explode ----------
const rec = (collection, key, data) => ({ collection, key, data });
const meta = (key, data) => rec('meta', key, data);

// Keys for an array of objects, or null if they cannot be keyed uniquely.
function keysById(arr, idFields) {
  for (const f of idFields) {
    const keys = [];
    const seen = new Set();
    let ok = true;
    for (const el of arr) {
      const id = isPlain(el) ? el[f] : undefined;
      const valid = (typeof id === 'string' && id !== '') || (typeof id === 'number' && Number.isFinite(id));
      if (!valid || seen.has(String(id))) { ok = false; break; }
      seen.add(String(id));
      keys.push(String(id));
    }
    if (ok) return keys;
  }
  return null;
}

const padIndex = (i) => String(i).padStart(8, '0');

// `indexFallback`: an append-only log may be keyed by position when its
// entries carry no usable id.
function explodeArray(field, collection, arr, idFields, indexFallback = false) {
  let keys = keysById(arr, idFields);
  if (!keys && indexFallback) keys = arr.map((_, i) => padIndex(i));
  if (!keys) return null;
  const records = arr.map((el, i) => rec(collection, keys[i], el));
  records.push(meta(ORDER_PREFIX + field, keys));
  return records;
}

function explodeMap(collection, obj) {
  const out = [];
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) continue;
    out.push(rec(collection, k, obj[k]));
  }
  return out;
}

// -> { records, shape }; shape is undefined for fields that need no entry in
// the $fields record.
export function explodeField(field, value) {
  if (value === undefined) return { records: [], shape: undefined };
  if (MAP_FIELDS.includes(field) && isPlain(value)) {
    return { records: explodeMap(field, value), shape: 'map' };
  }
  if ((ARRAY_FIELDS.includes(field) || EITHER_FIELDS.includes(field)) && Array.isArray(value)) {
    const records = explodeArray(field, field, value, ['id']);
    if (records) return { records, shape: 'array' };
  }
  if (EITHER_FIELDS.includes(field) && isPlain(value)) {
    return { records: explodeMap(field, value), shape: 'map' };
  }
  if (SINGLETON_FIELDS.includes(field) && isPlain(value)) {
    return { records: [rec(field, SINGLETON_KEY, value)], shape: undefined };
  }
  if (field === 'coach' && isPlain(value)) {
    const rest = { ...value };
    let shape = '';
    const records = [];
    if (Array.isArray(value.proposals)) {
      const ex = explodeArray('coach.proposals', 'coachProposals', value.proposals, ['id']);
      if (ex) { records.push(...ex); delete rest.proposals; shape += 'p'; }
    }
    if (Array.isArray(value.audit)) {
      const ex = explodeArray('coach.audit', 'coachAudit', value.audit, ['id', 'ts'], true);
      if (ex) { records.push(...ex); delete rest.audit; shape += 'a'; }
    }
    if (shape) {
      records.push(meta('coach', rest));
      return { records, shape: `coach:${shape}` };
    }
  }
  // Everything else - including known fields with unexpected types and fields
  // from the future - is stored verbatim so nothing is ever dropped.
  return { records: [meta(field, value)], shape: undefined };
}

function shapeData(shapes) {
  const names = Object.keys(shapes).sort();
  if (!names.length) return null;
  const data = {};
  names.forEach((n) => { data[n] = shapes[n]; });
  return data;
}

export function explodeState(state) {
  const s = isPlain(state) ? state : {};
  const records = [];
  const shapes = {};
  for (const field of Object.keys(s)) {
    const { records: r, shape } = explodeField(field, s[field]);
    records.push(...r);
    if (shape) shapes[field] = shape;
  }
  const sd = shapeData(shapes);
  if (sd) records.push(meta(SHAPE_KEY, sd));
  return records;
}

// ---------- assemble ----------
const live = (r) => r && !r.deleted && r.data !== undefined;

function orderedValues(ids, byKey, fallbackSort) {
  const seen = new Set();
  const out = [];
  (Array.isArray(ids) ? ids : []).forEach((k) => {
    if (byKey.has(k) && !seen.has(k)) { seen.add(k); out.push(byKey.get(k)); }
  });
  // Records that arrived from another device and are not in the order list yet.
  [...byKey.keys()].filter((k) => !seen.has(k)).sort(fallbackSort).forEach((k) => out.push(byKey.get(k)));
  return out;
}

const dateThenKey = (map) => (a, b) => {
  const da = String((map.get(a) || {}).date || '');
  const db = String((map.get(b) || {}).date || '');
  return da.localeCompare(db) || a.localeCompare(b);
};

export function assembleState(records) {
  const list = records instanceof Map ? [...records.values()] : Array.from(records || []);
  const byColl = new Map();
  for (const r of list) {
    if (!live(r)) continue;
    if (!byColl.has(r.collection)) byColl.set(r.collection, new Map());
    byColl.get(r.collection).set(r.key, r.data);
  }
  const coll = (c) => byColl.get(c) || new Map();
  const metaMap = coll('meta');
  const shapes = isPlain(metaMap.get(SHAPE_KEY)) ? metaMap.get(SHAPE_KEY) : {};
  const state = {};

  for (const [k, v] of metaMap) {
    if (k === SHAPE_KEY || k.startsWith(ORDER_PREFIX)) continue;
    put(state, k, v);
  }

  const mapOf = (c) => { const o = {}; for (const [k, v] of coll(c)) put(o, k, v); return o; };
  const arrayOf = (field, c) => {
    const byKey = coll(c);
    return orderedValues(metaMap.get(ORDER_PREFIX + field), byKey, dateThenKey(byKey));
  };

  for (const f of MAP_FIELDS) {
    if (shapes[f] === 'map' || coll(f).size) put(state, f, mapOf(f));
  }
  for (const f of ARRAY_FIELDS) {
    if (shapes[f] === 'array' || coll(f).size) put(state, f, arrayOf(f, f));
  }
  for (const f of EITHER_FIELDS) {
    const asArray = shapes[f] === 'array' || (shapes[f] === undefined && metaMap.has(ORDER_PREFIX + f));
    if (shapes[f] === 'array' || shapes[f] === 'map' || coll(f).size) {
      put(state, f, asArray ? arrayOf(f, f) : mapOf(f));
    }
  }
  for (const f of SINGLETON_FIELDS) {
    if (coll(f).has(SINGLETON_KEY)) put(state, f, coll(f).get(SINGLETON_KEY));
  }

  const coachShape = typeof shapes.coach === 'string' && shapes.coach.startsWith('coach:') ? shapes.coach.slice(6) : '';
  const hasP = coachShape.includes('p') || coll('coachProposals').size > 0;
  const hasA = coachShape.includes('a') || coll('coachAudit').size > 0;
  if (hasP || hasA) {
    const coach = isPlain(state.coach) ? { ...state.coach } : {};
    if (hasP) coach.proposals = arrayOf('coach.proposals', 'coachProposals');
    if (hasA) {
      coach.audit = orderedValues(metaMap.get(`${ORDER_PREFIX}coach.audit`), coll('coachAudit'), (a, b) => a.localeCompare(b));
    }
    put(state, 'coach', coach);
  }
  return state;
}

// ---------- diff ----------
const idOf = (r) => `${r.collection}\u0000${r.key}`;

function indexRecords(records) {
  const m = new Map();
  records.forEach((r) => m.set(idOf(r), { r, str: stableStringify(r.data) }));
  return m;
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const fieldRecords = (state, f) => (hasOwn(state, f) ? explodeField(f, state[f]) : { records: [], shape: undefined });

function allShapes(state) {
  const shapes = {};
  for (const f of Object.keys(state)) {
    const { shape } = explodeField(f, state[f]);
    if (shape) shapes[f] = shape;
  }
  return shapeData(shapes);
}

// Changed records between two states, as upserts and deletes. Fields whose
// value is the same object in both states are skipped without being read.
export function diffStates(prev, next) {
  const p = isPlain(prev) ? prev : {};
  const n = isPlain(next) ? next : {};
  const fields = new Set([...Object.keys(p), ...Object.keys(n)]);
  const changes = [];
  let shapeChanged = false;

  for (const f of fields) {
    if (hasOwn(p, f) && hasOwn(n, f) && p[f] === n[f]) continue;
    const a = fieldRecords(p, f);
    const b = fieldRecords(n, f);
    if (a.shape !== b.shape) shapeChanged = true;
    const ia = indexRecords(a.records);
    const ib = indexRecords(b.records);
    for (const [id, { r, str }] of ib) {
      const old = ia.get(id);
      if (!old || old.str !== str) changes.push({ collection: r.collection, key: r.key, data: r.data, deleted: false });
    }
    for (const [id, { r }] of ia) {
      if (!ib.has(id)) changes.push({ collection: r.collection, key: r.key, data: null, deleted: true });
    }
  }

  if (shapeChanged) {
    const before = stableStringify(allShapes(p));
    const afterData = allShapes(n);
    if (before !== stableStringify(afterData)) {
      if (afterData) changes.push({ collection: 'meta', key: SHAPE_KEY, data: afterData, deleted: false });
      else changes.push({ collection: 'meta', key: SHAPE_KEY, data: null, deleted: true });
    }
  }
  return changes.sort((x, y) => x.collection.localeCompare(y.collection) || x.key.localeCompare(y.key));
}

// Deep, strict comparison. Returns the differing paths (up to `limit`).
export function findMismatches(a, b, path = '$', out = [], limit = 20) {
  if (out.length >= limit || a === b) return out;
  const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  const ta = kind(a);
  const tb = kind(b);
  if (ta !== tb) { out.push(`${path}: type ${ta} != ${tb}`); return out; }
  if (ta === 'array') {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} != ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) findMismatches(a[i], b[i], `${path}[${i}]`, out, limit);
    return out;
  }
  if (ta === 'object') {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    for (const k of ka) {
      if (!kb.includes(k)) out.push(`${path}.${k}: missing in second`);
      else findMismatches(a[k], b[k], `${path}.${k}`, out, limit);
    }
    for (const k of kb) if (!ka.includes(k)) out.push(`${path}.${k}: missing in first`);
    return out;
  }
  if (!(Number.isNaN(a) && Number.isNaN(b))) out.push(`${path}: ${String(a)} != ${String(b)}`);
  return out;
}
