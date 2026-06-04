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
