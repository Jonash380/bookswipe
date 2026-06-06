import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);

Object.defineProperty(global, 'navigator', {
  value: { vibrate: () => {} },
  writable: true,
  configurable: true,
});

const storageMock = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});
// Also set on dom.window so JSDOM-based code sees the same mock
Object.defineProperty(dom.window, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});

const storage = await import('../js/storage.js');

// Clear all stores between tests (don't delete DB — _dbPromise keeps a connection open)
async function resetDB() {
  await storage.clearAllData();
}

describe('Watchlist CRUD', () => {
  beforeEach(async () => { await resetDB(); });

  it('should return empty array initially', async () => {
    const list = await storage.getWatchlist();
    assert.deepEqual(list, []);
  });

  it('should add an item to watchlist', async () => {
    await storage.addToWatchlist({ id: 'tmdb-1', title: 'Fight Club', type: 'movie' });
    const list = await storage.getWatchlist();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'tmdb-1');
    assert.equal(list[0].title, 'Fight Club');
  });

  it('should add multiple items', async () => {
    await storage.addToWatchlist({ id: 'tmdb-1', title: 'A' });
    await storage.addToWatchlist({ id: 'tmdb-2', title: 'B' });
    const list = await storage.getWatchlist();
    assert.equal(list.length, 2);
  });

  it('should overwrite duplicate IDs (upsert)', async () => {
    await storage.addToWatchlist({ id: 'tmdb-1', title: 'Old' });
    await storage.addToWatchlist({ id: 'tmdb-1', title: 'New' });
    const list = await storage.getWatchlist();
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'New');
  });

  it('should remove an item by ID', async () => {
    await storage.addToWatchlist({ id: 'tmdb-1', title: 'A' });
    await storage.addToWatchlist({ id: 'tmdb-2', title: 'B' });
    await storage.removeFromWatchlist('tmdb-1');
    const list = await storage.getWatchlist();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'tmdb-2');
  });

  it('should handle removing non-existent item gracefully', async () => {
    await storage.removeFromWatchlist('nonexistent');
    const list = await storage.getWatchlist();
    assert.deepEqual(list, []);
  });
});

describe('Disliked CRUD', () => {
  beforeEach(async () => { await resetDB(); });

  it('should return empty array initially', async () => {
    const list = await storage.getDisliked();
    assert.deepEqual(list, []);
  });

  it('should add and retrieve disliked items', async () => {
    await storage.addToDisliked({ id: 'tmdb-99', title: 'Bad Movie' });
    const list = await storage.getDisliked();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'tmdb-99');
  });

  it('should remove disliked item', async () => {
    await storage.addToDisliked({ id: 'tmdb-99', title: 'Bad' });
    await storage.removeFromDisliked('tmdb-99');
    const list = await storage.getDisliked();
    assert.equal(list.length, 0);
  });
});

describe('History CRUD', () => {
  beforeEach(async () => { await resetDB(); });

  it('should return empty array initially', async () => {
    const h = await storage.getHistory();
    assert.deepEqual(h, []);
  });

  it('should add history entries', async () => {
    await storage.addToHistory({ date: '2024-01-01', action: 'like', title: 'Movie A' });
    const h = await storage.getHistory();
    assert.equal(h.length, 1);
    assert.equal(h[0].action, 'like');
    // Should NOT expose internal _hid field
    assert.equal(h[0]._hid, undefined);
  });

  it('should sort history by date descending', async () => {
    await storage.addToHistory({ date: '2024-01-01', action: 'like', title: 'A' });
    await storage.addToHistory({ date: '2024-06-01', action: 'nope', title: 'B' });
    await storage.addToHistory({ date: '2024-03-01', action: 'like', title: 'C' });
    const h = await storage.getHistory();
    assert.equal(h.length, 3);
    assert.equal(h[0].date, '2024-06-01');
    assert.equal(h[1].date, '2024-03-01');
    assert.equal(h[2].date, '2024-01-01');
  });

  it('should respect limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await storage.addToHistory({ date: `2024-0${(i % 9) + 1}-01`, action: 'like', title: `M${i}` });
    }
    const h = await storage.getHistory(3);
    assert.equal(h.length, 3);
  });

  it('should remove last history entry', async () => {
    await storage.addToHistory({ date: '2024-01-01', action: 'like', title: 'A' });
    await storage.addToHistory({ date: '2024-06-01', action: 'nope', title: 'B' });
    const removed = await storage.removeLastHistory();
    assert.ok(removed);
    assert.equal(removed.title, 'B');
    const h = await storage.getHistory();
    assert.equal(h.length, 1);
    assert.equal(h[0].title, 'A');
  });

  it('should return null when removing from empty history', async () => {
    const removed = await storage.removeLastHistory();
    assert.equal(removed, null);
  });
});

