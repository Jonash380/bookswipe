/**
 * Swipe gesture manager for horizontal scroll containers.
 * Handles drag-to-scroll + velocity tracking + haptic feedback.
 * Works WITH CSS scroll-snap (no JS snap/momentum — the browser handles that).
 */
export class SwipeGestureManager {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      hapticFeedback: true,
      dragThreshold: 3,       // px before we consider it a drag vs tap
      ...options
    };
    this.state = {
      isDragging: false,
      startX: 0,
      startY: 0,
      scrollLeft: 0,
      hasMoved: false,
      lastX: 0,
      lastTime: 0,
      velocity: 0
    };
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
    this._onClickCapture = this._handleClickCapture.bind(this);
    this.init();
  }

  init() {
    // Mouse events (desktop drag-to-scroll)
    this.element.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);

    // Touch events — touchmove is NON-passive so we can preventDefault
    // to stop native horizontal scroll while we control it manually
    this.element.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.element.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.element.addEventListener('touchend', this._onTouchEnd);

    // Block clicks that were actually drags
    this.element.addEventListener('click', this._onClickCapture, true);

    // Prevent native drag on images
    this._onDragStart = e => e.preventDefault();
    this.element.addEventListener('dragstart', this._onDragStart);
  }

  _startDrag(pageX, pageY = 0) {
    this.state.isDragging = true;
    this.state.hasMoved = false;
    this.state.startX = pageX;
    this.state.startY = pageY;
    this.state.scrollLeft = this.element.scrollLeft;
    this.state.lastX = pageX;
    this.state.lastTime = Date.now();
    this.state.velocity = 0;
    this.element.style.cursor = 'grabbing';
    this.element.style.scrollBehavior = 'auto';
    this.element.classList.add('dragging');
  }

  _moveDrag(pageX) {
    if (!this.state.isDragging) return;
    const dx = pageX - this.state.startX;
    if (Math.abs(dx) > this.options.dragThreshold) {
      this.state.hasMoved = true;
    }

    // Track velocity (px/ms)
    const now = Date.now();

    const dt = now - this.state.lastTime;
    if (dt > 0) {
      this.state.velocity = (pageX - this.state.lastX) / dt;
    }
    this.state.lastX = pageX;
    this.state.lastTime = now;

    this.element.scrollLeft = this.state.scrollLeft - dx;
  }

  _endDrag() {
    if (!this.state.isDragging) return;
    this.state.isDragging = false;
    this.element.style.cursor = 'grab';
    this.element.style.removeProperty('scroll-behavior'); // restore CSS smooth
    this.element.classList.remove('dragging');

    // Haptic feedback on fast flicks
    if (this.options.hapticFeedback && navigator.vibrate && Math.abs(this.state.velocity) > 0.4) {
      navigator.vibrate(15);
    }
  }

  // --- Mouse handlers ---
  _handleMouseDown(e) {
    this._startDrag(e.pageX);
  }

  _handleMouseMove(e) {
    if (!this.state.isDragging) return;
    e.preventDefault(); // prevent text selection during drag
    this._moveDrag(e.pageX);
  }

  _handleMouseUp() {
    this._endDrag();
  }

  // --- Touch handlers ---
  _handleTouchStart(e) {
    this._startDrag(e.touches[0].pageX, e.touches[0].pageY);
  }

  _handleTouchMove(e) {
    if (!this.state.isDragging) return;
    // preventDefault to stop native horizontal scroll — we handle it.
    // Only prevent if the gesture is mostly horizontal to allow vertical scroll.
    const dx = Math.abs(e.touches[0].pageX - this.state.startX);
    const dy = Math.abs(e.touches[0].pageY - this.state.startY);
    if (dx > dy && dx > this.options.dragThreshold) {
      e.preventDefault();
    }
    this._moveDrag(e.touches[0].pageX);
  }

  _handleTouchEnd() {
    this._endDrag();
  }

  // --- Click guard: block clicks that were actually drags ---
  _handleClickCapture(e) {
    if (this.state.hasMoved) {
      e.stopPropagation();
      this.state.hasMoved = false;
    }
  }

  destroy() {
    this.element.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    this.element.removeEventListener('touchstart', this._onTouchStart);
    this.element.removeEventListener('touchmove', this._onTouchMove);
    this.element.removeEventListener('touchend', this._onTouchEnd);
    this.element.removeEventListener('click', this._onClickCapture, true);
    this.element.removeEventListener('dragstart', this._onDragStart);
  }
}
