export class SwipeEngine {
  constructor(el, onSwipe) {
    this.el = el;
    this.onSwipe = onSwipe;
    this.startX = 0; this.startY = 0;
    this.dx = 0; this.dy = 0;
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
  }
  _move(e) {
    if (!this.swiping) return;
    const x = e.clientX || e.touches?.[0]?.clientX || 0;
    const y = e.clientY || e.touches?.[0]?.clientY || 0;
    this.dx = x - this.startX;
    this.dy = y - this.startY;
    const angle = Math.atan2(this.dy, this.dx);
    const rotation = (angle * 180 / Math.PI) * 0.1;
    this.el.style.transform = `translateX(${this.dx}px) rotate(${rotation}deg)`;
    this.el.style.opacity = 1 - Math.abs(this.dx) / 300;
  }
  _end() {
    if (!this.swiping) return;
    this.swiping = false;
    const absDx = Math.abs(this.dx);
    const absDy = Math.abs(this.dy);
    this.el.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    if (absDx > 100 || (absDy > 80 && this.dy < 0)) {
      this._didSwipe = true;
      let dir;
      if (absDy > 80 && this.dy < 0) dir = 'up';
      else dir = this.dx > 0 ? 'right' : 'left';
      const offX = dir === 'up' ? 0 : (dir === 'right' ? 400 : -400);
      const offY = dir === 'up' ? -400 : 0;
      this.el.style.transform = `translateX(${offX}px) translateY(${offY}px) rotate(${this.dx * 0.05}deg)`;
      this.el.style.opacity = '0';
      this.onSwipe(dir);
    } else {
      this.el.style.transform = '';
      this.el.style.opacity = '';
    }
    this.dx = 0; this.dy = 0;
    setTimeout(() => { this.el.style.transition = ''; }, 300);
  }
  didSwipe() { return this._didSwipe; }
  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    Object.entries(this._handlers).forEach(([evt, fn]) => {
      this.el.removeEventListener(evt, fn);
    });
  }
}
