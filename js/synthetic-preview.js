/**
 * Synthetic Preview Generation Engine
 * Generates rich fallback previews when a card has no trailer, no backdrop,
 * no screenshots, or no cover. Produces a gradient + icon + tagline + mood
 * so the user never sees an empty state.
 *
 * Exports:
 *   generateSyntheticPreview(card, mediaType, lang)
 *   moodToPalette(mood)
 *   generateTagline(card, mediaType, lang)
 *   mediaTypeIcon(mediaType)
 *   extractDominantColor(imageElement)
 */

// ===== MOOD-TO-PALETTE MAPPING =====
const PALETTES = {
  'dark':    ['#0a0a0f', '#1a1a2e'],
  'noir':    ['#0a0a0f', '#1a1a2e'],
  'warm':    ['#d4a574', '#8b5a2b'],
  'cozy':    ['#d4a574', '#8b5a2b'],
  'cold':    ['#0a84ff', '#0066cc'],
  'sci-fi':  ['#0a84ff', '#0066cc'],
  'neon':    ['#00cccc', '#cc00cc'],
  'cyber':   ['#00cccc', '#cc00cc'],
  'pastel':  ['#ffb6c1', '#ff69b4'],
  'romance': ['#ffb6c1', '#ff69b4'],
  'gritty':  ['#ff453a', '#ff6b6b'],
  'action':  ['#ff453a', '#ff6b6b'],
  'natural': ['#30d158', '#5ac8fa'],
  'adventure': ['#30d158', '#5ac8fa'],
  'neutral': ['#2a2a3a', '#1a1a2e'],
};

const MEDIA_TYPE_ICONS = {
  movies: '🎬',
  tv: '📺',
  books: '📚',
  games: '🎮',
};

const MEDIA_TYPE_LABELS = {
  de: { movies: 'Film', tv: 'Serie', books: 'Buch', games: 'Spiel' },
  en: { movies: 'Movie', tv: 'Show', books: 'Book', games: 'Game' },
};

// ===== VERB / EMOTION TEMPLATES FOR MOVIES =====
const MOVIE_VERBS = {
  de: ['hält dich in Atem', 'verändert deine Sicht', 'lässt dich nicht los', 'berührt dich tief', 'fordert dich heraus'],
  en: ['keeps you guessing', 'changes your perspective', 'won\'t let go', 'touches you deeply', 'challenges you'],
};

const MOVIE_EMOTIONS = {
  de: ['Spannung', 'Freude', 'Nachdenklichkeit', 'Staunen', 'Furcht'],
  en: ['suspense', 'joy', 'thought', 'wonder', 'fear'],
};

// ===== ADJECTIVE POOL =====
const ADJECTIVES = {
  de: ['fesselnd', 'atemberaubend', 'düster', 'herzerwärmend', 'irrwitzig', 'episch', 'intim', 'verstörend', 'magisch', 'raw'],
  en: ['gripping', 'breathtaking', 'dark', 'heartwarming', 'wild', 'epic', 'intimate', 'unsettling', 'magical', 'raw'],
};

/**
 * Generate a synthetic preview object for a card.
 * @param {Object} card - The media card (must have at least title and optionally mediaDNA, genres, overview).
 * @param {string} mediaType - 'movies' | 'tv' | 'books' | 'games'
 * @param {string} lang - 'de' | 'en'
 * @returns {Object} Synthetic preview descriptor
 */
export function generateSyntheticPreview(card, mediaType = 'movies', lang = 'de') {
  if (!card || typeof card !== 'object') {
    console.warn('[SyntheticPreview] Invalid card supplied');
    return _fallbackPreview(mediaType, lang);
  }

  const mood = _extractMood(card);
  const palette = moodToPalette(mood);
  const gradient = `linear-gradient(135deg, ${palette[0]}, ${palette[1]})`;
  const tagline = generateTagline(card, mediaType, lang);
  const genre = _extractGenre(card, lang);
  const icon = mediaTypeIcon(mediaType);
  const ambientRgb = _hexToRgb(palette[0]);

  return {
    type: 'synthetic',
    background: gradient,
    icon,
    tagline,
    mood,
    genre,
    title: card.title || '',
    ambientColor: ambientRgb,
    // A short "synopsis" built from the overview if available
    synopsis: _generateSynopsis(card, lang),
  };
}

