# BookSwipe — Full Technical Brief

## What It Is
A Tinder-style "swipe to discover" web app for **Books, Movies, TV Shows, and Video Games**. Users swipe right (like) or left (pass) on media cards. The app builds a taste profile and recommends new content. Bilingual: German (default) and English.

---

## Stack
- **Frontend:** Vanilla HTML/CSS/JS (ES Modules, no bundler, no framework)
- **Backend:** Python 3 HTTP server (`server.py`), ~235 lines, daemonizes via double-fork
- **Storage:** localStorage for state, IndexedDB for caching (Trakt tags, enriched data)
- **External APIs:** TMDB (movies/TV), IGDB (games via Twitch OAuth), Google Books, Open Library

---

## File Structure (21 files, ~3,100 lines)

```
~/Projects/bookswipe/
├── server.py              # Python HTTP server + API proxies (235 lines)
├── start.sh               # Launcher script
├── index.html             # Single-page entry point (23 lines)
├── sw.js                  # Service Worker for PWA caching (60 lines)
├── static/
│   └── manifest.json      # PWA manifest (no icons yet)
├── css/
│   └── styles.css         # All styles, dark mode, glassmorphism (332 lines)
└── js/
    ├── app.js             # Main App class, all views + routing (1367 lines) ← LARGEST
    ├── recommender.js     # 12-dimensional scoring engine (261 lines)
    ├── games.js           # Game genres, moods, mechanics, 20 iconic games (214 lines)
    ├── tag_mapper.js      # TMDB keyword → tag mapping (198 lines)
    ├── games_api.js       # IGDB client, maps to unified card format (150 lines)
    ├── lazyload.js        # IntersectionObserver lazy loading (70 lines)
    ├── swipe.js           # Touch/mouse swipe engine (73 lines)
    ├── api.js             # Open Library + Google Books fetching (53 lines)
    ├── db.js              # IndexedDB wrapper (50 lines)
    ├── enrichment.js      # Background tag enrichment worker (49 lines)
    ├── books.js           # Book genre/mood/quiz definitions (28 lines)
    ├── utils.js           # Shared helpers (24 lines)
    ├── descriptions.js    # Elevator pitch, spoiler detection (20 lines)
    ├── media.js           # Movie/TV genre definitions (13 lines)
    └── tmdb.js            # TMDB proxy client (13 lines)
```

---

## How to Run
```bash
cd ~/Projects/bookswipe

# Without external APIs (books + local data only):
python3 server.py
# → http://127.0.0.1:3000

# With TMDB (movies/TV discovery):
TMDB_API_KEY=your_key python3 server.py

# Full features:
TMDB_API_KEY=xxx TRAKT_API_KEY=xxx TWITCH_CLIENT_ID=xxx TWITCH_CLIENT_SECRET=xxx python3 server.py
```

The server daemonizes. Logs to `server.log`. Kill with `pkill -f server.py`.

---

## Backend: `server.py`

### What It Does
Serves static files + proxies API requests so API keys never reach the browser.

### Endpoints
| Path | Proxies To | Auth | Cache TTL |
|------|-----------|------|-----------|
| `/proxy/tmdb/{path}` | `api.themoviedb.org/3/{path}` | Bearer token (env `TMDB_API_KEY`) | 5 min |
| `/proxy/trakt/{path}` | `api.trakt.tv/{path}` | Header `trakt-api-key` (env `TRAKT_API_KEY`) | 24 hrs |
| `/proxy/gbooks/volumes?...` | `googleapis.com/books/v1/volumes?...` | None | 7 days |
| `/proxy/igdb/games?body=...` | `api.igdb.com/v4/games` | Twitch OAuth (env vars) | 10 min |
| Everything else | Static file from project dir | — | — |

