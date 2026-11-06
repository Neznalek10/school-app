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
/** Parse options for a Czech account, the only kind that keeps the Czech-only tools and lessons. */
const CZECH = { icons: ICONS, czech: true };
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

test('prompt demands one question per message and accepts "done" in any language', () => {
  const p = setupPrompt({ name: 'Physics' });
  assert.match(p, /exactly one question per message/);
  assert.match(p, /"done" \(or the same word in their own language\)/);
  assert.ok(!p.includes('hotovo'));
  assert.match(p, /ONE ```json code block/);
  for (const topic of ['sources', 'tests look', 'teacher', 'hard', 'goals', 'language']) assert.match(p, new RegExp(topic));
});

test('prompt names general sources, not Google Classroom', () => {
  const p = setupPrompt({ name: 'Physics' });
  assert.ok(p.includes('(textbook, worksheets, presentations, an online classroom)'));
  assert.ok(!p.includes('Google'));
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
  assert.ok(p.includes('a school student in Germany'));
  assert.ok(!p.includes('gymnázium') && !p.includes('secondary school student'));
  setLocale({ language: 'en', country: '' });
});

test('prompt describes the student from the profile and adds the audience line for a young student', () => {
  setLocale({ language: 'en', country: 'DE', student: { age: 7, year: 2, stage: 'primary' } });
  const p = setupPrompt({ name: 'Maths' });
  assert.ok(p.includes('for a 7-year-old student in year 2 of primary school in Germany.'));
  assert.ok(p.includes('The student is about 7 years old and still learning to read and write'));
  setLocale({ language: 'en', country: 'DE', student: { age: 17 } });
  assert.ok(!setupPrompt({ name: 'Maths' }).includes('The student is about'));
  setLocale({ language: 'en', country: '' });
});

test('prompt quotes the current profile only when there is one and has no subject placeholder', () => {
  assert.ok(!setupPrompt({ name: 'Physics' }).includes('current profile'));
  assert.ok(setupPrompt({ name: 'Physics', profile: PROFILE }).includes(PROFILE));
  assert.ok(!setupPrompt({ name: 'Physics' }).includes('{subject}'));
});

test('parseSetup reads a reply with prose before the block', () => {
  const s = parseSetup(reply(GOOD), CZECH);
  assert.equal(s.profile, PROFILE);
  assert.deepEqual(s.plan, { template: 'research', extra: 'Stress naming rules.' });
  assert.equal(s.assistants[0].icon, 'target');
  assert.deepEqual(s.tools, ['nazvoslovi']);
  assert.deepEqual(s.lessons, []);
});

test('parseSetup repairs curly quotes and trailing commas', () => {
  const raw = `{ “profile”: “${PROFILE}”, “plan”: { “template”: “math”, “extra”: “”, }, “assistants”: [], “tools”: [], “lessons”: [“soustavy”,], }`;
  const s = parseSetup(`Here you go:\n${raw}`, CZECH);
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
  const s = parseSetup(reply({ ...GOOD, tools: ['nazvoslovi', 'nazvoslovi', 'hack', 5], lessons: 'soustavy', mood: 'happy' }), CZECH);
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
  const setup = parseSetup(reply({ ...GOOD, lessons: ['soustavy'] }), CZECH);
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
  const setup = parseSetup(reply(GOOD), CZECH);
  const subject = { name: 'X' };
  applySetup(subject, setup, { id: counter() });
  subject.tools.push('other');
  assert.deepEqual(setup.tools, ['nazvoslovi']);
});

test('setupSummary shows the full profile, lesson instructions and every assistant prompt', () => {
  const setup = parseSetup(reply({ ...GOOD, lessons: ['soustavy'] }), CZECH);
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
  applySetup(added, parseSetup(reply(GOOD), CZECH), { id: counter() });
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

test('parseSetup drops the Czech-only tools and lessons when the account is not Czech', () => {
  const answer = reply({ ...GOOD, tools: ['nazvoslovi'], lessons: ['soustavy'] });
  const abroad = parseSetup(answer, { icons: ICONS, czech: false });
  assert.deepEqual([abroad.tools, abroad.lessons], [[], []]);
  const home = parseSetup(answer, CZECH);
  assert.deepEqual([home.tools, home.lessons], [['nazvoslovi'], ['soustavy']]);
});

test('parseSetup takes the Czech gate from the account country when the option is missing', () => {
  const answer = reply({ ...GOOD, tools: ['nazvoslovi'] });
  setLocale({ language: 'en', country: 'CZ' });
  assert.deepEqual(parseSetup(answer, { icons: ICONS }).tools, ['nazvoslovi']);
  setLocale({ language: 'en', country: 'DE' });
  assert.deepEqual(parseSetup(answer, { icons: ICONS }).tools, []);
  setLocale({ language: 'en', country: '' });
});

test('parseSetup cuts long fields without splitting an emoji', () => {
  const profile = `${'p'.repeat(1999)}😀 tail`;
  const prompt = `You help. ${'x'.repeat(2989)}😀 tail`;
  const s = parseSetup(reply({ ...GOOD, profile, assistants: [{ name: 'Helper', prompt }] }), { icons: ICONS });
  assert.equal(s.profile, 'p'.repeat(1999) + '😀');
  // 3000 code points: the emoji counts once but takes two UTF-16 units.
  assert.equal(s.assistants[0].prompt.length, 3001);
  assert.ok(s.assistants[0].prompt.endsWith('😀'));
});

test('applySetup leaves the subject untouched when the id generator is stuck', () => {
  const subject = {
    name: 'Chemistry', profile: 'old', plan: { template: 'history' }, tools: ['other'], setupAt: 1,
    assistants: [{ id: 'own', name: 'Mine', prompt: 'x' }, { id: 'old', name: 'Old', fromSetup: true, prompt: 'y' }],
  };
  const before = JSON.parse(JSON.stringify(subject));
  const setup = parseSetup(reply(GOOD), CZECH);
  assert.throws(() => applySetup(subject, setup, { id: () => 'tutor' }), /unique assistant id/);
  assert.deepEqual(subject, before);
});

test('applySetup leaves the subject untouched when there is no id generator', () => {
  const subject = { name: 'X', profile: 'old' };
  assert.throws(() => applySetup(subject, parseSetup(reply(GOOD), CZECH)), TypeError);
  assert.deepEqual(subject, { name: 'X', profile: 'old' });
});
