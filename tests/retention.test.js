import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost' });
global.window = window;
global.document = window.document;
global.localStorage = window.localStorage;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.performance = window.performance;
Object.defineProperty(global, 'navigator', { value: { vibrate: () => {}, clipboard: { writeText: async () => {} } }, writable: true, configurable: true });
global.window.getComputedStyle = () => ({});

const { DailyTop5, StreakTracker, STREAK_CONFETTI, localDateKey } = await import('../js/retention.js');

// ===== HELPERS =====

function makeStubApp(overrides = {}) {
  return {
    lang: 'en',
    state: { mediaType: 'movies', selectedGenres: [28], selectedMoods: [], selectedPlatforms: [] },
    currentCards: [],
    watchlist: [],
    history: [],
    _fetchGenreRotation: async () => [],
    ...overrides,
  };
}

function clearStorage() {
  try { window.localStorage.clear(); } catch (_) {}
}

function setStoredStreak(payload) {
  window.localStorage.setItem('bs-streak', JSON.stringify(payload));
}

function getStoredStreak() {
  try { return JSON.parse(window.localStorage.getItem('bs-streak') || 'null'); }
  catch { return null; }
}

// ===== localDateKey =====

describe('localDateKey', () => {
  it('should return YYYY-MM-DD for a given date', () => {
    const d = new Date(2025, 0, 5); // Jan 5, 2025
    assert.equal(localDateKey(d), '2025-01-05');
  });

  it('should pad single-digit months and days', () => {
    const d = new Date(2025, 2, 9); // Mar 9, 2025
    assert.equal(localDateKey(d), '2025-03-09');
  });

  it('should default to today', () => {
    const today = localDateKey();
    const now = localDateKey(new Date());
    assert.equal(today, now);
  });
});

// ===== DailyTop5 =====

