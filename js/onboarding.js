import { escapeHTML, shuffleArray, getGenreIcon, getTMDBGenreMap } from './utils.js';
import { BOOK_QUIZ } from './books.js';
import { GAME_PLATFORMS, ICONIC_GAMES } from './games.js';
import { SwipeEngine } from './swipe.js';
import { addToWatchlist } from './storage.js';
import { LANG, WATCH_MODES } from './i18n.js';

export const OnboardingMixin = {
  // ===== ONBOARDING =====
  renderOnboarding(app) {
    const step = this.state.onboardingStep || 0;
    if (step === 0) return this._renderWelcomeScreen(app);
    if (step === 1) return this._renderVibeMatrixScreen(app);
    if (step === 2) return this._renderWhoWatchingScreen(app);
    if (step === 3 && this.state.mediaType === 'games') return this._renderPlatformScreen(app);
    if (step === 3 && this.state.mediaType !== 'games') return this._renderRapidFireScreen(app);
    if (step === 4 && this.state.mediaType === 'games') return this._renderRapidFireScreen(app);
    this.state.hasCompletedOnboarding = true;
    this.save();
    this.render();
  },

  _renderWelcomeScreen(app) {
    // Clean up window listeners from previous render
    if (this._portalCleanup) { this._portalCleanup(); this._portalCleanup = null; }
    const de = this.lang === 'de';
    const types = [
      { key: 'books', emoji: '📚', title: de ? 'Buecher' : 'Books', sub: this.tr.portalBooks, cta: this.tr.ctaBooks },
      { key: 'movies', emoji: '🎬', title: de ? 'Filme' : 'Movies', sub: this.tr.portalMovies, cta: this.tr.ctaMovies },
      { key: 'tv', emoji: '📺', title: 'TV', sub: this.tr.portalTV, cta: this.tr.ctaTV },
      { key: 'games', emoji: '🎮', title: de ? 'Spiele' : 'Games', sub: this.tr.portalGames, cta: this.tr.ctaGames },
    ];
    const activeIdx = types.findIndex(t => t.key === this.state.mediaType);
    const current = types[activeIdx >= 0 ? activeIdx : 1];

    app.innerHTML = `
      <div class="portal">
        <div class="portal-bg" data-aesthetic="${current.key}"></div>
        <div class="portal-particles" id="portal-particles"></div>
        <div class="portal-progress"><div class="portal-progress-fill" style="width:25%"></div></div>
        <div class="portal-lang">
          <button class="btn ${de ? 'active' : ''}" data-lang="de">DE</button>
          <button class="btn ${!de ? 'active' : ''}" data-lang="en">EN</button>
        </div>
        <div class="portal-content">
          <div class="portal-header">
            <h1>${this.tr.title}</h1>
            <p>${this.tr.portalSubtitle}</p>
          </div>
          <div class="portal-carousel">
            <div class="portal-cards">
              ${types.map((t, i) => `
                <div class="portal-card${t.key === current.key ? ' active' : ''}" data-type="${t.key}" role="button" aria-label="${t.title}" tabindex="0" style="transform:translateX(${(i - activeIdx) * 90}px) translateZ(${t.key === current.key ? 60 : -40}px) rotateY(${(i - activeIdx) * -8}deg) scale(${t.key === current.key ? 1 : .85});opacity:${t.key === current.key ? 1 : .5};z-index:${t.key === current.key ? 5 : 2 - Math.abs(i - activeIdx)}">
                  <div class="portal-card-glow"></div>
                  <div class="portal-card-cover" style="background-image:url(${t.key === 'books' ? 'https://image.tmdb.org/t/p/w500/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg' : t.key === 'movies' ? 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg' : t.key === 'tv' ? 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg' : 'https://cdn.akamai.steamstatic.com/steam/apps/292030/header.jpg'}),linear-gradient(135deg,${t.key === 'books' ? '#2d1f0e,#1a120b' : t.key === 'movies' ? '#1a0a0a,#0d0d1a' : t.key === 'tv' ? '#150a20,#0a0d1a' : '#0a1515,#0a0a15'})"></div>
                  <div class="portal-card-overlay"></div>
                  <div class="portal-card-content">
                    <span class="portal-card-emoji">${t.emoji}</span>
                    <div class="portal-card-title">${t.title}</div>
                    <div class="portal-card-sub">${t.sub}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="portal-dots">
            ${types.map((t) => `<div class="portal-dot${t.key === current.key ? ' active' : ''}" data-type="${t.key}"></div>`).join('')}
          </div>
          <div class="portal-cta">
            <button class="portal-cta-btn" data-type="${current.key}">${current.cta} →</button>
          </div>
        </div>
      </div>`;

    // ---- Image fallback: probe portal card covers, strip inline style on error ----
    app.querySelectorAll('.portal-card-cover').forEach(cover => {
      const bg = cover.style.backgroundImage;
      const match = bg.match(/url\(['"]?(https?:[^'"\)]+)['"]?\)/);
      if (!match) return;
      const img = new Image();
      img.onerror = () => { cover.style.backgroundImage = ''; };
      img.src = match[1];
    });

    // ---- Portal Particles (per-aesthetic ambient effects) ----
    const particleContainer = app.querySelector('#portal-particles');
    const spawnDustMotes = () => {
      if (!particleContainer) return;
      particleContainer.innerHTML = '';
      for (let i = 0; i < 25; i++) {
        const mote = document.createElement('div');
        const isLarge = Math.random() > 0.7;
        const isBright = Math.random() > 0.8;
        mote.className = `dust-mote${isLarge ? ' large' : ''}${isBright ? ' bright' : ''}`;
        mote.style.cssText = `
          left:${Math.random() * 100}%;top:${Math.random() * 100}%;
          --dust-dur:${6 + Math.random() * 10}s;--dust-delay:${-Math.random() * 10}s;
          --dust-x1:${(Math.random() - .5) * 40}px;--dust-y1:${(Math.random() - .5) * 50}px;
          --dust-x2:${(Math.random() - .5) * 60}px;--dust-y2:${(Math.random() - .5) * 40}px;
          --dust-x3:${(Math.random() - .5) * 50}px;--dust-y3:${(Math.random() - .5) * 60}px;
          --dust-x4:${(Math.random() - .5) * 45}px;--dust-y4:${(Math.random() - .5) * 35}px;
          --dust-x5:${(Math.random() - .5) * 55}px;--dust-y5:${(Math.random() - .5) * 45}px;
          --dust-s1:${.5 + Math.random() * .8};--dust-s2:${.6 + Math.random() * .7};
          --dust-s3:${.5 + Math.random() * .9};--dust-s4:${.6 + Math.random() * .8};--dust-s5:${.5 + Math.random() * .7};
          --dust-o1:${.15 + Math.random() * .3};--dust-o2:${.25 + Math.random() * .4};
          --dust-o3:${.15 + Math.random() * .3};--dust-o4:${.2 + Math.random() * .4};--dust-o5:${.1 + Math.random() * .3};
        `;
        particleContainer.appendChild(mote);
      }
    };
    const spawnGrain = () => {
      if (!particleContainer) return;
      particleContainer.innerHTML = '';
      for (let i = 0; i < 60; i++) {
        const g = document.createElement('div');
        const isLarge = Math.random() > 0.85;
        const isColored = Math.random() > 0.9;
        g.className = `grain-particle${isLarge ? ' large' : ''}${isColored ? ' colored' : ''}`;
        g.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;--grain-dur:${0.08 + Math.random() * 0.2}s;--grain-delay:${-Math.random() * 2}s`;
        particleContainer.appendChild(g);
      }
    };
    const spawnScanlines = () => {
      if (!particleContainer) return;
      particleContainer.innerHTML = '';
      for (let i = 0; i < 12; i++) {
        const sl = document.createElement('div');
        const isThick = i % 4 === 0;
        const isBright = i % 6 === 0;
        sl.className = `scanline${isThick ? ' thick' : ''}${isBright ? ' bright' : ''}`;
        sl.style.cssText = `top:${(i / 12) * 100}%;--scan-dur:${3 + Math.random() * 4}s;animation-delay:${-Math.random() * 4}s`;
        particleContainer.appendChild(sl);
      }
    };
    const spawnPixels = () => {
      if (!particleContainer) return;
      particleContainer.innerHTML = '';
      for (let i = 0; i < 30; i++) {
        const px = document.createElement('div');
        const isPink = Math.random() > 0.6;
        const isSmall = Math.random() > 0.7;
        const isLarge = !isSmall && Math.random() > 0.85;
        px.className = `pixel-particle${isPink ? ' pink' : ''}${isSmall ? ' small' : ''}${isLarge ? ' large' : ''}`;
        px.style.cssText = `
          left:${Math.random() * 100}%;top:${Math.random() * 100}%;
          --px-dur:${4 + Math.random() * 8}s;--px-delay:${-Math.random() * 8}s;
          --px-x1:${(Math.random() - .5) * 30}px;--px-y1:${(Math.random() - .5) * 40}px;
          --px-x2:${(Math.random() - .5) * 50}px;--px-y2:${(Math.random() - .5) * 35}px;
          --px-x3:${(Math.random() - .5) * 40}px;--px-y3:${(Math.random() - .5) * 50}px;
          --px-x4:${(Math.random() - .5) * 35}px;--px-y4:${(Math.random() - .5) * 30}px;
          --px-x5:${(Math.random() - .5) * 45}px;--px-y5:${(Math.random() - .5) * 40}px;
        `;
        particleContainer.appendChild(px);
      }
    };
    const particleSpawners = { books: spawnDustMotes, movies: spawnGrain, tv: spawnScanlines, games: spawnPixels };
    const particleClasses = { books: 'portal-dust', movies: 'portal-grain', tv: 'portal-scanlines', games: 'portal-pixels' };
    const particleCache = {};
    const setPortalParticles = (type) => {
      if (!particleContainer) return;
      // Remove old type class, add new one — keep active always on
      Object.values(particleClasses).forEach(cls => particleContainer.classList.remove(cls));
      const typeClass = particleClasses[type];
      if (typeClass) particleContainer.classList.add(typeClass);
      particleContainer.classList.add('active');
      // Use cached particles or spawn fresh
      if (particleCache[type]) {
        particleContainer.innerHTML = particleCache[type];
      } else {
        const spawner = particleSpawners[type];
        if (spawner) { spawner(); particleCache[type] = particleContainer.innerHTML; }
      }
    };
    // Set initial active class and spawn
    if (particleClasses[current.key]) particleContainer.classList.add(particleClasses[current.key]);
    const initSpawner = particleSpawners[current.key];
    if (initSpawner) initSpawner();
    if (particleContainer && initSpawner) particleCache[current.key] = particleContainer.innerHTML;

    // ---- Parallax: subtle particle shift on mouse/gyroscope ----
    const parallaxMax = 18; // max px shift
    let parallaxX = 0, parallaxY = 0, parallaxRaf = null;
    const applyParallax = () => {
      if (particleContainer) particleContainer.style.transform = `translate(${parallaxX}px, ${parallaxY}px)`;
      parallaxRaf = null;
    };
    const onMouseMove = (e) => {
      if (isDragging) return; // skip parallax during carousel drag
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      parallaxX = ((e.clientX - cx) / cx) * parallaxMax;
      parallaxY = ((e.clientY - cy) / cy) * parallaxMax;
      if (!parallaxRaf) parallaxRaf = requestAnimationFrame(applyParallax);
    };
    const onDeviceOrientation = (e) => {
      // gamma: left-right tilt (-90 to 90), beta: front-back tilt (-180 to 180)
      if (e.gamma != null && e.beta != null) {
        parallaxX = Math.max(-parallaxMax, Math.min(parallaxMax, (e.gamma / 45) * parallaxMax));
        parallaxY = Math.max(-parallaxMax, Math.min(parallaxMax, ((e.beta - 45) / 45) * parallaxMax));
        if (!parallaxRaf) parallaxRaf = requestAnimationFrame(applyParallax);
      }
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    const origCleanup = this._portalCleanup;
    this._portalCleanup = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('deviceorientation', onDeviceOrientation);
      if (particleContainer) particleContainer.style.transform = '';
      if (origCleanup) origCleanup();
    };

    // ---- Carousel interaction ----
    const carousel = app.querySelector('.portal-carousel');
    const cardsEl = app.querySelectorAll('.portal-card');
    const dots = app.querySelectorAll('.portal-dot');
    let dragStartX = 0;
    let dragDelta = 0;
    let isDragging = false;

    const setPortalAesthetic = (type) => {
      const bg = app.querySelector('.portal-bg');
      if (bg) bg.dataset.aesthetic = type;
      setPortalParticles(type);
    };

    const updateCarousel = (activeType) => {
      const idx = types.findIndex(t => t.key === activeType);
      if (idx < 0) return;
      this.state.mediaType = activeType;
      this._syncFiltersToURL();
      setPortalAesthetic(activeType);

      cardsEl.forEach((card, i) => {
        const offset = i - idx;
        const isActive = i === idx;
        card.style.transform = `translateX(${offset * 90}px) translateZ(${isActive ? 60 : -40}px) rotateY(${offset * -8}deg) scale(${isActive ? 1 : .85})`;
        card.style.opacity = isActive ? 1 : Math.max(0.3, 0.6 - Math.abs(offset) * 0.15);
        card.style.zIndex = isActive ? 5 : 2 - Math.abs(offset);
        card.classList.toggle('active', isActive);
      });
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === idx);
      });
      // Update CTA
      const ctaBtn = app.querySelector('.portal-cta-btn');
      if (ctaBtn) {
        ctaBtn.dataset.type = activeType;
        ctaBtn.textContent = types[idx].cta + ' →';
      }
    };

    // Swipe/drag on carousel
    const onPointerDown = (e) => {
      isDragging = true;
      dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
      dragDelta = 0;
    };
    const onPointerMove = (e) => {
      if (!isDragging) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      dragDelta = x - dragStartX;
      // Apply live drag offset
      cardsEl.forEach((card, i) => {
        const curIdx = types.findIndex(t => t.key === this.state.mediaType);
        const offset = i - curIdx;
        const isActive = i === curIdx;
        const dragOffset = dragDelta * 0.4;
        card.style.transition = 'none';
        card.style.transform = `translateX(${offset * 90 + dragOffset}px) translateZ(${isActive ? 60 : -40}px) rotateY(${offset * -8}deg) scale(${isActive ? 1 : .85})`;
      });
    };
    const onPointerUp = () => {
      if (!isDragging) return;
      isDragging = false;
      const finalDelta = dragDelta;
      dragDelta = 0;
      cardsEl.forEach(card => { card.style.transition = ''; });
      if (Math.abs(finalDelta) > 50) {
        const curIdx = types.findIndex(t => t.key === this.state.mediaType);
        const nextIdx = finalDelta < 0 ? Math.min(curIdx + 1, types.length - 1) : Math.max(curIdx - 1, 0);
        if (nextIdx !== curIdx) {
          updateCarousel(types[nextIdx].key);
          if (navigator.vibrate) navigator.vibrate(10);
        }
      } else {
        updateCarousel(this.state.mediaType);
      }
    };

    carousel.addEventListener('touchstart', onPointerDown, { passive: true });
    carousel.addEventListener('touchmove', onPointerMove, { passive: true });
    carousel.addEventListener('touchend', onPointerUp);
    carousel.addEventListener('mousedown', (e) => { e.preventDefault(); onPointerDown(e); });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    const carouselPrevCleanup = this._portalCleanup;
    this._portalCleanup = () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      if (carouselPrevCleanup) carouselPrevCleanup();
    };

    // Click on cards + keyboard accessibility
    cardsEl.forEach(card => {
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
      card.addEventListener('click', () => {
        if (Math.abs(dragDelta) > 20) { dragDelta = 0; return; } // ignore click after drag
        dragDelta = 0;
        const type = card.dataset.type;
        if (type === this.state.mediaType) {
          // Active card tapped — expand and proceed
          this._portalExpandAndProceed(app, card, types);
        } else {
          updateCarousel(type);
          if (navigator.vibrate) navigator.vibrate(10);
        }
      });
    });

    // Click on dots
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => updateCarousel(types[i].key));
    });

    // CTA button
    app.querySelector('.portal-cta-btn')?.addEventListener('click', () => {
      const activeCard = app.querySelector('.portal-card.active');
      if (activeCard) this._portalExpandAndProceed(app, activeCard, types);
    });

    // Lang toggle
    app.querySelector('[data-lang="de"]')?.addEventListener('click', () => { this.lang = 'de'; this.tr = LANG.de; this._genreMap = getTMDBGenreMap('de'); this._syncFiltersToURL(); this.save(); this.render(); });
    app.querySelector('[data-lang="en"]')?.addEventListener('click', () => { this.lang = 'en'; this.tr = LANG.en; this._genreMap = getTMDBGenreMap('en'); this._syncFiltersToURL(); this.save(); this.render(); });
  },

  _portalExpandAndProceed(app, cardEl, types) {
    if (this._portalCleanup) { this._portalCleanup(); this._portalCleanup = null; }
    if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
    cardEl.classList.add('expanding');
    setTimeout(() => {
      this.state.onboardingStep = 1; // vibe matrix
      this.save();
      this.render();
    }, 400);
  },

  _renderVibeMatrixScreen(app) {
    // Clean up previous portal/vibe listeners
    if (this._portalCleanup) { this._portalCleanup(); this._portalCleanup = null; }
    const de = this.lang === 'de';
    const sliders = [
      { key: 'vibePacing', left: { emoji: '🧘', label: this.tr.vibePacingSlow }, right: { emoji: '⚡', label: this.tr.vibePacingFast } },
      { key: 'vibeTone', left: { emoji: '🌧️', label: this.tr.vibeToneDark }, right: { emoji: '☀️', label: this.tr.vibeToneLight } },
      { key: 'vibeComplex', left: { emoji: '🍿', label: this.tr.vibeComplexPopcorn }, right: { emoji: '🧠', label: this.tr.vibeComplexDeep } },
    ];

    const isGames = this.state.mediaType === 'games';
    const vibeDots = isGames
      ? `<div class="onboarding-steps"><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot active"></div><div class="step-line"></div><div class="step-dot"></div><div class="step-line"></div><div class="step-dot"></div><div class="step-line"></div><div class="step-dot"></div></div>`
      : `<div class="onboarding-steps"><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot active"></div><div class="step-line"></div><div class="step-dot"></div><div class="step-line"></div><div class="step-dot"></div></div>`;
    app.innerHTML = `
      <div class="vibe-matrix">
        ${vibeDots}
        <h1 class="vibe-matrix-title">${this.tr.vibeTitle}</h1>
        <p class="vibe-matrix-sub">${de ? 'Ziehe die Orbs an deine bevorzugte Position' : 'Drag the orbs to your preferred position'}</p>
        <div class="vibe-slider-group">
          ${sliders.map(s => `
            <div class="vibe-slider" data-key="${s.key}">
              <div class="vibe-slider-labels">
                <span class="vibe-slider-label${this.state[s.key] < 40 ? ' active' : ''}" data-side="left">
                  <span class="vibe-emoji">${s.left.emoji}</span>${s.left.label}
                </span>
                <span class="vibe-slider-label${this.state[s.key] > 60 ? ' active' : ''}" data-side="right">
                  <span class="vibe-emoji">${s.right.emoji}</span>${s.right.label}
                </span>
              </div>
              <div class="vibe-track-container">
                <div class="vibe-track">
                  <div class="vibe-track-fill" style="width:${this.state[s.key]}%"></div>
                </div>
                <div class="vibe-track-zones">
                  <div class="vibe-zone"><div class="vibe-zone-dot${this.state[s.key] < 33 ? ' active' : ''}"></div></div>
                  <div class="vibe-zone"><div class="vibe-zone-dot${this.state[s.key] >= 33 && this.state[s.key] <= 66 ? ' active' : ''}"></div></div>
                  <div class="vibe-zone"><div class="vibe-zone-dot${this.state[s.key] > 66 ? ' active' : ''}"></div></div>
                </div>
                <div class="vibe-orb" style="left:${this.state[s.key]}%"></div>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-start" style="margin-top:16px">${de ? 'Weiter' : 'Continue'} →</button>
      </div>`;

    // Spring-physics drag — single active slider pattern with shared window listeners
    let activeSlider = null;
    const onGlobalMove = (e) => {
      if (!activeSlider) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      activeSlider.setPct(activeSlider.getPercent(clientX));
    };
    const onGlobalUp = () => {
      if (!activeSlider) return;
      const s = activeSlider;
      activeSlider = null;
      s.orb.classList.remove('dragging');
      const snapPoints = [0, 50, 100];
      const curTarget = this.state[s.key];
      const closest = snapPoints.reduce((a, b) => Math.abs(b - curTarget) < Math.abs(a - curTarget) ? b : a);
      if (Math.abs(closest - curTarget) < 12) {
        s.setPct(closest);
        if (navigator.vibrate) navigator.vibrate(8);
      }
      this.save();
    };
    window.addEventListener('mousemove', onGlobalMove);
    window.addEventListener('touchmove', onGlobalMove, { passive: true });
    window.addEventListener('mouseup', onGlobalUp);
    window.addEventListener('touchend', onGlobalUp);

    app.querySelectorAll('.vibe-slider').forEach(slider => {
      const key = slider.dataset.key;
      const container = slider.querySelector('.vibe-track-container');
      const orb = slider.querySelector('.vibe-orb');
      const fill = slider.querySelector('.vibe-track-fill');
      const labels = slider.querySelectorAll('.vibe-slider-label');
      const zones = slider.querySelectorAll('.vibe-zone-dot');
      let targetPct = this.state[key];
      let currentPct = targetPct;
      let velocity = 0;
      let rafId = null;
      const stiffness = 0.15;
      const damping = 0.7;

      let lastZone = targetPct < 33 ? 0 : targetPct <= 66 ? 1 : 2;
      const updateVisuals = (pct) => {
        orb.style.left = pct + '%';
        fill.style.width = pct + '%';
        labels[0].classList.toggle('active', pct < 40);
        labels[1].classList.toggle('active', pct > 60);
        zones[0].classList.toggle('active', pct < 33);
        zones[1].classList.toggle('active', pct >= 33 && pct <= 66);
        zones[2].classList.toggle('active', pct > 66);
        orb.setAttribute('aria-valuenow', Math.round(pct));
        // Haptic + visual pulse when crossing zone boundaries
        const newZone = pct < 33 ? 0 : pct <= 66 ? 1 : 2;
        if (newZone !== lastZone) {
          lastZone = newZone;
          if (navigator.vibrate) navigator.vibrate(6);
          orb.classList.add('pulse');
          setTimeout(() => orb.classList.remove('pulse'), 400);
        }
      };

      const springStep = () => {
        const force = (targetPct - currentPct) * stiffness;
        velocity = (velocity + force) * damping;
        currentPct += velocity;
        if (Math.abs(targetPct - currentPct) < 0.1 && Math.abs(velocity) < 0.1) {
          currentPct = targetPct;
          updateVisuals(currentPct);
          rafId = null;
          return;
        }
        updateVisuals(currentPct);
        rafId = requestAnimationFrame(springStep);
      };

      const setPct = (pct) => {
        targetPct = Math.max(0, Math.min(100, pct));
        this.state[key] = Math.round(targetPct);
        if (!rafId) rafId = requestAnimationFrame(springStep);
      };

      const getPercent = (clientX) => {
        const rect = container.getBoundingClientRect();
        return ((clientX - rect.left) / rect.width) * 100;
      };

      const sliderEntry = { key, orb, setPct, getPercent };

      const onDown = (e) => {
        e.preventDefault();
        activeSlider = sliderEntry;
        orb.classList.add('dragging');
        velocity = 0;
        if (navigator.vibrate) navigator.vibrate(5);
        // Spawn micro-particles on grab
        const rect = orb.getBoundingClientRect();
        for (let i = 0; i < 4; i++) {
          const p = document.createElement('span');
          p.className = 'vibe-spark';
          const angle = Math.random() * Math.PI * 2;
          const dist = 20 + Math.random() * 30;
          p.style.cssText = `left:${rect.left + rect.width/2}px;top:${rect.top + rect.height/2}px;--sx:${Math.cos(angle)*dist}px;--sy:${Math.sin(angle)*dist}px`;
          document.body.appendChild(p);
          setTimeout(() => p.remove(), 600);
        }
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        setPct(getPercent(clientX));
      };

      container.addEventListener('touchstart', onDown, { passive: false });
      container.addEventListener('mousedown', onDown);

      // Keyboard accessibility
      const leftLabel = labels[0]?.textContent || '';
      const rightLabel = labels[1]?.textContent || '';
      orb.setAttribute('role', 'slider');
      orb.setAttribute('aria-label', `${leftLabel} — ${rightLabel}`);
      orb.setAttribute('aria-valuemin', '0');
      orb.setAttribute('aria-valuemax', '100');
      orb.setAttribute('aria-valuenow', String(this.state[key]));
      orb.setAttribute('tabindex', '0');
      orb.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          setPct(Math.min(100, targetPct + 5));
          this.save();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          setPct(Math.max(0, targetPct - 5));
          this.save();
        }
      });
    });

    // Cleanup window listeners when leaving vibe matrix
    const vibeCleanup = () => {
      window.removeEventListener('mousemove', onGlobalMove);
      window.removeEventListener('touchmove', onGlobalMove);
      window.removeEventListener('mouseup', onGlobalUp);
      window.removeEventListener('touchend', onGlobalUp);
    };
    const prevCleanup = this._portalCleanup;
    this._portalCleanup = () => { vibeCleanup(); if (prevCleanup) prevCleanup(); };

    app.querySelector('.btn-start')?.addEventListener('click', () => {
      this.state.onboardingStep = 2;
      this.save();
      this.render();
    });
  },

  _renderWhoWatchingScreen(app) {
    const modes = [
      { key:'solo', icon:'👤', emoji:'🎭' },
      { key:'dateNight', icon:'💑', emoji:'🌹' },
      { key:'family', icon:'👨‍👩‍👧‍👦', emoji:'🧸' }
    ];
    const isGames = this.state.mediaType === 'games';
    const dots = isGames
      ? `<div class="onboarding-steps"><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot active"></div><div class="step-line"></div><div class="step-dot"></div><div class="step-line"></div><div class="step-dot"></div></div>`
      : `<div class="onboarding-steps"><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot active"></div><div class="step-line"></div><div class="step-dot"></div></div>`;
    app.innerHTML = `
      <div class="onboarding who-watching">
        ${dots}
        <h1>${this.tr.whoWatching}</h1>
        <p class="onboarding-sub">${this.tr.whoWatchingSub}</p>
        <div class="watch-mode-grid">
          ${modes.map(m => `
            <button class="watch-mode-card ${this.state.watchMode === m.key ? 'selected' : ''}" data-mode="${m.key}">
              <span class="watch-mode-icon">${m.icon}</span>
              <div class="watch-mode-text">
                <span class="watch-mode-label">${this.tr[m.key]}</span>
                <span class="watch-mode-sub">${this.tr[m.key + 'Sub']}</span>
              </div>
            </button>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-start">${this.tr.discover} →</button>
      </div>`;
    app.querySelectorAll('.watch-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        this.state.watchMode = card.dataset.mode;
        app.querySelectorAll('.watch-mode-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
    app.querySelector('.btn-start')?.addEventListener('click', () => {
      this._applyWatchModeFilters();
      this.state.onboardingStep = 3;
      this.save();
      this.render();
    });
  },

  _applyWatchModeFilters() {
    const mode = WATCH_MODES[this.state.watchMode] || WATCH_MODES.solo;
    if (mode.hardBlock.length && this.state.mediaType !== 'books') {
      this.state.blockedGenres = mode.hardBlock;
    }
    if (mode.boost.length && this.state.mediaType !== 'books') {
      this.state.boostedMoods = mode.boost;
    }
  },

  _renderPlatformScreen(app) {
    if (!this.state.selectedPlatforms) this.state.selectedPlatforms = [];
    const platforms = GAME_PLATFORMS;
    app.innerHTML = `
      <div class="onboarding who-watching">
        <div class="onboarding-steps">
          <div class="step-dot completed">✓</div>
          <div class="step-line filled"></div>
          <div class="step-dot completed">✓</div>
          <div class="step-line filled"></div>
          <div class="step-dot completed">✓</div>
          <div class="step-line filled"></div>
          <div class="step-dot active"></div>
          <div class="step-line"></div>
          <div class="step-dot"></div>
        </div>
        <h1>${this.tr.platforms}</h1>
        <p class="onboarding-sub">${this.lang === 'de' ? 'Waehle deine Plattformen' : 'Select your platforms'}</p>
        <div class="platform-grid">
          ${platforms.map(p => `
            <button class="platform-card ${this.state.selectedPlatforms.includes(p.id) ? 'selected' : ''}" data-pid="${p.id}">
              <span class="platform-icon">${p.icon}</span>
              <span class="platform-name">${p.name}</span>
            </button>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-start">${this.tr.discover} →</button>
      </div>`;
    app.querySelectorAll('.platform-card').forEach(card => {
      card.addEventListener('click', () => {
        const pid = parseInt(card.dataset.pid);
        const idx = this.state.selectedPlatforms.indexOf(pid);
        if (idx >= 0) {
          this.state.selectedPlatforms.splice(idx, 1);
          card.classList.remove('selected');
        } else {
          this.state.selectedPlatforms.push(pid);
          card.classList.add('selected');
        }
      });
    });
    app.querySelector('.btn-start')?.addEventListener('click', () => {
      this.state.onboardingStep = 4;
      this.save();
      this.render();
    });
  },

  _renderRapidFireScreen(app) {
    if (!this._rapidFireItems) {
      this._rapidFireItems = this._getRapidFireItems();
      this._rapidFireIndex = 0;
      this._rapidFireLikes = [];
      this._rapidFireStart = Date.now();
    }
    const items = this._rapidFireItems;
    const idx = this._rapidFireIndex;
    if (idx >= items.length || (Date.now() - this._rapidFireStart > 15000 && idx >= 3)) {
      return this._completeRapidFire(app);
    }
    const item = items[idx];
    const isGames = this.state.mediaType === 'games';
    const stepDots = isGames
      ? `<div class="onboarding-steps"><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot active"></div></div>`
      : `<div class="onboarding-steps"><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot active"></div></div>`;
    app.innerHTML = `
      <div class="onboarding rapid-fire">
        ${stepDots}
        <div class="rapid-fire-header">
          <h1>${this.tr.rapidFireTitle}</h1>
          <p>${this.tr.rapidFireSub}</p>
          <div class="rapid-fire-timer">
            <div class="timer-bar" style="width:${Math.min((idx / items.length) * 100, 100)}%"></div>
          </div>
          <span class="rapid-fire-count">${idx + 1}/${items.length}</span>
        </div>
        <div class="rapid-fire-card" data-id="${escapeHTML(item.id)}">
          ${item.cover ? `<img class="rf-cover" src="${escapeHTML(item.cover)}" alt="">` : `<div class="rf-cover placeholder">🎬</div>`}
          <div class="rf-info">
            <h2>${escapeHTML(item.title)}</h2>
            ${item.year ? `<span>${item.year}</span>` : ''}
            ${item.genres ? `<p class="rf-genres">${item.genres.slice(0,3).map(g => { const id = typeof g === 'number' ? g : g; const name = typeof g === 'string' ? g : (this._genreMap[g] || g); const icon = getGenreIcon(id, this.state.mediaType, this.lang); return `${icon} ${name}`; }).join(' · ')}</p>` : ''}
          </div>
          <span class="swipe-stamp swipe-stamp-like">${this.tr.like}</span>
          <span class="swipe-stamp swipe-stamp-nope">${this.tr.nope}</span>
        </div>
        <div class="swipe-actions rapid-fire-actions">
          <button class="btn btn-nope rf-nope" title="Pass">✕</button>
          <button class="btn btn-like rf-like" title="Like">♥</button>
        </div>
      </div>`;
    const cardEl = app.querySelector('.rapid-fire-card');
    if (cardEl) {
      if (this._rapidFireEngine) this._rapidFireEngine.destroy();
      this._rapidFireEngine = new SwipeEngine(cardEl, dir => {
        if (dir === 'right') {
          this._rapidFireLikes.push(item);
          document.body.classList.add('swipe-flash-right');
          setTimeout(() => document.body.classList.remove('swipe-flash-right'), 400);
        } else if (dir === 'left') {
          document.body.classList.add('swipe-flash-left');
          setTimeout(() => document.body.classList.remove('swipe-flash-left'), 400);
        }
        this._rapidFireIndex++;
        this.render();
      });
    }
    app.querySelector('.rf-like')?.addEventListener('click', () => {
      this._rapidFireLikes.push(item);
      this._rapidFireIndex++;
      this.render();
    });
    app.querySelector('.rf-nope')?.addEventListener('click', () => {
      this._rapidFireIndex++;
      this.render();
    });
  },

  _getRapidFireItems() {
    if (this.state.mediaType === 'games') {
      const pool = ICONIC_GAMES.slice(0, 10).map(g => ({
        id: `rf-${g.id}`, title: g.name, year: g.year,
        cover: g.steamAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${g.steamAppId}/header.jpg` : '',
        genres: g.tags, source: 'rapid-fire', type: 'game'
      }));
      return shuffleArray(pool);
    }
    if (this.state.mediaType === 'tv') {
      const pool = [
        { id:'rf-t1', title:'Stranger Things', year:2016, cover:'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg', genres:[18,10765,35] },
        { id:'rf-t2', title:'Breaking Bad', year:2008, cover:'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', genres:[18,80,53] },
        { id:'rf-t3', title:'The Office', year:2005, cover:'https://image.tmdb.org/t/p/w500/7DJKHzAi83BmQrWLrYYOqcoKfhR.jpg', genres:[35] },
        { id:'rf-t4', title:'Game of Thrones', year:2011, cover:'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg', genres:[18,10759,10765] },
        { id:'rf-t5', title:'Black Mirror', year:2011, cover:'https://image.tmdb.org/t/p/w500/seN6rRfN0I6n8iDXjlSMk1QjNcq.jpg', genres:[9648,878,53] },
        { id:'rf-t6', title:'Dark', year:2017, cover:'https://image.tmdb.org/t/p/w500/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg', genres:[18,9648,878] },
        { id:'rf-t7', title:'The Crown', year:2016, cover:'https://image.tmdb.org/t/p/w500/1M876KPjulVwppEpldhdc8V4o68.jpg', genres:[18,36] },
        { id:'rf-t8', title:'Squid Game', year:2021, cover:'https://image.tmdb.org/t/p/w500/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg', genres:[18,10759,53] },
        { id:'rf-t9', title:'Succession', year:2018, cover:'https://image.tmdb.org/t/p/w500/z0XiwdrCQ9yVIr4O0pxzaAYRxdW.jpg', genres:[18,35] },
        { id:'rf-t10', title:'The Mandalorian', year:2019, cover:'https://image.tmdb.org/t/p/w500/sWgBv7LV2PRoQgkxwlibdGXKz1S.jpg', genres:[10759,878,12] }
      ];
      return shuffleArray(pool);
    }
    if (this.state.mediaType === 'books') {
      const pool = [
        { id:'rf-b1', title:'Der Herr der Ringe', year:1954, cover:'https://covers.openlibrary.org/b/id/6979861-M.jpg', genres:['fantasy'], author:'J.R.R. Tolkien', source:'rapid-fire', type:'book' },
        { id:'rf-b2', title:'1984', year:1949, cover:'https://covers.openlibrary.org/b/id/8575741-M.jpg', genres:['scifi'], author:'George Orwell', source:'rapid-fire', type:'book' },
        { id:'rf-b3', title:'Harry Potter', year:1997, cover:'https://covers.openlibrary.org/b/id/7888716-M.jpg', genres:['fantasy'], author:'J.K. Rowling', source:'rapid-fire', type:'book' },
        { id:'rf-b4', title:'Die unendliche Geschichte', year:1979, cover:'https://covers.openlibrary.org/b/id/8252085-M.jpg', genres:['fantasy'], author:'Michael Ende', source:'rapid-fire', type:'book' },
        { id:'rf-b5', title:'Der Steppenwolf', year:1927, cover:'https://covers.openlibrary.org/b/id/8256561-M.jpg', genres:['historical'], author:'Hermann Hesse', source:'rapid-fire', type:'book' },
        { id:'rf-b6', title:'Tschick', year:2010, cover:'https://covers.openlibrary.org/b/id/7432041-M.jpg', genres:['ya'], author:'Wolfgang Herrndorf', source:'rapid-fire', type:'book' },
        { id:'rf-b7', title:'Das Parfum', year:1985, cover:'https://covers.openlibrary.org/b/id/7481926-M.jpg', genres:['thriller'], author:'Patrick Süskind', source:'rapid-fire', type:'book' },
        { id:'rf-b8', title:'Fahrenheit 451', year:1953, cover:'https://covers.openlibrary.org/b/id/8266056-M.jpg', genres:['scifi'], author:'Ray Bradbury', source:'rapid-fire', type:'book' },
        { id:'rf-b9', title:'Die Vermessung der Welt', year:2005, cover:'https://covers.openlibrary.org/b/id/12630983-M.jpg', genres:['historical'], author:'Daniel Kehlmann', source:'rapid-fire', type:'book' },
        { id:'rf-b10', title:'Eragon', year:2003, cover:'https://covers.openlibrary.org/b/id/8315859-M.jpg', genres:['fantasy'], author:'Christopher Paolini', source:'rapid-fire', type:'book' }
      ];
      return shuffleArray(pool);
    }
    const pool = [
      { id:'rf-1', title:'The Matrix', year:1999, cover:'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', genres:[28,878] },
      { id:'rf-2', title:'Barbie', year:2023, cover:'https://image.tmdb.org/t/p/w500/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg', genres:[35,14] },
      { id:'rf-3', title:'Parasite', year:2019, cover:'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', genres:[35,53,18] },
      { id:'rf-4', title:'Spider-Man: Into the Spider-Verse', year:2018, cover:'https://image.tmdb.org/t/p/w500/iiZZ8QEtAl2JTVGqiUp9KTvzC1.jpg', genres:[16,28,878] },
      { id:'rf-5', title:'Everything Everywhere All at Once', year:2022, cover:'https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg', genres:[28,12,878] },
      { id:'rf-6', title:'The Notebook', year:2004, cover:'https://image.tmdb.org/t/p/w500/qXNodH36mHqY7O4bQI3Pmw1c5T1.jpg', genres:[10749,18] },
      { id:'rf-7', title:'Inception', year:2010, cover:'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg', genres:[28,878,12] },
      { id:'rf-8', title:'The Shining', year:1980, cover:'https://image.tmdb.org/t/p/w500/nRj5511mZdTl4saWEPoj9QroTIu.jpg', genres:[27,53] },
      { id:'rf-9', title:'Spirited Away', year:2001, cover:'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBkuVcm.jpg', genres:[16,14,12] },
      { id:'rf-10', title:'Mad Max: Fury Road', year:2015, cover:'https://image.tmdb.org/t/p/w500/8tZYtuWezp8JbcsvHYO0O46tFBO.jpg', genres:[28,12,878] }
    ];
    return shuffleArray(pool);
  },

  _completeRapidFire(app) {
    this._rapidFireLikes.forEach(item => {
      if (!this.watchlist.find(w => w.id === item.id)) {
        this.watchlist.push({ ...item, source: 'rapid-fire' });
        addToWatchlist({ ...item, source: 'rapid-fire' });
      }
    });
    this.state.hasCompletedOnboarding = true;
    this.state.onboardingStep = 5;
    this.save();
    this.render();
  },

  // ===== BOOK QUIZ (missing in original) =====
  renderQuiz(app) {
    const quiz = (BOOK_QUIZ[this.lang] || BOOK_QUIZ.de);
    const currentQ = this._quizIndex || 0;
    if (currentQ >= quiz.length) {
      this.state.hasCompletedQuiz = true;
      this.save();
      this.render();
      return;
    }
    const q = quiz[currentQ];
    app.innerHTML = `
      <div class="onboarding rapid-fire">
        <div class="rapid-fire-header">
          <h1>${this.t('quiz')}</h1>
          <p>${escapeHTML(q.q)}</p>
          <div class="rapid-fire-timer">
            <div class="timer-bar" style="width:${((currentQ + 1) / quiz.length) * 100}%"></div>
          </div>
          <span class="rapid-fire-count">${currentQ + 1}/${quiz.length}</span>
        </div>
        <div class="watch-mode-grid" style="margin-top:20px">
          ${q.a.map((ans, i) => `
            <button class="watch-mode-card" data-idx="${i}">
              <span class="watch-mode-label">${escapeHTML(ans)}</span>
            </button>
          `).join('')}
        </div>
      </div>`;
    app.querySelectorAll('.watch-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        this._quizIndex = (this._quizIndex || 0) + 1;
        this.renderQuiz(app);
      });
    });
  },
};
