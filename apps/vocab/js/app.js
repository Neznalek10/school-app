import { store } from './store.js';
import { buildLibrary, langName, langFlag } from './data.js';
import { summarize, pickSession } from './srs.js';
import { html, icon, plural, pct, applyTheme } from './ui.js';
import { embedParams } from './embed.js';
import { homeView } from './views/home.js';
import { decksView, deckView } from './views/decks.js';
import { wordsView } from './views/words.js';
import { statsView } from './views/stats.js';
import { settingsView } from './views/settings.js';
import { importView } from './views/import.js';
import { practiceView } from './views/practice.js';
import { accountsView } from './views/accounts.js';

const ROUTES = {
  home: homeView,
  decks: decksView,
  deck: deckView,
  words: wordsView,
  stats: statsView,
  settings: settingsView,
  import: importView,
  practice: practiceView,
  accounts: accountsView,
};
const TABS = [
  { route: 'home', label: 'Home', icon: 'home' },
  { route: 'decks', label: 'Decks', icon: 'decks' },
  { route: 'words', label: 'Words', icon: 'words' },
  { route: 'stats', label: 'Stats', icon: 'stats' },
  { route: 'settings', label: 'Settings', icon: 'settings' },
];

const $ = sel => document.querySelector(sel);

export const app = {
  version: self.APP_VERSION || 'dev',
  embed: embedParams(location.search, location.href),
  decks: [],
  session: null,

  languages() {
    const codes = [...new Set(this.decks.map(d => d.lang))];
    return codes.sort((a, b) => langName(a).localeCompare(langName(b)));
  },
  get lang() {
    return store.lang;
  },
  setLang(code) {
    store.lang = code;
    store.save('lang');
    this.render();
  },
  decksFor(lang = this.lang) {
    return this.decks.filter(d => d.lang === lang);
  },
  wordsOf(decks) {
    return decks.flatMap(d => d.words);
  },
  deck(id) {
    return this.decks.find(d => d.id === id);
  },
  // "Czech → English" when every deck of the language shares one source language.
  pairNames(lang = this.lang) {
    const froms = [...new Set(this.decksFor(lang).map(d => d.from))];
    return { from: froms.length === 1 ? langName(froms[0]) : 'Your language', to: lang ? langName(lang) : 'Target' };
  },

  go(path, { replace = false } = {}) {
    const hash = `#/${path}`;
    if (location.hash === hash) return this.render();
    if (!replace) return void (location.hash = hash);
    history.replaceState(null, '', hash);
    this.render();
  },

  reload() {
    const { decks, errors } = buildLibrary(store.decks);
    this.decks = decks;
    if (errors.length) this.toast(errors.join('; '), { kind: 'error', duration: 8000 });
    const langs = this.languages();
    // A language opened from the dashboard stays selected even before it has any words.
    const pinned = store.lang && store.lang === this.embed.lang;
    if (!pinned && !langs.includes(store.lang)) {
      store.lang = langs[0] || this.embed.lang || null;
      store.save('lang');
    }
  },

  signIn(id) {
    store.useAccount(id);
    if (this.embed.lang && this.embed.profile?.id === id) {
      store.lang = this.embed.lang;
      store.save('lang');
    }
    applyTheme();
    this.reload();
    this.go('home', { replace: true });
  },

  switchAccount() {
    if (this.embed.home) return void location.assign(this.embed.home);
    store.signOut();
    this.session = null;
    applyTheme();
    this.go('accounts');
  },

  startSession({ decks, pool, mode = 'smart', count = store.settings.sessionLength, title, words }) {
    const picked = words || pickSession(pool || this.wordsOf(decks), store.progress, { mode, count });
    if (!picked.length) {
      this.toast('No words match this selection yet.');
      return;
    }
    const dir = store.settings.direction;
    this.session = {
      title,
      items: picked.map(word => ({ word, reverse: dir === 'reverse' || (dir === 'mixed' && Math.random() < 0.5) })),
      index: 0,
      results: [],
      restart: { decks, pool, mode, count, title },
      returnTo: location.hash.startsWith('#/practice') ? this.session?.returnTo : location.hash,
    };
    this.go('practice');
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

  languageSheet() {
    const rows = this.languages().map(code => {
      const s = summarize(this.wordsOf(this.decksFor(code)), store.progress);
      return html`<button class="lang-row ${code === this.lang ? 'active' : ''}" data-lang="${code}">
        <span class="flag">${langFlag(code)}</span>
        <span class="lang-row-main"><strong>${langName(code)}</strong><small>${plural(s.total, 'word')} · ${pct(s.levels.mastered, s.total)}% mastered</small></span>
        ${code === this.lang ? icon('check', 'accent') : ''}
      </button>`;
    });
    this.sheet({
      title: 'Language',
      body: html`<div class="lang-list">${rows}</div>
        <a class="btn btn-secondary btn-block" href="#/import" data-close>${icon('upload')}Import words in another language</a>`,
      onMount: (body, close) => body.addEventListener('click', e => {
        const row = e.target.closest('[data-lang]');
        if (!row) return;
        close();
        this.setLang(row.dataset.lang);
      }),
    });
  },

  render() {
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const [name, ...rest] = path.split('/');
    let route = ROUTES[name] ? name : 'home';
    if (!store.account && route !== 'accounts') {
      route = 'accounts';
      history.replaceState(null, '', '#/accounts');
    }
    const params = Object.fromEntries(new URLSearchParams(query));
    if (rest.length) params.id = decodeURIComponent(rest.join('/'));

    const view = ROUTES[route](this, params);
    if (view.redirect) return this.go(view.redirect);

    document.body.classList.toggle('is-focus', !!view.focus);
    $('#topbar').innerHTML = this.renderTopbar(view).s;
    const container = document.createElement('div');
    container.className = `view view-${route}`;
    container.innerHTML = view.body.s;
    $('#view').replaceChildren(container);
    view.mount?.(container);

    const tab = view.tab || route;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === tab));
    if (this.lastRoute !== location.hash) window.scrollTo(0, 0);
    this.lastRoute = location.hash;
  },

  renderTopbar(view) {
    if (view.focus) return html``;
    const lang = this.lang;
    return html`
      ${view.back ? html`<a class="icon-btn back" href="#/${view.back}" aria-label="Back">${icon('back')}</a>` : ''}
      <h1 class="topbar-title">${view.title}</h1>
      ${lang && !view.hideLang ? html`<button class="lang-pill" data-action="language" aria-label="Change language">
        <span class="flag">${langFlag(lang)}</span><span class="lang-pill-name">${langName(lang)}</span>${icon('chevronDown')}
      </button>` : ''}`;
  },
};

function renderShell() {
  const home = app.embed.home;
  $('#tabbar').innerHTML = html`
    <div class="brand"><span class="brand-mark">${icon('repeat')}</span><span>Vocab 2</span></div>
    ${home ? html`<a class="tab tab-school" href="${home}">${icon('school')}<span>School</span></a>` : ''}
    ${TABS.map(t => html`<a class="tab" href="#/${t.route}" data-route="${t.route}">${icon(t.icon)}<span>${t.label}</span></a>`)}
    <div class="brand-version">v${app.version}</div>`.s;
  $('#topbar').addEventListener('click', e => {
    if (e.target.closest('[data-action="language"]')) app.languageSheet();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}

function start() {
  applyTheme();
  renderShell();
  registerServiceWorker();
  navigator.storage?.persist?.().catch(() => {});
  window.addEventListener('hashchange', () => app.render());
  const { profile } = app.embed;
  if (profile) return app.signIn(store.ensureAccount(profile.id, profile.name).id);
  app.go('accounts', { replace: true });
}

start();
