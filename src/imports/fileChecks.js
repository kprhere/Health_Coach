// ============================================================
// imports/fileChecks.js - is this upload even the kind of file it claims to be?
//
// Uploaded files are untrusted DATA. Nothing here opens, renders or executes
// them; it only looks at size, the first/last bytes and the declared name/type
// and refuses anything that does not line up. Pure and synchronous apart from
// sha256Hex (crypto.subtle).
// ============================================================

export const MB = 1024 * 1024;
export const LIMITS = {
  pdf: 10 * MB, jpeg: 10 * MB, png: 10 * MB,
  csv: 1 * MB, json: 1 * MB, text: 1 * MB,
  maxPdfPages: 40,
};

const EXT_KIND = {
  pdf: 'pdf', jpg: 'jpeg', jpeg: 'jpeg', png: 'png',
  csv: 'csv', json: 'json', txt: 'text', text: 'text', md: 'text',
};
const MIME_KIND = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png',
  'text/csv': 'csv', 'application/csv': 'csv', 'application/vnd.ms-excel': 'csv',
  'application/json': 'json', 'text/json': 'json', 'text/plain': 'text', 'text/markdown': 'text',
};
const BINARY = new Set(['pdf', 'jpeg', 'png']);

// Strip any path, control characters and anything that is not a plain filename
// character. The result is for display/storage only, never for opening files.
export function sanitizeFileName(name) {
  let n = String(name == null ? '' : name);
  n = n.split(/[\/]/).pop();
  n = n.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '');
  n = n.replace(/[^\w.\- ()\[\]]+/g, '_').replace(/^\.+/, '').replace(/\s+/g, ' ').trim();
  if (n.length > 100) {
    const dot = n.lastIndexOf('.');
    const ext = dot > 0 && n.length - dot <= 8 ? n.slice(dot) : '';
    n = n.slice(0, 100 - ext.length) + ext;
  }
  return n || 'upload';
}

const startsWith = (b, sig) => sig.every((v, i) => b[i] === v);

export function detectKind(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  return null;
}

const latin1 = (bytes, from = 0, to = bytes.length) => {
  let s = '';
  for (let i = from; i < to; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(to, i + 8192)));
  return s;
};

export function countPdfPages(bytes) {
  const s = latin1(bytes);
  const m = s.match(/\/Type\s*\/Page(?![A-Za-z])/g);
  return m ? m.length : 0;
}

function declaredKind(name, type) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  const byExt = EXT_KIND[ext] || null;
  const mime = String(type || '').toLowerCase().split(';')[0].trim();
  const byMime = MIME_KIND[mime] || null;
  return { byExt, byMime, hasExt: String(name || '').includes('.'), mime };
}

// -> { ok, kind, errors:[{code,message}], safeName, pages? }
export function validateUpload({ name, type, size, bytes } = {}) {
  const errors = [];
  const fail = (code, message) => errors.push({ code, message });
  const safeName = sanitizeFileName(name);

  if (!(bytes instanceof Uint8Array)) {
    fail('no-bytes', 'File contents were not readable.');
    return { ok: false, kind: null, errors, safeName };
  }
  if (bytes.length === 0) {
    fail('empty', 'The file is empty.');
    return { ok: false, kind: null, errors, safeName };
  }
  if (typeof size === 'number' && size !== bytes.length) {
    fail('size-mismatch', 'The file size does not match its contents; it may be truncated.');
  }

  const { byExt, byMime, hasExt, mime } = declaredKind(name, type);
  const detected = detectKind(bytes);
  let kind = byExt || byMime;
  if (!kind) {
    fail('unsupported-type', 'Only PDF, JPEG, PNG, CSV, JSON and plain text files are accepted.');
    return { ok: false, kind: null, errors, safeName };
  }
  if (byExt && byMime && byExt !== byMime && !(byExt === 'csv' && byMime === 'text')
      && !(byExt === 'text' && byMime === 'text')) {
    // Allow the common csv-as-text/plain and json-as-text/plain browser quirks only.
    const lenient = (byExt === 'csv' || byExt === 'json') && mime === 'text/plain';
    if (!lenient) fail('type-mismatch', 'The file name and its declared type disagree.');
  }

  if (BINARY.has(kind)) {
    if (detected !== kind) {
      fail('spoofed-type', detected
        ? `The file is declared as ${kind} but its contents are ${detected}.`
        : `The file is declared as ${kind} but its contents are not a ${kind}.`);
    }
  } else {
    if (detected) fail('spoofed-type', `The file is declared as ${kind} but its contents are ${detected}.`);
    else if (bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0)) fail('binary-content', 'The file looks binary, not text.');
  }

  const cap = LIMITS[kind];
  if (bytes.length > cap) fail('too-large', `The file is larger than the ${Math.round(cap / MB)} MB limit for ${kind} files.`);

  let pages;
  if (kind === 'pdf' && detected === 'pdf') {
    const tail = latin1(bytes, Math.max(0, bytes.length - 1100));
    if (!tail.includes('%%EOF')) fail('truncated', 'The PDF looks incomplete (no end-of-file marker).');
    if (bytes.length > cap) { /* page scan skipped for oversize files */ } else {
      pages = countPdfPages(bytes);
      if (pages > LIMITS.maxPdfPages) fail('too-many-pages', `The PDF has more than ${LIMITS.maxPdfPages} pages.`);
      if (pages === 0) fail('no-pages', 'The PDF has no readable pages.');
    }
  }
  if (kind === 'jpeg' && detected === 'jpeg') {
    const n = bytes.length;
    let i = n - 1;
    while (i > 0 && bytes[i] === 0) i -= 1;
    if (!(bytes[i - 1] === 0xff && bytes[i] === 0xd9)) fail('truncated', 'The JPEG looks incomplete.');
  }
  if (kind === 'png' && detected === 'png') {
    const tail = latin1(bytes, Math.max(0, bytes.length - 32));
    if (!tail.includes('IEND') || bytes.length < 45) fail('truncated', 'The PNG looks incomplete.');
  }
  if (!hasExt && !byMime) fail('unsupported-type', 'The file has no recognisable extension.');

  return { ok: errors.length === 0, kind: errors.length === 0 ? kind : null, errors, safeName, pages };
}

export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('crypto.subtle unavailable');
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
