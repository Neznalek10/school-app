/**
 * Tests for js/subjects.js, js/soustavy.js (addBuiltInLesson) and the account defaults in js/store.js.
 *
 * Responsibility: protect the Languages-only defaults (AC1), the starter kits (AC2), hasTool, assistantsOf,
 * the addLaterDefaults guard and the once-per-subject built-in lesson. No network; store.js falls back to
 * its in-memory storage under gjs, so nothing touches real browser data.
 */
import { test, assert } from './harness.mjs';
import { TEMPLATES } from '../../js/study.js';
import { SETUP_ID, SETUP_TOOLS, SETUP_LESSONS, applySetup } from '../../js/setup.js';
import {
  KITS, kitsFor, COLORS, SUBJECT_ICONS, PRESETS, LATER_DEFAULTS, LEGACY_TOOLS,
  defaultSubjects, subjectFromKit, hasTool, assistantsOf, addLaterDefaults,
} from '../../js/subjects.js';
import { addBuiltInLesson } from '../../js/soustavy.js';
import { store } from '../../js/store.js';

test('a new account starts with exactly one subject, Languages, with both language apps', () => {
  const subjects = defaultSubjects();
  assert.equal(subjects.length, 1);
  assert.equal(subjects[0].id, 'languages');
  assert.deepEqual(subjects[0].apps, ['french', 'english']);
});

test('defaultSubjects returns fresh objects each call', () => {
  const a = defaultSubjects();
  a[0].apps.push('x');
  assert.deepEqual(defaultSubjects()[0].apps, ['french', 'english']);
});

test('createAccount records addedDefaults and useAccount loads one subject', () => {
  const account = store.createAccount('Subjects test user');
  assert.ok(store.useAccount(account.id));
  assert.equal(store.subjects.length, 1);
  assert.deepEqual(store.settings.addedDefaults, []);
  assert.equal(store.lessons.length, 0);
});

test('there are eleven kits with unique ids, and each kit points at a real template, icon and colour', () => {
  assert.equal(KITS.length, 11);
  assert.equal(new Set(KITS.map(k => k.id)).size, 11);
  for (const kit of KITS) {
    assert.ok(Object.hasOwn(TEMPLATES, kit.plan), `plan of ${kit.id}`);
    assert.ok(SUBJECT_ICONS.includes(kit.icon), `icon of ${kit.id}`);
    assert.ok(COLORS.includes(kit.color), `colour of ${kit.id}`);
    for (const tool of kit.tools || []) assert.ok(Object.hasOwn(SETUP_TOOLS, tool), `tool ${tool}`);
    for (const lesson of kit.lessons || []) assert.ok(Object.hasOwn(SETUP_LESSONS, lesson), `lesson ${lesson}`);
  }
});

test('kits carry the tools and lessons from AC2', () => {
  const byId = Object.fromEntries(KITS.map(k => [k.id, k]));
  assert.deepEqual(byId.chemistry.tools, ['nazvoslovi']);
  assert.deepEqual(byId.informatics.lessons, ['soustavy']);
  assert.equal(byId.math.tools, undefined);
});

test('kitsFor offers the Czech kits to Czech accounts and neutral ones without Czech tools to others', () => {
  const czech = kitsFor(true).map(k => k.id);
  assert.equal(czech.length, 9);
  assert.ok(czech.includes('czech') && czech.includes('zsv') && !czech.includes('social'));
  const intl = Object.fromEntries(kitsFor(false).map(k => [k.id, k]));
  assert.equal(Object.keys(intl).length, 9);
  assert.ok(intl.language && intl.social && !intl.czech && !intl.zsv);
  assert.deepEqual(intl.chemistry.tools, []);
  assert.deepEqual(intl.informatics.lessons, []);
  assert.equal(subjectFromKit(intl.chemistry, { name: 'Chemistry', icon: 'flask', color: 'teal', id: 's2' }).tools, undefined);
});

test('subjectFromKit with a kit prefills plan, kit id and tools', () => {
  const chem = KITS.find(k => k.id === 'chemistry');
  const s = subjectFromKit(chem, { name: 'Chemie', icon: 'flask', color: 'teal', id: 's1', now: 5 });
  assert.deepEqual(s, {
    id: 's1', name: 'Chemie', icon: 'flask', color: 'teal', apps: [], assistants: [], created: 5,
    kit: 'chemistry', plan: { template: 'research' }, tools: ['nazvoslovi'],
  });
  s.tools.push('x');
  assert.deepEqual(chem.tools, ['nazvoslovi']);
});

test('subjectFromKit without a kit makes a plain subject', () => {
  const s = subjectFromKit(null, { name: 'Příliš žluťoučký kůň', icon: 'book', color: 'red', id: 's2', now: 1 });
  assert.deepEqual(s, { id: 's2', name: 'Příliš žluťoučký kůň', icon: 'book', color: 'red', apps: [], assistants: [], created: 1 });
});

test('subjectFromKit requires an id', () => {
  assert.throws(() => subjectFromKit(null, { name: 'A', icon: 'book', color: 'red' }), /id/);
});

test('hasTool: explicit list and legacy chemistry id, which an empty list does not hide', () => {
  assert.equal(hasTool({ id: 's1', tools: ['nazvoslovi'] }, 'nazvoslovi'), true);
  assert.equal(hasTool({ id: 's1' }, 'nazvoslovi'), false);
  assert.deepEqual(LEGACY_TOOLS.chemistry, ['nazvoslovi']);
  assert.equal(hasTool({ id: 'chemistry' }, 'nazvoslovi'), true);
  assert.equal(hasTool({ id: 'chemistry', tools: [] }, 'nazvoslovi'), true);
  assert.equal(hasTool({ id: 's1', tools: [] }, 'nazvoslovi'), false);
});

