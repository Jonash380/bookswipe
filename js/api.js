const OL_SEARCH = 'https://openlibrary.org/search.json';
const OL_COVERS = 'https://covers.openlibrary.org/b';
const GB_SEARCH = '/proxy/gbooks/volumes';

function _olToBook(d, genres, moods) {
  return {
    id: `ol-${d.key}`, title: d.title, author: d.author_name?.[0] || '',
    cover: d.cover_i ? `${OL_COVERS}/id/${d.cover_i}-M.jpg` : '',
    year: d.first_publish_year, source: 'openlibrary', type: 'book',
    genres, moods
  };
}

function _gbToBook(gb, genres, moods) {
  const vi = gb.volumeInfo;
  return {
    id: `gb-${gb.id}`, title: vi.title, author: vi.authors?.[0] || '',
    cover: vi.imageLinks?.thumbnail || '',
    year: parseInt(vi.publishedDate) || null, source: 'gbooks', type: 'book',
    genres, moods, description: vi.description
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
  const books = [];

  results.forEach(({ ol, olSubject, gbooks }, qi) => {
    const q = queries[qi];
    const addIfNew = (book) => {
      if (!seen.has(book.id)) {
        seen.add(book.id);
        books.push(book);
      }
    };

    (ol.docs || []).forEach(d => addIfNew(_olToBook(d, genres, moods)));
    (olSubject.docs || []).forEach(d => addIfNew(_olToBook(d, genres, moods)));
    (gbooks.items || []).forEach(gb => addIfNew(_gbToBook(gb, genres, moods)));
  });

  return books;
}
