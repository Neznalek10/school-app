/**
 * Account store: accounts, per-account data (subjects, notes, events, sources, lessons, chats, saved test checks,
 * settings with the student profile) and their persistence in localStorage (memory when storage is blocked).
 *
 * Fits in: every view reads and saves through `store`; js/backup.js uses ACCOUNT_KEYS; js/subjects.js
 * supplies the default subjects (none) and js/student.js cleans the profile kept in `settings.student`.
 * Built-in lessons are not seeded here: they are added per subject by addBuiltInLesson (js/soustavy.js)
 * when a starter kit or a setup asks for them.
 */
import { defaultSubjects, addLaterDefaults, LATER_DEFAULTS } from './subjects.js';
import { migrateEvents } from './events.js';
import { CZECH, defaultCountry } from './holidays.js';
import { setLocale, browserLanguage } from './locale.js';
import { normalizeStudent } from './student.js';

const PREFIX = 'school.';
const memory = {};

/** AI connection defaults; `visionModel` is the optional model for photo requests (empty means the main model). */
export const DEFAULT_AI = { url: 'https://openrouter.ai/api/v1', key: '', model: 'openrouter/free', visionModel: '' };
/**
 * Formats and prompts follow the signed-in account's interface language, country and student profile.
 * The legacy `school` text is not passed: useAccount migrates it into the profile once, so a school the
 * student cleared stays cleared.
 */
const applyLocale = settings => setLocale({ language: settings.uiLanguage, country: settings.country, student: settings.student });

const DEFAULT_SETTINGS = {
  theme: 'system',
  ai: { ...DEFAULT_AI },
  aiLanguage: 'en',
  // Accounts from before the language setting had the English interface; new ones follow the browser.
  uiLanguage: 'en',
  // Legacy free text from before the student profile; kept for old data, migrated once into student.school and no longer used or edited.
  school: '',
  // Who the student is (age, year, stage, school, subjects, goals); replaced by useAccount with a fresh copy per account.
  student: normalizeStudent({}),
  // Accounts from before the country setting all used the Czech calendar; new ones get the browser's country.
  country: CZECH,
  czech: { holidays: true, important: true, district: '' },
  lastBackup: null,
};

// Storage can be unavailable (private mode, blocked site data); the app then keeps state in memory.
function read(key, fallback) {
  try {
    const value = localStorage.getItem(PREFIX + key);
    if (value !== null) return JSON.parse(value);
  } catch { /* fall through to memory */ }
  return memory[key] ?? fallback;
}

function write(key, value) {
  memory[key] = value;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch { /* memory copy still holds it */ }
}

// Coming back from the French or English app reloads the page, so the signed-in account is kept for this tab.
const SESSION_KEY = `${PREFIX}current`;
function session(id) {
  try {
    if (id === undefined) return sessionStorage.getItem(SESSION_KEY);
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* the picker shows again instead */ }
  return null;
}

export const ACCOUNT_KEYS = ['subjects', 'notes', 'events', 'sources', 'lessons', 'chats', 'settings', 'chem', 'checks'];

export const uid = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The saved student profile, with the legacy `settings.school` text copied into it when the profile never
 * had a `school` field (an account from before the profile). A profile that has the field, even an empty
 * one, is left alone, so clearing the school sticks.
 *
 * @param {{ student?: unknown, school?: unknown }} saved The stored settings.
 * @returns {object} The raw profile to normalize.
 */
function migrateSchool(saved) {
  const student = saved.student && typeof saved.student === 'object' ? saved.student : {};
  return 'school' in student ? student : { ...student, school: saved.school };
}

/** Default settings with their own student object, so editing one account's profile never touches the shared default. */
const freshSettings = () => ({ ...DEFAULT_SETTINGS, student: normalizeStudent({}) });

