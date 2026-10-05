// Access codes replace email login: `<userTag(6)>-<secret(24)>`, base32.
// Pure logic, shared by scripts/account.mjs (Node) and the client login.
// The code is the account password; it is shown once and stored nowhere.

export const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TAG_LENGTH = 6;
export const SECRET_LENGTH = 24; // 24 * 5 bits = 120 bits of entropy
export const EMAIL_DOMAIN = 'users.recomp.invalid';
export const DEFAULT_MAX_USERS = 5;
export const SECRET_ENTROPY_BITS = SECRET_LENGTH * 5;

const CODE_RE = new RegExp(`^([A-Z2-7]{${TAG_LENGTH}})-([A-Z2-7]{${SECRET_LENGTH}})$`);

const defaultRandomBytes = (n) => {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
};

// 32 symbols divides 256 evenly, so `byte & 31` has no modulo bias.
function randomBase32(length, randomBytes) {
  const bytes = randomBytes(length);
  if (!bytes || bytes.length < length) throw new Error('randomBytes returned too few bytes');
  let out = '';
  for (let i = 0; i < length; i += 1) out += BASE32[bytes[i] & 31];
  return out;
}

export const generateUserTag = ({ randomBytes = defaultRandomBytes } = {}) => randomBase32(TAG_LENGTH, randomBytes);

// Pass `userTag` to keep the same account and rotate only the secret.
export function generateAccessCode({ userTag, randomBytes = defaultRandomBytes } = {}) {
  const tag = userTag ? String(userTag).toUpperCase() : generateUserTag({ randomBytes });
  if (!new RegExp(`^[A-Z2-7]{${TAG_LENGTH}}$`).test(tag)) throw new Error('invalid user tag');
  const secret = randomBase32(SECRET_LENGTH, randomBytes);
  return { userTag: tag, secret, code: `${tag}-${secret}` };
}

// Forgiving about case and whitespace (people copy codes from chat apps);
// strict about everything else. Returns null when it is not a valid code.
export function parseAccessCode(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[\s​]+/g, '').toUpperCase();
  const m = CODE_RE.exec(cleaned);
  if (!m) return null;
  return { userTag: m[1], secret: m[2], code: cleaned };
}

export const userEmailFor = (userTag) => `${String(userTag).toLowerCase()}@${EMAIL_DOMAIN}`;

export const isSyntheticEmail = (email) => typeof email === 'string' && email.toLowerCase().endsWith(`@${EMAIL_DOMAIN}`);

export const userTagFromEmail = (email) => (isSyntheticEmail(email) ? email.split('@')[0].toUpperCase() : null);

export function maxUsersFrom(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_USERS;
}

// Throws when creating one more active user would exceed the cap.
export function enforceUserLimit({ activeUsers, max = DEFAULT_MAX_USERS }) {
  const limit = maxUsersFrom(max);
  if (activeUsers >= limit) {
    const err = new Error(`user limit reached (${activeUsers}/${limit}); delete a user or raise MAX_USERS`);
    err.code = 'USER_LIMIT';
    throw err;
  }
  return { ok: true, remaining: limit - activeUsers - 1 };
}
