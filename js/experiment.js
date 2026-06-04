/**
 * BookSwipe A/B Test Framework
 *
 * Compares old random serendipity (control) vs MMR diversity (treatment).
 * Assigns user to a bucket deterministically (sticky), tracks metrics,
 * and exposes results for analysis.
 *
 * Metrics tracked:
 *  - Swipes (total, likes, nopes, skips)
 *  - Genre diversity among liked items (Jaccard-based)
 *  - Card completion rate (% of deck viewed before switching or re-fetching)
 *  - Session timestamps for session count
 */

const STORAGE_KEY = 'bs-experiment';

function getExperimentData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveExperimentData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { console.warn('[Experiment] Failed to save:', e); }
}

function assignGroup() {
  // Sticky assignment — once assigned, always the same group
  const existing = getExperimentData();
  if (existing && existing.group) return existing.group;
  return Math.random() < 0.5 ? 'control' : 'treatment';
}

export class ABTest {
  constructor({ experiment = 'diversity-mmr-v1', app } = {}) {
    this.name = experiment;
    this.app = app;
    this._data = getExperimentData() || this._initFreshData();
    this.group = this._data.group;
    // Track session start if not already set
    if (!this._data.sessionStart) {
      this._data.sessionStart = Date.now();
      this._data.sessionCount = (this._data.sessionCount || 0) + 1;
      saveExperimentData(this._data);
    }
    // Expose group to UI
    console.log(`[Experiment] ${this.name}: ${this.group}`);
  }

  _initFreshData() {
    return {
      group: assignGroup(),
      sessionStart: null,
      sessionCount: 1,
      totalSwipes: 0,
      totalLikes: 0,
      totalNopes: 0,
      totalSkips: 0,
      totalRefetches: 0,
      likedGenres: [],       // flat list of genre names liked
      likeTimestamps: [],    // ms timestamps of each like
      sessionDurations: [],  // ms per session
      logs: []               // raw event log (max 2000)
    };
  }

  /** Log a swipe event */
  trackSwipe({ direction, item }) {
    this._data.totalSwipes++;
    if (direction === 'right') {
      this._data.totalLikes++;
      this._data.likeTimestamps.push(Date.now());
      if (item && item.genres) {
        const genres = Array.isArray(item.genres) ? item.genres : [];
        genres.forEach(g => {
          const name = typeof g === 'string' ? g : (g.name || String(g));
          this._data.likedGenres.push(name.toLowerCase());
        });
      }
    } else if (direction === 'left') {
      this._data.totalNopes++;
    } else {
      this._data.totalSkips++;
    }
    this._logEvent('swipe', { direction, itemId: item?.id });
    saveExperimentData(this._data);
  }

  /** Log a re-fetch (new discover load) */
  trackRefetch() {
    this._data.totalRefetches++;
    this._logEvent('refetch', {});
    saveExperimentData(this._data);
  }

  /** Call when user navigates away or session ends */
  endSession() {
    if (this._data.sessionStart) {
      const duration = Date.now() - this._data.sessionStart;
      this._data.sessionDurations.push(duration);
      this._data.sessionStart = null;
      this._logEvent('sessionEnd', { durationMs: duration });
      saveExperimentData(this._data);
    }
  }

  /** Start a new session */
  startSession() {
    this._data.sessionStart = Date.now();
    this._data.sessionCount++;
    this._logEvent('sessionStart', {});
    saveExperimentData(this._data);
  }

  _logEvent(type, payload) {
    this._data.logs.push({ t: Date.now(), type, ...payload });
    // Trim logs to prevent unbounded growth
    if (this._data.logs.length > 2000) {
      this._data.logs = this._data.logs.slice(-1500);
    }
  }

  // ===== METRIC COMPUTATIONS =====

  /** Like rate as a decimal (0-1) */
  get likeRate() {
    return this._data.totalSwipes > 0
      ? this._data.totalLikes / this._data.totalSwipes
      : 0;
  }

  /** Genre diversity among liked items — unique / total genre tags */
  get genreDiversity() {
    const tags = this._data.likedGenres;
    if (!tags.length) return 0;
    const unique = new Set(tags);
    return unique.size / tags.length;
  }

  /** Average swipes before a re-fetch (lower = more picky) */
  get avgSwipesPerDeck() {
    const refetches = this._data.totalRefetches || 1;
    return this._data.totalSwipes / refetches;
  }

  /** Average session duration in seconds */
  get avgSessionDurationSec() {
    const d = this._data.sessionDurations;
    if (!d.length) return 0;
    return d.reduce((a, b) => a + b, 0) / d.length / 1000;
  }

  /** Total number of sessions */
  get sessionCount() {
    return this._data.sessionCount || 1;
  }

  /** Return a concise metrics snapshot suitable for display */
  getMetrics() {
    return {
      group: this.group,
      experiment: this.name,
      totalSwipes: this._data.totalSwipes,
      totalLikes: this._data.totalLikes,
      likeRate: this.likeRate,
      genreDiversity: this.genreDiversity,
      avgSwipesPerDeck: this.avgSwipesPerDeck,
      avgSessionDurationSec: this.avgSessionDurationSec,
      sessionCount: this.sessionCount,
      refetches: this._data.totalRefetches
    };
  }

  /** Switch to a specific group (control | treatment) and persist */
  switchGroup(group) {
    if (group !== 'control' && group !== 'treatment') return;
    this._data.group = group;
    this.group = group;
    saveExperimentData(this._data);
    console.log('[Experiment] Switched to group:', group);
  }

  /** Reset all experiment data */
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this._data = this._initFreshData();
    this.group = this._data.group;
    saveExperimentData(this._data);
    console.log('[Experiment] Reset — new group:', this.group);
  }
}
