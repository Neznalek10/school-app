/**
 * Tests for js/github.js and js/github-sync.js: repository parsing, the data file format, sync planning, and
 * save, load and automatic sync against a fake GitHub contents API.
 */
import { test, assert } from './harness.mjs';
import {
  parseRepo, isSafePath, encodeBase64, decodeBase64, buildDataFile, parseDataFile, planSync, fetchRemote, pushRemote, GitHubError,
} from '../../js/github.js';
import {
  SETTINGS_KEY, readGitHub, configureGitHub, saveNow, loadNow, checkNow, isConfigured,
} from '../../js/github-sync.js';
import { base64ToBytes, bytesToBase64 } from '../../js/text.js';

/**
 * A Map-backed stand-in for localStorage.
 *
 * @param {Record<string, string>} [initial] Starting contents.
 * @returns {Storage} The fake.
 */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    key: index => [...map.keys()][index] ?? null,
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
  };
}

/**
 * A fake GitHub holding one repository with at most one file, answering like the contents API.
 *
 * @param {{ repoExists?: boolean, status?: number }} [options] `status` forces every answer to that status.
 * @returns {{ fetcher: typeof fetch, file: { sha: string, text: string } | null, calls: object[] }} The fake.
 */
function fakeGitHub({ repoExists = true, status = 0 } = {}) {
  const github = { file: null, calls: [], version: 0 };
  /**
   * Builds a minimal Response stand-in.
   *
   * @param {number} code HTTP status.
   * @param {unknown} body JSON body, or a string for raw text.
   * @returns {object} The response.
   */
  const reply = (code, body) => ({
    ok: code >= 200 && code < 300,
    status: code,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  github.fetcher = async (url, init) => {
    github.calls.push({ url, ...init });
    if (status) return reply(status, {});
    if (!url.includes('/contents/')) return reply(repoExists ? 200 : 404, {});
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body);
      // GitHub refuses a write whose sha is not the current one (or a create when the file exists).
      if ((github.file?.sha || '') !== (body.sha || '')) return reply(409, {});
      github.version += 1;
      github.file = { sha: `sha${github.version}`, text: decodeBase64(body.content) };
      return reply(201, { content: { sha: github.file.sha } });
    }
    if (!github.file) return reply(404, {});
    if (init.headers.Accept === 'application/vnd.github.raw+json') return reply(200, github.file.text);
    return reply(200, { sha: github.file.sha, encoding: 'base64', content: encodeBase64(github.file.text) });
  };
  return github;
}

/** A device with one account and an OpenRouter key that must never be uploaded. */
const deviceData = () => ({
  'school.accounts': JSON.stringify([{ id: 'a1', name: 'User' }]),
  'school.a1.notes': JSON.stringify([{ id: 'n1', title: 'Příliš žluťoučký kůň 😀' }]),
  'school.a1.settings': JSON.stringify({ ai: { url: 'https://openrouter.ai/api/v1', key: 'sk-or-secret-123', model: 'm' } }),
  'school-sync.meta': '{"revision":3}',
});

/**
 * A configured device.
 *
 * @param {Record<string, string>} [data] Starting storage.
 * @returns {Storage} The storage with GitHub settings.
 */
function setUpDevice(data = deviceData()) {
  const storage = fakeStorage(data);
  configureGitHub(storage, { repo: 'user/school-data', token: 'ghp_token' });
  return storage;
}

test('parseRepo reads owner/name and github.com addresses and rejects anything else', () => {
  assert.deepEqual(parseRepo('user/school-data'), { owner: 'user', repo: 'school-data' });
  assert.deepEqual(parseRepo(' https://github.com/user/school-data.git/ '), { owner: 'user', repo: 'school-data' });
  assert.equal(parseRepo('user'), null);
  assert.equal(parseRepo('user/repo/extra'), null);
  assert.equal(parseRepo('../etc'), null);
  assert.equal(parseRepo('user/a..b'), null);
  assert.equal(parseRepo('us er/repo'), null);
  assert.equal(parseRepo(42), null);
});

test('isSafePath accepts relative .json paths and rejects traversal and other files', () => {
  assert.ok(isSafePath('school-data.json'));
  assert.ok(isSafePath('backup/phone.json'));
  assert.ok(!isSafePath('../school-data.json'));
  assert.ok(!isSafePath('/school-data.json'));
  assert.ok(!isSafePath('data.txt'));
  assert.ok(!isSafePath('a/../b.json'));
});

