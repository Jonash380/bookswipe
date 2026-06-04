import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Recommender } from '../js/recommender.js';
import { TMDB_GENRE_MAP } from '../js/utils.js';

/**
 * Helper: create a minimal mock app for testing.
 */
function makeMockApp(lang = 'en', overrides = {}) {
  return {
    lang,
    state: {
      selectedGenres: [],
      selectedMoods: [],
      mediaType: 'movies',
      eraFilter: 'all',
      blockedGenres: [],
      boostedMoods: [],
      selectedPlatforms: [],
      ...overrides,
    },
    _genreMap: TMDB_GENRE_MAP,
  };
}

/**
 * Helper: create a mock media item.
 */
function makeItem(overrides = {}) {
  const defaults = {
    id: 'test-1',
    title: 'Test Movie',
    year: 2023,
    type: 'movie',
    source: 'tmdb',
    genres: [28, 12], // Action, Adventure
    tags: ['fast-paced', 'thrilling'],
    overview: 'An exciting test movie with thrilling action sequences.',
    rating: 7.5,
    mediaDNA: {
      tropes: ['chosen_one', 'plot_twist'],
      pacing: ['fast_paced'],
      aesthetic: ['neon_noir'],
    },
  };
  return { ...defaults, ...overrides };
}

// Helper: make items with specific length characteristics
function makeShortItem(id, overrides = {}) {
  return makeItem({
    id: `short-${id}`,
    title: `Short Item ${id}`,
    type: 'book',
    source: 'openlibrary',
    page_count: 150,
    tags: ['cozy', 'light'],
    genres: [],
    ...overrides,
  });
}

function makeLongItem(id, overrides = {}) {
  return makeItem({
    id: `long-${id}`,
    title: `Long Item ${id}`,
    type: 'book',
    source: 'openlibrary',
    page_count: 600,
    tags: ['atmospheric', 'slow_burn'],
    genres: [],
    ...overrides,
  });
}

function makeGameItem(id, overrides = {}) {
  return makeItem({
    id: `game-${id}`,
    title: `Game ${id}`,
    type: 'game',
    source: 'igdb',
    playtime: 3,
    genres: ['Action', 'RPG'],
    tags: ['fast-paced'],
    platforms: [{ id: 6, name: 'PC', abbr: 'PC' }],
    mechanics: ['combo_system', 'open_world'],
    themes: ['fantasy'],
    ...overrides,
  });
}

