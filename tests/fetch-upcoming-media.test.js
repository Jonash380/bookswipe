import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchUpcomingMedia, mapTmdbResult } from '../js/api.js';

// Helper: create a TMDB API-style result
function tmdbResult(id, title, releaseDate, opts = {}) {
  return {
    id,
    title,
    release_date: releaseDate,
    first_air_date: releaseDate,
    poster_path: opts.poster_path || `/poster${id}.jpg`,
    backdrop_path: opts.backdrop_path || `/backdrop${id}.jpg`,
    overview: opts.overview || `Overview for ${title}`,
    genre_ids: opts.genre_ids || [28, 878],
    vote_average: opts.vote_average ?? 7.5,
    vote_count: opts.vote_count ?? 1000,
    ...opts,
  };
}

// Helper: build a date string relative to today
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Mock fetch
let fetchCalls = [];
let mockResponse = { ok: true, results: [] };

function mockFetch(url, opts) {
  fetchCalls.push({ url, opts });
  return Promise.resolve({
    ok: mockResponse.ok !== false,
    json: () => Promise.resolve({ results: mockResponse.results || [] }),
  });
}

describe('fetchUpcomingMedia', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    mockResponse = { ok: true, results: [] };
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  describe('TMDB date filter parameters', () => {
    it('should use primary_release_date for movies', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.ok(fetchCalls.length > 0);
      assert.ok(fetchCalls[0].url.includes('primary_release_date.gte='), 'should include primary_release_date.gte');
      assert.ok(fetchCalls[0].url.includes('primary_release_date.lte='), 'should include primary_release_date.lte');
      assert.ok(!fetchCalls[0].url.includes('first_air_date'), 'should NOT include first_air_date for movies');
    });

    it('should use first_air_date for TV', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('tv', [{ id: 28 }], 'en', 60);
      assert.ok(fetchCalls.length > 0);
      assert.ok(fetchCalls[0].url.includes('first_air_date.gte='), 'should include first_air_date.gte');
      assert.ok(fetchCalls[0].url.includes('first_air_date.lte='), 'should include first_air_date.lte');
      assert.ok(!fetchCalls[0].url.includes('primary_release_date'), 'should NOT include primary_release_date for TV');
    });

    it('should pass sort_by=popularity.desc', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.ok(fetchCalls[0].url.includes('sort_by=popularity.desc'));
    });

    it('should pass language parameter', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('movies', [{ id: 28 }], 'de', 60);
      assert.ok(fetchCalls[0].url.includes('language=de'));
    });

    it('should pass genre IDs from selectedGenres', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('movies', [{ id: 28 }, { id: 878 }, { id: 12 }], 'en', 60);
      assert.ok(fetchCalls[0].url.includes('with_genres=28,878,12'));
    });

    it('should use empty genre string when no genres selected', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('movies', [], 'en', 60);
      assert.ok(fetchCalls[0].url.includes('with_genres='));
    });

    it('should use radarDays for date window', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 30);
      const url = fetchCalls[0].url;
      const gteMatch = url.match(/primary_release_date\.gte=(\d{4}-\d{2}-\d{2})/);
      const lteMatch = url.match(/primary_release_date\.lte=(\d{4}-\d{2}-\d{2})/);
      assert.ok(gteMatch && lteMatch, 'should have date parameters');
      const diffDays = Math.round((new Date(lteMatch[1]) - new Date(gteMatch[1])) / (1000 * 60 * 60 * 24));
      assert.ok(diffDays >= 58 && diffDays <= 62, `date window should be ~60 days, got ${diffDays}`);
    });

    it('should default radarDays to 60 when not set', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', undefined);
      const url = fetchCalls[0].url;
      const gteMatch = url.match(/primary_release_date\.gte=(\d{4}-\d{2}-\d{2})/);
      const lteMatch = url.match(/primary_release_date\.lte=(\d{4}-\d{2}-\d{2})/);
      assert.ok(gteMatch && lteMatch);
      const diffDays = Math.round((new Date(lteMatch[1]) - new Date(gteMatch[1])) / (1000 * 60 * 60 * 24));
      assert.ok(diffDays >= 118 && diffDays <= 122, `default window should be ~120 days (60+60), got ${diffDays}`);
    });

    it('should use /proxy/tmdb/discover/movie endpoint for movies', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.ok(fetchCalls[0].url.startsWith('/proxy/tmdb/discover/movie'));
    });

    it('should use /proxy/tmdb/discover/tv endpoint for TV', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('tv', [{ id: 28 }], 'en', 60);
      assert.ok(fetchCalls[0].url.startsWith('/proxy/tmdb/discover/tv'));
    });
  });

  describe('result mapping', () => {
    it('should map TMDB results to standard format', async () => {
      const futureDate = daysFromNow(30);
      mockResponse.results = [tmdbResult(123, 'Test Movie', futureDate)];
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.ok(result.length > 0);
      const item = result[0];
      assert.equal(item.id, 'tmdb-123');
      assert.equal(item.tmdb_id, 123);
      assert.equal(item.title, 'Test Movie');
      assert.equal(item.source, 'tmdb');
      assert.equal(item.type, 'movie');
      assert.equal(item.releaseDate, futureDate);
      assert.equal(item.overview, 'Overview for Test Movie');
      assert.deepEqual(item.genres, [28, 878]);
      assert.equal(item.rating, 7.5);
      assert.equal(item.vote_count, 1000);
    });

    it('should construct correct image URLs', async () => {
      const futureDate = daysFromNow(10);
      mockResponse.results = [tmdbResult(456, 'Movie', futureDate, {
        poster_path: '/abc.jpg',
        backdrop_path: '/xyz.jpg',
      })];
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.equal(result[0].cover, 'https://image.tmdb.org/t/p/w500/abc.jpg');
      assert.equal(result[0].backdrop, 'https://image.tmdb.org/t/p/w1280/xyz.jpg');
    });

    it('should handle missing poster/backdrop', async () => {
      mockResponse.results = [{
        id: 789, title: 'No Image', release_date: daysFromNow(10),
        poster_path: null, backdrop_path: null,
        overview: 'Test', genre_ids: [], vote_average: 0, vote_count: 0,
      }];
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.equal(result[0].cover, '');
      assert.equal(result[0].backdrop, '');
    });

    it('should extract year from release date', async () => {
      mockResponse.results = [tmdbResult(1, 'Movie', '2026-07-15')];
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.equal(result[0].year, 2026);
    });

    it('should use name field for TV shows (fallback from title)', async () => {
      mockResponse.results = [{
        id: 100, name: 'TV Show', first_air_date: daysFromNow(10),
        poster_path: '/p.jpg', backdrop_path: '/b.jpg',
        overview: 'TV overview', genre_ids: [18], vote_average: 8.0, vote_count: 500,
      }];
      const result = await fetchUpcomingMedia('tv', [{ id: 18 }], 'en', 60);
      assert.equal(result[0].title, 'TV Show');
      assert.equal(result[0].type, 'tv');
    });
  });

  describe('isUpcoming flag', () => {
    it('should mark future releases as isUpcoming=true', async () => {
      const futureDate = daysFromNow(30);
      mockResponse.results = [tmdbResult(1, 'Future Movie', futureDate)];
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.equal(result[0].isUpcoming, true);
    });

    it('should mark past releases as isUpcoming=false', async () => {
      const pastDate = daysFromNow(-30);
      mockResponse.results = [tmdbResult(1, 'Past Movie', pastDate)];
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.equal(result[0].isUpcoming, false);
    });

    it('should set releaseDate on all results', async () => {
      const d = daysFromNow(10);
      mockResponse.results = [tmdbResult(1, 'Movie', d)];
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.equal(result[0].releaseDate, d);
    });

    it('should handle missing release date gracefully', async () => {
      mockResponse.results = [{
        id: 1, title: 'No Date',
        poster_path: null, backdrop_path: null,
        overview: '', genre_ids: [], vote_average: 0, vote_count: 0,
      }];
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.equal(result[0].releaseDate, null);
      assert.equal(result[0].isUpcoming, false);
    });
  });

  describe('error handling', () => {
    it('should return empty array on fetch error', async () => {
      globalThis.fetch = () => Promise.reject(new Error('Network error'));
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.deepEqual(result, []);
    });

    it('should return empty array when response is not ok', async () => {
      globalThis.fetch = () => Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ results: [] }),
      });
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.deepEqual(result, []);
    });

    it('should propagate AbortError', async () => {
      globalThis.fetch = () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      };
      await assert.rejects(
        () => fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60),
        (err) => err.name === 'AbortError',
        'should propagate AbortError'
      );
    });

    it('should return empty array when results is missing from response', async () => {
      globalThis.fetch = () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
      const result = await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.deepEqual(result, []);
    });
  });

  describe('media type routing', () => {
    it('should use movie endpoint and primary_release_date for movies', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60);
      assert.ok(fetchCalls[0].url.includes('/discover/movie'));
      assert.ok(fetchCalls[0].url.includes('primary_release_date'));
    });

    it('should use tv endpoint and first_air_date for tv', async () => {
      mockResponse.results = [];
      await fetchUpcomingMedia('tv', [{ id: 28 }], 'en', 60);
      assert.ok(fetchCalls[0].url.includes('/discover/tv'));
      assert.ok(fetchCalls[0].url.includes('first_air_date'));
    });
  });

  describe('AbortSignal', () => {
    it('should pass signal to fetch', async () => {
      const controller = new AbortController();
      mockResponse.results = [];
      await fetchUpcomingMedia('movies', [{ id: 28 }], 'en', 60, controller.signal);
      assert.equal(fetchCalls[0].opts.signal, controller.signal);
    });
  });
});
