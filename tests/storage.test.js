import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { Window } from 'happy-dom';

const window = new Window({
  url: 'http://localhost',
});
global.window = window;
global.document = window.document;
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
// Also set on window so code sees the same mock
Object.defineProperty(global.window, 'localStorage', {
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

  it('should also clear the consumed store', async () => {
    await storage.addToConsumed({ id: 'x', title: 'X' }, 4);
    await storage.clearAllData();
    assert.deepEqual(await storage.getConsumed(), []);
  });
});

describe('Consumed CRUD (Library page)', () => {
  beforeEach(async () => { await resetDB(); });

  it('should return empty array initially', async () => {
    assert.deepEqual(await storage.getConsumed(), []);
  });

  it('should add a consumed item with rating, consumedAt, and promotedFromWatchlist fields', async () => {
    await storage.addToConsumed({ id: 'tmdb-1', title: 'Dune' }, 5);
    const all = await storage.getConsumed();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'tmdb-1');
    assert.equal(all[0].consumedRating, 5);
    assert.equal(typeof all[0].consumedAt, 'number');
    assert.ok(all[0].consumedAt > 0, 'consumedAt should be a positive timestamp');
    assert.equal(all[0].promotedFromWatchlist, false);
  });

  it('should accept ratings 1-5 and reject anything else', async () => {
    await storage.addToConsumed({ id: 'a' }, 1);
    await storage.addToConsumed({ id: 'b' }, 2);
    await storage.addToConsumed({ id: 'c' }, 3);
    await storage.addToConsumed({ id: 'd' }, 4);
    await storage.addToConsumed({ id: 'e' }, 5);
    const all = await storage.getConsumed();
    assert.equal(all.length, 5);
    // Invalid ratings should be no-ops (not throw, not save)
    await storage.addToConsumed({ id: 'bad-zero' }, 0);
    await storage.addToConsumed({ id: 'bad-six' }, 6);
    await storage.addToConsumed({ id: 'bad-neg' }, -1);
    await storage.addToConsumed({ id: 'bad-float' }, 3.5);
    const after = await storage.getConsumed();
    assert.equal(after.length, 5, 'invalid ratings should not be saved');
    assert.equal(after.find(i => i.id === 'bad-zero'), undefined);
  });

  it('should overwrite duplicate IDs (upsert by id) when re-added', async () => {
    await storage.addToConsumed({ id: 'tmdb-1', title: 'Old' }, 3);
    await storage.addToConsumed({ id: 'tmdb-1', title: 'New' }, 4);
    const all = await storage.getConsumed();
    assert.equal(all.length, 1);
    assert.equal(all[0].title, 'New');
    assert.equal(all[0].consumedRating, 4);
  });

  it('should set promotedFromWatchlist=true when opts.promotedFromWatchlist is true', async () => {
    await storage.addToConsumed({ id: 'tmdb-1', title: 'X' }, 5, { promotedFromWatchlist: true });
    const all = await storage.getConsumed();
    assert.equal(all[0].promotedFromWatchlist, true);
  });

  it('should remove a consumed item by id', async () => {
    await storage.addToConsumed({ id: 'a' }, 3);
    await storage.addToConsumed({ id: 'b' }, 4);
    await storage.removeFromConsumed('a');
    const all = await storage.getConsumed();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'b');
  });

  it('should be a no-op when removing a non-existent id', async () => {
    await storage.addToConsumed({ id: 'a' }, 3);
    await storage.removeFromConsumed('zzz');
    const all = await storage.getConsumed();
    assert.equal(all.length, 1);
  });
});

