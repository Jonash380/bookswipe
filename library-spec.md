# Library Page Spec

## Overview

A new "Library" page that gives the user a single home for everything they've saved
in the app, plus a way to retroactively mark media they've already read/watched.
Liked media (the existing watchlist) and consumed media (the new feature) live
side-by-side with distinct statuses, and consumed items feed the recommender as
stronger-than-swipe positive signals.

## Decisions from the interview

| Question | Answer |
|---|---|
| Liked vs consumed relationship | Separate statuses, one library page |
| Supported media types | Books, Movies & TV, Games (NOT anime/manga in v1) |
| How to add consumed items | In-app search add only (no bulk import, no one-tap from discover) |
| Stored metadata | Personal 1-5 star rating only (no date, no notes, no recommend toggle) |
| Page organization | Tabbed by status (Want to / Consumed) AND filter by media type |
| Algorithm signal type | Stronger positive signal than swipes |
| Discover dedup behavior | Always hide consumed items from discover |
| Library item distinction | Show status badge on every card |

## Out of scope (v1)

- Anime/manga (AniList) — not in this version, can be added later
- Bulk import (Letterboxd CSV, Goodreads, Steam) — explicitly skipped
- One-tap "I already watched this" from the discover view — explicitly skipped
- Date consumed / free-text notes / "would recommend" toggle — explicitly skipped
- Editing a star rating after the fact (set once, can re-set to fix typos but no history)
- Per-episode/per-chapter tracking (books = whole book, movies = whole movie, games = whole game)
- Sharing/exporting the library

---

## Data model

### Storage layer (js/storage.js)

Add a new IndexedDB object store `consumed` parallel to the existing `watchlist`,
`disliked`, and `history` stores. The existing `watchlist` store becomes the
"Want to" bucket — no schema change required there.

```js
// New exports from js/storage.js
export async function getConsumed()         { return getAll('consumed'); }
export async function addToConsumed(item)   { return putItem('consumed', item); }
export async function removeFromConsumed(id) { return deleteItem('consumed', id); }
export async function updateConsumedRating(id, rating) { ... }
```

### Item shape (consumed)

Identical base shape to watchlist items (so it can be rendered by the same card
component), with one extra field:

```js
{
  ...standardItemFields,   // id, title, cover, year, genres, source, type, ...
  consumedRating: 1 | 2 | 3 | 4 | 5,  // 1-5 stars, REQUIRED
  consumedAt: 1234567890,             // unix ms, set once at add time, NOT shown in UI
  promotedFromWatchlist: boolean      // true if user came from Want to → Consumed
}
```

`consumedAt` is stored for future use (e.g., "what did I read this month?")
but is NOT shown in the v1 UI. The user explicitly chose to skip date display.

### Watchlist items

No schema change. The `watchlist` object store continues to hold "Want to" items.
A new helper `promoteToConsumed(id, rating)` moves an item from `watchlist` to
`consumed` and stamps the rating + `consumedAt` + `promotedFromWatchlist:true`.

### Discovery dedup set

Add `getAllConsumedIds()` that returns a `Set<string>` of consumed item IDs.
Pass it into the existing `renderDiscover` filter chain (alongside
`watchIds` and `dislikedIds`) so consumed items never appear in the swipe deck.

---

## UI / UX

### Navigation

The existing bottom-nav tab 📝 with the watchlist count (currently the watchlist
tab at `_navHTML` line 2416) gets relabeled to "Library" and the count becomes
the total of `watchlist.length + consumed.length`.

```
📝 42       (was: just watchlist count)
```

Tooltip / aria-label: "Library" / "Bibliothek".

### Page structure

```
┌─────────────────────────────────────────────┐
│  ← Back           Library                    │  ← header
├─────────────────────────────────────────────┤
│  [ Want to (12) ]  [ Consumed (30) ]        │  ← status tabs
├─────────────────────────────────────────────┤
│  [ All ] [Books] [Movies/TV] [Games]       │  ← media type filter chips
├─────────────────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐                    │
│  │card │ │card │ │card │                    │  ← responsive grid
│  │W    │ │C ★5 │ │W    │                    │     (W = want to badge,
│  └─────┘ └─────┘ └─────┘                    │      C ★5 = consumed + rating)
│  ┌─────┐ ┌─────┐ ┌─────┐                    │
│  │card │ │card │ │card │                    │
│  │C ★3 │ │W    │ │C ★4 │                    │
│  └─────┘ └─────┘ └─────┘                    │
├─────────────────────────────────────────────┤
│  [+ Add as consumed]                        │  ← primary CTA
└─────────────────────────────────────────────┘
```

### Tabs

- **Want to** (default): shows items where `watchlist` has them.
- **Consumed**: shows items where `consumed` store has them.
- Tab labels show counts in parentheses: `Want to (12)`, `Consumed (30)`.
- Switching tabs doesn't change the media type filter.

### Media type filter chips

- **All** (default), **Books**, **Movies/TV**, **Games**.
- Filters apply on top of the active status tab.
- Combination is reactive: e.g., Consumed + Books shows only consumed books.

### Card structure

Reuse the existing card render (from `app.js _renderHero` / `_renderSide`).
Add a status badge overlay:

- **Want to card**: small 📝 icon overlay, no rating.
- **Consumed card**: small ⭐ + rating badge overlay (e.g., "⭐ 4").
- Tap a card to open the existing card modal (no change to modal behavior).
- Long-press / kebab menu shows:
  - For Want to: "I finished this →" (promote to consumed with rating prompt)
  - For Consumed: "Update rating" or "Remove from library"
  - For both: "Open detail"

### Add as consumed flow

1. User taps **+ Add as consumed** at the bottom of the Library page.
2. Opens a new modal: **Add Consumed Item** with:
   - Search input (uses the same search API as the global search:
     OpenLibrary + Google Books for books, TMDB multi-search for movies/TV,
     IGDB for games).
   - Results render with a thumbnail, title, year.
   - Each result has a **Mark as consumed** button (no swipe, no queue — single tap).
3. After tapping **Mark as consumed**:
   - If the item is already in the watchlist (Want to), prompt: "This is in
     your Want to list. Mark as consumed (moves it) or Add separately?"
     - Default = moves it (the simpler path).
   - Show a 1-5 star rating selector (required, default = 4 stars).
   - On confirm: write to `consumed` store, remove from `watchlist` if applicable.
4. Close modal, return to Library page (Consumed tab is now selected,
   new item visible at top).

### Add from a discover card

NOT in v1. The user explicitly skipped this. If they want it later, it's
a separate spec.

---

## Algorithm integration

### Recommender signal weighting

The current `Recommender.updateFromSwipe(item, action)` handles three actions:
'like' (right), 'nope' (left), 'skip' (up). Consumed items are a separate
signal with a separate code path:

```js
// In js/recommender.js — new method
updateFromConsumed(item, rating) {
  // rating is 1-5
  // For the recommender's taste vector, a consumed item is roughly:
  //   - 1-2 stars: 1.5x weight of a 'nope' swipe on the same item
  //   - 3 stars:   same as a 'skip' (neutral)
  //   - 4 stars:   1.2x weight of a 'like' swipe
  //   - 5 stars:   1.5x weight of a 'like' swipe
  // The weight is applied to the genre/era/keyword contributions.
  // This is a "stronger positive signal" per the interview answer.
}
```

The exact multipliers (1.2x, 1.5x) should be tuned later based on user feedback
that the recommendations feel "too influenced by old content" or "not enough".

### Data flow on app load

In `App._loadState()` (js/app.js), add a parallel load for consumed:

```js
this.consumed = await getConsumed();
```

And pass `consumed` into the recommender's profile rebuild, alongside
`watchlist` and `disliked`.

### Discover view dedup

In `App.renderDiscover` (js/app.js), add a third lookup set alongside
`watchIds` and `dislikedIds`:

