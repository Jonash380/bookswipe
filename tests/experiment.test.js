import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;

const storageMock = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});

const { ABTest } = await import('../js/experiment.js');

describe('ABTest', () => {
  beforeEach(() => { localStorage.clear(); });

  it('should assign to control or treatment group', () => {
    const test = new ABTest({ app: {} });
    assert.ok(test.group === 'control' || test.group === 'treatment');
  });

  it('should be sticky — same group on re-instantiation', () => {
    const t1 = new ABTest({ app: {} });
    const group = t1.group;
    const t2 = new ABTest({ app: {} });
    assert.equal(t2.group, group);
  });

  it('should start with empty metrics', () => {
    const t = new ABTest({ app: {} });
    assert.equal(t._data.totalSwipes, 0);
    assert.equal(t._data.totalLikes, 0);
    assert.equal(t._data.totalNopes, 0);
  });

  it('should track swipes', () => {
    const t = new ABTest({ app: {} });
    t.trackSwipe({ direction: 'right', item: { id: '1', genres: ['Action'] } });
    t.trackSwipe({ direction: 'left', item: { id: '2', genres: ['Comedy'] } });
    assert.equal(t._data.totalSwipes, 2);
    assert.equal(t._data.totalLikes, 1);
    assert.equal(t._data.totalNopes, 1);
  });

  it('should track refetches', () => {
    const t = new ABTest({ app: {} });
    t.trackRefetch();
    t.trackRefetch();
    assert.equal(t._data.totalRefetches, 2);
  });

  it('should track sessions', () => {
    const t = new ABTest({ app: {} });
    const sessions = t._data.sessionCount;
    t.endSession();
    t.startSession();
    assert.ok(t._data.sessionCount >= sessions);
  });

  it('should switch group', () => {
    const t = new ABTest({ app: {} });
    const oldGroup = t.group;
    const newGroup = oldGroup === 'control' ? 'treatment' : 'control';
    t.switchGroup(newGroup);
    assert.equal(t.group, newGroup);
    const persisted = new ABTest({ app: {} });
    assert.equal(persisted.group, newGroup);
  });

  it('should reset data', () => {
    const t = new ABTest({ app: {} });
    t.trackSwipe({ direction: 'right', item: { id: '1', genres: [] } });
    t.reset();
    assert.equal(t._data.totalSwipes, 0);
    assert.ok(t.group === 'control' || t.group === 'treatment');
  });

  it('should compute likeRate', () => {
    const t = new ABTest({ app: {} });
    t.trackSwipe({ direction: 'right', item: { id: '1', genres: [] } });
    t.trackSwipe({ direction: 'right', item: { id: '2', genres: [] } });
    t.trackSwipe({ direction: 'left', item: { id: '3', genres: [] } });
    assert.equal(t.likeRate, 2 / 3);
  });

  it('should handle zero swipes for likeRate', () => {
    const t = new ABTest({ app: {} });
    assert.equal(t.likeRate, 0);
  });

  it('should compute genreDiversity', () => {
    const t = new ABTest({ app: {} });
    t.trackSwipe({ direction: 'right', item: { id: '1', genres: ['Action', 'Comedy'] } });
    t.trackSwipe({ direction: 'right', item: { id: '2', genres: ['Action', 'Drama'] } });
    assert.ok(t.genreDiversity >= 0);
    assert.ok(t.genreDiversity <= 1);
  });
});
