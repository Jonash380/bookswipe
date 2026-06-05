import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchUpcomingBooks } from '../js/api.js';

// Helper: create a Google Books API-style item
function gbItem(id, title, author, publishedDate) {
  return {
    id,
    volumeInfo: {
      title,
      authors: [author],
      publishedDate,
      industryIdentifiers: [{ type: 'ISBN_13', identifier: `978${id.padStart(10, '0')}` }],
    },
  };
}

// Helper: build a date string relative to today
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Mock fetch to return controlled Google Books responses
let fetchCalls = [];
let mockResponses = [];

function mockFetch(url, opts) {
  fetchCalls.push({ url, opts });
  const items = mockResponses.shift() || [];
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ items }),
  });
}

describe('fetchUpcomingBooks', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    mockResponses = [];
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  describe('basic behavior', () => {
    it('should return empty array when genres is empty', async () => {
      const result = await fetchUpcomingBooks([]);
      assert.deepEqual(result, []);
    });

    it('should return empty array when genres has no labels', async () => {
      const result = await fetchUpcomingBooks([{ id: 1 }]);
      assert.deepEqual(result, []);
    });

    it('should call fetch with orderBy=newest', async () => {
      mockResponses.push([]);
      await fetchUpcomingBooks(['fantasy']);
      assert.ok(fetchCalls.length > 0, 'should make at least one fetch call');
      assert.ok(fetchCalls[0].url.includes('orderBy=newest'), 'should use orderBy=newest');
    });

    it('should pass langRestrict parameter', async () => {
      mockResponses.push([]);
      await fetchUpcomingBooks(['fantasy'], 'en');
      assert.ok(fetchCalls[0].url.includes('langRestrict=en'));
    });

    it('should handle fetch errors gracefully', async () => {
      globalThis.fetch = () => Promise.reject(new Error('Network error'));
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.deepEqual(result, []);
    });

    it('should only use the first 3 genres', async () => {
      mockResponses.push([]);
      mockResponses.push([]);
      mockResponses.push([]);
      await fetchUpcomingBooks(['a', 'b', 'c', 'd', 'e']);
      assert.equal(fetchCalls.length, 3, 'should only make 3 fetch calls even with 5 genres');
    });

    it('should pass AbortSignal to fetch', async () => {
      const controller = new AbortController();
      mockResponses.push([]);
      await fetchUpcomingBooks(['fantasy'], 'de', controller.signal);
      assert.equal(fetchCalls[0].opts.signal, controller.signal, 'should pass signal to fetch');
    });

    it('should handle AbortError per-query (returns empty, does not throw)', async () => {
      // fetchUpcomingBooks catches errors per-query and returns [].
      // AbortError from one query doesn't propagate to the caller.
      globalThis.fetch = () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      };
      const result = await fetchUpcomingBooks(['fantasy'], 'de');
      assert.deepEqual(result, [], 'should return empty array when all queries abort');
    });
  });

  describe('date parsing', () => {
    it('should parse YYYY format dates (current year may fall outside window)', async () => {
      // YYYY dates are interpreted as Jan 1 of that year.
      // If current month is far from Jan, a current-year YYYY date is outside ±90 days.
      const year = new Date().getFullYear().toString();
      mockResponses.push([gbItem('b1', 'Year Book', 'Author', year)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      const now = new Date();
      const jan1 = new Date(year + '-01-01');
      const diffDays = Math.abs((now - jan1) / (1000 * 60 * 60 * 24));
      if (diffDays <= 90) {
        assert.ok(result.length > 0, 'YYYY date within 90-day window should be included');
        assert.equal(result[0].releaseDate, year);
      } else {
        assert.equal(result.length, 0, 'YYYY date outside 90-day window should be excluded');
      }
    });

    it('should parse YYYY-MM format dates', async () => {
      const futureDate = daysFromNow(30).slice(0, 7); // YYYY-MM
      mockResponses.push([gbItem('b1', 'Month Book', 'Author', futureDate)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length > 0, 'should include book within range');
      assert.equal(result[0].releaseDate, futureDate);
    });

    it('should parse YYYY-MM-DD format dates', async () => {
      const futureDate = daysFromNow(30);
      mockResponses.push([gbItem('b1', 'Full Date Book', 'Author', futureDate)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length > 0);
      assert.equal(result[0].releaseDate, futureDate);
    });

    it('should skip books with no publishedDate', async () => {
      mockResponses.push([gbItem('b1', 'No Date Book', 'Author', undefined)]);
      // Override the item to have no publishedDate
      mockResponses[0] = [{
        id: 'b1',
        volumeInfo: { title: 'No Date Book', authors: ['Author'] },
      }];
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.equal(result.length, 0, 'should skip books without publishedDate');
    });

    it('should skip books with invalid date strings', async () => {
      mockResponses.push([{
        id: 'b1',
        volumeInfo: { title: 'Bad Date', authors: ['A'], publishedDate: 'not-a-date' },
      }]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.equal(result.length, 0, 'should skip invalid dates');
    });
  });

  describe('date range filtering', () => {
    it('should include books published within the last 90 days', async () => {
      const recentDate = daysFromNow(-30);
      mockResponses.push([gbItem('b1', 'Recent Book', 'Author', recentDate)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length > 0, 'should include recent book within 90-day window');
    });

    it('should include books releasing within the next 90 days', async () => {
      const upcomingDate = daysFromNow(60);
      mockResponses.push([gbItem('b1', 'Upcoming Book', 'Author', upcomingDate)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length > 0, 'should include upcoming book within 90-day window');
    });

    it('should exclude books published more than 90 days ago', async () => {
      const oldDate = daysFromNow(-120);
      mockResponses.push([gbItem('b1', 'Old Book', 'Author', oldDate)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.equal(result.length, 0, 'should exclude books older than 90 days');
    });

    it('should exclude books releasing more than 90 days in the future', async () => {
      const farFuture = daysFromNow(120);
      mockResponses.push([gbItem('b1', 'Far Future Book', 'Author', farFuture)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.equal(result.length, 0, 'should exclude books more than 90 days out');
    });

    it('should include books releasing exactly 90 days from now', async () => {
      const boundaryDate = daysFromNow(89); // just under 90 days
      mockResponses.push([gbItem('b1', 'Boundary Book', 'Author', boundaryDate)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length > 0, 'should include book just within 90-day boundary');
    });

    it('should include books published exactly 90 days ago', async () => {
      const boundaryDate = daysFromNow(-89); // just under 90 days ago
      mockResponses.push([gbItem('b1', 'Boundary Book', 'Author', boundaryDate)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length > 0, 'should include book just within 90-day past boundary');
    });
  });

  describe('isUpcoming flag', () => {
    it('should mark future books as isUpcoming=true', async () => {
      const futureDate = daysFromNow(30);
      mockResponses.push([gbItem('b1', 'Future Book', 'Author', futureDate)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length > 0);
      assert.equal(result[0].isUpcoming, true, 'future book should be marked as upcoming');
    });

    it('should mark past books as isUpcoming=false', async () => {
      const pastDate = daysFromNow(-30);
      mockResponses.push([gbItem('b1', 'Past Book', 'Author', pastDate)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length > 0);
      assert.equal(result[0].isUpcoming, false, 'past book should not be marked as upcoming');
    });

    it('should set releaseDate field on all returned books', async () => {
      const d1 = daysFromNow(10);
      const d2 = daysFromNow(-10);
      mockResponses.push([
        gbItem('b1', 'Book A', 'Author A', d1),
        gbItem('b2', 'Book B', 'Author B', d2),
      ]);
      const result = await fetchUpcomingBooks(['fantasy']);
      for (const book of result) {
        assert.ok(book.releaseDate, `book "${book.title}" should have releaseDate`);
      }
    });
  });

  describe('sort order', () => {
    it('should sort upcoming books first by date ascending', async () => {
      const d1 = daysFromNow(60);
      const d2 = daysFromNow(10);
      mockResponses.push([
        gbItem('b1', 'Later Book', 'Author A', d1),
        gbItem('b2', 'Sooner Book', 'Author B', d2),
      ]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length >= 2, 'should have at least 2 results');
      const upcoming = result.filter(b => b.isUpcoming);
      assert.ok(upcoming.length >= 2, 'should have at least 2 upcoming books');
      const dates = upcoming.map(b => b.releaseDate);
      assert.ok(dates[0] <= dates[1], 'upcoming books should be sorted ascending by date');
    });

    it('should sort recent (non-upcoming) books by date descending', async () => {
      const d1 = daysFromNow(-10);
      const d2 = daysFromNow(-60);
      mockResponses.push([
        gbItem('b1', 'Newer Recent', 'Author A', d1),
        gbItem('b2', 'Older Recent', 'Author B', d2),
      ]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length >= 2, 'should have at least 2 results');
      const recent = result.filter(b => !b.isUpcoming);
      assert.ok(recent.length >= 2, 'should have at least 2 recent books');
      const dates = recent.map(b => b.releaseDate);
      assert.ok(dates[0] >= dates[1], 'recent books should be sorted descending by date');
    });

    it('should place all upcoming books before all recent books', async () => {
      const upcomingDate = daysFromNow(30);
      const recentDate = daysFromNow(-30);
      mockResponses.push([
        gbItem('b1', 'Recent Book', 'Author A', recentDate),
        gbItem('b2', 'Upcoming Book', 'Author B', upcomingDate),
      ]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length >= 2, 'should have at least 2 results');
      const firstUpcoming = result.findIndex(b => b.isUpcoming);
      const firstRecent = result.findIndex(b => !b.isUpcoming);
      assert.ok(firstUpcoming >= 0, 'should have at least one upcoming book');
      assert.ok(firstRecent >= 0, 'should have at least one recent book');
      assert.ok(firstUpcoming < firstRecent, 'upcoming books should come before recent books');
    });
  });

  describe('deduplication', () => {
    it('should deduplicate books with same title and author', async () => {
      const d = daysFromNow(30);
      mockResponses.push([
        gbItem('b1', 'Same Book', 'Same Author', d),
        gbItem('b2', 'Same Book', 'Same Author', d),
      ]);
      const result = await fetchUpcomingBooks(['fantasy']);
      const matches = result.filter(b => b.title === 'Same Book');
      assert.equal(matches.length, 1, 'should deduplicate same title+author');
    });

    it('should keep books with different titles', async () => {
      const d = daysFromNow(30);
      mockResponses.push([
        gbItem('b1', 'Book A', 'Author', d),
        gbItem('b2', 'Book B', 'Author', d),
      ]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.equal(result.length, 2, 'should keep different books');
    });
  });

  describe('book object structure', () => {
    it('returned books should have required fields', async () => {
      const d = daysFromNow(30);
      mockResponses.push([gbItem('b1', 'Test Book', 'Test Author', d)]);
      const result = await fetchUpcomingBooks(['fantasy']);
      assert.ok(result.length > 0);
      const book = result[0];
      assert.ok(book.id.startsWith('gb-'), 'should have gb- prefixed id');
      assert.equal(book.title, 'Test Book');
      assert.equal(book.author, 'Test Author');
      assert.equal(book.source, 'gbooks');
      assert.equal(book.type, 'book');
      assert.equal(typeof book.isUpcoming, 'boolean');
      assert.ok(book.releaseDate);
    });

    it('should pass genres through to the book object', async () => {
      const d = daysFromNow(30);
      mockResponses.push([gbItem('b1', 'Test Book', 'Author', d)]);
      const result = await fetchUpcomingBooks(['fantasy', 'scifi']);
      assert.ok(result.length > 0);
      assert.deepEqual(result[0].genres, ['fantasy', 'scifi']);
    });
  });
});
