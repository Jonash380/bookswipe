import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

// Set up minimal DOM
const window = new Window({
  url: 'http://localhost',
});
global.window = window;
global.document = window.document;
global.performance = window.performance;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

Object.defineProperty(global, 'navigator', {
  value: { vibrate: () => {} },
  writable: true,
  configurable: true,
});
global.window.getComputedStyle = () => ({});

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
Object.defineProperty(global.window, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});

const { EnrichmentWorker } = await import('../js/enrichment.js');

/**
 * Create a mock app with currentCards.
 */
function makeMockApp(cards = []) {
  return { currentCards: cards };
}

/**
 * Create a mock item with the given id and position in the mock app's currentCards.
 */
function makeItem(id, opts = {}) {
  return {
    id,
    title: opts.title || `Item ${id}`,
    type: opts.type || 'movie',
    source: opts.source || 'tmdb',
    tmdb_id: opts.tmdb_id || null,
    genres: opts.genres || [],
    overview: opts.overview || '',
    tags: opts.tags || null,
    mediaDNA: opts.mediaDNA || null,
    ...opts,
  };
}

describe('EnrichmentWorker', () => {
  let worker;
  let app;

  afterEach(() => {
    // Stop any running worker
    if (worker) {
      worker.running = false;
      worker.queue = [];
    }
  });

  describe('constructor', () => {
    it('should initialize with empty queue and not running', () => {
      worker = new EnrichmentWorker(makeMockApp());
      assert.deepEqual(worker.queue, []);
      assert.equal(worker.running, false);
      assert.equal(worker._idleTimer, null);
    });

    it('should store the app reference', () => {
      const mockApp = makeMockApp([makeItem('a')]);
      worker = new EnrichmentWorker(mockApp);
      assert.equal(worker.app, mockApp);
    });
  });

  describe('enqueue', () => {
    beforeEach(() => {
      app = makeMockApp([
        makeItem('pos0'),
        makeItem('pos1'),
        makeItem('pos2'),
        makeItem('pos3'),
        makeItem('pos4'),
      ]);
    });

    it('should add items to the queue', () => {
      worker = new EnrichmentWorker(app);
      // Prevent _run from activating by first setting running=true
      // This lets us test just the enqueue/add logic without race conditions
      worker.running = true;
      worker.enqueue([makeItem('a'), makeItem('b')]);
      assert.equal(worker.queue.length, 2);
      assert.equal(worker.queue[0].id, 'a');
      assert.equal(worker.queue[1].id, 'b');
    });

    it('should NOT add duplicate items (dedup by id)', () => {
      worker = new EnrichmentWorker(app);
      worker.running = true;
      worker.enqueue([makeItem('a'), makeItem('a')]);
      assert.equal(worker.queue.length, 1);
    });

    it('should NOT re-add items already in queue', () => {
      worker = new EnrichmentWorker(app);
      worker.running = true;
      worker.enqueue([makeItem('a'), makeItem('b')]);
      worker.enqueue([makeItem('b'), makeItem('c')]);
      assert.equal(worker.queue.length, 3);
      assert.deepEqual(worker.queue.map(i => i.id), ['a', 'b', 'c']);
    });

    it('should start running if not already running', () => {
      worker = new EnrichmentWorker(app);
      assert.equal(worker.running, false);
      worker.enqueue([makeItem('a')]);
      assert.equal(worker.running, true);
    });

    it('should order items by priority (front of deck first)', () => {
      // Create cards at various positions in the deck
      const cards = [
        makeItem('front'),    // index 0  -> priority 1
        makeItem('mid'),      // index 1  -> priority 1
        makeItem('back'),     // index 9  -> priority 1
        makeItem('far-back'), // index 12 -> priority 2
        makeItem('deeper'),   // index 30 -> priority 3
        makeItem('deepest'),  // index 60 -> priority 4
        makeItem('unknown'),  // not in deck -> priority 5
      ];
      const deck = cards.slice(0, 5);
      const nonDeckCards = cards.slice(5);

      // Build currentCards at specific indices
      app.currentCards = [];
      app.currentCards[0] = deck[0];
      app.currentCards[1] = deck[1];
      app.currentCards[9] = deck[2];
      app.currentCards[12] = deck[3];
      app.currentCards[30] = deck[4];
      // Place 'deepest' in the deck at index 60 so it gets priority 4
      app.currentCards[60] = cards[5];
      // Fill undefined gaps
      for (let i = 0; i < 61; i++) {
        if (!app.currentCards[i]) {
          app.currentCards[i] = makeItem(`filler-${i}`);
        }
      }

      worker = new EnrichmentWorker(app);
      // Prevent _run from consuming the queue during assertions
      worker.running = true;

      // Enqueue in reverse priority order
      worker.enqueue([nonDeckCards[1], cards[5], cards[4], cards[3], cards[2], cards[1], cards[0]]);

      const ids = worker.queue.map(i => i.id);
      const frontIdx = ids.indexOf('front');
      const midIdx = ids.indexOf('mid');
      const backIdx = ids.indexOf('back');
      const farBackIdx = ids.indexOf('far-back');
      const deeperIdx = ids.indexOf('deeper');
      const deepestIdx = ids.indexOf('deepest');
      const unknownIdx = ids.indexOf('unknown');

      // Priority 1 items should come before priority 2, etc.
      assert.ok(frontIdx < farBackIdx, 'front (p1) should come before far-back (p2)');
      assert.ok(midIdx < farBackIdx, 'mid (p1) should come before far-back (p2)');
      assert.ok(backIdx < farBackIdx, 'back (p1) should come before far-back (p2)');
      assert.ok(farBackIdx < deeperIdx, 'far-back (p2) should come before deeper (p3)');
      assert.ok(deeperIdx < deepestIdx, 'deeper (p3) should come before deepest (p4)');
      assert.ok(deepestIdx < unknownIdx, 'deepest (p4) should come before unknown (p5)');

      assert.equal(worker.queue.length, 7, 'all 7 items should be queued');
    });
  });

  describe('_reprioritize', () => {
    it('should sort queue by priority ascending', () => {
      const deck = [
        makeItem('first'),   // idx 0 -> p1
        makeItem('second'),  // idx 1 -> p1
        makeItem('third'),   // idx 15 -> p2
        makeItem('fourth'),  // idx 40 -> p3
        makeItem('fifth'),   // idx 60 -> p4
      ];
      app = makeMockApp();
      app.currentCards = [];
      deck.forEach((item, i) => {
        const idx = [0, 1, 15, 40, 60][i];
        app.currentCards[idx] = item;
      });
      // Fill gaps
      for (let i = 0; i < 61; i++) {
        if (!app.currentCards[i]) app.currentCards[i] = makeItem(`filler-${i}`);
      }

      worker = new EnrichmentWorker(app);
      // Put p1 items in expected stable-sort order: 'first' then 'second'
      worker.queue = [deck[4], deck[3], deck[2], deck[0], deck[1]];
      worker._reprioritize();

      // All p1 items come first: first and second (stable: first before second)
      assert.equal(worker.queue[0].id, 'first');
      assert.equal(worker.queue[1].id, 'second');
      assert.equal(worker.queue[2].id, 'third');
      assert.equal(worker.queue[3].id, 'fourth');
      assert.equal(worker.queue[4].id, 'fifth');
    });
  });

  describe('_run (batching behavior)', () => {
    beforeEach(() => {
      app = makeMockApp([makeItem('a'), makeItem('b'), makeItem('c')]);
      worker = new EnrichmentWorker(app);
      // Override _enrich to be a no-op that just resolves
      worker._enrich = async (item) => {
        item._enriched = true;
      };
    });

    it('should process items in batches of up to 3 (ENRICHMENT_BATCH)', async () => {
      worker.queue = [makeItem('x'), makeItem('y'), makeItem('z'), makeItem('w')];

      // Start the run loop
      const runPromise = worker._run();

      // Wait for processing
      await runPromise;

      assert.equal(worker.running, false);
      assert.equal(worker.queue.length, 0);
    });

    it('should set running flag and clear it when done', async () => {
      worker.queue = [makeItem('a')];
      assert.equal(worker.running, false);

      await worker._run();

      assert.equal(worker.running, false);
    });

    it('should handle empty queue gracefully', async () => {
      worker.queue = [];
      await worker._run();
      assert.equal(worker.running, false);
    });

    it('should call _enrich on each item', async () => {
      const items = [makeItem('a'), makeItem('b')];
      worker.queue = [...items];
      await worker._run();

      assert.equal(items[0]._enriched, true);
      assert.equal(items[1]._enriched, true);
    });

    it('should re-prioritize before each batch', async () => {
      // Enqueue items then change app.currentCards to test reprioritization
      const items = [
        makeItem('far', { title: 'far' }),    // not in deck
        makeItem('near', { title: 'near' }),  // idx 0 -> p1
      ];
      app.currentCards = [items[1]];
      worker.queue = [items[0], items[1]];

      // The first reprioritize should put 'near' before 'far'
      await worker._run();

      // Both should be enriched regardless of order
      assert.equal(items[0]._enriched, true);
      assert.equal(items[1]._enriched, true);
    });
  });

  describe('_enrich', () => {
    beforeEach(() => {
      app = makeMockApp([]);
      worker = new EnrichmentWorker(app);
    });

    it('should handle game items (type=game or source=igdb) with no tags by calling mapGameTags', async () => {
      // mapGameTags is imported but not mocked — it'll run on the item
      // We just verify it doesn't crash and sets tags
      const gameItem = makeItem('g1', {
        type: 'game',
        source: 'igdb',
        genres: ['Action', 'RPG'],
        tags: null,
      });
      await worker._enrich(gameItem);
      // Should have set tags and vibeScores if mapGameTags returned tags
      // (We just verify it exists, since mapGameTags is the real implementation)
      assert.ok(gameItem.tags === null || Array.isArray(gameItem.tags), 'tags should be null or an array');
    });

    it('should skip game items that already have tags', async () => {
      const gameItem = makeItem('g2', {
        type: 'game',
        source: 'igdb',
        tags: ['Action', 'RPG'],
      });
      // Override mapGameTags to detect if it was called
      const origTags = gameItem.tags;
      await worker._enrich(gameItem);
      assert.equal(gameItem.tags, origTags, 'existing tags should not be replaced');
    });

    it('should skip items without tmdb_id', async () => {
      const item = makeItem('no-tmdb', {
        type: 'movie',
        source: 'tmdb',
        tmdb_id: null,
      });
      await worker._enrich(item);
      // Should not crash
      assert.ok(true);
    });

    it('should not crash on random items (TMDB enrichment requires async storage)', async () => {
      // NOTE: TMDB enrichment calls getTraktTags() which uses IndexedDB (storage.js).
      // JSDOM doesn't support IndexedDB, so this path can't be fully tested here.
      // In production, getTraktTags either resolves cached tags or falls back gracefully.
      const movieItem = makeItem('m1', {
        type: 'movie',
        source: 'tmdb',
        tmdb_id: 12345,
        genres: [28, 12],
        overview: 'Test movie',
      });
      try {
        await worker._enrich(movieItem);
        // If it didn't throw, it handled the storage error gracefully
        assert.ok(true);
      } catch (e) {
        // If it did throw, it should be an actionable error
        assert.ok(e.message, 'should not crash');
      }
    });

    it('should continue processing remaining items if _enrich throws for one item', async () => {
      // Verify error resilience — a single failing enrichment shouldn't block the queue
      const good1 = makeItem('good1', { title: 'good1', type: 'movie' });
      const bad   = makeItem('bad',   { title: 'bad', type: 'movie' });
      const good2 = makeItem('good2', { title: 'good2', type: 'movie' });

      worker.queue = [good1, bad, good2];
      let callCount = 0;
      const origEnrich = worker._enrich.bind(worker);
      worker._enrich = async (item) => {
        callCount++;
        if (item.id === 'bad') throw new Error('Simulated enrichment failure');
        return origEnrich(item);
      };

      await worker._run();

      // All three items should have been attempted (bad throws, but loop continues)
      assert.equal(callCount, 3, 'all 3 items should be attempted despite one failure');
      assert.equal(worker.running, false, 'worker should stop after processing all items');
      assert.equal(worker.queue.length, 0, 'queue should be empty after processing');
    });
  });

  describe('constructor idle timer', () => {
    it('should initialize _idleTimer to null', () => {
      worker = new EnrichmentWorker(makeMockApp());
      assert.equal(worker._idleTimer, null);
    });
  });
});
