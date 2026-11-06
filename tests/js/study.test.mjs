/**
 * Tests for js/study.js: extractJson (finding the JSON object in an AI answer), the lesson prompts
 * (student level, Czech conventions only in [CZ] lines, the style line for young students) and
 * emoji-safe text caps in parseLesson.
 *
 * Responsibility: protect the extractJson, promptFor and template contracts of the plan. Pure logic, no
 * network. Tests that change the locale put it back before they end, because other test files share it.
 */
import { test, assert } from './harness.mjs';
import { extractJson, promptFor, templatePrompt, parseLesson, TEMPLATES } from '../../js/study.js';
import { setLocale, studentText } from '../../js/locale.js';

/** A lone UTF-16 surrogate: half of an emoji, which the data file rejects. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Czech words that must not reach a student outside the Czech Republic. */
const CZECH_WORDS = ['gymn', 'zkouška', 'Zápis', 'zápis', 'Vzorový', 'Odpověď', 'Básníci', 'Život', 'slovní úlohy', 'school-leaving'];

/** Runs `fn` with the given locale and restores the default one afterwards. */
function withLocale(settings, fn) {
  setLocale(settings);
  try {
    return fn();
  } finally {
    setLocale({});
  }
}

test('extractJson reads the only code block and keeps working for a bare object in prose', () => {
  assert.deepEqual(extractJson('Here you go:\n```json\n{"a": 1}\n```\nEnjoy.'), { a: 1 });
  assert.deepEqual(extractJson('Sure! {"a": 2} Hope it helps.'), { a: 2 });
  assert.deepEqual(extractJson('```\n{"a": 3}\n```'), { a: 3 });
});

test('extractJson repairs trailing commas and raw line breaks inside strings', () => {
  assert.deepEqual(extractJson('```json\n{"a": "x\ny", "b": [1, 2,],}\n```'), { a: 'x\ny', b: [1, 2] });
});

test('extractJson finds the real answer after an example block that is not valid JSON', () => {
  const answer = 'Example shape:\n```json\n{ "profile": "...", "assistants": [ ... ] }\n```\nFinal answer:\n```json\n{"profile": "real"}\n```';
  assert.deepEqual(extractJson(answer), { profile: 'real' });
});

test('extractJson skips a block the caller does not want and returns the next one', () => {
  const answer = '```json\n{"example": true}\n```\n```json\n{"profile": "real"}\n```';
  assert.deepEqual(extractJson(answer, data => 'profile' in data), { profile: 'real' });
  assert.deepEqual(extractJson(answer), { example: true });
});

test('extractJson falls back to the outermost braces when no code block holds the object', () => {
  const answer = 'Steps:\n```\nplain steps, no braces\n```\nNow mine: {"profile": "real"}';
  assert.deepEqual(extractJson(answer, data => 'profile' in data), { profile: 'real' });
});

test('extractJson says no JSON was found when nothing has braces or nothing is wanted', () => {
  assert.throws(() => extractJson('What subject is this?'), /No JSON found/);
  assert.throws(() => extractJson(''), /No JSON found/);
  assert.throws(() => extractJson(undefined), /No JSON found/);
  assert.throws(() => extractJson('{"a": 1}', () => false), /No JSON found/);
});

test('extractJson reports invalid JSON with advice when no candidate parses', () => {
  assert.throws(() => extractJson('```json\n{"a": }\n```'), /not valid JSON/);
});

test('promptFor puts the style line for a young student after the profile and before the plan extras', () => {
  const subject = { name: 'Reading', profile: 'Short stories.', plan: { template: 'general', extra: 'Keep it playful.' } };
  const text = withLocale({ language: 'en', country: 'DE', student: { age: 7 } }, () => promptFor(subject));
  const profileAt = text.indexOf('About Reading in my class: Short stories.');
  const styleAt = text.indexOf('The student is about 7 years old');
  const extraAt = text.indexOf('Keep it playful.');
  assert.ok(profileAt > 0 && styleAt > profileAt && extraAt > styleAt);
});

test('promptFor adds no style line for a student of 15 or older', () => {
  const text = withLocale({ language: 'en', student: { age: 16 } }, () => promptFor({ name: 'Maths', plan: { template: 'general' } }));
  assert.ok(!text.includes('The student is'));
});

test('built-in prompts never contain Czech wording outside the Czech Republic', () => {
  withLocale({ language: 'en', country: 'DE', student: { age: 12 } }, () => {
    for (const key of Object.keys(TEMPLATES)) {
      const prompt = templatePrompt(key);
      for (const word of CZECH_WORDS) assert.ok(!prompt.includes(word), `${key} prompt contains "${word}"`);
      assert.ok(!prompt.includes('[CZ]') && !prompt.includes('[INTL]'), `${key} prompt keeps a marker`);
    }
  });
});

test('Czech accounts keep the Czech conventions, pitched at the student and not at a gymnázium', () => {
  withLocale({ language: 'cs', country: 'CZ', student: { age: 12, year: 7, stage: 'lower' } }, () => {
    const who = studentText();
    const math = promptFor({ name: 'Maths', plan: { template: 'math' } });
    assert.ok(math.includes(`Pitch everything at the level of ${who} and use Czech school conventions`));
    assert.ok(math.includes('decimal comma') && math.includes('zkouška'));
    assert.ok(promptFor({ name: 'Physics', plan: { template: 'physics' } }).includes('"Zápis:"'));
    assert.ok(promptFor({ name: 'Czech', plan: { template: 'literature' } }).includes('## Básníci'));
    for (const key of ['research', 'math', 'physics', 'literature']) assert.ok(!templatePrompt(key).includes('gymn'), key);
  });
});

test('other countries get the general conventions at the student level and English literature headings', () => {
  withLocale({ language: 'en', country: 'US', student: { age: 9 } }, () => {
    const who = studentText();
    assert.ok(promptFor({ name: 'Maths', plan: { template: 'math' } }).includes(`Pitch everything at the level of ${who} and use the maths conventions taught there`));
    assert.ok(promptFor({ name: 'Research', plan: { template: 'research' } }).includes(`Pitch everything at the level of ${who}: what a test there expects`));
    assert.ok(promptFor({ name: 'Books', plan: { template: 'literature' } }).includes('## Poets'));
  });
});

test('the physics template hint is neutral English', () => {
  assert.ok(!TEMPLATES.physics.hint.includes('zápis'));
  assert.ok(TEMPLATES.physics.hint.includes('given values'));
});

test('parseLesson cuts long text without splitting an emoji', () => {
  const title = `${'a'.repeat(119)}😀${'b'.repeat(10)}`;
  const lesson = parseLesson(JSON.stringify({ title, notes: 'Some notes.' }));
  assert.equal(Array.from(lesson.title).length, 120);
  assert.ok(!LONE_SURROGATE.test(lesson.title));
});