describe('DailyTop5', () => {
  beforeEach(() => {
    clearStorage();
  });
  afterEach(() => {
    clearStorage();
  });

  it('builds a list of up to 5 items from currentCards', async () => {
    const app = makeStubApp({
      currentCards: Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, title: `C${i}` })),
    });
    const d5 = new DailyTop5(app);
    const result = await d5.getToday();
    assert.equal(result.items.length, 5);
    assert.equal(result.isFresh, true);
    assert.equal(result.items[0].id, 'c0');
    assert.equal(result.items[0]._rank, 1);
    assert.equal(result.items[4]._rank, 5);
  });

  it('falls back to watchlist when currentCards is empty', async () => {
    const app = makeStubApp({
      watchlist: [
        { id: 'w1', title: 'W1' },
        { id: 'w2', title: 'W2' },
        { id: 'w3', title: 'W3' },
      ],
    });
    const d5 = new DailyTop5(app);
    const result = await d5.getToday();
    assert.equal(result.items.length, 3);
    assert.equal(result.items[0].id, 'w1');
  });

  it('falls back to history (likes) when watchlist is empty', async () => {
    const app = makeStubApp({
      history: [
        { id: 'h1', title: 'H1', action: 'like' },
        { id: 'h2', title: 'H2', action: 'nope' },
        { id: 'h3', title: 'H3', action: 'like' },
      ],
    });
    const d5 = new DailyTop5(app);
    const result = await d5.getToday();
    // Only likes (h1 and h3) are eligible, in history order
    const ids = result.items.map(i => i.id);
    assert.ok(ids.includes('h1'));
    assert.ok(ids.includes('h3'));
    assert.ok(!ids.includes('h2'), 'nope items should be excluded');
  });

  it('caches the list in localStorage keyed by dateKey', async () => {
    const app = makeStubApp({
      currentCards: [{ id: 'c1', title: 'C1' }, { id: 'c2', title: 'C2' }],
    });
    const d5 = new DailyTop5(app);
    await d5.getToday();
    const cached = JSON.parse(window.localStorage.getItem('bs-daily-top5'));
    assert.ok(cached);
    assert.equal(cached.dateKey, localDateKey());
    assert.equal(cached.items.length, 2);
    assert.equal(cached.version, 1);
  });

  it('returns the cached list on second call (not fresh)', async () => {
    const app = makeStubApp({ currentCards: [{ id: 'c1', title: 'C1' }] });
    const d5 = new DailyTop5(app);
    const first = await d5.getToday();
    assert.equal(first.isFresh, true);
    const second = await d5.getToday();
    assert.equal(second.isFresh, false);
    assert.deepEqual(second.items, first.items);
  });

  it('discards stale cache (different dateKey) and builds fresh', async () => {
    const app = makeStubApp({ currentCards: [{ id: 'today', title: 'Today' }] });
    const d5 = new DailyTop5(app);
    // Pre-seed with yesterday's cache
    window.localStorage.setItem('bs-daily-top5', JSON.stringify({
      version: 1,
      dateKey: '1999-01-01',
      items: [{ id: 'stale', title: 'Stale' }],
      at: Date.now(),
    }));
    const result = await d5.getToday();
    assert.equal(result.isFresh, true);
    assert.equal(result.items[0].id, 'today');
  });

  it('discards cache with wrong version', async () => {
    const app = makeStubApp({ currentCards: [{ id: 'c1', title: 'C1' }] });
    const d5 = new DailyTop5(app);
    window.localStorage.setItem('bs-daily-top5', JSON.stringify({
      version: 99,
      dateKey: localDateKey(),
      items: [{ id: 'old', title: 'Old' }],
      at: Date.now(),
    }));
    const result = await d5.getToday();
    assert.equal(result.isFresh, true);
    assert.equal(result.items[0].id, 'c1');
  });

  it('discards cache older than 36h even if dateKey matches (impossible in practice but defensive)', async () => {
    const app = makeStubApp({ currentCards: [{ id: 'fresh', title: 'Fresh' }] });
    const d5 = new DailyTop5(app);
    // Backdate the `at` timestamp to 48h ago
    window.localStorage.setItem('bs-daily-top5', JSON.stringify({
      version: 1,
      dateKey: localDateKey(),
      items: [{ id: 'old', title: 'Old' }],
      at: Date.now() - 48 * 60 * 60 * 1000,
    }));
    const result = await d5.getToday();
    assert.equal(result.isFresh, true);
    assert.equal(result.items[0].id, 'fresh');
  });

  it('refreshToday forces a rebuild', async () => {
    const app = makeStubApp({ currentCards: [{ id: 'v1', title: 'V1' }] });
    const d5 = new DailyTop5(app);
    await d5.getToday();
    app.currentCards = [{ id: 'v2', title: 'V2' }];
    const result = await d5.refreshToday();
    assert.equal(result.isFresh, true);
    assert.equal(result.items[0].id, 'v2');
  });

  it('assigns a localized reason to each pick', async () => {
    const app = makeStubApp({
      currentCards: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, title: `C${i}` })),
    });
    const d5 = new DailyTop5(app);
    const result = await d5.getToday();
    assert.ok(result.items[0]._reason);
    assert.ok(result.items[0]._reason.length > 5);
  });

  it('msUntilMidnight returns a positive value during the day', () => {
    const app = makeStubApp();
    const d5 = new DailyTop5(app);
    const ms = d5.msUntilMidnight();
    assert.ok(ms > 0, `ms ${ms} should be > 0`);
    assert.ok(ms <= 24 * 60 * 60 * 1000, `ms ${ms} should be <= 24h`);
  });

  describe('sharing', () => {
    it('builds a shareable URL with base64-encoded payload', () => {
      const app = makeStubApp();
      const d5 = new DailyTop5(app);
      const items = [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ];
      const url = d5.buildShareUrl(items);
      assert.ok(url.includes('?d5='));
      // Extract the payload and decode
      const payload = url.split('?d5=')[1];
      const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
      const decoded = JSON.parse(decodeURIComponent(escape(atob(padded.replace(/-/g, '+').replace(/_/g, '/')))));
      assert.equal(decoded.v, 1);
      assert.equal(decoded.d, localDateKey());
      assert.deepEqual(decoded.ids, ['a', 'b', 'c']);
      assert.deepEqual(decoded.t, ['A', 'B', 'C']);
    });

    it('round-trips a share URL with German umlauts and emojis', () => {
      const app = makeStubApp({ lang: 'de' });
      const d5 = new DailyTop5(app);
      const items = [
        { id: 'a', title: 'Gösta Berlings Saga' },
        { id: 'b', title: 'Café Größenwahn ☕' },
        { id: 'c', title: '100 € für die Sterne' },
      ];
      const url = d5.buildShareUrl(items);
      assert.ok(url);
      const original = window.location.href;
      window.history.replaceState({}, '', url);
      try {
        const shared = d5.readSharedFromUrl();
        assert.ok(shared);
        assert.deepEqual(shared.ids, ['a', 'b', 'c']);
        assert.deepEqual(shared.t, [
          'Gösta Berlings Saga',
          'Café Größenwahn ☕',
          '100 € für die Sterne',
        ]);
      } finally {
        window.history.replaceState({}, '', original);
      }
    });

    it('returns null when building a share URL with no items', () => {
      const app = makeStubApp();
      const d5 = new DailyTop5(app);
      assert.equal(d5.buildShareUrl([]), null);
      assert.equal(d5.buildShareUrl(null), null);
    });

    it('reads a shared payload back from the URL', () => {
      const app = makeStubApp();
      const d5 = new DailyTop5(app);
      const items = [{ id: 'x', title: 'X' }, { id: 'y', title: 'Y' }];
      const url = d5.buildShareUrl(items);
      // Mutate the current URL to the share URL
      const original = window.location.href;
      window.history.replaceState({}, '', url);
      try {
        const shared = d5.readSharedFromUrl();
        assert.ok(shared);
        assert.equal(shared.v, 1);
        assert.deepEqual(shared.ids, ['x', 'y']);
      } finally {
        window.history.replaceState({}, '', original);
      }
    });

    it('returns null when no d5 param is present', () => {
      const app = makeStubApp();
      const d5 = new DailyTop5(app);
      assert.equal(d5.readSharedFromUrl(), null);
    });
  });

  describe('onRefresh callback', () => {
    it('fires when a fresh list is built', async () => {
      const app = makeStubApp({ currentCards: [{ id: 'c1', title: 'C1' }] });
      const d5 = new DailyTop5(app);
      let called = null;
      d5.onRefresh = (payload) => { called = payload; };
      await d5.getToday();
      assert.ok(called);
      assert.equal(called.items[0].id, 'c1');
    });

    it('does NOT fire when serving a cached list', async () => {
      const app = makeStubApp({ currentCards: [{ id: 'c1', title: 'C1' }] });
      const d5 = new DailyTop5(app);
      await d5.getToday(); // populate cache
      let callCount = 0;
      d5.onRefresh = () => { callCount++; };
      await d5.getToday(); // should be cache hit
      assert.equal(callCount, 0, 'onRefresh should not fire on cache hit');
    });
  });

  describe('clear', () => {
    it('removes the cache from localStorage', async () => {
      const app = makeStubApp({ currentCards: [{ id: 'c1', title: 'C1' }] });
      const d5 = new DailyTop5(app);
      await d5.getToday();
      assert.ok(window.localStorage.getItem('bs-daily-top5'));
      d5.clear();
      assert.equal(window.localStorage.getItem('bs-daily-top5'), null);
    });
  });
});

