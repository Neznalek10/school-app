/**
 * Integration tests written from the acceptance criteria (plan.md section 2), not from the implementation:
 * two "machines" syncing through one fake server (AC4, AC5, AC6, AC11), new accounts and starter kits
 * (AC1, AC2) and the subject setup flow reaching every prompt (AC3). The last tests cover the
 * onboarding profile, curriculum, prompts for young students, generalization, the photo test check and its
 * saved results, again on the pure modules and the store.
 *
 * Where it fits: registered with the shared harness (tests/js/harness.mjs), run by tests/js/run.mjs under gjs
 * or node. The sync tests use the real snapshot.js, client.js (its error classes) and engine.js; only the
 * browser (Storage, window, timers) and the HTTP server are faked. The fake server enforces the same rules as
 * server/datastore.py: a 409 on a stale base revision and a rejection of entries that still hold an AI key.
 * The Python side of the same criteria lives in tests/test_integration.py.
 *
 * Invariant: each machine owns its own Storage class (the engine patches the class prototype), and
 * resetForTests() runs before every boot because the engine is a singleton per page.
 */
import { test, assert } from './harness.mjs';
import { resetForTests, startSync } from '../../js/sync/engine.js';
import { ConflictError, SyncHttpError } from '../../js/sync/client.js';
import { META_KEY, readMeta, redactSecrets } from '../../js/sync/snapshot.js';
import { store } from '../../js/store.js';
import { KITS, COLORS, SUBJECT_ICONS, subjectFromKit, hasTool, kitsFor } from '../../js/subjects.js';
import { addBuiltInLesson } from '../../js/soustavy.js';
import { parseSetup, applySetup, setupAssistant, setupPrompt } from '../../js/setup.js';
import { profileLine, systemPrompt, externalPrompt } from '../../js/ai.js';
import { promptFor, cardsOf } from '../../js/study.js';
import { setLocale, studentText, audienceText } from '../../js/locale.js';
import { curriculumPrompt, parseCurriculum, applyCurriculum, plainSubjects } from '../../js/curriculum.js';
import {
  checkPrompt, parseCheck, checkStats, newCheck, parseRecheck, mistakeCards, addMistakeCards, MISTAKES_KIND,
} from '../../js/testcheck.js';
import { buildBackup, parseBackup } from '../../js/backup.js';

/** Key under which the dashboard stores its AI settings in these tests. */
const SETTINGS_KEY = 'school.a1.settings';

/** An AI config as the apps store it, pointing at OpenRouter (the only host a key is filled into). */
const trusted = key => ({ ai: { url: 'https://openrouter.ai/api/v1', model: 'm', key } });

/** An AI config pointing at some other provider: a key must never be filled into it. */
const foreign = key => ({ ai: { url: 'https://example.org/v1', model: 'm', key } });

/** A secret typed by the user in these tests. */
const TYPED_KEY = 'sk-typed-by-user-123';

/**
 * Makes a deep copy of JSON data, so the fake server never shares objects with a machine.
 *
 * @param {*} value Any JSON value.
 * @returns {*} An independent copy.
 */
const clone = value => JSON.parse(JSON.stringify(value));

/**
 * Waits for promise callbacks to run (a few macrotasks, because a push chains several awaits).
 *
 * @returns {Promise<void>} Resolves when the queue is quiet.
 */
async function settle() {
  for (let round = 0; round < 5; round += 1) await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Creates a Storage-like class. The engine patches the prototype, so every machine needs its own class.
 *
 * @returns {Function} A class with getItem, setItem, removeItem, key, clear and length.
 */
function createStorageClass() {
  return class FakeStorage {
    /** Starts empty; values are kept as strings, like the real Storage. */
    constructor() {
      this.map = new Map();
    }

    /** Returns the stored string for `key`, or null when absent. */
    getItem(key) {
      return this.map.has(key) ? this.map.get(key) : null;
    }

    /** Stores `value` converted to a string, as the browser does. */
    setItem(key, value) {
      this.map.set(key, String(value));
    }

    /** Deletes `key` if present. */
    removeItem(key) {
      this.map.delete(key);
    }

    /** Returns the key at position `index`, or null past the end. */
    key(index) {
      return [...this.map.keys()][index] ?? null;
    }

    /** Removes every entry. */
    clear() {
      this.map.clear();
    }

    /** Number of stored entries. */
    get length() {
      return this.map.size;
    }
  };
}

/**
 * Creates manual timers: the debounce only fires when the test says time has passed.
 *
 * @returns {object} `setTimeout`, `clearTimeout` and `fireAll`.
 */
function createTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    /** Registers `callback` without a real delay; it runs only when `fireAll` is called. */
    setTimeout(callback) {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    },
    /** Cancels a registered callback by id. */
    clearTimeout: id => pending.delete(id),
    /** Runs every pending callback once, as if the debounce time had passed. */
    fireAll() {
      const due = [...pending.values()];
      pending.clear();
      due.forEach(callback => callback());
    },
  };
}

