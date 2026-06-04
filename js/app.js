import { escapeHTML, shuffleArray, TMDB_GENRE_MAP } from './utils.js';
import { BOOK_GENRES, BOOK_MOODS, BOOK_QUIZ, ERA_FILTERS, BOOK_SEARCH, COVER_PLACEHOLDERS } from './books.js';
import { MEDIA_GENRES, MEDIA_MOODS, MEDIA_VIBES } from './media.js';
import { GAME_GENRES, GAME_GENRE_NAME_MAP, GAME_MOODS, GAME_MECHANICS, GAME_PLATFORMS, GAME_PACING, PLAYTIME_RANGES, MULTIPLAYER_TYPES, GAME_STATUS, ICONIC_GAMES, GAME_SEARCH } from './games.js';
import { fetchBooks } from './api.js';
import { SwipeEngine } from './swipe.js';
import { EnrichmentWorker } from './enrichment.js';
import { Recommender } from './recommender.js';
import { getTMDBDetails, searchTMDB } from './tmdb.js';
import { renderVibeBars, detectSpoilers, generateElevatorPitchFull } from './descriptions.js';
import { mapTMDBTags, computeVibeScores, mapGameTags, mapMediaDNA } from './tag_mapper.js';
import { searchGames, fetchGamesByGenre, fetchPopularGames, fetchGamesForDiscovery } from './games_api.js';
import {
  migrateFromLocalStorage,
  getWatchlist, addToWatchlist, removeFromWatchlist,
  getDisliked, addToDisliked, removeFromDisliked,
  getHistory, addToHistory, removeLastHistory,
  getRecProfile, saveRecProfile,
  getUIState, setUIState,
  getFullWatchlist
} from './storage.js';
import { createAbortable, getErrorMessage } from './api-client.js';
import { showToast, dismissToast, clearAllToasts } from './toast.js';

