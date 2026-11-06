/**
 * Backup file format: building, naming and (defensively) reading account backups.
 *
 * Used by views/backup-ui.js (download and restore) and tested in tests/js/backup.test.mjs.
 * Invariant: parseBackup treats the file as hostile. Its result never carries AI settings (so a file
 * cannot redirect notes or the key to another host), links that are not http(s), or records that
 * are not objects with an id.
 */
import { ACCOUNT_KEYS } from './store.js';
import { COUNTRIES } from './holidays.js';
import { MODES, cleanResult } from './testcheck.js';
import { TOPIC_TITLE_MAX, TOPIC_DETAIL_MAX } from './curriculum.js';
import { clip } from './text.js';

export const BACKUP_FORMAT = 1;
export const BACKUP_KEYS = ACCOUNT_KEYS;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

/** Keys of `data` that hold lists of records. */
const LIST_KEYS = ['subjects', 'notes', 'events', 'sources', 'lessons', 'checks'];
/** Keys of `data` that hold plain objects (kept as they are). */
const OBJECT_KEYS = ['chats', 'chem'];
/** Settings a backup may carry; `ai` is deliberately absent. */
const SETTING_TYPES = { theme: 'string', aiLanguage: 'string', uiLanguage: 'string', school: 'string', lastBackup: 'number' };

/** Tells whether a value is a plain object (not null, not an array). */
const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
/** Tells whether a value is a string starting with http:// or https:// (case-insensitive, leading space ignored). */
const isWebUrl = v => typeof v === 'string' && /^https?:\/\//i.test(v.trim());

/**
 * Builds the backup file object for one account: everything it owns except uploaded files, which stay on the device.
 * The AI key stays out so a shared file can't leak it.
 *
 * @param {object} source Account data keyed by BACKUP_KEYS.
 * @param {{name: string, version: string, now?: Date}} info Account name, app version and export time.
 * @returns {object} Serialisable backup; the AI key is blanked and lastBackup left out.
 */
export function buildBackup(source, { name, version, now = new Date() }) {
  const data = {};
  for (const key of BACKUP_KEYS) {
    if (source[key] !== undefined) data[key] = JSON.parse(JSON.stringify(source[key] ?? null));
  }
  if (data.settings?.ai) data.settings.ai = { ...data.settings.ai, key: '' };
  delete data.settings?.lastBackup;
  return { app: 'school', format: BACKUP_FORMAT, appVersion: version, exported: now.toISOString(), account: { name }, data };
}

/**
 * Builds a safe download name such as school-backup-user-2026-11-02.json.
 *
 * @param {string} name Account name (any characters).
 * @param {Date} [now] Date to stamp.
 * @returns {string} File name with ASCII letters, digits and dashes only.
 */
