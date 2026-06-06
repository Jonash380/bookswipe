import { escapeHTML, getGenreIcon } from './utils.js';
import { fetchFirstParagraph } from './api.js';

/**
 * DeepDivePanel - TikTok-style vertical expansion for card deep-dive.
 * Opens from bottom-zone swipe-up gesture. Drag-to-dismiss with spring physics.
 */
export class DeepDivePanel {
  /**
   * @param {Object} opts
   * @param {Object} opts.card - The card data object
   * @param {string} opts.mediaType - 'books' | 'movies' | 'tv' | 'games'
   * @param {string} opts.lang - 'de' | 'en'
   * @param {Object} opts.genreMap - TMDB genre ID -> name map
   * @param {Function} opts.onSave - Called when user taps save/like
   * @param {Function} opts.onSkip - Called when user taps skip/nope
   * @param {Function} opts.onDismiss - Called when panel is dismissed
   */
  constructor(opts) {
    this.card = opts.card;
    this.mediaType = opts.mediaType;
    this.lang = opts.lang;
    this.genreMap = opts.genreMap || {};
    this.onSave = opts.onSave || (() => {});
    this.onSkip = opts.onSkip || (() => {});
    this.onDismiss = opts.onDismiss || (() => {});

    this.panel = null;
    this.backdrop = null;
    this._dragStartY = 0;
    this._dragDelta = 0;
    this._isDragging = false;
    this._isOpen = false;
    this._hapticSnapped = false;
    this._escHandler = null;
    this._firstParaFetched = false;
  }

  open() {
    if (this._isOpen) return;
    this._isOpen = true;

    // Create backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'deep-dive-backdrop';
    document.body.appendChild(this.backdrop);

    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'deep-dive-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.innerHTML = this._renderContent();
    document.body.appendChild(this.panel);

    // Animate open
    requestAnimationFrame(() => {
      this.backdrop.classList.add('open');
      this.panel.classList.add('open');
    });

    // Bind events
    this._bindEvents();

    // Fetch first paragraph for books (async, fills in later)
    if (this.mediaType === 'books' && !this._firstParaFetched) {
      this._fetchFirstPara();
    }
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;

    this.panel.classList.add('closing');
    this.backdrop.classList.remove('open');

    // Haptic feedback on dismiss
    if (navigator.vibrate) navigator.vibrate(10);

    setTimeout(() => {
      this.panel?.remove();
      this.backdrop?.remove();
      this.panel = null;
      this.backdrop = null;
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
      this.onDismiss();
    }, 350);
  }

  _bindEvents() {
    const handle = this.panel.querySelector('.deep-dive-handle');
    if (!handle) return;

    // Drag-to-dismiss
    const onStart = (e) => {
      this._isDragging = true;
      this._dragDelta = 0;
      this._hapticSnapped = false;
      const touch = e.touches ? e.touches[0] : e;
      this._dragStartY = touch.clientY;
      this.panel.style.transition = 'none';
    };

    const onMove = (e) => {
      if (!this._isDragging) return;
      const touch = e.touches ? e.touches[0] : e;
      this._dragDelta = touch.clientY - this._dragStartY;

      // Only allow dragging down (positive delta)
      if (this._dragDelta < 0) this._dragDelta = 0;

      // Smooth non-linear resistance (no discontinuity)
      const resist = this._dragDelta * (0.5 + 0.4 * Math.min(this._dragDelta / 400, 1));

      this.panel.style.transform = `translateY(${resist}px)`;

      // Scale card backdrop based on progress
      const progress = Math.min(resist / (window.innerHeight * 0.5), 1);
      this.backdrop.style.opacity = 1 - progress * 0.6;

      // Haptic snap at 40% drag threshold
      if (!this._hapticSnapped && resist > window.innerHeight * 0.25) {
        this._hapticSnapped = true;
        if (navigator.vibrate) navigator.vibrate(15);
      }

      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (!this._isDragging) return;
      this._isDragging = false;
      this.panel.style.transition = '';

      // Dismiss threshold: if dragged past 20% of screen height
      const threshold = window.innerHeight * 0.2;
      const resist = this._dragDelta * (0.5 + 0.4 * Math.min(this._dragDelta / 400, 1));

      if (resist > threshold) {
        this.close();
      } else {
        // Snap back with overshoot
        this.panel.style.transform = '';
        this.backdrop.style.opacity = '';
        // Brief overshoot animation
        this.panel.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        requestAnimationFrame(() => {
          this.panel.style.transform = 'translateY(0)';
          setTimeout(() => {
            if (this.panel) this.panel.style.transition = '';
          }, 400);
        });
      }
      this._dragDelta = 0;
    };

    // Touch events on drag handle
    handle.addEventListener('touchstart', onStart, { passive: true });
    handle.addEventListener('touchmove', onMove, { passive: false });
    handle.addEventListener('touchend', onEnd);
    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('mousemove', onMove);
    handle.addEventListener('mouseup', onEnd);
    handle.addEventListener('mouseleave', onEnd);

    // Also allow drag on the entire panel header area
    const header = this.panel.querySelector('.deep-dive-header');
    if (header && header !== handle) {
      header.addEventListener('touchstart', onStart, { passive: true });
      header.addEventListener('touchmove', onMove, { passive: false });
      header.addEventListener('touchend', onEnd);
    }

    // Dismiss on backdrop click
    this.backdrop.addEventListener('click', () => this.close());

    // Escape key dismiss
    this._escHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._escHandler);

