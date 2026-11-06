/**
 * Account page: profile, AI settings, calendar options, theme, storage status, backup and version.
 *
 * Responsibility: the #/account route. Settings are saved to store.settings on change; the Storage card
 * follows the shared sync state from js/sync/engine.js while the view is shown.
 * Fits in: routed from js/app.js; uses backup-ui.js for backups, accounts.js for the avatar and ai.js
 * for the AI test; styles .storage-* live in css/app.css.
 * Invariant: the AI key is never shown in or sent to the data file; in file mode it lives in .env.
 */
import { store } from '../store.js';
import { DEFAULT_AI, chat, aiReady, aiSettings, AiError, AI_LANGUAGES, languageName } from '../ai.js';
import { html, icon, plural, segmented, onSegmented, applyTheme } from '../ui.js';
import { avatar } from './accounts.js';
import { downloadBackup, pickBackupFile } from './backup-ui.js';
import { DISTRICTS, SCHOOL_YEAR_RANGE } from '../czech.js';
import { COUNTRIES, CZECH, countryName } from '../holidays.js';
import { syncState, onSyncChange, syncNow, forgetKey } from '../sync/engine.js';
import { formatDateTime, studentText, UI_LANGUAGES, uiLanguage } from '../locale.js';
import { isStudentStarted } from '../student.js';
import { tr } from '../i18n.js';

/** Shown for the browser-only storage mode. */
const BROWSER_STORAGE_TEXT = html`Saved in this browser only. Start the app with <code>python serve.py</code> to keep it in a file you can move to another computer.`;

function row(label, hint, control) {
  return html`<div class="setting">
    <div class="setting-text"><div class="setting-label">${label}</div>${hint ? html`<div class="setting-hint">${hint}</div>` : ''}</div>
    ${control}
  </div>`;
}

/**
 * Builds the "About you" row: a one-line summary of the profile and a button that reopens the interview.
 *
 * @returns {object} An html fragment.
 */
function aboutYouRow() {
  const student = store.settings.student;
  const known = isStudentStarted(student) || !!store.settings.country;
  // The summary starts a sentence, so its first letter is capitalised ("An 8-year-old student ...").
  const text = studentText();
  const summary = known ? text.charAt(0).toUpperCase() + text.slice(1) : 'Not filled in yet. The AI uses it to fit its answers to you.';
  return row('About you', summary, html`<a class="btn btn-secondary btn-sm" href="#/welcome">${icon('edit')}Edit</a>`);
}

/**
 * Builds the hint under the backup button.
 *
 * @param {number|undefined} last Timestamp of the last backup, if any.
 * @param {string} mode Sync mode: 'file' keeps a copy in data/school-data.json, anything else lives in the browser.
 * @returns {string} Plain text for the hint line.
 */
function backupHint(last, mode) {
  if (!last) {
    // In file mode the data is already safe on disk, so the backup is only an extra copy.
    return mode === 'file'
      ? 'Never backed up. Your progress is also saved in data/school-data.json. A backup is an extra copy.'
      : 'Never backed up. Notes live only in this browser, so clearing site data or changing phones loses them.';
  }
  const days = Math.floor((Date.now() - last) / 86400000);
  return `Last backup ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}. Restoring always creates a new account.`;
}

/**
 * Builds the status line of the Storage card for the current sync mode.
 *
 * @param {typeof syncState} state The shared sync state.
 * @returns {{tone: string, text: object, alert?: boolean}} CSS modifier ('' for none), the html-escaped text and whether it is an error.
 */
function storageStatus(state) {
  if (state.mode === 'file') {
    // A failed save replaces the "Saved to" line so the card never says both.
    if (state.error) return { tone: 'is-bad', text: html`${state.error}`, alert: true };
    return { tone: 'is-good', text: html`Saved to ${state.dataFile || 'data/school-data.json'} on this computer` };
  }
  if (state.mode === 'browser') return { tone: 'is-warn', text: BROWSER_STORAGE_TEXT };
  return { tone: '', text: html`Checking where your data is saved…` };
}

/**
 * Renders the inside of the Storage card: one status pill (icon and flowing text), and in file mode the
 * last save time, the save number and "Save now".
 *
 * @param {typeof syncState} state The shared sync state.
 * @returns {object} An html fragment.
 */
