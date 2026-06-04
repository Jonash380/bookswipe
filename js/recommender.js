import { TMDB_GENRE_MAP, safeGetJSON, safeSetJSON } from './utils.js';
import { mapTMDBTags, computeVibeScores } from './tag_mapper.js';
import { GAME_GENRE_NAME_MAP } from './games.js';

const W = { genre:15, mood:20, era:-30, trope:10, pacing:8, aesthetic:7, warning:-5, boost:8, block:-40, decay:0.95,
  platform:25, playtime:12, mechanic:10, multiplayer:8, theme:10 };

export class Recommender {
  constructor(app) {
    this.app = app;
    this.cache = new Map();
    this.genreCounts = new Map();
    this.tagCounts = new Map();
    this._loadProfile();
  }

  _loadProfile() {
    this.profile = safeGetJSON('bs-rec-profile', {
      genreWeights: {}, tagWeights: {}, eraPreference: null,
      tropes: {}, pacingStyles: {}, aesthetics: {}, warnings: {},
      totalSwipes: 0, likeRatio: 0,
      gamePlatformWeights: {}, gameMechanicWeights: {}, gameThemeWeights: {}
    });
  }

  _saveProfile() {
    safeSetJSON('bs-rec-profile', this.profile);
  }

  score(item) {
    if (this.cache.has(item.id)) return this.cache.get(item.id);
    let score = 50;
    const s = this.app.state;
    const isGame = item.type === 'game' || item.source === 'igdb';

    if (isGame) {
      score = this._scoreGame(item, score, s);
    } else {
      score = this._scoreMedia(item, score, s);
    }

    score = Math.max(0, Math.min(100, score));
    this.cache.set(item.id, score);
    return score;
  }

  _scoreMedia(item, score, s) {
    if (item.genres && s.selectedGenres?.length) {
      const overlap = item.genres.filter(g => s.selectedGenres.includes(g.id || g));
      score += overlap.length * W.genre;
    }

    if (item.tags && s.selectedMoods?.length) {
      const moodOverlap = item.tags.filter(t => s.selectedMoods.includes(t));
      score += moodOverlap.length * W.mood;
    }

    if (item.year || item.release_date) {
      const y = item.year || parseInt(item.release_date);
      if (s.eraFilter !== 'all' && s.eraFilter) {
        const eraRanges = { classic: [1900,1970], modern: [1970,2010], current: [2010,2026] };
        const r = eraRanges[s.eraFilter];
        if (r && (y < r[0] || y > r[1])) score += W.era;
      }
    }

    const dna = item.mediaDNA || {};
    if (dna.tropes) {
      const tropeOverlap = dna.tropes.filter(t => this.profile.tropes[t]);
      score += tropeOverlap.length * W.trope;
    }
    if (dna.pacing) {
      const pacingMatch = dna.pacing.filter(p => this.profile.pacingStyles[p]);
      score += pacingMatch.length * W.pacing;
    }
    if (dna.aesthetic) {
      const aestMatch = dna.aesthetic.filter(a => this.profile.aesthetics[a]);
      score += aestMatch.length * W.aesthetic;
    }
    if (dna.warnings) {
      const warnPenalty = this._computeWarningPenalty(dna.warnings);
      score += warnPenalty * W.warning;
    }

    if (s.boostedMoods?.length && item.genres) {
      const boosted = item.genres.filter(g => {
        const name = (TMDB_GENRE_MAP[g] || '').toLowerCase();
        return s.boostedMoods.some(bm => name.includes(bm));
      });
      score += boosted.length * W.boost;
    }

    if (s.blockedGenres?.length && item.genres) {
      const blocked = item.genres.filter(g => {
        const name = (TMDB_GENRE_MAP[g] || '').toLowerCase();
        return s.blockedGenres.some(bg => name.includes(bg));
      });
      if (blocked.length) score += W.block;
    }

    return score;
  }

  _scoreGame(item, score, s) {
    if (item.platforms && s.selectedPlatforms?.length) {
      const itemPlatformIds = item.platforms.map(p => p.id);
      const match = itemPlatformIds.filter(id => s.selectedPlatforms.includes(id));
      if (match.length > 0) score += W.platform;
      else score -= 15;
    }

    if (item.genres && s.selectedGenres?.length) {
      const itemGenreNames = item.genres.map(g => typeof g === 'string' ? g : (GAME_GENRE_NAME_MAP[g.id] || g.name || g));
      const selectedNames = s.selectedGenres.map(g => typeof g === 'string' ? g : (GAME_GENRE_NAME_MAP[g.id] || g.name || g));
      const overlap = itemGenreNames.filter(ng => selectedNames.some(sn =>
        ng.toLowerCase().includes(sn.toLowerCase()) || sn.toLowerCase().includes(ng.toLowerCase())
      ));
      score += overlap.length * W.genre;
    }

    if (item.tags && s.selectedMoods?.length) {
      const moodOverlap = item.tags.filter(t => s.selectedMoods.includes(t));
      score += moodOverlap.length * W.mood;
    }

    if (item.mechanics) {
      const mechOverlap = item.mechanics.filter(m => this.profile.gameMechanicWeights[m]);
      score += mechOverlap.length * W.mechanic;
    }

    if (item.themes) {
      const themeOverlap = item.themes.filter(t => this.profile.gameThemeWeights[t]);
      score += themeOverlap.length * W.theme;
    }

    const dna = item.mediaDNA || {};
    if (dna.tropes) {
      const tropeOverlap = dna.tropes.filter(t => this.profile.tropes[t]);
      score += tropeOverlap.length * W.trope;
    }
    if (dna.pacing) {
      const pacingMatch = dna.pacing.filter(p => this.profile.pacingStyles[p]);
      score += pacingMatch.length * W.pacing;
    }

    if (item.rating && item.rating >= 85) score += 5;
    if (item.rating && item.rating < 60) score -= 5;

    return score;
  }