    // Sticky action bar buttons
    this.panel.querySelector('[data-action="deep-save"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
      setTimeout(() => this.onSave(), 350);
    });
    this.panel.querySelector('[data-action="deep-skip"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
      setTimeout(() => this.onSkip(), 350);
    });

    // Close button
    this.panel.querySelector('[data-action="deep-close"]')?.addEventListener('click', () => this.close());

    // Trope tag taps (highlight matching)
    this.panel.querySelectorAll('.deep-dive-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        tag.classList.toggle('active');
      });
    });
  }

  async _fetchFirstPara() {
    this._firstParaFetched = true;
    const { text } = await fetchFirstParagraph(this.card);
    if (!text || !this.panel) return;

    const el = this.panel.querySelector('.deep-dive-first-para');
    if (el) {
      el.textContent = text;
      el.classList.add('loaded');
      // Hide the loading skeleton
      const skeleton = this.panel.querySelector('.deep-dive-para-skeleton');
      if (skeleton) skeleton.style.display = 'none';
    }
  }

  _renderContent() {
    const card = this.card;
    const de = this.lang === 'de';
    const isBook = this.mediaType === 'books';
    const isGame = this.mediaType === 'games';
    const isMovie = this.mediaType === 'movies' || this.mediaType === 'tv';

    // Genre string
    const genreStr = isGame
      ? (card.genres || []).join(', ')
      : (card.genres || []).map(g => typeof g === 'string' ? g : (this.genreMap[g] || g)).join(', ');

    // Build medium-specific sections
    let mediumSection = '';
    if (isBook) mediumSection = this._renderBookContent(card, de);
    else if (isMovie) mediumSection = this._renderMovieContent(card, de);
    else if (isGame) mediumSection = this._renderGameContent(card, de);

    // DNA/trope tags
    const tags = this._getTags(card);

    return `
      <div class="deep-dive-header">
        <div class="deep-dive-handle"><div class="deep-dive-handle-pill"></div></div>
        <button class="deep-dive-close" data-action="deep-close" aria-label="Close">✕</button>
      </div>
      <div class="deep-dive-scroll">
        <div class="deep-dive-hero">
          ${card.cover || card.backdrop
            ? `<img class="deep-dive-cover" src="${escapeHTML(card.backdrop || card.cover)}" alt="" loading="lazy">`
            : `<div class="deep-dive-cover-placeholder">${isGame ? '🎮' : isBook ? '📚' : '🎬'}</div>`}
          <div class="deep-dive-hero-fade"></div>
          <div class="deep-dive-hero-info">
            <h2 class="deep-dive-title">${escapeHTML(card.title)}</h2>
            <div class="deep-dive-meta">
              ${card.author ? `<span class="deep-dive-author">${escapeHTML(card.author)}</span>` : ''}
              ${card.year ? `<span class="deep-dive-year">${card.year}</span>` : ''}
              ${card.rating ? `<span class="deep-dive-rating">⭐ ${typeof card.rating === 'number' ? card.rating.toFixed(1) : card.rating}</span>` : ''}
            </div>
            ${genreStr ? `<div class="deep-dive-genres">${(card.genres || []).slice(0, 4).map(g => {
              const id = typeof g === 'number' ? g : g;
              const name = typeof g === 'string' ? g : (this.genreMap[g] || g);
              const icon = getGenreIcon(id, this.mediaType, this.lang);
              return `<span class="deep-dive-genre-chip">${icon} ${escapeHTML(name)}</span>`;
            }).join('')}</div>` : ''}
          </div>
        </div>

        ${mediumSection}

        ${tags.length ? `
          <div class="deep-dive-tags-section">
            <h4 class="deep-dive-section-title">${de ? 'Stimmung' : 'Vibes'}</h4>
            <div class="deep-dive-tags">${tags.map(t =>
              `<span class="deep-dive-tag">${escapeHTML(t)}</span>`
            ).join('')}</div>
          </div>
        ` : ''}

        ${card.overview ? `
          <div class="deep-dive-overview-section">
            <h4 class="deep-dive-section-title">${de ? 'Beschreibung' : 'Overview'}</h4>
            <p class="deep-dive-overview">${escapeHTML(card.overview)}</p>
          </div>
        ` : ''}
      </div>
      <div class="deep-dive-actions">
        <button class="deep-dive-btn deep-dive-btn-skip" data-action="deep-skip" aria-label="${de ? 'Nicht interessiert' : 'Not interested'}">
          <span class="deep-dive-btn-icon">✕</span>
          <span class="deep-dive-btn-label">${de ? 'Nicht interessiert' : 'Not interested'}</span>
        </button>
        <button class="deep-dive-btn deep-dive-btn-save" data-action="deep-save" aria-label="${de ? 'Merkliste' : 'Save'}">
          <span class="deep-dive-btn-icon">♥</span>
          <span class="deep-dive-btn-label">${de ? 'Merkliste' : 'Save'}</span>
        </button>
      </div>`;
  }

  _renderBookContent(card, de) {
    return `
      <div class="deep-dive-section deep-dive-book-section">
        <h4 class="deep-dive-section-title">${de ? 'Der erste Schluck' : 'The First Sip'}</h4>
        <div class="deep-dive-first-para-wrap">
          <p class="deep-dive-first-para" style="font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;line-height:1.7;font-style:italic;color:var(--fg);">
            ${card.description ? escapeHTML(card.description) : ''}
          </p>
          ${!card.description ? `<div class="deep-dive-para-skeleton"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>` : ''}
        </div>
        ${card.pageCount ? `<span class="deep-dive-badge">📄 ${card.pageCount} ${de ? 'Seiten' : 'pages'}</span>` : ''}
        ${card.publisher ? `<span class="deep-dive-badge">🏢 ${escapeHTML(card.publisher)}</span>` : ''}
      </div>`;
  }

  _renderMovieContent(card, de) {
    // Use backdrop as visual hook (TMDB trailer fetching would require extra API call)
    const contextBadges = this._getContextBadges(card, de);
    return `
      <div class="deep-dive-section deep-dive-movie-section">
        <h4 class="deep-dive-section-title">${de ? 'Stimmungsbild' : 'The Mood'}</h4>
        ${contextBadges.length ? `
          <div class="deep-dive-context-badges">
            ${contextBadges.map(b => `<span class="deep-dive-context-badge">${b}</span>`).join('')}
          </div>
        ` : ''}
        ${card.backdrop ? `
          <div class="deep-dive-visual-hook">
            <img class="deep-dive-hook-img" src="${escapeHTML(card.backdrop)}" alt="" loading="lazy">
          </div>
        ` : ''}
        ${card.vote_count ? `<span class="deep-dive-badge">🗳️ ${card.vote_count.toLocaleString()} ${de ? 'Bewertungen' : 'votes'}</span>` : ''}
      </div>`;
  }

  _renderGameContent(card, de) {
    return `
      <div class="deep-dive-section deep-dive-game-section">
        <h4 class="deep-dive-section-title">${de ? 'Spielzeit-Check' : 'Time Investment'}</h4>
        ${card.playtime != null ? `
          <div class="deep-dive-time-bars">
            <div class="deep-dive-time-bar">
              <span class="deep-dive-time-label">${de ? 'Hauptstory' : 'Main Story'}</span>
              <div class="deep-dive-time-meter"><div class="deep-dive-time-fill" style="width:${Math.min(card.playtime / 50 * 100, 100)}%"></div></div>
              <span class="deep-dive-time-val">${card.playtime}h</span>
            </div>
          </div>
        ` : ''}
        ${card.platforms?.length ? `
          <div class="deep-dive-platforms">
            ${card.platforms.slice(0, 5).map(p => `<span class="deep-dive-platform">${escapeHTML(p.abbr || p.name)}</span>`).join('')}
          </div>
        ` : ''}
        ${card.steamTags?.length ? `
          <div class="deep-dive-steam-tags">
            ${card.steamTags.slice(0, 6).map(t => `<span class="deep-dive-steam-tag">${escapeHTML(typeof t === 'string' ? t : t.name)}</span>`).join('')}
          </div>
        ` : ''}
      </div>`;
  }

  _getContextBadges(card, de) {
    const badges = [];
    const overview = (card.overview || '').toLowerCase();
    const genres = (card.genres || []).map(g => typeof g === 'number' ? g : 0);

    if (genres.includes(10749) || /romance|love|relationship/.test(overview))
      badges.push(de ? '🌹 Date Night' : '🌹 Date Night');
    if (genres.includes(878) || /mind|twist|complex|psycholog/.test(overview))
      badges.push(de ? '🧠 Kopfkino' : '🧠 Mind-Bending');
    if (genres.includes(27) || /scary|horror|terrif/.test(overview))
      badges.push(de ? '😱 Gruselfaktor' : '😱 Bring Tissues');
    if (genres.includes(35) || /funny|comedy|hilarious/.test(overview))
      badges.push(de ? '😂 Feel Good' : '😂 Feel Good');
    if (genres.includes(18) && /family|parent|child/.test(overview))
      badges.push(de ? '👨‍👩‍👧 Familienfilm' : '👨‍👩‍👧 Family Night');
    if (genres.includes(28) || /action|fight|explosi/.test(overview))
      badges.push('🍿 Action');

    return badges.slice(0, 3);
  }

  _getTags(card) {
    const tags = [];
    const overview = (card.overview || '').toLowerCase();

    // Use mediaDNA if available
    const dna = card.mediaDNA || {};
    if (dna.tropes) tags.push(...dna.tropes.slice(0, 2));
    if (dna.pacing) tags.push(...dna.pacing.slice(0, 1));
    if (dna.aesthetic) tags.push(...dna.aesthetic.slice(0, 1));

    // Fallback: regex-based tag detection
    if (!tags.length) {
      if (/twist|surprise|reveal|mystery/.test(overview)) tags.push('🧠 Plot Twist');
      if (/romance|love|relationship/.test(overview)) tags.push('💕 Slow Burn');
      if (/dark|noir|shadow/.test(overview)) tags.push('🎬 Noir');
      if (/space|galaxy|star|planet/.test(overview)) tags.push('🚀 Space Opera');
      if (/laugh|funny|comedy/.test(overview)) tags.push('😂 Feel Good');
      if (/horror|scary|terrifying/.test(overview)) tags.push('👻 Horror');
      if (/action|fight|battle/.test(overview)) tags.push('💥 Action Packed');
    }

    return tags.slice(0, 4);
  }
}
