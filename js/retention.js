/**
 * BookSwipe Retention Loops
 *
 * Two gamification systems designed to keep the user coming back daily:
 *
 *  1. **DailyTop5** — a curated list of 5 media picks that "refreshes" at
 *     midnight (local time). Built lazily on first view each day, cached in
 *     localStorage with a `{ dateKey, items }` payload. Cached lists are
 *     sharable as a short base64-encoded URL so the user can post their
 *     "Top 5 today" on social media.
 *
 *  2. **StreakTracker** — counts consecutive days where the user hit their
 *     daily swipe goal (default: 5 swipes). On milestone days (3, 7, 14,
 *     30, 100) fires a one-time celebration with a variable confetti
 *     pattern. Streak data persists in localStorage; a `lastMilestone`
 *     field guards against re-firing the same milestone.
 *
 * Both modules are framework-agnostic: they read state from the supplied
 * `app` instance (history, recommender profile, language) and emit events
 * via callbacks (`onMilestone`, `onStreakUpdated`) so the host can wire
 * UI reactions (confetti animation, toast, etc.) without the modules
 * knowing about the DOM.
 */

// ===== DAILY TOP 5 =====
// A "date key" is a YYYY-MM-DD string in the user's local timezone. This
// way the cache invalidates at local midnight, not UTC midnight.
function _localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAILY_TOP5_STORAGE_KEY = 'bs-daily-top5';
const DAILY_TOP5_VERSION = 1;
const DAILY_TOP5_COUNT = 5;
const DAILY_TOP5_TTL_MS = 36 * 60 * 60 * 1000; // 36h safety net

export class DailyTop5 {
  constructor(app) {
    this.app = app;
    // Callback for "share this list" — set by the host (uses Web Share API
    // with clipboard fallback).
    this.onShare = null;
    // Callback fired when the cache is refreshed (e.g. after midnight).
    this.onRefresh = null;
  }

  /**
   * Get the current Top 5 for today, building it on first view each day.
   * Returns `{ dateKey, items, isFresh }` where `isFresh` is true if the
   * list was built (not loaded from cache) on this call.
   */
  async getToday() {
    const today = _localDateKey();
    const cached = this._readCache();
    if (cached && cached.dateKey === today) {
      return { dateKey: today, items: cached.items, isFresh: false };
    }
    // Build a fresh list for today.
    const items = await this._buildTop5();
    this._writeCache({ version: DAILY_TOP5_VERSION, dateKey: today, items, at: Date.now() });
    if (this.onRefresh) this.onRefresh({ dateKey: today, items });
    return { dateKey: today, items, isFresh: true };
  }

  /**
   * Force a rebuild of today's list (e.g. user taps "Shuffle today").
   * Useful when the user wants a different set of recommendations without
   * waiting for tomorrow.
   */
  async refreshToday() {
    const today = _localDateKey();
    const items = await this._buildTop5();
    this._writeCache({ version: DAILY_TOP5_VERSION, dateKey: today, items, at: Date.now() });
    if (this.onRefresh) this.onRefresh({ dateKey: today, items });
    return { dateKey: today, items, isFresh: true };
  }

