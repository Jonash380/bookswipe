# BookSwipe — Complete Feature & Architecture Documentation

> A Tinder-style "swipe to discover" web app for **Books, Movies, TV Shows, and Video Games**. Bilingual (German/English), powered by a multi-dimensional AI recommendation engine.

---

## Table of Contents

1. [Core Concept](#core-concept)
2. [Tech Stack](#tech-stack)
3. [Module Architecture](#module-architecture)
4. [Onboarding & Portal](#onboarding--portal)
5. [Discovery & Card Rendering](#discovery--card-rendering)
6. [Swipe Engine](#swipe-engine)
7. [Linger Gesture Previews](#linger-gesture-previews)
8. [Recommendation Engine](#recommendation-engine)
9. [Taste Profile & DNA](#taste-profile--dna)
10. [Wildcard / Filter Bubble Breaker](#wildcard--filter-bubble-breaker)
11. [Daylist — Contextual Queues](#daylist--contextual-queues)
12. [Match DNA Breakdown](#match-dna-breakdown)
13. [Swipe Analysis](#swipe-analysis)
14. [Deep-Dive Panel](#deep-dive-panel)
15. [Media Enrichment](#media-enrichment)
16. [A/B Testing & Experiments](#ab-testing--experiments)
17. [Watchlist & History](#watchlist--history)
18. [Achievements & Challenges](#achievements--challenges)
19. [Wrapped / Year-in-Review](#wrapped--year-in-review)
20. [Release Radar](#release-radar)
21. [Blind Date Mode](#blind-date-mode)
22. [Couch Co-op Roulette](#couch-co-op-roulette)
23. [Franchise Detection](#franchise-detection)
24. [Time Capsule](#time-capsule)
25. [Roast / Anti-Taste](#roast--anti-taste)
26. [Concierge](#concierge)
27. [Pick For Me / Social Sharing](#pick-for-me--social-sharing)
28. [Genre Browser](#genre-browser)
29. [Browse Party](#browse-party)
30. [Passport](#passport)
31. [Compatibility / DNA Sharing](#compatibility--dna-sharing)
32. [Media Generator](#media-generator)
33. [Video Preview Manager](#video-preview-manager)
34. [UI Components & Theming](#ui-components--theming)
35. [API Layer & Backend](#api-layer--backend)
36. [Storage & Persistence](#storage--persistence)
37. [PWA Support](#pwa-support)
38. [Testing](#testing)
39. [File Map](#file-map)

---

## Core Concept

BookSwipe presents media cards in a stack. Users **swipe right** to like, **left** to pass, or **up** to skip for later. Every swipe trains a multi-dimensional taste profile. The recommendation engine learns preferences across 12+ scoring dimensions, producing increasingly personalized results.

**Supported media types:**
- 📚 Books (Open Library, Google Books)
- 🎬 Movies (TMDB)
- 📺 TV Shows (TMDB)
- 🎮 Video Games (IGDB, Steam)

**Languages:** German (default), English — all UI strings, quiz questions, persona badges, and genre names fully translated.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (ES Modules, no bundler, no framework) |
| Backend | Python 3 HTTP server (`server.py`) with API proxying |
| Storage | IndexedDB (watchlist, history, profile), localStorage (UI state) |
| DOM (tests) | happy-dom |
| Testing | Node.js built-in test runner (`node --test`) |
| E2E | Playwright |
| External APIs | TMDB, IGDB (Twitch OAuth), Google Books, Open Library, Steam |

---

## Module Architecture

```
js/
├── app.js                  # Main App class — routing, rendering, state, all views (~2600 lines)
├── recommender.js          # Multi-dimensional scoring engine, MMR diversity, wildcard, daylist
├── swipe.js                # Touch/mouse SwipeEngine with velocity-aware thresholds
├── ling-gesture.js         # LingerGesture — hold-to-preview engine (450ms, 8px threshold)
├── deep-dive.js            # DeepDivePanel — swipe-up detail panel
├── enrichment.js           # Background tag enrichment worker
├── recommender.js          # Full recommendation engine (score, rescore, MMR, wildcard, DNA)
├── tag_mapper.js           # TMDB keyword → abstract tag mapping (tropes, pacing, aesthetics)
├── descriptions.js         # Elevator pitch generation, spoiler detection, vibe bars
├── api.js                  # Book fetching (Open Library + Google Books), TMDB result mapping
├── api-client.js           # Fetch deduplication, abort controllers, error messages
├── tmdb.js                 # TMDB proxy client (details, search, videos)
├── games.js                # Game genres, moods, mechanics, platforms, iconic games
├── games_api.js            # IGDB client, Steam enrichment
├── books.js                # Book genres, moods, quiz, era filters
├── media.js                # Movie/TV genre definitions, vibes
├── storage.js              # IndexedDB CRUD (watchlist, history, profile, tags, enriched items)
├── utils.js                # EscapeHTML, genre maps, safeGetJSON, debounce, shuffle, clamp
├── toast.js                # Toast notification system
├── experiment.js           # A/B testing framework (session-based assignment)
├── video-preview-manager.js # Hover-to-play YouTube iframe previews
├── achievements.js         # Achievement tracking & badge system
├── challenges.js           # Dynamic challenge generation
├── wrapped.js              # Year-in-review / Wrapped generation
├── roast.js                # Humorous taste roast generator
├── concierge.js            # AI concierge — contextual recommendations
├── pick-for-me.js          # Social pick sharing (encode/decode taste profiles)
├── compatibility.js        # DNA compatibility scoring, base64 encoding/decoding
├── franchise.js            # Franchise detection & roadmap generation
├── timecapsule.js          # Taste snapshot & diff tracking over time
├── genre-browser.js        # Rich genre browsing with sections
├── swipe-gestures.js       # Swipe gesture manager
├── swipe-party.js          # Multi-person browse sessions
├── passport.js             # Country/region stamp collection
├── media-generator.js      # Media profile generator
├── lazyload.js             # IntersectionObserver lazy loading
├── image-fallbacks.js      # Genre-specific fallback images
└── tag_mapper.js           # Maps TMDB/IGDB keywords to abstract micro-tags
```

---

## Onboarding & Portal

### Welcome Screen
- **Media type carousel** — 4 cards (Books, Movies, TV, Games) with 3D perspective transforms
- **Particle effects** per media type: dust motes (books), film grain (movies), scanlines (TV), pixels (games)
- **Parallax** — mouse/gyroscope shifts particles for depth
- **Language toggle** — DE/EN with instant re-render

### Vibe Matrix
Three sliders (0–100) defining the user's taste axes:
- **Pacing:** Slow & atmospheric ↔ Fast & adrenaline
- **Tone:** Dark & gritty ↔ Light & comforting
- **Complexity:** Popcorn fun ↔ Mind-bending & deep

Spring-physics drag interaction with snap points, haptic feedback on zone crossings, and real-time visual updates.

### Who's Watching
- **Solo** — full control
- **Date Night** — boosts romance, thriller, comedy
- **Family** — auto-blocks horror, crime, war

### Platform Selection (Games)
Grid of gaming platforms (Steam, PlayStation, Xbox, Nintendo, etc.) with toggle selection.

### Rapid Fire Calibration
15-second timed swipe session on curated items. Builds initial taste profile before discovering real content.

---

## Discovery & Card Rendering

### Card Stack
- Cards rendered in a stack with depth effects (scale, opacity, z-index)
- **Landscape split layout** — hero image left, info right
- **Match badge** — percentage score from recommender
- **Genre chips** with icons
- **Upcoming badge** for release radar items

### Filter Chips
- Genre filter chips with icons (clickable toggle)
- Mood filter chips
- "Clear filters" button when active
- Filters sync to URL params for shareable links

### Card Info
- Click card or press `I` to open detail modal
- Full overview, rating, genres, streaming/store buttons
- "Why am I seeing this?" reasoning

---

## Swipe Engine

`SwipeEngine` (`js/swipe.js`) handles touch and mouse gestures:
- **Velocity-aware thresholds** — fast swipes trigger at lower distance
- **Direction detection** — left, right, up (skip)
- **Bounce-back animation** on failed swipes
- **Rotation resistance** — cards rotate during drag
- **Stamp overlays** — like/nope labels appear during drag
- **Swipe hints** — directional labels shown during gesture
- **Haptic feedback** via `navigator.vibrate`

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| `←` / `ArrowLeft` | Pass |
| `→` / `ArrowRight` | Like |
| `↑` / `ArrowUp` | Skip for later |
| `I` | Open card info |
| `Z` | Undo last swipe |

---

## Linger Gesture Previews

`LingerGesture` (`js/ling-gesture.js`) — hold-to-preview engine:
- **450ms delay**, 8px movement threshold
- Composable with SwipeEngine (doesn't interfere with swipes)
- Per-media-type preview content:

| Media Type | Preview |
|-----------|---------|
| Movies/TV | YouTube trailer (autoplay, muted, looped) — fetched async via TMDB videos API |
| Books | CSS 3D page-flip animation with cover + first lines |
| Games | Auto-rotating screenshot carousel (1.8s interval) with dot indicators |

- **Race condition guard** via `_lingerHoldGen` generation counter (checked in both `.then()` and `.catch()`)
- **IntersectionObserver prefetch** for next 2 cards' trailer data (via `requestIdleCallback`)

---

## Recommendation Engine

`Recommender` (`js/recommender.js`) — the heart of the app.

### Multi-Dimensional Scoring (`score()`)

| Dimension | Weight | Scope | Description |
|-----------|--------|-------|-------------|
| Genre overlap | +15 per match | All | Profile genre weights vs item genres |
| Mood/tag match | +20 per match | All | Selected moods & learned tag weights |
| Era preference | −30 penalty | All | Filter mismatch penalty |
| Trope match | +10 per match | All | MediaDNA tropes vs profile |
| Pacing match | +8 per match | All | MediaDNA pacing vs profile |
| Aesthetic match | +7 per match | All | MediaDNA aesthetics vs profile |
| Warning penalty | −5 per warning | All | Content warnings user dislikes |
| Watch mode boost | +8 | All | Boosted moods from watch mode |
| Watch mode block | −40 | All | Blocked genres from watch mode |
| Platform match | +25 | Games | Selected platforms |
| Playtime match | +12 | Games | Playtime preference |
| Mechanic/theme | +10 | Games | Game mechanics & themes |
| Steam tags | +12 per match | Games | Steam tag overlap |
| Review score | +8/+4/−3 | Games | Review score thresholds |
| Metacritic | +5/+2/−3 | Games | Metacritic thresholds |
| Vibe match | ±6 per axis | All | Vibe matrix (pacing, tone, complexity) |
| Description similarity | 0–5 | All | TF-IDF taste vector cosine similarity |
| Recent bias | −4 to +4 | All | HMM-lite recent action bias with decay |
| Bayesian rating | −3 to +4 | Movies/TV/Books | Community rating weighted by vote count |

### Bayesian Shrinkage (Cold Start)
When `totalSwipes < 3`, scores are pulled toward the prior mean (50), preventing wild recommendations on cold start.

### Adaptive Learning Rate
Larger profile updates early on (confidence < 1), finer adjustments as the profile matures.

### Exponential Decay
All profile weights decay by 0.95× per swipe (after 5+ swipes), preventing stale preferences from dominating.

### Cached Bonuses (`_getCachedBonuses()`)
Caches the expensive TF-IDF taste vector and precomputed recent swipe tags per `(totalSwipes, history.length)` revision key. Invalidated on swipe via `clear()`.

### MMR Diversity Re-ranking (`mmrRerank()`)
Maximum Marginal Relevance balances relevance with diversity:
- λ = 0.5 (equal weight to relevance and diversity)
- Jaccard similarity on genres for redundancy detection
- Injects diverse picks near the top of the queue

### Queue Re-scoring (`rescoreQueue()`)
After each swipe, remaining cards are re-scored and re-sorted with the updated profile. Supports A/B test groups (MMR treatment vs random serendipity control).

---

## Taste Profile & DNA

### MediaDNA (`tag_mapper.js`)
Maps TMDB genres, keywords, and overviews to abstract micro-tags:
- **Tropes:** chosen_one, redemption_arc, revenge, underdog, found_family, time_loop, mystery_box, survival, etc.
- **Pacing:** relentless, slow_burn, meditative, ticking_clock, twisty, roller_coaster, episodic, non_linear
- **Aesthetics:** neon_noir, cottagecore, minimalist, baroque, lo_fi, pastel_dream, brutalist, retro_wave
- **Warnings:** violence, gore, sexual_content, etc.

### Vibe Scores
Computed from tags: pacing axis, tone axis, complexity axis (0–100 each).

### Taste Vector
TF-IDF-style keyword vector built from descriptions of liked items. Recency-weighted. Used for description similarity scoring.

---

## Wildcard / Filter Bubble Breaker

`pickWildcard()` selects a card from a genre the user rarely interacts with, but which shares deep structural DNA:

1. Identifies low-weight genres (rarely liked) or derives them from the item pool (cold start)
2. Scores candidates by: rare genre overlap (×25) + structural DNA match (tropes/pacing/aesthetics) − comfort zone penalty (×20)
3. Cold-start fallback: when all genres appear on >20% of items (homogeneous pool), treats all genres as "rare"
4. Random selection from top candidates (top 80% threshold) for variety
5. Returns: wildcard title, genre, revealed traits (mood, pacing, micro-tropes), genre-agnostic hook, bridge explanation

---

## Daylist — Contextual Queues

`generateDaylist()` curates a dynamic media queue based on:
- **Time of day:** morning (short, fast), afternoon (mid-length), night (atmospheric, slow-burn)
- **Day of week:** weekend allows longer formats
- **Energy level:** user-selectable (low → cozy/short, high → intense/action)
- **Commute detection:** morning/evening hours → audiobook/visual-friendly content
- **Length scoring:** short/medium/long matched to time slot
- **Profile match bonus:** items scoring >60 in recommender get boosted

Returns: queue title, vibe description, estimated total time, contextual rules, and up to 5 curated items with "why right now" explanations.

---

## Match DNA Breakdown

`generateMatchDNA()` produces a transparent breakdown for any item:
- **Overall match percentage** (weighted average of up to 4 categories)
- **Category breakdown:** Genre Alignment, Mood & Vibe, Story Tropes, Pacing, Length, Content Notes, Era, Platform, Description, Recent Activity, Rating
- **Hook sentence** (max 20 words)
- **Hard no override** for blocked content (caps score at 35%)

---

## Swipe Analysis

`analyzeSwipe()` calculates precise micro-tag preference adjustments:
- **Delta range:** +3 to +8 (like), −3 to −9 (nope/long-press)
- **Confidence levels:** Low, Medium, High based on existing preference strength
- **Magnitude capping:** Total positive/negative magnitude capped at 30
- **Long-press reject:** Strongest −9 on the most prominent tag only
- **Inferred reason:** Human-readable explanation of why the swipe happened
- **Profile health check:** Status messages about profile maturity

---

## Deep-Dive Panel

`DeepDivePanel` (`js/deep-dive.js`) — swipe-up detail panel:
- Full card details, overview, rating
- Match DNA breakdown
- Streaming/store buttons
- "Why am I seeing this?" reasoning
- Drag gesture with progressive resistance

---

## Media Enrichment

`EnrichmentWorker` (`js/enrichment.js`) — background tag enrichment:
- Enqueues items for background processing
- Batch processing with priority ordering
- Computes MediaDNA for items missing tags
- Idle timer for deferred work

---

## A/B Testing & Experiments

`ABTest` (`js/experiment.js`):
- Session-based group assignment (treatment vs control)
- Tracks refetch events per session
- Session lifecycle management (start/end on visibility change)
- Controls MMR diversity re-ranking vs random serendipity

---

## Watchlist & History

- **Watchlist:** Liked items stored in IndexedDB
- **Disliked:** Passed items (used for filtering)
- **History:** All swipe actions with timestamps, actions, and item data
- **Undo:** Restores last swipe, re-adds to watchlist/disliked, invalidates recommender cache
- **Letterboxd CSV export** for watchlist

---

## Achievements & Challenges

### Achievements (`achievements.js`)
Tracks milestones: total swipes, likes, genre diversity, streaks, session counts, media type exploration.

### Challenges (`challenges.js`)
Dynamic challenges generated from user behavior:
- Decade exploration, genre breadth, like streaks, high-rated picks
- Birth decade detection for era-specific challenges
- Progress tracking with completion rewards

---

## Wrapped / Year-in-Review

`generateWrapped()` (`js/wrapped.js`):
- Top genres, moods, and media types
- Swipe statistics and patterns
- Persona identification
- Animated reveal with particle effects

---

## Release Radar

- Fetches upcoming books/movies/TV within a configurable date range (30/60/90 days)
- "Upcoming" and "Just Released" badges on cards
- Toggle in the discover header

---

## Blind Date Mode

- Blurred cover art (CSS `filter: blur(20px)`)
- Only DNA tags (tropes, pacing, aesthetics) shown
- Wildcard frequency slider (Never → Rarely → Sometimes → Often → Always)
- Reveals content based on structural taste, not visual appeal

---

## Couch Co-op Roulette

Slot machine animation to pick a random item from the watchlist:
- Spinning animation with deceleration
- Haptic feedback
- Result reveal with particles

---

## Franchise Detection

`detectFranchises()` (`js/franchise.js`):
- Identifies franchises from watchlist items
- Generates viewing/reading roadmaps
- Tracks completion progress

---

## Time Capsule

`createSnapshot()` (`js/timecapsule.js`):
- Captures taste profile snapshots over time
- `diffSnapshots()` shows how taste evolved
- Visual diff rendering

---

## Roast / Anti-Taste

`generateRoast()` (`js/roast.js`):
- Humorous analysis of taste patterns
- Anti-taste detection (genres consistently passed on)
- Persona-based roast lines

---

## Concierge

`Concierge` (`js/concierge.js`):
- AI-style contextual recommendations
- Considers time of day, mood, recent activity
- Conversational UI with recommendation reasoning

---

## Pick For Me / Social Sharing

`createPickRequest()` (`js/pick-for-me.js`):
- Encode taste profile as shareable code
- `receivePicks()` decodes friend's profile
- `curatePicks()` finds matching items between profiles

---

## Genre Browser

`renderGenreBrowserHtml()` (`js/genre-browser.js`):
- Rich genre browsing with sections
- Video trailer previews on hover
- Genre-specific fallback imagery

---

## Browse Party

`BrowseParty` (`js/swipe-party.js`):
- Multi-person collaborative browsing
- Shared card queue
- Consensus scoring

---

## Passport

`renderPassport()` (`js/passport.js`):
- Country/region stamp collection based on media origin
- Visual passport booklet
- Country-specific media decks

---

## Compatibility / DNA Sharing

`computeCompatibility()` (`js/compatibility.js`):
- Compares two taste profiles
- Generates compatibility percentage
- `encodeDNA()` / `decodeDNA()` for base64 URL sharing
- Shared taste pick recommendations

---

## Media Generator

`generateMedia()` (`js/media-generator.js`):
- Generates media profile summaries
- Visual profile card rendering

---

## Video Preview Manager

`setupCardPreview()` (`js/video-preview-manager.js`):
- Hover-to-play YouTube iframe previews on genre cards
- Configurable delay, loader, mute button, keyboard accessibility
- Single-active tracking via `activeCardRef`
- Trailer cache with 7-day TTL in localStorage
- IntersectionObserver-based prefetch for genre rows

---

## UI Components & Theming

### Toast System (`toast.js`)
- Non-blocking notifications with types (info, warning, success)
- Auto-dismiss with configurable duration
- Action buttons

### CSS Architecture (`css/styles.css`)
- CSS custom properties for theming (dark mode)
- Glassmorphism effects (backdrop-filter)
- Card stack depth effects
- Swipe stamp overlays
- Responsive breakpoints
- `prefers-reduced-motion` support
- Particle system keyframes (dust, grain, scanlines, pixels)

---

## API Layer & Backend

### `server.py`
- Serves static files + proxies API requests
- SSRF protection via regex whitelists
- Rate limiting (30 req/min per IP, sliding window)
- In-memory LRU-ish cache (max 2000 entries, 5-min to 7-day TTLs)
- CORS headers on all responses

### Proxy Endpoints
| Path | Upstream | Cache TTL |
|------|----------|-----------|
| `/proxy/tmdb/*` | TMDB API | 5 min |
| `/proxy/trakt/*` | Trakt API | 24 hrs |
| `/proxy/gbooks/*` | Google Books | 7 days |
| `/proxy/igdb/*` | IGDB (Twitch OAuth) | 10 min |

### API Client (`api-client.js`)
- `fetchDeduped()` — deduplicates concurrent requests to the same URL
- `createAbortable()` — AbortController factory
- `getErrorMessage()` — localized error messages

---

## Storage & Persistence

### IndexedDB (via `storage.js`)
- **watchlist** store — liked items
- **disliked** store — passed items
- **history** store — all swipe actions
- **tags** store — Trakt tag cache
- **enriched** store — enriched item cache
- **profile** store — recommender profile

### localStorage
- `bs-lang` — language preference
- `bs-state` — app state (genres, moods, media type, onboarding, vibe sliders, etc.)
- `bs-rec-profile` — recommender learning profile
- `bs-trailer-cache` — video preview trailer cache (7-day TTL)

---

## PWA Support

- `static/manifest.json` — PWA manifest (no icons yet)
- `sw.js` — Service worker with stale-while-revalidate strategy
- `prefers-reduced-motion` disables all animations

---

## Testing

**Framework:** Node.js built-in test runner (`node --test`)
**DOM:** happy-dom (migrated from jsdom)
**E2E:** Playwright

### Test Suite (687 tests, 0 failures)

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `recommender.test.js` | 105 | Scoring, MMR, wildcard, cold start, Bayesian, vibe, description similarity, recent bias, rescoreQueue |
| `wildcard.test.js` | ~70 | Wildcard output structure, cold start, genre weights, DNA matching, locale, edge cases |
| `analyze-swipe.test.js` | ~70 | Swipe analysis deltas, magnitude capping, micro-tag filtering, inferred reasons |
| `dna.test.js` | ~50 | Match DNA breakdown structure, categories, hooks, genre weights |
| `achievements.test.js` | ~40 | Achievement tracking, streaks, genre/type tracking |
| `challenges-regression.test.js` | ~30 | Challenge regression tests for birth_decade, like_streak, decade, high_rated |
| `tag_mapper.test.js` | ~30 | Tag mapping, mediaDNA, vibe scores, game tags, warning summary |
| `storage.test.js` | ~30 | CRUD for watchlist, disliked, history, profile, tags, enriched items |
| `swipe.test.js` | ~25 | SwipeEngine direction detection, velocity, bounce-back, rotation |
| `enrichment.test.js` | ~25 | EnrichmentWorker batching, prioritization, enrichment logic |
| `video-preview-manager.test.js` | 27 | Hover-to-play flow, options, activeCardRef, cleanup, keyboard a11y |
| `daylist.test.js` | ~25 | Daylist generation, time slots, energy levels, content rules |
| `daylist-ui.test.js` | ~15 | Daylist UI rendering |
| `portal-onboarding.test.js` | ~25 | Portal onboarding, vibe matrix, step flow, slider mechanics |
| `utils.test.js` | ~25 | escapeHTML, genre maps, safeGetJSON, debounce, shuffle, clamp |
| `security.test.js` | ~20 | XSS prevention, secret exposure, HTML security, server headers |
| `experiment.test.js` | ~10 | A/B testing group assignment, session tracking |
| `fetch-upcoming-books.test.js` | ~20 | Book fetching, date parsing, dedup, structure |
| `fetch-upcoming-media.test.js` | ~15 | Media fetching, TMDB params, error handling |
| `map-tmdb-result.test.js` | ~15 | TMDB result mapping, year extraction, field defaults |
| `wrapped-regression.test.js` | ~10 | Wrapped typeNames regression |
| `build-edition-links.test.js` | ~15 | Book edition link generation |
| `linger-integration.test.js` | 12 | LingerGesture hold/cancel/destroy, preview content types |
| `ling-gesture.test.js` | 8 | LingerGesture unit tests |

---

## File Map

| File | Lines | Purpose |
|------|-------|---------|
| `js/app.js` | ~2600 | Main App class, all views, routing, state management |
| `js/recommender.js` | ~2200 | Recommendation engine, scoring, MMR, wildcard, daylist, DNA, analysis |
| `css/styles.css` | ~1100 | All styles, dark mode, glassmorphism, animations, responsive |
| `js/games.js` | ~400 | Game genres, moods, mechanics, platforms, iconic games |
| `js/tag_mapper.js` | ~200 | TMDB keyword → abstract tag mapping |
| `js/games_api.js` | ~200 | IGDB client, Steam enrichment |
| `js/api.js` | ~300 | Book + TMDB fetching, result mapping |
| `js/descriptions.js` | ~200 | Elevator pitch, spoiler detection, vibe bars |
| `js/storage.js` | ~200 | IndexedDB CRUD operations |
| `js/wrapped.js` | ~100 | Year-in-review generation |
| `js/achievements.js` | ~250 | Achievement tracking system |
| `js/challenges.js` | ~200 | Dynamic challenge generation |
| `js/compatibility.js` | ~100 | DNA compatibility & sharing |
| `js/deep-dive.js` | ~150 | Deep-dive detail panel |
| `js/genre-browser.js` | ~300 | Rich genre browsing |
| `js/swipe.js` | ~100 | Touch/mouse swipe engine |
| `js/ling-gesture.js` | ~90 | LingerGesture hold engine |
| `js/video-preview-manager.js` | ~200 | Hover-to-play video previews |
| `js/enrichment.js` | ~80 | Background tag enrichment |
| `js/api-client.js` | ~110 | Fetch dedup, abort, error handling |
| `js/toast.js` | ~80 | Toast notifications |
| `js/experiment.js` | ~80 | A/B testing framework |
| `js/franchise.js` | ~150 | Franchise detection & roadmap |
| `js/timecapsule.js` | ~130 | Taste snapshots & diffs |
| `js/roast.js` | ~130 | Humorous taste roast |
| `js/concierge.js` | ~140 | AI concierge recommendations |
| `js/pick-for-me.js` | ~90 | Social pick sharing |
| `js/swipe-party.js` | ~140 | Multi-person browse sessions |
| `js/passport.js` | ~100 | Country stamp collection |
| `js/media-generator.js` | ~130 | Media profile generator |
| `js/image-fallbacks.js` | ~80 | Genre fallback images |
| `js/lazyload.js` | ~60 | IntersectionObserver lazy loading |
| `js/books.js` | ~30 | Book genre/mood/quiz definitions |
| `js/media.js` | ~15 | Movie/TV genre definitions |
| `js/tmdb.js` | ~20 | TMDB proxy client |
| `js/utils.js` | ~60 | Shared helpers |
| `js/steam.js` | ~300 | Steam API client |
| `server.py` | ~250 | Python HTTP server + API proxies |
| `index.html` | ~25 | Single-page entry point |
| `sw.js` | ~60 | Service worker |

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `TMDB_API_KEY` | For movies/TV | — | TMDB API bearer token |
| `TRAKT_API_KEY` | For Trakt metadata | — | Trakt API key |
| `TWITCH_CLIENT_ID` | For games | — | IGDB via Twitch OAuth |
| `TWITCH_CLIENT_SECRET` | For games | — | IGDB via Twitch OAuth |
| `BOOKSWIPE_PORT` | No | `3000` | Server port |
| `BOOKSWIPE_BIND` | No | `127.0.0.1` | Bind address |
