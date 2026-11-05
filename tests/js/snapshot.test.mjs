/**
 * Unit tests for js/sync/snapshot.js: key tracking, lossless value encoding, snapshots, secret
 * redaction, filling, blanking and preserving untrusted keys, canonical comparison and the sync meta record.
 *
 * Where it fits: registered with the shared harness (tests/js/harness.mjs) and run by tests/js/run.mjs
 * under gjs or node. Storage is replaced by a small Map-backed fake, so no browser globals are used.
 */
import { test, assert } from './harness.mjs';
import {
  TRACKED_PREFIXES,
  META_KEY,
  TRUSTED_KEY_HOSTS,
  isTracked,
  encodeValue,
  decodeValue,
  takeSnapshot,
  applySnapshot,
  redactSecrets,
  fillSecrets,
  blankTrustedKeys,
  collectUntrustedKeys,
  restoreUntrustedKeys,
  canonical,
  contentHash,
  readMeta,
  writeMeta,
} from '../../js/sync/snapshot.js';

/**
 * Creates a Map-backed stand-in for the Web Storage interface.
 *
 * @param {Record<string, string>} [initial] Starting contents.
 * @returns {{getItem: Function, setItem: Function, removeItem: Function, key: Function, clear: Function, length: number}}
 *   A fake storage; `setItem` stores String(value) like the real one.
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

/** A plausible AI settings object as the apps store it. */
const aiConfig = (key, url = 'https://openrouter.ai/api/v1') => ({ url, key, model: 'm' });

/**
 * Stores an AI config under a tracked key and returns the fake storage.
 *
 * @param {object} config The AI config object.
 * @returns {ReturnType<typeof fakeStorage>} Storage holding it as JSON under 'school.settings'.
 */
function storageWithAi(config) {
  return fakeStorage({ 'school.settings': JSON.stringify({ ai: config }) });
}

/**
 * Reads the AI config back from the storage made by storageWithAi.
 *
 * @param {ReturnType<typeof fakeStorage>} storage The storage.
 * @returns {object} The stored AI config.
 */
const storedAi = storage => JSON.parse(storage.getItem('school.settings')).ai;

test('isTracked accepts the three data prefixes and rejects everything else', () => {
  assert.deepEqual(TRACKED_PREFIXES, ['school.', 'school-fr.', 'vocab2.']);
  assert.ok(isTracked('school.account.a1'));
  assert.ok(isTracked('school-fr.progress'));
  assert.ok(isTracked('vocab2.words'));
  assert.ok(!isTracked(META_KEY));
  assert.ok(!isTracked('school'));
  assert.ok(!isTracked('other.key'));
  assert.ok(!isTracked(''));
});

test('encodeValue parses exact JSON text', () => {
  assert.deepEqual(encodeValue('{"a":[1,2,{"b":null}]}'), { a: [1, 2, { b: null }] });
  assert.equal(encodeValue('42'), 42);
  assert.equal(encodeValue('"text"'), 'text');
  assert.equal(encodeValue('true'), true);
  assert.equal(encodeValue('null'), null);
});

test('encodeValue keeps text that is not byte-exact JSON as $raw', () => {
  for (const text of ['hello', '', '{ "a": 1 }', '1.0', '-0', '{"a":1,"a":2}', '[1, 2]', '"\\u0041"', ' 5']) {
    assert.deepEqual(encodeValue(text), { $raw: text }, `expected $raw for ${JSON.stringify(text)}`);
  }
});

test('encodeValue wraps parsed objects that already have a $raw key', () => {
  const text = '{"$raw":"x"}';
  assert.deepEqual(encodeValue(text), { $raw: text });
});

test('every string round-trips byte for byte through encodeValue and decodeValue', () => {
  const samples = [
    '{"name":"Příliš žluťoučký kůň","n":[1,2.5,-3e2]}',
    '{ "pretty": true }',
    'plain text',
    '',
    '1.0',
    '{"$raw":"x"}',
    '{"$raw":1}',
    '{"__proto__":{"x":1}}',
    '"\u{1F600}"',
    'null',
    '[]',
  ];
  for (const text of samples) {
    assert.equal(decodeValue(encodeValue(text)), text, `round trip of ${JSON.stringify(text)}`);
  }
});

