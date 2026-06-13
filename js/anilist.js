/**
 * AniList (https://anilist.co) GraphQL fetcher.
 * No auth needed for public queries; rate limit ~90 req/min per IP.
 * Cache is handled by the server-side proxy (`/proxy/anilist/`).
 *
 * Returns anime/manga in the same standard format used elsewhere:
 *   { id, title, cover, year, overview, genres, rating, ratingCount, source, type }
 */

// Fields we want back from AniList for both ANIME and MANGA
const ANILIST_BASE_FIELDS = `
  id
  title { romaji english german }
  coverImage { extraLarge large medium color }
  bannerImage
  description(asHtml: false)
  genres
  averageScore
  meanScore
  popularity
  status
  startDate { year month day }
  endDate { year month day }
  season
  format
  chapters
  volumes
  episodes
  duration
  studios(isMain: true) { nodes { id name } }
  trailer { id site }
  siteUrl
  nextAiringEpisode { episode timeUntilAiring }
`;

// Strip HTML tags from AniList descriptions (AniList returns HTML even with asHtml: false for some fields)
function _stripHtml(s) {
  if (!s) return '';
  return s.replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .trim();
}

function _pickTitle(titleObj, lang = 'en') {
  if (!titleObj) return '';
  // Prefer user-language romanization, then English, then romaji
  if (lang === 'de' && titleObj.german) return titleObj.german;
  if (titleObj.english) return titleObj.english;
  if (titleObj.romaji) return titleObj.romaji;
  return '';
}

function _mapAniList(item, type, lang = 'en') {
  if (!item) return null;
  const start = item.startDate || {};
  const year = start.year || null;
  const score = item.averageScore || item.meanScore || null;
  return {
    id: `anilist-${item.id}`,
    anilist_id: item.id,
    title: _pickTitle(item.title, lang),
    titleRomaji: item.title?.romaji || null,
    cover: item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || '',
    banner: item.bannerImage || '',
    year,
    overview: _stripHtml(item.description),
    genres: item.genres || [],
    rating: score ? Math.round(score / 10) : null, // AniList is 0-100, normalize to 0-10
    ratingRaw: score,
    popularity: item.popularity || null,
    status: item.status || null,
    format: item.format || null,
    episodes: item.episodes || null,
    duration: item.duration || null,
    chapters: item.chapters || null,
    volumes: item.volumes || null,
    season: item.season || null,
    studios: (item.studios?.nodes || []).map(s => s.name),
    trailer: item.trailer?.id ? { id: item.trailer.id, site: item.trailer.site } : null,
    siteUrl: item.siteUrl || null,
    source: 'anilist',
    type, // 'anime' or 'manga'
  };
}