```js
const consumedIds = new Set(this.consumed.map(c => c.id));
let filtered = items.filter(i =>
  !watchIds.has(i.id) &&
  !dislikedIds.has(i.id) &&
  !consumedIds.has(i.id)
);
```

This means: a user who already watched Fight Club will never see it in
the swipe deck again, regardless of how they rated it.

### Cross-refill behavior

In `_refillDeck()` and `_fetchGenreRotation()` (the watchlist-based refill
mechanisms), exclude items that are in the consumed store too. The current
code refills from watchlist — we don't want to re-suggest consumed items.

---

## Edge cases

1. **Adding a consumed item that's already consumed**: Show toast
   "Already in your library — update rating?" with a button to open
   the update-rating modal.

2. **Promoting a Want to → Consumed that the user later regrets**:
   No undo flow in v1. The "Remove from library" action on the consumed
   card removes it from `consumed` and the recommender forgets it
   (next time `updateFromConsumed` runs, the item isn't there, so
   the recommender's taste vector drifts back). This is acceptable
   because consumed items are a positive signal — forgetting a positive
   signal just makes recommendations less personalized, not wrong.

3. **Storage quota**: IndexedDB is large but not infinite. The consumed
   store should be capped at 5,000 items (well above any realistic
   library size). Older items get a warning toast at 4,500.

4. **Search returns no results in the Add Consumed modal**: show the
   existing empty state (`.search-empty` with the query echoed back).

5. **The user deletes their IndexedDB / clears site data**: both watchlist
   and consumed are lost. The "Daily Top 5" cache also resets. The recommender
   cold-starts on the next session. This is the same behavior as today.

6. **Rating the same item twice (typo fix)**: re-setting the rating calls
   `updateConsumedRating(id, rating)`. The recommender subtracts the old
   rating's contribution and adds the new one. This is a small `set`
   difference, not a full rebuild.

7. **Same item exists in both watchlist AND consumed (race condition)**:
   On add-consumed, check both stores and prompt user. If user picks
   "moves it", delete from watchlist first, then add to consumed.

8. **Importing from another device / future bulk import**: out of scope
   for v1 but the data model supports it (just an array of consumed items
   in IndexedDB).

---

## i18n requirements

Add the following new keys to `js/i18n.js` in BOTH the `de` and `en` tables:

```
library:           'Bibliothek' / 'Library'
wantTo:            'Will ich'   / 'Want to'
consumed:          'Gesehen'    / 'Consumed'
addConsumed:       'Als gesehen markieren' / 'Add as consumed'
markConsumed:      'Gesehen markieren'    / 'Mark as consumed'
promoteToConsumed: 'Beendet →'            / 'I finished this'
updateRating:      'Bewertung ändern'     / 'Update rating'
removeFromLibrary: 'Aus Bibliothek entfernen' / 'Remove from library'
searchToAdd:       'Titel suchen...'      / 'Search title...'
searchNoResultsFor: 'Nichts zu "{0}" gefunden' / 'Nothing for "{0}"'
alreadyConsumed:   'Bereits in deiner Bibliothek' / 'Already in your library'
ratingRequired:    'Bitte bewerte (1-5 Sterne)'  / 'Please rate (1-5 stars)'
```

The user explicitly chose to skip date display, notes, and the recommend toggle —
no i18n keys for those.

---

## Files to change (high level)

| File | Change |
|---|---|
| `js/storage.js` | Add `consumed` object store + 5 new exports |
| `js/app.js` | Load `consumed` on init, add Library page render, add `addConsumed`/`promoteToConsumed` flows, dedup discover by consumed IDs, update `_navHTML` label and count |
| `js/recommender.js` | Add `updateFromConsumed(item, rating)` with 1.2x/1.5x weighting |
| `js/i18n.js` | Add 11 new translation keys per the table above |
| `css/styles.css` | Add styles for the new status badge, media-type filter chips, and Add-Consumed modal. Follow the existing Apple TV typography conventions documented at the top of the file. |
| `tests/library.test.js` (new) | Test the consumed-store CRUD, the rating update, the recommender weighting, and the discover-dedup logic |
| `js/api.js` (or new `js/library.js`) | Add a `addConsumedItem(searchQuery, rating)` async function that searches across all APIs and adds the result |

Total estimated scope: ~500-700 lines of new code across 6-7 files.

---

## Resolved design decisions (formerly open questions)

Each of the 8 open questions below was answered with rationale, trade-offs,
and concrete implementation details.

### 1. Race condition: same item in both Want to and Consumed

**Decision: Prompt the user, defaulting to "moves it" (single-bucket invariant).**

Rationale: Maintaining a single-bucket invariant (an item is in EXACTLY ONE
of `watchlist` or `consumed`, never both) is simpler than tracking dual-bucket
items. It also matches user mental models — you either want to watch it or you
already did.

Implementation:
- All add-consumed and promote-to-consumed flows go through a single helper
  `_addConsumedAtomic(item, rating)` that:
  1. Reads both `watchlist` and `consumed` stores in the same IndexedDB transaction.
  2. If the item is in `watchlist`, shows a small inline confirm: "This is in
     your Want to list. Mark as consumed (moves it)?" with two buttons:
     "Move it" (default, Enter) / "Add separately".
  3. If the item is already in `consumed`, shows: "Already in your library —
     update rating?" (see edge case #1).
  4. Writes happen in a single `readwrite` transaction so the check + write is atomic.
- For cross-tab races (user has the app open in two tabs):
  - Use a `BroadcastChannel('bookswipe-library')` to broadcast library mutations.
  - On receiving a broadcast, the other tab re-fetches its library state and
    re-renders the affected view.
  - If the user is in the middle of an add-consumed flow in one tab, the other
    tab's view re-renders to show the new state. The in-flight modal in the
    first tab is unaffected (it'll just succeed or fail its final write).
- Worst case: user clicks "Move it" in tab A at the exact same moment as
  a swipe-right in tab B adds it to watchlist. The transaction in tab A
  will see the new watchlist entry, prompt the user, and behave correctly.
  No data corruption possible because IndexedDB transactions are serialized.

### 2. Recommender weighting decay over time

**Decision: NO decay for consumed items. (Swipes still decay after 180 days.)**

Rationale: A consumed item is a deliberate, intentional signal — the user
opened the app, searched for it, picked a 1-5 star rating, and confirmed.
A swipe is a fast, low-friction reaction. The intensity difference justifies
different decay behavior. If the user's tastes change, they can update the
rating (the recommender subtracts the old contribution and adds the new).

Implementation:
- The `Recommender.updateFromConsumed(item, rating)` method does NOT touch
  the decay system. Consumed items live in the profile vector forever.
- The recommender's `rebuildProfile()` (called on app load) iterates consumed
  items with the same 1.2x/1.5x weighting and adds their genre/era contributions.
- The decay system in `recommender.js` only applies to the swipe history slice
  (`this.history` filtered by age). Consumed items are a separate slice.
- Storage impact: at 1KB per consumed item × 5,000 cap, that's 5MB worst case.
  The recommender's per-item contribution is a Set of genre strings — no
  unbounded growth.

Edge case: if a user adds 5,000 consumed items over 10 years and all are
5-starred, the recommender's taste vector could become over-fit to old content.
Mitigation: the `taste-propagation` mechanism (already in the recommender)
naturally caps per-genre weight contribution. If this becomes a problem in
practice, v2 can add a per-item "half-life" (e.g., 3 years for 5-star consumed,
1 year for 1-star consumed).

### 3. Long-press / kebab menu discoverability

**Decision: Always-visible kebab button (⋮) in the top-left corner of each card.**

Rationale: Long-press is invisible to new users and doesn't work on desktop.
Right-click is desktop-only. The most discoverable interaction is a small
always-visible button. Top-left because the top-right is already taken by the
match score badge.

Implementation:
- Add a `card-kebab-btn` to each card in the Library page (NOT in the discover
  view, where swiping is the primary action).
- Button shows ⋮ icon, size 28x28px, frosted-glass background
  (`rgba(255,255,255,.08)` + `backdrop-filter:blur(8px)`).
- On hover: scales to 1.08, gains a subtle Apple-blue glow ring.
- On click: opens a popover menu with the actions:
  - For Want to cards: "I finished this →" (primary), "Remove from Want to" (destructive)
  - For Consumed cards: "Update rating", "Remove from library" (destructive)
  - Common: "Open detail" (links to existing card modal)
- Mobile: tap opens the same popover. No long-press needed.
- The popover auto-closes on click-outside or after any action.
- aria-label: "More actions for {title}" for screen readers.

### 4. Empty state illustrations

**Decision: Yes, add three empty states (one per status tab + one combined).**

Implementation (all centered in the cards area, ~200px tall):

**Want to tab, empty** (most common first-time user state):
- 📝 emoji, 3rem size
- Headline: "Nothing saved yet" / "Noch nichts gemerkt"
- Subtext: "Swipe right on things you like, and they'll show up here." /
  "Wische rechts bei Dingen, die dir gefallen — sie erscheinen hier."
- CTA: "Start swiping →" (primary button, navigates to discover)

**Consumed tab, empty**:
- 🎬 emoji, 3rem size
- Headline: "No consumed items yet" / "Noch nichts als gesehen markiert"
- Subtext: "Add what you've already read or watched to teach the app your taste." /
  "Markiere, was du schon gelesen oder gesehen hast, um der App deinen Geschmack beizubringen."
- CTA: "+ Add as consumed" (primary button, opens add-consumed modal)

**Both tabs empty (Library page first-time state)**:
- 💫 emoji, 4rem size with subtle Apple-blue drop-shadow
- Headline: "Your library is empty" / "Deine Bibliothek ist leer"
- Subtext: "Add what you've enjoyed and save what you want to try — both feed
  your recommendations." / "Markiere Gesehenes und merke dir Wünschenswertes —
  beides verbessert deine Empfehlungen."
- Two CTAs: "+ Add consumed" (secondary), "Start swiping →" (primary)

All three empty states follow the existing `.empty` class pattern (already at
line 1334) but with a new `.empty-illustration` wrapper for the larger layout.

### 5. Badge placement on cards

**Decision: Small pill in the TOP-LEFT corner of the card.**

Rationale: Top-right is already taken by the match score badge (`.card-match-badge`).
Top-left is the natural "status" position. Pill (not full overlay) keeps the
cover art fully visible.

Implementation:
- Want to badge: small 📝 emoji in a 24px circular frosted-glass pill,
  `position:absolute;top:10px;left:10px;`
- Consumed badge: small pill with star icon + rating, e.g., "⭐ 4", 24px tall,
  `position:absolute;top:10px;left:10px;`. Pill width grows with rating (1-2 chars).
- Both badges: `background:rgba(255,255,255,.12); backdrop-filter:blur(8px);`
  `border:1px solid rgba(255,255,255,.15); border-radius:12px;`
  `font-size:.7rem; font-weight:600; color:#fff;`
- Consumed badge color hint: star icon in `#FFD60A` (Apple's "yellow" system color)
  to draw the eye to the rating.
- These badges are ONLY shown in the Library page, not in the discover view
  (consumed items never appear in discover, so it's not needed there).

### 6. Games "consumed" semantics

**Decision: Trust the user's tap. "Consumed" = "I completed this game."**

Rationale: Auto-detecting completion requires either:
(a) Steam API integration (already exists but only for users who provided their
    Steam ID — not universal).
(b) A heuristic based on playtime vs HLTB (How Long To Beat) main story hours —
    requires an HLTB API integration we don't have.
(c) Tracking in-game progress (impossible without per-game integration).

All three are out of scope. The user already explicitly chose "trust the user"
by not asking for a "would recommend" or "playtime" input.

Implementation:
- The Add-Consumed modal for games has a small helper text under the rating:
  "Mark as completed" / "Als abgeschlossen markieren"
- For users WITH Steam integration: if a game in the consumed store has a
  `steamAppId` AND we can fetch its current playtime, show a small note:
  "Your Steam playtime: 47 hours" / "Deine Steam-Spielzeit: 47 Stunden"
  (read-only, informational, no auto-detection).
- For users WITHOUT Steam: no playtime info, just the rating.

### 7. Privacy / export

**Decision: Add a "Data" section at the bottom of the Library page with two export buttons.**

Implementation:
- Footer of the Library page has a "Your data" / "Deine Daten" section
  with two buttons:
  - **Export library (JSON)** / **Bibliothek exportieren (JSON)**:
    Downloads a `bookswipe-library-{date}.json` file containing both
    `watchlist` and `consumed` arrays, plus a `version: 1` field for
    future restore support.
  - **Export library (CSV)** / **Bibliothek exportieren (CSV)**:
    Downloads a `bookswipe-library-{date}.csv` with columns:
    `status, title, year, type, source, genres, rating, consumedAt, promotedFromWatchlist`
  - **Import library (JSON)** / **Bibliothek importieren (JSON)** (v2, but button is stubbed in v1):
    Opens a file picker. For now, shows a toast: "Import coming in v2".
- The JSON format is the same one used by the in-app backup mechanism
  (already exists for IndexedDB migration). This means future restore is
  just `import { migrateFromJSON }` with a small adapter.
- Privacy stance: all exports are LOCAL. No data leaves the device. The
  download is triggered by user action, not automatic. There's no
  server-side processing of library data.
- Add an info tooltip: "All exports stay on your device. BookSwipe never
  uploads your library." / "Alle Exporte bleiben auf deinem Gerät. BookSwipe
  lädt deine Bibliothek nie hoch."

### 8. Telemetry for tuning 1.2x / 1.5x multipliers

**Decision: Track 4 anonymized local metrics, then A/B test the multipliers in a future experiment.**

Implementation (in js/recommender.js, persisted to localStorage, NOT sent to a server):

**Metric 1: like_rate_per_consumed_count**
- Bins users by N = `consumed.length` (0-10, 10-50, 50-100, 100+).
- For each bin, track the rolling like-rate (likes / total swipes) over the last 100 swipes.
- Surface as a small line in the taste profile: "Like rate for users with ~50
  consumed items: 62% (yours: 58%)". Anonymous comparison helps the user (and us)
  see if the recommender is performing well.

**Metric 2: recommendation_skip_rate**
- Track how often the user swipes left or up (nope/skip) on the top
  recommendation. A high skip rate means the recommender is off.
- Compute this BEFORE and AFTER adding a consumed item to measure
  the immediate effect.
- Surface as: "Since you added 12 consumed items, your like rate is up 8%."
  (only shown if the delta is meaningful)

**Metric 3: same_item_reswipe_count**
- Count how often the user sees an item in discover, swipes on it, and then
  sees it again later (via refill). Should be 0 if dedup works correctly.
- After adding the consumed dedup, this metric should drop to 0 entirely
  for consumed items. A non-zero count indicates a bug.

**Metric 4: rating_distribution**
- Histogram of consumed ratings (1-star: 5%, 2-star: 10%, 3-star: 20%, 4-star: 40%, 5-star: 25%).
- If most users rate 5 stars (ceiling effect), the rating scale is too narrow
  and the weighting should be re-tuned.
- If most rate 1-2 stars, users are being too harsh, or the recommender is
  showing them things they hate.
- Surface in taste profile: "Your rating tendency: positive (avg 4.2 ⭐)"

A/B test plan (v2, requires the existing `js/experiment.js` ABTest class):
- Variant A: 1.0x weighting (consumed = same as swipe)
- Variant B: 1.2x / 1.5x (current spec)
- Variant C: 2.0x / 3.0x (much stronger)
- Run for 4 weeks, measure like_rate_per_consumed_count + recommendation_skip_rate
- Pick the variant that maximizes the like rate without increasing the skip rate.

All telemetry is opt-in: a single toggle in the settings ("Help improve recommendations
by sharing anonymous usage stats" / "Hilf mit, Empfehlungen zu verbessern, indem du
anonyme Nutzungsstatistiken teilst"). Off by default.

---

---

## Wireframes

Detailed ASCII wireframes for the four key views. All dimensions are
approximate. The existing `.discover-header`, `.card-stack`, `.search-modal`,
and other patterns from the codebase are reused where possible to keep
the visual language consistent.

### 1. Library page — Want to tab (default view)

```
┌──────────────────────────────────────────────────────────────┐
│ ← back                                          Library      │  ← header (h1, 1.3rem, weight 800)
├──────────────────────────────────────────────────────────────┤
│ [ Want to (12) ]  [ Consumed (30) ]                         │  ← status tabs (12px padding, 8px gap)
│ ──────────────                                                │     (active tab has Apple-blue underline)
├──────────────────────────────────────────────────────────────┤
│ [ All ] [Books] [Movies/TV] [Games]                         │  ← media type chips (existing .filter-chip)
│                                              (active = All) │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│   │📝         │  │📝         │  │📝         │             │  ← card top-left badge: Want to
│   │            │  │            │  │            │             │
│   │  [poster]  │  │  [poster]  │  │  [poster]  │             │
│   │            │  │            │  │            │             │
│   │            │  │  92%       │  │            │             │  ← (match badge if present)
│   │            │  │            │  │            │             │
│   │            │  │            │  │            │             │
│   │            ⋮│  │            ⋮│  │            ⋮│             │  ← kebab button (top-right, always visible)
│   ├────────────┤  ├────────────┤  ├────────────┤             │
│   │Dune        │  │Severance   │  │Hades       │             │  ← card title (existing .card-title)
│   │ 2021  Film │  │ 2022  Serie│  │ 2020  Game │             │  ← year + type (existing .card-meta-row)
│   │Sci-Fi      │  │Drama  Mys… │  │Action  RPG │             │  ← genre chips (existing .card-genre-chip)
│   └────────────┘  └────────────┘  └────────────┘             │
│                                                              │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│   │📝         ⋮│  │📝         ⋮│  │📝         ⋮│             │
│   │  [poster]  │  │  [poster]  │  │  [poster]  │             │
│   │   78%      │  │            │  │            │             │
│   │            │  │            │  │            │             │
│   │            │  │            │  │            │             │
│   ├────────────┤  ├────────────┤  ├────────────┤             │
│   │Project Hail│  │Blood meridian│ │Disco Ely… │             │
│   │2021  Book  │  │ 2024  Book │  │ 2019  Game │             │
│   │Sci-Fi      │  │Horror      │  │RPG  Detec… │             │
│   └────────────┘  └────────────┘  └────────────┘             │
│                                                              │
│              [ scroll for more — 6 more cards ]              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│            [ + Add as consumed ]                             │  ← primary CTA (sticky bottom, 14px 24px)
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ 🔍 Discover  ⭐ Today  📋 Library(42)  📖 History  🧬 🪩     │  ← bottom nav
└──────────────────────────────────────────────────────────────┘

Key details:
- Card width: 30% of viewport on desktop, 48% on tablet, 100% on mobile (2-col then 1-col)
- Status tab height: 44px (touch target)
- Media type chip row: 36px tall, horizontally scrollable on overflow
- + Add as consumed button: 48px tall, sticky at bottom above nav
- Card grid gap: 14px horizontal, 14px vertical
- The kebab button (⋮) is ALWAYS VISIBLE in the Library page only (never in discover)
```

### 2. Library page — Consumed tab (after switching tabs)

```
┌──────────────────────────────────────────────────────────────┐
│ ← back                                          Library      │
├──────────────────────────────────────────────────────────────┤
│ [ Want to (12) ]  [ Consumed (30) ]                         │  ← Consumed tab now active (Apple-blue underline)
├──────────────────────────────────────────────────────────────┤
│ [ All ] [Books] [Movies/TV] [Games]                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│   │⭐ 5        │  │⭐ 4        │  │⭐ 3        │             │  ← top-left badge: Consumed + star rating
│   │            │  │            │  │            │             │     (star in Apple yellow #FFD60A)
│   │  [poster]  │  │  [poster]  │  │  [poster]  │             │
│   │            │  │            │  │            │             │
│   │            │  │            │  │            │             │
│   │            │  │            │  │            │             │
│   │            ⋮│  │            ⋮│  │            ⋮│             │
│   ├────────────┤  ├────────────┤  ├────────────┤             │
│   │Breaking Bad│  │Sapiens     │  │Outer Wilds│             │
│   │2008–2013   │  │ 2011  Book │  │ 2019  Game │             │
│   │Serie  Crime│  │Non-fiction │  │Adventure  │             │
│   └────────────┘  └────────────┘  └────────────┘             │
│                                                              │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│   │⭐ 5        │  │⭐ 1        │  │⭐ 4        │             │  ← 1-star items have red-tinted star
│   │  [poster]  │  │  [poster]  │  │  [poster]  │             │
│   │            │  │            │  │            │             │
│   │   45h on   │  │            │  │            │             │  ← Steam playtime (only for games
│   │   Steam    │  │            │  │            │             │     that have a steamAppId AND
│   │            │  │            │  │            │             │     the user has Steam integrated)
│   ├────────────┤  ├────────────┤  ├────────────┤             │
│   │Disco Ely…  │  │50 Shades   │  │Returnal   │             │
│   │ 2019  Game │  │ 2011  Book │  │ 2021  Game │             │
│   │RPG  Detec… │  │Romance     │  │Action  RPG │             │
│   └────────────┘  └────────────┘  └────────────┘             │
│                                                              │
│              [ scroll for more — 24 more cards ]             │
├──────────────────────────────────────────────────────────────┤
│            [ + Add as consumed ]                             │
├──────────────────────────────────────────────────────────────┤
│ 🔍 Discover  ⭐ Today  📋 Library(42)  📖 History  🧬 🪩     │
└──────────────────────────────────────────────────────────────┘

Differences from Want to tab:
- Badge is "⭐ N" instead of "📝"
- Steam playtime note appears for games with steamAppId (optional, not always shown)
- The kebab menu actions are different (see Wireframe 4b)
- The "+ Add consumed" CTA is in the same place (you can always add more)
```

### 3. Add Consumed modal

#### 3a. Search state (typing)

```
┌──────────────────────────────────────────────┐
│  Mark as consumed                       ✕   │  ← header (h2)
├──────────────────────────────────────────────┤
│  🔍 [ blade runne_____________ ]    [Search]│  ← search input (existing .search-input)
│                                              │     autofocus, clears on close
├──────────────────────────────────────────────┤
│                                              │
│  Recent searches                             │  ← shown if no query + has localStorage history
│    • Breaking Bad                            │     (capped at 5 most recent)
│    • The Wire                                │
│    • Dune                                    │
│                                              │
│  Or pick from your Want to list:             │  ← if watchlist non-empty, quick-promote
│    ┌────────────┐ ┌────────────┐             │
│    │📝  [poster]│ │📝  [poster]│             │  ← thumbnails of watchlist items
│    │ Severance  │ │ Project H… │             │     tap = opens rating modal
│    └────────────┘ └────────────┘             │
│                                              │
└──────────────────────────────────────────────┘
```

#### 3b. Results state

```
┌──────────────────────────────────────────────┐
│  Mark as consumed                       ✕   │
├──────────────────────────────────────────────┤
│  🔍 [ blade runner            ]    [Search] │
├──────────────────────────────────────────────┤
│                                              │
│  ┌──────┐ Blade Runner           [+ Mark]   │  ← result row (existing .search-result style)
│  │poster│ 1982  Ridley Scott    as consumed  │     "+ Mark" button on the right
│  └──────┘                                    │
│                                              │
│  ┌──────┐ Blade Runner 2049      [+ Mark]   │
│  │poster│ 2017  Denis Villeneuve as consumed  │
│  └──────┘                                    │
│                                              │
│  ┌──────┐ Blade Runner: Black Lotus [+ Mark]│
│  │poster│ 2021–2022  Serie       as consumed  │  ← (TV shows included via TMDB multi)
│  └──────┘                                    │
│                                              │
│              [ scroll for more ]             │
└──────────────────────────────────────────────┘
```

#### 3c. Rating selector (after tapping "+ Mark" on a result)

```
┌──────────────────────────────────────────────┐
│  Mark as consumed                       ✕   │
├──────────────────────────────────────────────┤
│                                              │
│           ┌──────┐                           │
│           │poster│                           │  ← result thumbnail (centered, larger)
│           └──────┘                           │
│           Blade Runner                       │
│           1982  Film                         │
│                                              │
│  How did you like it?                       │  ← label
│                                              │
│        ☆  ☆  ☆  ☆  ☆                        │  ← 5 star selector (large, 32px)
│        1   2   3   4   5                    │     default: 4 stars
│                                              │
│  (your Steam playtime: — )                  │  ← only for games, only if Steam integrated
│                                              │
│  ┌──────────────────────────────────────┐  │
│  │   Mark as consumed (4 stars)   ✓    │  │  ← primary CTA, shows current rating
│  └──────────────────────────────────────┘  │
│                                              │
│  [ Cancel ]                                  │  ← secondary
└──────────────────────────────────────────────┘

Star interaction:
- Tap a star: fills all stars up to and including that position
- Tap the same star twice: clears back to 0 (forces user to re-pick)
- Hover: shows the hover state with all stars up to hovered position
- Required field — "Mark as consumed" button is disabled until 1-5 stars selected
```

### 4. Card badge placement (close-up of one card)

```
   ┌──────────────────────────────────┐
   │  ┌────┐                    ┌──┐  │  ← top-left: status badge (24x24 circle, 10px inset)
   │  │ 📝 │                    │⋮ │  │  ← top-right: kebab (28x28, frosted glass, 10px inset)
   │  └────┘                    └──┘  │
   │  ┌────────────────────────────┐  │
   │  │                            │  │
   │  │                            │  │
   │  │        [ card cover ]      │  │  ← existing poster/backdrop
   │  │                            │  │
   │  │                            │  │
   │  │                    ┌─────┐ │  │  ← match-score badge (existing, top-right of cover)
   │  │                    │ 78% │ │  │     (only shown if _score is set)
   │  │                    └─────┘ │
   │  └────────────────────────────┘  │
   │                                  │
   │  Dune                            │  ← title
   │  2021  Film                      │  ← year + type
   │  ┌─────┐ ┌──────┐               │  ← genre chips
   │  │Sci-F│ │Advntr│               │
   │  └─────┘ └──────┘               │
   └──────────────────────────────────┘

Badge styles:

Want to badge (📝):
  position: absolute; top: 10px; left: 10px;
  width: 28px; height: 28px;
  border-radius: 50%;
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.15);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  font-size: .8rem;
  z-index: 3; /* above cover overlay */

Consumed badge (⭐ N):
  position: absolute; top: 10px; left: 10px;
  height: 24px; min-width: 28px; padding: 0 8px;
  border-radius: 12px;
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.15);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; gap: 4px;
  font-size: .7rem; font-weight: 700; color: #fff;
  z-index: 3;
  --star-color: #FFD60A;  /* Apple yellow for 4-5 star */
  --star-color-1: #FF453A; /* Apple red for 1-2 star */

Kebab button (⋮) — only in Library page:
  position: absolute; top: 10px; right: 10px;
  width: 28px; height: 28px;
  border-radius: 50%;
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.15);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 1rem; font-weight: 800;
  cursor: pointer;
  z-index: 3;
  transition: all .25s var(--ease-bounce);
  &:hover { transform: scale(1.08); border-color: rgba(10,132,255,.4); }
```

### 5. Kebab popover menu (open state)

#### 5a. Want to card kebab

```
   ┌──────────────────────────────────┐
   │  ┌────┐         ┌──┐  ┌────────┐│
   │  │ 📝 │         │⋮◀──│Promote ││  ← popover appears to the LEFT of the kebab
   │  └────┘         └──┘  ├────────┤│     (avoids clipping at right edge of card)
   │  ┌─────────────────┐  │Open    ││
   │  │     [ cover ]   │  │detail  ││
   │  │                 │  ├────────┤│
   │  │                 │  │Remove  ││  ← destructive (red text)
   │  │                 │  │from W… ││
   │  └─────────────────┘  └────────┘│
   │                                  │
   │  Dune                            │
   │  ...                             │
   └──────────────────────────────────┘

Popover actions (Want to):
  1. "I finished this →" (primary, weight 600) — opens rating modal
  2. "Open detail" (secondary) — opens existing card modal
  3. "Remove from Want to" (destructive, red) — deletes from watchlist
```

#### 5b. Consumed card kebab

```
   ┌──────────────────────────────────┐
   │  ┌────┐         ┌──┐  ┌────────┐│
   │  │⭐ 5│         │⋮◀──│Update  ││
   │  └────┘         └──┘  │rating  ││
   │  ┌─────────────────┐  ├────────┤│
   │  │     [ cover ]   │  │Open    ││
   │  │                 │  │detail  ││
   │  │                 │  ├────────┤│
   │  │                 │  │Remove  ││
   │  └─────────────────┘  │from    ││
   │                      │library ││
   │  ...                 └────────┘│
   └──────────────────────────────────┘

Popover actions (Consumed):
  1. "Update rating" (primary, weight 600) — re-opens rating modal with current rating pre-filled
  2. "Open detail" (secondary) — opens existing card modal
  3. "Remove from library" (destructive, red) — deletes from consumed store, recommender forgets it

Popover positioning logic:
  If kebab is in the left half of the viewport: popover opens to the RIGHT of the kebab
  If kebab is in the right half of the viewport: popover opens to the LEFT
  If the card is near the bottom of the screen: popover opens UPWARD from the kebab
  Z-index: 100 (above all other page content)
  Closes on:
    - Click outside the popover
    - Escape key
    - Any action button click
    - Card scroll outside of viewport
```

### 6. Empty states

#### 6a. Both tabs empty (first-time user)

```
┌──────────────────────────────────────────────┐
│  ← back                          Library     │
├──────────────────────────────────────────────┤
│  [ Want to (0) ]  [ Consumed (0) ]          │
├──────────────────────────────────────────────┤
│  [ All ] [Books] [Movies/TV] [Games]         │
├──────────────────────────────────────────────┤
│                                              │
│                                              │
│                    💫                        │  ← 4rem emoji with Apple-blue drop-shadow
│            (1.2rem)                          │
│                                              │
│        Your library is empty                │  ← h2, weight 700
│                                              │
│   Add what you've enjoyed and save what     │  ← body text, .88rem
│   you want to try — both feed your          │     max-width 320px, centered
│   recommendations.                           │
│                                              │
│       [ + Add consumed ]   [ Start → ]       │  ← two CTAs side by side
│                                              │     primary on the right
│                                              │
│                                              │
│                  ( 200px tall )              │
│                                              │
├──────────────────────────────────────────────┤
│  [ + Add as consumed ]                       │
├──────────────────────────────────────────────┤
│  🔍 Discover  ⭐ Today  📋 Library(0)  📖  │
└──────────────────────────────────────────────┘
```

#### 6b. Want to tab empty, Consumed has items

```
              (similar to 6a but)
              📝 emoji (3rem)
              Nothing saved yet
              Swipe right on things you like, and they'll show up here.
              [ Start swiping → ] (single CTA, primary)
```

#### 6c. Consumed tab empty, Want to has items

```
              (similar to 6a but)
              🎬 emoji (3rem)
              No consumed items yet
              Add what you've already read or watched to teach the app your taste.
              [ + Add consumed ] (single CTA, primary)
```

### 7. Mobile layout (375px viewport)

```
┌──────────────────────────┐
│ ← back          Library  │  ← header compact
├──────────────────────────┤
│ [ Want to (12) ]         │  ← tabs full-width, 50/50 split
│ [ Consumed (30) ]        │     (vertical stack, not side-by-side)
├──────────────────────────┤
│ [All][Books][Movies/TV]  │  ← media type chips horizontally scrollable
│ [Games]                  │
├──────────────────────────┤
│                          │
│  ┌────────────────────┐  │  ← 1-column card grid on mobile
│  │📝              ⋮   │  │     (was 3-col on desktop)
│  │                    │  │
│  │    [ card cover ]  │  │
│  │                    │  │
│  │                    │  │
│  ├────────────────────┤  │
│  │  Dune              │  │
│  │  2021  Film        │  │
│  │  Sci-Fi  Adventure │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │📝              ⋮   │  │
│  │  ...               │  │
│  └────────────────────┘  │
│                          │
│           ( scroll )     │
├──────────────────────────┤
│  [ + Add consumed ]      │  ← sticky bottom, full-width
├──────────────────────────┤
│ 🔍 ⭐ 📋(42) 📖 🧬       │  ← bottom nav (icons only on mobile,
└──────────────────────────┘                       text labels hidden < 480px)
```

Key mobile differences:
- Card grid: 1 column (was 3 on desktop, 2 on tablet)
- Status tabs: stacked vertically (was side-by-side)
- Bottom CTA: full-width sticky
- Kebab button: same size, but tap target is easier (28px hit area)
- The popover menu: opens full-width sheet from bottom (not a popover)
- The rating modal: takes full screen on mobile, modal on desktop

---

---

## Implementation tickets

Discrete, parallelizable tickets for building the Library feature.
Each ticket has: ID, title, files touched, dependencies, effort estimate
(S=1-2h, M=3-6h, L=1-2d, XL=3+d), acceptance criteria, test requirements.

**Effort scale:**
- S = 1-2 hours, <50 lines of new code
- M = 3-6 hours, 50-150 lines
- L = 1-2 days, 150-400 lines
- XL = 3+ days, 400+ lines

**Total estimated effort: ~10-14 days for one developer, ~5-7 days for two in parallel.**

### Dependency graph (high level)

```
LIB-001 (storage) ─┬─> LIB-002 (atomic helper)
                   │
LIB-010 (reco) ────┤
                   │
LIB-009 (i18n) ────┴─> LIB-003 (Library page) ─> LIB-004 (badges)
                                              ─> LIB-005 (kebab)
                                              ─> LIB-006 (Add modal)
                                              ─> LIB-007 (empty states)
                                              ─> LIB-008 (export)
                                              ─> LIB-015 (mobile)
                                              ─> LIB-016 (nav)

LIB-011 (discover dedup) ─> LIB-012 (BroadcastChannel)

LIB-013 (library tests)  depends on LIB-003..008
LIB-014 (reco tests)      depends on LIB-010
```

### Tickets

---

#### LIB-001 — Storage layer: add `consumed` object store

**Files:** `js/storage.js`

**Description:** Add a new IndexedDB object store `consumed` parallel to
the existing `watchlist`/`disliked`/`history`. Five new exports
(`getConsumed`, `addToConsumed`, `removeFromConsumed`, `updateConsumedRating`,
`getAllConsumedIds`). Bump `DB_VERSION` from 2 to 3 with a migration step
that creates the new store without touching existing data.

**Dependencies:** None (foundation).

**Effort:** S

**Acceptance criteria:**
- Existing IndexedDB data (watchlist, history, etc.) is preserved on upgrade
- New `consumed` store is created with keyPath `id`
- `getConsumed()` returns all items as an array (or empty if none)
- `addToConsumed(item)` and `removeFromConsumed(id)` round-trip cleanly
- `updateConsumedRating(id, rating)` updates only the `consumedRating` field
- `getAllConsumedIds()` returns a `Set<string>`

**Tests:** `tests/library-storage.test.js` — CRUD operations, migration from v2, empty-store behavior.

---

#### LIB-002 — Atomic add-consumed helper

**Files:** `js/app.js` (new method on `App` class)

**Description:** Single helper `_addConsumedAtomic(item, rating)` that:
1. Reads `watchlist` and `consumed` in one transaction
2. Detects conflicts (item in both, or item already consumed)
3. Calls UI prompt for conflicts (returns user's choice: 'move' or 'separate')
4. Writes/deletes in a single `readwrite` transaction
5. Returns the final stored item

This is the canonical path for ALL add-consumed flows (modal, kebab promote, quick-promote from want-to).

**Dependencies:** LIB-001.

**Effort:** M

**Acceptance criteria:**
- Adding an item not in watchlist: stored in `consumed`, no watchlist change
- Adding an item in watchlist: prompt appears, 'move' deletes from watchlist, 'separate' leaves watchlist intact
- Adding an item already consumed: returns 'already exists' result, no write
- Cross-tab: other tab receives `BroadcastChannel` message (deferred to LIB-012 but stub the call here)
- Idempotent: calling twice with the same item doesn't create duplicates

**Tests:** `tests/library-atomic.test.js` — all 4 conflict scenarios, idempotency.

---

#### LIB-003 — Library page render (skeleton + tabs + filters + grid)

**Files:** `js/app.js` (new `renderLibrary(app)` method, replaces or extends existing `renderWatchlist`), `css/styles.css` (new rules for `.library-page`, `.status-tabs`, `.media-type-chips`)

**Description:** Full page render with:
- Header (`← back` + "Library" h1)
- Status tabs (Want to / Consumed with counts)
- Media type filter chips (All / Books / Movies/TV / Games)
- Card grid (reuses existing card render with badge overlay from LIB-004)
- Empty states (LIB-007)
- Bottom CTA "+ Add as consumed" (sticky)
- Wires up the existing `_navHTML` to point to the new `renderLibrary` instead of `renderWatchlist`

**Dependencies:** LIB-001, LIB-004, LIB-007, LIB-009, LIB-016.

**Effort:** L

**Acceptance criteria:**
- Tabs switch correctly, counts are accurate (live from IndexedDB)
- Media type filter narrows the visible cards
- Bottom nav 📝 tab now shows total count (watchlist + consumed)
- All existing watchlist users see their old items in the "Want to" tab (zero data loss)
- Page is responsive: 3-col desktop, 2-col tablet, 1-col mobile
- aria-labels for all interactive elements
- Keyboard navigation works (tab order, Enter to activate)

**Tests:** `tests/library-render.test.js` — tab switching, filter logic, count accuracy, responsive breakpoints.

---

#### LIB-004 — Card badge overlay (Want to + Consumed)

**Files:** `js/app.js` (modifies `_renderHero` or adds `_renderLibraryCard`), `css/styles.css` (new `.card-status-badge`, `.card-kebab-btn`)

**Description:** Add status badge overlay to cards in the Library page only.
Two badge variants:
- Want to: small 28x28 circular pill with 📝 emoji, top-left
- Consumed: small pill with `⭐ N`, top-left, star color varies by rating

The kebab button (⋮) is added to the top-right of each card.
Both are only rendered when `page === 'library'`, not in discover.

**Dependencies:** None (CSS-only component).

**Effort:** M

**Acceptance criteria:**
- Badge appears in correct corner, doesn't overlap the cover or title
- Star color is yellow (Apple #FFD60A) for 4-5 star, default for 3, red (Apple #FF453A) for 1-2
- Kebab is always visible, hover scales 1.08 with Apple-blue glow
- No layout shift between the Want to and Consumed badge positions
- Cards in discover view (NOT in library) have NO badges or kebab

**Tests:** `tests/library-badges.test.js` — badge rendering per status, star color logic, kebab position.

---

#### LIB-005 — Kebab button + popover menu

**Files:** `js/app.js` (new `_showKebabMenu(cardEl, item, status)`), `css/styles.css` (new `.kebab-popover`)

**Description:** Popover menu that appears when user taps the kebab button on a card.
Viewport-aware positioning (left/right of kebab based on card position).
Closes on click-outside, Escape, or action selection.

Actions per status:
- Want to: "I finished this →" (primary), "Open detail" (secondary), "Remove from Want to" (destructive)
- Consumed: "Update rating" (primary), "Open detail" (secondary), "Remove from library" (destructive)

**Dependencies:** LIB-004 (uses the kebab button), LIB-006 (for "I finished this" action).

**Effort:** M

**Acceptance criteria:**
- Popover opens within 100ms of kebab click
- Position adapts: opens right of kebab for left-half cards, left for right-half
- All 3 actions per status work correctly
- Destructive action shows a confirmation toast with "Undo" (3-second window)
- Keyboard accessible: arrow keys move focus between actions, Enter activates
- Mobile: popover becomes a bottom sheet (full-width, 3 buttons stacked)

**Tests:** `tests/library-kebab.test.js` — positioning logic, action routing, keyboard nav, mobile sheet mode.

---

#### LIB-006 — Add Consumed modal (search + rating)

**Files:** `js/app.js` (new `_showAddConsumedModal(app)`), `css/styles.css` (new `.add-consumed-modal`, `.star-selector`)

**Description:** Modal opened from the Library page's "+ Add consumed" button.
Three internal states:
1. **Search state**: input with recent searches (from localStorage) + quick-promote row showing watchlist thumbnails
2. **Results state**: list of search results, each with a "+ Mark" button
3. **Rating state**: thumbnail + title + 5-star selector + CTA

Uses existing search APIs (OpenLibrary + Google Books for books, TMDB multi for movies/TV, IGDB for games).

**Dependencies:** LIB-002 (for the atomic add), LIB-001 (storage), LIB-009 (i18n).

**Effort:** L

**Acceptance criteria:**
- Search input has autofocus on open
- Results appear within 500ms (debounced 350ms like global search)
- Recent searches: stored in localStorage, max 5 entries
- Quick-promote row: shows up to 8 watchlist thumbnails, tap = opens rating modal
- Star selector: 5 large stars, hover state shows preview, click fills up to that star
- CTA button text reflects current rating: "Mark as consumed (4 stars) ✓"
- CTA disabled until 1+ stars selected
- Optional Steam playtime note for games (if user has Steam integrated)
- Close on Escape, X button, or click-outside

**Tests:** `tests/library-add-modal.test.js` — search debounce, recent searches persistence, star interaction, CTA enable/disable, Steam playtime display.

---

#### LIB-007 — Empty states (3 variants)

**Files:** `js/app.js` (inline in `renderLibrary`), `css/styles.css` (new `.empty-illustration`)

**Description:** Three empty states per the wireframes:
- Both tabs empty: combined first-time state with 💫 emoji + two CTAs
- Want to empty only: 📝 + single CTA "Start swiping →"
- Consumed empty only: 🎬 + single CTA "+ Add consumed"

All three centered in the card grid area, ~200px tall.

**Dependencies:** LIB-003 (uses the Library page render).

**Effort:** S

**Acceptance criteria:**
- Empty state appears when the relevant tab has 0 items
- Emojis are 3-4rem, Apple-blue drop-shadow on the 4rem one
- CTAs navigate to discover or open the add-consumed modal
- Dark/light mode both look correct (use existing color variables)
- i18n: all text from the keys in LIB-009

**Tests:** `tests/library-empty.test.js` — empty state shows correctly for each tab + combination.

---

#### LIB-008 — Data export (JSON + CSV)

**Files:** `js/app.js` (new `_exportLibrary(format)`), `css/styles.css` (new `.library-data-section`)

**Description:** "Your data" section at the bottom of the Library page with
two buttons: "Export library (JSON)" and "Export library (CSV)".
JSON includes both watchlist and consumed with a `version: 1` field.
CSV columns: `status, title, year, type, source, genres, rating, consumedAt, promotedFromWatchlist`.
Import button (JSON) is stubbed for v2 (shows "coming soon" toast).

**Dependencies:** LIB-001 (storage), LIB-003 (Library page).

**Effort:** M

**Acceptance criteria:**
- JSON file downloads with correct filename `bookswipe-library-{YYYY-MM-DD}.json`
- CSV file downloads with same naming pattern
- JSON is valid and round-trippable (re-importable in v2)
- CSV is valid (opens in Excel/Sheets without errors)
- Genres column is semicolon-separated inside the CSV cell (to avoid CSV column explosion)
- Privacy tooltip explains data stays local
- No network requests during export

**Tests:** `tests/library-export.test.js` — JSON validity, CSV format, filename pattern, round-trip integrity.

---

#### LIB-009 — i18n keys (11 new)

**Files:** `js/i18n.js`

**Description:** Add 11 new translation keys to BOTH `de` and `en` tables
per the table in the "i18n requirements" section of this spec:
`library`, `wantTo`, `consumed`, `addConsumed`, `markConsumed`,
`promoteToConsumed`, `updateRating`, `removeFromLibrary`,
`searchToAdd`, `searchNoResultsFor`, `alreadyConsumed`, `ratingRequired`.

**Dependencies:** None (text-only change).

**Effort:** S

**Acceptance criteria:**
- All 11 keys present in both `de` and `en` tables
- No placeholder strings (e.g., `null`, `undefined`, `TBD`)
- German translations are natural (not just Google-translated)
- No existing keys modified or removed

**Tests:** `tests/library-i18n.test.js` — every new key has a value in both languages, no missing translations.

---

#### LIB-010 — Recommender `updateFromConsumed`

**Files:** `js/recommender.js` (new method on `Recommender` class)

**Description:** New method `updateFromConsumed(item, rating)` that:
- rating 1-2: applies -1.5x weight of a 'nope' swipe (negative signal)
- rating 3: applies 0 weight (neutral, like a 'skip')
- rating 4: applies +1.2x weight of a 'like' swipe (positive)
- rating 5: applies +1.5x weight of a 'like' swipe (strong positive)
- Updates the taste vector with these weighted genre/era/keyword contributions
- Does NOT touch the decay system (consumed items are permanent)

Also modifies `rebuildProfile()` to iterate `consumed` items alongside
`watchlist` and `disliked` when rebuilding the profile from scratch.

**Dependencies:** None (can be built and tested in isolation).

**Effort:** M

**Acceptance criteria:**
- `updateFromConsumed(item, 5)` updates the taste vector similarly to two right-swipes on the same item
- `updateFromConsumed(item, 1)` updates the taste vector like a 'nope' swipe + a 'skip'
- `updateFromConsumed(item, 3)` leaves the taste vector unchanged
- `rebuildProfile()` correctly loads consumed items from storage
- Existing swipe-based recommendations are not regressed (regression test)

**Tests:** `tests/library-recommender.test.js` — all 5 rating levels, profile rebuild, regression vs swipe-based behavior.

---

#### LIB-011 — Discover dedup by consumed IDs

**Files:** `js/app.js` (modifies `renderDiscover`, `_refillDeck`, `_fetchGenreRotation`)

**Description:** Add a third lookup set alongside `watchIds` and `dislikedIds`:
```js
const consumedIds = new Set(this.consumed.map(c => c.id));
```
Filter out consumed items from the swipe deck AND from the genre-rotation
refill AND from the local-sources refill. The goal: a consumed item should
never appear in the discover view, period.

**Dependencies:** LIB-001 (consumed store), LIB-010 (recommender integration).

**Effort:** S

**Acceptance criteria:**
- Items in `consumed` never appear in the swipe deck
- Items in `consumed` never appear in the genre-rotation refill
- Items in `consumed` never appear in the local-sources refill (watchlist + history)
- No regression: items NOT in `consumed` still appear normally
- Cold start: works even if `this.consumed` is empty (the Set is just empty)

**Tests:** `tests/library-dedup.test.js` — all three filter points (discover, genre-rotation, local-refill).

---

#### LIB-012 — Cross-tab `BroadcastChannel`

**Files:** `js/app.js` (new `_initLibraryBroadcast()` called from `App` constructor)

**Description:** Set up a `BroadcastChannel('bookswipe-library')` so multiple
tabs stay in sync. When tab A adds/removes/updates a library item, tab B
re-fetches its library state and re-renders the affected view.

**Dependencies:** LIB-002 (the atomic helper stubs the broadcast call).

**Effort:** S

**Acceptance criteria:**
- Adding an item in tab A causes tab B's Library page to show the new item within 1 second
- Removing an item in tab A causes tab B's Library page to remove it
- The tab currently in the middle of an add-consumed modal is NOT interrupted
- Channel errors are caught and logged (silent failure if the browser doesn't support it)
- Cleanup on app unload (`window.addEventListener('beforeunload', ...)`)

**Tests:** `tests/library-broadcast.test.js` — multi-tab sync, error handling, cleanup.

---

#### LIB-013 — Library page tests (integration)

**Files:** `tests/library.test.js` (new file, comprehensive integration tests)

**Description:** End-to-end tests for the Library page covering:
- Tab switching with count updates
- Media type filter combinations
- Card rendering with badges and kebab
- Kebab menu actions (promote, update rating, remove)
- Add consumed modal flow (search → result → rating → stored)
- Empty states for all 3 variants
- Data export (JSON + CSV round-trip)
- i18n: all visible strings come from the translation keys
- Mobile layout (1-col grid, stacked tabs, bottom-sheet kebab)
- Accessibility: keyboard nav, aria-labels, focus management

**Dependencies:** LIB-003..008, LIB-009.

**Effort:** L

**Acceptance criteria:**
- All 9 sub-suites pass
- Total test count increases by ~30-50 new tests
- No existing tests regressed
- Coverage: all major user paths tested

**Tests:** This IS the test ticket.

---

#### LIB-014 — Recommender tests (unit + integration)

**Files:** `tests/recommender-consumed.test.js` (new file)

**Description:** Unit tests for the recommender's `updateFromConsumed`:
- 1-star → taste vector shifts away from item's genres
- 2-star → taste vector shifts away (slightly less)
- 3-star → taste vector unchanged
- 4-star → taste vector shifts toward item's genres (1.2x)
- 5-star → taste vector shifts toward item's genres (1.5x)
- Multiple consumed items: vectors combine correctly
- Mixed consumed + swipe signals: both contribute
- `rebuildProfile()` correctly merges consumed items

Integration tests:
- Adding a 5-star consumed item increases the like rate for similar items by >10%
- Adding a 1-star consumed item decreases the like rate for similar items by >10%

**Dependencies:** LIB-010.

**Effort:** M

**Acceptance criteria:**
- All 5 rating levels tested
- Profile rebuild tested
- Integration test shows measurable like-rate change (use synthetic data, not real user data)
- Regression test: existing recommender behavior unchanged when no consumed items

**Tests:** This IS the test ticket.

---

#### LIB-015 — Mobile layout adaptation

**Files:** `css/styles.css` (new media queries for < 480px)

**Description:** Mobile-specific styling per the wireframe:
- Card grid: 1 column below 480px (was 3-col desktop, 2-col tablet)
- Status tabs: stacked vertically below 480px
- Bottom CTA: full-width, sticky
- Kebab popover: becomes a bottom sheet (full-width, 3 buttons stacked)
- Add consumed modal: takes full screen on mobile
- Bottom nav: icons only below 480px (text labels hidden)

**Dependencies:** LIB-003, LIB-004, LIB-005, LIB-006.

**Effort:** M

**Acceptance criteria:**
- At 375px viewport: 1-col grid, stacked tabs, full-width CTA, bottom-sheet kebab
- At 768px viewport: 2-col grid, side-by-side tabs, normal popover
- At 1280px viewport: 3-col grid, full layout
- Touch targets: minimum 44x44px on all interactive elements
- No horizontal scroll on mobile

**Tests:** `tests/library-mobile.test.js` — viewport-specific layout, touch target sizes, no overflow.

---

#### LIB-016 — Bottom nav update (📝 → Library label + new count)

**Files:** `js/app.js` (modifies `_navHTML`)

**Description:** Update the existing 📝 nav tab to:
- Tooltip / aria-label: "Library" / "Bibliothek"
- Count: `watchlist.length + consumed.length` (was: just `watchlist.length`)
- Same emoji, same position (no visual relocation)
- Update the existing `renderWatchlist` method to call the new `renderLibrary` instead (or alias it)

**Dependencies:** None (touches only `_navHTML` and routing).

**Effort:** S

**Acceptance criteria:**
- Nav tab count is accurate (sum of both stores)
- Tapping the nav tab opens the Library page (not the old watchlist)
- No regression: existing users who never had a consumed item still see the same UI
- aria-label updated in both de and en

**Tests:** `tests/library-nav.test.js` — count accuracy, routing, i18n label.

---

### Suggested implementation order

**Week 1 (foundation):** LIB-001 → LIB-002 → LIB-010 → LIB-009 → LIB-016
These unblock everything else and can be parallelized across 2 devs.

**Week 2 (UI):** LIB-003 → LIB-004 → LIB-005 → LIB-006 → LIB-007 → LIB-008
Sequential because they build on each other.

**Week 2 (integration + tests, parallel with UI):** LIB-011 → LIB-012 → LIB-014

**Week 3 (polish):** LIB-013 → LIB-015
Final integration tests + mobile layout.

### Parallelization opportunities

- **LIB-001 + LIB-010 + LIB-009 + LIB-016** can be done in parallel by different devs (no shared files)
- **LIB-013 (integration tests)** can start being written as soon as LIB-003..008 are merged (even if the UI isn't fully polished)
- **LIB-015 (mobile)** is independent of all logic tickets — just CSS — and can be done by a frontend-focused dev while the rest of the team works on JS

### Effort summary

| Ticket | Effort | File(s) |
|---|---|---|
| LIB-001 | S | js/storage.js |
| LIB-002 | M | js/app.js |
| LIB-003 | L | js/app.js, css/styles.css |
| LIB-004 | M | js/app.js, css/styles.css |
| LIB-005 | M | js/app.js, css/styles.css |
| LIB-006 | L | js/app.js, css/styles.css |
| LIB-007 | S | js/app.js, css/styles.css |
| LIB-008 | M | js/app.js, css/styles.css |
| LIB-009 | S | js/i18n.js |
| LIB-010 | M | js/recommender.js |
| LIB-011 | S | js/app.js |
| LIB-012 | S | js/app.js |
| LIB-013 | L | tests/library.test.js |
| LIB-014 | M | tests/recommender-consumed.test.js |
| LIB-015 | M | css/styles.css |
| LIB-016 | S | js/app.js |

**Total: ~6 L + 8 M + 6 S = ~14 days of dev time for 1 engineer, ~7 days for 2 in parallel, ~5 days for 3 in parallel.**

---

Last updated: 2026-06-12 (v1 spec complete + wireframes + tickets)
