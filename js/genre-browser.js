import { escapeHTML, getGenreIcon, getTMDBGenreName, getTMDBGenreMap, safeGetJSON, safeSetJSON } from './utils.js';
import { BOOK_GENRES, BOOK_SEARCH } from './books.js';
import { getGenreFallbackBackdrop, getGenreFallbackPoster } from './image-fallbacks.js';
import { SwipeGestureManager } from './swipe-gestures.js';
import { initGenreCardVideoPreviews } from './video-preview-manager.js';


const CACHE_KEY = 'bs-genre-browser-cache';
const CACHE_TTL = 24 * 60 * 60 * 1000;


// Curated TMDB IDs per genre — popular titles with good backdrops
const CURATED_MOVIE_IDS = {
  28:   [299536, 299534, 245891, 568124, 324857, 495764, 603, 120, 27205, 76341, 155, 680],
  12:   [120, 121, 122, 284054, 324857, 495764, 299536, 1726, 76341, 284053, 588228],
  16:   [862, 93456, 277834, 354912, 508442, 1022789, 438695, 2062, 8587, 10681, 569094],
  35:   [194662, 207932, 4951, 4953, 10798, 385687, 424694, 550988, 338953, 72190, 406997],
  80:   [240, 278, 103, 1422, 629, 769, 11423, 475557, 27205, 37165, 49849, 694919],
  18:   [238, 240, 424, 497, 389, 510, 496243, 530915, 76203, 490132, 376867, 581734],
  14:   [120, 671, 672, 673, 674, 675, 12445, 76600, 438695, 324857, 258480, 453395],
  27:   [381288, 346364, 493922, 503919, 310131, 694919, 72190, 138843, 234, 274, 4232, 11324],
  878:  [76600, 324857, 603, 1726, 27205, 24428, 76341, 343668, 550988, 335984, 68726, 11],
  53:   [299536, 1422, 475557, 27205, 429617, 807, 419430, 44214, 769, 11423, 629, 694919],
  10749:[11036, 194662, 508442, 207932, 50646, 4951, 114, 10195, 28175, 509, 376867, 453395],
  99:   [134, 141, 2502, 877, 1331, 238, 4478, 159, 2148, 4607, 162, 394150],
  36:   [238, 424, 11878, 857, 4607, 618, 330, 31336, 1271, 10376, 205587, 72190],
  37:   [522, 68, 16869, 33, 25217, 524, 341174, 1018, 1250, 5910, 1639, 79548]
};

const CURATED_TV_IDS = {
  10759:[1399, 100088, 94997, 84958, 66732, 113680, 71712, 60735, 1402, 63174, 95557],
  16:   [1434, 99970, 85937, 61664, 75219, 88040, 96648, 105971, 114838, 608, 94722],
  35:   [100088, 4608, 2316, 1396, 121, 106, 229, 4556, 84958, 456, 66732],
  80:   [1396, 60059, 46648, 2288, 61818, 69050, 112837, 96648, 84958, 76341, 124002],
  18:   [1399, 94997, 46648, 60735, 1396, 60059, 84958, 71712, 76341, 113680, 66732],
  10765:[1399, 94997, 84958, 60735, 71712, 66732, 126280, 105971, 85937, 114838, 95557]
};

function _mapTMDBResult(m, type = 'movie') {
  return {
    id: `tmdb-${m.id}`, tmdb_id: m.id, title: m.title || m.name,
    cover: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
    backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
    genres: m.genre_ids || [],
    year: parseInt((m.release_date || m.first_air_date || '').slice(0, 4)) || null,
    type
  };
}

function _curateSections(items, curatedMap, lang) {
  const genreMap = getTMDBGenreMap(lang);
  const byId = new Map(items.map(m => [m.tmdb_id, m]));
  const sections = [];

  for (const [gid, ids] of Object.entries(curatedMap)) {
    const genreItems = [];
    const seen = new Set();
    const numGid = Number(gid);

    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (byId.has(id)) genreItems.push(byId.get(id));
    }
    for (const m of items) {
      if (genreItems.length >= 15) break;
      if (seen.has(m.tmdb_id)) continue;
      if ((m.genres || []).includes(numGid)) {
        genreItems.push(m);
        seen.add(m.tmdb_id);
      }
    }
    if (!genreItems.length) continue;

    const name = getTMDBGenreName(numGid, lang) || genreMap[numGid] || gid;
    const icon = getGenreIcon(numGid, 'movies', lang);
    sections.push({ id: numGid, name, icon, count: genreItems.length, items: genreItems });
  }

  sections.sort((a, b) => b.items.length - a.items.length);
  return sections;
}

