const OL_SEARCH = 'https://openlibrary.org/search.json';
const OL_COVERS = 'https://covers.openlibrary.org/b';
const GB_SEARCH = '/proxy/gbooks/volumes';
const delay = ms => new Promise(r => setTimeout(r, ms));
export async function fetchBooks(genres, moods, lang = 'de', signal) {
  const queries = genres.slice(0, 3).map(g => g.label || g);
  const results = [];
  for (const q of queries) {
    try {
      const [ol, olSubject, gbooks] = await Promise.all([
        fetch(`${OL_SEARCH}?q=${encodeURIComponent(q)}&limit=8&lang=${lang === 'de' ? 'de' : 'en'}`, { signal }).then(r => r.json()),
        fetch(`${OL_SEARCH}?subject=${encodeURIComponent(q)}&limit=5`, { signal }).then(r => r.json()),
        fetch(`${GB_SEARCH}?q=${encodeURIComponent(q)}&maxResults=5&langRestrict=${lang}`, { signal }).then(r => r.json())
      ]);
      if (ol.docs) {
        ol.docs.forEach(d => results.push({
          id: `ol-${d.key}`, title: d.title, author: d.author_name?.[0] || '',
          cover: d.cover_i ? `${OL_COVERS}/id/${d.cover_i}-M.jpg` : '',
          year: d.first_publish_year, source: 'openlibrary', type: 'book',
          genres, moods
        }));
      }
      if (olSubject.docs) {
        olSubject.docs.forEach(d => {
          if (!results.find(r => r.id === `ol-${d.key}`)) {
            results.push({
              id: `ol-${d.key}`, title: d.title, author: d.author_name?.[0] || '',
              cover: d.cover_i ? `${OL_COVERS}/id/${d.cover_i}-M.jpg` : '',
              year: d.first_publish_year, source: 'openlibrary', type: 'book',
              genres, moods
            });
          }
        });
      }
      if (gbooks.items) {
        gbooks.items.forEach(gb => {
          const vi = gb.volumeInfo;
          results.push({
            id: `gb-${gb.id}`, title: vi.title, author: vi.authors?.[0] || '',
            cover: vi.imageLinks?.thumbnail || '',
            year: parseInt(vi.publishedDate) || null, source: 'gbooks', type: 'book',
            genres, moods, description: vi.description
          });
        });
      }
    } catch (e) {
      console.warn('fetchBooks error for query', q, e);
    }
    await delay(100);
  }
  return results;
}
