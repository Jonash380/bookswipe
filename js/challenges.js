/**
 * BookSwipe Weekly Challenges
 * Curated challenges that refresh weekly and encourage discovery.
 */

const STORAGE_KEY = 'bs-challenges';

// Pool of challenges — cycled weekly
const CHALLENGE_POOL = [
  { id:'decade_explorer',  icon:'📅', title_de:'Zeitreisender',  title_en:'Time Traveler',    desc_de:'Entdecke 3 Medien aus einem Jahrzehnt vor 1980', desc_en:'Discover 3 items from a pre-1980 decade', target:3, type:'decade', decade:'pre1980' },
  { id:'foreign_film',     icon:'🗺️', title_de:'Fernweher',       title_en:'World Explorer',   desc_de:'Möge 3 nicht-deutschsprachige Titel',           desc_en:'Like 3 non-English titles',                 target:3, type:'language', lang:'not-de' },
  { id:'indie_lover',      icon:'💎', title_de:'Indie-Liebhaber', title_en:'Indie Lover',      desc_de:'Entdecke 5 Titel mit unter 100 Bewertungen',   desc_en:'Discover 5 titles under 100 ratings',       target:5, type:'underrated' },
  { id:'genre_bender',     icon:'🔄', title_de:'Genre-Brecher',   title_en:'Genre Bender',     desc_de:'Möge ein Genre, das du normalerweise ablehnst',desc_en:'Like a genre you usually skip',             target:1, type:'genre_bend' },
  { id:'binge_weekend',    icon:'🍿', title_de:'Binge-Wochenende',title_en:'Binge Weekend',     desc_de:'5 Swipes an einem Tag',                        desc_en:'5 swipes in a single day',                  target:5, type:'daily_swipes' },
  { id:'author_deep_dive', icon:'✍️', title_de:'Autoren-Taucher', title_en:'Author Deep Dive',  desc_de:'Möge 3 Werke desselben Autors',                desc_en:'Like 3 works by the same author',            target:3, type:'same_author' },
  { id:'critic_match',     icon:'⭐', title_de:'Kritiker-Liebling',title_en:'Critic Darling',   desc_de:'Möge 3 Titel mit 4+ Sternen',                  desc_en:'Like 3 titles rated 4+ stars',              target:3, type:'high_rated' },
  { id:'short_n_sweet',    icon:'⚡', title_de:'Kurz & knackig',  title_en:'Short & Sweet',    desc_de:'Entdecke 3 Kurzfilme oder Spiele unter 5 Std',desc_en:'Discover 3 short films or games under 5h',   target:3, type:'short' },
  { id:'nostalgia_trip',   icon:'📼', title_de:'Nostalgie-Trip',  title_en:'Nostalgia Trip',   desc_de:'Entdecke 3 Titel aus der Vor-Streaming-Ära', desc_en:'Discover 3 pre-streaming era titles',   target:3, type:'birth_decade' },
  { id:'green_light',      icon:'💚', title_de:'Grüne Welle',     title_en:'Green Wave',       desc_de:'10 Likes ohne einen Nope',                     desc_en:'10 likes with zero nopes',                  target:10, type:'like_streak' },
];

function getData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function getWeekId() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), 0, 1));
  return Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000));
}

