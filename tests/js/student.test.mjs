/**
 * Tests for js/student.js: profile normalization, the stage guess, the prompt wording and the audience line.
 *
 * Responsibility: protect the Student contract (never throws, every field present, caps by code point) and
 * the exact sentences that reach AI prompts. Pure logic only: no network, no storage.
 */
import { test, assert } from './harness.mjs';
import {
  STAGES, MAX_SUBJECTS, SUBJECT_NAME_MAX, SCHOOL_MAX, GOALS_MAX, NOTES_MAX,
  normalizeStudent, stageForAge, describeStudent, audienceLine, isStudentStarted,
} from '../../js/student.js';

/** Builds a normalized student from the given fields. */
const student = fields => normalizeStudent(fields);

test('normalizeStudent of nothing gives a complete empty profile', () => {
  const empty = { age: null, year: null, stage: '', school: '', subjects: [], goals: '', notes: '', done: false };
  for (const raw of [undefined, null, 'text', 5, true, [], {}]) assert.deepEqual(normalizeStudent(raw), empty);
});

test('normalizeStudent keeps a valid profile and accepts numbers typed into forms', () => {
  const full = student({ age: '8', year: 2, stage: 'primary', school: 'Oak School', subjects: ['Maths'], goals: 'Read well', notes: 'Likes dinosaurs', done: true });
  assert.deepEqual(full, {
    age: 8, year: 2, stage: 'primary', school: 'Oak School', subjects: ['Maths'], goals: 'Read well', notes: 'Likes dinosaurs', done: true,
  });
});

test('age is a whole number from 4 to 99, otherwise unknown', () => {
  assert.equal(student({ age: 4 }).age, 4);
  assert.equal(student({ age: 99 }).age, 99);
  for (const age of [3, 100, -5, 0, 8.5, '8.5', 'eight', '', '  ', NaN, Infinity, null, [], {}]) assert.equal(student({ age }).age, null, String(age));
});

test('year is a whole number from 1 to 13, otherwise unknown', () => {
  assert.equal(student({ year: 1 }).year, 1);
  assert.equal(student({ year: '13' }).year, 13);
  for (const year of [0, 14, -1, 2.5, 'x']) assert.equal(student({ year }).year, null, String(year));
});

test('stage must be one of STAGES', () => {
  for (const { value } of STAGES) assert.equal(student({ stage: value }).stage, value);
  for (const stage of ['Primary', 'kindergarten', 7, null]) assert.equal(student({ stage }).stage, '');
});

test('text fields are trimmed, whitespace collapsed and capped', () => {
  const s = student({ school: '  Oak \n  School  ', goals: 'g'.repeat(GOALS_MAX + 50), notes: 'n'.repeat(NOTES_MAX + 50) });
  assert.equal(s.school, 'Oak School');
  assert.equal(s.goals.length, GOALS_MAX);
  assert.equal(s.notes.length, NOTES_MAX);
  assert.equal(student({ school: 's'.repeat(SCHOOL_MAX + 1) }).school.length, SCHOOL_MAX);
  assert.deepEqual(student({ school: 5, goals: {}, notes: [] }).goals, '');
});

test('capped text never ends in half of an emoji', () => {
  const school = student({ school: `${'a'.repeat(SCHOOL_MAX - 1)}😀😀` }).school;
  assert.equal(school, `${'a'.repeat(SCHOOL_MAX - 1)}😀`);
  assert.equal(Array.from(school).length, SCHOOL_MAX);
});

test('subjects are cleaned, deduplicated ignoring case, capped in name and in number', () => {
  const s = student({ subjects: ['  Maths ', 'maths', 'MATHS', '', '   ', 5, null, 'Příliš žluťoučký kůň', 'x'.repeat(100)] });
  assert.deepEqual(s.subjects, ['Maths', 'Příliš žluťoučký kůň', 'x'.repeat(SUBJECT_NAME_MAX)]);
  const many = Array.from({ length: 30 }, (_, i) => `Subject ${i}`);
  assert.deepEqual(student({ subjects: many }).subjects, many.slice(0, MAX_SUBJECTS));
  assert.deepEqual(student({ subjects: 'Maths' }).subjects, []);
});

test('done is true only for the boolean true', () => {
  assert.equal(student({ done: true }).done, true);
  for (const done of ['true', 1, 'yes', null]) assert.equal(student({ done }).done, false);
});

test('normalizeStudent does not change its input and is idempotent', () => {
  const raw = { age: '9', subjects: [' A ', 'a'] };
  const once = normalizeStudent(raw);
  assert.deepEqual(raw, { age: '9', subjects: [' A ', 'a'] });
  assert.deepEqual(normalizeStudent(once), once);
});

