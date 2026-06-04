import { escapeHTML } from './utils.js';
const SPOILER_SIGNALS = ['reveals that','turns out','the twist is','it is revealed','surprisingly','the killer is','the ending shows','final scene','at the end','ends with'];
export function generateElevatorPitchFull(item, mediaDNA, lang = 'en') {
  const t = item.title || item.name || 'Unknown';
  const year = item.release_date?.slice(0,4) || item.first_air_date?.slice(0,4) || '';
  const overview = item.overview || '';
  const pitch = overview.length > 200 ? overview.slice(0, 197) + '...' : overview;
  return { title: t, year, pitch, rating: item.vote_average || 0 };
}
export function detectSpoilers(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SPOILER_SIGNALS.some(s => lower.includes(s));
}
export function renderVibeBars(vibeScores, lang = 'en') {
  if (!vibeScores || !Object.keys(vibeScores).length) return '';
  return Object.entries(vibeScores).map(([k, v]) =>
    `<div class="vibe-bar"><span class="vibe-label">${escapeHTML(k)}</span><div class="vibe-fill" style="width:${Math.min(v * 33, 100)}%"></div></div>`
  ).join('');
}