  /**
   * Check whether the cached list has expired (dateKey !== today) and
   * return the number of ms until the next local midnight.
   */
  msUntilMidnight() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return tomorrow.getTime() - now.getTime();
  }

  /**
   * Build the Top 5 for today. Strategy:
   *   - Lead with watchlist + recent likes (the most-curated signal).
   *   - Then the current deck (items the user is currently swiping on).
   *   - Last resort: genre-rotation fetch.
   */
  async _buildTop5() {
    const app = this.app;
    const candidates = [];

    // Source 1: watchlist (the user's own curation)
    if (app.watchlist && app.watchlist.length) {
      for (const w of app.watchlist) {
        if (candidates.length >= DAILY_TOP5_COUNT) break;
        if (w && w.id && !candidates.some(x => x.id === w.id)) candidates.push(w);
      }
    }

    // Source 2: recent history (likes only)
    if (candidates.length < DAILY_TOP5_COUNT && app.history && app.history.length) {
      for (const h of app.history) {
        if (candidates.length >= DAILY_TOP5_COUNT) break;
        if (h && h.id && h.action === 'like' && !candidates.some(x => x.id === h.id)) candidates.push(h);
      }
    }

    // Source 3: current deck (what the user is swiping on right now)
    if (candidates.length < DAILY_TOP5_COUNT && app.currentCards && app.currentCards.length) {
      for (const c of app.currentCards) {
        if (candidates.length >= DAILY_TOP5_COUNT) break;
        if (c && c.id && !candidates.some(x => x.id === c.id)) candidates.push(c);
      }
    }

    // Source 4: genre rotation (last resort)
    if (candidates.length < DAILY_TOP5_COUNT && app._fetchGenreRotation) {
      try {
        const more = await app._fetchGenreRotation();
        for (const m of (more || [])) {
          if (candidates.length >= DAILY_TOP5_COUNT) break;
          if (m && m.id && !candidates.some(x => x.id === m.id)) candidates.push(m);
        }
      } catch (_) { /* ignore — local sources are fine */ }
    }

    // Tag each pick with a reason
    return candidates.slice(0, DAILY_TOP5_COUNT).map((item, i) => ({
      ...item,
      _rank: i + 1,
      _reason: this._pickReason(item, i),
    }));
  }

  _pickReason(item, idx) {
    const de = this.app.lang === 'de';
    const reasons = de ? [
      'Passt zu deinem heutigen Vibe',
      'Auf deiner Welle',
      'Starkes Match für dich',
      'Ein Geheimtipp für dich',
      'Dein Top-Pick heute',
    ] : [
      'Matches today\u2019s vibe',
      'Right up your alley',
      'Strong match for you',
      'A hidden gem for you',
      'Your top pick today',
    ];
    return reasons[idx] || reasons[0];
  }

  _readCache() {
    try {
      const raw = localStorage.getItem(DAILY_TOP5_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== DAILY_TOP5_VERSION) return null;
      // Defensive: discard very stale cache (>36h) so the user always
      // gets a fresh build after a long absence.
      if (parsed.at && Date.now() - parsed.at > DAILY_TOP5_TTL_MS) return null;
      if (!Array.isArray(parsed.items)) return null;
      return parsed;
    } catch { return null; }
  }

  _writeCache(payload) {
    try { localStorage.setItem(DAILY_TOP5_STORAGE_KEY, JSON.stringify(payload)); }
    catch (e) { console.warn('[DailyTop5] cache write failed:', e); }
  }

  /**
   * Build a short, shareable URL embedding the current Top 5 IDs.
   * Format: `?d5=<base64-json>` so it's URL-safe and round-trips.
   * Uses Unicode-safe base64 (encodeURIComponent → btoa) so German
   * umlauts, €, and emojis survive the round-trip.
   */
  buildShareUrl(items) {
    if (!items || !items.length) return null;
    const payload = {
      v: DAILY_TOP5_VERSION,
      d: _localDateKey(),
      ids: items.map(i => i.id).slice(0, DAILY_TOP5_COUNT),
      t: items.map(i => i.title).slice(0, DAILY_TOP5_COUNT),
      l: this.app.lang || 'de',
    };
    let encoded;
    try {
      encoded = _b64UrlEncode(JSON.stringify(payload));
    } catch (_) { return null; }
    const url = new URL(window.location.href);
    url.searchParams.set('d5', encoded);
    return url.toString();
  }

  /**
   * Try to restore a shared Top 5 from the current page URL.
   * Returns null if no `d5` param is present or the payload is malformed.
   */
  readSharedFromUrl() {
    try {
      const url = new URL(window.location.href);
      const encoded = url.searchParams.get('d5');
      if (!encoded) return null;
      const json = _b64UrlDecode(encoded);
      const parsed = JSON.parse(json);
      if (!parsed || parsed.v !== DAILY_TOP5_VERSION) return null;
      if (!Array.isArray(parsed.ids)) return null;
      return parsed;
    } catch (_) { return null; }
  }

  clear() {
    try { localStorage.removeItem(DAILY_TOP5_STORAGE_KEY); } catch (_) {}
  }
}

// ===== STREAK TRACKER =====
// Milestones: 3, 7, 14, 30, 100, 365 — each with a distinct confetti palette.
// `lastMilestone` ensures each milestone only fires once per lifetime
// (even across multiple sessions on the same day).
const STREAK_STORAGE_KEY = 'bs-streak';
const STREAK_VERSION = 1;
const STREAK_MILESTONES = [3, 7, 14, 30, 100, 365];
const DEFAULT_DAILY_GOAL = 5;

