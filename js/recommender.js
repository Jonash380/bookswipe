import { TMDB_GENRE_MAP, safeGetJSON, safeSetJSON } from './utils.js';
import { mapTMDBTags, computeVibeScores } from './tag_mapper.js';
import { GAME_GENRE_NAME_MAP } from './games.js';

const W = { genre:15, mood:20, era:-30, trope:10, pacing:8, aesthetic:7, warning:-5, boost:8, block:-40, decay:0.95,
  platform:25, playtime:12, mechanic:10, multiplayer:8, theme:10, vibe:6 };

// Shared stop words for description similarity (EN + common DE)
const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was',
  'were','be','been','being','have','has','had','do','does','did','will','would','could','should',
  'may','might','shall','can','this','that','these','those','it','its','he','she','they','them','their',
  'his','her','my','your','our','who','which','what','when','where','how','not','no','nor','so','if',
  'than','too','very','just','about','into','through','during','before','after','above','below','between',
  'out','up','down','off','over','under','again','further','then','once','all','each','every','both',
  'few','more','most','other','some','such','only','own','same','also','back','even','still','well',
  'much','many','new','old','first','last','long','great','little','one','two','three','four','five',
  'der','die','das','ein','eine','und','oder','aber','in','auf','mit','von','zu','für','ist','sind',
  'war','hat','haben','werden','wird','nicht','sich','auch','noch','wie','aber','denn','nur','schon'
]);

const WORD_RE = /[^a-zäöüßàáâãèéêìíîòóôùúûç]+/;

