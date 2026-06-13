/**
 * LIB-005 — Kebab menu actions for the Library page
 *
 * Covers the three kebab actions exposed on each library card:
 *   1. remove            — remove from watchlist (Want tab) or consumed (Consumed tab)
 *   2. move-to-consumed  — Want tab: prompt for rating, then move (or add separately) via _addConsumedAtomic
 *   3. move-to-want      — Consumed tab: remove from consumed, add back to watchlist
 *
 * Also covers the tab-aware menu rendering, the kebab click binding, the rating
 * prompt, and the recommender hooks (clear/updateFromSwipe) that keep the
 * taste vector consistent after a library mutation.
 */

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
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.Image = class FakeImage {
    constructor() { this._src = ''; }
    set src(v) { this._src = v; }
    get src() { return this._src; }
  };
});

// Dynamic import so the App module picks up the globals
const { App } = await import('../js/app.js');
const storage = await import('../js/storage.js');

function mkItem(id, title, media_type, source = 'tmdb', extras = {}) {
  return { id, title, media_type, source, year: 2020, cover: 'https://example.com/c.jpg', ...extras };
}

function mkApp({ watchlist = [], consumed = [], lang = 'en' } = {}) {
  const app = new App();
  app.lang = lang;
  app.tr = LANG[lang];
  app.watchlist = [...watchlist];
  app.consumed = [...consumed];
  app.state = app.state || { mediaType: 'movies' };
  app._navHTML = () => '<nav></nav>';
  return app;
}

function mkTarget(id = 'app') {
  // Remove any existing target to keep tests isolated
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = id;
  document.body.appendChild(t);
  return t;
}

describe('LIB-005: kebab button rendering on library cards', () => {
  test('each library card renders a kebab button with data-action and data-id', () => {
    const app = mkApp({ watchlist: [mkItem('a', 'A', 'movie')] });
    const target = mkTarget();
    app.renderLibrary(target);
    const kebab = target.querySelector('[data-action="library-kebab"]');
    assert.ok(kebab, 'kebab button is rendered');
    assert.equal(kebab.dataset.id, 'a', 'kebab carries the item id');
    assert.equal(kebab.getAttribute('aria-label'), 'Actions', 'kebab has aria-label (EN)');
  });

  test('kebab aria-label is in German when lang=de', () => {
    const app = mkApp({ watchlist: [mkItem('a', 'A', 'movie')], lang: 'de' });
    const target = mkTarget();
    app.renderLibrary(target);
    const kebab = target.querySelector('[data-action="library-kebab"]');
    assert.equal(kebab.getAttribute('aria-label'), 'Aktionen', 'kebab has aria-label (DE)');
  });
});

describe('LIB-005: kebab menu opens with tab-aware actions', () => {
  test('on Want tab, the menu offers remove + move-to-consumed', () => {
    const app = mkApp({ watchlist: [mkItem('a', 'A', 'movie')] });
    const target = mkTarget();
    app.renderLibrary(target);
    const btn = target.querySelector('[data-action="library-kebab"]');
    app._openLibraryKebabMenu(btn, app.watchlist[0], 'want');
    const menu = document.querySelector('.library-kebab-menu');
    assert.ok(menu, 'menu is appended to body');
    assert.equal(menu.querySelectorAll('[data-kebab-action]').length, 2, 'menu has 2 actions');
    const actions = Array.from(menu.querySelectorAll('[data-kebab-action]')).map(b => b.dataset.kebabAction);
    assert.deepEqual(actions.sort(), ['move-to-consumed', 'remove'], 'actions on Want tab');
  });

  test('on Consumed tab, the menu offers remove + move-to-want', () => {
    const app = mkApp({ consumed: [{ ...mkItem('a', 'A', 'movie'), consumedRating: 4 }] });
    app._libraryActiveTab = 'consumed';
    const target = mkTarget();
    app.renderLibrary(target);
    const btn = target.querySelector('[data-action="library-kebab"]');
    app._openLibraryKebabMenu(btn, app.consumed[0], 'consumed');
    const menu = document.querySelector('.library-kebab-menu');
    assert.ok(menu, 'menu is appended to body');
    const actions = Array.from(menu.querySelectorAll('[data-kebab-action]')).map(b => b.dataset.kebabAction);
    assert.deepEqual(actions.sort(), ['move-to-want', 'remove'], 'actions on Consumed tab');
  });

  test('opening a new menu closes the previous one first', () => {
    const app = mkApp({ watchlist: [mkItem('a', 'A', 'movie'), mkItem('b', 'B', 'tv')] });
    const target = mkTarget();
    app.renderLibrary(target);
    const btns = target.querySelectorAll('[data-action="library-kebab"]');
    app._openLibraryKebabMenu(btns[0], app.watchlist[0], 'want');
    assert.equal(document.querySelectorAll('.library-kebab-menu').length, 1, 'first menu open');
    app._openLibraryKebabMenu(btns[1], app.watchlist[1], 'want');
    assert.equal(document.querySelectorAll('.library-kebab-menu').length, 1, 'only second menu remains');
  });
});

