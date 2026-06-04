const DB_NAME = 'bookswipe-cache';
const DB_VERSION = 2;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('tags')) db.createObjectStore('tags');
      if (!db.objectStoreNames.contains('enriched')) db.createObjectStore('enriched');
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => { console.warn('IndexedDB open error', e); reject(e); };
  });
}
export async function getTraktTags(tmdbId) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('tags', 'readonly');
      const r = tx.objectStore('tags').get(String(tmdbId));
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => resolve([]);
    });
  } catch { return []; }
}
export async function setTraktTags(tmdbId, tags) {
  try {
    const db = await openDB();
    const tx = db.transaction('tags', 'readwrite');
    tx.objectStore('tags').put(tags, String(tmdbId));
  } catch (e) { console.warn('setTraktTags error', e); }
}
export async function getEnrichedItem(id) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction('enriched', 'readonly');
      const r = tx.objectStore('enriched').get(String(id));
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch { return null; }
}
export async function setEnrichedItem(id, data) {
  try {
    const db = await openDB();
    const tx = db.transaction('enriched', 'readwrite');
    tx.objectStore('enriched').put(data, String(id));
  } catch (e) { console.warn('setEnrichedItem error', e); }
}
