import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window({
  url: 'http://localhost',
});
global.window = window;
global.document = window.document;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);

Object.defineProperty(global, 'navigator', {
  value: { vibrate: () => {} },
  writable: true,
  configurable: true,
});

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

const {
  escapeHTML, getTMDBGenreName, getTMDBGenreMap, TMDB_GENRE_MAP,
  safeGetJSON, safeSetJSON, debounce, shuffleArray, clamp,
  getGenreIcon, createImageWithFallback
} = await import('../js/utils.js');

describe('escapeHTML', () => {
  it('should escape ampersands', () => {
    assert.equal(escapeHTML('a&b'), 'a&amp;b');
  });
  it('should escape angle brackets', () => {
    assert.equal(escapeHTML('<script>'), '&lt;script&gt;');
  });
  it('should escape double quotes', () => {
    assert.equal(escapeHTML('a"b'), 'a&quot;b');
  });
  it('should escape single quotes', () => {
    assert.equal(escapeHTML("a'b"), 'a&#39;b');
  });
  it('should return empty string for falsy', () => {
    assert.equal(escapeHTML(''), '');
    assert.equal(escapeHTML(null), '');
    assert.equal(escapeHTML(undefined), '');
  });
  it('should handle numbers', () => {
    assert.equal(escapeHTML(42), '42');
  });
  it('should handle XSS payloads', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const escaped = escapeHTML(payload);
    assert.ok(!escaped.includes('<img'));
    assert.ok(escaped.includes('&lt;img'));
  });
});

describe('getTMDBGenreName', () => {
  it('should return German by default', () => {
    assert.equal(getTMDBGenreName(28), 'Action');
    assert.equal(getTMDBGenreName(27), 'Horror');
  });
  it('should return English when specified', () => {
    assert.equal(getTMDBGenreName(28, 'en'), 'Action');
    assert.equal(getTMDBGenreName(878, 'en'), 'Science Fiction');
  });
  it('should return empty string for unknown', () => {
    assert.equal(getTMDBGenreName(99999), '');
  });
});

describe('getTMDBGenreMap', () => {
  it('should return German map by default', () => {
    const map = getTMDBGenreMap();
    assert.equal(map[28], 'Action');
    assert.equal(map[878], 'Science-Fiction');
  });
  it('should return English map', () => {
    const map = getTMDBGenreMap('en');
    assert.equal(map[878], 'Science Fiction');
  });
});

describe('TMDB_GENRE_MAP', () => {
  it('should have expected genres', () => {
    assert.ok(TMDB_GENRE_MAP[28]);
    assert.ok(TMDB_GENRE_MAP[14]);
    assert.ok(TMDB_GENRE_MAP[27]);
  });
});

describe('safeGetJSON / safeSetJSON', () => {
  beforeEach(() => { localStorage.clear(); });

  it('should store and retrieve JSON', () => {
    safeSetJSON('test-key', { a: 1, b: [2, 3] });
    const result = safeGetJSON('test-key', {});
    assert.deepEqual(result, { a: 1, b: [2, 3] });
  });
  it('should return default on missing key', () => {
    assert.deepEqual(safeGetJSON('nonexistent', { x: 1 }), { x: 1 });
  });
  it('should return default on corrupt data', () => {
    localStorage.setItem('corrupt', '{invalid json');
    assert.deepEqual(safeGetJSON('corrupt', 'fallback'), 'fallback');
  });
  it('should handle null default', () => {
    assert.equal(safeGetJSON('missing', null), null);
  });
});

describe('debounce', () => {
  it('should delay execution', async () => {
    let called = false;
    const fn = debounce(() => { called = true; }, 50);
    fn();
    assert.equal(called, false);
    await new Promise(r => setTimeout(r, 70));
    assert.equal(called, true);
  });
  it('should reset timer on multiple calls', async () => {
    let count = 0;
    const fn = debounce(() => { count++; }, 50);
    fn();
    fn();
    fn();
    await new Promise(r => setTimeout(r, 70));
    assert.equal(count, 1);
  });
});

describe('shuffleArray', () => {
  it('should return same length', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = shuffleArray(arr);
    assert.equal(result.length, 5);
  });
  it('should contain same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    shuffleArray(arr);
    assert.deepEqual(arr.sort(), [1, 2, 3, 4, 5]);
  });
  it('should handle empty array', () => {
    assert.deepEqual(shuffleArray([]), []);
  });
  it('should handle single element', () => {
    assert.deepEqual(shuffleArray([1]), [1]);
  });
});

describe('clamp', () => {
  it('should clamp below min', () => {
    assert.equal(clamp(-5, 0, 100), 0);
  });
  it('should clamp above max', () => {
    assert.equal(clamp(150, 0, 100), 100);
  });
  it('should pass through valid values', () => {
    assert.equal(clamp(50, 0, 100), 50);
  });
  it('should handle boundary values', () => {
    assert.equal(clamp(0, 0, 100), 0);
    assert.equal(clamp(100, 0, 100), 100);
  });
});

describe('getGenreIcon', () => {
  it('should return icon for known movie genre ID', () => {
    const icon = getGenreIcon(28, 'movies');
    assert.ok(typeof icon === 'string');
    assert.ok(icon.length > 0);
  });
  it('should return icon for known book genre string', () => {
    const icon = getGenreIcon('fantasy', 'books');
    assert.equal(icon, '🧙');
  });
  it('should return icon for known game genre', () => {
    const icon = getGenreIcon('RPG', 'games');
    assert.equal(icon, '⚔️');
  });
  it('should return fallback for unknown', () => {
    assert.equal(getGenreIcon(99999, 'movies'), '🏷️');
  });
  it('should return book emoji for unknown book genre', () => {
    assert.equal(getGenreIcon('unknown', 'books'), '📚');
  });
  it('should return game emoji for unknown game genre', () => {
    assert.equal(getGenreIcon('unknown', 'games'), '🎮');
  });
});

describe('createImageWithFallback', () => {
  it('should return placeholder when no src', () => {
    const html = createImageWithFallback('', 'Title', 'my-class', '📚');
    assert.ok(html.includes('placeholder'));
    assert.ok(html.includes('📚'));
    assert.ok(html.includes('my-class'));
  });
  it('should return img tag with src', () => {
    const html = createImageWithFallback('https://example.com/img.jpg', 'Title', 'cover', '🎬');
    assert.ok(html.includes('<img'));
    assert.ok(html.includes('https://example.com/img.jpg'));
    assert.ok(html.includes('loading="lazy"'));
    assert.ok(html.includes('onerror'));
  });
  it('should escape src and alt', () => {
    const html = createImageWithFallback('"><script>', '"><script>', 'img', '🎬');
    assert.ok(!html.includes('<script>'));
  });
});
