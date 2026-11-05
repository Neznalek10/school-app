/**
 * Calendar days by country: the full Czech calendar from czech.js, or public holidays from Nager.Date.
 *
 * Used by the calendar, home and account views. Czech holidays, school breaks and important days are built
 * in; every other country's public holidays are downloaded once per year and kept in localStorage under
 * `school-cache.` (outside the synced `school.` prefix, so each device fetches its own copy).
 * Invariant: a failed download is not retried in the same page, so a render never loops on the network.
 */
import { czechItems } from './czech.js';
import { dayKey, parseDay } from './events.js';

/** Countries Nager.Date has public holidays for (https://date.nager.at/api/v3/AvailableCountries). */
export const COUNTRIES = ('AD AG AI AL AM AO AR AT AU AW AX BA BB BD BE BF BG BH BI BJ BL BM BO BQ BR BS BW BY BZ CA '
  + 'CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FK FM FO FR GA GB GD '
  + 'GE GF GG GH GI GL GM GN GP GQ GR GT GW GY HK HN HR HT HU ID IE IM IQ IS IT JE JM JP KE KH KI KM KN KR KY KZ LC LI '
  + 'LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MN MP MQ MR MS MT MW MX MZ NA NC NE NF NG NI NL NO NR NU NZ PA PE PF '
  + 'PG PH PL PM PN PR PT PW PY RO RS RU RW SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TK TN '
  + 'TO TR TT TV TZ UA UG US UY VA VC VE VG VI VN VU WF WS YE ZA ZM ZW').split(' ');

/** The country with the built-in calendar (school breaks and important days, not only public holidays). */
export const CZECH = 'CZ';

const API = 'https://date.nager.at/api/v3/PublicHolidays';
const CACHE_PREFIX = 'school-cache.holidays.';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME = 120;

/** Downloads that failed in this page, as "CC-YYYY", so they are not tried again on every render. */
const failed = new Set();
/** Downloads in progress, so a render during one does not start it again. */
const pending = new Set();

/**
 * English name of a country code, for the picker.
 *
 * @param {string} code ISO 3166 alpha-2 code, for example "DE".
 * @returns {string} "Germany", or the code itself when the browser has no name for it.
 */
export function countryName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/**
 * Guesses the user's country from the browser language: "cs" → CZ, "de-AT" → AT, "en-US" → US.
 *
 * @param {string} [language] A BCP 47 language tag; defaults to the browser's.
 * @returns {string} A code from COUNTRIES, or "" when the language names no supported country.
 */
export function defaultCountry(language = globalThis.navigator?.language || '') {
  let region = '';
  try {
    region = new Intl.Locale(language).maximize().region || '';
  } catch {
    return '';
  }
  return COUNTRIES.includes(region) ? region : '';
}

/**
 * Turns a Nager.Date answer into calendar items. Only nationwide public holidays are kept.
 *
 * @param {unknown} json The parsed response body.
 * @returns {{start: string, end: string, kind: 'holiday', cs: string, en: string}[]} One item per holiday;
 *   `cs` holds the local name and `en` the English one, matching the Czech items.
 */
export function parseHolidays(json) {
  if (!Array.isArray(json)) return [];
  const text = value => (typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '');
  return json
    .filter(h => h && DATE.test(h.date) && h.global !== false && (!Array.isArray(h.types) || h.types.includes('Public')))
    .map(h => {
      const en = text(h.name);
      return { start: h.date, end: h.date, kind: 'holiday', cs: text(h.localName) || en, en };
    })
    .filter(h => h.cs);
}

const cacheKey = (country, year) => `${CACHE_PREFIX}${country}.${year}`;

/**
 * The saved holidays of one country and year.
 *
 * @param {string} country Country code.
 * @param {number} year Calendar year.
 * @param {Storage} [storage] localStorage, replaced in tests.
 * @returns {object[]|null} The items, or null when that year was never downloaded.
 */
export function cachedHolidays(country, year, storage = globalThis.localStorage) {
  try {
    const saved = storage.getItem(cacheKey(country, year));
    return saved === null ? null : parseHolidays(JSON.parse(saved).map(h => ({ date: h.start, localName: h.cs, name: h.en })));
  } catch {
    return null;
  }
}

/**
 * Downloads and saves one country's holidays for one year.
 *
 * @param {string} country Country code from COUNTRIES.
 * @param {number} year Calendar year.
 * @param {{fetcher?: typeof fetch, storage?: Storage}} [options] Replacements for tests.
 * @returns {Promise<boolean>} true when new holidays were saved.
 */
export async function downloadHolidays(country, year, { fetcher = globalThis.fetch, storage = globalThis.localStorage } = {}) {
  const id = `${country}-${year}`;
  if (!COUNTRIES.includes(country) || failed.has(id) || pending.has(id)) return false;
  pending.add(id);
  try {
    const res = await fetcher(`${API}/${year}/${country}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    storage.setItem(cacheKey(country, year), JSON.stringify(parseHolidays(await res.json())));
    return true;
  } catch {
    failed.add(id);
    return false;
  } finally {
    pending.delete(id);
  }
}

/** Calendar years touched by the days from..to. */
function yearsOf(from, to) {
  const years = [];
  for (let y = parseDay(from).getFullYear(); y <= parseDay(to).getFullYear(); y++) years.push(y);
  return years;
}

/**
 * Everything the calendar shows for the days from..to, by the account's country.
 *
 * @param {string} from First day key, "YYYY-MM-DD".
 * @param {string} to Last day key.
 * @param {{country: string, czech: {holidays: boolean, important: boolean, district: string}}} settings
 *   Account settings; `czech.holidays` also switches other countries' holidays on or off.
 * @param {Storage} [storage] localStorage, replaced in tests.
 * @returns {object[]} Items sorted by start day.
 */
export function calendarItems(from, to, settings, storage = globalThis.localStorage) {
  if (settings.country === CZECH) return czechItems(from, to, settings.czech);
  if (!settings.country || !settings.czech.holidays) return [];
  return yearsOf(from, to)
    .flatMap(y => cachedHolidays(settings.country, y, storage) || [])
    .filter(i => i.start <= to && i.end >= from)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * The calendar items for from..to grouped by day, for the month grid.
 *
 * @param {string} from First day key.
 * @param {string} to Last day key.
 * @param {object} settings Account settings, as for calendarItems.
 * @returns {Map<string, object[]>} Day key → the items on that day.
 */
export function calendarByDay(from, to, settings) {
  const map = new Map();
  for (const item of calendarItems(from, to, settings)) {
    for (let d = parseDay(item.start < from ? from : item.start); dayKey(d) <= item.end && dayKey(d) <= to; d.setDate(d.getDate() + 1)) {
      map.set(dayKey(d), [...(map.get(dayKey(d)) || []), item]);
    }
  }
  return map;
}

/**
 * Downloads the missing years of from..to for a non-Czech country, then calls onChange once if any arrived.
 *
 * @param {string} from First day key.
 * @param {string} to Last day key.
 * @param {object} settings Account settings.
 * @param {() => void} onChange Re-renders the view.
 * @returns {void}
 */
export function fetchMissingHolidays(from, to, settings, onChange) {
  if (settings.country === CZECH || !settings.country || !settings.czech.holidays) return;
  const missing = yearsOf(from, to).filter(y => cachedHolidays(settings.country, y) === null);
  if (!missing.length) return;
  Promise.all(missing.map(y => downloadHolidays(settings.country, y)))
    .then(results => { if (results.some(Boolean)) onChange(); });
}
