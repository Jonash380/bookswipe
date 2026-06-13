/**
 * LIB-009 — i18n keys for the Library page
 *
 * Adds 11 new translation keys to BOTH `de` and `en` tables in js/i18n.js
 * for the Library feature (consumed + want to). Per the spec:
 *   - No placeholder strings (null, undefined, TBD)
 *   - German translations are natural (not just Google-translated)
 *   - No existing keys modified or removed
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LANG } from '../js/i18n.js';

const NEW_KEYS = [
  'library',
  'wantTo',
  'consumed',
  'addConsumed',
  'markConsumed',
  'promoteToConsumed',
  'updateRating',
  'removeFromLibrary',
  'searchToAdd',
  'alreadyConsumed',
  'ratingRequired',
];

const PLACEHOLDER_VALUES = ['null', 'undefined', 'TBD', 'TODO', 'FIXME', ''];

describe('LIB-009 — i18n keys for the Library page', () => {
  it('LANG.de and LANG.en both exist', () => {
    assert.ok(LANG.de, 'LANG.de must exist');
    assert.ok(LANG.en, 'LANG.en must exist');
  });

  describe('DE (German) — every new key has a non-empty value', () => {
    for (const key of NEW_KEYS) {
      it(`de.${key} is a non-empty string`, () => {
        const value = LANG.de[key];
        assert.ok(typeof value === 'string', `LANG.de.${key} should be a string, got ${typeof value}`);
        assert.ok(value.length > 0, `LANG.de.${key} should not be empty`);
        assert.ok(!PLACEHOLDER_VALUES.includes(value), `LANG.de.${key} should not be a placeholder (got "${value}")`);
      });
    }
  });

  describe('EN (English) — every new key has a non-empty value', () => {
    for (const key of NEW_KEYS) {
      it(`en.${key} is a non-empty string`, () => {
        const value = LANG.en[key];
        assert.ok(typeof value === 'string', `LANG.en.${key} should be a string, got ${typeof value}`);
        assert.ok(value.length > 0, `LANG.en.${key} should not be empty`);
        assert.ok(!PLACEHOLDER_VALUES.includes(value), `LANG.en.${key} should not be a placeholder (got "${value}")`);
      });
    }
  });

  describe('DE values are natural German (not just Google-translated English)', () => {
    // Spot-check the most prominent strings for naturalness.
    it('de.library is "Bibliothek"', () => {
      assert.equal(LANG.de.library, 'Bibliothek');
    });
    it('de.wantTo is "Will ich"', () => {
      assert.equal(LANG.de.wantTo, 'Will ich');
    });
    it('de.consumed is "Gesehen"', () => {
      assert.equal(LANG.de.consumed, 'Gesehen');
    });
    it('de.removeFromLibrary starts with "Aus" (German für "from")', () => {
      assert.match(LANG.de.removeFromLibrary, /^Aus\b/);
    });
  });

  describe('Consistency — both languages cover the same set of new keys', () => {
    it('all 11 new keys present in BOTH de and en', () => {
      for (const key of NEW_KEYS) {
        assert.ok(key in LANG.de, `LANG.de is missing key "${key}"`);
        assert.ok(key in LANG.en, `LANG.en is missing key "${key}"`);
      }
    });
  });

  describe('No existing keys were modified or removed', () => {
    // Spot-check 5 known-existing keys in each language to ensure
    // the addition didn't accidentally clobber any of them.
    const EXISTING_KEYS = ['title', 'like', 'nope', 'discover', 'undo', 'search', 'streakLabel'];
    for (const key of EXISTING_KEYS) {
      it(`${key} still present in both languages`, () => {
        assert.ok(typeof LANG.de[key] === 'string' && LANG.de[key].length > 0, `LANG.de.${key} was clobbered`);
        assert.ok(typeof LANG.en[key] === 'string' && LANG.en[key].length > 0, `LANG.en.${key} was clobbered`);
      });
    }
  });

  describe('The 12 library-issues.json reference to the keys works at runtime', () => {
    // Smoke-test: simulating the App's t() function should resolve each new key.
    function t(lang, key, ...args) {
      let v = lang[key] || key;
      args.forEach((a, i) => { v = v.replace(`{${i}}`, a); });
      return v;
    }
    for (const key of NEW_KEYS) {
      it(`t('${key}') resolves to the literal value (no {0} placeholders expected)`, () => {
        const de = t(LANG.de, key);
        const en = t(LANG.en, key);
        assert.notEqual(de, key, `DE key "${key}" did not resolve`);
        assert.notEqual(en, key, `EN key "${key}" did not resolve`);
      });
    }
  });
});
