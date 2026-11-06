/**
 * Tests for js/ai.js and promptFor in js/study.js: subject profile and student style line in prompts,
 * `$&` safety, the chat() client (timeout over the body, array content, key rules, key masking, readable
 * errors) and the photo helpers.
 *
 * Responsibility: protect the AI client contract. No network: chat() gets a fake fetcher that records what
 * it was called with. Tests that change the locale or the AI settings restore them before they end, because
 * test files share that state.
 */
import { test, assert } from './harness.mjs';
import {
  chat, systemPrompt, externalPrompt, profileLine, httpError, maskKeys, notesContext, AiError,
  visionSettings, imageMessages, PHOTO_TIMEOUT_MS, PHOTO_MODEL_HINT, DEFAULT_AI,
} from '../../js/ai.js';
import { setupAppliedText } from '../../js/views/setup-apply.js';
import { promptFor } from '../../js/study.js';
import { store } from '../../js/store.js';
import { setLocale, studentText } from '../../js/locale.js';

/** Minimal AbortController stand-in: gjs has none (browsers and node do), and chat() needs one. */
globalThis.AbortController ??= class {
  signal = { aborted: false };

  abort() {
    this.signal.aborted = true;
  }
};

const ASSISTANT = { prompt: 'You tutor {subject}.', kickoff: 'Say hello.' };
const PROFILE = 'We use the red textbook and the teacher grades written tests strictly.';
const MESSAGES = [{ role: 'user', content: 'Hi' }];
const EVENT = { type: 'test', title: 'Unit test', date: '2026-12-01', description: 'Chapter 3' };

