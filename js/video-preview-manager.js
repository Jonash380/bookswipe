import { safeGetJSON, safeSetJSON } from './utils.js';
import { getTMDBVideos } from './tmdb.js';

const TRAILER_CACHE_KEY = 'bs-trailer-cache';
const TRAILER_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days — YouTube video IDs rarely change
const HOVER_DELAY = 1200;
const PREFETCH_LIMIT = 5;

function _getTrailerCache() {
  const cache = safeGetJSON(TRAILER_CACHE_KEY, null);
  if (cache?.ts && (Date.now() - cache.ts < TRAILER_CACHE_TTL)) return cache.entries || {};
  // Clear expired cache to avoid localStorage bloat
  if (cache?.entries && Object.keys(cache.entries).length) {
    safeSetJSON(TRAILER_CACHE_KEY, { entries: {}, ts: 0 });
  }
  return {};
}

function _setTrailerCacheEntry(tmdbId, mediaType, videoId) {
  try {
    const cache = safeGetJSON(TRAILER_CACHE_KEY, { entries: {}, ts: Date.now() });
    cache.entries[`${mediaType}-${tmdbId}`] = videoId;
    cache.ts = Date.now();
    safeSetJSON(TRAILER_CACHE_KEY, cache);
  } catch { /* quota exceeded */ }
}

/**
 * Set up hover-to-play video preview on a single card element.
 * Shared logic used by both genre card previews and main swipe card previews.
 *
 * @param {HTMLElement} cardEl - The card element to attach preview to
 * @param {object} opts
 * @param {Function} opts.getVideoId - Async function returning a YouTube video ID or null
 * @param {HTMLElement} opts.coverEl - The image element to fade out during playback
 * @param {string} [opts.iframeClassName='genre-card-video-iframe'] - CSS class for the iframe
 * @param {number} [opts.hoverDelay=1200] - Milliseconds before preview starts
 * @param {HTMLElement} [opts.insertBeforeEl=null] - Element to insert iframe before (default: append to cardEl)
 * @param {boolean} [opts.showLoader=true] - Show loading spinner while iframe loads
 * @param {boolean} [opts.showMuteBtn=true] - Show mute/unmute toggle button
 * @param {boolean} [opts.keyboardA11y=true] - Add focus/blur handlers for keyboard users
 * @param {{card: HTMLElement|null}} [opts.activeCardRef=null] - Shared ref for single-active preview tracking
 * @returns {{ stopPreview: Function, cleanup: Function }}
 */
