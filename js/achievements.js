/**
 * BookSwipe Achievement System
 * Gamification: badges, milestones, and unlock notifications.
 */

const STORAGE_KEY = 'bs-achievements';

const ACHIEVEMENTS = {
  genre_explorer_5:  { id:'genre_explorer_5',  icon:'🎨', name_de:'Genre-Entdecker',     name_en:'Genre Explorer',     desc_de:'5 verschiedene Genres gemocht',   desc_en:'Liked 5 different genres',   tier:'bronze' },
  genre_explorer_15: { id:'genre_explorer_15', icon:'🎨', name_de:'Genre-Kenner',        name_en:'Genre Connoisseur',   desc_de:'15 verschiedene Genres gemocht',  desc_en:'Liked 15 different genres',  tier:'silver' },
  genre_explorer_30: { id:'genre_explorer_30', icon:'🎨', name_de:'Genre-Meister',       name_en:'Genre Master',        desc_de:'30 verschiedene Genres gemocht',  desc_en:'Liked 30 different genres',  tier:'gold' },
  speed_demon:       { id:'speed_demon',       icon:'⚡', name_de:'Schnelldenker',       name_en:'Speed Demon',         desc_de:'50 Swipes in einer Sitzung',     desc_en:'50 swipes in one session',   tier:'silver' },
  night_owl:         { id:'night_owl',         icon:'🦉', name_de:'Nachtmensch',         name_en:'Night Owl',           desc_de:'Nach Mitternacht geswiped',      desc_en:'Swiped after midnight',      tier:'bronze' },
  century:           { id:'century',           icon:'💯', name_de:'Hunderter-Club',      name_en:'Century Club',        desc_de:'100+ Swipes insgesamt',           desc_en:'100+ total swipes',          tier:'bronze' },
  millennium:        { id:'millennium',        icon:'🏆', name_de:'Tausender-Club',      name_en:'Millennium Club',     desc_de:'1000+ Swipes insgesamt',          desc_en:'1000+ total swipes',         tier:'gold' },
  globetrotter:      { id:'globetrotter',      icon:'🌍', name_de:'Weltenbummler',       name_en:'Globetrotter',        desc_de:'Medien aus 10 Ländern entdeckt',  desc_en:'Media from 10 countries',    tier:'gold' },
  bookworm:          { id:'bookworm',          icon:'📚', name_de:'Bücherwurm',          name_en:'Bookworm',            desc_de:'20+ Bücher gemocht',              desc_en:'Liked 20+ books',            tier:'silver' },
  cinephile:         { id:'cinephile',         icon:'🎬', name_de:'Cineast',             name_en:'Cinephile',           desc_de:'50+ Filme gemocht',               desc_en:'Liked 50+ movies',           tier:'silver' },
  gamer:             { id:'gamer',             icon:'🎮', name_de:'Zocker',              name_en:'Gamer',               desc_de:'20+ Spiele gemocht',              desc_en:'Liked 20+ games',            tier:'silver' },
  completionist:     { id:'completionist',     icon:'✅', name_de:'Komplettist',         name_en:'Completionist',       desc_de:'Eine ganze Reihe vervollständigt', desc_en:'Completed a franchise',      tier:'gold' },
  blind_date_lover:  { id:'blind_date_lover',  icon:'🎭', name_de:'Blind-Date-Fan',      name_en:'Blind Date Fan',      desc_de:'20 Blind-Date-Swipes',            desc_en:'20 blind date swipes',       tier:'bronze' },
  week_streak_3:     { id:'week_streak_3',     icon:'🔥', name_de:'Dranbleiber',         name_en:'Streak Keeper',       desc_de:'3 Wochen in Folge aktiv',          desc_en:'Active 3 weeks in a row',    tier:'bronze' },
  week_streak_7:     { id:'week_streak_7',     icon:'🔥', name_de:'Gewohnheitstier',     name_en:'Dedicated',           desc_de:'7 Wochen in Folge aktiv',          desc_en:'Active 7 weeks in a row',    tier:'silver' },
  wildcard_finder:   { id:'wildcard_finder',   icon:'🎲', name_de:'Wildcard-Finder',     name_en:'Wildcard Finder',     desc_de:'10 Wildcard-Überraschungen gemocht', desc_en:'Liked 10 wildcard surprises', tier:'bronze' },
};

function getData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { unlocked:{}, progress:{}, notifications:[] };
  } catch { return { unlocked:{}, progress:{}, notifications:[] }; }
}

function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

export class AchievementSystem {
  constructor(app) {
    this.app = app;
    this.data = getData();
    // Track session swipes for speed_demon
    this._sessionSwipes = 0;
    this._checkTimer = null;
  }

