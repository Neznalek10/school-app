/**
 * The student profile: who is learning, cleaned, described in words for AI prompts and turned into a style line.
 *
 * Responsibility: pure functions over one plain object (the Student record stored in `settings.student`).
 * `normalizeStudent` is the single gate every saved or loaded profile passes through, `describeStudent` and
 * `audienceLine` produce the text that reaches every AI prompt, and `stageForAge` guesses a school stage.
 *
 * Fits in: js/locale.js keeps the active profile and calls describeStudent and audienceLine; js/store.js and
 * the Get started wizard normalize before saving. Uses `clip` from js/text.js and nothing else, so it is
 * safe to import anywhere without an import cycle.
 *
 * Invariants: normalizeStudent never throws and always returns every field; text is capped by code point,
 * so no emoji is split.
 */
import { clip } from './text.js';

/** School stages the student can pick, in order of age. `value` is stored, `label` is shown. */
export const STAGES = [
  { value: 'primary', label: 'Primary school' },
  { value: 'lower', label: 'Lower secondary school' },
  { value: 'upper', label: 'Upper secondary school' },
  { value: 'university', label: 'University or college' },
  { value: 'adult', label: 'Adult learner' },
];

/** Most subjects one profile keeps. */
export const MAX_SUBJECTS = 20;
/** Longest subject name kept (code points). */
export const SUBJECT_NAME_MAX = 40;
/** Longest school description kept (code points). */
export const SCHOOL_MAX = 120;
/** Longest goals text kept (code points). */
export const GOALS_MAX = 300;
/** Longest "anything else" text kept (code points). */
export const NOTES_MAX = 500;

/** Youngest and oldest age accepted; anything else counts as unknown. */
const AGE_MIN = 4;
const AGE_MAX = 99;

/** First and last school year accepted. */
const YEAR_MIN = 1;
const YEAR_MAX = 13;

/** Oldest age (inclusive) that stageForAge assigns to each stage; older students are guessed to be at university. */
const PRIMARY_MAX_AGE = 10;
const LOWER_MAX_AGE = 14;
const UPPER_MAX_AGE = 18;

/** Oldest ages (inclusive) that get a simpler writing style; students from 15 on get none. */
const YOUNGEST_MAX_AGE = 8;
const YOUNG_MAX_AGE = 11;
const TEEN_MAX_AGE = 14;

/**
 * @typedef {{ age: number|null, year: number|null, stage: ''|'primary'|'lower'|'upper'|'university'|'adult',
 *   school: string, subjects: string[], goals: string, notes: string, done: boolean }} Student
 */

/**
 * Trims a value, collapses runs of whitespace into one space and caps it.
 *
 * @param {unknown} value Any value; non-strings give ''.
 * @param {number} max Maximum number of code points.
 * @returns {string} The cleaned single-line text.
 */
function cleanText(value, max) {
  return clip(typeof value === 'string' ? value.replace(/\s+/g, ' ') : '', max);
}

/**
 * Reads a whole number inside a range from a number or a numeric string (form inputs give strings).
 *
 * @param {unknown} value Candidate value.
 * @param {number} min Lowest accepted value.
 * @param {number} max Highest accepted value.
 * @returns {number|null} The integer, or null when it is missing, fractional or out of range.
 */
function wholeNumber(value, min, max) {
  const isNumeric = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  const number = isNumeric ? Number(value) : NaN;
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

/**
 * Cleans a list of subject names: trimmed, capped, empties dropped, duplicates (any letter case) dropped, at most MAX_SUBJECTS.
 *
 * @param {unknown} value Expected to be an array of strings; anything else gives [].
 * @returns {string[]} The names in the order given.
 */
function cleanSubjects(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const names = [];
  for (const item of value) {
    const name = cleanText(item, SUBJECT_NAME_MAX);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length === MAX_SUBJECTS) break;
  }
  return names;
}

/**
 * Turns anything (saved settings, form values, an old backup) into a complete, safe Student record.
 *
 * @param {unknown} raw A stored or entered profile; any non-object gives an empty profile.
 * @returns {Student} A new object with every field set. Never throws.
 * @example
 * normalizeStudent({ age: '8', stage: 'primary', subjects: ['Maths', 'maths'] }); // age 8, subjects ['Maths']
 */
export function normalizeStudent(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    age: wholeNumber(data.age, AGE_MIN, AGE_MAX),
    year: wholeNumber(data.year, YEAR_MIN, YEAR_MAX),
    stage: STAGES.some(stage => stage.value === data.stage) ? data.stage : '',
    school: cleanText(data.school, SCHOOL_MAX),
    subjects: cleanSubjects(data.subjects),
    goals: cleanText(data.goals, GOALS_MAX),
    notes: cleanText(data.notes, NOTES_MAX),
    done: data.done === true,
  };
}

