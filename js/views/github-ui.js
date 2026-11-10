/**
 * The GitHub card of the Account page: connect a repository, see when the data was last synced, save or load
 * by hand, settle a conflict between two devices, or disconnect.
 *
 * Fits in: js/views/account.js puts githubSection into the page and calls mountGitHub; the sync itself is in
 * js/github-sync.js. The token is shown only as a password field and never written into the page text.
 */
import { html, icon } from '../ui.js';
import { formatDateTime } from '../locale.js';
import {
  readGitHub, configureGitHub, disconnectGitHub, isConfigured, saveNow, loadNow, checkNow, writeGitHub, onGitHubChange,
} from '../github-sync.js';
import { DEFAULT_PATH } from '../github.js';

/** Page where GitHub creates a fine-grained token; the student limits it to the one repository. */
const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/**
 * The form shown before a repository is connected.
 *
 * @returns {object} An html fragment.
 */
function connectForm() {
  return html`<form class="gh-form" data-gh-form novalidate>
    <p class="muted small settings-note">Keep your notes, tests and progress in your own private GitHub repository, so every phone and computer you sign in on shares them. AI keys are never uploaded.</p>
    <label class="field-label" for="gh-repo">Repository</label>
    <input id="gh-repo" class="input" name="repo" data-no-tr placeholder="owner/repository" autocomplete="off" autocapitalize="off" spellcheck="false">
    <label class="field-label" for="gh-path">File in the repository</label>
    <input id="gh-path" class="input" name="path" data-no-tr value="${DEFAULT_PATH}" autocomplete="off" autocapitalize="off" spellcheck="false">
    <label class="field-label" for="gh-token">Token</label>
    <input id="gh-token" class="input" name="token" type="password" data-no-tr placeholder="github_pat_…" autocomplete="off">
    <p class="muted small settings-note">Create a fine-grained token with Repository access "Only select repositories" set to just this repository, and Permissions › Contents set to "Read and write". Use a private repository: the file holds your notes and grades. The token stays in this browser only.</p>
    <a class="btn btn-secondary btn-sm" href="${TOKEN_URL}" target="_blank" rel="noopener">Create a token on GitHub</a>
    <p class="form-error" hidden></p>
    <button class="btn btn-primary btn-block" type="submit">${icon('upload')}Connect</button>
  </form>`;
}

/**
 * One line about the last sync, an error, or a conflict.
 *
 * @param {object} settings GitHub settings from readGitHub.
 * @returns {object} An html fragment.
 */
function statusLine(settings) {
  if (settings.conflict) {
    return html`<div class="notice notice-warn">${icon('info')}<span>This device and GitHub both have changes. Choose which copy to keep; the other one is replaced.</span></div>
      <div class="setting-buttons"><button class="btn btn-secondary btn-sm" data-gh-use-remote>Use GitHub's copy</button><button class="btn btn-secondary btn-sm" data-gh-use-local>Keep this device's copy</button></div>`;
  }
  if (settings.error) return html`<p class="form-error">${settings.error}</p>`;
  return html`<p class="muted small">${settings.lastSync ? `Last synced ${formatDateTime(settings.lastSync)}.` : 'Not synced yet.'}</p>`;
}

/**
 * The card's content for the current settings.
 *
 * @param {object} settings GitHub settings from readGitHub.
 * @returns {object} An html fragment.
 */
function githubBody(settings) {
  if (!isConfigured(settings)) return connectForm();
  return html`
    <div class="setting">
      <div class="setting-text"><div class="setting-label" data-no-tr>${settings.owner}/${settings.repo}</div><div class="setting-hint" data-no-tr>${settings.path}</div></div>
      <label class="gh-switch"><input type="checkbox" data-gh-auto ${settings.auto ? 'checked' : ''}><span>Sync by itself</span></label>
    </div>
    ${statusLine(settings)}
    <div class="setting-buttons">
      <button class="btn btn-primary btn-sm" data-gh-save>${icon('upload')}Save now</button>
      <button class="btn btn-secondary btn-sm" data-gh-load>${icon('download')}Load from GitHub</button>
      <button class="btn btn-text btn-sm" data-gh-disconnect>Disconnect</button>
    </div>`;
}