/** Deterministically pick 3 challenges for a given week */
function getWeeklyChallenges(weekId) {
  // Seed-based shuffle using weekId
  let seed = weekId;
  function pseudoRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  const pool = [...CHALLENGE_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRandom() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export class ChallengeSystem {
  constructor(app) {
    this.app = app;
    this.data = getData();
    this.weekId = getWeekId();
    if (this.data.weekId !== this.weekId) {
      this.data = { weekId: this.weekId, challenges: {}, progress: {} };
      saveData(this.data);
    }
    this.challenges = getWeeklyChallenges(this.weekId);
  }

  trackSwipe(item, direction) {
    const p = this.data.progress;

    // Reset like streak on nope (must run before early return for 'left' direction)
    if (direction === 'left') {
      Object.keys(p).forEach(k => {
        if (this.challenges.find(c => c.id === k && c.type === 'like_streak')) {
          p[k].count = 0;
        }
      });
      saveData(this.data);
      return;
    }

    // Only count challenge progress for likes (right swipes)
    if (direction !== 'right') return;

    this.challenges.forEach(ch => {
      const key = ch.id;
      p[key] = p[key] || { count: 0, items: [] };

      let matches = false;
      const year = item.year || (item.release_date ? parseInt(item.release_date) : null);
      switch (ch.type) {
        case 'decade':
          matches = year && year < 1980;
          break;
        case 'language':
          matches = item.original_language && item.original_language !== 'de' && item.original_language !== 'en';
          break;
        case 'underrated':
          matches = item.vote_count && item.vote_count < 100;
          break;
        case 'genre_bend':
          // Match if genre is in user's disliked/top-noped genres
          matches = this._isGenreBend(item);
          break;
        case 'daily_swipes':
          matches = true;
          break;
        case 'same_author':
          if (item.author) {
            const prev = (p[key].author || '');
            if (!prev) { p[key].author = item.author; matches = true; }
            else if (prev === item.author) matches = true;
          }
          break;
        case 'high_rated':
          matches = item.rating && parseFloat(item.rating) >= 4.0;
          break;
        case 'short':
          matches = (item.playtime && item.playtime <= 5) || (item.runtime && item.runtime <= 30);
          break;
        case 'birth_decade':
          // Match items from any pre-2005 decade (nostalgia/pre-streaming era)
          // since we don't have the user's actual birth year
          matches = year && year < 2005;
          break;
        case 'like_streak':
          matches = true;
          break;
      }

      if (matches && !p[key].items.includes(item.id)) {
        p[key].count++;
        p[key].items.push(item.id);
        if (p[key].count >= ch.target) {
          this._completeChallenge(ch);
        }
      }
    });

    saveData(this.data);
  }

  _isGenreBend(item) {
    // Check if this genre is one the user typically dislikes
    const profile = this.app.recommender?.profile;
    if (!profile || !profile.genreWeights) return false;
    const genres = (item.genres || []).map(g => typeof g === 'string' ? g : g.name || String(g));
    return genres.some(g => (profile.genreWeights[g] || 0) < -1);
  }

  _completeChallenge(ch) {
    const de = this.app.lang === 'de';
    const key = `completed_${ch.id}`;
    if (this.data[key]) return;
    this.data[key] = Date.now();

    import('./toast.js').then(({ showToast }) => {
      showToast(`${ch.icon} ${de ? ch.title_de : ch.title_en} ${de ? 'abgeschlossen!' : 'completed!'}`, {
        type: 'success', duration: 4000
      });
    }).catch(() => {});

    saveData(this.data);
  }

  getChallenges() {
    return this.challenges;
  }

  getProgress() {
    return this.data.progress || {};
  }

  isCompleted(challengeId) {
    return !!this.data[`completed_${challengeId}`];
  }
}

/** Render the challenges UI */
export function renderChallenges(app, challengeSystem) {
  const de = app.lang === 'de';
  const challenges = challengeSystem.getChallenges();
  const progress = challengeSystem.getProgress();

  let html = `<div class="challenges-view">`;
  html += `<div class="challenges-header">`;
  html += `<h2>🎯 ${de ? 'Wöchentliche Challenges' : 'Weekly Challenges'}</h2>`;
  html += `<p>${de ? 'Neue Challenges jeden Montag' : 'New challenges every Monday'}</p>`;
  html += `</div>`;

  for (const ch of challenges) {
    const p = progress[ch.id] || { count: 0 };
    const done = challengeSystem.isCompleted(ch.id);
    const pct = Math.min(100, Math.round((p.count / ch.target) * 100));

    html += `
      <div class="challenge-card ${done ? 'completed' : ''}">
        <div class="challenge-icon">${ch.icon}</div>
        <div class="challenge-info">
          <span class="challenge-title">${de ? ch.title_de : ch.title_en}</span>
          <span class="challenge-desc">${de ? ch.desc_de : ch.desc_en}</span>
          <div class="challenge-progress">
            <div class="challenge-bar-track">
              <div class="challenge-bar-fill" style="width:${pct}%"></div>
            </div>
            <span class="challenge-count">${done ? '✅' : `${p.count}/${ch.target}`}</span>
          </div>
        </div>
      </div>`;
  }

  html += `</div>`;
  return html;
}
