/**
 * AI client of the French app: settings helpers, the chat call and parsing of the AI's checking answers.
 *
 * Used by the writing, speaking and settings views; uses store.js and learn/writing.js.
 * Invariants: the key goes only to https or local addresses, and provider text shown to the student is
 * key-masked. isKeySafeUrl and maskKeys are deliberate copies of the dashboard rules in js/ai.js: the
 * apps are standalone forks that must not import from the dashboard.
 */
import { store } from './store.js';
import { requirementsOf } from './learn/writing.js';

export const DEFAULT_AI = { url: 'https://openrouter.ai/api/v1', key: '', model: 'openrouter/free' };
export const aiSettings = () => ({ ...DEFAULT_AI, ...store.settings.ai });

const TIMEOUT_MS = 90000;
const WEIGHTS = { task: 0.3, grammar: 0.3, vocabulary: 0.2, naturalness: 0.2 };
export const CRITERIA = [
  { key: 'task', label: 'Task' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'naturalness', label: 'Natural French' },
];
export const BANDS = [
  { min: 85, label: 'Excellent', tone: 'good' },
  { min: 70, label: 'Good', tone: 'good' },
  { min: 50, label: 'Getting there', tone: 'warn' },
  { min: 0, label: 'Needs work', tone: 'bad' },
];

export class AiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

// OpenRouter needs a key; a local server such as Ollama does not.
export const aiReady = ai => !!(ai?.url && ai?.model && (ai.key || !/openrouter\.ai/i.test(ai.url)));