/** Builds a fake fetch that answers with `body` and records the call in `calls`. */
function fakeFetch(body, { ok = true, status = 200, calls = [] } = {}) {
  /** The fake fetch: records the call, returns the canned response. */
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return {
      ok,
      status,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
  fetcher.calls = calls;
  return fetcher;
}

const answer = content => ({ choices: [{ message: { content } }] });

/** Runs chat() and returns the rejection (fails the test when it resolves). */
async function chatError(ai, fetcher, options = {}) {
  try {
    await chat(ai, MESSAGES, { fetcher, ...options });
  } catch (e) {
    return e;
  }
  throw new Error('chat() should have rejected');
}

test('profileLine is empty without a profile and names the subject with one', () => {
  assert.equal(profileLine({ name: 'Math' }), '');
  assert.equal(profileLine({ name: 'Math', profile: '   ' }), '');
  assert.equal(profileLine({ name: 'Math', profile: PROFILE }), `About Math in my class: ${PROFILE}`);
});

test('systemPrompt has no profile line without a profile', () => {
  const text = systemPrompt({ assistant: ASSISTANT, subject: { name: 'Math' } });
  assert.ok(!text.includes('in my class'));
  assert.ok(text.startsWith('You tutor Math.\n\nAlways answer in English'));
});

test('systemPrompt puts the profile right after the assistant prompt', () => {
  const text = systemPrompt({ assistant: ASSISTANT, subject: { name: 'Math', profile: PROFILE }, events: [EVENT], notes: [{ title: 'N', body: 'b' }] });
  assert.ok(text.startsWith(`You tutor Math.\n\nAbout Math in my class: ${PROFILE}\n\nAlways answer`));
  assert.ok(text.includes('Coming up in Math:'));
  assert.ok(text.includes("The student's own notes for Math"));
});

test('externalPrompt has the profile after the role and none without one', () => {
  const plain = externalPrompt({ assistant: ASSISTANT, subject: { name: 'Math' } });
  assert.ok(!plain.includes('in my class'));
  assert.ok(plain.endsWith('Say hello.'));
  const withProfile = externalPrompt({ assistant: ASSISTANT, subject: { name: 'Math', profile: PROFILE }, notes: [{ title: 'N', body: 'b' }] });
  assert.ok(withProfile.includes(`You tutor Math.\n\nAbout Math in my class: ${PROFILE}\n\nAlways answer`));
  assert.ok(withProfile.includes('My notes for Math:\n<<<'));
});

test('a subject name with $& stays literal in prompts', () => {
  const subject = { name: 'Math $& more', plan: { template: 'general' } };
  assert.ok(systemPrompt({ assistant: ASSISTANT, subject }).startsWith('You tutor Math $& more.'));
  assert.ok(externalPrompt({ assistant: ASSISTANT, subject }).includes('You tutor Math $& more.'));
  const lesson = promptFor(subject);
  assert.ok(lesson.includes('Math $& more'));
  assert.ok(!lesson.includes('{subject}'));
});

test('promptFor adds the profile and plan.extra before the topics block', () => {
  const subject = { name: 'Chemistry', profile: PROFILE, plan: { template: 'general', extra: 'Stress units.' } };
  const text = promptFor(subject, { topics: ' acids ' });
  const profileAt = text.indexOf(`About Chemistry in my class: ${PROFILE}`);
  const extraAt = text.indexOf('\n\nStress units.');
  const topicsAt = text.indexOf('\n\nMY KEY TOPICS:\n<<<\nacids\n>>>');
  assert.ok(profileAt > 0 && extraAt > profileAt && topicsAt > extraAt);
});

test('promptFor is unchanged without profile and extra', () => {
  const subject = { name: 'Chemistry', plan: { template: 'general' } };
  const text = promptFor(subject);
  assert.ok(!text.includes('in my class'));
  assert.ok(!text.endsWith('\n'));
});

test('chat returns the trimmed answer text', async () => {
  assert.equal(await chat({ url: 'https://x.test/v1/', model: 'm' }, MESSAGES, { fetcher: fakeFetch(answer('  hi  ')) }), 'hi');
});

test('chat joins array-style content parts', async () => {
  const content = [{ type: 'text', text: 'Hello ' }, { type: 'image', url: 'x' }, { type: 'text', text: 'world' }];
  assert.equal(await chat({ url: 'https://x.test/v1', model: 'm' }, MESSAGES, { fetcher: fakeFetch(answer(content)) }), 'Hello world');
});

test('chat reports an empty answer as a format error', async () => {
  const e = await chatError({ url: 'https://x.test/v1', model: 'm' }, fakeFetch(answer([])));
  assert.ok(e instanceof AiError);
  assert.equal(e.kind, 'format');
});

test('chat times out when the body is slow, even if the fetcher ignores the abort signal', async () => {
  // Fake fetcher whose response body never arrives.
  const fetcher = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
  const e = await chatError({ url: 'https://x.test/v1', model: 'm' }, fetcher, { timeout: 20 });
  assert.equal(e.kind, 'network');
  assert.equal(e.message, 'The AI took too long to answer.');
});

test('chat aborts the request signal when the timeout hits', async () => {
  let signal;
  // Fake fetcher that keeps the abort signal and never answers.
  const fetcher = async (url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  };
  await chatError({ url: 'https://x.test/v1', model: 'm' }, fetcher, { timeout: 20 });
  assert.equal(signal.aborted, true);
});

test('chat reports an unreachable server as a network error', async () => {
  const e = await chatError({ url: 'https://x.test/v1', model: 'm' }, async () => { throw new TypeError('failed'); });
  assert.equal(e.kind, 'network');
});

test('chat sends no Authorization header to plain http on another host', async () => {
  const fetcher = fakeFetch(answer('ok'));
  await chat({ url: 'http://example.com/v1', key: 'sk-secret123', model: 'm' }, MESSAGES, { fetcher });
  assert.equal(fetcher.calls[0].init.headers.Authorization, undefined);
});

test('chat refuses to send the key to a host that only starts with localhost', async () => {
  const fetcher = fakeFetch(answer('ok'));
  await chat({ url: 'http://localhost.evil.test/v1', key: 'k', model: 'm' }, MESSAGES, { fetcher });
  assert.equal(fetcher.calls[0].init.headers.Authorization, undefined);
});

test('chat sends the key over https, and over http to localhost and 127.0.0.1', async () => {
  for (const url of ['https://openrouter.ai/api/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:1234/v1']) {
    const fetcher = fakeFetch(answer('ok'));
    await chat({ url, key: 'k', model: 'm' }, MESSAGES, { fetcher });
    assert.equal(fetcher.calls[0].init.headers.Authorization, 'Bearer k');
  }
});

test('chat posts to the completions address without a double slash', async () => {
  const fetcher = fakeFetch(answer('ok'));
  await chat({ url: 'https://x.test/v1//', model: 'm' }, MESSAGES, { fetcher });
  assert.equal(fetcher.calls[0].url, 'https://x.test/v1/chat/completions');
});

test('http error text masks anything shaped like an sk- key', async () => {
  const e = await chatError({ url: 'https://x.test/v1', model: 'm' }, fakeFetch('Bad key sk-or-v1-abcdef123456 given', { ok: false, status: 400 }));
  assert.ok(e.message.includes('(400)'));
  assert.ok(!e.message.includes('abcdef123456'));
  assert.ok(e.message.includes('sk-***'));
});

test('httpError masks a key before cutting the excerpt', () => {
  const body = `${'x '.repeat(65)}sk-abcdefghijklmnopqrstuvwxyz`;
  assert.ok(!httpError(500, body).message.includes('sk-abcdefgh'));
});

test('format error from the provider masks keys too', async () => {
  const e = await chatError({ url: 'https://x.test/v1', model: 'm' }, fakeFetch({ error: { message: 'Invalid key sk-live-9999aaaa' } }));
  assert.equal(e.kind, 'format');
  assert.ok(!e.message.includes('9999aaaa'));
});

test('chat masks the exact configured key in error text, whatever its shape', async () => {
  const ai = { url: 'https://x.test/v1', model: 'm', key: 'AbC-123-key' };
  const http = await chatError(ai, fakeFetch('Invalid key AbC-123-key', { ok: false, status: 400 }));
  assert.ok(!http.message.includes('AbC-123-key'));
  const format = await chatError(ai, fakeFetch({ error: { message: 'Key AbC-123-key rejected' } }));
  assert.ok(!format.message.includes('AbC-123-key'));
});

test('a key shorter than 6 characters is not masked by value', () => {
  assert.equal(maskKeys('the abc word', 'abc'), 'the abc word');
});

test('setupAppliedText mentions lessons only when some were added', () => {
  assert.equal(setupAppliedText({ name: 'Chemistry' }, { lessons: 0 }), 'Chemistry is set up.');
  assert.equal(setupAppliedText({ name: 'Computer science' }, { lessons: 1 }), 'Computer science is set up and 1 lesson added.');
});

test('chat maps an error code in a 200 answer like the same HTTP status', async () => {
  const ai = { url: 'https://x.test/v1', model: 'm' };
  const auth = await chatError(ai, fakeFetch({ error: { code: 401, message: 'No auth credentials found' } }));
  assert.equal(auth.kind, 'auth');
  assert.equal(auth.message, 'The AI refused the key. Check it in Account.');
  const limit = await chatError(ai, fakeFetch({ error: { code: '429', message: 'Rate limited' } }));
  assert.equal(limit.kind, 'limit');
  assert.equal((await chatError(ai, fakeFetch({ error: { code: 402 } }))).kind, 'limit');
  assert.equal((await chatError(ai, fakeFetch({ error: { code: 403 } }))).kind, 'auth');
});

test('a 403 says the request was refused, a 401 says the key was', () => {
  assert.equal(httpError(403).message, 'The AI refused the request. Check the key in Account, or try another model.');
  assert.equal(httpError(401).message, 'The AI refused the key. Check it in Account.');
  assert.equal(httpError(403).kind, 'auth');
});

test('an error message that is not text never prints as [object Object]', async () => {
  const ai = { url: 'https://x.test/v1', model: 'm' };
  const e = await chatError(ai, fakeFetch({ error: { message: { detail: 'nested' } } }));
  assert.equal(e.kind, 'format');
  assert.equal(e.message, 'The AI sent back an empty answer.');
  const plain = await chatError(ai, fakeFetch({ error: { code: 500, message: 'Upstream failed' } }));
  assert.equal(plain.message, 'Upstream failed');
});

test('an answer cut off before any text says the model ran out of room', async () => {
  const body = { choices: [{ message: { content: '' }, finish_reason: 'length' }] };
  const e = await chatError({ url: 'https://x.test/v1', model: 'm' }, fakeFetch(body));
  assert.equal(e.kind, 'format');
  assert.equal(e.message, 'The AI ran out of room before finishing. Try again, or pick a model with a larger limit in Account.');
});

test('a cut-off answer that has some text is still returned', async () => {
  const body = { choices: [{ message: { content: 'Half an ans' }, finish_reason: 'length' }] };
  assert.equal(await chat({ url: 'https://x.test/v1', model: 'm' }, MESSAGES, { fetcher: fakeFetch(body) }), 'Half an ans');
});

test('the error excerpt of an unknown HTTP error is cut without splitting an emoji', () => {
  const body = `${'x'.repeat(139)}😀 more`;
  const detail = httpError(500, body).message;
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(detail));
  assert.ok(detail.includes('😀'));
});