test('decodeValue treats an object with extra keys next to $raw as ordinary JSON', () => {
  assert.equal(decodeValue({ $raw: 'a', other: 1 }), '{"$raw":"a","other":1}');
  assert.equal(decodeValue({ $raw: 5 }), '{"$raw":5}');
});

test('takeSnapshot returns only tracked keys, sorted, with encoded values', () => {
  const storage = fakeStorage({
    'vocab2.b': '{"x":1}',
    'unrelated': '1',
    [META_KEY]: '{"revision":3,"dirty":false}',
    'school.z': 'not json',
    'school-fr.a': '[1]',
  });
  const snapshot = takeSnapshot(storage);
  assert.deepEqual(Object.keys(snapshot), ['school-fr.a', 'school.z', 'vocab2.b']);
  assert.deepEqual(snapshot, {
    'school-fr.a': [1],
    'school.z': { $raw: 'not json' },
    'vocab2.b': { x: 1 },
  });
});

test('takeSnapshot of empty storage is an empty object', () => {
  assert.deepEqual(takeSnapshot(fakeStorage()), {});
});

test('applySnapshot writes entries, removes missing tracked keys and leaves untracked keys alone', () => {
  const storage = fakeStorage({
    'school.old': '1',
    'school.keep': '{"a":1}',
    'vocab2.gone': '2',
    unrelated: 'stay',
    [META_KEY]: '{"revision":4,"dirty":true}',
  });
  applySnapshot(storage, { 'school.keep': { a: 2 }, 'school.new': { $raw: 'plain' } });
  assert.equal(storage.getItem('school.old'), null);
  assert.equal(storage.getItem('vocab2.gone'), null);
  assert.equal(storage.getItem('school.keep'), '{"a":2}');
  assert.equal(storage.getItem('school.new'), 'plain');
  assert.equal(storage.getItem('unrelated'), 'stay');
  assert.equal(storage.getItem(META_KEY), '{"revision":4,"dirty":true}');
});

test('applySnapshot ignores untracked keys inside the entries', () => {
  const storage = fakeStorage({ [META_KEY]: '{"revision":1,"dirty":false}' });
  applySnapshot(storage, { [META_KEY]: { revision: 99, dirty: true }, other: 'x' });
  assert.equal(storage.getItem(META_KEY), '{"revision":1,"dirty":false}');
  assert.equal(storage.getItem('other'), null);
});

test('applySnapshot removes every tracked key even when many are deleted in one call', () => {
  const initial = {};
  for (let index = 0; index < 20; index += 1) initial[`school.k${index}`] = String(index);
  const storage = fakeStorage(initial);
  applySnapshot(storage, {});
  assert.equal(storage.length, 0);
});

test('takeSnapshot after applySnapshot reproduces the original entries and strings', () => {
  const source = fakeStorage({ 'school.a': '{"x":"ž"}', 'vocab2.b': 'raw  text', 'school-fr.c': '{ "p": 1 }' });
  const target = fakeStorage();
  applySnapshot(target, takeSnapshot(source));
  for (const key of ['school.a', 'vocab2.b', 'school-fr.c']) {
    assert.equal(target.getItem(key), source.getItem(key));
  }
});

test('redactSecrets blanks AI keys in a deep copy and reports distinct found keys', () => {
  const entries = {
    'school.settings': { ai: aiConfig('sk-one'), theme: 'dark' },
    'school-fr.settings': { nested: [{ ai: aiConfig('sk-two', 'http://localhost:11434/v1') }] },
    'vocab2.cfg': { url: 'https://x.test', key: 'sk-one' },
  };
  const before = JSON.stringify(entries);
  const result = redactSecrets(entries);
  assert.equal(JSON.stringify(entries), before, 'input must not change');
  assert.equal(result.entries['school.settings'].ai.key, '');
  assert.equal(result.entries['school.settings'].theme, 'dark');
  assert.equal(result.entries['school-fr.settings'].nested[0].ai.key, '');
  assert.equal(result.entries['vocab2.cfg'].key, '');
  assert.deepEqual(result.found, ['sk-one', 'sk-two']);
});