/**
 * Creates a fake window that counts reloads and records listeners.
 *
 * @returns {object} The window.
 */
function createWindow() {
  const win = {
    reloads: 0,
    document: { visibilityState: 'visible' },
    /** Counts a page reload instead of performing it. */
    location: { reload: () => (win.reloads += 1) },
    /** Ignores listeners: the tests trigger flushes through the timers instead. */
    addEventListener() {},
    /** Ignores listener removal, matching `addEventListener`. */
    removeEventListener() {},
  };
  return win;
}

/**
 * Creates the fake server: a data file, a .env key and a client with the real API semantics.
 *
 * @returns {object} The state (`file`, `envKey`, `conflicts`) and its `client`.
 */
function createFakeServer() {
  const server = { file: null, envKey: '', conflicts: [] };
  server.client = {
    /** Mirrors GET /api/status from the current file and key. */
    async status() {
      return {
        app: 'school-app',
        version: 'test',
        mode: 'file',
        dataFile: 'data/school-data.json',
        exists: server.file !== null,
        revision: server.file?.revision ?? 0,
        savedAt: server.file?.savedAt ?? null,
        hasAiKey: server.envKey !== '',
      };
    },
    /** Mirrors GET /api/keys: the key held in the fake .env. */
    getKeys: async () => ({ AI_API_KEY: server.envKey }),
    /** Mirrors GET /api/data: a copy of the file, or null when there is none. */
    getData: async () => (server.file ? clone(server.file) : null),
    /** Mirrors PUT /api/data: 409 on a stale base revision, 400 when an AI key is still inside. */
    async putData({ baseRevision, entries }) {
      const current = server.file?.revision ?? 0;
      if (baseRevision !== current) throw new ConflictError('Stale revision.', current);
      if (redactSecrets(entries).found.length > 0) throw new SyncHttpError('Entries contain an AI key.', 400);
      const revision = current + 1;
      server.file = { app: 'school-app', format: 1, revision, savedAt: `saved-${revision}`, entries: clone(entries) };
      return { revision, savedAt: server.file.savedAt };
    },
    /** Mirrors POST /api/conflicts: records the losing entries and returns a file name. */
    async postConflict({ entries, reason }) {
      server.conflicts.push({ entries: clone(entries), reason });
      return { file: `data/conflicts/conflict-${server.conflicts.length}.json` };
    },
    /** Mirrors PUT /api/keys: stores the key in the fake .env (empty removes it). */
    async saveKeys(values) {
      server.envKey = values.AI_API_KEY;
      return { hasAiKey: server.envKey !== '' };
    },
    /** Page-hide save: not needed by these tests, so it does nothing. */
    putDataKeepalive() {},
  };
  return server;
}

/**
 * Creates a machine: a browser profile whose localStorage survives page loads.
 *
 * @param {object} server The shared fake server.
 * @returns {object} The machine with `storage`, `put`, `read` and `boot` (one page load).
 */
function createMachine(server) {
  const Storage = createStorageClass();
  const machine = {
    storage: new Storage(),
    session: new Storage(),
    win: null,
    timers: null,
    /** Writes a JSON value the way the apps do (through the possibly patched setItem). */
    put: (key, value) => machine.storage.setItem(key, JSON.stringify(value)),
    /** Reads a stored JSON value, or null. */
    read: key => (machine.storage.getItem(key) === null ? null : JSON.parse(machine.storage.getItem(key))),
    /** Simulates opening the page: a new window and timers, the same storage; the session survives reloads. */
    async boot({ newSession = false } = {}) {
      resetForTests();
      if (newSession) machine.session = new Storage();
      machine.win = createWindow();
      machine.timers = createTimers();
      await startSync({
        storage: machine.storage,
        client: server.client,
        win: machine.win,
        session: machine.session,
        timers: machine.timers,
      });
    },
    /** Lets the debounce elapse and waits for the save to finish. */
    async flush() {
      machine.timers.fireAll();
      await settle();
    },
  };
  return machine;
}

/**
 * Builds the data machine A starts with: a dashboard account with a typed key, and a French app value.
 *
 * @param {object} machine The machine whose storage is filled (before sync is started, so nothing is hooked).
 * @returns {void}
 */
