import { escapeHTML, shuffleArray, TMDB_GENRE_MAP, getTMDBGenreMap, safeGetJSON, safeSetJSON, getGenreIcon, createImageWithFallback } from './utils.js';
import { BOOK_GENRES, BOOK_MOODS, BOOK_QUIZ, ERA_FILTERS, BOOK_SEARCH, COVER_PLACEHOLDERS } from './books.js';
import { MEDIA_GENRES, MEDIA_MOODS, MEDIA_VIBES } from './media.js';
import { GAME_GENRES, GAME_GENRE_NAME_MAP, GAME_MOODS, GAME_MECHANICS, GAME_PLATFORMS, GAME_PACING, PLAYTIME_RANGES, MULTIPLAYER_TYPES, GAME_STATUS, ICONIC_GAMES, GAME_SEARCH } from './games.js';
import { fetchBooks, fetchUpcomingBooks, fetchUpcomingMedia, mapTmdbResult } from './api.js';
import { SwipeEngine } from './swipe.js';
import { DeepDivePanel } from './deep-dive.js';
import { EnrichmentWorker } from './enrichment.js';
import { Recommender } from './recommender.js';
import { getTMDBDetails, searchTMDB, getTMDBVideos } from './tmdb.js';
import { renderVibeBars, detectSpoilers, generateElevatorPitchFull } from './descriptions.js';
import { mapTMDBTags, computeVibeScores, mapGameTags, mapMediaDNA } from './tag_mapper.js';
import { searchGames, fetchGamesByGenre, fetchPopularGames, fetchGamesForDiscovery, enrichGamesWithSteam } from './games_api.js';
import {
  migrateFromLocalStorage,
  getWatchlist, addToWatchlist, removeFromWatchlist,
  getDisliked, addToDisliked, removeFromDisliked,
  getHistory, addToHistory, removeLastHistory,
  getRecProfile, saveRecProfile,
  getUIState, setUIState,
  getFullWatchlist
} from './storage.js';
import { createAbortable, getErrorMessage, fetchDeduped } from './api-client.js';
import { showToast, dismissToast, clearAllToasts } from './toast.js';
import { ABTest } from './experiment.js';

// ===== CONSTANTS =====
const LANG = {
  de: {
    title:'BookSwipe', subtitle:'Buecher, Filme & Spiele', skip:'Skip', like:'Gefaellt mir',
    nope:'Nix fuer mich', discover:'Entdecken', onboarding:'Willkommen!', quiz:'Quiz', swipe:'Wischen',
    history:'Verlauf', watchlist:'Merkliste', stats:'Stats', empty:'Nichts gefunden', loading:'Laden...',
    age:'Alter', lang:'Sprache', dark:'Dunkel', light:'Hell', yes:'Ja', no:'Nein', export:'Export',
    share:'Teilen', whoWatching:'Wer schaut zu?', solo:'Allein', dateNight:'Date Night', family:'Familie',
    blindDate:'Blind Date', rapidFire:'Schnelltest', whoWatchingSub:'Fuer bessere Empfehlungen',
    familySub:'Horror und Crime raus automatisch', dateNightSub:'Romance & Thriller hoch',
    soloSub:'Du hast die Kontrolle', moodTime:'Stimmung + Zeit', moodTimeTitle:'Was moechtest du spielen?',
    moodTimeSub:'Waehle deine Stimmung und verfuegbare Zeit',
    quickPlay:'Kurz (15-30 Min)', mediumPlay:'Mittel (1-2 Std)', longPlay:'Lang (3+ Std)', anyPlay:'Egal',
    cozy:'Gemütlich', intense:'Intensiv', chill:'Entspannt', competitive:'Kompetitiv',
    applyFilter:'Anwenden', clearFilter:'Zuruecksetzen', filterActive:'Filter aktiv',
    steamLibrary:'Steam Bibliothek', steamImport:'Importieren', steamId:'Steam ID',
    steamApiKey:'Steam API Key', steamImporting:'Importiere...', steamImported:'Importiert',
    steamImportError:'Import fehlgeschlagen', steamLibraryCount:'{0} Spiele in Bibliothek',
    inLibrary:'In Bibliothek', backlogShuffle:'Backlog Shuffle',
    persona:'Dein Geschmack', antiTaste:'Was du hasst', antiTasteSub:'Aus deinem Feed verbannt',
    weeklyVibe:'Wochen-Vibe', pickForUs:'Ueberrasch mich!', dnaLink:'DNA teilen',
    playOn:'Jetzt auf {0}', whySeeing:'Warum das?', matchReason:'Passt zu dir',
    swipeLeft:'Links', swipeRight:'Rechts', bannedContent:'Verbannt',
    rapidFireTitle:'15 Sekunden, los', rapidFireSub:'Links = Nein. Rechts = Ja. Go.',
    rapidFireComplete:'Done! Wir kennen dich', letterboxd:'Letterboxd Export',
    letterboxdSub:'Merkliste als CSV exportieren',
    couchCoop:'Couch Roulette', couchCoopSub:'Wenn ihr euch nicht einigen koennt',
    spin:'Los!', result:'Das wird\'s!',
    games:'Spiele', whatToPlay:'Was wird gespielt?', platforms:'Plattformen',
    playstyle:'Spielstil', timeAvailable:'Zeit', sessions:'Sitzungen',
    quickSession:'Kurz (15-30 Min)', moderateSession:'Mittel (1-2 Std)', longSession:'Lang (3+ Std)',
    playing:'Gerade gespielt', completed:'Geschafft', backlog:'Backlog', wishlist:'Wunschliste', dropped:'Abgebrochen',
    hoursPlayed:'Std. gespielt', onSale:'Im Angebot', friendsPlaying:'Freunde spielen',
    errorLoading:'Fehler beim Laden', retry:'Erneut', errorDetails:'Details',
    cardCount:'{0} Karten', undo:'Rueckgaengig', undoMessage:'{0} entfernt',
    becauseYouLiked:'Weil dir "{0}" gefaellt', swipeActionLike:'Geswiped', swipeActionNope:'Uebersprungen',
    swipeActionSkip:'Uebergangen', notForMe:'Nix fuer mich', seenIt:'Bereits gesehen',
    wrongMood:'Falscher Stimmung', notMyGenre:'Nicht mein Genre', otherReason:'Anderer Grund',
    feedbackTitle:'Warum nicht?', fromWatchlist:'Aus Merkliste',
    crossMediaTitle:'Passt auch', noDescription:'Keine Beschreibung',
    search:'Suchen', searchPlaceholder:'Titel oder Autor...', searchNoResults:'Nichts zu "{0}"',
    releaseRadar:'Erscheinungsradar', upcoming:'Demnaechst', justReleased:'Erschienen', radarDays:'Zeitraum'
  },
  en: {
    title:'BookSwipe', subtitle:'Books, movies & games', skip:'Skip', like:'Love it',
    nope:'Nope', discover:'Discover', onboarding:'Welcome!', quiz:'Quiz', swipe:'Swipe',
    history:'History', watchlist:'Watchlist', stats:'Stats', empty:'Nothing found', loading:'Loading...',
    age:'Age', lang:'Language', dark:'Dark', light:'Light', yes:'Yes', no:'No', export:'Export',
    share:'Share', whoWatching:'Who\'s watching?', solo:'Solo', dateNight:'Date Night', family:'Family',
    blindDate:'Blind Date', rapidFire:'Rapid Fire', whoWatchingSub:'For better picks',
    familySub:'Horror and crime filtered out', dateNightSub:'Romance & Thriller up',
    soloSub:'You\'re in control', moodTime:'Mood + Time', moodTimeTitle:'What do you want to play?',
    moodTimeSub:'Choose your mood and available time',
    quickPlay:'Quick (15-30 min)', mediumPlay:'Medium (1-2 hrs)', longPlay:'Long (3+ hrs)', anyPlay:'Any',
    cozy:'Cozy', intense:'Intense', chill:'Chill', competitive:'Competitive',
    applyFilter:'Apply', clearFilter:'Clear', filterActive:'Filter active',
    steamLibrary:'Steam Library', steamImport:'Import', steamId:'Steam ID',
    steamApiKey:'Steam API Key', steamImporting:'Importing...', steamImported:'Imported',
    steamImportError:'Import failed', steamLibraryCount:'{0} games in library',
    inLibrary:'In Library', backlogShuffle:'Backlog Shuffle',
    persona:'Your Taste', antiTaste:'What you hate', antiTasteSub:'Banned from your feed',
    weeklyVibe:'Weekly Vibe', pickForUs:'Pick for Us!', dnaLink:'Share DNA',
    playOn:'▶ {0}', whySeeing:'Why this?', matchReason:'Matches you',
    swipeLeft:'Left', swipeRight:'Right', bannedContent:'Banished',
    rapidFireTitle:'15 seconds. Go.', rapidFireSub:'Left = no. Right = yes. Fast.',
    rapidFireComplete:'Done. We know you.', letterboxd:'Letterboxd Export',
    letterboxdSub:'Export watchlist as CSV',
    couchCoop:'Couch Roulette', couchCoopSub:'Can\'t decide? Try this.',
    spin:'Spin!', result:'This one!',
    games:'Games', whatToPlay:'What to play?', platforms:'Platforms',
    playstyle:'Playstyle', timeAvailable:'Time', sessions:'Sessions',
    quickSession:'Quick (15-30 min)', moderateSession:'Medium (1-2 hrs)', longSession:'Long (3+ hrs)',
    playing:'Playing', completed:'Done', backlog:'Backlog', wishlist:'Wishlist', dropped:'Dropped',
    hoursPlayed:'hrs played', onSale:'On Sale', friendsPlaying:'Friends playing',
    errorLoading:'Load failed', retry:'Retry', errorDetails:'Details',
    cardCount:'{0} cards', undo:'Undo', undoMessage:'{0} removed',
    becauseYouLiked:'Because you liked "{0}"', swipeActionLike:'Liked', swipeActionNope:'Passed',
    swipeActionSkip:'Skipped', notForMe:'Not for me', seenIt:'Already seen',
    wrongMood:'Wrong mood', notMyGenre:'Not my genre', otherReason:'Other',
    feedbackTitle:'Why not?', fromWatchlist:'From watchlist',
    crossMediaTitle:'You\'ll also like', noDescription:'No description',
    search:'Search', searchPlaceholder:'Title or author...', searchNoResults:'Nothing for "{0}"',
    releaseRadar:'Release Radar', upcoming:'Upcoming', justReleased:'Just Released', radarDays:'Time Range'
  }
};

const WATCH_MODES = {
  solo: { hardBlock: [], boost: [], label: 'solo' },
  dateNight: { hardBlock: [], boost: ['romance','thriller','comedy'], label: 'dateNight' },
  family: { hardBlock: ['horror','crime','war'], boost: ['animation','family','comedy'], label: 'family' }
};

const PERSONA_BADGES = {
  de: {
    a24Disciple: 'A24 Juenger', horrorSkeptic: 'Horror-Skeptiker', romcomAddict: 'RomCom-Suechtiger',
    nostalgiaAddict: '90er Nostalgie-Addict', foreignFilmAficionado: 'Foreign Film Kenner',
    cerebrlElite: 'Cerebrale Elite', cozyQueen: 'Cozy Queen', actionJunkie: 'Action Junkie',
    mindBender: 'Mind Bender', normie: 'Normie', wildcard: 'Wildcard',
    darkSoul: 'Dunkle Seele', comfortSeeker: 'Comfort Seeker'
  },
  en: {
    a24Disciple: 'A24 Disciple', horrorSkeptic: 'Horror Skeptic', romcomAddict: 'RomCom Addict',
    nostalgiaAddict: '90s Nostalgia Addict', foreignFilmAficionado: 'Foreign Film Aficionado',
    cerebrlElite: 'Cerebral Elite', cozyQueen: 'Cozy Queen', actionJunkie: 'Action Junkie',
    mindBender: 'Mind Bender', normie: 'Normie', wildcard: 'Wildcard',
    darkSoul: 'Dark Soul', comfortSeeker: 'Comfort Seeker'
  }
};

const STREAMING_PROVIDERS = {
  8: { name:'Netflix', color:'#E50914', icon:'N', deepLink:'nflix://' },
  15: { name:'Hulu', color:'#1CE783', icon:'H', deepLink:'hulu://' },
  350: { name:'Apple TV', color:'#555', icon:'', deepLink:'tvapp://' },
  119: { name:'Prime Video', color:'#00A8E1', icon:'P', deepLink:'aiv://' },
  387: { name:'HBO Max', color:'#B535F6', icon:'H', deepLink:'hbomax://' },
  531: { name:'Paramount', color:'#0064FF', icon:'P', deepLink:'paramount://' },
  337: { name:'Disney', color:'#113CCF', icon:'D', deepLink:'disneyplus://' }
};

// Cross-media genre mapping: if you like X in movies, try Y in games
const CROSS_MEDIA_GENRES = {
  movies: {
    games: { 28: [2,24], 878: [12,31], 27: [], 10749: [], 14: [12], 35: [], 16: [], 18: [12,31] },
    books: { 28: [], 878: [], 27: [], 10749: [], 14: [], 35: [], 16: [], 18: [] }
  },
  tv: {
    games: { 10765: [12,31], 18: [12,31], 35: [], 16: [], 9648: [] },
    books: { 10765: [], 18: [], 35: [], 16: [], 9648: [] }
  },
  games: {
    movies: { 'Action': [28], 'RPG': [14,878], 'Adventure': [12,28], 'Puzzle': [], 'Strategy': [], 'Horror': [27] },
    books: { 'RPG': ['fantasy'], 'Adventure': ['adventure'], 'Puzzle': ['mystery'], 'Strategy': ['historical'] }
  },
  books: {
    movies: { 'fantasy': [14], 'scifi': [878], 'thriller': [53], 'romance': [10749], 'horror': [27] },
    games: { 'fantasy': [12], 'scifi': [12,31], 'thriller': [], 'romance': [], 'horror': [] }
  }
};

