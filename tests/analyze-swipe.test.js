import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

// Minimal DOM setup
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

function makeMockApp(lang = 'en') {
  return {
    lang,
    _genreMap: {
      28: 'Action', 12: 'Adventure', 35: 'Comedy', 18: 'Drama',
      27: 'Horror', 10749: 'Romance', 878: 'Science Fiction',
      53: 'Thriller', 16: 'Animation', 14: 'Fantasy',
    },
    state: {
      selectedGenres: [], selectedMoods: [], eraFilter: 'all',
      blockedGenres: [], boostedMoods: [], selectedPlatforms: [],
    },
  };
}

function resetProfile(rec) {
  rec.profile = {
    genreWeights: {}, tagWeights: {}, eraPreference: null,
    tropes: {}, pacingStyles: {}, aesthetics: {}, warnings: {},
    totalSwipes: 0, likeRatio: 0,
    gamePlatformWeights: {}, gameMechanicWeights: {}, gameThemeWeights: {},
  };
  rec.cache.clear();
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
    mechanics: opts.mechanics || [],
    themes: opts.themes || [],
    ...opts,
  };
}

// ================================================================
// analyzeSwipe Tests
// ================================================================

describe('analyzeSwipe', () => {
  let app;
  let rec;

  beforeEach(() => {
    app = makeMockApp();
    rec = new Recommender(app);
    resetProfile(rec);
    storageMock.clear();
  });

  // ================================================================
  // OUTPUT STRUCTURE
  // ================================================================

  describe('output structure', () => {
    it('should return an object with all required fields', () => {
      const item = makeItem('a', {
        tags: ['dark'],
        mediaDNA: { tropes: ['revenge'], pacing: ['relentless'], aesthetic: [], warnings: [] },
      });
      const result = rec.analyzeSwipe(item, 'like');
      assert.ok(typeof result.action_analyzed === 'string');
      assert.ok(typeof result.inferred_reason === 'string');
      assert.ok(Array.isArray(result.tag_adjustments));
      assert.ok(typeof result.profile_health_check === 'string');
    });

    it('should have action_analyzed include the action name', () => {
      const result = rec.analyzeSwipe(makeItem('a'), 'like');
      assert.ok(result.action_analyzed.includes('Swipe') || result.action_analyzed.includes('wisch'));
    });

    it('each tag_adjustment should have tag, delta, and confidence', () => {
      rec.profile.tropes.revenge = 5; // Strong existing preference
      const item = makeItem('a', {
        tags: ['dark'],
        mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] },
      });
      const result = rec.analyzeSwipe(item, 'like');
      assert.ok(result.tag_adjustments.length > 0);
      result.tag_adjustments.forEach(adj => {
        assert.ok(typeof adj.tag === 'string');
        assert.ok(typeof adj.delta === 'number');
        assert.ok(['High', 'Medium', 'Low'].includes(adj.confidence));
      });
    });

    it('should return empty tag_adjustments for item with no micro-tags', () => {
      const item = makeItem('no-tags', { genres: [28] }); // Action — broad tag, filtered out
      const result = rec.analyzeSwipe(item, 'like');
      assert.equal(result.tag_adjustments.length, 0);
    });
  });

  // ================================================================
  // ACTION ANALYSIS
  // ================================================================

  describe('action analysis', () => {
    it('should label "like" as "Right Swipe" (en)', () => {
      const item = makeItem('a', { tags: ['dark'], mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like');
      assert.equal(result.action_analyzed, 'Right Swipe');
    });

    it('should label "nope" as "Left Swipe" (en)', () => {
      const item = makeItem('a', { tags: ['dark'], mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope');
      assert.equal(result.action_analyzed, 'Left Swipe');
    });

    it('should label "nope" with dwell > 5s as "Long-Press Reject" (en)', () => {
      const item = makeItem('a', { tags: ['dark'], mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', 6000);
      assert.equal(result.action_analyzed, 'Long-Press Reject');
    });

    it('should NOT label "nope" with dwell <= 5s as long-press', () => {
      const item = makeItem('a', { tags: ['dark'], mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', 3000);
      assert.equal(result.action_analyzed, 'Left Swipe');
    });
  });

  // ================================================================
  // RIGHT SWIPE (LIKE)
  // ================================================================

  describe('right swipe (like) deltas', () => {
    it('should apply +6 to +8 delta for tags with strong existing preference (strength > 3)', () => {
      rec.profile.tropes.revenge = 5; // Strong
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like');
      const adj = result.tag_adjustments.find(a => a.tag === 'revenge');
      assert.ok(adj, 'revenge adjustment should exist');
      // delta = min(8, 5 + round(min(5, 4))) = min(8, 9) = 8
      assert.ok(adj.delta >= 6 && adj.delta <= 8, `revenge delta ${adj.delta} should be 6-8`);
      assert.equal(adj.confidence, 'High');
    });

    it('should apply +5 delta for tags with moderate preference (strength > 0 but <= 3)', () => {
      rec.profile.tropes.revenge = 1.5;
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like');
      const adj = result.tag_adjustments.find(a => a.tag === 'revenge');
      assert.equal(adj.delta, 5);
      assert.equal(adj.confidence, 'High');
    });

    it('should apply +3 delta for tags with no existing preference (new discovery)', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['found_family'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like');
      const adj = result.tag_adjustments.find(a => a.tag === 'found_family');
      assert.equal(adj.delta, 3);
      assert.equal(adj.confidence, 'Low');
    });

    it('should include item tags in adjustments', () => {
      rec.profile.tagWeights.dark = 2;
      const item = makeItem('a', { tags: ['dark'], mediaDNA: { tropes: [], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like');
      const adj = result.tag_adjustments.find(a => a.tag === 'dark');
      assert.ok(adj, 'dark tag adjustment should exist');
      assert.ok(adj.delta > 0);
    });
  });

  // ================================================================
  // LEFT SWIPE (NOPE)
  // ================================================================

  describe('left swipe (nope) deltas', () => {
    it('should apply -7 delta for tags with strong existing preference (strength > 2)', () => {
      rec.profile.tropes.revenge = 4;
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope');
      const adj = result.tag_adjustments.find(a => a.tag === 'revenge');
      assert.equal(adj.delta, -7);
      assert.equal(adj.confidence, 'High');
    });

    it('should apply -5 delta for tags with moderate preference', () => {
      rec.profile.tropes.revenge = 1;
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope');
      const adj = result.tag_adjustments.find(a => a.tag === 'revenge');
      assert.equal(adj.delta, -5);
      assert.equal(adj.confidence, 'Medium');
    });

    it('should apply -3 delta for tags with no existing preference (neutral rejection)', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['found_family'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope');
      const adj = result.tag_adjustments.find(a => a.tag === 'found_family');
      assert.equal(adj.delta, -3);
      assert.equal(adj.confidence, 'Low');
    });
  });

  // ================================================================
  // LONG-PRESS REJECT
  // ================================================================

  describe('long-press reject deltas', () => {
    it('should apply -9 delta for long-press reject (dwell > 5s)', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', 6000);
      const adj = result.tag_adjustments.find(a => a.tag === 'revenge');
      assert.equal(adj.delta, -9);
      assert.equal(adj.confidence, 'High');
    });

    it('should NOT apply -9 for fast nope (dwell <= 5s)', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', 1000);
      const adj = result.tag_adjustments.find(a => a.tag === 'revenge');
      assert.equal(adj.delta, -3); // Neutral -3, not -9
    });
  });

  // ================================================================
  // MICRO-TAG FILTERING
  // ================================================================

  describe('micro-tag filtering', () => {
    it('should filter out broad genre tags like "Action", "Comedy"', () => {
      const item = makeItem('a', { tags: ['Action', 'dark'] });
      const result = rec.analyzeSwipe(item, 'like');
      const actionAdj = result.tag_adjustments.find(a => a.tag === 'Action');
      const darkAdj = result.tag_adjustments.find(a => a.tag === 'dark');
      assert.ok(!actionAdj, 'Broad tag "Action" should be filtered out');
      assert.ok(darkAdj, 'Micro-tag "dark" should remain');
    });

    it('should include pacing tags as micro-tags', () => {
      const item = makeItem('a', { mediaDNA: { tropes: [], pacing: ['slow_burn'], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like');
      const adj = result.tag_adjustments.find(a => a.tag === 'slow_burn');
      assert.ok(adj, 'Pacing tag "slow_burn" should be included');
    });

    it('should include aesthetic tags as micro-tags', () => {
      const item = makeItem('a', { mediaDNA: { tropes: [], pacing: [], aesthetic: ['neon_noir'], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like');
      const adj = result.tag_adjustments.find(a => a.tag === 'neon_noir');
      assert.ok(adj, 'Aesthetic tag "neon_noir" should be included');
    });

    it('should include game mechanics and themes', () => {
      const item = makeItem('a', { type: 'game', source: 'igdb', mechanics: ['roguelike'], themes: ['fantasy'] });
      const result = rec.analyzeSwipe(item, 'like');
      // "roguelike" should NOT be filtered out (it's a micro-tag)
      // "fantasy" might be filtered out as broad — check the behavior
      const roguelikeAdj = result.tag_adjustments.find(a => a.tag === 'roguelike');
      assert.ok(roguelikeAdj, 'Mechanic "roguelike" should be included as micro-tag');
    });

    it('should filter out board game / card game variants', () => {
      const item = makeItem('a', { mediaDNA: { tropes: [], pacing: [], aesthetic: [], warnings: [] }, tags: ['card game'] });
      const result = rec.analyzeSwipe(item, 'like');
      assert.equal(result.tag_adjustments.length, 0);
    });
  });

  // ================================================================
  // MAGNITUDE CAPPING
  // ================================================================

  describe('magnitude capping', () => {
    it('should cap total positive magnitude at 30', () => {
      // Multiple strong tags
      rec.profile.tropes.revenge = 5;
      rec.profile.tropes.betrayal = 5;
      rec.profile.tropes.sacrifice = 5;
      rec.profile.tropes.survival = 5;
      rec.profile.pacingStyles.relentless = 5;
      rec.profile.aesthetics.neon_noir = 5;
      const item = makeItem('a', {
        tags: ['dark'],
        mediaDNA: { tropes: ['revenge', 'betrayal', 'sacrifice', 'survival'], pacing: ['relentless'], aesthetic: ['neon_noir'], warnings: [] },
      });
      const result = rec.analyzeSwipe(item, 'like');
      // Each tag gets 7-12 delta with strength > 3. With 6 tags, total could be 42+.
      const totalPositive = result.tag_adjustments
        .filter(a => a.delta > 0)
        .reduce((sum, a) => sum + a.delta, 0);
      assert.ok(totalPositive <= 30, `total positive magnitude ${totalPositive} should be <= 30`);
    });

    it('should cap total negative magnitude at 30', () => {
      rec.profile.tropes.revenge = 5;
      rec.profile.tropes.betrayal = 5;
      rec.profile.tropes.sacrifice = 5;
      rec.profile.tropes.survival = 5;
      const item = makeItem('a', {
        mediaDNA: { tropes: ['revenge', 'betrayal', 'sacrifice', 'survival'], pacing: [], aesthetic: [], warnings: [] },
      });
      const result = rec.analyzeSwipe(item, 'nope');
      const totalNegative = result.tag_adjustments
        .filter(a => a.delta < 0)
        .reduce((sum, a) => sum + Math.abs(a.delta), 0);
      assert.ok(totalNegative <= 30, `total negative magnitude ${totalNegative} should be <= 30`);
    });
  });

  // ================================================================
  // SORTING
  // ================================================================

  describe('sorting', () => {
    it('should sort adjustments by absolute delta descending', () => {
      rec.profile.tropes.revenge = 5;  // Strong → delta 7-12
      rec.profile.tropes.betrayal = 1; // Weak → delta 5
      const item = makeItem('a', {
        mediaDNA: { tropes: ['revenge', 'betrayal'], pacing: [], aesthetic: [], warnings: [] },
      });
      const result = rec.analyzeSwipe(item, 'like');
      if (result.tag_adjustments.length >= 2) {
        const [first, second] = result.tag_adjustments;
        assert.ok(Math.abs(first.delta) >= Math.abs(second.delta),
          `first delta ${first.delta} should be >= second delta ${second.delta}`);
      }
    });
  });

  // ================================================================
  // INFERRED REASON
  // ================================================================

  describe('inferred reason', () => {
    it('should mention liked tag in reason for right swipe', () => {
      rec.profile.tropes.revenge = 3;
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like');
      assert.ok(result.inferred_reason.includes('revenge') || result.inferred_reason.includes('preferences'));
    });

    it('should mention rejected tag in reason for left swipe', () => {
      rec.profile.tropes.revenge = 3;
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope');
      assert.ok(result.inferred_reason.includes('revenge') || result.inferred_reason.includes('clashes'));
    });
  });

  // ================================================================
  // PROFILE HEALTH CHECK
  // ================================================================

  describe('profile health check', () => {
    it('should give early-days tip when totalSwipes < 5', () => {
      rec.profile.totalSwipes = 2;
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like');
      assert.ok(result.profile_health_check.toLowerCase().includes('early') || result.profile_health_check.includes('wische weiter'));
    });

    it('should give strong-preference tip when like delta >= 7', () => {
      rec.profile.totalSwipes = 10;
      rec.profile.tropes.revenge = 5;
      rec.profile.tropes.betrayal = 5;
      rec.profile.tropes.sacrifice = 5;
      const item = makeItem('a', {
        mediaDNA: { tropes: ['revenge', 'betrayal', 'sacrifice'], pacing: [], aesthetic: [], warnings: [] },
      });
      const result = rec.analyzeSwipe(item, 'like');
      assert.ok(result.profile_health_check.includes('strong') || result.profile_health_check.includes('stark'));
    });
  });

  // ================================================================
  // EDGE CASES
  // ================================================================

  describe('edge cases', () => {
    it('should handle items with no mediaDNA or tags gracefully', () => {
      const item = makeItem('bare-minimum');
      const result = rec.analyzeSwipe(item, 'like');
      assert.ok(typeof result.action_analyzed === 'string');
      assert.equal(result.tag_adjustments.length, 0);
    });

    it('should handle empty mediaDNA object gracefully', () => {
      const item = makeItem('empty-dna', { mediaDNA: {} });
      const result = rec.analyzeSwipe(item, 'like');
      assert.equal(result.tag_adjustments.length, 0);
    });

    it('should handle game items with mechanics and themes', () => {
      rec.profile.gameMechanicWeights.roguelike = 4;
      rec.profile.gameThemeWeights.fantasy = 3;
      const item = makeItem('a', {
        type: 'game', source: 'igdb',
        genres: ['Action'],
        mechanics: ['roguelike'],
        themes: ['fantasy'],
      });
      const result = rec.analyzeSwipe(item, 'like');
      const roguelikeAdj = result.tag_adjustments.find(a => a.tag === 'roguelike');
      // fantasy might be filtered as broad, but roguelike should be included
      if (roguelikeAdj) {
        assert.ok(roguelikeAdj.delta > 0);
        assert.equal(roguelikeAdj.confidence, 'High');
      }
    });

    it('should not filter out "found_family" (a micro-trope, not broad genre)', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['found_family'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like');
      const adj = result.tag_adjustments.find(a => a.tag === 'found_family');
      assert.ok(adj, '"found_family" should not be filtered out');
    });

    it('should handle negative delta warnings correctly (warnings only incremented on nope, not analyzed here)', () => {
      rec.profile.warnings.gore = 2;
      const item = makeItem('a', { mediaDNA: { tropes: [], pacing: [], aesthetic: [], warnings: ['gore'] } });
      // "gore" is in the warnings array — not a micro-tag from tropes/pacing/aesthetic
      // But warnings are tracked separately; analyzeSwipe uses the dna.tropes/pacing/aesthetic/tags/mechanics/themes
      // Since "gore" is in warnings only, there should be no micro-tag adjustments
      const result = rec.analyzeSwipe(item, 'nope');
      // warnings are NOT included in micro-tag set (they're tracked differently)
      // Adjustments should be empty since no micro-tags found
      assert.equal(result.tag_adjustments.length, 0);
    });
  });

  // ================================================================
  // LOCALIZATION (DE)
  // ================================================================

  describe('German locale', () => {
    it('should return German action names when lang is de', () => {
      const deApp = makeMockApp('de');
      const deRec = new Recommender(deApp);
      resetProfile(deRec);
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = deRec.analyzeSwipe(item, 'like');
      assert.ok(result.action_analyzed.includes('Rechtswisch'));
    });

    it('should return German long-press name when lang is de', () => {
      const deApp = makeMockApp('de');
      const deRec = new Recommender(deApp);
      resetProfile(deRec);
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = deRec.analyzeSwipe(item, 'nope', 6000);
      assert.ok(result.action_analyzed.includes('Langdruck'));
    });
  });

  // ================================================================
  // DELTA RANGE — SPEC REQUIREMENT: -10 to +10
  // ================================================================

  describe('delta range [-10, +10] per spec', () => {
    it('should keep all deltas within [-10, +8] (spec: -10 to +8 for right swipe)', () => {
      rec.profile.tropes.revenge = 10;  // Very strong
      rec.profile.tropes.betrayal = 10;
      rec.profile.tropes.sacrifice = 10;
      rec.profile.tropes.survival = 10;
      const item = makeItem('a', {
        mediaDNA: { tropes: ['revenge', 'betrayal', 'sacrifice', 'survival'], pacing: [], aesthetic: [], warnings: [] },
      });
      const result = rec.analyzeSwipe(item, 'like');
      result.tag_adjustments.forEach(adj => {
        assert.ok(adj.delta >= -10 && adj.delta <= 8, `delta ${adj.delta} for ${adj.tag} should be within [-10, 8]`);
      });
    });

    it('should keep long-press reject delta within [-10, -8]', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', 6000);
      const adj = result.tag_adjustments.find(a => a.tag === 'revenge');
      assert.ok(adj.delta >= -10 && adj.delta <= -8,
        `long-press delta ${adj.delta} for ${adj.tag} should be within [-10, -8]`);
    });
  });

  // ================================================================
  // UNRECOGNIZED ACTION STRINGS
  // ================================================================

  describe('unrecognized action strings', () => {
    it('should fall back to raw action string for "up"', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'up');
      assert.equal(result.action_analyzed, 'up');
    });

    it('should return empty adjustments for unrecognized action', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'super');
      assert.equal(result.tag_adjustments.length, 0);
    });

    it('should fall back to raw action string for "unknown"', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'unknown');
      assert.equal(result.action_analyzed, 'unknown');
      assert.equal(result.tag_adjustments.length, 0);
    });

    it('should still return all required fields for unrecognized action', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, '');
      assert.ok(typeof result.action_analyzed === 'string');
      assert.ok(typeof result.inferred_reason === 'string');
      assert.ok(Array.isArray(result.tag_adjustments));
      assert.ok(typeof result.profile_health_check === 'string');
    });
  });

  // ================================================================
  // DWELLTIME EDGE CASES
  // ================================================================

  describe('dwellTime edge cases', () => {
    it('should treat null dwellTime as normal nope (not long-press)', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', null);
      assert.equal(result.action_analyzed, 'Left Swipe');
    });

    it('should treat undefined dwellTime as normal nope (defaults to 0)', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', undefined);
      assert.equal(result.action_analyzed, 'Left Swipe');
    });

    it('should treat 0 dwellTime as normal nope (not long-press)', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', 0);
      assert.equal(result.action_analyzed, 'Left Swipe');
    });

    it('should treat dwellTime exactly 5000 as normal nope (not long-press — strictly > 5000)', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', 5000);
      assert.equal(result.action_analyzed, 'Left Swipe', '5000ms should not trigger long-press (needs > 5000)');
    });

    it('should treat dwellTime exactly 5001 as long-press', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', 5001);
      assert.equal(result.action_analyzed, 'Long-Press Reject');
    });

    it('should treat negative dwellTime as normal nope', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'nope', -100);
      assert.equal(result.action_analyzed, 'Left Swipe');
    });
  });

  // ================================================================
  // COMBINED EDGE CASES
  // ================================================================

  describe('combined edge cases', () => {
    it('should handle like with null dwellTime', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'like', null);
      assert.equal(result.action_analyzed, 'Right Swipe');
      assert.ok(Array.isArray(result.tag_adjustments));
    });

    it('should handle unrecognized action with null dwellTime', () => {
      const item = makeItem('a', { mediaDNA: { tropes: ['revenge'], pacing: [], aesthetic: [], warnings: [] } });
      const result = rec.analyzeSwipe(item, 'unknown', null);
      assert.equal(result.action_analyzed, 'unknown');
      assert.equal(result.tag_adjustments.length, 0);
    });

    it('should handle like action with no micro-tags and null dwellTime', () => {
      const item = makeItem('a', { genres: [28] }); // Only broad Action genre
      const result = rec.analyzeSwipe(item, 'like', null);
      assert.equal(result.action_analyzed, 'Right Swipe');
      assert.equal(result.tag_adjustments.length, 0);
    });
  });
});
