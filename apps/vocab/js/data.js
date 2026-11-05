import { normalize } from './check.js';
import { MAX_STREAK } from './srs.js';

const FLAGS = {
  cs: '🇨🇿', sk: '🇸🇰', fr: '🇫🇷', de: '🇩🇪', es: '🇪🇸', it: '🇮🇹', en: '🇬🇧', pt: '🇵🇹', ru: '🇷🇺',
  pl: '🇵🇱', uk: '🇺🇦', nl: '🇳🇱', sv: '🇸🇪', ja: '🇯🇵', zh: '🇨🇳', ko: '🇰🇷', la: '🏛️',
};
export const COMMON_LANGS = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'pl', 'nl', 'sv', 'uk', 'la', 'ja', 'zh', 'ko', 'cs', 'sk'];

export const ACCENTS = {
  fr: 'é è ê ë à â ç î ï ô ù û œ',
  de: 'ä ö ü ß',
  es: 'á é í ó ú ñ ü ¿ ¡',
  it: 'à è é ì ò ù',
  pt: 'á â ã à ç é ê í ó ô õ ú',
  cs: 'á č ď é ě í ň ó ř š ť ú ů ý ž',
  sk: 'á ä č ď é í ľ ĺ ň ó ô ŕ š ť ú ý ž',
  pl: 'ą ć ę ł ń ó ś ź ż',
};

export const LANG_CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

const displayNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;

export function langName(code) {
  try {
    return displayNames?.of(code) || code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export const langFlag = code => FLAGS[code] || '🌐';

export const slug = text => normalize(text).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';

const langCode = value => String(value ?? '').trim().toLowerCase();
const toList = value => (Array.isArray(value) ? value : [value]).flatMap(v => String(v ?? '').split('|')).map(v => v.trim()).filter(Boolean);
const firstOf = (entry, keys) => keys.map(k => entry?.[k]).find(v => v != null && v !== '');

const PROMPT_KEYS = ['q', 'question', 'prompt', 'front', 'term', 'word', 'source'];
const ANSWER_KEYS = ['a', 'answer', 'answers', 'back', 'definition', 'translation', 'translations', 'target'];

const count = (v, max = Infinity) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(0, Math.floor(Number(v)))) : 0);

// Stats travel with an exported deck; anything malformed is dropped so the word simply starts at 0.
export function cleanStats(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const last = Number(s.last);
  if (!Number.isFinite(last) || last <= 0) return null;
  const streak = count(s.streak, MAX_STREAK);
  const due = Number(s.due);
  return {
    streak,
    right: count(s.right),
    wrong: count(s.wrong),
    lastOk: s.lastOk === true,
    last,
    due: Number.isFinite(due) ? due : last,
  };
}

// Accepts {q, a}, {question, answer}, {front, back}, {term, definition}, {word, translation} and merges duplicate prompts.
export function cleanWords(list) {
  const byKey = new Map();
  let duplicates = 0;
  let skipped = 0;
  for (const entry of list) {
    const q = String(firstOf(entry, PROMPT_KEYS) ?? '').trim();
    const a = toList(firstOf(entry, ANSWER_KEYS));
    if (!q || !a.length) {
      skipped++;
      continue;
    }
    const key = normalize(q);
    const existing = byKey.get(key);
    if (existing) {
      duplicates++;
      for (const ans of a) if (!existing.a.includes(ans)) existing.a.push(ans);
      continue;
    }
    const stats = cleanStats(entry.stats);
    byKey.set(key, {
      q,
      a,
      ...(entry.note ? { note: String(entry.note) } : {}),
      ...(entry.why ? { why: String(entry.why) } : {}),
      ...(stats ? { stats } : {}),
    });
  }
  return { words: [...byKey.values()], duplicates, skipped };
}

// The first column becomes the answer and the answers become the prompt.
export function swapWords(words) {
  return words.map(({ q, a, stats, ...rest }) => ({ ...rest, q: a.join(', '), a: [q] }));
}

export const deckId = (from, lang, title) => `${from}-${lang}/${slug(title)}`;
export const wordId = (id, q) => `${id}#${normalize(q)}`;

export function buildDeck(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('expected a deck object');
  if (!raw.lang) throw new Error('missing "lang"');
  const deck = {
    id: raw.id,
    lang: langCode(raw.lang),
    from: langCode(raw.from),
    title: String(raw.title || raw.id),
    created: raw.created || 0,
  };
  deck.words = cleanWords(raw.words || []).words.map(({ stats, ...w }) => ({ ...w, id: wordId(deck.id, w.q), deck }));
  return deck;
}