// ===== MAIN APP CLASS =====
class App {
  constructor() {
    this.lang = 'de';
    this.state = {
      selectedGenres: [], selectedMoods: [], mediaType: 'movies',
      eraFilter: 'all', activeAesthetic: null, activeMood: null,
      pacingFilter: false, throwbackActive: false, selectedEras: [],
      hasCompletedOnboarding: false, hasCompletedQuiz: false,
      watchMode: 'solo', onboardingStep: 0, blindDateMode: false, releaseRadarMode: false, radarDays: 60,
      wildcardFrequency: 50,
      blockedGenres: [], boostedMoods: [], selectedPlatforms: [],
      moodTimeFilter: { active: false, mood: null, playtime: null },
      steamLibrary: { steamId: '', apiKey: '', imported: false, gameCount: 0, lastFetch: 0 }
    };
    this.watchlist = [];
    this.disliked = [];
    this.history = [];
    this.currentCards = [];
    this.currentCardIndex = 0;
    this.swipeEngine = null;
    this.enrichment = new EnrichmentWorker(this);
    this.recommender = new Recommender(this);
    this.experiment = new ABTest({ app: this });
    // End experiment session on page unload, start new one on visibility change
    window.addEventListener('beforeunload', () => this.experiment.endSession());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.experiment.endSession();
      else this.experiment.startSession();
    });
    this.tr = LANG[this.lang] || LANG.de;
    this._cleanupFns = [];
    this._pendingAbort = null;
    this._loadDNAFromURL();
    this._bindKeyboard();
    this._genreMap = TMDB_GENRE_MAP;
    document.documentElement.lang = this.lang;
    // Migrate legacy data, load state, then render
    migrateFromLocalStorage()
      .then(() => this._loadState())
      .then(() => this.render())
      .catch(() => this.render());
  }

  // ===== URL FILTER SYNC =====
  _applyURLFilters() {
    const p = new URLSearchParams(window.location.search);
    const genres = p.get('genres');
    const moods = p.get('moods');
    const type = p.get('type');
    const lang = p.get('lang');

    if (type && ['movies','tv','books','games'].includes(type)) {
      this.state.mediaType = type;
    }
    if (lang && ['de','en'].includes(lang)) {
      this.lang = lang;
      this.tr = LANG[lang];
    }
    if (genres) {
      this.state.selectedGenres = genres.split(',').map(g => {
        const n = parseInt(g, 10);
        return isNaN(n) ? g : n;
      });
    }
    if (moods) {
      this.state.selectedMoods = moods.split(',');
    }
  }

  _syncFiltersToURL() {
    const p = new URLSearchParams();
    const g = this.state.selectedGenres;
    const m = this.state.selectedMoods;
    if (g && g.length) p.set('genres', g.join(','));
    if (m && m.length) p.set('moods', m.join(','));
    if (this.state.mediaType !== 'movies') p.set('type', this.state.mediaType);
    if (this.lang !== 'de') p.set('lang', this.lang);
    const qs = p.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }

  // ===== STATE PERSISTENCE =====
  async _loadState() {
    const { lang, state } = getUIState();
    if (lang) this.lang = lang;
    if (state) {
      this.state = { ...this.state, ...state };
    }
    // Migration: ensure new state fields have defaults
    if (!this.state.radarDays) this.state.radarDays = 60;
    this.tr = LANG[this.lang] || LANG.de;
    this._genreMap = getTMDBGenreMap(this.lang);
    // URL params override localStorage state for shareable links
    this._applyURLFilters();
    this.tr = LANG[this.lang] || LANG.de;
    this._genreMap = getTMDBGenreMap(this.lang);
    this.watchlist = await getWatchlist();
    this.disliked = await getDisliked();
    this.history = await getHistory();
    const profile = await getRecProfile();
    if (profile) this.recommender.profile = profile;
    
    // Load Steam library from IndexedDB if available
    try {
      const steamLibrary = await safeGetJSON('bs-steam-library');
      if (steamLibrary && steamLibrary.imported) {
        this.state.steamLibrary = steamLibrary;
      }
    } catch (e) {
      console.warn('Failed to load Steam library:', e);
    }
  }

  async save() {
    setUIState(this.lang, this.state);
    await saveRecProfile(this.recommender.profile);
  }

  t(k, ...args) {
    let v = this.tr[k] || k;
    args.forEach((a, i) => { v = v.replace(`{${i}}`, a); });
    return v;
  }

  // ===== RENDERING =====
  render() {
    const app = document.getElementById('app');
    if (!this.state.hasCompletedOnboarding) return this.renderOnboarding(app);
    if (!this.state.hasCompletedQuiz && this.state.mediaType === 'books') return this.renderQuiz(app);
    this.renderDiscover(app);
  }

  _loadDNAFromURL() {
    const p = new URLSearchParams(window.location.search);
    const dna = p.get('dna');
    if (dna) {
      try {
        const decoded = JSON.parse(atob(dna));
        if (decoded && Array.isArray(decoded.g) && typeof decoded.p === 'string') {
          this._sharedDNA = { g: decoded.g.slice(0, 5), p: decoded.p, c: decoded.c || 0, l: decoded.l || 'de' };
        }
      } catch(e) { /* ignore invalid dna */ }
    }
  }

  // ===== KEYBOARD =====
  _bindKeyboard() {
    this._keyHandler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const modal = document.querySelector('.card-modal-overlay');
      if (modal && e.key === 'Escape') {
        modal.classList.remove('open');
        setTimeout(() => modal.remove(), 300);
        return;
      }
      if (modal) return;
      if (!this.currentCards.length || !this.state.hasCompletedOnboarding) return;
      switch(e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          this.handleSwipe('right');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.handleSwipe('left');
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.handleSwipe('up');
          break;
        case 'z':
        case 'Z':
          e.preventDefault();
          this._undoSwipe();
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          this._openCurrentCardInfo();
          break;
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  async _undoSwipe() {
    const last = await removeLastHistory();
    if (!last) {
      showToast(this.lang === 'de' ? 'Nichts zum Rueckgaengig machen' : 'Nothing to undo', { type: 'warning', duration: 2000 });
      return;
    }
    if (last.action === 'like') {
      await removeFromWatchlist(last.id);
      this.watchlist = this.watchlist.filter(w => w.id !== last.id);
    } else if (last.action === 'nope') {
      await removeFromDisliked(last.id);
      this.disliked = this.disliked.filter(d => d.id !== last.id);
    }
    this.currentCards.splice(this.currentCardIndex, 0, last);
    const app = document.getElementById('app');
    this.renderCards(app);
    showToast(this.t('undoMessage', last.title), {
      type: 'info',
      duration: 3000,
      action: true,
      actionLabel: this.t('undo'),
      onAction: () => this._redoSwipe(last)
    });
  }

  _redoSwipe(item) {
    const idx = this.currentCards.findIndex(c => c.id === item.id);
    if (idx >= 0) {
      this.currentCards.splice(idx, 1);
      this.handleSwipe(item.action === 'like' ? 'right' : item.action === 'nope' ? 'left' : 'up');
    }
  }

  _openCurrentCardInfo() {
    const card = this.currentCards[this.currentCardIndex];
    if (!card) return;
    const app = document.getElementById('app');
    this._showCardModal(card, app);
  }

  _spawnParticles(x, y, type) {
    const emojis = { like: ['💚','✨','💫','🌟','💚','✨'], nope: ['💀','✖','🍂','💨','💀','✖'], super: ['⭐','👑','🔥','💫','⭐','👑'] };
    const set = emojis[type] || emojis.like;
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('span');
      p.className = `particle particle-${type}`;
      p.textContent = set[i % set.length];
      const angle = (Math.random() - 0.5) * 140;
      const dist = 50 + Math.random() * 100;
      const px = Math.cos(angle * Math.PI / 180) * dist;
      const py = Math.sin(angle * Math.PI / 180) * dist - 30;
      const rot = (Math.random() - 0.5) * 120;
      const size = 0.8 + Math.random() * 0.6;
      p.style.cssText = `left:${x}px;top:${y}px;--px:${px}px;--py:${py}px;--pr:${rot}deg;animation-delay:${i * 0.03}s;font-size:${size}rem`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
  }

  _animateStatCount(el, target, duration = 800) {
    const start = performance.now();
    const initial = 0;
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(initial + (target - initial) * eased);
      if (progress < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    el.classList.add('counting');
    requestAnimationFrame(step);
    setTimeout(() => el.classList.remove('counting'), duration + 50);
  }

  _wrapHeroText(text, className = '') {
    return text.split(' ').map((word, i) =>
      `<span class="hero-word ${className}" style="animation-delay:${i * 0.08}s">${word}</span>`
    ).join(' ');
  }

  // ===== ONBOARDING =====
  renderOnboarding(app) {
    const step = this.state.onboardingStep || 0;
    if (step === 0) return this._renderWelcomeScreen(app);
    if (step === 1) return this._renderWhoWatchingScreen(app);
    if (step === 2 && this.state.mediaType === 'games') return this._renderPlatformScreen(app);
    if (step === 2 && this.state.mediaType !== 'games') return this._renderRapidFireScreen(app);
    if (step === 3 && this.state.mediaType === 'games') return this._renderRapidFireScreen(app);
    this.state.hasCompletedOnboarding = true;
    this.save();
    this.render();
  }

  _renderWelcomeScreen(app) {
    const totalSteps = this.state.mediaType === 'games' ? 4 : 3;
    app.innerHTML = `
      <div class="onboarding">
        <div class="onboarding-steps">
          <div class="step-dot active"></div>
          <div class="step-line"></div>
          <div class="step-dot"></div>
          <div class="step-line"></div>
          <div class="step-dot"></div>
        </div>
        <div class="onboarding-logo">📚🎬🎮</div>
        <h1>${this.tr.title}</h1>
        <p>${this.tr.subtitle}</p>
        <div class="media-toggle">
          <button class="btn ${this.state.mediaType === 'books' ? 'active' : ''}" data-type="books">📚 ${this.lang === 'de' ? 'Buecher' : 'Books'}</button>
          <button class="btn ${this.state.mediaType === 'movies' ? 'active' : ''}" data-type="movies">🎬 ${this.lang === 'de' ? 'Filme' : 'Movies'}</button>
          <button class="btn ${this.state.mediaType === 'tv' ? 'active' : ''}" data-type="tv">📺 TV</button>
          <button class="btn ${this.state.mediaType === 'games' ? 'active' : ''}" data-type="games">🎮 ${this.lang === 'de' ? 'Spiele' : 'Games'}</button>
        </div>
        <div class="lang-toggle">
          <button class="btn btn-sm ${this.lang === 'de' ? 'active' : ''}" data-lang="de">DE</button>
          <button class="btn btn-sm ${this.lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
        </div>
        <button class="btn btn-primary btn-start">${this.tr.discover} →</button>
      </div>`;
    app.querySelector('[data-type="books"]')?.addEventListener('click', () => { this.state.mediaType = 'books'; this._syncFiltersToURL(); this.render(); });
    app.querySelector('[data-type="movies"]')?.addEventListener('click', () => { this.state.mediaType = 'movies'; this._syncFiltersToURL(); this.render(); });
    app.querySelector('[data-type="tv"]')?.addEventListener('click', () => { this.state.mediaType = 'tv'; this._syncFiltersToURL(); this.render(); });
    app.querySelector('[data-type="games"]')?.addEventListener('click', () => { this.state.mediaType = 'games'; this._syncFiltersToURL(); this.render(); });
    app.querySelector('[data-lang="de"]')?.addEventListener('click', () => { this.lang = 'de'; this.tr = LANG.de; this._genreMap = getTMDBGenreMap('de'); this._syncFiltersToURL(); this.save(); this.render(); });
    app.querySelector('[data-lang="en"]')?.addEventListener('click', () => { this.lang = 'en'; this.tr = LANG.en; this._genreMap = getTMDBGenreMap('en'); this._syncFiltersToURL(); this.save(); this.render(); });
    app.querySelector('.btn-start')?.addEventListener('click', () => {
      this.state.onboardingStep = 1; this.save(); this.render();
    });
  }

  _renderWhoWatchingScreen(app) {
    const modes = [
      { key:'solo', icon:'👤', emoji:'🎭' },
      { key:'dateNight', icon:'💑', emoji:'🌹' },
      { key:'family', icon:'👨‍👩‍👧‍👦', emoji:'🧸' }
    ];
    app.innerHTML = `
      <div class="onboarding who-watching">
        <div class="onboarding-steps">
          <div class="step-dot completed">✓</div>
          <div class="step-line filled"></div>
          <div class="step-dot active"></div>
          <div class="step-line"></div>
          <div class="step-dot"></div>
        </div>
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
      this.state.onboardingStep = 2;
      this.save();
      this.render();
    });
  }

  _applyWatchModeFilters() {
    const mode = WATCH_MODES[this.state.watchMode] || WATCH_MODES.solo;
    if (mode.hardBlock.length && this.state.mediaType !== 'books') {
      this.state.blockedGenres = mode.hardBlock;
    }
    if (mode.boost.length && this.state.mediaType !== 'books') {
      this.state.boostedMoods = mode.boost;
    }
  }

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
          <div class="step-dot active"></div>
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
      this.state.onboardingStep = 3;
      this.save();
      this.render();
    });
  }

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
    const elapsed = ((Date.now() - this._rapidFireStart) / 1000).toFixed(1);
    const isGames = this.state.mediaType === 'games';
    const stepDots = isGames
      ? `<div class="onboarding-steps"><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot active"></div></div>`
      : `<div class="onboarding-steps"><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot completed">✓</div><div class="step-line filled"></div><div class="step-dot active"></div></div>`;
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
      new SwipeEngine(cardEl, dir => {
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
  }

  _getRapidFireItems() {
    if (this.state.mediaType === 'games') {
      const pool = ICONIC_GAMES.slice(0, 10).map(g => ({
        id: `rf-${g.id}`, title: g.name, year: g.year, cover: '',
        genres: g.tags, source: 'rapid-fire', type: 'game'
      }));
      return shuffleArray(pool);
    }
    if (this.state.mediaType === 'tv') {
      const pool = [
        { id:'rf-t1', title:'Stranger Things', year:2016, cover:'', genres:[18,10765,35] },
        { id:'rf-t2', title:'Breaking Bad', year:2008, cover:'', genres:[18,80,53] },
        { id:'rf-t3', title:'The Office', year:2005, cover:'', genres:[35] },
        { id:'rf-t4', title:'Game of Thrones', year:2011, cover:'', genres:[18,10759,10765] },
        { id:'rf-t5', title:'Black Mirror', year:2011, cover:'', genres:[9648,878,53] },
        { id:'rf-t6', title:'Dark', year:2017, cover:'', genres:[18,9648,878] },
        { id:'rf-t7', title:'The Crown', year:2016, cover:'', genres:[18,36] },
        { id:'rf-t8', title:'Squid Game', year:2021, cover:'', genres:[18,10759,53] },
        { id:'rf-t9', title:'Succession', year:2018, cover:'', genres:[18,35] },
        { id:'rf-t10', title:'The Mandalorian', year:2019, cover:'', genres:[10759,878,12] }
      ];
      return shuffleArray(pool);
    }
    if (this.state.mediaType === 'books') {
      const pool = [
        { id:'rf-b1', title:'Der Herr der Ringe', year:1954, cover:'', genres:['fantasy'], author:'J.R.R. Tolkien', source:'rapid-fire', type:'book' },
        { id:'rf-b2', title:'1984', year:1949, cover:'', genres:['scifi'], author:'George Orwell', source:'rapid-fire', type:'book' },
        { id:'rf-b3', title:'Harry Potter', year:1997, cover:'', genres:['fantasy'], author:'J.K. Rowling', source:'rapid-fire', type:'book' },
        { id:'rf-b4', title:'Die unendliche Geschichte', year:1979, cover:'', genres:['fantasy'], author:'Michael Ende', source:'rapid-fire', type:'book' },
        { id:'rf-b5', title:'Der Steppenwolf', year:1927, cover:'', genres:['historical'], author:'Hermann Hesse', source:'rapid-fire', type:'book' },
        { id:'rf-b6', title:'Tschick', year:2010, cover:'', genres:['ya'], author:'Wolfgang Herrndorf', source:'rapid-fire', type:'book' },
        { id:'rf-b7', title:'Das Parfum', year:1985, cover:'', genres:['thriller'], author:'Patrick Süskind', source:'rapid-fire', type:'book' },
        { id:'rf-b8', title:'Fahrenheit 451', year:1953, cover:'', genres:['scifi'], author:'Ray Bradbury', source:'rapid-fire', type:'book' },
        { id:'rf-b9', title:'Die Vermessung der Welt', year:2005, cover:'', genres:['historical'], author:'Daniel Kehlmann', source:'rapid-fire', type:'book' },
        { id:'rf-b10', title:'Eragon', year:2003, cover:'', genres:['fantasy'], author:'Christopher Paolini', source:'rapid-fire', type:'book' }
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
  }

  _completeRapidFire(app) {
    this._rapidFireLikes.forEach(item => {
      if (!this.watchlist.find(w => w.id === item.id)) {
        this.watchlist.push({ ...item, source: 'rapid-fire' });
        addToWatchlist({ ...item, source: 'rapid-fire' });
      }
    });
    this.state.hasCompletedOnboarding = true;
    this.state.onboardingStep = 4;
    this.save();
    this.render();
  }

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
  }

  // ===== SKELETON LOADING =====
  _renderSkeleton(app) {
    if (this._filterLoading) {
      // Show a subtle overlay on top of existing cards instead of full skeleton flash
      app.insertAdjacentHTML('beforeend', `<div class="filter-loading-overlay"><div class="filter-loading-spinner"></div></div>`);
      return;
    }
    app.innerHTML = `
      <div class="discover">
        <div class="discover-header">
          <span class="card-count-badge">${this.t('loading')}</span>
        </div>
        <div class="card-stack">
          <div class="skeleton-card">
            <div class="skeleton-cover"></div>
            <div class="skeleton-info">
              <div class="skeleton-line short"></div>
              <div class="skeleton-line"></div>
              <div class="skeleton-line medium"></div>
            </div>
          </div>
        </div>
        <div class="skeleton-actions">
          <div class="skeleton-btn"></div>
          <div class="skeleton-btn"></div>
          <div class="skeleton-btn"></div>
        </div>
      </div>`;
  }

  // ===== ERROR STATE =====
  _renderError(app, error, onRetry) {
    const msg = getErrorMessage(error, this.lang);
    app.innerHTML = `
      <div class="error-state">
        <span class="error-state-icon">📡</span>
        <h2>${this.t('errorLoading')}</h2>
        <p>${escapeHTML(msg)}</p>
        ${error.message ? `<p class="error-details">${escapeHTML(error.message)}</p>` : ''}
        <button class="btn btn-primary btn-retry">${this.t('retry')}</button>
        ${this._navHTML('discover')}
      </div>`;
    app.querySelector('.btn-retry')?.addEventListener('click', onRetry);
    this._bindNav(app);
  }

  // ===== DISCOVER (with recommender sorting, error handling, enrichment) =====
  async renderDiscover(app) {
    // Cancel any pending request
    if (this._pendingAbort) {
      this._pendingAbort.abort();
      this._pendingAbort = null;
    }
    const { abort, signal } = createAbortable();
    this._pendingAbort = { abort };

    this._renderSkeleton(app);
    this._filterLoading = false;

    try {
      let items;
      if (this.state.mediaType === 'books') {
        if (this.state.releaseRadarMode) {
          items = await fetchUpcomingBooks(this.state.selectedGenres, this.lang, signal, this.state.radarDays);
        } else {
          items = await fetchBooks(this.state.selectedGenres, this.state.selectedMoods, this.lang, signal);
        }
      } else if (this.state.mediaType === 'games') {
        items = await fetchGamesForDiscovery(
          this.state.selectedGenres || [],
          this.state.selectedPlatforms || [],
          40
        );
        items = await enrichGamesWithSteam(items);
      } else {
        if (this.state.releaseRadarMode) {
          items = await this.fetchUpcomingMedia(signal);
        } else {
          items = await this.fetchMedia(signal);
        }
      }

      if (signal.aborted) return;

      // Use Sets for O(1) lookup instead of O(n) .find()
      const watchIds = new Set(this.watchlist.map(w => w.id));
      const dislikedIds = new Set(this.disliked.map(d => d.id));
      let filtered = items.filter(i => !watchIds.has(i.id) && !dislikedIds.has(i.id));

      if (this.state.blockedGenres?.length && this.state.mediaType !== 'books') {
        filtered = filtered.filter(item => {
          const itemGenres = (item.genres || []).map(g => {
            const id = typeof g === 'number' ? g : g.id || g;
            return (this._genreMap[id] || '').toLowerCase();
          });
          return !this.state.blockedGenres.some(bg => itemGenres.includes(bg.toLowerCase()));
        });
      }

      // Apply mood/time filter for games
      if (this.state.moodTimeFilter.active && this.state.mediaType === 'games') {
        filtered = this._applyMoodTimeFilter(filtered);
      }

      // Enrich items in background
      if (filtered.length > 0) {
        // Compute media DNA for items that need it
        filtered.forEach(item => {
          if (!item.mediaDNA && item.overview) {
            item.mediaDNA = mapMediaDNA(item.genres, item.overview, item.title);
          }
        });
        this.enrichment.enqueue(filtered);
      }

      // Sort by recommender score
      const scoredCards = filtered.map(card => ({
        ...card,
        _score: this.recommender.score(card)
      }));
      scoredCards.sort((a, b) => b._score - a._score);

      // A/B Test: Control (random serendipity) vs treatment (MMR diversity)
      const diversityCount = filtered.length > 10 ? Math.max(1, Math.floor(filtered.length * 0.15)) : 0;
      if (diversityCount > 0 && this.experiment.group === 'treatment') {
        // Treatment: MMR diversity — inject diverse picks near the top
        const forRerank = scoredCards.map(c => ({ ...c, _mmrScore: c._score }));
        const reranked = this.recommender.mmrRerank(forRerank, diversityCount);
        this.currentCards = reranked.map(({ _mmrScore, ...card }) => card);
      } else if (diversityCount > 0 && this.experiment.group === 'control') {
        // Control: random serendipity — pick random mid-tier cards to mix up
        const midStart = Math.floor(scoredCards.length * 0.2);
        const midEnd = Math.floor(scoredCards.length * 0.6);
        const midPool = scoredCards.slice(midStart, midEnd);
        const picks = [];
        const copy = [...midPool];
        for (let i = 0; i < Math.min(diversityCount, copy.length); i++) {
          const idx = Math.floor(Math.random() * copy.length);
          picks.push(copy.splice(idx, 1)[0]);
        }
        // Remove picks from original, then put them back at positions 2, 4, 6...
        const top = scoredCards.slice(0, 1); // keep #1
        const rest = scoredCards.slice(1).filter(c => !picks.some(p => p._score === c._score && c.id === p.id));
        const reorder = [...top];
        let pi = 0, ri = 0;
        while (ri < rest.length || pi < picks.length) {
          if (pi < picks.length && (ri < rest.length ? reorder.length % 3 === 2 : true)) {
            reorder.push(picks[pi++]);
          } else if (ri < rest.length) {
            reorder.push(rest[ri++]);
          } else break;
        }
        this.currentCards = reorder;
      } else {
        this.currentCards = scoredCards;
      }
      // Track refetch for experiment metrics
      this.experiment.trackRefetch();

      this.currentCardIndex = 0;

      if (this.currentCards.length === 0) {
        this._renderEmptyState(app);
        return;
      }

      this.renderCards(app);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.warn('renderDiscover error:', error);
      this._renderError(app, error, () => this.renderDiscover(app));
    } finally {
      this._pendingAbort = null;
    }
  }

  _renderEmptyState(app) {
    const de = this.lang === 'de';
    // Release Radar-specific empty state
    if (this.state.releaseRadarMode) {
      const radarMsgs = {
        books: { h: de ? 'Keine neuen Buecher' : 'No upcoming books', p: de ? 'Fuer deine Genres gibt es gerade keine neuen Buecher. Probiere andere Genres!' : 'No new books for your genres right now. Try other genres!' },
        movies: { h: de ? 'Keine neuen Filme' : 'No upcoming movies', p: de ? 'Fuer deine Genres gibt es gerade keine neuen Filme. Probiere andere Genres!' : 'No upcoming movies for your genres right now. Try other genres!' },
        tv: { h: de ? 'Keine neuen Serien' : 'No upcoming shows', p: de ? 'Fuer deine Genres gibt es gerade keine neuen Serien. Probiere andere Genres!' : 'No upcoming shows for your genres right now. Try other genres!' },
      };
      const radarMsg = radarMsgs[this.state.mediaType] || radarMsgs.movies;
      app.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">📅</span>
          <h2>${this._wrapHeroText(radarMsg.h, 'big accent')}</h2>
          <p>${radarMsg.p}</p>
          <button class="btn btn-primary" data-action="toggle-radar">${de ? 'Normal stoebern' : 'Browse normally'}</button>
          ${this._navHTML('discover')}
        </div>`;
      app.querySelector('[data-action="toggle-radar"]')?.addEventListener('click', () => {
        this.state.releaseRadarMode = false;
        this.save();
        this.renderDiscover(document.getElementById('app'));
      });
      this._bindNav(app);
      return;
    }
    if (this.history.length === 0) {
      const icon = this.state.mediaType === 'books' ? '📖' : this.state.mediaType === 'games' ? '🎮' : '🎬';
      app.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">${icon}</span>
          <h2>${this._wrapHeroText(this.lang === 'de' ? 'Leere Leinwand.' : 'Blank slate.', 'big accent')}</h2>
          <p>${this.lang === 'de' ? 'Wisch rechts auf alles, was dich anspricht.' : 'Swipe right on whatever catches your eye.'}</p>
          <button class="btn btn-primary" onclick="location.reload()">${this.lang === 'de' ? 'Los' : 'Let\'s go'}</button>
        </div>`;
    } else if (this.watchlist.length === 0) {
      app.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">📚</span>
          <h2>${this._wrapHeroText(this.lang === 'de' ? 'Regale leer.' : 'Shelves empty.', 'big')}</h2>
          <p>${this.lang === 'de' ? 'Zeit, deine naechste Obsession zu finden.' : 'Time to find your next obsession.'}</p>
          <button class="btn btn-primary" data-nav="discover">${this.lang === 'de' ? 'Entdecken' : 'Discover'}</button>
        </div>`;
    } else {
      app.innerHTML = `
        <div class="wrap-party">
          <span class="wrap-party-icon">🎉</span>
          <h2>${this._wrapHeroText(this.lang === 'de' ? 'Alles gesehen!' : 'Seen it all!', 'big accent')}</h2>
          <p>${this.lang === 'de' ? 'Geschmack: legendär. Neues Universum?' : 'Taste: legendary. New universe?'}</p>
          <button class="btn btn-primary" data-nav="discover">${this.lang === 'de' ? 'Neues Universum' : 'New Universe'}</button>
        </div>`;
    }
    app.querySelector('[data-nav="discover"]')?.addEventListener('click', () => {
      this.currentCards = this.currentCards.length ? this.currentCards : this.history;
      this.renderDiscover(document.getElementById('app'));
    });
  }

  async fetchMedia(signal) {
    const type = this.state.mediaType === 'movies' ? 'movie' : 'tv';
    const genreIds = this.state.selectedGenres.map(g => typeof g === 'string' ? g : g.id).join(',');
    try {
      const r = await fetch(`/proxy/tmdb/discover/${type}?sort_by=popularity.desc&with_genres=${genreIds || ''}&language=${this.lang}`, { signal });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.results || []).map(m => mapTmdbResult(m, type));
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      console.warn('fetchMedia error', e); return [];
    }
  }

  async fetchUpcomingMedia(signal) {
    return fetchUpcomingMedia(this.state.mediaType, this.state.selectedGenres, this.lang, this.state.radarDays, signal);
  }

  // ===== GENRE/MOOD FILTER CHIPS =====
  _getFilterOptions() {
    const type = this.state.mediaType;
    const lang = this.lang;
    if (type === 'books') {
      return {
        genres: BOOK_GENRES[lang] || BOOK_GENRES.en,
        moods: BOOK_MOODS[lang] || BOOK_MOODS.en
      };
    }
    if (type === 'games') {
      return {
        genres: (GAME_GENRES[lang] || GAME_GENRES.en).map(g => ({ id: g.id, label: g.name })),
        moods: GAME_MOODS[lang] || GAME_MOODS.en
      };
    }
    const mediaGenres = MEDIA_GENRES[lang] || MEDIA_GENRES.en;
    return {
      genres: mediaGenres[type] || mediaGenres.movie,
      moods: MEDIA_MOODS[lang] || MEDIA_MOODS.en
    };
  }

  _renderFilterChipsHtml() {
    const filters = this._getFilterOptions();
    const selectedGenres = this.state.selectedGenres || [];
    const selectedMoods = this.state.selectedMoods || [];
    const hasActiveFilters = selectedGenres.length > 0 || selectedMoods.length > 0;

    const genreChips = filters.genres.map(g => {
      const isSelected = selectedGenres.includes(g.id);
      const icon = getGenreIcon(g.id, this.state.mediaType, this.lang);
      return `<button class="filter-chip${isSelected ? ' active' : ''}" data-type="genre" data-id="${g.id}">${icon} ${g.label}</button>`;
    }).join('');

    const moodChips = filters.moods.map(m => {
      const isSelected = selectedMoods.includes(m.id);
      const icon = m.icon || '';
      return `<button class="filter-chip mood-chip${isSelected ? ' active' : ''}" data-type="mood" data-id="${m.id}">${icon ? icon + ' ' : ''}${m.label}</button>`;
    }).join('');

    return `
      <div class="filter-chips">
        <div class="filter-scroll">${genreChips}</div>
        ${moodChips ? `<div class="filter-scroll filter-moods">${moodChips}</div>` : ''}
        ${hasActiveFilters ? `<button class="filter-clear" data-action="clear-filters">✕ ${this.lang === 'de' ? 'Filter zurücksetzen' : 'Clear filters'}</button>` : ''}
      </div>`;
  }

  // ===== CARD RENDERING =====
  renderCards(app) {
    const card = this.currentCards[this.currentCardIndex];
    if (!card) { this.renderDiscover(app); return; }
    const isGame = card.type === 'game' || card.source === 'igdb';
    const isBook = this.state.mediaType === 'books';
    const isBlind = this.state.blindDateMode;
    const isBlindGame = isBlind && isGame;
    const t = isGame ? '🎮' : card.type === 'movie' ? 'Film' : card.type === 'tv' ? 'Serie' : 'Buch';
    const genreStr = isGame
      ? (card.genres || []).join(', ')
      : (card.genres || []).map(g => typeof g === 'string' ? g : (this._genreMap[g] || g)).join(', ');

    // ---- Filter Bubble Breaker: pick a wildcard when in Blind Date mode ----
    let wildcard = null;
    let wildcardHook = '';
    let wildcardMood = '';
    let wildcardPacing = '';
    let wildcardTropes = [];
    let wildcardGenre = '';
    let wildcardBridge = '';
    if (isBlind && !isBlindGame && this.recommender && this.currentCards.length >= 3) {
      // Wildcard Frequency: probabilistically decide whether to show a wildcard
      const freq = this.state.wildcardFrequency ?? 50;
      // If frequency is 0, never show wildcards; if 100, always show them
      const showWildcard = freq >= 100 || (freq > 0 && Math.random() * 100 < freq);
      if (showWildcard) {
        wildcard = this.recommender.pickWildcard(this.currentCards);
        if (wildcard) {
          wildcardHook = wildcard.the_hook;
          wildcardMood = wildcard.revealed_traits.mood;
          wildcardPacing = wildcard.revealed_traits.pacing;
          wildcardTropes = wildcard.revealed_traits.micro_tropes;
          wildcardGenre = wildcard.actual_genre;
          wildcardBridge = wildcard.the_bridge;
        }
      }
    }
    this._currentWildcard = wildcard; // store for peek/card modal access

    const dnaTags = wildcardTropes.length ? wildcardTropes : this._getCardDNATags(card);
    const coverStyle = isBlind ? 'filter:blur(20px);transform:scale(1.1);' : '';
    let cardClass = 'card';
    if (isBlind) cardClass += ' blind-date-card';
    if (isBook) cardClass += ' book-card';
    if (isGame) cardClass += ' game-card';
    if (isBlindGame) cardClass += ' blind-date-game';

    const platformBadges = isGame ? this._renderPlatformBadges(card) : '';
    const playtimeBadge = isGame ? this._renderPlaytimeBadge(card) : '';
    const multiplayerBadge = isGame ? this._renderMultiplayerBadge(card) : '';
    const steamTags = isGame ? this._renderSteamTags(card) : '';
    const priceBadge = isGame ? this._renderPriceBadge(card) : '';
    const reviewBadge = isGame ? this._renderReviewBadge(card) : '';
    const metacriticBadge = isGame ? this._renderMetacriticBadge(card) : '';
    const storeButtons = isGame ? this._renderStoreButtons(card) : '';
    const blindGameHook = isBlindGame ? this._getBlindGameHook(card) : '';
    const blindGameMechanics = isBlindGame ? this._getBlindGameMechanics(card) : '';

    app.innerHTML = `
      <div class="discover">
        <div class="discover-header">
          <button class="search-toggle" data-action="search" aria-label="${this.tr.search}">🔍</button>
          <span class="card-count-badge">${this.t('cardCount', `${this.currentCardIndex + 1}/${this.currentCards.length}`)}</span>
          <button class="blind-date-toggle ${isBlind ? 'active' : ''}" data-toggle="blind" aria-label="${this.tr.blindDate}">
            🎭 ${this.tr.blindDate}
          </button>
          <button class="release-radar-toggle ${this.state.releaseRadarMode ? 'active' : ''}" data-toggle="release-radar" aria-label="${this.tr.releaseRadar}">
            📅 ${this.tr.releaseRadar}
          </button>
          ${this.state.releaseRadarMode ? `
            <div class="radar-days-row">
              <span class="radar-days-label">${this.tr.radarDays}:</span>
              ${[30, 60, 90].map(d => `<button class="radar-days-chip ${(this.state.radarDays || 60) === d ? 'active' : ''}" data-days="${d}">${d}d</button>`).join('')}
            </div>
          ` : ''}
          ${isGame ? `
            <button class="mood-time-toggle ${this.state.moodTimeFilter.active ? 'active' : ''}" data-toggle="mood-time" aria-label="${this.tr.moodTime}">
              🎯 ${this.tr.moodTime}
              ${this.state.moodTimeFilter.active ? `<span class="mood-time-badge">${this.state.moodTimeFilter.mood ? '🎭' : '⏱️'}</span>` : ''}
            </button>
            <button class="steam-library-toggle ${this.state.steamLibrary.imported ? 'active' : ''}" data-toggle="steam-library" aria-label="${this.tr.steamLibrary}">
              🎮 ${this.tr.steamLibrary}
              ${this.state.steamLibrary.imported ? `<span class="steam-library-badge">${this.state.steamLibrary.gameCount}</span>` : ''}
            </button>
          ` : ''}
          ${isBlind ? `
            <div class="wildcard-freq-row">
              <span class="wildcard-freq-label">${this.lang === 'de' ? 'Wildcards:' : 'Wildcards:'}</span>
              ${[0, 25, 50, 75, 100].map(v => {
                const labels = this.lang === 'de'
                  ? { 0: 'Nie', 25: 'Selten', 50: 'Manchmal', 75: 'Oft', 100: 'Immer' }
                  : { 0: 'Never', 25: 'Rarely', 50: 'Sometimes', 75: 'Often', 100: 'Always' };
                const icons = { 0: '🚫', 25: '🔹', 50: '🔸', 75: '🔶', 100: '✨' };
                return `<button class="wildcard-freq-chip ${(this.state.wildcardFrequency ?? 50) === v ? 'active' : ''}" data-freq="${v}">${icons[v]} ${labels[v]}</button>`;
              }).join('')}
            </div>
          ` : ''}
        </div>
        ${this._renderFilterChipsHtml()}
        <div class="card-stack">
          <div class="${cardClass}" data-id="${escapeHTML(card.id)}">
            <div class="card-hero">
              ${card.backdrop || card.cover
                ? `<img class="card-cover" loading="lazy" style="${coverStyle}" src="${escapeHTML(card.backdrop || card.cover)}" alt="${escapeHTML(card.title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : ''}
              <div class="card-cover placeholder" ${card.backdrop || card.cover ? 'style="display:none"' : ''}>${isGame ? '🎮' : isBook ? '📚' : '🎬'}</div>
              <div class="card-hero-overlay"></div>
              ${card._score != null ? `<span class="card-match-badge">${Math.round(card._score * 100)}%</span>` : ''}
              ${card.isUpcoming ? `<span class="upcoming-badge is-upcoming">${this.tr.upcoming}</span>` : card.releaseDate ? `<span class="upcoming-badge just-released">${this.tr.justReleased}</span>` : ''}
            </div>
            <div class="card-side">
              <div class="card-side-info">
                <h2 class="card-title">${escapeHTML(card.title)}</h2>
                <div class="card-meta-row">
                  ${card.year ? `<span class="card-year">${card.year}</span>` : ''}
                  ${card.rating ? `<span class="card-rating">⭐ ${typeof card.rating === 'number' ? card.rating.toFixed(1) : card.rating}</span>` : ''}
                  <span class="card-type">${t}</span>
                </div>
                ${genreStr && !isBlind ? `<div class="card-genres-row">${(card.genres || []).slice(0, 3).map(g => { const id = typeof g === 'number' ? g : g; const name = typeof g === 'string' ? g : (this._genreMap[g] || g); const icon = getGenreIcon(id, this.state.mediaType, this.lang); return `<span class="card-genre-chip">${icon} ${escapeHTML(name)}</span>`; }).join('')}</div>` : ''}
                ${card.overview && !isBlind ? `<p class="card-overview">${escapeHTML(card.overview)}</p>` : ''}
                ${isBlind && !isBlindGame ? (wildcardHook ? `<p class="card-logline wildcard-hook">${escapeHTML(wildcardHook)}</p>` : card.overview ? `<p class="card-logline">${escapeHTML(card.overview.split('.')[0])}.</p>` : '') : ''}
                ${wildcardBridge ? `<p class="wildcard-bridge">💡 ${escapeHTML(wildcardBridge)}</p>` : ''}
              </div>
            </div>
            ${isBlindGame ? `
              <div class="blind-game-overlay">
                <div class="blind-game-mechanics">${blindGameMechanics}</div>
                <p class="blind-game-hook">${escapeHTML(blindGameHook)}</p>
                <div class="blind-game-meta">
                  ${playtimeBadge}
                  ${platformBadges}
                </div>
              </div>
            ` : ''}
            ${isBlind && !isGame ? `
              ${wildcard ? `
                <div class="wildcard-badge">🎲 ${this.lang === 'de' ? 'Wildcard' : 'Wildcard'}</div>
                <div class="blind-tags wildcard-traits">
                  <span class="blind-tag wildcard-mood">🎭 ${escapeHTML(wildcardMood)}</span>
                  <span class="blind-tag wildcard-pacing">⏱ ${escapeHTML(wildcardPacing)}</span>
                </div>
                ${wildcardTropes.length ? `<div class="blind-tags">${wildcardTropes.map(t => `<span class="blind-tag">${escapeHTML(t)}</span>`).join('')}</div>` : ''}
              ` : `
                ${dnaTags.length ? `<div class="blind-tags">${dnaTags.map(t => `<span class="blind-tag">${escapeHTML(t)}</span>`).join('')}</div>` : ''}
              `}
            ` : ''}
            ${isGame && !isBlindGame ? `
              ${this._isInLibrary(card) ? `<div class="in-library-badge">🎮 ${this.tr.inLibrary}</div>` : ''}
              <div class="game-card-badges">
                ${platformBadges}
                ${playtimeBadge}
                ${multiplayerBadge}
                ${metacriticBadge}
              </div>
              <div class="game-card-steam">
                ${steamTags}
                ${priceBadge}
                ${reviewBadge}
              </div>
              ${storeButtons}
            ` : ''}
            <span class="swipe-stamp swipe-stamp-like">${this.tr.like}</span>
            <span class="swipe-stamp swipe-stamp-nope">${this.tr.nope}</span>
            <span class="swipe-hint swipe-hint-like">${this.tr.like}</span>
            <span class="swipe-hint swipe-hint-nope">${this.tr.nope}</span>
            <span class="swipe-hint swipe-hint-super">★ Super</span>
            <button class="card-info-btn" data-action="info" aria-label="${this.tr.whySeeing}">ℹ️</button>
          </div>
        </div>
        <div class="swipe-actions">
          <button class="btn btn-nope" aria-label="${this.tr.nope}" title="${this.tr.nope}">✕</button>
          <button class="btn btn-skip" aria-label="${this.tr.skip}" title="${this.tr.skip}">⏭</button>
          <button class="btn btn-like" aria-label="${this.tr.like}" title="${this.tr.like}">♥</button>
        </div>
        ${this._navHTML('discover')}
      </div>`;

    const cardEl = app.querySelector('.card');
    if (cardEl) {
      if (this._cardCleanupFns) this._cardCleanupFns.forEach(fn => fn());
      this._cardCleanupFns = [];
      this.swipeEngine = new SwipeEngine(
        cardEl,
        dir => this.handleSwipe(dir),
        () => this._openDeepDive(card)
      );
      const hp = this._setupHoverPreview(cardEl, card);
      const ag = this._setupAmbientGlow(cardEl, card);
      const tl = this._setupTiltEffect(cardEl);
      if (hp) this._cardCleanupFns.push(hp);
      if (ag && isGame) this._cardCleanupFns.push(ag);
      if (tl && isGame) this._cardCleanupFns.push(tl);
    }

    app.querySelector('.btn-like')?.addEventListener('click', () => this.handleSwipe('right'));
    app.querySelector('.btn-nope')?.addEventListener('click', () => this.handleSwipe('left'));
    app.querySelector('.btn-skip')?.addEventListener('click', () => this.handleSwipe('up'));
    app.querySelector('.blind-date-toggle')?.addEventListener('click', () => {
      this.state.blindDateMode = !this.state.blindDateMode;
      this.save();
      this.renderCards(app);
    });
    app.querySelector('.release-radar-toggle')?.addEventListener('click', () => {
      this.state.releaseRadarMode = !this.state.releaseRadarMode;
      this.save();
      this.renderDiscover(document.getElementById('app'));
    });
    app.querySelectorAll('.radar-days-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const days = parseInt(chip.dataset.days, 10);
        if (!isNaN(days) && days !== this.state.radarDays) {
          this.state.radarDays = days;
          this.save();
          this.renderDiscover(document.getElementById('app'));
        }
      });
    });
    app.querySelector('.mood-time-toggle')?.addEventListener('click', () => {
      this._showMoodTimeModal(app);
    });
    app.querySelector('.steam-library-toggle')?.addEventListener('click', () => {
      this._showSteamLibraryModal(app);
    });
    app.querySelectorAll('.wildcard-freq-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const freq = parseInt(chip.dataset.freq, 10);
        if (!isNaN(freq)) {
          this.state.wildcardFrequency = freq;
          this.save();
          this.renderCards(app);
        }
      });
    });
    // Filter chip click handlers
    app.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const type = chip.dataset.type;
        const id = type === 'genre' ? parseInt(chip.dataset.id) || chip.dataset.id : chip.dataset.id;
        const arr = type === 'genre' ? this.state.selectedGenres : this.state.selectedMoods;
        if (!arr) return;
        const idx = arr.indexOf(id);
        if (idx >= 0) {
          arr.splice(idx, 1);
          chip.classList.remove('active');
        } else {
          arr.push(id);
          chip.classList.add('active');
        }
        this._syncFiltersToURL();
        this.save();
        // Keep current cards visible while re-fetching — show loading overlay instead of skeleton flash
        this._filterLoading = true;
        this.renderDiscover(document.getElementById('app'));
      });
    });
    // Clear filters button
    app.querySelector('[data-action="clear-filters"]')?.addEventListener('click', () => {
      this.state.selectedGenres = [];
      this.state.selectedMoods = [];
      this._syncFiltersToURL();
      this.save();
      this._filterLoading = true;
      this.renderDiscover(document.getElementById('app'));
    });

    app.querySelector('.search-toggle')?.addEventListener('click', () => this._showSearch(app));
    app.querySelector('.card-info-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showCardModal(card, app);
    });
    app.querySelector('.card')?.addEventListener('click', (e) => {
      if (e.target.closest('.card-info-btn')) return;
      this._showCardModal(card, app);
    });
    this._bindNav(app);

    // Long-press to show deep-dive panel (replaces peek overlay)
    this._setupLongPress(cardEl, card);
  }

  // ===== PEEK OVERLAY (long-press quick summary) =====
  _setupLongPress(cardEl, card) {
    let pressTimer = null;
    let peekShown = false;
    let startX = 0;
    let startY = 0;

    const startPress = (e) => {
      if (this.swipeEngine?.isSwiping) return;
      if (document.querySelector('.deep-dive-panel')) return;
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      peekShown = false;
      pressTimer = setTimeout(() => {
        peekShown = true;
        this._openDeepDive(card);
        clearTimeout(pressTimer);
        pressTimer = null;
      }, 400);
    };

    const cancelPress = (e) => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    const moveCancel = (e) => {
      if (!pressTimer) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (dx > 10 || dy > 10) {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      }
    };

    cardEl.addEventListener('touchstart', startPress, { passive: true });
    cardEl.addEventListener('touchend', cancelPress, { passive: true });
    cardEl.addEventListener('touchmove', moveCancel, { passive: true });
    cardEl.addEventListener('mousedown', startPress);
    cardEl.addEventListener('mouseup', cancelPress);
    cardEl.addEventListener('mouseleave', cancelPress);
  }

  _openDeepDive(card) {
    if (!card) return;
    if (document.querySelector('.deep-dive-panel')) return;
    new DeepDivePanel({
      card,
      mediaType: this.state.mediaType,
      lang: this.lang,
      genreMap: this._genreMap,
      onSave: () => this.handleSwipe('right'),
      onSkip: () => this.handleSwipe('left'),
      onDismiss: () => {},
    }).open();
  }


  // ===== EXPLICIT FEEDBACK MODAL (triggered from peek "Why not?" button) =====
  _showFeedbackModal(card) {
    const de = this.lang === 'de';
    const overlay = document.createElement('div');
    overlay.className = 'feedback-overlay';
    overlay.innerHTML = `
      <div class="feedback-modal">
        <h3>💬 ${de ? 'Warum interessiert dich das nicht?' : 'Why are you not interested?'}</h3>
        <p>${escapeHTML(card.title)}</p>
        <div class="feedback-options">
          <button class="feedback-btn" data-reason="seen">👁️ ${this.tr.seenIt}</button>
          <button class="feedback-btn" data-reason="mood">🎭 ${this.tr.wrongMood}</button>
          <button class="feedback-btn" data-reason="genre">📚 ${this.tr.notMyGenre}</button>
          <button class="feedback-btn" data-reason="other">💡 ${this.tr.otherReason}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.querySelectorAll('.feedback-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const reason = btn.dataset.reason;
        this._applyExplicitFeedback(card, reason);
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
      });
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
      }
    });
  }

  _applyExplicitFeedback(card, reason) {
    // Feed explicit reasons into the recommender profile for better future predictions
    if (reason === 'seen' || reason === 'mood' || reason === 'genre') {
      const signals = {
        seen: { genrePenalty: 0.2 },
        mood: { genrePenalty: 0.1 },
        genre: { genrePenalty: 0.6 }
      };
      // Directly weaken genre weights in the recommender's profile
      (card.genres || []).forEach(g => {
        const genre = (typeof g === 'string' ? g : (this._genreMap[g] || g));
        if (genre && this.recommender.profile) {
          const cur = this.recommender.profile.genreWeights[genre] || 0;
          this.recommender.profile.genreWeights[genre] = cur - signals[reason].genrePenalty;
        }
      });
      this.recommender._saveProfile();
      this.recommender.cache.clear();
    }
    // Nope the card after feedback
    this.handleSwipe('left');
  }

  // ===== MOOD + TIME SELECTOR MODAL =====
  _showMoodTimeModal(app) {
    const de = this.lang === 'de';
    const overlay = document.createElement('div');
    overlay.className = 'mood-time-overlay';
    
    const moods = [
      { id: 'cozy', icon: '☕', label: this.tr.cozy },
      { id: 'intense', icon: '🔥', label: this.tr.intense },
      { id: 'chill', icon: '🌊', label: this.tr.chill },
      { id: 'competitive', icon: '🏆', label: this.tr.competitive }
    ];
    
    const playtimes = [
      { id: 'quick', icon: '⚡', label: this.tr.quickPlay, max: 30 },
      { id: 'medium', icon: '⏱️', label: this.tr.mediumPlay, max: 120 },
      { id: 'long', icon: '📚', label: this.tr.longPlay, max: 999 },
      { id: 'any', icon: '♾️', label: this.tr.anyPlay, max: 9999 }
    ];
    
    const currentMood = this.state.moodTimeFilter.mood;
    const currentPlaytime = this.state.moodTimeFilter.playtime;
    
    overlay.innerHTML = `
      <div class="mood-time-modal">
        <button class="modal-close" aria-label="Close">✕</button>
        <h3>🎯 ${this.tr.moodTimeTitle}</h3>
        <p class="mood-time-subtitle">${this.tr.moodTimeSub}</p>
        
        <div class="mood-time-section">
          <h4>${de ? 'Stimmung' : 'Mood'}</h4>
          <div class="mood-options">
            ${moods.map(m => `
              <button class="mood-option ${currentMood === m.id ? 'active' : ''}" data-mood="${m.id}">
                <span class="mood-icon">${m.icon}</span>
                <span class="mood-label">${m.label}</span>
              </button>
            `).join('')}
          </div>
        </div>
        
        <div class="mood-time-section">
          <h4>${de ? 'Verfuegbare Zeit' : 'Available Time'}</h4>
          <div class="playtime-options">
            ${playtimes.map(p => `
              <button class="playtime-option ${currentPlaytime === p.id ? 'active' : ''}" data-playtime="${p.id}">
                <span class="playtime-icon">${p.icon}</span>
                <span class="playtime-label">${p.label}</span>
              </button>
            `).join('')}
          </div>
        </div>
        
        <div class="mood-time-actions">
          <button class="btn btn-secondary mood-time-clear">${this.tr.clearFilter}</button>
          <button class="btn btn-primary mood-time-apply">${this.tr.applyFilter}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    
    // Mood selection
    overlay.querySelectorAll('.mood-option').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.mood-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    // Playtime selection
    overlay.querySelectorAll('.playtime-option').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.playtime-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    // Clear button
    overlay.querySelector('.mood-time-clear').addEventListener('click', () => {
      this.state.moodTimeFilter = { active: false, mood: null, playtime: null };
      this.save();
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
      this.renderCards(app);
    });
    
    // Apply button
    overlay.querySelector('.mood-time-apply').addEventListener('click', () => {
      const selectedMood = overlay.querySelector('.mood-option.active')?.dataset.mood;
      const selectedPlaytime = overlay.querySelector('.playtime-option.active')?.dataset.playtime;
      
      this.state.moodTimeFilter = {
        active: !!(selectedMood || selectedPlaytime),
        mood: selectedMood || null,
        playtime: selectedPlaytime || null
      };
      this.save();
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
      this.renderCards(app);
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
      }
    });
    
    // Close button
    overlay.querySelector('.modal-close').addEventListener('click', () => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
    });
  }

  // ===== STEAM LIBRARY IMPORT MODAL =====
  _showSteamLibraryModal(app) {
    const de = this.lang === 'de';
    const overlay = document.createElement('div');
    overlay.className = 'steam-library-overlay';
    
    const { steamId, apiKey, imported, gameCount, lastFetch } = this.state.steamLibrary;
    const hasImported = imported && gameCount > 0;
    const lastFetchDate = lastFetch ? new Date(lastFetch * 1000).toLocaleDateString() : '';
    
    overlay.innerHTML = `
      <div class="steam-library-modal">
        <button class="modal-close" aria-label="Close">✕</button>
        <h3>🎮 ${this.tr.steamLibrary}</h3>
        <p class="steam-library-subtitle">${de ? 'Importiere deine Steam Spiele fuer bessere Empfehlungen' : 'Import your Steam games for better recommendations'}</p>
        
        ${hasImported ? `
          <div class="steam-library-status">
            <div class="steam-library-count">${this.t('steamLibraryCount', gameCount.toString())}</div>
            <div class="steam-library-lastfetch">${de ? 'Letzter Import:' : 'Last import:'} ${lastFetchDate}</div>
          </div>
        ` : ''}
        
        <div class="steam-library-form">
          <div class="steam-library-field">
            <label for="steam-id">${this.tr.steamId}</label>
            <input type="text" id="steam-id" value="${escapeHTML(steamId)}" placeholder="${de ? 'Deine Steam ID (z.B. 76561198012345678)' : 'Your Steam ID (e.g. 76561198012345678)'}">
            <a href="https://steamid.io/" target="_blank" rel="noopener" class="steam-library-help">${de ? 'Steam ID finden' : 'Find your Steam ID'}</a>
          </div>
          
          <div class="steam-library-field">
            <label for="steam-api-key">${this.tr.steamApiKey}</label>
            <input type="password" id="steam-api-key" value="${escapeHTML(apiKey)}" placeholder="${de ? 'Steam Web API Key (optional)' : 'Steam Web API Key (optional)'}">
            <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener" class="steam-library-help">${de ? 'API Key bekommen' : 'Get API Key'}</a>
          </div>
        </div>
        
        <div class="steam-library-actions">
          ${hasImported ? `
            <button class="btn btn-secondary steam-library-clear">${this.tr.clearFilter}</button>
          ` : ''}
          <button class="btn btn-primary steam-library-import" ${!steamId ? 'disabled' : ''}>
            ${this.tr.steamImport}
          </button>
        </div>
        
        <div class="steam-library-info">
          <p>${de ? 'Hinweis: Dein Profil muss oeffentlich sein, oder du brauchst einen API Key.' : 'Note: Your profile must be public, or you need an API key.'}</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    
    // Enable/disable import button based on Steam ID input
    const steamIdInput = overlay.querySelector('#steam-id');
    const importBtn = overlay.querySelector('.steam-library-import');
    steamIdInput.addEventListener('input', () => {
      importBtn.disabled = !steamIdInput.value.trim();
    });
    
    // Import button
    importBtn.addEventListener('click', async () => {
      const id = steamIdInput.value.trim();
      const key = overlay.querySelector('#steam-api-key').value.trim();
      
      if (!id) return;
      
      importBtn.disabled = true;
      importBtn.textContent = this.tr.steamImporting;
      
      try {
        await this._fetchSteamLibrary(id, key, overlay);
      } catch (error) {
        console.error('Steam Library import error:', error);
        showToast(this.tr.steamImportError, { type: 'error', duration: 3000 });
      } finally {
        importBtn.disabled = false;
        importBtn.textContent = this.tr.steamImport;
      }
    });
    
    // Clear button
    overlay.querySelector('.steam-library-clear')?.addEventListener('click', () => {
      this.state.steamLibrary = { steamId: '', apiKey: '', imported: false, gameCount: 0, lastFetch: 0 };
      this.save();
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
      this.renderCards(app);
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
      }
    });
    
    // Close button
    overlay.querySelector('.modal-close').addEventListener('click', () => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
    });
  }

  async _fetchSteamLibrary(steamId, apiKey, overlay) {
    const params = new URLSearchParams({ steamid: steamId });
    if (apiKey) params.set('api_key', apiKey);
    
    const response = await fetch(`/proxy/steam/library?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch Steam library');
    }
    
    const data = await response.json();
    const { gameCount, games } = data;
    
    // Store library in state
    this.state.steamLibrary = {
      steamId,
      apiKey,
      imported: true,
      gameCount,
      lastFetch: Math.floor(Date.now() / 1000),
      games: games || []
    };
    this.save();
    
    // Store in IndexedDB for persistence
    await safeSetJSON('bs-steam-library', this.state.steamLibrary);
    
    showToast(this.t('steamLibraryCount', gameCount.toString()), { type: 'success', duration: 3000 });
    
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
    this.renderCards(document.getElementById('app'));
  }

  _isInLibrary(card) {
    if (!this.state.steamLibrary.imported || !this.state.steamLibrary.games) {
      return false;
    }
    
    // Check by Steam App ID if available
    if (card.steamAppId) {
      return this.state.steamLibrary.games.some(g => g.appId === card.steamAppId);
    }
    
    // Fallback: check by title (case-insensitive)
    const cardTitle = (card.title || '').toLowerCase();
    return this.state.steamLibrary.games.some(g => 
      (g.name || '').toLowerCase() === cardTitle
    );
  }

  // ===== MOOD + TIME FILTER LOGIC =====
  _applyMoodTimeFilter(items) {
    const { mood, playtime } = this.state.moodTimeFilter;
    if (!mood && !playtime) return items;

    return items.filter(item => {
      // Check mood filter
      if (mood) {
        const itemMoods = (item.moods || []).map(m => m.toLowerCase());
        const itemTags = (item.steamTags || []).map(t => t.toLowerCase());
        const itemGenres = (item.genres || []).map(g => {
          const id = typeof g === 'number' ? g : g.id || g;
          return (typeof g === 'string' ? g : (this._genreMap[id] || '')).toLowerCase();
        });
        const itemThemes = (item.themes || []).map(t => t.toLowerCase());
        
        // Mood to genre/tag mapping
        const moodMappings = {
          cozy: ['cozy', 'wholesome', 'relaxing', 'casual', 'farming', 'simulation', 'puzzle', 'visual novel'],
          intense: ['intense', 'action', 'souls-like', 'difficult', 'horror', 'survival', 'competitive'],
          chill: ['chill', 'relaxing', 'atmospheric', 'story rich', 'adventure', 'puzzle', 'indie'],
          competitive: ['competitive', 'multiplayer', 'pvp', 'battle royale', 'fighting', 'strategy', 'sports']
        };
        
        const moodKeywords = moodMappings[mood] || [];
        const hasMoodMatch = moodKeywords.some(keyword => 
          itemMoods.includes(keyword) || 
          itemTags.includes(keyword) || 
          itemGenres.includes(keyword) ||
          itemThemes.includes(keyword)
        );
        
        if (!hasMoodMatch) return false;
      }
      
      // Check playtime filter
      if (playtime && playtime !== 'any') {
        const playtimeHours = item.playtime || 0;
        const playtimeMinutes = playtimeHours * 60;
        
        const playtimeRanges = {
          quick: { min: 0, max: 30 },
          medium: { min: 30, max: 180 },
          long: { min: 180, max: 999 }
        };
        
        const range = playtimeRanges[playtime];
        if (range && (playtimeMinutes < range.min || playtimeMinutes > range.max)) {
          return false;
        }
      }
      
      return true;
    });
  }

  // ===== DAYLIST (Contextual Curation Engine) =====
  _showDaylist(app) {
    const de = this.lang === 'de';
    const items = this.currentCards.filter(c => c);

    if (!items.length) {
      showToast(de ? 'Keine Karten zum Kuratieren' : 'No cards to curate', { type: 'warning', duration: 2000 });
      return;
    }

    // Snapshot of current items for cache validation
    const itemsSnapshot = {
      count: items.length,
      ids: items.map(i => i.id).sort().join(','),
    };

    // Ask for energy level via a quick in-overlay toggle
    let energyLevel = null;

    const renderOverlay = (energy, precomputedDaylist) => {
      let daylist;
      if (precomputedDaylist) {
        daylist = precomputedDaylist;
      } else {
        daylist = this.recommender.generateDaylist(items, { energyLevel: energy });
        if (!daylist || !daylist.media_queue || !daylist.media_queue.length) {
          showToast(de ? 'Konnte keine Tagesliste erstellen' : 'Could not generate daylist', { type: 'warning', duration: 2000 });
          return;
        }
        // Cache the freshly generated daylist
        safeSetJSON('bs-daylist-cache', {
          daylist,
          energyLevel: energy,
          itemsSnapshot,
          timestamp: Date.now(),
        });
      }

      const existing = document.querySelector('.daylist-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'daylist-overlay';
      overlay.innerHTML = `
        <div class="daylist-modal">
          <button class="daylist-close" data-action="daylist-close">✕</button>
          <div class="daylist-header">
            <div class="daylist-icon">📋</div>
            <h2 class="daylist-title">${escapeHTML(daylist.queue_title)}</h2>
            <p class="daylist-vibe">${escapeHTML(daylist.vibe_description)}</p>
          </div>
          <div class="daylist-meta">
            <span class="daylist-time">⏱ ${escapeHTML(daylist.estimated_total_time)}</span>
          </div>
          <div class="daylist-rules">
            ${daylist.contextual_rules_applied.map(r => `<span class="daylist-rule">${escapeHTML(r)}</span>`).join('')}
          </div>
          <div class="daylist-energy-prompt">
            <span class="daylist-energy-label">${de ? 'Energie-Level:' : 'Energy Level:'}</span>
            <div class="daylist-energy-options">
              <button class="daylist-energy-btn ${energy === null ? 'active' : ''}" data-energy="null">${de ? '⚖️ Auto' : '⚖️ Auto'}</button>
              <button class="daylist-energy-btn ${energy === 'low' ? 'active' : ''}" data-energy="low">😴 ${de ? 'Müde' : 'Tired'}</button>
              <button class="daylist-energy-btn ${energy === 'medium' ? 'active' : ''}" data-energy="medium">💪 ${de ? 'OK' : 'Good'}</button>
              <button class="daylist-energy-btn ${energy === 'high' ? 'active' : ''}" data-energy="high">⚡ ${de ? 'Voller Energie' : 'Energetic'}</button>
            </div>
          </div>
          <div class="daylist-queue">
            ${daylist.media_queue.map((item, i) => `
              <div class="daylist-item">
                <div class="daylist-item-rank">${i + 1}</div>
                <div class="daylist-item-info">
                  <strong class="daylist-item-title">${escapeHTML(item.title)}</strong>
                  ${item.author ? `<span class="daylist-item-author">${escapeHTML(item.author)}</span>` : ''}
                  <span class="daylist-item-format">${escapeHTML(item.format)}</span>
                  <p class="daylist-item-why">${escapeHTML(item.why_right_now)}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('open'));

      overlay.querySelector('[data-action="daylist-close"]')?.addEventListener('click', () => {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
          setTimeout(() => overlay.remove(), 300);
        }
      });

      overlay.querySelectorAll('.daylist-energy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.energy;
          energyLevel = val === 'null' ? null : val;
          renderOverlay(energyLevel);
        });
      });

      const escHandler = (e) => {
        if (e.key === 'Escape') {
          const o = document.querySelector('.daylist-overlay');
          if (o) { o.classList.remove('open'); setTimeout(() => o.remove(), 300); }
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    };

    // Check localStorage for a cached daylist (same deck, < 30 min old)
    const cache = safeGetJSON('bs-daylist-cache', null);
    const cacheValid = cache && cache.daylist && cache.itemsSnapshot &&
      cache.itemsSnapshot.count === itemsSnapshot.count &&
      cache.itemsSnapshot.ids === itemsSnapshot.ids &&
      (Date.now() - (cache.timestamp || 0)) < 30 * 60 * 1000;

    if (cacheValid) {
      energyLevel = cache.energyLevel;
      renderOverlay(cache.energyLevel, cache.daylist);
    } else {
      renderOverlay(null, null);
    }
  }

  // ===== SWIPE HANDLING =====
  async handleSwipe(dir) {
    const card = this.currentCards[this.currentCardIndex];
    if (!card) return;

    // Spawn particles at screen center
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    if (dir === 'right') {
      this._spawnParticles(cx, cy, 'like');
      document.body.classList.add('swipe-flash-right');
      setTimeout(() => document.body.classList.remove('swipe-flash-right'), 400);
    } else if (dir === 'left') {
      this._spawnParticles(cx, cy, 'nope');
      document.body.classList.add('swipe-flash-left');
      setTimeout(() => document.body.classList.remove('swipe-flash-left'), 400);
    } else if (dir === 'up') {
      this._spawnParticles(cx, cy, 'super');
    }

    // Haptic feedback
    if (navigator.vibrate && dir !== 'up') {
      navigator.vibrate(dir === 'right' ? [15, 30, 15] : [20]);
    }

    if (dir === 'right') {
      this.watchlist.push(card);
      await addToWatchlist(card);
      await addToHistory({ ...card, action: 'like', date: new Date().toISOString() });
      this.recommender.updateFromSwipe(card, 'like');
      showToast(`${this.t('swipeActionLike')}: ${card.title}`, { type: 'success', duration: 1500 });
    } else if (dir === 'left') {
      this.disliked.push(card);
      await addToDisliked(card);
      await addToHistory({ ...card, action: 'nope', date: new Date().toISOString() });
      this.recommender.updateFromSwipe(card, 'nope');
      // Show undo toast
      showToast(this.t('undoMessage', card.title), {
        type: 'info',
        duration: 3000,
        action: true,
        actionLabel: this.t('undo'),
        onAction: () => this._undoSwipe(),
      });
    } else {
      await addToHistory({ ...card, action: 'skip', date: new Date().toISOString() });
    }

    // Track swipe in experiment
    this.experiment.trackSwipe({ direction: dir, item: card });

    this.currentCardIndex++;
    await this.save();
    const app = document.getElementById('app');
    if (this.currentCardIndex >= this.currentCards.length) {
      this.currentCardIndex = 0;
      this.renderDiscover(app);
    } else {
      this.renderCards(app);
    }
  }

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
  }

  _renderPlatformBadges(card) {
    if (!card.platforms || !card.platforms.length) return '';
    const shown = card.platforms.slice(0, 3);
    return `<div class="platform-badges">${shown.map(p =>
      `<span class="platform-badge">${escapeHTML(p.abbr || p.name)}</span>`
    ).join('')}${card.platforms.length > 3 ? `<span class="platform-badge more">+${card.platforms.length - 3}</span>` : ''}</div>`;
  }

  _renderPlaytimeBadge(card) {
    if (!card.playtime && card.playtime !== 0) return '';
    let range;
    if (card.playtime <= 5) range = PLAYTIME_RANGES.quick;
    else if (card.playtime <= 20) range = PLAYTIME_RANGES.medium;
    else if (card.playtime <= 50) range = PLAYTIME_RANGES.long;
    else range = PLAYTIME_RANGES.epic;
    return `<span class="playtime-badge" style="--pt-color:${range.color}">${range.icon} ${card.playtime}h</span>`;
  }

  _renderMultiplayerBadge(card) {
    if (!card.modes || !card.modes.length) return '';
    let mt = MULTIPLAYER_TYPES.single;
    const modes = card.modes.map(m => m.toLowerCase());
    if (modes.some(m => /mmo|massive/.test(m))) mt = MULTIPLAYER_TYPES.mmo;
    else if (modes.some(m => /pvp|competitive|versus/.test(m))) mt = MULTIPLAYER_TYPES.pvp;
    else if (modes.some(m => /co.op|cooperative|multi/.test(m))) mt = MULTIPLAYER_TYPES.coop;
    return `<span class="multiplayer-badge" style="--mp-color:${mt.color}">${mt.icon} ${mt.label}</span>`;
  }

  _renderSteamTags(card) {
    const tags = card.steamTags || [];
    if (!tags.length) return '';
    return `<div class="steam-tags">${tags.slice(0, 4).map(t =>
      `<span class="steam-tag">${escapeHTML(typeof t === 'string' ? t : t.name)}</span>`
    ).join('')}</div>`;
  }

  _renderPriceBadge(card) {
    if (card.price === undefined || card.price === null) return '';
    if (card.isFree) return '<span class="price-badge free">Free</span>';
    if (card.discount > 0) {
      return `<span class="price-badge discount">-${card.discount}%</span><span class="price-badge">${escapeHTML(card.price)}</span>`;
    }
    if (card.price) return `<span class="price-badge">${escapeHTML(card.price)}</span>`;
    return '';
  }

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
  }

  _renderMetacriticBadge(card) {
    if (!card.metacritic) return '';
    let colorClass = 'mc-mixed';
    if (card.metacritic >= 75) colorClass = 'mc-good';
    else if (card.metacritic >= 50) colorClass = 'mc-mixed';
    else colorClass = 'mc-bad';
    return `<span class="metacritic-badge ${colorClass}">MC ${card.metacritic}</span>`;
  }

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
  }

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
  }

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
    if (!videoId && !isTMDB) return null;

    const cover = cardEl.querySelector('.card-cover');
    if (!cover) return null;
    let iframe = null;
    let hoverTimer = null;
    let isPlaying = false;
    let trailerFetched = false;

    const createIframe = (id) => {
      const el = document.createElement('iframe');
      el.className = 'card-trailer-iframe';
      el.src = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&showinfo=0`;
      el.allow = 'autoplay; encrypted-media';
      el.setAttribute('frameborder', '0');
      el.setAttribute('pointer-events', 'none');
      return el;
    };

    const startPreview = () => {
      hoverTimer = setTimeout(async () => {
        if (isPlaying) return;
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
  }

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
  }

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
  }

  // ===== CARD MODAL WITH IMPROVED REASONING =====
  _showCardModal(card, app) {
    const isGame = card.type === 'game' || card.source === 'igdb';
    const isBook = this.state.mediaType === 'books';
    const modal = document.createElement('div');
    modal.className = 'card-modal-overlay';
    modal.innerHTML = `
      <div class="card-modal">
        <button class="modal-close" aria-label="Close">✕</button>
        <div class="modal-hero">
          ${createImageWithFallback(card.cover, card.title, 'modal-cover', isGame ? '🎮' : isBook ? '📚' : '🎬')}
        </div>
        <div class="modal-body">
          <h2>${escapeHTML(card.title)}</h2>
          <div class="modal-meta">
            ${card.year ? `<span class="modal-year">${card.year}</span>` : ''}
            ${card.rating ? `<span class="modal-rating">⭐ ${typeof card.rating === 'number' ? card.rating.toFixed(1) : card.rating}</span>` : ''}
            ${isGame && card.ratingCount ? `<span class="modal-rating-count">(${card.ratingCount} ratings)</span>` : ''}
          </div>
          ${isGame ? `
            <div class="modal-game-meta">
              ${card.platforms?.length ? `<div class="modal-platforms">${card.platforms.map(p => `<span class="modal-platform">${escapeHTML(p.abbr || p.name)}</span>`).join('')}</div>` : ''}
              ${card.genres?.length ? `<div class="modal-genres">${card.genres.map(g => { const id = typeof g === 'number' ? g : g; const name = typeof g === 'string' ? g : (this._genreMap[g] || g); const icon = getGenreIcon(id, this.state.mediaType, this.lang); return `<span class="modal-genre">${icon} ${escapeHTML(name)}</span>`; }).join('')}</div>` : ''}
              ${card.modes?.length ? `<p class="modal-modes">🎮 ${card.modes.join(', ')}</p>` : ''}
            </div>
          ` : ''}
          ${card.overview ? `<p class="modal-overview">${escapeHTML(card.overview)}</p>` : ''}
          ${this._renderWhySeeing(card)}
          ${this._renderMatchDNA(card)}
          ${this._renderCrossMediaSuggestions(card)}
          ${isGame ? this._renderStoreButtons(card) : this._renderStreamingButtons(card)}
          <div class="modal-actions">
            <button class="btn btn-like modal-add" data-id="${escapeHTML(card.id)}">❤️ ${this.tr.like}</button>
            <button class="btn btn-nope modal-nope" data-id="${escapeHTML(card.id)}">👎 ${this.tr.nope}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));
    modal.querySelector('.modal-close')?.addEventListener('click', () => {
      modal.classList.remove('open');
      setTimeout(() => modal.remove(), 300);
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
        setTimeout(() => modal.remove(), 300);
      }
    });
    modal.querySelector('.modal-add')?.addEventListener('click', async () => {
      if (!this.watchlist.find(w => w.id === card.id)) {
        this.watchlist.push(card);
        await addToWatchlist(card);
      }
      await this.save();
      modal.classList.remove('open');
      setTimeout(() => modal.remove(), 300);
      this.renderCards(app);
    });
    modal.querySelector('.modal-nope')?.addEventListener('click', async () => {
      if (!this.disliked.find(d => d.id === card.id)) {
        this.disliked.push(card);
        await addToDisliked(card);
      }
      await this.save();
      modal.classList.remove('open');
      setTimeout(() => modal.remove(), 300);
      this.renderCards(app);
    });
  }

  // ===== IMPROVED "WHY AM I SEEING THIS?" =====
  _renderWhySeeing(card) {
    const reasons = [];
    const s = this.state;

    // Check if we liked something similar
    if (card.genres && this.watchlist.length > 0) {
      const likedGenres = {};
      this.watchlist.forEach(w => {
        (w.genres || []).forEach(g => {
          const name = typeof g === 'string' ? g : (this._genreMap[g] || g);
          likedGenres[name] = (likedGenres[name] || 0) + 1;
        });
      });
      const matchingGenres = (card.genres || []).filter(g => {
        const name = typeof g === 'string' ? g : (this._genreMap[g] || g);
        return likedGenres[name] >= 2;
      }).map(g => typeof g === 'string' ? g : (this._genreMap[g] || g));
      if (matchingGenres.length) {
        // Find the most similar liked item
        let bestMatch = null;
        let bestScore = 0;
        this.watchlist.forEach(w => {
          const overlap = (w.genres || []).filter(g1 =>
            (card.genres || []).some(g2 => {
              const n1 = typeof g1 === 'string' ? g1 : (this._genreMap[g1] || g1);
              const n2 = typeof g2 === 'string' ? g2 : (this._genreMap[g2] || g2);
              return n1 === n2;
            })
          ).length;
          if (overlap > bestScore) { bestScore = overlap; bestMatch = w; }
        });
        if (bestMatch) {
          reasons.push(`🎯 ${this.t('becauseYouLiked', bestMatch.title)}`);
        } else {
          reasons.push(`🎯 ${this.lang === 'de' ? 'Passt zu Genres die du magst' : 'Matches genres you like'}: ${matchingGenres.slice(0, 2).join(', ')}`);
        }
      }
    }

    // Genre overlap with selected genres
    if (card.genres && s.selectedGenres?.length) {
      const overlap = card.genres.filter(g => s.selectedGenres.includes(g.id || g));
      if (overlap.length) {
        reasons.push(`${this.lang === 'de' ? '⭐ Passt zu deinen' : '⭐ Matches your'} ${overlap.length} ${this.lang === 'de' ? 'gewählten Genres' : 'selected genres'}`);
      }
    }

    // Watch mode
    if (this.state.watchMode !== 'solo') reasons.push(this.tr[this.state.watchMode + 'Sub']);

    // Platform match for games
    if ((card.type === 'game' || card.source === 'igdb') && s.selectedPlatforms?.length && card.platforms) {
      const platformIds = card.platforms.map(p => p.id);
      const match = platformIds.filter(id => s.selectedPlatforms.includes(id));
      if (match.length) {
        reasons.push(`🎮 ${this.lang === 'de' ? 'Verfügbar auf deinen Plattformen' : 'Available on your platforms'}`);
      }
    }

    if (!reasons.length) reasons.push(this.tr.matchReason);

    return `
      <div class="modal-reasons">
        <h4>${this.tr.whySeeing}</h4>
        ${reasons.map(r => `<p class="reason-item">${escapeHTML(r)}</p>`).join('')}
      </div>`;
  }


  // ===== MATCH DNA VISUAL BREAKDOWN =====
  _renderMatchDNA(card) {
    try {
      const dna = this.recommender.generateMatchDNA(card);
      if (!dna || !dna.dna_breakdown || !dna.dna_breakdown.length) return '';

      const pct = dna.overall_match_percentage;
      let color = '#ef4444'; // red
      let label = this.lang === 'de' ? 'Schlecht' : 'Poor';
      if (pct >= 80) { color = '#22c55e'; label = this.lang === 'de' ? 'Perfekt' : 'Perfect'; }
      else if (pct >= 60) { color = '#4ecdc4'; label = this.lang === 'de' ? 'Gut' : 'Good'; }
      else if (pct >= 40) { color = '#f59e0b'; label = this.lang === 'de' ? 'Okay' : 'Okay'; }

      return `
        <div class="match-dna-section">
          <div class="match-dna-header">
            <h3>🧬 ${this.lang === 'de' ? 'Match-DNA' : 'Match DNA'}</h3>
            <div class="match-dna-ring" style="--dna-color:${color};--dna-pct:${pct}">
              <svg viewBox="0 0 36 36" class="dna-ring-svg">
                <path class="dna-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                <path class="dna-ring-fill" stroke-dasharray="${pct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
              </svg>
              <span class="dna-ring-text">${pct}%</span>
            </div>
          </div>
          <p class="match-dna-hook">${escapeHTML(dna.hook)}</p>
          <div class="dna-bars">
            ${dna.dna_breakdown.map(b => {
              const barColor = b.score >= 80 ? '#22c55e' : b.score >= 60 ? '#4ecdc4' : b.score >= 40 ? '#f59e0b' : '#ef4444';
              return `
                <div class="dna-bar-row">
                  <div class="dna-bar-label">
                    <span>${escapeHTML(b.category)}</span>
                    <span class="dna-bar-score">${b.score}%</span>
                  </div>
                  <div class="dna-bar-track">
                    <div class="dna-bar-fill" style="width:${b.score}%;background:${barColor}"></div>
                  </div>
                  <p class="dna-bar-reason">${escapeHTML(b.reason)}</p>
                </div>
              `;
            }).join('')}
          </div>
        </div>`;
    } catch (e) {
      console.warn('Match DNA error:', e);
      return '';
    }
  }

  // ===== CROSS-MEDIA RECOMMENDATIONS =====
  _renderCrossMediaSuggestions(card) {
    if (!card.genres || !card.genres.length) return '';
    const currentType = this.state.mediaType;
    const mappings = CROSS_MEDIA_GENRES[currentType];
    if (!mappings) return '';

    const suggestions = [];
    const sourceGenres = card.genres.map(g => typeof g === 'string' ? g : (this._genreMap[g] || g));

    // Build simple cross-media suggestions from watchlist
    if (this.watchlist.length >= 3) {
      const otherType = currentType === 'games' ? 'movies' : 'games';
      const candidates = this.watchlist.filter(w => w.type === otherType || w.source === (otherType === 'games' ? 'igdb' : 'tmdb')).slice(0, 4);
      if (candidates.length >= 2) {
        return `
          <div class="cross-media-section">
            <h3>🌐 ${this.t('crossMediaTitle')}</h3>
            <div class="cross-media-cards">
              ${candidates.map(c => `
                <div class="cross-media-card" data-id="${escapeHTML(c.id)}">
                  ${createImageWithFallback(c.cover, c.title, 'cross-media-img', c.type === 'game' || c.source === 'igdb' ? '🎮' : '🎬')}
                  <div class="cm-info">
                    <div class="cm-title">${escapeHTML(c.title)}</div>
                    <div class="cm-meta">${c.year || ''} · ${c.type === 'game' || c.source === 'igdb' ? 'Game' : 'Movie'}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>`;
      }
    }
    return '';
  }

  // ===== SEARCH =====
  _showSearch(app) {
    const overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.innerHTML = `
      <div class="search-modal">
        <div class="search-input-row">
          <input type="text" class="search-input" placeholder="${this.tr.searchPlaceholder}" autofocus aria-label="${this.tr.search}" role="searchbox">
          <button class="search-close">✕</button>
        </div>
        <div class="search-results"></div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const input = overlay.querySelector('.search-input');
    const results = overlay.querySelector('.search-results');
    let debounce = null;

    const close = () => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.search-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 2) { results.innerHTML = ''; return; }
      debounce = setTimeout(() => this._doSearch(q, results, app, close), 350);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') {
        clearTimeout(debounce);
        const q = input.value.trim();
        if (q.length >= 2) this._doSearch(q, results, app, close);
      }
    });
  }

  async _doSearch(query, container, app, closeFn) {
    container.innerHTML = `<div class="search-loading">${this.tr.loading}</div>`;
    const type = this.state.mediaType;
    let items = [];

    try {
      if (type === 'books') {
        const [ol, gb] = await Promise.all([
          fetchDeduped(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8`).then(r => r.json()),
          fetchDeduped(`/proxy/gbooks/volumes?q=${encodeURIComponent(query)}&maxResults=5`).then(r => r.json())
        ]);
        if (ol.docs) {
          ol.docs.forEach(d => items.push({
            id: `ol-${d.key}`, title: d.title, author: d.author_name?.[0] || '',
            cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
            year: d.first_publish_year, source: 'openlibrary', type: 'book'
          }));
        }
        if (gb.items) {
          gb.items.forEach(gb => {
            const vi = gb.volumeInfo;
            items.push({
              id: `gb-${gb.id}`, title: vi.title, author: vi.authors?.[0] || '',
              cover: vi.imageLinks?.thumbnail || '',
              year: parseInt(vi.publishedDate) || null, source: 'gbooks', type: 'book',
              description: vi.description
            });
          });
        }
      } else if (type === 'games') {
        const results = await searchGames(query, 8);
        items = results.map(g => ({
          id: g.id, igdb_id: g.igdb_id, title: g.title, slug: g.slug,
          cover: g.cover, overview: g.overview, genres: g.genres,
          platforms: g.platforms, year: g.year, rating: g.rating,
          source: 'igdb', type: 'game'
        }));
      } else {
        const r = await fetchDeduped(`/proxy/tmdb/search/multi?query=${encodeURIComponent(query)}&language=${this.lang}`);
        if (r.ok) {
          const data = await r.json();
          (data.results || []).slice(0, 8).forEach(m => {
            if (m.media_type === 'person') return;
            items.push({
              id: `tmdb-${m.id}`, tmdb_id: m.id, title: m.title || m.name,
              cover: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
              backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
              year: parseInt((m.release_date || m.first_air_date || '').slice(0, 4)) || null,
              overview: m.overview, genres: m.genre_ids, source: 'tmdb',
              type: m.media_type || this.state.mediaType
            });
          });
        }
      }
    } catch (e) {
      console.warn('Search error:', e);
    }

    if (!items.length) {
      container.innerHTML = `<div class="search-empty">${this.t('searchNoResults', query)}</div>`;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="search-result" data-id="${escapeHTML(item.id)}">
        ${item.cover ? `<img class="sr-cover" src="${escapeHTML(item.cover)}" alt="">` : `<div class="sr-cover placeholder">${item.type === 'game' ? '🎮' : '📚'}</div>`}
        <div class="sr-info">
          <strong>${escapeHTML(item.title)}</strong>
          ${item.author ? `<span class="sr-meta">${escapeHTML(item.author)}</span>` : ''}
          ${item.year ? `<span class="sr-meta">${item.year}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-like sr-add" data-id="${escapeHTML(item.id)}">+</button>
      </div>
    `).join('');

    container.querySelectorAll('.sr-add').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = items.find(i => i.id === btn.dataset.id);
        if (item && !this.watchlist.find(w => w.id === item.id)) {
          this.watchlist.push(item);
          await addToWatchlist(item);
          await this.save();
          btn.textContent = '✓';
          btn.disabled = true;
          showToast(`${item.title} added!`, { type: 'success', duration: 1500 });
        }
      });
    });

    container.querySelectorAll('.search-result').forEach(el => {
      el.addEventListener('click', () => {
        const item = items.find(i => i.id === el.dataset.id);
        if (item) {
          closeFn();
          this.currentCards.unshift(item);
          this.currentCardIndex = 0;
          this.renderCards(app);
        }
      });
    });
  }

  _renderStreamingButtons(card) {
    if (card.source !== 'tmdb' || !card.tmdb_id) return '';
    const providers = [
      { id:119, name:'Prime Video', color:'#00A8E1' },
      { id:8, name:'Netflix', color:'#E50914' },
      { id:387, name:'HBO', color:'#B535F6' }
    ];
    return `
      <div class="streaming-buttons">
        ${providers.map(p => `
          <button class="streaming-btn" style="--sp-color:${p.color}" data-provider="${p.id}">
            ▶ ${this.t('playOn', p.name)}
          </button>
        `).join('')}
      </div>`;
  }

  _renderStoreButtons(card) {
    if (card.source !== 'igdb' && !card.steamAppId) return '';

    const stores = [];

    if (card.steamAppId) {
      stores.push({ name: 'Steam', icon: '🎮', color: '#1b2838', url: `https://store.steampowered.com/app/${card.steamAppId}` });
    }

    if (card.source === 'igdb') {
      const slug = card.slug || encodeURIComponent(card.title).toLowerCase().replace(/%20/g, '-');
      const platforms = (card.platforms || []).map(p => (p.name || '').toLowerCase());
      const hasPC = platforms.some(p => /pc|steam|windows/.test(p));
      const hasPS = platforms.some(p => /playstation/.test(p));
      const hasXbox = platforms.some(p => /xbox/.test(p));
      const hasNintendo = platforms.some(p => /nintendo|switch/.test(p));

      if (hasPC && !card.steamAppId) {
        stores.push({ name: 'Steam Web', icon: '🌐', color: '#1b2838', url: `https://store.steampowered.com/app/${card.igdb_id || ''}/${slug}` });
      }
      if (hasPS) {
        stores.push({ name: 'PlayStation Store', icon: '🎮', color: '#003087', url: `https://store.playstation.com/en-us/search/${encodeURIComponent(card.title)}` });
      }
      if (hasXbox) {
        stores.push({ name: 'Xbox Store', icon: '🟢', color: '#107c10', url: `https://www.xbox.com/en-us/games/store/a/${card.igdb_id || slug}` });
      }
      if (hasNintendo) {
        stores.push({ name: 'Nintendo eShop', icon: '🔴', color: '#e60012', url: `https://www.nintendo.com/us/store/products/${slug}-switch/` });
      }
      stores.push({ name: 'IGDB', icon: '📋', color: '#a855f7', url: card.url || `https://www.igdb.com/games/${slug}` });
    }

    if (!stores.length) return '';
    return `
      <div class="store-buttons">
        ${stores.map(s => `
          <a class="store-btn" style="--store-color:${s.color}" href="${escapeHTML(s.url)}" target="_blank" rel="noopener">
            <span class="store-btn-icon">${s.icon}</span>
            <span class="store-btn-label">${s.name}</span>
          </a>
        `).join('')}
      </div>`;
  }

  // ===== VIEW ROUTING =====
  _navHTML(active) {
    return `<nav class="bottom-nav">
      <button class="nav-btn${active==='discover'?' active':''}" data-view="discover">🔍 ${this.tr.discover}</button>
      <button class="nav-btn${active==='daylist'?' active':''}" data-view="daylist">📋 ${this.lang === 'de' ? 'Heute' : 'Today'}</button>
      <button class="nav-btn${active==='watchlist'?' active':''}" data-view="watchlist">📝 ${this.watchlist.length}</button>
      <button class="nav-btn${active==='history'?' active':''}" data-view="history">📖</button>
      <button class="nav-btn${active==='stats'?' active':''}" data-view="stats">📊</button>
    </nav>`;
  }
  _bindNav(app) {
    app.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.renderView(btn.dataset.view, app));
    });
  }
  renderView(view, app) {
    // Dismiss any open daylist overlay when navigating to another tab
    const daylistOverlay = document.querySelector('.daylist-overlay');
    if (daylistOverlay && view !== 'daylist') {
      daylistOverlay.classList.remove('open');
      setTimeout(() => daylistOverlay.remove(), 300);
    }
    if (view === 'watchlist') return this.renderWatchlist(app);
    if (view === 'history') return this.renderHistory(app);
    if (view === 'stats') return this.renderStats(app);
    if (view === 'daylist') return this._showDaylist(app);
    this.renderDiscover(app);
  }

  renderWatchlist(app) {
    const items = this.watchlist.map(item => {
      const isGame = item.type === 'game' || item.source === 'igdb';
      return `
      <div class="list-item" data-id="${escapeHTML(item.id)}">
        ${createImageWithFallback(item.cover, item.title, 'list-cover', isGame ? '🎮' : '📚')}
        <div class="list-info">
          <strong>${escapeHTML(item.title)}</strong>
          ${item.author ? `<span class="list-meta">${escapeHTML(item.author)}</span>` : ''}
          ${item.year ? `<span class="list-meta">${item.year}</span>` : ''}
          ${isGame && item.platforms?.length ? `<span class="list-meta">${item.platforms.map(p => p.abbr || p.name).join(', ')}</span>` : ''}
          ${isGame && item.rating ? `<span class="list-meta">⭐ ${typeof item.rating === 'number' ? item.rating.toFixed(0) : item.rating}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-remove" data-id="${escapeHTML(item.id)}" aria-label="Remove">✕</button>
      </div>`;
    }).join('');
    app.innerHTML = `
      <div class="view watchlist-view">
        <h2>${this.tr.watchlist} (${this.watchlist.length})</h2>
        ${this.watchlist.length >= 2 ? `
          <button class="btn btn-primary btn-roulette">${this.tr.pickForUs} 🎰</button>
        ` : ''}
        <div class="list">${items || `<p class="empty">${this.tr.empty}</p>`}</div>
        <div class="watchlist-actions">
          <button class="btn btn-export">${this.tr.letterboxd}</button>
          <button class="btn btn-share-dna">🔗 ${this.tr.dnaLink}</button>
        </div>
        <button class="btn btn-back">← ${this.lang === 'de' ? 'Zurueck' : 'Back'}</button>
        ${this._navHTML('watchlist')}
      </div>`;
    app.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        this.watchlist = this.watchlist.filter(w => w.id !== id);
        await removeFromWatchlist(id);
        await this.save();
        this.renderView('watchlist', app);
      });
    });
    app.querySelector('.btn-export')?.addEventListener('click', () => this.exportLetterboxdCSV());
    app.querySelector('.btn-share-dna')?.addEventListener('click', () => this.shareDNA());
    app.querySelector('.btn-roulette')?.addEventListener('click', () => this._showRoulette(app));
    app.querySelector('.btn-back')?.addEventListener('click', () => this.renderDiscover(app));
    this._bindNav(app);
  }

  _showRoulette(app) {
    const modal = document.createElement('div');
    modal.className = 'roulette-overlay';
    const items = this.watchlist;
    let spins = 0;
    const maxSpins = 20;
    let currentIdx = 0;
    modal.innerHTML = `
      <div class="roulette-modal">
        <h2>${this.tr.couchCoop}</h2>
        <p>${this.tr.couchCoopSub}</p>
        <div class="roulette-wheel">
          <div class="roulette-item" id="roulette-display">
            ${createImageWithFallback(items[0].cover, items[0].title, 'roulette-img', '🎰')}
            <span>${escapeHTML(items[0].title)}</span>
          </div>
        </div>
        <button class="btn btn-primary btn-spin">${this.tr.spin}</button>
      </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));
    const display = modal.querySelector('#roulette-display');
    const btnSpin = modal.querySelector('.btn-spin');
    const doSpin = () => {
      btnSpin.disabled = true;
      spins = 0;
      let speed = 80;
      const doTick = () => {
        currentIdx = (currentIdx + 1) % items.length;
        const item = items[currentIdx];
        display.innerHTML = createImageWithFallback(item.cover, item.title, 'roulette-img', '🎰') + `<span>${escapeHTML(item.title)}</span>`;
        display.classList.add('spinning');
        spins++;
        if (spins < 5) speed = Math.max(30, speed - 10);
        else if (spins > maxSpins - 5) speed = Math.min(200, speed + 30);
        if (spins >= maxSpins) {
          display.classList.remove('spinning');
          display.classList.add('landed');
          btnSpin.disabled = false;
          this._spawnConfetti(modal);
          return;
        }
        setTimeout(doTick, speed);
      };
      doTick();
    };
    btnSpin?.addEventListener('click', doSpin);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
        setTimeout(() => modal.remove(), 300);
      }
    });
  }

  _spawnConfetti(container) {
    const colors = ['#6c63ff','#ff6b6b','#4ecdc4','#ffd700','#ff69b4'];
    for (let i = 0; i < 30; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.cssText = `left:${Math.random()*100}%;background:${colors[i%colors.length]};animation-delay:${Math.random()*0.5}s;`;
      container.appendChild(c);
      setTimeout(() => c.remove(), 2000);
    }
  }

  renderHistory(app) {
    const items = [...this.history].reverse().slice(0, 50).map(item => `
      <div class="list-item">
        <span class="history-action">${item.action === 'like' ? '❤️' : item.action === 'nope' ? '👎' : '⏭'}</span>
        <div class="list-info">
          <strong>${escapeHTML(item.title)}</strong>
          <span class="list-meta">${new Date(item.date).toLocaleDateString(this.lang)}</span>
        </div>
      </div>`).join('');
    app.innerHTML = `
      <div class="view history-view">
        <h2>${this.tr.history}</h2>
        <div class="list">${items || `<p class="empty">${this.tr.empty}</p>`}</div>
        <button class="btn btn-back">← ${this.lang === 'de' ? 'Zurueck' : 'Back'}</button>
        ${this._navHTML('history')}
      </div>`;
    app.querySelector('.btn-back')?.addEventListener('click', () => this.renderDiscover(app));
    this._bindNav(app);
  }

  renderStats(app) {
    const liked = this.history.filter(h => h.action === 'like').length;
    const noped = this.history.filter(h => h.action === 'nope').length;
    const skipped = this.history.filter(h => h.action === 'skip').length;
    const total = liked + noped + skipped;
    const genres = {};
    this.watchlist.forEach(w => {
      const gList = w.genres || [];
      gList.forEach(g => {
        const name = typeof g === 'string' ? g : (this._genreMap[g] || g);
        genres[name] = (genres[name] || 0) + 1;
      });
    });
    const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const persona = this._getPersonaBadge();
    const antiTaste = this._getAntiTaste();
    const weeklyVibe = this._getWeeklyVibe();
    app.innerHTML = `
      <div class="view stats-view">
        <h2>${this.tr.stats}</h2>
        <div class="persona-card">
          <span class="persona-icon">🎭</span>
          <h3>${this.tr.persona}</h3>
          <span class="persona-badge">${escapeHTML(persona)}</span>
        </div>
        ${antiTaste.length ? `
          <div class="anti-taste-card">
            <h3>${this.tr.antiTaste}</h3>
            <p class="anti-taste-sub">${this.tr.antiTasteSub}</p>
            <div class="anti-taste-tags">
              ${antiTaste.map(t => `<span class="anti-tag">🚫 ${escapeHTML(t)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        <div class="weekly-vibe-card">
          <h3>${this.tr.weeklyVibe}</h3>
          <div class="vibe-bars">
            ${Object.entries(weeklyVibe).slice(0,4).map(([v, pct]) => `
              <div class="vibe-row">
                <span class="vibe-label">${escapeHTML(v)}</span>
                <div class="vibe-bar"><div class="vibe-fill" style="width:${pct}%"></div></div>
                <span class="vibe-pct">${Math.round(pct)}%</span>
              </div>
            `).join('')}
          </div>
        </div>
        ${this._renderExperimentStats()}
        <div class="stat-grid">
          <div class="stat"><span class="stat-num" data-target="${total}">0</span><span class="stat-label">${this.lang === 'de' ? 'Bewertet' : 'Rated'}</span></div>
          <div class="stat"><span class="stat-num" data-target="${liked}">0</span><span class="stat-label">❤️</span></div>
          <div class="stat"><span class="stat-num" data-target="${noped}">0</span><span class="stat-label">👎</span></div>
          <div class="stat"><span class="stat-num" data-target="${skipped}">0</span><span class="stat-label">⏭</span></div>
        </div>
        ${topGenres.length ? `
          <h3>${this.lang === 'de' ? 'Top Genres' : 'Top Genres'}</h3>
          <div class="genre-bars">${topGenres.map(([g, c]) => {
            const icon = getGenreIcon(Object.entries(this._genreMap).find(([k,v]) => v === g)?.[0] || g, this.state.mediaType, this.lang);
            return `<div class="genre-bar"><span class="genre-bar-icon">${icon}</span><span>${escapeHTML(g)}</span><div class="bar-fill" style="width:${Math.min(c / total * 100, 100)}%"></div><span>${c}</span></div>`;
          }).join('')}</div>` : ''}
        <button class="btn btn-back">← ${this.lang === 'de' ? 'Zurueck' : 'Back'}</button>
        ${this._navHTML('stats')}
      </div>`;
    // Experiment switch/reset handlers
    app.querySelector('[data-action="switch-experiment-group"]')?.addEventListener('click', () => {
      const newGroup = this.experiment.group === 'treatment' ? 'control' : 'treatment';
      this.experiment.switchGroup(newGroup);
      showToast(
        this.lang === 'de'
          ? `Gruppe gewechselt zu: ${newGroup === 'treatment' ? 'MMR Diversity' : 'Zufalls-Serendipity'}`
          : `Switched to: ${newGroup === 'treatment' ? 'MMR Diversity' : 'Random Serendipity'}`,
        { type: 'info', duration: 2500 }
      );
      this.renderStats(app);
    });
    app.querySelector('[data-action="reset-experiment"]')?.addEventListener('click', () => {
      this.experiment.reset();
      showToast(
        this.lang === 'de'
          ? 'Experiment zurückgesetzt — neue Gruppe: ' + (this.experiment.group === 'treatment' ? 'MMR Diversity' : 'Zufalls-Serendipity')
          : 'Experiment reset — new group: ' + (this.experiment.group === 'treatment' ? 'MMR Diversity' : 'Random Serendipity'),
        { type: 'info', duration: 2500 }
      );
      this.renderStats(app);
    });
    app.querySelector('.btn-back')?.addEventListener('click', () => this.renderDiscover(app));
    this._bindNav(app);
    // Count-up animation for stat numbers
    app.querySelectorAll('.stat-num[data-target]').forEach(el => {
      const target = parseInt(el.dataset.target, 10);
      if (target > 0) this._animateStatCount(el, target);
    });
  }

  _renderExperimentStats() {
    const m = this.experiment.getMetrics();
    const de = this.lang === 'de';
    const groupLabel = m.group === 'treatment' ? 'MMR Diversity' : 'Random Serendipity';
    return `
      <div class="experiment-card">
        <h3>🧪 ${de ? 'A/B Test' : 'A/B Test'}: ${m.experiment}</h3>
        <div class="experiment-meta">
          <span class="experiment-group ${m.group}">${groupLabel}</span>
          <span class="experiment-sessions">${m.sessionCount} ${de ? 'Sitzungen' : 'sessions'}</span>
        </div>
        <div class="experiment-metrics">
          <div class="exp-metric">
            <span class="exp-metric-value">${m.totalSwipes}</span>
            <span class="exp-metric-label">${de ? 'Wischaktionen' : 'Swipes'}</span>
          </div>
          <div class="exp-metric">
            <span class="exp-metric-value">${(m.likeRate * 100).toFixed(0)}%</span>
            <span class="exp-metric-label">${de ? 'Gefällt mir Rate' : 'Like rate'}</span>
          </div>
          <div class="exp-metric">
            <span class="exp-metric-value">${(m.genreDiversity * 100).toFixed(0)}%</span>
            <span class="exp-metric-label">${de ? 'Genre-Vielfalt' : 'Genre diversity'}</span>
          </div>
          <div class="exp-metric">
            <span class="exp-metric-value">${m.avgSwipesPerDeck.toFixed(1)}</span>
            <span class="exp-metric-label">${de ? 'Pro Deck' : 'Per deck'}</span>
          </div>
          <div class="exp-metric">
            <span class="exp-metric-value">${m.avgSessionDurationSec.toFixed(0)}s</span>
            <span class="exp-metric-label">${de ? 'Mittl. Sitzung' : 'Avg session'}</span>
          </div>
          <div class="exp-metric">
            <span class="exp-metric-value">${m.totalLikes}</span>
            <span class="exp-metric-label">❤️</span>
          </div>
        </div>
        <div class="experiment-actions">
          <button class="btn btn-sm exp-btn exp-btn-switch" data-action="switch-experiment-group">
            🔄 ${de ? 'Wechseln zu' : 'Switch to'} ${m.group === 'treatment' ? de ? 'Zufall' : 'Random' : de ? 'MMR' : 'MMR'}
          </button>
          <button class="btn btn-sm exp-btn exp-btn-reset" data-action="reset-experiment">
            🗑 ${de ? 'Zurücksetzen' : 'Reset'}
          </button>
        </div>
      </div>`;
  }

  _getPersonaBadge() {
    const liked = this.history.filter(h => h.action === 'like');
    if (liked.length < 3) return this.lang === 'de' ? 'Neuling' : 'Newcomer';
    const genres = {};
    liked.forEach(h => (h.genres || []).forEach(g => {
      const name = typeof g === 'string' ? g : (this._genreMap[g] || g);
      genres[name] = (genres[name] || 0) + 1;
    }));
    const top = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
    if (!top) return PERSONA_BADGES[this.lang].normie;
    const [genre] = top;
    const g = genre.toLowerCase();
    if (g.includes('horror') || g.includes('thriller')) return liked.length > 10 ? PERSONA_BADGES[this.lang].darkSoul : PERSONA_BADGES[this.lang].horrorSkeptic;
    if (g.includes('romance') || g.includes('romcom')) return PERSONA_BADGES[this.lang].romcomAddict;
    if (g.includes('sci-fi') || g.includes('science fiction') || g.includes('878')) return PERSONA_BADGES[this.lang].mindBender;
    if (g.includes('animation') || g.includes('family')) return PERSONA_BADGES[this.lang].cozyQueen;
    if (g.includes('action') || g.includes('adventure')) return PERSONA_BADGES[this.lang].actionJunkie;
    if (g.includes('drama') || g.includes('history')) return PERSONA_BADGES[this.lang].cerebrlElite;
    return PERSONA_BADGES[this.lang].wildcard;
  }

  _getAntiTaste() {
    const noped = this.history.filter(h => h.action === 'nope');
    if (noped.length < 3) return [];
    const genres = {};
    noped.forEach(h => (h.genres || []).forEach(g => {
      const name = typeof g === 'string' ? g : (this._genreMap[g] || g);
      genres[name] = (genres[name] || 0) + 1;
    }));
    return Object.entries(genres)
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);
  }

  _getWeeklyVibe() {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekItems = this.history.filter(h => new Date(h.date).getTime() > weekAgo);
    if (weekItems.length < 2) return { '🎬': 50, '🧠': 30, '😂': 20 };
    const vibes = { '🎬': 0, '🧠': 0, '😂': 0, '💕': 0 };
    weekItems.forEach(h => {
      const genres = (h.genres || []).map(g => (this._genreMap[g] || '').toLowerCase());
      if (genres.some(g => /action|adventure/.test(g))) vibes['🎬']++;
      if (genres.some(g => /drama|sci-fi|thriller/.test(g))) vibes['🧠']++;
      if (genres.some(g => /comedy/.test(g))) vibes['😂']++;
      if (genres.some(g => /romance/.test(g))) vibes['💕']++;
    });
    const total = Object.values(vibes).reduce((a, b) => a + b, 0) || 1;
    Object.keys(vibes).forEach(k => { vibes[k] = (vibes[k] / total) * 100; });
    return vibes;
  }

  exportLetterboxdCSV() {
    const header = 'Name,Year,Rating10,WatchedDate,LetterboxdUrl\n';
    const rows = this.watchlist.map(i => {
      const name = `"${(i.title || '').replace(/"/g, '""')}"`;
      const year = i.year || '';
      const date = new Date().toISOString().slice(0, 10);
      return `${name},${year},,${date},`;
    }).join('\n');
    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `letterboxd_import_${this.lang}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 100);
  }

  shareDNA() {
    const topGenres = {};
    this.watchlist.forEach(w => (w.genres || []).forEach(g => {
      const name = typeof g === 'string' ? g : (this._genreMap[g] || g);
      topGenres[name] = (topGenres[name] || 0) + 1;
    }));
    const sorted = Object.entries(topGenres).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const dna = {
      g: sorted.map(([name]) => name),
      p: this._getPersonaBadge(),
      c: this.watchlist.length,
      l: this.lang
    };
    const encoded = btoa(JSON.stringify(dna));
    const url = `${window.location.origin}${window.location.pathname}?dna=${encoded}`;
    navigator.clipboard?.writeText(url).then(() => {
      showToast(this.lang === 'de' ? 'Link kopiert!' : 'Link copied!', { type: 'success', duration: 2000 });
    }).catch(() => {
      prompt(this.lang === 'de' ? 'Kopiere diesen Link:' : 'Copy this link:', url);
    });
  }
}

export { App };

window.app = new App();