/**
 * The GitHub group of the Account page.
 *
 * @returns {object} An html fragment.
 */
export function githubSection() {
  return html`<h3 class="group-title">GitHub</h3>
    <section class="card settings" data-github aria-live="polite">${githubBody(readGitHub(localStorage))}</section>`;
}

/**
 * Wires the GitHub card: connect, save, load, conflict choices, the auto switch and disconnect.
 *
 * @param {object} app The app object (toast, confirm).
 * @param {HTMLElement} root The mounted Account view.
 * @returns {() => void} Stops listening for sync changes.
 */
export function mountGitHub(app, root) {
  const card = root.querySelector('[data-github]');
  const storage = localStorage;
  /** Repaints the card from the stored settings. */
  const redraw = () => {
    card.innerHTML = githubBody(readGitHub(storage)).s;
  };

  /**
   * Runs a sync action, shows its outcome, and reloads after a load so every view reads the new data.
   *
   * @param {() => Promise<string>} action The sync call.
   * @returns {Promise<void>}
   */
  const run = async action => {
    card.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
      const result = await action();
      if (result === 'loaded') {
        app.toast('Loaded from GitHub.', { kind: 'success' });
        location.reload();
        return;
      }
      const messages = {
        saved: 'Saved to GitHub.',
        unchanged: 'GitHub already has this data.',
        none: 'Everything is in sync.',
        missing: 'GitHub has no data file yet. Save first.',
        busy: 'A sync is already running.',
      };
      if (messages[result]) app.toast(messages[result], { kind: 'success' });
    } catch (error) {
      app.toast(error.message, { kind: 'error', duration: 7000 });
    }
    redraw();
  };

  /**
   * Asks before this device's data is replaced by GitHub's copy.
   *
   * @returns {Promise<boolean>} true when the student agreed.
   */
  const confirmLoad = () => app.confirm({
    title: 'Load from GitHub?',
    text: 'The data on this device is replaced by the copy on GitHub. If this device has work that is not on GitHub, back it up first.',
    confirmLabel: 'Load',
    danger: true,
  });

  card.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target.closest('[data-gh-form]');
    const error = form.querySelector('.form-error');
    try {
      configureGitHub(storage, { repo: form.repo.value, path: form.path.value, token: form.token.value });
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      return;
    }
    redraw();
    // The first check saves to an empty repository, or asks which copy to keep when the file exists.
    await run(() => checkNow({ storage }));
  });

  // Buttons are re-created on every redraw, so clicks are handled once on the card.
  card.addEventListener('click', async e => {
    if (e.target.closest('[data-gh-save]')) await run(() => saveNow({ storage }));
    else if (e.target.closest('[data-gh-load]')) {
      if (await confirmLoad()) await run(() => loadNow({ storage }));
    } else if (e.target.closest('[data-gh-use-remote]')) {
      if (await confirmLoad()) await run(() => loadNow({ storage }));
    } else if (e.target.closest('[data-gh-use-local]')) {
      const ok = await app.confirm({ title: 'Keep this device\'s copy?', text: 'The copy on GitHub is replaced by the data on this device. GitHub keeps the old one in the file\'s history.', confirmLabel: 'Replace on GitHub', danger: true });
      if (ok) await run(() => saveNow({ storage, force: true }));
    } else if (e.target.closest('[data-gh-disconnect]')) {
      const ok = await app.confirm({ title: 'Disconnect GitHub?', text: 'The token is removed from this browser. Your data stays on this device and on GitHub.', confirmLabel: 'Disconnect' });
      if (ok) disconnectGitHub(storage);
    }
  });
  card.addEventListener('change', e => {
    if (e.target.matches('[data-gh-auto]')) writeGitHub(storage, { auto: e.target.checked });
  });
  return onGitHubChange(redraw);
}