test('assistantsOf puts the setup assistant first, then presets, then custom with defaults', () => {
  const list = assistantsOf({ id: 's1', name: 'Physics', assistants: [{ id: 'c1', name: 'Mine', prompt: 'p' }] });
  assert.equal(list[0].id, SETUP_ID);
  assert.deepEqual(list.slice(1, 1 + PRESETS.length).map(a => a.id), PRESETS.map(p => p.id));
  assert.ok(list.slice(1, 1 + PRESETS.length).every(a => a.preset));
  const mine = list[list.length - 1];
  assert.equal(mine.id, 'c1');
  assert.equal(mine.icon, 'bulb');
  assert.equal(assistantsOf({ id: 's1', name: 'X' }).length, 1 + PRESETS.length);
});

test('preset ids are never handed out to setup-made assistants (setup.js keeps its own reserved list)', () => {
  const setup = {
    profile: 'x'.repeat(50), plan: { template: 'general', extra: '' }, tools: [], lessons: [],
    assistants: [{ name: 'A', blurb: '', icon: 'bulb', prompt: 'You are a helper for this subject.' }],
  };
  // The generator offers every preset id first; applySetup must skip them all.
  const offers = [...PRESETS.map(p => p.id), SETUP_ID, 'fresh'];
  const subject = { id: 's1', name: 'X', assistants: [] };
  applySetup(subject, setup, { id: () => offers.shift() });
  assert.equal(subject.assistants[0].id, 'fresh');
});

test('addLaterDefaults with no later defaults changes nothing and never inserts undefined', () => {
  assert.deepEqual(LATER_DEFAULTS, []);
  const subjects = defaultSubjects();
  const result = addLaterDefaults(subjects, []);
  assert.deepEqual(result, { added: [], changed: false });
  assert.equal(subjects.length, 1);
});

test('addLaterDefaults keeps already handled ids', () => {
  assert.deepEqual(addLaterDefaults(defaultSubjects(), ['zsv']), { added: ['zsv'], changed: false });
});

test('addBuiltInLesson adds the lesson once per subject', () => {
  const lessons = [];
  assert.equal(addBuiltInLesson(lessons, 's1', 'soustavy', 7), true);
  assert.equal(lessons.length, 1);
  const lesson = lessons[0];
  assert.equal(lesson.subjectId, 's1');
  assert.equal(lesson.generator, 'soustavy');
  assert.equal(lesson.created, 7);
  assert.equal(lesson.title, 'Číselné soustavy');
  assert.ok(lesson.data.exercises.length > 0);
  assert.equal(addBuiltInLesson(lessons, 's1', 'soustavy'), false);
  assert.equal(lessons.length, 1);
});

test('addBuiltInLesson gives a second subject its own lesson with a unique id', () => {
  const lessons = [];
  addBuiltInLesson(lessons, 's1', 'soustavy');
  assert.equal(addBuiltInLesson(lessons, 's2', 'soustavy'), true);
  assert.equal(new Set(lessons.map(l => l.id)).size, 2);
});

test('addBuiltInLesson returns false for unknown ids, including prototype names', () => {
  const lessons = [];
  assert.equal(addBuiltInLesson(lessons, 's1', 'nope'), false);
  assert.equal(addBuiltInLesson(lessons, 's1', 'toString'), false);
  assert.equal(lessons.length, 0);
});

test('addLaterDefaults records but never inserts an id that is missing from the defaults', () => {
  const subjects = defaultSubjects();
  LATER_DEFAULTS.push('ghost');
  try {
    const result = addLaterDefaults(subjects, []);
    assert.deepEqual(result, { added: ['ghost'], changed: true });
    assert.equal(subjects.length, 1);
    assert.ok(subjects.every(s => s && s.id));
  } finally {
    LATER_DEFAULTS.pop();
  }
});

/**
 * Runs fn with a fake localStorage on globalThis so a test can read exactly what store.js wrote.
 *
 * @param {(raw: (key: string) => any) => void} fn Receives a reader that parses a stored key.
 */
function withFakeStorage(fn) {
  const data = new Map();
  const before = globalThis.localStorage;
  globalThis.localStorage = {
    /** Returns the stored string, or null when the key is missing. */
    getItem: k => (data.has(k) ? data.get(k) : null),
    /** Stores the value as a string. */
    setItem: (k, v) => data.set(k, String(v)),
    /** Deletes the key. */
    removeItem: k => data.delete(k),
  };
  try {
    fn(k => JSON.parse(data.get(k)));
  } finally {
    globalThis.localStorage = before;
  }
}

test('createAccount stores settings.ai so a key from .env has a config to fill', () => {
  withFakeStorage(raw => {
    const account = store.createAccount('Test');
    const settings = raw(`school.${account.id}.settings`);
    assert.equal(settings.ai.url, 'https://openrouter.ai/api/v1');
    assert.equal(settings.ai.key, '');
  });
});

test('restoreAccount adds default AI settings to a backup that has none and keeps other settings', () => {
  withFakeStorage(raw => {
    const withTheme = store.restoreAccount('A', { settings: { theme: 'dark' } });
    const stored = raw(`school.${withTheme.id}.settings`);
    assert.equal(stored.theme, 'dark');
    assert.equal(stored.ai.model, 'openrouter/free');
    const noSettings = store.restoreAccount('B', { subjects: [] });
    assert.equal(raw(`school.${noSettings.id}.settings`).ai.key, '');
  });
});
