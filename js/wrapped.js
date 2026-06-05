/**
 * BookSwipe Taste Wrapped
 * Year-in-review stats visualization from history data.
 * Like Spotify Wrapped but for your cross-media taste.
 */

const TYPE_NAMES = {
  de: { movie:'Filme', tv:'Serien', book:'Bücher', game:'Spiele' },
  en: { movie:'Movies', tv:'TV', book:'Books', game:'Games' }
};

export function generateWrapped(history, watchlist, profile, de = false) {
  if (!history || !history.length) return null;

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearHistory = history.filter(h => new Date(h.date) >= yearStart);
  const yearLikes = yearHistory.filter(h => h.action === 'like');

  if (!yearLikes.length) return null;

  // Genre breakdown
  const genreCounts = {};
  yearLikes.forEach(h => {
    (h.genres || []).forEach(g => {
      const name = typeof g === 'string' ? g : g.name || String(g);
      genreCounts[name] = (genreCounts[name] || 0) + 1;
    });
  });

  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Media type breakdown
  const typeCounts = { movie:0, tv:0, book:0, game:0 };
  yearLikes.forEach(h => {
    if (h.type === 'game' || h.source === 'igdb') typeCounts.game++;
    else if (h.type === 'book' || h.source === 'openlibrary' || h.source === 'gbooks') typeCounts.book++;
    else if (h.type === 'tv') typeCounts.tv++;
    else typeCounts.movie++;
  });

  // Top items
  const topItems = yearLikes.slice(0, 5);

  // Persona evolution
  const topGenre = topGenres[0]?.[0] || '';
  let persona;
  if (topGenre.includes('horror')) persona = de ? 'Horror-Süchtiger' : 'Horror Fiend';
  else if (topGenre.includes('fantasy')) persona = de ? 'Fantasy-Nomade' : 'Fantasy Nomad';
  else if (topGenre.includes('comedy') || topGenre.includes('Komödie')) persona = de ? 'Lach-Garant' : 'Laugh Generator';
  else if (topGenre.includes('drama')) persona = de ? 'Gefühlsmensch' : 'Deep Feeler';
  else if (topGenre.includes('thriller') || topGenre.includes('Thriller')) persona = de ? 'Spannungs-Junkie' : 'Thrill Seeker';
  else persona = de ? 'Geschmacks-Pionier' : 'Taste Pioneer';

  // Year stats
  const swipesThisYear = yearHistory.length;
  const likesThisYear = yearLikes.length;
  const topType = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1])[0][0];
  const typeNames = TYPE_NAMES[de ? 'de' : 'en'];

  return {
    year: now.getFullYear(),
    totalDiscoveries: likesThisYear,
    topGenres,
    topItems,
    typeCounts,
    topType,
    typeName: typeNames[topType],
    persona,
    swipesThisYear,
    likeRate: swipesThisYear ? Math.round((likesThisYear / swipesThisYear) * 100) : 0,
  };
}

export function renderWrapped(app, wrapped) {
  const de = app.lang === 'de';
  if (!wrapped) return `<div class="wrapped-view"><p>${de?'Nicht genug Daten für dein Wrapped. Wische weiter!':'Not enough data for your Wrapped. Keep swiping!'}</p></div>`;

  let html = `<div class="wrapped-view">`;
  // Hero
  html += `
    <div class="wrapped-hero">
      <span class="wrapped-year-badge">${wrapped.year}</span>
      <h1>${de ? 'Dein Geschmacks-Rückblick' : 'Your Taste Wrapped'}</h1>
      <p class="wrapped-sub">${de ? `${wrapped.totalDiscoveries} Entdeckungen in diesem Jahr` : `${wrapped.totalDiscoveries} discoveries this year`}</p>
    </div>`;

  // Persona card
  html += `
    <div class="wrapped-persona">
      <span class="wrapped-persona-icon">${wrapped.persona.includes('Horror') ? '👻' : wrapped.persona.includes('Fantasy') ? '🧙' : wrapped.persona.includes('Lach')||wrapped.persona.includes('Laugh') ? '😂' : '🎭'}</span>
      <h3>${de ? 'Deine Persona' : 'Your Persona'}</h3>
      <span class="wrapped-persona-name">${wrapped.persona}</span>
    </div>`;

  // Stats grid
  html += `
    <div class="wrapped-stats">
      <div class="wrapped-stat"><span class="wrapped-stat-val">${wrapped.swipesThisYear}</span><span class="wrapped-stat-label">${de?'Swipes':'Swipes'}</span></div>
      <div class="wrapped-stat"><span class="wrapped-stat-val">${wrapped.totalDiscoveries}</span><span class="wrapped-stat-label">${de?'Likes':'Likes'}</span></div>
      <div class="wrapped-stat"><span class="wrapped-stat-val">${wrapped.likeRate}%</span><span class="wrapped-stat-label">${de?'Like-Rate':'Like Rate'}</span></div>
      <div class="wrapped-stat"><span class="wrapped-stat-val">${wrapped.typeName}</span><span class="wrapped-stat-label">${de?'Top-Typ':'Top Type'}</span></div>
    </div>`;

  // Top genres chart
  html += `<div class="wrapped-genres"><h3>${de ? 'Top Genres' : 'Top Genres'}</h3>`;
  const maxCount = wrapped.topGenres[0]?.[1] || 1;
  for (const [genre, count] of wrapped.topGenres) {
    const pct = Math.round((count / maxCount) * 100);
    html += `
      <div class="wrapped-genre-row">
        <span class="wrapped-genre-name">${genre}</span>
        <div class="wrapped-genre-bar"><div class="wrapped-genre-fill" style="width:${pct}%"></div></div>
        <span class="wrapped-genre-count">${count}</span>
      </div>`;
  }
  html += `</div>`;

  // Type breakdown
  html += `<div class="wrapped-types"><h3>${de ? 'Medien-Mix' : 'Media Mix'}</h3>`;
  const typeIcons = { movie:'🎬', tv:'📺', book:'📚', game:'🎮' };
  for (const [type, count] of Object.entries(wrapped.typeCounts)) {
    const typeMax = Math.max(...Object.values(wrapped.typeCounts), 1);
    const barPct = Math.round((count / typeMax) * 100);
    html += `
      <div class="wrapped-type-row">
        <span>${typeIcons[type]} ${(de ? TYPE_NAMES.de : TYPE_NAMES.en)[type] || type}</span>
        <div class="wrapped-type-bar"><div class="wrapped-type-fill" style="width:${barPct}%"></div></div>
        <span>${count}</span>
      </div>`;
  }
  html += `</div>`;

  html += `<button class="btn btn-primary" onclick="navigator.share&&navigator.share({title:'Mein BookSwipe Wrapped ${wrapped.year}',text:'${wrapped.totalDiscoveries} Entdeckungen als ${wrapped.persona}!',url:window.location.href})">📤 ${de?'Teilen':'Share'}</button>`;
  html += `</div>`;
  return html;
}

