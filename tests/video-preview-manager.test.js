import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Set up JSDOM with matchMedia support
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.HTMLIFrameElement = dom.window.HTMLIFrameElement;

// Mock matchMedia (default: no reduced motion, has hover)
global.window.matchMedia = (query) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
});

// Mock IntersectionObserver
global.IntersectionObserver = class {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

// localStorage mock
const storageMock = (() => {
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
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});
Object.defineProperty(global.window, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});

// Import the module under test
const { setupCardPreview } = await import('../js/video-preview-manager.js');

// ===== Helpers =====

function createCardEl() {
  const el = document.createElement('div');
  el.className = 'card';
  document.body.appendChild(el);
  return el;
}

function createCoverEl(cardEl) {
  const img = document.createElement('img');
  img.className = 'card-cover';
  cardEl.appendChild(img);
  return img;
}

function createOverlayEl(cardEl) {
  const overlay = document.createElement('div');
  overlay.className = 'genre-card-overlay';
  cardEl.appendChild(overlay);
  return overlay;
}

function makeVideoIdFn(videoId = 'abc123') {
  return async () => videoId;
}

function makeNullVideoIdFn() {
  return async () => null;
}

function makeThrowingVideoIdFn() {
  return async () => { throw new Error('API error'); };
}

// ===== Tests =====

