import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapTmdbResult } from '../js/api.js';

function tmdbMovie(id, title, opts = {}) {
  return {
    id,
    title,
    release_date: opts.release_date || '2026-07-15',
    poster_path: opts.poster_path ?? '/poster.jpg',
    backdrop_path: opts.backdrop_path ?? '/backdrop.jpg',
    overview: opts.overview || `Overview for ${title}`,
    genre_ids: opts.genre_ids || [28, 878],
    vote_average: opts.vote_average ?? 7.5,
    vote_count: opts.vote_count ?? 1000,
    ...opts,
  };
}

describe('mapTmdbResult', () => {

  describe('standard field mapping', () => {
    it('should map all basic fields correctly', () => {
      const m = tmdbMovie(123, 'Test Movie');
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.id, 'tmdb-123');
      assert.equal(result.tmdb_id, 123);
      assert.equal(result.title, 'Test Movie');
      assert.equal(result.source, 'tmdb');
      assert.equal(result.type, 'movie');
      assert.equal(result.overview, 'Overview for Test Movie');
      assert.deepEqual(result.genres, [28, 878]);
      assert.equal(result.rating, 7.5);
      assert.equal(result.vote_count, 1000);
    });

    it('should pass type parameter through', () => {
      const m = { id: 1, name: 'TV Show', first_air_date: '2026-01-01' };
      const result = mapTmdbResult(m, 'tv');
      assert.equal(result.type, 'tv');
    });

    it('should construct correct cover URL from poster_path', () => {
      const m = tmdbMovie(1, 'Movie', { poster_path: '/abc.jpg' });
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.cover, 'https://image.tmdb.org/t/p/w500/abc.jpg');
    });

    it('should construct correct backdrop URL from backdrop_path', () => {
      const m = tmdbMovie(1, 'Movie', { backdrop_path: '/xyz.jpg' });
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.backdrop, 'https://image.tmdb.org/t/p/w1280/xyz.jpg');
    });
  });

  describe('year extraction', () => {
    it('should extract year from YYYY-MM-DD date', () => {
      const m = tmdbMovie(1, 'Movie', { release_date: '2026-07-15' });
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.year, 2026);
    });

    it('should extract year from YYYY-MM date', () => {
      const m = tmdbMovie(1, 'Movie', { release_date: '2025-03' });
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.year, 2025);
    });

    it('should extract year from YYYY date', () => {
      const m = tmdbMovie(1, 'Movie', { release_date: '2024' });
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.year, 2024);
    });

    it('should return null year for empty date', () => {
      const m = tmdbMovie(1, 'Movie', { release_date: '' });
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.year, null);
    });

    it('should return null year for missing date fields', () => {
      const m = { id: 1, title: 'No Date' };
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.year, null);
    });
  });

  describe('TV show name fallback', () => {
    it('should use name field when title is missing (TV shows)', () => {
      const m = { id: 100, name: 'Breaking Bad', first_air_date: '2008-01-20' };
      const result = mapTmdbResult(m, 'tv');
      assert.equal(result.title, 'Breaking Bad');
    });

    it('should prefer title over name when both exist', () => {
      const m = { id: 100, title: 'Title', name: 'Name', release_date: '2026-01-01' };
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.title, 'Title');
    });

    it('should use first_air_date for TV show year', () => {
      const m = { id: 100, name: 'Show', first_air_date: '2020-06-15' };
      const result = mapTmdbResult(m, 'tv');
      assert.equal(result.year, 2020);
    });
  });

  describe('missing/null fields', () => {
    it('should return empty string for cover when poster_path is null', () => {
      const m = tmdbMovie(1, 'Movie', { poster_path: null });
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.cover, '');
    });

    it('should return empty string for cover when poster_path is undefined', () => {
      const m = { id: 1, title: 'Movie', release_date: '2026-01-01' };
      delete m.poster_path;
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.cover, '');
    });

    it('should return empty string for backdrop when backdrop_path is null', () => {
      const m = tmdbMovie(1, 'Movie', { backdrop_path: null });
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.backdrop, '');
    });

    it('should handle missing overview', () => {
      const m = { id: 1, title: 'Movie', release_date: '2026-01-01' };
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.overview, undefined);
    });

    it('should handle missing genre_ids', () => {
      const m = { id: 1, title: 'Movie', release_date: '2026-01-01' };
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.genres, undefined);
    });

    it('should handle zero vote_average correctly (not falsy)', () => {
      const m = tmdbMovie(1, 'Movie', { vote_average: 0 });
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.rating, 0);
    });

    it('should use name when title is empty string', () => {
      const m = { id: 1, title: '', name: 'Fallback Name', release_date: '2026-01-01' };
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.title, 'Fallback Name');
    });
  });

  describe('extras parameter', () => {
    it('should merge extras into the result', () => {
      const m = tmdbMovie(1, 'Movie');
      const result = mapTmdbResult(m, 'movie', { releaseDate: '2026-07-15', isUpcoming: true });
      assert.equal(result.releaseDate, '2026-07-15');
      assert.equal(result.isUpcoming, true);
      assert.equal(result.id, 'tmdb-1');
      assert.equal(result.title, 'Movie');
    });

    it('should allow extras to override base fields', () => {
      const m = tmdbMovie(1, 'Original Title');
      const result = mapTmdbResult(m, 'movie', { title: 'Overridden Title' });
      assert.equal(result.title, 'Overridden Title');
    });

    it('should work with empty extras object', () => {
      const m = tmdbMovie(1, 'Movie');
      const result = mapTmdbResult(m, 'movie', {});
      assert.equal(result.title, 'Movie');
      assert.equal(result.releaseDate, undefined);
    });

    it('should work with no extras parameter (default)', () => {
      const m = tmdbMovie(1, 'Movie');
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.title, 'Movie');
      assert.equal(result.releaseDate, undefined);
    });

    it('should handle multiple extra fields', () => {
      const m = tmdbMovie(1, 'Movie');
      const result = mapTmdbResult(m, 'movie', {
        releaseDate: '2026-07-15',
        isUpcoming: true,
        customField: 'custom value',
      });
      assert.equal(result.releaseDate, '2026-07-15');
      assert.equal(result.isUpcoming, true);
      assert.equal(result.customField, 'custom value');
    });
  });

  describe('id formatting', () => {
    it('should prefix id with tmdb-', () => {
      const m = { id: 999, title: 'Movie', release_date: '2026-01-01' };
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.id, 'tmdb-999');
    });

    it('should handle large TMDB IDs', () => {
      const m = { id: 999999999, title: 'Movie', release_date: '2026-01-01' };
      const result = mapTmdbResult(m, 'movie');
      assert.equal(result.id, 'tmdb-999999999');
      assert.equal(result.tmdb_id, 999999999);
    });
  });
});
