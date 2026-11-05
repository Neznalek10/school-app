/**
 * Tests for js/holidays.js: the country guess, parsing Nager.Date answers, the offline cache and the
 * calendar items for Czech and other countries. The network and localStorage are replaced by fakes.
 */
import { test, assert } from './harness.mjs';
import {
  COUNTRIES, CZECH, calendarItems, cachedHolidays, defaultCountry, downloadHolidays, parseHolidays,
} from '../../js/holidays.js';
import { parseBackup } from '../../js/backup.js';

/** An in-memory Storage with the methods the module uses. */
function memoryStorage() {
  const items = new Map();
  return { getItem: k => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)) };
}

/** A fetch that answers with `body` and counts its calls. */
function fakeFetch(body, { ok = true } = {}) {
  const calls = [];
  const fetcher = async url => { calls.push(url); return { ok, status: ok ? 200 : 500, json: async () => body }; };
  return { fetcher, calls };
}

const GERMAN = [
  { date: '2026-01-01', localName: 'Neujahr', name: "New Year's Day", global: true, types: ['Public'] },
  { date: '2026-01-06', localName: 'Heilige Drei Könige', name: 'Epiphany', global: false, types: ['Public'] },
  { date: '2026-02-14', localName: 'Valentinstag', name: "Valentine's Day", global: true, types: ['Observance'] },
  { date: 'not a date', localName: 'Broken', name: 'Broken', global: true, types: ['Public'] },
];

const settingsFor = (country, holidays = true) => ({ country, czech: { holidays, important: true, district: '' } });

test('defaultCountry reads the region from the browser language', () => {
  assert.equal(defaultCountry('cs'), 'CZ');
  assert.equal(defaultCountry('cs-CZ'), 'CZ');
  assert.equal(defaultCountry('de-AT'), 'AT');
  assert.equal(defaultCountry('en-US'), 'US');
  assert.equal(defaultCountry(''), '');
  assert.equal(defaultCountry('not a tag!'), '');
});

test('COUNTRIES includes the Czech Republic and only two-letter codes', () => {
  assert.ok(COUNTRIES.includes(CZECH));
  assert.ok(COUNTRIES.every(c => /^[A-Z]{2}$/.test(c)));
});

test('parseHolidays keeps nationwide public holidays with valid dates only', () => {
  assert.deepEqual(parseHolidays(GERMAN), [
    { start: '2026-01-01', end: '2026-01-01', kind: 'holiday', cs: 'Neujahr', en: "New Year's Day" },
  ]);
  assert.deepEqual(parseHolidays({ error: 'no' }), []);
});

test('downloadHolidays saves the year so it works offline, and the calendar shows it', async () => {
  const storage = memoryStorage();
  const { fetcher, calls } = fakeFetch(GERMAN);
  assert.equal(await downloadHolidays('DE', 2026, { fetcher, storage }), true);
  assert.equal(calls[0], 'https://date.nager.at/api/v3/PublicHolidays/2026/DE');
  assert.equal(cachedHolidays('DE', 2026, storage).length, 1);
  assert.equal(calendarItems('2026-01-01', '2026-01-31', settingsFor('DE'), storage)[0].cs, 'Neujahr');
  assert.deepEqual(calendarItems('2026-01-01', '2026-01-31', settingsFor('DE', false), storage), []);
});

test('a failed download is not retried in the same page', async () => {
  const storage = memoryStorage();
  const { fetcher, calls } = fakeFetch(null, { ok: false });
  assert.equal(await downloadHolidays('FR', 2031, { fetcher, storage }), false);
  assert.equal(await downloadHolidays('FR', 2031, { fetcher, storage }), false);
  assert.equal(calls.length, 1);
  assert.equal(cachedHolidays('FR', 2031, storage), null);
});

test('an unknown country is never requested', async () => {
  const { fetcher, calls } = fakeFetch(GERMAN);
  assert.equal(await downloadHolidays('../x', 2026, { fetcher, storage: memoryStorage() }), false);
  assert.equal(calls.length, 0);
});

test('Czech Republic keeps the built-in calendar, and no country shows nothing', () => {
  const items = calendarItems('2026-10-01', '2026-10-31', settingsFor(CZECH), memoryStorage());
  assert.ok(items.some(i => i.start === '2026-10-28' && i.kind === 'holiday'));
  assert.ok(items.some(i => i.kind === 'break'));
  assert.deepEqual(calendarItems('2026-10-01', '2026-10-31', settingsFor(''), memoryStorage()), []);
});

test('a restored backup keeps a valid country and drops an invalid one', () => {
  const file = country => JSON.stringify({ app: 'school', format: 1, account: { name: 'User' }, data: { settings: { country } } });
  assert.equal(parseBackup(file('DE')).data.settings.country, 'DE');
  assert.equal(parseBackup(file('')).data.settings.country, '');
  assert.equal(parseBackup(file('XX')).data.settings.country, undefined);
});