/**
 * Guesses the school stage from the age, used to pre-select the stage in the wizard and to word prompts.
 *
 * @param {number|null} age The student's age, or null when unknown.
 * @returns {''|'primary'|'lower'|'upper'|'university'} The guessed stage; '' when the age is unknown.
 */
export function stageForAge(age) {
  if (typeof age !== 'number' || !Number.isFinite(age)) return '';
  if (age <= PRIMARY_MAX_AGE) return 'primary';
  if (age <= LOWER_MAX_AGE) return 'lower';
  return age <= UPPER_MAX_AGE ? 'upper' : 'university';
}

/**
 * Chooses "a" or "an" for the age phrase "N-year-old", by how the number is spoken (an 8-, an 11-, an 18-, an 80-).
 *
 * @param {number} age The age.
 * @returns {string} 'an' or 'a'.
 */
function articleForAge(age) {
  return age === 11 || age === 18 || String(age).startsWith('8') ? 'an' : 'a';
}

/**
 * Describes the school position: "in year 2 of primary school", "in year 2", "in primary school" or ''.
 *
 * @param {number|null} year School year, or null.
 * @param {string} stageLabel Lower-cased stage label, or ''.
 * @returns {string} The phrase without a leading space.
 */
function placeInSchool(year, stageLabel) {
  if (year && stageLabel) return `in year ${year} of ${stageLabel}`;
  if (year) return `in year ${year}`;
  return stageLabel ? `in ${stageLabel}` : '';
}

/**
 * Describes the student in words, to follow "I am" or "for" in an AI prompt.
 *
 * Only known parts appear. The stage falls back to the one guessed from the age.
 *
 * @param {Student} student A normalized profile.
 * @param {string} [countryName] The country's English name, or '' when none is set.
 * @returns {string} For example "an 8-year-old student in year 2 of primary school in Germany",
 *   "an adult learner" or "a school student" when nothing is known.
 * @example
 * describeStudent(normalizeStudent({ age: 8, year: 2, stage: 'primary' }), 'Germany');
 */
export function describeStudent(student, countryName = '') {
  const stage = student.stage || stageForAge(student.age);
  const isAdult = stage === 'adult';
  const knowsSomething = Boolean(student.age || student.year || student.stage || student.school);
  // An adult learner is not "a student of adult learner": the stage becomes the noun and is not repeated.
  let noun = 'student';
  if (isAdult) noun = 'adult learner';
  else if (!knowsSomething) noun = 'school student';
  const stageLabel = isAdult ? '' : (STAGES.find(item => item.value === stage)?.label.toLowerCase() || '');

  const adjective = student.age ? `${student.age}-year-old ` : '';
  const article = student.age ? articleForAge(student.age) : (isAdult ? 'an' : 'a');
  const parts = [`${article} ${adjective}${noun}`, placeInSchool(student.year, stageLabel)];
  if (countryName) parts.push(`in ${countryName}`);
  const text = parts.filter(Boolean).join(' ');
  return student.school ? `${text} (school: ${student.school})` : text;
}

/**
 * Builds the style instruction that makes an AI answer fit a young student.
 *
 * @param {Student} student A normalized profile.
 * @returns {string} One sentence for students up to 14 (the younger, the simpler), '' for older or unknown students.
 *   When the age is unknown, a primary-school stage gets the 9 to 11 wording.
 */
export function audienceLine(student) {
  const { age } = student;
  if (typeof age !== 'number') {
    return student.stage === 'primary'
      ? 'The student is in primary school: use short sentences, simple words and concrete examples.'
      : '';
  }
  if (age <= YOUNGEST_MAX_AGE) {
    return `The student is about ${age} years old and still learning to read and write: use very short sentences, simple everyday words and one idea at a time.`;
  }
  if (age <= YOUNG_MAX_AGE) return `The student is about ${age} years old: use short sentences, simple words and concrete examples.`;
  if (age <= TEEN_MAX_AGE) return `The student is about ${age} years old: explain clearly, define new terms and give examples.`;
  return '';
}

/**
 * Tells whether the profile holds anything about the student yet (the wizard saves each step, so it can be half filled).
 *
 * @param {Student} student A normalized profile.
 * @returns {boolean} True when any of age, year, stage, school or subjects is set.
 */
export function isStudentStarted(student) {
  return Boolean(student.age || student.year || student.stage || student.school || student.subjects.length);
}
