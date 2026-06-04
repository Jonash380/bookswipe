/**
 * BookSwipe Persistent Storage Layer
 * Migrates from localStorage to IndexedDB for all data-heavy operations.
 * Keeps only UI preferences (language, etc.) in localStorage.
 */
const DB_NAME = 'bookswipe-v3';
const DB_VERSION = 1;

let _dbPromise = null;

function getDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('watchlist')) db.createObjectStore('watchlist', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('disliked')) db.createObjectStore('disliked', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: '_hid' });
      if (!db.objectStoreNames.contains('recProfile')) db.createObjectStore('recProfile');
      if (!db.objectStoreNames.contains('tags')) db.createObjectStore('tags');
      if (!db.objectStoreNames.contains('enriched')) db.createObjectStore('enriched');
      if (!db.objectStoreNames.contains('crossMedia')) db.createObjectStore('crossMedia', { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => { console.warn('IndexedDB open error', e); reject(e); };
  });
  return _dbPromise;
}

/** Migrate legacy localStorage data to IndexedDB (one-time) */
export async function migrateFromLocalStorage() {
  const migrated = localStorage.getItem('bs-migrated-v3');
  if (migrated) return;

  try {
    const { safeGetJSON } = await import('./utils.js');
    const watchlist = safeGetJSON('bs-watchlist', []);
    const disliked = safeGetJSON('bs-disliked', []);
    const history = safeGetJSON('bs-history', []);
    const profile = safeGetJSON('bs-rec-profile', null);

    if (watchlist.length) {
      const db = await getDB();
      const tx = db.transaction('watchlist', 'readwrite');
      const store = tx.objectStore('watchlist');
      watchlist.forEach(item => store.put(item));
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    }
    if (disliked.length) {
      const db = await getDB();
      const tx = db.transaction('disliked', 'readwrite');
      const store = tx.objectStore('disliked');
      disliked.forEach(item => store.put(item));
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    }
    if (history.length) {
      const db = await getDB();
      const tx = db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      history.forEach((item, i) => store.put({ ...item, _hid: `h-${item.date}-${i}` }));
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    }
    if (profile) {
      const db = await getDB();
      const tx = db.transaction('recProfile', 'readwrite');
      tx.objectStore('recProfile').put(profile, 'main');
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    }

    localStorage.setItem('bs-migrated-v3', '1');
    console.log('[Storage] Migrated legacy data to IndexedDB');
  } catch (e) {
    console.warn('[Storage] Migration failed (non-critical):', e);
  }
}

/** Generic CRUD helpers */
async function getAll(storeName) {
  try {
    const db = await getDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

async function putItem(storeName, item) {
  try {
    const db = await getDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
  } catch (e) { console.warn(`[Storage] putItem(${storeName}) failed:`, e); }
}

async function deleteItem(storeName, key) {
  try {
    const db = await getDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
  } catch (e) { console.warn(`[Storage] deleteItem(${storeName}) failed:`, e); }
}

async function clearStore(storeName) {
  try {
    const db = await getDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
  } catch (e) { console.warn(`[Storage] clearStore(${storeName}) failed:`, e); }
}

/** Watchlist */
export async function getWatchlist() { return getAll('watchlist'); }
export async function addToWatchlist(item) { return putItem('watchlist', item); }
export async function removeFromWatchlist(id) { return deleteItem('watchlist', id); }

/** Disliked */
export async function getDisliked() { return getAll('disliked'); }
export async function addToDisliked(item) { return putItem('disliked', item); }
export async function removeFromDisliked(id) { return deleteItem('disliked', id); }

/** History - with optional limit */
export async function getHistory(limit = 500) {
  const all = await getAll('history');
  return all
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit)
    .map(({ _hid, ...item }) => item);
}

export async function addToHistory(item) {
  const record = { ...item, _hid: `h-${item.date}-${Math.random().toString(36).slice(2, 8)}` };
  return putItem('history', record);
}

export async function removeLastHistory() {
  try {
    const all = await getAll('history');
    if (!all.length) return null;
    const last = all.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    await deleteItem('history', last._hid);
    const { _hid, ...item } = last;
    return item;
  } catch { return null; }
}

/** Recommender Profile */
export async function getRecProfile() {
  try {
    const db = await getDB();
    return await new Promise((resolve) => {
      const tx = db.transaction('recProfile', 'readonly');
      const req = tx.objectStore('recProfile').get('main');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function saveRecProfile(profile) {
  try {
    const db = await getDB();
    const tx = db.transaction('recProfile', 'readwrite');
    tx.objectStore('recProfile').put(profile, 'main');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { console.warn('[Storage] saveRecProfile failed:', e); }
}

/** Legacy localStorage helpers for small UI state only */
export function getUIState() {
  try {
    const v = localStorage.getItem('bs-lang');
    const lang = v || 'de';
    const state = localStorage.getItem('bs-state');
    return { lang, state: state ? JSON.parse(state) : null };
  } catch { return { lang: 'de', state: null }; }
}

export function setUIState(lang, state) {
  try {
    localStorage.setItem('bs-lang', lang);
    localStorage.setItem('bs-state', JSON.stringify(state));
  } catch (e) {
    console.warn('[Storage] Failed to save UI state:', e);
  }
}

/** Export everything as watchlist (used for CSV export, DNA sharing) */
export async function getFullWatchlist() {
  return getWatchlist();
}

/** Clear all data (for logout/reset) */
export async function clearAllData() {
  await clearStore('watchlist');
  await clearStore('disliked');
  await clearStore('history');
  await clearStore('recProfile');
  await clearStore('crossMedia');
  localStorage.removeItem('bs-migrated-v3');
  console.log('[Storage] All data cleared');
}
