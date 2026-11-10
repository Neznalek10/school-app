/**
 * Keeps the app's data in step with a data file in the student's own GitHub repository.
 *
 * Responsibility: the GitHub settings (kept in this browser only), "save to GitHub", "load from GitHub" and
 * the automatic sync that runs when the app opens, when it comes back to the screen, and a minute after a
 * change. It works the same with or without the local server, so a phone on GitHub Pages and a computer
 * running serve.py can share one copy.
 *
 * Fits in: js/app.js calls startGitHubSync once; js/views/account.js shows the settings and calls saveNow,
 * loadNow and checkNow. Uses js/github.js for the API and js/sync/snapshot.js for the storage format.
 * Invariants: AI keys are removed before anything is uploaded, and the keys on this device survive a load.
 * The settings live under SETTINGS_KEY, outside every tracked prefix, so the token never reaches the data
 * file, a backup or GitHub. A load never runs while this device has changes GitHub does not have.
 */
import {
  takeSnapshot, applySnapshot, redactSecrets, canonical, contentHash,
  collectUntrustedKeys, restoreUntrustedKeys, fillSecrets,
} from './sync/snapshot.js';
import { fetchRemote, pushRemote, buildDataFile, parseDataFile, planSync, parseRepo, isSafePath, DEFAULT_PATH } from './github.js';

/** Storage key of the GitHub settings; deliberately outside the tracked prefixes (school., school-fr., vocab2.). */
export const SETTINGS_KEY = 'school-gh.settings';

/** How often a visible page looks for changes to save. */
export const CHECK_INTERVAL_MS = 60000;

/**
 * Settings and the bookkeeping of the last sync.
 * @typedef {{ owner: string, repo: string, path: string, token: string, auto: boolean, sha: string,
 *   hash: string, revision: number, lastSync: number, conflict: boolean, error: string }} GitHubSettings
 */

/** Settings of a device that has not been set up. */
const EMPTY = { owner: '', repo: '', path: DEFAULT_PATH, token: '', auto: true, sha: '', hash: '', revision: 0, lastSync: 0, conflict: false, error: '' };

/** Listeners told after every sync attempt, so the Account page can repaint. */
const listeners = new Set();

/** True while a save or load runs, so two never overlap. */
let busy = false;

/**
 * Reads the GitHub settings of this browser.
 *
 * @param {Storage} storage Web Storage (localStorage in the app).
 * @returns {GitHubSettings} The settings, with defaults for anything missing or damaged.
 */
export function readGitHub(storage) {
  let saved = {};
  try {
    saved = JSON.parse(storage.getItem(SETTINGS_KEY) || '{}') || {};
  } catch { /* damaged settings start over */ }
  return { ...EMPTY, ...saved };
}

/**
 * Merges changes into the GitHub settings and stores them.
 *
 * @param {Storage} storage Web Storage.
 * @param {Partial<GitHubSettings>} patch Fields to change.
 * @returns {GitHubSettings} The stored settings.
 */