### Security
- **SSRF protection:** Regex whitelist on TMDB paths (`/movie/`, `/tv/`, `/search/`, etc.) and Trakt paths (`movies/`, `shows/`, `search/`)
- **Google Books:** Parameter whitelist (`q`, `maxResults`, `langRestrict`, `printType`, `orderBy`, `startIndex`)
- **IGDB:** Body must start with `fields`, `search`, `where`, `sort`, `limit`, or `offset`
- **Rate limiting:** 30 requests per minute per IP (in-memory, sliding window)
- **CORS:** `Access-Control-Allow-Origin: *`
- **Cache:** In-memory LRU-ish, max 2000 entries, evicts oldest 20% when full

### Config via Environment Variables
| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `TMDB_API_KEY` | For movies/TV | (empty → 503) | TMDB API auth |
| `TRAKT_API_KEY` | For Trakt metadata | (empty → 503) | Trakt API auth |
| `TWITCH_CLIENT_ID` | For games | (empty → 503) | IGDB via Twitch |
| `TWITCH_CLIENT_SECRET` | For games | (empty → 503) | IGDB via Twitch |
| `BOOKSWIPE_PORT` | No | `3000` | Server port |
| `BOOKSWIPE_BIND` | No | `127.0.0.1` | Bind address (set `0.0.0.0` for network) |

### Known Server Issues
- Cache eviction is not true LRU — it removes the first 20% of dict keys (insertion-ordered in Python 3.7+, but not strictly LRU)
- `fetch()` function passes `User-Agent: BookSwipe/2.0` — some APIs may reject this
- Server daemonizes immediately, so debugging requires running `python3 server.py` in foreground (remove the double-fork block or run directly)

---

## Frontend Architecture

### Entry Point
`index.html` loads `js/app.js` as `<script type="module">`. The `App` class self-initializes via `window.app = new App()`.

### App Class (`app.js` — 1367 lines)
This is the monolith. Everything lives here:
- **State management:** `this.state` (selected genres, moods, media type, watch mode, onboarding progress)
- **View rendering:** Onboarding, Quiz, Discover, Watchlist, History, Stats
- **Card rendering:** `renderCards()` — builds card HTML with blind date mode, game badges, 3D tilt
- **Swipe handling:** `handleSwipe()` — updates watchlist/disliked/history, advances card index
- **Modals:** Card detail modal, roulette modal, "Why am I seeing this?" modal
- **Export:** Letterboxd CSV, Taste DNA base64 URL sharing
- **Recommendation:** Calls `this.recommender.score()` for card ordering

### State (localStorage keys)
| Key | Type | Purpose |
|-----|------|---------|
| `bs-lang` | `"de"` or `"en"` | Language preference |
| `bs-state` | Object | All app state (genres, moods, media type, onboarding, etc.) |
| `bs-watchlist` | Array | Liked items |
| `bs-disliked` | Array | Passed items |
| `bs-history` | Array | All swipe actions with timestamps |
| `bs-sessions` | Array | Session tracking |
| `bs-weekly-stats` | Object | Weekly vibe data |
| `bs-rec-profile` | Object | Recommender learning profile |

### State Shape (`bs-state`)
```js
{
  selectedGenres: [],     // Selected genre IDs
  selectedMoods: [],      // Selected mood tags
  mediaType: 'movies',    // 'books' | 'movies' | 'tv' | 'games'
  eraFilter: 'all',       // 'classic' | 'modern' | 'current' | 'all'
  watchMode: 'solo',      // 'solo' | 'dateNight' | 'family'
  onboardingStep: 0,      // 0-3
  blindDateMode: false,   // Blurred art mode
  hasCompletedOnboarding: false,
  hasCompletedQuiz: false,
  blockedGenres: [],      // From watch mode filtering
  boostedMoods: [],       // From watch mode filtering
  selectedPlatforms: []   // Game platform IDs
}
```

---

## Media Types & Data Sources

### Books
- **Source:** Open Library Search API + Subjects API + Google Books API
- **Fetching:** `api.js` — `fetchBooks()` runs 3 queries in parallel per genre (OL search, OL subjects, Google Books)
- **Data:** title, author, cover (Open Library Covers API), year, description
- **Genres:** Fantasy, Sci-Fi, Romance, Thriller, Krimi, Horror, Historical, YA, Non-Fiction
- **Quiz:** 4-question taste calibration quiz during onboarding

