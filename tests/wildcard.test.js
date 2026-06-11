import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

// Set up minimal DOM + localStorage (needed by Recommender constructor)
const window = new Window({
  url: 'http://localhost',
});
global.window = window;
global.document = window.document;
global.performance = window.performance;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

Object.defineProperty(global, 'navigator', {
  value: { vibrate: () => {} },
  writable: true,
  configurable: true,
});
global.window.getComputedStyle = () => ({});

const storageMock = (() => {
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
  value: storageMock,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});

const { Recommender } = await import('../js/recommender.js');

// ===== Helpers =====

function makeMockApp(lang = 'en', stateOverrides = {}) {
  return {
    lang,
    state: {
      selectedGenres: [],
      selectedMoods: [],
      eraFilter: 'all',
      boostedMoods: [],
      blockedGenres: [],
      selectedPlatforms: [],
      ...stateOverrides,
    },
    _genreMap: {
      28: 'Action', 12: 'Adventure', 35: 'Comedy', 18: 'Drama',
      27: 'Horror', 10749: 'Romance', 878: 'Science Fiction',
      53: 'Thriller', 16: 'Animation', 14: 'Fantasy',
    },
  };
}

/**
 * Reset the recommender profile to a clean slate.
 */
function resetProfile(rec) {
  rec.profile = {
    genreWeights: {}, tagWeights: {}, eraPreference: null,
    tropes: {}, pacingStyles: {}, aesthetics: {}, warnings: {},
    totalSwipes: 0, likeRatio: 0,
    gamePlatformWeights: {}, gameMechanicWeights: {}, gameThemeWeights: {},
  };
  rec.cache.clear();
}

/**
 * Create a mock media item for wildcard testing.
 * By default, items have genres that would be "liked" (Action/Adventure)
 * and mediaDNA with common tropes/pacing/aesthetics.
 */
function makeItem(id, overrides = {}) {
  return {
    id,
    title: `Item ${id}`,
    type: 'movie',
    source: 'tmdb',
    genres: [28, 12], // Action, Adventure — default "liked" genres
    tags: ['fast-paced', 'thrilling'],
    overview: 'An exciting story about discovery and courage against all odds.',
    rating: 7.5,
    mediaDNA: {
      tropes: ['chosen_one', 'underdog'],
      pacing: ['fast_paced'],
      aesthetic: ['neon_noir'],
    },
    ...overrides,
  };
}

/**
 * Create a "rare genre" item — genres the user supposedly dislikes.
 */
function makeRareItem(id, overrides = {}) {
  return makeItem(id, {
    genres: [27], // Horror — typically a rare genre
    tags: ['dark', 'suspenseful'],
    mediaDNA: {
      tropes: ['survival', 'mystery_box'],
      pacing: ['relentless'],
      aesthetic: ['gritty_realism'],
    },
    ...overrides,
  });
}

/**
 * Create a "comfort zone" item — genres the user strongly prefers.
 */
function makeComfortItem(id, overrides = {}) {
  return makeItem(id, {
    genres: [28, 12, 35], // Action, Adventure, Comedy
    tags: ['fast-paced', 'funny'],
    mediaDNA: {
      tropes: ['chosen_one', 'redemption_arc'],
      pacing: ['fast_paced'],
      aesthetic: ['neon_noir'],
    },
    ...overrides,
  });
}

// ===== Tests =====

