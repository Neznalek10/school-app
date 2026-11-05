/**
 * The account's interface language and country, and everything formatted by them: dates, numbers and weeks.
 *
 * The store calls setLocale when an account signs in or its settings change; views and js/events.js format
 * through these helpers instead of a fixed "en-GB". Holds no account data itself, so it imports nothing.
 */

/** Interface languages, each with a dictionary in js/i18n/ (English needs none: views are written in it). */
export const UI_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'cs', name: 'Čeština' },
];

/** Countries whose weeks start on Sunday or Saturday, for browsers without Intl week info (CLDR). */
const SUNDAY_FIRST = new Set('AG AS BD BR BS BT BW BZ CA CN CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW'.split(' '));
const SATURDAY_FIRST = new Set('AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY'.split(' '));

let current = { language: 'en', country: '', school: '' };

/**
 * Sets the language, country and school every later format and prompt uses.
 *
 * @param {{language?: string, country?: string, school?: string}} settings Interface language code, country
 *   code, and the student's own description of their school ("" for the default).
 * @returns {void}
 */
export function setLocale({ language, country, school } = {}) {
  current = {
    language: UI_LANGUAGES.some(l => l.code === language) ? language : 'en',
    country: /^[A-Z]{2}$/.test(country || '') ? country : '',
    school: typeof school === 'string' ? school.trim().replace(/\s+/g, ' ').slice(0, MAX_SCHOOL) : '',
  };
}

/** Longest school description kept; it goes into every AI prompt. */
export const MAX_SCHOOL = 120;

/** True for the Czech Republic, whose school conventions (and Czech-only tools) the app has built in. */
export const isCzechSchool = () => current.country === 'CZ';

/**
 * Who the student is, as AI prompts say it after "I am" or "for": the student's own words when set.
 *
 * @returns {string} For example "a student in the first year of a Czech gymnázium" or
 *   "a secondary school student in Germany".
 */
export function studentText() {
  if (current.school) return current.school;
  if (isCzechSchool()) return 'a student in the first year of a Czech gymnázium';
  if (!current.country) return 'a secondary school student';
  let name = current.country;
  try { name = new Intl.DisplayNames(['en'], { type: 'region' }).of(current.country) || name; } catch { /* keep the code */ }
  return `a secondary school student in ${name}`;
}

/**
 * Adapts a built-in prompt to the account's country: lines marked [CZ] are kept only for Czech schools,
 * lines marked [INTL] only for all others, and the markers are removed. {student} is left for fillStudent.
 *
 * @param {string} text A prompt template.
 * @returns {string} The template for this account.
 */
export function localizePrompt(text) {
  const czech = isCzechSchool();
  return text.split('\n')
    .filter(line => (line.includes('[CZ]') ? czech : line.includes('[INTL]') ? !czech : true))
    .map(line => line.replace(/\[(CZ|INTL)\]/g, ''))
    .join('\n');
}

/**
 * Fills {student} in a prompt; a function replacer keeps "$&" in the student's text literal.
 *
 * @param {string} text Prompt text.
 * @returns {string} The text with the student description.
 */
export const fillStudent = text => text.replaceAll('{student}', () => studentText());

/** The interface language code, for example "cs". */
export const uiLanguage = () => current.language;

/**
 * Guesses the interface language from the browser: Czech and Slovak browsers get Czech, all others English.
 *
 * @param {string} [language] A BCP 47 tag; defaults to the browser's.
 * @returns {string} A code from UI_LANGUAGES.
 */
export function browserLanguage(language = globalThis.navigator?.language || '') {
  return /^(cs|sk)\b/i.test(language) ? 'cs' : 'en';
}

/**
 * The locale tag dates and numbers are formatted with: the interface language plus the account's country.
 *
 * @returns {string} For example "cs-CZ", "en-US", or "en-GB" when no country is set.
 */
export function locale() {
  if (current.country) return `${current.language}-${current.country}`;
  return current.language === 'cs' ? 'cs-CZ' : 'en-GB';
}

/**
 * The first day of the week in the account's country, as JavaScript counts days (0 Sunday, 1 Monday, 6 Saturday).
 *
 * @param {string} [country] Country code; defaults to the account's.
 * @returns {number} 0, 1 or 6.
 */
export function weekStart(country = current.country) {
  if (!country) return 1;
  try {
    const loc = new Intl.Locale(`und-${country}`);
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch { /* old browser: use the table below */ }
  if (SUNDAY_FIRST.has(country)) return 0;
  return SATURDAY_FIRST.has(country) ? 6 : 1;
}

/**
 * Formats a date in the account's locale.
 *
 * @param {Date|number} date A date or a timestamp.
 * @param {Intl.DateTimeFormatOptions} [options] What to show.
 * @returns {string} The formatted date.
 */
export const formatDate = (date, options) => new Date(date).toLocaleDateString(locale(), options);

/**
 * Formats a date and time in the account's locale.
 *
 * @param {Date|number} date A date or a timestamp.
 * @returns {string} For example "5 Nov 2026, 21:47".
 */
export const formatDateTime = date => new Date(date).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Formats a number in the account's locale: "1,382" or "1 382".
 *
 * @param {number} n The number.
 * @param {Intl.NumberFormatOptions} [options] Extra options.
 * @returns {string} The formatted number.
 */
export const formatNumber = (n, options) => n.toLocaleString(locale(), options);

/**
 * Short weekday names in calendar order, starting on the country's first day of the week.
 *
 * @returns {string[]} Seven names, for example ["Mon", ..., "Sun"] or ["ne", "po", ...].
 */
export function weekdayNames() {
  const start = weekStart();
  // 2023-01-01 was a Sunday, so day i of that week is weekday i.
  return Array.from({ length: 7 }, (_, i) => formatDate(new Date(2023, 0, 1 + ((start + i) % 7)), { weekday: 'short' }).replace(/\.$/, ''));
}