// ===== StreakTracker =====

describe('StreakTracker', () => {
  beforeEach(() => {
    clearStorage();
  });
  afterEach(() => {
    clearStorage();
  });

  it('starts at 0 current streak', () => {
    const app = makeStubApp();
    const streak = new StreakTracker(app);
    const data = streak.getData();
    assert.equal(data.current, 0);
    assert.equal(data.best, 0);
  });

  it('increments to 1 on first swipe of the day', () => {
    const app = makeStubApp();
    const streak = new StreakTracker(app);
    const result = streak.recordSwipe();
    assert.equal(result.updated, true);
    assert.equal(result.current, 1);
  });

  it('keeps streak alive when swiping on consecutive days', () => {
    const app = makeStubApp();
    // Seed with yesterday's date key (1 day ago) so _load() treats it as
    // a live streak (consecutive day, not broken).
    setStoredStreak({
      version: 1,
      current: 3,
      best: 3,
      todayKey: localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      todayCount: 5, // already hit goal yesterday
      totalSwipes: 0,
      lastMilestone: [3],
      goal: 1,
    });
    const streak = new StreakTracker(app, { dailyGoal: 1 });
    // Today: 1 swipe — streak goes from 3 to 4
    const result = streak.recordSwipe();
    assert.equal(result.current, 4);
  });

  it('breaks the streak when a full day is skipped', () => {
    const app = makeStubApp();
    setStoredStreak({
      version: 1,
      current: 5,
      best: 5,
      todayKey: '1990-01-01', // ancient
      todayCount: 0,
      totalSwipes: 0,
      lastMilestone: [],
      goal: 5,
    });
    const streak = new StreakTracker(app);
    // The constructor's _load detects the dead streak
    const data = streak.getData();
    assert.equal(data.current, 0, 'streak should be broken after a full day of inactivity');
  });

  it('detects daily goal and fires onGoalReached callback', () => {
    const app = makeStubApp();
    const streak = new StreakTracker(app, { dailyGoal: 3 });
    let goalPayload = null;
    streak.onGoalReached = (p) => { goalPayload = p; };
    for (let i = 0; i < 3; i++) streak.recordSwipe();
    assert.ok(goalPayload, 'onGoalReached should fire when daily goal is met');
    assert.equal(goalPayload.count, 3);
  });

  it('fires milestone on 3-day streak with confetti payload', () => {
    const app = makeStubApp();
    // Seed with a 2-day streak ending yesterday (consecutive day, not broken)
    setStoredStreak({
      version: 1,
      current: 2,
      best: 2,
      todayKey: localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      todayCount: 1, // already hit goal yesterday
      totalSwipes: 10,
      lastMilestone: [],
      goal: 1,
    });
    const streak = new StreakTracker(app, { dailyGoal: 1 });
    let milestoneHit = null;
    streak.onMilestone = (m, payload) => { milestoneHit = { m, payload }; };
    const result = streak.recordSwipe();
    assert.equal(result.milestone, 3);
    assert.equal(milestoneHit.m, 3);
    assert.deepEqual(milestoneHit.payload.confetti, STREAK_CONFETTI[3]);
  });

  it('does NOT re-fire a milestone once it has been earned', () => {
    const app = makeStubApp();
    setStoredStreak({
      version: 1,
      current: 3,
      best: 3,
      todayKey: localDateKey(),
      todayCount: 1,
      totalSwipes: 10,
      lastMilestone: [3], // already earned
      goal: 1,
    });
    const streak = new StreakTracker(app, { dailyGoal: 1 });
    let milestoneHit = null;
    streak.onMilestone = (m) => { milestoneHit = m; };
    streak.recordSwipe();
    assert.equal(milestoneHit, null, 'milestone 3 should not re-fire');
  });

  it('tracks best streak separately from current', () => {
    const app = makeStubApp();
    // Seed with yesterday's date key (consecutive day) and a past-peak best
    setStoredStreak({
      version: 1,
      current: 1,
      best: 10, // past peak
      todayKey: localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      todayCount: 1,
      totalSwipes: 50,
      lastMilestone: [3, 7],
      goal: 1,
    });
    const streak = new StreakTracker(app, { dailyGoal: 1 });
    const data = streak.getData();
    assert.equal(data.best, 10, 'best should be preserved');
    assert.equal(data.current, 1, 'current resets after broken streak');
  });

  it('getTodayProgress returns 0% on a new day', () => {
    const app = makeStubApp();
    const streak = new StreakTracker(app, { dailyGoal: 5 });
    const p = streak.getTodayProgress();
    assert.equal(p.count, 0);
    assert.equal(p.goal, 5);
    assert.equal(p.percent, 0);
  });

  it('getTodayProgress reflects swipes today', () => {
    const app = makeStubApp();
    const streak = new StreakTracker(app, { dailyGoal: 10 });
    for (let i = 0; i < 3; i++) streak.recordSwipe();
    const p = streak.getTodayProgress();
    assert.equal(p.count, 3);
    assert.equal(p.percent, 0.3);
  });

  it('setDailyGoal clamps to 1..50', () => {
    const app = makeStubApp();
    const streak = new StreakTracker(app);
    assert.equal(streak.setDailyGoal(0), 1);
    assert.equal(streak.setDailyGoal(100), 50);
    assert.equal(streak.setDailyGoal(7), 7);
  });

  it('reset clears all streak data', () => {
    const app = makeStubApp();
    setStoredStreak({
      version: 1, current: 10, best: 10,
      todayKey: localDateKey(), todayCount: 5, totalSwipes: 100,
      lastMilestone: [3, 7], goal: 5,
    });
    const streak = new StreakTracker(app);
    streak.reset();
    const data = streak.getData();
    assert.equal(data.current, 0);
    assert.equal(data.best, 0);
    assert.equal(data.todayCount, 0);
    assert.deepEqual(data.lastMilestone, []);
  });

  it('skipToday marks today as rested without breaking the streak', () => {
    const app = makeStubApp();
    setStoredStreak({
      version: 1, current: 4, best: 4,
      todayKey: '1990-01-01', todayCount: 0, totalSwipes: 20,
      lastMilestone: [3], goal: 5,
    });
    const streak = new StreakTracker(app, { dailyGoal: 5 });
    const before = streak.getData().current;
    streak.skipToday();
    const after = streak.getData();
    // Skip should bump the streak to 5 (it counts as activity)
    assert.ok(after.current >= before, 'skipToday should not decrease the streak');
  });

  it('skipToday sets the rested flag for today', () => {
    const app = makeStubApp();
    const streak = new StreakTracker(app, { dailyGoal: 5 });
    streak.skipToday();
    const stored = getStoredStreak();
    assert.equal(stored.rested, localDateKey(), 'rested should be set to today\'s dateKey');
  });

  it('getTodayProgress reports rested=true after skipToday', () => {
    const app = makeStubApp();
    const streak = new StreakTracker(app, { dailyGoal: 5 });
    assert.equal(streak.getTodayProgress().rested, false, 'should not be rested initially');
    streak.skipToday();
    assert.equal(streak.getTodayProgress().rested, true, 'should be rested after skipToday');
  });

  it('getTodayProgress reports rested=false on a new day after skipToday', () => {
    const app = makeStubApp();
    // Seed with yesterday as rested day
    const yesterday = localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    setStoredStreak({
      version: 1, current: 3, best: 3,
      todayKey: yesterday, todayCount: 0, totalSwipes: 15,
      lastMilestone: [3], goal: 5, rested: yesterday,
    });
    const streak = new StreakTracker(app, { dailyGoal: 5 });
    assert.equal(streak.getTodayProgress().rested, false, 'rested flag should reset on a new day');
  });

  it('skipToday fires the onStreakUpdated callback', () => {
    const app = makeStubApp();
    const streak = new StreakTracker(app, { dailyGoal: 5 });
    let called = false;
    streak.onStreakUpdated = () => { called = true; };
    streak.skipToday();
    assert.ok(called, 'onStreakUpdated should fire after skipToday');
  });

  it('skipToday does not affect future day streaks', () => {
    const app = makeStubApp();
    const streak = new StreakTracker(app, { dailyGoal: 5 });
    streak.skipToday();
    const afterSkip = streak.getData();
    assert.equal(afterSkip.current, 1, 'skipToday should bump streak to 1 on first use');
    // Simulate next day by modifying stored data
    const yesterday = localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    setStoredStreak({
      version: 1, current: afterSkip.current, best: afterSkip.current,
      todayKey: yesterday, todayCount: 0, totalSwipes: afterSkip.totalSwipes,
      lastMilestone: [], goal: 5, rested: yesterday,
    });
    const streak2 = new StreakTracker(app, { dailyGoal: 5 });
    const result = streak2.recordSwipe();
    assert.equal(result.current, 2, 'streak should continue after a rest day');
  });
});

