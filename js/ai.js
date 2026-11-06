/**
 * AI client and prompt builders.
 *
 * Responsibility: one OpenAI-compatible chat call (chat), the photo helpers (visionSettings, imageMessages),
 * and the prompts every assistant uses: the in-app system prompt and the copy-paste prompt, both with the
 * subject profile, the student's age-fitting style line, upcoming tests and notes.
 * Used by views/chat.js, views/prompts.js, views/subject.js and the test checker; uses store.js for settings
 * and locale.js for the student text.
 * Invariants: the AI key is only sent over https or to localhost, and `sk-...` text is masked in errors.
 */
import { store, DEFAULT_AI } from './store.js';
import { typeOf, firstLine } from './events.js';
import { profileLine } from './study.js';
import { fillStudent, studentText, audienceText } from './locale.js';
import { clip } from './text.js';

export { DEFAULT_AI, profileLine };
export const aiSettings = () => ({ ...DEFAULT_AI, ...store.settings.ai });

/**
 * The AI settings for a request that carries photos: the same connection with the photo model when one is set.
 *
 * @returns {object} aiSettings() with `model` replaced by the trimmed `visionModel`, or kept when that is empty.
 */
export function visionSettings() {
  const ai = aiSettings();
  const visionModel = typeof ai.visionModel === 'string' ? ai.visionModel.trim() : '';
  return { ...ai, model: visionModel || ai.model };
}

/**
 * Builds the messages of one request that sends photos along with the text.
 *
 * @param {string} text The prompt.
 * @param {string[]} dataUrls Photos as `data:image/jpeg;base64,...` URLs (see js/images.js).
 * @returns {object[]} One user message whose content is the text part followed by one `image_url` part per photo
 *   (the OpenAI format that OpenRouter, Ollama and LM Studio accept).
 * @example
 * await chat(visionSettings(), imageMessages(prompt, photos), { timeout: PHOTO_TIMEOUT_MS });
 */
export const imageMessages = (text, dataUrls) => [{
  role: 'user',
  content: [{ type: 'text', text }, ...dataUrls.map(url => ({ type: 'image_url', image_url: { url } }))],
}];

const TIMEOUT_MS = 90000;
/** Reading photos takes a model longer than answering text, so photo requests get more time. */
export const PHOTO_TIMEOUT_MS = 150000;
/** Shown with an AI error on a photo request: the likely cause is a model that cannot read images. */
export const PHOTO_MODEL_HINT = 'The model may not read photos. Pick a model that does in Account › AI assistants › Photo model.';
// Long enough for a term of notes, short enough for free models with small context windows.
export const NOTES_BUDGET = 16000;

export class AiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

// OpenRouter needs a key; a local server such as Ollama does not.
export const aiReady = ai => !!(ai?.url && ai?.model && (ai.key || !/openrouter\.ai/i.test(ai.url)));

/** Error text from a provider can echo the request key; anything shaped like an `sk-...` key is masked before it is shown. */
const KEY_LIKE = /\bsk-[\w-]+/g;
/** A configured key shorter than this is not masked by value: it would also hit ordinary words. */
const MIN_SECRET_LENGTH = 6;
/** Longest excerpt of a provider's error body shown to the student. */
const DETAIL_MAX_CHARS = 140;
/** Error codes a provider may put in the body of a 200 answer, handled like the same HTTP status. */
const BODY_ERROR_STATUSES = [401, 402, 403, 429];
/** Shown when the model stopped at its length limit before writing any answer text. */
const OUT_OF_ROOM_MESSAGE = 'The AI ran out of room before finishing. Try again, or pick a model with a larger limit in Account.';

/**
 * Hides keys in text that will be shown to the student.
 *
 * @param {unknown} text Text from a provider (error body or message).
 * @param {string} [secret] The configured AI key; replaced wherever it appears when it has 6 or more characters.
 * @returns {string} The text with `sk-...` strings and the exact key replaced by `sk-***`.
 * @example
 * maskKeys('bad key abc123xyz', 'abc123xyz'); // 'bad key sk-***'
 */
export function maskKeys(text, secret = '') {
  const masked = String(text).replace(KEY_LIKE, 'sk-***');
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH ? masked.replaceAll(secret, () => 'sk-***') : masked;
}

/** An address the key may be sent to: any https address, or http on this computer (Ollama, LM Studio). */
const KEY_SAFE_URL = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?([/?#]|$))/i;

/**
 * Tells whether the AI key may be sent to an address.
 * Plain http to another host would expose the key to anyone on the network, so it is refused.
 *
 * @param {string} url The AI address from settings.
 * @returns {boolean} true for https, or http on localhost / 127.0.0.1.
 */
export const isKeySafeUrl = url => KEY_SAFE_URL.test(String(url).trim());

/**
 * Joins the answer text of a chat completion. Most providers send a string; some send
 * `[{ type: 'text', text }]` parts.
 *
 * @param {unknown} content `choices[0].message.content` of the response.
 * @returns {string} The text, or '' when there is none.
 */
function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => (typeof part === 'string' ? part : part?.type === 'text' && typeof part.text === 'string' ? part.text : '')).join('');
}

