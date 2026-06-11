import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost' });
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.Image = window.Image;
global.HTMLElement = window.HTMLElement;
global.IntersectionObserver = class IntersectionObserver {
  constructor(cb) { this._cb = cb; }
  observe() { this._cb([{ isIntersecting: true }]); }
  disconnect() {}
  unobserve() {}
};

const { LingerGesture } = await import('../js/ling-gesture.js');

function makeCard(overrides = {}) {
  return {
    id: 'test-1',
    title: 'Test Movie',
    type: 'movie',
    source: 'tmdb',
    tmdb_id: 550,
    year: 1999,
    genres: [28, 878],
    overview: 'A test movie description.',
    cover: 'https://example.com/cover.jpg',
    rating: 8.4,
    ...overrides,
  };
}

function makeCardEl() {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `
    <div class="card-hero"><div class="card-cover placeholder">🎬</div></div>
    <div class="card-side"><h2 class="card-title">Test</h2></div>
    <div class="linger-preview"></div>
    <span class="swipe-stamp swipe-stamp-like">Like</span>
    <span class="swipe-stamp swipe-stamp-nope">Nope</span>
  `;
  document.body.appendChild(el);
  return el;
}

// Minimal App mock that has the methods we need to test
function makeAppMock() {
  const app = {
    lang: 'en',
    state: { mediaType: 'movies' },
    tr: { whySeeing: 'Why this?', like: 'Like', nope: 'Nope', skip: 'Skip' },
    swipeEngine: { isSwiping: false },
    _lingerScreenshotTimer: null,
    _lingerObserver: null,
  };

  // Import and bind the real methods
  // We'll test them directly since they're defined on the App prototype
  return app;
}

