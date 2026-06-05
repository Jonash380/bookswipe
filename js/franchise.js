/**
 * BookSwipe Franchise Completer
 * Detects when user likes multiple entries from a franchise and
 * suggests the optimal completion roadmap.
 */

// Known franchise mappings (TMDB collection IDs or keywords)
const FRANCHISES = {
  tmdb: {
    // Movie collections
    10: { name: 'Star Wars', name_de: 'Star Wars', icon: '\u{1F30C}', type: 'movie' },
    1241: { name: 'Harry Potter', name_de: 'Harry Potter', icon: '\u26A1', type: 'movie' },
    119: { name: 'The Lord of the Rings', name_de: 'Der Herr der Ringe', icon: '\u{1F48D}', type: 'movie' },
    264: { name: 'The Matrix', name_de: 'Matrix', icon: '\u{1F576}\uFE0F', type: 'movie' },
    295: { name: 'Pirates of the Caribbean', name_de: 'Fluch der Karibik', icon: '\u{1F3F4}\u200D\u2620\uFE0F', type: 'movie' },
    131: { name: 'Indiana Jones', name_de: 'Indiana Jones', icon: '\u{1F3A9}', type: 'movie' },
    531: { name: 'Jurassic Park', name_de: 'Jurassic Park', icon: '\u{1F996}', type: 'movie' },
    8933: { name: 'John Wick', name_de: 'John Wick', icon: '\u{1F52B}', type: 'movie' },
    873: { name: 'Batman (Nolan)', name_de: 'Batman (Nolan)', icon: '\u{1F987}', type: 'movie' },
    528: { name: 'Toy Story', name_de: 'Toy Story', icon: '\u{1F920}', type: 'movie' },
    1570: { name: 'Mission: Impossible', name_de: 'Mission: Impossible', icon: '\u{1F4A3}', type: 'movie' },
    9485: { name: 'Spider-Man (Spider-Verse)', name_de: 'Spider-Man (Spider-Verse)', icon: '\u{1F577}\uFE0F', type: 'movie' },
    86311: { name: 'The Avengers', name_de: 'The Avengers', icon: '\u{1F6E1}\uFE0F', type: 'movie' },
  }
};

const FRANCHISE_KEYWORDS = [
  { name: 'Mad Max', name_de: 'Mad Max', icon: '\u{1F3DC}\uFE0F', patterns: ['mad max', 'madmax', 'fury road'] },
  { name: 'Alien', name_de: 'Alien', icon: '\u{1F47D}', patterns: ['alien', 'xenomorph', 'ridley scott'] },
  { name: 'Terminator', name_de: 'Terminator', icon: '\u{1F916}', patterns: ['terminator', 'skynet'] },
  { name: 'Die Hard', name_de: 'Stirb langsam', icon: '\u{1F3E2}', patterns: ['die hard', 'john mcclane', 'stirb langsam'] },
  { name: 'Back to the Future', name_de: 'Zurueck in die Zukunft', icon: '\u23F0', patterns: ['back to the future', 'marty mcfly'] },
  { name: 'Rocky', name_de: 'Rocky', icon: '\u{1F94A}', patterns: ['rocky', 'rocky balboa', 'creed'] },
  { name: 'The Godfather', name_de: 'Der Pate', icon: '\u{1F935}', patterns: ['godfather', 'corleone', 'der pate'] },
  { name: 'Shrek', name_de: 'Shrek', icon: '\u{1F9C5}', patterns: ['shrek', 'far far away'] },
  { name: 'Fast & Furious', name_de: 'Fast & Furious', icon: '\u{1F3CE}\uFE0F', patterns: ['fast furious', 'fast & furious'] },
  { name: 'Planet of the Apes', name_de: 'Planet der Affen', icon: '\u{1F98D}', patterns: ['planet of the apes', 'planet der affen'] },
];

