import { safeGetJSON, safeSetJSON } from './utils.js';
import { steamAPI } from './steam.js';

const IGDB_FIELDS = `
  id,name,slug,summary,storyline,url,
  cover.url,cover.image_id,
  screenshots.url,screenshots.image_id,
  genres.id,genres.name,
  themes.id,themes.name,
  platforms.id,platforms.name,platforms.abbreviation,
  first_release_date,
  total_rating,total_rating_count,
  aggregated_rating,aggregated_rating_count,
  game_modes.id,game_modes.name,
  player_perspectives.id,player_perspectives.name,
  videos.video_id,videos.name,
  release_dates.date,release_dates.platform,
  similar_games.id,
  dlcs.id,
  expansion.id
`;

function _mapGame(g) {
  const ts = g.first_release_date;
  const year = ts ? new Date(ts * 1000).getFullYear() : null;
  const coverUrl = g.cover?.url
    ? g.cover.url.replace('thumb', 'cover_big').replace('//', 'https://')
    : '';
  const screenshotUrls = (g.screenshots || []).slice(0, 3).map(s =>
    s.url ? s.url.replace('thumb', 'screenshot_big').replace('//', 'https://') : ''
  );
  const platforms = (g.platforms || []).map(p => ({
    id: p.id, name: p.name, abbr: p.abbreviation || p.name
  }));
  const genres = (g.genres || []).map(gen => gen.name);
  const themes = (g.themes || []).map(t => t.name);
  const modes = (g.game_modes || []).map(m => m.name);
  const perspectives = (g.player_perspectives || []).map(p => p.name);
  const trailers = (g.videos || []).filter(v =>
    /trailer|teaser|gameplay/i.test(v.name || '')
  ).map(v => ({ id: v.video_id, name: v.name }));

  return {
    id: `igdb-${g.id}`,
    igdb_id: g.id,
    title: g.name,
    slug: g.slug,
    cover: coverUrl,
    screenshots: screenshotUrls,
    year,
    overview: g.summary || g.storyline || '',
    genres,
    themes,
    platforms,
    modes,
    perspectives,
    trailers,
    rating: g.total_rating ? Math.round(g.total_rating / 10) : null,
    aggregatedRating: g.aggregated_rating ? Math.round(g.aggregated_rating / 10) : null,
    ratingCount: g.total_rating_count || 0,
    source: 'igdb',
    type: 'game',
    url: g.url,
    similarGames: (g.similar_games || []).map(s => s.id),
    dlcs: (g.dlcs || []).map(d => d.id),
    expansions: (g.expansion || []).map(e => e.id),
    tags: [],
    mediaDNA: {}
  };
}

