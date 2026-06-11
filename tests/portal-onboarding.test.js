import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

// Set up minimal DOM
const window = new Window({
  url: 'http://localhost',
});
global.window = window;
global.document = window.document;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

Object.defineProperty(global, 'navigator', {
  value: { vibrate: () => {} },
  writable: true,
  configurable: true,
});

// Mock localStorage
const storageMock = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
  };
})();
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});
Object.defineProperty(dom.window, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});

const { getUIState, setUIState } = await import('../js/storage.js');

// Read app.js source once for all source-parsing tests
const fs = await import('node:fs');
const nodePath = await import('node:path');
const appSrc = fs.readFileSync(nodePath.resolve('js/app.js'), 'utf-8');

// We can't easily import the LANG constant from app.js (it's not exported),
// so we replicate the expected keys to verify completeness.
const PORTAL_KEYS = [
  'portalBooks', 'portalMovies', 'portalTV', 'portalGames',
  'ctaBooks', 'ctaMovies', 'ctaTV', 'ctaGames',
  'portalSubtitle', 'vibeTitle',
  'vibePacingSlow', 'vibePacingFast',
  'vibeToneDark', 'vibeToneLight',
  'vibeComplexPopcorn', 'vibeComplexDeep',
];

// ===== Vibe Matrix State Persistence =====

describe('Vibe Matrix — State Persistence', () => {
  beforeEach(() => { storageMock.clear(); });

  it('should round-trip vibe values through setUIState/getUIState', () => {
    const state = {
      selectedGenres: [], selectedMoods: [], mediaType: 'movies',
      hasCompletedOnboarding: false, hasCompletedQuiz: false,
      watchMode: 'solo', onboardingStep: 0,
      vibePacing: 72, vibeTone: 30, vibeComplex: 88,
    };
    setUIState('en', state);
    const { lang, state: loaded } = getUIState();
    assert.equal(lang, 'en');
    assert.equal(loaded.vibePacing, 72);
    assert.equal(loaded.vibeTone, 30);
    assert.equal(loaded.vibeComplex, 88);
  });

  it('should preserve vibe values across multiple save/load cycles', () => {
    const state1 = { vibePacing: 50, vibeTone: 50, vibeComplex: 50 };
    setUIState('de', state1);
    const { state: loaded1 } = getUIState();
    assert.equal(loaded1.vibePacing, 50);

    // Simulate user adjusting sliders
    const state2 = { ...loaded1, vibePacing: 10, vibeTone: 90, vibeComplex: 45 };
    setUIState('de', state2);
    const { state: loaded2 } = getUIState();
    assert.equal(loaded2.vibePacing, 10);
    assert.equal(loaded2.vibeTone, 90);
    assert.equal(loaded2.vibeComplex, 45);
  });

  it('should persist vibe boundary values (0 and 100)', () => {
    const state = { vibePacing: 0, vibeTone: 100, vibeComplex: 0 };
    setUIState('en', state);
    const { state: loaded } = getUIState();
    assert.equal(loaded.vibePacing, 0);
    assert.equal(loaded.vibeTone, 100);
    assert.equal(loaded.vibeComplex, 0);
  });

  it('should persist vibe values alongside other state fields', () => {
    const state = {
      selectedGenres: [28, 12],
      selectedMoods: ['dark'],
      mediaType: 'tv',
      watchMode: 'dateNight',
      onboardingStep: 1,
      vibePacing: 65,
      vibeTone: 35,
      vibeComplex: 80,
      wildcardFrequency: 75,
    };
    setUIState('en', state);
    const { state: loaded } = getUIState();
    assert.deepEqual(loaded.selectedGenres, [28, 12]);
    assert.deepEqual(loaded.selectedMoods, ['dark']);
    assert.equal(loaded.mediaType, 'tv');
    assert.equal(loaded.watchMode, 'dateNight');
    assert.equal(loaded.onboardingStep, 1);
    assert.equal(loaded.vibePacing, 65);
    assert.equal(loaded.vibeTone, 35);
    assert.equal(loaded.vibeComplex, 80);
    assert.equal(loaded.wildcardFrequency, 75);
  });

  it('should handle vibe values with decimal precision', () => {
    const state = { vibePacing: 33.33, vibeTone: 66.67, vibeComplex: 50.5 };
    setUIState('de', state);
    const { state: loaded } = getUIState();
    assert.equal(loaded.vibePacing, 33.33);
    assert.equal(loaded.vibeTone, 66.67);
    assert.equal(loaded.vibeComplex, 50.5);
  });
});

