/**
 * Tests for js/cockpit-inbox.js and its hook in js/github-sync.js: the inbox path, item validation, account
 * and subject choice, duplicates, the event shape, the consumed list, and the import after a sync against a
 * fake GitHub that holds the data file and the inbox file.
 */
import { test, assert } from './harness.mjs';
import {
  inboxPath, validateItem, parseInbox, chooseAccount, resolveSubject, findDuplicate, buildEvent, addConsumed,
  applyItems, applyToAccounts, importCockpitInbox, MAX_CONSUMED,
} from '../../js/cockpit-inbox.js';
import { fetchFileText, GitHubError, encodeBase64, decodeBase64 } from '../../js/github.js';
import { configureGitHub, checkNow, readGitHub, writeGitHub } from '../../js/github-sync.js';
import { ACCOUNT_KEYS } from '../../js/store.js';
import { takeSnapshot, contentHash, canonical } from '../../js/sync/snapshot.js';

/** A Map-backed stand-in for localStorage. */
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

/** A valid item; pass changes to make it invalid or different. */
const item = (changes = {}) => ({
  id: 'ck-abc1', account: '', type: 'test', subjectId: '', subject: 'Biology', title: 'Test: cells',
  date: '2026-12-01', time: '', description: 'Chapters 3 to 5', created: '2026-11-19T08:00:00Z', ...changes,
});
const inboxText = items => JSON.stringify({ app: 'cockpit-inbox', format: 1, items });
const ids = () => { let n = 0; return prefix => `${prefix}${++n}`; };
const fixedNow = () => 1700000000000;

/** Two accounts; the first has Biology and one existing event. */
const deviceData = () => ({
  'school.accounts': JSON.stringify([{ id: 'a1', name: 'One' }, { id: 'a2', name: 'Two' }]),
  'school.a1.subjects': JSON.stringify([{ id: 's1', name: 'Biology' }, { id: 's2', name: 'Maths' }]),
  'school.a1.events': '[]',
  'school.a2.subjects': JSON.stringify([{ id: 't1', name: 'History' }]),
});

/** A fake GitHub with a data file and a file map; unknown files answer 404. */
function fakeGitHub(files = {}) {
  const github = { files, calls: [], status: 0, version: 0 };
  const reply = (code, body) => ({
    ok: code >= 200 && code < 300, status: code, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  github.fetcher = async (url, init) => {
    github.calls.push({ url, ...init });
    if (!url.includes('/contents/')) return reply(200, {});
    const path = decodeURIComponent(url.split('/contents/')[1]);
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body);
      github.version += 1;
      github.files[path] = { sha: `sha${github.version}`, text: decodeBase64(body.content) };
      return reply(201, { content: { sha: github.files[path].sha } });
    }
    if (path.endsWith('cockpit-inbox.json') && github.status) return reply(github.status, {});
    const file = github.files[path];
    if (!file) return reply(404, {});
    if (init.headers.Accept === 'application/vnd.github.raw+json') return reply(200, file.text);
    return reply(200, { sha: file.sha, encoding: 'base64', content: encodeBase64(file.text) });
  };
  return github;
}

/** A configured device already in step with an (empty) repository. */
async function inStepDevice(github, data = deviceData(), path = 'school-data.json') {
  const storage = fakeStorage(data);
  configureGitHub(storage, { repo: 'user/school-data', token: 'ghp_token', path });
  assert.equal(await checkNow({ storage, fetcher: github.fetcher, now: fixedNow }), 'saved');
  return storage;
}

test('inboxPath puts the inbox next to the data file', () => {
  assert.equal(inboxPath('school-data.json'), 'cockpit-inbox.json');
  assert.equal(inboxPath('dir/x.json'), 'dir/cockpit-inbox.json');
  assert.equal(inboxPath('a/b/x.json'), 'a/b/cockpit-inbox.json');
});

test('validateItem accepts a good item and cleans the title', () => {
  assert.equal(validateItem(item({ title: '  Test:   cells ' })).title, 'Test: cells');
  assert.equal(validateItem(item({ time: '08:30', type: 'homework' })).time, '08:30');
  assert.equal(validateItem(item({ account: undefined, time: undefined, description: undefined, subjectId: undefined })).account, '');
});

