const OL_SEARCH = 'https://openlibrary.org/search.json';
const OL_COVERS = 'https://covers.openlibrary.org/b';
const GB_SEARCH = '/proxy/gbooks/volumes';

function _olToBook(d, genres, moods) {
  const isbn = d.isbn?.find(i => i.length === 13) || d.isbn?.[0] || null;
  return {
    id: `ol-${d.key}`, title: d.title, author: d.author_name?.[0] || '',
    cover: d.cover_i ? `${OL_COVERS}/id/${d.cover_i}-M.jpg` : '',
    year: d.first_publish_year, source: 'openlibrary', type: 'book',
    genres, moods, isbn,
    description: d.first_sentence?.value || d.first_sentence || null,
    pageCount: d.number_of_pages_median || null,
    publisher: d.publisher?.[0] || null,
    language: d.language?.[0] || null,
  };
}

function _gbToBook(gb, genres, moods) {
  const vi = gb.volumeInfo;
  const isbn13 = vi.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier || null;
  const isbn10 = vi.industryIdentifiers?.find(i => i.type === 'ISBN_10')?.identifier || null;
  return {
    id: `gb-${gb.id}`, title: vi.title, author: vi.authors?.[0] || '',
    cover: vi.imageLinks?.thumbnail || vi.imageLinks?.smallThumbnail || '',
    year: parseInt(vi.publishedDate) || null, publishedDate: vi.publishedDate || null, source: 'gbooks', type: 'book',
    genres, moods,
    description: vi.description || null,
    isbn: isbn13 || isbn10,
    isbn13, isbn10,
    pageCount: vi.pageCount || null,
    categories: vi.categories || [],
    publisher: vi.publisher || null,
    language: vi.language || null,
    rating: vi.averageRating || null,
    ratingCount: vi.ratingsCount || null,
  };
}

async function _fetchQuery(q, lang, signal) {
  try {
    const [ol, olSubject, gbooks] = await Promise.all([
      fetch(`${OL_SEARCH}?q=${encodeURIComponent(q)}&limit=8&lang=${lang === 'de' ? 'de' : 'en'}`, { signal }).then(r => r.json()).catch(() => ({ docs: [] })),
      fetch(`${OL_SEARCH}?subject=${encodeURIComponent(q)}&limit=5`, { signal }).then(r => r.json()).catch(() => ({ docs: [] })),
      fetch(`${GB_SEARCH}?q=${encodeURIComponent(q)}&maxResults=5&langRestrict=${lang}`, { signal }).then(r => r.json()).catch(() => ({ items: [] }))
    ]);
    return { ol, olSubject, gbooks };
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return { ol: { docs: [] }, olSubject: { docs: [] }, gbooks: { items: [] } };
  }
}

export async function fetchBooks(genres, moods, lang = 'de', signal) {
  const queries = genres.slice(0, 3).map(g => g.label || g);
  if (!queries.length) return [];

  // Fetch all queries in parallel instead of sequential with delays
  const results = await Promise.all(
    queries.map(q => _fetchQuery(q, lang, signal))
  );

  const seen = new Set();
  const isbnMap = new Map(); // ISBN -> index in books array for cross-source dedup
  const books = [];

  const addIfNew = (book) => {
    // Cross-source dedup by ISBN
    if (book.isbn) {
      const existingIdx = isbnMap.get(book.isbn);
      if (existingIdx !== undefined) {
        // Merge: keep the richer entry, supplement missing fields
        const existing = books[existingIdx];
        if (!existing.description && book.description) existing.description = book.description;
        if (!existing.pageCount && book.pageCount) existing.pageCount = book.pageCount;
        if (!existing.cover && book.cover) existing.cover = book.cover;
        if (!existing.publisher && book.publisher) existing.publisher = book.publisher;
        if (!existing.rating && book.rating) existing.rating = book.rating;
        if (!existing.categories?.length && book.categories?.length) existing.categories = book.categories;
        // Track alternate source
        if (!existing._sources) existing._sources = [existing.source];
        if (!existing._sources.includes(book.source)) existing._sources.push(book.source);
        // Track alternate editions
        if (!existing._editions) existing._editions = [{ id: existing.id, source: existing.source, isbn: existing.isbn }];
        existing._editions.push({ id: book.id, source: book.source, isbn: book.isbn, publisher: book.publisher, language: book.language });
        return;
      }
      isbnMap.set(book.isbn, books.length);
    }
    // Fallback: dedup by title+author (normalized)
    const normKey = `${(book.title || '').toLowerCase().trim()}|${(book.author || '').toLowerCase().trim()}`;
    if (normKey !== '|' && seen.has(normKey)) return;
    if (normKey !== '|') seen.add(normKey);
    if (!seen.has(book.id)) {
      seen.add(book.id);
      books.push(book);
    }
  };

  results.forEach(({ ol, olSubject, gbooks }, qi) => {
    (ol.docs || []).forEach(d => addIfNew(_olToBook(d, genres, moods)));
    (olSubject.docs || []).forEach(d => addIfNew(_olToBook(d, genres, moods)));
    (gbooks.items || []).forEach(gb => addIfNew(_gbToBook(gb, genres, moods)));
  });

  return books;
}