describe('updateConsumedRating', () => {
  beforeEach(async () => { await resetDB(); });

  it('should update the rating of an existing consumed item and preserve other fields', async () => {
    await storage.addToConsumed({ id: 'tmdb-1', title: 'Dune', year: 2021 }, 3);
    const before = await storage.getConsumed();
    const originalConsumedAt = before[0].consumedAt;
    // Wait a tick so consumedAt wouldn't accidentally be re-stamped
    await new Promise(r => setTimeout(r, 5));
    const updated = await storage.updateConsumedRating('tmdb-1', 5);
    assert.ok(updated);
    assert.equal(updated.consumedRating, 5);
    assert.equal(updated.title, 'Dune');
    assert.equal(updated.year, 2021);
    assert.equal(updated.consumedAt, originalConsumedAt, 'consumedAt should be preserved');
  });

  it('should return null when updating a non-existent id', async () => {
    const result = await storage.updateConsumedRating('nope', 4);
    assert.equal(result, null);
  });

  it('should reject invalid ratings (0, 6, non-integer, NaN)', async () => {
    await storage.addToConsumed({ id: 'tmdb-1', title: 'X' }, 3);
    assert.equal(await storage.updateConsumedRating('tmdb-1', 0), null);
    assert.equal(await storage.updateConsumedRating('tmdb-1', 6), null);
    assert.equal(await storage.updateConsumedRating('tmdb-1', 2.5), null);
    assert.equal(await storage.updateConsumedRating('tmdb-1', NaN), null);
    // Original rating preserved
    const all = await storage.getConsumed();
    assert.equal(all[0].consumedRating, 3);
  });
});

describe('getAllConsumedIds (discovery dedup)', () => {
  beforeEach(async () => { await resetDB(); });

  it('should return an empty Set when no items consumed', async () => {
    const ids = await storage.getAllConsumedIds();
    assert.ok(ids instanceof Set);
    assert.equal(ids.size, 0);
  });

  it('should return a Set of all consumed item IDs', async () => {
    await storage.addToConsumed({ id: 'a' }, 4);
    await storage.addToConsumed({ id: 'b' }, 5);
    await storage.addToConsumed({ id: 'c' }, 3);
    const ids = await storage.getAllConsumedIds();
    assert.equal(ids.size, 3);
    assert.ok(ids.has('a'));
    assert.ok(ids.has('b'));
    assert.ok(ids.has('c'));
  });

  it('should NOT include watchlist or disliked IDs', async () => {
    await storage.addToWatchlist({ id: 'wl-1', title: 'Want' });
    await storage.addToDisliked({ id: 'dis-1', title: 'Disliked' });
    await storage.addToConsumed({ id: 'co-1', title: 'Consumed' }, 4);
    const ids = await storage.getAllConsumedIds();
    assert.deepEqual([...ids], ['co-1']);
  });
});

describe('promoteToConsumed (atomic watchlist → consumed)', () => {
  beforeEach(async () => { await resetDB(); });

  it('should atomically move an item from watchlist to consumed', async () => {
    await storage.addToWatchlist({ id: 'a', title: 'Severance' });
    const result = await storage.promoteToConsumed('a', 5);
    assert.equal(result.moved, true);
    assert.equal(result.record.id, 'a');
    assert.equal(result.record.title, 'Severance');
    assert.equal(result.record.consumedRating, 5);
    assert.equal(result.record.promotedFromWatchlist, true);
    // Watchlist no longer has it
    const wl = await storage.getWatchlist();
    assert.equal(wl.length, 0);
    // Consumed has it
    const co = await storage.getConsumed();
    assert.equal(co.length, 1);
    assert.equal(co[0].id, 'a');
  });

  it('should reject invalid ratings', async () => {
    await storage.addToWatchlist({ id: 'a' });
    const result = await storage.promoteToConsumed('a', 0);
    assert.equal(result.moved, false);
    assert.equal(result.record, null);
    // Watchlist still has it
    const wl = await storage.getWatchlist();
    assert.equal(wl.length, 1);
  });

  it('should return moved=false when the watchlist item does not exist', async () => {
    const result = await storage.promoteToConsumed('not-in-watchlist', 4);
    assert.equal(result.moved, false);
    assert.equal(result.record, null);
    // No item should have ended up in consumed
    const co = await storage.getConsumed();
    assert.equal(co.length, 0);
  });

  it('should preserve all watchlist fields when moving to consumed', async () => {
    await storage.addToWatchlist({
      id: 'a', title: 'Dune', year: 2021, genres: [878, 12],
      mediaDNA: { tropes: ['chosen_one'], pacing: [], aesthetic: [], warnings: [] },
    });
    const result = await storage.promoteToConsumed('a', 4);
    assert.equal(result.moved, true);
    assert.equal(result.record.year, 2021);
    assert.deepEqual(result.record.genres, [878, 12]);
    assert.equal(result.record.mediaDNA.tropes[0], 'chosen_one');
  });
});
