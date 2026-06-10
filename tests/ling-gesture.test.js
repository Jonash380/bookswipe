import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost' });
global.window = window;
global.document = window.document;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const { LingerGesture } = await import('../js/ling-gesture.js');

function makeEl() {
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.width = '200px';
  el.style.height = '200px';
  document.body.appendChild(el);
  return el;
}

/**
 * Build an event with the given type and a `touches`-shaped or clientX/Y
 * payload. happy-dom's Event class ignores most init overrides, so we
 * attach the coordinates via Object.defineProperty after construction.
 */
function fire(target, type, init = {}) {
  const evt = new window.Event(type, { bubbles: true, cancelable: true });
  // The LingerGesture reads e.touches[0] for touch events and e.clientX/Y
  // for mouse. We expose both via defineProperty so both code paths see them.
  const point = {
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
  };
  if (type.startsWith('touch')) {
    Object.defineProperty(evt, 'touches', { value: [point], configurable: true });
    Object.defineProperty(evt, 'changedTouches', { value: [point], configurable: true });
  }
  Object.defineProperty(evt, 'clientX', { value: point.clientX, configurable: true });
  Object.defineProperty(evt, 'clientY', { value: point.clientY, configurable: true });
  target.dispatchEvent(evt);
  return evt;
}

describe('LingerGesture', () => {
  let el;
  let holdX, holdY;

  beforeEach(() => {
    el = makeEl();
    holdX = null;
    holdY = null;
  });

  after(() => {
    el?.remove();
  });

  it('fires onHold after delay when touch is stationary', async () => {
    const linger = new LingerGesture(el, (x, y) => { holdX = x; holdY = y; }, { delay: 60 });
    fire(el, 'touchstart', { clientX: 50, clientY: 60 });
    assert.equal(holdX, null);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(holdX, 50);
    assert.equal(holdY, 60);
    linger.destroy();
  });

  it('cancels hold on movement beyond threshold', async () => {
    const linger = new LingerGesture(el, (x, y) => { holdX = x; holdY = y; }, { delay: 40, threshold: 8 });
    fire(el, 'touchstart', { clientX: 100, clientY: 100 });
    fire(el, 'touchmove', { clientX: 120, clientY: 100 }); // 20px > 8px threshold
    await new Promise(r => setTimeout(r, 80));
    assert.equal(holdX, null, 'hold should be cancelled by movement');
    linger.destroy();
  });

  it('does NOT cancel on small jitter under threshold', async () => {
    const linger = new LingerGesture(el, (x, y) => { holdX = x; holdY = y; }, { delay: 50, threshold: 10 });
    fire(el, 'touchstart', { clientX: 100, clientY: 100 });
    fire(el, 'touchmove', { clientX: 103, clientY: 104 }); // 5px drift
    await new Promise(r => setTimeout(r, 90));
    assert.equal(holdX, 100, 'hold should fire after small jitter');
    linger.destroy();
  });

  it('cancels hold on touchend before delay elapses', async () => {
    const linger = new LingerGesture(el, (x, y) => { holdX = x; holdY = y; }, { delay: 100 });
    fire(el, 'touchstart', { clientX: 30, clientY: 40 });
    fire(el, 'touchend');
    await new Promise(r => setTimeout(r, 150));
    assert.equal(holdX, null, 'hold should be cancelled by touchend');
    linger.destroy();
  });

  it('respects the enabled() gate', async () => {
    let on = false;
    const linger = new LingerGesture(el, () => { holdX = 1; }, { delay: 30, enabled: () => on });
    fire(el, 'touchstart', { clientX: 5, clientY: 5 });
    await new Promise(r => setTimeout(r, 60));
    assert.equal(holdX, null, 'hold must not fire when disabled');
    on = true;
    // Start a new touch — this one should fire
    fire(el, 'touchstart', { clientX: 5, clientY: 5 });
    await new Promise(r => setTimeout(r, 60));
    assert.equal(holdX, 1, 'hold fires when enabled() returns true');
    linger.destroy();
  });

  it('does not fire twice on the same touch', async () => {
    let count = 0;
    const linger = new LingerGesture(el, () => { count++; }, { delay: 30 });
    fire(el, 'touchstart', { clientX: 1, clientY: 1 });
    await new Promise(r => setTimeout(r, 60));
    // Subsequent moves on the same touch (within threshold) shouldn't refire
    fire(el, 'touchmove', { clientX: 2, clientY: 1 });
    fire(el, 'touchmove', { clientX: 3, clientY: 1 });
    await new Promise(r => setTimeout(r, 60));
    assert.equal(count, 1);
    linger.destroy();
  });

  it('destroy() removes all listeners and stops pending holds', async () => {
    const linger = new LingerGesture(el, () => { holdX = 1; }, { delay: 30 });
    fire(el, 'touchstart', { clientX: 1, clientY: 1 });
    linger.destroy();
    await new Promise(r => setTimeout(r, 60));
    assert.equal(holdX, null, 'hold must not fire after destroy');
  });

  it('works for mouse events too', async () => {
    const linger = new LingerGesture(el, (x, y) => { holdX = x; holdY = y; }, { delay: 40 });
    fire(el, 'mousedown', { clientX: 22, clientY: 33 });
    await new Promise(r => setTimeout(r, 80));
    assert.equal(holdX, 22);
    assert.equal(holdY, 33);
    linger.destroy();
  });
});
