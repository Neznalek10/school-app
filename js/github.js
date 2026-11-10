/**
 * GitHub copy of the data file: reads and writes `school-data.json` in a repository the student owns,
 * through the GitHub contents API.
 *
 * Fits in: js/github-sync.js calls these functions with the student's settings and the page's fetch; the
 * Account page shows the result. The file has the same shape as data/school-data.json written by the local
 * server, so either copy can be used in place of the other.
 * Invariants: nothing here touches localStorage or the DOM, and the network is always the injected `fetcher`,
 * so every function runs under the test harness. The token only travels in the Authorization header to
 * api.github.com.
 */
import { bytesToBase64, base64ToBytes } from './text.js';

/** Address of the GitHub REST API; the token is never sent anywhere else. */
export const API_BASE = 'https://api.github.com';

/** Path of the data file inside the repository when the student does not pick another one. */
export const DEFAULT_PATH = 'school-data.json';

/** Header fields that identify the file, matching APP_NAME and DATA_FORMAT in server/datastore.py. */
export const FILE_APP = 'school-app';
export const FILE_FORMAT = 1;

/** Longest a GitHub request may take before it counts as a network failure. */
const TIMEOUT_MS = 30000;

/** Owner and repository names as GitHub allows them: letters, digits, "-", "_" and "." (no "..", no leading "."). */
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/;

/** A path inside the repository: segments of safe characters ending in .json, no "..", no leading "/". */
const FILE_PATH = /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.json$/;

/** Error with a `kind` the page turns into advice: auth, notfound, conflict, format, network or http. */
export class GitHubError extends Error {
  /**
   * @param {'auth'|'notfound'|'conflict'|'format'|'network'|'http'} kind What went wrong.
   * @param {string} message Text shown to the student.
   */
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/**
 * Reads "owner/repo" or a github.com address of a repository.
 *
 * @param {unknown} text What the student typed, for example "user/school-data" or
 *   "https://github.com/user/school-data.git".
 * @returns {{ owner: string, repo: string } | null} The names, or null when the text is not a repository.
 * @example
 * parseRepo('https://github.com/user/school-data'); // { owner: 'user', repo: 'school-data' }
 */
export function parseRepo(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  const parts = trimmed.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  const valid = name => NAME.test(name) && !name.includes('..');
  return valid(owner) && valid(repo) ? { owner, repo } : null;
}

/**
 * Tells whether a file path is safe to put into the API address.
 *
 * @param {unknown} path A path such as "school-data.json" or "backup/phone.json".
 * @returns {boolean} true for a relative .json path without "..".
 */
export const isSafePath = path => typeof path === 'string' && FILE_PATH.test(path) && !path.split('/').includes('..');

/**
 * Encodes text as base64 of its UTF-8 bytes, as the contents API expects.
 *
 * @param {string} text Any text, including Czech letters and emoji.
 * @returns {string} Base64 without line breaks.
 */
export const encodeBase64 = text => bytesToBase64(new TextEncoder().encode(text));

/**
 * Decodes base64 of UTF-8 bytes; GitHub wraps it in lines, which are ignored.
 *
 * @param {string} base64 Content from the API.
 * @returns {string} The text.
 */
export const decodeBase64 = base64 => new TextDecoder().decode(base64ToBytes(base64));

/**
 * Builds the text of the data file: the same header and layout as data/school-data.json.
 *
 * @param {Record<string, unknown>} entries Tracked storage entries, with AI keys already removed.
 * @param {{ revision: number, now?: Date }} options `revision` counts saves, starting at 1.
 * @returns {string} Pretty-printed JSON ending with a newline.
 */
export function buildDataFile(entries, { revision, now = new Date() }) {
  const file = { app: FILE_APP, entries, format: FILE_FORMAT, revision, savedAt: now.toISOString() };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Reads a data file from GitHub (or one written by the local server).
 *
 * @param {string} text The file's text.
 * @returns {{ revision: number, savedAt: string, entries: Record<string, unknown> }} Its parts.
 * @throws {GitHubError} Kind format when the text is not a School app data file.
 */
export function parseDataFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GitHubError('format', 'The file on GitHub is not valid JSON.');
  }
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(data) || data.app !== FILE_APP || data.format !== FILE_FORMAT || !isObject(data.entries)) {
    throw new GitHubError('format', 'The file on GitHub is not a School app data file.');
  }
  return {
    revision: Number.isInteger(data.revision) && data.revision > 0 ? data.revision : 1,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    entries: data.entries,
  };
}

/**
 * Decides what a sync should do, from what this device knows about the last sync.
 *
 * @param {{ remoteSha: string, knownSha: string, localHash: string, knownHash: string }} state
 *   `remoteSha`: the file's sha on GitHub now ('' when there is no file); `knownSha` and `knownHash`: the
 *   file sha and the local content hash at this device's last load or save ('' before the first one);
 *   `localHash`: the content hash of this device's data now.
 * @returns {'none'|'save'|'load'|'conflict'} What to do: nothing, upload this device's data, download
 *   GitHub's, or ask the student because both sides changed (or this device never synced with that file).
 */