test('notesContext cuts a long note by code point', () => {
  const note = { title: 'Emoji', body: `${'a'.repeat(996)}${'😀'.repeat(10)}`, updated: 1 };
  const { text } = notesContext([note], 1000);
  assert.ok(text.endsWith('[cut]'));
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text));
});

test('photo constants: a longer timeout and a hint that names the setting', () => {
  assert.equal(PHOTO_TIMEOUT_MS, 150000);
  assert.ok(PHOTO_MODEL_HINT.includes('Photo model'));
  assert.equal(DEFAULT_AI.visionModel, '');
});

test('imageMessages sends the text first, then one image_url part per photo', () => {
  const messages = imageMessages('Check this', ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB']);
  assert.deepEqual(messages, [{
    role: 'user',
    content: [
      { type: 'text', text: 'Check this' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BBB' } },
    ],
  }]);
  assert.deepEqual(imageMessages('Only text', [])[0].content, [{ type: 'text', text: 'Only text' }]);
});

test('systemPrompt and externalPrompt add the style line for a young student after the profile', () => {
  setLocale({ language: 'en', country: 'DE', student: { age: 7 } });
  try {
    const subject = { name: 'Math', profile: PROFILE };
    const style = 'The student is about 7 years old and still learning to read and write';
    const system = systemPrompt({ assistant: ASSISTANT, subject });
    assert.ok(system.indexOf(style) > system.indexOf('About Math in my class') && system.indexOf(style) < system.indexOf('Always answer'));
    const external = externalPrompt({ assistant: ASSISTANT, subject });
    assert.ok(external.indexOf(style) > external.indexOf('About Math in my class') && external.indexOf(style) < external.indexOf('Always answer'));
    assert.ok(external.startsWith(`I am ${studentText()}.`));
  } finally {
    setLocale({});
  }
});

test('systemPrompt has no style line for a student of 15 or older', () => {
  setLocale({ language: 'en', student: { age: 17 } });
  try {
    assert.ok(!systemPrompt({ assistant: ASSISTANT, subject: { name: 'Math' } }).includes('The student is'));
  } finally {
    setLocale({});
  }
});

test('visionSettings uses the photo model when set and the main model when empty or blank', () => {
  const previous = store.settings.ai;
  try {
    store.settings.ai = { ...DEFAULT_AI, model: 'main-model', visionModel: '  photo-model ' };
    assert.equal(visionSettings().model, 'photo-model');
    store.settings.ai = { ...DEFAULT_AI, model: 'main-model', visionModel: '   ' };
    assert.equal(visionSettings().model, 'main-model');
    store.settings.ai = { url: 'https://x.test/v1', model: 'main-model' };
    assert.equal(visionSettings().model, 'main-model');
    assert.equal(visionSettings().url, 'https://x.test/v1');
  } finally {
    store.settings.ai = previous;
  }
});
