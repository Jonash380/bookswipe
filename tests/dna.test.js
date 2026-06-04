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
    lang: 'en',
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

describe('generateMatchDNA', () => {
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
  // BASIC STRUCTURE
  // ================================================================

  describe('output structure', () => {
    it('should return an object with overall_match_percentage, dna_breakdown, and hook', () => {
      const item = makeItem('a', { genres: [28] });
      const dna = rec.generateMatchDNA(item);
      assert.ok(typeof dna.overall_match_percentage === 'number');
      assert.ok(Array.isArray(dna.dna_breakdown));
      assert.ok(typeof dna.hook === 'string');
    });

    it('should return overall_match_percentage as an integer between 0 and 100', () => {
      const item = makeItem('a', { genres: [28] });
      const dna = rec.generateMatchDNA(item);
      assert.ok(Number.isInteger(dna.overall_match_percentage));
      assert.ok(dna.overall_match_percentage >= 0);
      assert.ok(dna.overall_match_percentage <= 100);
    });

    it('should return dna_breakdown as array of objects with category, score, reason', () => {
      const item = makeItem('a', { genres: [28] });
      const dna = rec.generateMatchDNA(item);
      dna.dna_breakdown.forEach(b => {
        assert.ok(typeof b.category === 'string');
        assert.ok(typeof b.score === 'number');
        assert.ok(b.score >= 0 && b.score <= 100);
        assert.ok(typeof b.reason === 'string');
      });
    });

    it('should return at most 4 categories in dna_breakdown', () => {
      const item = makeItem('a', {
        genres: [28, 12],
        tags: ['dark', 'funny'],
        year: 2020,
        mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] },
      });
      app.state.eraFilter = 'current';
      const dna = rec.generateMatchDNA(item);
      assert.ok(dna.dna_breakdown.length <= 4, `expected <= 4 categories, got ${dna.dna_breakdown.length}`);
    });
  });

  // ================================================================
  // BUILT-IN CATEGORIES
  // ================================================================

  describe('Genre Alignment category', () => {
    it('should include Genre Alignment in breakdown', () => {
      const item = makeItem('a', { genres: [28] });
      const dna = rec.generateMatchDNA(item);
      const genreCat = dna.dna_breakdown.find(b => b.category.includes('Genre'));
      assert.ok(genreCat, 'Genre Alignment should be present');
    });

    it('should score higher when genres match profile weights', () => {
      rec.profile.genreWeights = { Action: 5, Comedy: -2 };
      const item = makeItem('a', { genres: [28] }); // Action via TMDB_GENRE_MAP
      const dna = rec.generateMatchDNA(item);
      const genreCat = dna.dna_breakdown.find(b => b.category.includes('Genre'));
      // Action has positive weight (5), no negative genres, so totalWeight=5, positiveWeight=5
      // score = 5/5 * 100 = 100
      assert.equal(genreCat.score, 100);
    });

    it('should score lower when genres have negative profile weights', () => {
      rec.profile.genreWeights = { Action: -3, Comedy: 2 };
      const item = makeItem('a', { genres: [28] }); // Action
      const dna = rec.generateMatchDNA(item);
      const genreCat = dna.dna_breakdown.find(b => b.category.includes('Genre'));
      // totalWeight = 3, positiveWeight = 0, score = 0
      assert.equal(genreCat.score, 0);
    });
  });

  describe('Mood & Vibe category', () => {
    it('should include Mood & Vibe when item has tags', () => {
      const item = makeItem('a', { genres: [28], tags: ['dark'] });
      const dna = rec.generateMatchDNA(item);
      const moodCat = dna.dna_breakdown.find(b => b.category.includes('Mood'));
      assert.ok(moodCat, 'Mood & Vibe should be present when item has tags');
    });

    it('should NOT include Mood & Vibe when item has no tags and no mechanics', () => {
      const item = makeItem('a', { genres: [28] });
      const dna = rec.generateMatchDNA(item);
      const moodCat = dna.dna_breakdown.find(b => b.category.includes('Mood'));
      assert.ok(!moodCat, 'Mood & Vibe should not be present without tags or mechanics');
    });

    it('should score higher when moods match selected moods', () => {
      app.state.selectedMoods = ['dark'];
      const item = makeItem('a', { genres: [28], tags: ['dark'] });
      const dna = rec.generateMatchDNA(item);
      const moodCat = dna.dna_breakdown.find(b => b.category.includes('Mood'));
      // moodMatch=1, tagWeightMatch=0, totalSignals=1, score = min(100, 40+15) = 55
      assert.ok(moodCat.score >= 40, `mood score ${moodCat.score} should be >= 40`);
    });
  });

  describe('Story Tropes category', () => {
    it('should include Story Tropes when item has mediaDNA tropes', () => {
      const item = makeItem('a', {
        genres: [28],
        mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] },
      });
      const dna = rec.generateMatchDNA(item);
      const storyCat = dna.dna_breakdown.find(b => b.category.includes('Trope') || b.category.includes('Erzähl'));
      assert.ok(storyCat, 'Story Tropes should be present when item has tropes');
    });

    it('should score higher when tropes match profile', () => {
      rec.profile.tropes.revenge = 3;
      const item = makeItem('a', {
        genres: [28],
        mediaDNA: { tropes: ['revenge', 'betrayal'], pacing: [], aesthetic: [], warnings: [] },
      });
      const dna = rec.generateMatchDNA(item);
      const storyCat = dna.dna_breakdown.find(b => b.category.includes('Trope') || b.category.includes('Erzähl'));
      // tropeMatch=1, score = min(100, 50+20) = 70
      assert.equal(storyCat.score, 70);
    });
  });

  describe('Pacing category', () => {
    it('should include Pacing when item has mediaDNA pacing', () => {
      const item = makeItem('a', {
        genres: [28],
        mediaDNA: { tropes: [], pacing: ['relentless'], aesthetic: [], warnings: [] },
      });
      const dna = rec.generateMatchDNA(item);
      const paceCat = dna.dna_breakdown.find(b => b.category === 'Pacing' || b.category === 'Tempo');
      assert.ok(paceCat, 'Pacing should be present when item has pacing data');
    });

    it('should score higher when pacing matches profile', () => {
      rec.profile.pacingStyles.relentless = 2;
      const item = makeItem('a', {
        genres: [28],
        mediaDNA: { tropes: [], pacing: ['relentless', 'twisty'], aesthetic: [], warnings: [] },
      });
      const dna = rec.generateMatchDNA(item);
      const paceCat = dna.dna_breakdown.find(b => b.category === 'Pacing' || b.category === 'Tempo');
      // pacingMatch=1, score = min(100, 50+25) = 75
      assert.equal(paceCat.score, 75);
    });

    it('should NOT include Pacing when item has no pacing data', () => {
      const item = makeItem('a', { genres: [28] });
      const dna = rec.generateMatchDNA(item);
      const paceCat = dna.dna_breakdown.find(b => b.category === 'Pacing' || b.category === 'Tempo');
      assert.ok(!paceCat, 'Pacing should not be present without pacing data');
    });
  });

  describe('Length / Commitment category', () => {
    it('should include Length for games with playtime', () => {
      const item = makeItem('a', {
        type: 'game', source: 'igdb',
        genres: ['Action'],
        playtime: 5,
      });
      const dna = rec.generateMatchDNA(item);
      const lenCat = dna.dna_breakdown.find(b => b.category === 'Length' || b.category === 'Länge');
      assert.ok(lenCat, 'Length should be present for games with playtime');
    });

    it('should score high (90) for quick games (<= 5h)', () => {
      const item = makeItem('a', {
        type: 'game', source: 'igdb',
        genres: ['Action'],
        playtime: 3,
      });
      const dna = rec.generateMatchDNA(item);
      const lenCat = dna.dna_breakdown.find(b => b.category === 'Length' || b.category === 'Länge');
      assert.equal(lenCat.score, 90);
    });

    it('should score low (30) for epic games (50+ h)', () => {
      const item = makeItem('a', {
        type: 'game', source: 'igdb',
        genres: ['Action'],
        playtime: 100,
      });
      const dna = rec.generateMatchDNA(item);
      const lenCat = dna.dna_breakdown.find(b => b.category === 'Length' || b.category === 'Länge');
      assert.equal(lenCat.score, 30);
    });

    it('should NOT include Length for movies without playtime', () => {
      const item = makeItem('a', { genres: [28] });
      const dna = rec.generateMatchDNA(item);
      const lenCat = dna.dna_breakdown.find(b => b.category === 'Length' || b.category === 'Länge');
      assert.ok(!lenCat, 'Length should not be present for non-game items without playtime');
    });
  });

  describe('Content Notes category', () => {
    it('should include Content Notes when item has warnings', () => {
      const item = makeItem('a', {
        genres: [28],
        mediaDNA: { tropes: [], pacing: [], aesthetic: [], warnings: ['gore'] },
      });
      const dna = rec.generateMatchDNA(item);
      const warnCat = dna.dna_breakdown.find(b => b.category.includes('Content') || b.category.includes('Warn'));
      assert.ok(warnCat, 'Content Notes should be present when item has warnings');
    });

    it('should score lower when warnings match profile dislikes', () => {
      rec.profile.warnings.gore = 2;
      const item = makeItem('a', {
        genres: [28],
        mediaDNA: { tropes: [], pacing: [], aesthetic: [], warnings: ['gore'] },
      });
      const dna = rec.generateMatchDNA(item);
      const warnCat = dna.dna_breakdown.find(b => b.category.includes('Content') || b.category.includes('Warn'));
      // warningScore = max(0, 80 - 1*25 - 2*10) = max(0, 35) = 35
      assert.equal(warnCat.score, 35);
    });
  });

  describe('Era category', () => {
    it('should include Era when eraFilter is not "all"', () => {
      app.state.eraFilter = 'current';
      const item = makeItem('a', { genres: [28], year: 2024 });
      const dna = rec.generateMatchDNA(item);
      const eraCat = dna.dna_breakdown.find(b => b.category === 'Era');
      assert.ok(eraCat, 'Era should be present when eraFilter is set');
    });

    it('should score high (90) when year fits the era range', () => {
      app.state.eraFilter = 'current'; // [2010, 2026]
      const item = makeItem('a', { genres: [28], year: 2024 });
      const dna = rec.generateMatchDNA(item);
      const eraCat = dna.dna_breakdown.find(b => b.category === 'Era');
      assert.equal(eraCat.score, 90);
    });

    it('should score low (25) when year is outside era range', () => {
      app.state.eraFilter = 'current'; // [2010, 2026]
      const item = makeItem('a', { genres: [28], year: 1999 });
      const dna = rec.generateMatchDNA(item);
      const eraCat = dna.dna_breakdown.find(b => b.category === 'Era');
      assert.equal(eraCat.score, 25);
    });
  });

  describe('Platform category (games)', () => {
    it('should include Platform for games when platforms are selected', () => {
      app.state.selectedPlatforms = [6];
      const item = makeItem('a', {
        type: 'game', source: 'igdb',
        genres: ['Action'],
        platforms: [{ id: 6, name: 'PC (Steam)' }],
      });
      const dna = rec.generateMatchDNA(item);
      const platCat = dna.dna_breakdown.find(b => b.category === 'Platform');
      assert.ok(platCat, 'Platform should be present for games with platforms selected');
    });

    it('should score 100 when game is on a selected platform', () => {
      app.state.selectedPlatforms = [6];
      const item = makeItem('a', {
        type: 'game', source: 'igdb',
        genres: ['Action'],
        platforms: [{ id: 6, name: 'PC (Steam)' }],
      });
      const dna = rec.generateMatchDNA(item);
      const platCat = dna.dna_breakdown.find(b => b.category === 'Platform');
      assert.equal(platCat.score, 100);
    });

    it('should score 20 when game is NOT on selected platforms', () => {
      app.state.selectedPlatforms = [48]; // PS5
      const item = makeItem('a', {
        type: 'game', source: 'igdb',
        genres: ['Action'],
        platforms: [{ id: 6, name: 'PC (Steam)' }],
      });
      const dna = rec.generateMatchDNA(item);
      const platCat = dna.dna_breakdown.find(b => b.category === 'Platform');
      assert.equal(platCat.score, 20);
    });
  });

  // ================================================================
  // HARD NO (BLOCKED CONTENT)
  // ================================================================

  describe('hard no / blocked content', () => {
    it('should set overall below 40 when item has a blocked genre', () => {
      app.state.blockedGenres = ['horror'];
      const item = makeItem('a', { genres: [27] }); // Horror
      const dna = rec.generateMatchDNA(item);
      assert.ok(dna.overall_match_percentage < 40,
        `overall ${dna.overall_match_percentage} should be < 40 for blocked content`);
    });

    it('should set overall below 40 when warnings are strongly disliked', () => {
      rec.profile.warnings.gore = 5;
      const item = makeItem('a', {
        genres: [28],
        mediaDNA: { tropes: [], pacing: [], aesthetic: [], warnings: ['gore'] },
      });
      const dna = rec.generateMatchDNA(item);
      // warningScore = max(0, 80 - 25 - 50) = 5, which triggers hardNo
      assert.ok(dna.overall_match_percentage < 40,
        `overall ${dna.overall_match_percentage} should be < 40 for heavily disliked warnings`);
    });

    it('should have hook mentioning blocked content for hard no', () => {
      app.state.blockedGenres = ['horror'];
      const item = makeItem('a', { genres: [27] });
      const dna = rec.generateMatchDNA(item);
      assert.ok(dna.hook.toLowerCase().includes('blocked') || dna.hook.toLowerCase().includes('swipe past'),
        `hook "${dna.hook}" should mention blocked content`);
    });
  });

  // ================================================================
  // HOOK GENERATION
  // ================================================================

  describe('hook generation', () => {
    it('should generate an engaging hook when match is strong', () => {
      rec.profile.genreWeights = { Action: 5 };
      const item = makeItem('a', { genres: [28], tags: ['dark'] });
      app.state.selectedMoods = ['dark'];
      const dna = rec.generateMatchDNA(item);
      assert.ok(typeof dna.hook === 'string');
      assert.ok(dna.hook.length > 0);
      assert.ok(dna.hook.length <= 200, `hook too long: ${dna.hook.length} chars`);
    });

    it('should mention the best category in the hook when score >= 80', () => {
      rec.profile.genreWeights = { Action: 5 };
      const item = makeItem('a', { genres: [28] });
      const dna = rec.generateMatchDNA(item);
      // Genre score should be 100, hook should mention it
      assert.ok(dna.hook.includes('favorite') || dna.hook.includes('Favorit'),
        `hook "${dna.hook}" should hint at being a favorite`);
    });
  });

  // ================================================================
  // GAMES VS MEDIA
  // ================================================================

  describe('game vs media items', () => {
    it('should handle game items without crashing', () => {
      const item = makeItem('game-test', {
        type: 'game', source: 'igdb',
        genres: ['Action', 'RPG'],
        platforms: [{ id: 6, name: 'PC (Steam)' }],
        tags: ['epic'],
        rating: 90,
      });
      const dna = rec.generateMatchDNA(item);
      assert.ok(dna.overall_match_percentage >= 0);
      assert.ok(dna.dna_breakdown.length > 0);
    });

    it('should handle movie items without crashing', () => {
      const item = makeItem('movie-test', {
        type: 'movie',
        genres: [28, 12],
        tags: ['dark'],
        year: 2023,
        mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] },
      });
      const dna = rec.generateMatchDNA(item);
      assert.ok(dna.overall_match_percentage >= 0);
      assert.ok(dna.dna_breakdown.length > 0);
    });

    it('should handle items with minimal metadata without crashing', () => {
      const item = makeItem('minimal');
      const dna = rec.generateMatchDNA(item);
      assert.ok(dna.overall_match_percentage >= 0);
      assert.ok(dna.dna_breakdown.length > 0);
    });
  });

  // ================================================================
  // GENRE WEIGHT-BASED SCORING
  // ================================================================

  describe('genre weight profiling', () => {
    it('should score higher when multiple positive-weight genres match', () => {
      rec.profile.genreWeights = { Action: 3, Adventure: 4, Drama: -2 };
      const item = makeItem('a', { genres: [28, 12] }); // Action, Adventure
      const dna = rec.generateMatchDNA(item);
      const genreCat = dna.dna_breakdown.find(b => b.category.includes('Genre'));
      // totalWeight = 3+4+2=9, positiveWeight = 3+4=7, score = 7/9*100 ≈ 77.77 → 78
      assert.ok(genreCat.score >= 70, `genre score ${genreCat.score} should show strong alignment`);
    });

    it('should use filter-based overlap score when no profile weights exist', () => {
      app.state.selectedGenres = [28, 12];
      const item = makeItem('a', { genres: [28, 12, 35] });
      const dna = rec.generateMatchDNA(item);
      const genreCat = dna.dna_breakdown.find(b => b.category.includes('Genre'));
      // overlap with selectedGenres: 2 genres match, score = min(100, 50+2*25) = 100
      assert.equal(genreCat.score, 100);
    });
  });
});