/** POST-based IGDB proxy (avoids URL length limits) */
async function _igdbFetch(body) {
  try {
    const r = await fetch('/proxy/igdb/games', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    if (!r.ok) return [];
    const data = await r.json();
    if (Array.isArray(data)) return data;
    if (data.error) {
      console.warn('IGDB API error:', data.error);
      return [];
    }
    return [];
  } catch (e) {
    console.warn('IGDB fetch error:', e);
    return [];
  }
}

export async function searchGames(query, limit = 20) {
  if (!query || !query.trim()) return [];
  const body = `search "${query.replace(/"/g, '\\"')}"; fields ${IGDB_FIELDS}; limit ${limit};`;
  const data = await _igdbFetch(body);
  return data.map(_mapGame);
}

export async function fetchGamesByGenre(genreIds = [], limit = 20) {
  const whereClause = genreIds.length
    ? `where genres = [${genreIds.join(',')}]`
    : '';
  const body = `fields ${IGDB_FIELDS}; ${whereClause}; sort total_rating_count desc; limit ${limit};`;
  const data = await _igdbFetch(body);
  return data.map(_mapGame);
}

export async function fetchPopularGames(limit = 30) {
  const body = `fields ${IGDB_FIELDS}; where total_rating_count >= 50; sort total_rating_count desc; limit ${limit};`;
  const data = await _igdbFetch(body);
  return data.map(_mapGame);
}

export async function fetchGameById(igdbId) {
  const body = `fields ${IGDB_FIELDS}; where id = ${igdbId};`;
  const data = await _igdbFetch(body);
  if (data.length > 0) return _mapGame(data[0]);
  return null;
}

export async function fetchGamesForDiscovery(genreIds = [], platformIds = [], limit = 40) {
  const conditions = ['total_rating_count >= 10'];
  if (genreIds.length) conditions.push(`genres = [${genreIds.join(',')}]`);
  if (platformIds.length) conditions.push(`platforms = [${platformIds.join(',')}]`);
  const body = `fields ${IGDB_FIELDS}; where ${conditions.join(' & ')}; sort total_rating desc; limit ${limit};`;
  const data = await _igdbFetch(body);
  return data.map(_mapGame);
}

// ---- Steam Integration ----

export async function enrichGamesWithSteam(games) {
  if (!games || !games.length) return games;
  const steamIds = games
    .map(g => {
      if (g.steamAppId) return g.steamAppId;
      if (g.igdb_id) return null;
      return null;
    })
    .filter(Boolean);
  if (!steamIds.length) return games;
  const steamData = await steamAPI.getAppDetails(steamIds.slice(0, 5));
  const reviewPromises = steamIds.slice(0, 5).map(id => steamAPI.getReviews(id));
  const reviews = await Promise.allSettled(reviewPromises);
  const reviewMap = {};
  reviews.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      reviewMap[steamIds[i]] = r.value;
    }
  });
  return games.map(g => {
    const appId = g.steamAppId;
    if (!appId || !steamData[appId]) return g;
    const s = steamData[appId];
    const review = reviewMap[appId];
    return {
      ...g,
      steamData: s,
      steamTags: s.steamTags || [],
      reviewScore: review?.score || null,
      reviewCount: review?.total || 0,
      reviewSentiment: review?.reviewScore || null,
      reviewDesc: review?.reviewDesc || '',
      reviewDescDe: review?.reviewDescDe || '',
      price: s.price || null,
      priceCents: s.priceCents || 0,
      isFree: s.isFree || false,
      discount: s.discount || 0,
      metacritic: s.metacritic || null,
      headerImage: s.headerImage || g.cover,
      screenshots: s.screenshots?.length ? s.screenshots : g.screenshots,
      genres: s.genres?.length ? s.genres : g.genres,
      platforms: s.platforms?.length
        ? s.platforms.map(p => ({ name: p }))
        : g.platforms,
      achievements: s.achievements || 0,
      developer: s.developers?.[0] || g.developer || '',
      publisher: s.publishers?.[0] || g.publisher || '',
      storeUrl: steamAPI.getStoreLink(appId),
      deepLink: steamAPI.getSteamDeepLink(appId)
    };
  });
}

export async function fetchSteamTopSellers(options = {}) {
  const results = await steamAPI.searchTopSellers(options);
  if (!results.length) return [];
  const appIds = results.map(r => r.appId).slice(0, 5);
  const details = await steamAPI.getAppDetails(appIds, options.cc);
  const reviewPromises = appIds.map(id => steamAPI.getReviews(id));
  const reviews = await Promise.allSettled(reviewPromises);
  const reviewMap = {};
  reviews.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      reviewMap[appIds[i]] = r.value;
    }
  });
  return results.map(r => {
    const s = details[r.appId] || {};
    const review = reviewMap[r.appId];
    return {
      id: `steam-${r.appId}`,
      title: r.name || s.name || '',
      cover: r.headerImage || s.headerImage || '',
      headerImage: r.headerImage || s.headerImage || '',
      steamAppId: r.appId,
      steamData: s,
      reviewScore: review?.score || null,
      reviewCount: review?.total || 0,
      reviewSentiment: review?.reviewScore || null,
      price: s.price || (r.isFree ? 'Free' : null),
      discount: s.discount || r.discount || 0,
      genres: s.genres || [],
      platforms: s.platforms || [],
      source: 'steam',
      type: 'game',
      storeUrl: steamAPI.getStoreLink(r.appId),
      deepLink: steamAPI.getSteamDeepLink(r.appId)
    };
  });
}

export async function fetchSteamByTags(tagIds, options = {}) {
  const results = await steamAPI.searchByTags(tagIds, options);
  if (!results.length) return [];
  const appIds = results.map(r => r.appId).slice(0, 5);
  const details = await steamAPI.getAppDetails(appIds, options.cc);
  return results.map(r => {
    const s = details[r.appId] || {};
    return {
      id: `steam-${r.appId}`,
      title: r.name || s.name || '',
      cover: r.headerImage || s.headerImage || '',
      headerImage: r.headerImage || s.headerImage || '',
      steamAppId: r.appId,
      steamData: s,
      price: s.price || null,
      discount: s.discount || 0,
      genres: s.genres || [],
      platforms: s.platforms || [],
      source: 'steam',
      type: 'game',
      storeUrl: steamAPI.getStoreLink(r.appId),
      deepLink: steamAPI.getSteamDeepLink(r.appId)
    };
  });
}

export async function fetchSteamAppDetails(appId, cc = 'us') {
  const data = await steamAPI.getAppDetails(appId, cc);
  if (!data || !data[appId]) return null;
  const review = await steamAPI.getReviews(appId);
  return steamAPI.enrichGameData(data[appId], review);
}