// ===== Onboarding Step Flow =====

describe('Onboarding — Step Flow Logic', () => {
  beforeEach(() => { storageMock.clear(); });

  it('should persist onboardingStep through save/load', () => {
    for (let step = 0; step <= 5; step++) {
      setUIState('de', { onboardingStep: step });
      const { state: loaded } = getUIState();
      assert.equal(loaded.onboardingStep, step, `Step ${step} should persist`);
    }
  });

  it('should persist hasCompletedOnboarding flag', () => {
    setUIState('de', { hasCompletedOnboarding: true, onboardingStep: 5 });
    const { state: loaded } = getUIState();
    assert.equal(loaded.hasCompletedOnboarding, true);
    assert.equal(loaded.onboardingStep, 5);
  });

  it('should persist watchMode alongside onboarding progress', () => {
    setUIState('de', {
      onboardingStep: 2,
      watchMode: 'family',
      mediaType: 'movies',
    });
    const { state: loaded } = getUIState();
    assert.equal(loaded.onboardingStep, 2);
    assert.equal(loaded.watchMode, 'family');
    assert.equal(loaded.mediaType, 'movies');
  });

  it('should persist mediaType selection from portal carousel', () => {
    const types = ['books', 'movies', 'tv', 'games'];
    for (const type of types) {
      setUIState('de', { mediaType: type, onboardingStep: 0 });
      const { state: loaded } = getUIState();
      assert.equal(loaded.mediaType, type, `mediaType "${type}" should persist`);
    }
  });

  it('should persist platform selections for games path', () => {
    setUIState('de', {
      mediaType: 'games',
      onboardingStep: 3,
      selectedPlatforms: [6, 48, 130],
    });
    const { state: loaded } = getUIState();
    assert.equal(loaded.mediaType, 'games');
    assert.deepEqual(loaded.selectedPlatforms, [6, 48, 130]);
  });

  it('should handle the full games onboarding flow (5 steps)', () => {
    // Step 0: Portal (mediaType selection)
    setUIState('de', { onboardingStep: 0, mediaType: 'games' });
    let { state } = getUIState();
    assert.equal(state.onboardingStep, 0);
    assert.equal(state.mediaType, 'games');

    // Step 1: Vibe matrix
    setUIState('de', { ...state, onboardingStep: 1, vibePacing: 70, vibeTone: 30, vibeComplex: 80 });
    ({ state } = getUIState());
    assert.equal(state.onboardingStep, 1);
    assert.equal(state.vibePacing, 70);

    // Step 2: Who watching
    setUIState('de', { ...state, onboardingStep: 2, watchMode: 'solo' });
    ({ state } = getUIState());
    assert.equal(state.onboardingStep, 2);

    // Step 3: Platforms (games only)
    setUIState('de', { ...state, onboardingStep: 3, selectedPlatforms: [6] });
    ({ state } = getUIState());
    assert.equal(state.onboardingStep, 3);
    assert.deepEqual(state.selectedPlatforms, [6]);

    // Step 4: Rapid fire
    setUIState('de', { ...state, onboardingStep: 4 });
    ({ state } = getUIState());
    assert.equal(state.onboardingStep, 4);

    // Complete
    setUIState('de', { ...state, hasCompletedOnboarding: true, onboardingStep: 5 });
    ({ state } = getUIState());
    assert.equal(state.hasCompletedOnboarding, true);
    assert.equal(state.onboardingStep, 5);
  });

  it('should handle the non-games onboarding flow (4 steps)', () => {
    // Step 0: Portal
    setUIState('en', { onboardingStep: 0, mediaType: 'movies' });
    let { state } = getUIState();
    assert.equal(state.onboardingStep, 0);

    // Step 1: Vibe matrix
    setUIState('en', { ...state, onboardingStep: 1, vibePacing: 50, vibeTone: 50, vibeComplex: 50 });
    ({ state } = getUIState());
    assert.equal(state.onboardingStep, 1);

    // Step 2: Who watching
    setUIState('en', { ...state, onboardingStep: 2, watchMode: 'dateNight' });
    ({ state } = getUIState());
    assert.equal(state.onboardingStep, 2);

    // Step 3: Rapid fire (non-games path skips platform screen)
    setUIState('en', { ...state, onboardingStep: 3 });
    ({ state } = getUIState());
    assert.equal(state.onboardingStep, 3);

    // Complete
    setUIState('en', { ...state, hasCompletedOnboarding: true, onboardingStep: 5 });
    ({ state } = getUIState());
    assert.equal(state.hasCompletedOnboarding, true);
  });
});