function storageCardBody(state) {
  const { tone, text, alert } = storageStatus(state);
  const isFile = state.mode === 'file';
  const savedAt = state.savedAt ? formatDateTime(state.savedAt) : 'not yet';
  // The pill sits outside the key/value rows so its text flows and stays left-aligned.
  return html`
    <div class="storage-status ${tone}" role="${alert ? 'alert' : 'status'}">${icon(tone === 'is-good' ? 'check' : tone ? 'alert' : 'refresh')}<span>${text}</span></div>
    ${isFile ? html`
      <div class="storage-row"><span>Last saved</span><span>${savedAt} <small class="muted">(save #${state.revision})</small></span></div>
      ${state.saving ? html`<div class="storage-status is-warn">${icon('refresh')}<span>Saving…</span></div>` : ''}
      <div class="setting-buttons"><button class="btn btn-secondary btn-sm" data-sync-now ${state.saving ? 'disabled' : ''}>${icon('refresh')}Save now</button></div>` : ''}`;
}

/**
 * Renders the note and "Forget key" button under the AI key field (file mode with a key in .env only).
 *
 * @param {typeof syncState} state The shared sync state.
 * @returns {object} An html fragment, empty when there is nothing to say.
 */
function keyNote(state) {
  if (state.mode !== 'file' || !state.hasAiKey) return html``;
  return html`<p class="muted small">Saved in .env on this computer
    <button class="btn btn-ghost-danger btn-sm" data-forget-key>Forget key</button></p>`;
}

/**
 * Builds the Account view.
 *
 * @param {object} app The app object (toast, render, switchAccount, version).
 * @returns {object} The view: title, body, mount and leave (stops listening to sync changes).
 */
export function accountView(app) {
  let stopSyncListening = () => {};
  const s = store.settings;
  const countries = COUNTRIES.map(code => [code, countryName(code)]).sort((a, b) => a[1].localeCompare(b[1], uiLanguage()));
  const ai = aiSettings();
  const chats = Object.values(store.chats).filter(c => c.messages?.length).length;

  const body = html`
    <section class="card settings">
      <div class="setting setting-profile">
        ${avatar(store.account.name, 'sm')}
        <div class="setting-text"><div class="setting-label">${store.account.name}</div><div class="setting-hint">${plural(store.subjects.length, 'subject')} · ${plural(store.notes.length, 'note')} · ${plural(chats, 'chat')}</div></div>
        <button class="btn btn-secondary btn-sm" data-switch>Switch account</button>
      </div>
    </section>

    <h3 class="group-title">About you</h3>
    <section class="card settings">${aboutYouRow()}</section>

    <h3 class="group-title">AI assistants</h3>
    <section class="card settings ai-settings">
      <p class="muted small">Every subject's assistants use this. Your key stays on this device. Get a free key at openrouter.ai.</p>
      <p class="muted small">OpenRouter accounts are for adults. If you are under 18, ask a parent to create the key.</p>
      <label class="field-label" for="ai-url">Address</label>
      <input id="ai-url" class="input" data-ai="url" value="${ai.url}" autocomplete="off" spellcheck="false" autocapitalize="off">
      <label class="field-label" for="ai-key">Key</label>
      <input id="ai-key" class="input" type="password" data-ai="key" value="${ai.key}" placeholder="sk-or-..." autocomplete="off" spellcheck="false">
      <div data-key-note>${keyNote(syncState)}</div>
      <label class="field-label" for="ai-model">Model</label>
      <input id="ai-model" class="input" data-ai="model" value="${ai.model}" autocomplete="off" spellcheck="false" autocapitalize="off">
      <p class="muted small">"openrouter/free" picks a free model for you and quality varies. A fixed model gives steadier answers.</p>
      <label class="field-label" for="ai-vision">Photo model</label>
      <input id="ai-vision" class="input" data-ai="visionModel" value="${ai.visionModel || ''}" placeholder="Same as Model" autocomplete="off" spellcheck="false" autocapitalize="off">
      <p class="muted small">Used to read photos of tests. Leave it empty to use the model above, if that model can read images.</p>
      <div class="setting-buttons">
        <button class="btn btn-secondary btn-sm" data-ai-preset="openrouter">OpenRouter</button>
        <button class="btn btn-secondary btn-sm" data-ai-preset="ollama">Ollama on this PC</button>
        <button class="btn btn-primary btn-sm" data-ai-test>${icon('check')}Test</button>
      </div>
      <div class="setting">
        <div class="setting-text"><div class="setting-label">Answer language</div><div class="setting-hint">The assistants and the setup interview reply in this language</div></div>
        <select class="input district-select" name="aiLanguage" aria-label="Answer language" data-no-tr>
          ${AI_LANGUAGES.map(code => html`<option value="${code}" ${code === s.aiLanguage ? 'selected' : ''}>${languageName(code, code)} · ${languageName(code)}</option>`)}
        </select>
      </div>
    </section>

    <h3 class="group-title" id="calendar">Calendar</h3>
    <section class="card settings">
      <div class="setting">
        <div class="setting-text"><div class="setting-label">Country</div><div class="setting-hint">${s.country === CZECH ? 'Czech Republic has the full school calendar built in.' : 'Public holidays come from Nager.Date and are saved on this device for offline use.'}</div></div>
        <select class="input district-select" name="country" aria-label="Country" data-no-tr>
          <option value="" ${s.country ? '' : 'selected'}>${tr('None')}</option>
          ${countries.map(([code, name]) => html`<option value="${code}" ${code === s.country ? 'selected' : ''}>${name}</option>`)}
        </select>
      </div>
      ${s.country && s.country !== CZECH ? row('Public holidays', `Days off in ${countryName(s.country)}`, segmented('cz-holidays', [{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }], s.czech.holidays ? 'on' : 'off')) : ''}
      ${s.country === CZECH ? html`${row('Czech holidays and school breaks', 'Public holidays, MŠMT school breaks, first and last day of school', segmented('cz-holidays', [{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }], s.czech.holidays ? 'on' : 'off'))}
      ${row('Important days', 'Významné dny, e.g. Flag Day or Teachers\' Day', segmented('cz-important', [{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }], s.czech.important ? 'on' : 'off'))}
      <div class="setting">
        <div class="setting-text"><div class="setting-label">Spring break district</div><div class="setting-hint">Spring break depends on the district your school is in. School breaks are filled in for ${SCHOOL_YEAR_RANGE[0]}/${String(SCHOOL_YEAR_RANGE[0] + 1).slice(2)} to ${SCHOOL_YEAR_RANGE[1]}/${String(SCHOOL_YEAR_RANGE[1] + 1).slice(2)}.</div></div>
        <select class="input district-select" name="district" aria-label="Spring break district" data-no-tr>
          <option value="">${tr('Not set')}</option>
          ${DISTRICTS.map(d => html`<option value="${d}" ${d === s.czech.district ? 'selected' : ''}>${d}</option>`)}
        </select>
      </div>` : ''}
    </section>

    <h3 class="group-title">Appearance</h3>
    <section class="card settings">
      <div class="setting">
        <div class="setting-text"><div class="setting-label">Interface language</div><div class="setting-hint">Menus, buttons and messages. Your own notes and subjects stay as you wrote them.</div></div>
        <select class="input district-select" name="uiLanguage" aria-label="Interface language" data-no-tr>
          ${UI_LANGUAGES.map(l => html`<option value="${l.code}" ${l.code === s.uiLanguage ? 'selected' : ''}>${l.name}</option>`)}
        </select>
      </div>
      ${row('Theme', null, segmented('theme', [
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ], s.theme))}
    </section>

    <h3 class="group-title">Storage</h3>
    <section class="card settings storage-card" data-storage aria-live="polite">${storageCardBody(syncState)}</section>

    <h3 class="group-title">Data</h3>
    <section class="card settings">
      ${row('Back up subjects, notes, calendar and sources', backupHint(s.lastBackup, syncState.mode), html`<div class="setting-buttons"><button class="btn btn-primary btn-sm" data-backup>${icon('download')}Back up</button><button class="btn btn-secondary btn-sm" data-restore>${icon('upload')}Restore</button></div>`)}
      <p class="muted small settings-note">Uploaded files stay on this device and are not in the backup. Built-in apps, such as the French course and the English vocabulary trainer, keep their own progress: back it up from Settings inside each app.</p>
    </section>

    <h3 class="group-title">About</h3>
    <section class="card settings">
      ${row(`School · version ${app.version}`, 'Updates install by themselves when you open the app.', '')}
    </section>`;

  /**
   * Keeps the Storage card and the key note in step with the sync state while the view is shown.
   *
   * @param {HTMLElement} root The mounted view.
   * @returns {void}
   */
  function mountStorage(root) {
    const card = root.querySelector('[data-storage]');
    const note = root.querySelector('[data-key-note]');
    /** Repaints the Storage card and the key note from the current sync state. */
    const redraw = () => {
      card.innerHTML = storageCardBody(syncState).s;
      note.innerHTML = keyNote(syncState).s;
    };
    // Buttons are re-created on every redraw, so clicks are handled once on their stable parents.
    card.addEventListener('click', async e => {
      if (e.target.closest('[data-sync-now]')) await syncNow();
    });
    note.addEventListener('click', async e => {
      if (e.target.closest('[data-forget-key]')) await forgetStoredKey();
    });
    stopSyncListening = onSyncChange(redraw);
    redraw();
  }

  /**
   * Asks first, then removes the AI key from .env and from this browser's settings, then reloads so the page forgets it too.
   *
   * @returns {Promise<void>}
   */
  async function forgetStoredKey() {
    const ok = await app.confirm({ title: 'Forget the AI key?', text: 'It is removed from .env on this computer. You can add it again later.', confirmLabel: 'Forget key', danger: true });
    if (!ok) return;
    try {
      await forgetKey();
    } catch (err) {
      app.toast(err.message, { kind: 'error' });
      return;
    }
    // The running page still holds the key in memory; clear it before saving settings, then reload.
    s.ai = { ...s.ai, key: '' };
    store.save('settings');
    location.reload();
  }

  return {
    title: 'Account',
    body,
    /** Stops listening to sync changes when the view is left. */
    leave() {
      stopSyncListening();
    },
    mount(root) {
      onSegmented(root, (name, value) => {
        if (name.startsWith('cz-')) s.czech[name.slice(3)] = value === 'on';
        else s[name] = value;
        store.save('settings');
        if (name === 'theme') applyTheme();
      });
      root.querySelector('[name=uiLanguage]').addEventListener('change', e => {
        s.uiLanguage = UI_LANGUAGES.some(l => l.code === e.target.value) ? e.target.value : 'en';
        store.save('settings');
        // Every screen was drawn in the old language, so the page starts again in the new one.
        location.reload();
      });
      root.querySelector('[name=aiLanguage]').addEventListener('change', e => {
        s.aiLanguage = AI_LANGUAGES.includes(e.target.value) ? e.target.value : 'en';
        store.save('settings');
        app.toast(`Assistants now answer in ${languageName(s.aiLanguage)}.`, { kind: 'success' });
      });
      root.querySelector('[name=country]').addEventListener('change', e => {
        s.country = COUNTRIES.includes(e.target.value) ? e.target.value : '';
        store.save('settings');
        app.toast(s.country ? `Calendar set to ${countryName(s.country)}.` : 'Holidays hidden.', { kind: 'success' });
        app.render();
      });
      root.querySelector('[name=district]')?.addEventListener('change', e => {
        s.czech.district = DISTRICTS.includes(e.target.value) ? e.target.value : '';
        store.save('settings');
        app.toast(s.czech.district ? `Spring break set for ${s.czech.district}.` : 'Spring break hidden.', { kind: 'success' });
      });
      const field = name => root.querySelector(`[data-ai="${name}"]`);
      const saveAi = () => {
        s.ai = Object.fromEntries(['url', 'key', 'model', 'visionModel'].map(k => [k, field(k).value.trim()]));
        store.save('settings');
      };
      root.querySelectorAll('[data-ai]').forEach(input => input.addEventListener('change', saveAi));
      root.querySelectorAll('[data-ai-preset]').forEach(btn => btn.addEventListener('click', () => {
        const ollama = btn.dataset.aiPreset === 'ollama';
        field('url').value = ollama ? 'http://localhost:11434/v1' : DEFAULT_AI.url;
        field('model').value = ollama ? 'llama3.1:8b' : DEFAULT_AI.model;
        // A photo model chosen for the old address would not exist at the new one.
        field('visionModel').value = '';
        saveAi();
      }));
      root.querySelector('[data-ai-test]').addEventListener('click', async e => {
        saveAi();
        const config = aiSettings();
        if (!aiReady(config)) return app.toast('Add a key first.', { kind: 'error' });
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await chat(config, [{ role: 'user', content: 'Reply with the single word OK.' }], { timeout: 30000 });
          app.toast('The AI answered. Your assistants are ready.', { kind: 'success' });
        } catch (err) {
          app.toast(err instanceof AiError ? err.message : 'The test failed.', { kind: 'error', duration: 7000 });
        } finally {
          btn.disabled = false;
        }
      });
      mountStorage(root);
      root.querySelector('[data-backup]').addEventListener('click', () => {
        downloadBackup(app);
        app.render();
      });
      root.querySelector('[data-restore]').addEventListener('click', () => pickBackupFile(app));
      root.querySelector('[data-switch]').addEventListener('click', () => app.switchAccount());
    },
  };
}