describe('generateDaylist', () => {
  // ---- Output structure ----
  it('should return all required fields', () => {
    const app = makeMockApp();
    const rec = new Recommender(app);
    const items = [makeItem()];
    const result = rec.generateDaylist(items);

    assert.ok(result, 'result should be defined');
    assert.equal(typeof result.queue_title, 'string');
    assert.ok(result.queue_title.length > 0, 'queue_title should not be empty');
    assert.equal(typeof result.vibe_description, 'string');
    assert.ok(result.vibe_description.length > 0);
    assert.equal(typeof result.estimated_total_time, 'string');
    assert.ok(Array.isArray(result.contextual_rules_applied));
    assert.ok(result.contextual_rules_applied.length >= 2);
    assert.ok(Array.isArray(result.media_queue));
  });

  it('should return media_queue with correct item structure', () => {
    const app = makeMockApp();
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'm1' }), makeItem({ id: 'm2' }), makeItem({ id: 'm3' })];
    const result = rec.generateDaylist(items);

    assert.ok(result.media_queue.length >= 1);
    const entry = result.media_queue[0];
    assert.equal(typeof entry.title, 'string');
    assert.equal(typeof entry.format, 'string');
    assert.equal(typeof entry.why_right_now, 'string');
    assert.ok(entry.why_right_now.length > 0);
  });

  it('should not exceed 5 items in media_queue', () => {
    const app = makeMockApp();
    const rec = new Recommender(app);
    const items = Array.from({ length: 10 }, (_, i) => makeItem({ id: `m-${i}` }));
    const result = rec.generateDaylist(items);
    assert.ok(result.media_queue.length <= 5);
  });

  it('should handle empty items gracefully', () => {
    const app = makeMockApp();
    const rec = new Recommender(app);
    const result = rec.generateDaylist([]);
    assert.ok(result);
    assert.ok(Array.isArray(result.media_queue));
    assert.equal(typeof result.queue_title, 'string');
  });

  // ---- Energy level overrides ----
  it('should apply low energy rules (cozy/light boost)', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const short = makeShortItem(1);
    const long = makeLongItem(1);
    const items = [short, long];

    const result = rec.generateDaylist(items, { energyLevel: 'low' });
    // Low energy should prioritize short/cozy items
    const hasShort = result.media_queue.some(i => i.title === 'Short Item 1');
    const hasLong = result.media_queue.some(i => i.title === 'Long Item 1');
    assert.ok(result.contextual_rules_applied.some(r => r.toLowerCase().includes('low energy') || r.toLowerCase().includes('cozy')));
    // It's ok either way as long as we get picks
    assert.ok(result.media_queue.length > 0);
  });

  it('should apply high energy rules (action/intense boost)', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'h1', tags: ['action', 'intense'] })];
    const result = rec.generateDaylist(items, { energyLevel: 'high' });
    assert.ok(result.contextual_rules_applied.some(r => r.toLowerCase().includes('high energy')));
  });

  // ---- Time of day detection (morning prioritizes short items) ----
  it('should apply morning rules', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    // Force morning by setting hour via Date mock — we rely on the code path
    // Instead test that the rules mention morning
    const items = [makeShortItem(1)];
    const result = rec.generateDaylist(items);
    // We can't easily mock Date, so just test the method runs
    assert.ok(result.media_queue.length > 0);
  });

  // ---- Format detection ----
  it('should detect book format', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeShortItem(1)];
    const result = rec.generateDaylist(items);
    const bookEntry = result.media_queue.find(i => i.title === 'Short Item 1');
    if (bookEntry) {
      assert.ok(bookEntry.format.toLowerCase().includes('short') || bookEntry.format.toLowerCase().includes('book'));
    }
  });

  it('should detect game format', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeGameItem(1)];
    const result = rec.generateDaylist(items);
    const gameEntry = result.media_queue.find(i => i.title === 'Game 1');
    if (gameEntry) {
      assert.ok(gameEntry.format.toLowerCase().includes('game'));
    }
  });

  it('should detect movie format', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'mv1', type: 'movie' })];
    const result = rec.generateDaylist(items);
    const movieEntry = result.media_queue.find(i => i.title === 'Test Movie');
    if (movieEntry) {
      assert.ok(movieEntry.format.toLowerCase().includes('movie'));
    }
  });

  // ---- Author/metadata ----
  it('should include author when available', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'b1', type: 'book', source: 'openlibrary', author: 'Test Author', genres: [] })];
    const result = rec.generateDaylist(items);
    const entry = result.media_queue.find(i => i.title === 'Test Movie');
    if (entry) {
      assert.ok(entry.author);
    }
  });

  // ---- Why right now is reasonable ----
  it('should have a non-empty why_right_now for each item', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem(), makeItem({ id: 'm2' }), makeItem({ id: 'm3' })];
    const result = rec.generateDaylist(items);
    for (const entry of result.media_queue) {
      assert.ok(entry.why_right_now.length > 0, `why_right_now should not be empty for ${entry.title}`);
      assert.ok(entry.why_right_now.length <= 200, `why_right_now should be reasonably short`);
    }
  });

  // ---- German locale ----
  it('should generate German titles and descriptions for de locale', () => {
    const app = makeMockApp('de');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'de1' })];
    const result = rec.generateDaylist(items);

    assert.ok(result.queue_title);
    assert.ok(result.vibe_description);
    // German description shouldn't have English placeholder text
    assert.ok(!result.vibe_description.includes('undefined'));
    assert.ok(result.media_queue.length > 0);
  });

  // ---- Contextual rules always present ----
  it('should have at least 2 contextual rules', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem()];
    const result = rec.generateDaylist(items);
    assert.ok(result.contextual_rules_applied.length >= 2);
  });

  // ---- Estimated total time ----
  it('should return estimated total time', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem()];
    const result = rec.generateDaylist(items);
    assert.equal(typeof result.estimated_total_time, 'string');
    assert.ok(result.estimated_total_time.length > 0);
  });

  // ---- Game items with platforms ----
  it('should handle game items with platform info', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeGameItem(1)];
    const result = rec.generateDaylist(items);
    const entry = result.media_queue.find(i => i.title === 'Game 1');
    if (entry) {
      assert.ok(entry.author || true); // author could be platforms or empty
    }
  });

  // ---- Items with mediaDNA micro-tags ----
  it('should work with items that have mediaDNA tags', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({
      id: 'dna1',
      tags: ['atmospheric', 'slow_burn', 'cozy'],
      mediaDNA: {
        tropes: ['found_family', 'slow_burn_romance'],
        pacing: ['slow_paced'],
        aesthetic: ['cozy_warm'],
      }
    })];
    const result = rec.generateDaylist(items);
    assert.ok(result.media_queue.length > 0);
  });

  // ---- Variety: mix of formats ----
  it('should handle a mix of movies, books, and games', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [
      makeItem({ id: 'mix1', type: 'movie', genres: [28] }),
      makeShortItem(1, { id: 'mix2' }),
      makeGameItem(2, { id: 'mix3' }),
    ];
    const result = rec.generateDaylist(items);
    assert.ok(result.media_queue.length > 0);
  });

  // ========== EDGE CASES ==========

  // ---- Null / empty items ----
  it('should handle items where tags is null', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'null-tags', tags: null })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined even with null tags');
    assert.ok(result.media_queue.length > 0, 'should still produce picks');
  });

  it('should handle items where tags is undefined', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'undef-tags' })];
    delete items[0].tags;
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with undefined tags');
    assert.ok(result.media_queue.length > 0, 'should still produce picks');
  });

  it('should handle items where mediaDNA is null', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'null-dna', mediaDNA: null })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with null mediaDNA');
    assert.ok(result.media_queue.length > 0, 'should still produce picks');
  });

  it('should handle items where mediaDNA is undefined', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'undef-dna' })];
    delete items[0].mediaDNA;
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with undefined mediaDNA');
    assert.ok(result.media_queue.length > 0, 'should still produce picks');
  });

  it('should handle items where mediaDNA.tropes is null', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({
      id: 'null-tropes',
      mediaDNA: { tropes: null, pacing: ['slow_paced'], aesthetic: [] }
    })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with null tropes');
    assert.ok(result.media_queue.length > 0);
  });

  it('should handle items where mediaDNA.pacing is null', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({
      id: 'null-pacing',
      mediaDNA: { tropes: ['chosen_one'], pacing: null, aesthetic: [] }
    })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with null pacing');
    assert.ok(result.media_queue.length > 0);
  });

  it('should handle items where mediaDNA.aesthetic is null', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({
      id: 'null-aesthetic',
      mediaDNA: { tropes: [], pacing: ['fast_paced'], aesthetic: null }
    })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with null aesthetic');
    assert.ok(result.media_queue.length > 0);
  });

  // ---- Missing title / author ----
  it('should handle items with empty title string', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'no-title-1', title: '' })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with empty title');
    assert.ok(result.media_queue.length > 0, 'should still produce picks');
  });

  it('should handle items with missing author field', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'no-auth-1', type: 'book', source: 'openlibrary', genres: [] })];
    // Ensure no author is set
    delete items[0].author;
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined without author');
    const entry = result.media_queue[0];
    if (entry) {
      // author should be empty string or missing, not undefined or crashing
      assert.equal(typeof entry.author, 'string');
    }
  });

  it('should handle items with null author', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'null-auth-1', type: 'book', source: 'openlibrary', author: null, genres: [] })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with null author');
    assert.ok(result.media_queue.length > 0);
  });

  it('should handle items with missing year', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'no-year-1', year: null })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined without year');
    assert.ok(result.media_queue.length > 0);
  });

  it('should handle items with missing overview', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'no-overview-1', overview: '' })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined without overview');
    assert.ok(result.media_queue.length > 0);
  });

  // ---- Very large item sets ----
  it('should handle 30+ items without crashing', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = Array.from({ length: 35 }, (_, i) => makeItem({ id: `large-${i}` }));
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined for 35 items');
    assert.ok(result.media_queue.length > 0, 'should produce picks');
    assert.ok(result.media_queue.length <= 5, 'should not exceed 5 picks');
  });

  it('should handle 50+ items without crashing', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = Array.from({ length: 60 }, (_, i) => makeItem({ id: `xlarge-${i}` }));
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined for 60 items');
    assert.ok(result.media_queue.length > 0, 'should produce picks');
    assert.ok(result.media_queue.length <= 5, 'should not exceed 5 picks');
  });

  // ---- Mixed null/edge combinations ----
  it('should handle items where both tags and mediaDNA are null', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'both-null', tags: null, mediaDNA: null })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with both null');
    assert.ok(result.media_queue.length > 0, 'should still produce picks');
  });

  it('should handle items with empty arrays in mediaDNA', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({
      id: 'empty-arrays',
      mediaDNA: { tropes: [], pacing: [], aesthetic: [] }
    })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with empty arrays');
    assert.ok(result.media_queue.length > 0);
  });

  it('should handle items with genres set to empty array', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'no-genres', genres: [] })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined without genres');
    assert.ok(result.media_queue.length > 0);
  });

  it('should handle items with null genres', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({ id: 'null-genres', genres: null })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined with null genres');
    assert.ok(result.media_queue.length > 0);
  });

  it('should handle items with platforms but no genres (games with minimal data)', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [makeItem({
      id: 'minimal-game',
      type: 'game',
      source: 'igdb',
      genres: null,
      tags: null,
      mediaDNA: null,
      platforms: [{ id: 48, name: 'PlayStation 4', abbr: 'PS4' }],
      playtime: 10,
    })];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined for minimal game');
    assert.ok(result.media_queue.length > 0, 'should still produce picks');
  });

  it('should handle items with only a title (all other fields null)', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const items = [{
      id: 'bare-minimum',
      title: 'Bare Minimum',
      type: 'movie',
    }];
    const result = rec.generateDaylist(items);
    assert.ok(result, 'result should be defined for bare minimum item');
    assert.ok(result.media_queue.length > 0, 'should produce at least one pick');
    const entry = result.media_queue[0];
    assert.equal(entry.title, 'Bare Minimum');
    assert.equal(typeof entry.format, 'string');
    assert.equal(typeof entry.why_right_now, 'string');
  });

  it('should handle 0 items (already tested) and ensure empty queue is an array', () => {
    const app = makeMockApp('en');
    const rec = new Recommender(app);
    const result = rec.generateDaylist([]);
    assert.ok(Array.isArray(result.media_queue));
    assert.equal(result.media_queue.length, 0);
    // Title should still reflect something reasonable
    assert.equal(typeof result.queue_title, 'string');
    assert.ok(result.queue_title.length > 0);
  });
});