// Known book series with detection patterns
const BOOK_SERIES = [
  { name: 'Harry Potter', name_de: 'Harry Potter', icon: '\u26A1', author: 'rowling', titlePatterns: ["harry potter", "deathly hallows", "half-blood prince", "order of phoenix", "goblet of fire", "chamber of secrets", "philosopher", "sorcerer"], totalBooks: 7 },
  { name: 'The Lord of the Rings', name_de: 'Der Herr der Ringe', icon: '\u{1F48D}', author: 'tolkien', titlePatterns: ["lord of the rings", "fellowship", "two towers", "return of the king", "hobbit", "silmarillion"], totalBooks: 4 },
  { name: 'A Song of Ice and Fire', name_de: 'Das Lied von Eis und Feuer', icon: '\u{1F409}', author: 'martin', titlePatterns: ["game of thrones", "clash of kings", "storm of swords", "feast for crows", "dance with dragons", "wind of winter", "fire and blood"], totalBooks: 7 },
  { name: 'The Hunger Games', name_de: 'Die Tribute von Panem', icon: '\u{1F3F9}', author: 'collins', titlePatterns: ["hunger games", "catching fire", "mockingjay", "ballad of songbirds"], totalBooks: 4 },
  { name: 'Dune', name_de: 'Dune', icon: '\u{1F3DC}\uFE0F', author: 'herbert', titlePatterns: ["dune", "messiah", "children of dune", "god emperor", "heretics of dune", "chapterhouse"], totalBooks: 6 },
  { name: 'Percy Jackson', name_de: 'Percy Jackson', icon: '\u26A1', author: 'riordan', titlePatterns: ["percy jackson", "lightning thief", "sea of monsters", "titans curse", "battle of the labyrinth", "last olympian", "heroes of olympus", "trials of apollo"], totalBooks: 5 },
  { name: 'The Witcher', name_de: 'Der Witcher', icon: '\u2694\uFE0F', author: 'sapkowski', titlePatterns: ["witcher", "blood of elves", "time of contempt", "baptism of fire", "tower of swallow", "lady of the lake", "season of storms"], totalBooks: 8 },
  { name: 'Eragon', name_de: 'Eragon', icon: '\u{1F409}', author: 'paolini', titlePatterns: ["eragon", "eldest", "brisingr", "inheritance"], totalBooks: 4 },
  { name: 'The Maze Runner', name_de: 'Maze Runner', icon: '\u{1F3C3}', author: 'dashner', titlePatterns: ["maze runner", "scorch trials", "death cure", "kill order", "fever code"], totalBooks: 5 },
  { name: 'Twilight', name_de: 'Biss', icon: '\u{1F9DB}', author: 'meyer', titlePatterns: ["twilight", "new moon", "eclipse", "breaking dawn", "midnight sun"], totalBooks: 5 },
  { name: 'Narnia', name_de: 'Narnia', icon: '\u{1F981}', author: 'lewis', titlePatterns: ["narnia", "lion witch wardrobe", "prince caspian", "voyage dawn treader", "silver chair", "last battle", "magician nephew"], totalBooks: 7 },
  { name: 'The Dark Tower', name_de: 'Der Dunkle Turm', icon: '\u{1F5FC}', author: 'king', titlePatterns: ["dark tower", "gunslinger", "drawing of three", "waste lands", "wizard and glass", "wolves of the calla", "song of susannah", "wind through keyhole"], totalBooks: 8 },
  { name: 'Discworld', name_de: 'Scheibenwelt', icon: '\u{1F422}', author: 'pratchett', titlePatterns: ["discworld", "colour of magic", "light fantastic", "mort", "guards guards", "small gods", "night watch", "hogfather"], totalBooks: 41 },
  { name: 'The Expanse', name_de: 'The Expanse', icon: '\u{1F680}', author: 'corey', titlePatterns: ["expanse", "leviathan wakes", "caliban", "abaddon", "cibola burn", "nemesis games", "babylon", "persepolis rising", "tiamat", "leviathan falls"], totalBooks: 9 },
  { name: 'Mistborn', name_de: 'Mistborn', icon: '\u{1F32B}\uFE0F', author: 'sanderson', titlePatterns: ["mistborn", "final empire", "well of ascension", "hero of ages", "alloy of law", "shadows of self", "bands of mourning", "lost metal"], totalBooks: 7 },
  { name: 'Stormlight Archive', name_de: 'Sturmlicht-Chroniken', icon: '\u{1F4A8}', author: 'sanderson', titlePatterns: ["stormlight", "way of kings", "words of radiance", "oathbringer", "rhythm of war", "wind and truth"], totalBooks: 5 },
  { name: 'Wheel of Time', name_de: 'Das Rad der Zeit', icon: '\u2638\uFE0F', author: 'jordan', titlePatterns: ["wheel of time", "eye of world", "great hunt", "dragon reborn", "shadow rising", "fires of heaven", "lord of chaos", "crown of swords", "path of daggers", "crossroads of twilight", "gathering storm", "towers of midnight", "memory of light"], totalBooks: 14 }
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

  // Check book series (by author + title pattern matching)
  BOOK_SERIES.forEach(series => {
    const matches = watchlist.filter(item => {
      if (item.type !== 'book' && item.source !== 'openlibrary' && item.source !== 'gbooks') return false;
      const title = (item.title || '').toLowerCase();
      const author = (item.author || '').toLowerCase();
      const authorMatch = author.includes(series.author);
      const titleMatch = series.titlePatterns.some(p => title.includes(p));
      return authorMatch || titleMatch;
    });
    if (matches.length >= 2 && !detected.find(d => d.name === series.name)) {
      detected.push({
        name: series.name, name_de: series.name_de, icon: series.icon,
        items: matches, count: matches.length, totalBooks: series.totalBooks,
        source: 'book_series', type: 'book',
      });
    }
  });

  return detected;
}

