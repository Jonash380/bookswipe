/**
 * BookSwipe Cultural Passport
 * Curated country-based media discovery with passport stamps.
 */

const COUNTRIES = [
  { id:'kr', flag:'🇰🇷', name_de:'Südkorea', name_en:'South Korea', desc_de:'Von K-Drama bis Parasite', desc_en:'From K-Drama to Parasite',
    genres_movie:[28,18,53], genres_tv:[18,10765,35], keywords:['korean','south korea','seoul'] },
  { id:'jp', flag:'🇯🇵', name_de:'Japan', name_en:'Japan', desc_de:'Anime, Samurai & J-Horror', desc_en:'Anime, Samurai & J-Horror',
    genres_movie:[16,28,27], genres_tv:[16,10765], keywords:['japanese','japan','tokyo','anime'] },
  { id:'fr', flag:'🇫🇷', name_de:'Frankreich', name_en:'France', desc_de:'Nouvelle Vague & moderne Meister', desc_en:'New Wave & modern masters',
    genres_movie:[18,35,10749], genres_tv:[18,35], keywords:['french','france','paris'] },
  { id:'in', flag:'🇮🇳', name_de:'Indien', name_en:'India', desc_de:'Bollywood & darüber hinaus', desc_en:'Bollywood & beyond',
    genres_movie:[18,35,10402], genres_tv:[18,10766], keywords:['indian','india','bollywood','hindi'] },
  { id:'gb', flag:'🇬🇧', name_de:'UK', name_en:'UK', desc_de:'Britischer Humor & Drama', desc_en:'British wit & drama',
    genres_movie:[18,35,53], genres_tv:[35,18,99], keywords:['british','united kingdom','london','bbc'] },
  { id:'mx', flag:'🇲🇽', name_de:'Mexiko', name_en:'Mexico', desc_de:'Magischer Realismus & Thriller', desc_en:'Magical realism & thrillers',
    genres_movie:[18,27,53], genres_tv:[18,10766], keywords:['mexican','mexico','spanish'] },
  { id:'it', flag:'🇮🇹', name_de:'Italien', name_en:'Italy', desc_de:'Neorealismus & Dolce Vita', desc_en:'Neorealism & Dolce Vita',
    genres_movie:[18,35,10749], genres_tv:[18,35], keywords:['italian','italy','rome'] },
  { id:'de', flag:'🇩🇪', name_de:'Deutschland', name_en:'Germany', desc_de:'Expressionismus & Gegenwart', desc_en:'Expressionism & contemporary',
    genres_movie:[18,53,36], genres_tv:[18,80], keywords:['german','germany','berlin'] },
  { id:'es', flag:'🇪🇸', name_de:'Spanien', name_en:'Spain', desc_de:'Almodóvar & darüber hinaus', desc_en:'Almodóvar & beyond',
    genres_movie:[18,53,35], genres_tv:[18,80], keywords:['spanish','spain','barcelona'] },
  { id:'se', flag:'🇸🇪', name_de:'Schweden', name_en:'Sweden', desc_de:'Nordic Noir & Bergman', desc_en:'Nordic noir & Bergman',
    genres_movie:[53,18,27], genres_tv:[80,18], keywords:['swedish','sweden','scandinavian','nordic'] },
  { id:'br', flag:'🇧🇷', name_de:'Brasilien', name_en:'Brazil', desc_de:'Cinema Novo & Favela-Stories', desc_en:'Cinema Novo & favela stories',
    genres_movie:[18,80,35], genres_tv:[18,10766], keywords:['brazilian','brazil','portuguese'] },
  { id:'ng', flag:'🇳🇬', name_de:'Nigeria', name_en:'Nigeria', desc_de:'Nollywood & neue Stimmen', desc_en:'Nollywood & new voices',
    genres_movie:[18,35,53], genres_tv:[18,10766], keywords:['nigerian','nigeria','nollywood'] },
];