describe('Streak pill dropdown markup', () => {
  it('renders dropdown with rest-today button when streak is active', () => {
    // _renderStreakPill is an App method — test the model-level signal it reads
    const app = makeStubApp();
    setStoredStreak({
      version: 1, current: 5, best: 5,
      todayKey: localDateKey(), todayCount: 2, totalSwipes: 25,
      lastMilestone: [3], goal: 5,
    });
    const streak = new StreakTracker(app, { dailyGoal: 5 });
    const progress = streak.getTodayProgress();
    assert.equal(progress.rested, false, 'not rested yet');
    assert.ok(progress.count > 0, 'has swipes today');
    // After skip, the rested flag should flip
    streak.skipToday();
    const afterSkip = streak.getTodayProgress();
    assert.equal(afterSkip.rested, true, 'should be rested after skipToday');
    // The pill should NOT render at current=0
    const freshApp = makeStubApp();
    clearStorage();
    const freshStreak = new StreakTracker(freshApp, { dailyGoal: 5 });
    assert.equal(freshStreak.getData().current, 0);
  });
});

describe('STREAK_CONFETTI', () => {
  it('has a config for every milestone', () => {
    for (const m of [3, 7, 14, 30, 100, 365]) {
      assert.ok(STREAK_CONFETTI[m], `milestone ${m} should have a confetti config`);
      assert.ok(Array.isArray(STREAK_CONFETTI[m].colors));
      assert.ok(STREAK_CONFETTI[m].colors.length >= 2);
      assert.ok(typeof STREAK_CONFETTI[m].count === 'number');
      assert.ok(typeof STREAK_CONFETTI[m].spread === 'number');
    }
  });

  it('confetti count scales with milestone size (variable reward)', () => {
    // Higher milestones should fire MORE confetti for a bigger "wow" moment
    assert.ok(STREAK_CONFETTI[365].count > STREAK_CONFETTI[100].count);
    assert.ok(STREAK_CONFETTI[100].count > STREAK_CONFETTI[30].count);
    assert.ok(STREAK_CONFETTI[30].count > STREAK_CONFETTI[7].count);
    assert.ok(STREAK_CONFETTI[7].count > STREAK_CONFETTI[3].count);
  });
});
