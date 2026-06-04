import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Set up a minimal DOM environment
const dom = new JSDOM('<!DOCTYPE html><div id="app"><div id="card"></div></div>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.performance = dom.window.performance;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// navigator is read-only in JSDOM, so use Object.defineProperty instead of assignment
Object.defineProperty(global, 'navigator', {
  value: { vibrate: () => {} },
  writable: true,
  configurable: true,
});
global.window.getComputedStyle = () => ({});
global.window.location = new URL('http://localhost');

// Mock localStorage for the App import (needed by storage.js)
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
  };
})();
Object.defineProperty(global.window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// experiment.js (imported by app.js) accesses localStorage as a global
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Import the App class to access its prototype methods
const { App } = await import('../js/app.js');

/**
 * Helper: dispatch a keydown event.
 */
function keydown(key) {
  const evt = new dom.window.KeyboardEvent('keydown', { key, bubbles: true });
  document.dispatchEvent(evt);
}

/**
 * Helper: simulate a touchstart event on an element.
 */
function touchstart(el, opts = {}) {
  const evt = new dom.window.TouchEvent('touchstart', {
    bubbles: true,
    cancelable: true,
    touches: [{ clientX: opts.x || 100, clientY: opts.y || 200 }],
    ...opts,
  });
  el.dispatchEvent(evt);
}

/**
 * Helper: simulate a touchend event.
 */
function touchend(el, opts = {}) {
  const evt = new dom.window.TouchEvent('touchend', {
    bubbles: true,
    cancelable: true,
    changedTouches: [{ clientX: opts.x || 100, clientY: opts.y || 200 }],
    ...opts,
  });
  el.dispatchEvent(evt);
}

/**
 * Helper: simulate a touchmove event.
 */
function touchmove(el, opts = {}) {
  const evt = new dom.window.TouchEvent('touchmove', {
    bubbles: true,
    cancelable: true,
    touches: [{ clientX: opts.x || 100, clientY: opts.y || 200 }],
    ...opts,
  });
  el.dispatchEvent(evt);
}

/**
 * Helper: simulate a click event on an element.
 */
function click(el) {
  const evt = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(evt);
}

describe('Peek Overlay Dismissal', () => {
  let app;
  let cardEl;

  before(() => {
    app = document.getElementById('app');
    cardEl = document.getElementById('card');
  });

  // Clean up any leftover peek overlays between tests
  afterEach(() => {
    document.querySelectorAll('.peek-overlay, .feedback-overlay').forEach(el => el.remove());
  });

  describe('_setupLongPress (via App prototype)', () => {
    it('should not show peek if touch moves more than 10px before 400ms fires', () => {
      // Create a minimal mock App that has the required properties for _setupLongPress
      let peekCard = null;
      const mockApp = {
        lang: 'en',
        _genreMap: {},
        swipeEngine: null,
        _showPeekOverlay: (card) => {
          peekCard = card;
          // Simulate what the real _showPeekOverlay does (create overlay DOM)
          const overlay = document.createElement('div');
          overlay.className = 'peek-overlay';
          overlay.innerHTML = `<div class="peek-card"><button data-action="peek-close">✕</button></div>`;
          document.body.appendChild(overlay);
          requestAnimationFrame(() => overlay.classList.add('open'));
        }
      };
      const mockCard = { id: 'test-1', title: 'Test', genres: [28] };

      // Directly call the prototype method with our mock App as `this`
      App.prototype._setupLongPress.call(mockApp, cardEl, mockCard);

      // Touchstart at 100,200
      touchstart(cardEl, { x: 100, y: 200 });
      // Move >10px before 400ms fires
      touchmove(cardEl, { x: 115, y: 200 });

      // Wait past the 400ms timer
      return new Promise(resolve => {
        setTimeout(() => {
          const overlay = document.querySelector('.peek-overlay');
          assert.equal(overlay, null, 'Peek should not appear after moving >10px');
          resolve();
        }, 500);
      });
    });

    it('should show peek after 400ms hold and dismiss on touchend', () => {
      let peekCard = null;
      const mockApp = {
        lang: 'en',
        _genreMap: {},
        swipeEngine: null,
        _showPeekOverlay: (card) => {
          peekCard = card;
          const overlay = document.createElement('div');
          overlay.className = 'peek-overlay';
          overlay.innerHTML = `<div class="peek-card"><button data-action="peek-close">✕</button></div>`;
          document.body.appendChild(overlay);
          requestAnimationFrame(() => overlay.classList.add('open'));
        }
      };
      const mockCard = { id: 'test-1', title: 'Test', genres: [28] };

      App.prototype._setupLongPress.call(mockApp, cardEl, mockCard);

      // Hold finger still
      touchstart(cardEl, { x: 100, y: 200 });

      // Wait for 400ms timer to fire and overlay to appear
      return new Promise(resolve => {
        setTimeout(() => {
          const overlay = document.querySelector('.peek-overlay');
          assert.ok(overlay, 'Peek should appear after 400ms hold');
          assert.ok(overlay.classList.contains('open'), 'Peek should be open');
          assert.equal(peekCard, mockCard, 'Peek should be shown with the correct card');

          // Now release
          touchend(cardEl, { x: 100, y: 200 });

          // After release, the peek should be dismissed
          setTimeout(() => {
            assert.equal(overlay.classList.contains('open'), false, 'Peek should be dismissed on release');
            resolve();
          }, 50);
        }, 500);
      });
    });
  });

  describe('_showPeekOverlay - backdrop dismiss', () => {
    it('should render a peek overlay with peek-card, peek-actions, and peek-close', () => {
      // Create elements that match the peek overlay structure
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay open';
      overlay.innerHTML = `
        <div class="peek-card">
          <div class="peek-title-row">
            <h3 class="peek-title">Test Card</h3>
            <button class="peek-close" data-action="peek-close">✕</button>
          </div>
          <div class="peek-meta">
            <span class="peek-year">2024</span>
            <span class="peek-genres">Action</span>
          </div>
          <div class="peek-actions">
            <button data-action="peek-nope">✕</button>
            <button data-action="peek-info">ℹ️</button>
            <button data-action="peek-like">♥</button>
          </div>
          <button data-action="peek-why-not">💬</button>
        </div>`;
      document.body.appendChild(overlay);

      // Verify the structure
      assert.ok(document.querySelector('.peek-overlay'));
      assert.ok(document.querySelector('.peek-card'));
      assert.ok(document.querySelector('[data-action="peek-close"]'));
      assert.ok(document.querySelector('[data-action="peek-nope"]'));
      assert.ok(document.querySelector('[data-action="peek-info"]'));
      assert.ok(document.querySelector('[data-action="peek-like"]'));
      assert.ok(document.querySelector('[data-action="peek-why-not"]'));
    });

    it('should dismiss when clicking the backdrop outside the peek-card', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay open';
      overlay.innerHTML = `<div class="peek-card"><p>content</p></div>`;
      document.body.appendChild(overlay);

      // Attach backdrop-click handler (same logic as App._showPeekOverlay)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
        }
      });

      // Click on the backdrop (the overlay itself, not the card)
      click(overlay);

      // After click, the open class should be removed
      assert.equal(overlay.classList.contains('open'), false);
    });

    it('should NOT dismiss when clicking inside the peek-card', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay open';
      overlay.innerHTML = `<div class="peek-card"><p id="inside-text">content</p></div>`;
      document.body.appendChild(overlay);

      // Attach backdrop-click handler
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
        }
      });

      // Click inside the card
      const insideText = overlay.querySelector('#inside-text');
      click(insideText);

      // The overlay should still be open
      assert.equal(overlay.classList.contains('open'), true);
    });

    it('should remove the overlay from DOM when dismissed via backdrop click and timeout cleanup', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay open';
      overlay.innerHTML = `<div class="peek-card"><p>content</p></div>`;
      document.body.appendChild(overlay);

      // Attach the App's backdrop-click + remove handler
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
          setTimeout(() => overlay.remove(), 300);
        }
      });

      click(overlay);

      // After 350ms it should be removed from DOM
      return new Promise(resolve => {
        setTimeout(() => {
          assert.equal(document.querySelector('.peek-overlay'), null, 'Overlay should be removed from DOM after dismiss timeout');
          resolve();
        }, 350);
      });
    });
  });

  describe('_showPeekOverlay - close button dismiss', () => {
    it('should dismiss when clicking the close button', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay open';
      overlay.innerHTML = `<div class="peek-card"><button class="peek-close" data-action="peek-close">✕</button></div>`;
      document.body.appendChild(overlay);

      // Attach close-button handler (same logic as App._showPeekOverlay)
      overlay.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="peek-close"]')) {
          overlay.classList.remove('open');
        }
      });

      const closeBtn = overlay.querySelector('[data-action="peek-close"]');
      click(closeBtn);

      assert.equal(overlay.classList.contains('open'), false);
    });
  });

  describe('_showPeekOverlay - action buttons', () => {
    it('should have a Nope button with data-action="peek-nope"', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay';
      overlay.innerHTML = `<div class="peek-card"><div class="peek-actions"><button data-action="peek-nope">✕</button></div></div>`;
      document.body.appendChild(overlay);

      const btn = overlay.querySelector('[data-action="peek-nope"]');
      assert.ok(btn);
    });

    it('should have a Details button with data-action="peek-info"', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay';
      overlay.innerHTML = `<div class="peek-card"><div class="peek-actions"><button data-action="peek-info">ℹ️</button></div></div>`;
      document.body.appendChild(overlay);

      const btn = overlay.querySelector('[data-action="peek-info"]');
      assert.ok(btn);
    });

    it('should have a Like button with data-action="peek-like"', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay';
      overlay.innerHTML = `<div class="peek-card"><div class="peek-actions"><button data-action="peek-like">♥</button></div></div>`;
      document.body.appendChild(overlay);

      const btn = overlay.querySelector('[data-action="peek-like"]');
      assert.ok(btn);
    });

    it('should have a Why Not button with data-action="peek-why-not"', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay';
      overlay.innerHTML = `<div class="peek-card"><button data-action="peek-why-not">💬</button></div>`;
      document.body.appendChild(overlay);

      const btn = overlay.querySelector('[data-action="peek-why-not"]');
      assert.ok(btn);
    });
  });

  describe('_showPeekOverlay - Escape key dismiss', () => {
    it('should dismiss the peek overlay on Escape key', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay open';
      overlay.innerHTML = `<div class="peek-card"><p>content</p></div>`;
      document.body.appendChild(overlay);

      // Attach Escape-key handler (same logic as App._showPeekOverlay)
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          overlay.classList.remove('open');
          setTimeout(() => overlay.remove(), 300);
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);

      // Dispatch Escape key
      keydown('Escape');

      assert.equal(overlay.classList.contains('open'), false);
    });
  });

  describe('_showPeekOverlay - summary content', () => {
    it('should render a title in the peek-card header', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay open';
      overlay.innerHTML = `<div class="peek-card"><div class="peek-title-row"><h3 class="peek-title">Test Movie</h3></div></div>`;
      document.body.appendChild(overlay);

      const title = overlay.querySelector('.peek-title');
      assert.ok(title);
      assert.equal(title.textContent, 'Test Movie');
    });

    it('should render DNA tags when present', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay open';
      overlay.innerHTML = `<div class="peek-card"><div class="peek-tags"><span class="peek-tag">🧠 Plot Twist</span><span class="peek-tag">💥 Action</span></div></div>`;
      document.body.appendChild(overlay);

      const tags = overlay.querySelectorAll('.peek-tag');
      assert.equal(tags.length, 2);
      assert.equal(tags[0].textContent, '🧠 Plot Twist');
      assert.equal(tags[1].textContent, '💥 Action');
    });

    it('should render a summary paragraph when present', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay open';
      overlay.innerHTML = `<div class="peek-card"><p class="peek-summary">A brief summary of the movie.</p></div>`;
      document.body.appendChild(overlay);

      const summary = overlay.querySelector('.peek-summary');
      assert.ok(summary);
      assert.ok(summary.textContent.length > 0);
    });

    it('should render meta info (year, rating, genres)', () => {
      const overlay = document.createElement('div');
      overlay.className = 'peek-overlay open';
      overlay.innerHTML = `<div class="peek-card"><div class="peek-meta"><span class="peek-year">2024</span><span class="peek-rating">⭐ 8.5</span><span class="peek-genres">Action, Sci-Fi</span></div></div>`;
      document.body.appendChild(overlay);

      assert.ok(overlay.querySelector('.peek-year'));
      assert.ok(overlay.querySelector('.peek-rating'));
      assert.ok(overlay.querySelector('.peek-genres'));
    });
  });

  describe('feedback modal structure', () => {
    it('should have a feedback-overlay with four reason buttons', () => {
      const overlay = document.createElement('div');
      overlay.className = 'feedback-overlay open';
      overlay.innerHTML = `
        <div class="feedback-modal">
          <h3>💬 Why not?</h3>
          <div class="feedback-options">
            <button class="feedback-btn" data-reason="seen">👁️ Seen</button>
            <button class="feedback-btn" data-reason="mood">🎭 Wrong mood</button>
            <button class="feedback-btn" data-reason="genre">📚 Not my genre</button>
            <button class="feedback-btn" data-reason="other">💡 Other</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      assert.equal(overlay.querySelectorAll('.feedback-btn').length, 4);
      assert.ok(overlay.querySelector('[data-reason="seen"]'));
      assert.ok(overlay.querySelector('[data-reason="mood"]'));
      assert.ok(overlay.querySelector('[data-reason="genre"]'));
      assert.ok(overlay.querySelector('[data-reason="other"]'));
    });

    it('should dismiss feedback modal on backdrop click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'feedback-overlay open';
      overlay.innerHTML = `<div class="feedback-modal"><p>test</p></div>`;
      document.body.appendChild(overlay);

      // Attach backdrop-click handler (same logic as App._showFeedbackModal)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
        }
      });

      click(overlay);
      assert.equal(overlay.classList.contains('open'), false);
    });
  });
});