export function writeGitHub(storage, patch) {
  const settings = { ...readGitHub(storage), ...patch };
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

/**
 * Stores the repository, file and token the student entered. A different repository or file starts a new
 * sync history, so the next sync asks before mixing two copies.
 *
 * @param {Storage} storage Web Storage.
 * @param {{ repo: string, path?: string, token: string }} input What the student typed.
 * @returns {GitHubSettings} The stored settings.
 * @throws {Error} With a message for the student when the repository or path is not valid.
 */
export function configureGitHub(storage, { repo, path = DEFAULT_PATH, token }) {
  const names = parseRepo(repo);
  if (!names) throw new Error('Write the repository as owner/name, for example user/school-data.');
  const file = (path || DEFAULT_PATH).trim();
  if (!isSafePath(file)) throw new Error('The file path must end in .json, for example school-data.json.');
  if (!token.trim()) throw new Error('Paste the GitHub token.');
  const before = readGitHub(storage);
  const sameTarget = before.owner === names.owner && before.repo === names.repo && before.path === file;
  return writeGitHub(storage, {
    ...names,
    path: file,
    token: token.trim(),
    ...(!sameTarget && { sha: '', hash: '', revision: 0, lastSync: 0, conflict: false, error: '' }),
  });
}

/**
 * Removes the token and the sync history from this browser; the data stays.
 *
 * @param {Storage} storage Web Storage.
 * @returns {void}
 */
export function disconnectGitHub(storage) {
  storage.removeItem(SETTINGS_KEY);
  notify();
}

/**
 * Tells whether this browser has everything a sync needs.
 *
 * @param {GitHubSettings} settings The settings.
 * @returns {boolean} true when the repository and token are set.
 */
export const isConfigured = settings => !!(settings.owner && settings.repo && settings.token);

/**
 * Registers a listener for sync results.
 *
 * @param {() => void} listener Called after every save, load or check.
 * @returns {() => void} Removes the listener.
 */
export function onGitHubChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tells every listener that the settings or the status changed. */
function notify() {
  for (const listener of listeners) listener();
}

/**
 * This device's data as it would be uploaded: tracked entries without AI keys, and their hash.
 *
 * @param {Storage} storage Web Storage.
 * @returns {{ entries: Record<string, unknown>, hash: string, trustedKey: string }} The entries, a content
 *   hash that ignores key order, and the AI key that must be put back after a load.
 */
function localState(storage) {
  const { entries, trusted } = redactSecrets(takeSnapshot(storage));
  return { entries, hash: contentHash(canonical(entries)), trustedKey: trusted[0] || '' };
}

/**
 * Runs one sync step with the busy flag, and records its error for the Account page.
 *
 * @param {Storage} storage Web Storage.
 * @param {() => Promise<string>} step The work.
 * @returns {Promise<string>} The step's result, or 'busy' when another step is running.
 * @throws {Error} The step's error, after it was recorded.
 */
async function guarded(storage, step) {
  if (busy) return 'busy';
  busy = true;
  try {
    const result = await step();
    return result;
  } catch (error) {
    writeGitHub(storage, { error: error.message });
    throw error;
  } finally {
    busy = false;
    notify();
  }
}

/**
 * Uploads this device's data to GitHub.
 *
 * @param {{ storage: Storage, fetcher?: typeof fetch, force?: boolean, now?: () => number }} options
 *   `force: true` overwrites GitHub even when another device saved there since this one last synced.
 * @returns {Promise<'saved'|'unchanged'|'conflict'|'busy'>} What happened.
 * @throws {import('./github.js').GitHubError} For a wrong token, a missing repository or a network problem.
 */
export async function saveNow({ storage, fetcher = fetch, force = false, now = Date.now }) {
  return guarded(storage, async () => {
    const settings = readGitHub(storage);
    const { entries, hash } = localState(storage);
    const remote = await fetchRemote(settings, { fetcher, withText: false });
    const remoteSha = remote?.sha || '';
    // Another device saved since this one last synced: overwriting would lose its changes.
    if (!force && remoteSha && remoteSha !== settings.sha) {
      writeGitHub(storage, { conflict: true, error: '' });
      return 'conflict';
    }
    if (!force && remoteSha && hash === settings.hash) return 'unchanged';
    const revision = settings.revision + 1;
    const sha = await pushRemote(settings, buildDataFile(entries, { revision, now: new Date(now()) }), { sha: remoteSha, fetcher });
    writeGitHub(storage, { sha, hash, revision, lastSync: now(), conflict: false, error: '' });
    return 'saved';
  });
}

/**
 * Replaces this device's data with the copy on GitHub. AI keys on this device are kept.
 *
 * @param {{ storage: Storage, fetcher?: typeof fetch, now?: () => number }} options Dependencies.
 * @returns {Promise<'loaded'|'missing'|'busy'>} 'missing' when GitHub has no data file yet. After 'loaded'
 *   the caller reloads the page so every view reads the new data.
 * @throws {import('./github.js').GitHubError} For a wrong token, a damaged file or a network problem.
 */
export async function loadNow({ storage, fetcher = fetch, now = Date.now }) {
  return guarded(storage, async () => {
    const settings = readGitHub(storage);
    const remote = await fetchRemote(settings, { fetcher });
    if (!remote) return 'missing';
    const { revision, entries } = parseDataFile(remote.text);
    // The file holds no AI keys, so the keys of this device are collected first and put back afterwards.
    const { trustedKey } = localState(storage);
    const untrusted = collectUntrustedKeys(storage);
    applySnapshot(storage, entries);
    fillSecrets(storage, trustedKey);
    restoreUntrustedKeys(storage, untrusted);
    writeGitHub(storage, { sha: remote.sha, hash: localState(storage).hash, revision, lastSync: now(), conflict: false, error: '' });
    return 'loaded';
  });
}

/**
 * Brings this device and GitHub in step: saves, loads or reports a conflict, as planSync decides.
 *
 * @param {{ storage: Storage, fetcher?: typeof fetch, allowLoad?: boolean, now?: () => number }} options
 *   `allowLoad: false` only saves (used while the student is working, so the page never reloads under them).
 * @returns {Promise<'none'|'saved'|'unchanged'|'loaded'|'missing'|'conflict'|'busy'|'off'>} What happened;
 *   'off' when GitHub sync is not set up or turned off.
 * @throws {import('./github.js').GitHubError} For a wrong token, a missing repository or a network problem.
 */
export async function checkNow({ storage, fetcher = fetch, allowLoad = true, now = Date.now }) {
  const settings = readGitHub(storage);
  if (!isConfigured(settings) || !settings.auto) return 'off';
  const { hash } = localState(storage);
  // Nothing new here and loading is not wanted: no need to ask GitHub at all.
  if (!allowLoad && hash === settings.hash) return 'none';
  const remote = await guarded(storage, () => fetchRemote(settings, { fetcher, withText: false }));
  if (remote === 'busy') return 'busy';
  const plan = planSync({ remoteSha: remote?.sha || '', knownSha: settings.sha, localHash: hash, knownHash: settings.hash });
  if (plan === 'save') return saveNow({ storage, fetcher, now });
  if (plan === 'load') return allowLoad ? loadNow({ storage, fetcher, now }) : 'none';
  if (plan === 'conflict') {
    writeGitHub(storage, { conflict: true, error: '' });
    notify();
    return 'conflict';
  }
  return 'none';
}

/**
 * Starts the automatic sync of this page: once now, whenever the page comes back to the screen, every
 * minute while it is visible (save only), and when it is hidden (save only, best effort).
 *
 * @param {{ storage?: Storage, fetcher?: typeof fetch, doc?: Document, reload?: () => void }} [options]
 *   Dependencies; the defaults are the page's own.
 * @returns {void}
 */
export function startGitHubSync({ storage = globalThis.localStorage, fetcher = globalThis.fetch?.bind(globalThis), doc = globalThis.document, reload = () => globalThis.location.reload() } = {}) {
  if (!storage || !fetcher || !doc) return;
  /**
   * Runs one check and reloads the page after a load; errors are already recorded for the Account page.
   *
   * @param {boolean} allowLoad Whether GitHub's newer data may replace this device's.
   * @returns {Promise<void>}
   */
  const run = async allowLoad => {
    try {
      if (await checkNow({ storage, fetcher, allowLoad }) === 'loaded') reload();
    } catch { /* shown on the Account page */ }
  };
  run(true);
  doc.addEventListener('visibilitychange', () => run(doc.visibilityState === 'visible'));
  setInterval(() => {
    if (doc.visibilityState === 'visible') run(false);
  }, CHECK_INTERVAL_MS);
}
