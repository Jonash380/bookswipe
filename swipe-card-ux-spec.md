# Swipe Card UX Overhaul — Spec

> **Status:** Draft  
> **Scope:** Polish existing + add new preview types across all four media types  
> **Visual Style:** Apple TV / tvOS — cinematic, subtle, glassmorphism, soft glows  
> **Success Criteria:** Must feel unmistakably premium (Apple-like) AND drive measurable engagement (session time, swipe depth, card opens)  

---

## 1. Background & Existing State

BookSwipe is a Tinder-style "swipe to discover" web app for Books, Movies, TV, and Games. The swipe card page already contains a sophisticated feature set:

| Feature | File | Status |
|---------|------|--------|
| SwipeEngine (touch/mouse, velocity, motion blur, afterimage ghosts, 3D tilt) | `js/swipe.js` | ✅ Implemented |
| LingerGesture (450ms hold-to-preview) | `js/ling-gesture.js` | ✅ Implemented |
| Per-media-type hold previews (book page-flip, game screenshot carousel, movie trailer) | `js/app.js` (`_setupLingerPreview`, `_buildLingerPreviewContent`) | ✅ Implemented |
| DeepDivePanel (TikTok-style bottom-zone swipe-up expansion) | `js/deep-dive.js` | ✅ Implemented |
| Hover-to-play video previews (genre cards) | `js/video-preview-manager.js` | ✅ Implemented |
| Particle bursts on swipe | `js/app.js` | ✅ Implemented |
| Haptic feedback | `js/swipe.js`, `js/ling-gesture.js` | ✅ Implemented |
| Blind date mode (blurred cover + DNA tags) | `js/app.js` | ✅ Implemented |
| Game card extras (3D tilt glare, ambient glow, platform badges, Steam tags) | `css/styles.css`, `js/app.js` | ✅ Implemented |
| Book card 3D perspective | `css/styles.css` | ✅ Implemented |
| Card stack depth, swipe stamps, swipe hints, screen flash | `css/styles.css`, `js/swipe.js` | ✅ Implemented |
| Bottom-zone expand resistance (progressive scale-down + blur before snapping) | `js/swipe.js` | ✅ Implemented |
| Keyboard shortcuts (←/→/↑/I/Z) | `js/app.js` | ✅ Implemented |

**Current UX gaps identified from codebase review:**
1. The hold preview is a single monolithic surface — it swaps content in place but never layers or composites multiple preview types.
2. The DeepDivePanel is informative but visually static — no ambient transitions, no parallax, no video hero.
3. No "peek" state between the card surface and the full deep-dive — it's either the card or the panel.
4. No preview for TV shows (reuses movie trailer logic) — no season/episode preview, no cast carousel.
5. No preview for books beyond a CSS page-flip — no audio excerpt, no reading-time preview, no mood typography.
6. No preview for games beyond screenshot carousel — no gameplay clip, no Steam review sentiment, no mechanic preview.
7. The hold preview and the swipe-up panel are disconnected — they feel like two separate features, not a continuous preview spectrum.
8. No "synthetic" fallback when content is missing — the preview either shows what exists or shows a blank placeholder.

---

## 2. Design Principles

### 2.1 Apple TV / tvOS Aesthetic
- **Cinematic**: Long, smooth transitions (0.4–0.6s). Ease-out curves (`cubic-bezier(0.16, 1, 0.3, 1)`). No jarring snaps.
- **Subtle**: Effects should feel like they belong to the object, not be applied on top. Glassmorphism with backdrop-filter, not opaque overlays.
- **Soft glows**: Radial glows that follow the touch point (not static global glows). Ambient color derived from the card's cover art.
- **Generous**: Large touch targets, generous padding, high contrast ratios, readable typography.
- **Motion as meaning**: Every animation communicates state. A blur = "you're leaving this card". A scale = "you're peeking into something".

### 2.2 Animation Philosophy
- **Push the compositor**: Use `transform`, `opacity`, `filter` (blur). Avoid `width`, `height`, `top`, `left` animations.
- **Afterimages are identity**: The card-afterimage ghost is the app's signature. It should be refined, not removed.
- **Particles for emotion**: Like = green confetti + sparkles. Nope = ash/dust. Up = golden stars. Each particle set is media-aware (books get pages, movies get film strips, games get pixels, TV get scanlines).
- **Velocity-aware**: Fast swipes get more blur, more rotation, more drama. Slow drags get gentle resistance.

