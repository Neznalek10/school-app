/**
 * Tests for js/locale.js and the locale-aware parts of js/events.js: locale tags, week starts,
 * weekday order, the month grid, and the student text and audience line built from the profile.
 */
import { test, assert } from './harness.mjs';
import {
  setLocale, locale, weekStart, weekdayNames, browserLanguage, formatNumber,
  studentText, audienceText, currentStudent, isCzechSchool, MAX_SCHOOL,
} from '../../js/locale.js';
import { monthGrid } from '../../js/events.js';

test('locale combines the interface language with the country', () => {
  setLocale({ language: 'cs', country: 'CZ' });
  assert.equal(locale(), 'cs-CZ');
  setLocale({ language: 'en', country: 'US' });
  assert.equal(locale(), 'en-US');
  setLocale({ language: 'xx', country: 'nope' });
  assert.equal(locale(), 'en-GB');
});

test('weeks start on Monday in Europe, Sunday in the US and Saturday in Egypt', () => {
  assert.equal(weekStart('CZ'), 1);
  assert.equal(weekStart('DE'), 1);
  assert.equal(weekStart('US'), 0);
  assert.equal(weekStart('EG'), 6);
  assert.equal(weekStart(''), 1);
});

test('the month grid and weekday names follow the week start', () => {
  setLocale({ language: 'en', country: 'US' });
  // 1 November 2026 is a Sunday: first cell in the US, seventh in Czechia.
  assert.equal(monthGrid('2026-11')[0][0].key, '2026-11-01');
  assert.equal(weekdayNames()[0], 'Sun');
  setLocale({ language: 'en', country: 'CZ' });
  assert.equal(monthGrid('2026-11')[0][6].key, '2026-11-01');
  assert.equal(weekdayNames()[0], 'Mon');
});

test('browserLanguage picks Czech for Czech and Slovak browsers only', () => {
  assert.equal(browserLanguage('cs-CZ'), 'cs');
  assert.equal(browserLanguage('sk'), 'cs');
  assert.equal(browserLanguage('de-DE'), 'en');
});

test('numbers use the locale separators', () => {
  setLocale({ language: 'en', country: 'US' });
  assert.equal(formatNumber(1382), '1,382');
  setLocale({ language: 'en', country: '' });
});

test('prompts keep [CZ] and [INTL] lines by country and describe the student without Czech wording', async () => {
  const { localizePrompt, fillStudent } = await import('../../js/locale.js');
  const template = 'I am {student}.\n- [CZ]Use the decimal comma.\n- [INTL]Use the usual decimal separator.';
  setLocale({ language: 'en', country: 'CZ' });
  assert.equal(fillStudent(localizePrompt(template)), 'I am a school student in Czechia.\n- Use the decimal comma.');
  setLocale({ language: 'en', country: 'DE' });
  assert.equal(fillStudent(localizePrompt(template)), 'I am a school student in Germany.\n- Use the usual decimal separator.');
  setLocale({ language: 'en', country: '' });
  assert.equal(studentText(), 'a school student');
  assert.ok(!fillStudent('{student}').includes('gymn'));
  assert.ok(!fillStudent('{student}').includes('secondary'));
});

test('studentText describes the profile and the country', () => {
  setLocale({ language: 'en', country: 'DE', student: { age: 8, year: 2, stage: 'primary' } });
  assert.equal(studentText(), 'an 8-year-old student in year 2 of primary school in Germany');
  setLocale({ language: 'en', country: '', student: { age: 16 } });
  assert.equal(studentText(), 'a 16-year-old student in upper secondary school');
  setLocale({ language: 'en', country: 'FR' });
  assert.equal(studentText(), 'a school student in France');
});

test('the legacy school text fills the profile school only when the profile has none', () => {
  setLocale({ language: 'en', country: '', school: '  Year 10 at a Gymnasium   in Bavaria ' });
  assert.equal(currentStudent().school, 'Year 10 at a Gymnasium in Bavaria');
  assert.equal(studentText(), 'a student (school: Year 10 at a Gymnasium in Bavaria)');
  setLocale({ language: 'en', school: 'Old school', student: { school: 'New school' } });
  assert.equal(currentStudent().school, 'New school');
  setLocale({ language: 'en', school: 'x'.repeat(300) });
  assert.equal(currentStudent().school.length, MAX_SCHOOL);
  assert.equal(MAX_SCHOOL, 120);
});

test('studentText puts "the" before country names that need it', () => {
  const cases = {
    US: 'the United States', GB: 'the United Kingdom', NL: 'the Netherlands', AE: 'the United Arab Emirates',
    PH: 'the Philippines', DO: 'the Dominican Republic', BS: 'the Bahamas', GM: 'the Gambia',
    CF: 'the Central African Republic', CD: 'the Congo - Kinshasa', CG: 'the Congo - Brazzaville',
    KY: 'the Cayman Islands', MH: 'the Marshall Islands', VI: 'the U.S. Virgin Islands',
  };
  for (const [country, phrase] of Object.entries(cases)) {
    setLocale({ language: 'en', country });
    assert.equal(studentText(), `a school student in ${phrase}`, country);
  }
  setLocale({ language: 'en', country: 'US', student: { age: 8, year: 2, stage: 'primary' } });
  assert.equal(studentText(), 'an 8-year-old student in year 2 of primary school in the United States');
  setLocale({ language: 'en', country: '' });
});

test('studentText leaves other country names without "the"', () => {
  for (const [country, name] of [['DE', 'Germany'], ['CZ', 'Czechia'], ['FR', 'France'], ['CX', 'Christmas Island'], ['IR', 'Iran'], ['CI', 'Côte d’Ivoire']]) {
    setLocale({ language: 'en', country });
    assert.equal(studentText(), `a school student in ${name}`, country);
  }
  setLocale({ language: 'en', country: '' });
});

test('an unknown or placeholder country code counts as no country', () => {
  for (const country of ['XX', 'ZZ', 'QQ', 'de', 'DEU', 'D', '', undefined, 5]) {
    setLocale({ language: 'en', country });
    assert.equal(isCzechSchool(), false, String(country));
    assert.equal(locale(), 'en-GB', String(country));
    assert.equal(studentText(), 'a school student', String(country));
  }
  setLocale({ language: 'en', country: 'CZ' });
  assert.equal(isCzechSchool(), true);
  setLocale({ language: 'en', country: '' });
});

test('audienceText follows the profile age and is empty for older or unknown students', () => {
  setLocale({ language: 'en', student: { age: 6 } });
  assert.match(audienceText(), /^The student is about 6 years old and still learning to read and write/);
  setLocale({ language: 'en', student: { age: 13 } });
  assert.match(audienceText(), /explain clearly/);
  setLocale({ language: 'en', student: { age: 15 } });
  assert.equal(audienceText(), '');
  setLocale({ language: 'en' });
  assert.equal(audienceText(), '');
});

test('currentStudent returns a copy and setLocale never throws on a bad profile', () => {
  setLocale({ language: 'en', student: { age: 9, subjects: ['Maths'] } });
  const copy = currentStudent();
  copy.age = 99;
  copy.subjects.push('Art');
  assert.equal(currentStudent().age, 9);
  assert.deepEqual(currentStudent().subjects, ['Maths']);
  for (const student of [null, 'text', 42, [], { age: 'x' }]) {
    setLocale({ language: 'en', student });
    assert.equal(currentStudent().age, null);
  }
  setLocale({ language: 'en', country: '' });
});
