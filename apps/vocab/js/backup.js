/**
 * Backup file format of the Vocab 2 app: building, naming and reading profile backups.
 *
 * Used by the backup screens; tested in tests/js/apps.test.mjs. Invariant: parseBackup drops settings.ai
 * from the file so a shared backup can't redirect AI requests. withoutAi is a deliberate copy of the
 * dashboard rule in js/backup.js: the apps are standalone forks that must not import from the dashboard.
 */
export const BACKUP_FORMAT = 1;
export const BACKUP_KEYS = ['progress', 'activity', 'decks', 'settings', 'lang'];
const OBJECT_KEYS = ['progress', 'activity', 'settings'];
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

const isObject = v => v && typeof v === 'object' && !Array.isArray(v);

// Everything a profile owns, as a plain object.
export function buildBackup(source, { name, version, now = new Date() }) {
  const data = {};
  for (const key of BACKUP_KEYS) {
    if (source[key] !== undefined) data[key] = JSON.parse(JSON.stringify(source[key] ?? null));
  }
  delete data.settings?.lastBackup;
  return { app: 'vocab2', format: BACKUP_FORMAT, appVersion: version, exported: now.toISOString(), account: { name }, data };
}

export function backupFileName(name, now = new Date()) {
  const safe = String(name).normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'profile';
  return `vocab2-backup-${safe}-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Copies settings without the `ai` entry.
 *
 * @param {object} settings The `settings` object from a backup file.
 * @returns {object} A shallow copy with no `ai` key.
 */
function withoutAi(settings) {
  const copy = { ...settings };
  delete copy.ai;
  return copy;
}

/**
 * Reads and validates backup text. Settings come back without `ai`.
 *
 * @param {string} text Contents of the file.
 * @returns {{name: string, exported: string|null, data: object}} Profile name and cleaned data.
 * @throws {Error} With a user-readable message when the file is not a backup of this app or is damaged.
 */
export function parseBackup(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('This file is not a backup (it is not valid JSON).');
  }
  if (!isObject(file) || file.app !== 'vocab2' || !isObject(file.data)) throw new Error('This file is not a Vocab 2 backup.');
  if (!Number.isInteger(file.format) || file.format > BACKUP_FORMAT) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  const data = {};
  for (const key of OBJECT_KEYS) {
    if (file.data[key] === undefined) continue;
    if (!isObject(file.data[key])) throw new Error(`The backup is damaged (${key} has the wrong shape).`);
    data[key] = file.data[key];
  }
  // The AI address and key never come from a file: a shared backup could otherwise send requests to another host.
  if (data.settings) data.settings = withoutAi(data.settings);
  if (file.data.decks !== undefined) {
    if (!Array.isArray(file.data.decks)) throw new Error('The backup is damaged (decks has the wrong shape).');
    data.decks = file.data.decks;
  }
  if (typeof file.data.lang === 'string') data.lang = file.data.lang;
  const name = String(file.account?.name || 'Restored').trim().slice(0, 24) || 'Restored';
  return { name, exported: file.exported || null, data };
}

export function backupSummary(data) {
  const progress = Object.values(data.progress || {});
  return {
    decks: (data.decks || []).length,
    words: (data.decks || []).reduce((n, d) => n + (d.words?.length || 0), 0),
    answers: progress.reduce((n, p) => n + (p.right || 0) + (p.wrong || 0), 0),
  };
}

// "User" -> "User (restored)" -> "User (restored 2)" when a profile with that name exists.
export function restoredName(base, taken) {
  if (!taken(base)) return base;
  const first = `${base} (restored)`.slice(0, 40);
  if (!taken(first)) return first;
  for (let n = 2; ; n++) {
    const next = `${base} (restored ${n})`.slice(0, 40);
    if (!taken(next)) return next;
  }
}