describe('LIB-005: kebab click binding (integration)', () => {
  test('clicking a kebab button on the Want tab opens a menu with the right actions', () => {
    const app = mkApp({ watchlist: [mkItem('click-1', 'Click One', 'movie')] });
    const target = mkTarget();
    app.renderLibrary(target);
    const kebab = target.querySelector('[data-action="library-kebab"]');
    assert.ok(kebab, 'kebab is rendered');
    // Simulate the click — _bindLibraryEvents wires this exact flow.
    kebab.click();
    const menu = document.querySelector('.library-kebab-menu');
    assert.ok(menu, 'menu opens after kebab click');
    const actions = Array.from(menu.querySelectorAll('[data-kebab-action]')).map(b => b.dataset.kebabAction);
    assert.deepEqual(actions.sort(), ['move-to-consumed', 'remove'], 'Want tab actions after click');
  });

  test('clicking a kebab on the Consumed tab opens a menu with move-to-want', () => {
    const app = mkApp({ consumed: [{ ...mkItem('click-2', 'Click Two', 'movie'), consumedRating: 3 }] });
    app._libraryActiveTab = 'consumed';
    const target = mkTarget();
    app.renderLibrary(target);
    const kebab = target.querySelector('[data-action="library-kebab"]');
    kebab.click();
    const menu = document.querySelector('.library-kebab-menu');
    assert.ok(menu, 'menu opens after kebab click');
    const actions = Array.from(menu.querySelectorAll('[data-kebab-action]')).map(b => b.dataset.kebabAction);
    assert.deepEqual(actions.sort(), ['move-to-want', 'remove'], 'Consumed tab actions after click');
  });
});

describe('LIB-005: remove action', () => {
  test('remove on Want tab deletes the item from watchlist and storage', async () => {
    await storage.clearAllData();
    const item = mkItem('a', 'A', 'movie');
    await storage.addToWatchlist(item);
    const app = mkApp({ watchlist: [item] });
    const target = mkTarget();
    app.renderLibrary(target);
    await app._handleLibraryKebabAction('remove', item, 'want');
    assert.equal(app.watchlist.length, 0, 'in-memory watchlist is empty');
    const persisted = await storage.getWatchlist();
    assert.equal(persisted.length, 0, 'persisted watchlist is empty');
  });

  test('remove on Consumed tab deletes the item from consumed and storage', async () => {
    await storage.clearAllData();
    const item = { ...mkItem('b', 'B', 'movie'), consumedRating: 3 };
    await storage.addToConsumed(item, 3);
    const app = mkApp({ consumed: [item] });
    app._libraryActiveTab = 'consumed';
    const target = mkTarget();
    app.renderLibrary(target);
    await app._handleLibraryKebabAction('remove', item, 'consumed');
    assert.equal(app.consumed.length, 0, 'in-memory consumed is empty');
    const persisted = await storage.getConsumed();
    assert.equal(persisted.length, 0, 'persisted consumed is empty');
  });

  test('remove does not touch the other store', async () => {
    await storage.clearAllData();
    const wlItem = mkItem('wl', 'WL', 'movie');
    const coItem = { ...mkItem('co', 'CO', 'movie'), consumedRating: 4 };
    await storage.addToWatchlist(wlItem);
    await storage.addToConsumed(coItem, 4);
    const app = mkApp({ watchlist: [wlItem], consumed: [coItem] });
    // Remove from watchlist
    await app._handleLibraryKebabAction('remove', wlItem, 'want');
    assert.equal((await storage.getWatchlist()).length, 0, 'watchlist cleaned');
    assert.equal((await storage.getConsumed()).length, 1, 'consumed untouched');
  });

  test('remove from watchlist invalidates the recommender taste vector', async () => {
    await storage.clearAllData();
    const item = mkItem('a', 'A', 'movie');
    await storage.addToWatchlist(item);
    const app = mkApp({ watchlist: [item] });
    let clearCount = 0;
    const originalClear = app.recommender.clear.bind(app.recommender);
    app.recommender.clear = () => { clearCount++; originalClear(); };
    await app._handleLibraryKebabAction('remove', item, 'want');
    assert.ok(clearCount >= 1, 'recommender.clear() was called at least once');
  });

  test('remove from consumed also invalidates the recommender taste vector', async () => {
    await storage.clearAllData();
    const item = { ...mkItem('b', 'B', 'movie'), consumedRating: 3 };
    await storage.addToConsumed(item, 3);
    const app = mkApp({ consumed: [item] });
    app._libraryActiveTab = 'consumed';
    let clearCount = 0;
    app.recommender.clear = () => { clearCount++; };
    await app._handleLibraryKebabAction('remove', item, 'consumed');
    assert.ok(clearCount >= 1, 'recommender.clear() was called at least once');
  });
});

