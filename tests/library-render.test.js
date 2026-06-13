// Tests for LIB-003 (Library page render). Smoke tests using happy-dom + fake-indexeddb.
import 'fake-indexeddb/auto';
import { LANG } from '../js/i18n.js';
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
  // Polyfill Image (happy-dom doesn't include the constructor by default)
  globalThis.Image = class FakeImage {
    constructor() { this._src = ''; }
    set src(v) { this._src = v; }
    get src() { return this._src; }
  };
});

// Dynamic import so the App module picks up the globals we just set
const { App } = await import('../js/app.js');

function mkItem(id, title, media_type, source = 'tmdb') {
  return { id, title, media_type, source, year: 2020, cover: 'https://example.com/cover.jpg' };
}

function mkApp({ watchlist = [], consumed = [] } = {}) {
  const app = new App();
  app.lang = 'en';
  app.tr = LANG.en;
  app.watchlist = watchlist;
  app.consumed = consumed;
  app.state = app.state || { mediaType: 'movies' };
  // Stub async-init dependencies
  app._toast = (msg) => { app._lastToast = msg; };
  app._navHTML = () => '<nav></nav>';
  return app;
}

function mkTarget() {
  const t = document.createElement('div');
  t.id = 'app';
  document.body.appendChild(t);
  return t;
}