test('redactSecrets lists keys under school. first and keeps the input key order', () => {
  const entries = {
    'school-fr.a': aiConfig('sk-fr'),
    'school.b': aiConfig('sk-dash'),
    'vocab2.c': aiConfig('sk-vocab'),
  };
  const result = redactSecrets(entries);
  assert.deepEqual(result.found, ['sk-dash', 'sk-fr', 'sk-vocab']);
  assert.deepEqual(Object.keys(result.entries), ['school-fr.a', 'school.b', 'vocab2.c']);
});

test('redactSecrets leaves non-AI objects and empty keys alone', () => {
  const entries = {
    'school.a': { key: 'not-ai-because-no-url-or-model' },
    'school.b': aiConfig(''),
    'school.c': { url: 'x', key: 5 },
    'school.d': { $raw: 'sk-secret text' },
  };
  const result = redactSecrets(entries);
  assert.deepEqual(result.entries, entries);
  assert.deepEqual(result.found, []);
});

test('redactSecrets returns copies that do not share objects with the input', () => {
  const entries = { 'school.a': { list: [{ n: 1 }] } };
  const result = redactSecrets(entries);
  result.entries['school.a'].list[0].n = 2;
  assert.equal(entries['school.a'].list[0].n, 1);
});

test('fillSecrets fills empty keys with a missing, empty or openrouter url', () => {
  const urls = [undefined, '', '   ', 'https://openrouter.ai/api/v1', 'https://OpenRouter.ai/api', 'https://api.openrouter.ai:443/v1'];
  for (const url of urls) {
    const config = { model: 'm', key: '' };
    if (url !== undefined) config.url = url;
    const storage = storageWithAi(config);
    assert.equal(fillSecrets(storage, 'sk-env'), true, `url ${JSON.stringify(url)}`);
    assert.equal(storedAi(storage).key, 'sk-env');
  }
});

test('fillSecrets never fills a config that points anywhere else', () => {
  const urls = [
    'https://example.com/v1',
    'http://openrouter.ai/api/v1',
    'http://localhost:11434/v1',
    'https://evilopenrouter.ai/v1',
    'https://openrouter.ai.evil.example/v1',
    'https://openrouter.ai@evil.example/v1',
    'https://openrouter.ai\\.evil.example/v1',
    'https://evil.example/?u=openrouter.ai',
    'ftp://openrouter.ai/',
    'not a url',
  ];
  for (const url of urls) {
    const storage = storageWithAi(aiConfig('', url));
    const before = storage.getItem('school.settings');
    assert.equal(fillSecrets(storage, 'sk-env'), false, `url ${url}`);
    assert.equal(storage.getItem('school.settings'), before);
  }
});

test('fillSecrets keeps existing keys, ignores an empty aiKey and skips untracked and raw values', () => {
  const storage = fakeStorage({
    'school.settings': JSON.stringify({ ai: aiConfig('sk-mine') }),
    'school.raw': '{ "ai": {"url":"", "key":""} }',
    unrelated: JSON.stringify(aiConfig('')),
  });
  assert.equal(fillSecrets(storage, 'sk-env'), false);
  assert.equal(storedAi(storage).key, 'sk-mine');
  assert.equal(storage.getItem('unrelated'), JSON.stringify(aiConfig('')));
  const empty = storageWithAi(aiConfig(''));
  assert.equal(fillSecrets(empty, ''), false);
  assert.equal(storedAi(empty).key, '');
});

test('fillSecrets fills several configs across keys and nested arrays and reports one write', () => {
  const storage = fakeStorage({
    'school.a': JSON.stringify({ accounts: [{ ai: aiConfig('') }, { ai: aiConfig('', 'https://example.com') }] }),
    'school-fr.b': JSON.stringify({ ai: aiConfig('') }),
  });
  assert.equal(fillSecrets(storage, 'sk-env'), true);
  const accounts = JSON.parse(storage.getItem('school.a')).accounts;
  assert.equal(accounts[0].ai.key, 'sk-env');
  assert.equal(accounts[1].ai.key, '');
  assert.equal(JSON.parse(storage.getItem('school-fr.b')).ai.key, 'sk-env');
});

