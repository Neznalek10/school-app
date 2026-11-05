/**
 * Account store: accounts, per-account data (subjects, notes, events, sources, lessons, chats, settings) and
 * their persistence in localStorage (memory when storage is blocked).
 *
 * Fits in: every view reads and saves through `store`; js/backup.js uses ACCOUNT_KEYS; js/subjects.js
 * supplies the default subjects. Built-in lessons are not seeded here: they are added per subject by
 * addBuiltInLesson (js/soustavy.js) when a starter kit or a setup asks for them.
 */
import { defaultSubjects, addLaterDefaults, LATER_DEFAULTS } from './subjects.js';
import { migrateEvents } from './events.js';
import { CZECH, defaultCountry } from './holidays.js';

const PREFIX = 'school.';
const memory = {};

export const DEFAULT_AI = { url: 'https://openrouter.ai/api/v1', key: '', model: 'openrouter/free' };
const DEFAULT_SETTINGS = {
  theme: 'system',
  ai: { ...DEFAULT_AI },
  aiLanguage: 'en',
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

export const ACCOUNT_KEYS = ['subjects', 'notes', 'events', 'sources', 'lessons', 'chats', 'settings', 'chem'];

export const uid = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
  settings: { ...DEFAULT_SETTINGS },

  /**
   * Creates a new account with the default subjects and settings, and stores the account list.
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
    write(`${account.id}.settings`, { addedDefaults: [...LATER_DEFAULTS], ai: { ...DEFAULT_AI }, country: defaultCountry() });
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
    const saved = read(key('settings'), {});
    this.settings = { ...DEFAULT_SETTINGS, ...saved, ai: { ...DEFAULT_AI, ...saved.ai }, czech: { ...DEFAULT_SETTINGS.czech, ...saved.czech } };
    const later = addLaterDefaults(this.subjects, saved.addedDefaults);
    if (later.changed) {
      this.settings.addedDefaults = later.added;
      write(key('subjects'), this.subjects);
      write(key('settings'), this.settings);
    }
    session(id);
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
    this.settings = { ...DEFAULT_SETTINGS };
    session(null);
  },
  save(key) {
    write(`${this.account.id}.${key}`, this[key]);
  },
};
