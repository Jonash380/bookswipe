import { safeGetJSON, safeSetJSON } from './utils.js';

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

export async function searchGames(query, limit = 20) {
  if (!query || !query.trim()) return [];
  const encoded = encodeURIComponent(`search "${query.replace(/"/g, '\\"')}"; fields ${IGDB_FIELDS}; limit ${limit};`);
  try {
    const r = await fetch(`/proxy/igdb/games?body=${encoded}`);
    if (!r.ok) return [];
    const data = await r.json();
    if (Array.isArray(data)) return data.map(_mapGame);
    return [];
  } catch (e) {
    console.warn('searchGames error', e);
    return [];
  }
}

export async function fetchGamesByGenre(genreIds = [], limit = 20) {
  const whereClause = genreIds.length
    ? `where genres = [${genreIds.join(',')}]`
    : '';
  const body = `fields ${IGDB_FIELDS}; ${whereClause}; sort total_rating_count desc; limit ${limit};`;
  const encoded = encodeURIComponent(body);
  try {
    const r = await fetch(`/proxy/igdb/games?body=${encoded}`);
    if (!r.ok) return [];
    const data = await r.json();
    if (Array.isArray(data)) return data.map(_mapGame);
    return [];
  } catch (e) {
    console.warn('fetchGamesByGenre error', e);
    return [];
  }
}

export async function fetchPopularGames(limit = 30) {
  const body = `fields ${IGDB_FIELDS}; where total_rating_count >= 50; sort total_rating_count desc; limit ${limit};`;
  const encoded = encodeURIComponent(body);
  try {
    const r = await fetch(`/proxy/igdb/games?body=${encoded}`);
    if (!r.ok) return [];
    const data = await r.json();
    if (Array.isArray(data)) return data.map(_mapGame);
    return [];
  } catch (e) {
    console.warn('fetchPopularGames error', e);
    return [];
  }
}

export async function fetchGameById(igdbId) {
  const body = `fields ${IGDB_FIELDS}; where id = ${igdbId};`;
  const encoded = encodeURIComponent(body);
  try {
    const r = await fetch(`/proxy/igdb/games?body=${encoded}`);
    if (!r.ok) return null;
    const data = await r.json();
    if (Array.isArray(data) && data.length > 0) return _mapGame(data[0]);
    return null;
  } catch (e) {
    console.warn('fetchGameById error', e);
    return null;
  }
}

export async function fetchGamesForDiscovery(genreIds = [], platformIds = [], limit = 40) {
  const conditions = ['total_rating_count >= 10'];
  if (genreIds.length) conditions.push(`genres = [${genreIds.join(',')}]`);
  if (platformIds.length) conditions.push(`platforms = [${platformIds.join(',')}]`);
  const body = `fields ${IGDB_FIELDS}; where ${conditions.join(' & ')}; sort total_rating desc; limit ${limit};`;
  const encoded = encodeURIComponent(body);
  try {
    const r = await fetch(`/proxy/igdb/games?body=${encoded}`);
    if (!r.ok) return [];
    const data = await r.json();
    if (Array.isArray(data)) return data.map(_mapGame);
    return [];
  } catch (e) {
    console.warn('fetchGamesForDiscovery error', e);
    return [];
  }
}