function seedExistingData(machine) {
  machine.put('school.accounts', [{ id: 'a1', name: 'User' }]);
  machine.put('school.a1.subjects', [{ id: 'languages', name: 'Languages' }, { id: 'chem', name: 'Příliš žluťoučký kůň' }]);
  machine.put(SETTINGS_KEY, { ...trusted(TYPED_KEY), other: foreign('') });
  machine.put('school-fr.progress', { streak: 3 });
  machine.storage.setItem('vocab2.raw', 'not json');
  machine.storage.setItem('unrelated.key', 'stays local');
}

// ---------------------------------------------------------------- AC4, AC5, AC11: migration and restore

test('AC11: the first start saves the data the browser already holds, minus the AI key', async () => {
  const server = createFakeServer();
  const machineA = createMachine(server);
  seedExistingData(machineA);
  await machineA.boot();
  assert.equal(server.file.revision, 1);
  assert.deepEqual(Object.keys(server.file.entries).sort(), [
    'school-fr.progress', 'school.a1.settings', 'school.a1.subjects', 'school.accounts', 'vocab2.raw',
  ]);
  assert.deepEqual(server.file.entries['vocab2.raw'], { $raw: 'not json' });
  assert.equal(server.file.entries['school.a1.subjects'][1].name, 'Příliš žluťoučký kůň');
  assert.equal(machineA.win.reloads, 0);
  const metaA = readMeta(machineA.storage);
  // The meta also carries a content hash of the last sync; only revision and dirty matter here.
  assert.deepEqual({ revision: metaA.revision, dirty: metaA.dirty }, { revision: 1, dirty: false });
  assert.match(metaA.hash, /^[0-9a-f]{8}$/);
});

test('AC5: a key already typed on the first machine goes to .env and never into the data file', async () => {
  const server = createFakeServer();
  const machineA = createMachine(server);
  seedExistingData(machineA);
  await machineA.boot();
  assert.equal(server.envKey, TYPED_KEY);
  assert.ok(!JSON.stringify(server.file).includes(TYPED_KEY));
  assert.equal(machineA.read(SETTINGS_KEY).ai.key, TYPED_KEY, 'the key stays usable in the browser');
});

test('AC4: an empty second machine restores the first one\'s data with exactly one reload', async () => {
  const server = createFakeServer();
  const machineA = createMachine(server);
  seedExistingData(machineA);
  await machineA.boot();
  const machineB = createMachine(server);
  await machineB.boot();
  assert.equal(machineB.win.reloads, 1);
  assert.deepEqual(machineB.read('school-fr.progress'), { streak: 3 });
  assert.equal(machineB.storage.getItem('vocab2.raw'), 'not json');
  assert.equal(machineB.storage.getItem('unrelated.key'), null);
  const metaB = readMeta(machineB.storage);
  // The meta also carries a content hash of the last sync; only revision and dirty matter here.
  assert.deepEqual({ revision: metaB.revision, dirty: metaB.dirty }, { revision: 1, dirty: false });
  assert.match(metaB.hash, /^[0-9a-f]{8}$/);
  // The page loads again after the reload: no second reload and nothing is saved back.
  await machineB.boot();
  assert.equal(machineB.win.reloads, 0);
  assert.equal(server.file.revision, 1);
});

test('AC5: the second machine gets the key from .env, only in the OpenRouter config', async () => {
  const server = createFakeServer();
  const machineA = createMachine(server);
  seedExistingData(machineA);
  await machineA.boot();
  const machineB = createMachine(server);
  await machineB.boot();
  const settings = machineB.read(SETTINGS_KEY);
  assert.equal(settings.ai.key, TYPED_KEY);
  assert.equal(settings.other.ai.key, '');
});

test('AC4: a change on machine B reaches machine A when A restarts', async () => {
  const server = createFakeServer();
  const machineA = createMachine(server);
  seedExistingData(machineA);
  await machineA.boot();
  const machineB = createMachine(server);
  await machineB.boot();
  await machineB.boot();
  machineB.put('school-fr.progress', { streak: 9 });
  await machineB.flush();
  assert.equal(server.file.revision, 2);
  await machineA.boot();
  assert.deepEqual(machineA.read('school-fr.progress'), { streak: 9 });
  assert.equal(machineA.win.reloads, 1);
  assert.equal(machineA.read(SETTINGS_KEY).ai.key, TYPED_KEY, 'the key survives the restore');
});