async function _fetchTMDBPages(type, signal) {
  const all = [];
  for (let p = 1; p <= 3; p++) {
    try {
      const r = await fetch(`/proxy/tmdb/discover/${type}?sort_by=popularity.desc&page=${p}&language=de`, { signal });

      if (!r.ok) break;
      const data = await r.json();
      if (!data.results?.length) break;
      all.push(...data.results.map(m => _mapTMDBResult(m, type)));
    } catch { break; }
  }
  return all;
}

async function _fetchBookSections(lang, signal) {
  const genreData = BOOK_GENRES[lang] || BOOK_GENRES.en;
  const searchMap = BOOK_SEARCH;

  const results = await Promise.allSettled(
    genreData.map(async g => {
      const queries = searchMap[g.id] || [g.label];
      const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(queries[0])}&limit=8&fields=key,title,author_name,cover_i,first_publish_year`, { signal });
      if (!r.ok) return null;
      const data = await r.json();
      const items = (data.docs || []).map(d => ({
        id: `ol-${d.key}`, title: d.title || '',
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
        genres: [g.id], type: 'book',
        year: d.first_publish_year || null
      }));
      if (!items.length) return null;
      return { id: g.id, name: g.label, icon: getGenreIcon(g.id, 'books', lang), count: items.length, items };
    })
  );

  return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
}

async function _fetchGameSections(signal) {
  try {
    const r = await fetch('/proxy/igdb/games', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `fields name,cover.url,cover.image_id,genres.name,total_rating_count; where total_rating_count >= 50; sort total_rating_count desc; limit 100;`,
      signal
    });
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data)) return [];

    const byGenre = {};
    for (const g of data) {
      const primary = g.genres?.[0]?.name || 'Other';
      if (!byGenre[primary]) byGenre[primary] = [];
      if (byGenre[primary].length < 15) {
        const coverUrl = g.cover?.url
          ? g.cover.url.replace('thumb', 'cover_big').replace('//', 'https://')
          : '';
        byGenre[primary].push({
          id: `igdb-${g.id}`, title: g.name,
          cover: coverUrl, genres: [primary], type: 'game'
        });
      }
    }

    return Object.entries(byGenre)
      .filter(([, v]) => v.length >= 2)
      .map(([name, items]) => ({
        id: name, name,
        icon: getGenreIcon(name, 'games'),
        count: items.length, items
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  } catch { return []; }
}

export async function fetchGenreBrowserData(mediaType, lang = 'de', signal) {
  // Check localStorage cache
  const cache = safeGetJSON(CACHE_KEY, null);
  if (cache?.ts && (Date.now() - cache.ts < CACHE_TTL) && cache[mediaType]?.length) {
    return cache[mediaType];
  }

  let sections;
  if (mediaType === 'books') {
    sections = await _fetchBookSections(lang, signal);
  } else if (mediaType === 'games') {
    sections = await _fetchGameSections(signal);
  } else {
    // Movies or TV: fetch both and curate
    const [movieItems, tvItems] = await Promise.all([
      _fetchTMDBPages('movie', signal),
      _fetchTMDBPages('tv', signal)
    ]);
    const movieSections = _curateSections(movieItems, CURATED_MOVIE_IDS, lang);
    const tvSections = _curateSections(tvItems, CURATED_TV_IDS, lang);

    if (mediaType === 'tv') {
      sections = tvSections;
    } else {
      // Merge movie + TV sections
      const merged = new Map();
      for (const s of [...movieSections, ...tvSections]) {
        if (merged.has(s.id)) {
          const existing = merged.get(s.id);
          const seen = new Set(existing.items.map(i => i.id));
          for (const item of s.items) {
            if (!seen.has(item.id)) existing.items.push(item);
          }
          existing.count = existing.items.length;
        } else {
          merged.set(s.id, { ...s, items: [...s.items] });
        }
      }
      sections = [...merged.values()].sort((a, b) => b.items.length - a.items.length);
    }
  }

  // Persist to localStorage
  try {
    const obj = safeGetJSON(CACHE_KEY, {});
    obj[mediaType] = sections;
    obj.ts = Date.now();
    safeSetJSON(CACHE_KEY, obj);
  } catch { /* quota exceeded */ }

  return sections;
}

export function renderGenreBrowserHtml(sections, lang) {
  if (!sections?.length) return '';

  const hero = sections[0];
  const heroItem = hero.items[0];
  const heroImg = heroItem?.backdrop || heroItem?.cover || getGenreFallbackBackdrop(hero.id);

  return `<div class="genre-browser">
    ${heroImg ? `
    <div class="genre-hero">
      <img class="genre-hero-image" src="${escapeHTML(heroImg)}" alt="${escapeHTML(hero.name)}" loading="lazy">
      <div class="genre-hero-gradient"></div>
      <div class="genre-hero-content">
        <h1 class="genre-hero-title">${hero.icon} ${escapeHTML(hero.name)}</h1>
        <button class="genre-hero-btn" data-genre-id="${hero.id}" aria-label="${escapeHTML(lang === 'de' ? hero.name + ' entdecken' : 'Explore ' + hero.name)}">
          ▶ ${lang === 'de' ? 'Jetzt entdecken' : 'Browse now'}
        </button>
      </div>
    </div>` : ''}

    ${sections.map(sec => `
    <div class="genre-section">
      <h2 class="genre-section-title">${sec.icon} ${escapeHTML(sec.name)} <span style="color:var(--fg3);font-size:.7em;font-weight:500">${sec.count}+</span></h2>
      <div class="genre-row">
        ${sec.items.map(item => {
          const fallbackSrc = getGenreFallbackPoster(sec.id);
          const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300'%3E%3C/svg%3E";
          return `
        <div class="genre-card" data-genre-id="${sec.id}" data-genre-name="${escapeHTML(sec.name)}" draggable="false" tabindex="0" role="button"${item.tmdb_id ? ` data-tmdb-id="${item.tmdb_id}" data-media-type="${item.type || 'movie'}"` : ''}>
          ${item.cover
            ? `<img class="genre-card-image skeleton" src="${placeholder}" data-src="${escapeHTML(item.cover)}" data-fallback="${escapeHTML(fallbackSrc)}" alt="${escapeHTML(item.title)}">`
            : `<img class="genre-card-image loaded" src="${escapeHTML(fallbackSrc)}" alt="${escapeHTML(item.title)}">`}
          <div class="genre-card-overlay"></div>
          ${typeof sec.id === 'number' ? '<div class="genre-card-play"></div>' : ''}
          <div class="genre-card-content">
            <div class="genre-card-title">${escapeHTML(item.title)}</div>
            ${item.year ? `<div class="genre-card-count">${item.year}</div>` : ''}
          </div>
        </div>`;
        }).join('')}
      </div>
    </div>`).join('')}
  </div>`;
}

export function initGenreBrowserInteractions(container, onGenreSelect, lang = 'de') {
  if (!container) return;

  // Drag-to-scroll for horizontal rows (with velocity tracking + haptics)
  if (container._swipeGestures) {
    container._swipeGestures.forEach(g => g.destroy());
  }
  container._swipeGestures = [];
  container.querySelectorAll('.genre-row').forEach(row => {
    container._swipeGestures.push(new SwipeGestureManager(row));
  });

  // Lazy-load genre card images via IntersectionObserver
  container._gbObserver?.disconnect();
  const gbObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      const src = img.dataset.src;
      if (!src) { gbObserver.unobserve(img); return; }
      img.removeAttribute('data-src');
      img.onload = () => { img.classList.remove('skeleton'); img.classList.add('loaded'); };
      img.onerror = () => { img.onerror = null; img.src = img.dataset.fallback || ''; img.removeAttribute('data-src'); img.classList.remove('skeleton'); img.classList.add('loaded'); };
      img.src = src;
      gbObserver.unobserve(img);
    });
  }, { rootMargin: '200px' });
  container._gbObserver = gbObserver;
  container.querySelectorAll('.genre-card-image[data-src]').forEach(img => gbObserver.observe(img));

  // Video trailer preview on hover (TMDB movie/TV cards only)
  initGenreCardVideoPreviews(container, lang);

  // Click + keyboard to select genre
  container.querySelectorAll('.genre-card, .genre-hero-btn').forEach(el => {
    const selectGenre = () => {
      const id = el.dataset.genreId;
      if (id && onGenreSelect) onGenreSelect(id, el.dataset.genreName);
    };
    el.addEventListener('click', selectGenre);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectGenre(); } });
  });
}