export const wordCount = text => (String(text).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

const prompts = {};
export async function loadPrompt(name = 'check-write') {
  if (prompts[name]) return prompts[name];
  const res = await fetch(`./prompts/${name}.md`, { cache: 'no-cache' });
  if (!res.ok) throw new AiError('format', `Could not load the AI instructions (HTTP ${res.status}).`);
  prompts[name] = await res.text();
  return prompts[name];
}

/** Addresses the key may be sent to: https, or http on this computer (local models such as Ollama). */
const KEY_SAFE_URL = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?([/?#]|$))/i;

/**
 * Tells whether the AI key may be sent to an address.
 *
 * @param {string} url The AI address from settings.
 * @returns {boolean} true for https, or http on localhost / 127.0.0.1.
 */
export const isKeySafeUrl = url => KEY_SAFE_URL.test(String(url).trim());

/** Strings that look like provider keys, for example sk-or-v1-abc. */
const KEY_LIKE = /\bsk-[\w-]+/g;
/** Shortest configured key that is masked by exact match; shorter ones would hide ordinary words. */
const MIN_SECRET_LENGTH = 6;

/**
 * Hides keys in text that will be shown to the student.
 *
 * @param {unknown} text Text from a provider (error body or message).
 * @param {string} [secret] The configured AI key; replaced wherever it appears when it has 6 or more characters.
 * @returns {string} The text with `sk-...` strings and the exact key replaced by `sk-***`.
 */
export function maskKeys(text, secret = '') {
  const masked = String(text).replace(KEY_LIKE, 'sk-***');
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH ? masked.replaceAll(secret, () => 'sk-***') : masked;
}

/**
 * One OpenAI-compatible call: works with OpenRouter, Ollama and LM Studio.
 * The key is sent only to safe addresses (isKeySafeUrl) and is masked in any provider text shown back.
 *
 * @param {{url: string, key?: string, model: string}} ai AI settings.
 * @param {{role: string, content: string}[]} messages The conversation, system message first.
 * @param {{timeout?: number, fetcher?: typeof fetch}} [options] `timeout` in ms; `fetcher` replaces fetch in tests.
 * @returns {Promise<string>} The answer text.
 * @throws {AiError} Kind network, auth, limit, http or format.
 */
export async function chat(ai, messages, { timeout = TIMEOUT_MS, fetcher = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetcher(`${ai.url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ai.key && isKeySafeUrl(ai.url) ? { Authorization: `Bearer ${ai.key}` } : {}) },
      body: JSON.stringify({ model: ai.model, messages, temperature: 0.2 }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new AiError('network', e.name === 'AbortError' ? 'The AI took too long to answer.' : 'Could not reach the AI. Check your connection and the address in Settings.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), ai.key);
  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new AiError('format', maskKeys(data?.error?.message || 'The AI sent back an empty answer.', ai.key));
  return text;
}

/**
 * Turns an HTTP error status into an AiError the student can act on.
 *
 * @param {number} status HTTP status code.
 * @param {string} [body] Response body; a short, key-masked excerpt is shown for unknown errors.
 * @param {string} [secret] The configured AI key, masked in the excerpt.
 * @returns {AiError} Kind auth, limit or http.
 */
export function httpError(status, body = '', secret = '') {
  if (status === 401 || status === 403) return new AiError('auth', 'The AI refused the key. Check it in Settings.');
  if (status === 402) return new AiError('limit', 'This model needs credit on your OpenRouter account. Pick a free model in Settings.');
  if (status === 404) return new AiError('http', 'The AI could not find this model. Check the model name in Settings.');
  if (status === 429) return new AiError('limit', 'The AI is busy or your free checks for today are used up. Try again in a minute, or change the model in Settings.');
  // Mask first, then cut, so a key cut in half by the limit can't slip through.
  const detail = maskKeys(String(body).replace(/\s+/g, ' '), secret).slice(0, 140);
  return new AiError('http', `The AI answered with an error (${status}).${detail ? ` ${detail}` : ''}`);
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const str = v => (typeof v === 'string' ? v.trim() : '');

// Models wrap JSON in fences or chatter; take the outermost braces.
export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AiError('format', 'The AI did not answer in the expected form.');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError('format', 'The AI did not answer in the expected form.');
  }
}

// Turns the AI's JSON into a result the views can trust: clamped scores, known rule ids, quotes that really occur in the text.
export function parseCheck(raw, { text, requirements, ruleIds }) {
  const data = typeof raw === 'string' ? extractJson(raw) : raw;
  const c = data?.criteria;
  if (!c || typeof c !== 'object') throw new AiError('format', 'The AI answer had no scores.');
  const criteria = {};
  for (const { key } of CRITERIA) {
    const n = Number(c[key]);
    if (!Number.isFinite(n)) throw new AiError('format', `The AI answer had no score for ${key}.`);
    criteria[key] = Math.round(clamp(n, 0, 10) * 10) / 10;
  }
  const known = new Set(ruleIds);
  const inText = piece => !!piece && text.toLowerCase().includes(piece.toLowerCase());
  const given = new Map((Array.isArray(data.requirements) ? data.requirements : []).map(r => [Number(r?.n), r]));
  const checked = requirements.map((item, i) => {
    const r = given.get(i + 1);
    return { item, met: r ? r.met === true : false, note: str(r?.note) };
  });
  const errors = (Array.isArray(data.errors) ? data.errors : [])
    .map(e => ({ wrong: str(e?.wrong), right: str(e?.right), why: str(e?.why), rule: known.has(e?.rule) ? e.rule : '' }))
    .filter(e => e.wrong && e.right && e.wrong !== e.right && inText(e.wrong))
    .slice(0, 8);
  const better = (Array.isArray(data.better) ? data.better : [])
    .map(b => ({ original: str(b?.original), suggestion: str(b?.suggestion), why: str(b?.why) }))
    .filter(b => b.original && b.suggestion && b.original !== b.suggestion && inText(b.original))
    .slice(0, 5);
  const rules = [...new Set([...(Array.isArray(data.rules) ? data.rules : []), ...errors.map(e => e.rule)])].filter(id => known.has(id)).slice(0, 4);
  return {
    criteria, requirements: checked, errors, better, rules,
    corrected: str(data.corrected) || text,
    verdict: str(data.verdict),
  };
}

export function scoreOf(criteria) {
  const total = CRITERIA.reduce((sum, { key }) => sum + (criteria[key] / 10) * WEIGHTS[key], 0);
  return Math.round(total * 100);
}

export const bandOf = score => BANDS.find(b => score >= b.min);

export function buildMessages(system, { topic, text, opts, range, rules }) {
  const request = {
    level: opts.level,
    strictness: opts.strict,
    feedbackLanguage: { en: 'English', cs: 'Czech', fr: 'French' }[opts.feedback] || 'English',
    task: topic.task,
    requirements: requirementsOf(topic, opts).map((item, i) => `${i + 1}. ${item}`),
    targetWords: range,
    wordCount: wordCount(text),
    text,
    grammarRules: rules,
  };
  return [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(request) }];
}

// Free models fail now and then with broken JSON, so a bad answer gets one more try.
export async function checkWriting(ai, input, { fetcher } = {}) {
  const system = await loadPrompt();
  const messages = buildMessages(system, input);
  const ruleIds = input.rules.map(r => r.id);
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chat(ai, messages, { fetcher });
    try {
      return parseCheck(raw, { text: input.text, requirements: requirementsOf(input.topic, input.opts), ruleIds });
    } catch (e) {
      if (!(e instanceof AiError) || e.kind !== 'format') throw e;
      last = e;
    }
  }
  throw last;
}

// One JSON answer with a retry on broken output: used by everything that is not the essay check.
export async function askJson(ai, messages, validate, { fetcher } = {}) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chat(ai, messages, { fetcher });
    try {
      return validate(extractJson(raw));
    } catch (e) {
      if (!(e instanceof AiError) || e.kind !== 'format') throw e;
      last = e;
    }
  }
  throw last;
}