test('AC5: a key typed on machine A reaches .env, not the data file, and machine B gets it filled in', async () => {
  const server = createFakeServer();
  const machineA = createMachine(server);
  machineA.put(SETTINGS_KEY, { ...trusted(''), other: foreign('') });
  await machineA.boot();
  assert.equal(server.envKey, '');
  machineA.put(SETTINGS_KEY, { ...trusted(TYPED_KEY), other: foreign('') });
  await machineA.flush();
  assert.equal(server.envKey, TYPED_KEY);
  assert.ok(!JSON.stringify(server.file).includes(TYPED_KEY));
  const machineB = createMachine(server);
  await machineB.boot();
  assert.equal(machineB.read(SETTINGS_KEY).ai.key, TYPED_KEY);
  assert.equal(machineB.read(SETTINGS_KEY).other.ai.key, '');
});

// ---------------------------------------------------------------- AC6: stale machines

test('AC6: a stale machine saves its changes as a conflict copy and adopts the newer data', async () => {
  const server = createFakeServer();
  const machineA = createMachine(server);
  seedExistingData(machineA);
  await machineA.boot();
  // Machine A stays open (its engine is live) and changes a value; the save waits for the debounce.
  machineA.put('school-fr.progress', { streak: 4 });
  // Meanwhile another machine saves revision 2. The engine is a singleton per page, so that machine's
  // save is applied to the fake server directly instead of booting a second engine.
  const newer = clone(server.file);
  newer.revision = 2;
  newer.entries['school-fr.progress'] = { streak: 10 };
  server.file = newer;
  await machineA.flush();
  assert.equal(server.conflicts.length, 1);
  assert.deepEqual(server.conflicts[0].entries['school-fr.progress'], { streak: 4 });
  assert.ok(server.conflicts[0].reason.length > 0);
  assert.deepEqual(server.file.entries['school-fr.progress'], { streak: 10 }, 'the newer data is not overwritten');
  assert.deepEqual(machineA.read('school-fr.progress'), { streak: 10 });
  assert.equal(readMeta(machineA.storage).revision, 2);
  assert.equal(machineA.win.reloads, 1);
});

test('AC6: unsaved changes found at start-up against a newer file are kept as a conflict copy', async () => {
  const server = createFakeServer();
  const machineA = createMachine(server);
  seedExistingData(machineA);
  await machineA.boot();
  const machineB = createMachine(server);
  await machineB.boot();
  await machineB.boot();
  machineB.put('school-fr.progress', { streak: 10 });
  await machineB.flush();
  // Machine A was closed with an unsaved change (dirty meta).
  machineA.storage.setItem(META_KEY, JSON.stringify({ revision: 1, dirty: true }));
  machineA.put('school-fr.progress', { streak: 5 });
  await machineA.boot();
  assert.equal(server.conflicts.length, 1);
  assert.deepEqual(server.conflicts[0].entries['school-fr.progress'], { streak: 5 });
  assert.deepEqual(machineA.read('school-fr.progress'), { streak: 10 });
});

// ---------------------------------------------------------------- AC1, AC2: accounts and kits

test('AC1: a new account starts with no subjects; the Get started interview adds them', () => {
  const account = store.createAccount('Integration user');
  assert.ok(store.useAccount(account.id));
  assert.equal(store.subjects.length, 0);
});

test('AC2: every starter kit makes a valid subject; Chemistry gets the naming tool', () => {
  assert.equal(KITS.length, 13);
  let counter = 0;
  for (const kit of KITS) {
    const subject = subjectFromKit(kit, { name: kit.name, icon: kit.icon, color: kit.color, id: `s${++counter}` });
    assert.equal(subject.name, kit.name);
    assert.ok(SUBJECT_ICONS.includes(subject.icon), `icon of ${kit.id}`);
    assert.ok(COLORS.includes(subject.color), `colour of ${kit.id}`);
    assert.equal(subject.plan.template, kit.plan);
    assert.equal(hasTool(subject, 'nazvoslovi'), kit.id === 'chemistry', `tool of ${kit.id}`);
  }
});

test('AC2: the Computer science kit brings the number systems lesson, added once', () => {
  const kit = KITS.find(item => item.id === 'informatics');
  const subject = subjectFromKit(kit, { name: 'Computer science', icon: kit.icon, color: kit.color, id: 's-cs' });
  const lessons = [];
  for (const lessonId of kit.lessons) assert.equal(addBuiltInLesson(lessons, subject.id, lessonId), true);
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].subjectId, 's-cs');
  assert.equal(lessons[0].title, 'Číselné soustavy');
  assert.equal(addBuiltInLesson(lessons, subject.id, 'soustavy'), false);
});

