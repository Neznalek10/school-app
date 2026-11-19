/**
 * Cockpit inbox: imports tests, homework and events that the personal assistant "Cockpit" left in a
 * separate file in the student's GitHub repository.
 *
 * Responsibility: find the inbox file next to the data file, validate its items, pick the account and the
 * subject for each, add the missing ones as calendar events and remember which items were consumed. Cockpit
 * never writes the shared data file, so the app's "which copy to keep" conflicts cannot come from it.
 *
 * Fits in: js/github-sync.js calls importCockpitInbox after a sync that leaves this device in step with
 * GitHub. js/github.js reads the file. The consumed ids live in the account key `inbox` (ACCOUNT_KEYS in
 * js/store.js, inside the tracked prefix), so they reach every device through the data file.
 * Invariants: every function except importCockpitInbox is pure (no network, no storage). An invalid item,
 * and an item whose subject cannot be found, is skipped and NOT consumed, so it can work after a fix. An
 * item is consumed only after its event exists. The file is never written. Events added here carry
 * `source: "cockpit"` and are otherwise identical to events the student adds.
 */
import { fetchFileText, GitHubError, isSafePath } from './github.js';
import { isDay, isTime } from './events.js';
import { uid } from './store.js';

/** Header of the inbox file. */
export const INBOX_APP = 'cockpit-inbox';
export const INBOX_FORMAT = 1;

/** File name of the inbox, always in the folder of the data file. */
export const INBOX_FILE = 'cockpit-inbox.json';

/** How many consumed ids are kept (the newest). */
export const MAX_CONSUMED = 1000;

/** Item limits from the contract. */
const ID = /^ck-[a-z0-9-]{4,60}$/;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 4000;
const TYPES = ['test', 'homework', 'event'];

/** Value of `source` on every event added from the inbox. */
export const SOURCE = 'cockpit';

/**
 * Path of the inbox file for a data file path.
 *
 * @param {string} dataPath Path of the data file, for example "school-data.json" or "dir/x.json".
 * @returns {string} "cockpit-inbox.json" or "dir/cockpit-inbox.json".
 * @example
 * inboxPath('dir/x.json'); // 'dir/cockpit-inbox.json'
 */