test('validateItem rejects every broken field', () => {
  const bad = [
    null, 'x', [], item({ id: 'ab' }), item({ id: 'CK-abc1' }), item({ id: 'ck-ab_c1' }), item({ id: `ck-${'a'.repeat(61)}` }),
    item({ type: 'exam' }), item({ title: '   ' }), item({ title: 'x'.repeat(201) }), item({ title: 5 }),
    item({ date: '2026-02-30' }), item({ date: '1.12.2026' }), item({ time: '25:00' }), item({ time: '8:30' }),
    item({ description: 'x'.repeat(4001) }), item({ description: 7 }), item({ created: 'yesterday' }), item({ created: undefined }),
    item({ account: 3 }), item({ subject: {} }),
  ];
  for (const value of bad) assert.equal(validateItem(value), null, JSON.stringify(value));
  assert.ok(validateItem(item({ title: 'x'.repeat(200), description: 'y'.repeat(4000) })));
});

test('parseInbox skips invalid items and repeated ids, and ignores extra content', () => {
  const text = JSON.stringify({ app: 'cockpit-inbox', format: 1, extra: 1, items: [item(), item({ id: 'bad' }), item(), { ...item({ id: 'ck-two2' }), more: 1 }] });
  const { items, invalid } = parseInbox(text);
  assert.deepEqual(items.map(i => i.id), ['ck-abc1', 'ck-two2']);
  assert.equal(invalid, 1);
});

test('parseInbox rejects text that is not a Cockpit inbox', () => {
  for (const text of ['nope', '[]', '{}', JSON.stringify({ app: 'school-app', format: 1, items: [] }),
    JSON.stringify({ app: 'cockpit-inbox', format: 2, items: [] }), JSON.stringify({ app: 'cockpit-inbox', format: 1, items: {} })]) {
    assert.throws(() => parseInbox(text), GitHubError, text);
  }
  assert.equal(parseInbox(inboxText([])).items.length, 0);
});

test('chooseAccount takes the named account, else the first, else none', () => {
  const accounts = [{ id: 'a1' }, { id: 'a2' }];
  assert.equal(chooseAccount(item({ account: 'a2' }), accounts).id, 'a2');
  assert.equal(chooseAccount(item({ account: 'zzz' }), accounts).id, 'a1');
  assert.equal(chooseAccount(item(), accounts).id, 'a1');
  assert.equal(chooseAccount(item(), []), null);
});

test('resolveSubject uses the id first, then the name ignoring case and spaces, else nothing', () => {
  const subjects = [{ id: 's1', name: 'Biology' }, { id: 's2', name: ' Maths ' }];
  assert.equal(resolveSubject(item({ subjectId: 's2', subject: 'Biology' }), subjects).id, 's2');
  assert.equal(resolveSubject(item({ subjectId: 'gone', subject: ' biology ' }), subjects).id, 's1');
  assert.equal(resolveSubject(item({ subject: 'MATHS' }), subjects).id, 's2');
  assert.equal(resolveSubject(item({ subject: 'Art' }), subjects), null);
  assert.equal(resolveSubject(item({ subject: '' }), subjects), null);
});

test('findDuplicate matches subject, type, date and title only', () => {
  const events = [{ subjectId: 's1', type: 'test', date: '2026-12-01', title: 'TEST: Cells ' }];
  assert.ok(findDuplicate(events, 's1', item()));
  assert.equal(findDuplicate(events, 's2', item()), undefined);
  assert.equal(findDuplicate(events, 's1', item({ type: 'homework' })), undefined);
  assert.equal(findDuplicate(events, 's1', item({ date: '2026-12-02' })), undefined);
  assert.equal(findDuplicate(events, 's1', item({ title: 'Other' })), undefined);
});

test('buildEvent has the shape of an event the student adds, plus source', () => {
  const event = buildEvent(item({ time: '08:30' }), 's1', { newId: ids(), now: fixedNow });
  assert.deepEqual(event, {
    id: 'e1', subjectId: 's1', title: 'Test: cells', type: 'test', date: '2026-12-01', time: '08:30',
    description: 'Chapters 3 to 5', materials: [], done: false, created: 1700000000000, source: 'cockpit',
  });
});