describe('pickWildcard — Filter Bubble Breaker', () => {
  let app;
  let rec;

  beforeEach(() => {
    app = makeMockApp('en');
    rec = new Recommender(app);
    resetProfile(rec);
  });

  afterEach(() => {
    storageMock.clear();
  });

  // ================================================================
  // BASIC OUTPUT STRUCTURE
  // ================================================================

  describe('Output structure', () => {
    it('should return null when items array is empty', () => {
      const result = rec.pickWildcard([]);
      assert.equal(result, null);
    });

    it('should return null when items has fewer than 3 items', () => {
      const items = [makeItem('a'), makeItem('b')];
      const result = rec.pickWildcard(items);
      assert.equal(result, null);
    });

    it('should return null when items is undefined', () => {
      const result = rec.pickWildcard(undefined);
      assert.equal(result, null);
    });

    it('should return null when items is null', () => {
      const result = rec.pickWildcard(null);
      assert.equal(result, null);
    });
  });

  // ================================================================
  // COLD START (empty profile)
  // ================================================================

  describe('Cold start — empty profile', () => {
    it('should return null on cold start (no genre weights, no structural DNA)', () => {
      // With no genre weights, rareGenres is empty -> all items score -999
      const items = [
        makeItem('a', { genres: [28] }),
        makeItem('b', { genres: [12] }),
        makeItem('c', { genres: [35] }),
      ];
      const result = rec.pickWildcard(items);
      assert.equal(result, null, 'no wildcard on cold start with empty profile');
    });

    it('should try structural matching with genre weights and matching DNA', () => {
      // Set profile with genre weights (even minimal) and structural preferences
      rec.profile.genreWeights = { Action: 8, Horror: -3 };
      rec.profile.tropes.survival = 3;
      rec.profile.pacingStyles.relentless = 2;
      rec.profile.totalSwipes = 10;

      const items = [
        makeItem('a', { genres: [28] }), // Action — common, liked
        makeItem('b', { genres: [28] }), // Action — common
        makeItem('c', { genres: [27], mediaDNA: { tropes: ['survival'], pacing: ['relentless'], aesthetic: [] } }), // Horror (rare) + matching DNA
      ];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null, 'should find a wildcard with structural match');
      if (result) {
        assert.equal(result.wildcard_title, 'Item c', 'should pick the item with rare genre + structural DNA');
      }
    });
  });

  // ================================================================
  // GENRE WEIGHT EDGE CASES
  // ================================================================

  describe('Genre weight edge cases', () => {
    it('should pick an item from a negative-weight genre', () => {
      // User dislikes Horror, likes Action
      rec.profile.genreWeights = { Action: 8, Adventure: 5, Horror: -3 };
      rec.profile.totalSwipes = 10;

      const items = [
        makeComfortItem('comfort1'),
        makeComfortItem('comfort2'),
        makeRareItem('rare1', { genres: [27] }), // Horror
      ];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null, 'should pick a wildcard');
      if (result) {
        assert.equal(result.wildcard_title, 'Item rare1');
        assert.ok(result.actual_genre.toLowerCase().includes('horror'), 'genre should be Horror');
      }
    });

    it('should pick from bottom-quartile genres when none are negative', () => {
      // All positive weights, but some are much lower
      rec.profile.genreWeights = { Action: 10, Adventure: 8, Comedy: 6, Drama: 4, Horror: 1, Romance: 1 };
      rec.profile.tropes.survival = 2;
      rec.profile.totalSwipes = 10;

      const items = [
        makeItem('a', { genres: [28] }), // Action — high weight
        makeItem('b', { genres: [12] }), // Adventure — high weight
        makeItem('c', { genres: [27], mediaDNA: { tropes: ['survival'], pacing: [], aesthetic: [] } }), // Horror — bottom quartile, structural match
      ];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null, 'should pick a wildcard from bottom-quartile genre');
      if (result) {
        assert.equal(result.wildcard_title, 'Item c');
      }
    });

    it('should penalize items in well-liked genres (comfort zone)', () => {
      rec.profile.genreWeights = { Action: 10, Adventure: 8, Horror: -2 };
      rec.profile.totalSwipes = 10;

      const items = [
        makeComfortItem('comfort1'), // Action/Adventure — comfort zone
        makeComfortItem('comfort2'),
        makeRareItem('rare1'), // Horror
      ];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null, 'should not pick a comfort zone item');
      if (result) {
        // Should NOT pick a comfort item despite them being more numerous
        assert.notEqual(result.wildcard_title, 'Item comfort1');
        assert.notEqual(result.wildcard_title, 'Item comfort2');
      }
    });

    it('should handle genre weights with numeric TMDB IDs', () => {
      rec.profile.genreWeights = { Horror: -5, Action: 7 };
      rec.profile.totalSwipes = 10;

      const items = [
        makeItem('a', { genres: [28] }), // Action (TMDB ID 28)
        makeItem('b', { genres: [28] }),
        makeItem('c', { genres: [27] }), // Horror (TMDB ID 27)
      ];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        assert.equal(result.wildcard_title, 'Item c');
      }
    });

    it('should handle game genre names from GAME_GENRE_NAME_MAP', () => {
      rec.profile.genreWeights = { RPG: 5, Simulation: -3 };
      rec.profile.totalSwipes = 10;

      const items = [
        makeItem('a', { type: 'game', source: 'igdb', genres: ['RPG'], tags: [] }),
        makeItem('b', { type: 'game', source: 'igdb', genres: ['RPG'], tags: [] }),
        makeItem('c', { type: 'game', source: 'igdb', genres: ['Simulation'], tags: [] }),
      ];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null, 'should handle game genre names');
      if (result) {
        assert.equal(result.wildcard_title, 'Item c');
      }
    });
  });

  // ================================================================
  // STRUCTURAL DNA MATCHING
  // ================================================================

  describe('Structural DNA matching', () => {
    it('should prefer items sharing tropes with the user profile', () => {
      rec.profile.genreWeights = { Comedy: -2, Action: 5 };
      rec.profile.tropes = { mystery_box: 4, survival: 2 };
      rec.profile.totalSwipes = 10;

      const rareWithMatchingTrope = makeRareItem('match', {
        genres: [35], // Comedy (rare for this user)
        mediaDNA: { tropes: ['mystery_box', 'survival'], pacing: [], aesthetic: [] },
      });
      const rareNoMatch = makeRareItem('nomatch', {
        genres: [35],
        mediaDNA: { tropes: ['love_triangle'], pacing: [], aesthetic: [] },
      });

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), rareWithMatchingTrope, rareNoMatch];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        // Should pick the one with matching tropes, not the one without
        assert.equal(result.wildcard_title, 'Item match');
      }
    });

    it('should prefer items sharing pacing with the user profile', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.pacingStyles = { relentless: 5 };
      rec.profile.totalSwipes = 10;

      const rareWithMatchingPace = makeRareItem('pace', {
        mediaDNA: { tropes: [], pacing: ['relentless'], aesthetic: [] },
      });
      const rareNoMatch = makeRareItem('nopace', {
        mediaDNA: { tropes: [], pacing: ['slow_burn'], aesthetic: [] },
      });

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), rareWithMatchingPace, rareNoMatch];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        assert.equal(result.wildcard_title, 'Item pace');
      }
    });

    it('should prefer items sharing aesthetics with the user profile', () => {
      rec.profile.genreWeights = { Drama: -2, Action: 5 };
      rec.profile.aesthetics = { gritty_realism: 4 };
      rec.profile.totalSwipes = 10;

      const rareWithMatchingAesthetic = makeRareItem('aest', {
        genres: [18], // Drama
        mediaDNA: { tropes: [], pacing: [], aesthetic: ['gritty_realism'] },
      });
      const rareNoMatch = makeRareItem('noaest', {
        genres: [18],
        mediaDNA: { tropes: [], pacing: [], aesthetic: ['neon_noir'] },
      });

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), rareWithMatchingAesthetic, rareNoMatch];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        assert.equal(result.wildcard_title, 'Item aest');
      }
    });

    it('should combine multiple structural signals for higher score', () => {
      rec.profile.genreWeights = { Horror: -5, Action: 5 };
      rec.profile.tropes = { survival: 3, mystery_box: 2 };
      rec.profile.pacingStyles = { relentless: 4 };
      rec.profile.aesthetics = { gritty_realism: 2 };
      rec.profile.totalSwipes = 10;

      const strongMatch = makeRareItem('strong', {
        mediaDNA: {
          tropes: ['survival', 'mystery_box'],
          pacing: ['relentless'],
          aesthetic: ['gritty_realism'],
        },
      });
      const weakMatch = makeRareItem('weak', {
        mediaDNA: {
          tropes: ['love_triangle'],
          pacing: ['slow_burn'],
          aesthetic: ['pastel_dream'],
        },
      });

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), strongMatch, weakMatch];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        assert.equal(result.wildcard_title, 'Item strong');
      }
    });
  });

  // ================================================================
  // OUTPUT FORMAT VALIDATION
  // ================================================================

  describe('Output format compliance', () => {
    it('should return exactly the required JSON fields', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.totalSwipes = 10;

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), makeRareItem('rare1')];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        // Required top-level fields
        assert.equal(typeof result.wildcard_title, 'string');
        assert.ok(result.wildcard_title.length > 0);
        assert.equal(typeof result.wildcard_author, 'string');
        assert.equal(typeof result.actual_genre, 'string');
        assert.ok(result.actual_genre.length > 0);
        assert.ok(result.actual_genre[0] === result.actual_genre[0].toUpperCase(),
          'genre should start with uppercase');

        // revealed_traits structure
        assert.ok(result.revealed_traits, 'revealed_traits should exist');
        assert.equal(typeof result.revealed_traits.mood, 'string');
        assert.ok(result.revealed_traits.mood.length > 0);
        assert.equal(typeof result.revealed_traits.pacing, 'string');
        assert.ok(result.revealed_traits.pacing.length > 0);
        assert.ok(Array.isArray(result.revealed_traits.micro_tropes));
        assert.ok(result.revealed_traits.micro_tropes.length >= 1);

        // Hook
        assert.equal(typeof result.the_hook, 'string');
        assert.ok(result.the_hook.length > 20, 'hook should be substantial');

        // Bridge
        assert.equal(typeof result.the_bridge, 'string');
        assert.ok(result.the_bridge.length > 0);
      }
    });

    it('should produce genre-agnostic hook (no genre keywords)', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.totalSwipes = 10;

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), makeRareItem('rare1')];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        const hook = result.the_hook.toLowerCase();
        // Should NOT mention the genre name
        assert.ok(!hook.includes('horror'), 'hook should not mention horror');
        assert.ok(!hook.includes('sci-fi'), 'hook should not mention sci-fi');
        assert.ok(!hook.includes('fantasy'), 'hook should not mention fantasy');
        assert.ok(!hook.includes('thriller'), 'hook should not mention thriller');
      }
    });

    it('should generate a meaningful bridge explanation mentioning structural overlap', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.pacingStyles = { relentless: 4 };
      rec.profile.tropes = { survival: 3 };
      rec.profile.totalSwipes = 10;

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), makeRareItem('rare1')];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        assert.ok(result.the_bridge.length > 10, 'bridge should be meaningful');
        // Bridge should explain the connection, not just say "because"
        assert.ok(
          result.the_bridge.includes('pace') ||
          result.the_bridge.includes('tempo') ||
          result.the_bridge.includes('storytelling') ||
          result.the_bridge.includes('theme') ||
          result.the_bridge.includes('DNA') ||
          result.the_bridge.includes('familiar'),
          'bridge should explain the structural connection'
        );
      }
    });
  });

  // ================================================================
  // BILINGUAL OUTPUT (German)
  // ================================================================

  describe('German locale (de)', () => {
    it('should generate German hook when lang is de', () => {
      const deApp = makeMockApp('de');
      const deRec = new Recommender(deApp);
      resetProfile(deRec);
      deRec.profile.genreWeights = { Horror: -3, Action: 5 };
      deRec.profile.totalSwipes = 10;

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), makeRareItem('rare1')];
      const result = deRec.pickWildcard(items);
      assert.ok(result !== null, 'should find wildcard for de locale');
      if (result) {
        // The hook should be in German or at least not contain English-specific undefined references
        assert.ok(result.the_hook.length > 0);
        assert.ok(!result.the_hook.includes('undefined'), 'no undefined in hook');
      }
    });

    it('should generate German bridge when lang is de', () => {
      const deApp = makeMockApp('de');
      const deRec = new Recommender(deApp);
      resetProfile(deRec);
      deRec.profile.genreWeights = { Horror: -3, Action: 5 };
      deRec.profile.pacingStyles = { relentless: 4 };
      deRec.profile.totalSwipes = 10;

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), makeRareItem('rare1')];
      const result = deRec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        assert.ok(result.the_bridge.length > 0);
        assert.ok(!result.the_bridge.includes('undefined'), 'no undefined in bridge');
      }
    });

    it('should output mood and pacing in German for de locale', () => {
      const deApp = makeMockApp('de');
      const deRec = new Recommender(deApp);
      resetProfile(deRec);
      deRec.profile.genreWeights = { Horror: -3, Action: 5 };
      deRec.profile.totalSwipes = 10;

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), makeRareItem('rare1')];
      const result = deRec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        // German mode should produce descriptions that don't look like English placeholders
        assert.ok(!result.revealed_traits.mood.includes('undefined'));
        assert.ok(!result.revealed_traits.pacing.includes('undefined'));
      }
    });
  });

  // ================================================================
  // EDGE CASES — NULL / MISSING FIELDS
  // ================================================================

  describe('Null / missing fields', () => {
    it('should not crash with null mediaDNA items', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.totalSwipes = 10;

      const items = [
        makeComfortItem('c1'),
        makeComfortItem('c2'),
        makeRareItem('rare1', { mediaDNA: null }),
      ];
      assert.doesNotThrow(() => rec.pickWildcard(items), 'should not throw with null mediaDNA');
    });

    it('should not crash with undefined mediaDNA items', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.totalSwipes = 10;

      const items = [
        makeComfortItem('c1'),
        makeComfortItem('c2'),
        makeRareItem('rare1'),
      ];
      delete items[2].mediaDNA;
      assert.doesNotThrow(() => rec.pickWildcard(items), 'should not throw with undefined mediaDNA');
    });

    it('should not crash with null tags', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.totalSwipes = 10;

      const items = [
        makeComfortItem('c1'),
        makeComfortItem('c2'),
        makeRareItem('rare1', { tags: null }),
      ];
      assert.doesNotThrow(() => rec.pickWildcard(items), 'should not throw with null tags');
    });

    it('should not crash with null genres', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.totalSwipes = 10;

      const items = [
        makeComfortItem('c1'),
        makeComfortItem('c2'),
        makeItem('rare1', { genres: null }),
      ];
      assert.doesNotThrow(() => rec.pickWildcard(items), 'should not throw with null genres');
    });

    it('should work with items missing author field', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.totalSwipes = 10;

      const items = [
        makeComfortItem('c1'),
        makeComfortItem('c2'),
        makeRareItem('rare1'),
      ];
      delete items[2].author;
      const result = rec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        assert.equal(typeof result.wildcard_author, 'string', 'author should be a string even when missing');
      }
    });

    it('should not crash with empty genres array', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.totalSwipes = 10;

      const items = [
        makeComfortItem('c1'),
        makeComfortItem('c2'),
        makeItem('rare1', { genres: [] }),
      ];
      assert.doesNotThrow(() => rec.pickWildcard(items), 'should not throw with empty genres');
    });

    it('should handle items with very long titles', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.totalSwipes = 10;

      const longTitle = 'A'.repeat(500);
      const items = [
        makeComfortItem('c1'),
        makeComfortItem('c2'),
        makeRareItem('rare1', { title: longTitle }),
      ];
      const result = rec.pickWildcard(items);
      assert.ok(result !== null);
      if (result) {
        assert.equal(result.wildcard_title, longTitle);
        assert.ok(result.the_hook.length > 0);
      }
    });
  });

  // ================================================================
  // NO CANDIDATE SCENARIOS
  // ================================================================

  describe('No candidate scenarios', () => {
    it('should return null when all items are comfort zone (no rare genres)', () => {
      rec.profile.genreWeights = { Action: 10, Adventure: 8 };
      rec.profile.totalSwipes = 10;

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), makeComfortItem('c3')];
      const result = rec.pickWildcard(items);
      assert.equal(result, null, 'no wildcard when all items are comfort zone');
    });

    it('should not crash when rare items have no structural DNA overlap', () => {
      rec.profile.genreWeights = { Horror: -3, Action: 5 };
      rec.profile.tropes = { chosen_one: 3 };
      rec.profile.pacingStyles = { fast_paced: 4 };
      rec.profile.totalSwipes = 10;

      // Rare items but with completely different structural DNA
      const rareNoMatch = makeRareItem('rare1', {
        mediaDNA: { tropes: ['love_triangle'], pacing: ['slow_burn'], aesthetic: ['cottagecore'] },
      });

      const items = [makeComfortItem('c1'), makeComfortItem('c2'), rareNoMatch];
      // May or may not pick the rare item (rareGenre bonus alone might win), verify no crash
      assert.doesNotThrow(() => rec.pickWildcard(items), 'should not crash');
    });

    it('should return null when all items are from the same genre and user has no preferences', () => {
      rec.profile.genreWeights = {};
      rec.profile.totalSwipes = 0;

      const items = [
        makeItem('a', { genres: [28] }),
        makeItem('b', { genres: [28] }),
        makeItem('c', { genres: [28] }),
      ];
      const result = rec.pickWildcard(items);
      assert.equal(result, null, 'no wildcard when all items are same genre with no preferences');
    });
  });

  // ================================================================
  // STABILITY & DETERMINISM
  // ================================================================

  describe('Stability', () => {
    it('should not throw for any combination of inputs', () => {
      // Run a variety of inputs to verify no crashes
      rec.profile.genreWeights = { Action: 5, Horror: -2 };
      rec.profile.tropes = { survival: 2 };
      rec.profile.totalSwipes = 10;

      const inputs = [
        [],
        [makeItem('a')],
        [makeItem('a'), makeItem('b')],
        [makeItem('a'), makeItem('b'), makeItem('c')],
        [makeComfortItem('c1'), makeComfortItem('c2'), makeRareItem('r1')],
        [makeComfortItem('c1'), makeComfortItem('c2'), makeRareItem('r1'), makeRareItem('r2'), makeRareItem('r3')],
        [makeItem('a', { genres: null }), makeItem('b', { genres: null }), makeItem('c', { genres: null })],
        [makeItem('a', { mediaDNA: null }), makeItem('b', { mediaDNA: null }), makeItem('c', { mediaDNA: null })],
      ];

      for (const items of inputs) {
        assert.doesNotThrow(() => rec.pickWildcard(items), `should not throw for ${items.length} items`);
      }
    });
  });
});