// ===== CONSTANTS =====
const LANG = {
  de: {
    title:'BookSwipe', subtitle:'Buecher, Filme & Spiele entdecken', skip:'Ueberspringen', like:'Gefaellt mir',
    nope:'Nichts fuer mich', discover:'Entdecken', onboarding:'Willkommen!', quiz:'Quiz', swipe:'Wischen',
    history:'Verlauf', watchlist:'Merkliste', stats:'Statistiken', empty:'Nichts gefunden', loading:'Laden...',
    age:'Alter', lang:'Sprache', dark:'Dunkel', light:'Hell', yes:'Ja', no:'Nein', export:'Exportieren',
    share:'Teilen', whoWatching:'Wer schaut zu?', solo:'Allein', dateNight:'Date Night', family:'Familie',
    blindDate:'Blind Date', rapidFire:'Schnelltest', whoWatchingSub:'Damit wir dir besser empfehlen koennen',
    familySub:'Wir filtern Inhalte automatisch', dateNightSub:'Wir boosten Romance & Thriller',
    soloSub:'Volle Kontrolle ueber deine Empfehlungen',
    persona:'Dein Taste-Persona', antiTaste:'Was du hasst', antiTasteSub:'Wir haben es aus deinem Weg geraeumt',
    weeklyVibe:'Dein Wochen-Vibe', pickForUs:'Ueberrasch mich!', dnaLink:'Taste DNA teilen',
    playOn:'Auf {0} ansehen', whySeeing:'Warum sehe ich das?', matchReason:'Passt zu deinen Vorlieben',
    swipeLeft:'Links geswiped', swipeRight:'Rechts geswiped', bannedContent:'Verbannt',
    rapidFireTitle:'Dein Geschmack in 15 Sekunden', rapidFireSub:'Wische schnell durch — links = Nein, rechts = Ja',
    rapidFireComplete:'Perfekt! Wir kennen deinen Geschmack', letterboxd:'Letterboxd Export',
    letterboxdSub:'Importiere deine Merkliste nach Letterboxd',
    couchCoop:'Couch Co-op Roulette', couchCoopSub:'Fuer wenn ihr euch nicht einigen koennt',
    spin:'Drehen!', result:'Das wird es!',
    games:'Spiele', whatToPlay:'Was soll ich spielen?', platforms:'Plattformen',
    playstyle:'Spielstil', timeAvailable:'Zeit', sessions:'Sitzungen',
    quickSession:'Kurz (15-30 Min)', moderateSession:'Mittel (1-2 Std)', longSession:'Lang (3+ Std)',
    playing:'Gerade gespielt', completed:'Geschafft', backlog:'Backlog', wishlist:'Wunschliste', dropped:'Abgebrochen',
    hoursPlayed:'Std. gespielt', onSale:'Im Angebot', friendsPlaying:'Freunde spielen',
    // New translations
    errorLoading:'Fehler beim Laden', retry:'Erneut versuchen', errorDetails:'Details',
    cardCount:'{0} Karten', undo:'Rueckgaengig', undoMessage:'{0} wurde entfernt',
    becauseYouLiked:'Weil dir "{0}" gefaellt', swipeActionLike:'Geswiped', swipeActionNope:'Uebersprungen',
    swipeActionSkip:'Uebergangen', notForMe:'Nicht fuer mich', seenIt:'Bereits gesehen',
    wrongMood:'Falscher Stimmung', notMyGenre:'Nicht mein Genre', otherReason:'Anderer Grund',
    feedbackTitle:'Warum interessiert dich das nicht?', fromWatchlist:'Aus Merkliste entfernt',
    crossMediaTitle:'Auch fuer dich', noDescription:'Keine Beschreibung verfuegbar',
    search:'Suchen', searchPlaceholder:'Titel oder Autor suchen...', searchNoResults:'Keine Ergebnisse fuer "{0}"'
  },
  en: {
    title:'BookSwipe', subtitle:'Discover books, movies & games', skip:'Skip', like:'Like',
    nope:'Nope', discover:'Discover', onboarding:'Welcome!', quiz:'Quiz', swipe:'Swipe',
    history:'History', watchlist:'Watchlist', stats:'Stats', empty:'Nothing found', loading:'Loading...',
    age:'Age', lang:'Language', dark:'Dark', light:'Light', yes:'Yes', no:'No', export:'Export',
    share:'Share', whoWatching:'Who\'s watching?', solo:'Solo', dateNight:'Date Night', family:'Family',
    blindDate:'Blind Date', rapidFire:'Rapid Fire', whoWatchingSub:'So we can recommend better',
    familySub:'We auto-filter mature content', dateNightSub:'We boost Romance & Thriller',
    soloSub:'Full control over your picks',
    persona:'Your Taste Persona', antiTaste:'What you hate', antiTasteSub:'We banished it from your feed',
    weeklyVibe:'Your Weekly Vibe', pickForUs:'Pick for Us!', dnaLink:'Share Taste DNA',
    playOn:'Play on {0}', whySeeing:'Why am I seeing this?', matchReason:'Matches your preferences',
    swipeLeft:'Swiped left', swipeRight:'Swiped right', bannedContent:'Banished',
    rapidFireTitle:'Your Taste in 15 Seconds', rapidFireSub:'Swipe fast — left = no, right = yes',
    rapidFireComplete:'Perfect! We know your taste', letterboxd:'Letterboxd Export',
    letterboxdSub:'Import your watchlist to Letterboxd',
    couchCoop:'Couch Co-op Roulette', couchCoopSub:'For when you can\'t decide',
    spin:'Spin!', result:'It is!',
    games:'Games', whatToPlay:'What should I play?', platforms:'Platforms',
    playstyle:'Playstyle', timeAvailable:'Time', sessions:'Sessions',
    quickSession:'Quick (15-30 min)', moderateSession:'Moderate (1-2 hrs)', longSession:'Long (3+ hrs)',
    playing:'Currently Playing', completed:'Completed', backlog:'Backlog', wishlist:'Wishlist', dropped:'Dropped',
    hoursPlayed:'hrs played', onSale:'On Sale', friendsPlaying:'Friends playing',
    // New translations
    errorLoading:'Error loading content', retry:'Try again', errorDetails:'Details',
    cardCount:'{0} cards', undo:'Undo', undoMessage:'{0} removed',
    becauseYouLiked:'Because you liked "{0}"', swipeActionLike:'Liked', swipeActionNope:'Passed',
    swipeActionSkip:'Skipped', notForMe:'Not for me', seenIt:'Already seen it',
    wrongMood:'Wrong mood', notMyGenre:'Not my genre', otherReason:'Other reason',
    feedbackTitle:'Why are you not interested?', fromWatchlist:'Removed from watchlist',
    crossMediaTitle:'You might also like', noDescription:'No description available',
    search:'Search', searchPlaceholder:'Search title or author...', searchNoResults:'No results for "{0}"'
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
      watchMode: 'solo', onboardingStep: 0, blindDateMode: false,
      blockedGenres: [], boostedMoods: [], selectedPlatforms: []
    };
    this.watchlist = [];
    this.disliked = [];
    this.history = [];
    this.currentCards = [];
    this.currentCardIndex = 0;
    this.swipeEngine = null;
    this.enrichment = new EnrichmentWorker(this);
    this.recommender = new Recommender(this);
    this.tr = LANG[this.lang] || LANG.de;
    this._cleanupFns = [];
    this._pendingAbort = null;
    this._loadDNAFromURL();
    this._bindKeyboard();
    document.documentElement.lang = this.lang;
    // Migrate legacy data, load state, then render
    migrateFromLocalStorage()
      .then(() => this._loadState())
      .then(() => this.render())
      .catch(() => this.render());
  }

  // ===== STATE PERSISTENCE =====
  async _loadState() {
    const { lang, state } = getUIState();
    if (lang) this.lang = lang;
    if (state) {
      this.state = { ...this.state, ...state };
    }
    this.tr = LANG[this.lang] || LANG.de;
    this.watchlist = await getWatchlist();
    this.disliked = await getDisliked();
    this.history = await getHistory();
    const profile = await getRecProfile();
    if (profile) this.recommender.profile = profile;
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
    app.innerHTML = `
      <div class="onboarding">
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
        <button class="btn btn-primary btn-start">${this.tr.discover}</button>
      </div>`;
    app.querySelector('[data-type="books"]')?.addEventListener('click', () => { this.state.mediaType = 'books'; this.render(); });
    app.querySelector('[data-type="movies"]')?.addEventListener('click', () => { this.state.mediaType = 'movies'; this.render(); });
    app.querySelector('[data-type="tv"]')?.addEventListener('click', () => { this.state.mediaType = 'tv'; this.render(); });
    app.querySelector('[data-type="games"]')?.addEventListener('click', () => { this.state.mediaType = 'games'; this.render(); });
    app.querySelector('[data-lang="de"]')?.addEventListener('click', () => { this.lang = 'de'; this.tr = LANG.de; this.save(); this.render(); });
    app.querySelector('[data-lang="en"]')?.addEventListener('click', () => { this.lang = 'en'; this.tr = LANG.en; this.save(); this.render(); });
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
        <h1>${this.tr.whoWatching}</h1>
        <p class="onboarding-sub">${this.tr.whoWatchingSub}</p>
        <div class="watch-mode-grid">
          ${modes.map(m => `
            <button class="watch-mode-card ${this.state.watchMode === m.key ? 'selected' : ''}" data-mode="${m.key}">
              <span class="watch-mode-icon">${m.icon}</span>
              <span class="watch-mode-label">${this.tr[m.key]}</span>
              <span class="watch-mode-sub">${this.tr[m.key + 'Sub']}</span>
            </button>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-start">${this.tr.discover}</button>
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
        <button class="btn btn-primary btn-start">${this.tr.discover}</button>
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
    app.innerHTML = `
      <div class="onboarding rapid-fire">
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
            ${item.genres ? `<p class="rf-genres">${item.genres.slice(0,3).map(g => typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g)).join(' · ')}</p>` : ''}
          </div>
        </div>
        <div class="swipe-actions rapid-fire-actions">
          <button class="btn btn-nope rf-nope">👎</button>
          <button class="btn btn-like rf-like">❤️</button>
        </div>
      </div>`;
    const cardEl = app.querySelector('.rapid-fire-card');
    if (cardEl) {
      new SwipeEngine(cardEl, dir => {
        if (dir === 'right') this._rapidFireLikes.push(item);
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
    if (this.state.mediaType === 'books') {
      const pool = [
        { id:'rf-b1', title:'Der Herr der Ringe', year:1954, cover:'', genres:['fantasy'], author:'J.R.R. Tolkien', source:'rapid-fire', type:'book' },
        { id:'rf-b2', title:'1984', year:1949, cover:'', genres:['scifi'], author:'George Orwell', source:'rapid-fire', type:'book' },
        { id:'rf-b3', title:'Harry Potter', year:1997, cover:'', genres:['fantasy'], author:'J.K. Rowling', source:'rapid-fire', type:'book' },
        { id:'rf-b4', title:'Die unendliche Geschichte', year:1979, cover:'', genres:['fantasy'], author:'Michael Ende', source:'rapid-fire', type:'book' },
        { id:'rf-b5', title:'Der Steppenwolf', year:1927, cover:'', genres:['historical'], author:'Hermann Hesse', source:'rapid-fire', type:'book' },
        { id:'rf-b6', title:'Tschick', year:2010, cover:'', genres:['ya'], author:'Wolfgang Herrndorf', source:'rapid-fire', type:'book' },
        { id:'rf-b7', title:'Das Parfum', year:1985, cover:'', genres:['thriller'], author:'Patrick Sue/skind', source:'rapid-fire', type:'book' },
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
    this.state.onboardingStep = 3;
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
        <nav class="bottom-nav">
          <button class="nav-btn active" data-view="discover">🔍 ${this.tr.discover}</button>
          <button class="nav-btn" data-view="watchlist">📝 ${this.watchlist.length}</button>
          <button class="nav-btn" data-view="history">📖</button>
          <button class="nav-btn" data-view="stats">📊</button>
        </nav>
      </div>`;
    app.querySelector('.btn-retry')?.addEventListener('click', onRetry);
    app.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.renderView(btn.dataset.view, app));
    });
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

    try {
      let items;
      if (this.state.mediaType === 'books') {
        items = await fetchBooks(this.state.selectedGenres, this.state.selectedMoods, this.lang, signal);
      } else if (this.state.mediaType === 'games') {
        items = await fetchGamesForDiscovery(
          this.state.selectedGenres || [],
          this.state.selectedPlatforms || [],
          40
        );
      } else {
        items = await this.fetchMedia();
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
            return (TMDB_GENRE_MAP[id] || '').toLowerCase();
          });
          return !this.state.blockedGenres.some(bg => itemGenres.includes(bg.toLowerCase()));
        });
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

      // Sort by recommender score (THE KEY FIX)
      const scoredCards = filtered.map(card => ({
        ...card,
        _score: this.recommender.score(card)
      }));
      scoredCards.sort((a, b) => b._score - a._score);
      // Remove temporary score property
      const sortedCards = scoredCards.map(({ _score, ...card }) => card);

      // Inject 15% serendipity — random picks from middle tier (not best, not worst)
      if (sortedCards.length > 10) {
        const serendipityCount = Math.max(1, Math.floor(sortedCards.length * 0.15));
        const topEnd = Math.floor(sortedCards.length * 0.4);
        const bottomStart = Math.floor(sortedCards.length * 0.75);
        const topCards = sortedCards.slice(0, topEnd);
        const middlePool = sortedCards.slice(topEnd, bottomStart);
        const bottomCards = sortedCards.slice(bottomStart);
        const wildCards = shuffleArray([...middlePool]).slice(0, serendipityCount);
        const remaining = middlePool.filter(c => !wildCards.includes(c));
        this.currentCards = [...topCards, ...wildCards, ...remaining, ...bottomCards];
      } else {
        this.currentCards = sortedCards;
      }

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
    if (this.history.length === 0) {
      const icon = this.state.mediaType === 'books' ? '📖' : this.state.mediaType === 'games' ? '🎮' : '🎬';
      app.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">${icon}</span>
          <h2>${this.lang === 'de' ? 'Dein Geschmack ist eine weisse Leinwand' : 'Your taste is a blank canvas'}</h2>
          <p>${this.lang === 'de' ? 'Lass uns sie bemalen. Wische nach rechts auf das, was dein Interesse weckt.' : "Let's paint it. Swipe right on what catches your eye."}</p>
          <button class="btn btn-primary" onclick="location.reload()">${this.lang === 'de' ? 'Los geht\'s' : 'Let\'s go'}</button>
        </div>`;
    } else if (this.watchlist.length === 0) {
      app.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">📚</span>
          <h2>${this.lang === 'de' ? 'Die Regale sind leer' : 'The shelves are bare'}</h2>
          <p>${this.lang === 'de' ? 'Lass uns deine naechste Obsession finden.' : "Let's go find your next obsession."}</p>
          <button class="btn btn-primary" data-nav="discover">${this.lang === 'de' ? 'Zu den Entdeckungen' : 'Take me to Discover'}</button>
        </div>`;
    } else {
      app.innerHTML = `
        <div class="wrap-party">
          <span class="wrap-party-icon">🎉</span>
          <h2>${this.lang === 'de' ? 'Du hast alles erobert!' : 'You\'ve seen it all!'}</h2>
          <p>${this.lang === 'de' ? 'Dein Geschmack ist offiziell legendaer. Bereit fuer ein neues Universum?' : 'Your taste is officially legendary. Ready for a new universe?'}</p>
          <button class="btn btn-primary" data-nav="discover">${this.lang === 'de' ? 'Neues Universum' : 'New Universe'}</button>
        </div>`;
    }
    app.querySelector('[data-nav="discover"]')?.addEventListener('click', () => {
      this.currentCards = this.currentCards.length ? this.currentCards : this.history;
      this.renderDiscover(document.getElementById('app'));
    });
  }

  async fetchMedia() {
    const type = this.state.mediaType === 'movies' ? 'movie' : 'tv';
    const genreIds = this.state.selectedGenres.map(g => typeof g === 'string' ? g : g.id).join(',');
    try {
      const r = await fetch(`/proxy/tmdb/discover/${type}?sort_by=popularity.desc&with_genres=${genreIds || ''}&language=${this.lang}`);
      if (!r.ok) return [];
      const data = await r.json();
      return (data.results || []).map(m => ({
        id: `tmdb-${m.id}`, tmdb_id: m.id, title: m.title || m.name,
        cover: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
        year: parseInt((m.release_date || m.first_air_date || '').slice(0, 4)) || null,
        overview: m.overview, genres: m.genre_ids, source: 'tmdb', type,
        rating: m.vote_average, vote_count: m.vote_count
      }));
    } catch (e) { console.warn('fetchMedia error', e); return []; }
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
      : (card.genres || []).map(g => typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g)).join(', ');
    const dnaTags = this._getCardDNATags(card);
    const coverStyle = isBlind ? 'filter:blur(20px);transform:scale(1.1);' : '';
    let cardClass = 'card';
    if (isBlind) cardClass += ' blind-date-card';
    if (isBook) cardClass += ' book-card';
    if (isGame) cardClass += ' game-card';
    if (isBlindGame) cardClass += ' blind-date-game';

    const platformBadges = isGame ? this._renderPlatformBadges(card) : '';
    const playtimeBadge = isGame ? this._renderPlaytimeBadge(card) : '';
    const multiplayerBadge = isGame ? this._renderMultiplayerBadge(card) : '';
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
        </div>
        <div class="card-stack">
          <div class="${cardClass}" data-id="${escapeHTML(card.id)}">
            ${card.cover ? `<img class="card-cover" style="${coverStyle}" src="${escapeHTML(card.cover)}" alt="${escapeHTML(card.title)}">` : `<div class="card-cover placeholder">${isGame ? '🎮' : '📚'}</div>`}
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
            ${isBlind && !isGame && dnaTags.length ? `<div class="blind-tags">${dnaTags.map(t => `<span class="blind-tag">${escapeHTML(t)}</span>`).join('')}</div>` : ''}
            ${isGame && !isBlindGame ? `
              <div class="game-card-badges">
                ${platformBadges}
                ${playtimeBadge}
                ${multiplayerBadge}
              </div>
            ` : ''}
            <div class="card-info ${isBlindGame ? 'blind-game-info' : ''}">
              ${!isBlindGame ? `<h2 class="card-title">${escapeHTML(card.title)}</h2>` : ''}
              ${card.year && !isBlindGame ? `<span class="card-year">${card.year}</span>` : ''}
              <span class="card-type">${t}</span>
              ${card.rating && !isBlindGame ? `<span class="card-rating">⭐ ${typeof card.rating === 'number' ? card.rating.toFixed(1) : card.rating}</span>` : ''}
              ${genreStr && !isBlind ? `<p class="card-genres">${escapeHTML(genreStr)}</p>` : ''}
              ${card.overview && !isBlind ? `<p class="card-overview">${escapeHTML(card.overview.slice(0, 120))}${card.overview.length > 120 ? '...' : ''}</p>` : ''}
              ${isBlind && !isBlindGame && card.overview ? `<p class="card-logline">${escapeHTML(card.overview.split('.')[0])}.</p>` : ''}
            </div>
            <button class="card-info-btn" data-action="info" aria-label="${this.tr.whySeeing}">ℹ️</button>
          </div>
        </div>
        <div class="swipe-actions">
          <button class="btn btn-nope" aria-label="${this.tr.nope}">👎 ${this.tr.nope}</button>
          <button class="btn btn-skip" aria-label="${this.tr.skip}">⏭ ${this.tr.skip}</button>
          <button class="btn btn-like" aria-label="${this.tr.like}">❤️ ${this.tr.like}</button>
        </div>
        <nav class="bottom-nav">
          <button class="nav-btn active" data-view="discover">🔍 ${this.tr.discover}</button>
          <button class="nav-btn" data-view="watchlist">📝 ${this.watchlist.length}</button>
          <button class="nav-btn" data-view="history">📖</button>
          <button class="nav-btn" data-view="stats">📊</button>
        </nav>
      </div>`;

    const cardEl = app.querySelector('.card');
    if (cardEl) {
      if (this._cardCleanupFns) this._cardCleanupFns.forEach(fn => fn());
      this._cardCleanupFns = [];
      this.swipeEngine = new SwipeEngine(cardEl, dir => this.handleSwipe(dir));
      if (isGame) {
        const hp = this._setupHoverPreview(cardEl, card);
        const ag = this._setupAmbientGlow(cardEl, card);
        const tl = this._setupTiltEffect(cardEl);
        if (hp) this._cardCleanupFns.push(hp);
        if (tl) this._cardCleanupFns.push(tl);
      }
    }

    app.querySelector('.btn-like')?.addEventListener('click', () => this.handleSwipe('right'));
    app.querySelector('.btn-nope')?.addEventListener('click', () => this.handleSwipe('left'));
    app.querySelector('.btn-skip')?.addEventListener('click', () => this.handleSwipe('up'));
    app.querySelector('.blind-date-toggle')?.addEventListener('click', () => {
      this.state.blindDateMode = !this.state.blindDateMode;
      this.save();
      this.renderCards(app);
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
    app.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.renderView(btn.dataset.view, app));
    });

    // Long-press to show feedback modal
    this._setupLongPress(cardEl, card);
  }

  // ===== LONG PRESS FOR EXPLICIT FEEDBACK =====
  _setupLongPress(cardEl, card) {
    let pressTimer = null;
    let startX = 0;
    let startY = 0;

    const startPress = (e) => {
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      pressTimer = setTimeout(() => {
        this._showFeedbackModal(card);
      }, 800);
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
      if (dx > 10 || dy > 10) cancelPress();
    };

    cardEl.addEventListener('touchstart', startPress, { passive: true });
    cardEl.addEventListener('touchend', cancelPress, { passive: true });
    cardEl.addEventListener('touchmove', moveCancel, { passive: true });
    cardEl.addEventListener('mousedown', startPress);
    cardEl.addEventListener('mouseup', cancelPress);
    cardEl.addEventListener('mouseleave', cancelPress);
  }

  _showFeedbackModal(card) {
    const overlay = document.createElement('div');
    overlay.className = 'feedback-overlay';
    overlay.innerHTML = `
      <div class="feedback-modal">
        <h3>${this.t('feedbackTitle')}</h3>
        <p>${escapeHTML(card.title)}</p>
        <div class="feedback-options">
          <button class="feedback-btn" data-reason="seen"><span class="feedback-icon">👀</span> ${this.t('seenIt')}</button>
          <button class="feedback-btn" data-reason="mood"><span class="feedback-icon">🎭</span> ${this.t('wrongMood')}</button>
          <button class="feedback-btn" data-reason="genre"><span class="feedback-icon">🚫</span> ${this.t('notMyGenre')}</button>
          <button class="feedback-btn" data-reason="other"><span class="feedback-icon">💬</span> ${this.t('otherReason')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 400);
      }
    });

    overlay.querySelectorAll('.feedback-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const reason = btn.dataset.reason;
        this._applyExplicitFeedback(card, reason);
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 400);
      });
    });
  }

  _applyExplicitFeedback(card, reason) {
    // Boost anti-taste for this genre
    if (reason === 'genre' && card.genres) {
      card.genres.forEach(g => {
        const name = typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g);
        this.recommender.profile.genreWeights[name] = (this.recommender.profile.genreWeights[name] || 0) - 3;
      });
      this.recommender._saveProfile();
    }
    // Auto-swipe left
    this.handleSwipe('left');
    showToast(this.lang === 'de' ? 'Verstanden — wir passen die Empfehlungen an' : 'Got it — adjusting recommendations', {
      type: 'info',
      duration: 2000,
    });
  }

  // ===== SWIPE HANDLING =====
  async handleSwipe(dir) {
    const card = this.currentCards[this.currentCardIndex];
    if (!card) return;

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
    if (/adventure|abenteuer/.test(genres)) return 'An unforgettable journey filled with wonder and discovery.';
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
    if (card.type !== 'game' || card.source !== 'igdb') return null;
    const trailers = card.trailers || [];
    if (!trailers.length) return null;
    const videoId = trailers[0].id;
    if (!videoId) return null;
    const cover = cardEl.querySelector('.card-cover');
    if (!cover) return null;
    let iframe = null;
    let hoverTimer = null;
    let isPlaying = false;
    const startPreview = () => {
      hoverTimer = setTimeout(() => {
        if (isPlaying) return;
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
    if (!card.cover) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = card.cover;
    img.onload = () => {
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
    const modal = document.createElement('div');
    modal.className = 'card-modal-overlay';
    modal.innerHTML = `
      <div class="card-modal">
        <button class="modal-close" aria-label="Close">✕</button>
        <div class="modal-hero">
          ${card.cover ? `<img src="${escapeHTML(card.cover)}" alt="" class="modal-cover">` : ''}
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
              ${card.genres?.length ? `<div class="modal-genres">${card.genres.map(g => `<span class="modal-genre">${escapeHTML(g)}</span>`).join('')}</div>` : ''}
              ${card.modes?.length ? `<p class="modal-modes">🎮 ${card.modes.join(', ')}</p>` : ''}
            </div>
          ` : ''}
          ${card.overview ? `<p class="modal-overview">${escapeHTML(card.overview)}</p>` : ''}
          ${this._renderWhySeeing(card)}
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
          const name = typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g);
          likedGenres[name] = (likedGenres[name] || 0) + 1;
        });
      });
      const matchingGenres = (card.genres || []).filter(g => {
        const name = typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g);
        return likedGenres[name] >= 2;
      }).map(g => typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g));
      if (matchingGenres.length) {
        // Find the most similar liked item
        let bestMatch = null;
        let bestScore = 0;
        this.watchlist.forEach(w => {
          const overlap = (w.genres || []).filter(g1 =>
            (card.genres || []).some(g2 => {
              const n1 = typeof g1 === 'string' ? g1 : (TMDB_GENRE_MAP[g1] || g1);
              const n2 = typeof g2 === 'string' ? g2 : (TMDB_GENRE_MAP[g2] || g2);
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

  // ===== CROSS-MEDIA RECOMMENDATIONS =====
  _renderCrossMediaSuggestions(card) {
    if (!card.genres || !card.genres.length) return '';
    const currentType = this.state.mediaType;
    const mappings = CROSS_MEDIA_GENRES[currentType];
    if (!mappings) return '';

    const suggestions = [];
    const sourceGenres = card.genres.map(g => typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g));

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
                  ${c.cover ? `<img src="${escapeHTML(c.cover)}" alt="">` : `<div style="height:100px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:2rem">${c.type === 'game' || c.source === 'igdb' ? '🎮' : '🎬'}</div>`}
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
          <input type="text" class="search-input" placeholder="${this.tr.searchPlaceholder}" autofocus>
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
          fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8`).then(r => r.json()),
          fetch(`/proxy/gbooks/volumes?q=${encodeURIComponent(query)}&maxResults=5`).then(r => r.json())
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
        const encoded = encodeURIComponent(`search "${query.replace(/"/g, '\\"')}"; fields id,name,slug,summary,cover.url,genres.name,platforms.name,platforms.abbreviation,first_release_date,total_rating; limit 8;`);
        const r = await fetch(`/proxy/igdb/games?body=${encoded}`);
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data)) {
            data.forEach(g => {
              const coverUrl = g.cover?.url ? g.cover.url.replace('thumb', 'cover_big').replace('//', 'https://') : '';
              items.push({
                id: `igdb-${g.id}`, igdb_id: g.id, title: g.name, slug: g.slug,
                cover: coverUrl, overview: g.summary || '',
                genres: (g.genres || []).map(gen => gen.name),
                platforms: (g.platforms || []).map(p => ({ id: p.id, name: p.name, abbr: p.abbreviation || p.name })),
                year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
                rating: g.total_rating ? Math.round(g.total_rating / 10) : null,
                source: 'igdb', type: 'game'
              });
            });
          }
        }
      } else {
        const r = await fetch(`/proxy/tmdb/search/multi?query=${encodeURIComponent(query)}&language=${this.lang}`);
        if (r.ok) {
          const data = await r.json();
          (data.results || []).slice(0, 8).forEach(m => {
            if (m.media_type === 'person') return;
            items.push({
              id: `tmdb-${m.id}`, tmdb_id: m.id, title: m.title || m.name,
              cover: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
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
    if (card.source !== 'igdb') return '';
    const slug = card.slug || encodeURIComponent(card.title).toLowerCase().replace(/%20/g, '-');
    const stores = [];
    const platforms = (card.platforms || []).map(p => (p.name || '').toLowerCase());
    const hasPC = platforms.some(p => /pc|steam|windows/.test(p));
    const hasPS = platforms.some(p => /playstation/.test(p));
    const hasXbox = platforms.some(p => /xbox/.test(p));
    const hasNintendo = platforms.some(p => /nintendo|switch/.test(p));

    if (hasPC) {
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
  renderView(view, app) {
    if (view === 'watchlist') return this.renderWatchlist(app);
    if (view === 'history') return this.renderHistory(app);
    if (view === 'stats') return this.renderStats(app);
    this.renderDiscover(app);
  }

  renderWatchlist(app) {
    const items = this.watchlist.map(item => {
      const isGame = item.type === 'game' || item.source === 'igdb';
      return `
      <div class="list-item" data-id="${escapeHTML(item.id)}">
        ${item.cover ? `<img class="list-cover" src="${escapeHTML(item.cover)}" alt="">` : `<div class="list-cover placeholder">${isGame ? '🎮' : '📚'}</div>`}
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
        <nav class="bottom-nav">
          <button class="nav-btn" data-view="discover">🔍 ${this.tr.discover}</button>
          <button class="nav-btn active" data-view="watchlist">📝 ${this.watchlist.length}</button>
          <button class="nav-btn" data-view="history">📖</button>
          <button class="nav-btn" data-view="stats">📊</button>
        </nav>
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
    app.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.renderView(btn.dataset.view, app));
    });
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
            ${items[0].cover ? `<img src="${escapeHTML(items[0].cover)}" alt="">` : ''}
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
      const interval = setInterval(() => {
        currentIdx = (currentIdx + 1) % items.length;
        const item = items[currentIdx];
        display.innerHTML = item.cover ? `<img src="${escapeHTML(item.cover)}" alt="">` : '';
        display.innerHTML += `<span>${escapeHTML(item.title)}</span>`;
        display.classList.add('spinning');
        spins++;
        // Accelerate then decelerate
        if (spins < 5) speed = Math.max(30, speed - 10);
        else if (spins > maxSpins - 5) speed = Math.min(200, speed + 30);
        if (spins >= maxSpins) {
          clearInterval(interval);
          display.classList.remove('spinning');
          display.classList.add('landed');
          btnSpin.disabled = false;
          this._spawnConfetti(modal);
        }
      }, speed);
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
        <nav class="bottom-nav">
          <button class="nav-btn" data-view="discover">🔍 ${this.tr.discover}</button>
          <button class="nav-btn" data-view="watchlist">📝 ${this.watchlist.length}</button>
          <button class="nav-btn active" data-view="history">📖</button>
          <button class="nav-btn" data-view="stats">📊</button>
        </nav>
      </div>`;
    app.querySelector('.btn-back')?.addEventListener('click', () => this.renderDiscover(app));
    app.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.renderView(btn.dataset.view, app));
    });
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
        const name = typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g);
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
        <div class="stat-grid">
          <div class="stat"><span class="stat-num">${total}</span><span class="stat-label">${this.lang === 'de' ? 'Bewertet' : 'Rated'}</span></div>
          <div class="stat"><span class="stat-num">${liked}</span><span class="stat-label">❤️</span></div>
          <div class="stat"><span class="stat-num">${noped}</span><span class="stat-label">👎</span></div>
          <div class="stat"><span class="stat-num">${skipped}</span><span class="stat-label">⏭</span></div>
        </div>
        ${topGenres.length ? `
          <h3>${this.lang === 'de' ? 'Top Genres' : 'Top Genres'}</h3>
          <div class="genre-bars">${topGenres.map(([g, c]) => `
            <div class="genre-bar"><span>${escapeHTML(g)}</span><div class="bar-fill" style="width:${Math.min(c / total * 100, 100)}%"></div><span>${c}</span></div>
          `).join('')}</div>` : ''}
        <button class="btn btn-back">← ${this.lang === 'de' ? 'Zurueck' : 'Back'}</button>
        <nav class="bottom-nav">
          <button class="nav-btn" data-view="discover">🔍 ${this.tr.discover}</button>
          <button class="nav-btn" data-view="watchlist">📝 ${this.watchlist.length}</button>
          <button class="nav-btn" data-view="history">📖</button>
          <button class="nav-btn active" data-view="stats">📊</button>
        </nav>
      </div>`;
    app.querySelector('.btn-back')?.addEventListener('click', () => this.renderDiscover(app));
    app.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.renderView(btn.dataset.view, app));
    });
  }

  _getPersonaBadge() {
    const liked = this.history.filter(h => h.action === 'like');
    if (liked.length < 3) return this.lang === 'de' ? 'Neuling' : 'Newcomer';
    const genres = {};
    liked.forEach(h => (h.genres || []).forEach(g => {
      const name = typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g);
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
      const name = typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g);
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
      const genres = (h.genres || []).map(g => (TMDB_GENRE_MAP[g] || '').toLowerCase());
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
      const name = typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g);
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

window.app = new App();
