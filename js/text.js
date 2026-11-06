/**
 * Small text helpers shared by the parsers and prompt builders.
 *
 * Fits in: js/student.js, js/curriculum.js, js/testcheck.js and other modules that cap text from users or an AI
 * before storing it. Imports nothing, so any module can use it without creating an import cycle.
 * Invariant: capped text never ends in half of an emoji. A lone surrogate is not valid Unicode, and the local
 * server rejects a data file that contains one, which would stop every later save.
 */

/**
 * Trims a value and cuts it to at most `max` characters, counting by code point.
 *
 * @param {unknown} value Any value; anything that is not a string gives ''.
 * @param {number} max Maximum number of code points to keep (0 or less gives '').
 * @returns {string} The trimmed text, cut without splitting an emoji or other astral character.
 * @example
 * clip('  Hello 😀 world  ', 7); // 'Hello 😀'
 */
export function clip(value, max) {
  if (typeof value !== 'string' || max <= 0) return '';
  const text = value.trim();
  // Fast path: a string no longer than max UTF-16 units has at most max code points.
  if (text.length <= max) return text;
  return Array.from(text).slice(0, max).join('').trim();
}