test('base64 helpers round-trip UTF-8 text with Czech letters and emoji', () => {
  const text = 'Příliš žluťoučký kůň 😀\n{"a":1}';
  assert.equal(decodeBase64(encodeBase64(text)), text);
  assert.equal(decodeBase64('SGVs\nbG8='), 'Hello');
  assert.equal(bytesToBase64(base64ToBytes('AAEC/w==')), 'AAEC/w==');
  assert.throws(() => base64ToBytes('ab$c'), /base64/);
});

test('the data file has the local server\'s header and parses back', () => {
  const text = buildDataFile({ 'school.x': { a: 1 } }, { revision: 4, now: new Date('2026-11-10T08:00:00Z') });
  const parsed = parseDataFile(text);
  assert.equal(parsed.revision, 4);
  assert.equal(parsed.savedAt, '2026-11-10T08:00:00.000Z');
  assert.deepEqual(parsed.entries, { 'school.x': { a: 1 } });
  assert.match(text, /"app": "school-app"/);
});

test('parseDataFile rejects text that is not a School app data file', () => {
  assert.throws(() => parseDataFile('not json'), GitHubError);
  assert.throws(() => parseDataFile('{"app":"other","format":1,"entries":{}}'), /not a School app data file/);
  assert.throws(() => parseDataFile('{"app":"school-app","format":1,"entries":[]}'), GitHubError);
});

test('planSync saves new local work, loads new remote work and asks when both changed', () => {
  assert.equal(planSync({ remoteSha: '', knownSha: '', localHash: 'h', knownHash: '' }), 'save');
  assert.equal(planSync({ remoteSha: 's1', knownSha: 's1', localHash: 'h', knownHash: 'h' }), 'none');
  assert.equal(planSync({ remoteSha: 's1', knownSha: 's1', localHash: 'h2', knownHash: 'h' }), 'save');
  assert.equal(planSync({ remoteSha: 's2', knownSha: 's1', localHash: 'h', knownHash: 'h' }), 'load');
  assert.equal(planSync({ remoteSha: 's2', knownSha: 's1', localHash: 'h2', knownHash: 'h' }), 'conflict');
  // A device that never synced with an existing file must not overwrite or replace it silently.
  assert.equal(planSync({ remoteSha: 's1', knownSha: '', localHash: 'h', knownHash: '' }), 'conflict');
});

test('fetchRemote returns null for a missing file and an error for a missing repository', async () => {
  const settings = { owner: 'user', repo: 'school-data', path: 'school-data.json', token: 't' };
  assert.equal(await fetchRemote(settings, { fetcher: fakeGitHub().fetcher }), null);
  const error = await fetchRemote(settings, { fetcher: fakeGitHub({ repoExists: false }).fetcher }).catch(e => e);
  assert.equal(error.kind, 'notfound');
});

test('requests carry the token only to api.github.com and encode the file path', async () => {
  const github = fakeGitHub();
  const settings = { owner: 'user', repo: 'school-data', path: 'backup/phone.json', token: 'ghp_x' };
  await pushRemote(settings, '{}', { fetcher: github.fetcher });
  const call = github.calls[0];
  assert.equal(call.url, 'https://api.github.com/repos/user/school-data/contents/backup/phone.json');
  assert.equal(call.headers.Authorization, 'Bearer ghp_x');
  assert.equal(call.method, 'PUT');
});

test('a wrong token gives an auth error the student can act on', async () => {
  const settings = { owner: 'user', repo: 'r', path: 'school-data.json', token: 'bad' };
  const error = await fetchRemote(settings, { fetcher: fakeGitHub({ status: 401 }).fetcher }).catch(e => e);
  assert.equal(error.kind, 'auth');
});

test('configureGitHub validates input and keeps the token out of tracked storage', () => {
  const storage = fakeStorage();
  assert.throws(() => configureGitHub(storage, { repo: 'nope', token: 't' }), /owner\/name/);
  assert.throws(() => configureGitHub(storage, { repo: 'u/r', path: '../x.json', token: 't' }), /\.json/);
  assert.throws(() => configureGitHub(storage, { repo: 'u/r', token: ' ' }), /token/);
  configureGitHub(storage, { repo: 'u/r', token: 'ghp_t' });
  assert.ok(isConfigured(readGitHub(storage)));
  assert.ok(!SETTINGS_KEY.startsWith('school.'), 'settings key is outside the tracked prefixes');
});

