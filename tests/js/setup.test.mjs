/**
 * Tests for js/setup.js: the interview prompt, parseSetup against realistic AI replies, applySetup and setupSummary.
 *
 * Responsibility: protect the setup contract (plan.md section 6, "js/setup.js"). Pure logic only: no network,
 * no storage; ids come from a counter so results are deterministic.
 */
import { test, assert } from './harness.mjs';
import { TEMPLATES } from '../../js/study.js';
import { setLocale } from '../../js/locale.js';
import {
  SETUP_ID, SETUP_TOOLS, SETUP_LESSONS, MAX_SETUP_ASSISTANTS,
  setupAssistant, setupPrompt, parseSetup, applySetup, setupSummary,
} from '../../js/setup.js';

const ICONS = ['book', 'bulb', 'target'];
const PROFILE = 'Chemistry in class 1.A: the textbook plus teacher presentations, written tests with naming tasks, strict on units.';

/** Returns an id generator that yields c1, c2, ... */
function counter() {
  let n = 0;
  return () => `c${++n}`;
}

/** Builds a reply: prose, then a fenced JSON block made from `data` (or raw text). */
function reply(data, { before = 'Great, the setup is ready.\n\n' } = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return `${before}\`\`\`json\n${body}\n\`\`\``;
}

const GOOD = {
  profile: PROFILE,
  plan: { template: 'research', extra: 'Stress naming rules.' },
  assistants: [{ name: 'Naming drill', blurb: 'Practise names', icon: 'target', prompt: 'You drill chemical naming for Chemistry.' }],
  tools: ['nazvoslovi'],
  lessons: [],
};

test('setupAssistant is a preset setup assistant with the subject in its prompt', () => {
  const a = setupAssistant({ name: 'Chemistry' });
  assert.equal(a.id, SETUP_ID);
  assert.equal(a.name, 'Set up this subject');
  assert.equal(a.icon, 'sparkle');
  assert.equal(a.starter, 'Start the interview');
  assert.equal(a.useNotes, false);
  assert.ok(a.setup && a.preset);
  assert.ok(a.prompt.includes('"Chemistry"'));
});

