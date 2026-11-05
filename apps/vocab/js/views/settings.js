import { store } from '../store.js';
import { html, icon, plural, segmented, onSegmented, applyTheme } from '../ui.js';
import { avatar } from './accounts.js';
import { directionOptions } from './practice.js';
import { downloadBackup, pickBackupFile } from './backup-ui.js';

function row(label, hint, control) {
  return html`<div class="setting">
    <div class="setting-text"><div class="setting-label">${label}</div>${hint ? html`<div class="setting-hint">${hint}</div>` : ''}</div>
    ${control}
  </div>`;
}

async function checkForUpdates(app) {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) await reg.update().catch(() => {});
  app.toast('Reloading the latest version…');
  setTimeout(() => location.reload(), 600);
}

function backupHint(last) {
  if (!last) return 'Never backed up. Your progress lives only in this browser, so clearing site data or changing phones loses it.';
  const days = Math.floor((Date.now() - last) / 86400000);
  return `Last backup ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}. Restoring always creates a new profile.`;
}

export function settingsView(app) {
  const s = store.settings;
  const decks = app.decks;
  const wordCount = decks.reduce((n, d) => n + d.words.length, 0);
  const embedded = !!app.embed.home;

  const body = html`
    <h3 class="group-title">Profile</h3>
    <section class="card settings">
      <div class="setting setting-profile">
        ${avatar(store.account.name, 'sm')}
        <div class="setting-text"><div class="setting-label">${store.account.name}</div><div class="setting-hint">${embedded ? 'Signed in from your school dashboard' : 'Progress, decks and settings are saved on this device'}</div></div>
        <button class="btn btn-secondary btn-sm" data-switch>${embedded ? 'Dashboard' : 'Switch profile'}</button>
      </div>
    </section>

    <h3 class="group-title">Practice</h3>
    <section class="card settings">
      ${row('Direction', 'Which side you see first', segmented('direction', directionOptions(app.pairNames()), s.direction))}
      ${row('Accents', s.strictAccents ? 'A missing accent counts as wrong' : 'A missing accent still counts, with a reminder', segmented('accents', [
        { value: 'lenient', label: 'Lenient' },
        { value: 'strict', label: 'Strict' },
      ], s.strictAccents ? 'strict' : 'lenient'))}
      ${row('Session length', 'Words per daily session', segmented('length', [
        { value: '10', label: '10' },
        { value: '20', label: '20' },
        { value: '30', label: '30' },
      ], String(s.sessionLength)))}
    </section>

    <h3 class="group-title">Appearance</h3>
    <section class="card settings">
      ${row('Theme', null, segmented('theme', [
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ], s.theme))}
    </section>

    <h3 class="group-title">Data</h3>
    <section class="card settings">
      ${row('Word library', `${plural(app.languages().length, 'language')} · ${plural(decks.length, 'deck')} · ${plural(wordCount, 'word')}`,
        html`<a class="btn btn-secondary btn-sm" href="#/import">${icon('upload')}Import</a>`)}
      ${row('Back up progress', backupHint(s.lastBackup), html`<div class="setting-buttons"><button class="btn btn-primary btn-sm" data-backup>${icon('download')}Back up</button><button class="btn btn-secondary btn-sm" data-restore>${icon('upload')}Restore</button></div>`)}
    </section>

    <h3 class="group-title">About</h3>
    <section class="card settings">
      ${row(`Vocab 2 · version ${app.version}`, 'If this is older than your latest push, check for updates', html`<button class="btn btn-secondary btn-sm" data-update>${icon('refresh')}Check for updates</button>`)}
    </section>`;

  return {
    title: 'Settings',
    body,
    mount(root) {
      onSegmented(root, (name, value) => {
        if (name === 'direction') s.direction = value;
        if (name === 'accents') s.strictAccents = value === 'strict';
        if (name === 'length') s.sessionLength = Number(value);
        if (name === 'theme') s.theme = value;
        store.save('settings');
        if (name === 'theme') applyTheme();
        if (name === 'accents') app.render();
      });
      root.querySelector('[data-backup]').addEventListener('click', () => {
        downloadBackup(app);
        app.render();
      });
      root.querySelector('[data-restore]').addEventListener('click', () => pickBackupFile(app));
      root.querySelector('[data-update]').addEventListener('click', () => checkForUpdates(app));
      root.querySelector('[data-switch]').addEventListener('click', () => app.switchAccount());
    },
  };
}
