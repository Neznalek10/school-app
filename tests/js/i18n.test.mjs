/**
 * Tests for js/i18n.js with the Czech dictionary: exact texts, plural nouns, patterns, pieces split by
 * "·", and English staying English when the interface language is English.
 */
import { test, assert } from './harness.mjs';
import { tr, nounFor } from '../../js/i18n.js';
import { setLocale } from '../../js/locale.js';
import { WORDS, PATTERNS } from '../../js/i18n/cs.js';

test('English interface leaves every text alone', () => {
  setLocale({ language: 'en' });
  assert.equal(tr('Calendar'), 'Calendar');
  assert.equal(nounFor(5, 'note', 'notes'), 'notes');
});

test('Czech interface translates words, plurals, patterns and dotted pieces', () => {
  setLocale({ language: 'cs', country: 'CZ' });
  assert.equal(tr('Calendar'), 'Kalendář');
  assert.equal(tr('  Coming up '), '  Nadcházející ');
  assert.equal(nounFor(1, 'note', 'notes'), 'poznámka');
  assert.equal(nounFor(3, 'note', 'notes'), 'poznámky');
  assert.equal(nounFor(7, 'note', 'notes'), 'poznámek');
  assert.equal(tr('In 5 days'), 'Za 5 dní');
  assert.equal(tr('Edited 3 min ago'), 'Upraveno před 3 min');
  assert.equal(tr('Homework · '), 'Úkol · ');
  assert.equal(tr('Test · Tomorrow · 08:00'), 'Test · Zítra · 08:00');
  assert.equal(tr('Mein eigener Text'), 'Mein eigener Text');
  setLocale({ language: 'en' });
});

test('no Czech translation is itself an English key, so the translator cannot loop', () => {
  for (const [en, cs] of Object.entries(WORDS)) {
    if (cs !== en) assert.ok(WORDS[cs] === undefined || WORDS[cs] === cs, `${en} -> ${cs}`);
  }
  assert.ok(PATTERNS.every(([re]) => re instanceof RegExp));
});