test('prompt demands one question per message and accepts done and hotovo', () => {
  const p = setupPrompt({ name: 'Physics' });
  assert.match(p, /exactly one question per message/);
  assert.match(p, /"done" or "hotovo"/);
  assert.match(p, /ONE ```json code block/);
  for (const topic of ['sources', 'tests look', 'teacher', 'hard', 'goals', 'language']) assert.match(p, new RegExp(topic));
});

test('prompt lists every template with label and hint, every tool and lesson', () => {
  setLocale({ language: 'en', country: 'CZ' });
  const p = setupPrompt({ name: 'Physics' });
  for (const [key, t] of Object.entries(TEMPLATES)) {
    assert.ok(p.includes(`"${key}": ${t.label}. ${t.hint}`), `template ${key}`);
  }
  for (const [key, d] of Object.entries({ ...SETUP_TOOLS, ...SETUP_LESSONS })) assert.ok(p.includes(`"${key}": ${d}`), key);
});

test('outside the Czech Republic the prompt offers no Czech tools and describes the student by country', () => {
  setLocale({ language: 'en', country: 'DE' });
  const p = setupPrompt({ name: 'Physics' });
  for (const key of Object.keys({ ...SETUP_TOOLS, ...SETUP_LESSONS })) assert.ok(!p.includes(`"${key}":`), key);
  assert.ok(p.includes('a secondary school student in Germany'));
  assert.ok(!p.includes('gymnázium'));
  setLocale({ language: 'en', country: '' });
});

test('prompt quotes the current profile only when there is one and has no subject placeholder', () => {
  assert.ok(!setupPrompt({ name: 'Physics' }).includes('current profile'));
  assert.ok(setupPrompt({ name: 'Physics', profile: PROFILE }).includes(PROFILE));
  assert.ok(!setupPrompt({ name: 'Physics' }).includes('{subject}'));
});

test('parseSetup reads a reply with prose before the block', () => {
  const s = parseSetup(reply(GOOD), { icons: ICONS });
  assert.equal(s.profile, PROFILE);
  assert.deepEqual(s.plan, { template: 'research', extra: 'Stress naming rules.' });
  assert.equal(s.assistants[0].icon, 'target');
  assert.deepEqual(s.tools, ['nazvoslovi']);
  assert.deepEqual(s.lessons, []);
});

test('parseSetup repairs curly quotes and trailing commas', () => {
  const raw = `{ “profile”: “${PROFILE}”, “plan”: { “template”: “math”, “extra”: “”, }, “assistants”: [], “tools”: [], “lessons”: [“soustavy”,], }`;
  const s = parseSetup(`Here you go:\n${raw}`, { icons: ICONS });
  assert.equal(s.plan.template, 'math');
  assert.deepEqual(s.lessons, ['soustavy']);
});

test('parseSetup falls back to general for an unknown or inherited template', () => {
  for (const template of ['astrology', 'constructor', 7]) {
    const s = parseSetup(reply({ ...GOOD, plan: { template } }), { icons: ICONS });
    assert.equal(s.plan.template, 'general');
  }
});

test('parseSetup limits assistants and drops broken ones', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ name: `Helper ${i}`, prompt: 'You help with the subject.' }));
  const s = parseSetup(reply({ ...GOOD, assistants: [{ name: '', prompt: 'You help with the subject.' }, { name: 'Short', prompt: 'too short' }, ...many] }), { icons: ICONS });
  assert.equal(s.assistants.length, MAX_SETUP_ASSISTANTS);
  assert.equal(s.assistants[0].name, 'Helper 0');
});

test('parseSetup gives unknown icons bulb and trims long fields', () => {
  const a = { name: 'N'.repeat(60), blurb: 'B'.repeat(200), icon: 'rocket', prompt: 'P'.repeat(4000) };
  const s = parseSetup(reply({ ...GOOD, assistants: [a] }), { icons: ICONS });
  assert.equal(s.assistants[0].icon, 'bulb');
  assert.equal(s.assistants[0].name.length, 40);
  assert.equal(s.assistants[0].blurb.length, 120);
  assert.equal(s.assistants[0].prompt.length, 3000);
});

test('parseSetup drops unknown tools and lessons, duplicates and ignores extra fields', () => {
  const s = parseSetup(reply({ ...GOOD, tools: ['nazvoslovi', 'nazvoslovi', 'hack', 5], lessons: 'soustavy', mood: 'happy' }), { icons: ICONS });
  assert.deepEqual(s.tools, ['nazvoslovi']);
  assert.deepEqual(s.lessons, []);
  assert.ok(!('mood' in s));
});

test('parseSetup rejects a missing or too short profile with a helpful message', () => {
  assert.throws(() => parseSetup(reply({ ...GOOD, profile: undefined }), { icons: ICONS }), /no subject profile/);
  assert.throws(() => parseSetup(reply({ ...GOOD, profile: 'Too short.' }), { icons: ICONS }), /at least 40/);
});

test('parseSetup rejects text without JSON and an object without a profile', () => {
  assert.throws(() => parseSetup('Sorry, no idea.', { icons: ICONS }), /final answer/);
  assert.throws(() => parseSetup('```json\n[{"a": 1}]\n```', { icons: ICONS }), /no subject profile/);
});

test('parseSetup works with Czech text in the profile', () => {
  const profile = 'Příliš žluťoučký kůň: učebnice, prezentace a pololetní písemky z českého jazyka.';
  assert.equal(parseSetup(reply({ ...GOOD, profile }), { icons: ICONS }).profile, profile);
});

test('applySetup sets profile, plan, tools, setupAt and returns lessons', () => {
  const subject = { id: 's1', name: 'Chemistry', assistants: [] };
  const setup = parseSetup(reply({ ...GOOD, lessons: ['soustavy'] }), { icons: ICONS });
  const result = applySetup(subject, setup, { now: 42, id: counter() });
  assert.equal(subject.profile, PROFILE);
  assert.deepEqual(subject.plan, { template: 'research', extra: 'Stress naming rules.' });
  assert.deepEqual(subject.tools, ['nazvoslovi']);
  assert.equal(subject.setupAt, 42);
  assert.deepEqual(result, { lessons: ['soustavy'] });
  assert.deepEqual(subject.assistants.map(a => [a.id, a.fromSetup]), [['c1', true]]);
});

test('applySetup replaces setup-made assistants and keeps the student\'s own', () => {
  const subject = {
    name: 'Chemistry',
    assistants: [{ id: 'own', name: 'Mine', prompt: 'x' }, { id: 'old', name: 'Old', fromSetup: true, prompt: 'y' }],
  };
  applySetup(subject, parseSetup(reply(GOOD), { icons: ICONS }), { id: counter() });
  assert.deepEqual(subject.assistants.map(a => a.name), ['Mine', 'Naming drill']);
});

test('applySetup drops an old custom plan prompt and an empty extra', () => {
  const subject = { name: 'Czech', plan: { template: 'history', prompt: 'custom prompt' }, assistants: [] };
  applySetup(subject, parseSetup(reply({ ...GOOD, plan: { template: 'literature', extra: '' } }), { icons: ICONS }), { id: counter() });
  assert.deepEqual(subject.plan, { template: 'literature' });
});

test('applySetup never reuses a reserved or taken id', () => {
  const subject = { name: 'X', assistants: [{ id: 'c2', name: 'Mine', prompt: 'x' }] };
  const ids = ['tutor', 'setup', 'c2', 'fresh'];
  applySetup(subject, parseSetup(reply(GOOD), { icons: ICONS }), { id: () => ids.shift() });
  assert.equal(subject.assistants.at(-1).id, 'fresh');
});

test('applySetup requires an id generator and fails on a stuck one', () => {
  const setup = parseSetup(reply(GOOD), { icons: ICONS });
  assert.throws(() => applySetup({ name: 'X' }, setup), TypeError);
  assert.throws(() => applySetup({ name: 'X' }, setup, { id: () => 'tutor' }), /unique assistant id/);
});

test('applySetup does not share arrays with the setup', () => {
  const setup = parseSetup(reply(GOOD), { icons: ICONS });
  const subject = { name: 'X' };
  applySetup(subject, setup, { id: counter() });
  subject.tools.push('other');
  assert.deepEqual(setup.tools, ['nazvoslovi']);
});

test('setupSummary shows the full profile, lesson instructions and every assistant prompt', () => {
  const setup = parseSetup(reply({ ...GOOD, lessons: ['soustavy'] }), { icons: ICONS });
  assert.deepEqual(setupSummary(setup), [
    `Profile: ${PROFILE}`,
    'Learning plan: Research',
    'Lesson instructions: Stress naming rules.',
    'Assistant Naming drill: You drill chemical naming for Chemistry.',
    'Tools: Názvosloví',
    'Lessons: Číselné soustavy',
  ]);
});

test('setupSummary does not shorten a long profile and skips empty parts', () => {
  const profile = 'p'.repeat(500);
  const lines = setupSummary(parseSetup(reply({ ...GOOD, profile, plan: { template: 'x' }, assistants: [], tools: [] }), { icons: ICONS }));
  assert.deepEqual(lines, [`Profile: ${profile}`, 'Learning plan: General']);
});

test('applySetup only adds tools: existing ones stay and none is left undefined', () => {
  const none = parseSetup(reply({ ...GOOD, tools: [] }), { icons: ICONS });
  const chem = { name: 'Chemistry', tools: ['nazvoslovi'] };
  applySetup(chem, none, { id: counter() });
  assert.deepEqual(chem.tools, ['nazvoslovi']);
  const plain = { name: 'Czech' };
  applySetup(plain, none, { id: counter() });
  assert.ok(!('tools' in plain));
  const added = { name: 'Chemistry', tools: ['other'] };
  applySetup(added, parseSetup(reply(GOOD), { icons: ICONS }), { id: counter() });
  assert.deepEqual(added.tools, ['other', 'nazvoslovi']);
});

test('setup-made assistants use the student\'s notes', () => {
  const subject = { name: 'Chemistry' };
  applySetup(subject, parseSetup(reply(GOOD), { icons: ICONS }), { id: counter() });
  assert.equal(subject.assistants[0].useNotes, true);
});

test('parseSetup asks for the final answer while the interview is still running', () => {
  const message = /Paste the JSON block from the AI's final answer, once the interview has finished\./;
  assert.throws(() => parseSetup('What topics does your course cover?', { icons: ICONS }), message);
  assert.throws(() => parseSetup('', { icons: ICONS }), message);
});