export function planSync({ remoteSha, knownSha, localHash, knownHash }) {
  const localChanged = localHash !== knownHash;
  if (!remoteSha) return 'save';
  if (remoteSha === knownSha) return localChanged ? 'save' : 'none';
  // GitHub changed since this device last saw it (or this device never synced): only safe to load when
  // this device has nothing new.
  if (knownSha && !localChanged) return 'load';
  return 'conflict';
}

/**
 * Turns a failed response into an error the student can act on.
 *
 * @param {number} status HTTP status.
 * @returns {GitHubError} The error.
 */
function statusError(status) {
  if (status === 401) return new GitHubError('auth', 'GitHub refused the token. Create a new one and paste it in Account.');
  if (status === 403) return new GitHubError('auth', 'The token may not write to this repository. Give it "Contents: Read and write" for it.');
  if (status === 404) return new GitHubError('notfound', 'GitHub cannot find the repository. Check the name, and that the token may read it.');
  if (status === 409 || status === 422) return new GitHubError('conflict', 'The file on GitHub changed while saving. Try again.');
  return new GitHubError('http', `GitHub answered with an error (${status}).`);
}

/**
 * Sends one request to the GitHub API with the token and a time limit.
 *
 * @param {{ token: string }} settings The student's GitHub settings.
 * @param {string} path API path starting with "/".
 * @param {{ method?: string, body?: object, accept?: string, fetcher: typeof fetch }} options Request details.
 * @returns {Promise<Response>} The response, whatever its status.
 * @throws {GitHubError} Kind network when GitHub cannot be reached in time.
 */
async function request(settings, path, { method = 'GET', body, accept = 'application/vnd.github+json', fetcher }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetcher(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${settings.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body && { 'Content-Type': 'application/json' }),
      },
      body: body && JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    throw new GitHubError('network', 'Could not reach GitHub. Check the connection.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The API path of the data file, with every part encoded.
 *
 * @param {{ owner: string, repo: string, path: string }} settings Repository and file path.
 * @returns {string} For example "/repos/user/data/contents/school-data.json".
 * @throws {GitHubError} Kind format when the repository or path is not valid.
 */
function contentsPath(settings) {
  if (!parseRepo(`${settings.owner}/${settings.repo}`) || !isSafePath(settings.path)) {
    throw new GitHubError('format', 'Check the repository name and the file path in Account.');
  }
  const file = settings.path.split('/').map(encodeURIComponent).join('/');
  return `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${file}`;
}

/**
 * Reads the data file from GitHub.
 *
 * @param {{ owner: string, repo: string, path: string, token: string }} settings GitHub settings.
 * @param {{ fetcher?: typeof fetch, withText?: boolean }} [options] `withText: false` only asks for the sha.
 * @returns {Promise<{ sha: string, text: string } | null>} The file's sha and text, or null when the
 *   repository has no such file yet.
 * @throws {GitHubError} For a wrong token, a missing repository or a network problem.
 */
export async function fetchRemote(settings, { fetcher = fetch, withText = true } = {}) {
  const path = contentsPath(settings);
  const res = await request(settings, path, { fetcher });
  if (res.status === 404) {
    // A missing file and a missing repository both answer 404; the repository check tells them apart.
    const repo = await request(settings, `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`, { fetcher });
    if (repo.ok) return null;
    throw statusError(repo.status);
  }
  if (!res.ok) throw statusError(res.status);
  const meta = await res.json().catch(() => null);
  if (!meta || typeof meta.sha !== 'string') throw new GitHubError('format', 'GitHub sent an answer the app does not understand.');
  if (!withText) return { sha: meta.sha, text: '' };
  // Files over 1 MB come without content; the raw media type returns them whole.
  if (typeof meta.content === 'string' && meta.content && meta.encoding === 'base64') {
    return { sha: meta.sha, text: decodeBase64(meta.content) };
  }
  const raw = await request(settings, path, { accept: 'application/vnd.github.raw+json', fetcher });
  if (!raw.ok) throw statusError(raw.status);
  return { sha: meta.sha, text: await raw.text() };
}

/**
 * Writes the data file to GitHub as one commit.
 *
 * @param {{ owner: string, repo: string, path: string, token: string }} settings GitHub settings.
 * @param {string} text The new file text.
 * @param {{ sha?: string, message?: string, fetcher?: typeof fetch }} [options] `sha`: the file's current
 *   sha on GitHub (omit to create the file); GitHub refuses the write when it no longer matches.
 * @returns {Promise<string>} The sha of the saved file.
 * @throws {GitHubError} Kind conflict when the file changed on GitHub in the meantime.
 */
export async function pushRemote(settings, text, { sha = '', message = 'Save school data', fetcher = fetch } = {}) {
  const body = { message, content: encodeBase64(text), ...(sha && { sha }) };
  const res = await request(settings, contentsPath(settings), { method: 'PUT', body, fetcher });
  if (!res.ok) throw statusError(res.status);
  const data = await res.json().catch(() => null);
  const saved = data?.content?.sha;
  if (typeof saved !== 'string') throw new GitHubError('format', 'GitHub saved the file but sent an unexpected answer.');
  return saved;
}
