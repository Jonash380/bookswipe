import { escapeHTML, TMDB_GENRE_MAP, getTMDBGenreMap, safeGetJSON, safeSetJSON, getGenreIcon, createImageWithFallback } from './utils.js';
import { BOOK_GENRES, BOOK_MOODS } from './books.js';
import { MEDIA_GENRES, MEDIA_MOODS } from './media.js';
import { GAME_GENRES, GAME_MOODS } from './games.js';
import { fetchBooks, fetchUpcomingBooks, fetchUpcomingMedia, mapTmdbResult } from './api.js';
import { SwipeEngine } from './swipe.js';
import { LingerGesture } from './ling-gesture.js';
import { DeepDivePanel } from './deep-dive.js';
import { EnrichmentWorker } from './enrichment.js';
import { Recommender } from './recommender.js';
import { getTMDBVideos } from './tmdb.js';
import { mapMediaDNA } from './tag_mapper.js';
import { searchGames, fetchGamesForDiscovery, enrichGamesWithSteam } from './games_api.js';
import {
  migrateFromLocalStorage,
  getWatchlist, addToWatchlist, removeFromWatchlist,
  getDisliked, addToDisliked, removeFromDisliked,
  getHistory, addToHistory, removeLastHistory,
  getRecProfile, saveRecProfile,
  getUIState, setUIState,
  getFullWatchlist,
  // LIB-002: consumed (Library page) storage wiring
  getConsumed, addToConsumed, removeFromConsumed,
  updateConsumedRating, getAllConsumedIds, promoteToConsumed
} from './storage.js';
import { createAbortable, getErrorMessage, fetchDeduped } from './api-client.js';
import { showToast } from './toast.js';
import { ABTest } from './experiment.js';
import { LANG, WATCH_MODES, PERSONA_BADGES, STREAMING_PROVIDERS, CROSS_MEDIA_GENRES } from './i18n.js';
import { OnboardingMixin } from './onboarding.js';
import { GameUIMixin } from './game-ui.js';
import { ModalsMixin } from './modals.js';
import { DailyTop5, StreakTracker, STREAK_CONFETTI, localDateKey } from './retention.js';



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
      vibePacing: 50, vibeTone: 50, vibeComplex: 50,
      blockedGenres: [], boostedMoods: [], selectedPlatforms: [],
      moodTimeFilter: { active: false, mood: null, playtime: null },
      steamLibrary: { steamId: '', apiKey: '', imported: false, gameCount: 0, lastFetch: 0 }
    };
    this.watchlist = [];
    this.disliked = [];
    this.history = [];
    this.consumed = []; // LIB-002: Library page — items the user has already read/watched/played
    this.currentCards = [];
    this.currentCardIndex = 0;
    this.swipeEngine = null;
    this.enrichment = new EnrichmentWorker(this);
    this.recommender = new Recommender(this);
    this.experiment = new ABTest({ app: this });
    // Retention loops: Daily Top 5 + Streak tracker
    this.dailyTop5 = new DailyTop5(this);
    this.streak = new StreakTracker(this, { dailyGoal: this.state.dailyGoal || 5 });
    this.streak.onMilestone = (milestone, payload) => this._fireStreakMilestone(milestone, payload);
    this.streak.onGoalReached = (payload) => this._onDailyGoalReached(payload);
    this.streak.onStreakUpdated = () => this._updateStreakPill();
    this.dailyTop5.onRefresh = (payload) => this._onDailyTop5Refreshed(payload);
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
    // URL params override localStorage state for shareable links
    this._applyURLFilters();
    this.tr = LANG[this.lang] || LANG.de;
    this._genreMap = getTMDBGenreMap(this.lang);
    this.watchlist = await getWatchlist();
    this.disliked = await getDisliked();
    this.history = await getHistory();
    this.consumed = await getConsumed(); // LIB-002: load Library consumed items alongside watchlist
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

  // ===== LIBRARY: consumed items (LIB-002) =====
  // Single canonical path for ALL add-consumed flows (modal, kebab promote,
  // quick-promote from want-to). Detects conflicts and prompts the user.
  // Returns one of:
  //   { status: 'added',     record }  — stored in `consumed` (and removed from watchlist if it was there)
  //   { status: 'moved',     record }  — was in watchlist, now moved to consumed
  //   { status: 'separate',  record }  — was in watchlist, added without moving
  //   { status: 'updated',   record }  — already-consumed item, rating was updated
  //   { status: 'already-exists' }      — already-consumed item, no update requested
  //   { status: 'invalid-rating' }      — rating was not an integer 1-5
  //   { status: 'invalid-args' }        — missing item or item.id
  //   { status: 'race-conflict' }       — promote failed and item is still in watchlist (caller should retry)
  async _addConsumedAtomic(item, rating, opts = {}) {
    if (!item || !item.id) {
      console.warn('[App] _addConsumedAtomic: missing item or id');
      return { status: 'invalid-args' };
    }
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      console.warn('[App] _addConsumedAtomic: rating must be integer 1-5, got', rating);
      showToast(this.lang === 'de' ? 'Bitte bewerte (1–5 Sterne)' : 'Please rate (1–5 stars)', { type: 'warning', duration: 2000 });
      return { status: 'invalid-rating' };
    }

    // 1. Already in consumed? — prompt to update rating (default on, opt-out via opts.skipDuplicatePrompt)
    const existingRecord = this.consumed.find(c => c.id === item.id);
    if (existingRecord) {
      const msg = this.lang === 'de' ? 'Bereits in deiner Bibliothek' : 'Already in your library';
      let wantUpdate = true;
      if (!opts.skipDuplicatePrompt) {
        const promptResult = await this._showConsumedConflictPrompt(item, { mode: 'duplicate' });
        wantUpdate = !!(promptResult && promptResult.choice === 'update');
      }
      if (wantUpdate) {
        // Capture the OLD rating BEFORE mutating this.consumed, so the recommender
        // can subtract the old contribution and add the new one.
        const oldRating = existingRecord.consumedRating;
        const updated = await updateConsumedRating(item.id, rating);
        if (updated) {
          this.consumed = this.consumed.map(c => c.id === item.id ? updated : c);
          if (oldRating !== rating) {
            // Two-step recommender update: subtract old signal, add new.
            // Pass a PRE-MUTATION snapshot (with the OLD consumedRating) so any
            // removeFromConsumed impl that reads item.consumedRating sees the right value.
            const oldSnapshot = { ...updated, consumedRating: oldRating };
            if (typeof this.recommender.removeFromConsumed === 'function') {
              this.recommender.removeFromConsumed(oldSnapshot, oldRating);
              this.recommender.updateFromConsumed(updated, rating);
            } else {
              // No subtract primitive — DO NOT call updateFromConsumed unconditionally
              // (it would double-count the item's contribution). Log and skip.
              console.warn('[App] Recommender has no removeFromConsumed; skipping taste-vector update for rating change', { id: item.id, oldRating, rating });
            }
          }
          showToast(`${msg} — ${this.lang === 'de' ? 'Bewertung aktualisiert' : 'rating updated'}`, { type: 'info', duration: 1800 });
          return { status: 'updated', record: updated };
        }
      }
      showToast(msg, { type: 'info', duration: 1800 });
      return { status: 'already-exists' };
    }

    // 2. In watchlist? — prompt user: move it (default) or add separately
    const inWatchlist = this.watchlist.some(w => w.id === item.id);
    if (inWatchlist) {
      const choice = await this._showConsumedConflictPrompt(item, { mode: 'conflict' });
      // Dismissed (Escape / click-outside / X) — user backed out, do NOT write anything.
      if (!choice) {
        return { status: 'dismissed' };
      }
      if (choice.choice === 'move') {
        const result = await promoteToConsumed(item.id, rating);
        if (result && result.moved && result.record) {
          this.consumed = [...this.consumed, result.record];
          this.watchlist = this.watchlist.filter(w => w.id !== item.id);
          this.recommender.updateFromConsumed(result.record, rating);
          const ok = this.lang === 'de' ? 'Beendet →' : 'Marked as consumed';
          showToast(`${ok}: ${item.title}`, { type: 'success', duration: 1800 });
          return { status: 'moved', record: result.record };
        }
        // promoteToConsumed returned moved:false. Do NOT fall back to addToConsumed
        // (that would put the item in BOTH stores, violating the single-bucket invariant).
        // Re-read stores to detect if a concurrent tab already completed the move.
        const refreshed = await getConsumed();
        const raced = refreshed.find(c => c.id === item.id);
        if (raced) {
          this.consumed = refreshed;
          this.watchlist = this.watchlist.filter(w => w.id !== item.id);
          showToast(`${this.lang === 'de' ? 'Bereits erledigt' : 'Already done'}: ${item.title}`, { type: 'info', duration: 1800 });
          return { status: 'moved', record: raced };
        }
        console.warn('[App] promoteToConsumed failed and item not in consumed; refusing to dual-write');
        showToast(this.lang === 'de' ? 'Konflikt — bitte erneut versuchen' : 'Conflict — please retry', { type: 'warning', duration: 2000 });
        return { status: 'race-conflict' };
      }
      // 'separate' — user explicitly chose to keep the watchlist entry too
      if (choice.choice === 'separate') {
        await addToConsumed(item, rating, { promotedFromWatchlist: false });
        const record = { ...item, consumedRating: rating, consumedAt: Date.now(), promotedFromWatchlist: false };
        this.consumed = [...this.consumed, record];
        this.recommender.updateFromConsumed(record, rating);
        showToast(`${this.lang === 'de' ? 'Hinzugefügt' : 'Added'}: ${item.title}`, { type: 'success', duration: 1800 });
        return { status: 'separate', record };
      }
      // Unknown choice — treat as dismissed (defensive)
      return { status: 'dismissed' };
    }

    // 3. Not in either store — plain add
    await addToConsumed(item, rating, { promotedFromWatchlist: false });
    const record = { ...item, consumedRating: rating, consumedAt: Date.now(), promotedFromWatchlist: false };
    this.consumed = [...this.consumed, record];
    this.recommender.updateFromConsumed(record, rating);
    showToast(`${this.lang === 'de' ? 'Hinzugefügt' : 'Added'}: ${item.title}`, { type: 'success', duration: 1800 });
    return { status: 'added', record };
  }

  /**
   * Show a small inline modal for the "item in both watchlist and consumed" conflict.
   * Resolves to { choice: 'move' | 'separate' | 'update' | null }.
   * - null is returned if the user dismisses (Escape, click-outside, X).
   * - 'move' is the default — focused first and on Enter.
   *
   * Modes:
   *   mode: 'conflict'  — item is in watchlist but not consumed → "Move it" / "Add separately"
   *   mode: 'duplicate' — item is already in consumed → "Update rating" / "Cancel"
   */
  _showConsumedConflictPrompt(item, opts = {}) {
    return new Promise((resolve) => {
      const mode = opts.mode || 'conflict';
      const existing = document.querySelector('.consumed-conflict-overlay');
      if (existing) existing.remove();

      const de = this.lang === 'de';
      let title, body, primaryLabel, secondaryLabel, primaryChoice, secondaryChoice;
      if (mode === 'duplicate') {
        title = de ? 'Bereits in deiner Bibliothek' : 'Already in your library';
        body = de
          ? `„${item.title}“ ist bereits als gesehen markiert. Bewertung aktualisieren?`
          : `"${item.title}" is already in your library. Update its rating?`;
        primaryLabel = de ? '✓ Bewertung aktualisieren' : '✓ Update rating';
        secondaryLabel = de ? 'Abbrechen' : 'Cancel';
        primaryChoice = 'update';
        secondaryChoice = null;
      } else {
        title = de ? 'Bereits auf deiner Merkliste' : 'Already on your Want to list';
        body = de
          ? `„${item.title}“ ist in deiner Merkliste. Als gesehen markieren (verschiebt es) oder separat hinzufügen?`
          : `"${item.title}" is on your Want to list. Mark as consumed (moves it) or add separately?`;
        primaryLabel = de ? '→ Verschieben' : '→ Move it';
        secondaryLabel = de ? 'Separat hinzufügen' : 'Add separately';
        primaryChoice = 'move';
        secondaryChoice = 'separate';
      }

      const overlay = document.createElement('div');
      overlay.className = 'consumed-conflict-overlay';
      overlay._resolved = false; // double-click guard (review #4)
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', title);
      overlay.innerHTML = `
        <div class="consumed-conflict-modal">
          <h3 class="consumed-conflict-title">${escapeHTML(title)}</h3>
          <p class="consumed-conflict-body">${escapeHTML(body)}</p>
          <div class="consumed-conflict-actions">
            <button class="btn btn-secondary consumed-conflict-secondary" type="button">${escapeHTML(secondaryLabel)}</button>
            <button class="btn btn-primary consumed-conflict-primary" type="button" autofocus>${escapeHTML(primaryLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('open'));

      const cleanup = (result) => {
        if (overlay._resolved) return; // idempotent
        overlay._resolved = true;
        overlay.classList.remove('open');
        setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 200);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') cleanup(null);
        else if (e.key === 'Enter') cleanup({ choice: primaryChoice });
      };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
      overlay.querySelector('.consumed-conflict-primary')?.addEventListener('click', () => cleanup({ choice: primaryChoice }));
      overlay.querySelector('.consumed-conflict-secondary')?.addEventListener('click', () => cleanup({ choice: secondaryChoice }));
    });
  }

  // ===== LIBRARY PAGE (LIB-003) =====
  // Combined "Want to" + "Consumed" view. Purely view-local state
  // (active tab + active media-type filter) lives on the instance so it
  // survives re-renders within the same session but never persists to
  // the user-profile state. Data always comes from this.watchlist and
  // this.consumed, which are populated in _loadState() (LIB-002).
  renderLibrary(app) {
    const de = this.lang === 'de';
    const activeTab = this._libraryActiveTab || 'want';
    const activeMediaType = this._libraryActiveMediaType || 'all';

    // Source items = active tab's full set. Filter applied below for the grid.
    const sourceItems = activeTab === 'consumed' ? this.consumed : this.watchlist;

    // Per-chip counts reflect the ACTIVE TAB's set, so the numbers on the
    // chips always match what the user will see when they click that chip
    // (e.g. switching Want->Consumed recomputes the chip counts).
    const mtCounts = { all: 0, movies: 0, tv: 0, books: 0, games: 0 };
    sourceItems.forEach(it => { mtCounts.all++; const m = this._mediaTypeOf(it); mtCounts[m] = (mtCounts[m] || 0) + 1; });
    const wantCount = this.watchlist.length;
    const consumedCount = this.consumed.length;

    // Apply the active media-type filter for the grid render
    const items = activeMediaType === 'all'
      ? sourceItems
      : sourceItems.filter(it => this._mediaTypeOf(it) === activeMediaType);

    const statusTabs = `
      <div class="status-tabs" role="tablist">
        <button class="status-tab ${activeTab === 'want' ? 'active' : ''}" data-tab="want" role="tab" aria-selected="${activeTab === 'want'}">
          ${this.tr.wantTo} <span class="status-tab-count">${wantCount}</span>
        </button>
        <button class="status-tab ${activeTab === 'consumed' ? 'active' : ''}" data-tab="consumed" role="tab" aria-selected="${activeTab === 'consumed'}">
          ${this.tr.consumed} <span class="status-tab-count">${consumedCount}</span>
        </button>
      </div>`;

    const mediaTypeChips = `
      <div class="media-type-chips" role="tablist" aria-label="${de ? 'Medientyp' : 'Media type'}"  // no i18n key needed>
        ${[
          { id: 'all',    label: de ? 'Alle'    : 'All',    icon: '✨' },  // no i18n key needed
          { id: 'movies', label: de ? 'Filme'   : 'Movies', icon: '🎬' },  // no i18n key needed
          { id: 'tv',     label: de ? 'Serien'  : 'TV',     icon: '📺' },  // no i18n key needed
          { id: 'books',  label: de ? 'Bücher'  : 'Books',  icon: '📚' },  // no i18n key needed
          { id: 'games',  label: de ? 'Spiele'  : 'Games',  icon: '🎮' },  // no i18n key needed
        ].map(m => `<button class="mt-chip ${activeMediaType === m.id ? 'active' : ''}" data-mt="${m.id}" role="tab" aria-selected="${activeMediaType === m.id}">${m.icon} ${m.label} <span class="mt-chip-count">${mtCounts[m.id] || 0}</span></button>`).join('')}
      </div>`;

    const cardGrid = items.length === 0
      ? this._libraryEmptyState(activeTab)
      : `<div class="library-card-grid">${items.map(it => this._renderLibraryCard(it, activeTab)).join('')}</div>`;

    // Bottom CTA is tab-aware: 'add to library' only makes sense on the Want tab.
    // On the Consumed tab, the first button is a placeholder for the future
    // 'find similar' / 're-rate' action wired by LIB-005/006.
    const primaryCta = activeTab === 'want'
      ? `<button class="btn btn-primary library-add-btn" data-action="library-add">+ ${this.tr.addConsumed}</button>`
      : `<button class="btn btn-primary library-rate-btn" data-action="library-rate" title="${de ? 'Bald verfügbar' : 'Coming soon'}">${de ? 'Bewertung anpassen' : 'Adjust rating'}  // no i18n key (LIB-006)</button>`;
    const bottomCTA = `
      <div class="library-bottom-cta">
        ${primaryCta}
        <button class="btn btn-secondary library-export-btn" data-action="library-export">${de ? 'Exportieren' : 'Export'}  // no i18n key (LIB-008)</button>
      </div>`;

    app.innerHTML = `
      <div class="library-page">
        <header class="library-header">
          <h1 class="library-title">📚 ${this.tr.library}</h1>
          <div class="library-stats">
            <span class="library-stat">${this.tr.wantTo}: <strong>${wantCount}</strong></span>
            <span class="library-stat-sep">·</span>
            <span class="library-stat">${this.tr.consumed}: <strong>${consumedCount}</strong></span>
          </div>
        </header>
        ${statusTabs}
        ${mediaTypeChips}
        ${cardGrid}
        ${bottomCTA}
        ${this._navHTML('library')}
      </div>`;

    this._bindLibraryEvents(app);
    this._bindNav(app);
  }

  _libraryEmptyState(activeTab) {
    const de = this.lang === 'de';
    if (activeTab === 'consumed') {
      return `<div class="empty-state library-empty">
        <span class="empty-state-icon">✅</span>
        <h2>${de ? 'Noch nichts als gesehen markiert' : 'Nothing marked as consumed yet'}</h2>  // no i18n key (descriptive)
        <p>${de ? 'Markiere Filme, Serien, Bücher oder Spiele, die du bereits beendet hast — so bekommen wir bessere Empfehlungen.' : 'Mark movies, shows, books, or games you have finished — we use this to improve recommendations.'}  // no i18n key (descriptive)</p>
      </div>`;
    }
    return `<div class="empty-state library-empty">
      <span class="empty-state-icon">📚</span>
      <h2>${de ? 'Deine Merkliste ist leer' : 'Your Want-to list is empty'}</h2>  // no i18n key (descriptive)
      <p>${de ? 'Wische rechts, um Dinge zu speichern, die dich interessieren.' : 'Swipe right to save things that catch your eye.'}  // no i18n key (descriptive)</p>
      <button class="btn btn-primary" data-nav="discover">${this.tr.discover}</button>
    </div>`;
  }

  _renderLibraryCard(item, activeTab) {
    const de = this.lang === 'de';
    const isConsumed = activeTab === 'consumed';
    const rating = isConsumed && item.consumedRating
      ? `<span class="library-card-rating library-card-rating--readonly" role="img" aria-label="${de ? 'Deine Bewertung' : 'Your rating'}: ${item.consumedRating} ${de ? 'von 5 Sternen' : 'of 5 stars'}  // no i18n key (template literal)>${'★'.repeat(item.consumedRating)}${'☆'.repeat(5 - item.consumedRating)}</span>`
      : '';
    const mt = this._mediaTypeOf(item);
    const mtIcon = { movies: '🎬', tv: '📺', books: '📚', games: '🎮' }[mt] || '✨';
    return `
      <div class="library-card" data-id="${escapeHTML(item.id)}">
        ${createImageWithFallback(item.cover || item.backdrop, item.title, 'library-card-cover', mtIcon)}
        <div class="library-card-info">
          <h3 class="library-card-title">${escapeHTML(item.title)}</h3>
          <div class="library-card-meta">
            ${item.year ? `<span class="library-card-year">${item.year}</span>` : ''}
            <span class="library-card-mt" title="${mt}">${mtIcon}</span>
            ${rating}
          </div>
        </div>
        <button class="library-card-kebab" data-action="library-kebab" data-id="${escapeHTML(item.id)}" aria-label="${de ? 'Aktionen' : 'Actions'}">⋮</button>  // no i18n key (LIB-005)
      </div>`;
  }

  _mediaTypeOf(item) {
    if (!item) return 'movies';
    // Accept both 'type' and 'media_type' fields; map to plural form to match chip IDs.
    const t = (item.type || item.media_type || '').toLowerCase();
    if (t === 'movie' || t === 'movies') return 'movies';
    if (t === 'tv') return 'tv';
    if (t === 'book' || t === 'books') return 'books';
    if (t === 'game' || t === 'games') return 'games';
    if (item.source === 'openlibrary' || item.source === 'gbooks') return 'books';
    if (item.source === 'igdb' || item.source === 'steam') return 'games';
    return this.state?.mediaType || 'movies';
  }

  _bindLibraryEvents(app) {
    const de = this.lang === 'de';
    app.querySelectorAll('.status-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._libraryActiveTab = tab.dataset.tab;
        this.renderLibrary(app);
      });
    });
    app.querySelectorAll('.mt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this._libraryActiveMediaType = chip.dataset.mt;
        this.renderLibrary(app);
      });
    });
    app.querySelector('[data-nav="discover"]')?.addEventListener('click', () => {
      this.renderView('discover', app);
    });
    // Add-consumed modal (LIB-006) + Kebab menu (LIB-005) are separate tickets.
    // Stub them with an info toast so the buttons are visibly wired but the
    // implementation lives in the appropriate follow-up.
    app.querySelector('[data-action="library-add"]')?.addEventListener('click', () => {
      showToast(de ? '🔍 Suche folgt in LIB-006' : '🔍 Search arrives in LIB-006', { type: 'info', duration: 1800 });  // no i18n key (placeholder)
    });
    app.querySelector('[data-action="library-rate"]')?.addEventListener('click', () => {
      showToast(de ? 'Bewertung anpassen folgt in LIB-006' : 'Adjust rating arrives in LIB-006', { type: 'info', duration: 1800 });  // no i18n key (placeholder)
    });
    app.querySelector('[data-action="library-export"]')?.addEventListener('click', () => {
      showToast(de ? '📤 Export folgt in LIB-008' : '📤 Export arrives in LIB-008', { type: 'info', duration: 1800 });  // no i18n key (placeholder)
    });
    // LIB-005: Kebab menu opens a dropdown with tab-aware actions.
    // The active tab is read from this._libraryActiveTab at click time
    // (NOT at bind time, so tab switches re-use the same listeners).
    app.querySelectorAll('[data-action="library-kebab"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.id;
        const item = (this._libraryActiveTab === 'consumed' ? this.consumed : this.watchlist).find(i => i.id === itemId);
        if (!item) return;
        this._openLibraryKebabMenu(btn, item, this._libraryActiveTab || 'want');
      });
    });
  }
  // ===== LIBRARY KEBAB MENU (LIB-005) =====
  // Opens a dropdown menu next to the kebab button with tab-aware actions.
  // On the Want tab: [Remove from library, Move to consumed]
  // On the Consumed tab: [Remove from library, Move to want]
  // The menu closes on outside click, Escape, or after an action.
  _openLibraryKebabMenu(btn, item, activeTab) {
    this._closeLibraryKebabMenu(); // close any existing menu first
    const de = this.lang === 'de';
    const isConsumed = activeTab === 'consumed';
    // Build the dropdown menu
    const menu = document.createElement('div');
    menu.className = 'library-kebab-menu';
    menu.setAttribute('role', 'menu');
    menu.dataset.itemId = item.id;
    const moveAction = isConsumed
      ? { action: 'move-to-want',     label: de ? 'Auf Merkliste setzen' : 'Move to Want',     icon: '←' }  // no i18n key
      : { action: 'move-to-consumed', label: de ? 'Als gesehen markieren' : 'Mark as consumed', icon: '→' };  // no i18n key
    menu.innerHTML = `
      <button class="library-kebab-item" role="menuitem" data-kebab-action="remove">
        <span class="library-kebab-icon">🗑</span>
        <span>${de ? 'Aus Bibliothek entfernen' : 'Remove from library'}</span>
      </button>
      <button class="library-kebab-item" role="menuitem" data-kebab-action="${moveAction.action}">
        <span class="library-kebab-icon">${moveAction.icon}</span>
        <span>${moveAction.label}</span>
      </button>
    `;
    // Position the menu next to the kebab button
    document.body.appendChild(menu);
    const rect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 4;
    // Prefer right-aligned to the kebab; fall back to left-aligned if it would overflow
    let left = rect.right + window.scrollX - menuRect.width;
    if (left < 8) left = rect.left + window.scrollX;
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.classList.add('open');
    // Wire up menu item clicks
    menu.querySelectorAll('[data-kebab-action]').forEach(itemBtn => {
      itemBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = itemBtn.dataset.kebabAction;
        this._closeLibraryKebabMenu();
        this._handleLibraryKebabAction(action, item, activeTab);
      });
    });
    // Close on outside click (capture phase so it fires before the kebab reopens)
    setTimeout(() => {
      document.addEventListener('click', this._onKebabOutsideClick = () => this._closeLibraryKebabMenu(), { capture: true, once: true });
      document.addEventListener('keydown', this._onKebabEscape = (e) => {
        if (e.key === 'Escape') {
          this._closeLibraryKebabMenu();
          document.removeEventListener('keydown', this._onKebabEscape);
        }
      });
    }, 0);
  }

  _closeLibraryKebabMenu() {
    document.querySelectorAll('.library-kebab-menu.open').forEach(m => m.remove());
    if (this._onKebabOutsideClick) {
      document.removeEventListener('click', this._onKebabOutsideClick, { capture: true });
      this._onKebabOutsideClick = null;
    }
    if (this._onKebabEscape) {
      document.removeEventListener('keydown', this._onKebabEscape);
      this._onKebabEscape = null;
    }
  }

  // Dispatcher for the 3 kebab actions. Each one updates the in-memory
  // store, persists to IndexedDB, and re-renders the library view.
  async _handleLibraryKebabAction(action, item, activeTab) {
    const de = this.lang === 'de';
    try {
      if (action === 'remove') {
        if (activeTab === 'consumed') {
          await removeFromConsumed(item.id);
          this.consumed = this.consumed.filter(i => i.id !== item.id);
        } else {
          await removeFromWatchlist(item.id);
          this.watchlist = this.watchlist.filter(i => i.id !== item.id);
        }
        // Invalidate the taste vector cache: the history changed, so previously
        // scored cards (and the current deck) need to be re-scored next render.
        // When removing from CONSUMED, do a targeted subtraction using the
        // original rating (this is the inverse of updateFromConsumed — much
        // cheaper than a full clear() because it only touches this item's
        // entity weights, not the entire score cache or taste vector).
        // For watchlist removals (undo-like flow), clear() is the only option
        // since the item was never registered via updateFromConsumed.
        if (activeTab === 'consumed') {
          this.recommender.removeFromConsumed(item, item.consumedRating);
        } else {
          this.recommender.clear();
        }
        showToast(de ? '✓ Entfernt' : '✓ Removed', { type: 'success', duration: 1500 });
      } else if (action === 'move-to-consumed') {
        // Show a rating prompt, then call _addConsumedAtomic (which handles
        // the duplicate/conflict case via _showConsumedConflictPrompt).
        const rating = await this._showRatingPrompt(item);
        if (rating == null) return; // user cancelled
        const result = await this._addConsumedAtomic(item, rating, { skipDuplicatePrompt: false });
        if (result && result.status === 'moved') {
          // Item was in watchlist, now in consumed — refresh both stores
          this.watchlist = this.watchlist.filter(i => i.id !== item.id);
          this.consumed = await getConsumed();
          showToast(de ? '✓ Als gesehen markiert' : '✓ Marked as consumed', { type: 'success', duration: 1500 });
        } else if (result && result.status === 'updated') {
          this.consumed = await getConsumed();
          showToast(de ? '✓ Bewertung aktualisiert' : '✓ Rating updated', { type: 'success', duration: 1500 });
        } else if (result && result.status === 'dismissed') {
          // user dismissed the conflict prompt; do nothing
        } else {
          showToast(de ? '⚠ Aktion fehlgeschlagen' : '⚠ Action failed', { type: 'warning', duration: 1800 });
        }
      } else if (action === 'move-to-want') {
        // Move from consumed to watchlist: delete from consumed, add to watchlist,
        // and re-feed the recommender's like signal so the next scoring reflects
        // the move (the recommender tracks watchlist items via updateFromSwipe).
        await removeFromConsumed(item.id);
        await addToWatchlist({ ...item, consumedRating: undefined, consumedAt: undefined, promotedFromWatchlist: undefined });
        this.consumed = this.consumed.filter(i => i.id !== item.id);
        this.watchlist = await getWatchlist();
        this.recommender.updateFromSwipe(item, 'like');
        showToast(de ? '✓ Auf Merkliste gesetzt' : '✓ Moved to Want', { type: 'success', duration: 1500 });
      }
      // Re-render the library view (this is safe even if we switched tabs)
      const app = document.getElementById('app');
      if (app) this.renderLibrary(app);
    } catch (e) {
      console.warn('[App] _handleLibraryKebabAction failed:', e);
      showToast(de ? '⚠ Fehler' : '⚠ Error', { type: 'error', duration: 1800 });
    }
  }

  // Simple 1–5 star rating prompt. Returns the chosen rating (1-5) or null if cancelled.
  // Rendered as a small modal overlay; closes on backdrop click, Escape, or Cancel.
  _showRatingPrompt(item) {
    const de = this.lang === 'de';
    return new Promise((resolve) => {
      // Close any existing rating prompt
      document.querySelectorAll('.library-rating-prompt').forEach(el => el.remove());
      const overlay = document.createElement('div');
      overlay.className = 'library-rating-prompt';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', de ? 'Bewertung abgeben' : 'Rate this');
      overlay.innerHTML = `
        <div class="library-rating-prompt-card">
          <h3>${de ? 'Wie fandest du es?' : 'How did you like it?'}</h3>
          <p class="library-rating-prompt-title">${escapeHTML(item.title || '')}</p>
          <div class="library-rating-stars" role="radiogroup" aria-label="${de ? 'Sterne' : 'Stars'}">
            ${[1, 2, 3, 4, 5].map(n => `<button class="library-rating-star" data-rating="${n}" role="radio" aria-label="${n} ${de ? 'Sterne' : 'stars'}">☆</button>`).join('')}
          </div>
          <div class="library-rating-actions">
            <button class="btn btn-secondary library-rating-cancel">${de ? 'Abbrechen' : 'Cancel'}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey);
      // Backdrop click closes with null
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
      // Cancel button
      overlay.querySelector('.library-rating-cancel').addEventListener('click', () => close(null));
      // Star buttons
      overlay.querySelectorAll('.library-rating-star').forEach((star, idx) => {
        star.addEventListener('mouseenter', () => {
          // preview fill
          overlay.querySelectorAll('.library-rating-star').forEach((s, i) => {
            s.textContent = i <= idx ? '★' : '☆';
          });
        });
        star.addEventListener('mouseleave', () => {
          overlay.querySelectorAll('.library-rating-star').forEach(s => { s.textContent = '☆'; });
        });
        star.addEventListener('click', () => close(Number(star.dataset.rating)));
      });
    });
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
    // Invalidate recommender taste vector cache since history changed
    this.recommender.clear();
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

  // Onboarding methods are in onboarding.js (mixed in via Object.assign)
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
      const consumedIds = new Set((this.consumed || []).map(c => c.id));  // LIB-011: dedup consumed
      let filtered = items.filter(i => !watchIds.has(i.id) && !dislikedIds.has(i.id) && !consumedIds.has(i.id));

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
  // Helper: returns the hero (cover, overlay, match badge) section of a card
  _renderHero(card, isGame, isBook, coverStyle) {
    return `
        <div class="card-hero">
          ${card.backdrop || card.cover
            ? `<img class="card-cover" loading="lazy" style="${coverStyle}" src="${escapeHTML(card.backdrop || card.cover)}" alt="${escapeHTML(card.title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <div class="card-cover placeholder" ${card.backdrop || card.cover ? 'style="display:none"' : ''}>${isGame ? '🎮' : isBook ? '📚' : '🎬'}</div>
          <div class="card-hero-overlay"></div>
          ${card._score != null ? `<span class="card-match-badge">${Math.round(card._score * 100)}%</span>` : ''}
          ${card.isUpcoming ? `<span class="upcoming-badge is-upcoming\">${this.tr.upcoming}</span>` : card.releaseDate ? `<span class="upcoming-badge just-released\">${this.tr.justReleased}</span>` : ''}
        </div>`;
  }

  // Helper: returns the info side (title, meta, genres, overview) section of a card
  _renderSide(card, isBlind, isBlindGame, t, genreStr, wildcardHook, wildcardBridge) {
    return `
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
        </div>`;
  }

  // Helper: returns the game-specific badges (platform, playtime, steam, etc.)
  _renderGameExtras(card) {
    if (card.type !== 'game' && card.source !== 'igdb') return '';
    const inLibrary = this._isInLibrary(card) ? `<div class="in-library-badge">🎮 ${this.tr.inLibrary}</div>` : '';
    const badges = `
              <div class="game-card-badges">
                ${this._renderPlatformBadges(card)}
                ${this._renderPlaytimeBadge(card)}
                ${this._renderMultiplayerBadge(card)}
                ${this._renderMetacriticBadge(card)}
              </div>
              <div class="game-card-steam">
                ${this._renderSteamTags(card)}
                ${this._renderPriceBadge(card)}
                ${this._renderReviewBadge(card)}
              </div>
              ${this._renderStoreButtons(card)}`;
    return inLibrary + badges;
  }

  // Helper: returns the blind-date overlay (wildcard badge, traits, tropes, etc.)
  _renderBlindDate(card, isBlind, isBlindGame, dnaTags, wildcard, wildcardHook, wildcardMood, wildcardPacing, wildcardTropes) {
    if (!isBlind) return '';
    if (isBlindGame) {
      return `
            <div class="blind-game-overlay">
              <div class="blind-game-mechanics">${this._getBlindGameMechanics(card)}</div>
              <p class="blind-game-hook">${escapeHTML(this._getBlindGameHook(card))}</p>
              <div class="blind-game-meta">
                ${this._renderPlaytimeBadge(card)}
                ${this._renderPlatformBadges(card)}
              </div>
            </div>`;
    }
    if (wildcard) {
      return `
            <div class="wildcard-badge">🎲 ${this.lang === 'de' ? 'Wildcard' : 'Wildcard'}</div>
            <div class="blind-tags wildcard-traits">
              <span class="blind-tag wildcard-mood">🎭 ${escapeHTML(wildcardMood)}</span>
              <span class="blind-tag wildcard-pacing">⏱ ${escapeHTML(wildcardPacing)}</span>
            </div>
            ${wildcardTropes.length ? `<div class="blind-tags">${wildcardTropes.map(t => `<span class="blind-tag">${escapeHTML(t)}</span>`).join('')}</div>` : ''}`;
    }
    if (dnaTags.length) {
      return `
            <div class="blind-tags">${dnaTags.map(t => `<span class="blind-tag">${escapeHTML(t)}</span>`).join('')}</div>`;
    }
    return '';
  }

  // Helper: returns the keyboard hint bar (shown briefly on first render)
  _renderKeyboardHints() {
    const de = this.lang === 'de';
    return `
      <div class="keyboard-hints" id="keyboard-hints" aria-hidden="true">
        <div class="key-hint"><kbd>←</kbd> ${de ? 'Nein' : 'Nope'}</div>
        <div class="key-hint"><kbd>→</kbd> ${de ? 'Ja' : 'Yes'}</div>
        <div class="key-hint"><kbd>↑</kbd> ${de ? 'Später' : 'Skip'}</div>
        <div class="key-hint"><kbd>I</kbd> ${de ? 'Info' : 'Info'}</div>
        <div class="key-hint"><kbd>Z</kbd> ${de ? 'Undo' : 'Undo'}</div>
      </div>`;
  }

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
    this._currentWildcard = wildcard; // store for card modal access

    const dnaTags = wildcardTropes.length ? wildcardTropes : this._getCardDNATags(card);
    const coverStyle = isBlind ? 'filter:blur(20px);transform:scale(1.1);' : '';
    let cardClass = 'card';
    if (isBlind) cardClass += ' blind-date-card';
    if (isBook) cardClass += ' book-card';
    if (isGame) cardClass += ' game-card';
    if (isBlindGame) cardClass += ' blind-date-game';

    const platformBadges = isGame ? this._renderPlatformBadges(card) : '';

    app.innerHTML = `
      <div class="discover">
        <div class="discover-header">
          <button class="search-toggle" data-action="search" aria-label="${this.tr.search}">🔍</button>
          <span class="card-count-badge">${this.t('cardCount', `${this.currentCardIndex + 1}/${this.currentCards.length}`)}</span>
          ${this._renderStreakPill()}
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
            ${this._renderHero(card, isGame, isBook, coverStyle)}
            ${this._renderSide(card, isBlind, isBlindGame, t, genreStr, wildcardHook, wildcardBridge)}
            ${this._renderBlindDate(card, isBlind, isBlindGame, dnaTags, wildcard, wildcardHook, wildcardMood, wildcardPacing, wildcardTropes)}
            ${this._renderGameExtras(card)}
            <div class="linger-preview"></div>
            <span class="swipe-stamp swipe-stamp-like">${this.tr.like}</span>
            <span class="swipe-stamp swipe-stamp-nope">${this.tr.nope}</span>
            <span class="swipe-hint swipe-hint-like">${this.tr.like}</span>
            <span class="swipe-hint swipe-hint-nope">${this.tr.nope}</span>
            <span class="swipe-hint swipe-hint-super">★ Super</span>
            <button class="card-info-btn" data-action="info" aria-label="${this.tr.whySeeing}">ℹ️</button>
          </div>
        </div>
        ${this._renderKeyboardHints()}
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
      // Collapsible nav: hide bottom nav on swipe start, show on idle
      let navIdleTimer = null;
      const showNav = () => {
        document.body.classList.remove('swipe-active');
        if (navIdleTimer) { clearTimeout(navIdleTimer); navIdleTimer = null; }
      };
      const queueNavHide = () => {
        showNav();
        navIdleTimer = setTimeout(() => document.body.classList.add('swipe-active'), 1500);
      };
      queueNavHide();
      this._cardCleanupFns.push(() => {
        if (navIdleTimer) clearTimeout(navIdleTimer);
        showNav();
      });
      // Inject a small floating "handle" that taps reveal the chrome when hidden
      if (!document.querySelector('.chrome-handle')) {
        const handle = document.createElement('button');
        handle.className = 'chrome-handle';
        handle.setAttribute('aria-label', this.tr.discover || 'Discover');
        // Exclude from keyboard tab order — the handle is a 4px-wide
        // invisible affordance, not a real focusable target.
        handle.setAttribute('tabindex', '-1');
        document.body.appendChild(handle);
        const onHandle = () => {
          if (navIdleTimer) clearTimeout(navIdleTimer);
          showNav();
          navIdleTimer = setTimeout(() => document.body.classList.add('swipe-active'), 1500);
        };
        handle.addEventListener('click', onHandle);
        this._cardCleanupFns.push(() => {
          handle.removeEventListener('click', onHandle);
          if (handle.parentNode) handle.parentNode.removeChild(handle);
        });
      }
      this.swipeEngine = new SwipeEngine(
        cardEl,
        dir => { showNav(); this.handleSwipe(dir); },
        () => this._openDeepDive(card)
      );
      // Also hide on card touch/mousedown
      const onCardDown = () => document.body.classList.add('swipe-active');
      cardEl.addEventListener('mousedown', onCardDown);
      cardEl.addEventListener('touchstart', onCardDown, { passive: true });
      this._cardCleanupFns.push(() => {
        cardEl.removeEventListener('mousedown', onCardDown);
        cardEl.removeEventListener('touchstart', onCardDown);
      });
      // Wire the streak pill: desktop hover shows the dropdown; pill click
      // opens the overlay directly. On touch, first tap toggles the dropdown
      // (no hover available), and dropdown items handle the actions.
      const wrapper = app.querySelector('.streak-pill-wrapper');
      const pill = app.querySelector('[data-action="open-streak"]');
      if (pill && wrapper) {
        const dropdown = wrapper.querySelector('[data-streak-dropdown]');
        let touchOpened = false;
        // Touch: first tap opens dropdown, second tap opens overlay
        const onTouch = (e) => {
          if (dropdown && !touchOpened) {
            e.preventDefault();
            touchOpened = true;
            dropdown.classList.add('open');
          }
        };
        wrapper.addEventListener('touchstart', onTouch, { passive: false });
        this._cardCleanupFns.push(() => wrapper.removeEventListener('touchstart', onTouch));
        // Click: always open the overlay (on desktop, hover already showed dropdown)
        const onPill = (e) => {
          e.stopPropagation();
          if (dropdown) dropdown.classList.remove('open');
          this._showDailyTop5(app);
        };
        pill.addEventListener('click', onPill);
        this._cardCleanupFns.push(() => pill.removeEventListener('click', onPill));
        // Close dropdown on outside tap
        const closeDropdown = () => {
          if (dropdown) { dropdown.classList.remove('open'); touchOpened = false; }
        };
        document.addEventListener('click', closeDropdown);
        this._cardCleanupFns.push(() => document.removeEventListener('click', closeDropdown));
      }
      const viewTop5 = app.querySelector('[data-action="view-top5"]');
      if (viewTop5) {
        const onTop5 = (e) => {
          e.stopPropagation();
          // Close dropdown before opening overlay
          const dd = app.querySelector('[data-streak-dropdown]');
          if (dd) dd.classList.remove('open');
          this._showDailyTop5(app);
        };
        viewTop5.addEventListener('click', onTop5);
        this._cardCleanupFns.push(() => viewTop5.removeEventListener('click', onTop5));
      }
      const restToday = app.querySelector('[data-action="rest-today"]');
      if (restToday) {
        const onRest = (e) => {
          e.stopPropagation();
          this.streak.skipToday();
          showToast(`😴 ${this.tr.streakSkipToday}`, { type: 'info', duration: 2000 });
          this._updateStreakPillRest();
        };
        restToday.addEventListener('click', onRest);
        this._cardCleanupFns.push(() => restToday.removeEventListener('click', onRest));
      }
      const qp = this._setupQuickPeek(cardEl, card);
      const ag = this._setupAmbientGlow(cardEl, card);
      const tl = this._setupTiltEffect(cardEl);
      const lp = this._setupLingerPreview(cardEl, card);
      if (qp) this._cardCleanupFns.push(qp);
      if (ag) this._cardCleanupFns.push(ag);
      if (tl && isGame) this._cardCleanupFns.push(tl);
      if (lp) this._cardCleanupFns.push(lp);
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

    // Linger preview is handled by LingerGesture in _setupLingerPreview
    // Prefetch trailer data for next cards in the stack
    this._prefetchNextCardMedia();
    // Early pre-fetch: if the user is within 3 cards of the end of the
    // current deck, warm the next refill batch in the background. This
    // makes the transition to the next batch feel instant (no spinner).
    // Fire exactly once per deck (exact match, not >=) to avoid re-triggering
    // on every re-render near the end.
    const remaining = this.currentCards.length - this.currentCardIndex;
    if (remaining === 3 && !this._pendingRefill && !this._refillPrefetchInFlight) {
      this._maybePrefetchRefill();
    }
  }

  // ===== LINGER PREVIEW (hold gesture → per-media-type preview) =====
  _setupLingerPreview(cardEl, card) {
    if (!cardEl) return null;
    const isGame = card.type === 'game' || card.source === 'igdb';
    const isBook = this.state.mediaType === 'books';
    const isTMDB = card.source === 'tmdb' || card.type === 'movie' || card.type === 'tv';

    const preview = cardEl.querySelector('.linger-preview');
    if (!preview) return null;

    let previewActive = false;
    if (!this._lingerHoldGen) this._lingerHoldGen = 0;

    const linger = new LingerGesture(cardEl, () => {
      if (this.swipeEngine?.isSwiping) return;
      if (document.querySelector('.deep-dive-panel')) return;
      if (previewActive) return;

      previewActive = true;
      this._lingerHoldGen++;
      const thisHold = this._lingerHoldGen;
      cardEl.classList.add('linger-active');
      if (navigator.vibrate) navigator.vibrate(15);

      this._buildLingerPreviewContent(card, preview, isGame, isBook, isTMDB, thisHold);
      preview.classList.add('active');
    }, {
      delay: 450,
      threshold: 8,
      enabled: () => !this.swipeEngine?.isSwiping && !document.querySelector('.deep-dive-panel')
    });

    const dismiss = () => {
      if (!previewActive) return;
      previewActive = false;
      cardEl.classList.remove('linger-active');
      preview.classList.remove('active');
      if (this._lingerScreenshotTimer) {
        clearInterval(this._lingerScreenshotTimer);
        this._lingerScreenshotTimer = null;
      }
      const iframe = preview.querySelector('iframe');
      if (iframe) iframe.src = '';
      setTimeout(() => { preview.innerHTML = ''; }, 300);
    };

    cardEl.addEventListener('touchend', dismiss, { passive: true });
    cardEl.addEventListener('touchcancel', dismiss, { passive: true });
    cardEl.addEventListener('mouseup', dismiss);
    cardEl.addEventListener('mouseleave', dismiss);

    const cleanup = () => {
      linger.destroy();
      dismiss();
      cardEl.removeEventListener('touchend', dismiss);
      cardEl.removeEventListener('touchcancel', dismiss);
      cardEl.removeEventListener('mouseup', dismiss);
      cardEl.removeEventListener('mouseleave', dismiss);
    };

    return cleanup;
  }

  _buildLingerPreviewContent(card, preview, isGame, isBook, isTMDB, holdGen) {
    if (isBook) {
      const cover = card.cover || '';
      const firstLine = card.overview ? card.overview.split('.').slice(0, 2).join('.') + '.' : '';
      preview.innerHTML = `
        <div class="linger-preview-book">
          <div class="book-flip-container">
            <div class="book-page book-page-front" style="background-image:url('${escapeHTML(cover)}')"></div>
            <div class="book-page book-page-back">
              <p class="book-page-text">${escapeHTML(firstLine)}</p>
            </div>
          </div>
        </div>`;
    } else if (isGame) {
      const screenshots = card.screenshots || [];
      if (screenshots.length > 0) {
        const slides = screenshots.slice(0, 5).map((s, i) => {
          const url = typeof s === 'string' ? s : s.url || s;
          return `<img class="linger-screenshot${i === 0 ? ' active' : ''}" src="${escapeHTML(url)}" alt="" loading="eager">`;
        }).join('');
        preview.innerHTML = `
          <div class="linger-preview-game">
            <div class="linger-screenshots">${slides}</div>
            <div class="linger-screenshot-dots">
              ${screenshots.slice(0, 5).map((_, i) => `<span class="linger-dot${i === 0 ? ' active' : ''}"></span>`).join('')}
            </div>
          </div>`;
        let idx = 0;
        const imgs = preview.querySelectorAll('.linger-screenshot');
        const dots = preview.querySelectorAll('.linger-dot');
        this._lingerScreenshotTimer = setInterval(() => {
          imgs[idx]?.classList.remove('active');
          dots[idx]?.classList.remove('active');
          idx = (idx + 1) % imgs.length;
          imgs[idx]?.classList.add('active');
          dots[idx]?.classList.add('active');
        }, 1800);
      } else {
        preview.innerHTML = `
          <div class="linger-preview-game">
            <div class="linger-screenshots">
              <img class="linger-screenshot active" src="${escapeHTML(card.cover || '')}" alt="">
            </div>
          </div>`;
      }
    } else if (isTMDB) {
      const tmdbId = card.tmdb_id || card.id;
      const mediaType = card.type === 'tv' ? 'tv' : 'movie';
      preview.innerHTML = `
        <div class="linger-preview-trailer">
          <div class="linger-trailer-loading"><span class="linger-spinner"></span></div>
        </div>`;
      getTMDBVideos(tmdbId, mediaType, this.lang).then(videos => {
        if (holdGen !== this._lingerHoldGen) return;
        if (videos.length > 0 && preview.classList.contains('active')) {
          const videoId = videos[0].id;
          preview.innerHTML = `
            <div class="linger-preview-trailer">
              <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3" allow="autoplay; encrypted-media" frameborder="0"></iframe>
            </div>`;
        } else if (preview.classList.contains('active')) {
          preview.innerHTML = `
            <div class="linger-preview-trailer">
              <div class="linger-no-trailer">🎬</div>
            </div>`;
        }
      }).catch(() => {
        if (holdGen !== this._lingerHoldGen) return;
        if (preview.classList.contains('active')) {
          preview.innerHTML = `
            <div class="linger-preview-trailer">
              <div class="linger-no-trailer">🎬</div>
            </div>`;
        }
      });
    }
  }

  _prefetchNextCardMedia() {
    if (this._lingerObserver) { this._lingerObserver.disconnect(); this._lingerObserver = null; }
    // The card stack is always in viewport once renderCards() has painted it,
    // so an IntersectionObserver fires immediately and disconnects — defeating
    // the purpose.  Instead, prefetch directly for the next 2 cards, deferring
    // the work to an idle callback so it doesn't block the swipe animation.
    const nextCards = this.currentCards.slice(this.currentCardIndex + 1, this.currentCardIndex + 3);
    const run = () => {
      nextCards.forEach(c => {
        const isTMDB = c.source === 'tmdb' || c.type === 'movie' || c.type === 'tv';
        if (isTMDB) {
          const tmdbId = c.tmdb_id || c.id;
          const mediaType = c.type === 'tv' ? 'tv' : 'movie';
          getTMDBVideos(tmdbId, mediaType, this.lang).catch(() => {});
        }
      });
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 50);
    }
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
    // Update streak counter (any swipe counts toward the daily goal)
    if (this.streak) this.streak.recordSwipe();

    // Re-score remaining cards with updated preferences
    if (this.recommender && (dir === 'right' || dir === 'left')) {
      this.currentCards = this.recommender.rescoreQueue(
        this.currentCards,
        this.currentCardIndex + 1,
        this.experiment.group
      );
    }

    this.currentCardIndex++;
    await this.save();
    const app = document.getElementById('app');
    if (this.currentCardIndex >= this.currentCards.length) {
      // Endless feed: never show empty state. Pre-fetched items win,
      // otherwise refill from local sources, otherwise fetch from a
      // rotated genre and re-render when it lands.
      this._refillOrFetch(app, () => this.renderCards(app));
    } else {
      this.renderCards(app);
    }
  }

  // ===== ENDLESS FEED: refill deck and kick off background pre-fetch =====
  // Strategy (always wins, never shows "seen it all"):
  //   1. Pre-fetched items (warmed in the background) are used first.
  //   2. Local sources (watchlist / history / cross-media) are a synchronous
  //      fallback so the user never sees a blank screen.
  //   3. If the local fallback is too small, fetch from a different genre
  //      ("genre rotation") and re-render when it lands.
  //   4. As the user is swiping the last few cards, _maybePrefetchRefill()
  //      warms the next batch in the background so step (1) almost always wins.
  _refillOrFetch(app, onReady) {
    // Step 1: use pre-fetched items if available and big enough.
    // Discard the batch if the user switched media type or filters
    // since the prefetch started — those items belong to a different
    // discovery context and would confuse the recommender.
    const pre = this._pendingRefill;
    if (pre && pre.items && pre.items.length >= 3) {
      if (this._isPendingRefillValid(pre)) {
        this.currentCards = pre.items;
        this.currentCardIndex = 0;
        this._pendingRefill = null;
        this._announceRefill();
        onReady();
        this._maybePrefetchRefill();
        return;
      }
      // Stale (mediaType or filters changed) — discard, don't waste the
      // in-flight pre-fetch's work
      this._pendingRefill = null;
    }
    // Step 2: synchronous local refill (watchlist + history + cross-media)
    const local = this._refillDeck();
    if (local.length >= 3) {
      this.currentCards = local;
      this.currentCardIndex = 0;
      this._announceRefill();
      onReady();
      this._maybePrefetchRefill();
      return;
    }
    // Step 3: too few local items — async fetch from a rotated genre
    this._fetchGenreRotation().then(items => {
      if (items && items.length >= 3) {
        this.currentCards = items;
        this.currentCardIndex = 0;
        this._announceRefill();
        onReady();
        this._maybePrefetchRefill();
      } else {
        // Last resort: keep the small local set so the user has *something*
        this.currentCards = local;
        this.currentCardIndex = 0;
        if (local.length) this._announceRefill();
        onReady();
      }
    }).catch(() => {
      this.currentCards = local;
      this.currentCardIndex = 0;
      if (local.length) this._announceRefill();
      onReady();
    });
  }

  _announceRefill() {
    // Debounce: avoid stacking toasts when the user rapidly burns through
    // multiple refills back-to-back. One toast every 2s is plenty.
    const now = Date.now();
    if (this._lastRefillAnnounceAt && now - this._lastRefillAnnounceAt < 2000) return;
    this._lastRefillAnnounceAt = now;
    const de = this.lang === 'de';
    showToast(de ? '🔄 Mische neu zusammen...' : '🔄 Mixing it up...', {
      type: 'info', duration: 1500,
    });
  }

  // Trigger a background fetch for the next refill batch. Safe to call
  // repeatedly; debounced by `_refillPrefetchInFlight` so we don't stampede
  // the API while the user is rapidly swiping.
  _maybePrefetchRefill() {
    if (this._refillPrefetchInFlight) return;
    this._refillPrefetchInFlight = true;
    const mediaTypeAtFetch = this.state.mediaType;
    const filtersHashAtFetch = this._filtersHash();
    this._fetchGenreRotation()
      .then(items => {
        this._pendingRefill = {
          items: items || [],
          mediaType: mediaTypeAtFetch,
          filtersHash: filtersHashAtFetch,
        };
      })
      .catch(() => { this._pendingRefill = null; })
      .finally(() => {
        // Stagger the next attempt so the prefetch stays fresh
        setTimeout(() => { this._refillPrefetchInFlight = false; }, 1500);
      });
  }

  // Quick hash of the current filter state so we can detect when a
  // pre-fetched batch was built against different filters than the
  // current session.
  _filtersHash() {
    const s = this.state;
    return [
      s.mediaType,
      (s.selectedGenres || []).join(','),
      (s.selectedMoods || []).join(','),
      s.releaseRadarMode ? 1 : 0,
    ].join('|');
  }

  // A pre-fetched batch is "valid" if the media type and filter hash
  // match the current session. Stale batches are discarded and a fresh
  // fetch is kicked off.
  _isPendingRefillValid(pre) {
    if (pre.mediaType !== this.state.mediaType) return false;
    if (pre.filtersHash !== this._filtersHash()) return false;
    return true;
  }

  // Fetch a batch of items from a genre the user isn't currently filtering on.
  // This is the "genre rotation" fallback: keeps the deck moving even when
  // the local sources (watchlist/history) are empty.
  async _fetchGenreRotation() {
    try {
      const currentGenres = (this.state.selectedGenres || []).map(g => String(g));
      let poolGenres = [];
      if (this.state.mediaType === 'books') {
        const { BOOK_GENRES } = await import('./books.js');
        poolGenres = (BOOK_GENRES[this.lang] || BOOK_GENRES.en).map(g => g.id);
      } else if (this.state.mediaType === 'games') {
        const { GAME_GENRES } = await import('./games.js');
        poolGenres = (GAME_GENRES[this.lang] || GAME_GENRES.en).map(g => g.id);
      } else {
        const mediaGenres = (MEDIA_GENRES[this.lang] || MEDIA_GENRES.en)[this.state.mediaType] || [];
        poolGenres = mediaGenres.map(g => g.id);
      }
      // Pick a genre that isn't currently selected (rotation = novelty)
      const candidates = poolGenres.filter(g => !currentGenres.includes(String(g)));
      const pickFrom = candidates.length ? candidates : poolGenres;
      const rotatedGenre = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      if (!rotatedGenre) return [];

      // Fetch using the same APIs as the main flow, with rotated genre only
      const savedGenres = this.state.selectedGenres;
      this.state.selectedGenres = [rotatedGenre];
      let items = [];
      try {
        if (this.state.mediaType === 'books') {
          const { fetchBooks } = await import('./api.js');
          items = await fetchBooks([rotatedGenre], this.state.selectedMoods, this.lang);
        } else if (this.state.mediaType === 'games') {
          const { fetchGamesForDiscovery, enrichGamesWithSteam } = await import('./games_api.js');
          const raw = await fetchGamesForDiscovery([rotatedGenre], this.state.selectedPlatforms || [], 30);
          items = await enrichGamesWithSteam(raw);
        } else {
          items = await this.fetchMedia();
        }
      } finally {
        this.state.selectedGenres = savedGenres; // always restore
      }

      const watchIds = new Set(this.watchlist.map(w => w.id));
      const dislikedIds = new Set(this.disliked.map(d => d.id));
      const currentIds = new Set(this.currentCards.map(c => c.id));
      const consumedIds = new Set((this.consumed || []).map(c => c.id));  // LIB-011: dedup consumed
      const filtered = (items || []).filter(i =>
        i && i.id && !watchIds.has(i.id) && !dislikedIds.has(i.id) && !currentIds.has(i.id) && !consumedIds.has(i.id)
      );
      // Tag with _refill so renderCards can show a subtle badge
      filtered.forEach(it => { it._refill = true; it._refillSource = 'genre-rotation'; });
      return filtered.slice(0, 12);
    } catch (e) {
      if (e && e.name !== 'AbortError') console.warn('genre rotation failed', e);
      return [];
    }
  }

  // ===== ENDLESS FEED: auto-refill the deck =====
  // Never show "seen it all" — always re-surface items from watchlist,
  // history, or different genres. Items are marked `_refill: true` so the
  // recommender treats them as exploration, not strong matches.
  _refillDeck() {
    const seen = new Set([
      ...this.watchlist.map(w => w.id),
      ...this.disliked.map(d => d.id),
      ...(this.consumed || []).map(c => c.id),  // LIB-011: dedup consumed
      ...this.currentCards.map(c => c.id),
      ]);
    const allMediaTypes = ['books', 'movies', 'tv', 'games'];
    const otherTypes = allMediaTypes.filter(t => t !== this.state.mediaType);

    // Source 1: Resurface watchlist items the user has saved (re-watch candidates)
    const fromWatchlist = this.watchlist
      .filter(w => !seen.has(w.id) || Math.random() < 0.3) // 30% chance to re-show already-seen
      .map(w => ({ ...w, _refill: true, _refillSource: 'watchlist' }));

    // Source 2: Resurface history items that weren't strong like/nope
    const fromHistory = (this.history || [])
      .filter(h => h && h.id && !seen.has(h.id))
      .slice(-20) // last 20 history entries
      .map(h => ({ ...h, _refill: true, _refillSource: 'history' }));

    // Source 3: Cross-media wildcards (different media type) for variety
    const crossMedia = this.watchlist
      .filter(w => otherTypes.some(t => w.type === t || w.source === (t === 'games' ? 'igdb' : 'tmdb')))
      .slice(0, 4)
      .map(w => ({ ...w, _refill: true, _refillSource: 'cross-media' }));

    const combined = [...fromWatchlist, ...fromHistory, ...crossMedia];
    // Shuffle so the user doesn't see a predictable pattern
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }
    const refill = combined.slice(0, 12);

    if (refill.length) {
      const de = this.lang === 'de';
      showToast(de ? '🔄 Mische neu zusammen...' : '🔄 Mixing it up...', {
        type: 'info', duration: 1800,
      });
    }
    return refill;
  }

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
    container.innerHTML = `<div class="search-loading"><div class="search-loading-dots" aria-hidden="true"><span></span><span></span><span></span></div>${this.tr.loading}</div>`;
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

  // ===== RETENTION LOOPS: Daily Top 5 + Streak =====

  /**
   * Open the Daily Top 5 overlay. Builds the list on first view each day
   * (cached for the rest of the day) and renders a shareable URL.
   */
  async _showDailyTop5(app) {
    const existing = document.querySelector('.daily-top5-overlay');
    if (existing) existing.remove();
    // Clear any leftover countdown interval from a previous open
    if (this._dailyTop5CountdownTimer) {
      clearInterval(this._dailyTop5CountdownTimer);
      this._dailyTop5CountdownTimer = null;
    }
    const overlay = document.createElement('div');
    overlay.className = 'daily-top5-overlay';
    overlay.innerHTML = `
      <div class="daily-top5-modal">
        <button class="modal-close" aria-label="Close">✕</button>
        <div class="daily-top5-header">
          <div class="daily-top5-icon">⭐</div>
          <h2 class="daily-top5-title">${this.tr.dailyTop5}</h2>
          <p class="daily-top5-sub">${this.tr.dailyTop5Sub}</p>
        </div>
        <div class="daily-top5-list" data-d5-list>
          <div class="daily-top5-loading">${this.tr.loading}</div>
        </div>
        <div class="daily-top5-actions">
          <button class="btn btn-secondary btn-d5-refresh" data-d5-action="refresh">🔄 ${this.tr.dailyTop5Refresh}</button>
          <button class="btn btn-primary btn-d5-share" data-d5-action="share">📤 ${this.tr.dailyTop5Share}</button>
        </div>
        <div class="daily-top5-countdown" data-d5-countdown></div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.querySelector('.modal-close')?.addEventListener('click', () => {
      if (this._dailyTop5CountdownTimer) {
        clearInterval(this._dailyTop5CountdownTimer);
        this._dailyTop5CountdownTimer = null;
      }
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (this._dailyTop5CountdownTimer) {
          clearInterval(this._dailyTop5CountdownTimer);
          this._dailyTop5CountdownTimer = null;
        }
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
      }
    });
    overlay.querySelector('[data-d5-action="refresh"]')?.addEventListener('click', async () => {
      const list = overlay.querySelector('[data-d5-list]');
      list.innerHTML = `<div class="daily-top5-loading">${this.tr.loading}</div>`;
      const result = await this.dailyTop5.refreshToday();
      this._renderDailyTop5List(list, result.items);
      this._renderDailyTop5Countdown(overlay);
      showToast(this.tr.dailyTop5Refreshed, { type: 'success', duration: 1500 });
    });
    overlay.querySelector('[data-d5-action="share"]')?.addEventListener('click', () => {
      const items = this._lastDailyTop5Items || [];
      const url = this.dailyTop5.buildShareUrl(items);
      if (!url) return;
      const shareData = {
        title: this.lang === 'de' ? 'Meine BookSwipe Top 5' : 'My BookSwipe Top 5',
        text: `${this.tr.dailyTop5SharedPrefix}: ${items.map(i => i.title).join(', ')}`,
        url,
      };
      if (navigator.share) {
        navigator.share(shareData).catch(() => this._copyToClipboard(url));
      } else {
        this._copyToClipboard(url);
      }
    });

    this._renderDailyTop5Countdown(overlay);
    const result = await this.dailyTop5.getToday();
    const list = overlay.querySelector('[data-d5-list]');
    if (!result.items.length) {
      list.innerHTML = `<div class="daily-top5-empty">${this.tr.dailyTop5Empty}</div>`;
    } else {
      this._renderDailyTop5List(list, result.items);
    }
  }

  _renderDailyTop5List(container, items) {
    this._lastDailyTop5Items = items;
    if (!items.length) {
      container.innerHTML = `<div class="daily-top5-empty">${this.tr.dailyTop5Empty}</div>`;
      return;
    }
    container.innerHTML = items.map(item => {
      const isGame = item.type === 'game' || item.source === 'igdb';
      const emoji = isGame ? '🎮' : (item.source === 'openlibrary' || item.source === 'gbooks') ? '📚' : '🎬';
      return `
        <div class="daily-top5-item" data-id="${escapeHTML(item.id)}">
          <div class="daily-top5-rank">${item._rank}</div>
          <div class="daily-top5-cover"><img class="daily-top5-img" loading="lazy" src="${escapeHTML(item.cover || '')}" alt="${escapeHTML(item.title)}" onerror="this.classList.add('hidden');this.parentNode.textContent='${emoji}'"></div>
          <div class="daily-top5-info">
            <strong class="daily-top5-item-title">${escapeHTML(item.title)}</strong>
            <span class="daily-top5-reason">${escapeHTML(item._reason || '')}</span>
          </div>
        </div>`;
    }).join('');
  }

  _renderDailyTop5Countdown(overlay) {
    const node = overlay.querySelector('[data-d5-countdown]');
    if (!node) return;
    const tick = () => {
      const ms = this.dailyTop5.msUntilMidnight();
      const h = Math.floor(ms / (60 * 60 * 1000));
      const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
      node.textContent = this.lang === 'de'
        ? `⏰ Neue Top 5 in ${h}h ${m}m`
        : `⏰ New Top 5 in ${h}h ${m}m`;
    };
    tick();
    if (this._dailyTop5CountdownTimer) clearInterval(this._dailyTop5CountdownTimer);
    this._dailyTop5CountdownTimer = setInterval(tick, 60 * 1000);
  }

  _onDailyTop5Refreshed() {
    const list = document.querySelector('.daily-top5-overlay [data-d5-list]');
    if (list) {
      this.dailyTop5.getToday().then(r => {
        if (r.items && r.items.length) this._renderDailyTop5List(list, r.items);
      });
    }
  }

  _copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(this.tr.dailyTop5Copied, { type: 'success', duration: 1500 });
      }).catch(() => prompt(this.lang === 'de' ? 'Link kopieren:' : 'Copy this link:', text));
    } else {
      prompt(this.lang === 'de' ? 'Link kopieren:' : 'Copy this link:', text);
    }
  }

  // ===== STREAK: milestone confetti + goal toast =====

  /**
   * Fire the confetti animation when a streak milestone is reached.
   * Each milestone has a distinct palette and intensity (see STREAK_CONFETTI).
   * Variable reward: 3=teal, 7=orange, 14=violet/pink, 30=rainbow,
   * 100=big rainbow, 365=gold.
   */
  _fireStreakMilestone(milestone, payload) {
    const confetti = (payload && payload.confetti) || STREAK_CONFETTI[milestone] || STREAK_CONFETTI[3];
    showToast(`🔥 ${this.tr.milestonePrefix} ${milestone} ${this.tr.milestoneSuffix}!`, {
      type: 'success', duration: 4000,
    });
    this._spawnStreakConfetti(confetti, milestone);
  }

  _spawnStreakConfetti(spec, milestone) {
    const container = document.createElement('div');
    container.className = 'streak-confetti-container';
    container.dataset.milestone = String(milestone);
    document.body.appendChild(container);
    const cx = window.innerWidth / 2;
    const cy = Math.max(window.innerHeight * 0.3, 200);
    const colors = spec.colors;
    for (let i = 0; i < spec.count; i++) {
      const p = document.createElement('div');
      p.className = 'streak-confetti';
      const color = colors[i % colors.length];
      const angle = (Math.random() * 2 - 1) * Math.PI * spec.spread;
      const speed = 8 + Math.random() * 12;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 8; // bias upward
      const size = 6 + Math.random() * 10;
      const rot = (Math.random() - 0.5) * 720;
      const dur = 1.6 + Math.random() * 1.0;
      const drift = (Math.random() - 0.5) * 80;
      p.style.cssText = [
        `left:${cx}px`,
        `top:${cy}px`,
        `width:${size}px`,
        `height:${size * (0.5 + Math.random() * 0.5)}px`,
        `background:${color}`,
        `--vx:${vx * 14}px`,
        `--vy:${vy * 14}px`,
        `--rot:${rot}deg`,
        `--drift:${drift}px`,
        `animation-duration:${dur}s`,
        `animation-delay:${Math.random() * 0.2}s`,
      ].join(';');
      container.appendChild(p);
    }
    setTimeout(() => { if (container.parentNode) container.parentNode.removeChild(container); }, 3000);
  }

  _onDailyGoalReached() {
    showToast(`🎯 ${this.tr.streakGoalReached}`, { type: 'success', duration: 2500 });
  }

  /**
   * Build a small "streak pill" HTML snippet used in the discover header.
   * Returns '' if the streak is 0 (don't show empty pill on day 1).
   */
  _renderStreakPill() {
    const data = this.streak.getData();
    if (!data.current) return '';
    const today = this.streak.getTodayProgress();
    const pct = Math.round(today.percent * 100);
    const isRest = today.rested;
    return `
      <div class="streak-pill-wrapper">
        <button class="streak-pill${isRest ? ' streak-rested' : ''}" data-action="open-streak" title="${isRest ? this.tr.streakSkipToday : 'Streak: ' + data.current}">
          <span class="streak-flame">${isRest ? '😴' : '🔥'}</span>
          <span class="streak-num">${data.current}</span>
          <span class="streak-progress" style="--sp-pct:${pct}%"></span>
        </button>
        <div class="streak-pill-dropdown" data-streak-dropdown>
          <button class="streak-dropdown-item" data-action="view-top5">
            ⭐ ${this.tr.dailyTop5}
          </button>
          ${!isRest ? `<button class="streak-dropdown-item" data-action="rest-today">😴 ${this.tr.streakSkipToday}</button>` : `<span class="streak-dropdown-item streak-dropdown-rested">✅ ${this.tr.streakSkipToday}</span>`}
        </div>
      </div>`;
  }

  /**
   * Live-update the streak pill's progress bar without re-rendering the
   * whole discover view. Wired to `streak.onStreakUpdated` so the bar
   * ticks up on every swipe during a session.
   */
  _updateStreakPill() {
    // Cache the pill node reference so rapid-fire swipes don't re-query
    // the DOM on every call.
    if (!this._streakPillNode || !this._streakPillNode.isConnected) {
      this._streakPillNode = document.querySelector('.streak-pill');
    }
    if (!this._streakPillNode) return;
    const progressEl = this._streakPillNode.querySelector('.streak-progress');
    const numEl = this._streakPillNode.querySelector('.streak-num');
    if (!progressEl || !numEl) return;
    const data = this.streak.getData();
    const today = this.streak.getTodayProgress();
    progressEl.style.setProperty('--sp-pct', `${Math.round(today.percent * 100)}%`);
    if (numEl.textContent !== String(data.current)) {
      numEl.textContent = String(data.current);
    }
  }

  /**
   * After "Rest today" is tapped, swap the pill to rested state
   * without a full re-render. Swaps flame to 😴, dims the pill,
   * and replaces the dropdown action with a checked indicator.
   */
  _updateStreakPillRest() {
    if (!this._streakPillNode || !this._streakPillNode.isConnected) {
      this._streakPillNode = document.querySelector('.streak-pill');
    }
    if (!this._streakPillNode) return;
    this._streakPillNode.classList.add('streak-rested');
    const flame = this._streakPillNode.querySelector('.streak-flame');
    if (flame) flame.textContent = '😴';
    // Replace the Rest Today button with a checked indicator
    const wrapper = this._streakPillNode.closest('.streak-pill-wrapper');
    if (wrapper) {
      const restBtn = wrapper.querySelector('[data-action="rest-today"]');
      if (restBtn) {
        const checked = document.createElement('span');
        checked.className = 'streak-dropdown-item streak-dropdown-rested';
        checked.textContent = `✅ ${this.tr.streakSkipToday}`;
        restBtn.replaceWith(checked);
      }
    }
  }

  // ===== VIEW ROUTING =====
  _navHTML(active) {
    return `      <nav class="bottom-nav">
      <button class="nav-btn${active==='discover'?' active':''}" data-view="discover">🔍 ${this.tr.discover}</button>
      <button class="nav-btn${active==='dailyTop5'?' active':''}" data-view="dailyTop5">⭐</button>
      <button class="nav-btn${active==='daylist'?' active':''}" data-view="daylist">📋 ${this.lang === 'de' ? 'Heute' : 'Today'}</button>
      <button class="nav-btn${active==='library'?' active':''}" data-view="library">📚 ${(this.watchlist?.length || 0) + (this.consumed?.length || 0)}</button>
      <button class="nav-btn${active==='history'?' active':''}" data-view="history">📖</button>
      <button class="nav-btn${active==='taste'?' active':''}" data-view="taste">🧬</button>
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
    // Tear down card-stack cleanup (swipe-active class, chrome handle, hover
    // previews) when leaving the discover view. Without this, the
    // chrome-handle button would leak across view changes.
    if (view !== 'discover' && this._cardCleanupFns) {
      this._cardCleanupFns.forEach(fn => fn());
      this._cardCleanupFns = [];
    }
    if (view === 'watchlist') return this.renderWatchlist(app);
    if (view === 'library') return this.renderLibrary(app); // LIB-003: combined Want-to + Consumed
    if (view === 'history') return this.renderHistory(app);
    if (view === 'stats') return this.renderStats(app);
    if (view === 'taste') return this._renderTasteProfile(app);
    if (view === 'daylist') return this._showDaylist(app);
    if (view === 'dailyTop5') return this._showDailyTop5(app);
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

  _renderTasteProfile(app) {
    const de = this.lang === 'de';
    const total = this.history.length;
    const likes = this.history.filter(h => h.action === 'like');
    if (likes.length < 2) {
      app.innerHTML = `
        <div class="taste-profile taste-empty">
          <div class="taste-header">
            <h1>🧬 ${this.tr.tasteProfile}</h1>
            <p>${this.tr.tasteNoData}</p>
          </div>
          <button class="btn btn-primary" data-nav="discover">${this.tr.discover} →</button>
          ${this._navHTML('taste')}
        </div>`;
      app.querySelector('[data-nav="discover"]')?.addEventListener('click', () => this.renderDiscover(app));
      this._bindNav(app);
      return;
    }

    // --- Genre distribution from watchlist ---
    const genres = {};
    this.watchlist.forEach(w => {
      (w.genres || []).forEach(g => {
        const name = typeof g === 'string' ? g : (this._genreMap[g] || String(g));
        genres[name] = (genres[name] || 0) + 1;
      });
    });
    const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxGenreCount = topGenres.length ? topGenres[0][1] : 1;

    // --- Top tropes from liked items' mediaDNA ---
    const tropeCounts = {};
    likes.forEach(item => {
      const dna = item.mediaDNA;
      if (!dna) return;
      (dna.tropes || []).forEach(t => { tropeCounts[t] = (tropeCounts[t] || 0) + 1; });
      (dna.pacing || []).forEach(t => { tropeCounts[t] = (tropeCounts[t] || 0) + 1; });
      (dna.aesthetic || []).forEach(t => { tropeCounts[t] = (tropeCounts[t] || 0) + 1; });
    });
    const topTropes = Object.entries(tropeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // --- Vibe radar (3-axis SVG) ---
    const pacingVal = this.state.vibePacing ?? 50;
    const toneVal = this.state.vibeTone ?? 50;
    const complexVal = this.state.vibeComplex ?? 50;

    // Radar chart geometry
    const cx = 120, cy = 120, R = 90;
    const angles = [270, 30, 150]; // top, bottom-right, bottom-left (degrees)
    const vals = [pacingVal, toneVal, complexVal];
    const labels = [this.tr.tastePacing, this.tr.tasteTone, this.tr.tasteComplex];
    const leftLabels = de ? ['Langsam', 'Dunkel', 'Popcorn'] : ['Slow', 'Dark', 'Popcorn'];
    const rightLabels = de ? ['Rasant', 'Hell', 'Tiefgang'] : ['Fast', 'Light', 'Deep'];

    // Compute polygon points for data
    const dataPoints = angles.map((a, i) => {
      const rad = (a * Math.PI) / 180;
      const r = (vals[i] / 100) * R;
      return `${cx + r * Math.cos(rad)},${cy + r * Math.sin(rad)}`;
    }).join(' ');

    // Grid rings
    const rings = [0.33, 0.66, 1].map(f => {
      const pts = angles.map(a => {
        const rad = (a * Math.PI) / 180;
        return `${cx + R * f * Math.cos(rad)},${cy + R * f * Math.sin(rad)}`;
      }).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`;
    }).join('');

    // Axis lines
    const axisLines = angles.map(a => {
      const rad = (a * Math.PI) / 180;
      return `<line x1="${cx}" y1="${cy}" x2="${cx + R * Math.cos(rad)}" y2="${cy + R * Math.sin(rad)}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`;
    }).join('');

    // Axis labels
    const labelOffset = 108;
    const axisLabels = angles.map((a, i) => {
      const rad = (a * Math.PI) / 180;
      const lx = cx + labelOffset * Math.cos(rad);
      const ly = cy + labelOffset * Math.sin(rad);
      const anchor = a === 270 ? 'middle' : a === 30 ? 'start' : 'end';
      const dy = a === 270 ? -8 : 4;
      return `<text x="${lx}" y="${ly + dy}" text-anchor="${anchor}" fill="var(--fg2)" font-size="11" font-weight="600">${labels[i]}</text>`;
    }).join('');

    // Data point dots
    const dots = angles.map((a, i) => {
      const rad = (a * Math.PI) / 180;
      const r = (vals[i] / 100) * R;
      return `<circle cx="${cx + r * Math.cos(rad)}" cy="${cy + r * Math.sin(rad)}" r="5" fill="var(--accent)" stroke="var(--bg)" stroke-width="2"/>`;
    }).join('');

    // --- Persona & Anti-taste ---
    const persona = this._getPersonaBadge();
    const antiTaste = this._getAntiTaste();
    const weeklyVibe = this._getWeeklyVibe();

    // --- Genre color palette ---
    const genreColors = ['#7c6cff','#ef4444','#a855f7','#3b82f6','#10b981','#f59e0b','#ec4899','#06b6d4'];

    app.innerHTML = `
      <div class="taste-profile">
        <div class="taste-header">
          <h1>🧬 ${this.tr.tasteProfile}</h1>
          <p class="taste-subtitle">${de ? 'Basierend auf ' + total + ' Swipes' : 'Based on ' + total + ' swipes'}</p>
        </div>

        <!-- Radar Chart -->
        <div class="taste-section">
          <h2 class="taste-section-title">📊 ${this.tr.tasteRadar}</h2>
          <div class="taste-radar-container">
            <svg viewBox="0 0 240 240" class="taste-radar-svg" role="img" aria-label="Taste radar chart">
              ${rings}
              ${axisLines}
              <polygon points="${dataPoints}" fill="rgba(124,108,255,.2)" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
              ${dots}
              ${axisLabels}
            </svg>
            <div class="taste-radar-labels">
              ${angles.map((a, i) => `
                <div class="taste-radar-label-row">
                  <span class="taste-radar-label-left">${leftLabels[i]}</span>
                  <span class="taste-radar-label-val">${vals[i]}</span>
                  <span class="taste-radar-label-right">${rightLabels[i]}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Persona -->
        <div class="taste-section">
          <div class="taste-persona-card">
            <span class="taste-persona-icon">${this._getPersonaEmoji(persona)}</span>
            <div>
              <h3 class="taste-persona-name">${PERSONA_BADGES[this.lang]?.[persona] || persona}</h3>
              <p class="taste-persona-sub">${de ? 'Dein Geschmacksprofil' : 'Your taste persona'}</p>
            </div>
          </div>
        </div>

        <!-- Top Genres -->
        ${topGenres.length ? `
          <div class="taste-section">
            <h2 class="taste-section-title">🎯 ${this.tr.tasteGenres}</h2>
            <div class="taste-genre-bars">
              ${topGenres.map(([name, count], i) => `
                <div class="taste-genre-row">
                  <span class="taste-genre-name">${escapeHTML(name)}</span>
                  <div class="taste-genre-bar-track">
                    <div class="taste-genre-bar-fill" style="width:${Math.round((count / maxGenreCount) * 100)}%;background:${genreColors[i % genreColors.length]}"></div>
                  </div>
                  <span class="taste-genre-count">${count}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Top Tropes / DNA -->
        ${topTropes.length ? `
          <div class="taste-section">
            <h2 class="taste-section-title">🧬 ${this.tr.tasteDNATitle}</h2>
            <div class="taste-dna-grid">
              ${topTropes.map(([tag, count]) => `
                <span class="taste-dna-tag" data-count="${count}">${escapeHTML(tag.replace(/_/g, ' '))}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Anti-Taste -->
        ${antiTaste.length ? `
          <div class="taste-section">
            <h2 class="taste-section-title">🚫 ${this.tr.antiTaste}</h2>
            <div class="taste-anti-tags">
              ${antiTaste.map(t => `<span class="taste-anti-tag">🚫 ${escapeHTML(t)}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Weekly Vibe -->
        ${weeklyVibe ? `
          <div class="taste-section">
            <h2 class="taste-section-title">📈 ${this.tr.weeklyVibe}</h2>
            <div class="taste-vibe-bars">
              ${Object.entries(weeklyVibe).map(([emoji, pct]) => `
                <div class="taste-vibe-row">
                  <span class="taste-vibe-emoji">${emoji}</span>
                  <div class="taste-vibe-bar-track">
                    <div class="taste-vibe-bar-fill" style="width:${pct}%"></div>
                  </div>
                  <span class="taste-vibe-pct">${pct}%</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${this._navHTML('taste')}
      </div>`;

    this._bindNav(app);
  }

  _getPersonaEmoji(persona) {
    const map = {
      a24Disciple:'🎬', horrorSkeptic:'👻', romcomAddict:'💕',
      nostalgiaAddict:'📼', foreignFilmAficionado:'🌍', cerebrlElite:'🧠',
      cozyQueen:'☕', actionJunkie:'💥', mindBender:'🔮',
      normie:'🙂', wildcard:'🃏', darkSoul:'🖤', comfortSeeker:'🧸'
    };
    return map[persona] || '🎭';
  }
}

export { App };

Object.assign(App.prototype, OnboardingMixin, GameUIMixin, ModalsMixin);
window.app = new App();