describe('RecProfile', () => {
  beforeEach(async () => { await resetDB(); });

  it('should return null initially', async () => {
    const p = await storage.getRecProfile();
    assert.equal(p, null);
  });

  it('should save and retrieve profile', async () => {
    const profile = { genres: { Action: 5, Comedy: 3 }, totalSwipes: 10 };
    await storage.saveRecProfile(profile);
    const p = await storage.getRecProfile();
    assert.deepEqual(p, profile);
  });

  it('should overwrite previous profile', async () => {
    await storage.saveRecProfile({ v: 1 });
    await storage.saveRecProfile({ v: 2 });
    const p = await storage.getRecProfile();
    assert.equal(p.v, 2);
  });
});

describe('UI State (localStorage)', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem('bs-migrated-v3', '1'); });

  it('should return defaults when empty', () => {
    const { lang, state } = storage.getUIState();
    assert.equal(lang, 'de');
    assert.equal(state, null);
  });

  it('should save and retrieve language', () => {
    storage.setUIState('en', { onboardingStep: 0 });
    const { lang, state } = storage.getUIState();
    assert.equal(lang, 'en');
    assert.equal(state.onboardingStep, 0);
  });

  it('should handle corrupt state gracefully', () => {
    localStorage.setItem('bs-lang', 'en');
    localStorage.setItem('bs-state', '{invalid json');
    // Should not throw and should still return a valid language
    const { lang, state } = storage.getUIState();
    assert.ok(['de', 'en'].includes(lang), `Unexpected lang: ${lang}`);
    // state should be null because JSON.parse fails
    assert.equal(state, null);
  });
});

describe('Tags cache', () => {
  beforeEach(async () => { await resetDB(); });

  it('should return empty array for unknown ID', async () => {
    const tags = await storage.getTraktTags('999');
    assert.deepEqual(tags, []);
  });

  it('should store and retrieve tags', async () => {
    await storage.setTraktTags('123', ['dark', 'intense']);
    const tags = await storage.getTraktTags('123');
    assert.deepEqual(tags, ['dark', 'intense']);
  });
});

describe('Enriched item cache', () => {
  beforeEach(async () => { await resetDB(); });

  it('should return null for unknown ID', async () => {
    const item = await storage.getEnrichedItem('999');
    assert.equal(item, null);
  });

  it('should store and retrieve enriched data', async () => {
    await storage.setEnrichedItem('tmdb-42', { overview: 'Great movie', runtime: 120 });
    const item = await storage.getEnrichedItem('tmdb-42');
    assert.equal(item.overview, 'Great movie');
    assert.equal(item.runtime, 120);
  });
});

describe('getFullWatchlist', () => {
  beforeEach(async () => { await resetDB(); });

  it('should return same data as getWatchlist', async () => {
    await storage.addToWatchlist({ id: 'tmdb-1', title: 'A' });
    await storage.addToWatchlist({ id: 'tmdb-2', title: 'B' });
    const full = await storage.getFullWatchlist();
    const regular = await storage.getWatchlist();
    assert.deepEqual(full, regular);
    assert.equal(full.length, 2);
  });

  it('should return empty array when no items', async () => {
    const full = await storage.getFullWatchlist();
    assert.deepEqual(full, []);
  });
});

describe('clearAllData', () => {
  it('should clear all stores', async () => {
    await storage.addToWatchlist({ id: '1', title: 'A' });
    await storage.addToDisliked({ id: '2', title: 'B' });
    await storage.addToHistory({ date: '2024-01-01', action: 'like', title: 'C' });
    await storage.saveRecProfile({ test: true });
    await storage.clearAllData();
    assert.deepEqual(await storage.getWatchlist(), []);
    assert.deepEqual(await storage.getDisliked(), []);
    assert.deepEqual(await storage.getHistory(), []);
    assert.equal(await storage.getRecProfile(), null);
  });
});