export function setupCardPreview(cardEl, opts = {}) {
  const {
    getVideoId,
    coverEl,
    iframeClassName = 'genre-card-video-iframe',
    hoverDelay = HOVER_DELAY,
    insertBeforeEl = null,
    showLoader = true,
    showMuteBtn = true,
    keyboardA11y = true,
    activeCardRef = null,
  } = opts;

  let iframe = null;
  let hoverTimer = null;
  let isPlaying = false;
  let videoIdResolved = false;
  let videoId = null;
  let loader = null;
  let muteBtn = null;

  const startPreview = () => {
    // Single-active: stop any other active preview
    if (activeCardRef?.card && activeCardRef.card !== cardEl && activeCardRef.card._stopPreview) {
      activeCardRef.card._stopPreview();
    }
    hoverTimer = setTimeout(async () => {
      if (isPlaying) return;

      // Resolve video ID (cached, prefetched, or on-demand)
      if (!videoIdResolved) {
        videoIdResolved = true;
        try { videoId = await getVideoId(); } catch { return; }
      }
      if (!videoId) return;

      isPlaying = true;
      if (activeCardRef) activeCardRef.card = cardEl;
      cardEl.classList.add('preview-active');

      // Loading spinner
      if (showLoader) {
        loader = document.createElement('div');
        loader.className = 'genre-card-video-loader';
        loader.innerHTML = '<div class="genre-card-video-spinner"></div>';
        cardEl.appendChild(loader);
        requestAnimationFrame(() => { if (loader) loader.style.opacity = '1'; });
      }

      // Mute toggle button
      if (showMuteBtn) {
        muteBtn = document.createElement('button');
        muteBtn.className = 'genre-card-mute-btn';
        muteBtn.setAttribute('aria-label', 'Unmute');
        muteBtn.innerHTML = '🔇';
        let isMuted = true;
        muteBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (!iframe?.contentWindow) return;
          isMuted = !isMuted;
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: isMuted ? 'mute' : 'unMute', args: [] }), '*');
          muteBtn.innerHTML = isMuted ? '🔇' : '🔊';
          muteBtn.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
        });
      }

      // Create YouTube iframe
      iframe = document.createElement('iframe');
      iframe.className = iframeClassName;
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&showinfo=0&enablejsapi=1`;
      iframe.allow = 'autoplay; encrypted-media';
      iframe.setAttribute('frameborder', '0');
      iframe.addEventListener('load', () => {
        if (loader) { loader.style.opacity = '0'; setTimeout(() => { loader?.remove(); loader = null; }, 300); }
      });

      // Insert iframe into DOM
      if (insertBeforeEl) {
        cardEl.insertBefore(iframe, insertBeforeEl);
      } else {
        cardEl.appendChild(iframe);
      }
      if (muteBtn) cardEl.appendChild(muteBtn);

      // Fade out cover, fade in iframe
      if (coverEl) { coverEl.style.transition = 'opacity .4s ease'; coverEl.style.opacity = '0'; }
      setTimeout(() => { if (iframe) iframe.style.opacity = '1'; }, 50);
    }, hoverDelay);
  };

  const stopPreview = () => {
    clearTimeout(hoverTimer);
    cardEl.classList.remove('preview-active');
    if (loader) { loader.remove(); loader = null; }
    if (muteBtn) { muteBtn.remove(); muteBtn = null; }
    if (iframe && isPlaying) {
      iframe.style.opacity = '0';
      if (coverEl) coverEl.style.opacity = '1';
      const ref = iframe;
      setTimeout(() => ref.remove(), 400);
      iframe = null;
      isPlaying = false;
    }
    if (activeCardRef?.card === cardEl) activeCardRef.card = null;
  };

  const cleanup = () => {
    clearTimeout(hoverTimer);
    if (loader) { loader.remove(); loader = null; }
    if (muteBtn) { muteBtn.remove(); muteBtn = null; }
    if (iframe) { iframe.remove(); iframe = null; }
    isPlaying = false;
    if (activeCardRef?.card === cardEl) activeCardRef.card = null;
  };

  // Mouse events
  cardEl.addEventListener('mouseenter', startPreview);
  cardEl.addEventListener('mouseleave', stopPreview);
  // Keyboard accessibility
  if (keyboardA11y) {
    cardEl.addEventListener('focus', startPreview);
    cardEl.addEventListener('blur', stopPreview);
  }
  // Store stop function for single-active cleanup
  cardEl._stopPreview = stopPreview;

  return { stopPreview, cleanup };
}

/**
 * Initialize video trailer previews on genre card hover.
 * Only works for TMDB movie/TV cards (not books/games).
 *
 * @param {HTMLElement} container - The genre browser container
 * @param {string} lang - Language code for TMDB API calls
 */
export function initGenreCardVideoPreviews(container, lang) {
  if (!container) return;
  const cards = container.querySelectorAll('.genre-card[data-tmdb-id]');
  if (!cards.length) return;

  // Respect reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Skip video on touch devices
  const isTouchDevice = window.matchMedia('(hover: none)').matches;
  if (prefersReducedMotion || isTouchDevice) return;

  // Shared single-active state
  const activeCardRef = { card: null };

  // Load trailer cache from localStorage (7-day TTL)
  const trailerCache = _getTrailerCache();

  // Hydrate cards from cache immediately so hover is instant without even prefetch
  cards.forEach(card => {
    const cacheKey = `${card.dataset.mediaType || 'movie'}-${card.dataset.tmdbId}`;
    if (trailerCache[cacheKey]) card._videoId = trailerCache[cacheKey];
  });

  // Prefetch trailer IDs when genre rows scroll into view
  container._trailerPrefetchObserver?.disconnect();
  const prefetchObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const row = entry.target;
      prefetchObserver.unobserve(row);
      const rowCards = row.querySelectorAll('.genre-card[data-tmdb-id]');
      Array.from(rowCards).slice(0, PREFETCH_LIMIT).forEach(card => {
        if (card._trailerPrefetched || card._videoId) return;
        card._trailerPrefetched = true;
        const tmdbId = card.dataset.tmdbId;
        const mediaType = card.dataset.mediaType || 'movie';
        getTMDBVideos(parseInt(tmdbId), mediaType, lang)
          .then(videos => {
            if (videos.length) {
              card._videoId = videos[0].id;
              _setTrailerCacheEntry(tmdbId, mediaType, videos[0].id);
            }
          })
          .catch(() => {});
      });
    });
  }, { rootMargin: '200px' });
  container._trailerPrefetchObserver = prefetchObserver;
  container.querySelectorAll('.genre-row').forEach(row => prefetchObserver.observe(row));

  // Set up hover-to-play on each card using shared setupCardPreview
  cards.forEach(card => {
    const img = card.querySelector('.genre-card-image');
    setupCardPreview(card, {
      getVideoId: async () => {
        if (card._videoId) return card._videoId;
        const tmdbId = card.dataset.tmdbId;
        const mediaType = card.dataset.mediaType || 'movie';
        const videos = await getTMDBVideos(parseInt(tmdbId), mediaType, lang);
        if (videos.length) {
          card._videoId = videos[0].id;
          _setTrailerCacheEntry(tmdbId, mediaType, videos[0].id);
          return videos[0].id;
        }
        return null;
      },
      coverEl: img,
      insertBeforeEl: card.querySelector('.genre-card-overlay'),
      activeCardRef,
    });
  });
}
