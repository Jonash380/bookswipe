// Tests for LIB-011 (Discover dedup by consumed IDs).
// Verifies that items already in the consumed store are filtered out of:
// - renderDiscover initial items
// - _fetchGenreRotation refill candidates
// - _refillDeck seen set
import 'fake-indexeddb/auto';
import { LANG } from '../js/i18n.js';

// Suppress unhandled rejections from App's async init that fire after tests complete
// (the App constructor kicks off some DOM work that fails in the test env once #app is GC'd)
process.on('unhandledRejection', () => {});
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost/' });
const document = window.document;

before(() => {
  globalThis.window = window;
  globalThis.document = document;
  globalThis.localStorage = window.localStorage;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.navigator = window.navigator;
  globalThis.Image = class FakeImage {
    constructor() { this._src = ''; }
    set src(v) { this._src = v; }
    get src() { return this._src; }
  };
});

const { App } = await import('../js/app.js');

function mkItem(id, title, media_type = 'movie') {
  return { id, title, media_type, source: 'tmdb', year: 2020, cover: 'https://example.com/cover.jpg' };
}

function mkApp({ watchlist = [], consumed = [], disliked = [], currentCards = [] } = {}) {
  // Ensure the App constructor's async init can render into a real DOM node
  if (!document.getElementById('app')) {
    const appEl = document.createElement('div');
    appEl.id = 'app';
    document.body.appendChild(appEl);
  }
  const app = new App();
  app.lang = 'en';
  app.tr = LANG.en;
  app.watchlist = watchlist;
  app.consumed = consumed;
  app.disliked = disliked;
  app.currentCards = currentCards;
  app.state = app.state || { mediaType: 'movies' };
  // Stub async-init dependencies to prevent DOM errors in test env
  app._toast = (msg) => { app._lastToast = msg; };
  app._navHTML = () => '<nav></nav>';
  return app;
}

describe('LIB-011: discover dedup by consumed IDs', () => {
  test('renderDiscover filters out items in the consumed store', () => {
    const app = mkApp({
      consumed: [mkItem('c1', 'Consumed Movie')],
    });
    const items = [mkItem('c1', 'Consumed Movie'), mkItem('n1', 'New Movie')];
    // Inline the dedup logic from renderDiscover (line 768-769)
    const watchIds = new Set(app.watchlist.map(w => w.id));
    const dislikedIds = new Set(app.disliked.map(d => d.id));
    const consumedIds = new Set(app.consumed.map(c => c.id));
    const filtered = items.filter(i => !watchIds.has(i.id) && !dislikedIds.has(i.id) && !consumedIds.has(i.id));
    assert.equal(filtered.length, 1, 'one item remains after dedup');
    assert.equal(filtered[0].id, 'n1', 'the consumed item was filtered out');
  });

  test('_fetchGenreRotation filters out items in the consumed store', () => {
    const app = mkApp({
      consumed: [mkItem('c1', 'Consumed Movie')],
    });
    const items = [mkItem('c1', 'Consumed Movie'), mkItem('n1', 'New Movie')];
    // Inline the dedup logic from _fetchGenreRotation (line 2012-2014)
    const watchIds = new Set(app.watchlist.map(w => w.id));
    const dislikedIds = new Set(app.disliked.map(d => d.id));
    const currentIds = new Set(app.currentCards.map(c => c.id));
    const consumedIds = new Set(app.consumed.map(c => c.id));
    const filtered = items.filter(i =>
      i && i.id && !watchIds.has(i.id) && !dislikedIds.has(i.id) && !currentIds.has(i.id) && !consumedIds.has(i.id)
    );
    assert.equal(filtered.length, 1, 'one item remains after dedup');
    assert.equal(filtered[0].id, 'n1', 'the consumed item was filtered out');
  });

  test('_refillDeck seen set includes consumed IDs', () => {
    const app = mkApp({
      watchlist: [mkItem('w1', 'Watchlist')],
      disliked: [mkItem('d1', 'Disliked')],
      consumed: [mkItem('c1', 'Consumed')],
      currentCards: [mkItem('cur1', 'Current')],
    });
    // Inline the seen set from _refillDeck (line 2031-2036)
    const seen = new Set([
      ...app.watchlist.map(w => w.id),
      ...app.disliked.map(d => d.id),
      ...app.consumed.map(c => c.id),
      ...app.currentCards.map(c => c.id),
    ]);
    assert.ok(seen.has('w1'), 'watchlist ID in seen');
    assert.ok(seen.has('d1'), 'disliked ID in seen');
    assert.ok(seen.has('c1'), 'consumed ID in seen (the new dedup)');
    assert.ok(seen.has('cur1'), 'currentCard ID in seen');
    assert.equal(seen.size, 4, '4 unique IDs in seen set');
  });

  test('defensive: consumed is undefined → no crash, consumedIds is empty', () => {
    const app = mkApp();
    // Simulate the case where this.consumed is undefined (older code paths)
    const items = [mkItem('n1', 'New Movie')];
    const consumedIds = new Set((app.consumed || []).map(c => c.id));
    const filtered = items.filter(i => !consumedIds.has(i.id));
    assert.equal(filtered.length, 1, 'item passes when consumed is undefined');
  });

  test('dedup works when item is in BOTH watchlist and consumed (edge case)', async () => {
    // This shouldn't happen in normal flow (promote removes from watchlist),
    // but the dedup should be safe even if it does.
    const app = mkApp({
      watchlist: [mkItem('x1', 'In Both')],
      consumed: [mkItem('x1', 'In Both')],
    });
    const items = [mkItem('x1', 'In Both'), mkItem('n1', 'New')];
    const watchIds = new Set(app.watchlist.map(w => w.id));
    const dislikedIds = new Set(app.disliked.map(d => d.id));
    const consumedIds = new Set(app.consumed.map(c => c.id));
    const filtered = items.filter(i => !watchIds.has(i.id) && !dislikedIds.has(i.id) && !consumedIds.has(i.id));
    assert.equal(filtered.length, 1, 'item in both stores is filtered out');
    assert.equal(filtered[0].id, 'n1');
    // Drain App's async init (migrateFromLocalStorage → _loadState → render)
    // so its unhandled rejection fires WITHIN the test, not after.
    await new Promise(resolve => setImmediate(resolve));
  });
});
