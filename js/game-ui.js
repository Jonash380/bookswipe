// Game UI helpers extracted from app.js — badge renderers, DNA tag extraction,
// blind game helpers, and visual effects (hover preview, ambient glow, tilt).
// Applied to App prototype via Object.assign(App.prototype, GameUIMixin).

import { escapeHTML, getGenreIcon } from './utils.js';
import { getTMDBVideos } from './tmdb.js';
import { PLAYTIME_RANGES, MULTIPLAYER_TYPES } from './games.js';

export const GameUIMixin = {
  // ===== REMAINING HELPER METHODS =====
  _getCardDNATags(card) {
    const tags = [];
    const overview = (card.overview || '').toLowerCase();
    if (/twist|surprise|reveal|mystery/.test(overview)) tags.push('🧠 Plot Twist');
    if (/romance|love|relationship/.test(overview)) tags.push('💕 Slow Burn');
    if (/dark|noir|shadow|neon/.test(overview)) tags.push('🎬 Neon Noir');
    if (/space|galaxy|star|planet/.test(overview)) tags.push('🚀 Space Opera');
    if (/laugh|funny|comedy|hilarious/.test(overview)) tags.push('😂 Feel Good');
    if (/horror|scary|terrifying|nightmare/.test(overview)) tags.push('👻 Horror');
    if (/action|fight|battle|chase/.test(overview)) tags.push('💥 Action Packed');
    if (/true story|based on|real events/.test(overview)) tags.push('📖 Based on True Story');
    if (card.type === 'game' || card.source === 'igdb') {
      if (card.themes) card.themes.forEach(t => {
        if (/fantasy/i.test(t)) tags.push('⚔️ Fantasy');
        if (/sci.fi/i.test(t)) tags.push('🚀 Sci-Fi');
        if (/horror/i.test(t)) tags.push('👻 Horror');
        if (/histor/i.test(t)) tags.push('📜 Historical');
      });
      if (card.modes) card.modes.forEach(m => {
        if (/multi/i.test(m)) tags.push('👥 Multiplayer');
        if (/single/i.test(m)) tags.push('👤 Single-Player');
      });
      if (card.perspectives) card.perspectives.forEach(p => {
        if (/first/i.test(p)) tags.push('🔫 FPS');
        if (/third/i.test(p)) tags.push('🎯 Third-Person');
      });
    }
    if (!tags.length && card.genres) {
      const g = card.genres;
      if (Array.isArray(g)) {
        if (g.includes(878)) tags.push('🌌 Sci-Fi');
        if (g.includes(27)) tags.push('👻 Horror');
        if (g.includes(10749)) tags.push('💕 Romance');
        if (g.includes(16)) tags.push('✨ Animated');
        if (g.includes(12)) tags.push('🎭 RPG');
        if (g.includes(2)) tags.push('💥 Action');
      }
    }
    return tags.slice(0, 3);
  },

  _renderPlatformBadges(card) {
    if (!card.platforms || !card.platforms.length) return '';
    const shown = card.platforms.slice(0, 3);
    return `<div class="platform-badges">${shown.map(p =>
      `<span class="platform-badge">${escapeHTML(p.abbr || p.name)}</span>`
    ).join('')}${card.platforms.length > 3 ? `<span class="platform-badge more">+${card.platforms.length - 3}</span>` : ''}</div>`;
  },

  _renderPlaytimeBadge(card) {
    if (!card.playtime && card.playtime !== 0) return '';
    let range;
    if (card.playtime <= 5) range = PLAYTIME_RANGES.quick;
    else if (card.playtime <= 20) range = PLAYTIME_RANGES.medium;
    else if (card.playtime <= 50) range = PLAYTIME_RANGES.long;
    else range = PLAYTIME_RANGES.epic;
    return `<span class="playtime-badge" style="--pt-color:${range.color}">${range.icon} ${card.playtime}h</span>`;
  },

  _renderMultiplayerBadge(card) {
    if (!card.modes || !card.modes.length) return '';
    let mt = MULTIPLAYER_TYPES.single;
    const modes = card.modes.map(m => m.toLowerCase());
    if (modes.some(m => /mmo|massive/.test(m))) mt = MULTIPLAYER_TYPES.mmo;
    else if (modes.some(m => /pvp|competitive|versus/.test(m))) mt = MULTIPLAYER_TYPES.pvp;
    else if (modes.some(m => /co.op|cooperative|multi/.test(m))) mt = MULTIPLAYER_TYPES.coop;
    return `<span class="multiplayer-badge" style="--mp-color:${mt.color}">${mt.icon} ${mt.label}</span>`;
  },

  _renderSteamTags(card) {
    const tags = card.steamTags || [];
    if (!tags.length) return '';
    return `<div class="steam-tags">${tags.slice(0, 4).map(t =>
      `<span class="steam-tag">${escapeHTML(typeof t === 'string' ? t : t.name)}</span>`
    ).join('')}</div>`;
  },

  _renderPriceBadge(card) {
    if (card.price === undefined || card.price === null) return '';
    if (card.isFree) return '<span class="price-badge free">Free</span>';
    if (card.discount > 0) {
      return `<span class="price-badge discount">-${card.discount}%</span><span class="price-badge">${escapeHTML(card.price)}</span>`;
    }
    if (card.price) return `<span class="price-badge">${escapeHTML(card.price)}</span>`;
    return '';
  },

  _renderReviewBadge(card) {
    if (card.reviewScore === null || card.reviewScore === undefined) return '';
    const score = card.reviewScore;
    const count = card.reviewCount || 0;
    if (count < 10) return '';
    let colorClass = 'mixed';
    if (score >= 95 && count >= 500) colorClass = 'overwhelming';
    else if (score >= 80) colorClass = 'positive';
    else if (score >= 70) colorClass = 'mostly-positive';
    else if (score >= 40) colorClass = 'mixed';
    else colorClass = 'negative';
    const desc = this.lang === 'de' ? (card.reviewDescDe || card.reviewDesc || '') : (card.reviewDesc || '');
    return `<span class="review-badge ${colorClass}" title="${escapeHTML(desc)} - ${count.toLocaleString()} reviews">
      <span class="review-score">${score}%</span>
      <span class="review-label">${escapeHTML(desc)}</span>
    </span>`;
  },

  _renderMetacriticBadge(card) {
    if (!card.metacritic) return '';
    let colorClass = 'mc-mixed';
    if (card.metacritic >= 75) colorClass = 'mc-good';
    else if (card.metacritic >= 50) colorClass = 'mc-mixed';
    else colorClass = 'mc-bad';
    return `<span class="metacritic-badge ${colorClass}">MC ${card.metacritic}</span>`;
  },

  _getBlindGameHook(card) {
    const overview = (card.overview || '').toLowerCase();
    const genres = (card.genres || []).join(' ').toLowerCase();
    const themes = (card.themes || []).join(' ').toLowerCase();
    if (/souls.like|dark.souls|elden/.test(genres + overview)) return 'A punishing action RPG where death teaches, not punishes.';
    if (/roguelike|roguelite/.test(genres)) return 'A different run every time — die, learn, adapt, repeat.';
    if (/open.world|exploration/.test(genres + overview)) return 'A vast world awaits — go anywhere, do anything, at your own pace.';
    if (/horror|survival.horror/.test(genres)) return 'Terror lurks around every corner. Stay alert. Stay alive.';
    if (/simulation|farming|building/.test(genres)) return 'Build, grow, and create your own peaceful world.';
    if (/puzzle|raetsel/.test(genres)) return 'Think outside the box — every solution is a surprise.';
    if (/strategy|tactical/.test(genres)) return 'Outsmart, outplay, and conquer through pure brainpower.';
    if (/rpg|role.playing/.test(genres)) return 'Forge your character, shape your story, become a legend.';
    if (/platformer|metroidvania/.test(genres)) return 'Precision jumping meets rewarding exploration.';
    if (/racing|rennspiel/.test(genres)) return 'Feel the speed, own the track, leave everyone behind.';
    if (/fighting|kampf/.test(genres)) return 'Master combos, read your opponent, land the perfect strike.';
    if (/adventure|abenteuer/.test(genres)) return 'Explore wild lands, solve old secrets, survive the unknown.';
    return card.overview ? card.overview.split('.')[0] + '.' : 'A game worth your time.';
  },

  _getBlindGameMechanics(card) {
    const mechanics = [];
    const genres = (card.genres || []).join(' ').toLowerCase();
    const modes = (card.modes || []).join(' ').toLowerCase();
    const perspectives = (card.perspectives || []).join(' ').toLowerCase();
    if (/rpg|role.playing/.test(genres)) mechanics.push('🎭 RPG');
    if (/action/.test(genres)) mechanics.push('💥 Action');
    if (/adventure/.test(genres)) mechanics.push('🗺️ Adventure');
    if (/horror/.test(genres)) mechanics.push('👻 Horror');
    if (/puzzle/.test(genres)) mechanics.push('🧩 Puzzle');
    if (/strategy|tactical/.test(genres)) mechanics.push('🧠 Strategy');
    if (/simulation/.test(genres)) mechanics.push('🎮 Simulation');
    if (/platformer/.test(genres)) mechanics.push('⬆️ Platformer');
    if (/roguelike|roguelite/.test(genres)) mechanics.push('🔄 Roguelike');
    if (/racing/.test(genres)) mechanics.push('🏎️ Racing');
    if (/sports/.test(genres)) mechanics.push('⚽ Sports');
    if (/fighting/.test(genres)) mechanics.push('🥊 Fighting');
    if (/indie/.test(genres)) mechanics.push('🎨 Indie');
    if (/casual/.test(genres)) mechanics.push('☕ Casual');
    if (/multi|co.op/.test(modes)) mechanics.push('👥 Multiplayer');
    if (/single/.test(modes)) mechanics.push('👤 Solo');
    if (/first.person/.test(perspectives)) mechanics.push('🔫 First-Person');
    if (/third.person/.test(perspectives)) mechanics.push('🎯 Third-Person');
    if (!mechanics.length) mechanics.push('🎮 Game');
    return mechanics.slice(0, 3).map(m => `<span class="blind-mechanic-tag">${m}</span>`).join('');
  },

  _setupHoverPreview(cardEl, card) {
    const isGame = card.type === 'game' || card.source === 'igdb';
    const isTMDB = card.source === 'tmdb' && (card.type === 'movie' || card.type === 'tv');
    if (!isGame && !isTMDB) return null;

    let videoId = null;
    if (isGame) {
      const trailers = card.trailers || [];
      if (!trailers.length) return null;
      videoId = trailers[0].id;
    }
    const cover = cardEl.querySelector('.card-cover');
    if (!cover) return null;
    let iframe = null;
    let hoverTimer = null;
    let isPlaying = false;
    let trailerFetched = false;

    const startPreview = () => {
      hoverTimer = setTimeout(async () => {
        if (isPlaying) return;
        // TMDB cards: lazily fetch trailer on hover
        if (isTMDB && !videoId && !trailerFetched) {
          trailerFetched = true;
          try {
            const videos = await getTMDBVideos(card.tmdb_id, card.type === 'tv' ? 'tv' : 'movie', this.lang);
            if (videos.length) videoId = videos[0].id;
          } catch { return; }
        }
        if (!videoId) return;
        isPlaying = true;
        iframe = document.createElement('iframe');
        iframe.className = 'game-preview-iframe';
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&showinfo=0`;
        iframe.allow = 'autoplay; encrypted-media';
        iframe.setAttribute('frameborder', '0');
        cover.style.transition = 'opacity 0.4s ease';
        cover.style.opacity = '0';
        cardEl.insertBefore(iframe, cover.nextSibling);
        setTimeout(() => { iframe.style.opacity = '1'; }, 50);
      }, 1500);
    };
    const stopPreview = () => {
      clearTimeout(hoverTimer);
      if (iframe && isPlaying) {
        iframe.style.opacity = '0';
        cover.style.opacity = '1';
        const ref = iframe;
        setTimeout(() => ref.remove(), 400);
        iframe = null;
        isPlaying = false;
      }
    };
    const cleanup = () => {
      clearTimeout(hoverTimer);
      if (iframe) { iframe.remove(); iframe = null; }
      isPlaying = false;
    };
    cardEl.addEventListener('mouseenter', startPreview);
    cardEl.addEventListener('mouseleave', stopPreview);
    return cleanup;
  },

  _setupAmbientGlow(cardEl, card) {
    if (!card.cover) return null;
    let loaded = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = card.cover;
    img.onload = () => {
      if (!loaded || !cardEl.isConnected) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 40, 40);
        const data = ctx.getImageData(10, 10, 20, 20).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 16) {
          r += data[i]; g += data[i+1]; b += data[i+2]; count++;
        }
        r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
        cardEl.style.setProperty('--ambient-r', r);
        cardEl.style.setProperty('--ambient-g', g);
        cardEl.style.setProperty('--ambient-b', b);
        cardEl.classList.add('has-ambient');
      } catch(e) {}
    };
    loaded = true;
    return () => { loaded = false; img.onload = null; };
  },

  _setupTiltEffect(cardEl) {
    let raf = null;
    const handleMove = (e) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = cardEl.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        const tiltX = y * -12;
        const tiltY = x * 12;
        const glareX = (x + 0.5) * 100;
        const glareY = (y + 0.5) * 100;
        cardEl.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.02)`;
        cardEl.style.setProperty('--glare-x', `${glareX}%`);
        cardEl.style.setProperty('--glare-y', `${glareY}%`);
      });
    };
    const handleLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      cardEl.style.transform = '';
      cardEl.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
      setTimeout(() => { cardEl.style.transition = ''; }, 500);
    };
    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      cardEl.removeEventListener('mousemove', handleMove);
      cardEl.removeEventListener('mouseleave', handleLeave);
    };
    cardEl.addEventListener('mousemove', handleMove);
    cardEl.addEventListener('mouseleave', handleLeave);
    return cleanup;
  },

  // ===== CARD MODAL WITH IMPROVED REASONING =====
};