### 2.3 Accessibility Stance
- **Reduced motion is a fallback, not a first-class citizen**: The main experience is designed for full motion. `prefers-reduced-motion` strips away blur, afterimages, and particles, but preserves all content and functional interactions.
- **No motion-required content**: All information available in a preview must also be accessible via tap/click (not just hold).
- **Keyboard parity**: Any new preview must be triggerable via keyboard shortcuts.

---

## 3. Interaction Model — The Preview Spectrum

The user wants a **continuous spectrum** of preview depth, not disconnected features:

```
Card Surface (0ms)
    ↓ tap "info" button or press "I"
    Quick Peek (300ms) — a non-modal overlay with the most salient 3 facts
    ↓ hold 450ms (LingerGesture)
    Rich Hold Preview (450ms) — media-specific immersive preview
    ↓ swipe up from bottom zone (>80px)
    Deep Dive Panel (expands from bottom) — full details, DNA, streaming buttons
    ↓ swipe up again inside the panel
    Full Immersive Mode (optional) — video hero, parallax, ambient audio
```

### 3.1 Gesture Mapping

| Gesture | Trigger | Action | Depth |
|---------|---------|--------|-------|
| Tap card (or `I` key) | Instant | Quick Peek overlay | 1/4 |
| Hold 450ms (no movement >8px) | ~450ms | Rich Hold Preview | 2/4 |
| Swipe up from bottom zone | ~80px drag | Deep Dive Panel | 3/4 |
| Swipe up again inside panel | ~120px drag | Full Immersive Mode | 4/4 |

> **Note**: The user is open to gesture suggestions. The above is the proposed interaction model.

### 3.2 Platform
- **Touch-first**: The web version is mainly for discovery; the full experience is mobile-native. Mouse gets hover equivalents for the Quick Peek and hover-to-play for video, but the Rich Hold Preview and Deep Dive Panel are designed for touch.
- **Desktop parity**: Quick Peek and video hover work on desktop. The Rich Hold Preview is emulated via `mouseenter` + `mousedown` hold.

---

## 4. Media-Specific Preview Specifications

### 4.1 Movies — The Cinematic Preview

**Quick Peek (tap/I):**
- A small non-modal overlay (200ms fade-in) anchored to the card center.
- Shows: Runtime, MPAA rating, and a single-line "mood hook" (e.g., "Dark, twisty, noir — 2h 14m").
- No backdrop blur — the card stays fully readable underneath.