test('stageForAge guesses the stage from the age', () => {
  assert.equal(stageForAge(null), '');
  assert.equal(stageForAge(6), 'primary');
  assert.equal(stageForAge(10), 'primary');
  assert.equal(stageForAge(11), 'lower');
  assert.equal(stageForAge(14), 'lower');
  assert.equal(stageForAge(15), 'upper');
  assert.equal(stageForAge(18), 'upper');
  assert.equal(stageForAge(19), 'university');
  assert.equal(stageForAge(80), 'university');
});

test('describeStudent builds the sentence from what is known', () => {
  assert.equal(describeStudent(student({ age: 8, year: 2, stage: 'primary' }), 'Germany'), 'an 8-year-old student in year 2 of primary school in Germany');
  assert.equal(describeStudent(student({ age: 14, year: 9, stage: 'lower' })), 'a 14-year-old student in year 9 of lower secondary school');
  assert.equal(describeStudent(student({ year: 3 })), 'a student in year 3');
  assert.equal(describeStudent(student({ stage: 'upper' })), 'a student in upper secondary school');
  assert.equal(describeStudent(student({ stage: 'university', year: 1 }), 'France'), 'a student in year 1 of university or college in France');
});

test('describeStudent falls back to the stage guessed from the age', () => {
  assert.equal(describeStudent(student({ age: 12 })), 'a 12-year-old student in lower secondary school');
  assert.equal(describeStudent(student({ age: 30 })), 'a 30-year-old student in university or college');
});

test('describeStudent says a school student when nothing is known, with or without a country', () => {
  assert.equal(describeStudent(student({})), 'a school student');
  assert.equal(describeStudent(student({}), 'Germany'), 'a school student in Germany');
  assert.equal(describeStudent(student({ subjects: ['Maths'], goals: 'pass' })), 'a school student');
});

test('describeStudent appends the school in brackets', () => {
  assert.equal(describeStudent(student({ age: 8, school: 'Oak School' })), 'an 8-year-old student in primary school (school: Oak School)');
  assert.equal(describeStudent(student({ school: 'Oak School' }), 'Germany'), 'a student in Germany (school: Oak School)');
});

test('describeStudent chooses a or an by how the age is spoken', () => {
  for (const age of [8, 11, 18, 80, 85]) assert.ok(describeStudent(student({ age })).startsWith(`an ${age}-year-old`), String(age));
  for (const age of [4, 7, 9, 10, 12, 17, 19, 21, 98]) assert.ok(describeStudent(student({ age })).startsWith(`a ${age}-year-old`), String(age));
});

test('describeStudent names an adult learner without repeating the stage', () => {
  assert.equal(describeStudent(student({ stage: 'adult' })), 'an adult learner');
  assert.equal(describeStudent(student({ stage: 'adult' }), 'Spain'), 'an adult learner in Spain');
  assert.equal(describeStudent(student({ age: 40, stage: 'adult' })), 'a 40-year-old adult learner');
});

test('audienceLine uses very simple language up to age 8', () => {
  const line = 'The student is about 6 years old and still learning to read and write: use very short sentences, simple everyday words and one idea at a time.';
  assert.equal(audienceLine(student({ age: 6 })), line);
  assert.match(audienceLine(student({ age: 8 })), /about 8 years old and still learning to read and write/);
});

test('audienceLine uses short sentences for 9 to 11 and clear explanations for 12 to 14', () => {
  assert.equal(audienceLine(student({ age: 9 })), 'The student is about 9 years old: use short sentences, simple words and concrete examples.');
  assert.match(audienceLine(student({ age: 11 })), /use short sentences, simple words and concrete examples\.$/);
  assert.equal(audienceLine(student({ age: 12 })), 'The student is about 12 years old: explain clearly, define new terms and give examples.');
  assert.match(audienceLine(student({ age: 14 })), /explain clearly/);
});

test('audienceLine is empty from age 15 and when nothing points at a young student', () => {
  assert.equal(audienceLine(student({ age: 15 })), '');
  assert.equal(audienceLine(student({ age: 70 })), '');
  assert.equal(audienceLine(student({})), '');
  assert.equal(audienceLine(student({ stage: 'upper' })), '');
});

test('audienceLine for an unknown age relies on a primary school stage', () => {
  assert.equal(audienceLine(student({ stage: 'primary' })), 'The student is in primary school: use short sentences, simple words and concrete examples.');
  assert.equal(audienceLine(student({ stage: 'primary', age: 16 })), '');
});

test('isStudentStarted is true when any of age, year, stage, school or subjects is set', () => {
  assert.equal(isStudentStarted(student({})), false);
  assert.equal(isStudentStarted(student({ goals: 'pass', notes: 'hi', done: true })), false);
  for (const field of [{ age: 9 }, { year: 1 }, { stage: 'lower' }, { school: 'Oak' }, { subjects: ['Art'] }]) {
    assert.equal(isStudentStarted(student(field)), true, JSON.stringify(field));
  }
});