/**
 * Sends the request and reads the whole body. Runs inside the timeout in `chat`.
 *
 * @param {object} ai AI settings (url, key, model).
 * @param {object} payload Request body, before JSON encoding.
 * @param {{ signal: AbortSignal, fetcher: typeof fetch }} options Abort signal and fetch function.
 * @returns {Promise<object|null>} The parsed response, or null when the body is not JSON.
 * @throws {AiError} For a non-2xx answer.
 */
async function requestCompletion(ai, payload, { signal, fetcher }) {
  const headers = { 'Content-Type': 'application/json' };
  // The key only travels over a safe connection.
  if (ai.key && isKeySafeUrl(ai.url)) headers.Authorization = `Bearer ${ai.key}`;
  const res = await fetcher(`${ai.url.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(payload), signal });
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), ai.key);
  return res.json().catch(() => null);
}

/**
 * One OpenAI-compatible call: works with OpenRouter, Ollama and LM Studio.
 * The timeout covers the whole exchange, including reading the body.
 *
 * @param {object} ai AI settings (url, key, model).
 * @param {{ role: string, content: string }[]} messages The conversation, system message first.
 * @param {{ timeout?: number, temperature?: number, fetcher?: typeof fetch }} [options] `timeout` in ms.
 * @returns {Promise<string>} The trimmed answer text.
 * @throws {AiError} Kinds: network, auth, limit, http, format.
 */
export async function chat(ai, messages, { timeout = TIMEOUT_MS, temperature = 0.4, fetcher = fetch } = {}) {
  const controller = new AbortController();
  let timer;
  // Rejects when time is up even if a fetcher ignores the abort signal.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiError('network', 'The AI took too long to answer.'));
    }, timeout);
  });
  let data;
  try {
    data = await Promise.race([requestCompletion(ai, { model: ai.model, messages, temperature }, { signal: controller.signal, fetcher }), deadline]);
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError('network', 'Could not reach the AI. Check your connection and the address in Account.');
  } finally {
    clearTimeout(timer);
  }
  const text = contentText(data?.choices?.[0]?.message?.content).trim();
  if (!text) throw emptyAnswerError(data, ai.key);
  return text;
}

/**
 * Explains an answer that came back without text: a provider error in the body, a cut-off answer or plain emptiness.
 *
 * @param {object|null} data The parsed response.
 * @param {string} secret The configured AI key, masked in the message.
 * @returns {AiError} Kind auth or limit for a known error code, otherwise format.
 */
function emptyAnswerError(data, secret) {
  const failure = data?.error;
  // Providers such as OpenRouter report a refused key or an empty balance inside a 200 answer; treat it like the HTTP status.
  const status = Number(failure?.code);
  if (BODY_ERROR_STATUSES.includes(status)) return httpError(status, '', secret);
  // `error.message` is only shown when it is text: an object there would print as "[object Object]".
  const message = typeof failure?.message === 'string' ? failure.message.trim() : '';
  if (message) return new AiError('format', maskKeys(message, secret));
  if (data?.choices?.[0]?.finish_reason === 'length') return new AiError('format', OUT_OF_ROOM_MESSAGE);
  return new AiError('format', 'The AI sent back an empty answer.');
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
  if (status === 401) return new AiError('auth', 'The AI refused the key. Check it in Account.');
  if (status === 403) return new AiError('auth', 'The AI refused the request. Check the key in Account, or try another model.');
  if (status === 402) return new AiError('limit', 'This model needs credit on your OpenRouter account. Pick a free model in Account.');
  if (status === 404) return new AiError('http', 'The AI could not find this model. Check the model name in Account.');
  if (status === 429) return new AiError('limit', 'The AI is busy or your free requests for today are used up. Try again in a minute, or change the model in Account.');
  // Mask first, then cut, so a key cut in half by the limit can't slip through.
  const detail = clip(maskKeys(String(body).replace(/\s+/g, ' '), secret), DETAIL_MAX_CHARS);
  return new AiError('http', `The AI answered with an error (${status}).${detail ? ` ${detail}` : ''}`);
}

/** Languages the assistants can answer in (ISO 639-1 codes); the names come from the browser. */
export const AI_LANGUAGES = 'en cs sk de fr es it pt pl nl sv da nb fi hu ro bg hr sl sr uk ru el tr ar he hi zh ja ko vi id'.split(' ');

/**
 * A language's English name, as written into prompts: "cs" gives "Czech".
 *
 * @param {string} code Language code.
 * @param {string} [inLanguage] Language to name it in; "en" for prompts, the code itself for a native name.
 * @returns {string} The name, or "English" for an unknown code.
 */
export function languageName(code, inLanguage = 'en') {
  if (!AI_LANGUAGES.includes(code)) return 'English';
  try {
    const name = new Intl.DisplayNames([inLanguage], { type: 'language' }).of(code) || code;
    return name.charAt(0).toLocaleUpperCase(inLanguage) + name.slice(1);
  } catch {
    return code;
  }
}

// Newest notes first; whatever doesn't fit the budget is left out and the model is told so.
export function notesContext(notes, budget = NOTES_BUDGET) {
  const sorted = [...notes].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  let used = 0;
  const parts = [];
  for (const n of sorted) {
    const block = `### ${n.title || 'Untitled'}\n${n.body || ''}`.trim();
    if (used + block.length > budget) {
      const room = budget - used;
      // Cut by code point: a half emoji would be an invalid character in the request.
      if (room > 400) parts.push(`${clip(block, room)}\n[cut]`);
      break;
    }
    parts.push(block);
    used += block.length + 2;
  }
  return { text: parts.join('\n\n'), included: parts.length, total: notes.length };
}