export const STREAK_CONFETTI = {
  // Each milestone has a distinct palette + intensity for "variable reward"
  3:   { colors: ['#4ecdc4','#ffd166','#06d6a0'], count: 40,  spread: 0.4 },
  7:   { colors: ['#ff6b6b','#ffd166','#ff9f1c'], count: 60,  spread: 0.5 },
  14:  { colors: ['#a78bfa','#f472b6','#22d3ee'], count: 80,  spread: 0.6 },
  30:  { colors: ['#fbbf24','#ec4899','#8b5cf6','#10b981'], count: 120, spread: 0.7 },
  100: { colors: ['#facc15','#f97316','#ef4444','#a855f7','#06b6d4'], count: 160, spread: 0.85 },
  365: { colors: ['#fef3c7','#fde68a','#fcd34d','#facc15','#f59e0b','#d97706'], count: 220, spread: 1.0 },
};

export class StreakTracker {
  constructor(app, opts = {}) {
    this.app = app;
    this.dailyGoal = opts.dailyGoal || DEFAULT_DAILY_GOAL;
    this.onMilestone = null;        // (milestone, data) => void
    this.onStreakUpdated = null;    // (data) => void
    this.onGoalReached = null;      // (data) => void
    this._loaded = this._load();
  }

  /**
   * Get the current streak data (from cache). Call `recordSwipe` to update.
   */
  getData() {
    return { ...this._loaded };
  }

  /**
   * Get the localized label for the user's current streak length.
   * `dayWord` is "Tag"/"day", `streakWord` is "Tages-Streak"/"day streak".
   */
  getLocalizedLabel() {
    const de = this.app.lang === 'de';
    const n = this._loaded.current || 0;
    if (de) return `${n} ${n === 1 ? 'Tag' : 'Tage'}-Streak`;
    return `${n}-day streak`;
  }

  /**
   * Get progress toward today's daily goal (0..1).
   */
  getTodayProgress() {
    const today = _localDateKey();
    if (this._loaded.todayKey !== today) return { count: 0, goal: this.dailyGoal, percent: 0, key: today, rested: false };
    return {
      count: this._loaded.todayCount,
      goal: this.dailyGoal,
      percent: Math.min(1, this._loaded.todayCount / this.dailyGoal),
      key: today,
      rested: this._loaded.rested === today,
    };
  }

  /**
   * Record a swipe and update the streak counters. Returns:
   *  - `{ milestone }` if a milestone was just hit (host should fire confetti)
   *  - `{ goalReached: true }` if the daily goal was just hit
   *  - `{ updated: true }` for a normal counter update
   *  - `null` if no change (idempotent within the same day after goal)
   */
  recordSwipe() {
    const today = _localDateKey();
    const data = this._loaded;
    let milestone = null;
    let goalReached = false;

    if (data.todayKey !== today) {
      // New day. The constructor's _load() has already broken the streak
      // (set current=0) if more than 1 day of inactivity elapsed, so we
      // only need to handle the consecutive-day case here.
      if (data.todayKey) {
        const yesterday = _localDateKey(_prevCalendarDay());
        if (data.todayKey === yesterday) {
          data.current = (data.current || 0) + 1;
        } else {
          // Gap day detected (and not broken by _load because todayKey was
          // preserved by a same-tz load) — reset to 1.
          data.current = 1;
        }
      } else {
        data.current = 1;
      }
      data.best = Math.max(data.best || 0, data.current);
      data.todayKey = today;
      data.todayCount = 0;
    }
    data.todayCount = (data.todayCount || 0) + 1;
    data.totalSwipes = (data.totalSwipes || 0) + 1;

    // Check daily goal
    if (data.todayCount === this.dailyGoal) {
      goalReached = true;
    }

    // Check milestones (only if we just hit today's count >= goal; milestones
    // are earned on the day the goal is reached, not on every swipe)
    if (data.todayCount >= this.dailyGoal) {
      const next = STREAK_MILESTONES.find(m =>
        data.current >= m && !(data.lastMilestone || []).includes(m)
      );
      if (next) {
        data.lastMilestone = data.lastMilestone || [];
        data.lastMilestone.push(next);
        data.lastMilestoneAt = Date.now();
        milestone = next;
      }
    }

    this._save(data);
    if (this.onStreakUpdated) this.onStreakUpdated(data);

    if (milestone) {
      const payload = { milestone, current: data.current, totalSwipes: data.totalSwipes, confetti: STREAK_CONFETTI[milestone] };
      if (this.onMilestone) this.onMilestone(milestone, payload);
      return { milestone, ...payload };
    }
    if (goalReached) {
      const payload = { goalReached: true, current: data.current, count: data.todayCount };
      if (this.onGoalReached) this.onGoalReached(payload);
      return payload;
    }
    return { updated: true, current: data.current, todayCount: data.todayCount };
  }