export function buildLibrary(saved) {
  const decks = [];
  const errors = [];
  for (const raw of saved) {
    try {
      decks.push(buildDeck(raw));
    } catch (e) {
      errors.push(`"${raw?.title}": ${e.message}`);
    }
  }
  return { decks, errors };
}

const titleFromFile = name => {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : undefined;
};

const SEPARATORS = ['\t', ';', ' = ', ' – ', ' — ', ' - ', ','];
const HEADER = /^(q|question|prompt|word|front|term|source)$/i;

function splitLine(line) {
  for (const sep of SEPARATORS) {
    const i = line.indexOf(sep);
    if (i <= 0) continue;
    const q = line.slice(0, i).trim();
    const a = line.slice(i + sep.length).trim();
    if (q && a) return { q, a };
  }
  return null;
}

const isPlainMap = data => data && typeof data === 'object' && !Array.isArray(data) && !('words' in data)
  && Object.values(data).length > 0 && Object.values(data).every(v => typeof v === 'string' || Array.isArray(v));

export function parseImport(text, filename = '') {
  const empty = { meta: {}, words: [], duplicates: 0, skipped: 0 };
  const trimmed = text.trim();
  if (!trimmed) return empty;
  const fileTitle = filename ? titleFromFile(filename) : undefined;

  if (/^[[{]/.test(trimmed)) {
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (e) {
      return { ...empty, error: `This looks like JSON but it can't be read: ${e.message}` };
    }
    if (isPlainMap(data)) return { meta: { title: fileTitle }, ...cleanWords(Object.entries(data).map(([q, a]) => ({ q, a }))) };
    const list = Array.isArray(data) ? data : data?.words;
    if (!Array.isArray(list)) return { ...empty, error: 'JSON must be a list of words, an object with a "words" list, or {"word": "translation"} pairs.' };
    const meta = Array.isArray(data) ? {} : { lang: data.lang, from: data.from, title: data.title };
    meta.title ??= fileTitle;
    return { meta, ...cleanWords(list) };
  }

  const rows = [];
  let skipped = 0;
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const row = splitLine(line);
    if (row) rows.push(row);
    else skipped++;
  }
  if (rows.length && HEADER.test(rows[0].q)) rows.shift();
  const result = cleanWords(rows);
  return { meta: { title: fileTitle }, ...result, skipped: result.skipped + skipped };
}

// stats: 'auto' keeps what you have, takes newer stats from the file and starts new words at 0; 'zero' sets every imported word to 0.
export function saveDeck(decks, progress, { lang, from, title, words, stats = 'auto', now = Date.now() }) {
  const id = deckId(from, lang, title);
  let deck = decks.find(d => d.id === id);
  const before = deck ? deck.words.length : 0;
  const plain = words.map(({ stats: _, ...w }) => w);
  let merged = 0;
  if (deck) {
    const result = cleanWords([...deck.words, ...plain]);
    deck.words = result.words;
    merged = result.duplicates;
  } else {
    deck = { id, lang, from, title, created: now, words: plain };
    decks.push(deck);
  }
  let fromFile = 0;
  let reset = 0;
  for (const w of words) {
    const key = wordId(id, w.q);
    if (stats === 'zero') {
      if (progress[key]) reset++;
      delete progress[key];
    } else if (w.stats && (!progress[key] || w.stats.last > progress[key].last)) {
      progress[key] = w.stats;
      fromFile++;
    }
  }
  return { id, added: deck.words.length - before, merged, fromFile, reset };
}

export function resetStats(deck, progress) {
  let n = 0;
  for (const w of deck.words) {
    if (progress[w.id]) n++;
    delete progress[w.id];
  }
  return n;
}

export function deckFile(deck, progress, { withStats = false } = {}) {
  return {
    app: 'vocab2',
    lang: deck.lang,
    from: deck.from,
    title: deck.title,
    words: deck.words.map(w => ({
      q: w.q,
      a: w.a.length === 1 ? w.a[0] : w.a,
      ...(w.note ? { note: w.note } : {}),
      ...(w.why ? { why: w.why } : {}),
      ...(withStats && progress[w.id] ? { stats: progress[w.id] } : {}),
    })),
  };
}