test('AC2: with no kit the subject is a plain one', () => {
  const subject = subjectFromKit(null, { name: 'Příliš žluťoučký kůň', icon: 'book', color: 'red', id: 's-plain' });
  assert.equal(subject.kit, undefined);
  assert.equal(subject.plan, undefined);
  assert.deepEqual(subject.apps, []);
});

// ---------------------------------------------------------------- AC3: setup reaches every prompt

/** A realistic chat reply: friendly prose, then the one JSON block the interview ends with. */
const SETUP_REPLY = `Thank you, that is everything I needed. Here is the proposal for your subject.

\`\`\`json
{
  "profile": "Physics in class 2.B: the school textbook plus teacher slides, written tests with calculation tasks, the teacher is strict about units.",
  "plan": { "template": "physics", "extra": "Always show the units in every step." },
  "assistants": [
    { "name": "Units checker", "blurb": "Finds unit mistakes", "icon": "target", "prompt": "You check the units in every solution for {subject}." }
  ],
  "tools": [],
  "lessons": ["soustavy"]
}
\`\`\``;

test('AC3: a parsed and applied setup puts the profile into every kind of prompt', () => {
  const setup = parseSetup(SETUP_REPLY, { icons: SUBJECT_ICONS, czech: true });
  const subject = subjectFromKit(null, { name: 'Physics', icon: 'atom', color: 'orange', id: 's-phys' });
  let counter = 0;
  const { lessons } = applySetup(subject, setup, { id: () => `c${++counter}` });
  assert.deepEqual(lessons, ['soustavy']);
  const line = profileLine(subject);
  assert.ok(line.startsWith('About Physics in my class: Physics in class 2.B'));
  const assistant = setupAssistant(subject);
  assert.ok(systemPrompt({ assistant, subject, notes: [] }).includes(line), 'system prompt');
  assert.ok(externalPrompt({ assistant, subject }).includes(line), 'copy-paste prompt');
  const lessonPrompt = promptFor(subject);
  assert.ok(lessonPrompt.includes(line), 'lesson prompt');
  assert.ok(lessonPrompt.includes('Always show the units in every step.'), 'plan instructions');
});

test('AC3: applying the setup creates the custom assistant and the lesson list is ready to add', () => {
  const setup = parseSetup(SETUP_REPLY, { icons: SUBJECT_ICONS, czech: true });
  const subject = subjectFromKit(null, { name: 'Physics', icon: 'atom', color: 'orange', id: 's-phys' });
  const { lessons } = applySetup(subject, setup, { id: () => 'c1' });
  assert.equal(subject.assistants.length, 1);
  assert.equal(subject.assistants[0].fromSetup, true);
  assert.equal(subject.assistants[0].name, 'Units checker');
  assert.equal(subject.plan.template, 'physics');
  const stored = [];
  assert.equal(addBuiltInLesson(stored, subject.id, lessons[0]), true);
});

// ---------------------------------------------------------------- Round 2: onboarding, curriculum, test check

/** A student profile for an 8-year-old in Germany, as the Get started interview saves it. */
const YOUNG_PROFILE = { age: 8, year: 2, stage: 'primary', school: 'Grundschule Nord', subjects: ['Maths', 'German'], goals: 'Read faster', notes: '', done: false };

/** A student profile for a 16-year-old: no age-fitting style line is added for them. */
const TEEN_PROFILE = { age: 16, year: 10, stage: 'upper', school: '', subjects: ['Physics'], goals: '', notes: '', done: false };

/** A realistic reply to the curriculum prompt: prose, then one fenced JSON block with three subjects. */
const CURRICULUM_REPLY = `Here is a plan for the school year. I kept the topics close to what is typical for this level.

\`\`\`json
{
  "subjects": [
    {
      "name": "maths",
      "icon": "math",
      "color": "violet",
      "template": "math",
      "profile": "Adding and subtracting to 100, the times tables, simple shapes. Tests are short written sums.",
      "topics": [
        { "title": "Numbers to 100", "detail": "Count, compare and order." },
        { "title": "Adding and subtracting", "detail": "Without carrying first." },
        { "title": "Times tables", "detail": "2, 5 and 10." },
        { "title": "Shapes", "detail": "Circle, square, triangle." }
      ],
      "apps": []
    },
    {
      "name": "French",
      "icon": "rocket",
      "color": "sparkly",
      "template": "does-not-exist",
      "profile": "First words and greetings.",
      "topics": [ { "title": "Greetings", "detail": "Bonjour and salut." }, "Colours" ],
      "apps": ["french", "klingon"]
    },
    {
      "name": "Art",
      "icon": "palette",
      "color": "pink",
      "template": "general",
      "profile": "",
      "topics": [ { "title": "Mixing colours", "detail": "" } ],
      "apps": []
    }
  ]
}
\`\`\`

Tell me if you want changes.`;