/**
 * "Coming up in X" block: the next five events, or '' when there are none.
 *
 * @param {object} subject Subject (name is used).
 * @param {object[]} events Upcoming events of the subject, soonest first.
 * @returns {string} The block text or ''.
 */
export function upcomingLines(subject, events) {
  if (!events.length) return '';
  const lines = events.slice(0, 5).map(e => `- ${typeOf(e.type).label}: ${e.title} on ${e.date}${firstLine(e.description) ? ` (${firstLine(e.description)})` : ''}`);
  return `Coming up in ${subject.name}:\n${lines.join('\n')}`;
}

/**
 * The student's notes as a prompt block, newest first within the budget; '' when there are no notes.
 *
 * @param {object} subject Subject (name is used).
 * @param {object[]} notes Notes or lesson notes ({title, body, updated}).
 * @param {number} budget Maximum characters of note text.
 * @param {{ external?: boolean }} [options] `external`: wording and <<< >>> fences for a pasted prompt.
 * @returns {string} The block text or ''.
 */
export function notesBlock(subject, notes, budget, { external = false } = {}) {
  if (!notes?.length) return '';
  const ctx = notesContext(notes, budget);
  const cut = ctx.included < ctx.total ? ` (the ${ctx.included} most recent of ${ctx.total})` : '';
  return external
    ? `My notes for ${subject.name}${cut}:\n<<<\n${ctx.text}\n>>>`
    : `The student's own notes for ${subject.name}${cut}:\n\n${ctx.text}`;
}

/** The assistant's prompt with its {subject} placeholder filled; a function replacer keeps `$&` in a subject name literal. */
const fillSubject = (assistant, subject) => fillStudent(assistant.prompt.replaceAll('{subject}', () => subject.name));

/**
 * System message for the in-app chat: role, subject profile, style line for young students, language, tests and notes.
 *
 * @param {{ assistant: object, subject: object, notes?: object[], events?: object[], language?: string }} input
 * @returns {string} The system prompt.
 */
export function systemPrompt({ assistant, subject, notes, events = [], language = 'en' }) {
  return [
    fillSubject(assistant, subject),
    profileLine(subject),
    audienceText(),
    `Always answer in ${languageName(language)}, unless the student writes in another language and asks you to switch. Use Markdown: short paragraphs, bullet lists and **bold** key terms.`,
    upcomingLines(subject, events),
    notesBlock(subject, notes, NOTES_BUDGET),
  ].filter(Boolean).join('\n\n');
}

// ChatGPT, Gemini and Claude take much longer messages than free API models, so more notes fit.
export const EXTERNAL_NOTES_BUDGET = 60000;

/**
 * The same assistant as one message to paste into an outside AI: role, profile, style line for young students, language, tests, notes, and how to start.
 *
 * @param {{ assistant: object, subject: object, notes?: object[], events?: object[], language?: string }} input
 * @returns {string} The prompt to paste.
 */
export function externalPrompt({ assistant, subject, notes = [], events = [], language = 'en' }) {
  const start = assistant.needsNotes && !notes.length
    ? 'I will paste my notes in my next message. Reply with one short sentence asking for them.'
    : assistant.kickoff || 'Reply with one short sentence saying you are ready, then wait for my first message.';
  return [
    `I am ${studentText()}. This message sets up our chat about ${subject.name}. Your role:`,
    fillSubject(assistant, subject),
    profileLine(subject),
    audienceText(),
    `Always answer in ${languageName(language)}, unless I ask you to switch. Use short paragraphs, bullet lists and **bold** key terms.`,
    upcomingLines(subject, events),
    notesBlock(subject, notes, EXTERNAL_NOTES_BUDGET, { external: true }),
    start,
  ].filter(Boolean).join('\n\n');
}

export function buildMessages({ assistant, subject, notes, events, language, history }) {
  return [
    { role: 'system', content: systemPrompt({ assistant, subject, notes, events, language }) },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ];
}
