/**
 * BookSwipe Franchise Completer
 * Detects when user likes multiple entries from a franchise and
 * suggests the optimal completion roadmap.
 */

// Known franchise mappings (TMDB collection IDs or keywords)
const FRANCHISES = {
  tmdb: {
    // Movie collections
    10: { name:'Star Wars', name_de:'Star Wars', icon:'🌌', type:'movie' },
    1241: { name:'Harry Potter', name_de:'Harry Potter', icon:'⚡', type:'movie' },
    119: { name:'The Lord of the Rings', name_de:'Der Herr der Ringe', icon:'💍', type:'movie' },
    264: { name:'The Matrix', name_de:'Matrix', icon:'🕶️', type:'movie' },
    295: { name:'Pirates of the Caribbean', name_de:'Fluch der Karibik', icon:'🏴‍☠️', type:'movie' },
    131: { name:'Indiana Jones', name_de:'Indiana Jones', icon:'🎩', type:'movie' },
    531: { name:'Jurassic Park', name_de:'Jurassic Park', icon:'🦖', type:'movie' },
    8933: { name:'John Wick', name_de:'John Wick', icon:'🔫', type:'movie' },
    873: { name:'Batman (Nolan)', name_de:'Batman (Nolan)', icon:'🦇', type:'movie' },
    528: { name:'Toy Story', name_de:'Toy Story', icon:'🤠', type:'movie' },
    1570: { name:'Mission: Impossible', name_de:'Mission: Impossible', icon:'💣', type:'movie' },
    9485: { name:'Spider-Man (Spider-Verse)', name_de:'Spider-Man (Spider-Verse)', icon:'🕷️', type:'movie' },
    86311: { name:'The Avengers', name_de:'The Avengers', icon:'🛡️', type:'movie' },
  }
};

const FRANCHISE_KEYWORDS = [
  { name:'Mad Max', name_de:'Mad Max', icon:'🏜️', patterns:['mad max','madmax','fury road'] },
  { name:'Alien', name_de:'Alien', icon:'👽', patterns:['alien','xenomorph','ridley scott'] },
  { name:'Terminator', name_de:'Terminator', icon:'🤖', patterns:['terminator','skynet'] },
  { name:'Die Hard', name_de:'Stirb langsam', icon:'🏢', patterns:['die hard','john mcclane','stirb langsam'] },
  { name:'Back to the Future', name_de:'Zurück in die Zukunft', icon:'⏰', patterns:['back to the future','marty mcfly','zurück in die zukunft'] },
  { name:'Rocky', name_de:'Rocky', icon:'🥊', patterns:['rocky','rocky balboa','creed'] },
  { name:'The Godfather', name_de:'Der Pate', icon:'🤵', patterns:['godfather','corleone','der pate'] },
  { name:'Shrek', name_de:'Shrek', icon:'🧅', patterns:['shrek','far far away'] },
  { name:'Fast & Furious', name_de:'Fast & Furious', icon:'🏎️', patterns:['fast furious','fast & furious'] },
  { name:'Planet of the Apes', name_de:'Planet der Affen', icon:'🦍', patterns:['planet of the apes','planet der affen'] },
];

/**
 * Scan the user's watchlist for franchise memberships.
 * Returns detected franchises with completion info.
 */
export function detectFranchises(watchlist) {
  if (!watchlist || watchlist.length < 2) return [];
  const detected = [];

  // Check TMDB collection IDs
  const byCollection = {};
  watchlist.forEach(item => {
    if (item.collection_id) {
      byCollection[item.collection_id] = byCollection[item.collection_id] || [];
      byCollection[item.collection_id].push(item);
    }
  });

  Object.entries(byCollection).forEach(([colId, items]) => {
    const franchise = FRANCHISES.tmdb[colId];
    if (franchise && items.length >= 2) {
      detected.push({ ...franchise, items, count: items.length, source: 'tmdb_collection' });
    }
  });

  // Check keyword patterns
  FRANCHISE_KEYWORDS.forEach(fw => {
    const matches = watchlist.filter(item => {
      const text = `${item.title} ${item.overview || ''}`.toLowerCase();
      return fw.patterns.some(p => text.includes(p));
    });
    if (matches.length >= 2 && !detected.find(d => d.name === fw.name)) {
      detected.push({ ...fw, items: matches, count: matches.length, source: 'keyword' });
    }
  });

  return detected;
}

/** Generate franchise completion roadmap */
export function generateRoadmap(franchise, lang = 'de') {
  const de = lang === 'de';
  const items = franchise.items;
  const years = items.map(i => i.year).filter(Boolean).sort();

  const roadmap = {
    name: de && franchise.name_de ? franchise.name_de : franchise.name,
    icon: franchise.icon || '🎬',
    completed: items.map(i => i.title),
    yearRange: years.length ? `${years[0]}–${years[years.length-1]}` : '',
    suggestion: de
      ? `Du hast ${items.length} Titel dieser Reihe gemocht. Zeit, sie zu vervollständigen!`
      : `You liked ${items.length} entries in this franchise. Time to complete it!`,
  };

  return roadmap;
}

/** Render the franchise detection UI */
export function renderFranchises(app, franchises) {
  const de = app.lang === 'de';

  let html = `<div class="franchise-view">`;
  html += `<div class="franchise-header">`;
  html += `<span class="franchise-icon">🎬</span>`;
  html += `<h2>${de ? 'Reihen-Vervollständiger' : 'Franchise Completer'}</h2>`;
  html += `<p>${de ? 'Entdecke deine begonnenen Reihen' : 'Discover your started franchises'}</p>`;
  html += `</div>`;

  if (!franchises.length) {
    html += `<div class="franchise-empty">`;
    html += `<p>${de ? 'Like mehrere Titel einer Reihe, um Vervollständigungs-Vorschläge zu erhalten!' : 'Like multiple entries in a franchise to get completion suggestions!'}</p>`;
    html += `</div>`;
    html += `</div>`;
    return html;
  }

  for (const fr of franchises) {
    const roadmap = generateRoadmap(fr, app.lang);
    html += `
      <div class="franchise-card">
        <div class="franchise-card-header">
          <span class="franchise-card-icon">${roadmap.icon}</span>
          <div>
            <h3>${roadmap.name}</h3>
            <span class="franchise-card-years">${roadmap.yearRange}</span>
          </div>
        </div>
        <p>${roadmap.suggestion}</p>
        <div class="franchise-completed">
          <span>✅ ${de ? 'Gesehen:' : 'Seen:'}</span>
          <div class="franchise-titles">${roadmap.completed.map(t => `<span class="franchise-title-tag">${t}</span>`).join('')}</div>
        </div>
      </div>`;
  }

  html += `</div>`;
  return html;
}