export function inboxPath(dataPath) {
  const slash = String(dataPath).lastIndexOf('/');
  return slash < 0 ? INBOX_FILE : `${dataPath.slice(0, slash + 1)}${INBOX_FILE}`;
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Checks one inbox item and returns it cleaned, or null when it is invalid.
 *
 * @param {unknown} raw One entry of `items`.
 * @returns {{ id: string, account: string, type: string, subjectId: string, subject: string, title: string,
 *   date: string, time: string, description: string, created: string } | null} The item, or null.
 */
export function validateItem(raw) {
  if (!isObject(raw)) return null;
  const text = (value, fallback = '') => (value === undefined ? fallback : value);
  const { id, account, type, subjectId, subject, title, date, time, description, created } = raw;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (!TYPES.includes(type)) return null;
  for (const value of [text(account), text(subjectId), text(subject), text(time), text(description)]) {
    if (typeof value !== 'string') return null;
  }
  if (typeof title !== 'string') return null;
  const cleanTitle = title.trim().replace(/\s+/g, ' ');
  if (!cleanTitle || cleanTitle.length > MAX_TITLE) return null;
  if (typeof date !== 'string' || !isDay(date)) return null;
  if (text(time) !== '' && !isTime(time)) return null;
  if (text(description).length > MAX_DESCRIPTION) return null;
  if (typeof created !== 'string' || Number.isNaN(Date.parse(created))) return null;
  return {
    id, account: text(account), type, subjectId: text(subjectId), subject: text(subject), title: cleanTitle,
    date, time: text(time), description: text(description).trim(), created,
  };
}

/**
 * Reads the inbox file. Invalid items are left out; everything else in the file is ignored.
 *
 * @param {string} text The file's text.
 * @returns {{ items: object[], invalid: number }} The valid items in file order (a repeated id counts once)
 *   and the number of entries that were skipped.
 * @throws {GitHubError} Kind format when the text is not JSON or not a Cockpit inbox file.
 */
export function parseInbox(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GitHubError('format', 'The Cockpit inbox on GitHub is not valid JSON.');
  }
  if (!isObject(data) || data.app !== INBOX_APP || data.format !== INBOX_FORMAT || !Array.isArray(data.items)) {
    throw new GitHubError('format', 'The file on GitHub is not a Cockpit inbox.');
  }
  const items = [];
  const seen = new Set();
  let invalid = 0;
  for (const raw of data.items) {
    const item = validateItem(raw);
    if (!item) invalid++;
    else if (!seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  return { items, invalid };
}

/**
 * Chooses the account an item is for: the named one, or the first account.
 *
 * @param {{ account: string }} item A valid item.
 * @param {{ id: string }[]} accounts The device's accounts.
 * @returns {{ id: string } | null} The account, or null when the device has none.
 */
export function chooseAccount(item, accounts) {
  return accounts.find(a => a.id === item.account) || accounts[0] || null;
}

/**
 * Finds the subject of an item: by id, else by name (case-insensitive, trimmed).
 *
 * @param {{ subjectId: string, subject: string }} item A valid item.
 * @param {{ id: string, name: string }[]} subjects The target account's subjects.
 * @returns {{ id: string, name: string } | null} The subject, or null when neither matches.
 */
export function resolveSubject(item, subjects) {
  const byId = item.subjectId && subjects.find(s => s.id === item.subjectId);
  if (byId) return byId;
  const name = item.subject.trim().toLowerCase();
  return (name && subjects.find(s => String(s.name).trim().toLowerCase() === name)) || null;
}

/**
 * Finds an event that already says the same: same subject, type, date and title (case-insensitive).
 *
 * @param {object[]} events The account's events.
 * @param {string} subjectId The resolved subject.
 * @param {{ type: string, date: string, title: string }} item A valid item.
 * @returns {object | undefined} The existing event, if any.
 */
export function findDuplicate(events, subjectId, item) {
  const title = item.title.trim().toLowerCase();
  return events.find(e => e.subjectId === subjectId && e.type === item.type && e.date === item.date
    && String(e.title).trim().toLowerCase() === title);
}

/**
 * Builds the event for an item, in the shape the app's own "Add to calendar" sheet creates, plus `source`.
 *
 * @param {object} item A valid item.
 * @param {string} subjectId The resolved subject.
 * @param {{ newId?: (prefix: string) => string, now?: () => number }} [options] Id generator and clock.
 * @returns {object} The event: id, subjectId, title, type, date, time, description, materials, done, created, source.
 */
export function buildEvent(item, subjectId, { newId = uid, now = Date.now } = {}) {
  return {
    id: newId('e'), subjectId, title: item.title, type: item.type, date: item.date, time: item.time,
    description: item.description, materials: [], done: false, created: now(), source: SOURCE,
  };
}

/**
 * Adds the consumed ids to the list, without repeats, keeping the newest MAX_CONSUMED.
 *
 * @param {unknown} consumed The stored list (anything else counts as empty).
 * @param {string[]} ids Newly consumed ids.
 * @returns {string[]} The new list.
 */
export function addConsumed(consumed, ids) {
  const list = Array.isArray(consumed) ? consumed.filter(id => typeof id === 'string') : [];
  const next = [...list.filter(id => !ids.includes(id)), ...ids];
  return next.slice(-MAX_CONSUMED);
}

/**
 * Applies items to one account's data. Changes `data.events` and `data.inbox` in place.
 *
 * @param {{ subjects: object[], events: object[], inbox: string[] }} data The account's data.
 * @param {object[]} items Valid items, already chosen for this account.
 * @param {{ newId?: (prefix: string) => string, now?: () => number }} [options] Id generator and clock.
 * @returns {{ added: number, duplicates: number, skipped: number, changed: boolean }} What happened;
 *   `changed` is true when events or the consumed list changed.
 */
export function applyItems(data, items, options = {}) {
  const consumed = new Set(Array.isArray(data.inbox) ? data.inbox : []);
  const done = [];
  const result = { added: 0, duplicates: 0, skipped: 0, changed: false };
  for (const item of items) {
    if (consumed.has(item.id)) continue;
    const subject = resolveSubject(item, data.subjects);
    if (!subject) {
      result.skipped++;
      continue;
    }
    if (findDuplicate(data.events, subject.id, item)) result.duplicates++;
    else {
      data.events.push(buildEvent(item, subject.id, options));
      result.added++;
    }
    done.push(item.id);
  }
  if (done.length) {
    data.inbox = addConsumed(data.inbox, done);
    result.changed = true;
  }
  return result;
}

/**
 * Reads a JSON value stored under a tracked account key.
 *
 * @param {Storage} storage Web Storage.
 * @param {string} key Full key.
 * @param {unknown} fallback Value for a missing or damaged entry.
 * @returns {unknown} The value.
 */
function readKey(storage, key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Applies fetched items to every account they belong to.
 *
 * The account open in the app goes through the store (`open.data` is the store, `open.save` its save), so
 * views update; any other account has its storage keys written directly.
 *
 * @param {{ storage: Storage, items: object[], open?: (() => ({ id: string, data: object, save: (key: string) => void }) | null),
 *   newId?: (prefix: string) => string, now?: () => number }} options Dependencies; `open` returns the
 *   signed-in account, or null.
 * @returns {number} How many events were added.
 */
export function applyToAccounts({ storage, items, open = () => null, newId, now }) {
  const accounts = readKey(storage, 'school.accounts', []);
  if (!Array.isArray(accounts)) return 0;
  const byAccount = new Map();
  for (const item of items) {
    const account = chooseAccount(item, accounts.filter(isObject));
    if (!account) continue;
    byAccount.set(account.id, [...(byAccount.get(account.id) || []), item]);
  }
  const current = open();
  let added = 0;
  for (const [id, list] of byAccount) {
    const key = name => `school.${id}.${name}`;
    const inStore = current && current.id === id;
    const data = inStore ? current.data : {
      subjects: readKey(storage, key('subjects'), []),
      events: readKey(storage, key('events'), []),
      inbox: readKey(storage, key('inbox'), []),
    };
    if (!Array.isArray(data.subjects) || !Array.isArray(data.events)) continue;
    const result = applyItems(data, list, { newId, now });
    added += result.added;
    if (!result.changed) continue;
    for (const name of ['events', 'inbox']) {
      if (inStore) current.save(name);
      else storage.setItem(key(name), JSON.stringify(data[name]));
    }
  }
  return added;
}

/**
 * Fetches the inbox from GitHub and imports it. Called by github-sync only when this device is in step
 * with GitHub, GitHub is set up and no conflict is open.
 *
 * @param {{ settings: { owner: string, repo: string, path: string, token: string }, storage: Storage,
 *   fetcher?: typeof fetch, open?: Parameters<typeof applyToAccounts>[0]['open'],
 *   newId?: (prefix: string) => string, now?: () => number }} options Dependencies.
 * @returns {Promise<number>} How many events were added (0 for a missing inbox).
 * @throws {GitHubError} For a wrong token, a network problem or a damaged inbox; the caller records it.
 */
export async function importCockpitInbox({ settings, storage, fetcher = fetch, open, newId, now }) {
  const path = inboxPath(settings.path);
  if (!isSafePath(path)) throw new GitHubError('format', 'Check the repository name and the file path in Account.');
  const text = await fetchFileText(settings, path, { fetcher });
  if (text === null) return 0;
  const { items } = parseInbox(text);
  return applyToAccounts({ storage, items, open, newId, now });
}