export const store = {
  accounts: read('accounts', []),
  account: null,
  subjects: [],
  notes: [],
  events: [],
  sources: [],
  lessons: [],
  chats: {},
  chem: {},
  /** Saved photo test checks (CheckRecord[], text only: photos are never stored). */
  checks: [],
  settings: freshSettings(),

  /**
   * Creates a new account with no subjects and the default settings, and stores the account list.
   *
   * @param {string} name Display name.
   * @returns {{ id: string, name: string, created: number }} The new account (not signed in yet).
   */
  createAccount(name) {
    const account = { id: uid('a'), name, created: Date.now() };
    this.accounts.push(account);
    write('accounts', this.accounts);
    write(`${account.id}.subjects`, defaultSubjects());
    // Nothing is added later to a brand new account, so record every later default as handled.
    // The AI block is stored from the start so a key from .env has a config object to be filled into.
    // The student profile starts empty: the Get started interview fills it in.
    write(`${account.id}.settings`, {
      addedDefaults: [...LATER_DEFAULTS],
      ai: { ...DEFAULT_AI },
      country: defaultCountry(),
      uiLanguage: browserLanguage(),
      aiLanguage: browserLanguage(),
      student: normalizeStudent({}),
    });
    return account;
  },
  nameTaken(name) {
    return this.accounts.some(a => a.name.toLowerCase() === name.toLowerCase());
  },
  useAccount(id) {
    this.account = this.accounts.find(a => a.id === id) || null;
    if (!this.account) return false;
    const key = k => `${id}.${k}`;
    this.subjects = read(key('subjects'), null) || defaultSubjects();
    this.notes = read(key('notes'), []);
    this.events = read(key('events'), []);
    if (migrateEvents(this.events)) write(key('events'), this.events);
    this.sources = read(key('sources'), []);
    this.lessons = read(key('lessons'), []);
    this.chats = read(key('chats'), {});
    this.chem = read(key('chem'), {});
    this.checks = read(key('checks'), []);
    const saved = read(key('settings'), {});
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      ai: { ...DEFAULT_AI, ...saved.ai },
      czech: { ...DEFAULT_SETTINGS.czech, ...saved.czech },
      student: normalizeStudent(migrateSchool(saved)),
    };
    const later = addLaterDefaults(this.subjects, saved.addedDefaults);
    if (later.changed) {
      this.settings.addedDefaults = later.added;
      write(key('subjects'), this.subjects);
      write(key('settings'), this.settings);
    }
    session(id);
    applyLocale(this.settings);
    return true;
  },
  lastAccount() {
    return session();
  },
  /**
   * Turns a backup into a new account, so nothing that already exists is overwritten.
   *
   * Side effects: writes the account list and every account key found in the backup; settings get default AI values because backups never carry them.
   *
   * @param {string} name Display name of the new account.
   * @param {object} data Parsed backup content keyed by account key (subjects, notes, ...).
   * @returns {{ id: string, name: string, created: number }} The new account.
   */
  restoreAccount(name, data) {
    const account = { id: uid('a'), name, created: Date.now() };
    this.accounts.push(account);
    write('accounts', this.accounts);
    for (const key of ACCOUNT_KEYS) {
      if (data[key] !== undefined) write(`${account.id}.${key}`, data[key]);
    }
    // Backups never carry the AI settings; store the defaults so a key from .env can be filled in.
    const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    write(`${account.id}.settings`, { ...settings, ai: { ...DEFAULT_AI, ...settings.ai } });
    return account;
  },
  signOut() {
    this.account = null;
    this.settings = freshSettings();
    session(null);
    setLocale({ language: browserLanguage() });
  },
  save(key) {
    write(`${this.account.id}.${key}`, this[key]);
    if (key === 'settings') applyLocale(this.settings);
  },
  /**
   * Stores the student profile in the settings and saves them, so every later AI prompt describes the student.
   *
   * @param {object} student Any profile object; it is cleaned with normalizeStudent first.
   * @returns {void}
   * @throws {TypeError} When no account is signed in (save needs the account).
   * @example
   * store.saveStudent({ ...store.settings.student, age: 8, year: 2 });
   */
  saveStudent(student) {
    this.settings.student = normalizeStudent(student);
    this.save('settings');
  },
};