  /**
   * Skip today's goal manually (e.g. user wants to "rest"). Does NOT
   * break the streak — the streak is only broken by a day with zero swipes.
   * Returns the updated data.
   */
  skipToday() {
    const today = _localDateKey();
    const data = this._loaded;
    if (data.todayKey !== today) {
      data.current = (data.current || 0) + 1;
      data.best = Math.max(data.best || 0, data.current);
      data.todayKey = today;
    }
    data.todayCount = 0; // mark as "rested" — no swipes count toward goal
    data.rested = today; // flag so UI can show rested state
    this._save(data);
    if (this.onStreakUpdated) this.onStreakUpdated(data);
    return data;
  }

  /**
   * Set a new daily goal. If the user has already met the old goal today,
   * the milestone check is re-run.
   */
  setDailyGoal(goal) {
    this.dailyGoal = Math.max(1, Math.min(50, goal | 0));
    this._loaded.goal = this.dailyGoal;
    this._save(this._loaded);
    return this.dailyGoal;
  }

  /**
   * Reset the streak. Used by the stats screen's "reset experiment" button
   * and on logout.
   */
  reset() {
    this._loaded = {
      version: STREAK_VERSION,
      current: 0,
      best: 0,
      todayKey: null,
      todayCount: 0,
      totalSwipes: 0,
      lastMilestone: [],
      goal: this.dailyGoal,
    };
    this._save(this._loaded);
    if (this.onStreakUpdated) this.onStreakUpdated(this._loaded);
  }

  _load() {
    try {
      const raw = localStorage.getItem(STREAK_STORAGE_KEY);
      if (!raw) return this._defaultData();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== STREAK_VERSION) return this._defaultData();
      // Backfill: if todayKey is older than 1 day, the streak is dead
      const today = _localDateKey();
      if (parsed.todayKey && parsed.todayKey !== today) {
        const yesterday = _localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
        if (parsed.todayKey !== yesterday) {
          // More than 1 day of inactivity — streak is broken
          parsed.current = 0;
          parsed.todayCount = 0;
          parsed.todayKey = null;
        }
      }
      return { ...this._defaultData(), ...parsed, goal: this.dailyGoal };
    } catch { return this._defaultData(); }
  }

  _defaultData() {
    return {
      version: STREAK_VERSION,
      current: 0,
      best: 0,
      todayKey: null,
      todayCount: 0,
      totalSwipes: 0,
      lastMilestone: [],
      goal: this.dailyGoal,
    };
  }

  _save(data) {
    try {
      const toSave = { ...data, version: STREAK_VERSION };
      localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) { console.warn('[StreakTracker] save failed:', e); }
  }
}

// Export the local-date-key helper so tests and other modules can use the
// same "midnight" definition.
export { _localDateKey as localDateKey };

// Returns a Date for the previous calendar day in the user's local timezone.
// Avoids the DST hazard of `new Date(now - 24*60*60*1000)` which can give
// the same date in the same timezone around a DST transition.
function _prevCalendarDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

// ===== Unicode-safe base64url helpers =====
// `btoa` only accepts Latin-1, so JSON containing German umlauts, €, or
// emojis would throw. We use the standard `encodeURIComponent → btoa`
// workaround. The reverse path mirrors it.
function _b64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _b64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  // Re-pad to a multiple of 4 (atob is strict)
  const pad = padded.length % 4 ? '='.repeat(4 - (padded.length % 4)) : '';
  return decodeURIComponent(escape(atob(padded + pad)));
}
