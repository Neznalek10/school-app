import { store } from '../store.js';
import { html, icon } from '../ui.js';
import { pickBackupFile } from './backup-ui.js';

export const avatar = (name, cls = '') => html`<span class="avatar ${cls}" aria-hidden="true">${[...name][0].toUpperCase()}</span>`;

const restoreButton = () => html`<button type="button" class="btn btn-text btn-block" data-restore>Restore from a backup file</button>`;

function nameForm(submitLabel, { cancel = false } = {}) {
  return html`<form class="account-form" novalidate>
    <label class="field-label" for="account-name">Your name</label>
    <input class="input input-lg" id="account-name" name="name" maxlength="24" autocomplete="off" placeholder="e.g. User" required>
    <p class="form-error" hidden></p>
    <button class="btn btn-primary btn-block btn-lg" type="submit">${submitLabel}</button>
    ${cancel ? html`<button class="btn btn-text btn-block" type="button" data-cancel>Cancel</button>` : ''}
  </form>`;
}

function welcome() {
  return html`
    <h1>Welcome to School</h1>
    <p class="accounts-sub">One place for every subject.</p>
    <ol class="steps">
      <li><span><strong>Create your account</strong>Just a name. Everything is saved under it on this device.</span></li>
      <li><span><strong>Keep notes per subject</strong>Languages is ready. Add your own subjects, or start from a kit such as Maths or Chemistry.</span></li>
      <li><span><strong>Learn with AI and the language apps</strong>Tutors that know your notes, plus French and English practice.</span></li>
    </ol>
    ${nameForm(html`Create account${icon('chevronRight')}`)}
    ${restoreButton()}`;
}

function picker() {
  return html`
    <h1>Who's studying?</h1>
    <p class="accounts-sub">Choose your account</p>
    <div class="account-list">${store.accounts.map(a => html`
      <button class="account" data-id="${a.id}">${avatar(a.name)}<span class="account-name">${a.name}</span>${icon('chevronRight', 'chevron')}</button>`)}
    </div>
    <button class="btn btn-secondary btn-block account-add" data-add>${icon('plus')}Add account</button>
    <div class="account-new" hidden>${nameForm('Create account', { cancel: true })}</div>
    ${restoreButton()}`;
}

export function accountsView(app) {
  const body = html`<div class="accounts">
    <div class="accounts-mark">${icon('learn')}</div>
    ${store.accounts.length ? picker() : welcome()}
    <footer class="version-footer">School v${app.version}</footer>
  </div>`;

  return {
    focus: true,
    body,
    mount(root) {
      root.querySelector('[data-restore]').addEventListener('click', () => pickBackupFile(app));
      root.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => app.signIn(btn.dataset.id)));

      const form = root.querySelector('.account-form');
      const input = form.querySelector('input');
      const error = form.querySelector('.form-error');
      const showError = text => {
        error.textContent = text;
        error.hidden = false;
        input.focus();
      };
      input.addEventListener('input', () => { error.hidden = true; });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const name = input.value.trim().replace(/\s+/g, ' ');
        if (!name) return showError('Enter a name to continue.');
        if (store.nameTaken(name)) return showError(`There is already an account called ${name}.`);
        app.signIn(store.createAccount(name).id);
      });

      const add = root.querySelector('[data-add]');
      const panel = root.querySelector('.account-new');
      add?.addEventListener('click', () => {
        add.hidden = true;
        panel.hidden = false;
        input.focus();
      });
      root.querySelector('[data-cancel]')?.addEventListener('click', () => {
        panel.hidden = true;
        add.hidden = false;
        input.value = '';
        error.hidden = true;
      });
      if (!store.accounts.length) input.focus({ preventScroll: true });
    },
  };
}
