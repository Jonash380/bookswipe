/**
 * BookSwipe LingerGesture
 *
 * Fires onHold after a configurable delay of stationary touch/mouse contact.
 * Cancels on any movement beyond `moveThreshold` px or on touchend.
 * Composable with SwipeEngine: when the user finally moves, control passes
 * back to the swipe gesture without losing momentum.
 */
const LINGER_DEFAULT_DELAY = 450;   // ms of stationary contact before hold fires
const LINGER_DEFAULT_THRESHOLD = 8; // px of drift allowed before hold is cancelled

export class LingerGesture {
  /**
   * @param {HTMLElement} el
   * @param {Function} onHold - Called with the (clientX, clientY) at hold-trigger time
   * @param {{ delay?: number, threshold?: number, enabled?: () => boolean }} opts
   */
  constructor(el, onHold, opts = {}) {
    this.el = el;
    this.onHold = onHold;
    this.delay = opts.delay ?? LINGER_DEFAULT_DELAY;
    this.threshold = opts.threshold ?? LINGER_DEFAULT_THRESHOLD;
    this.enabled = opts.enabled ?? (() => true);
    this._timer = null;
    this._startX = 0;
    this._startY = 0;
    this._active = false;
    this._fired = false;
    this._handlers = {
      touchstart: e => this._start(e.touches[0]),
      touchmove: e => this._move(e.touches[0]),
      touchend: () => this._end(),
      touchcancel: () => this._end(),
      mousedown: e => this._start({ clientX: e.clientX, clientY: e.clientY }),
      mousemove: e => this._move({ clientX: e.clientX, clientY: e.clientY }),
      mouseup: () => this._end(),
      mouseleave: () => this._end(),
    };
    el.addEventListener('touchstart', this._handlers.touchstart, { passive: true });
    el.addEventListener('touchmove', this._handlers.touchmove, { passive: true });
    el.addEventListener('touchend', this._handlers.touchend);
    el.addEventListener('touchcancel', this._handlers.touchend);
    el.addEventListener('mousedown', this._handlers.mousedown);
    el.addEventListener('mousemove', this._handlers.mousemove);
    el.addEventListener('mouseup', this._handlers.mouseup);
    el.addEventListener('mouseleave', this._handlers.mouseleave);
  }

  _start(point) {
    if (!this.enabled()) return;
    this._startX = point.clientX;
    this._startY = point.clientY;
    this._active = true;
    this._fired = false;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._fire(point), this.delay);
  }

  _move(point) {
    if (!this._active) return;
    const dx = point.clientX - this._startX;
    const dy = point.clientY - this._startY;
    if (Math.hypot(dx, dy) > this.threshold) {
      this._cancel();
    }
  }

  _end() {
    this._cancel();
  }

  _fire(point) {
    if (!this._active || this._fired) return;
    this._fired = true;
    this._active = false;
    clearTimeout(this._timer);
    if (typeof this.onHold === 'function') this.onHold(point.clientX, point.clientY);
  }

  _cancel() {
    this._active = false;
    clearTimeout(this._timer);
  }

  destroy() {
    clearTimeout(this._timer);
    Object.entries(this._handlers).forEach(([evt, fn]) => {
      this.el.removeEventListener(evt, fn);
    });
  }
}
