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

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encodes bytes as base64 (btoa is missing in some runtimes and cannot take binary strings safely).
 *
 * @param {Uint8Array} bytes The data.
 * @returns {string} Base64 text with padding.
 */
export function bytesToBase64(bytes) {
  let out = '';
  // Every 3 bytes become 4 characters of 6 bits each.
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64_ALPHABET[(chunk >> 18) & 63] + BASE64_ALPHABET[(chunk >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(chunk >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[chunk & 63] : '=';
  }
  return out;
}

/**
 * Decodes base64 into bytes. Whitespace (GitHub wraps base64 in lines) and padding are ignored.
 *
 * @param {string} text Base64 text.
 * @returns {Uint8Array} The bytes.
 * @throws {Error} When the text has a character outside the base64 alphabet.
 */
export function base64ToBytes(text) {
  const clean = String(text).replace(/[\s=]+/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let count = 0;
  let at = 0;
  for (const char of clean) {
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) throw new Error('Not base64 text.');
    // Collect 6 bits per character and emit a byte whenever 8 or more are waiting.
    bits = (bits << 6) | value;
    count += 6;
    if (count >= 8) {
      count -= 8;
      bytes[at] = (bits >> count) & 255;
      at += 1;
    }
  }
  return bytes.subarray(0, at);
}