// ===== LANG Key Completeness =====

describe('LANG Keys — Portal & Vibe Matrix', () => {
  // Extract LANG object from app.js source using regex + Function constructor
  // NOTE: Assumes LANG is the first multi-line const ending with `};` in app.js
  const langMatch = appSrc.match(/const LANG\s*=\s*(\{[\s\S]*?\n\};)/);
  if (!langMatch) throw new Error('Could not extract LANG from app.js');
  const LANG = new Function(`return ${langMatch[1]}`)();

  it('should have all portal keys in DE', () => {
    for (const key of PORTAL_KEYS) {
      assert.ok(
        LANG.de[key] !== undefined,
        `Missing DE key: "${key}"`
      );
      assert.ok(
        typeof LANG.de[key] === 'string' && LANG.de[key].length > 0,
        `DE key "${key}" should be a non-empty string`
      );
    }
  });

  it('should have all portal keys in EN', () => {
    for (const key of PORTAL_KEYS) {
      assert.ok(
        LANG.en[key] !== undefined,
        `Missing EN key: "${key}"`
      );
      assert.ok(
        typeof LANG.en[key] === 'string' && LANG.en[key].length > 0,
        `EN key "${key}" should be a non-empty string`
      );
    }
  });

  it('should have identical key sets in DE and EN', () => {
    const deKeys = Object.keys(LANG.de).sort();
    const enKeys = Object.keys(LANG.en).sort();
    assert.deepEqual(deKeys, enKeys, 'DE and EN should have the same keys');
  });

  it('should have all portal-specific keys (no DE/EN drift)', () => {
    for (const key of PORTAL_KEYS) {
      assert.ok(key in LANG.de, `DE missing portal key: ${key}`);
      assert.ok(key in LANG.en, `EN missing portal key: ${key}`);
    }
  });

  it('should have distinct DE and EN translations for portal keys', () => {
    assert.notEqual(LANG.de.portalSubtitle, LANG.en.portalSubtitle);
    assert.notEqual(LANG.de.vibeTitle, LANG.en.vibeTitle);
    assert.notEqual(LANG.de.vibePacingSlow, LANG.en.vibePacingSlow);
  });
});

// ===== Default State Values =====

describe('Default State — Portal & Vibe', () => {
  it('should default vibePacing to 50', () => {
    assert.ok(appSrc.includes('vibePacing: 50'), 'vibePacing should default to 50');
  });

  it('should default vibeTone to 50', () => {
    assert.ok(appSrc.includes('vibeTone: 50'), 'vibeTone should default to 50');
  });

  it('should default vibeComplex to 50', () => {
    assert.ok(appSrc.includes('vibeComplex: 50'), 'vibeComplex should default to 50');
  });

  it('should default onboardingStep to 0', () => {
    assert.ok(appSrc.includes('onboardingStep: 0'), 'onboardingStep should default to 0');
  });

  it('should default hasCompletedOnboarding to false', () => {
    assert.ok(appSrc.includes('hasCompletedOnboarding: false'), 'hasCompletedOnboarding should default to false');
  });

  it('should default mediaType to movies', () => {
    assert.ok(appSrc.includes("mediaType: 'movies'"), "mediaType should default to 'movies'");
  });
});

// ===== Onboarding Step Routing =====

