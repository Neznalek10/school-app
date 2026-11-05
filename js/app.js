/**
 * App shell: routing, navigation chrome, toasts, sheets and the shared `app` object every view receives.
 *
 * Responsibility: maps `#/<route>/<id>` hashes to view functions (ROUTES), renders the top bar, view and
 * tab bar, and offers app.go, app.toast, app.sheet, app.confirm and note/subject lookups to the views.
 * Fits in: loaded by index.html as the only entry module; imports the routed views from js/views/ and the store.
 * Invariants: a malformed or unknown hash falls back to home; with no signed-in account only the
 * accounts route renders.
 */
import { store, uid } from './store.js';
import { html, icon, applyTheme } from './ui.js';
import { accountsView } from './views/accounts.js';
import { homeView } from './views/home.js';
import { subjectView } from './views/subject.js';
import { noteView } from './views/note.js';
import { notesView } from './views/notes.js';
import { chatView } from './views/chat.js';
import { accountView } from './views/account.js';
import { tasksView, taskView } from './views/tasks.js';
import { lessonView, newLessonView } from './views/lessons.js';
import { studyView } from './views/study.js';
import { promptsView } from './views/prompts.js';
import { chemView, chemQuizView } from './views/chem.js';
import { exerciseView } from './views/exercises.js';
import { setupView } from './views/setup.js';
import { syncState, onSyncChange, dismissConflictNotice } from './sync/engine.js';
import { announceUpdate, watchForUpdates } from './update.js';

const ROUTES = {
  accounts: accountsView,
  home: homeView,
  subject: subjectView,
  note: noteView,
  notes: notesView,
  chat: chatView,
  tests: tasksView,
  task: taskView,
  lesson: lessonView,
  newlesson: newLessonView,
  study: studyView,
  prompts: promptsView,
  chem: chemView,
  chemquiz: chemQuizView,
  exercise: exerciseView,
  account: accountView,
  setup: setupView,
};
const TABS = [
  { route: 'home', label: 'Home', icon: 'home' },
  { route: 'tests', label: 'Tests', icon: 'clipboard' },
  { route: 'notes', label: 'Notes', icon: 'notes' },
  { route: 'account', label: 'Account', icon: 'user' },
];

const $ = sel => document.querySelector(sel);

export const app = {
  version: self.APP_VERSION || 'dev',
  pending: {},
  ui: { subjectTab: {}, lessonDraft: {} },
  study: null,

  subject(id) {
    return store.subjects.find(s => s.id === id);
  },
  notesOf(subjectId) {
    return store.notes.filter(n => n.subjectId === subjectId);
  },
  note(id) {
    return store.notes.find(n => n.id === id);
  },
  lesson(id) {
    return store.lessons.find(l => l.id === id);
  },

  newNote(subjectId, { title = '', body = '' } = {}) {
    const now = Date.now();
    const note = { id: uid('n'), subjectId, title, body, created: now, updated: now };
    store.notes.unshift(note);
    store.save('notes');
    return note;
  },

  refreshSide() {
    renderSide();
  },

  go(path, { replace = false } = {}) {
    const hash = `#/${path}`;
    if (location.hash === hash) return this.render();
    if (!replace) return void (location.hash = hash);
    history.replaceState(null, '', hash);
    this.render();
  },

  signIn(id) {
    if (!store.useAccount(id)) return this.go('accounts', { replace: true });
    applyTheme();
    renderSide();
    const route = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    if (!route || route === 'accounts') this.go('home', { replace: true });
    else this.render();
  },

  switchAccount() {
    store.signOut();
    applyTheme();
    renderSide();
    this.go('accounts');
  },

  toast(message, { kind = 'info', duration = 3200 } = {}) {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.setAttribute('role', 'status');
    el.innerHTML = html`${icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info')}<span>${message}</span>`.s;
    root.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  sheet({ title, body, onMount, onClose }) {
    const root = $('#overlay-root');
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = html`<div class="sheet-backdrop" data-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="sheet-handle"></div>
        <header class="sheet-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
        <div class="sheet-body">${body}</div>
      </div>`.s;
    root.append(wrap);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      onClose?.();
      wrap.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 250);
    };
    const onKey = e => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => e.target.closest('[data-close]') && close());
    requestAnimationFrame(() => wrap.classList.add('open'));
    onMount?.(wrap.querySelector('.sheet-body'), close);
    return close;
  },

  confirm({ title, text, confirmLabel, danger = false }) {
    return new Promise(resolve => {
      let answer = false;
      this.sheet({
        title,
        body: html`<p class="sheet-text">${text}</p>
          <div class="sheet-actions">
            <button class="btn btn-secondary" data-close>Cancel</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${confirmLabel}</button>
          </div>`,
        onMount: (body, close) => body.querySelector('[data-yes]').addEventListener('click', () => {
          answer = true;
          close();
        }),
        onClose: () => resolve(answer),
      });
    });
  },

  /**
   * Renders the view for the current location.hash into the top bar and #view.
   *
   * Side effects: runs the previous view's `leave`, may redirect (unknown subject, malformed hash, no
   * account) via history.replaceState or app.go, toggles focus mode, highlights the active tab and
   * scrolls to the top when the path (not just the query) changed.
   *
   * @returns {void}
   */
  render() {
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const [name, ...rest] = path.split('/');
    // hasOwn: names like "constructor" or "toString" must not count as routes.
    let route = Object.hasOwn(ROUTES, name) ? name : 'home';
    if (!store.account && route !== 'accounts') {
      route = 'accounts';
      history.replaceState(null, '', '#/accounts');
    }
    const params = Object.fromEntries(new URLSearchParams(query));
    // A hand-edited or truncated link (for example "%E0%A4%A") cannot be decoded: go home instead of crashing.
    try {
      if (rest.length) params.id = decodeURIComponent(rest[0]);
      if (rest.length > 1) params.sub = decodeURIComponent(rest.slice(1).join('/'));
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      return this.go('home', { replace: true });
    }

    this.leave?.();
    this.leave = null;
    const view = ROUTES[route](this, params);
    if (view.redirect) return this.go(view.redirect, { replace: true });

    document.body.classList.toggle('is-focus', !!view.focus);
    $('#topbar').innerHTML = html`
      ${view.back ? html`<a class="icon-btn back" href="#/${view.back}" aria-label="Back">${icon('back')}</a>` : ''}
      <h1 class="topbar-title">${view.title || ''}</h1>
      ${view.action || ''}`.s;
    const container = document.createElement('div');
    container.className = `view view-${route}`;
    container.innerHTML = view.body.s;
    $('#view').replaceChildren(container);
    view.mount?.(container, $('#topbar'));
    this.leave = view.leave || null;

    const tab = view.tab || route;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === tab));
    document.querySelectorAll('.side-subject').forEach(a => a.classList.toggle('active', route === 'subject' && a.dataset.id === params.id));
    // Picking a day or a tab only changes the query, so the page stays where you were.
    if (this.lastPath !== path) window.scrollTo(0, 0);
    this.lastPath = path;
  },
};

