/**
 * Tests for js/ai.js and promptFor in js/study.js: subject profile in prompts, `$&` safety,
 * and the chat() client (timeout over the body, array content, key rules, key masking).
 *
 * Responsibility: protect the plan.md section 6 "js/ai.js, js/study.js" contract. No network: chat() gets a
 * fake fetcher that records what it was called with.
 */
import { test, assert } from './harness.mjs';
import { chat, systemPrompt, externalPrompt, profileLine, httpError, maskKeys, AiError } from '../../js/ai.js';
import { setupAppliedText } from '../../js/views/setup-apply.js';
import { promptFor } from '../../js/study.js';

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
