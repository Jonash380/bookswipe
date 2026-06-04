export class SwipeEngine {
  constructor(el, onSwipe) {
    this.el = el;
    this.onSwipe = onSwipe;
    this.startX = 0; this.startY = 0;
    this.dx = 0; this.dy = 0;
    this.lastX = 0; this.lastY = 0;
    this.lastTime = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.swiping = false;
    this._didSwipe = false;
    this._handlers = {
      touchstart: e => this._start(e),
      touchmove: e => this._move(e),
      touchend: e => this._end(e),
      mousedown: e => { e.preventDefault(); this._start(e); },
      mousemove: e => this._move(e),
      mouseup: e => this._end(e),
      mouseleave: e => { if (this.swiping) this._end(e); }
    };
    this.el.addEventListener('touchstart', this._handlers.touchstart, { passive: true });
    this.el.addEventListener('touchmove', this._handlers.touchmove, { passive: true });
    this.el.addEventListener('touchend', this._handlers.touchend);
    this.el.addEventListener('mousedown', this._handlers.mousedown);
    this.el.addEventListener('mousemove', this._handlers.mousemove);
    this.el.addEventListener('mouseup', this._handlers.mouseup);
    this.el.addEventListener('mouseleave', this._handlers.mouseleave);
  }
  _start(e) {
    this.swiping = true;
    this._didSwipe = false;
    this.startX = e.clientX || e.touches?.[0]?.clientX || 0;
    this.startY = e.clientY || e.touches?.[0]?.clientY || 0;
    this.lastX = this.startX;
    this.lastY = this.startY;
    this.lastTime = performance.now();
    this.velocityX = 0;
    this.velocityY = 0;
  }
  _move(e) {
    if (!this.swiping) return;
    const now = performance.now();
    const x = e.clientX || e.touches?.[0]?.clientX || 0;
    const y = e.clientY || e.touches?.[0]?.clientY || 0;
    this.dx = x - this.startX;
    this.dy = y - this.startY;

    // Track velocity (low-pass filtered for smoothness)
    const dt = now - this.lastTime;
    if (dt > 0) {
      const vx = (x - this.lastX) / dt * 16; // normalize to ~60fps frame
      const vy = (y - this.lastY) / dt * 16;
      this.velocityX = this.velocityX * 0.6 + vx * 0.4; // lerp for smoothness
      this.velocityY = this.velocityY * 0.6 + vy * 0.4;
    }
    this.lastX = x;
    this.lastY = y;
    this.lastTime = now;

    const angle = Math.atan2(this.dy, this.dx);
    // Rotation resistance: card feels heavy at short distances (less rotation),
    // lighter at long distances (full rotation). Creates a "breaking friction" feel.
    const distFactor = Math.min(Math.abs(this.dx) / 100, 1);
    const rotation = (angle * 180 / Math.PI) * 0.12 * distFactor;
    this.el.style.transform = `translateX(${this.dx}px) rotate(${rotation}deg)`;
    this.el.style.opacity = Math.max(0.4, 1 - Math.abs(this.dx) / 350);
  }
  _end() {
    if (!this.swiping) return;
    this.swiping = false;
    const absDx = Math.abs(this.dx);
    const absDy = Math.abs(this.dy);
    const absVx = Math.abs(this.velocityX);
    const absVy = Math.abs(this.velocityY);

    // Use velocity to detect flicky swipes (fast motion over short distance)
    const fastFlick = absVx > 8 || absVy > 8;
    const distThreshold = fastFlick ? 30 : 100;
    const upThreshold = fastFlick ? 20 : 80;

    if (absDx > distThreshold || (absDy > upThreshold && this.dy < 0)) {
      this._didSwipe = true;
      let dir;
      if (absDy > upThreshold && this.dy < 0) dir = 'up';
      else dir = this.dx > 0 ? 'right' : 'left';
      const offX = dir === 'up' ? 0 : (dir === 'right' ? 500 : -500);
      const offY = dir === 'up' ? -500 : 0;
      // Clean ease-out for fly-off — no overshoot
      this.el.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease';
      this.el.style.transform = `translateX(${offX}px) translateY(${offY}px) rotate(${this.velocityX * 2}deg)`;
      this.el.style.opacity = '0';
      this.onSwipe(dir);
    } else {
      // Springy bounce-back: card snaps from dragged position with overshoot
      this.el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
      this.el.style.transform = '';
      this.el.style.opacity = '';
    }
    this.dx = 0; this.dy = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    setTimeout(() => { this.el.style.transition = ''; }, 300);
  }
  get isSwiping() { return this.swiping; }
  didSwipe() { return this._didSwipe; }
  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    Object.entries(this._handlers).forEach(([evt, fn]) => {
      this.el.removeEventListener(evt, fn);
    });
  }
}