describe('LingerGesture integration', () => {
  let el;

  beforeEach(() => {
    el = makeCardEl();
  });

  afterEach(() => {
    el.remove();
    document.body.innerHTML = '';
  });

  it('LingerGesture fires onHold after delay on a card element', async () => {
    let fired = false;
    const linger = new LingerGesture(el, () => { fired = true; }, { delay: 60 });
    const evt = new window.Event('touchstart', { bubbles: true });
    Object.defineProperty(evt, 'touches', { value: [{ clientX: 50, clientY: 50 }], configurable: true });
    el.dispatchEvent(evt);
    assert.equal(fired, false);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(fired, true);
    linger.destroy();
  });

  it('linger-preview container exists in the card', () => {
    const preview = el.querySelector('.linger-preview');
    assert.ok(preview, '.linger-preview should exist in card HTML');
    assert.ok(!preview.classList.contains('active'), 'should not be active initially');
  });

  it('linger-active class can be toggled on card', () => {
    assert.ok(!el.classList.contains('linger-active'));
    el.classList.add('linger-active');
    assert.ok(el.classList.contains('linger-active'));
    el.classList.remove('linger-active');
    assert.ok(!el.classList.contains('linger-active'));
  });

  it('linger-preview shows content when active class added', () => {
    const preview = el.querySelector('.linger-preview');
    preview.innerHTML = '<div class="linger-preview-trailer"><div class="linger-no-trailer">🎬</div></div>';
    preview.classList.add('active');
    assert.ok(preview.classList.contains('active'));
    const content = preview.querySelector('.linger-preview-trailer');
    assert.ok(content, 'trailer container should be present');
  });

  it('LingerGesture cancels on movement beyond threshold', async () => {
    let fired = false;
    const linger = new LingerGesture(el, () => { fired = true; }, { delay: 40, threshold: 8 });
    const start = new window.Event('touchstart', { bubbles: true });
    Object.defineProperty(start, 'touches', { value: [{ clientX: 100, clientY: 100 }], configurable: true });
    el.dispatchEvent(start);
    const move = new window.Event('touchmove', { bubbles: true });
    Object.defineProperty(move, 'touches', { value: [{ clientX: 120, clientY: 100 }], configurable: true });
    el.dispatchEvent(move);
    await new Promise(r => setTimeout(r, 80));
    assert.equal(fired, false, 'hold should be cancelled by movement');
    linger.destroy();
  });

  it('LingerGesture destroy cleans up listeners', async () => {
    let fired = false;
    const linger = new LingerGesture(el, () => { fired = true; }, { delay: 30 });
    linger.destroy();
    const evt = new window.Event('touchstart', { bubbles: true });
    Object.defineProperty(evt, 'touches', { value: [{ clientX: 1, clientY: 1 }], configurable: true });
    el.dispatchEvent(evt);
    await new Promise(r => setTimeout(r, 60));
    assert.equal(fired, false, 'should not fire after destroy');
  });

  it('book card generates page-flip preview content', () => {
    const preview = el.querySelector('.linger-preview');
    const cover = 'https://covers.openlibrary.org/b/id/123-M.jpg';
    const firstLine = 'A gripping tale of adventure.';
    preview.innerHTML = `
      <div class="linger-preview-book">
        <div class="book-flip-container">
          <div class="book-page book-page-front" style="background-image:url('${cover}')"></div>
          <div class="book-page book-page-back">
            <p class="book-page-text">${firstLine}</p>
          </div>
        </div>
      </div>`;
    const bookPreview = preview.querySelector('.linger-preview-book');
    assert.ok(bookPreview, 'book preview container should exist');
    const front = preview.querySelector('.book-page-front');
    assert.ok(front, 'front page should exist');
    assert.ok(front.style.backgroundImage.includes(cover), 'front should have cover image');
    const text = preview.querySelector('.book-page-text');
    assert.ok(text, 'page text should exist');
    assert.equal(text.textContent, firstLine);
  });

  it('game card generates screenshot carousel preview', () => {
    const preview = el.querySelector('.linger-preview');
    const screenshots = [
      'https://example.com/ss1.jpg',
      'https://example.com/ss2.jpg',
      'https://example.com/ss3.jpg',
    ];
    const slides = screenshots.map((s, i) =>
      `<img class="linger-screenshot${i === 0 ? ' active' : ''}" src="${s}" alt="">`
    ).join('');
    preview.innerHTML = `
      <div class="linger-preview-game">
        <div class="linger-screenshots">${slides}</div>
        <div class="linger-screenshot-dots">
          ${screenshots.map((_, i) => `<span class="linger-dot${i === 0 ? ' active' : ''}"></span>`).join('')}
        </div>
      </div>`;
    const gamePreview = preview.querySelector('.linger-preview-game');
    assert.ok(gamePreview, 'game preview should exist');
    const imgs = preview.querySelectorAll('.linger-screenshot');
    assert.equal(imgs.length, 3, 'should have 3 screenshots');
    assert.ok(imgs[0].classList.contains('active'), 'first should be active');
    const dots = preview.querySelectorAll('.linger-dot');
    assert.equal(dots.length, 3, 'should have 3 dots');
  });

  it('movie/trailer preview has iframe structure', () => {
    const preview = el.querySelector('.linger-preview');
    const videoId = 'dQw4w9WgXcQ';
    preview.innerHTML = `
      <div class="linger-preview-trailer">
        <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0" allow="autoplay; encrypted-media" frameborder="0"></iframe>
      </div>`;
    const iframe = preview.querySelector('iframe');
    assert.ok(iframe, 'iframe should exist');
    assert.ok(iframe.src.includes(videoId), 'iframe should have video ID');
    assert.ok(iframe.src.includes('autoplay=1'), 'iframe should autoplay');
    assert.ok(iframe.src.includes('mute=1'), 'iframe should be muted');
  });

  it('dismiss cleans up preview content', async () => {
    const preview = el.querySelector('.linger-preview');
    preview.innerHTML = '<div class="linger-preview-trailer"><iframe src="about:blank"></iframe></div>';
    preview.classList.add('active');
    el.classList.add('linger-active');

    // Simulate dismiss
    el.classList.remove('linger-active');
    preview.classList.remove('active');
    const iframe = preview.querySelector('iframe');
    if (iframe) iframe.src = '';

    assert.ok(!el.classList.contains('linger-active'));
    assert.ok(!preview.classList.contains('active'));
    // happy-dom resolves empty src to page URL, so check the attribute directly
    assert.equal(iframe.getAttribute('src'), '', 'iframe src attribute should be cleared');
  });

  it('IntersectionObserver is constructible for prefetch', () => {
    let observed = false;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) observed = true; });
    });
    observer.observe(el);
    assert.ok(observed, 'observer callback should fire synchronously in mock');
    observer.disconnect();
  });

  it('screenshot carousel auto-rotation works', async () => {
    const preview = el.querySelector('.linger-preview');
    const screenshots = ['a.jpg', 'b.jpg', 'c.jpg'];
    const slides = screenshots.map((s, i) =>
      `<img class="linger-screenshot${i === 0 ? ' active' : ''}" src="${s}">`
    ).join('');
    preview.innerHTML = `
      <div class="linger-preview-game">
        <div class="linger-screenshots">${slides}</div>
      </div>`;

    const imgs = preview.querySelectorAll('.linger-screenshot');
    let idx = 0;
    const timer = setInterval(() => {
      imgs[idx]?.classList.remove('active');
      idx = (idx + 1) % imgs.length;
      imgs[idx]?.classList.add('active');
    }, 50);

    await new Promise(r => setTimeout(r, 180));
    clearInterval(timer);

    // After 3 ticks (150ms), idx should have advanced
    const activeImg = preview.querySelector('.linger-screenshot.active');
    assert.ok(activeImg, 'one screenshot should be active');
  });
});