describe('LIB-005: move-to-consumed action (real orchestrator)', () => {
  test('moves watchlist item to consumed via the real _addConsumedAtomic (moved status)', async () => {
    await storage.clearAllData();
    const item = mkItem('a', 'A', 'movie');
    await storage.addToWatchlist(item);
    const app = mkApp({ watchlist: [item] });
    // Real rating prompt replaced with a direct return so we don't have to
    // simulate the modal UI. The conflict prompt is mocked to "move".
    app._showRatingPrompt = async () => 4;
    app._showConsumedConflictPrompt = async () => ({ choice: 'move' });
    const target = mkTarget();
    app.renderLibrary(target);
    await app._handleLibraryKebabAction('move-to-consumed', item, 'want');
    assert.equal(app.watchlist.length, 0, 'removed from in-memory watchlist');
    assert.equal(app.consumed.length, 1, 'added to in-memory consumed');
    assert.equal(app.consumed[0].consumedRating, 4, 'rating recorded');
    assert.equal((await storage.getWatchlist()).length, 0, 'persisted watchlist empty');
    assert.equal((await storage.getConsumed()).length, 1, 'persisted consumed has 1');
  });

  test('cancelled rating prompt (null) is a no-op', async () => {
    await storage.clearAllData();
    const item = mkItem('a', 'A', 'movie');
    await storage.addToWatchlist(item);
    const app = mkApp({ watchlist: [item] });
    app._showRatingPrompt = async () => null; // user hit Cancel
    let atomicCalled = false;
    app._addConsumedAtomic = async () => { atomicCalled = true; return { status: 'dismissed' }; };
    await app._handleLibraryKebabAction('move-to-consumed', item, 'want');
    assert.equal(atomicCalled, false, '_addConsumedAtomic is NOT called when rating prompt is cancelled');
    assert.equal(app.watchlist.length, 1, 'watchlist untouched');
  });

  test('updated status refreshes consumed from storage', async () => {
    await storage.clearAllData();
    const item = { ...mkItem('a', 'A', 'movie'), consumedRating: 3 };
    await storage.addToConsumed(item, 3);
    const app = mkApp({ consumed: [item] });
    app._showRatingPrompt = async () => 5;
    // Real _addConsumedAtomic: item is already in consumed, so it should
    // (a) prompt for update, (b) call updateConsumedRating, (c) return 'updated'.
    app._showConsumedConflictPrompt = async () => ({ choice: 'update' });
    await app._handleLibraryKebabAction('move-to-consumed', item, 'consumed');
    assert.equal(app.consumed[0].consumedRating, 5, 'rating updated to 5');
  });
});