// On a wide screen the sidebar also lists the subjects.
function renderSide() {
  const list = $('#side-subjects');
  if (!list) return;
  list.innerHTML = store.account ? html`<div class="side-title">Subjects</div>${store.subjects.map(s => html`
    <a class="side-subject" data-id="${s.id}" href="#/subject/${encodeURIComponent(s.id)}"><span class="dot c-${s.color}"></span><span>${s.name}</span></a>`)}`.s : '';
}

function renderShell() {
  $('#tabbar').innerHTML = html`
    <div class="brand"><span class="brand-mark">${icon('learn')}</span><span>School</span></div>
    ${TABS.map(t => html`<a class="tab" href="#/${t.route}" data-route="${t.route}">${icon(t.icon)}<span>${t.label}</span></a>`)}
    <nav class="side-subjects" id="side-subjects" aria-label="Subjects"></nav>
    <div class="brand-version">v${app.version}</div>`.s;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  announceUpdate(sessionStorage, app.version, message => app.toast(message, { kind: 'success' }));
  watchForUpdates({
    sw: navigator.serviceWorker,
    doc: document,
    session: sessionStorage,
    version: app.version,
    reload: () => location.reload(),
  });
}

/** How long the conflict notice stays on screen, in milliseconds (longer than a normal toast). */
const CONFLICT_TOAST_MS = 9000;

/**
 * Tells the user once when this tab's changes lost against a newer data file and were stored in
 * data/conflicts/. Checks now and again on every sync change, since the engine may start after the app.
 *
 * @returns {void}
 */
function watchConflictNotice() {
  const check = () => {
    if (!syncState.conflictSaved) return;
    // Dismissed first, so the listener this triggers cannot show the toast a second time.
    dismissConflictNotice();
    app.toast(
      'This page had older changes than the data file. They were saved in data/conflicts/ and the newer data was loaded.',
      { kind: 'info', duration: CONFLICT_TOAST_MS },
    );
  };
  onSyncChange(check);
  check();
}

function start() {
  applyTheme();
  renderShell();
  registerServiceWorker();
  watchConflictNotice();
  navigator.storage?.persist?.().catch(() => {});
  window.addEventListener('hashchange', () => app.render());
  const last = store.lastAccount();
  if (last && store.accounts.some(a => a.id === last)) return app.signIn(last);
  app.go('accounts', { replace: true });
}

start();
