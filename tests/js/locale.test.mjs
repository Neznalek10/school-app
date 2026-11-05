/**
 * Tests for js/locale.js and the locale-aware parts of js/events.js: locale tags, week starts,
 * weekday order and the month grid.
 */
import { test, assert } from './harness.mjs';
import { setLocale, locale, weekStart, weekdayNames, browserLanguage, formatNumber } from '../../js/locale.js';
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

test('prompts describe a Czech gymnázium student only for Czech accounts', async () => {
  const { studentText, localizePrompt, fillStudent } = await import('../../js/locale.js');
  const template = 'I am {student}.\n- [CZ]Use the decimal comma.\n- [INTL]Use the usual decimal separator.';
  setLocale({ language: 'en', country: 'CZ' });
  assert.equal(fillStudent(localizePrompt(template)), 'I am a student in the first year of a Czech gymnázium.\n- Use the decimal comma.');
  setLocale({ language: 'en', country: 'DE' });
  assert.equal(fillStudent(localizePrompt(template)), 'I am a secondary school student in Germany.\n- Use the usual decimal separator.');
  setLocale({ language: 'en', country: 'DE', school: '  Year 10 at a Gymnasium in Bavaria ' });
  assert.equal(studentText(), 'Year 10 at a Gymnasium in Bavaria');
  setLocale({ language: 'en', country: '' });
  assert.equal(studentText(), 'a secondary school student');
});
