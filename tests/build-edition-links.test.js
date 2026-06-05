import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEditionLinks } from '../js/api.js';

describe('buildEditionLinks', () => {

  describe('Open Library id path', () => {
    it('should produce an Open Library link when id starts with ol-', () => {
      const item = { id: 'ol-/works/OL12345W', title: 'Test Book', author: 'Author' };
      const links = buildEditionLinks(item);
      const ol = links.find(l => l.source === 'openlibrary');
      assert.ok(ol, 'should have an openlibrary link');
      assert.equal(ol.name, 'Open Library');
      assert.equal(ol.url, 'https://openlibrary.org/works/OL12345W');
      assert.equal(ol.icon, '📖');
    });

    it('should handle ol- id with simple key', () => {
      const item = { id: 'ol-/books/OL999M', title: 'Book', author: 'A' };
      const links = buildEditionLinks(item);
      const ol = links.find(l => l.source === 'openlibrary');
      assert.ok(ol);
      assert.equal(ol.url, 'https://openlibrary.org/books/OL999M');
    });
  });

  describe('Google Books id path', () => {
    it('should produce a Google Books link when id starts with gb-', () => {
      const item = { id: 'gb-abc123XYZ', title: 'Test Book', author: 'Author' };
      const links = buildEditionLinks(item);
      const gb = links.find(l => l.source === 'gbooks');
      assert.ok(gb, 'should have a gbooks link');
      assert.equal(gb.name, 'Google Books');
      assert.equal(gb.url, 'https://books.google.com/books?id=abc123XYZ');
      assert.equal(gb.icon, '📘');
    });
  });

  describe('item with both OL and GB ids', () => {
    it('should produce links for both sources when id is ol- and _editions has gb entry', () => {
      const item = {
        id: 'ol-/works/OL1W',
        title: 'Book',
        author: 'A',
        _editions: [
          { id: 'gb-xyz789', source: 'gbooks', isbn: '9781234567890' },
        ],
      };
      const links = buildEditionLinks(item);
      assert.ok(links.some(l => l.source === 'openlibrary'), 'should have OL link from id');
      assert.ok(links.some(l => l.source === 'gbooks'), 'should have GB link from editions');
    });
  });

  describe('_editions array', () => {
    it('should add Open Library link from _editions when id is not ol-', () => {
      const item = {
        id: 'gb-someId',
        title: 'Book',
        author: 'A',
        _editions: [
          { id: 'ol-/works/OL55W', source: 'openlibrary', isbn: '9780000000001' },
        ],
      };
      const links = buildEditionLinks(item);
      const ol = links.find(l => l.source === 'openlibrary');
      assert.ok(ol, 'should have OL link from editions');
      assert.equal(ol.url, 'https://openlibrary.org/works/OL55W');
    });

    it('should add Google Books link from _editions when id is not gb-', () => {
      const item = {
        id: 'ol-/works/OL1W',
        title: 'Book',
        author: 'A',
        _editions: [
          { id: 'gb-edition1', source: 'gbooks', isbn: '9781111111111' },
        ],
      };
      const links = buildEditionLinks(item);
      const gb = links.find(l => l.source === 'gbooks');
      assert.ok(gb, 'should have GB link from editions');
      assert.equal(gb.url, 'https://books.google.com/books?id=edition1');
    });

    it('should NOT duplicate Open Library link when id already provides one', () => {
      const item = {
        id: 'ol-/works/OL1W',
        title: 'Book',
        author: 'A',
        _editions: [
          { id: 'ol-/works/OL99W', source: 'openlibrary', isbn: '9780000000002' },
        ],
      };
      const links = buildEditionLinks(item);
      const olLinks = links.filter(l => l.source === 'openlibrary');
      assert.equal(olLinks.length, 1, 'should not duplicate OL link');
      assert.equal(olLinks[0].url, 'https://openlibrary.org/works/OL1W', 'should keep id-based link');
    });

    it('should NOT duplicate Google Books link when id already provides one', () => {
      const item = {
        id: 'gb-primary',
        title: 'Book',
        author: 'A',
        _editions: [
          { id: 'gb-secondary', source: 'gbooks', isbn: '9782222222222' },
        ],
      };
      const links = buildEditionLinks(item);
      const gbLinks = links.filter(l => l.source === 'gbooks');
      assert.equal(gbLinks.length, 1, 'should not duplicate GB link');
      assert.equal(gbLinks[0].url, 'https://books.google.com/books?id=primary', 'should keep id-based link');
    });

    it('should ignore editions with non-matching id prefixes', () => {
      const item = {
        id: 'unknown-123',
        title: 'Book',
        author: 'A',
        _editions: [
          { id: 'tmdb-456', source: 'tmdb' },
          { id: 'no-prefix', source: 'openlibrary' },
        ],
      };
      const links = buildEditionLinks(item);
      assert.ok(!links.some(l => l.source === 'openlibrary'), 'should not have OL link for non-ol- id');
      assert.ok(!links.some(l => l.source === 'gbooks'), 'should not have GB link for non-gb- id');
    });

    it('should handle empty _editions array', () => {
      const item = { id: 'gb-abc', title: 'Book', author: 'A', _editions: [] };
      const links = buildEditionLinks(item);
      // Only the id-based GB link
      assert.equal(links.length, 1);
      assert.equal(links[0].source, 'gbooks');
    });
  });

  describe('ISBN fallback', () => {
    it('should add Thalia and Amazon links when isbn is present', () => {
      const item = { id: 'unknown-1', title: 'Book', author: 'A', isbn: '9783456789012' };
      const links = buildEditionLinks(item);
      const thalia = links.find(l => l.source === 'thalia');
      const amazon = links.find(l => l.source === 'amazon');
      assert.ok(thalia, 'should have Thalia link');
      assert.ok(amazon, 'should have Amazon link');
      assert.ok(thalia.url.includes('9783456789012'), 'Thalia URL should contain ISBN');
      assert.ok(amazon.url.includes('9783456789012'), 'Amazon URL should contain ISBN');
      assert.equal(thalia.icon, '🏪');
      assert.equal(amazon.icon, '📦');
    });

    it('should add Thalia and Amazon links when isbn13 is present (fallback from isbn)', () => {
      const item = { id: 'unknown-2', title: 'Book', author: 'A', isbn: null, isbn13: '9781234567890' };
      const links = buildEditionLinks(item);
      const thalia = links.find(l => l.source === 'thalia');
      const amazon = links.find(l => l.source === 'amazon');
      assert.ok(thalia, 'should have Thalia link via isbn13');
      assert.ok(amazon, 'should have Amazon link via isbn13');
      assert.ok(thalia.url.includes('9781234567890'));
    });

    it('should prefer isbn over isbn13', () => {
      const item = {
        id: 'unknown-3', title: 'Book', author: 'A',
        isbn: '9780000000001', isbn13: '9789999999999',
      };
      const links = buildEditionLinks(item);
      const thalia = links.find(l => l.source === 'thalia');
      assert.ok(thalia.url.includes('9780000000001'), 'should use isbn, not isbn13');
    });

    it('should add ISBN-based retailer links alongside OL/GB links', () => {
      const item = {
        id: 'ol-/works/OL1W', title: 'Book', author: 'A',
        isbn: '9783000000001',
      };
      const links = buildEditionLinks(item);
      assert.ok(links.some(l => l.source === 'openlibrary'), 'should have OL link');
      assert.ok(links.some(l => l.source === 'thalia'), 'should have Thalia link');
      assert.ok(links.some(l => l.source === 'amazon'), 'should have Amazon link');
    });
  });

  describe('title+author fallback', () => {
    it('should add Thalia and Amazon search links when no other links exist', () => {
      const item = { id: 'unknown-99', title: 'Some Book', author: 'Jane Doe' };
      const links = buildEditionLinks(item);
      assert.equal(links.length, 2, 'should have exactly 2 fallback links');
      const thalia = links[0];
      const amazon = links[1];
      assert.equal(thalia.source, 'thalia');
      assert.equal(amazon.source, 'amazon');
      // encodeURIComponent uses %20 for spaces
      const encTitle = encodeURIComponent('Some Book');
      const encAuthor = encodeURIComponent('Jane Doe');
      assert.ok(thalia.url.includes(encTitle), 'Thalia URL should contain encoded title');
      assert.ok(thalia.url.includes(encAuthor), 'Thalia URL should contain encoded author');
      assert.ok(amazon.url.includes(encTitle), 'Amazon URL should contain encoded title');
      assert.ok(amazon.url.includes(encAuthor), 'Amazon URL should contain encoded author');
    });

    it('should URL-encode special characters in title and author', () => {
      const item = { id: 'x', title: 'Ü & Ö: A Story', author: 'José García' };
      const links = buildEditionLinks(item);
      assert.ok(links.length >= 2, 'should produce fallback links');
      // encodeURIComponent produces %20 for spaces (not +), and encoded umlauts
      assert.ok(links[0].url.includes(encodeURIComponent('Ü & Ö: A Story')));
    });

    it('should use title-only fallback when author is empty', () => {
      const item = { id: 'y', title: 'Anonymous Work', author: '' };
      const links = buildEditionLinks(item);
      assert.equal(links.length, 2);
      assert.ok(links[0].url.includes(encodeURIComponent('Anonymous Work')));
    });

    it('should NOT use title fallback when ISBN links already exist', () => {
      const item = { id: 'z', title: 'Book', author: 'A', isbn: '9781111111111' };
      const links = buildEditionLinks(item);
      // ISBN produces Thalia+Amazon, so fallback should not activate
      const thaliaLinks = links.filter(l => l.source === 'thalia');
      assert.equal(thaliaLinks.length, 1, 'should have exactly one Thalia link (from ISBN, not fallback)');
    });

    it('should return empty array when item has no id, no isbn, and no title', () => {
      const item = {};
      const links = buildEditionLinks(item);
      assert.deepEqual(links, [], 'should return empty array for empty item');
    });

    it('should return empty array when title is empty string and no other links', () => {
      const item = { id: '', title: '', author: '' };
      const links = buildEditionLinks(item);
      assert.deepEqual(links, [], 'should return empty array for blank item');
    });

    it('should NOT produce retailer links when only isbn10 is present and no title fallback', () => {
      // The function checks isbn || isbn13 but NOT isbn10 directly.
      // No title/author means the fallback can't kick in either.
      const item = { id: 'z', title: '', author: '', isbn: null, isbn13: null, isbn10: '1234567890' };
      const links = buildEditionLinks(item);
      assert.ok(!links.some(l => l.source === 'thalia'), 'should not have Thalia link for isbn10-only');
      assert.ok(!links.some(l => l.source === 'amazon'), 'should not have Amazon link for isbn10-only');
      assert.equal(links.length, 0, 'should have no links at all');
    });
  });

  describe('link structure', () => {
    it('each link should have name, url, icon, and source fields', () => {
      const item = {
        id: 'ol-/works/OL1W',
        title: 'Book',
        author: 'A',
        isbn: '9781234567890',
        _editions: [{ id: 'gb-e1', source: 'gbooks', isbn: '9781234567890' }],
      };
      const links = buildEditionLinks(item);
      for (const link of links) {
        assert.equal(typeof link.name, 'string', 'name should be a string');
        assert.equal(typeof link.url, 'string', 'url should be a string');
        assert.equal(typeof link.icon, 'string', 'icon should be a string');
        assert.equal(typeof link.source, 'string', 'source should be a string');
        assert.ok(link.url.startsWith('https://'), `url should start with https://: ${link.url}`);
      }
    });

    it('should have unique source values (no duplicate sources)', () => {
      const item = {
        id: 'ol-/works/OL1W',
        title: 'Book',
        author: 'A',
        isbn: '9781234567890',
        _editions: [
          { id: 'ol-/works/OL99W', source: 'openlibrary' },
          { id: 'gb-e1', source: 'gbooks' },
        ],
      };
      const links = buildEditionLinks(item);
      const sources = links.map(l => l.source);
      const unique = [...new Set(sources)];
      assert.equal(sources.length, unique.length, 'all sources should be unique');
    });
  });
});