describe('Onboarding — Step Routing Logic', () => {
  it('should route step 0 to _renderWelcomeScreen (portal)', () => {
    assert.ok(
      appSrc.includes("if (step === 0) return this._renderWelcomeScreen(app)"),
      'Step 0 should route to portal welcome screen'
    );
  });

  it('should route step 1 to _renderVibeMatrixScreen', () => {
    assert.ok(
      appSrc.includes("if (step === 1) return this._renderVibeMatrixScreen(app)"),
      'Step 1 should route to vibe matrix'
    );
  });

  it('should route step 2 to _renderWhoWatchingScreen', () => {
    assert.ok(
      appSrc.includes("if (step === 2) return this._renderWhoWatchingScreen(app)"),
      'Step 2 should route to who-watching'
    );
  });

  it('should route step 3 to platform screen for games', () => {
    assert.ok(
      appSrc.includes("if (step === 3 && this.state.mediaType === 'games') return this._renderPlatformScreen(app)"),
      'Step 3 should route to platform screen for games'
    );
  });

  it('should route step 3 to rapid-fire for non-games', () => {
    assert.ok(
      appSrc.includes("if (step === 3 && this.state.mediaType !== 'games') return this._renderRapidFireScreen(app)"),
      'Step 3 should route to rapid-fire for non-games'
    );
  });

  it('should route step 4 to rapid-fire for games', () => {
    assert.ok(
      appSrc.includes("if (step === 4 && this.state.mediaType === 'games') return this._renderRapidFireScreen(app)"),
      'Step 4 should route to rapid-fire for games'
    );
  });

  it('should advance from portal (step 0) to vibe matrix (step 1)', () => {
    assert.ok(
      appSrc.includes('this.state.onboardingStep = 1; // vibe matrix'),
      'Portal should advance to step 1 (vibe matrix)'
    );
  });

  it('should advance from vibe matrix (step 1) to who-watching (step 2)', () => {
    assert.ok(
      appSrc.includes('this.state.onboardingStep = 2;') &&
      appSrc.includes("this._renderVibeMatrixScreen"),
      'Vibe matrix should advance to step 2'
    );
  });

  it('should advance from who-watching (step 2) to step 3', () => {
    assert.ok(
      appSrc.includes('this.state.onboardingStep = 3;'),
      'Who-watching should advance to step 3'
    );
  });

  it('should advance from platform screen (step 3) to rapid-fire (step 4)', () => {
    assert.ok(
      appSrc.includes('this.state.onboardingStep = 4;'),
      'Platform screen should advance to step 4'
    );
  });

  it('should set hasCompletedOnboarding when rapid-fire completes', () => {
    assert.ok(
      appSrc.includes('this.state.hasCompletedOnboarding = true;'),
      'Rapid-fire completion should set hasCompletedOnboarding to true'
    );
  });
});

// ===== Vibe Slider Interaction Logic =====

describe('Vibe Matrix — Slider Mechanics', () => {
  it('should store raw values (clamping is done by slider UI, not storage)', () => {
    // Storage preserves whatever is passed — the slider JS clamps via Math.max(0, Math.min(100, pct))
    const state = { vibePacing: 0, vibeTone: 100, vibeComplex: 50 };
    setUIState('de', state);
    const { state: loaded } = getUIState();
    assert.equal(loaded.vibePacing, 0);
    assert.equal(loaded.vibeTone, 100);
    assert.equal(loaded.vibeComplex, 50);
  });

  it('should persist all three vibe axes independently', () => {
    setUIState('en', { vibePacing: 10, vibeTone: 90, vibeComplex: 50 });
    const { state } = getUIState();
    assert.equal(state.vibePacing, 10);
    assert.equal(state.vibeTone, 90);
    assert.equal(state.vibeComplex, 50);

    // Change only one axis
    setUIState('en', { vibePacing: 10, vibeTone: 25, vibeComplex: 50 });
    const { state: state2 } = getUIState();
    assert.equal(state2.vibePacing, 10, 'pacing should be unchanged');
    assert.equal(state2.vibeTone, 25, 'tone should be updated');
    assert.equal(state2.vibeComplex, 50, 'complex should be unchanged');
  });
});

// ===== Portal Particle Aesthetics =====

describe('Portal — Aesthetic Mapping', () => {
  it('should define particle spawners for all 4 media types', () => {
    assert.ok(appSrc.includes("books: spawnDustMotes"), 'Books should use dust motes');
    assert.ok(appSrc.includes("movies: spawnGrain"), 'Movies should use film grain');
    assert.ok(appSrc.includes("tv: spawnScanlines"), 'TV should use scanlines');
    assert.ok(appSrc.includes("games: spawnPixels"), 'Games should use pixels');
  });

  it('should define particle CSS classes for all 4 media types', () => {
    assert.ok(appSrc.includes("books: 'portal-dust'"), 'Books particle class');
    assert.ok(appSrc.includes("movies: 'portal-grain'"), 'Movies particle class');
    assert.ok(appSrc.includes("tv: 'portal-scanlines'"), 'TV particle class');
    assert.ok(appSrc.includes("games: 'portal-pixels'"), 'Games particle class');
  });

  it('should define 4 portal card types', () => {
    assert.ok(appSrc.includes("key: 'books'"), 'Portal has books card');
    assert.ok(appSrc.includes("key: 'movies'"), 'Portal has movies card');
    assert.ok(appSrc.includes("key: 'tv'"), 'Portal has TV card');
    assert.ok(appSrc.includes("key: 'games'"), 'Portal has games card');
  });
});
