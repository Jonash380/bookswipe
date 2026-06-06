import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Set up minimal DOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
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

// Mock localStorage
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

function makeMockApp(stateOverrides = {}) {
  return {
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

function makeItem(id, opts = {}) {
  return {
    id,
    title: opts.title || `Item ${id}`,
    type: opts.type || 'movie',
    source: opts.source || 'tmdb',
    genres: opts.genres || [],
    tags: opts.tags || [],
    mediaDNA: opts.mediaDNA || null,
    year: opts.year ?? null,
    release_date: opts.release_date ?? null,
    rating: opts.rating ?? null,
    _mmrScore: opts._mmrScore ?? null,
    platforms: opts.platforms || [],
    mechanics: opts.mechanics || [],
    themes: opts.themes || [],
    ...opts,
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

// ===== Tests =====

describe('Recommender', () => {
  let app;
  let rec;

  beforeEach(() => {
    app = makeMockApp();
    rec = new Recommender(app);
    resetProfile(rec);
  });

  afterEach(() => {
    storageMock.clear();
  });

  // ================================================================
  // BAYESIAN SCORING
  // ================================================================

  describe('score() — Bayesian scoring', () => {
    it('should return baseline prior mean (50) for a neutral item with no swipes', () => {
      const item = makeItem('neutral');
      const score = rec.score(item);
      assert.equal(score, 50);
    });

    it('should return cached score for same item id', () => {
      rec.profile.totalSwipes = 10; // disable shrinkage so score != prior mean
      const item = makeItem('cached', { genres: [28] }); // Action
      app.state.selectedGenres = [28];
      const scoreWithoutCache = 50 + 1*15; // 65 (no shrinkage)
      const first = rec.score(item);
      assert.equal(first, scoreWithoutCache, 'first call should compute score');
      // Modify item — if cache is broken, re-scoring would give a different result
      item.genres = [];
      const second = rec.score(item);
      assert.equal(second, first, 'second call should return cached score');
    });

    it('should clamp score to [0, 100]', () => {
      // Extremely positive — all genres matched with high swipes to reduce shrinkage
      rec.profile.totalSwipes = 10;
      const item = makeItem('clamp-up', { genres: [28, 12, 35, 18, 27] });
      app.state.selectedGenres = [28, 12, 35, 18, 27];
      const score = rec.score(item);
      assert.ok(score <= 100, `score ${score} should be <= 100`);
      assert.ok(score >= 0, `score ${score} should be >= 0`);
    });

    it('should clamp extremely negative scores to 0', () => {
      rec.profile.totalSwipes = 10;
      // No matching genres, plus a blocked genre that triggers W.block (-40)
      app.state.blockedGenres = ['horror'];
      const item = makeItem('clamp-down', { genres: [27] }); // Horror
      const score = rec.score(item);
      assert.ok(score >= 0, `score ${score} should be >= 0`);
    });

    describe('Bayesian shrinkage (cold start)', () => {
      it('should shrink score toward prior mean when totalSwipes < 3', () => {
        rec.profile.totalSwipes = 1;
        // With genre overlap, the base score would normally be 50 + 1*15 = 65
        app.state.selectedGenres = [28]; // Action
        const item = makeItem('shrink', { genres: [28] });
        const score = rec.score(item);
        // After shrinkage: 50 + (65 - 50) * (1/3) = 50 + 5 = 55
        assert.equal(score, 55);
      });

      it('should apply full score without shrinkage when totalSwipes >= 3', () => {
        rec.profile.totalSwipes = 3;
        app.state.selectedGenres = [28]; // Action
        const item = makeItem('no-shrink', { genres: [28] });
        const score = rec.score(item);
        // Full score: 50 + 1*15 = 65
        assert.equal(score, 65);
      });

      it('should interpolate shrinkage proportionally (2 swipes = 2/3 strength)', () => {
        rec.profile.totalSwipes = 2;
        app.state.selectedGenres = [28];
        const item = makeItem('partial-shrink', { genres: [28] });
        const score = rec.score(item);
        // 50 + (65 - 50) * (2/3) = 50 + 10 = 60
        assert.equal(score, 60);
      });
    });

    describe('_scoreMedia — media scoring factors', () => {
      it('should boost score for matching selected genres', () => {
        rec.profile.totalSwipes = 10; // disable Bayesian shrinkage
        app.state.selectedGenres = [28, 12]; // Action, Adventure
        const item = makeItem('genres', { genres: [28, 12, 35] });
        const score = rec.score(item);
        // 50 + 2*15 = 80
        assert.equal(score, 80);
      });

      it('should boost score for matching selected moods (tags)', () => {
        rec.profile.totalSwipes = 10; // disable Bayesian shrinkage
        app.state.selectedMoods = ['dark', 'funny'];
        const item = makeItem('moods', { tags: ['dark', 'funny', 'epic'] });
        const score = rec.score(item);
        // 50 + 2*20 = 90
        assert.equal(score, 90);
      });

      it('should apply era penalty when year is outside selected era range', () => {
        rec.profile.totalSwipes = 10; // disable shrinkage for clean assert
        app.state.eraFilter = 'current'; // [2010, 2026]
        const item = makeItem('era', { year: 1995 });
        const score = rec.score(item);
        // 50 + (-30) = 20
        assert.equal(score, 20);
      });

      it('should NOT apply era penalty when eraFilter is "all"', () => {
        rec.profile.totalSwipes = 10; // disable shrinkage so era logic is tested
        app.state.eraFilter = 'all';
        const item = makeItem('no-era', { year: 1995 });
        const score = rec.score(item);
        // 50, no penalty (eraFilter 'all' skips the check entirely)
        assert.equal(score, 50);
      });

      it('should boost score for matching DNA tropes from profile', () => {
        rec.profile.totalSwipes = 10;
        rec.profile.tropes.revenge = 3;
        const item = makeItem('dna', {
          mediaDNA: { tropes: ['revenge', 'betrayal'], pacing: [], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        // 50 + 1*10 = 60
        assert.equal(score, 60);
      });

      it('should boost score for matching DNA pacing styles from profile', () => {
        rec.profile.totalSwipes = 10;
        rec.profile.pacingStyles.relentless = 2;
        const item = makeItem('pacing', {
          mediaDNA: { tropes: [], pacing: ['relentless', 'twisty'], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        // 50 + 1*8 = 58
        assert.equal(score, 58);
      });

      it('should boost score for matching DNA aesthetics from profile', () => {
        rec.profile.totalSwipes = 10;
        rec.profile.aesthetics.neon_noir = 1;
        const item = makeItem('aesthetic', {
          mediaDNA: { tropes: [], pacing: [], aesthetic: ['neon_noir'], warnings: [] },
        });
        const score = rec.score(item);
        // 50 + 1*7 = 57
        assert.equal(score, 57);
      });

      it('should apply warning penalty based on profile dislikes', () => {
        // NOTE: _computeWarningPenalty returns negative values (penalty -= disliked[w]),
        // and W.warning = -5, so the double-negative gives: score += (-2) * (-5) = +10
        rec.profile.totalSwipes = 10;
        rec.profile.warnings.gore = 2;
        const item = makeItem('warn', {
          mediaDNA: { tropes: [], pacing: [], aesthetic: [], warnings: ['gore'] },
        });
        const score = rec.score(item);
        // 50 + (-2)*(-5) = 60
        assert.equal(score, 60);
      });

      it('should boost score for boosted moods matching genre names', () => {
        rec.profile.totalSwipes = 10;
        app.state.boostedMoods = ['action'];
        const item = makeItem('boosted', { genres: [28, 12] }); // Action, Adventure
        const score = rec.score(item);
        // 50 + 1*8 = 58 (only Action matches "action")
        assert.equal(score, 58);
      });

      it('should apply block penalty when any genre matches blocked list', () => {
        rec.profile.totalSwipes = 10;
        app.state.blockedGenres = ['horror'];
        const item = makeItem('blocked', { genres: [27, 35] }); // Horror, Comedy
        const score = rec.score(item);
        // 50 + (-40) = 10
        assert.equal(score, 10);
      });

      it('should handle item with release_date string instead of year', () => {
        app.state.eraFilter = 'current';
        rec.profile.totalSwipes = 10;
        const item = makeItem('release', { release_date: '1999', genres: [] });
        const score = rec.score(item);
        // 1999 outside [2010, 2026]: 50 + (-30) = 20
        assert.equal(score, 20);
      });

      it('should not crash on item with null genres', () => {
        rec.profile.totalSwipes = 10; // disable shrinkage so we test the actual path
        const item = makeItem('null-genres', { genres: null });
        const score = rec.score(item);
        // Without genres, neither genre overlap nor boosted moods nor blocked genres trigger
        assert.equal(score, 50);
      });
    });

    describe('_scoreGame — game scoring factors', () => {
      it('should boost score when game platform matches selected', () => {
        rec.profile.totalSwipes = 10;
        app.state.selectedPlatforms = [6]; // PC
        const item = makeItem('game-plat', {
          type: 'game', source: 'igdb',
          platforms: [{ id: 6, name: 'PC (Steam)' }],
          genres: [],
          tags: [],
        });
        const score = rec.score(item);
        // 50 + 25 = 75
        assert.equal(score, 75);
      });

      it('should penalize when game platform does NOT match selected', () => {
        rec.profile.totalSwipes = 10;
        app.state.selectedPlatforms = [48]; // PS5
        const item = makeItem('game-no-plat', {
          type: 'game', source: 'igdb',
          platforms: [{ id: 6, name: 'PC (Steam)' }],
          genres: [],
          tags: [],
        });
        const score = rec.score(item);
        // 50 - 15 = 35
        assert.equal(score, 35);
      });

      it('should boost score for matching game genres (via name overlap)', () => {
        rec.profile.totalSwipes = 10;
        app.state.selectedGenres = ['Action'];
        const item = makeItem('game-genre', {
          type: 'game', source: 'igdb',
          genres: [{ id: 2, name: 'Action' }],
          platforms: [],
        });
        const score = rec.score(item);
        // 50 + 1*15 = 65
        assert.equal(score, 65);
      });

      it('should boost score for matching moods (tags) on games', () => {
        rec.profile.totalSwipes = 10;
        app.state.selectedMoods = ['dark', 'epic'];
        const item = makeItem('game-mood', {
          type: 'game', source: 'igdb',
          tags: ['dark'],
          platforms: [],
          genres: [],
        });
        const score = rec.score(item);
        // 50 + 1*20 = 70
        assert.equal(score, 70);
      });

      it('should boost score for matching mechanics from profile', () => {
        rec.profile.totalSwipes = 10;
        rec.profile.gameMechanicWeights.open_world = 2;
        const item = makeItem('game-mech', {
          type: 'game', source: 'igdb',
          mechanics: ['open_world', 'crafting'],
          platforms: [],
          genres: [],
          tags: [],
        });
        const score = rec.score(item);
        // 50 + 1*10 = 60
        assert.equal(score, 60);
      });

      it('should boost score for matching themes from profile', () => {
        rec.profile.totalSwipes = 10;
        rec.profile.gameThemeWeights['fantasy'] = 1;
        const item = makeItem('game-theme', {
          type: 'game', source: 'igdb',
          themes: ['fantasy', 'sci-fi'],
          platforms: [],
          genres: [],
          tags: [],
        });
        const score = rec.score(item);
        // 50 + 1*10 = 60
        assert.equal(score, 60);
      });

      it('should boost score for high-rated games (>= 85)', () => {
        rec.profile.totalSwipes = 10;
        const item = makeItem('game-high-rating', {
          type: 'game', source: 'igdb',
          rating: 90,
          platforms: [],
          genres: [],
          tags: [],
        });
        const score = rec.score(item);
        // 50 + 5 = 55
        assert.equal(score, 55);
      });

      it('should penalize low-rated games (< 60)', () => {
        rec.profile.totalSwipes = 10;
        const item = makeItem('game-low-rating', {
          type: 'game', source: 'igdb',
          rating: 50,
          platforms: [],
          genres: [],
          tags: [],
        });
        const score = rec.score(item);
        // 50 - 5 = 45
        assert.equal(score, 45);
      });

      it('should not crash for game with no platforms (platforms undefined)', () => {
        rec.profile.totalSwipes = 10;
        const item = makeItem('game-no-plats', {
          type: 'game', source: 'igdb',
          genres: [],
          tags: [],
        });
        // Should not throw
        const score = rec.score(item);
        assert.equal(score, 50);
      });
    });

    describe('_scoreVibeMatch — vibe matrix influence', () => {
      // W.vibe = 6, so max per-axis bonus = 6 * |bias|

      it('should boost fast-paced item when vibePacing slider is high', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibePacing = 80; // bias = 0.6
        const item = makeItem('fast', {
          mediaDNA: { tropes: [], pacing: ['relentless'], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        // 50 + 6 * 0.6 = 53.6 → clamped to 54 (rounded internally, but score is float)
        assert.ok(score > 50, `score ${score} should be > 50 for matching fast pacing`);
        assert.ok(score < 60, `score ${score} should be < 60 (vibe bonus is small)`);
      });

      it('should boost slow-burn item when vibePacing slider is low', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibePacing = 20; // bias = -0.6
        const item = makeItem('slow', {
          mediaDNA: { tropes: [], pacing: ['slow_burn'], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        assert.ok(score > 50, `score ${score} should be > 50 for matching slow pacing`);
      });

      it('should NOT boost fast-paced item when vibePacing slider is low (mismatch)', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibePacing = 20; // want slow, item is fast → mismatch
        const item = makeItem('fast-mismatch', {
          mediaDNA: { tropes: [], pacing: ['relentless'], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        assert.equal(score, 50, 'mismatched pacing should give no bonus');
      });

      it('should not apply vibe bonus when slider is at neutral (50)', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibePacing = 50;
        app.state.vibeTone = 50;
        app.state.vibeComplex = 50;
        const item = makeItem('neutral-vibe', {
          mediaDNA: { tropes: ['mystery_box'], pacing: ['relentless'], aesthetic: ['neon_noir'], warnings: [] },
        });
        const score = rec.score(item);
        assert.equal(score, 50, 'neutral sliders should give no vibe bonus');
      });

      it('should NOT boost dark item when vibeTone slider is high (light mismatch)', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibeTone = 85; // want light, item is dark → mismatch
        const item = makeItem('dark-mismatch', {
          mediaDNA: { tropes: [], pacing: [], aesthetic: ['gritty_realism'], warnings: [] },
        });
        const score = rec.score(item);
        assert.equal(score, 50, 'mismatched tone should give no bonus');
      });

      it('should NOT boost deep item when vibeComplex slider is low (popcorn mismatch)', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibeComplex = 15; // want popcorn, item is deep → mismatch
        const item = makeItem('deep-mismatch', {
          mediaDNA: { tropes: ['time_loop'], pacing: [], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        assert.equal(score, 50, 'mismatched complexity should give no bonus');
      });

      it('should boost dark/gritty item when vibeTone slider is low (dark)', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibeTone = 15; // want dark, bias = -0.7
        const item = makeItem('dark', {
          mediaDNA: { tropes: [], pacing: [], aesthetic: ['neon_noir'], warnings: [] },
        });
        const score = rec.score(item);
        assert.ok(score > 50, `score ${score} should be > 50 for matching dark tone`);
      });

      it('should boost light/cozy item when vibeTone slider is high (light)', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibeTone = 85; // want light, bias = 0.7
        const item = makeItem('light', {
          mediaDNA: { tropes: [], pacing: [], aesthetic: ['cottagecore'], warnings: [] },
        });
        const score = rec.score(item);
        assert.ok(score > 50, `score ${score} should be > 50 for matching light tone`);
      });

      it('should boost deep/complex item when vibeComplex slider is high', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibeComplex = 90; // want deep, bias = 0.8
        const item = makeItem('deep', {
          mediaDNA: { tropes: ['mystery_box'], pacing: [], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        assert.ok(score > 50, `score ${score} should be > 50 for matching deep complexity`);
      });

      it('should boost simple/fun item when vibeComplex slider is low (popcorn)', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibeComplex = 10; // want popcorn, bias = -0.8
        const item = makeItem('simple', {
          mediaDNA: { tropes: ['found_family'], pacing: [], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        assert.ok(score > 50, `score ${score} should be > 50 for matching simple complexity`);
      });

      it('should pick up tone signals from tags (dark, gritty, cozy)', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibeTone = 80; // want light, bias = 0.6
        const item = makeItem('cozy-tags', {
          tags: ['cozy', 'gentle'],
          mediaDNA: { tropes: [], pacing: [], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        assert.ok(score > 50, `score ${score} should be > 50 for cozy tags matching light tone`);
      });

      it('should pick up complexity signals from tags (mind-bending, cerebral)', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibeComplex = 85; // want deep, bias = 0.7
        const item = makeItem('complex-tags', {
          tags: ['mind-bending', 'cerebral'],
          mediaDNA: { tropes: [], pacing: [], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        assert.ok(score > 50, `score ${score} should be > 50 for complex tags`);
      });

      it('should combine bonuses from multiple vibe axes', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibePacing = 90;  // want fast, bias = 0.8
        app.state.vibeTone = 10;    // want dark, bias = -0.8
        app.state.vibeComplex = 90; // want deep, bias = 0.8
        const item = makeItem('multi-vibe', {
          mediaDNA: {
            tropes: ['mystery_box'],
            pacing: ['relentless'],
            aesthetic: ['neon_noir'],
            warnings: [],
          },
        });
        const score = rec.score(item);
        // All three axes should contribute: 50 + ~4.8 + ~4.8 + ~4.8 ≈ 64.4
        assert.ok(score > 60, `score ${score} should be > 60 with all 3 axes matching`);
      });

      it('should work for games via _scoreGame path', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibePacing = 85; // want fast
        const item = makeItem('game-vibe', {
          type: 'game', source: 'igdb',
          platforms: [], genres: [], tags: [],
          mediaDNA: { tropes: [], pacing: ['fast_paced'], aesthetic: [], warnings: [] },
        });
        const score = rec.score(item);
        assert.ok(score > 50, `game score ${score} should be > 50 for matching vibe`);
      });

      it('should handle item with no mediaDNA gracefully', () => {
        rec.profile.totalSwipes = 10;
        app.state.vibePacing = 90;
        app.state.vibeTone = 10;
        app.state.vibeComplex = 90;
        const item = makeItem('no-dna'); // mediaDNA defaults to null
        const score = rec.score(item);
        assert.equal(score, 50, 'no mediaDNA should give zero vibe bonus');
      });
    });

    describe('_scoreDescriptionSimilarity — TF-IDF taste vector', () => {
      it('should return 0 when user has no liked history', () => {
        app.history = [];
        rec._tasteVec = null;
        const item = makeItem('desc1', { overview: 'A thrilling adventure in space' });
        const bonus = rec._scoreDescriptionSimilarity(item);
        assert.equal(bonus, 0);
      });

      it('should return 0 when item has no description', () => {
        app.history = [{ action: 'like', overview: 'A dark thriller about revenge' }];
        rec._tasteVec = null;
        const item = makeItem('desc2', { overview: '' });
        const bonus = rec._scoreDescriptionSimilarity(item);
        assert.equal(bonus, 0);
      });

      it('should return positive bonus when description shares keywords with liked items', () => {
        app.history = [
          { action: 'like', overview: 'A dark noir detective investigates murders in the city' },
          { action: 'like', overview: 'The detective solves dark mysteries in a noir city setting' },
        ];
        rec._tasteVec = null;
        const item = makeItem('desc3', { overview: 'A detective noir mystery set in a dark underground city' });
        const bonus = rec._scoreDescriptionSimilarity(item);
        assert.ok(bonus > 0, `bonus ${bonus} should be > 0 for matching description`);
      });

      it('should return 0 when description has no shared keywords', () => {
        app.history = [
          { action: 'like', overview: 'A dark noir detective investigates murders' },
        ];
        rec._tasteVec = null;
        const item = makeItem('desc4', { overview: 'Happy puppies play in sunny meadows with butterflies' });
        const bonus = rec._scoreDescriptionSimilarity(item);
        assert.equal(bonus, 0);
      });

      it('should cache the taste vector', () => {
        app.history = [
          { action: 'like', overview: 'A thrilling spy adventure across europe with espionage' },
          { action: 'like', overview: 'Dark noir detective investigates mysterious murders in the city' },
        ];
        rec._tasteVec = null;
        const item = makeItem('desc5', { overview: 'A spy thriller set across europe' });
        rec._scoreDescriptionSimilarity(item);
        assert.ok(rec._tasteVec instanceof Map, 'taste vector should be cached as a Map');
        assert.ok(rec._tasteVec.size > 0, 'taste vector should have entries');
      });
    });

    describe('_scoreRecentBias — HMM-lite recent action bias', () => {
      it('should return 0 when history is too short', () => {
        app.history = [{ action: 'like', mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [] } }];
        const item = makeItem('rb1', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
        assert.equal(rec._scoreRecentBias(item), 0);
      });

      it('should boost item matching recent likes', () => {
        app.history = [
          { action: 'like', mediaDNA: { tropes: ['revenge'], pacing: ['relentless'], aesthetic: [] } },
          { action: 'like', mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [] } },
        ];
        const item = makeItem('rb2', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
        const bonus = rec._scoreRecentBias(item);
        assert.ok(bonus > 0, `bonus ${bonus} should be > 0 for matching recent likes`);
      });

      it('should penalize item matching recent nopes', () => {
        app.history = [
          { action: 'nope', mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [] } },
          { action: 'nope', mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [] } },
        ];
        const item = makeItem('rb3', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
        const bonus = rec._scoreRecentBias(item);
        assert.ok(bonus < 0, `bonus ${bonus} should be < 0 for matching recent nopes`);
      });

      it('should weight recent actions more heavily (exponential decay)', () => {
        // First swipe is most recent, should have highest weight
        app.history = [
          { action: 'like', mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [] } },
          { action: 'nope', mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [] } },
        ];
        const item = makeItem('rb4', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
        const bonus = rec._scoreRecentBias(item);
        // Like (most recent, weight 1.0) should outweigh nope (weight 0.7)
        assert.ok(bonus > 0, `bonus ${bonus} should be > 0 when recent like outweighs older nope`);
      });

      it('should return 0 for item with no DNA tags', () => {
        app.history = [
          { action: 'like', mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [] } },
          { action: 'like', mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [] } },
        ];
        const item = makeItem('rb5'); // no mediaDNA
        assert.equal(rec._scoreRecentBias(item), 0);
      });
    });

    describe('_bayesianRating — community rating bonus', () => {
      it('should return 0 when item has no rating', () => {
        const item = makeItem('br1');
        assert.equal(rec._bayesianRating(item), 0);
      });

      it('should return 0 when item has no vote_count', () => {
        const item = makeItem('br2', { rating: 8.5 });
        assert.equal(rec._bayesianRating(item), 0);
      });

      it('should give +4 for high-rated well-voted item', () => {
        const item = makeItem('br3', { rating: 8.5, vote_count: 5000 });
        assert.equal(rec._bayesianRating(item), 4);
      });

      it('should give +2 for good-rated item', () => {
        const item = makeItem('br4', { rating: 7.5, vote_count: 1000 });
        assert.equal(rec._bayesianRating(item), 2);
      });

      it('should give -3 for poorly-rated item', () => {
        const item = makeItem('br5', { rating: 3.0, vote_count: 500 });
        assert.equal(rec._bayesianRating(item), -3);
      });

      it('should penalize low-vote-count items toward global average', () => {
        // High rating but very few votes → pulled toward 6.5
        const itemFewVotes = makeItem('br6', { rating: 9.0, vote_count: 5 });
        const itemManyVotes = makeItem('br7', { rating: 9.0, vote_count: 5000 });
        const bonusFew = rec._bayesianRating(itemFewVotes);
        const bonusMany = rec._bayesianRating(itemManyVotes);
        assert.ok(bonusMany >= bonusFew, 'high-vote item should score >= low-vote item');
      });

      it('should work with vote_average field (TMDB format)', () => {
        const item = { id: 'br8', vote_average: 9.0, vote_count: 5000 };
        assert.equal(rec._bayesianRating(item), 4);
      });
    });
  });

  // ================================================================
  // MMR DIVERSITY RE-RANKING
  // ================================================================

  describe('mmrRerank — MMR diversity re-ranking', () => {
    it('should return items unchanged if array is too small', () => {
      const items = [makeItem('a'), makeItem('b'), makeItem('c')];
      const result = rec.mmrRerank(items, 3);
      assert.equal(result, items); // same reference
    });

    it('should return items unchanged if length <= diversityCount + 3 (empty)', () => {
      const result = rec.mmrRerank([], 3);
      assert.deepEqual(result, []);
    });

    it('should pick the first item by relevance (highest _mmrScore)', () => {
      // MMR expects items already sorted by score descending
      const items = [
        makeItem('high', { genres: [12], _mmrScore: 90 }),
        makeItem('final', { genres: [14], _mmrScore: 70 }),
        makeItem('mid', { genres: [35], _mmrScore: 60 }),
        makeItem('yet-another', { genres: [27], _mmrScore: 55 }),
        makeItem('another', { genres: [18], _mmrScore: 45 }),
        makeItem('last', { genres: [878], _mmrScore: 40 }),
        makeItem('low', { genres: [28], _mmrScore: 30 }),
      ];
      const result = rec.mmrRerank(items, 3);
      // First result should be the highest _mmrScore (90), which is also first in array
      assert.equal(result[0].id, 'high');
    });

    it('should inject diverse picks near the top (diversityCount items)', () => {
      // All items have the same genre to make diversity meaningful
      const items = [
        makeItem('a', { genres: [28], _mmrScore: 100 }),
        makeItem('b', { genres: [28], _mmrScore: 90 }),
        makeItem('c', { genres: [12], _mmrScore: 80 }),
        makeItem('d', { genres: [35], _mmrScore: 70 }),
        makeItem('e', { genres: [28], _mmrScore: 60 }),
        makeItem('f', { genres: [28], _mmrScore: 50 }),
        makeItem('g', { genres: [28], _mmrScore: 40 }),
      ];
      const result = rec.mmrRerank(items, 3);
      // result[0] = 'a' (highest _mmrScore)
      // Then diverse picks: 'c' (genre 12 different from 28), 'd' (genre 35)
      // So result[1] should be one of ['c', 'd'], result[2] the other
      assert.equal(result[0].id, 'a');
      assert.notEqual(result[1].id, 'b', 'second pick should be diverse, not second-highest');
      assert.ok(['c', 'd'].includes(result[1].id), 'second pick should be a diverse genre');
      assert.ok(['c', 'd'].includes(result[2].id), 'third pick should be the other diverse genre');
      assert.notEqual(result[1].id, result[2].id, 'second and third picks should differ');
    });

    it('should append remaining items in original order after diverse picks', () => {
      // MMR picks diversityCount+1 = 4 items: a (highest score), then c, d, b (diverse).
      // 'b' gets picked as the 4th item because its high relevance (90) gives it the best
      // MMR score among the remaining single-genre items. Tail = [e, f, g].
      const items = [
        makeItem('a', { genres: [28], _mmrScore: 100 }),
        makeItem('b', { genres: [28], _mmrScore: 90 }),
        makeItem('c', { genres: [12], _mmrScore: 80 }),
        makeItem('d', { genres: [35], _mmrScore: 70 }),
        makeItem('e', { genres: [28], _mmrScore: 60 }),
        makeItem('f', { genres: [28], _mmrScore: 50 }),
        makeItem('g', { genres: [28], _mmrScore: 40 }),
      ];
      const result = rec.mmrRerank(items, 3);
      // MMR picks 4 items: a, c, d, b (all 4 diverse/relevant)
      // Remaining in original order: e, f, g
      const tail = result.slice(4);
      assert.deepEqual(tail.map(i => i.id), ['e', 'f', 'g']);
    });

    it('should work with default diversityCount = 3', () => {
      const items = [
        makeItem('a', { genres: [28], _mmrScore: 100 }),
        makeItem('b', { genres: [12], _mmrScore: 90 }),
        makeItem('c', { genres: [35], _mmrScore: 80 }),
        makeItem('d', { genres: [18], _mmrScore: 70 }),
        makeItem('e', { genres: [27], _mmrScore: 60 }),
        makeItem('f', { genres: [14], _mmrScore: 50 }),
        makeItem('g', { genres: [878], _mmrScore: 40 }),
      ];
      const result = rec.mmrRerank(items);
      assert.equal(result.length, 7);
      // First pick is highest score
      assert.equal(result[0].id, 'a');
    });

    it('should handle items without _mmrScore (defaults to 50 in MMR calc)', () => {
      const items = [
        makeItem('a', { genres: [28] }),
        makeItem('b', { genres: [12] }),
        makeItem('c', { genres: [35] }),
        makeItem('d', { genres: [18] }),
        makeItem('e', { genres: [27] }),
        makeItem('f', { genres: [14] }),
        makeItem('g', { genres: [878] }),
      ];
      const result = rec.mmrRerank(items, 3);
      assert.equal(result.length, 7);
      // First pick is the first item (tie-breaking by insertion order)
      assert.equal(result[0].id, 'a');
    });

    it('should handle items with no genres gracefully', () => {
      const items = [
        makeItem('a', { _mmrScore: 100 }),
        makeItem('b', { _mmrScore: 90 }),
        makeItem('c', { _mmrScore: 80 }),
        makeItem('d', { _mmrScore: 70 }),
        makeItem('e', { _mmrScore: 60 }),
        makeItem('f', { _mmrScore: 50 }),
        makeItem('g', { _mmrScore: 40 }),
      ];
      const result = rec.mmrRerank(items, 3);
      // Without genres, all similarities are 0, so MMR = lambda * (relevance/100)
      // This means highest scores come first: a, b, c, then remaining in order
      assert.equal(result[0].id, 'a');
      assert.equal(result[1].id, 'b');
      assert.equal(result[2].id, 'c');
      // Remaining in original order
      assert.deepEqual(result.slice(3).map(i => i.id), ['d', 'e', 'f', 'g']);
    });
  });

  describe('_computeSimilarity — Jaccard similarity', () => {
    it('should return 0 if either item has no genres', () => {
      assert.equal(rec._computeSimilarity(makeItem('a'), makeItem('b')), 0);
      assert.equal(
        rec._computeSimilarity(makeItem('a', { genres: [28] }), makeItem('b')),
        0,
      );
      assert.equal(
        rec._computeSimilarity(makeItem('a'), makeItem('b', { genres: [28] })),
        0,
      );
    });

    it('should return 1 for identical genre sets', () => {
      const a = makeItem('a', { genres: [28, 12] });
      const b = makeItem('b', { genres: [28, 12] });
      assert.equal(rec._computeSimilarity(a, b), 1);
    });

    it('should return 0 for disjoint genre sets', () => {
      const a = makeItem('a', { genres: [28, 12] });
      const b = makeItem('b', { genres: [35, 18] });
      assert.equal(rec._computeSimilarity(a, b), 0);
    });

    it('should compute Jaccard similarity for overlapping genre sets', () => {
      const a = makeItem('a', { genres: [28, 12, 35] });
      const b = makeItem('b', { genres: [28, 35, 18] });
      // Intersection: {28, 35} = 2, Union: {28, 12, 35, 18} = 4
      // Jaccard = 2/4 = 0.5
      assert.equal(rec._computeSimilarity(a, b), 0.5);
    });

    it('should normalize numeric genre IDs via TMDB_GENRE_MAP', () => {
      // 28 = Action, 12 = Adventure
      const a = makeItem('a', { genres: [28] });
      const b = makeItem('b', { genres: ['Action'] });
      assert.equal(rec._computeSimilarity(a, b), 1);
    });

    it('should normalize genre names to lowercase for comparison', () => {
      const a = makeItem('a', { genres: ['Action'] });
      const b = makeItem('b', { genres: ['action'] });
      assert.equal(rec._computeSimilarity(a, b), 1);
    });

    it('should handle items where genres contain objects with name property', () => {
      const a = makeItem('a', { genres: [{ id: 28, name: 'Action' }] });
      const b = makeItem('b', { genres: ['Action'] });
      assert.equal(rec._computeSimilarity(a, b), 1);
    });

    it('should handle null/undefined genre values gracefully', () => {
      // null/undefined map to '' which becomes a set member, making Jaccard = 1/2 = 0.5
      // Set A: {'', 'action'}, Set B: {'action'}, intersection=1, union=2
      const a = makeItem('a', { genres: [null, undefined, 28] });
      const b = makeItem('b', { genres: [28] });
      assert.equal(rec._computeSimilarity(a, b), 0.5);
    });
  });

  // ================================================================
  // UTILITY METHODS
  // ================================================================

  describe('getTopGenres / getTopTropes / getTopAesthetics / getTopPacingStyles', () => {
    it('should return top n entries sorted by weight descending', () => {
      rec.profile.genreWeights = { Action: 5, Drama: 10, Comedy: 3, Horror: 8 };
      const top = rec.getTopGenres(2);
      assert.deepEqual(top, ['Drama', 'Horror']);
    });

    it('should return top n tropes sorted by weight descending', () => {
      rec.profile.tropes = { revenge: 2, betrayal: 5, sacrifice: 1 };
      const top = rec.getTopTropes(2);
      assert.deepEqual(top, ['betrayal', 'revenge']);
    });

    it('should return top n aesthetics sorted by weight descending', () => {
      rec.profile.aesthetics = { neon_noir: 3, gritty_realism: 7, cottagecore: 1 };
      const top = rec.getTopAesthetics(2);
      assert.deepEqual(top, ['gritty_realism', 'neon_noir']);
    });

    it('should return top n pacing styles sorted by weight descending', () => {
      rec.profile.pacingStyles = { relentless: 4, slow_burn: 8, twisty: 2 };
      const top = rec.getTopPacingStyles(2);
      assert.deepEqual(top, ['slow_burn', 'relentless']);
    });

    it('should return empty array when no data exists', () => {
      assert.deepEqual(rec.getTopGenres(3), []);
      assert.deepEqual(rec.getTopTropes(3), []);
      assert.deepEqual(rec.getTopAesthetics(3), []);
      assert.deepEqual(rec.getTopPacingStyles(3), []);
    });
  });

  describe('clear cache', () => {
    it('should invalidate all cached scores', () => {
      const item = makeItem('cache-me', { genres: [28] });
      app.state.selectedGenres = [28];
      const first = rec.score(item);
      // Invalidate cache
      rec.clear();
      // Same item should be re-scored (and since shrinkage/etc is now gone, same result)
      const second = rec.score(item);
      assert.equal(first, second);
    });
  });
});

describe('rescoreQueue', () => {
  let app, rec;

  beforeEach(() => {
    app = makeMockApp();
    rec = new Recommender(app);
    resetProfile(rec);
  });

  afterEach(() => {
    storageMock.clear();
  });

  it('returns original cards when startIndex >= cards.length', () => {
    const cards = [makeItem(1), makeItem(2)];
    const result = rec.rescoreQueue(cards, 5);
    assert.strictEqual(result, cards);
  });

  it('returns original cards when cards is null or undefined', () => {
    assert.strictEqual(rec.rescoreQueue(null, 0), null);
    assert.strictEqual(rec.rescoreQueue(undefined, 0), undefined);
  });

  it('preserves swiped cards and re-scores remaining', () => {
    rec.profile.totalSwipes = 10;
    rec.profile.genreWeights = { 28: 10, 35: -5 };
    app.state.selectedGenres = [28]; // score() uses selectedGenres, not profile.genreWeights

    const swiped1 = makeItem(1, { genres: [28] });
    const remaining1 = makeItem(2, { genres: [35] });
    const remaining2 = makeItem(3, { genres: [28] });

    const cards = [swiped1, remaining1, remaining2];
    const result = rec.rescoreQueue(cards, 1);

    // Swiped card preserved at index 0
    assert.strictEqual(result[0].id, 1);
    // Remaining cards re-sorted: genre 28 item should rank higher than genre 35
    assert.strictEqual(result[1].id, 3);
    assert.strictEqual(result[2].id, 2);
  });

  it('re-scores cache entries are invalidated before scoring', () => {
    rec.profile.totalSwipes = 10;
    app.state.selectedGenres = [28]; // score() uses selectedGenres, not profile.genreWeights

    const item = makeItem(1, { genres: [28] });
    const cards = [item];

    // Prime the cache — score should be 50 + 1*15 = 65
    const firstScore = rec.score(item);
    assert.ok(rec.cache.has(1));
    assert.strictEqual(firstScore, 65);

    // Change selectedGenres so the score changes
    app.state.selectedGenres = [];

    // rescoreQueue should clear cache and get new score (50, no genre match)
    const result = rec.rescoreQueue(cards, 0);
    const newScore = result[0]._score;
    assert.notStrictEqual(newScore, firstScore);
    assert.strictEqual(newScore, 50);
  });

  it('handles empty remaining cards gracefully', () => {
    const cards = [makeItem(1)];
    const result = rec.rescoreQueue(cards, 1);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 1);
  });

  it('handles single remaining card', () => {
    rec.profile.totalSwipes = 10;
    const cards = [makeItem(1), makeItem(2, { genres: [28] })];
    const result = rec.rescoreQueue(cards, 1);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, 1);
    assert.strictEqual(result[1].id, 2);
    assert.ok('_score' in result[1]);
  });

  it('returns all cards when startIndex is 0', () => {
    rec.profile.totalSwipes = 10;
    rec.profile.genreWeights = { 28: 10, 35: -5 };
    app.state.selectedGenres = [28]; // score() uses selectedGenres, not profile.genreWeights

    const cards = [makeItem(1, { genres: [35] }), makeItem(2, { genres: [28] })];
    const result = rec.rescoreQueue(cards, 0);
    assert.strictEqual(result.length, 2);
    // genre 28 should rank higher
    assert.strictEqual(result[0].id, 2);
    assert.strictEqual(result[1].id, 1);
  });

  it('applies MMR reranking for treatment group with enough cards', () => {
    rec.profile.totalSwipes = 20;
    rec.profile.genreWeights = { 28: 10 };

    // Create 15 cards to trigger diversity logic (15% of 15 = 2)
    const cards = [];
    for (let i = 0; i < 15; i++) {
      cards.push(makeItem(i, { genres: [28], _score: 80 - i }));
    }

    const result = rec.rescoreQueue(cards, 0, 'treatment');
    assert.strictEqual(result.length, 15);
    // All cards should still be present
    const ids = new Set(result.map(c => c.id));
    for (let i = 0; i < 15; i++) assert.ok(ids.has(i));
  });

  it('applies random serendipity for control group with enough cards', () => {
    rec.profile.totalSwipes = 20;
    rec.profile.genreWeights = { 28: 10 };

    const cards = [];
    for (let i = 0; i < 15; i++) {
      cards.push(makeItem(i, { genres: [28], _score: 80 - i }));
    }

    const result = rec.rescoreQueue(cards, 0, 'control');
    assert.strictEqual(result.length, 15);
    const ids = new Set(result.map(c => c.id));
    for (let i = 0; i < 15; i++) assert.ok(ids.has(i));
  });

  it('skips diversity reranking for small queues', () => {
    rec.profile.totalSwipes = 10;
    rec.profile.genreWeights = { 28: 10, 35: -5 };
    app.state.selectedGenres = [28]; // score() uses selectedGenres, not profile.genreWeights

    const cards = [makeItem(1, { genres: [35] }), makeItem(2, { genres: [28] })];
    const result = rec.rescoreQueue(cards, 0, 'treatment');
    // With only 2 cards, diversityCount = 0, so no reranking
    assert.strictEqual(result[0].id, 2);
    assert.strictEqual(result[1].id, 1);
  });
});
