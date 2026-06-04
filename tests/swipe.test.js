import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Set up a minimal DOM environment
const dom = new JSDOM('<!DOCTYPE html><div id="card"></div>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// navigator is read-only in some environments
Object.defineProperty(global, 'navigator', {
  value: { vibrate: () => {} },
  writable: true,
  configurable: true,
});

// Mock getComputedStyle
global.window.getComputedStyle = () => ({});

// Import the module under test
const { SwipeEngine } = await import('../js/swipe.js');

/**
 * Helper: simulate the swipe lifecycle on a SwipeEngine.
 * Uses a controllable time variable for velocity tracking.
 */
function simulateSwipe(engine, opts = {}) {
  const {
    fromX = 100, fromY = 200,
    toX = 100, toY = 200,
    duration = 100,
    steps = 5,
  } = opts;

  // Create a mock performance.now that returns fakeTime
  // Store original and replace
  const originalNow = global.performance.now.bind(global.performance);
  let fakeTime = 0;

  // Override with a simple mock that won't cause recursion
  global.performance.now = () => fakeTime;

  engine._start({ clientX: fromX, clientY: fromY });

  // Advance time and position through steps
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    fakeTime = duration * t;
    engine._move({ clientX: x, clientY: y });
  }

  engine._end();

  // Restore original
  global.performance.now = originalNow;
  return engine;
}

