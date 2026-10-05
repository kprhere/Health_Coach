// Upload validation shared by the client (fast feedback) and the
// validate-upload Edge Function (the check that actually counts).

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const USER_QUOTA_BYTES = 150 * 1024 * 1024;
export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
export const KINDS = ['scan', 'plan'];
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

const startsWith = (bytes, sig) => bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);

// Identify the real type from the first bytes; the declared type is never trusted.
export function sniffMime(bytes) {
  if (!bytes || !bytes.length) return null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  return null;
}

export const extensionFor = (mime) => EXT[mime] || null;

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Objects must live under the caller's own folder: <userId>/<kind>/<id>.<ext>
export function buildUploadPath(userId, kind, id, mime) {
  if (!KINDS.includes(kind)) throw new Error('unknown upload kind');
  if (!SAFE_ID.test(id)) throw new Error('unsafe upload id');
  const ext = extensionFor(mime);
  if (!ext) throw new Error('unsupported mime');
  return `${userId}/${kind}/${id}.${ext}`;
}

export function pathBelongsTo(userId, path) {
  if (typeof path !== 'string' || !userId) return false;
  const parts = path.split('/');
  return parts.length >= 2 && parts[0] === userId && parts.every((p) => p && p !== '.' && p !== '..');
}

// -> { ok, mime, reasons[] }
export function validateUpload({
  bytes, size = bytes?.length ?? 0, declaredMime, kind, usedBytes = 0, quotaBytes = USER_QUOTA_BYTES,
}) {
  const reasons = [];
  if (!KINDS.includes(kind)) reasons.push('unknown-kind');
  if (!size) reasons.push('empty');
  if (size > MAX_UPLOAD_BYTES) reasons.push('too-large');
  if (usedBytes + size > quotaBytes) reasons.push('quota-exceeded');
  const mime = sniffMime(bytes);
  if (!mime) reasons.push('unsupported-type');
  else if (declaredMime && declaredMime !== mime) reasons.push('mime-mismatch');
  return { ok: reasons.length === 0, mime, reasons };
}

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
