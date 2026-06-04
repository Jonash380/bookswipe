import { getTraktTags, setTraktTags, getEnrichedItem, setEnrichedItem } from './storage.js';
import { mapTMDBTags, computeVibeScores } from './tag_mapper.js';
import { generateElevatorPitchFull, detectSpoilers } from './descriptions.js';
import { mapGameTags } from './tag_mapper.js';

const ENRICHMENT_BATCH = 3;

/**
 * Priority that determines how urgently an item needs enrichment.
 * Items near the front of the display queue get enriched first.
 */
function _priority(app, item) {
  if (!app || !app.currentCards) return 5;
  const idx = app.currentCards.findIndex(c => c.id === item.id);
  if (idx < 0) return 5;
  // Cards within the first 10 positions get highest priority
  if (idx < 10) return 1;
  if (idx < 25) return 2;
  if (idx < 50) return 3;
  return 4;
}

export class EnrichmentWorker {
  constructor(app) {
    this.app = app;
    this.queue = [];
    this.running = false;
    this._idleTimer = null;
  }

  enqueue(items) {
    // Only add items not already in queue
    const existingIds = new Set(this.queue.map(i => i.id));
    for (const item of items) {
      if (!existingIds.has(item.id)) {
        this.queue.push(item);
        existingIds.add(item.id);
      }
    }
    // Sort by priority so upcoming cards are enriched first
    this._reprioritize();
    if (!this.running) this._run();
  }

  /**
   * Re-sort queue by priority: cards closest to current index get enriched first.
   */
  _reprioritize() {
    const app = this.app;
    this.queue.sort((a, b) => _priority(app, a) - _priority(app, b));
  }

  async _run() {
    this.running = true;
    while (this.queue.length > 0) {
      // Re-prioritize before each batch in case user swiped since last batch
      this._reprioritize();
      const batch = this.queue.splice(0, ENRICHMENT_BATCH);
      await Promise.allSettled(batch.map(item => this._enrich(item)));
      // Small delay between batches to avoid blocking the main thread
      await new Promise(r => setTimeout(r, 300));
    }
    this.running = false;
  }

  async _enrich(item) {
    const isGame = item.type === 'game' || item.source === 'igdb';
    if (isGame) {
      if (!item.tags || item.tags.length === 0) {
        const tags = mapGameTags(item);
        if (tags.length > 0) {
          item.tags = tags;
          item.vibeScores = computeVibeScores(tags);
        }
      }
      return;
    }
    if (!item.tmdb_id) return;
    let tags = await getTraktTags(item.tmdb_id);
    if (tags.length === 0 && item.genres) {
      tags = mapTMDBTags(item.genres);
      if (tags.length > 0) await setTraktTags(item.tmdb_id, tags);
    }
    if (tags.length > 0) {
      item.vibeScores = computeVibeScores(tags);
      item.tags = tags;
    }
  }
}