export function backupFileName(name, now = new Date()) {
  const safe = String(name).normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'account';
  return `school-backup-${safe}-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Tells whether a restored record is usable. Rules per list: every record is an object with a string id,
 * subjects also need a string name, checks need valid fields and at least one usable question, sources and
 * lessons may only carry http(s) links.
 *
 * @param {string} key List name, one of LIST_KEYS.
 * @param {unknown} record One entry from the file.
 * @returns {boolean} true when the record is safe to keep.
 */
function isUsableRecord(key, record) {
  if (!isObject(record) || typeof record.id !== 'string') return false;
  if (key === 'subjects') return typeof record.name === 'string';
  // The result screen and the lists read the cleaned fields, so a check that cannot be cleaned would break them.
  if (key === 'checks') return cleanCheck(record) !== null;
  // A javascript: or data: address would run when the saved link is opened, so such sources are dropped.
  if (key === 'sources') return record.kind === 'link' ? isWebUrl(record.url) : !record.url || isWebUrl(record.url);
  return true;
}

/**
 * Rebuilds a saved check from a file: fields are type-checked and the result goes through the same cleaning as a
 * fresh AI answer, so the pages never meet a malformed question.
 *
 * @param {object} record A record with a string id.
 * @returns {object|null} The cleaned check, or null when a field is wrong or no question survives.
 */
function cleanCheck(record) {
  const { id, subjectId, eventId, mode, created, result } = record;
  const valid = typeof subjectId === 'string' && typeof eventId === 'string' && MODES.includes(mode)
    && Number.isFinite(created) && isObject(result) && Array.isArray(result.questions);
  if (!valid) return null;
  // The cleaner reads `confidence`, while a saved question stores the flag as `lowConfidence`.
  const questions = result.questions.map(q => (isObject(q) ? { ...q, confidence: q.lowConfidence === true ? 'low' : 'high' } : q));
  const cleaned = cleanResult({ ...result, questions });
  return cleaned && { id, subjectId, eventId, mode, created, result: cleaned };
}

/**
 * Keeps the usable topics of a subject outline: objects with a string id and title, a string detail, a boolean done.
 *
 * @param {unknown[]} topics The `topics` array from the file.
 * @returns {{ id: string, title: string, detail: string, done: boolean }[]} Clean topics; unusable entries are dropped.
 */
function cleanTopics(topics) {
  return topics
    .filter(t => isObject(t) && typeof t.id === 'string' && typeof t.title === 'string')
    .map(t => ({ id: t.id, title: clip(t.title, TOPIC_TITLE_MAX), detail: clip(t.detail, TOPIC_DETAIL_MAX), done: t.done === true }))
    .filter(t => t.title);
}

/**
 * Cleans one record: lessons keep their progress but lose a link that is not http(s); subjects keep only valid
 * topics (a `topics` value that is not a list is dropped); checks are rebuilt by cleanCheck.
 *
 * @param {string} key List name, one of LIST_KEYS.
 * @param {object} record A record that passed isUsableRecord.
 * @returns {object} The record, or a cleaned copy.
 */
function cleanRecord(key, record) {
  if (key === 'checks') return cleanCheck(record);
  if (key === 'subjects' && 'topics' in record) {
    const { topics, ...rest } = record;
    return Array.isArray(topics) ? { ...rest, topics: cleanTopics(topics) } : rest;
  }
  if (key === 'lessons' && record.link && !isWebUrl(record.link)) return { ...record, link: '' };
  return record;
}

/**
 * Keeps only the known, correctly typed settings. `ai` (address, key, model) never comes from a file.
 *
 * @param {object} settings The `settings` object from the file.
 * @returns {object} Safe settings.
 */
function cleanSettings(settings) {
  const clean = {};
  for (const [key, type] of Object.entries(SETTING_TYPES)) {
    if (typeof settings[key] === type) clean[key] = settings[key];
  }
  if (isObject(settings.czech)) clean.czech = settings.czech;
  // The student profile is kept whole; store.useAccount normalizes it when the account is opened.
  if (isObject(settings.student)) clean.student = settings.student;
  // A country outside the list would make the calendar ask Nager.Date for something it doesn't have.
  if (settings.country === '' || COUNTRIES.includes(settings.country)) clean.country = settings.country;
  if (Array.isArray(settings.addedDefaults)) clean.addedDefaults = settings.addedDefaults.filter(v => typeof v === 'string');
  return clean;
}

/**
 * Reads and validates backup text.
 *
 * @param {string} text Contents of the file.
 * @returns {{name: string, data: object}} Account name and the cleaned data, ready for store.restoreAccount.
 * @throws {Error} With a message for the user when the text is not a School backup or is damaged.
 * @example
 * const { name, data } = parseBackup(await file.text());
 */
export function parseBackup(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('This file is not a backup (it is not valid JSON).');
  }
  if (!isObject(file) || file.app !== 'school' || !isObject(file.data)) throw new Error('This file is not a School backup.');
  if (!Number.isInteger(file.format) || file.format > BACKUP_FORMAT) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  const data = {};
  for (const key of LIST_KEYS) {
    if (file.data[key] === undefined) continue;
    if (!Array.isArray(file.data[key])) throw new Error(`The backup is damaged (${key} has the wrong shape).`);
    data[key] = file.data[key].filter(r => isUsableRecord(key, r)).map(r => cleanRecord(key, r));
  }
  for (const key of [...OBJECT_KEYS, 'settings']) {
    if (file.data[key] === undefined) continue;
    if (!isObject(file.data[key])) throw new Error(`The backup is damaged (${key} has the wrong shape).`);
    data[key] = key === 'settings' ? cleanSettings(file.data[key]) : file.data[key];
  }
  const name = String(file.account?.name || 'Restored').trim().slice(0, 24) || 'Restored';
  return { name, data };
}

/**
 * Picks a free account name for a restore.
 *
 * @param {string} base Wanted name.
 * @param {(name: string) => boolean} taken Tells whether a name is in use.
 * @returns {string} base, or base with a "(restored)" suffix.
 */
// "User" -> "User (restored)" -> "User (restored 2)" when an account with that name exists.
export function restoredName(base, taken) {
  if (!taken(base)) return base;
  const first = `${base} (restored)`.slice(0, 40);
  if (!taken(first)) return first;
  for (let n = 2; ; n++) {
    const next = `${base} (restored ${n})`.slice(0, 40);
    if (!taken(next)) return next;
  }
}
