import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

// Set up minimal DOM
const window = new Window({
  url: 'http://localhost',
});
global.window = window;
global.document = window.document;
Object.defineProperty(global, 'navigator', {
  value: { share: null },
  writable: true,
  configurable: true,
});

const { generateWrapped, renderWrapped } = await import('../js/wrapped.js');

function makeHistoryEntry(action, opts = {}) {
  return {
    id: opts.id || `item-${Math.random().toString(36).slice(2)}`,
    title: opts.title || 'Test Title',
    action,
    date: opts.date || new Date().toISOString(),
    type: opts.type || 'movie',
    source: opts.source || 'tmdb',
    genres: opts.genres || ['Action'],
    ...opts,
  };
}

describe('Wrapped — typeNames regression tests', () => {
  describe('generateWrapped', () => {
    it('should return null for empty history', () => {
      assert.equal(generateWrapped([], [], {}), null);
    });

    it('should return null for history with no likes this year', () => {
      const history = [
        makeHistoryEntry('nope', { date: new Date().toISOString() }),
      ];
      assert.equal(generateWrapped(history, [], {}), null);
    });

    it('should generate wrapped data with correct typeName for movies (en)', () => {
      const history = [
        makeHistoryEntry('like', { type: 'movie' }),
        makeHistoryEntry('like', { type: 'movie' }),
        makeHistoryEntry('nope'),
      ];
      const result = generateWrapped(history, [], {}, false);
      assert.ok(result);
      assert.equal(result.topType, 'movie');
      assert.equal(result.typeName, 'Movies');
    });

    it('should generate wrapped data with correct typeName for movies (de)', () => {
      const history = [
        makeHistoryEntry('like', { type: 'movie' }),
      ];
      const result = generateWrapped(history, [], {}, true);
      assert.ok(result);
      assert.equal(result.typeName, 'Filme');
    });

    it('should generate wrapped data with correct typeName for games (en)', () => {
      const history = [
        makeHistoryEntry('like', { type: 'game', source: 'igdb' }),
        makeHistoryEntry('like', { type: 'game', source: 'igdb' }),
      ];
      const result = generateWrapped(history, [], {}, false);
      assert.ok(result);
      assert.equal(result.topType, 'game');
      assert.equal(result.typeName, 'Games');
    });

    it('should generate wrapped data with correct typeName for books (de)', () => {
      const history = [
        makeHistoryEntry('like', { type: 'book', source: 'openlibrary' }),
      ];
      const result = generateWrapped(history, [], {}, true);
      assert.ok(result);
      assert.equal(result.topType, 'book');
      assert.equal(result.typeName, 'Bücher');
    });

    it('should generate wrapped data with correct typeName for TV (en)', () => {
      const history = [
        makeHistoryEntry('like', { type: 'tv' }),
      ];
      const result = generateWrapped(history, [], {}, false);
      assert.ok(result);
      assert.equal(result.topType, 'tv');
      assert.equal(result.typeName, 'TV');
    });

    it('should generate wrapped data with correct typeName for TV (de)', () => {
      const history = [
        makeHistoryEntry('like', { type: 'tv' }),
      ];
      const result = generateWrapped(history, [], {}, true);
      assert.ok(result);
      assert.equal(result.typeName, 'Serien');
    });
  });

  describe('renderWrapped — no ReferenceError', () => {
    it('should render without throwing for null wrapped data', () => {
      const app = { lang: 'en' };
      const html = renderWrapped(app, null);
      assert.ok(html.includes('Not enough data'));
    });

    it('should render without throwing for valid wrapped data (en)', () => {
      const wrapped = {
        year: 2025,
        totalDiscoveries: 5,
        topGenres: [['Action', 3], ['Drama', 2]],
        topItems: [],
        typeCounts: { movie: 3, tv: 1, book: 1, game: 0 },
        topType: 'movie',
        typeName: 'Movies',
        persona: 'Taste Pioneer',
        swipesThisYear: 10,
        likeRate: 50,
      };
      const app = { lang: 'en' };
      const html = renderWrapped(app, wrapped);
      assert.ok(html.includes('Movies'), 'should contain localized type name "Movies"');
      assert.ok(html.includes('Taste Pioneer'));
      assert.ok(html.includes('50%'));
    });

    it('should render without throwing for valid wrapped data (de)', () => {
      const wrapped = {
        year: 2025,
        totalDiscoveries: 3,
        topGenres: [['Horror', 2]],
        topItems: [],
        typeCounts: { movie: 1, tv: 0, book: 0, game: 2 },
        topType: 'game',
        typeName: 'Spiele',
        persona: 'Horror-Süchtiger',
        swipesThisYear: 5,
        likeRate: 60,
      };
      const app = { lang: 'de' };
      const html = renderWrapped(app, wrapped);
      assert.ok(html.includes('Spiele'), 'should contain localized type name "Spiele"');
      assert.ok(html.includes('Horror-Süchtiger'));
    });

    it('should render type breakdown with correct localized names (en)', () => {
      const wrapped = {
        year: 2025,
        totalDiscoveries: 4,
        topGenres: [['Action', 2]],
        topItems: [],
        typeCounts: { movie: 2, tv: 1, book: 0, game: 1 },
        topType: 'movie',
        typeName: 'Movies',
        persona: 'Taste Pioneer',
        swipesThisYear: 8,
        likeRate: 50,
      };
      const app = { lang: 'en' };
      const html = renderWrapped(app, wrapped);
      assert.ok(html.includes('Movies'), 'type breakdown should use en names');
      assert.ok(html.includes('TV'), 'type breakdown should show TV');
      assert.ok(html.includes('Games'), 'type breakdown should show Games');
    });

    it('should render type breakdown with correct localized names (de)', () => {
      const wrapped = {
        year: 2025,
        totalDiscoveries: 4,
        topGenres: [['Action', 2]],
        topItems: [],
        typeCounts: { movie: 2, tv: 1, book: 0, game: 1 },
        topType: 'movie',
        typeName: 'Filme',
        persona: 'Geschmacks-Pionier',
        swipesThisYear: 8,
        likeRate: 50,
      };
      const app = { lang: 'de' };
      const html = renderWrapped(app, wrapped);
      assert.ok(html.includes('Filme'), 'type breakdown should use de names');
      assert.ok(html.includes('Serien'), 'type breakdown should show Serien');
      assert.ok(html.includes('Spiele'), 'type breakdown should show Spiele');
    });
  });
});