### Movies & TV
- **Source:** TMDB via `/proxy/tmdb/`
- **Fetching:** `app.js` `fetchMedia()` — discovers via `/proxy/discover/movie` or `/proxy/discover/tv`
- **Data:** title, poster, year, overview, genres (TMDB IDs), rating
- **Language:** Query param `?language=de` or `?language=en` (client-controlled)

### Games
- **Source:** IGDB via `/proxy/igdb/` (Twitch OAuth)
- **Fetching:** `games_api.js` — `searchGames()`, `fetchGamesByGenre()`, `fetchPopularGames()`, `fetchGamesForDiscovery()`
- **Data mapped to unified card format:** title, slug, cover, screenshots, genres, themes, platforms (with abbreviations), game modes, player perspectives, trailers (YouTube), rating, release date
- **Platform filtering:** Steam, PlayStation, Xbox, Nintendo, etc.
- **20 iconic games** hardcoded for rapid fire calibration
- **Game-specific UI:** Platform badges, playtime badges, multiplayer badges, hover-to-play YouTube previews, 3D tilt, ambient color glow

---

## Recommendation Engine (`recommender.js` — 261 lines)

### 12-Dimensional Scoring
| Dimension | Weight | Applies To |
|-----------|--------|------------|
| Genre overlap | +15 | All |
| Mood/tag match | +20 | All |
| Era preference | -30 (penalty) | All |
| Trope match | +10 | All |
| Pacing match | +8 | All |
| Aesthetic match | +7 | All |
| Warning penalty | -5 | All |
| Boost (watch mode) | +8 | All |
| Block (watch mode) | -40 | All |
| Platform match | +25 | Games only |
| Playtime match | +12 | Games only |
| Mechanic/theme | +10 | Games only |

### Learning
- `updateFromSwipe(item, action)` — adjusts genre/tag weights after each swipe
- Profile persisted to `bs-rec-profile` in localStorage
- Decay factor: 0.95 (gradually forgets old preferences)

---

## UI Components

### Onboarding (3-step)
1. **Welcome:** Media type selection (Books/Movies/TV/Games) + language toggle
2. **Who's Watching:** Solo / Date Night / Family — applies genre blocking
3. **Platform Selection** (games only) + **Rapid Fire Calibration** (15-sec swipe session)

### Discover Screen
- **Card stack:** 16:9 cards with cover art, title, year, genres, rating
- **Blind Date mode:** Blurred art, only DNA tags shown
- **Game cards:** Platform badges, playtime, multiplayer indicators, hover-to-play trailers
- **Swipe actions:** Like (❤️), Skip (⏭), Pass (👎)
- **Keyboard shortcuts:** ← Pass, → Like, ↑ Super, I Info, Z Undo

### Watchlist
- Letterboxd CSV export
- Taste DNA base64 URL sharing
- Couch Co-op Roulette (slot machine animation to pick random item)

### Stats/Profile
- Persona badge (e.g., "Horror Skeptic", "Cozy Queen", "Mind Bender")
- Anti-taste (genres you consistently pass on)
- Weekly vibe chart (emotional breakdown of recent swipes)
- Top genres bar chart

### Card Detail Modal
- Full overview, rating, genres
- "Why am I seeing this?" reasoning
- Streaming buttons (Netflix, Prime, HBO) for movies/TV
- Store buttons (Steam, Epic, GOG, PlayStation, Xbox, Nintendo) for games

---

## Tag System (`tag_mapper.js`)

Maps TMDB genre IDs + keywords to abstract tags:
- `dark`, `cozy`, `epic`, `funny`, `romantic`, `cerebral`, `feel-good`, `dark_comedy`
- 60+ keyword patterns matched against TMDB keyword data
- Tags feed into the recommendation engine's mood scoring

---

## Bilingual Support

