/**
 * Tests for js/text.js: clip trims, caps by code point and never leaves half an emoji behind.
 */
import { test, assert } from './harness.mjs';
import { clip } from '../../js/text.js';

test('clip trims and keeps short text unchanged', () => {
  assert.equal(clip('  Příliš žluťoučký kůň  ', 100), 'Příliš žluťoučký kůň');
});

test('clip cuts long text to the limit', () => {
  assert.equal(clip('abcdef', 3), 'abc');
});

test('clip never splits an emoji at the cut', () => {
  const cut = clip(`${'ž'.repeat(1999)}😀😀`, 2000);
  assert.equal(Array.from(cut).length, 2000);
  assert.ok(cut.endsWith('😀'), 'the last code point is a whole emoji');
  assert.ok(!/[\uD800-\uDBFF]$/.test(cut), 'no lone high surrogate at the end');
});

test('clip turns non-strings and non-positive limits into empty text', () => {
  assert.equal(clip(42, 10), '');
  assert.equal(clip(null, 10), '');
  assert.equal(clip('abc', 0), '');
});
