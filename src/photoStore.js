// Progress photos, kept only on this device in IndexedDB. Never part of app
// state, the cloud blob or a JSON export: they are large and private.
// Each photo: { id, date: 'YYYY-MM-DD', pose: 'front' | 'side' | 'back',
//               bytes: ArrayBuffer, type: 'image/jpeg', w, h, addedAt }

export const POSES = [
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
];

const DB_NAME = 'recomp-photos';
const STORE = 'photos';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Photo storage is not available in this browser.')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('date', 'date');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open photo storage.'));
  });
}

function run(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    const req = fn(store);
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Photo storage error.'));
    tx.onabort = () => reject(tx.error || new Error('Photo storage was full or blocked.'));
  }));
}

export const listPhotos = () => run('readonly', (store) => store.getAll()).then((rows) => sortPhotos(rows || []));
export const savePhoto = (photo) => run('readwrite', (store) => store.put(photo)).then(() => photo);
export const deletePhoto = (id) => run('readwrite', (store) => store.delete(id));

export function sortPhotos(photos) {
  return [...photos].sort((a, b) => b.date.localeCompare(a.date) || (b.addedAt || 0) - (a.addedAt || 0));
}

// Timeline: newest date first, one row per date with a photo per pose.
export function groupByDate(photos) {
  const map = new Map();
  sortPhotos(photos).forEach((p) => {
    if (!map.has(p.date)) map.set(p.date, {});
    const day = map.get(p.date);
    if (!day[p.pose]) day[p.pose] = p; // newest of that pose that day
  });
  return [...map.entries()].map(([date, poses]) => ({ date, poses }));
}

// Default comparison for a pose: the oldest photo against the newest.
export function defaultPair(photos, pose) {
  const dates = [...new Set(photos.filter((p) => p.pose === pose).map((p) => p.date))].sort();
  if (dates.length < 2) return null;
  return { before: dates[0], after: dates[dates.length - 1] };
}

export function photoFor(photos, pose, date) {
  return sortPhotos(photos).find((p) => p.pose === pose && p.date === date) || null;
}

// Shrink a picked image to at most `max` px on its long side as JPEG, so a
// year of photos stays well inside the browser's storage allowance.
export async function prepareImage(file, max = 1280, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That file could not be read as an image.'));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('That image could not be converted.');
    return { bytes: await blob.arrayBuffer(), type: 'image/jpeg', w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
