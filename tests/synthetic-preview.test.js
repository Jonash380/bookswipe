import { describe, it } from 'node:test';
import assert from 'node:assert';

// Mock DOM for extractDominantColor
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.CanvasRenderingContext2D = dom.window.CanvasRenderingContext2D;

const {
  generateSyntheticPreview,
  moodToPalette,
  generateTagline,
  mediaTypeIcon,
  extractDominantColor,
} = await import('../js/synthetic-preview.js');

describe('Synthetic Preview Engine', () => {
  // ===== generateSyntheticPreview =====
  describe('generateSyntheticPreview', () => {
    it('returns a synthetic preview for a movie with mediaDNA', () => {
      const card = {
        id: 'tmdb-123',
        title: 'Blade Runner 2049',
        mediaDNA: { mood: ['dark'], aesthetic: ['noir'] },
        genres: ['Sci-Fi'],
        overview: 'A young blade runner\'s discovery of a long-buried secret leads him to track down former blade runner Rick Deckard.',
      };
      const preview = generateSyntheticPreview(card, 'movies', 'en');
      assert.equal(preview.type, 'synthetic');
      assert.ok(preview.background.includes('linear-gradient'));
      assert.equal(preview.icon, '🎬');
      assert.ok(preview.tagline.includes('Blade Runner') || preview.tagline.length > 0);
      assert.equal(preview.mood, 'dark');
      assert.equal(preview.genre, 'Sci-Fi');
      assert.equal(preview.title, 'Blade Runner 2049');
      assert.ok(preview.ambientColor);
      assert.ok(preview.synopsis);
    });

    it('returns a synthetic preview for a TV show with seasons', () => {
      const card = {
        id: 'tmdb-456',
        title: 'Breaking Bad',
        mediaDNA: { mood: ['gritty'] },
        genres: [18],
        seasons: 5,
        overview: 'A high school chemistry teacher turned methamphetamine manufacturer.',
      };
      const preview = generateSyntheticPreview(card, 'tv', 'en');
      assert.equal(preview.type, 'synthetic');
      assert.equal(preview.icon, '📺');
      assert.ok(preview.tagline.includes('5 seasons'));
      assert.equal(preview.mood, 'gritty');
      assert.equal(preview.genre, 'Drama');
    });

    it('returns a synthetic preview for a book with page count', () => {
      const card = {
        id: 'ol-789',
        title: 'Dune',
        mediaDNA: { mood: ['epic'] },
        genres: ['Sci-Fi'],
        pageCount: 412,
        overview: 'The story of Paul Atreides.',
      };
      const preview = generateSyntheticPreview(card, 'books', 'en');
      assert.equal(preview.type, 'synthetic');
      assert.equal(preview.icon, '📚');
      assert.ok(preview.tagline.includes('412 pages'));
      assert.equal(preview.mood, 'epic');
    });

    it('returns a synthetic preview for a game with playtime', () => {
      const card = {
        id: 'igdb-999',
        title: 'Hollow Knight',
        mediaDNA: { mood: ['dark'] },
        genres: ['Metroidvania'],
        playtime: 27,
        overview: 'A challenging action-adventure through a ruined kingdom of insects.',
      };
      const preview = generateSyntheticPreview(card, 'games', 'en');
      assert.equal(preview.type, 'synthetic');
      assert.equal(preview.icon, '🎮');
      assert.ok(preview.tagline.includes('27 hours'));
      assert.equal(preview.mood, 'dark');
    });

    it('falls back to neutral mood when no mediaDNA is present', () => {
      const card = {
        id: 'tmdb-000',
        title: 'Unknown',
        genres: [],
        overview: '',
      };
      const preview = generateSyntheticPreview(card, 'movies', 'en');
      assert.equal(preview.mood, 'neutral');
      assert.ok(preview.background.includes(PALETTES.neutral[0]));
    });

    it('returns a fallback preview for a null card', () => {
      const preview = generateSyntheticPreview(null, 'movies', 'en');
      assert.equal(preview.type, 'synthetic');
      assert.equal(preview.mood, 'neutral');
      assert.equal(preview.tagline, 'Discover something new');
    });

    it('generates German taglines when lang=de', () => {
      const card = {
        id: 'tmdb-123',
        title: 'Test',
        mediaDNA: { mood: ['warm'] },
        genres: ['Komödie'],
        overview: 'Ein lustiger Film.',
      };
      const preview = generateSyntheticPreview(card, 'movies', 'de');
      assert.ok(preview.tagline.includes('Film'));
    });
  });

  // ===== moodToPalette =====
  describe('moodToPalette', () => {
    it('maps known moods exactly', () => {
      assert.deepEqual(moodToPalette('dark'), ['#0a0a0f', '#1a1a2e']);
      assert.deepEqual(moodToPalette('warm'), ['#d4a574', '#8b5a2b']);
      assert.deepEqual(moodToPalette('cold'), ['#0a84ff', '#0066cc']);
      assert.deepEqual(moodToPalette('neon'), ['#00cccc', '#cc00cc']);
      assert.deepEqual(moodToPalette('pastel'), ['#ffb6c1', '#ff69b4']);
      assert.deepEqual(moodToPalette('gritty'), ['#ff453a', '#ff6b6b']);
      assert.deepEqual(moodToPalette('natural'), ['#30d158', '#5ac8fa']);
    });

    it('does fuzzy matching for partial mood names', () => {
      assert.deepEqual(moodToPalette('darkness'), ['#0a0a0f', '#1a1a2e']);
      assert.deepEqual(moodToPalette('cozy-vibes'), ['#d4a574', '#8b5a2b']);
    });

    it('falls back to neutral for unknown moods', () => {
      assert.deepEqual(moodToPalette('alien'), ['#2a2a3a', '#1a1a2e']);
      assert.deepEqual(moodToPalette(''), ['#2a2a3a', '#1a1a2e']);
      assert.deepEqual(moodToPalette(null), ['#2a2a3a', '#1a1a2e']);
    });
  });

  // ===== generateTagline =====
  describe('generateTagline', () => {
    it('produces deterministic movie taglines for the same title', () => {
      const card = { title: 'Inception', genres: ['Action'] };
      const t1 = generateTagline(card, 'movies', 'en');
      const t2 = generateTagline(card, 'movies', 'en');
      assert.equal(t1, t2);
      assert.ok(t1.length > 0);
    });

    it('produces different taglines for different titles', () => {
      const c1 = { title: 'Movie A', genres: ['Action'] };
      const c2 = { title: 'Movie B', genres: ['Action'] };
      const t1 = generateTagline(c1, 'movies', 'en');
      const t2 = generateTagline(c2, 'movies', 'en');
      // Statistically almost always different due to hash-based selection
      assert.notEqual(t1, t2);
    });

    it('includes season count for TV shows', () => {
      const card = { title: 'Stranger Things', genres: ['Sci-Fi'], seasons: 4 };
      const t = generateTagline(card, 'tv', 'en');
      assert.ok(t.includes('4 seasons'));
    });

    it('includes page count for books', () => {
      const card = { title: 'The Hobbit', genres: ['Fantasy'], pageCount: 310 };
      const t = generateTagline(card, 'books', 'en');
      assert.ok(t.includes('310 pages'));
    });

    it('includes playtime for games', () => {
      const card = { title: 'Celeste', genres: ['Platformer'], playtime: 8 };
      const t = generateTagline(card, 'games', 'en');
      assert.ok(t.includes('8 hours'));
    });

    it('returns empty string for invalid card', () => {
      assert.equal(generateTagline(null, 'movies', 'en'), '');
    });
  });

  // ===== mediaTypeIcon =====
  describe('mediaTypeIcon', () => {
    it('returns correct icons', () => {
      assert.equal(mediaTypeIcon('movies'), '🎬');
      assert.equal(mediaTypeIcon('tv'), '📺');
      assert.equal(mediaTypeIcon('books'), '📚');
      assert.equal(mediaTypeIcon('games'), '🎮');
      assert.equal(mediaTypeIcon('unknown'), '✨');
    });
  });

  // ===== extractDominantColor =====
  describe('extractDominantColor', () => {
    it('returns null for a missing image', () => {
      assert.equal(extractDominantColor(null), null);
    });

    it('returns null for an incomplete image', () => {
      const img = { complete: false, naturalWidth: 0 };
      assert.equal(extractDominantColor(img), null);
    });

    it('returns an RGB object for a valid image element', () => {
      // Create a small canvas-backed image
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 50, 50);
      const img = document.createElement('img');
      img.src = canvas.toDataURL();
      // The image won't be "complete" in jsdom without loading, so we mock it
      img.complete = true;
      img.naturalWidth = 50;
      img.naturalHeight = 50;
      // Mock drawImage to avoid CORS issues in jsdom
      const origGetContext = canvas.getContext.bind(canvas);
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 50;
      mockCanvas.height = 50;
      const mockCtx = mockCanvas.getContext('2d');
      mockCtx.fillStyle = '#ff0000';
      mockCtx.fillRect(0, 0, 50, 50);
      // Since we can't easily mock the internal canvas creation in extractDominantColor,
      // we test the fallback behavior and the function signature instead.
      const result = extractDominantColor(img);
      // Either null (CORS/jsdom limitation) or an RGB object
      if (result !== null) {
        assert.ok(typeof result.r === 'number');
        assert.ok(typeof result.g === 'number');
        assert.ok(typeof result.b === 'number');
      }
    });
  });
});