  /** Call after every swipe to check for unlocks */
  trackSwipe(item, direction) {
    this._sessionSwipes++;

    // Count ALL swipes for total_swipes (century/millennium achievements)
    const meta = getData();
    meta.progress.total_swipes = (meta.progress.total_swipes || 0) + 1;

    // Only count like-specific progress for right swipes
    if (direction !== 'right') { saveData(meta); return; }
    const de = this.app.lang === 'de';

    // Update progress counters
    const genres = (item.genres || []).map(g => typeof g === 'string' ? g : g.name || String(g));
    meta.progress.unique_genres = meta.progress.unique_genres || [];
    genres.forEach(g => {
      if (!meta.progress.unique_genres.includes(g.toLowerCase())) {
        meta.progress.unique_genres.push(g.toLowerCase());
      }
    });
    meta.progress.total_likes = (meta.progress.total_likes || 0) + 1;

    // Type-specific counts
    const type = item.type || item.source;
    if (type === 'book' || item.source === 'openlibrary' || item.source === 'gbooks') {
      meta.progress.book_likes = (meta.progress.book_likes || 0) + 1;
    } else if (type === 'game' || item.source === 'igdb') {
      meta.progress.game_likes = (meta.progress.game_likes || 0) + 1;
    } else {
      meta.progress.movie_likes = (meta.progress.movie_likes || 0) + 1;
    }

    // Blind date tracking
    if (this.app.state.blindDateMode) {
      meta.progress.blind_swipes = (meta.progress.blind_swipes || 0) + 1;
    }

    // Wildcard tracking
    if (this.app._currentWildcard) {
      meta.progress.wildcard_likes = (meta.progress.wildcard_likes || 0) + 1;
    }

    // Globetrotter: track unique countries from item origin
    const country = item.countryTag || null;
    if (country) {
      meta.progress.unique_countries = meta.progress.unique_countries || [];
      if (!meta.progress.unique_countries.includes(country)) {
        meta.progress.unique_countries.push(country);
      }
    }

    saveData(meta);

    // Check achievements
    const checks = [
      { id:'genre_explorer_5',  cond: meta.progress.unique_genres.length >= 5 },
      { id:'genre_explorer_15', cond: meta.progress.unique_genres.length >= 15 },
      { id:'genre_explorer_30', cond: meta.progress.unique_genres.length >= 30 },
      { id:'century',           cond: meta.progress.total_swipes >= 100 },
      { id:'millennium',        cond: meta.progress.total_swipes >= 1000 },
      { id:'bookworm',          cond: (meta.progress.book_likes || 0) >= 20 },
      { id:'cinephile',         cond: (meta.progress.movie_likes || 0) >= 50 },
      { id:'gamer',             cond: (meta.progress.game_likes || 0) >= 20 },
      { id:'blind_date_lover',  cond: (meta.progress.blind_swipes || 0) >= 20 },
      { id:'wildcard_finder',   cond: (meta.progress.wildcard_likes || 0) >= 10 },
      { id:'globetrotter',      cond: (meta.progress.unique_countries || []).length >= 10 },
    ];

    for (const check of checks) {
      if (check.cond && !meta.unlocked[check.id]) {
        meta.unlocked[check.id] = Date.now();
        const ach = ACHIEVEMENTS[check.id];
        if (ach) {
          meta.notifications = meta.notifications || [];
          meta.notifications.push(check.id);
          this._showUnlockToast(ach, de);
        }
      }
    }

    // Speed demon: check on session end
    if (this._sessionSwipes >= 50 && !meta.unlocked.speed_demon) {
      meta.unlocked.speed_demon = Date.now();
      meta.notifications.push('speed_demon');
      this._showUnlockToast(ACHIEVEMENTS.speed_demon, de);
    }

    // Night owl check
    const hour = new Date().getHours();
    if ((hour >= 0 && hour < 5) && !meta.unlocked.night_owl) {
      meta.unlocked.night_owl = Date.now();
      meta.notifications.push('night_owl');
      this._showUnlockToast(ACHIEVEMENTS.night_owl, de);
    }

    saveData(meta);
  }

  _showUnlockToast(ach, de) {
    import('./toast.js').then(({ showToast }) => {
      showToast(`${ach.icon} ${de ? ach.name_de : ach.name_en} ${de ? 'freigeschaltet!' : 'unlocked!'}`, {
        type: 'success', duration: 4000
      });
    }).catch(() => {});
  }