/**
 * Fetch upcoming/new release books from Google Books.
 * Queries with orderBy=newest and filters to books published within
 * the last 90 days or releasing in the next 180 days.
 */
export async function fetchUpcomingBooks(genres, lang = 'de', signal, days = 90) {
  const queries = genres.slice(0, 3).map(g => g.label || g);
  if (!queries.length) return [];

  const windowDays = Math.max(30, Math.min(180, days));
  const now = new Date();
  const pastLimit = new Date(now);
  pastLimit.setDate(pastLimit.getDate() - windowDays);
  const futureLimit = new Date(now);
  futureLimit.setDate(futureLimit.getDate() + windowDays);

  const results = await Promise.all(
    queries.map(async q => {
      try {
        const r = await fetch(
          `${GB_SEARCH}?q=${encodeURIComponent(q + ' new books')}&maxResults=10&langRestrict=${lang}&orderBy=newest`,
          { signal }
        );
        return r.ok ? (await r.json()).items || [] : [];
      } catch { return []; }
    })
  );

  const seen = new Set();
  const books = [];

  results.flat().forEach(gb => {
    const book = _gbToBook(gb, genres, []);
    if (!book.publishedDate) return;

    // Parse the published date (can be YYYY, YYYY-MM, or YYYY-MM-DD)
    const pd = book.publishedDate;
    let pubDate;
    if (pd.length === 4) pubDate = new Date(pd + '-01-01');
    else if (pd.length === 7) pubDate = new Date(pd + '-01');
    else pubDate = new Date(pd);

    if (isNaN(pubDate.getTime())) return;
    if (pubDate < pastLimit || pubDate > futureLimit) return;

    book.isUpcoming = pubDate > now;
    book.releaseDate = pd;

    const normKey = `${(book.title || '').toLowerCase().trim()}|${(book.author || '').toLowerCase().trim()}`;
    if (normKey !== '|' && seen.has(normKey)) return;
    if (normKey !== '|') seen.add(normKey);
    if (!seen.has(book.id)) {
      seen.add(book.id);
      books.push(book);
    }
  });

  // Sort: upcoming first (by date ascending), then recent (by date descending)
  books.sort((a, b) => {
    if (a.isUpcoming && !b.isUpcoming) return -1;
    if (!a.isUpcoming && b.isUpcoming) return 1;
    const da = new Date(a.releaseDate);
    const db = new Date(b.releaseDate);
    return a.isUpcoming ? da - db : db - da;
  });

  return books;
}

/**
 * Map a raw TMDB result to a standard object format.
 */
export function mapTmdbResult(m, type, extras = {}) {
  const rd = m.release_date || m.first_air_date || '';
  return {
    id: `tmdb-${m.id}`, tmdb_id: m.id, title: m.title || m.name,
    cover: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
    backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
    year: parseInt(rd.slice(0, 4)) || null,
    overview: m.overview, genres: m.genre_ids, source: 'tmdb', type,
    rating: m.vote_average, vote_count: m.vote_count,
    ...extras,
  };
}