/**
 * Map a mood string to a 2-color gradient palette.
 * @param {string} mood
 * @returns {string[]} [startColor, endColor]
 */
export function moodToPalette(mood) {
  const m = (mood || 'neutral').toLowerCase().trim();
  // Direct match
  if (PALETTES[m]) return PALETTES[m];
  // Fuzzy match: try partial keys
  for (const [key, val] of Object.entries(PALETTES)) {
    if (m.includes(key) || key.includes(m)) return val;
  }
  return PALETTES.neutral;
}

/**
 * Generate a tagline from the card's title, genre, and media type.
 * @param {Object} card
 * @param {string} mediaType
 * @param {string} lang
 * @returns {string}
 */
export function generateTagline(card, mediaType = 'movies', lang = 'de') {
  if (!card || typeof card !== 'object') return '';
  const title = card.title || '';
  const genreName = _extractGenre(card, lang);
  const label = (MEDIA_TYPE_LABELS[lang] || MEDIA_TYPE_LABELS.de)[mediaType] || '';

  switch (mediaType) {
    case 'movies': {
      const verbs = MOVIE_VERBS[lang] || MOVIE_VERBS.en;
      const emotions = MOVIE_EMOTIONS[lang] || MOVIE_EMOTIONS.en;
      const verb = verbs[Math.abs(_hashCode(title)) % verbs.length];
      const emotion = emotions[Math.abs(_hashCode(title + 'e')) % emotions.length];
      return lang === 'de'
        ? `Ein ${genreName || 'Film'} der ${verb} — ${emotion}.`
        : `A ${genreName || 'film'} that ${verb} — ${emotion}.`;
    }
    case 'tv': {
      const seasons = card.seasons || card.number_of_seasons || 0;
      const adj = _pickAdjective(title, lang);
      if (seasons && seasons > 0) {
        return lang === 'de'
          ? `${seasons} Staffeln ${adj} ${genreName || 'Serie'}.`
          : `${seasons} seasons of ${adj} ${genreName || 'TV'}.`;
      }
      return lang === 'de'
        ? `Eine ${adj} ${genreName || 'Serie'}.`
        : `A ${adj} ${genreName || 'show'}.`;
    }
    case 'books': {
      const pages = card.pageCount || card.number_of_pages || card.page_count || 0;
      const adj = _pickAdjective(title, lang);
      if (pages && pages > 0) {
        return lang === 'de'
          ? `${pages} Seiten ${adj} ${genreName || 'Prosa'}.`
          : `${pages} pages of ${adj} ${genreName || 'prose'}.`;
      }
      return lang === 'de'
        ? `Ein ${adj} ${genreName || 'Buch'}.`
        : `A ${adj} ${genreName || 'book'}.`;
    }
    case 'games': {
      const hours = card.playtime || card.playtime_main || card.playtime_hours || 0;
      const adj = _pickAdjective(title, lang);
      if (hours && hours > 0) {
        return lang === 'de'
          ? `${hours} Stunden ${adj} ${genreName || 'Gameplay'}.`
          : `${hours} hours of ${adj} ${genreName || 'gameplay'}.`;
      }
      return lang === 'de'
        ? `Ein ${adj} ${genreName || 'Spiel'}.`
        : `A ${adj} ${genreName || 'game'}.`;
    }
    default:
      return title;
  }
}

/**
 * Return the emoji icon for a media type.
 * @param {string} mediaType
 * @returns {string}
 */
export function mediaTypeIcon(mediaType) {
  return MEDIA_TYPE_ICONS[mediaType] || '✨';
}

/**
 * Extract a dominant color from an image element using a canvas.
 * @param {HTMLImageElement} imageElement
 * @returns {{r:number, g:number, b:number}|null}
 */
export function extractDominantColor(imageElement) {
  if (!imageElement || !imageElement.complete || !imageElement.naturalWidth) return null;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const w = 50;
    const h = 50;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(imageElement, 0, 0, w, h);
    // Sample center 10x10 pixels
    const imageData = ctx.getImageData(20, 20, 10, 10);
    const data = imageData.data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    if (count === 0) return null;
    const avg = { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
    // Boost saturation by 1.3x
    return _boostSaturation(avg, 1.3);
  } catch (e) {
    // CORS or canvas tainting — silently return null
    return null;
  }
}