/** An id generator that counts up, so applied records are predictable. */
const counterIds = () => {
  let counter = 0;
  return () => `id${++counter}`;
};

/** Matches a high surrogate without a low one after it, or a low surrogate without a high one before it. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Runs `body` and restores the default locale afterwards, so one test's profile never leaks.
 *
 * @param {Function} body The test body.
 * @returns {*} Whatever `body` returns.
 */
function withLocaleReset(body) {
  try {
    return body();
  } finally {
    setLocale({ language: 'en' });
  }
}

test('AC1: a new account saves a student profile through the store and keeps it normalized', () => withLocaleReset(() => {
  const account = store.createAccount('Profile user');
  assert.ok(store.useAccount(account.id));
  assert.equal(store.subjects.length, 0);
  store.saveStudent({ ...store.settings.student, ...YOUNG_PROFILE, age: '8', school: '  Grundschule   Nord ' });
  assert.equal(store.settings.student.age, 8);
  assert.equal(store.settings.student.school, 'Grundschule Nord');
  assert.deepEqual(store.settings.student.subjects, ['Maths', 'German']);
  // Opening the account again reads the saved profile back.
  assert.ok(store.useAccount(account.id));
  assert.equal(store.settings.student.year, 2);
}));

test('AC1: the curriculum prompt carries the profile text and the subjects', () => withLocaleReset(() => {
  setLocale({ language: 'en', country: 'DE', student: YOUNG_PROFILE });
  const text = studentText();
  assert.ok(text.startsWith('an 8-year-old student in year 2 of primary school'), text);
  const prompt = curriculumPrompt({ studentText: text, audience: audienceText(), subjects: YOUNG_PROFILE.subjects, goals: YOUNG_PROFILE.goals });
  assert.ok(prompt.includes(text), 'student text');
  assert.ok(prompt.includes('- Maths') && prompt.includes('- German'), 'subjects');
  assert.ok(prompt.includes('Read faster'), 'goals');
  assert.ok(prompt.includes(audienceText()), 'audience line');
  assert.equal(prompt.match(/```json/g).length, 1);
}));

test('AC2: a realistic curriculum reply is parsed and applied: names, topics, apps, existing id kept', () => {
  const curriculum = parseCurriculum(CURRICULUM_REPLY);
  assert.deepEqual(curriculum.subjects.map(s => s.name), ['maths', 'French', 'Art']);
  const french = curriculum.subjects[1];
  assert.equal(french.icon, 'book', 'unknown icon');
  assert.ok(COLORS.includes(french.color), 'unknown colour');
  assert.equal(french.template, 'general', 'unknown template');
  assert.deepEqual(french.apps, ['french'], 'bogus app key dropped');
  assert.deepEqual(french.topics.map(t => t.title), ['Greetings', 'Colours']);

  const subjects = [{ id: 'existing-maths', name: 'Maths', icon: 'book', color: 'red', apps: [], assistants: [], created: 1, topics: [{ id: 't0', title: 'Shapes', detail: '', done: true }] }];
  const { added, updated } = applyCurriculum(subjects, curriculum, { id: counterIds(), now: 5 });
  assert.deepEqual(updated, ['Maths']);
  assert.deepEqual(added, ['French', 'Art']);
  assert.equal(subjects.length, 3);
  const maths = subjects[0];
  assert.equal(maths.id, 'existing-maths');
  assert.equal(maths.name, 'Maths', 'the existing name is kept');
  assert.ok(maths.profile.startsWith('Adding and subtracting'));
  assert.equal(maths.plan.template, 'math');
  assert.equal(maths.topics.length, 4);
  assert.equal(maths.topics.find(t => t.title === 'Shapes').done, true, 'a ticked topic stays ticked');
  assert.equal(subjects[1].apps.includes('french'), true);
  assert.equal(subjects[1].topics.length, 2);
  assert.equal(subjects[2].profile, undefined, 'an empty profile is not set');
});

test('AC2: "create subjects without AI" adds only the missing names, ignoring case', () => {
  const subjects = [{ id: 's1', name: 'maths', icon: 'math', color: 'blue', apps: [], assistants: [], created: 1 }];
  const { added } = plainSubjects(subjects, ['Maths', 'German', 'german'], { id: counterIds(), now: 2 });
  assert.deepEqual(added, ['German']);
  assert.deepEqual(subjects.map(s => s.name), ['maths', 'German']);
  assert.equal(subjects[1].kit, undefined);
});

test('AC3: for an 8-year-old in Germany every prompt carries the student text and the audience line', () => withLocaleReset(() => {
  setLocale({ language: 'en', country: 'DE', student: YOUNG_PROFILE });
  const text = studentText();
  const audience = audienceText();
  assert.ok(text.includes('8-year-old') && text.includes('Germany'), text);
  assert.ok(audience.includes('about 8 years old'), audience);
  const subject = subjectFromKit(null, { name: 'Maths', icon: 'math', color: 'blue', id: 's-m' });
  subject.plan = { template: 'math' };
  const assistant = setupAssistant(subject);
  const prompts = {
    system: systemPrompt({ assistant, subject, notes: [] }),
    external: externalPrompt({ assistant, subject }),
    lesson: promptFor(subject),
    setup: setupPrompt(subject),
  };
  for (const [name, prompt] of Object.entries(prompts)) {
    assert.ok(prompt.includes(audience), `${name} prompt has the audience line`);
    assert.ok(prompt.includes('8-year-old'), `${name} prompt has the student text`);
  }
}));

test('AC3: a 16-year-old\'s prompts have no audience line', () => withLocaleReset(() => {
  setLocale({ language: 'en', country: 'DE', student: TEEN_PROFILE });
  assert.equal(audienceText(), '');
  assert.ok(studentText().includes('16-year-old'));
  const subject = subjectFromKit(null, { name: 'Physics', icon: 'atom', color: 'orange', id: 's-p' });
  const assistant = setupAssistant(subject);
  for (const prompt of [systemPrompt({ assistant, subject, notes: [] }), externalPrompt({ assistant, subject }), promptFor(subject), setupPrompt(subject)]) {
    assert.ok(!prompt.includes('The student is about'), 'no young-student style line');
    assert.ok(prompt.includes('16-year-old'));
  }
}));

test('AC9: outside the Czech Republic Czech-only tools and lessons are gone and no prompt assumes a gymnázium', () => withLocaleReset(() => {
  const reply = SETUP_REPLY.replace('"tools": []', '"tools": ["nazvoslovi"]');
  const setup = parseSetup(reply, { icons: SUBJECT_ICONS, czech: false });
  assert.deepEqual(setup.tools, []);
  assert.deepEqual(setup.lessons, []);
  for (const kit of kitsFor(false)) {
    assert.ok(!(kit.tools || []).some(tool => tool === 'nazvoslovi'), `tools of ${kit.id}`);
    assert.ok(!(kit.lessons || []).includes('soustavy'), `lessons of ${kit.id}`);
    assert.ok(!kit.czech, `${kit.id} is offered abroad`);
  }
  setLocale({ language: 'en', country: 'US' });
  assert.equal(studentText(), 'a school student in the United States');
  const text = studentText();
  assert.ok(!/gymn[aá]zium/i.test(text) && !text.includes('secondary school'), text);
}));

/** A realistic reply to the check prompt: three questions, one hard to read, one with points, one blank. */
const CHECK_REPLY = `I read all three photos. Here is the result.

\`\`\`json
{
  "title": "Fractions test",
  "summary": "Two questions were answered well; one needs revising.",
  "focus": ["Adding fractions", "Common denominators"],
  "questions": [
    { "number": "1", "question": "1/2 + 1/4 = ?", "studentAnswer": "3/4", "correctAnswer": "3/4", "verdict": "correct",
      "explanation": "1/2 is 2/4.", "tip": "Make the denominators equal first.", "points": { "earned": 2, "max": 2 } },
    { "number": 2, "question": "2/3 + 1/6 = ?", "studentAnswer": "3/9", "correctAnswer": "5/6", "verdict": "wrong",
      "explanation": "Do not add the denominators.", "tip": "Find the common denominator.", "confidence": "low", "points": { "earned": 0, "max": 3 } },
    { "question": "Name the shape with 3 sides.", "studentAnswer": "", "correctAnswer": "Triangle", "verdict": "blank",
      "explanation": "A triangle has three sides.", "tip": "Count the corners." }
  ]
}
\`\`\``;

test('AC6: a multi-question check reply is parsed, counted, saved to the store and survives a backup', () => withLocaleReset(() => {
  const result = parseCheck(CHECK_REPLY);
  assert.deepEqual(result.questions.map(q => q.number), ['1', '2', '3'], 'numbers: given as string, as number, defaulted');
  assert.deepEqual(checkStats(result), {
    total: 3, correct: 1, partial: 0, wrong: 1, blank: 1, unreadable: 0, lowConfidence: 1, earned: 2, max: 5,
  });

  const account = store.createAccount('Check user');
  assert.ok(store.useAccount(account.id));
  const record = newCheck({ subjectId: 's-m', eventId: 'e1', mode: 'check', result, id: 'chk1', now: 100 });
  store.checks.unshift(record);
  store.save('checks');
  assert.ok(store.useAccount(account.id));
  assert.equal(store.checks.length, 1, 'saved results are reloaded with the account');
  assert.equal(store.checks[0].result.questions.length, 3);

  const file = JSON.stringify(buildBackup(store, { name: 'Check user', version: 'test' }));
  assert.ok(!file.includes('data:image') && !file.includes('image_url'), 'photos are never stored');
  assert.deepEqual(Object.keys(store.checks[0]).sort(), ['created', 'eventId', 'id', 'mode', 'result', 'subjectId']);
  const restored = parseBackup(file);
  assert.equal(restored.data.checks.length, 1);
  assert.deepEqual(restored.data.checks[0], record);
}));

test('AC6: the check prompt asks for the photos it was given and the student text', () => withLocaleReset(() => {
  setLocale({ language: 'en', country: 'DE', student: YOUNG_PROFILE });
  const prompt = checkPrompt({ subjectName: 'Maths', studentText: studentText(), audience: audienceText(), mode: 'check', photos: 3, external: true });
  assert.ok(prompt.includes('I attached 3 photos'));
  assert.ok(prompt.includes('8-year-old') && prompt.includes(audienceText()));
}));

test('E2: a rechecked question replaces one question and keeps its number', () => {
  const result = parseCheck(CHECK_REPLY);
  const reply = 'Corrected:\n```json\n{ "number": "99", "question": "2/3 + 1/6 = ?", "studentAnswer": "5/6", "correctAnswer": "5/6", "verdict": "correct", "explanation": "Right.", "tip": "Good." }\n```';
  const fixed = parseRecheck(reply, result.questions[1].number);
  assert.equal(fixed.number, '2');
  assert.equal(fixed.verdict, 'correct');
  const questions = result.questions.map(q => (q.number === fixed.number ? fixed : q));
  assert.equal(questions.length, 3);
  assert.equal(checkStats({ questions }).correct, 2);
});

test('E3: adding mistakes twice makes no duplicates and the lesson works as flashcards', () => {
  const cards = mistakeCards(parseCheck(CHECK_REPLY));
  assert.equal(cards.length, 2, 'the wrong and the blank question');
  const lessons = [];
  const ids = counterIds();
  assert.equal(addMistakeCards(lessons, { subjectId: 's-m', subjectName: 'Maths', cards, id: ids, now: 1 }).added, 2);
  assert.equal(addMistakeCards(lessons, { subjectId: 's-m', subjectName: 'Maths', cards, id: ids, now: 2 }).added, 0);
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].kind, MISTAKES_KIND);
  const flashcards = cardsOf(lessons[0]);
  assert.equal(flashcards.length, 2);
  assert.ok(flashcards.every(card => card.lessonId === lessons[0].id));
});

test('AC12: clipped caps never leave a lone surrogate in a setup profile, a check question or a curriculum topic', () => {
  const emoji = '\u{1F600}';
  // 1999 or 599 or 79 ordinary characters, then an emoji straddling the cap, then more text.
  const profile = `${'a'.repeat(1999)}${emoji}tail`;
  const setup = parseSetup(JSON.stringify({ profile, plan: { template: 'general' } }), { icons: SUBJECT_ICONS, czech: false });
  assert.ok(!LONE_SURROGATE.test(setup.profile), 'setup profile');
  assert.ok(setup.profile.length > 0);

  const question = `${'q'.repeat(599)}${emoji}tail`;
  const check = parseCheck(JSON.stringify({ questions: [{ question, verdict: 'wrong', correctAnswer: 'x' }] }));
  assert.ok(!LONE_SURROGATE.test(check.questions[0].question), 'check question');

  const title = `${'t'.repeat(79)}${emoji}tail`;
  const curriculum = parseCurriculum(JSON.stringify({ subjects: [{ name: 'Maths', topics: [{ title, detail: `${'d'.repeat(199)}${emoji}x` }] }] }));
  assert.ok(!LONE_SURROGATE.test(curriculum.subjects[0].topics[0].title), 'curriculum topic title');
  assert.ok(!LONE_SURROGATE.test(curriculum.subjects[0].topics[0].detail), 'curriculum topic detail');
});
