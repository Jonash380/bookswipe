import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

// Set up minimal DOM
const window = new Window({
  url: 'http://localhost',
});
global.window = window;
global.document = window.document;

// Mock localStorage
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

const { AchievementSystem } = await import('../js/achievements.js');
// Override _showUnlockToast to prevent dynamic toast import from hanging in Node.js
AchievementSystem.prototype._showUnlockToast = function() {};

function makeMockApp(overrides = {}) {
  return {
    lang: 'en',
    state: { blindDateMode: false, ...overrides },
    _currentWildcard: null,
  };
}

function makeItem(id, opts = {}) {
  return {
    id,
    title: opts.title || `Item ${id}`,
    type: opts.type || 'movie',
    source: opts.source || 'tmdb',
    genres: opts.genres || [],
    ...opts,
  };
}

describe('AchievementSystem', () => {
  let app;
  let ach;

  beforeEach(() => {
    storageMock.clear();
    app = makeMockApp();
    ach = new AchievementSystem(app);
    ach._sessionSwipes = 0;
  });

  describe('trackSwipe — total_swipes counts ALL directions', () => {
    it('should increment total_swipes on right swipe', () => {
      ach.trackSwipe(makeItem('a'), 'right');
      const progress = ach.getProgress();
      assert.equal(progress.total_swipes, 1);
    });

    it('should increment total_swipes on left swipe', () => {
      ach.trackSwipe(makeItem('a'), 'left');
      const progress = ach.getProgress();
      assert.equal(progress.total_swipes, 1);
    });

    it('should increment total_swipes on up (skip) swipe', () => {
      ach.trackSwipe(makeItem('a'), 'up');
      const progress = ach.getProgress();
      assert.equal(progress.total_swipes, 1);
    });

    it('should accumulate total_swipes across mixed directions', () => {
      ach.trackSwipe(makeItem('a'), 'right');
      ach.trackSwipe(makeItem('b'), 'left');
      ach.trackSwipe(makeItem('c'), 'up');
      ach.trackSwipe(makeItem('d'), 'right');
      const progress = ach.getProgress();
      assert.equal(progress.total_swipes, 4);
    });
  });

  describe('trackSwipe — total_likes only counts right swipes', () => {
    it('should increment total_likes on right swipe', () => {
      ach.trackSwipe(makeItem('a'), 'right');
      const progress = ach.getProgress();
      assert.equal(progress.total_likes, 1);
    });

    it('should NOT increment total_likes on left swipe', () => {
      ach.trackSwipe(makeItem('a'), 'left');
      const progress = ach.getProgress();
      assert.equal(progress.total_likes, undefined);
    });

    it('should NOT increment total_likes on up swipe', () => {
      ach.trackSwipe(makeItem('a'), 'up');
      const progress = ach.getProgress();
      assert.equal(progress.total_likes, undefined);
    });

    it('should only count right swipes for total_likes among mixed directions', () => {
      ach.trackSwipe(makeItem('a'), 'right');
      ach.trackSwipe(makeItem('b'), 'left');
      ach.trackSwipe(makeItem('c'), 'right');
      ach.trackSwipe(makeItem('d'), 'up');
      const progress = ach.getProgress();
      assert.equal(progress.total_likes, 2);
      assert.equal(progress.total_swipes, 4);
    });
  });

  describe('trackSwipe — session swipe counter', () => {
    it('should increment _sessionSwipes for all directions', () => {
      ach.trackSwipe(makeItem('a'), 'right');
      ach.trackSwipe(makeItem('b'), 'left');
      ach.trackSwipe(makeItem('c'), 'up');
      assert.equal(ach._sessionSwipes, 3);
    });
  });

  describe('trackSwipe — genre/type tracking only on likes', () => {
    it('should track unique genres on right swipe', () => {
      ach.trackSwipe(makeItem('a', { genres: ['Action', 'Drama'] }), 'right');
      ach.trackSwipe(makeItem('b', { genres: ['Comedy'] }), 'right');
      const progress = ach.getProgress();
      assert.deepEqual(progress.unique_genres, ['action', 'drama', 'comedy']);
    });

    it('should NOT track genres on left swipe', () => {
      ach.trackSwipe(makeItem('a', { genres: ['Action'] }), 'left');
      const progress = ach.getProgress();
      assert.equal(progress.unique_genres, undefined);
    });

    it('should count book_likes for book sources on right swipe', () => {
      ach.trackSwipe(makeItem('a', { type: 'book', source: 'openlibrary' }), 'right');
      const progress = ach.getProgress();
      assert.equal(progress.book_likes, 1);
    });

    it('should count game_likes for game sources on right swipe', () => {
      ach.trackSwipe(makeItem('a', { type: 'game', source: 'igdb' }), 'right');
      const progress = ach.getProgress();
      assert.equal(progress.game_likes, 1);
    });

    it('should count movie_likes for movie sources on right swipe', () => {
      ach.trackSwipe(makeItem('a', { type: 'movie', source: 'tmdb' }), 'right');
      const progress = ach.getProgress();
      assert.equal(progress.movie_likes, 1);
    });

    it('should NOT track type-specific likes on left swipe', () => {
      ach.trackSwipe(makeItem('a', { type: 'book', source: 'openlibrary' }), 'left');
      ach.trackSwipe(makeItem('b', { type: 'game', source: 'igdb' }), 'left');
      ach.trackSwipe(makeItem('c', { type: 'movie', source: 'tmdb' }), 'left');
      const progress = ach.getProgress();
      assert.equal(progress.book_likes, undefined);
      assert.equal(progress.game_likes, undefined);
      assert.equal(progress.movie_likes, undefined);
    });
  });
});