  _computeWarningPenalty(warnings) {
    const disliked = this.profile.warnings;
    let penalty = 0;
    warnings.forEach(w => {
      if (disliked[w]) penalty -= disliked[w];
    });
    return penalty;
  }

  updateFromSwipe(item, action) {
    this.profile.totalSwipes++;
    if (action === 'like') {
      this.profile.likeRatio = (this.profile.likeRatio * (this.profile.totalSwipes - 1) + 1) / this.profile.totalSwipes;
      this._updateEntityWeights(item, 1);
    } else if (action === 'nope') {
      this.profile.likeRatio = (this.profile.likeRatio * (this.profile.totalSwipes - 1)) / this.profile.totalSwipes;
      this._updateEntityWeights(item, -1);
    }
    this._saveProfile();
    this._applyDecay();
  }

  _updateEntityWeights(item, delta) {
    const isGame = item.type === 'game' || item.source === 'igdb';
    if (isGame) {
      if (item.genres) {
        item.genres.forEach(g => {
          const name = typeof g === 'string' ? g : (GAME_GENRE_NAME_MAP[g.id] || g.name || g);
          this.profile.genreWeights[name] = (this.profile.genreWeights[name] || 0) + delta;
        });
      }
      if (item.platforms) {
        item.platforms.forEach(p => {
          this.profile.gamePlatformWeights[p.name] = (this.profile.gamePlatformWeights[p.name] || 0) + delta;
        });
      }
      if (item.mechanics) {
        item.mechanics.forEach(m => {
          this.profile.gameMechanicWeights[m] = (this.profile.gameMechanicWeights[m] || 0) + delta;
        });
      }
      if (item.themes) {
        item.themes.forEach(t => {
          this.profile.gameThemeWeights[t] = (this.profile.gameThemeWeights[t] || 0) + delta;
        });
      }
    } else {
      if (item.genres) {
        item.genres.forEach(g => {
          const name = typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g);
          this.profile.genreWeights[name] = (this.profile.genreWeights[name] || 0) + delta;
        });
      }
    }
    if (item.tags) {
      item.tags.forEach(t => {
        this.profile.tagWeights[t] = (this.profile.tagWeights[t] || 0) + delta;
      });
    }
    const dna = item.mediaDNA || {};
    if (dna.tropes) dna.tropes.forEach(t => { this.profile.tropes[t] = (this.profile.tropes[t] || 0) + delta; });
    if (dna.pacing) dna.pacing.forEach(p => { this.profile.pacingStyles[p] = (this.profile.pacingStyles[p] || 0) + delta; });
    if (dna.aesthetic) dna.aesthetic.forEach(a => { this.profile.aesthetics[a] = (this.profile.aesthetics[a] || 0) + delta; });
    if (dna.warnings && delta < 0) {
      dna.warnings.forEach(w => { this.profile.warnings[w] = (this.profile.warnings[w] || 0) + 1; });
    }
  }

  _applyDecay() {
    const decay = W.decay;
    Object.keys(this.profile.genreWeights).forEach(k => { this.profile.genreWeights[k] *= decay; });
    Object.keys(this.profile.tagWeights).forEach(k => { this.profile.tagWeights[k] *= decay; });
    Object.keys(this.profile.tropes).forEach(k => { this.profile.tropes[k] *= decay; });
    Object.keys(this.profile.pacingStyles).forEach(k => { this.profile.pacingStyles[k] *= decay; });
    Object.keys(this.profile.aesthetics).forEach(k => { this.profile.aesthetics[k] *= decay; });
    if (this.profile.gamePlatformWeights) Object.keys(this.profile.gamePlatformWeights).forEach(k => { this.profile.gamePlatformWeights[k] *= decay; });
    if (this.profile.gameMechanicWeights) Object.keys(this.profile.gameMechanicWeights).forEach(k => { this.profile.gameMechanicWeights[k] *= decay; });
    if (this.profile.gameThemeWeights) Object.keys(this.profile.gameThemeWeights).forEach(k => { this.profile.gameThemeWeights[k] *= decay; });
  }

  getTopGenres(n = 5) {
    return Object.entries(this.profile.genreWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name]) => name);
  }

  getTopTropes(n = 3) {
    return Object.entries(this.profile.tropes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name]) => name);
  }

  getTopAesthetics(n = 3) {
    return Object.entries(this.profile.aesthetics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name]) => name);
  }

  getTopPacingStyles(n = 3) {
    return Object.entries(this.profile.pacingStyles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name]) => name);
  }

  clear() { this.cache.clear(); }
}