describe('LIB-003: renderLibrary smoke tests', () => {
  test('renderLibrary is a method on App', () => {
    const app = new App();
    assert.equal(typeof app.renderLibrary, 'function');
  });

  test('renderLibrary renders the basic structure (header, tabs, chips, CTA)', () => {
    const app = mkApp();
    const target = mkTarget();
    app.renderLibrary(target);
    const html = target.innerHTML;
    assert.ok(html.includes('library-page'), 'has library-page wrapper');
    assert.ok(html.includes('library-header'), 'has library-header');
    assert.ok(html.includes('status-tabs'), 'has status tabs');
    assert.ok(html.includes('media-type-chips'), 'has media-type chips');
    assert.ok(html.includes('library-bottom-cta'), 'has bottom CTA');
  });

  test('status tab counts reflect watchlist and consumed sizes', () => {
    const app = mkApp({
      watchlist: [mkItem('a', 'A', 'movie'), mkItem('b', 'B', 'tv')],
      consumed:  [mkItem('c', 'C', 'movie')],
    });
    const target = mkTarget();
    app.renderLibrary(target);
    const html = target.innerHTML;
    const want = html.match(/data-tab="want"[\s\S]*?<span class="status-tab-count">(\d+)<\/span>/);
    const consumed = html.match(/data-tab="consumed"[\s\S]*?<span class="status-tab-count">(\d+)<\/span>/);
    assert.equal(want[1], '2', 'want tab count = 2');
    assert.equal(consumed[1], '1', 'consumed tab count = 1');
  });

  test('LIB-003: media-type chip counts reflect the active tab set (Want tab default)', () => {
    const app = mkApp({
      watchlist: [mkItem('a', 'A', 'movie', 'tmdb'), mkItem('b', 'B', 'tv', 'tmdb')],
      consumed:  [mkItem('c', 'C', 'game', 'igdb'), mkItem('d', 'D', 'movie', 'tmdb')],
    });
    const target = mkTarget();
    app.renderLibrary(target);
    const html = target.innerHTML;
    const movies = html.match(/data-mt="movies"[\s\S]*?<span class="mt-chip-count">(\d+)<\/span>/);
    const tv     = html.match(/data-mt="tv"[\s\S]*?<span class="mt-chip-count">(\d+)<\/span>/);
    const games  = html.match(/data-mt="games"[\s\S]*?<span class="mt-chip-count">(\d+)<\/span>/);
    const all    = html.match(/data-mt="all"[\s\S]*?<span class="mt-chip-count">(\d+)<\/span>/);
    // Want tab is the default. Chip counts reflect watchlist only (2 items, not 4).
    assert.equal(movies[1], '1', 'movies count = 1 (watchlist only)');
    assert.equal(tv[1], '1', 'tv count = 1 (watchlist)');
    assert.equal(games[1], '0', 'games count = 0 (none in watchlist)');
    assert.equal(all[1], '2', 'all count = 2 (watchlist size)');
  });

  test('LIB-003: media-type chip counts switch to consumed set on Consumed tab', () => {
    const app = mkApp({
      watchlist: [mkItem('a', 'A', 'movie', 'tmdb'), mkItem('b', 'B', 'tv', 'tmdb')],
      consumed:  [mkItem('c', 'C', 'game', 'igdb'), mkItem('d', 'D', 'movie', 'tmdb')],
    });
    app._libraryActiveTab = 'consumed';
    const target = mkTarget();
    app.renderLibrary(target);
    const html = target.innerHTML;
    const movies = html.match(/data-mt="movies"[\s\S]*?<span class="mt-chip-count">(\d+)<\/span>/);
    const tv     = html.match(/data-mt="tv"[\s\S]*?<span class="mt-chip-count">(\d+)<\/span>/);
    const games  = html.match(/data-mt="games"[\s\S]*?<span class="mt-chip-count">(\d+)<\/span>/);
    const all    = html.match(/data-mt="all"[\s\S]*?<span class="mt-chip-count">(\d+)<\/span>/);
    // Consumed tab. Chip counts reflect consumed only (2 items: 1 movie, 1 game).
    assert.equal(movies[1], '1', 'movies count = 1 (consumed only)');
    assert.equal(tv[1], '0', 'tv count = 0 (no tv in consumed)');
    assert.equal(games[1], '1', 'games count = 1 (consumed)');
    assert.equal(all[1], '2', 'all count = 2 (consumed size)');
  });

  test('switching tabs shows/hides items from the right store', () => {
    const app = mkApp({
      watchlist: [mkItem('a', 'WatchlistItem', 'movie')],
      consumed:  [mkItem('b', 'ConsumedItem', 'movie')],
    });
    const target = mkTarget();
    // Want tab (default)
    app.renderLibrary(target);
    assert.ok(target.innerHTML.includes('WatchlistItem'), 'want tab shows watchlist item');
    assert.ok(!target.innerHTML.includes('ConsumedItem'), 'want tab hides consumed item');
    // Switch to Consumed
    app._libraryActiveTab = 'consumed';
    app.renderLibrary(target);
    assert.ok(target.innerHTML.includes('ConsumedItem'), 'consumed tab shows consumed item');
    assert.ok(!target.innerHTML.includes('WatchlistItem'), 'consumed tab hides watchlist item');
  });

  test('media-type filter limits the card grid', () => {
    const app = mkApp({
      watchlist: [
        mkItem('a', 'Movie1', 'movie'),
        mkItem('b', 'Book1', 'book'),
      ],
    });
    app._libraryActiveMediaType = 'movies';
    const target = mkTarget();
    app.renderLibrary(target);
    assert.ok(target.innerHTML.includes('Movie1'), 'movies filter shows movies');
    assert.ok(!target.innerHTML.includes('Book1'), 'movies filter hides books');
  });

  test('consumed items render star rating', () => {
    const app = mkApp({
      consumed: [{ ...mkItem('a', 'A', 'movie'), consumedRating: 4 }],
    });
    app._libraryActiveTab = 'consumed';
    const target = mkTarget();
    app.renderLibrary(target);
    const html = target.innerHTML;
    assert.ok(html.includes('library-card-rating'), 'has rating class');
    assert.ok(html.includes('★'), 'has filled star');
    assert.ok(html.includes('aria-label'), 'has aria-label for screen reader');
  });

  test('_mediaTypeOf maps common shapes', () => {
    const app = mkApp();
    assert.equal(app._mediaTypeOf({ media_type: 'movie' }), 'movies');
    assert.equal(app._mediaTypeOf({ media_type: 'tv' }), 'tv');
    assert.equal(app._mediaTypeOf({ media_type: 'book' }), 'books');
    assert.equal(app._mediaTypeOf({ media_type: 'game' }), 'games');
  });

  test('nav count is sum of watchlist + consumed', () => {
    const app = new App();
    app.lang = 'en';
    app.tr = LANG.en;
    app.watchlist = [mkItem('a', 'A', 'movie'), mkItem('b', 'B', 'tv')];
    app.consumed = [mkItem('c', 'C', 'movie')];
    app._navHTML = app._navHTML.bind(app);
    const html = app._navHTML('library');
    assert.ok(html.includes('data-view="library"'), 'nav has library tab');
    // Count should be 3 (2 watchlist + 1 consumed)
    const m = html.match(/data-view="library"[\s\S]*?>\s*[^<\d]*(\d+)/);
    assert.ok(m, 'nav shows count, got: ' + html.match(/data-view="library"[\s\S]{0,80}/)?.[0]);
    assert.equal(m[1], '3', 'nav count = 3');
  });

  test('language toggle swaps all copy (en vs de)', () => {
    const tEn = mkTarget();
    const tDe = mkTarget();
    const appEn = mkApp({ watchlist: [mkItem('a', 'A', 'movie')] });
    appEn.renderLibrary(tEn);
    const appDe = mkApp({ watchlist: [mkItem('a', 'A', 'movie')] });
    appDe.lang = 'de';
    appDe.tr = LANG.de;
    appDe.renderLibrary(tDe);
    assert.ok(tEn.innerHTML.includes('Want to'), 'EN want tab');
    assert.ok(tDe.innerHTML.includes('Will ich'), 'DE want tab');
    assert.ok(tEn.innerHTML.includes('Consumed'), 'EN consumed tab');
    assert.ok(tDe.innerHTML.includes('Gesehen'), 'DE consumed tab');
  });
});
