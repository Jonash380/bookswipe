export class LazyLoader {
  constructor() {
    this.observer = new IntersectionObserver(this._onIntersect.bind(this), {
      rootMargin: '200px',
      threshold: 0.01
    });
    this.queue = new Map();
  }

  observe(el, loadFn) {
    if (!el) return;
    this.queue.set(el, loadFn);
    this.observer.observe(el);
  }

  unobserve(el) {
    if (!el) return;
    this.observer.unobserve(el);
    this.queue.delete(el);
  }

  _onIntersect(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const loadFn = this.queue.get(entry.target);
        if (loadFn) {
          loadFn(entry.target);
          this.observer.unobserve(entry.target);
          this.queue.delete(entry.target);
        }
      }
    });
  }

  destroy() {
    this.observer.disconnect();
    this.queue.clear();
  }
}

export function lazyLoadImage(img, src) {
  if (!img || !src) return;
  const loader = new LazyLoader();
  loader.observe(img, (el) => {
    el.src = src;
    el.classList.add('loaded');
  });
}

export function setupGridLazyLoad(container, selector = '.list-cover') {
  if (!container || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
          img.classList.add('loaded');
        }
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '200px', threshold: 0.01 });

  container.querySelectorAll(`${selector}[data-src]`).forEach(img => {
    observer.observe(img);
  });
}