const STORAGE_KEY = 'bs-passport';

function getStamps() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

export function stampCountry(countryId) {
  const stamps = getStamps();
  if (!stamps.includes(countryId)) {
    stamps.push(countryId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stamps));
  }
  return stamps;
}

export function getPassportData() {
  return { stamps: getStamps(), total: COUNTRIES.length };
}

export function getCountry(id) {
  return COUNTRIES.find(c => c.id === id);
}

export function getAllCountries() {
  return COUNTRIES;
}

/** Render the passport gallery */
export function renderPassport(app) {
  const de = app.lang === 'de';
  const { stamps } = getPassportData();
  const completed = stamps.length;
  const pct = Math.round((completed / COUNTRIES.length) * 100);

  let html = `<div class="passport-view">`;
  html += `<div class="passport-header">`;
  html += `<span class="passport-icon">🛂</span>`;
  html += `<h2>${de ? 'Kultur-Pass' : 'Cultural Passport'}</h2>`;
  html += `<p>${de ? 'Entdecke Medien aus aller Welt' : 'Discover media from around the world'}</p>`;
  html += `<div class="passport-progress">`;
  html += `<div class="passport-bar"><div class="passport-bar-fill" style="width:${pct}%"></div></div>`;
  html += `<span>${completed}/${COUNTRIES.length} ${de ? 'Länder' : 'countries'}</span>`;
  html += `</div></div>`;

  html += `<div class="passport-grid">`;
  for (const country of COUNTRIES) {
    const stamped = stamps.includes(country.id);
    html += `
      <div class="passport-country ${stamped ? 'stamped' : ''}" data-country="${country.id}">
        <span class="passport-flag">${country.flag}</span>
        <span class="passport-name">${de ? country.name_de : country.name_en}</span>
        <span class="passport-desc">${de ? country.desc_de : country.desc_en}</span>
        ${stamped ? '<span class="passport-stamp">✅</span>' : '<span class="passport-stamp">🔒</span>'}
      </div>`;
  }
  html += `</div>`;

  html += `</div>`;
  return html;
}

/** Render a country's curated deck */
export function renderCountryDeck(app, country) {
  const de = app.lang === 'de';
  let html = `<div class="country-deck">`;
  html += `<div class="country-deck-header">`;
  html += `<span class="country-deck-flag">${country.flag}</span>`;
  html += `<h2>${de ? country.name_de : country.name_en}</h2>`;
  html += `<p>${de ? country.desc_de : country.desc_en}</p>`;
  html += `</div>`;
  html += `<p class="country-deck-loading">${de ? 'Lade Medien...' : 'Loading media...'}</p>`;
  html += `</div>`;
  return html;
}

export async function fetchCountryMedia(country, lang = 'de') {
  // Fetch both movies and TV shows from this country
  const requests = [
    { type: 'movie', genres: country.genres_movie.join(',') },
    { type: 'tv', genres: (country.genres_tv || []).join(',') },
  ].filter(r => r.genres);

  const results = await Promise.all(requests.map(async ({ type, genres }) => {
    try {
      const r = await fetch(`/proxy/tmdb/discover/${type}?sort_by=vote_average.desc&with_genres=${genres}&with_original_language=${country.id}&language=${lang}&vote_count.gte=50`);
      if (!r.ok) return [];
      const data = await r.json();
      return (data.results || []).map(m => ({
        id: `tmdb-${m.id}`, tmdb_id: m.id, title: m.title || m.name,
        cover: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
        year: parseInt((m.release_date || m.first_air_date || '').slice(0, 4)) || null,
        overview: m.overview, genres: m.genre_ids, source: 'tmdb', type,
        rating: m.vote_average, vote_count: m.vote_count,
        countryTag: country.id
      }));
    } catch { return []; }
  }));

  // Merge, deduplicate by ID, and cap at 10
  const seen = new Set();
  const merged = [];
  for (const item of results.flat()) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged.slice(0, 10);
}
