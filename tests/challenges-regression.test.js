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

const { ChallengeSystem } = await import('../js/challenges.js');

function makeMockApp(overrides = {}) {
  return {
    lang: 'en',
    recommender: {
      profile: {
        genreWeights: { Horror: -3, Romance: -2, ...overrides.genreWeights },
      },
    },
    ...overrides,
  };
}

function makeItem(id, opts = {}) {
  return {
    id,
    title: opts.title || `Item ${id}`,
    type: opts.type || 'movie',
    source: opts.source || 'tmdb',
    genres: opts.genres || [],
    year: opts.year ?? null,
    release_date: opts.release_date ?? null,
    original_language: opts.original_language ?? null,
    vote_count: opts.vote_count ?? null,
    rating: opts.rating ?? null,
    playtime: opts.playtime ?? null,
    runtime: opts.runtime ?? null,
    author: opts.author ?? null,
    ...opts,
  };
}

/**
 * Helper: force a specific challenge to be active this week
 * by injecting it into the challenge system's challenge list.
 */
function forceChallenge(cs, challengeDef) {
  cs.challenges = [challengeDef];
  if (!cs.data.progress[challengeDef.id]) {
    cs.data.progress[challengeDef.id] = { count: 0, items: [] };
  }
}

describe('ChallengeSystem — regression tests', () => {
  let app;
  let cs;

  beforeEach(() => {
    storageMock.clear();
    app = makeMockApp();
    cs = new ChallengeSystem(app);
  });

  // ================================================================
  // birth_decade: now matches pre-2005 (was hardcoded 1990-2000)
  // ================================================================

  describe('birth_decade challenge (pre-2005 fix)', () => {
    const birthDecadeChallenge = {
      id: 'nostalgia_trip',
      icon: '📼',
      title_de: 'Nostalgie-Trip',
      title_en: 'Nostalgia Trip',
      desc_de: 'Entdecke 3 Titel aus der Vor-Streaming-Ära',
      desc_en: 'Discover 3 pre-streaming era titles',
      target: 3,
      type: 'birth_decade',
    };

    beforeEach(() => {
      forceChallenge(cs, birthDecadeChallenge);
    });

    it('should match items from the 1990s (year < 2005)', () => {
      cs.trackSwipe(makeItem('a', { year: 1995 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.nostalgia_trip.count, 1);
    });

    it('should match items from the 1970s (year < 2005)', () => {
      cs.trackSwipe(makeItem('a', { year: 1975 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.nostalgia_trip.count, 1);
    });

    it('should match items from the 2000s (2000-2004, pre-streaming era)', () => {
      cs.trackSwipe(makeItem('a', { year: 2003 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.nostalgia_trip.count, 1);
    });

    it('should match items from 2004 (boundary: last year < 2005)', () => {
      cs.trackSwipe(makeItem('a', { year: 2004 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.nostalgia_trip.count, 1);
    });

    it('should NOT match items from 2005 (boundary: first excluded year)', () => {
      cs.trackSwipe(makeItem('a', { year: 2005 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.nostalgia_trip.count, 0);
    });

    it('should NOT match items from 2010 (streaming era)', () => {
      cs.trackSwipe(makeItem('a', { year: 2010 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.nostalgia_trip.count, 0);
    });

    it('should NOT match items from 2020 (modern era)', () => {
      cs.trackSwipe(makeItem('a', { year: 2020 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.nostalgia_trip.count, 0);
    });

    it('should NOT match items with no year', () => {
      cs.trackSwipe(makeItem('a', { year: null }), 'right');
      const p = cs.getProgress();
      assert.equal(p.nostalgia_trip.count, 0);
    });

    it('should match items from release_date string when year is null', () => {
      cs.trackSwipe(makeItem('a', { year: null, release_date: '1998' }), 'right');
      const p = cs.getProgress();
      assert.equal(p.nostalgia_trip.count, 1);
    });

    it('should complete after reaching target of 3', () => {
      cs.trackSwipe(makeItem('a', { year: 1995 }), 'right');
      cs.trackSwipe(makeItem('b', { year: 1985 }), 'right');
      cs.trackSwipe(makeItem('c', { year: 2002 }), 'right');
      assert.ok(cs.isCompleted('nostalgia_trip'));
    });
  });

  // ================================================================
  // like_streak reset on left swipe (dead code fix)
  // ================================================================

  describe('like_streak challenge (reset on left swipe fix)', () => {
    const likeStreakChallenge = {
      id: 'green_light',
      icon: '💚',
      title_de: 'Grüne Welle',
      title_en: 'Green Wave',
      desc_de: '10 Likes ohne einen Nope',
      desc_en: '10 likes with zero nopes',
      target: 10,
      type: 'like_streak',
    };

    beforeEach(() => {
      forceChallenge(cs, likeStreakChallenge);
    });

    it('should increment like_streak on right swipe', () => {
      cs.trackSwipe(makeItem('a'), 'right');
      const p = cs.getProgress();
      assert.equal(p.green_light.count, 1);
    });

    it('should reset like_streak to 0 on left swipe', () => {
      cs.trackSwipe(makeItem('a'), 'right');
      cs.trackSwipe(makeItem('b'), 'right');
      cs.trackSwipe(makeItem('c'), 'right');
      let p = cs.getProgress();
      assert.equal(p.green_light.count, 3);

      cs.trackSwipe(makeItem('d'), 'left');
      p = cs.getProgress();
      assert.equal(p.green_light.count, 0);
    });

    it('should NOT reset like_streak on up (skip) swipe', () => {
      cs.trackSwipe(makeItem('a'), 'right');
      cs.trackSwipe(makeItem('b'), 'right');
      cs.trackSwipe(makeItem('c'), 'up');
      const p = cs.getProgress();
      assert.equal(p.green_light.count, 2);
    });

    it('should allow rebuilding streak after reset', () => {
      cs.trackSwipe(makeItem('a'), 'right');
      cs.trackSwipe(makeItem('b'), 'right');
      cs.trackSwipe(makeItem('c'), 'left'); // reset
      cs.trackSwipe(makeItem('d'), 'right');
      cs.trackSwipe(makeItem('e'), 'right');
      const p = cs.getProgress();
      assert.equal(p.green_light.count, 2);
    });

    it('should complete after 10 consecutive likes without a nope', () => {
      for (let i = 0; i < 10; i++) {
        cs.trackSwipe(makeItem(`item-${i}`), 'right');
      }
      assert.ok(cs.isCompleted('green_light'));
    });

    it('should NOT complete if a nope interrupts the streak', () => {
      for (let i = 0; i < 9; i++) {
        cs.trackSwipe(makeItem(`item-${i}`), 'right');
      }
      cs.trackSwipe(makeItem('nope'), 'left'); // interrupt
      for (let i = 10; i < 19; i++) {
        cs.trackSwipe(makeItem(`item-${i}`), 'right');
      }
      // Only 9 likes after reset, not 10
      assert.ok(!cs.isCompleted('green_light'));
    });
  });

  // ================================================================
  // decade challenge (pre-1980)
  // ================================================================

  describe('decade challenge (pre-1980)', () => {
    const decadeChallenge = {
      id: 'decade_explorer',
      icon: '📅',
      title_de: 'Zeitreisender',
      title_en: 'Time Traveler',
      desc_de: 'Entdecke 3 Medien aus einem Jahrzehnt vor 1980',
      desc_en: 'Discover 3 items from a pre-1980 decade',
      target: 3,
      type: 'decade',
      decade: 'pre1980',
    };

    beforeEach(() => {
      forceChallenge(cs, decadeChallenge);
    });

    it('should match items from before 1980', () => {
      cs.trackSwipe(makeItem('a', { year: 1975 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.decade_explorer.count, 1);
    });

    it('should NOT match items from 1980 or later', () => {
      cs.trackSwipe(makeItem('a', { year: 1980 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.decade_explorer.count, 0);
    });
  });

  // ================================================================
  // high_rated challenge
  // ================================================================

  describe('high_rated challenge', () => {
    const highRatedChallenge = {
      id: 'critic_match',
      icon: '⭐',
      title_de: 'Kritiker-Liebling',
      title_en: 'Critic Darling',
      desc_de: 'Möge 3 Titel mit 4+ Sternen',
      desc_en: 'Like 3 titles rated 4+ stars',
      target: 3,
      type: 'high_rated',
    };

    beforeEach(() => {
      forceChallenge(cs, highRatedChallenge);
    });

    it('should match items rated 4.0 or higher', () => {
      cs.trackSwipe(makeItem('a', { rating: 4.5 }), 'right');
      cs.trackSwipe(makeItem('b', { rating: 4.0 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.critic_match.count, 2);
    });

    it('should NOT match items rated below 4.0', () => {
      cs.trackSwipe(makeItem('a', { rating: 3.5 }), 'right');
      const p = cs.getProgress();
      assert.equal(p.critic_match.count, 0);
    });
  });
});
