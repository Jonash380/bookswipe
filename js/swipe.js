export class SwipeEngine {
  constructor(el, onSwipe, onExpand) {
    this.el = el;
    this.onSwipe = onSwipe;
    this.onExpand = onExpand || null;
    this.startX = 0; this.startY = 0;
    this.startYPct = 0; // Y position as % of element height
    this.dx = 0; this.dy = 0;
    this.lastX = 0; this.lastY = 0;
    this.lastTime = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.swiping = false;
    this._didSwipe = false;
    this._expanded = false; // true once expand gesture activates
    this._resisting = false; // true while dragging up in bottom zone before threshold
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
    this.el.addEventListener('touchmove', this._handlers.touchmove, { passive: false });
    this.el.addEventListener('touchend', this._handlers.touchend);
    this.el.addEventListener('mousedown', this._handlers.mousedown);
    this.el.addEventListener('mousemove', this._handlers.mousemove);
    this.el.addEventListener('mouseup', this._handlers.mouseup);
    this.el.addEventListener('mouseleave', this._handlers.mouseleave);
  }
  _start(e) {
    this.swiping = true;
    this._didSwipe = false;
    this._expanded = false;
    this._resisting = false;
    this.startX = e.clientX || e.touches?.[0]?.clientX || 0;
    this.startY = e.clientY || e.touches?.[0]?.clientY || 0;
    // Compute Y position as percentage of element height (0 = top, 1 = bottom)
    const rect = this.el.getBoundingClientRect();
    this.startYPct = rect.height > 0 ? (this.startY - rect.top) / rect.height : 0.5;
    this.lastX = this.startX;
    this.lastY = this.startY;
    this.lastTime = performance.now();
    this.velocityX = 0;
    this.velocityY = 0;
    this.el.style.transition = 'none';
    this.el.classList.add('dragging');
  }
  _move(e) {
    if (!this.swiping) return;
    e.preventDefault();
    const now = performance.now();
    const x = e.clientX || e.touches?.[0]?.clientX || 0;
    const y = e.clientY || e.touches?.[0]?.clientY || 0;
    this.dx = x - this.startX;
    this.dy = y - this.startY;

    // Track velocity (low-pass filtered for smoothness)
    const dt = now - this.lastTime;
    if (dt > 0) {
      const vx = (x - this.lastX) / dt * 16;
      const vy = (y - this.lastY) / dt * 16;
      this.velocityX = this.velocityX * 0.6 + vx * 0.4;
      this.velocityY = this.velocityY * 0.6 + vy * 0.4;
    }
    this.lastX = x;
    this.lastY = y;
    this.lastTime = now;

    // Bottom-zone expand resistance: progressive scale-down and blur
    if (this.onExpand && this.startYPct > 0.7 && this.dy < -5 && !this._expanded) {
      const expandThreshold = 80;
      const progress = Math.min(Math.abs(this.dy) / expandThreshold, 1);
      const eased = progress * progress; // ease-in for natural resistance build-up
      const scale = 1 - eased * 0.1;    // 1.0 → 0.9
      const blur = eased * 8;            // 0 → 8px
      this.el.style.transform = `scale(${scale})`;
      this.el.style.filter = blur > 0.5 ? `blur(${blur}px)` : '';
      this.el.style.opacity = String(Math.max(0.8, 1 - eased * 0.2));
      this._resisting = true;

      if (progress >= 1) {
        // Threshold reached — snap to expand and fire
        this._expanded = true;
        this._resisting = false;
        this.swiping = false;
        this.el.classList.remove('dragging');
        this.el.style.transition = 'transform 0.2s ease, filter 0.2s ease, opacity 0.2s ease';
        this.el.style.transform = 'scale(0.88)';
        this.el.style.filter = 'blur(12px)';
        this.el.style.opacity = '0.7';
        const sx = this.startX, sy = this.startY;
        setTimeout(() => {
          this.el.style.transition = '';
          this.el.style.transform = '';
          this.el.style.filter = '';
          this.el.style.opacity = '';
          this.onExpand(sx, sy);
        }, 200);
      }
      return;
    }

    // If expand was activated, don't apply card transforms
    if (this._expanded) return;

    const angle = Math.atan2(this.dy, this.dx);
    const distFactor = Math.min(Math.abs(this.dx) / 100, 1);
    const rotation = (angle * 180 / Math.PI) * 0.12 * distFactor;
    const tiltX = Math.max(-12, Math.min(12, this.dy * 0.04));
    this.el.style.transform = `translateX(${this.dx}px) rotate(${rotation}deg) perspective(800px) rotateX(${tiltX}deg)`;
    this.el.style.opacity = Math.max(0.4, 1 - Math.abs(this.dx) / 350);

    // Update directional CSS classes for visual feedback
    this.el.classList.remove('swiping-right', 'swiping-left', 'swiping-up');
    if (this.dx > 30) {
      this.el.classList.add('swiping-right');
    } else if (this.dx < -30) {
      this.el.classList.add('swiping-left');
    } else if (this.dy < -40) {
      this.el.classList.add('swiping-up');
    }
  }
  _end() {
    if (!this.swiping) return;
    this.swiping = false;
    this.el.classList.remove('dragging');

    // If we were in the resistance phase but didn't reach the expand threshold, bounce back
    if (this._resisting) {
      this._resisting = false;
      this.el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.4s ease, opacity 0.4s ease';
      this.el.style.transform = '';
      this.el.style.filter = '';
      this.el.style.opacity = '';
      this.dx = 0; this.dy = 0;
      this.velocityX = 0; this.velocityY = 0;
      setTimeout(() => { if (this.el) this.el.style.transition = ''; }, 500);
      return;
    }

    const absDx = Math.abs(this.dx);
    const absDy = Math.abs(this.dy);
    const absVx = Math.abs(this.velocityX);
    const absVy = Math.abs(this.velocityY);

    const fastFlick = absVx > 8 || absVy > 8;
    const distThreshold = fastFlick ? 30 : 100;
    const upThreshold = fastFlick ? 20 : 80;

    if (absDx > distThreshold || (absDy > upThreshold && this.dy < 0)) {
      this._didSwipe = true;
      let dir;
      if (absDy > upThreshold && this.dy < 0) dir = 'up';
      else dir = this.dx > 0 ? 'right' : 'left';

      // Fly off with rotation based on velocity
      const flyRotation = this.velocityX * 3;
      const offX = dir === 'up' ? 0 : (dir === 'right' ? window.innerWidth * 1.2 : -window.innerWidth * 1.2);
      const offY = dir === 'up' ? -window.innerHeight * 1.2 : 0;
      this.el.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';
      this.el.style.transform = `translateX(${offX}px) translateY(${offY}px) rotate(${flyRotation}deg) scale(0.9)`;
      this.el.style.opacity = '0';

      // Trigger super-like flash
      if (dir === 'up') {
        document.body.classList.add('must-read-flash');
        setTimeout(() => document.body.classList.remove('must-read-flash'), 350);
      }

      setTimeout(() => {
        this.el.classList.remove('swiping-right', 'swiping-left', 'swiping-up');
        this.onSwipe(dir);
      }, 300);
    } else {
      // Springy bounce-back
      this.el.classList.remove('swiping-right', 'swiping-left', 'swiping-up');
      this.el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease';
      this.el.style.transform = '';
      this.el.style.opacity = '';
    }
    this.dx = 0; this.dy = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    setTimeout(() => { if (this.el) this.el.style.transition = ''; }, 500);
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