test('fillSecrets with replace overwrites a different key in a trusted config and reports the write', () => {
  const storage = storageWithAi(aiConfig('sk-old'));
  assert.equal(fillSecrets(storage, 'sk-env', { replace: true }), true);
  assert.equal(storedAi(storage).key, 'sk-env');
});

test('fillSecrets with replace reports no write when the key already matches or the config is untrusted', () => {
  const same = storageWithAi(aiConfig('sk-env'));
  assert.equal(fillSecrets(same, 'sk-env', { replace: true }), false);
  const other = storageWithAi(aiConfig('gsk_x', 'https://api.groq.com/openai/v1'));
  assert.equal(fillSecrets(other, 'sk-env', { replace: true }), false);
  assert.equal(storedAi(other).key, 'gsk_x');
});

test('fillSecrets without replace keeps a different non-empty key', () => {
  const storage = storageWithAi(aiConfig('sk-old'));
  assert.equal(fillSecrets(storage, 'sk-env'), false);
  assert.equal(storedAi(storage).key, 'sk-old');
});

test('blankTrustedKeys blanks trusted configs only and leaves other providers\' keys alone', () => {
  const storage = fakeStorage({
    'school.a': JSON.stringify({ ai: aiConfig('sk-mine') }),
    'school-fr.b': JSON.stringify({ ai: aiConfig('gsk_x', 'https://api.groq.com/openai/v1') }),
    'vocab2.c': JSON.stringify({ ai: { key: 'sk-nourl', model: 'm' } }),
  });
  assert.equal(blankTrustedKeys(storage), true);
  assert.equal(JSON.parse(storage.getItem('school.a')).ai.key, '');
  assert.equal(JSON.parse(storage.getItem('vocab2.c')).ai.key, '');
  assert.equal(JSON.parse(storage.getItem('school-fr.b')).ai.key, 'gsk_x');
});

test('blankTrustedKeys also blanks a key inside pretty-printed JSON (stored as $raw) and reports no write when nothing changes', () => {
  const text = JSON.stringify({ ai: aiConfig('sk-raw') }, null, 2);
  const storage = fakeStorage({ 'school.a': text, 'school.b': 'not json' });
  assert.equal(blankTrustedKeys(storage), true);
  assert.equal(JSON.parse(storage.getItem('school.a')).ai.key, '');
  assert.equal(storage.getItem('school.b'), 'not json');
  assert.equal(blankTrustedKeys(storage), false);
});

test('collectUntrustedKeys maps url to key for non-empty untrusted configs only', () => {
  const storage = fakeStorage({
    'school-fr.settings': JSON.stringify({ ai: aiConfig('gsk_x', 'https://api.groq.com/openai/v1') }),
    'school.a': JSON.stringify({ list: [{ ai: aiConfig('gsk_y', 'http://localhost:11434/v1') }] }),
    'school.trusted': JSON.stringify({ ai: aiConfig('sk-good') }),
    'school.empty': JSON.stringify({ ai: aiConfig('', 'https://example.com/v1') }),
    'school.raw': JSON.stringify({ ai: aiConfig('gsk_raw', 'https://raw.example/v1') }, null, 2),
    unrelated: JSON.stringify({ ai: aiConfig('gsk_u', 'https://u.example/v1') }),
  });
  const found = collectUntrustedKeys(storage);
  assert.deepEqual([...found.keys()], ['school-fr.settings', 'school.a']);
  assert.deepEqual([...found.get('school-fr.settings')], [['https://api.groq.com/openai/v1', 'gsk_x']]);
  assert.deepEqual([...found.get('school.a')], [['http://localhost:11434/v1', 'gsk_y']]);
});

test('restoreUntrustedKeys fills empty configs with a matching url and nothing else', () => {
  const groq = 'https://api.groq.com/openai/v1';
  const storage = fakeStorage({
    'school-fr.settings': JSON.stringify({ ai: aiConfig('', groq) }),
    'school.keep': JSON.stringify({ ai: aiConfig('gsk_new', groq) }),
    'school.other': JSON.stringify({ ai: aiConfig('', 'https://other.example/v1') }),
    'school.trusted': JSON.stringify({ ai: aiConfig('') }),
  });
  assert.equal(restoreUntrustedKeys(storage, new Map([['school-fr.settings', new Map([[groq, 'gsk_x']])]])), true);
  assert.equal(JSON.parse(storage.getItem('school-fr.settings')).ai.key, 'gsk_x');
  assert.equal(JSON.parse(storage.getItem('school.keep')).ai.key, 'gsk_new');
  assert.equal(JSON.parse(storage.getItem('school.other')).ai.key, '');
  assert.equal(JSON.parse(storage.getItem('school.trusted')).ai.key, '');
});

