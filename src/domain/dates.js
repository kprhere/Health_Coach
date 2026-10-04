// ============================================================
// domain/dates.js - day keys ('YYYY-MM-DD') and calendar arithmetic.
// Pure and dependency-free. A day is addressed by its key, built from the
// device's local clock; nothing else in the app does calendar maths itself.
// ============================================================
export const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => toKey(new Date());
export const parseKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
export const dowOf = (key) => parseKey(key).getDay();
export const addDays = (key, n) => { const d = parseKey(key); d.setDate(d.getDate() + n); return toKey(d); };
export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
export const prettyDate = (key) => parseKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
export const shortDate = (key) => parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
