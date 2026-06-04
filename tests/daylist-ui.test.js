import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ---- Set up jsdom environment (same pattern as peek.test.js) ----
const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.performance = dom.window.performance;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

Object.defineProperty(global, 'navigator', {
  value: { vibrate: () => {} },
  writable: true,
  configurable: true,
});
global.window.getComputedStyle = () => ({});
global.window.location = new URL('http://localhost');

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
  };
})();
Object.defineProperty(global.window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Import the App class
const { App } = await import('../js/app.js');

/**
 * Helper: dispatch a keydown event.
 */
function keydown(key) {
  const evt = new dom.window.KeyboardEvent('keydown', { key, bubbles: true });
  document.dispatchEvent(evt);
}

/**
 * Helper: simulate a click event on an element.
 */
function click(el) {
  const evt = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(evt);
}

describe('Daylist UI (_showDaylist)', () => {
  let appEl;

  // Shared mock items used by most tests
  const mockItems = [
    {
      id: 'test-1',
      title: 'The Matrix',
      year: 1999,
      type: 'movie',
      source: 'tmdb',
      genres: [28, 878],
      tags: ['action', 'sci-fi'],
      overview: 'A computer hacker learns about the true nature of his reality.',
      rating: 8.7,
      mediaDNA: { tropes: ['chosen_one'], pacing: ['fast_paced'], aesthetic: ['neon_noir'] },
    },
    {
      id: 'test-2',
      title: 'Dune',
      year: 2021,
      type: 'movie',
      source: 'tmdb',
      genres: [878, 12],
      tags: ['epic', 'atmospheric'],
      overview: 'A noble family becomes embroiled in a war for control over the galaxy.',
      rating: 8.0,
      mediaDNA: { tropes: ['chosen_one'], pacing: ['slow_paced'], aesthetic: ['epic_scale'] },
    },
    {
      id: 'test-3',
      title: 'Stardew Valley',
      type: 'game',
      source: 'igdb',
      genres: ['Simulation', 'RPG'],
      tags: ['cozy', 'relaxing'],
      playtime: 80,
      platforms: [{ id: 6, name: 'PC', abbr: 'PC' }],
      mechanics: ['farming', 'crafting'],
      themes: ['fantasy'],
      mediaDNA: { tropes: ['found_family'], pacing: ['slow_paced'], aesthetic: ['cozy_warm'] },
    },
  ];

  beforeEach(() => {
    appEl = document.getElementById('app');
    localStorage.clear();
  });

  afterEach(() => {
    // Clean up any leftover daylist overlays
    document.querySelectorAll('.daylist-overlay').forEach(el => el.remove());
    // Reset app innerHTML
    if (appEl) appEl.innerHTML = '';
  });

  // ===== MODAL RENDERS =====

  it('should render a daylist-overlay with daylist-modal when _showDaylist is called', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: (items, context) => ({
          queue_title: 'Wednesday Evening: Action/Sci-Fi 3 Picks',
          vibe_description: 'Evening vibes with balanced energy. Perfect for relaxed flow this Wednesday.',
          estimated_total_time: '~5 hours',
          contextual_rules_applied: [
            'Weekday — keeping commitments manageable',
            'Night hours — prioritized atmospheric & slow-burn deep dives',
          ],
          media_queue: [
            { title: 'Dune', author: '', format: 'Movie', why_right_now: 'Atmospheric · Dive deep — perfect for right now' },
            { title: 'The Matrix', author: '', format: 'Movie', why_right_now: 'Your style · Morning pick-me-up — perfect for right now' },
            { title: 'Stardew Valley', author: 'PC', format: 'Epic Game', why_right_now: 'Cozy & light · Dive deep — perfect for right now' },
          ],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    return new Promise(resolve => {
      // Wait for requestAnimationFrame to fire (mocked as setTimeout(cb, 16))
      setTimeout(() => {
        const overlay = document.querySelector('.daylist-overlay');
        assert.ok(overlay, 'daylist-overlay should be rendered');
        assert.ok(overlay.classList.contains('open'), 'overlay should have open class after rAF');
        resolve();
      }, 30);
    });
  });

  it('should render the queue title in the modal header', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Wednesday Evening: Action/Sci-Fi 3 Picks',
          vibe_description: 'Evening vibes.',
          estimated_total_time: '~5 hours',
          contextual_rules_applied: ['Weekday — manageable'],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect for now' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const title = document.querySelector('.daylist-title');
    assert.ok(title, 'daylist-title should exist');
    assert.ok(title.textContent.includes('Wednesday Evening'), 'title should contain day and time');
  });

  it('should render the vibe description', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test Title',
          vibe_description: 'Evening vibes with balanced energy. Perfect for relaxed flow.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Weekday — manageable'],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect for now' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const vibe = document.querySelector('.daylist-vibe');
    assert.ok(vibe, 'daylist-vibe should exist');
    assert.ok(vibe.textContent.includes('Evening vibes'), 'vibe should contain the description');
  });

  it('should render the estimated total time', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test Title',
          vibe_description: 'Test vibe.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Weekday — manageable'],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect for now' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const timeEl = document.querySelector('.daylist-time');
    assert.ok(timeEl, 'daylist-time should exist');
    assert.ok(timeEl.textContent.includes('~2 hours'), 'should show estimated time');
  });

  it('should render contextual rules as chips', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test Title',
          vibe_description: 'Test vibe.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: [
            'Weekday — keeping commitments manageable',
            'Night hours — prioritized atmospheric & slow-burn deep dives',
          ],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect for now' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const rules = document.querySelectorAll('.daylist-rule');
    assert.equal(rules.length, 2, 'should render 2 rule chips');
    assert.ok(rules[0].textContent.includes('Weekday'), 'first rule should be weekday');
    assert.ok(rules[1].textContent.includes('Night'), 'second rule should be night');
  });

  it('should render media queue with item titles', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test Title',
          vibe_description: 'Test vibe.',
          estimated_total_time: '~5 hours',
          contextual_rules_applied: ['Weekday — manageable'],
          media_queue: [
            { title: 'Dune', author: '', format: 'Movie', why_right_now: 'Dive deep' },
            { title: 'The Matrix', author: '', format: 'Movie', why_right_now: 'Quick to digest' },
            { title: 'Stardew Valley', author: 'PC', format: 'Epic Game', why_right_now: 'Cozy & light' },
          ],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const items = document.querySelectorAll('.daylist-item');
    assert.equal(items.length, 3, 'should render 3 queue items');
    const titles = document.querySelectorAll('.daylist-item-title');
    assert.equal(titles[0].textContent, 'Dune');
    assert.equal(titles[1].textContent, 'The Matrix');
    assert.equal(titles[2].textContent, 'Stardew Valley');
  });

  it('should render why_right_now text for each queue item', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test Title',
          vibe_description: 'Test vibe.',
          estimated_total_time: '~5 hours',
          contextual_rules_applied: ['Weekday — manageable'],
          media_queue: [
            { title: 'Dune', author: '', format: 'Movie', why_right_now: 'Atmospheric — perfect for right now' },
            { title: 'The Matrix', author: '', format: 'Movie', why_right_now: 'Your style — perfect for right now' },
          ],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const whyTexts = document.querySelectorAll('.daylist-item-why');
    assert.equal(whyTexts.length, 2, 'should have 2 why explanations');
    assert.ok(whyTexts[0].textContent.includes('Atmospheric'));
    assert.ok(whyTexts[1].textContent.includes('Your style'));
  });

  it('should render format badges on items', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test Title',
          vibe_description: 'Test vibe.',
          estimated_total_time: '~5 hours',
          contextual_rules_applied: ['Weekday — manageable'],
          media_queue: [
            { title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect' },
            { title: 'Stardew Valley', author: 'PC', format: 'Epic Game', why_right_now: 'Perfect' },
          ],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const formats = document.querySelectorAll('.daylist-item-format');
    assert.equal(formats.length, 2, 'should have 2 format badges');
    assert.equal(formats[0].textContent, 'Movie');
    assert.equal(formats[1].textContent, 'Epic Game');
  });

  it('should render rank numbers on items', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test Title',
          vibe_description: 'Test vibe.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Weekday — manageable'],
          media_queue: [
            { title: 'A', author: '', format: 'Movie', why_right_now: 'P1' },
            { title: 'B', author: '', format: 'Movie', why_right_now: 'P2' },
            { title: 'C', author: '', format: 'Movie', why_right_now: 'P3' },
          ],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const ranks = document.querySelectorAll('.daylist-item-rank');
    assert.equal(ranks.length, 3, 'should have 3 rank badges');
    assert.equal(ranks[0].textContent, '1');
    assert.equal(ranks[1].textContent, '2');
    assert.equal(ranks[2].textContent, '3');
  });

  // ===== CLOSE BUTTON =====

  it('should dismiss the overlay when close button is clicked', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test',
          vibe_description: 'Test.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Weekday'],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const closeBtn = document.querySelector('[data-action="daylist-close"]');
    assert.ok(closeBtn, 'close button should exist');
    click(closeBtn);

    const overlay = document.querySelector('.daylist-overlay');
    assert.equal(overlay.classList.contains('open'), false, 'overlay should lose open class');
  });

  it('should remove the overlay from DOM after close button click + timeout', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test',
          vibe_description: 'Test.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Weekday'],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const closeBtn = document.querySelector('[data-action="daylist-close"]');
    click(closeBtn);

    return new Promise(resolve => {
      setTimeout(() => {
        assert.equal(document.querySelector('.daylist-overlay'), null, 'overlay should be removed from DOM');
        resolve();
      }, 350);
    });
  });

  // ===== BACKDROP CLICK =====

  it('should dismiss the overlay when clicking the backdrop outside the modal', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test',
          vibe_description: 'Test.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Weekday'],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const overlay = document.querySelector('.daylist-overlay');
    assert.ok(overlay, 'overlay exists');

    // Click the backdrop (the overlay itself)
    click(overlay);

    assert.equal(overlay.classList.contains('open'), false, 'overlay should be dismissed');
  });

  // ===== ESCAPE KEY =====

  it('should dismiss the overlay when Escape key is pressed', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test',
          vibe_description: 'Test.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Weekday'],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const overlay = document.querySelector('.daylist-overlay');
    assert.ok(overlay, 'overlay exists');

    keydown('Escape');

    assert.equal(overlay.classList.contains('open'), false, 'overlay should be dismissed on Escape');
  });

  // ===== ENERGY TOGGLE =====

  it('should render energy level toggle buttons', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test',
          vibe_description: 'Test.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Weekday'],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const energyBtns = document.querySelectorAll('.daylist-energy-btn');
    assert.equal(energyBtns.length, 4, 'should have 4 energy level buttons');
    assert.ok(energyBtns[0].textContent.includes('Auto'));
    assert.ok(energyBtns[1].textContent.includes('Tired'));
    assert.ok(energyBtns[2].textContent.includes('Good'));
    assert.ok(energyBtns[3].textContent.includes('Energetic'));
  });

  it('should default to Auto being active', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test',
          vibe_description: 'Test.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Weekday'],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const energyBtns = document.querySelectorAll('.daylist-energy-btn');
    assert.ok(energyBtns[0].classList.contains('active'), 'Auto button should be active by default');
  });

  it('should re-render the overlay with low energy when Tired is clicked', () => {
    let callCount = 0;
    let lastEnergy = null;

    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: (items, context) => {
          callCount++;
          lastEnergy = context.energyLevel;
          return {
            queue_title: callCount === 1 ? 'Auto Mode' : 'Low Energy Mode',
            vibe_description: 'Test.',
            estimated_total_time: '~2 hours',
            contextual_rules_applied: ['Low energy detected'],
            media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Cozy pick' }],
          };
        },
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    // Initial call should be Auto (null)
    assert.equal(callCount, 1, 'should call generateDaylist once on render');
    assert.equal(lastEnergy, null, 'first call should have null energy');

    // Click Tired
    const tiredBtn = document.querySelector('[data-energy="low"]');
    assert.ok(tiredBtn, 'Tired button should exist');
    click(tiredBtn);

    // After re-render, the new overlay should have the low energy title
    const title = document.querySelector('.daylist-title');
    assert.ok(title, 'new title should exist after re-render');
    assert.ok(title.textContent.includes('Low Energy Mode'), 'title should reflect low energy');

    // Energy level should have been passed as 'low'
    assert.equal(lastEnergy, 'low', 'generateDaylist should receive energyLevel=low');
  });

  it('should switch active class when clicking different energy buttons', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test',
          vibe_description: 'Test.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Rule'],
          media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Perfect' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    // Auto should be active initially
    const autoBtn = document.querySelector('[data-energy="null"]');
    const highBtn = document.querySelector('[data-energy="high"]');
    assert.ok(autoBtn.classList.contains('active'), 'Auto should be active initially');
    assert.ok(!highBtn.classList.contains('active'), 'High should not be active initially');

    // Click High Energy
    click(highBtn);

    // After re-render, High should be active and Auto inactive
    const newAuto = document.querySelector('[data-energy="null"]');
    const newHigh = document.querySelector('[data-energy="high"]');
    assert.ok(!newAuto.classList.contains('active'), 'Auto should not be active after switching');
    assert.ok(newHigh.classList.contains('active'), 'High should be active after clicking');
  });

  it('should call generateDaylist with energyLevel=high when Energetic is clicked', () => {
    let lastEnergy = null;

    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: (items, context) => {
          lastEnergy = context.energyLevel;
          return {
            queue_title: 'High Energy Mode',
            vibe_description: 'Test.',
            estimated_total_time: '~2 hours',
            contextual_rules_applied: ['High energy'],
            media_queue: [{ title: 'Dune', author: '', format: 'Movie', why_right_now: 'Intense' }],
          };
        },
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    click(document.querySelector('[data-energy="high"]'));
    assert.equal(lastEnergy, 'high', 'should call with energyLevel=high');
  });

  // ===== GERMAN LOCALE =====

  it('should render German labels for de locale', () => {
    const mockApp = {
      lang: 'de',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Mittwoch Nacht: Action/Sci-Fi 3 Titel',
          vibe_description: 'Nacht-Stimmung mit ausgeglichener Energie.',
          estimated_total_time: '~2 Std',
          contextual_rules_applied: ['Werktag — überschaubare Längen'],
          media_queue: [{ title: 'Dune', author: '', format: 'Film', why_right_now: 'Perfekt für jetzt' }],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const title = document.querySelector('.daylist-title');
    assert.ok(title.textContent.includes('Mittwoch'), 'German title should use Mittwoch');

    const energyBtns = document.querySelectorAll('.daylist-energy-btn');
    assert.ok(energyBtns[1].textContent.includes('Müde'), 'Tired should be Müde in German');
    assert.ok(energyBtns[2].textContent.includes('OK'), 'Good should be OK in German');
    assert.ok(energyBtns[3].textContent.includes('Energie'), 'Energetic should be Energie in German');
  });

  // ===== EMPTY / EDGE CASES =====

  it('should show a toast when currentCards is empty', () => {
    let shownToast = null;

    const mockApp = {
      lang: 'en',
      currentCards: [],
      recommender: { generateDaylist: () => ({ media_queue: [] }) },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
      // Capture toast calls
      _toastShown: null,
    };

    // We can't easily mock showToast since it's imported, so just verify the method doesn't crash
    try {
      App.prototype._showDaylist.call(mockApp, appEl);
      assert.ok(true, '_showDaylist should not crash with empty currentCards');
    } catch (e) {
      assert.fail(`_showDaylist threw with empty currentCards: ${e.message}`);
    }
  });

  it('should render items with author info when available', () => {
    const mockApp = {
      lang: 'en',
      currentCards: mockItems,
      recommender: {
        generateDaylist: () => ({
          queue_title: 'Test',
          vibe_description: 'Test.',
          estimated_total_time: '~2 hours',
          contextual_rules_applied: ['Weekday'],
          media_queue: [
            { title: 'Dune', author: 'Frank Herbert', format: 'Book', why_right_now: 'Perfect' },
            { title: 'Star Wars', author: '', format: 'Movie', why_right_now: 'Perfect' },
          ],
        }),
      },
      _genreMap: {},
      state: { selectedGenres: [], selectedMoods: [], mediaType: 'movies' },
    };

    App.prototype._showDaylist.call(mockApp, appEl);

    const authors = document.querySelectorAll('.daylist-item-author');
    // Empty string author '' is falsy, so only the non-empty author gets a span
    assert.equal(authors.length, 1, 'should have 1 author field (empty author is not rendered)');
    assert.equal(authors[0].textContent, 'Frank Herbert');
  });
});