test('restoreUntrustedKeys with an empty map or no match writes nothing', () => {
  const storage = storageWithAi(aiConfig('', 'https://api.groq.com/openai/v1'));
  assert.equal(restoreUntrustedKeys(storage, new Map()), false);
  assert.equal(restoreUntrustedKeys(storage, new Map([['school.settings', new Map([['https://x.example', 'k']])]])), false);
});

test('two accounts on the same untrusted url keep their own keys through collect and restore', () => {
  const groq = 'https://api.groq.com/openai/v1';
  const storage = fakeStorage({
    'school.a.settings': JSON.stringify({ ai: aiConfig('GA', groq) }),
    'school.b.settings': JSON.stringify({ ai: aiConfig('GB', groq) }),
  });
  const found = collectUntrustedKeys(storage);
  storage.setItem('school.a.settings', JSON.stringify({ ai: aiConfig('', groq) }));
  storage.setItem('school.b.settings', JSON.stringify({ ai: aiConfig('', groq) }));
  assert.equal(restoreUntrustedKeys(storage, found), true);
  assert.equal(JSON.parse(storage.getItem('school.a.settings')).ai.key, 'GA');
  assert.equal(JSON.parse(storage.getItem('school.b.settings')).ai.key, 'GB');
});

test('TRUSTED_KEY_HOSTS lists openrouter.ai', () => {
  assert.deepEqual(TRUSTED_KEY_HOSTS, ['openrouter.ai']);
});

test('canonical ignores key order at every level but not array order', () => {
  assert.equal(canonical({ b: 1, a: { y: 1, x: [1, 2] } }), canonical({ a: { x: [1, 2], y: 1 }, b: 1 }));
  assert.notEqual(canonical({ a: [1, 2] }), canonical({ a: [2, 1] }));
  assert.notEqual(canonical({ a: 1 }), canonical({ a: '1' }));
  assert.notEqual(canonical({ a: null }), canonical({}));
});

test('canonical output is valid JSON with sorted keys', () => {
  assert.equal(canonical({ b: 'ž', a: [true, null] }), '{"a":[true,null],"b":"ž"}');
});

test('readMeta defaults when the record is missing, damaged or malformed', () => {
  const defaults = { revision: 0, dirty: false };
  assert.deepEqual(readMeta(fakeStorage()), defaults);
  for (const text of ['{broken', '"str"', '[1]', 'null', '{"revision":-1,"dirty":"yes"}', '{"revision":1.5}']) {
    assert.deepEqual(readMeta(fakeStorage({ [META_KEY]: text })), defaults, text);
  }
});

test('readMeta keeps the valid parts of a partly valid record', () => {
  assert.deepEqual(readMeta(fakeStorage({ [META_KEY]: '{"revision":7,"dirty":"yes"}' })), { revision: 7, dirty: false });
});

test('writeMeta stores a record that readMeta returns, and it is not tracked', () => {
  const storage = fakeStorage();
  writeMeta(storage, { revision: 12, dirty: true });
  assert.deepEqual(readMeta(storage), { revision: 12, dirty: true });
  assert.deepEqual(takeSnapshot(storage), {});
});

test('writeMeta rejects an invalid record', () => {
  const storage = fakeStorage();
  assert.throws(() => writeMeta(storage, { revision: -1, dirty: false }), TypeError);
  assert.throws(() => writeMeta(storage, { revision: 1.5, dirty: false }), TypeError);
  assert.throws(() => writeMeta(storage, { revision: 1, dirty: 'no' }), TypeError);
  assert.throws(() => writeMeta(storage, undefined), TypeError);
  assert.equal(storage.length, 0);
});

// ---------------------------------------------------------------- contentHash and the meta hash

