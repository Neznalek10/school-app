/**
 * Tests for the pure logic of js/views/welcome.js: the step list, step validation, level parsing, subject
 * list editing and the curriculum prompt inputs.
 *
 * Responsibility: protect the wizard rules (one question per step, subjects required, optional answers never
 * block) without a DOM. Everything here is deterministic: no storage, no network.
 */
import { test, assert } from './harness.mjs';
import {
  STEPS, SUBJECT_SUGGESTIONS, clampStep, neighbourStep, validateStep, readLevel,
  toggleSubject, addSubjects, buildCurriculumPrompt, subjectChipEntries,
} from '../../js/views/welcome.js';
import { normalizeStudent, MAX_SUBJECTS, SUBJECT_NAME_MAX } from '../../js/student.js';

const ENV = { studentText: 'an 8-year-old student in year 2 of primary school in Germany', audience: '', countryName: 'Germany', languageLabel: 'German', czech: false };

test('steps run language, country, level, school, subjects, goals, build with unique keys', () => {
  assert.deepEqual(STEPS.map(s => s.key), ['language', 'country', 'level', 'school', 'subjects', 'goals', 'build']);
  assert.equal(new Set(STEPS.map(s => s.key)).size, STEPS.length);
});

test('clampStep keeps a valid step and falls back to 0 for junk', () => {
  assert.equal(clampStep('3'), 3);
  assert.equal(clampStep(undefined), 0);
  assert.equal(clampStep('abc'), 0);
  assert.equal(clampStep('-4'), 0);
  assert.equal(clampStep('99'), STEPS.length - 1);
});

test('neighbourStep moves one step and stops at both ends', () => {
  assert.equal(neighbourStep(2, 1), 3);
  assert.equal(neighbourStep(2, -1), 1);
  assert.equal(neighbourStep(0, -1), null);
  assert.equal(neighbourStep(STEPS.length - 1, 1), null);
});

test('subjects step needs at least one subject, other optional steps never block', () => {
  const empty = normalizeStudent({});
  assert.ok(validateStep('subjects', empty).length > 0);
  assert.ok(validateStep('build', empty).length > 0);
  assert.equal(validateStep('subjects', normalizeStudent({ subjects: ['Maths'] })), '');
  for (const key of ['language', 'country', 'school', 'goals']) assert.equal(validateStep(key, empty), '', key);
});

test('level step accepts empty fields and rejects an age or year out of range or not whole', () => {
  const student = normalizeStudent({});
  assert.equal(validateStep('level', student, { age: '', year: '' }), '');
  assert.equal(validateStep('level', student, { age: '9', year: '4' }), '');
  assert.ok(validateStep('level', student, { age: '2', year: '' }).includes('Age'));
  assert.ok(validateStep('level', student, { age: '9.5', year: '' }).includes('Age'));
  assert.ok(validateStep('level', student, { age: 'nine', year: '' }).includes('Age'));
  assert.ok(validateStep('level', student, { age: '9', year: '14' }).includes('Year'));
});

test('readLevel turns text into numbers and drops unusable values and unknown stages', () => {
  assert.deepEqual(readLevel({ age: ' 9 ', year: '4', stage: 'primary' }), { age: 9, year: 4, stage: 'primary' });
  assert.deepEqual(readLevel({ age: '200', year: '0', stage: 'wizard' }), { age: null, year: null, stage: '' });
  assert.deepEqual(readLevel({}), { age: null, year: null, stage: '' });
});

test('toggleSubject adds a missing subject and removes a present one case-insensitively', () => {
  assert.deepEqual(toggleSubject([], 'Maths'), ['Maths']);
  assert.deepEqual(toggleSubject(['Maths', 'Art'], 'maths'), ['Art']);
});

test('addSubjects splits on commas and line breaks, ignores duplicates and empties, caps long names', () => {
  assert.deepEqual(addSubjects(['Maths'], 'Latin, maths,\n Drama ,, '), ['Maths', 'Latin', 'Drama']);
  const long = addSubjects([], 'x'.repeat(SUBJECT_NAME_MAX + 20));
  assert.equal([...long[0]].length, SUBJECT_NAME_MAX);
  assert.deepEqual(addSubjects([], 'Příliš žluťoučký kůň'), ['Příliš žluťoučký kůň']);
});

test('addSubjects never grows the list past the profile limit', () => {
  const many = Array.from({ length: MAX_SUBJECTS + 5 }, (_, i) => `Subject ${i}`).join(',');
  assert.equal(addSubjects([], many).length, MAX_SUBJECTS);
});

test('suggested subjects are unique, case-insensitively', () => {
  assert.equal(new Set(SUBJECT_SUGGESTIONS.map(s => s.toLowerCase())).size, SUBJECT_SUGGESTIONS.length);
});

test('curriculum prompt carries the subjects, goals and student; the pasted one speaks as the student', () => {
  const student = normalizeStudent({ subjects: ['Maths', 'Art'], goals: 'Better marks' });
  const inApp = buildCurriculumPrompt(student, ENV, false);
  assert.ok(inApp.includes('- Maths') && inApp.includes('- Art'));
  assert.ok(inApp.includes('Better marks') && inApp.includes(ENV.studentText) && inApp.includes('German'));
  assert.ok(!inApp.startsWith('I am'));
  const pasted = buildCurriculumPrompt(student, ENV, true);
  assert.ok(pasted.startsWith('I am an 8-year-old'));
  assert.ok(pasted.endsWith('Reply only with the JSON block.'));
});

/** Fake Czech translation for two suggestions. */
const czech = text => ({ Science: 'Přírodověda', Art: 'Výtvarná výchova' }[text] ?? text);

test('chips show the translated suggestion and store the name the student sees', () => {
  const entries = subjectChipEntries([], ['Science', 'Maths'], czech);
  assert.deepEqual(entries, [
    { label: 'Přírodověda', value: 'Přírodověda', picked: false },
    { label: 'Maths', value: 'Maths', picked: false },
  ]);
});

test('a subject saved under its translated or English name marks one chip picked, never a duplicate', () => {
  const translated = subjectChipEntries(['Přírodověda'], ['Science'], czech);
  assert.deepEqual(translated, [{ label: 'Přírodověda', value: 'Přírodověda', picked: true }]);
  const english = subjectChipEntries(['science'], ['Science'], czech);
  assert.deepEqual(english, [{ label: 'Přírodověda', value: 'science', picked: true }]);
});

test('own subjects follow the suggestions as picked chips', () => {
  const entries = subjectChipEntries(['Latin'], ['Art'], czech);
  assert.deepEqual(entries.at(-1), { label: 'Latin', value: 'Latin', picked: true });
  assert.equal(entries.length, 2);
});