// ===== INTERNAL HELPERS =====

function _extractMood(card) {
  const dna = card.mediaDNA || {};
  if (dna.mood && dna.mood.length) return dna.mood[0];
  if (dna.aesthetic && dna.aesthetic.length) return dna.aesthetic[0];
  if (dna.tone && dna.tone.length) return dna.tone[0];
  // Fallback: try to infer from genre name
  const g = _extractGenre(card, 'en');
  if (!g) return 'neutral';
  const lower = g.toLowerCase();
  if (lower.includes('horror') || lower.includes('thriller') || lower.includes('dark')) return 'dark';
  if (lower.includes('romance') || lower.includes('comedy') || lower.includes('family')) return 'warm';
  if (lower.includes('sci-fi') || lower.includes('science') || lower.includes('cyber')) return 'cold';
  if (lower.includes('action') || lower.includes('war') || lower.includes('crime')) return 'gritty';
  if (lower.includes('fantasy') || lower.includes('adventure') || lower.includes('nature')) return 'natural';
  return 'neutral';
}

function _extractGenre(card, lang = 'de') {
  const genres = card.genres || [];
  if (!genres.length) return '';
  const first = genres[0];
  // If it's a string, return it directly
  if (typeof first === 'string') return first;
  // If it's a number, try to map it (TMDB genre ID)
  if (typeof first === 'number') {
    // Lazy import TMDB genre map to avoid circular deps
    return _tmdbGenreName(first, lang);
  }
  // If it's an object with label/name
  if (first && (first.label || first.name)) return first.label || first.name;
  return '';
}

function _tmdbGenreName(id, lang) {
  // Inline minimal mapping so we don't depend on utils.js
  const DE = {
    28:'Action', 12:'Abenteuer', 16:'Animation', 35:'Komödie', 80:'Krimi',
    18:'Drama', 14:'Fantasy', 27:'Horror', 878:'Sci-Fi', 53:'Thriller',
    10759:'Action & Abenteuer', 10765:'Sci-Fi & Fantasy'
  };
  const EN = {
    28:'Action', 12:'Adventure', 16:'Animation', 35:'Comedy', 80:'Crime',
    18:'Drama', 14:'Fantasy', 27:'Horror', 878:'Sci-Fi', 53:'Thriller',
    10759:'Action & Adventure', 10765:'Sci-Fi & Fantasy'
  };
  return (lang === 'en' ? EN : DE)[id] || '';
}

function _pickAdjective(seed, lang) {
  const pool = ADJECTIVES[lang] || ADJECTIVES.en;
  return pool[Math.abs(_hashCode(seed)) % pool.length];
}

function _generateSynopsis(card, lang) {
  const overview = card.overview || card.description || '';
  if (!overview) return '';
  // Return first 2 sentences, max 140 chars
  const sentences = overview.split(/[.!?]/).map(s => s.trim()).filter(Boolean);
  let result = sentences.slice(0, 2).join('. ');
  if (result.length > 140) result = result.slice(0, 137) + '…';
  return result;
}

function _fallbackPreview(mediaType, lang) {
  const palette = PALETTES.neutral;
  return {
    type: 'synthetic',
    background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})`,
    icon: mediaTypeIcon(mediaType),
    tagline: lang === 'de' ? 'Entdecke etwas Neues' : 'Discover something new',
    mood: 'neutral',
    genre: '',
    title: '',
    ambientColor: _hexToRgb(palette[0]),
    synopsis: '',
  };
}

function _hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function _hexToRgb(hex) {
  const m = hex.replace('#', '').match(/^([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i);
  if (!m) return { r: 42, g: 42, b: 58 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function _boostSaturation({ r, g, b }, factor) {
  // Convert to HSL, boost saturation, convert back
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const l = (max + min) / 2;
  let s = 0;
  if (max !== min) {
    s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  }
  s = Math.min(1, s * factor);
  // Reconstruct RGB from HSL (simplified: keep hue, boost saturation)
  const h = _rgbToHue(rNorm, gNorm, bNorm);
  const { r: nr, g: ng, b: nb } = _hslToRgb(h, s, l);
  return { r: Math.round(nr * 255), g: Math.round(ng * 255), b: Math.round(nb * 255) };
}

function _rgbToHue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  if (max === min) return 0;
  const d = max - min;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h;
}

function _hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r, g, b };
}