test('addConsumed deduplicates and keeps the newest 1000', () => {
  assert.deepEqual(addConsumed(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(addConsumed('damaged', ['x']), ['x']);
  const old = Array.from({ length: MAX_CONSUMED }, (_, i) => `ck-old${i}`);
  const next = addConsumed(old, ['ck-new1', 'ck-new2']);
  assert.equal(next.length, MAX_CONSUMED);
  assert.deepEqual(next.slice(-2), ['ck-new1', 'ck-new2']);
  assert.equal(next[0], 'ck-old2');
});

test('applyItems adds events, marks duplicates consumed, and leaves unresolvable items alone', () => {
  const data = {
    subjects: [{ id: 's1', name: 'Biology' }],
    events: [{ id: 'e0', subjectId: 's1', type: 'test', date: '2026-12-01', title: 'test: CELLS' }],
    inbox: ['ck-done'],
  };
  const items = [
    item({ id: 'ck-done', title: 'Already consumed' }), item(), item({ id: 'ck-new1', title: 'Essay', type: 'homework' }),
    item({ id: 'ck-lost', subject: 'Art' }),
  ];
  const result = applyItems(data, items, { newId: ids(), now: fixedNow });
  assert.deepEqual(result, { added: 1, duplicates: 1, skipped: 1, changed: true });
  assert.equal(data.events.length, 2);
  assert.equal(data.events[1].source, 'cockpit');
  assert.deepEqual(data.inbox, ['ck-done', 'ck-abc1', 'ck-new1']);
  assert.deepEqual(applyItems(data, items, { newId: ids() }), { added: 0, duplicates: 0, skipped: 1, changed: false }, 'a second run adds nothing');
});

test('applyToAccounts writes a closed account directly and the open account through the store', () => {
  const storage = fakeStorage(deviceData());
  const open = { subjects: [{ id: 's1', name: 'Biology' }], events: [], inbox: [] };
  const saved = [];
  const added = applyToAccounts({
    storage, newId: ids(), now: fixedNow,
    items: [item(), item({ id: 'ck-hist', account: 'a2', subject: 'history', title: 'Quiz' })],
    open: () => ({ id: 'a1', data: open, save: key => saved.push(key) }),
  });
  assert.equal(added, 2);
  assert.equal(open.events.length, 1);
  assert.deepEqual(saved, ['events', 'inbox']);
  assert.equal(storage.getItem('school.a1.events'), '[]', 'the open account is not written behind the store');
  const second = JSON.parse(storage.getItem('school.a2.events'));
  assert.equal(second[0].title, 'Quiz');
  assert.deepEqual(JSON.parse(storage.getItem('school.a2.inbox')), ['ck-hist']);
});

test('applyToAccounts leaves an item unconsumed when its subject is missing, and ignores a device without accounts', () => {
  const storage = fakeStorage(deviceData());
  assert.equal(applyToAccounts({ storage, items: [item({ subject: 'Art' })] }), 0);
  assert.equal(storage.getItem('school.a1.inbox'), null);
  assert.equal(applyToAccounts({ storage: fakeStorage(), items: [item()] }), 0);
});

test('ACCOUNT_KEYS has inbox and the snapshot carries it', () => {
  assert.ok(ACCOUNT_KEYS.includes('inbox'));
  const entries = takeSnapshot(fakeStorage({ 'school.a1.inbox': '["ck-abc1"]' }));
  assert.ok(Object.hasOwn(entries, 'school.a1.inbox'));
});

test('fetchFileText reads raw text, answers null for 404 and throws GitHubError otherwise', async () => {
  const github = fakeGitHub({ 'dir/cockpit-inbox.json': { sha: 's', text: 'hello' } });
  const settings = { owner: 'user', repo: 'data', path: 'dir/x.json', token: 'ghp_token' };
  assert.equal(await fetchFileText(settings, 'dir/cockpit-inbox.json', { fetcher: github.fetcher }), 'hello');
  assert.equal(await fetchFileText(settings, 'cockpit-inbox.json', { fetcher: github.fetcher }), null);
  assert.ok(github.calls[0].url.startsWith('https://api.github.com/repos/user/data/contents/dir/cockpit-inbox.json'));
  assert.equal(github.calls[0].headers.Authorization, 'Bearer ghp_token');
  github.status = 401;
  const refused = await fetchFileText(settings, 'cockpit-inbox.json', { fetcher: github.fetcher }).catch(e => e);
  assert.ok(refused instanceof GitHubError && refused.kind === 'auth');
  const unsafe = await fetchFileText(settings, '../x.json', { fetcher: github.fetcher }).catch(e => e);
  assert.ok(unsafe instanceof GitHubError && unsafe.kind === 'format');
});

test('importCockpitInbox treats a missing inbox as empty and rejects a damaged one', async () => {
  const github = fakeGitHub();
  const storage = fakeStorage(deviceData());
  const settings = { owner: 'user', repo: 'data', path: 'school-data.json', token: 't' };
  assert.equal(await importCockpitInbox({ settings, storage, fetcher: github.fetcher }), 0);
  github.files['cockpit-inbox.json'] = { sha: 's', text: 'not json' };
  const damaged = await importCockpitInbox({ settings, storage, fetcher: github.fetcher }).catch(e => e);
  assert.ok(damaged instanceof GitHubError && damaged.kind === 'format');
});

test('checkNow imports the inbox after a sync that leaves the device in step, and tells the app', async () => {
  const github = fakeGitHub();
  const storage = await inStepDevice(github);
  github.files['cockpit-inbox.json'] = { sha: 'i1', text: inboxText([item(), item({ id: 'ck-bad', subject: 'Art' })]) };
  const told = [];
  const result = await checkNow({ storage, fetcher: github.fetcher, now: fixedNow, inbox: { onImported: (count, info) => told.push([count, info]) } });
  assert.equal(result, 'none');
  assert.deepEqual(told, [[1, { reloading: false }]]);
  const events = JSON.parse(storage.getItem('school.a1.events'));
  assert.equal(events[0].source, 'cockpit');
  assert.equal(events[0].subjectId, 's1');
  assert.deepEqual(JSON.parse(storage.getItem('school.a1.inbox')), ['ck-abc1']);
  // The change is saved by the normal sync, and the consumed ids reach the data file.
  assert.equal(await checkNow({ storage, fetcher: github.fetcher, now: fixedNow, allowLoad: false }), 'saved');
  assert.ok(github.files['school-data.json'].text.includes('ck-abc1'));
  assert.equal(await checkNow({ storage, fetcher: github.fetcher, now: fixedNow, inbox: { onImported: () => told.push('again') } }), 'none');
  assert.equal(told.length, 1, 'an imported item is not imported twice');
});

test('the inbox is read from the folder of a configured data file', async () => {
  const github = fakeGitHub();
  const storage = await inStepDevice(github, deviceData(), 'dir/x.json');
  github.files['dir/cockpit-inbox.json'] = { sha: 'i1', text: inboxText([item()]) };
  await checkNow({ storage, fetcher: github.fetcher, now: fixedNow });
  assert.equal(JSON.parse(storage.getItem('school.a1.events')).length, 1);
});

test('a load from GitHub also imports, and says the page is reloading', async () => {
  const github = fakeGitHub();
  await inStepDevice(github);
  const laptop = fakeStorage({});
  configureGitHub(laptop, { repo: 'user/school-data', token: 'ghp_token' });
  writeGitHub(laptop, { sha: 'old', hash: contentHash(canonical({})) });
  github.files['cockpit-inbox.json'] = { sha: 'i1', text: inboxText([item()]) };
  const told = [];
  assert.equal(await checkNow({ storage: laptop, fetcher: github.fetcher, now: fixedNow, inbox: { onImported: (n, info) => told.push([n, info]) } }), 'loaded');
  assert.deepEqual(told, [[1, { reloading: true }]]);
});

test('no import while a conflict is open, when GitHub is off, or when the sync did not finish in step', async () => {
  const github = fakeGitHub();
  const storage = await inStepDevice(github);
  github.files['cockpit-inbox.json'] = { sha: 'i1', text: inboxText([item()]) };
  // Another device saved: a load is wanted but not allowed, so this device is not in step.
  github.files['school-data.json'] = { sha: 'other', text: github.files['school-data.json'].text };
  assert.equal(await checkNow({ storage, fetcher: github.fetcher, now: fixedNow, allowLoad: false }), 'none');
  assert.equal(await checkNow({ storage, fetcher: github.fetcher, now: fixedNow, allowLoad: false }), 'none');
  // Local change and a newer remote: conflict.
  storage.setItem('school.a1.notes', '[{"id":"n1"}]');
  const before = github.calls.length;
  assert.equal(await checkNow({ storage, fetcher: github.fetcher, now: fixedNow }), 'conflict');
  assert.equal(readGitHub(storage).conflict, true);
  assert.equal(storage.getItem('school.a1.inbox'), null);
  assert.ok(!github.calls.slice(before).some(c => String(c.url).includes('cockpit-inbox')), 'the inbox was not even fetched');
  const off = fakeStorage(deviceData());
  assert.equal(await checkNow({ storage: off, fetcher: github.fetcher, now: fixedNow }), 'off');
  assert.equal(off.getItem('school.a1.events'), '[]');
});

test('an inbox error is recorded quietly, does not break the sync, and clears on the next good read', async () => {
  const github = fakeGitHub();
  const storage = await inStepDevice(github);
  github.status = 500;
  assert.equal(await checkNow({ storage, fetcher: github.fetcher, now: fixedNow }), 'none');
  assert.ok(readGitHub(storage).inboxError.includes('500'));
  assert.equal(readGitHub(storage).error, '');
  github.status = 0;
  github.files['cockpit-inbox.json'] = { sha: 'i1', text: 'not json' };
  assert.equal(await checkNow({ storage, fetcher: github.fetcher, now: fixedNow }), 'none');
  assert.ok(readGitHub(storage).inboxError.includes('Cockpit inbox'));
  github.files['cockpit-inbox.json'] = { sha: 'i2', text: inboxText([]) };
  await checkNow({ storage, fetcher: github.fetcher, now: fixedNow });
  assert.equal(readGitHub(storage).inboxError, '');
});