/**
 * Fetch upcoming/new release movies or TV shows from TMDB.
 * Queries discover endpoint with date range filters and maps results.
 */
export async function fetchUpcomingMedia(mediaType, selectedGenres, lang, radarDays, signal) {
  const type = mediaType === 'movies' ? 'movie' : 'tv';
  const genreIds = selectedGenres.map(g => typeof g === 'string' ? g : g.id).join(',');
  const days = radarDays || 60;
  const now = new Date();
  const pastLimit = new Date(now); pastLimit.setDate(pastLimit.getDate() - days);
  const futureLimit = new Date(now); futureLimit.setDate(futureLimit.getDate() + days);
  const fmt = d => d.toISOString().slice(0, 10);
  const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  try {
    const r = await fetch(`/proxy/tmdb/discover/${type}?sort_by=popularity.desc&with_genres=${genreIds || ''}&language=${lang}&${dateField}.gte=${fmt(pastLimit)}&${dateField}.lte=${fmt(futureLimit)}`, { signal });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results || []).map(m => {
      const rd = m.release_date || m.first_air_date || '';
      const pubDate = new Date(rd);
      return mapTmdbResult(m, type, {
        releaseDate: rd || null,
        isUpcoming: !isNaN(pubDate.getTime()) && pubDate > now,
      });
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    console.warn('fetchUpcomingMedia error', e); return [];
  }
}

/**
 * Build retailer/search links for a book's editions.
 * Returns an array of { name, url, icon, source } objects.
 */
export function buildEditionLinks(item) {
  const links = [];
  const title = encodeURIComponent(item.title || '');
  const author = encodeURIComponent(item.author || '');

  // Open Library link
  if (item.id?.startsWith('ol-')) {
    const olKey = item.id.replace('ol-', '');
    links.push({ name: 'Open Library', url: `https://openlibrary.org${olKey}`, icon: '📖', source: 'openlibrary' });
  }

  // Google Books link
  if (item.id?.startsWith('gb-')) {
    const gbId = item.id.replace('gb-', '');
    links.push({ name: 'Google Books', url: `https://books.google.com/books?id=${gbId}`, icon: '📘', source: 'gbooks' });
  }

  // Edition-based links from _editions array
  const editions = item._editions || [];
  editions.forEach(ed => {
    if (ed.source === 'openlibrary' && ed.id?.startsWith('ol-')) {
      const key = ed.id.replace('ol-', '');
      if (!links.some(l => l.source === 'openlibrary')) {
        links.push({ name: 'Open Library', url: `https://openlibrary.org${key}`, icon: '📖', source: 'openlibrary' });
      }
    }
    if (ed.source === 'gbooks' && ed.id?.startsWith('gb-')) {
      const gbId = ed.id.replace('gb-', '');
      if (!links.some(l => l.source === 'gbooks')) {
        links.push({ name: 'Google Books', url: `https://books.google.com/books?id=${gbId}`, icon: '📘', source: 'gbooks' });
      }
    }
  });

  // ISBN-based links (always available)
  const isbn = item.isbn || item.isbn13;
  if (isbn) {
    links.push({ name: 'Thalia', url: `https://www.thalia.de/suche?sq=${isbn}`, icon: '🏪', source: 'thalia' });
    links.push({ name: 'Amazon', url: `https://www.amazon.de/s?k=${isbn}`, icon: '📦', source: 'amazon' });
  }

  // Fallback: search by title+author
  if (!links.length && title) {
    links.push({ name: 'Thalia', url: `https://www.thalia.de/suche?sq=${title}+${author}`, icon: '🏪', source: 'thalia' });
    links.push({ name: 'Amazon', url: `https://www.amazon.de/s?k=${title}+${author}`, icon: '📦', source: 'amazon' });
  }

  return links;
}