Two complete translation sets in `app.js` (`LANG` object):
- `de` (German) — default
- `en` (English)

All UI strings, quiz questions, persona badges, genre names, and empty states are translated. `document.documentElement.lang` updates on language switch.

---

## PWA Support

- `static/manifest.json` exists but has **no icons** (empty array)
- `sw.js` service worker caches static assets with stale-while-revalidate strategy
- Service worker is **not registered** in `index.html` (orphaned file)
- `prefers-reduced-motion` media query disables all animations

---

## Known Bugs & Limitations

### Critical
1. **Service worker orphaned** — `sw.js` exists but is never registered. PWA install won't work.
2. **Manifest has no icons** — PWA install prompt will show broken/missing icons.
3. **IGDB body in URL** — IGDB queries are sent as `?body=` query parameter (URL length limits could be hit with complex queries).

### Moderate
4. **Recommender not used for sorting** — `score()` is called in `updateFromSwipe()` for learning, but cards in `renderDiscover` are NOT sorted by score. They appear in API response order.
5. **No error UI** — Network failures show "Nichts gefunden" with no indication of what went wrong.
6. **`_getRapidFireItems` for TV** — Falls through to the movie pool (same data as movies).
7. **Race condition in `renderDiscover`** — If called twice rapidly, both fetches run and the second overwrites the first.
8. **`_showRoulette` timer bug** — `80 + spins * 5` decreases interval speed instead of increasing (should be `80 + spins * 5` for acceleration, but it actually decelerates).

### Minor
9. **No `<noscript>` tag** — App silently fails without JS.
10. **Keyboard hints show on mobile** — Hidden via media query, but initial DOM append still happens.
11. **`start.sh` uses `pkill`** — Could kill unrelated processes matching the pattern.
12. **No dark/light mode toggle** — CSS variables are hardcoded dark-only despite `LANG` having dark/light keys.
13. **Card info button has only emoji** — Screen readers announce "information symbol" with no context (missing `aria-label`).
14. **`touch-action: none` on cards** — Prevents scrolling within `.card-info` if overview is long.
15. **Trakt proxy path** — `p[13:]` slicing is correct but fragile; any path prefix change breaks it.

---

## What's NOT Implemented (Referenced But Missing)

| Feature | Status |
|---------|--------|
| Service Worker registration | `sw.js` exists but not linked |
| PWA icons | Manifest references none |
| Light/dark mode toggle | CSS is dark-only |
| Real-time card sorting by recommender score | Cards shown in API order |
| `lazyload.js` usage | Module exists but not imported by `app.js` |
| ARIA labels on icon-only buttons | Missing |
| Error states for API failures | Silent fallback to empty |
| `start.sh` robustness | Uses fragile `pkill` |

---

## How to Extend

### Add a new media type
1. Add genre/mood definitions in a new `js/{type}.js`
2. Add API fetching in `js/api.js` or new `{type}_api.js`
3. Add case in `app.js` `renderDiscover()` and `_getRapidFireItems()`
4. Add translation keys to `LANG.de` and `LANG.en` in `app.js`
5. Add proxy endpoint in `server.py` if needed

### Add a new server proxy
1. Add SSRF whitelist regex: `_OK_{TYPE} = re.compile(...)`
2. Add handler method `_type(self, path)` in `Handler`
3. Add route in `do_GET`: `if p.startswith('/proxy/type/'): return self._type(p[12:])`

### Modify recommendation weights
Edit the `W` object in `recommender.js`:
```js
const W = { genre:15, mood:20, era:-30, trope:10, pacing:8, aesthetic:7, ... };
```

---

## Testing

No test framework is set up. To verify the server works:
```bash
python3 -c "
import server, threading, time, urllib.request
t = threading.Thread(target=lambda: server.ThreadedHTTP(('127.0.0.1', 3001), server.Handler).serve_forever(), daemon=True)
t.start(); time.sleep(0.5)
print(urllib.request.urlopen('http://127.0.0.1:3001/').status)
"
```

No frontend tests exist. Manual browser testing required.