describe('LIB-005: move-to-want action', () => {
  test('removes from consumed and adds back to watchlist (no consumed fields)', async () => {
    await storage.clearAllData();
    const item = { ...mkItem('a', 'A', 'movie'), consumedRating: 4, consumedAt: 1700000000000 };
    await storage.addToConsumed(item, 4);
    const app = mkApp({ consumed: [item] });
    app._libraryActiveTab = 'consumed';
    const target = mkTarget();
    app.renderLibrary(target);
    await app._handleLibraryKebabAction('move-to-want', item, 'consumed');
    assert.equal(app.consumed.length, 0, 'removed from in-memory consumed');
    assert.equal(app.watchlist.length, 1, 'added back to in-memory watchlist');
    const restored = app.watchlist[0];
    assert.equal(restored.id, 'a');
    assert.equal(restored.title, 'A');
    assert.equal(restored.consumedRating, undefined, 'consumedRating stripped');
    assert.equal(restored.consumedAt, undefined, 'consumedAt stripped');
    assert.equal(restored.promotedFromWatchlist, undefined, 'promotedFromWatchlist stripped');
    // Storage matches
    assert.equal((await storage.getConsumed()).length, 0, 'persisted consumed empty');
    const persisted = await storage.getWatchlist();
    assert.equal(persisted.length, 1, 'persisted watchlist has 1');
    assert.equal(persisted[0].consumedRating, undefined, 'persisted entry has no consumedRating');
  });

  test('move-to-want re-feeds the recommender like signal', async () => {
    await storage.clearAllData();
    const item = { ...mkItem('a', 'A', 'movie'), consumedRating: 4 };
    await storage.addToConsumed(item, 4);
    const app = mkApp({ consumed: [item] });
    let updateFromSwipeArgs = null;
    app.recommender.updateFromSwipe = (it, action) => { updateFromSwipeArgs = { it, action }; };
    await app._handleLibraryKebabAction('move-to-want', item, 'consumed');
    assert.ok(updateFromSwipeArgs, 'recommender.updateFromSwipe was called');
    assert.equal(updateFromSwipeArgs.action, 'like', 'action is "like"');
    assert.equal(updateFromSwipeArgs.it.id, 'a', 'item passed through');
  });
});

describe('LIB-005: kebab menu close behaviors', () => {
  test('_closeLibraryKebabMenu removes the menu from the DOM', () => {
    const app = mkApp({ watchlist: [mkItem('a', 'A', 'movie')] });
    const target = mkTarget();
    app.renderLibrary(target);
    const btn = target.querySelector('[data-action="library-kebab"]');
    app._openLibraryKebabMenu(btn, app.watchlist[0], 'want');
    assert.ok(document.querySelector('.library-kebab-menu'), 'menu open');
    app._closeLibraryKebabMenu();
    assert.equal(document.querySelectorAll('.library-kebab-menu.open').length, 0, 'menu closed');
  });

  test('clicking an action closes the menu before dispatching', async () => {
    await storage.clearAllData();
    const item = mkItem('a', 'A', 'movie');
    await storage.addToWatchlist(item);
    const app = mkApp({ watchlist: [item] });
    const target = mkTarget();
    app.renderLibrary(target);
    const btn = target.querySelector('[data-action="library-kebab"]');
    app._openLibraryKebabMenu(btn, item, 'want');
    const removeBtn = document.querySelector('[data-kebab-action="remove"]');
    assert.ok(removeBtn, 'remove button exists in the menu');
    removeBtn.click();
    // After click, the menu should be closed synchronously (the click handler
    // calls _closeLibraryKebabMenu first, then dispatches the action).
    assert.equal(document.querySelector('.library-kebab-menu'), null, 'menu removed after action click');
  });
});

describe('LIB-005: re-render after action', () => {
  test('remove from watchlist re-renders the library without the item', async () => {
    await storage.clearAllData();
    const keep = mkItem('keep', 'Keep', 'movie');
    const drop = mkItem('drop', 'Drop', 'movie');
    await storage.addToWatchlist(keep);
    await storage.addToWatchlist(drop);
    const app = mkApp({ watchlist: [keep, drop] });
    const target = mkTarget();
    app.renderLibrary(target);
    assert.ok(target.innerHTML.includes('Keep') && target.innerHTML.includes('Drop'), 'both visible');
    await app._handleLibraryKebabAction('remove', drop, 'want');
    assert.ok(target.innerHTML.includes('Keep'), 'keep is still rendered');
    assert.ok(!target.innerHTML.includes('Drop'), 'drop is gone after re-render');
  });
});