async function _aniListFetch(query, variables) {
  try {
    const r = await fetch('/proxy/anilist/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!r.ok) return { data: null, errors: [{ message: `HTTP ${r.status}` }] };
    return await r.json();
  } catch (e) {
    return { data: null, errors: [{ message: String(e) }] };
  }
}

/**
 * Fetch popular anime or manga from AniList.
 * @param {string} type - 'ANIME' or 'MANGA'
 * @param {number} page - page number (1-based)
 * @param {number} perPage - items per page (max 50)
 * @param {string} lang - 'en' or 'de' (for title preference)
 * @returns {Promise<Array>} mapped items in standard format
 */
export async function fetchAniListPopular(type = 'ANIME', page = 1, perPage = 30, lang = 'en') {
  const query = `
    query ($page: Int, $perPage: Int, $type: MediaType) {
      Page(page: $page, perPage: $perPage) {
        media(type: $type, sort: POPULARITY_DESC, isAdult: false) {
          ${ANILIST_BASE_FIELDS}
        }
      }
    }
  `;
  const result = await _aniListFetch(query, { page, perPage, type });
  if (result.errors) {
    console.warn('AniList popular error:', result.errors);
    return [];
  }
  const items = result.data?.Page?.media || [];
  const cardType = type === 'MANGA' ? 'manga' : 'anime';
  return items.map(it => _mapAniList(it, cardType, lang)).filter(Boolean);
}

/**
 * Fetch top-rated anime or manga from AniList.
 */
export async function fetchAniListTopRated(type = 'ANIME', page = 1, perPage = 30, lang = 'en') {
  const query = `
    query ($page: Int, $perPage: Int, $type: MediaType) {
      Page(page: $page, perPage: $perPage) {
        media(type: $type, sort: SCORE_DESC, isAdult: false) {
          ${ANILIST_BASE_FIELDS}
        }
      }
    }
  `;
  const result = await _aniListFetch(query, { page, perPage, type });
  if (result.errors) {
    console.warn('AniList topRated error:', result.errors);
    return [];
  }
  const items = result.data?.Page?.media || [];
  const cardType = type === 'MANGA' ? 'manga' : 'anime';
  return items.map(it => _mapAniList(it, cardType, lang)).filter(Boolean);
}

/**
 * Search AniList by query string.
 */
export async function searchAniList(query, type = 'ANIME', limit = 10, lang = 'en') {
  const safe = (query || '').replace(/"/g, '\\"');
  const gql = `
    query ($search: String, $type: MediaType) {
      Page(perPage: ${Math.min(50, Math.max(1, limit))}) {
        media(search: $search, type: $type, isAdult: false) {
          ${ANILIST_BASE_FIELDS}
        }
      }
    }
  `;
  const result = await _aniListFetch(gql, { search: safe, type });
  if (result.errors) {
    console.warn('AniList search error:', result.errors);
    return [];
  }
  const items = result.data?.Page?.media || [];
  const cardType = type === 'MANGA' ? 'manga' : 'anime';
  return items.map(it => _mapAniList(it, cardType, lang)).filter(Boolean);
}

/**
 * Fetch trending anime or manga (popular in the last few days).
 * AniList doesn't have a dedicated trending endpoint, but we can use
 * TRENDING_DESC sort which is popularity-weighted by recent activity.
 */
export async function fetchAniListTrending(type = 'ANIME', page = 1, perPage = 20, lang = 'en') {
  const query = `
    query ($page: Int, $perPage: Int, $type: MediaType) {
      Page(page: $page, perPage: $perPage) {
        media(type: $type, sort: TRENDING_DESC, isAdult: false) {
          ${ANILIST_BASE_FIELDS}
        }
      }
    }
  `;
  const result = await _aniListFetch(query, { page, perPage, type });
  if (result.errors) {
    console.warn('AniList trending error:', result.errors);
    return [];
  }
  const items = result.data?.Page?.media || [];
  const cardType = type === 'MANGA' ? 'manga' : 'anime';
  return items.map(it => _mapAniList(it, cardType, lang)).filter(Boolean);
}

/**
 * Fetch "more like this" recommendations based on genres.
 * @param {Array<string>} genres - list of AniList genre strings
 * @param {string} type - 'ANIME' or 'MANGA'
 * @param {number} perPage
 * @param {string} lang
 */
export async function fetchAniListByGenres(genres = [], type = 'ANIME', perPage = 20, lang = 'en') {
  if (!genres || !genres.length) return [];
  const genreList = genres.slice(0, 4).map(g => `"${String(g).replace(/"/g, '')}"`).join(', ');
  const query = `
    query ($perPage: Int, $type: MediaType) {
      Page(perPage: $perPage) {
        media(type: $type, genre_in: [${genreList}], sort: SCORE_DESC, isAdult: false) {
          ${ANILIST_BASE_FIELDS}
        }
      }
    }
  `;
  const result = await _aniListFetch(query, { perPage, type });
  if (result.errors) {
    console.warn('AniList byGenres error:', result.errors);
    return [];
  }
  const items = result.data?.Page?.media || [];
  const cardType = type === 'MANGA' ? 'manga' : 'anime';
  return items.map(it => _mapAniList(it, cardType, lang)).filter(Boolean);
}