/** Generate franchise completion roadmap */
export function generateRoadmap(franchise, lang = 'de') {
  const de = lang === 'de';
  const items = franchise.items;
  const years = items.map(i => i.year).filter(Boolean).sort();
  const isBook = franchise.type === 'book' || franchise.source === 'book_series';
  const totalBooks = franchise.totalBooks || 0;
  const completionPct = totalBooks > 0 ? Math.round((items.length / totalBooks) * 100) : 0;

  const roadmap = {
    name: de && franchise.name_de ? franchise.name_de : franchise.name,
    icon: franchise.icon || (isBook ? '\u{1F4DA}' : '\u{1F3AC}'),
    completed: items.map(i => i.title),
    yearRange: years.length ? `${years[0]}\u2013${years[years.length-1]}` : '',
    totalBooks, completionPct, isBook,
    suggestion: isBook
      ? (de
        ? `Du hast ${items.length} von ${totalBooks || '?'} Büchern dieser Reihe gelesen.`
        : `You've read ${items.length} of ${totalBooks || '?'} books in this series.`)
      : (de
        ? `Du hast ${items.length} Titel dieser Reihe gemocht. Zeit, sie zu vervollständigen!`
        : `You liked ${items.length} entries in this franchise. Time to complete it!`),
  };

  return roadmap;
}

/** Render the franchise detection UI */
export function renderFranchises(app, franchises) {
  const de = app.lang === 'de';

  let html = `<div class="franchise-view">`;
  html += `<div class="franchise-header">`;
  html += `<span class="franchise-icon">\u{1F3AC}</span>`;
  html += `<h2>${de ? "Reihen-Vervollständiger" : "Franchise Completer"}</h2>`;
  html += `<p>${de ? "Entdecke deine begonnenen Reihen" : "Discover your started franchises"}</p>`;
  html += `</div>`;

  if (!franchises.length) {
    html += `<div class="franchise-empty">`;
    html += `<p>${de ? "Like mehrere Titel einer Reihe, um Vervollständigungs-Vorschläge zu erhalten!" : "Like multiple entries in a franchise to get completion suggestions!"}</p>`;
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
          ${roadmap.isBook && roadmap.totalBooks > 0 ? `<div class="franchise-progress"><div class="franchise-progress-bar"><div class="franchise-progress-fill" style="width:${roadmap.completionPct}%"></div></div><span class="franchise-progress-text">${roadmap.completed.length}/${roadmap.totalBooks}</span></div>` : ''}
          <span>${roadmap.isBook ? (de ? "\u{1F4D6} Gelesen:" : "\u{1F4D6} Read:") : "\u2705 " + (de ? "Gesehen:" : "Seen:")}</span>
          <div class="franchise-titles">${roadmap.completed.map(t => `<span class="franchise-title-tag">${t}</span>`).join('')}</div>
        </div>
      </div>`;
  }

  html += `</div>`;
  return html;
}
