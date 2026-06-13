/**
 * Anime and manga genre/mood constants for the AniList integration.
 * Genres are taken from AniList's official genre list and mapped to user-facing labels.
 * Moods are derived from common community-curated vibes.
 */

export const ANIME_GENRES = {
  de: [
    { id: 'Action', label: 'Action' },
    { id: 'Adventure', label: 'Abenteuer' },
    { id: 'Comedy', label: 'Komödie' },
    { id: 'Drama', label: 'Drama' },
    { id: 'Ecchi', label: 'Ecchi' },
    { id: 'Fantasy', label: 'Fantasy' },
    { id: 'Hentai', label: 'Hentai' },
    { id: 'Horror', label: 'Horror' },
    { id: 'Mahou Shoujo', label: 'Magical Girl' },
    { id: 'Mecha', label: 'Mecha' },
    { id: 'Music', label: 'Musik' },
    { id: 'Mystery', label: 'Mystery' },
    { id: 'Psychological', label: 'Psychologisch' },
    { id: 'Romance', label: 'Romanze' },
    { id: 'Sci-Fi', label: 'Sci-Fi' },
    { id: 'Slice of Life', label: 'Slice of Life' },
    { id: 'Sports', label: 'Sport' },
    { id: 'Supernatural', label: 'Übernatürlich' },
    { id: 'Thriller', label: 'Thriller' }
  ],
  en: [
    { id: 'Action', label: 'Action' },
    { id: 'Adventure', label: 'Adventure' },
    { id: 'Comedy', label: 'Comedy' },
    { id: 'Drama', label: 'Drama' },
    { id: 'Ecchi', label: 'Ecchi' },
    { id: 'Fantasy', label: 'Fantasy' },
    { id: 'Hentai', label: 'Hentai' },
    { id: 'Horror', label: 'Horror' },
    { id: 'Mahou Shoujo', label: 'Magical Girl' },
    { id: 'Mecha', label: 'Mecha' },
    { id: 'Music', label: 'Music' },
    { id: 'Mystery', label: 'Mystery' },
    { id: 'Psychological', label: 'Psychological' },
    { id: 'Romance', label: 'Romance' },
    { id: 'Sci-Fi', label: 'Sci-Fi' },
    { id: 'Slice of Life', label: 'Slice of Life' },
    { id: 'Sports', label: 'Sports' },
    { id: 'Supernatural', label: 'Supernatural' },
    { id: 'Thriller', label: 'Thriller' }
  ]
};

// Curated moods that map to combinations of AniList tags/genres
export const ANIME_MOODS = {
  de: [
    { id: 'cozy', label: 'Gemütlich', genres: ['Slice of Life', 'Comedy'] },
    { id: 'epic', label: 'Episch', genres: ['Action', 'Adventure', 'Fantasy'] },
    { id: 'dark', label: 'Düster', genres: ['Horror', 'Psychological', 'Thriller'] },
    { id: 'thoughtful', label: 'Nachdenklich', genres: ['Drama', 'Psychological', 'Mystery'] },
    { id: 'funny', label: 'Lustig', genres: ['Comedy'] },
    { id: 'romantic', label: 'Romantisch', genres: ['Romance', 'Drama'] },
    { id: 'exciting', label: 'Spannend', genres: ['Action', 'Thriller', 'Mecha'] },
    { id: 'fantastical', label: 'Fantasievoll', genres: ['Fantasy', 'Supernatural', 'Mahou Shoujo'] }
  ],
  en: [
    { id: 'cozy', label: 'Cozy', genres: ['Slice of Life', 'Comedy'] },
    { id: 'epic', label: 'Epic', genres: ['Action', 'Adventure', 'Fantasy'] },
    { id: 'dark', label: 'Dark', genres: ['Horror', 'Psychological', 'Thriller'] },
    { id: 'thoughtful', label: 'Thoughtful', genres: ['Drama', 'Psychological', 'Mystery'] },
    { id: 'funny', label: 'Funny', genres: ['Comedy'] },
    { id: 'romantic', label: 'Romantic', genres: ['Romance', 'Drama'] },
    { id: 'exciting', label: 'Exciting', genres: ['Action', 'Thriller', 'Mecha'] },
    { id: 'fantastical', label: 'Fantastical', genres: ['Fantasy', 'Supernatural', 'Mahou Shoujo'] }
  ]
};