  /** Call on session end (visibility hidden / beforeunload) */
  endSession() {
    this._sessionSwipes = 0;
    const meta = getData();
    // Track weekly activity for streak
    const week = getWeekNumber(new Date());
    const activeWeeks = meta.progress.active_weeks || [];
    if (!activeWeeks.includes(week)) {
      activeWeeks.push(week);
      activeWeeks.sort((a, b) => a - b);
      // Count consecutive weeks
      let streak = 1;
      for (let i = activeWeeks.length - 2; i >= 0; i--) {
        if (activeWeeks[i + 1] - activeWeeks[i] <= 1) streak++;
        else break;
      }
      meta.progress.week_streak = streak;
      meta.progress.active_weeks = activeWeeks;
      saveData(meta);

      if (streak >= 3 && !meta.unlocked.week_streak_3) {
        meta.unlocked.week_streak_3 = Date.now();
        meta.notifications.push('week_streak_3');
        saveData(meta);
        this._showUnlockToast(ACHIEVEMENTS.week_streak_3, this.app.lang === 'de');
      }
      if (streak >= 7 && !meta.unlocked.week_streak_7) {
        meta.unlocked.week_streak_7 = Date.now();
        meta.notifications.push('week_streak_7');
        saveData(meta);
        this._showUnlockToast(ACHIEVEMENTS.week_streak_7, this.app.lang === 'de');
      }
    } else {
      // Just update existing week
      meta.progress.active_weeks = activeWeeks;
      saveData(meta);
    }
  }

  /** Mark franchise completion */
  unlockCompletionist() {
    const meta = getData();
    if (!meta.unlocked.completionist) {
      meta.unlocked.completionist = Date.now();
      meta.notifications.push('completionist');
      saveData(meta);
      this._showUnlockToast(ACHIEVEMENTS.completionist, this.app.lang === 'de');
    }
  }

  getUnlocked() {
    return getData().unlocked || {};
  }

  getProgress() {
    return getData().progress || {};
  }

  getAllAchievements() {
    return ACHIEVEMENTS;
  }

  /** Clear all notifications (called after showing them) */
  clearNotifications() {
    const meta = getData();
    meta.notifications = [];
    saveData(meta);
  }

  /** Reset all achievement data */
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this.data = getData();
  }
}

function getWeekNumber(d) {
  const start = new Date(Date.UTC(d.getFullYear(), 0, 1));
  const diff = d - start;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
}

/** Render the achievement gallery UI */
export function renderAchievements(app, achiever) {
  const de = app.lang === 'de';
  const unlocked = achiever.getUnlocked();
  const all = achiever.getAllAchievements();
  const tiers = { gold: [], silver: [], bronze: [] };

  Object.values(all).forEach(ach => {
    const tier = ach.tier || 'bronze';
    tiers[tier].push(ach);
  });

  const tierColors = { gold:'#ffd700', silver:'#c0c0c0', bronze:'#cd7f32' };
  const tierNames = { gold: de?'Gold':'Gold', silver: de?'Silber':'Silver', bronze: de?'Bronze':'Bronze' };

  let html = `<div class="achievements-view">`;

  for (const tier of ['gold', 'silver', 'bronze']) {
    if (!tiers[tier].length) continue;
    html += `<div class="ach-tier-section">`;
    html += `<h3 class="ach-tier-title" style="color:${tierColors[tier]}">${tier === 'gold' ? '👑' : tier === 'silver' ? '🥈' : '🥉'} ${tierNames[tier]}</h3>`;
    html += `<div class="ach-grid">`;
    for (const ach of tiers[tier]) {
      const isUnlocked = !!unlocked[ach.id];
      const unlockedDate = unlocked[ach.id] ? new Date(unlocked[ach.id]).toLocaleDateString(de ? 'de-DE' : 'en-US') : '';
      html += `
        <div class="ach-card ${isUnlocked ? 'unlocked' : 'locked'}">
          <span class="ach-icon">${ach.icon}</span>
          <span class="ach-name">${de ? ach.name_de : ach.name_en}</span>
          <span class="ach-desc">${de ? ach.desc_de : ach.desc_en}</span>
          ${isUnlocked ? `<span class="ach-date">${unlockedDate}</span>` : `<span class="ach-locked-icon">🔒</span>`}
        </div>`;
    }
    html += `</div></div>`;
  }

  // Progress summary
  const progress = achiever.getProgress();
  html += `
    <div class="ach-progress-section">
      <h3>${de ? 'Dein Fortschritt' : 'Your Progress'}</h3>
      <div class="ach-progress-grid">
        <div class="ach-prog-item"><span class="ach-prog-val">${progress.total_swipes || 0}</span><span class="ach-prog-label">${de?'Swipes':'Swipes'}</span></div>
        <div class="ach-prog-item"><span class="ach-prog-val">${progress.total_likes || 0}</span><span class="ach-prog-label">${de?'Likes':'Likes'}</span></div>
        <div class="ach-prog-item"><span class="ach-prog-val">${(progress.unique_genres || []).length}</span><span class="ach-prog-label">${de?'Genres':'Genres'}</span></div>
        <div class="ach-prog-item"><span class="ach-prog-val">${progress.week_streak || 0}</span><span class="ach-prog-label">${de?'Wochen-Streak':'Week Streak'}</span></div>
      </div>
    </div>`;

  html += `</div>`;
  return html;
}
