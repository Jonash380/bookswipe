/**
 * LIB-002 — Atomic add-consumed contract tests
 *
 * The App._addConsumedAtomic orchestrator (in js/app.js) is a thin wrapper
 * over these storage primitives. The atomicity guarantees live in storage.js
 * (promoteToConsumed uses a single readwrite IndexedDB transaction across
 * both `watchlist` and `consumed` stores). This test file pins down the
 * storage-level contract so the orchestrator can rely on it.
 *
 * What App._addConsumedAtomic does on top of these primitives:
 *   1. Validates rating (1-5 integer) — rejects with 'invalid-rating'
 *   2. Checks if item is already in `consumed` — returns 'already-exists'
 *      (and optionally prompts to update the rating)
 *   3. Checks if item is in `watchlist` — prompts user: move it or add
 *      separately; calls promoteToConsumed (atomic move) or addToConsumed
 *   4. Plain add when not in either store — calls addToConsumed
 *   5. Updates in-memory this.consumed / this.watchlist arrays
 *   6. Calls this.recommender.updateFromConsumed(record, rating)
 *   7. Shows a toast confirmation
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost' });
global.window = window;
global.document = window.document;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);

const storageMock = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: storageMock, writable: true, configurable: true });
Object.defineProperty(global.window, 'localStorage', { value: storageMock, writable: true, configurable: true });

const storage = await import('../js/storage.js');

async function resetDB() {
  await storage.clearAllData();
}

describe('LIB-002 atomic contract — backing storage', () => {
  beforeEach(async () => { await resetDB(); });

  // 1. The plain-add path: item not in watchlist, not in consumed
  it('plain add: stores in consumed when item is in neither store', async () => {
    const item = { id: 'tmdb-1', title: 'Dune', year: 2021 };
    await storage.addToConsumed(item, 5);
    const co = await storage.getConsumed();
    assert.equal(co.length, 1);
    assert.equal(co[0].id, 'tmdb-1');
    assert.equal(co[0].consumedRating, 5);
    const wl = await storage.getWatchlist();
    assert.equal(wl.length, 0);
  });

  // 2a. The "move it" path: item IS in watchlist, user picks "Move it"
  //     -> promoteToConsumed atomically deletes from watchlist + adds to consumed
  it('move it: promoteToConsumed atomically moves from watchlist to consumed', async () => {
    await storage.addToWatchlist({ id: 'tmdb-1', title: 'Dune' });
    const result = await storage.promoteToConsumed('tmdb-1', 4);
    assert.equal(result.moved, true);
    assert.equal(result.record.promotedFromWatchlist, true);
    assert.equal(result.record.consumedRating, 4);
    assert.equal((await storage.getWatchlist()).length, 0, 'watchlist must be empty after move');
    const co = await storage.getConsumed();
    assert.equal(co.length, 1);
    assert.equal(co[0].id, 'tmdb-1');
  });

  // 2b. The "add separately" path: item IS in watchlist, user picks "Add separately"
  //     -> addToConsumed WITHOUT removing from watchlist, promotedFromWatchlist=false
  it('add separately: addToConsumed leaves watchlist intact, sets promotedFromWatchlist=false', async () => {
    await storage.addToWatchlist({ id: 'tmdb-1', title: 'Dune' });
    await storage.addToConsumed({ id: 'tmdb-1', title: 'Dune' }, 3, { promotedFromWatchlist: false });
    const wl = await storage.getWatchlist();
    assert.equal(wl.length, 1, 'watchlist must still have the item when adding separately');
    const co = await storage.getConsumed();
    assert.equal(co.length, 1);
    assert.equal(co[0].promotedFromWatchlist, false);
  });

  // 3. The "already exists" path: item is already in consumed
  it('already exists: writing again upserts (orchestrator must pre-check via this.consumed.some)', async () => {
    await storage.addToConsumed({ id: 'tmdb-1', title: 'Dune' }, 3);
    // At the orchestrator level, the pre-check (this.consumed.some(c => c.id === item.id))
    // would return true here and the orchestrator would short-circuit with
    // 'already-exists' BEFORE calling addToConsumed. The storage layer
    // itself does upsert on duplicate id, which is the safe fallback.
    await storage.addToConsumed({ id: 'tmdb-1', title: 'Dune (re-marked)' }, 5);
    const co = await storage.getConsumed();
    assert.equal(co.length, 1, 'storage layer upserts on duplicate id (single record)');
    assert.equal(co[0].consumedRating, 5, 'rating was updated to 5 on the second add');
  });

  // 4. Rating validation — the storage layer itself rejects invalid ratings
  it('invalid rating: storage layer no-ops on out-of-range or non-integer', async () => {
    await storage.addToConsumed({ id: 'r-0' }, 0);
    await storage.addToConsumed({ id: 'r-6' }, 6);
    await storage.addToConsumed({ id: 'r-neg' }, -1);
    await storage.addToConsumed({ id: 'r-float' }, 3.5);
    const co = await storage.getConsumed();
    assert.equal(co.length, 0, 'all invalid ratings must be rejected at the storage layer');
  });

  // 5. Idempotency: calling _addConsumedAtomic twice with the same item
  //    must not create duplicate records (the pre-check makes the second
  //    call short-circuit with 'already-exists')
  it('idempotency: double-tap produces a single record, not two', async () => {
    const item = { id: 'tmdb-1', title: 'Dune' };
    await storage.addToConsumed(item, 4);
    // Simulate the orchestrator's pre-check
    const before = await storage.getConsumed();
    const alreadyExists = before.some(c => c.id === item.id);
    assert.equal(alreadyExists, true, 'second call should see the item already there');
    if (!alreadyExists) await storage.addToConsumed(item, 4);
    const co = await storage.getConsumed();
    assert.equal(co.length, 1);
  });

  // 6. Race-condition: the atomic promote must be transactional.
  //    If the watchlist get returns nothing (e.g. concurrent tab), the
  //    consumed write is rolled back and moved:false is returned.
  it('race condition: promoteToConsumed rolls back if the watchlist item is gone', async () => {
    const result = await storage.promoteToConsumed('not-in-watchlist', 4);
    assert.equal(result.moved, false);
    assert.equal(result.record, null);
    assert.equal((await storage.getConsumed()).length, 0,
      'no record should be created when the source watchlist item is missing');
  });
});

describe('LIB-002 — end-to-end via the storage primitives (simulating the orchestrator)', () => {
  beforeEach(async () => { await resetDB(); });

  it('flow A — "not in either store" (the simple path)', async () => {
    const inWatchlist = []; // empty
    const inConsumed = [];
    const item = { id: 'a', title: 'A' };
    const alreadyInConsumed = inConsumed.some(c => c.id === item.id);
    assert.equal(alreadyInConsumed, false);
    const inWl = inWatchlist.some(w => w.id === item.id);
    assert.equal(inWl, false);
    // Orchestrator path 3: plain add
    await storage.addToConsumed(item, 4);
    assert.equal((await storage.getConsumed()).length, 1);
  });

  it('flow B — "in watchlist, user picks Move it" (atomic path)', async () => {
    const item = { id: 'b', title: 'B' };
    await storage.addToWatchlist(item);
    const inWl = (await storage.getWatchlist()).some(w => w.id === item.id);
    assert.equal(inWl, true);
    // User picks "move" → orchestrator calls promoteToConsumed
    const result = await storage.promoteToConsumed(item.id, 5);
    assert.equal(result.moved, true);
    assert.equal((await storage.getWatchlist()).length, 0);
    assert.equal((await storage.getConsumed()).length, 1);
  });

  it('flow C — "in watchlist, user picks Add separately" (non-atomic add)', async () => {
    const item = { id: 'c', title: 'C' };
    await storage.addToWatchlist(item);
    // User picks "separate" → orchestrator calls addToConsumed with promotedFromWatchlist:false
    await storage.addToConsumed(item, 3, { promotedFromWatchlist: false });
    assert.equal((await storage.getWatchlist()).length, 1, 'watchlist untouched');
    const co = await storage.getConsumed();
    assert.equal(co.length, 1);
    assert.equal(co[0].promotedFromWatchlist, false);
    assert.equal(co[0].consumedRating, 3);
  });

  it('flow D — "already in consumed" (pre-check short-circuit)', async () => {
    const item = { id: 'd', title: 'D' };
    await storage.addToConsumed(item, 3);
    // Orchestrator pre-check
    const already = (await storage.getConsumed()).some(c => c.id === item.id);
    assert.equal(already, true);
    // Orchestrator returns 'already-exists' without writing
    // (no further action; the storage layer test above covers the upsert fallback)
  });
});