// Bayesian prior — prevents overfitting when user has few browses
const BAYES = { priorMean: 50, priorStrength: 5, minSamples: 3 };

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
      gamePlatformWeights: {}, gameMechanicWeights: {}, gameThemeWeights: {},
      steamTagWeights: {}
    });
  }

  _saveProfile() {
    safeSetJSON('bs-rec-profile', this.profile);
  }

  /**
   * Resolve the year for an item, falling back through several known fields.
   * Books on OpenLibrary/Google Books commonly use `first_publish_year`
   * instead of `year` / `release_date` — without this fallback era filtering
   * silently never triggered for books.
   * @param {Object} item
   * @returns {number|null}
   */
  _getItemYear(item) {
    if (!item) return null;
    if (item.year) return parseInt(item.year) || null;
    if (item.release_date) {
      const y = parseInt(item.release_date);
      if (!isNaN(y) && y > 1800) return y;
    }
    if (item.first_publish_year) return parseInt(item.first_publish_year) || null;
    if (item.first_air_date) {
      const y = parseInt(item.first_air_date);
      if (!isNaN(y) && y > 1800) return y;
    }
    return null;
  }

  score(item) {
    if (this.cache.has(item.id)) return this.cache.get(item.id);
    let score = BAYES.priorMean;
    const s = this.app.state;
    const isGame = item.type === 'game' || item.source === 'igdb';

    if (isGame) {
      score = this._scoreGame(item, score, s);
    } else {
      score = this._scoreMedia(item, score, s);
    }

    // Ensure profile-level caches (taste vector, recent swipe tags) are
    // populated before the per-item bonus methods read them.
    this._getCachedBonuses();
    score += this._scoreDescriptionSimilarity(item);
    score += this._scoreRecentBias(item);

    // Bayesian shrinkage: pull score toward prior when we have few samples
    // This prevents wild recommendations on cold start
    const n = this.profile.totalSwipes;
    if (n < BAYES.minSamples) {
      const shrink = n / BAYES.minSamples;
      score = BAYES.priorMean + (score - BAYES.priorMean) * shrink;
    }

    score = Math.max(0, Math.min(100, score));
    this.cache.set(item.id, score);
    return score;
  }

  /**
   * Vibe/recency/description-similarity bonuses depend only on the user
   * profile and history. Cache the expensive taste vector and precomputed
   * recent swipe tags per (profile-revision, history-length) so that
   * consecutive score() calls during a single render pass reuse them.
   *
   * Per-item bonuses (descSim, recentBias) are still computed in their
   * respective methods but reuse the cached taste vector / tags.
   */
  _getCachedBonuses() {
    const history = this.app.history || [];
    const rev = `${this.profile.totalSwipes}_${history.length}`;
    if (this._bonusCache && this._bonusCacheRev === rev) {
      return this._bonusCache;
    }
    // Build taste vector from liked-item descriptions (expensive: TF-IDF vec)
    const tasteVec = this._buildTasteVector();
    // Precompute recent swipe tags for _scoreRecentBias (cheap but repeated)
    const recentSwipeTags = [];
    const recent = history.slice(0, 6);
    const decay = 0.7;
    for (let i = 0; i < recent.length; i++) {
      const hDna = recent[i].mediaDNA || {};
      const tags = new Set([
        ...(hDna.tropes || []),
        ...(hDna.pacing || []),
        ...(hDna.aesthetic || [])
      ]);
      recentSwipeTags.push({
        weight: Math.pow(decay, i),
        action: recent[i].action,
        tags
      });
    }
    this._bonusCache = { tasteVec, recentSwipeTags };
    this._bonusCacheRev = rev;
    return this._bonusCache;
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

    if (item.year || item.release_date || item.first_publish_year) {
      const y = this._getItemYear(item);
      if (y && s.eraFilter !== 'all' && s.eraFilter) {
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

    const gm = (this.app && this.app._genreMap) || TMDB_GENRE_MAP;
    if (s.boostedMoods?.length && item.genres) {
      const boosted = item.genres.filter(g => {
        const name = (gm[g] || '').toLowerCase();
        return s.boostedMoods.some(bm => name.includes(bm));
      });
      score += boosted.length * W.boost;
    }

    if (s.blockedGenres?.length && item.genres) {
      const blocked = item.genres.filter(g => {
        const name = (gm[g] || '').toLowerCase();
        return s.blockedGenres.some(bg => name.includes(bg));
      });
      if (blocked.length) score += W.block;
    }

    score += this._scoreVibeMatch(item, s);

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

    if (item.steamTags && item.steamTags.length) {
      const tagOverlap = item.steamTags.filter(t => {
        const tagName = typeof t === 'string' ? t : t.name;
        return this.profile.steamTagWeights && this.profile.steamTagWeights[tagName];
      });
      score += tagOverlap.length * 12;
    }

    if (item.reviewScore !== null && item.reviewScore !== undefined) {
      if (item.reviewScore >= 90) score += 8;
      else if (item.reviewScore >= 75) score += 4;
      else if (item.reviewScore >= 50) score += 0;
      else score -= 3;
    }

    if (item.metacritic) {
      if (item.metacritic >= 85) score += 5;
      else if (item.metacritic >= 70) score += 2;
      else if (item.metacritic < 50) score -= 3;
    }

    if (item.isFree) score += 2;

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

    score += this._scoreVibeMatch(item, s);

    return score;
  }

  /**
   * Build a taste keyword vector from descriptions of liked items.
   * Returns a Map<word, weight> where weight reflects how often the word
   * appears across liked items, weighted by recency.
   * Cache is invalidated via clear() and _getCachedBonuses().
   */
  _buildTasteVector() {
    if (this._tasteVec) return this._tasteVec;
    const vec = new Map();
    const history = this.app.history || [];
    const likes = history.filter(h => h.action === 'like').slice(0, 30);
    if (likes.length < 2) { this._tasteVec = vec; return vec; }
    likes.forEach((item, i) => {
      const desc = item.overview || item.description || '';
      if (desc.length < 15) return;
      const recencyWeight = 1 + (likes.length - i) / likes.length;
      const words = desc.toLowerCase().split(WORD_RE).filter(w => w.length > 2 && !STOP_WORDS.has(w));
      for (const w of words) vec.set(w, (vec.get(w) || 0) + recencyWeight);
    });
    this._tasteVec = vec;
    return vec;
  }

  /**
   * Score how well an item's description matches the user's taste vector.
   * Uses a lightweight cosine-similarity-inspired approach (dot product of
   * shared term weights). Returns a small bonus (0–5).
   *
   * Reuses the taste vector cached by _getCachedBonuses() so consecutive
   * score() calls don't rebuild the TF-IDF vector.
   */
  _scoreDescriptionSimilarity(item) {
    const desc = item.overview || item.description || '';
    if (desc.length < 15) return 0;
    // Prefer cache populated by _getCachedBonuses(); fall back to direct build
    const vec = (this._bonusCache && this._bonusCache.tasteVec) || this._buildTasteVector();
    if (vec.size === 0) return 0;
    const words = desc.toLowerCase().split(WORD_RE).filter(w => w.length > 2 && !STOP_WORDS.has(w));
    let dotProduct = 0;
    let matched = 0;
    for (const w of words) {
      const weight = vec.get(w);
      if (weight) { dotProduct += weight; matched++; }
    }
    if (matched === 0) return 0;
    // Normalize: scale down by total taste vector magnitude to get a similarity ratio
    const vecMagnitude = [...vec.values()].reduce((s, v) => s + v * v, 0);
    const similarity = dotProduct / (Math.sqrt(vecMagnitude) + 1);
    return Math.min(5, Math.max(0, similarity));
  }

  /**
   * Recent action bias (HMM-lite).
   * Boosts items that share DNA tags with the user's last few swipes,
   * with exponential decay so recent actions matter more.
   * Returns a small bonus (−4 to +4).
   *
   * Reuses the precomputed recentSwipeTags from _getCachedBonuses()
   * so consecutive score() calls skip the Set construction.
   * Falls back to direct history computation when cache is not populated
   * (e.g. when called directly from generateMatchDNA).*/
  _scoreRecentBias(item) {
    // Prefer precomputed cache from _getCachedBonuses()
    const recentEntries = this._bonusCache?.recentSwipeTags;
    // If cache is populated, use it; otherwise fall back to history
    let entries;
    if (recentEntries && recentEntries.length > 0) {
      entries = recentEntries;
    } else {
      const history = this.app.history || [];
      if (history.length < 2) return 0;
      const recent = history.slice(0, 6);
      const decay = 0.7;
      entries = recent.map((h, i) => {
        const hDna = h.mediaDNA || {};
        return {
          weight: Math.pow(decay, i),
          action: h.action,
          tags: new Set([
            ...(hDna.tropes || []),
            ...(hDna.pacing || []),
            ...(hDna.aesthetic || [])
          ])
        };
      });
    }

    const dna = item.mediaDNA || {};
    const itemTags = new Set([
      ...(dna.tropes || []),
      ...(dna.pacing || []),
      ...(dna.aesthetic || [])
    ]);
    if (itemTags.size === 0) return 0;

    let bonus = 0;
    for (const entry of entries) {
      let overlap = 0;
      for (const t of itemTags) { if (entry.tags.has(t)) overlap++; }
      if (overlap > 0) {
        bonus += (entry.action === 'like' ? 1 : -0.5) * overlap * entry.weight;
      }
    }
    return Math.min(4, Math.max(-4, bonus));
  }

  /**
   * Bayesian weighted rating for items with community ratings.
   * Uses the IMDB/TMDB formula: (v/(v+m)) * R + (m/(v+m)) * C
   * where R = item rating, v = vote count, m = min votes, C = global avg.
   * Returns a small bonus (−3 to +4).
   */
  _bayesianRating(item) {
    const R = item.rating || item.vote_average;
    const v = item.vote_count;
    if (!R || !v) return 0;
    const C = 6.5;   // global average (TMDB ~6.5)
    const m = 50;     // minimum votes threshold
    const weighted = (v / (v + m)) * R + (m / (v + m)) * C;
    // Map weighted rating to a small score bonus
    if (weighted >= 8.0) return 4;
    if (weighted >= 7.0) return 2;
    if (weighted >= 6.0) return 1;
    if (weighted >= 5.0) return 0;
    return -3;
  }

  /**
   * Score how well an item matches the user's vibe matrix preferences.
   * The vibe matrix has three axes (0-100, default 50):
   *   - vibePacing: 0 = slow/atmospheric, 100 = fast/adrenaline
   *   - vibeTone:   0 = dark/gritty,       100 = light/comforting
   *   - vibeComplex: 0 = popcorn fun,       100 = mind-bending/deep
   *
   * Returns a small score adjustment (±W.vibe per axis match).
   */
  _scoreVibeMatch(item, s) {
    const dna = item.mediaDNA || {};
    const pacing = dna.pacing || [];
    const aesthetics = dna.aesthetic || [];
    const tropes = dna.tropes || [];
    const tags = (item.tags || []).map(t => t.toLowerCase());
    let bonus = 0;

    // ---- Pacing axis (vibePacing: 0=slow, 100=fast) ----
    // Only apply when user has meaningfully moved the slider away from neutral
    if (s.vibePacing !== undefined && s.vibePacing !== 50) {
      const pacingBias = (s.vibePacing - 50) / 50; // -1 to +1
      const fastPacing = ['relentless', 'fast_paced', 'ticking_clock', 'roller_coaster'];
      const slowPacing = ['slow_burn', 'meditative', 'slow_start'];

      let pacingSignal = 0;
      for (const p of pacing) {
        if (fastPacing.includes(p)) pacingSignal += 1;
        if (slowPacing.includes(p)) pacingSignal -= 1;
      }
      // Also check tags for pacing signals
      if (tags.includes('intense') || tags.includes('fast-paced') || tags.includes('action')) pacingSignal += 0.5;
      if (tags.includes('atmospheric') || tags.includes('slow') || tags.includes('contemplative')) pacingSignal -= 0.5;

      // Match: positive pacingSignal + positive bias = good, negative + negative = good
      if (pacingSignal !== 0) {
        const match = pacingBias * Math.sign(pacingSignal);
        if (match > 0) bonus += W.vibe * match;
      }
    }

    // ---- Tone axis (vibeTone: 0=dark/gritty, 100=light/comforting) ----
    if (s.vibeTone !== undefined && s.vibeTone !== 50) {
      const toneBias = (s.vibeTone - 50) / 50; // -1 to +1
      const darkAesthetics = ['neon_noir', 'gritty_realism', 'brutalist', 'high_contrast'];
      const lightAesthetics = ['cottagecore', 'pastel_dream', 'lo_fi', 'minimalist'];

      let toneSignal = 0;
      for (const a of aesthetics) {
        if (darkAesthetics.includes(a)) toneSignal -= 1;
        if (lightAesthetics.includes(a)) toneSignal += 1;
      }
      // Check tags for tone signals
      if (tags.includes('dark') || tags.includes('gritty') || tags.includes('noir')) toneSignal -= 0.5;
      if (tags.includes('cozy') || tags.includes('wholesome') || tags.includes('light') || tags.includes('gentle')) toneSignal += 0.5;

      if (toneSignal !== 0) {
        const match = toneBias * Math.sign(toneSignal);
        if (match > 0) bonus += W.vibe * match;
      }
    }

    // ---- Complexity axis (vibeComplex: 0=popcorn, 100=deep) ----
    if (s.vibeComplex !== undefined && s.vibeComplex !== 50) {
      const complexBias = (s.vibeComplex - 50) / 50; // -1 to +1
      const deepTropes = ['mystery_box', 'time_loop', 'non_linear'];
      const deepAesthetics = ['neon_noir', 'minimalist', 'brutalist'];
      const simpleTropes = ['underdog', 'chosen_one', 'found_family'];

      let complexSignal = 0;
      for (const t of tropes) {
        if (deepTropes.includes(t)) complexSignal += 1;
        if (simpleTropes.includes(t)) complexSignal -= 0.5;
      }
      for (const a of aesthetics) {
        if (deepAesthetics.includes(a)) complexSignal += 0.5;
      }
      // Check tags for complexity signals
      if (tags.includes('mind-bending') || tags.includes('complex') || tags.includes('cerebral')) complexSignal += 1;
      if (tags.includes('fun') || tags.includes('light-hearted') || tags.includes('feel-good')) complexSignal -= 0.5;

      if (complexSignal !== 0) {
        const match = complexBias * Math.sign(complexSignal);
        if (match > 0) bonus += W.vibe * match;
      }
    }

    return bonus;
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
    // Adaptive learning rate: larger updates early on, finer adjustments later
    const confidence = Math.min(1, this.profile.totalSwipes / 20);
    const adaptiveDelta = action === 'like' ? (1 + (1 - confidence) * 2) : -(1 + (1 - confidence) * 2);

    if (action === 'like') {
      this.profile.likeRatio = (this.profile.likeRatio * (this.profile.totalSwipes - 1) + 1) / this.profile.totalSwipes;
      this._updateEntityWeights(item, adaptiveDelta);
    } else if (action === 'nope') {
      this.profile.likeRatio = (this.profile.likeRatio * (this.profile.totalSwipes - 1)) / this.profile.totalSwipes;
      this._updateEntityWeights(item, adaptiveDelta);
    }
    this._saveProfile();
    this._applyDecay();
    this.cache.clear();
    this._tasteVec = null;
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
      if (item.steamTags) {
        item.steamTags.forEach(t => {
          const tagName = typeof t === 'string' ? t : t.name;
          if (!this.profile.steamTagWeights) this.profile.steamTagWeights = {};
          this.profile.steamTagWeights[tagName] = (this.profile.steamTagWeights[tagName] || 0) + delta;
        });
      }
    } else {
      const gm = (this.app && this.app._genreMap) || TMDB_GENRE_MAP;
      if (item.genres) {
        item.genres.forEach(g => {
          const name = typeof g === 'string' ? g : (gm[g] || g);
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
    // Only decay if we have enough data — preserves early learning
    if (this.profile.totalSwipes < 5) return;
    Object.keys(this.profile.genreWeights).forEach(k => { this.profile.genreWeights[k] *= decay; });
    Object.keys(this.profile.tagWeights).forEach(k => { this.profile.tagWeights[k] *= decay; });
    Object.keys(this.profile.tropes).forEach(k => { this.profile.tropes[k] *= decay; });
    Object.keys(this.profile.pacingStyles).forEach(k => { this.profile.pacingStyles[k] *= decay; });
    Object.keys(this.profile.aesthetics).forEach(k => { this.profile.aesthetics[k] *= decay; });
    if (this.profile.gamePlatformWeights) Object.keys(this.profile.gamePlatformWeights).forEach(k => { this.profile.gamePlatformWeights[k] *= decay; });
    if (this.profile.gameMechanicWeights) Object.keys(this.profile.gameMechanicWeights).forEach(k => { this.profile.gameMechanicWeights[k] *= decay; });
    if (this.profile.gameThemeWeights) Object.keys(this.profile.gameThemeWeights).forEach(k => { this.profile.gameThemeWeights[k] *= decay; });
    if (this.profile.steamTagWeights) Object.keys(this.profile.steamTagWeights).forEach(k => { this.profile.steamTagWeights[k] *= decay; });
  }

  /**
   * MMR (Maximum Marginal Relevance) diversity re-ranking.
   * Balances relevance score with diversity: penalizes items that are too similar
   * to already-selected ones, ensuring the final list covers a broader range.
   * @param {Array} items - items already scored and sorted by score descending
   * @param {number} diversityCount - how many diverse picks to inject
   * @returns {Array} re-ranked items with diversity injected near the top
   */
  mmrRerank(items, diversityCount = 3) {
    if (items.length <= diversityCount + 3) return items;

    const lambda = 0.5; // 0 = pure diversity, 1 = pure relevance
    const result = [];
    const remaining = [...items];

    // Pick the first item by relevance (highest score)
    result.push(remaining.shift());

    while (result.length < Math.min(diversityCount + 1, items.length)) {
      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        // Relevance component
        const relevance = candidate._mmrScore || 50;

        // Diversity component: max similarity to any already-selected item
        let maxSim = 0;
        for (const selected of result) {
          const sim = this._computeSimilarity(candidate, selected);
          if (sim > maxSim) maxSim = sim;
        }

        // MMR formula
        const mmrScore = lambda * (relevance / 100) - (1 - lambda) * maxSim;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        result.push(remaining.splice(bestIdx, 1)[0]);
      } else {
        break;
      }
    }

    // Append remaining items in original order
    return [...result, ...remaining];
  }

  /**
   * Compute similarity between two items (0-1) based on genre overlap.
   * Used by MMR to measure redundancy.
   */
  _computeSimilarity(a, b) {
    if (!a.genres || !b.genres) return 0;
    const ga = Array.isArray(a.genres) ? a.genres : [];
    const gb = Array.isArray(b.genres) ? b.genres : [];
    if (!ga.length || !gb.length) return 0;

    // Normalize genres to strings for comparison
    const normA = ga.map(g => (g === null || g === undefined ? '' : (typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g.name || g)).toString().toLowerCase()));
    const normB = gb.map(g => (g === null || g === undefined ? '' : (typeof g === 'string' ? g : (TMDB_GENRE_MAP[g] || g.name || g)).toString().toLowerCase()));

    // Jaccard similarity: intersection over union
    const setA = new Set(normA);
    const setB = new Set(normB);
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
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

  /**
   * Generate a transparent "Match DNA" breakdown for a single item.
   * Produces the overall match percentage, up to 4 scored categories with
   * punchy explanations, and a hook sentence for the UI.
   *
   * @param {Object} item - The media item to evaluate
   * @returns {{ overall_match_percentage: number, dna_breakdown: Array, hook: string }}
   */
  generateMatchDNA(item) {
    const s = this.app.state;
    const isGame = item.type === 'game' || item.source === 'igdb';
    const gm = (this.app && this.app._genreMap) || TMDB_GENRE_MAP;
    const breakdown = [];
    let hardNo = false;
    const de = (this.app && this.app.lang === 'de');

    // Warm caches so the direct _scoreDescriptionSimilarity / _scoreRecentBias
    // calls below reuse the taste vector and precomputed recent swipe tags.
    this._getCachedBonuses();

    // ---- 1. Genre Alignment ----
    let genreScore = 50;
    let genreReason = de ? 'Keine starke Genre-Überlappung' : 'No strong genre overlap';
    let genreMatchCount = 0;
    if (item.genres && item.genres.length) {
      const itemGenreNames = item.genres.map(g =>
        typeof g === 'string' ? g : (isGame ? (GAME_GENRE_NAME_MAP[g.id] || g.name || g) : (gm[g] || g))
      );
      // Check against profile genre weights (liked/disliked genres)
      let totalWeight = 0;
      let positiveWeight = 0;
      itemGenreNames.forEach(name => {
        const w = this.profile.genreWeights[name];
        if (w !== undefined) {
          totalWeight += Math.abs(w);
          if (w > 0) positiveWeight += w;
        }
      });
      if (totalWeight > 0) {
        genreScore = Math.round((positiveWeight / totalWeight) * 100);
      } else {
        // Fall back to filter-based overlap
        const overlap = itemGenreNames.filter(name =>
          (s.selectedGenres || []).some(sg => {
            const sgName = typeof sg === 'string' ? sg : (isGame ? GAME_GENRE_NAME_MAP[sg.id] || sg.name || sg : gm[sg] || sg);
            return name.toLowerCase().includes(sgName.toLowerCase()) || sgName.toLowerCase().includes(name.toLowerCase());
          })
        );
        genreMatchCount = overlap.length;
        genreScore = Math.min(100, 50 + overlap.length * 25);
      }

      // Check blocked genres (hard no)
      if (s.blockedGenres?.length) {
        const hasBlocked = itemGenreNames.some(name =>
          s.blockedGenres.some(bg => name.toLowerCase().includes(bg.toLowerCase()))
        );
        if (hasBlocked) {
          hardNo = true;
          genreScore = 10;
          genreReason = de
            ? 'Enthält blockierte Genres — aus deinem Feed verbannt'
            : 'Contains blocked genres — banished from your feed';
        } else {
          genreReason = de
            ? `${itemGenreNames.length} Genre${itemGenreNames.length !== 1 ? 's' : ''} passen zu deinem Profil`
            : `${itemGenreNames.length} genre${itemGenreNames.length !== 1 ? 's' : ''} align with your profile`;
        }
      } else if (genreMatchCount > 0) {
        genreReason = de
          ? `Passt zu ${genreMatchCount} deiner gewählten Genres`
          : `Matches ${genreMatchCount} of your selected genres`;
      } else if (totalWeight > 0) {
        const topGenres = this.getTopGenres(2);
        genreReason = de
          ? `Genres passen zu deinen Favoriten (${topGenres.join(', ')})`
          : `Genres align with your top picks (${topGenres.join(', ')})`;
      }
    }

    // ---- 2. Mood & Vibe Match ----
    let moodScore = 50;
    let moodReason = de ? 'Keine passenden Stimmungen gefunden' : 'No matching moods found';
    if (item.tags && item.tags.length) {
      const moodMatch = item.tags.filter(t => (s.selectedMoods || []).includes(t)).length;
      const tagWeightMatch = item.tags.filter(t => this.profile.tagWeights[t] > 0).length;
      const totalSignals = moodMatch + tagWeightMatch * 2;
      moodScore = Math.min(100, 40 + totalSignals * 15);
      if (moodMatch > 0 || tagWeightMatch > 0) {
        const topMood = item.tags.find(t => (s.selectedMoods || []).includes(t) || this.profile.tagWeights[t] > 0);
        moodReason = de
          ? `Stimmung „${topMood}" passt zu deinem aktuellen Vibe`
          : `Mood "${topMood}" matches your current vibe`;
      }
    } else if (isGame && item.mechanics && item.mechanics.length) {
      const mechMatch = item.mechanics.filter(m => this.profile.gameMechanicWeights[m] > 0).length;
      moodScore = Math.min(100, 40 + mechMatch * 15);
      if (mechMatch > 0) {
        moodReason = de
          ? `Spielmechaniken passen zu dem, was dir gefällt`
          : `Game mechanics match what you enjoy`;
      }
    }

    // ---- 3. Story Tropes ----
    let tropeScore = 50;
    let tropeReason = de ? 'Neue erzählerische Richtung' : 'New narrative direction';
    const dna = item.mediaDNA || {};
    if (dna.tropes && dna.tropes.length) {
      const tropeMatch = dna.tropes.filter(t => this.profile.tropes[t] > 0).length;
      if (tropeMatch > 0) {
        const matchedName = dna.tropes.find(t => this.profile.tropes[t] > 0);
        tropeScore = Math.min(100, 50 + tropeMatch * 20);
        tropeReason = de
          ? `Teilt deinen geliebten „${matchedName}"-Trope`
          : `Shares your beloved "${matchedName}" trope`;
      } else {
        tropeScore = 40;
        tropeReason = de
          ? 'Erkundet neue erzählerische Gefilde für dich'
          : 'Explores new storytelling territory for you';
      }
    }

    // ---- 3b. Pacing ----
    let pacingScore = null;
    let pacingReason = '';
    if (dna.pacing && dna.pacing.length) {
      const pacingMatch = dna.pacing.filter(p => this.profile.pacingStyles[p] > 0).length;
      if (pacingMatch > 0) {
        const matchedPace = dna.pacing.find(p => this.profile.pacingStyles[p] > 0);
        pacingScore = Math.min(100, 50 + pacingMatch * 25);
        pacingReason = de
          ? `Tempo „${matchedPace}" passt zu deinem bevorzugten Rhythmus`
          : `Pacing "${matchedPace}" matches your preferred rhythm`;
      } else {
        const topPacing = this.getTopPacingStyles(1);
        if (topPacing.length) {
          pacingScore = 30;
          pacingReason = de
            ? `Anders als dein übliches Tempo (${topPacing[0]}) — eine neue Erfahrung`
            : `Different from your usual pace (${topPacing[0]}) — try something new`;
        } else {
          pacingScore = 50;
          pacingReason = de
            ? 'Neues Tempo für dein Profil'
            : 'New pace for your profile';
        }
      }
    }

    // ---- 3c. Length / Commitment (games/books) ----
    let lengthScore = null;
    let lengthReason = '';
    if (isGame && item.playtime !== undefined && item.playtime !== null) {
      const h = item.playtime;
      if (h <= 5) {
        lengthScore = 90;
        lengthReason = de
          ? 'Kurze Session — perfekt für einen schnellen Einstieg'
          : 'Quick session — perfect for a short play';
      } else if (h <= 20) {
        lengthScore = 70;
        lengthReason = de
          ? 'Mittlere Länge — gut für ein Wochenende'
          : 'Medium length — great for a weekend';
      } else if (h <= 50) {
        lengthScore = 50;
        lengthReason = de
          ? 'Längeres Spiel — etwa 20-50 Stunden'
          : 'Longer game — roughly 20-50 hours';
      } else {
        lengthScore = 30;
        lengthReason = de
          ? 'Epische Länge — 50+ Stunden. Nur wenn du Zeit mitbringst'
          : 'Epic length — 50+ hours. Bring your free time';
      }
    } else if (!isGame && (item.type === 'book' || item.source === 'openlibrary' || item.source === 'gbooks')) {
      // Books: estimate from page count or default to medium
      const pages = item.page_count || item.pages || null;
      if (pages !== null) {
        if (pages <= 250) {
          lengthScore = 85;
          lengthReason = de
            ? 'Kompakt — unter 250 Seiten, schnell gelesen'
            : 'Compact — under 250 pages, quick read';
        } else if (pages <= 400) {
          lengthScore = 60;
          lengthReason = de
            ? 'Normale Buchlänge — 250-400 Seiten'
            : 'Standard book length — 250-400 pages';
        } else {
          lengthScore = 35;
          lengthReason = de
            ? 'Umfangreich — über 400 Seiten. Nimm dir Zeit'
            : 'Substantial — over 400 pages. Take your time';
        }
      }
    }

    // ---- 4. Content Compatibility (Warnings) ----
    let warningScore = 100;
    let warningReason = de ? 'Keine Bedenken' : 'No concerns';
    if (dna.warnings && dna.warnings.length) {
      const dislikedWarnings = dna.warnings.filter(w => this.profile.warnings[w] > 0);
      if (dislikedWarnings.length > 0) {
        const maxDislike = Math.max(...dislikedWarnings.map(w => this.profile.warnings[w]));
        warningScore = Math.max(0, 80 - dislikedWarnings.length * 25 - maxDislike * 10);
        warningReason = de
          ? `Enthält ${dislikedWarnings.length} Warnhinweis(e), die dich stören könnten`
          : `Contains ${dislikedWarnings.length} warning sign(s) you may dislike`;
        if (warningScore < 40) hardNo = true;
      }
    }

    // ---- 5. Era / Year Relevance ----
    let eraScore = 100;
    let eraReason = de ? 'Zeitlos' : 'Timeless';
    if ((item.year || item.release_date || item.first_publish_year) && s.eraFilter && s.eraFilter !== 'all') {
      const y = this._getItemYear(item);
      const eraRanges = { classic: [1900, 1970], modern: [1970, 2010], current: [2010, 2026] };
      const r = eraRanges[s.eraFilter];
      if (r) {
        if (y >= r[0] && y <= r[1]) {
          eraScore = 90;
          eraReason = de
            ? `Perfekte Ära: ${s.eraFilter} (${y})`
            : `Perfect era: ${s.eraFilter} (${y})`;
        } else {
          eraScore = 25;
          eraReason = de
            ? `Ära (${y}) liegt außerhalb deines Filters (${s.eraFilter})`
            : `Era (${y}) is outside your filter (${s.eraFilter})`;
        }
      }
    }

    // ---- 6. Platform Match (games) ----
    let platformScore = null;
    let platformReason = '';
    if (isGame && s.selectedPlatforms?.length) {
      const itemPlatforms = (item.platforms || []).map(p => p.id);
      const match = itemPlatforms.filter(id => s.selectedPlatforms.includes(id));
      if (match.length > 0) {
        platformScore = 100;
        platformReason = de
          ? `Verfügbar auf ${match.length} deiner Plattformen`
          : `Available on ${match.length} of your platforms`;
      } else {
        platformScore = 20;
        platformReason = de
          ? 'Nicht auf deinen Plattformen verfügbar'
          : 'Not on your selected platforms';
      }
    }

    // ---- Build the breakdown (pick most informative categories) ----
    // Always include Genre. Include up to 3 more based on available data.
    breakdown.push({
      category: de ? 'Genre-Ausrichtung' : 'Genre Alignment',
      score: genreScore,
      reason: genreReason,
    });

    if ((item.tags && item.tags.length) || (isGame && item.mechanics && item.mechanics.length)) {
      breakdown.push({
        category: de ? 'Stimmung & Vibe' : 'Mood & Vibe',
        score: moodScore,
        reason: moodReason,
      });
    }

    if (dna.tropes && dna.tropes.length) {
      breakdown.push({
        category: de ? 'Erzähl-Strategie' : 'Story Tropes',
        score: tropeScore,
        reason: tropeReason,
      });
    }

    if (pacingScore !== null) {
      breakdown.push({
        category: de ? 'Tempo' : 'Pacing',
        score: pacingScore,
        reason: pacingReason,
      });
    }

    if (lengthScore !== null) {
      breakdown.push({
        category: de ? 'Länge' : 'Length',
        score: lengthScore,
        reason: lengthReason,
      });
    }

    if (dna.warnings && dna.warnings.length) {
      breakdown.push({
        category: de ? 'Warnhinweise' : 'Content Notes',
        score: warningScore,
        reason: warningReason,
      });
    }

    if (s.eraFilter && s.eraFilter !== 'all') {
      breakdown.push({
        category: de ? 'Ära' : 'Era',
        score: eraScore,
        reason: eraReason,
      });
    }

    if (platformScore !== null) {
      breakdown.push({
        category: de ? 'Plattform' : 'Platform',
        score: platformScore,
        reason: platformReason,
      });
    }

    // ---- 5. Description Similarity ----
    const descSim = this._scoreDescriptionSimilarity(item);
    if (descSim > 0) {
      const descScore = Math.round(50 + descSim * 10);
      const descReason = de
        ? `Beschreibung aehnlich deinem Geschmack (+${descSim.toFixed(1)})`
        : `Description similar to your taste (+${descSim.toFixed(1)})`;
      breakdown.push({
        category: de ? 'Beschreibung' : 'Description',
        score: descScore,
        reason: descReason,
      });
    }

    // ---- 6. Recent Bias ----
    const recentBias = this._scoreRecentBias(item);
    if (recentBias !== 0) {
      const recentScore = Math.round(50 + recentBias * 6);
      const recentReason = recentBias > 0
        ? (de ? `Aehnelt deinen letzten Swipes (+${recentBias.toFixed(1)})` : `Matches recent swipes (+${recentBias.toFixed(1)})`)
        : (de ? `Weicht von letzten Swipes ab (${recentBias.toFixed(1)})` : `Differs from recent swipes (${recentBias.toFixed(1)})`);
      breakdown.push({
        category: de ? 'Kuerzliche Aktivitaet' : 'Recent Activity',
        score: recentScore,
        reason: recentReason,
      });
    }

    // ---- 7. Bayesian Rating ----
    const bayesRating = this._bayesianRating(item);
    if (bayesRating !== 0) {
      const bayesScore = Math.round(50 + bayesRating * 8);
      const rating = item.rating || item.vote_average || 0;
      const votes = item.vote_count || 0;
      const bayesReason = bayesRating > 0
        ? (de ? `Stark bewertet: ${rating.toFixed(1)} Sterne (${votes} Stimmen)` : `Well rated: ${rating.toFixed(1)} stars (${votes} votes)`)
        : (de ? `Wenig oder niedrig bewertet (${votes} Stimmen)` : `Low or few ratings (${votes} votes)`);
      breakdown.push({
        category: de ? 'Bewertung' : 'Rating',
        score: bayesScore,
        reason: bayesReason,
      });
    }

    // Limit to 4 categories max, prioritizing safety info
    // Priority order: Genre > Content/Warnings > Mood > Story > Pacing > Length > Era > Platform
    while (breakdown.length > 4) {
      const priority = [
        'Genre-Ausrichtung', 'Genre Alignment',
        'Warnhinweise', 'Content Notes',
        'Stimmung & Vibe', 'Mood & Vibe',
        'Erzähl-Strategie', 'Story Tropes',
        'Tempo', 'Pacing',
        'Länge', 'Length',
        'Ära', 'Era',
        'Beschreibung', 'Description', 'Kuerzliche Aktivitaet', 'Recent Activity', 'Bewertung', 'Rating', 'Plattform', 'Platform',
      ];
      let worstIdx = 0;
      let worstPrio = -1;
      breakdown.forEach((b, i) => {
        const p = priority.indexOf(b.category);
        if (p > worstPrio) { worstPrio = p; worstIdx = i; }
      });
      breakdown.splice(worstIdx, 1);
    }

    // ---- Overall score ----
    let overall = 0;
    let totalWeight = 0;
    const weights = {
      'Genre Alignment': 3, 'Genre-Ausrichtung': 3,
      'Mood & Vibe': 2, 'Stimmung & Vibe': 2,
      'Story Tropes': 2, 'Erzähl-Strategie': 2,
      'Pacing': 2, 'Tempo': 2,
      'Length': 1, 'Länge': 1,
      'Content Notes': 2, 'Warnhinweise': 2,
      'Era': 1, 'Ära': 1,
      'Platform': 1, 'Plattform': 1,
      'Description': 1, 'Beschreibung': 1,
      'Recent Activity': 1, 'Kürzliche Aktivität': 1,
      'Rating': 2, 'Bewertung': 2,
    };
    breakdown.forEach(b => {
      const w = weights[b.category] || 1;
      overall += b.score * w;
      totalWeight += w;
    });
    overall = totalWeight > 0 ? Math.round(overall / totalWeight) : 50;

    // Apply hard no override
    if (hardNo) {
      overall = Math.min(overall, 35);
    }

    // ---- Hook ----
    let hook;
    if (hardNo) {
      hook = de
        ? 'Dieser Titel enthält blockierte Inhalte — vielleicht besser weiterwischen'
        : 'This title contains blocked content — maybe skip it';
    } else {
      const bestCategory = breakdown.reduce((a, b) => a.score >= b.score ? a : b);
      if (bestCategory.score >= 80) {
        hook = de
          ? `${bestCategory.reason} — das könnte dein neuer Favorit werden!`
          : `${bestCategory.reason} — this could be your next favorite!`;
      } else if (overall >= 60) {
        hook = de
          ? 'Gute Übereinstimmung mit deinem Profil — einen Blick wert'
          : 'Strong alignment with your profile — worth a look';
      } else if (overall >= 40) {
        hook = de
          ? 'Ein paar Übereinstimmungen, aber vielleicht nicht ganz dein Ding'
          : 'Some overlap, but might not be quite your thing';
      } else {
        hook = de
          ? 'Eher nicht deins — niedrige Übereinstimmung mit deinem Geschmack'
          : 'Probably not your style — low match with your taste';
      }
    }

    // Enforce max 20 words per spec
    const words = hook.split(' ');
    if (words.length > 20) hook = words.slice(0, 20).join(' ') + '...';

    return { overall_match_percentage: overall, dna_breakdown: breakdown, hook };
  }

  /**
   * Analyze a swipe action and calculate precise micro-tag preference adjustments.
   * Returns detailed analysis of what the user likely intended and how the profile
   * should be tuned, without applying changes (read-only analysis).
   *
   * @param {Object} item - The media item that was swiped
   * @param {string} action - 'like' | 'nope'
   * @param {number} [dwellTimeMs=0] - How long the user dwelled before swiping
   * @returns {{
   *   action_analyzed: string,
   *   inferred_reason: string,
   *   tag_adjustments: Array<{tag: string, delta: number, confidence: string}>,
   *   profile_health_check: string
   * }}
   */
  analyzeSwipe(item, action, dwellTimeMs = 0) {
    const isLongPressReject = action === 'nope' && dwellTimeMs > 5000;
    const de = this.app && this.app.lang === 'de';

    // ---- Collect all micro-tags from the item ----
    const microTagSet = new Set();

    // MediaDNA tropes, pacing, aesthetics (these are always micro-tags)
    const dna = item.mediaDNA || {};
    if (dna.tropes) dna.tropes.forEach(t => microTagSet.add(t));
    if (dna.pacing) dna.pacing.forEach(p => microTagSet.add(p));
    if (dna.aesthetic) dna.aesthetic.forEach(a => microTagSet.add(a));

    // Item tags (mood/vibe tags) — these are medium-grained, included as-is
    if (item.tags) item.tags.forEach(t => microTagSet.add(t));

    // Game mechanics and themes
    if (item.mechanics) item.mechanics.forEach(m => microTagSet.add(m));
    if (item.themes) item.themes.forEach(t => microTagSet.add(t));

    // Broad/generic genres are NOT micro-tags — filter them out
    const BROAD_TAGS = new Set([
      'action','adventure','comedy','drama','horror','romance','thriller',
      'fantasy','scifi','sci-fi','animation','crime','documentary','family',
      'history','music','mystery','war','western','kids','news','reality',
      'talk','soap','tv movie','game','book','movie','film','fiction','non-fiction',
      'indie','casual','simulation','strategy','sport','racing','fighting',
      'rpg','shooter','platformer','puzzle','arcade','visual novel',
      'action-adventure','action rpg','turn-based','board game','card game',
      'tactical rpg','quiz','metroidvania','souls-like','battle royale',
      'auto battler','extraction shooter',
    ]);

    const microTags = [...microTagSet].filter(t => {
      // Normalize both sides: replace underscores AND hyphens with spaces
      const normalized = t.toLowerCase().replace(/[_\-]/g, ' ');
      return !BROAD_TAGS.has(normalized);
    });

    // ---- Calculate adjustments for each micro-tag ----
    const adjustments = [];

    for (const tag of microTags) {
      // Determine the existing preference strength for this tag
      const existingGenreWeight = this.profile.genreWeights[tag] || 0;
      const existingTagWeight = this.profile.tagWeights[tag] || 0;
      const existingTropeWeight = this.profile.tropes[tag] || 0;
      const existingPacingWeight = this.profile.pacingStyles[tag] || 0;
      const existingAestheticWeight = this.profile.aesthetics[tag] || 0;
      const existingMechanicWeight = this.profile.gameMechanicWeights?.[tag] || 0;
      const existingThemeWeight = this.profile.gameThemeWeights?.[tag] || 0;

      const existingStrength = existingGenreWeight + existingTagWeight + existingTropeWeight
        + existingPacingWeight + existingAestheticWeight + existingMechanicWeight + existingThemeWeight;

      let delta = 0;
      let confidence = 'Low';

      if (action === 'like') {
        // Right swipe: positive delta in [+3, +8] per spec
        if (existingStrength > 3) {
          delta = Math.min(8, 5 + Math.round(Math.min(existingStrength, 4)));
          confidence = 'High';
        } else if (existingStrength > 0) {
          delta = 5;
          confidence = 'High';
        } else if (existingStrength <= 0) {
          // New discovery — small boost
          delta = 3;
          confidence = 'Low';
        }
      } else if (action === 'nope') {
        if (isLongPressReject) {
          // Long-press: strong negative on the most prominent micro-tags
          delta = -9;
          confidence = 'High';
        } else if (existingStrength > 2) {
          // Disliked a tag they were predicted to like — strong signal
          delta = -7;
          confidence = 'High';
        } else if (existingStrength > 0) {
          delta = -5;
          confidence = 'Medium';
        } else {
          // Neutral rejection — mild signal
          delta = -3;
          confidence = 'Low';
        }
      }

      if (delta !== 0) {
        adjustments.push({ tag, delta, confidence, existingStrength });
      }
    }

    // ---- Limit total magnitude to prevent wild swings ----
    // Cap total positive and negative magnitude separately
    let totalPositiveMagnitude = 0;
    let totalNegativeMagnitude = 0;
    for (const adj of adjustments) {
      if (adj.delta > 0) totalPositiveMagnitude += adj.delta;
      else totalNegativeMagnitude += Math.abs(adj.delta);
    }

    // If total magnitude exceeds 30, scale down using Math.floor to guarantee the bound
    const MAX_MAGNITUDE = 30;
    if (totalPositiveMagnitude > MAX_MAGNITUDE) {
      const scale = MAX_MAGNITUDE / totalPositiveMagnitude;
      for (const adj of adjustments) {
        if (adj.delta > 0) adj.delta = Math.max(1, Math.floor(adj.delta * scale));
      }
    }
    if (totalNegativeMagnitude > MAX_MAGNITUDE) {
      const scale = MAX_MAGNITUDE / totalNegativeMagnitude;
      for (const adj of adjustments) {
        if (adj.delta < 0) adj.delta = Math.min(-1, -Math.floor(Math.abs(adj.delta) * scale));
      }
    }

    // ---- Sort adjustments by absolute delta, then existing strength (strongest first) ----
    adjustments.sort((a, b) => {
      const deltaDiff = Math.abs(b.delta) - Math.abs(a.delta);
      if (deltaDiff !== 0) return deltaDiff;
      return (b.existingStrength || 0) - (a.existingStrength || 0);
    });

    // ---- Long-press: apply strong -9 only to the MOST PROMINENT tag (per spec) ----
    // Fall back to normal nope logic for remaining tags
    const longPressTag = isLongPressReject && adjustments.length > 0 ? adjustments[0].tag : null;
    if (longPressTag) {
      for (let i = 1; i < adjustments.length; i++) {
        const adj = adjustments[i];
        const es = adj.existingStrength || 0;
        if (es > 2) adj.delta = -7;
        else if (es > 0) adj.delta = -5;
        else adj.delta = -3;
        adj.confidence = es > 0 ? (es > 2 ? 'High' : 'Medium') : 'Low';
      }
    }

    // Clean up internal field
    adjustments.forEach(a => delete a.existingStrength);

    // ---- Build the reason and health check ----
    const actionNames = {
      like: de ? 'Rechtswisch' : 'Right Swipe',
      nope: isLongPressReject ? (de ? 'Langdruck-Ablehnung' : 'Long-Press Reject') : (de ? 'Linkswisch' : 'Left Swipe'),
    };

    const actionAnalyzed = actionNames[action] || action;

    // Inferred reason
    let inferredReason;
    if (action === 'like') {
      if (microTags.length > 0) {
        const topTag = adjustments.find(a => a.delta > 0)?.tag || microTags[0];
        inferredReason = de
          ? `Mag „${topTag}" — passt zu bestehenden Vorlieben und verstärkt sie`
          : `Liked "${topTag}" — matches existing preferences, reinforcing them`;
      } else {
        inferredReason = de
          ? 'Keine spezifischen Mikro-Tags gefunden, positives Signal auf Genre-Ebene'
          : 'No specific micro-tags found, positive signal at genre level';
      }
    } else {
      if (isLongPressReject && adjustments.length > 0) {
        const worstTag = adjustments[0].tag;
        inferredReason = de
          ? `Nach langem Überlegen abgelehnt — „${worstTag}" ist wahrscheinlich der Auslöser`
          : `Rejected after long deliberation — "${worstTag}" is likely the trigger`;
      } else if (adjustments.length > 0) {
        const worstTag = adjustments[0].tag;
        inferredReason = de
          ? `Lehnt „${worstTag}" ab — kollidiert mit den Vorlieben des Profils`
          : `Dislikes "${worstTag}" — clashes with profile preferences`;
      } else {
        inferredReason = de
          ? 'Keine spezifischen Mikro-Tags gefunden, negatives Signal auf Genre-Ebene'
          : 'No specific micro-tags found, negative signal at genre level';
      }
    }

    // Profile health check
    let profileHealthCheck;
    if (this.profile.totalSwipes < 5) {
      profileHealthCheck = de
        ? 'Erst wenige Datenpunkte — wische weiter, um dein Profil zu schärfen'
        : 'Early days — keep swiping to sharpen your profile';
    } else if (adjustments.length === 0) {
      profileHealthCheck = de
        ? 'Profil stabil — keine starken Mikro-Signale in diesem Item erkannt'
        : 'Profile stable — no strong micro-signals detected in this item';
    } else if (action === 'like' && adjustments.some(a => a.delta >= 7 && a.confidence === 'High')) {
      const topTag = adjustments.find(a => a.delta >= 7)?.tag || '';
      profileHealthCheck = de
        ? `Deine Vorliebe für „${topTag}" wird sehr stark — probiere etwas Neues aus!`
        : `Your preference for "${topTag}" is getting very strong — try something new!`;
    } else if (action === 'nope' && isLongPressReject && adjustments.length > 1) {
      profileHealthCheck = de
        ? 'Mehrere starke Ablehnungen erkannt — überprüfe deine blockierten Genres'
        : 'Multiple strong rejections detected — check your blocked genres';
    } else {
      profileHealthCheck = de
        ? 'Profil lernt weiter — jeder Wisch verfeinert deine Empfehlungen'
        : 'Profile keeps learning — every browse refines your recommendations';
    }

    return {
      action_analyzed: actionAnalyzed,
      inferred_reason: inferredReason,
      tag_adjustments: adjustments,
      profile_health_check: profileHealthCheck,
    };
  }

  /**
   * Generate a contextual "Daylist" — a dynamic media queue tailored to the
   * user's current time of day, day of week, and energy level.
   *
   * @param {Array} items - Array of media items to curate from
   * @param {{ energyLevel?: 'low'|'medium'|'high'|null }} [context={}]
   * @returns {{
   *   queue_title: string,
   *   vibe_description: string,
   *   estimated_total_time: string,
   *   contextual_rules_applied: string[],
   *   media_queue: Array<{title:string, author:string, format:string, why_right_now:string}>
   * }}
   */
  generateDaylist(items, context = {}) {
    const de = this.app && this.app.lang === 'de';
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=Sun, 6=Sat
    const isWeekend = day === 0 || day === 6;
    const energyLevel = context.energyLevel || null;

    // ---- Determine time slot ----
    let timeSlot;
    let timeSlotLabel;
    if (hour >= 6 && hour < 10) {
      timeSlot = 'morning';
      timeSlotLabel = de ? 'Morgen' : 'Morning';
    } else if (hour >= 10 && hour < 12) {
      timeSlot = 'lateMorning';
      timeSlotLabel = de ? 'Vormittag' : 'Late Morning';
    } else if (hour >= 12 && hour < 16) {
      timeSlot = 'afternoon';
      timeSlotLabel = de ? 'Nachmittag' : 'Afternoon';
    } else if (hour >= 16 && hour < 19) {
      timeSlot = 'evening';
      timeSlotLabel = de ? 'Abend' : 'Evening';
    } else {
      timeSlot = 'night';
      timeSlotLabel = de ? 'Nacht' : 'Night';
    }

    // ---- Apply energy level override ----
    const isTiredOrStressed = energyLevel === 'low';
    const isHighEnergy = energyLevel === 'high';

    // ---- Contextual rules ----
    const rules = [];
    const isCommute = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18);

    if (isTiredOrStressed) {
      rules.push(de
        ? 'Niedrige Energie erkannt — kurze, leichte & gemütliche Inhalte priorisiert'
        : 'Low energy detected — prioritized short, cozy & light content'
      );
    } else if (isHighEnergy) {
      rules.push(de
        ? 'Hohe Energie — actionreiche & intensive Inhalte boosten'
        : 'High energy — boosting action-packed & intense content'
      );
    } else if (timeSlot === 'morning') {
      rules.push(de
        ? 'Morgenstunde — kurze & schnelle Einstiege priorisiert'
        : 'Morning time — prioritized short & fast-paced content'
      );
    } else if (timeSlot === 'afternoon') {
      rules.push(de
        ? 'Mittagspausen-Lektüre — mittellange, fesselnde Inhalte'
        : 'Lunch break reads — mid-length, engaging fiction'
      );
    } else if (timeSlot === 'night') {
      rules.push(de
        ? 'Nachtstunden — atmosphärische & langsame Tiefentaucher priorisiert'
        : 'Night hours — prioritized atmospheric & slow-burn deep dives'
      );
    }

    if (isCommute && !isTiredOrStressed) {
      rules.push(de
        ? 'Pendelzeit — Hörbücher & Grafikinhalte bevorzugt'
        : 'Commute time — favoring audiobooks & visual-friendly content'
      );
    }

    if (isWeekend) {
      rules.push(de
        ? 'Wochenende — längere Formate & tiefere Immersion erlaubt'
        : 'Weekend — allowing longer formats & deeper immersion'
      );
    } else {
      rules.push(de
        ? 'Werktag — überschaubare Längen & geringeres Commitment'
        : 'Weekday — keeping commitments manageable'
      );
    }

    // ---- Score each item for contextual fit ----
    const scored = items.map(item => {
      const isGame = item.type === 'game' || item.source === 'igdb';
      const isBook = item.type === 'book' || item.source === 'openlibrary' || item.source === 'gbooks';
      let fitScore = 50; // baseline
      const reasons = [];

      // ---- Length/commitment scoring ----
      let itemLengthLabel = de ? 'mittel' : 'medium';
      let itemLengthHours = 2; // default

      if (isGame) {
        const h = item.playtime;
        if (h !== undefined && h !== null) {
          itemLengthHours = h;
          if (h <= 5) itemLengthLabel = de ? 'kurz' : 'short';
          else if (h <= 20) itemLengthLabel = de ? 'mittel' : 'medium';
          else itemLengthLabel = de ? 'lang' : 'long';
        }
      } else if (isBook) {
        const pages = item.page_count || item.pages || null;
        if (pages !== null) {
          itemLengthHours = Math.ceil(pages / 50); // rough estimate
          if (pages <= 200) itemLengthLabel = de ? 'kurz' : 'short';
          else if (pages <= 400) itemLengthLabel = de ? 'mittel' : 'medium';
          else itemLengthLabel = de ? 'lang' : 'long';
        }
      } else {
        // Movie/TV: assume 2h for movie, longer for series
        itemLengthHours = item.type === 'tv' ? 5 : 2;
      }

      // Apply time-of-day length rules
      const wantsShort = (timeSlot === 'morning' || isTiredOrStressed || (isCommute && !isWeekend));
      const wantsLong = (timeSlot === 'night' || isWeekend);

      if (wantsShort && itemLengthLabel === 'short') {
        fitScore += 30;
        reasons.push('short');
      } else if (wantsShort && itemLengthLabel === 'long') {
        fitScore -= 20;
        reasons.push('too_long');
      } else if (wantsLong && itemLengthLabel === 'long') {
        fitScore += 25;
        reasons.push('long');
      } else if (wantsLong && itemLengthLabel === 'short') {
        fitScore -= 10;
        reasons.push('too_short');
      }

      // ---- Mood/tag scoring ----
      const tags = item.tags || [];
      const dna = item.mediaDNA || {};
      const allMicroTags = [
        ...tags,
        ...(dna.tropes || []),
        ...(dna.pacing || []),
        ...(dna.aesthetic || [])
      ].map(t => t.toLowerCase());

      // Energy level mood boost
      if (isTiredOrStressed) {
        const cozy = allMicroTags.some(t => /cozy|light|gentle|comfort|wholesome|slow.burn/.test(t));
        const funny = allMicroTags.some(t => /funny|comedy|humor|cheerful/.test(t));
        if (cozy || funny) {
          fitScore += 20;
          reasons.push('cozy_vibe');
        }
      } else if (isHighEnergy) {
        const intense = allMicroTags.some(t => /action|intense|dark|noir|thrilling|epic|fast.paced/.test(t));
        if (intense) {
          fitScore += 20;
          reasons.push('high_energy');
        }
      }

      // Night: atmospheric/slow-burn boost
      if (timeSlot === 'night') {
        const atmospheric = allMicroTags.some(t => /atmospheric|slow.burn|noir|moody|dark|immersive/.test(t));
        if (atmospheric) {
          fitScore += 20;
          reasons.push('atmospheric');
        }
      }

      // Morning: fast-paced boost
      if (timeSlot === 'morning' && !isTiredOrStressed) {
        const fast = allMicroTags.some(t => /fast.paced|quick|page.turner|thrilling|engaging/.test(t));
        if (fast) {
          fitScore += 15;
          reasons.push('fast_start');
        }
      }

      // ---- Profile-scored bonus ----
      const profileScore = this.score(item);
      if (profileScore > 60) {
        fitScore += Math.round((profileScore - 60) / 2);
        reasons.push('profile_match');
      }

      return { item, fitScore, reasons, itemLengthLabel, itemLengthHours };
    });

    // ---- Sort by fit score descending ----
    scored.sort((a, b) => b.fitScore - a.fitScore);

    // ---- Pick top items (up to 5) with variety ----
    const selected = [];
    const usedFormats = new Set();
    const usedGenres = new Set();

    for (const s of scored) {
      if (selected.length >= 5) break;
      const item = s.item;

      // Determine format
      const isGame = item.type === 'game' || item.source === 'igdb';
      const isBook = item.type === 'book' || item.source === 'openlibrary' || item.source === 'gbooks';
      let format;
      if (isGame) {
        if (s.itemLengthLabel === 'short') format = de ? 'Kurzes Spiel' : 'Quick Game';
        else if (s.itemLengthLabel === 'long') format = de ? 'Episches Spiel' : 'Epic Game';
        else format = de ? 'Spiel' : 'Game';
      } else if (isBook) {
        if (s.itemLengthLabel === 'short') format = de ? 'Kurzgeschichte' : 'Short Read';
        else if (s.itemLengthLabel === 'long') format = de ? 'Roman' : 'Novel';
        else format = de ? 'Buch' : 'Standard Book';
      } else if (item.type === 'tv') {
        format = de ? 'Serie' : 'TV Series';
      } else {
        format = de ? 'Film' : 'Movie';
      }

      // Variety: skip if we already have 3+ of same format
      if (usedFormats.has(format) && selected.length >= 3) {
        // Only allow one more of same format if we have variety in genres
      }
      usedFormats.add(format);

      // Determine author
      let author = item.author || item.director || '';
      if (!author && isGame && item.platforms) {
        author = item.platforms.slice(0, 2).map(p => p.abbr || p.name).join(', ');
      }

      // Build "why right now"
      const deets = [];
      if (s.reasons.includes('short')) deets.push(de ? 'Schnell durch' : 'Quick to digest');
      else if (s.reasons.includes('long')) deets.push(de ? 'Tief eintauchen' : 'Dive deep');
      else if (s.reasons.includes('too_long')) deets.push(de ? 'Lieber später' : 'Save for later');
      if (s.reasons.includes('cozy_vibe')) deets.push(de ? 'Gemütlich' : 'Cozy & light');
      if (s.reasons.includes('high_energy')) deets.push(de ? 'Voller Energie' : 'High energy');
      if (s.reasons.includes('atmospheric')) deets.push(de ? 'Atmosphärisch' : 'Atmospheric');
      if (s.reasons.includes('fast_start')) deets.push(de ? 'Morgendosis' : 'Morning pick-me-up');
      if (s.reasons.includes('profile_match')) deets.push(de ? 'Passt zu dir' : 'Your style');

      let whyRightNow;
      if (deets.length > 0) {
        whyRightNow = de
          ? `${deets.slice(0, 2).join(' · ')} — perfekt für jetzt`
          : `${deets.slice(0, 2).join(' · ')} — perfect for right now`;
      } else {
        whyRightNow = de
          ? 'Passt zu deinem heutigen Vibe'
          : 'Matches your vibe today';
      }

      // Enforce 15 word max
      const wrnWords = whyRightNow.split(' ');
      if (wrnWords.length > 15) whyRightNow = wrnWords.slice(0, 15).join(' ') + '...';

      selected.push({ title: item.title, author, format, why_right_now: whyRightNow, itemLengthHours: s.itemLengthHours });
    }

    // ---- Build queue title ----
    const dayNames = de
      ? ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[day];

    let timeAdjective;
    if (isTiredOrStressed) {
      timeAdjective = de ? 'Entspannter' : 'Cozy';
    } else if (isHighEnergy) {
      timeAdjective = de ? 'Intensiver' : 'High-Energy';
    } else if (timeSlot === 'morning') {
      timeAdjective = de ? 'Morgen' : 'Morning';
    } else if (timeSlot === 'afternoon') {
      timeAdjective = de ? 'Mittag' : 'Afternoon';
    } else if (timeSlot === 'night') {
      timeAdjective = de ? 'Nacht' : 'Late-Night';
    } else {
      timeAdjective = de ? 'Abend' : 'Evening';
    }

    const topGenres = this.getTopGenres(2);
    const genreSuffix = topGenres.length > 0 ? ` ${topGenres.join('/')}` : '';
    const queueTitle = de
      ? `${dayName} ${timeAdjective}:${genreSuffix} ${selected.length} Titel`
      : `${dayName} ${timeAdjective}:${genreSuffix} ${selected.length} Picks`;

    // ---- Vibe description ----
    const energyDesc = isTiredOrStressed
      ? (de ? 'entspannt & gemütlich' : 'relaxed & cozy')
      : isHighEnergy
        ? (de ? 'intensiv & energiegeladen' : 'intense & energetic')
        : (de ? 'ausgewogen' : 'balanced');
    const timeDesc = timeSlot === 'night'
      ? (de ? 'tiefen Fokus' : 'deep focus')
      : timeSlot === 'morning'
        ? (de ? 'frischen Start' : 'fresh start')
        : (de ? 'entspannten Flow' : 'relaxed flow');
    const vibeDescription = de
      ? `${timeAdjective}-Stimmung mit ${energyDesc} Energie. Perfekt für ${timeDesc} an diesem ${dayName}.`
      : `${timeAdjective} vibes with ${energyDesc} energy. Perfect for ${timeDesc} this ${dayName}.`;

    // ---- Estimated total time ----
    const totalHours = selected.reduce((sum, s) => sum + (s.itemLengthHours || 2), 0);
    let estimatedTotalTime;
    if (totalHours <= 1) estimatedTotalTime = de ? '~30 Min' : '~30 mins';
    else if (totalHours <= 3) estimatedTotalTime = de ? '~2 Std' : '~2 hours';
    else if (totalHours <= 8) estimatedTotalTime = de ? '~5 Std' : '~5 hours';
    else estimatedTotalTime = de ? '10+ Std' : '10+ hours';

    return {
      queue_title: queueTitle,
      vibe_description: vibeDescription,
      estimated_total_time: estimatedTotalTime,
      contextual_rules_applied: rules.slice(0, 3),
      media_queue: selected,
    };
  }

  /**
   * "Filter Bubble Breaker" — pick a Wildcard media item from a genre the user
   * rarely interacts with, but which shares deep structural DNA (pacing, tropes,
   * aesthetics) with their favorites.
   *
   * @param {Array} items - Array of media items to choose from (e.g. currentCards)
   * @returns {Object|null} Wildcard result conforming to the specified JSON schema,
   *   or null if no suitable wildcard found.
   */
  pickWildcard(items) {
    const de = this.app && this.app.lang === 'de';
    if (!items || items.length < 3) return null;

    const profile = this.profile;
    const gm = (this.app && this.app._genreMap) || TMDB_GENRE_MAP;

    // ---- 1. Identify low-weight genres (genres the user rarely likes) ----
    // Sort genreWeights ascending — the lowest weights are the least preferred genres
    const weightEntries = Object.entries(profile.genreWeights)
      .filter(([, w]) => w !== undefined && w !== null)
      .sort((a, b) => a[1] - b[1]);

    const lowWeightGenres = weightEntries
      .filter(([, w]) => w <= 0)
      .map(([name]) => name.toLowerCase());

    // If there are no explicitly disliked genres, take the bottom quartile
    let rareGenres = lowWeightGenres.length > 0
      ? lowWeightGenres
      : weightEntries.slice(0, Math.max(1, Math.floor(weightEntries.length / 4))).map(([name]) => name.toLowerCase());

    // Cold-start fallback: if profile has no genre weights at all, derive
    // "rare" genres from the item pool itself — pick genres that appear
    // least often so the wildcard still introduces variety.
    if (rareGenres.length === 0 && items.length > 0) {
      const poolGenreCounts = new Map();
      for (const it of items) {
        const gNames = (it.genres || []).map(g => {
          if (typeof g === 'string') return g;
          const id = typeof g === 'number' ? g : g.id || g;
          return (gm[id] || String(id)).toLowerCase();
        });
        for (const g of gNames) poolGenreCounts.set(g, (poolGenreCounts.get(g) || 0) + 1);
      }
      // Rare = genres that appear on ≤20% of items (or at most 1 item)
      const threshold = Math.max(1, Math.floor(items.length * 0.2));
      rareGenres = [...poolGenreCounts]
        .filter(([, count]) => count <= threshold)
        .map(([name]) => name);

      // Last resort: if every genre appears on >20% of items, treat all
      // genres as "rare" so the wildcard still works on homogeneous pools.
      if (rareGenres.length === 0) {
        rareGenres = [...poolGenreCounts].map(([name]) => name);
      }
    }

    // ---- 2. Find user's top structural DNA (pacing, tropes, aesthetics) ----
    const topTropes = this.getTopTropes(4);
    const topPacing = this.getTopPacingStyles(3);
    const topAesthetics = this.getTopAesthetics(3);

    const hasStructuralPreference = topTropes.length > 0 || topPacing.length > 0 || topAesthetics.length > 0;

    // ---- 3. Score each item as a wildcard candidate ----
    const scored = items.map(item => {
      const isGame = item.type === 'game' || item.source === 'igdb';

      // Determine the item's genre names
      let itemGenres = [];
      if (item.genres) {
        itemGenres = item.genres.map(g => {
          if (typeof g === 'string') return g;
          const id = typeof g === 'number' ? g : g.id || g;
          return isGame ? (GAME_GENRE_NAME_MAP[id] || id) : (gm[id] || id);
        }).filter(Boolean).map(n => n.toString().toLowerCase());
      }

      // Check if this item belongs to a rare/low-weight genre
      const rareGenreOverlap = itemGenres.filter(g =>
        rareGenres.some(rg => g.includes(rg) || rg.includes(g))
      ).length;

      // ---- Structural DNA overlap ----
      const dna = item.mediaDNA || {};
      const itemTropes = (dna.tropes || []).map(t => t.toLowerCase());
      const itemPacing = (dna.pacing || []).map(p => p.toLowerCase());
      const itemAesthetics = (dna.aesthetic || []).map(a => a.toLowerCase());

      // Overlap with user's top structural preferences
      let structureScore = 0;
      const matchedStructure = [];

      if (hasStructuralPreference) {
        topTropes.forEach(t => {
          if (itemTropes.some(it => it.includes(t) || t.includes(it))) {
            structureScore += 15;
            matchedStructure.push(t);
          }
        });
        topPacing.forEach(p => {
          if (itemPacing.some(ip => ip.includes(p) || p.includes(ip))) {
            structureScore += 12;
            matchedStructure.push(p);
          }
        });
        topAesthetics.forEach(a => {
          if (itemAesthetics.some(ia => ia.includes(a) || a.includes(ia))) {
            structureScore += 10;
            matchedStructure.push(a);
          }
        });
      }

      // ---- Penalty: item in a GENRE the user strongly prefers ----
      const highWeightGenres = weightEntries
        .filter(([, w]) => w > 3)
        .map(([name]) => name.toLowerCase());
      const comfortZoneOverlap = itemGenres.filter(g =>
        highWeightGenres.some(hw => g.includes(hw) || hw.includes(g))
      ).length;

      // ---- Final score ----
      // We want: high rareGenreOverlap + high structureScore - comfortZoneOverlap
      let wildcardScore = rareGenreOverlap * 25 + structureScore - comfortZoneOverlap * 20;

      // If user has no structural preferences yet (cold start), rely more on genre rarity
      if (!hasStructuralPreference) {
        wildcardScore = rareGenreOverlap * 20 - comfortZoneOverlap * 10;
      }

      // Items with NO rare genre overlap are not wildcard candidates
      if (rareGenreOverlap === 0) wildcardScore = -999;

      return {
        item,
        wildcardScore,
        rareGenres: itemGenres.filter(g =>
          rareGenres.some(rg => g.includes(rg) || rg.includes(g))
        ),
        matchedStructure,
        itemGenres,
        isGame,
        dna,
      };
    });

    // Filter to valid candidates and sort by score
    const candidates = scored.filter(s => s.wildcardScore > 0 && s.rareGenres.length > 0);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.wildcardScore - a.wildcardScore);

    // Pick the best candidate
    const best = candidates[0];
    // If there are multiple good candidates, randomly pick from top 3 for variety
    const topCandidates = candidates.filter(c => c.wildcardScore >= best.wildcardScore * 0.8);
    const chosen = topCandidates.length > 1
      ? topCandidates[Math.floor(Math.random() * topCandidates.length)]
      : best;

    const item = chosen.item;

    // ---- 4. Determine the "opposite" genre for display ----
    const actualGenre = chosen.rareGenres.length > 0
      ? chosen.rareGenres[0]
      : (chosen.itemGenres[0] || (de ? 'Unbekannt' : 'Unknown'));

    const actualGenreFormatted = actualGenre.charAt(0).toUpperCase() + actualGenre.slice(1);

    // ---- 5. Build the revealed traits ----
    const dna = item.mediaDNA || {};
    const moodWords = this._describeMood(item, dna, de);
    const pacingWords = this._describePacing(item, dna, de);

    // Micro-tropes from the item's DNA
    const microTropes = [];
    if (dna.tropes) {
      const localized = dna.tropes.map(t => this._localizeTrope(t, de));
      microTropes.push(...localized.slice(0, 2));
    }
    if (microTropes.length < 2 && item.tags) {
      microTropes.push(...item.tags.slice(0, 2 - microTropes.length));
    }
    if (microTropes.length === 0) {
      microTropes.push(de ? 'Spannend' : 'Engaging');
      microTropes.push(de ? 'Fesselnd' : 'Captivating');
    }

    // ---- 6. Genre-agnostic hook ----
    const hook = this._generateBlindHook(item, dna, de);

    // ---- 7. The bridge explanation ----
    const bridge = this._generateBridge(item, chosen, de);

    return {
      wildcard_title: item.title,
      wildcard_author: item.author || item.director || '',
      actual_genre: actualGenreFormatted,
      revealed_traits: {
        mood: moodWords,
        pacing: pacingWords,
        micro_tropes: microTropes.slice(0, 2),
      },
      the_hook: hook,
      the_bridge: bridge,
    };
  }

  /**
   * Describe the mood of an item in genre-agnostic terms.
   */
  _describeMood(item, dna, de) {
    const aesthetics = dna.aesthetic || [];
    const tropes = dna.tropes || [];

    const moodMap = {
      neon_noir: de ? 'Cynisch, atmosphärisch' : 'Tense, atmospheric',
      cottagecore: de ? 'Sanft, geborgen' : 'Gentle, comforting',
      minimalist: de ? 'Ruhig, reduziert' : 'Quiet, restrained',
      baroque: de ? 'Üppig, dramatisch' : 'Lavish, dramatic',
      lo_fi: de ? 'Roh, authentisch' : 'Raw, authentic',
      pastel_dream: de ? 'Verträumt, leicht' : 'Dreamy, light',
      brutalist: de ? 'Hart, ungeschliffen' : 'Harsh, unpolished',
      retro_wave: de ? 'Nostalgisch, pulsierend' : 'Nostalgic, pulsing',
      fairy_tale: de ? 'Magisch, zauberhaft' : 'Magical, enchanting',
      gritty_realism: de ? 'Schonungslos, echt' : 'Unflinching, real',
      high_contrast: de ? 'Dramatisch, intensiv' : 'Dramatic, intense',
    };

    for (const a of aesthetics) {
      if (moodMap[a]) return moodMap[a];
    }

    // Fallback based on tropes
    const tropeMood = {
      chosen_one: de ? 'Schicksalhaft, episch' : 'Fateful, epic',
      redemption_arc: de ? 'Nachdenklich, hoffnungsvoll' : 'Reflective, hopeful',
      revenge: de ? 'Dunkel, verbissen' : 'Dark, driven',
      underdog: de ? 'Hoffnungsvoll, mitreißend' : 'Hopeful, gripping',
      mystery_box: de ? 'Rätselhaft, fesselnd' : 'Mysterious, absorbing',
      survival: de ? 'Angespannt, roh' : 'Tense, raw',
      found_family: de ? 'Warm, herzlich' : 'Warm, heartfelt',
    };

    for (const t of tropes) {
      if (tropeMood[t]) return tropeMood[t];
    }

    return de ? 'Fesselnd' : 'Captivating';
  }

  /**
   * Describe the pacing of an item.
   */
  _describePacing(item, dna, de) {
    const pacing = dna.pacing || [];

    const pacingMap = {
      relentless: de ? 'Atemlos, rasant' : 'Relentless, fast-paced',
      slow_burn: de ? 'Langsam entfaltend' : 'Slow-burning',
      meditative: de ? 'Meditativ, bedächtig' : 'Meditative, thoughtful',
      ticking_clock: de ? 'Tickende Uhr, dringend' : 'Ticking clock, urgent',
      twisty: de ? 'Überraschungsreich, verschlungen' : 'Twisty, intricate',
      roller_coaster: de ? 'Achterbahnfahrt' : 'Roller coaster',
      episodic: de ? 'Episodisch, vielschichtig' : 'Episodic, layered',
      non_linear: de ? 'Nicht-linear, puzzelnd' : 'Non-linear, puzzle-like',
      slow_start: de ? 'Langsam aufbauend' : 'Slow-burn build',
    };

    for (const p of pacing) {
      if (pacingMap[p]) return pacingMap[p];
    }

    // Fallback by playtime for games
    if ((item.type === 'game' || item.source === 'igdb') && item.playtime !== undefined) {
      if (item.playtime <= 5) return de ? 'Kurz, knackig' : 'Short, snappy';
      if (item.playtime <= 20) return de ? 'Mittel, gleichmäßig' : 'Medium, steady';
      return de ? 'Lang, episch' : 'Long, epic';
    }

    return de ? 'Ausgewogen' : 'Balanced';
  }

  /**
   * Localize a trope name.
   */
  _localizeTrope(trope, de) {
    if (!de) return trope.replace(/_/g, ' ');
    const map = {
      chosen_one: 'Auserwählter',
      fish_out_of_water: 'Fisch auf dem Trockenen',
      redemption_arc: 'Erlösungsbogen',
      mentor_streak: 'Mentor-Gefälle',
      revenge: 'Rache',
      survival: 'Überleben',
      love_triangle: 'Liebesdreieck',
      underdog: 'Außenseiter',
      sacrifice: 'Opfer',
      betrayal: 'Verrat',
      found_family: 'Wahlfamilie',
      time_loop: 'Zeitschleife',
      mystery_box: 'Mysterium',
      forbidden_love: 'Verbotene Liebe',
      coming_of_age: 'Erwachsenwerden',
    };
    return map[trope] || trope.replace(/_/g, ' ');
  }

  /**
   * Generate a genre-agnostic hook sentence.
   */
  _generateBlindHook(item, dna, de) {
    const overview = item.overview || '';

    // If we have an overview, craft a hook from it without mentioning genre
    if (overview.length > 20) {
      // Extract first sentence, then add stakes
      const sentences = overview.match(/[^.!?]+[.!?]+/g) || [overview];
      const firstBit = sentences[0].trim();
      const words = firstBit.split(' ');

      // If the first sentence is too long, truncate it
      let hook = words.length > 20 ? words.slice(0, 18).join(' ') + '...' : firstBit;

      // Add a stake-driven second sentence if we have more content
      if (sentences.length > 1 && hook.length < 120) {
        const secondSent = sentences[1].trim();
        const secondWords = secondSent.split(' ');
        if (secondWords.length < 15) {
          hook += ' ' + secondSent;
        }
      }

      // Remove any explicit genre mentions (sci-fi, fantasy, historical, etc.)
      const genreWords = ['sci-fi', 'sci fi', 'science fiction', 'fantasy', 'historical',
        'romance', 'thriller', 'horror', 'comedy', 'drama', 'action', 'documentary'];
      genreWords.forEach(gw => {
        const regex = new RegExp(`\\b${gw}\\b`, 'gi');
        hook = hook.replace(regex, '');
      });

      // Clean up double spaces that may result
      hook = hook.replace(/\s+/g, ' ').trim();

      if (hook.length > 20) return hook;
    }

    // Fallback: generate a hook from DNA
    const tropes = dna.tropes || [];
    const aesthetics = dna.aesthetic || [];

    if (tropes.includes('mystery_box') || tropes.includes('time_loop')) {
      return de
        ? 'Nichts ist, wie es scheint. Jede Antwort führt zu einer neuen, noch dringenderen Frage.'
        : 'Nothing is as it seems. Every answer leads to a new, more urgent question.';
    }
    if (tropes.includes('survival') || tropes.includes('revenge')) {
      return de
        ? 'An ihre Grenzen getrieben, müssen sie über sich hinauswachsen — oder alles verlieren.'
        : 'Pushed to their limits, they must rise above — or lose everything.';
    }
    if (tropes.includes('redemption_arc') || tropes.includes('sacrifice')) {
      return de
        ? 'Eine zweite Chance, das Richtige zu tun. Aber der Preis könnte alles sein.'
        : 'A second chance to do the right thing. But the price might be everything.';
    }
    if (tropes.includes('found_family') || tropes.includes('underdog')) {
      return de
        ? 'Eine Gruppe scheinbar gewöhnlicher Menschen entdeckt, dass sie gemeinsam außergewöhnlich sind.'
        : 'A group of unlikely people discover they are extraordinary together.';
    }
    if (aesthetics.includes('neon_noir') || aesthetics.includes('high_contrast')) {
      return de
        ? 'In einer Welt aus Schatten und grellem Licht zählt nur, wem du vertraust.'
        : 'In a world of shadows and blinding light, the only thing that matters is who you trust.';
    }
    if (aesthetics.includes('cottagecore') || aesthetics.includes('pastel_dream')) {
      return de
        ? 'Ein ruhiger Ort, eine unerwartete Entdeckung — und das Gefühl, endlich angekommen zu sein.'
        : 'A quiet place, an unexpected discovery — and the feeling of finally belonging.';
    }

    return de
      ? 'Eine Geschichte, die dich nicht mehr loslassen wird — von der ersten bis zur letzten Minute.'
      : 'A story that won\'t let go — from the first moment to the last.';
  }

  /**
   * Generate a bridge explanation — why this wildcard was chosen for this user.
   */
  _generateBridge(item, scored, de) {
    const dna = item.mediaDNA || {};
    const parts = [];

    // Explain the structural bridge
    const pacing = (dna.pacing || [])[0];
    const trope = (dna.tropes || [])[0];
    const aesthetic = (dna.aesthetic || [])[0];

    // Build "you love X" from profile
    const topPacing = this.getTopPacingStyles(1);
    const topTropes = this.getTopTropes(1);

    const localPace = topPacing.length ? this._localizeTrope(topPacing[0], de) : (de ? 'tolle' : 'great');
    const localTrope = topTropes.length ? this._localizeTrope(topTropes[0], de) : (de ? 'starke' : 'strong');
    const localItemPace = pacing ? this._localizeTrope(pacing, de) : (de ? 'packende' : 'compelling');
    const localItemTrope = trope ? this._localizeTrope(trope, de) : (de ? 'fesselnde' : 'gripping');

    if (topPacing.length > 0 && pacing) {
      parts.push(de
        ? `Du liebst ${localPace}-Erzählungen; dieser Titel hat genau dieses Tempo`
        : `You love ${localPace} storytelling; this one shares that same pacing`
      );
    }
    if (topTropes.length > 0 && trope) {
      parts.push(de
        ? `„${localTrope}“ ist dein wiederkehrendes Thema — und es ist auch hier zu finden`
        : `"${localTrope}" is your recurring theme — and it\'s here too`
      );
    }
    if (!parts.length) {
      // Fallback: describe shared vibe
      const matchedStr = scored.matchedStructure.slice(0, 2);
      if (matchedStr.length) {
        const strList = matchedStr.map(s => this._localizeTrope(s, de)).join(', ');
        parts.push(de
          ? `Es hat die gleiche DNA wie das, was dir gefällt: ${strList}`
          : `It shares the same DNA as what you love: ${strList}`
        );
      } else {
        parts.push(de
          ? `Es geht um etwas Vertrautes — nur in einer Umgebung, die du sonst meidest`
          : `It\'s about something familiar — just wrapped in a setting you usually skip`
        );
      }
    }

    return parts.join(' ');
  }

  /**
   * Re-score and re-sort remaining cards in the queue after a profile update.
   * Called after swipe to reflect newly learned preferences.
   * @param {Array} cards - The full currentCards array.
   * @param {number} startIndex - Index of the next unswiped card.
   * @param {string} [experimentGroup] - 'treatment' for MMR diversity, 'control' for random serendipity.
   * @returns {Array} New cards array with already-swiped cards preserved and remaining re-sorted.
   */
  rescoreQueue(cards, startIndex, experimentGroup) {
    if (!cards || startIndex >= cards.length) return cards;

    // Split: keep already-swiped cards as-is, re-score the rest
    const swiped = cards.slice(0, startIndex);
    const remaining = cards.slice(startIndex);

    // Re-score each remaining card with the updated profile
    const rescored = remaining.map(card => {
      // Clear cached score so score() recalculates with fresh weights
      this.cache.delete(card.id);
      return { ...card, _score: this.score(card) };
    });

    // Sort remaining by new score descending
    rescored.sort((a, b) => b._score - a._score);

    // Apply diversity reranking if treatment group
    const diversityCount = rescored.length > 10 ? Math.max(1, Math.floor(rescored.length * 0.15)) : 0;
    let reranked;
    if (diversityCount > 0 && experimentGroup === 'treatment') {
      const forRerank = rescored.map(c => ({ ...c, _mmrScore: c._score }));
      reranked = this.mmrRerank(forRerank, diversityCount);
      reranked = reranked.map(({ _mmrScore, ...card }) => card);
    } else if (diversityCount > 0 && experimentGroup === 'control') {
      // Control: random serendipity — pick random mid-tier cards
      const pool = rescored.slice(
        Math.floor(rescored.length * 0.2),
        Math.floor(rescored.length * 0.6)
      );
      const picks = pool.sort(() => Math.random() - 0.5).slice(0, diversityCount);
      const pickIds = new Set(picks.map(c => c.id));
      const rest = rescored.filter(c => !pickIds.has(c.id));
      reranked = rest.length > 0 ? [rest[0], ...picks, ...rest.slice(1)] : picks;
    } else {
      reranked = rescored;
    }

    return [...swiped, ...reranked];
  }
  clear() {
    this.cache.clear();
    this._tasteVec = null;
    this._bonusCache = null;
    this._bonusCacheRev = null;
  }
}
