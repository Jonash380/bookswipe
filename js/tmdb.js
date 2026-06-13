const PROXY = '/proxy/tmdb';
export async function getTMDBDetails(tmdbId, type = 'movie', lang = 'de') {
  const url = `${PROXY}/${type}/${tmdbId}?language=${lang}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}
export async function searchTMDB(query, type = 'multi', lang = 'de') {
  const url = `${PROXY}/search/${type}?query=${encodeURIComponent(query)}&language=${lang}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

/**
 * Fetch trending movies or TV shows for a time window ('day' or 'week').
 * Returns raw TMDB results; caller maps with mapTmdbResult.
 */
export async function getTMDBTrending(mediaType = 'all', timeWindow = 'week', lang = 'de') {
  const mt = mediaType === 'tv' ? 'tv' : mediaType === 'movies' ? 'movie' : 'all';
  const tw = timeWindow === 'day' ? 'day' : 'week';
  const url = `${PROXY}/trending/${mt}/${tw}?language=${lang}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return data.results || [];
  } catch { return []; }
}

/**
 * Fetch top-rated movies or TV shows.
 * Returns raw TMDB results; caller maps with mapTmdbResult.
 */
export async function getTMDBTopRated(mediaType = 'movies', lang = 'de', page = 1) {
  const mt = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `${PROXY}/${mt}/top_rated?language=${lang}&page=${page}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return data.results || [];
  } catch { return []; }
}

/**
 * Fetch movies/TV similar to a given title (TMDB's "similar" endpoint).
 * Returns raw TMDB results; caller maps with mapTmdbResult.
 */
export async function getTMDBSimilar(tmdbId, type = 'movie', lang = 'de') {
  const url = `${PROXY}/${type}/${tmdbId}/similar?language=${lang}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results || []).slice(0, 12);
  } catch { return []; }
}

/**
 * Fetch TMDB's personalized recommendations based on a given title.
 * Returns raw TMDB results; caller maps with mapTmdbResult.
 */
export async function getTMDBRecommendations(tmdbId, type = 'movie', lang = 'de') {
  const url = `${PROXY}/${type}/${tmdbId}/recommendations?language=${lang}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results || []).slice(0, 12);
  } catch { return []; }
}
export async function getTMDBVideos(tmdbId, type = 'movie', lang = 'de') {
  const url = `${PROXY}/${type}/${tmdbId}/videos?language=${lang}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    const results = data.results || [];
    const trailer = results.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
      || results.find(v => v.site === 'YouTube' && v.type === 'Trailer')
      || results.find(v => v.site === 'YouTube' && v.type === 'Teaser')
      || results.find(v => v.site === 'YouTube');
    return trailer ? [{ id: trailer.key, name: trailer.name, site: trailer.site }] : [];
  } catch { return []; }
}
