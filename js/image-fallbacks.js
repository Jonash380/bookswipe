/**
 * Image fallback helpers for the genre browser.
 * Uses real TMDB CDN image paths (verified popular titles).
 * Adapted from MediaImageAPI concept, using /proxy/tmdb for searches.
 */

// Verified TMDB backdrop images (real paths from popular titles)
const MAD_MAX_BACKDROP = 'https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg';
const GODFATHER_BACKDROP = 'https://image.tmdb.org/t/p/w1280/tmU7GeKVybMWFButWEGl2M4GeiP.jpg';
const INCEPTION_BACKDROP = 'https://image.tmdb.org/t/p/w1280/s3TBrRGB1iav7gFOCNx3H31MoES.jpg';
const SPIRITED_BACKDROP = 'https://image.tmdb.org/t/p/w1280/etj5E4XWnG4QvodVqO9zGNKkTkl.jpg';

const GENRE_BACKDROPS = {
  // TMDB numeric genre IDs
  28:   MAD_MAX_BACKDROP,   // Action
  // All genres map to one of 4 verified backdrops (Mad Max / Godfather / Inception / Spirited Away)
  12:   MAD_MAX_BACKDROP,  // Adventure
  16:   SPIRITED_BACKDROP, // Animation
  35:   MAD_MAX_BACKDROP,  // Comedy
  80:   GODFATHER_BACKDROP,// Crime
  18:   GODFATHER_BACKDROP,// Drama
  14:   SPIRITED_BACKDROP, // Fantasy
  27:   MAD_MAX_BACKDROP,  // Horror
  878:  INCEPTION_BACKDROP,// Sci-Fi
  53:   GODFATHER_BACKDROP,// Thriller
  10749:GODFATHER_BACKDROP,// Romance
  9648: GODFATHER_BACKDROP,// Mystery
  10759:MAD_MAX_BACKDROP,  // Action & Adventure
  10765:INCEPTION_BACKDROP,// Sci-Fi & Fantasy
  // Book genre string IDs
  fantasy:   SPIRITED_BACKDROP,
  scifi:     INCEPTION_BACKDROP,
  thriller:  MAD_MAX_BACKDROP,
  romance:   GODFATHER_BACKDROP,
  horror:    MAD_MAX_BACKDROP,
  mystery:   GODFATHER_BACKDROP,
  adventure: MAD_MAX_BACKDROP,
  historical:GODFATHER_BACKDROP,
};

// Verified TMDB poster images per genre (real paths from popular titles)
const GENRE_POSTERS = {
  // Verified poster paths from popular titles
  28:   'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',   // The Matrix
  12:   'https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',   // The Hobbit
  16:   'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBkuVcm.jpg',   // Spirited Away
  35:   'https://image.tmdb.org/t/p/w500/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg',   // Barbie
  80:   'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',   // Parasite
  18:   'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',   // The Godfather
  14:   'https://image.tmdb.org/t/p/w500/6FfCjAuE8m6e2wOoeX0Gq5TJ7D.jpg',   // Lord of the Rings
  27:   'https://image.tmdb.org/t/p/w500/nRj5511mZdTl4saWEPoj9QroTIu.jpg',   // The Shining
  878:  'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',   // Inception
  53:   'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',   // Parasite (thriller)
  10749:'https://image.tmdb.org/t/p/w500/qXNodH36mHqY7O4bQI3Pmw1c5T1.jpg',  // The Notebook
  9648: 'https://image.tmdb.org/t/p/w500/iiZZ8QEtAl2JTVGqiUp9KTvzC1.jpg',   // Spider-Verse
};

const DEFAULT_BACKDROP = MAD_MAX_BACKDROP;
const DEFAULT_POSTER = 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg';

/**
 * Get a fallback backdrop URL for a genre.
 * @param {number|string} genreId - TMDB genre ID or book/game genre string
 * @returns {string} Backdrop URL
 */
export function getGenreFallbackBackdrop(genreId) {
  const key = typeof genreId === 'string' ? genreId.toLowerCase() : genreId;
  return GENRE_BACKDROPS[key] || DEFAULT_BACKDROP;
}

/**
 * Get a fallback poster URL for a genre.
 * @param {number|string} genreId - TMDB genre ID or book/game genre string
 * @returns {string} Poster URL
 */
export function getGenreFallbackPoster(genreId) {
  const key = typeof genreId === 'string' ? genreId.toLowerCase() : genreId;
  return GENRE_POSTERS[key] || DEFAULT_POSTER;
}
