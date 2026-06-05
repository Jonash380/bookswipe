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