**Rich Hold Preview (450ms hold):**
- **Hero**: The card's backdrop image scales up to 110% with a slow Ken Burns pan (8s loop, subtle).
- **Overlay**: A frosted-glass panel slides up from the bottom 30% of the card, showing:
  - Director + top 3 cast (with small circular headshots, if available from TMDB).
  - A single "mood badge" (e.g., "🌙 Late Night Thriller", "🍿 Blockbuster").
  - A 15-second trailer clip (YouTube iframe, muted, autoplay, looped) — only if TMDB has a trailer. If no trailer, show a 3-second "mood montage" (cross-fade between 3 backdrop stills, auto-generated from the movie's images).
- **Ambient**: A soft radial glow (pulsing) behind the card, color-tinted to the movie's dominant palette (extracted from the cover image or pre-computed).

**Deep Dive Panel (swipe up):**
- **Hero video**: If a trailer exists, the top 40% of the panel is a muted, looping trailer video (auto-play on panel open, unmute on tap). If no trailer, the hero is a slow Ken Burns on the backdrop.
- **Parallax**: The hero image/video scrolls at 0.5x speed while the text scrolls at 1x.
- **Cast carousel**: A horizontal scrollable row of cast cards (photo + name + character) below the overview.
- **Mood timeline**: A visual timeline showing pacing (slow → intense → slow) based on MediaDNA.
- **Where to watch**: Streaming buttons (reusing existing logic) with a "best price" highlight.

**Full Immersive Mode (swipe up inside panel):**
- Video expands to full-screen with native browser controls (or custom minimal controls).
- Background darkens to pure black.
- Cast and details fade to an overlay on tap.

**Synthetic Fallback (no trailer, no backdrop, no cast):**
- Generate a "mood poster" from the card's MediaDNA: a gradient background + large genre icon + title + a single AI-generated tagline.
- The gradient colors are derived from the genre (e.g., horror = deep red to black, comedy = warm yellow to orange).

---

### 4.2 TV Shows — The Binge Preview

**Quick Peek (tap/I):**
- Shows: Number of seasons, total episodes, average episode length, and a "bingeability" score (e.g., "📺 3 seasons — 24 episodes — 42m avg — Bingeable").

**Rich Hold Preview (450ms hold):**
- **Hero**: A slow cross-fade between 3 stills from the show (backdrops or episode stills).
- **Overlay**: Frosted-glass panel with:
  - Next episode to watch (if user has consumed some episodes — LIB-002 data).
  - "Perfect for: Binge-watching / Background viewing / Weekend marathon" based on episode length and pacing.
  - A 15-second trailer clip (or mood montage if no trailer).
- **Season picker**: A subtle horizontal strip showing season numbers; swiping it shows the season's poster.

**Deep Dive Panel (swipe up):**
- **Hero video**: Trailer or mood montage.
- **Season accordion**: Expandable seasons with episode count and average rating.
- **Cast carousel**: Same as movies.
- **Binge timeline**: A visual bar showing total watch time vs. a "movie equivalent" (e.g., "3 seasons ≈ 9 movies").
- **Where to watch**: Streaming buttons.

**Synthetic Fallback:**
- A "show mood card" — large typography with the show's title, a genre-based gradient, and a single "vibe sentence" generated from MediaDNA.

---

### 4.3 Books — The Reading Preview

**Quick Peek (tap/I):**
- Shows: Page count, estimated reading time, goodreads-style rating, and a "reading mood" (e.g., "📖 342 pages — ~4h read — Cozy").

**Rich Hold Preview (450ms hold):**
- **Hero**: A refined 3D page-flip (the existing CSS is good but needs refinement). The front page is the cover; the back page is the first 3 sentences of the book (fetched from Open Library / Google Books, or the existing `fetchFirstParagraph` in `deep-dive.js`).
- **Overlay**: Frosted-glass panel with:
  - Author photo (if available) + name + a single "author hook" (e.g., "From the author of [famous work]").
  - A "read aloud" button that plays a 30-second AI-generated text-to-speech excerpt (if TTS is available; otherwise, a highlighted text excerpt that auto-scrolls).
  - A "mood typography" effect: the title animates in with a typewriter effect, tinted to the book's genre (warm for romance, cold for sci-fi, etc.).
- **Ambient**: A subtle paper-texture noise overlay + warm amber glow (like a reading lamp).

**Deep Dive Panel (swipe up):**
- **Hero**: The cover image with a slow zoom (Ken Burns) and a "first paragraph" overlay that fades in.
- **Synopsis**: The full overview, with key sentences highlighted based on MediaDNA (e.g., highlight the "hook sentence").
- **Similar books**: A horizontal carousel of 3 similar books from the recommender.
- **Edition links**: Reusing existing `buildEditionLinks` logic.

**Synthetic Fallback:**
- A "book mood card" — a textured background (paper grain) with the title, a genre-based illustration (e.g., a small SVG spaceship for sci-fi, a rose for romance), and a 2-sentence synopsis generated from the overview.

---

### 4.4 Games — The Play Preview

**Quick Peek (tap/I):**
- Shows: Playtime (main story), Metacritic score, platforms, and a "playstyle" tag (e.g., "🎮 12h main story — 82 MC — Action RPG").

**Rich Hold Preview (450ms hold):**
- **Hero**: An auto-rotating screenshot carousel (existing) but with a **cinematic transition**: screenshots cross-fade with a subtle lens-flare flash between them.
- **Overlay**: Frosted-glass panel with:
  - A "gameplay mood" badge (e.g., "⚡ Fast-paced combat", "🧩 Puzzle-heavy", "🗺️ Open world").
  - A 15-second gameplay clip (YouTube) if available; otherwise, a 3-second GIF-like loop from the screenshot carousel (auto-generated via CSS animation).
  - Steam review sentiment: a small bar chart (Positive / Mixed / Negative) with a summary label.
  - A "mechanic grid": 3 small icons showing the top 3 game mechanics (e.g., "Crafting", "Stealth", "Co-op").
- **Ambient**: A pulsing RGB glow (derived from the game's dominant color) behind the card. The glow intensifies during the hold.

**Deep Dive Panel (swipe up):**
- **Hero**: A muted gameplay trailer or the screenshot carousel in a larger format.
- **Time investment bars**: Existing bars, but with a "completion likelihood" estimate based on the user's average playtime from consumed games (LIB-002 data).
- **Platform availability**: A clean grid of platform icons with prices (Steam, Epic, etc.).
- **Similar games**: A horizontal carousel from the recommender.
- **Steam tags**: Cloud of tags with size = weight.

**Synthetic Fallback:**
- A "game mood card" — a dark, textured background with the title, genre-based accent color, a 3-sentence synopsis, and a "mechanic badge" (e.g., "🎯 Shooter", "🧩 Puzzle").

---

## 5. The Preview Spectrum — UI Architecture

### 5.1 Quick Peek Overlay

```
.card-quick-peek {
  position: absolute;
  inset: 0;
  z-index: 15;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(12px) saturate(140%);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.card-quick-peek.active { opacity: 1; pointer-events: auto; }
```

- **Content**: 3 salient facts, 1 mood badge, 1 action button ("Hold for more" or "Swipe up for details").
- **Dismiss**: Tap outside, press Escape, or swipe any direction.
- **Duration**: Auto-dismiss after 4s if no interaction.

### 5.2 Rich Hold Preview

The existing `linger-preview` div is reused but with a **layered** architecture:

```
.linger-preview
  ├── .linger-backdrop (Ken Burns / video / carousel)
  ├── .linger-glass (frosted overlay)
  │     ├── media-specific content (cast, mood, trailer, etc.)
  ├── .linger-ambient (radial glow behind the card)
```

**Key refinements over the current implementation:**
- **Backdrop layer**: The current preview replaces the card's inner HTML. The new design overlays on top of the card, so the card surface is still visible underneath as a blurred backdrop.
- **Glass layer**: Uses `backdrop-filter: blur(20px) saturate(150%)` with a subtle gradient overlay. The glass slides up from the bottom (0% → 30% of card height) over 0.3s.
- **Ambient layer**: A radial gradient positioned behind the card, color-tinted to the media's dominant palette. The glow pulses gently (2s loop, opacity 0.15 → 0.25).

### 5.3 Deep Dive Panel Refinements

The existing `DeepDivePanel` is refined with:
- **Video hero**: The top 40% of the panel is a video player (if trailer exists) or a Ken Burns image. The video is muted and looping; tapping unmutes.
- **Parallax scrolling**: The hero scrolls at 0.5x speed, the content at 1x. The hero fades to 30% opacity as the user scrolls past it.
- **Sticky action bar**: The save/skip buttons are sticky at the bottom of the panel, but they shrink to icons-only when the user scrolls past the hero.
- **Spring physics**: The drag-to-dismiss spring is refined with a more pronounced overshoot (0.5s `cubic-bezier(0.34, 1.56, 0.64, 1)`).
- **Entrance animation**: The panel slides up with a slight scale (0.98 → 1.0) and a fade-in of the backdrop.

### 5.4 Full Immersive Mode

Optional 4th depth state. Triggered by swiping up again inside the Deep Dive Panel.
- **Video expands** to full viewport (or full panel height).
- **Background** is the video/image with a dark gradient overlay.
- **Content** appears as a translucent overlay on tap (or auto-fades in after 2s).
- **Exit**: Swipe down or press Escape.

---

## 6. Synthetic Preview Generation

When a card has no trailer, no backdrop, no cast data, no screenshots, etc., the system generates a **synthetic preview** so the user never sees an empty state.

### 6.1 Synthetic Preview Engine

```
_generateSyntheticPreview(card, mediaType) {
  // 1. Extract mood from MediaDNA
  const mood = card.mediaDNA?.mood || card.mediaDNA?.aesthetic || ['neutral'];
  const palette = this._moodToPalette(mood[0]);
  
  // 2. Generate a gradient background
  const gradient = `linear-gradient(135deg, ${palette[0]}, ${palette[1]})`;
  
  // 3. Generate a tagline
  const tagline = this._generateTagline(card, mediaType);
  
  // 4. Return a synthetic preview object
  return {
    type: 'synthetic',
    background: gradient,
    icon: this._mediaTypeIcon(mediaType),
    tagline,
    mood: mood[0],
    genre: card.genres?.[0],
  };
}
```

### 6.2 Mood-to-Color Palette Mapping

| Mood | Colors | Media |
|------|--------|-------|
| Dark / Noir | `#0a0a0f` → `#1a1a2e` | Movies, TV |
| Warm / Cozy | `#d4a574` → `#8b5a2b` | Books, TV |
| Cold / Sci-fi | `#0a84ff` → `#0066cc` | Movies, Games |
| Neon / Cyber | `#00cccc` → `#cc00cc` | Games |
| Pastel / Romance | `#ffb6c1` → `#ff69b4` | Books, TV |
| Gritty / Action | `#ff453a` → `#ff6b6b` | Movies, Games |
| Natural / Adventure | `#30d158` → `#5ac8fa` | Games, TV |

### 6.3 Tagline Generation

Taglines are generated from the card's title, genre, and a template:
- **Movies**: "A [genre] that [verb] you [emotion]." (e.g., "A thriller that keeps you guessing.")
- **TV**: "[X] seasons of [adjective] [genre]." (e.g., "3 seasons of gripping drama.")
- **Books**: "[X] pages of [adjective] [genre]." (e.g., "342 pages of haunting prose.")
- **Games**: "[X] hours of [adjective] [genre]." (e.g., "12 hours of relentless action.")

---

## 7. Animation & Effects Specification

### 7.1 Particle System Refinement

The existing particle system (`_spawnParticles`) is media-aware:

```js
const particleSets = {
  movies:  { like: ['🎬','✨','🌟','🎞️','💫'], nope: ['🍂','💨','🌑','🌫️','☁️'], super: ['⭐','🎥','🔥','🌟','✨'] },
  tv:      { like: ['📺','✨','🌟','📡','💫'], nope: ['📡','💨','🌑','🌫️','☁️'], super: ['⭐','📺','🔥','🌟','✨'] },
  books:   { like: ['📚','✨','🌟','📖','💫'], nope: ['🍂','💨','🌑','📄','☁️'], super: ['⭐','📖','🔥','🌟','✨'] },
  games:   { like: ['🎮','✨','🌟','🎯','💫'], nope: ['🍂','💨','🌑','💀','☁️'], super: ['⭐','🎮','🔥','🌟','✨'] },
};
```

**Refinement**: Add a **trail** effect — particles now leave a fading line behind them (CSS `box-shadow` trail), creating a "comet" effect.

### 7.2 Afterimage Refinement

The existing `card-afterimage` is refined:
- **Direction-aware stretch**: Right swipe = horizontal stretch (1.2x), left swipe = horizontal stretch (1.2x), up swipe = vertical stretch (1.3x).
- **Color bleed**: The afterimage picks up the card's ambient glow color, tinting the ghost.
- **Duration**: Extended from 0.55s to 0.7s for a more lingering effect.

### 7.3 Ambient Glow Refinement

For all media types, the card emits a **soft radial glow** that follows the touch point:

```css
.card-glow {
  position: absolute;
  inset: -20px;
  border-radius: calc(var(--radius) + 20px);
  background: radial-gradient(
    circle at var(--touch-x, 50%) var(--touch-y, 50%),
    rgba(var(--ambient-r), var(--ambient-g), var(--ambient-b), 0.15) 0%,
    transparent 60%
  );
  pointer-events: none;
  z-index: -1;
  transition: background 0.3s ease;
}
```

- The glow color is derived from the cover image's dominant color (or the mood palette for synthetic previews).
- The glow position tracks the touch point during the hold gesture.
- The glow intensity increases during the hold (0.15 → 0.30 over 1s).

### 7.4 Motion Blur Refinement

The existing `--swipe-blur` is refined:
- **Blur is now chromatic**: A slight RGB shift (red channel blurs more than blue) creating a subtle "analog film" feel.
- **Directional blur**: Horizontal blur for left/right swipes, vertical blur for up swipes.

```css
.card.swiping-right {
  filter: blur(var(--swipe-blur, 0px)) url('#chromatic-aberration');
}
```

*(Note: Chromatic aberration via SVG filter or CSS `text-shadow` trick for performance.)*

---

## 8. Edge Cases & Fallbacks

| Scenario | Fallback |
|----------|----------|
| No trailer for movie/TV | Mood montage (3 backdrops cross-fading) or synthetic preview |
| No screenshots for game | Synthetic preview with mechanic icons |
| No cover for book | Synthetic preview with genre-based illustration |
| No cast data for movie/TV | Omit cast carousel; show genre chips instead |
| No Open Library excerpt for book | Show the first 3 sentences from the overview |
| No Metacritic for game | Show Steam review score or omit the score |
| No backdrop image for any media | Use the cover image with a heavy gradient overlay |
| No cover image at all | Pure synthetic preview (gradient + icon + tagline) |
| Slow network (trailer not loading in 3s) | Show a loading spinner for 3s, then fallback to mood montage |
| `prefers-reduced-motion` | Strip all blur, particles, afterimages, Ken Burns, and pulsing glow. Show static content only. |
| Low-end device (detected via `navigator.hardwareConcurrency < 4`) | Reduce particle count from 8 to 3, disable afterimages, disable chromatic blur, use static glow. |
| Touch device with no hover | Hover-to-play video is disabled; hold preview is the primary path. |

---

## 9. Performance Budget

| Effect | Target FPS | Fallback |
|--------|-----------|----------|
| Card swipe + motion blur | 60fps | Reduce blur radius, skip afterimage |
| Afterimage ghost | 60fps | Skip on low-end |
| Particle burst | 45fps | Reduce count, skip on low-end |
| Ken Burns (hold preview) | 30fps | Static image on low-end |
| Video trailer (hold preview) | 30fps | Mood montage if video stutters |
| Parallax (deep dive) | 60fps | Disable parallax on low-end |
| Chromatic blur | 60fps | Standard blur on low-end |
| Ambient glow (touch-tracking) | 60fps | Static glow on low-end |

---

## 10. Testing Requirements

### 10.1 Unit Tests (new test file: `tests/swipe-card-ux.test.js`)

1. **Quick Peek**: Tap triggers overlay; Escape dismisses; auto-dismiss after 4s.
2. **Rich Hold Preview**: LingerGesture fires after 450ms; content is media-specific; movement >8px cancels.
3. **Synthetic Preview**: Missing content triggers synthetic generation; palette is mood-mapped.
4. **Ambient Glow**: Glow position tracks touch point; glow intensity increases over time.
5. **Edge Cases**: `prefers-reduced-motion` strips animations; low-end device strips heavy effects.
6. **Deep Dive Panel**: Swipe up opens panel; drag-to-dismiss works; video hero auto-plays.
7. **Media Type Coverage**: All 4 media types have distinct preview content.

### 10.2 E2E Tests (Playwright)

1. **Swipe card → hold → preview → release → card returns**.
2. **Swipe card → swipe up → deep dive → drag down → dismiss**.
3. **Quick Peek → tap → overlay appears → tap outside → dismiss**.
4. **Reduced motion**: All animations are static, but content is accessible.

---

## 11. Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Average session time | — | +25% |
| Cards per session | — | +20% |
| Card open rate (tap/I or swipe up) | — | +30% |
| Hold preview trigger rate | — | +15% |
| Time-to-first-swipe (onboarding → discovery) | — | -10% |
| Subjective "premium feel" score (user survey) | — | 4.5/5 |

---

## 12. Resolved Design Decisions

### 12.1 Audio Excerpts for Books — TTS Strategy

**Decision:** Use the **Web Speech API** as the primary TTS engine, with a **highlighted text-scroll animation** as the universal fallback.

**Rationale:**
- The BookSwipe app is a free-tier web app with no paid backend. Web Speech API is native, requires no API key, and has zero marginal cost.
- The app already extracts the first paragraph via `fetchFirstParagraph()` in `deep-dive.js`. The TTS engine will read this excerpt aloud.
- The fallback (text-scroll) is a visually rich alternative: key sentences highlight in sequence with a typewriter effect, so users who disable audio or are on a browser without TTS support still get a "reading preview" feel.
- A future premium tier could add a cloud TTS (e.g., Google Cloud Text-to-Speech) for higher-quality voices, but the spec is scoped to the free tier.

**Implementation Details:**
- **Source text**: First 3 sentences from `fetchFirstParagraph()` (or the existing `overview` if the API call fails).
- **Voice selection**: Prefer `speechSynthesis.getVoices().find(v => v.lang === 'de-DE' || v.lang === 'en-US')` matching the user's `bs-lang` preference.
- **Rate**: `rate = 0.9` (slightly slower than default for a "cinematic" listening feel).
- **Pitch**: `pitch = 1.0` (neutral).
- **UI**: A floating "🔊 Listen" button appears in the Rich Hold Preview. Tapping it starts TTS. Tapping again pauses. The button shows a pulsing equalizer animation during playback.
- **Fallback**: If `window.speechSynthesis` is unavailable or no voices are loaded, the button is replaced with a "📖 Read" button that triggers the text-scroll animation.

### 12.2 Gameplay Clips for Games — Sourcing Strategy

**Decision:** **Primary source is IGDB's `videos` field** (which contains official YouTube trailers and gameplay clips). **Fallback is a synthetic gameplay montage** built from the existing screenshot carousel.

**Rationale:**
- The app already uses the IGDB API (`js/games_api.js`) to fetch game data. IGDB's `videos` array contains `video_id` values that are YouTube IDs. These are official publisher videos, so there is no scraping risk or legal concern.
- The existing `VideoPreviewManager` (`js/video-preview-manager.js`) already handles YouTube embeds and lazy-loading. The gameplay clip can reuse the same iframe infrastructure.
- For games with no IGDB videos, a synthetic montage is created: the existing screenshot carousel is cross-faded with a lens-flare transition, and a " gameplay mood" badge is overlaid. This is purely client-side and requires no additional API calls.
- No manual YouTube scraping is needed. The IGDB API is the single source of truth.

**Implementation Details:**
- **Primary path**: `game.videos?.find(v => v.name.toLowerCase().includes('gameplay'))` or the first video if no gameplay-specific video exists.
- **YouTube embed**: Reuse `VideoPreviewManager._createYouTubePlayer()` with `autoplay=1`, `mute=1`, `loop=1`, `controls=0`, `modestbranding=1`.
- **Fallback path**: If `!game.videos || game.videos.length === 0`, the Rich Hold Preview shows the existing screenshot carousel with a **cinematic cross-fade** (CSS `@keyframes` with `opacity` transitions and a `box-shadow` lens-flare flash between slides). A small "Gameplay Montage" label is added to set expectations.
- **Performance**: Gameplay clips are lazy-loaded (only fetched when the Rich Hold Preview is triggered). The `VideoPreviewManager` already does this.

### 12.3 Cast Headshots for Movies/TV — Caching Strategy

**Decision:** **Fetch cast headshots from TMDB on demand, cache them in IndexedDB with a 100-image LRU cache per media type, and show a initials-based placeholder on cache miss or offline.**

**Rationale:**
- The app already uses TMDB (`js/tmdb.js`) and has an IndexedDB cache layer (`js/storage.js` with `addToCache`, `getFromCache`). Reusing the existing cache infrastructure is the minimal-change approach.
- TMDB's `credits` endpoint returns `cast` with `profile_path`. The `w92` (92px width) image size is sufficient for a carousel headshot and is only ~3–5KB per image.
- A 100-image LRU cache per media type (movies + TV = 200 images total) is ~1–2MB of storage. This is well within IndexedDB's typical 50MB quota and is reasonable for a PWA.
- The `App` class already has `_genreMap` and `_mediaTypeOf` helpers. The cache key will be `cast-${personId}` with a 7-day TTL.
- If the image is not cached and the user is offline, a CSS-generated placeholder with the actor's initials (e.g., "TC" for Tom Cruise) is shown, using the movie's ambient color as the background.

**Implementation Details:**
- **Cache layer**: Extend `js/storage.js` with `addCastImage(id, blob)` and `getCastImage(id)` using the existing `bs-cache` IndexedDB (or a new `cast-images` object store if preferred).
- **Image size**: `w92` for carousel thumbnails. `w185` for the "lead actor" spotlight in the Deep Dive Panel.
- **TTL**: 7 days. After 7 days, the image is re-fetched from TMDB. This balances freshness with bandwidth.
- **Placeholder**: `div.cast-placeholder` with `display: flex; align-items: center; justify-content: center; background: var(--ambient-color); color: #fff; font-weight: 700; font-size: 0.85rem; border-radius: 50%;`. The initials are generated from `person.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()`.
- **Loading**: Images are fetched lazily when the Deep Dive Panel opens (or when the Rich Hold Preview is triggered). A skeleton shimmer (`animation: shimmer 1.5s infinite`) is shown while loading.
- **Offline**: If `navigator.onLine === false`, skip the fetch and show the placeholder immediately.

### 12.4 Full Immersive Mode

**Decision:** **Deferred to Phase 4 (post-MVP).** The Quick Peek, Rich Hold Preview, and Deep Dive Panel are the three core depths. Full Immersive Mode is a natural extension but adds significant complexity (full-screen video, custom controls, background audio). It will be added only after the core preview spectrum is validated with users.

### 12.5 Color Extraction from Images

**Decision:** **Use a lightweight canvas-based dominant-color extractor on the client.** The extraction runs once per card when the cover image is loaded, and the result is cached in the card's in-memory state.

**Rationale:**
- Pre-computing colors on the server would require a backend change (the current Python backend is minimal). The client-side approach is self-contained.
- A canvas-based extractor (drawing the image to a small off-screen canvas, sampling the center pixels, and averaging the RGB values) is fast enough for images that are already loaded in the DOM.
- The extracted color is used only for the ambient glow and the synthetic preview gradient. It is not a critical-path feature — if extraction fails, the mood palette (§6.2) is used as a fallback.

**Implementation Details:**
- **Extraction function**: `extractDominantColor(imageElement)` returns `{r, g, b}`.
- **Sampling**: Draw the image to a 50×50 canvas, sample the center 10×10 pixels, and average the RGB values.
- **Saturation boost**: Multiply the saturation by 1.3 to make the glow more vibrant.
- **Cache**: Store the extracted color on the card object (`card._ambientColor`) so it is never recomputed.
- **Fallback**: If the image is not yet loaded or CORS prevents canvas access, use the mood palette from §6.2.


---

## 13. Implementation Phases (Suggested)

### Phase 1 — Foundation (MVP)
- Refactor `LingerGesture` preview into the layered architecture (backdrop + glass + ambient).
- Add synthetic preview generation for all 4 media types.
- Add Quick Peek overlay (tap / `I` key).
- Add ambient glow (touch-tracking) to all cards.
- Refine afterimages (direction-aware stretch, color bleed).
- Add `prefers-reduced-motion` and low-end device fallbacks.

### Phase 2 — Content
- Add cast carousel to movie/TV deep dive.
- Add season picker to TV deep dive.
- Add "read aloud" / highlighted excerpt to book deep dive.
- Add gameplay clip / mechanic grid to game deep dive.
- Add mood montage (cross-fade stills) as a trailer fallback.

### Phase 3 — Polish
- Add chromatic blur to swipe effects.
- Add parallax scrolling to deep dive panel.
- Add video hero to deep dive panel.
- Add full immersive mode (optional).
- Add media-aware particle sets.

### Phase 4 — Measurement
- Instrument all preview events (quick peek, hold preview, deep dive, immersive mode).
- Add A/B test variants (e.g., hold preview with vs. without video).
- Run user surveys for subjective "premium feel".

---

*End of spec.*
