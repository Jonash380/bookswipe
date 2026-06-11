import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window({
  url: 'http://localhost',
});
global.window = window;
global.document = window.document;

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  writable: true, configurable: true,
});

const { mapTMDBTags, mapMediaDNA, computeVibeScores, mapGameTags, getTagPillColor, getWarningSummary } = await import('../js/tag_mapper.js');

describe('mapTMDBTags', () => {
  it('should map horror genre to dark tag', () => {
    const tags = mapTMDBTags([{ id: 27, name: 'Horror' }]);
    assert.ok(tags.includes('dark'));
  });
  it('should map comedy genre to funny tag', () => {
    const tags = mapTMDBTags([{ name: 'Comedy' }]);
    assert.ok(tags.includes('funny'));
  });
  it('should map romance genre to romantic tag', () => {
    const tags = mapTMDBTags([{ name: 'Romance' }]);
    assert.ok(tags.includes('romantic'));
  });
  it('should map animation genre to cozy tag', () => {
    const tags = mapTMDBTags([{ name: 'Animation' }]);
    assert.ok(tags.includes('cozy'));
  });
  it('should map drama genre to cerebral tag', () => {
    const tags = mapTMDBTags([{ name: 'Drama' }]);
    assert.ok(tags.includes('cerebral'));
  });
  it('should handle empty genres', () => {
    const tags = mapTMDBTags([]);
    assert.ok(Array.isArray(tags));
  });
  it('should handle null genres', () => {
    const tags = mapTMDBTags(null);
    assert.ok(Array.isArray(tags));
  });
  it('should match keyword tags', () => {
    const tags = mapTMDBTags([], [{ name: 'murder investigation' }]);
    assert.ok(tags.includes('dark'));
  });
});

describe('mapMediaDNA', () => {
  it('should return object with tropes, pacing, aesthetic, warnings', () => {
    const dna = mapMediaDNA([28, 14], 'A hero goes on a quest to save the world', 'Epic Quest');
    assert.ok(dna);
    assert.ok(Array.isArray(dna.tropes));
    assert.ok(Array.isArray(dna.pacing));
    assert.ok(Array.isArray(dna.aesthetic));
    assert.ok(Array.isArray(dna.warnings));
  });
  it('should detect survival trope from text', () => {
    const dna = mapMediaDNA([], 'They must survive the wilderness alone', 'Survival');
    assert.ok(dna.tropes.includes('survival'));
  });
  it('should detect relentless pacing from action genre', () => {
    const dna = mapMediaDNA([28], 'An action-packed thriller', 'Action Movie');
    assert.ok(dna.pacing.includes('relentless'));
  });
  it('should detect horror warnings from text', () => {
    const dna = mapMediaDNA([27], 'Graphic violence and gore fills the screen', 'Horror Film');
    assert.ok(dna.warnings.length > 0);
  });
  it('should handle empty inputs', () => {
    const dna = mapMediaDNA([], '', '');
    assert.ok(dna);
    assert.ok(Array.isArray(dna.tropes));
    assert.ok(Array.isArray(dna.warnings));
  });
});

describe('computeVibeScores', () => {
  it('should count tag occurrences', () => {
    const scores = computeVibeScores(['dark', 'epic', 'dark', 'romantic']);
    assert.equal(scores.dark, 2);
    assert.equal(scores.epic, 1);
    assert.equal(scores.romantic, 1);
  });
  it('should handle empty tags', () => {
    const scores = computeVibeScores([]);
    assert.deepEqual(scores, {});
  });
});

describe('mapGameTags', () => {
  it('should map RPG to epic', () => {
    const tags = mapGameTags({ genres: [{ name: 'Role-playing (RPG)' }], themes: [], modes: [], overview: '' });
    assert.ok(tags.includes('epic'));
  });
  it('should map Horror to dark', () => {
    const tags = mapGameTags({ genres: [{ name: 'Horror' }], themes: [], modes: [], overview: '' });
    assert.ok(tags.includes('dark'));
  });
  it('should map Racing to intense', () => {
    const tags = mapGameTags({ genres: [{ name: 'Racing' }], themes: [], modes: [], overview: '' });
    assert.ok(tags.includes('intense'));
  });
  it('should handle missing fields', () => {
    const tags = mapGameTags({});
    assert.ok(Array.isArray(tags));
  });
});

describe('getTagPillColor', () => {
  it('should return purple for trope tags', () => {
    const color = getTagPillColor('chosen_one');
    assert.equal(color, '#6c63ff');
  });
  it('should return teal for pacing tags', () => {
    const color = getTagPillColor('slow_burn');
    assert.equal(color, '#4ecdc4');
  });
  it('should return red for aesthetic tags', () => {
    const color = getTagPillColor('neon_noir');
    assert.equal(color, '#ff6b6b');
  });
  it('should return dark red for warning tags', () => {
    const color = getTagPillColor('gore');
    assert.equal(color, '#ef4444');
  });
  it('should return gray for unknown tag', () => {
    const color = getTagPillColor('nonexistent');
    assert.equal(color, '#888');
  });
});

describe('getWarningSummary', () => {
  it('should return array of labels for warnings', () => {
    const summary = getWarningSummary(['gore', 'jump_scare']);
    assert.ok(Array.isArray(summary));
    assert.ok(summary.includes('Graphic Violence'));
    assert.ok(summary.includes('Jump Scares'));
  });
  it('should return null for empty warnings', () => {
    const summary = getWarningSummary([]);
    assert.equal(summary, null);
  });
  it('should pass through unknown warning keys', () => {
    const summary = getWarningSummary(['unknown_warning']);
    assert.ok(summary.includes('unknown_warning'));
  });
});
