/**
 * Tests for the French and Vocab apps' hardening: parseBackup drops settings.ai from a file,
 * and the French AI client only sends the key to https or local addresses.
 */
import { test, assert } from './harness.mjs';
import { parseBackup as parseFrench } from '../../apps/french/js/backup.js';
import { parseBackup as parseVocab } from '../../apps/vocab/js/backup.js';
import { isKeySafeUrl, chat } from '../../apps/french/js/ai.js';

/** Backup text for one app with a hostile ai object and a harmless setting. */
const hostile = app => JSON.stringify({
  app, format: 1, account: { name: 'User' },
  data: { settings: { theme: 'dark', ai: { url: 'https://evil.example/v1', key: 'sk-x', model: 'm' } } },
});

test('French parseBackup drops settings.ai and keeps other settings', () => {
  assert.deepEqual(parseFrench(hostile('vocab')).data.settings, { theme: 'dark' });
});

test('Vocab parseBackup drops settings.ai and keeps other settings', () => {
  assert.deepEqual(parseVocab(hostile('vocab2')).data.settings, { theme: 'dark' });
});

test('isKeySafeUrl accepts https and local http only', () => {
  for (const url of ['https://openrouter.ai/api/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', ' HTTPS://x.example']) {
    assert.ok(isKeySafeUrl(url), url);
  }
  for (const url of ['http://example.com/v1', 'http://localhost.evil.com/v1', 'ftp://x', '', 'javascript:1']) {
    assert.ok(!isKeySafeUrl(url), url);
  }
});

test('French chat sends the key over https but not over plain http', async () => {
  const sent = [];
  /** Fake fetch that records the Authorization header and answers with a one-word completion. */
  const fetcher = async (url, init) => {
    sent.push(init.headers.Authorization);
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'hi' } }] }) };
  };
  await chat({ url: 'https://ok.example/v1', key: 'k', model: 'm' }, [], { fetcher });
  await chat({ url: 'http://ok.example/v1', key: 'k', model: 'm' }, [], { fetcher });
  assert.deepEqual(sent, ['Bearer k', undefined]);
});

test('French chat masks the key and sk- strings in provider error text', async () => {
  const body = 'bad key sk-or-v1-abc123 and also my-secret-key here';
  const fetcher = async () => ({ ok: false, status: 400, text: async () => body });
  const error = await chat({ url: 'https://ok.example/v1', key: 'my-secret-key', model: 'm' }, [], { fetcher }).catch(e => e);
  assert.ok(!error.message.includes('abc123'));
  assert.ok(!error.message.includes('my-secret-key'));
  assert.match(error.message, /sk-\*\*\*/);
});

test('French chat masks the key inside an error object of a 200 answer', async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({ error: { message: 'rejected sk-live-999' } }) });
  const error = await chat({ url: 'https://ok.example/v1', key: '', model: 'm' }, [], { fetcher }).catch(e => e);
  assert.equal(error.message, 'rejected sk-***');
});

/** Fake localStorage so the French store can persist inside a test. */
function fakeStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}

test('French createAccount and restoreAccount store a default ai block, never the file\'s', async () => {
  globalThis.localStorage = fakeStorage();
  const { store } = await import('../../apps/french/js/store.js');
  const created = store.createAccount('One');
  store.useAccount(created.id);
  assert.equal(store.settings.ai.url, 'https://openrouter.ai/api/v1');
  assert.deepEqual(JSON.parse(localStorage.getItem(`school-fr.${created.id}.settings`)).ai, { url: 'https://openrouter.ai/api/v1', key: '', model: 'openrouter/free' });
  const { data } = parseFrench(hostile('vocab'));
  const restored = store.restoreAccount('Two', data);
  const saved = JSON.parse(localStorage.getItem(`school-fr.${restored.id}.settings`));
  assert.equal(saved.theme, 'dark');
  assert.equal(saved.ai.url, 'https://openrouter.ai/api/v1');
  assert.equal(saved.ai.key, '');
  delete globalThis.localStorage;
});