describe('setupCardPreview', () => {
  let originalSetTimeout;
  let originalClearTimeout;

  beforeEach(() => {
    document.body.innerHTML = '';
    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = (fn, ms) => originalSetTimeout(fn, ms);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    // Restore real timers
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  // ===== Basic behavior =====

  describe('basic hover-to-play flow', () => {
    it('should return stopPreview and cleanup functions', () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      const result = setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
      });
      assert.equal(typeof result.stopPreview, 'function');
      assert.equal(typeof result.cleanup, 'function');
    });

    it('should create iframe after hover delay on mouseenter', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn('testVideo123'),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      // Trigger mouseenter
      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));

      // Wait for hover timer + async getVideoId
      await new Promise(r => originalSetTimeout(r, 50));

      const iframe = cardEl.querySelector('iframe');
      assert.ok(iframe, 'iframe should be created');
      assert.ok(iframe.src.includes('testVideo123'), 'iframe should contain video ID');
      assert.ok(iframe.src.includes('autoplay=1'), 'iframe should autoplay');
      assert.ok(iframe.src.includes('mute=1'), 'iframe should start muted');
      assert.ok(iframe.src.includes('loop=1'), 'iframe should loop');
      assert.ok(iframe.src.includes('controls=0'), 'iframe should hide controls');
      assert.ok(iframe.src.includes('enablejsapi=1'), 'iframe should have JS API enabled');
      assert.equal(iframe.allow, 'autoplay; encrypted-media', 'iframe should allow autoplay');
      assert.equal(iframe.getAttribute('frameborder'), '0');
    });

    it('should fade out cover image during playback', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      assert.equal(coverEl.style.opacity, '0', 'cover should be faded out');
      assert.ok(coverEl.style.transition.includes('opacity'), 'cover should have opacity transition');
    });

    it('should add preview-active class during playback', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      assert.ok(cardEl.classList.contains('preview-active'), 'should have preview-active class');
    });

    it('should remove iframe and restore cover on mouseleave', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));
      assert.ok(cardEl.querySelector('iframe'), 'iframe should exist');

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseleave'));
      assert.ok(!cardEl.classList.contains('preview-active'), 'should remove preview-active');
      assert.equal(coverEl.style.opacity, '1', 'cover should be restored');
    });
  });

  // ===== getVideoId edge cases =====

  describe('getVideoId returning null', () => {
    it('should not create iframe when getVideoId returns null', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeNullVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      assert.equal(cardEl.querySelector('iframe'), null, 'no iframe should be created');
      assert.ok(!cardEl.classList.contains('preview-active'), 'should not be preview-active');
    });
  });

  describe('getVideoId throwing', () => {
    it('should not crash when getVideoId throws', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeThrowingVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      assert.equal(cardEl.querySelector('iframe'), null, 'no iframe on error');
      assert.ok(!cardEl.classList.contains('preview-active'), 'should not be preview-active');
    });
  });

  // ===== Option: showLoader =====

  describe('showLoader option', () => {
    it('should show loading spinner when showLoader is true', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: true,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      const loader = cardEl.querySelector('.genre-card-video-loader');
      assert.ok(loader, 'loader should be present');
      assert.ok(loader.querySelector('.genre-card-video-spinner'), 'spinner should be inside loader');
    });

    it('should not show loading spinner when showLoader is false', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      assert.equal(cardEl.querySelector('.genre-card-video-loader'), null, 'no loader');
    });
  });

  // ===== Option: showMuteBtn =====

  describe('showMuteBtn option', () => {
    it('should show mute button when showMuteBtn is true', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: true,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      const muteBtn = cardEl.querySelector('.genre-card-mute-btn');
      assert.ok(muteBtn, 'mute button should be present');
      assert.equal(muteBtn.innerHTML, '🔇', 'should start muted');
      assert.equal(muteBtn.getAttribute('aria-label'), 'Unmute');
    });

    it('should not show mute button when showMuteBtn is false', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      assert.equal(cardEl.querySelector('.genre-card-mute-btn'), null, 'no mute button');
    });
  });

  // ===== Option: keyboardA11y =====

  describe('keyboardA11y option', () => {
    it('should add focus/blur handlers when keyboardA11y is true', () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      let focusFired = false;
      let blurFired = false;

      // Patch addEventListener to track focus/blur
      const origAdd = cardEl.addEventListener.bind(cardEl);
      cardEl.addEventListener = (type, fn, opts) => {
        if (type === 'focus') focusFired = true;
        if (type === 'blur') blurFired = true;
        origAdd(type, fn, opts);
      };

      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        keyboardA11y: true,
      });

      assert.ok(focusFired, 'focus handler should be added');
      assert.ok(blurFired, 'blur handler should be added');
    });

    it('should not add focus/blur handlers when keyboardA11y is false', () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      let focusFired = false;
      let blurFired = false;

      const origAdd = cardEl.addEventListener.bind(cardEl);
      cardEl.addEventListener = (type, fn, opts) => {
        if (type === 'focus') focusFired = true;
        if (type === 'blur') blurFired = true;
        origAdd(type, fn, opts);
      };

      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        keyboardA11y: false,
      });

      assert.ok(!focusFired, 'no focus handler');
      assert.ok(!blurFired, 'no blur handler');
    });
  });

  // ===== Option: insertBeforeEl =====

  describe('insertBeforeEl option', () => {
    it('should insert iframe before insertBeforeEl when provided', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      const overlay = createOverlayEl(cardEl);

      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
        insertBeforeEl: overlay,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      const iframe = cardEl.querySelector('iframe');
      assert.ok(iframe, 'iframe should exist');
      // iframe should be before overlay in DOM
      const children = Array.from(cardEl.children);
      assert.ok(children.indexOf(iframe) < children.indexOf(overlay),
        'iframe should be inserted before overlay');
    });

    it('should append iframe to cardEl when insertBeforeEl is null', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);

      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
        insertBeforeEl: null,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      const iframe = cardEl.querySelector('iframe');
      assert.ok(iframe, 'iframe should exist');
      // iframe should be last child (or near last)
      const lastChild = cardEl.lastElementChild;
      assert.ok(lastChild === iframe || lastChild?.tagName === 'BUTTON',
        'iframe should be appended (possibly before mute button)');
    });
  });

  // ===== Option: activeCardRef (single-active tracking) =====

  describe('activeCardRef single-active tracking', () => {
    it('should track the active card in activeCardRef', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      const activeCardRef = { card: null };

      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
        activeCardRef,
      });

      assert.equal(activeCardRef.card, null, 'initially null');

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      assert.equal(activeCardRef.card, cardEl, 'should track active card');
    });

    it('should clear activeCardRef on stopPreview', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      const activeCardRef = { card: null };

      const { stopPreview } = setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
        activeCardRef,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));
      assert.equal(activeCardRef.card, cardEl);

      stopPreview();
      assert.equal(activeCardRef.card, null, 'should clear on stop');
    });

    it('should stop previous card when starting a new one', async () => {
      const card1 = createCardEl();
      const cover1 = createCoverEl(card1);
      const card2 = createCardEl();
      const cover2 = createCoverEl(card2);
      const activeCardRef = { card: null };

      setupCardPreview(card1, {
        getVideoId: makeVideoIdFn('vid1'),
        coverEl: cover1,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
        activeCardRef,
      });
      setupCardPreview(card2, {
        getVideoId: makeVideoIdFn('vid2'),
        coverEl: cover2,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
        activeCardRef,
      });

      // Start card1
      card1.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));
      assert.ok(card1.querySelector('iframe'), 'card1 should have iframe');

      // Start card2 — should stop card1
      card2.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));
      assert.ok(card2.querySelector('iframe'), 'card2 should have iframe');
      assert.equal(activeCardRef.card, card2, 'active should be card2');
    });
  });

  // ===== cleanup function =====

  describe('cleanup function', () => {
    it('should remove iframe immediately', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      const { cleanup } = setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));
      assert.ok(cardEl.querySelector('iframe'), 'iframe exists before cleanup');

      cleanup();
      assert.equal(cardEl.querySelector('iframe'), null, 'iframe removed after cleanup');
    });

    it('should remove loader on cleanup', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      const { cleanup } = setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: true,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      cleanup();
      assert.equal(cardEl.querySelector('.genre-card-video-loader'), null, 'loader removed');
    });

    it('should remove mute button on cleanup', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      const { cleanup } = setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: true,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      cleanup();
      assert.equal(cardEl.querySelector('.genre-card-mute-btn'), null, 'mute button removed');
    });

    it('should clear activeCardRef on cleanup', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      const activeCardRef = { card: null };

      const { cleanup } = setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
        activeCardRef,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));
      assert.equal(activeCardRef.card, cardEl);

      cleanup();
      assert.equal(activeCardRef.card, null, 'cleared after cleanup');
    });
  });

  // ===== stopPreview: stops timer before delay =====

  describe('stopPreview before delay fires', () => {
    it('should prevent iframe creation if stopPreview called before timer fires', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      const { stopPreview } = setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 500, // long delay
        showLoader: false,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      // Immediately stop before 500ms delay
      stopPreview();
      // Wait past the delay
      await new Promise(r => originalSetTimeout(r, 600));

      assert.equal(cardEl.querySelector('iframe'), null, 'no iframe should be created');
    });
  });

  // ===== Option: iframeClassName =====

  describe('iframeClassName option', () => {
    it('should apply custom iframe class name', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
        iframeClassName: 'custom-preview-iframe',
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      const iframe = cardEl.querySelector('iframe');
      assert.ok(iframe, 'iframe should exist');
      assert.ok(iframe.classList.contains('custom-preview-iframe'), 'should have custom class');
    });

    it('should use default class when not specified', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      const iframe = cardEl.querySelector('iframe');
      assert.ok(iframe.classList.contains('genre-card-video-iframe'), 'should have default class');
    });
  });

  // ===== cardEl._stopPreview =====

  describe('cardEl._stopPreview', () => {
    it('should store stopPreview on the card element', () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      const { stopPreview } = setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
      });

      assert.equal(cardEl._stopPreview, stopPreview, '_stopPreview should be stored on element');
    });
  });

  // ===== Multiple rapid mouseenter/mouseleave =====

  describe('rapid hover toggling', () => {
    it('should not create duplicate iframes on rapid mouseenter', async () => {
      const cardEl = createCardEl();
      const coverEl = createCoverEl(cardEl);
      setupCardPreview(cardEl, {
        getVideoId: makeVideoIdFn(),
        coverEl,
        hoverDelay: 0,
        showLoader: false,
        showMuteBtn: false,
      });

      // Rapid mouseenter/mouseleave/mouseenter
      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseleave'));
      cardEl.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
      await new Promise(r => originalSetTimeout(r, 50));

      const iframes = cardEl.querySelectorAll('iframe');
      assert.ok(iframes.length <= 1, `should have at most 1 iframe, got ${iframes.length}`);
    });
  });
});
