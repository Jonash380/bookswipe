import { getTraktTags, setTraktTags, getEnrichedItem, setEnrichedItem } from './storage.js';
import { mapTMDBTags, computeVibeScores } from './tag_mapper.js';
import { generateElevatorPitchFull, detectSpoilers } from './descriptions.js';
import { mapGameTags } from './tag_mapper.js';
const ENRICHMENT_BATCH = 3;
const IDLE_TIMEOUT = 5000;
export class EnrichmentWorker {
  constructor(app) {
    this.app = app;
    this.queue = [];
    this.running = false;
  }
  enqueue(items) {
    this.queue.push(...items);
    if (!this.running) this._run();
  }
  async _run() {
    this.running = true;
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, ENRICHMENT_BATCH);
      await Promise.allSettled(batch.map(item => this._enrich(item)));
      await new Promise(r => setTimeout(r, 500));
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
