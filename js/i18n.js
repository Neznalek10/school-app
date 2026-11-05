/**
 * Interface translation. Views write their texts in English; in another interface language every text that
 * reaches the screen is looked up in that language's dictionary (js/i18n/<code>.js), so views don't need
 * to know about languages and anything missing simply stays English.
 *
 * Used by js/app.js (startTranslating, applyLanguage) and js/ui.js (nounFor in plural). The same approach
 * as the French app's js/i18n.js. Invariants: user content is never translated (markdown, chat messages,
 * text boxes and anything inside [data-no-tr]), and a translated text is never an English key, so the
 * observer doesn't loop on its own changes.
 */
import { uiLanguage } from './locale.js';
import * as cs from './i18n/cs.js';

/** Dictionaries by language code: WORDS (exact texts), PATTERNS ([RegExp, fn]) and NOUNS (plural forms). */
const DICTS = { cs };

const SKIP_TEXT = 'script, style, textarea, pre, code, .md, .msg, [data-no-tr]';
const SKIP_ATTRS = '[data-no-tr]';
const ATTRS = ['placeholder', 'title', 'aria-label'];

const dict = () => DICTS[uiLanguage()] || null;

/**
 * The noun for plural(): "5 notes" becomes "5 poznámek" in Czech.
 *
 * @param {number} n The count.
 * @param {string} one English singular, the dictionary key.
 * @param {string} many English plural.
 * @returns {string} The noun in the interface language.
 */
export function nounFor(n, one, many) {
  const forms = dict()?.NOUNS[one];
  if (forms) return dict().pickForm(n, forms);
  return n === 1 ? one : many;
}

function lookup(d, key) {
  if (d.WORDS[key] !== undefined) return d.WORDS[key];
  for (const [re, rep] of d.PATTERNS) {
    const m = key.match(re);
    const out = m && rep(...m.slice(1));
    if (out !== undefined && out !== null && out !== false) return out;
  }
  return undefined;
}

/**
 * Translates one English text, keeping its surrounding whitespace.
 *
 * @param {string} text Text as it would be shown.
 * @returns {string} The translation, or the text itself when there is none.
 */
export function tr(text) {
  const d = dict();
  if (!d) return text;
  const key = text.replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]/.test(key)) return text;
  let out = lookup(d, key);
  // "Test · In 2 days", "Homework · " and the like: each part on its own, separators kept.
  if (out === undefined && key.includes('·')) {
    const parts = key.split(/(\s*·\s*)/);
    const done = parts.map(p => (/^\s*·\s*$/.test(p) || !p ? p : lookup(d, p) ?? p));
    if (done.some((p, i) => p !== parts[i])) out = done.join('');
  }
  if (out === undefined) return text;
  return text.match(/^\s*/)[0] + out + text.match(/\s*$/)[0];
}

function translateText(node) {
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP_TEXT)) return;
  const next = tr(node.data);
  if (next !== node.data) node.data = next;
}

function translateAttrs(el) {
  if (el.closest(SKIP_ATTRS)) return;
  for (const name of ATTRS) {
    const value = el.getAttribute(name);
    if (!value) continue;
    const next = tr(value);
    if (next !== value) el.setAttribute(name, next);
  }
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateText(node);
    else translateAttrs(node);
  }
}

/**
 * Starts translating everything added to the page from now on, then the page as it is.
 *
 * @returns {void}
 */
export function startTranslating() {
  new MutationObserver(records => {
    if (!dict()) return;
    for (const r of records) {
      if (r.type === 'characterData') translateText(r.target);
      else if (r.type === 'attributes') translateAttrs(r.target);
      else r.addedNodes.forEach(translateTree);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  applyLanguage();
}

/**
 * Sets the page language and translates what is on screen; call after the interface language changes.
 *
 * @returns {void}
 */
export function applyLanguage() {
  document.documentElement.lang = uiLanguage();
  if (dict()) translateTree(document.body);
}