test('contentHash gives the known FNV-1a 32-bit values as 8 lowercase hex digits', () => {
  assert.equal(contentHash(''), '811c9dc5');
  assert.equal(contentHash('a'), 'e40c292c');
  assert.equal(contentHash('foobar'), 'bf9cf968');
});

test('contentHash changes when the content changes and is stable for equal content', () => {
  assert.equal(contentHash(canonical({ b: 1, a: 2 })), contentHash(canonical({ a: 2, b: 1 })));
  assert.ok(contentHash(canonical({ a: 1 })) !== contentHash(canonical({ a: 2 })));
  assert.match(contentHash('Příliš žluťoučký kůň'), /^[0-9a-f]{8}$/);
});

test('the meta hash round-trips and is left out when absent', () => {
  const storage = fakeStorage();
  writeMeta(storage, { revision: 3, dirty: false, hash: 'a1b2c3d4' });
  assert.deepEqual(readMeta(storage), { revision: 3, dirty: false, hash: 'a1b2c3d4' });
  writeMeta(storage, { revision: 3, dirty: true });
  assert.deepEqual(readMeta(storage), { revision: 3, dirty: true });
});

test('readMeta drops a hash that is not 8 lowercase hex digits, writeMeta rejects one', () => {
  for (const hash of ['XYZ', 'A1B2C3D4', 12345678, null, 'a1b2c3d']) {
    const text = JSON.stringify({ revision: 2, dirty: false, hash });
    assert.deepEqual(readMeta(fakeStorage({ [META_KEY]: text })), { revision: 2, dirty: false });
  }
  assert.throws(() => writeMeta(fakeStorage(), { revision: 1, dirty: false, hash: 'nope' }), TypeError);
});

// ---------------------------------------------------------------- redaction: surrogates, $raw, trusted keys

test('redactSecrets replaces lone surrogates in values and names but keeps real emoji', () => {
  const lone = '\ud83d';
  const entries = { 'school.a': { [`k${lone}`]: [`x${lone}y`, 'ok 😀', '\udc00'] } };
  const result = redactSecrets(entries);
  assert.deepEqual(result.entries, { 'school.a': { 'k\uFFFD': ['x\uFFFDy', 'ok 😀', '\uFFFD'] } });
  assert.equal(entries['school.a'][`k${lone}`][0], `x${lone}y`, 'the input is not changed');
});

test('redactSecrets scrubs the text of a $raw wrapper too', () => {
  const result = redactSecrets({ 'school.a': { $raw: 'half \ud83d' } });
  assert.deepEqual(result.entries, { 'school.a': { $raw: 'half \uFFFD' } });
});

test('redactSecrets removes an AI key hidden in the JSON text of a $raw wrapper', () => {
  const text = JSON.stringify({ ai: { url: 'https://openrouter.ai/api/v1', key: 'sk-raw', model: 'm' } }, null, 2);
  const result = redactSecrets({ 'school.settings': { $raw: text } });
  assert.deepEqual(result.entries, { 'school.settings': { ai: { url: 'https://openrouter.ai/api/v1', key: '', model: 'm' } } });
  assert.deepEqual(result.found, ['sk-raw']);
});

test('redactSecrets keeps a $raw wrapper that holds no key, JSON or not', () => {
  const entries = { 'school.a': { $raw: '{ "a": 1 }' }, 'school.b': { $raw: 'not json' } };
  assert.deepEqual(redactSecrets(entries).entries, entries);
});

test('redactSecrets reports as trusted only keys from configs that fillSecrets would fill', () => {
  const entries = {
    'school.other': { ai: aiConfig('sk-other', 'https://api.example.com/v1') },
    'school.plain': { ai: aiConfig('sk-plain', 'http://openrouter.ai/api/v1') },
    'school.good': { ai: aiConfig('sk-good') },
    'vocab2.cfg': { ai: { key: 'sk-nourl', model: 'm' } },
  };
  const result = redactSecrets(entries);
  assert.deepEqual(result.found, ['sk-other', 'sk-plain', 'sk-good', 'sk-nourl']);
  assert.deepEqual(result.trusted, ['sk-good', 'sk-nourl']);
});