test('saveNow uploads the data without AI keys or untracked keys', async () => {
  const storage = setUpDevice();
  const github = fakeGitHub();
  assert.equal(await saveNow({ storage, fetcher: github.fetcher }), 'saved');
  assert.ok(!github.file.text.includes('sk-or-secret-123'), 'AI key not uploaded');
  assert.ok(!github.file.text.includes('ghp_token'), 'GitHub token not uploaded');
  assert.ok(!github.file.text.includes('school-sync.meta'), 'bookkeeping not uploaded');
  assert.ok(github.file.text.includes('Příliš žluťoučký kůň 😀'));
  assert.equal(readGitHub(storage).sha, 'sha1');
  assert.equal(await saveNow({ storage, fetcher: github.fetcher }), 'unchanged');
});

test('saveNow refuses to overwrite another device\'s newer save unless forced', async () => {
  const github = fakeGitHub();
  const phone = setUpDevice();
  await saveNow({ storage: phone, fetcher: github.fetcher });
  const laptop = setUpDevice();
  await loadNow({ storage: laptop, fetcher: github.fetcher });
  laptop.setItem('school.a1.notes', '[]');
  await saveNow({ storage: laptop, fetcher: github.fetcher });
  phone.setItem('school.a1.notes', '[{"id":"n2"}]');
  assert.equal(await saveNow({ storage: phone, fetcher: github.fetcher }), 'conflict');
  assert.ok(readGitHub(phone).conflict);
  assert.equal(github.file.text.includes('n2'), false, 'GitHub kept the laptop version');
  assert.equal(await saveNow({ storage: phone, fetcher: github.fetcher, force: true }), 'saved');
  assert.ok(github.file.text.includes('n2'));
});

test('loadNow replaces the data but keeps this device\'s AI key and its own bookkeeping', async () => {
  const github = fakeGitHub();
  const phone = setUpDevice();
  await saveNow({ storage: phone, fetcher: github.fetcher });
  const laptop = setUpDevice({
    'school.a1.settings': JSON.stringify({ ai: { url: 'https://openrouter.ai/api/v1', key: 'sk-or-laptop-456', model: 'm' } }),
    'school.old': '"remove me"',
    'school-sync.meta': '{"revision":9}',
  });
  assert.equal(await loadNow({ storage: laptop, fetcher: github.fetcher }), 'loaded');
  assert.equal(laptop.getItem('school.old'), null);
  assert.ok(laptop.getItem('school.a1.notes').includes('Příliš'));
  assert.equal(JSON.parse(laptop.getItem('school.a1.settings')).ai.key, 'sk-or-laptop-456');
  assert.equal(laptop.getItem('school-sync.meta'), '{"revision":9}');
  assert.equal(await checkNow({ storage: laptop, fetcher: github.fetcher }), 'none', 'in step after a load');
});

test('checkNow saves local work, loads remote work, and stops at a conflict', async () => {
  const github = fakeGitHub();
  const phone = setUpDevice();
  assert.equal(await checkNow({ storage: phone, fetcher: github.fetcher }), 'saved', 'first sync to an empty repository');
  const laptop = setUpDevice({});
  assert.equal(await checkNow({ storage: laptop, fetcher: github.fetcher }), 'conflict', 'never synced, file exists');
  await loadNow({ storage: laptop, fetcher: github.fetcher });
  laptop.setItem('school.a1.notes', '[{"id":"laptop"}]');
  assert.equal(await checkNow({ storage: laptop, fetcher: github.fetcher, allowLoad: false }), 'saved');
  assert.equal(await checkNow({ storage: phone, fetcher: github.fetcher, allowLoad: false }), 'none', 'no load while working');
  assert.equal(await checkNow({ storage: phone, fetcher: github.fetcher }), 'loaded');
  assert.ok(phone.getItem('school.a1.notes').includes('laptop'));
});

test('checkNow does nothing when GitHub sync is not set up or turned off', async () => {
  assert.equal(await checkNow({ storage: fakeStorage(), fetcher: fakeGitHub().fetcher }), 'off');
  const storage = setUpDevice();
  storage.setItem(SETTINGS_KEY, JSON.stringify({ ...readGitHub(storage), auto: false }));
  assert.equal(await checkNow({ storage, fetcher: fakeGitHub().fetcher }), 'off');
});