describe('SwipeEngine', () => {
  let el;
  let swipeDir;
  let engine;

  before(() => {
    el = document.getElementById('card');
  });

  after(() => {
    if (engine) engine.destroy();
  });

  describe('constructor', () => {
    it('should set up event listeners on the element', () => {
      const listeners = [];
      const origAdd = el.addEventListener;
      el.addEventListener = (evt) => listeners.push(evt);

      const e = new SwipeEngine(el, () => {});
      assert.ok(listeners.includes('touchstart'));
      assert.ok(listeners.includes('touchmove'));
      assert.ok(listeners.includes('touchend'));
      assert.ok(listeners.includes('mousedown'));
      assert.ok(listeners.includes('mousemove'));
      assert.ok(listeners.includes('mouseup'));
      assert.ok(listeners.includes('mouseleave'));
      e.destroy();
      el.addEventListener = origAdd;
    });
  });

  describe('direction detection', () => {
    beforeEach(() => {
      swipeDir = null;
      if (engine) engine.destroy();
      el.style.transform = '';
      el.style.transition = '';
      engine = new SwipeEngine(el, (dir) => { swipeDir = dir; });
    });

    it('should detect a right swipe (dx > 100, positive dx)', () => {
      simulateSwipe(engine, { fromX: 100, toX: 300, duration: 200 });
      assert.equal(engine._didSwipe, true);
      assert.equal(swipeDir, 'right');
    });

    it('should detect a left swipe (dx < -100)', () => {
      simulateSwipe(engine, { fromX: 300, toX: 100, duration: 200 });
      assert.equal(engine._didSwipe, true);
      assert.equal(swipeDir, 'left');
    });

    it('should detect an up swipe (dy < -80, negative dy)', () => {
      simulateSwipe(engine, { fromX: 100, fromY: 300, toX: 100, toY: 100, duration: 200 });
      assert.equal(engine._didSwipe, true);
      assert.equal(swipeDir, 'up');
    });

    it('should NOT trigger on a short drag under threshold (dx < 100, slow)', () => {
      simulateSwipe(engine, { fromX: 100, toX: 140, duration: 300 });
      assert.equal(engine._didSwipe, false);
      assert.equal(swipeDir, null);
    });

    it('should NOT trigger on a diagonal with small dx/dy', () => {
      simulateSwipe(engine, { fromX: 100, fromY: 100, toX: 130, toY: 130, duration: 300 });
      assert.equal(engine._didSwipe, false);
      assert.equal(swipeDir, null);
    });
  });

  describe('velocity-aware thresholds', () => {
    beforeEach(() => {
      swipeDir = null;
      if (engine) engine.destroy();
      el.style.transform = '';
      el.style.transition = '';
      engine = new SwipeEngine(el, (dir) => { swipeDir = dir; });
    });

    it('should trigger on a fast flick at just 30px', () => {
      simulateSwipe(engine, { fromX: 100, toX: 145, duration: 20, steps: 3 });
      assert.equal(engine._didSwipe, true);
      assert.equal(swipeDir, 'right');
    });

    it('should NOT trigger on a slow drag to 30px', () => {
      simulateSwipe(engine, { fromX: 100, toX: 145, duration: 500, steps: 10 });
      assert.equal(engine._didSwipe, false);
    });

    it('should detect fast up flick at 20px', () => {
      simulateSwipe(engine, { fromX: 100, fromY: 200, toX: 100, toY: 170, duration: 20, steps: 3 });
      assert.equal(engine._didSwipe, true);
      assert.equal(swipeDir, 'up');
    });
  });

  describe('bounce-back on failed swipe', () => {
    beforeEach(() => {
      swipeDir = null;
      if (engine) engine.destroy();
      el.style.transform = '';
      el.style.transition = '';
      engine = new SwipeEngine(el, (dir) => { swipeDir = dir; });
    });

    it('should snap back with spring transition on slow short drag', () => {
      simulateSwipe(engine, { fromX: 100, toX: 130, duration: 400, steps: 8 });
      assert.equal(engine._didSwipe, false);
      assert.equal(el.style.transform, '');
      assert.ok(el.style.transition.includes('cubic-bezier(0.34, 1.56, 0.64, 1)'));
      assert.equal(el.style.opacity, '');
    });

    it('should clear velocity and dx/dy after failed swipe', () => {
      simulateSwipe(engine, { fromX: 100, toX: 130, duration: 400, steps: 8 });
      assert.equal(engine.dx, 0);
      assert.equal(engine.dy, 0);
      assert.equal(engine.velocityX, 0);
      assert.equal(engine.velocityY, 0);
    });
  });

  describe('rotation resistance', () => {
    beforeEach(() => {
      if (engine) engine.destroy();
      el.style.transform = '';
      engine = new SwipeEngine(el, () => {});
    });

    it('should have rotation proportionally scaling with distance', () => {
      // Use a diagonal swipe (both dx and dy) to produce a non-zero angle
      // At 50px dx + 50px dy: distFactor = 0.5, angle = atan2(50, 50) = ~0.785 rad
      engine._start({ clientX: 100, clientY: 200 });
      engine._move({ clientX: 150, clientY: 150 });
      const transform50 = el.style.transform;

      // At 150px dx + 150px dy: distFactor = 1.0, angle = atan2(150, 150) = ~0.785 rad
      engine._start({ clientX: 100, clientY: 200 });
      engine._move({ clientX: 250, clientY: 50 });
      const transform150 = el.style.transform;

      assert.ok(transform50.includes('rotate('));
      assert.ok(transform150.includes('rotate('));

      const rot50 = parseFloat(transform50.match(/rotate\(([-\d.]+)/)[1]);
      const rot150 = parseFloat(transform150.match(/rotate\(([-\d.]+)/)[1]);
      // At 50px drag: rotation = 0.785 * (180/pi) * 0.12 * 0.5 = ~2.7
      // At 150px drag: rotation = 0.785 * (180/pi) * 0.12 * 1.0 = ~5.4
      assert.ok(Math.abs(rot150) > Math.abs(rot50), 'longer drag should produce more rotation');
    });

    it('should have zero rotation at zero drag', () => {
      engine._start({ clientX: 100, clientY: 200 });
      engine._move({ clientX: 100, clientY: 200 });
      const transform = el.style.transform;
      const rot = parseFloat(transform.match(/rotate\(([-\d.]+)/)[1]);
      assert.equal(rot, 0, 'no drag should produce zero rotation');
    });
  });

  describe('isSwiping property', () => {
    beforeEach(() => {
      if (engine) engine.destroy();
      engine = new SwipeEngine(el, () => {});
    });

    it('should be true during a swipe', () => {
      assert.equal(engine.isSwiping, false);
      engine._start({ clientX: 100, clientY: 200 });
      assert.equal(engine.isSwiping, true);
    });

    it('should be false after swipe ends', () => {
      engine._start({ clientX: 100, clientY: 200 });
      engine._end();
      assert.equal(engine.isSwiping, false);
    });
  });

  describe('opacity during drag', () => {
    beforeEach(() => {
      if (engine) engine.destroy();
      el.style.opacity = '';
      engine = new SwipeEngine(el, () => {});
    });

    it('should decrease opacity as drag distance increases', () => {
      engine._start({ clientX: 100, clientY: 200 });
      engine._move({ clientX: 250, clientY: 200 });
      const op1 = parseFloat(el.style.opacity);

      engine._start({ clientX: 100, clientY: 200 });
      engine._move({ clientX: 350, clientY: 200 });
      const op2 = parseFloat(el.style.opacity);

      assert.ok(op2 < op1, 'more drag should produce lower opacity');
      assert.ok(op2 >= 0.4, 'opacity should not go below 0.4');
    });
  });

  describe('destroy', () => {
    it('should remove all event listeners', () => {
      const e = new SwipeEngine(el, () => {});
      const removed = [];
      const origRemove = el.removeEventListener;
      el.removeEventListener = (evt) => removed.push(evt);

      e.destroy();
      assert.ok(removed.includes('touchstart'));
      assert.ok(removed.includes('touchmove'));
      assert.ok(removed.includes('touchend'));
      assert.ok(removed.includes('mousedown'));
      assert.ok(removed.includes('mousemove'));
      assert.ok(removed.includes('mouseup'));
      assert.ok(removed.includes('mouseleave'));

      el.removeEventListener = origRemove;
    });
  });
});
