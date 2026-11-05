import { store } from '../store.js';
import { summarize } from '../srs.js';
import { langName, slug, deckFile, resetStats } from '../data.js';
import { html, icon, pct, plural, masteryBar, masteryLegend, wordRow, emptyState } from '../ui.js';
import { openPracticeSheet } from './practice.js';
import { download } from './backup-ui.js';

export function noDecks(app) {
  const lang = app?.lang;
  return emptyState({
    iconName: 'upload',
    title: lang ? `No ${langName(lang)} words yet` : 'No words yet',
    text: 'Import your vocabulary as JSON, CSV or a pasted list. Every word starts at 0 and levels up as you practise.',
    action: html`<a class="btn btn-primary" href="#/import">${icon('upload')}Import words</a>`,
  });
}

export const deckHref = d => `#/deck/${encodeURIComponent(d.id)}`;

export function deckRow(d) {
  const s = summarize(d.words, store.progress);
  return html`<a class="deck-row" href="${deckHref(d)}">
    <div class="deck-row-main">
      <div class="deck-row-title">${d.title}</div>
      <div class="deck-row-meta">${langName(d.from)} → ${langName(d.lang)} · ${plural(s.total, 'word')} · ${pct(s.levels.mastered, s.total)}% mastered${s.due ? html` · <span class="due">${s.due} due</span>` : ''}</div>
      ${masteryBar(s.levels, { thin: true })}
    </div>
    ${icon('chevronRight', 'chevron')}
  </a>`;
}

export function decksView(app) {
  const decks = app.decksFor();
  if (!decks.length) return { title: 'Decks', body: noDecks(app) };
  const words = decks.reduce((n, d) => n + d.words.length, 0);

  const body = html`
    <div class="toolbar">
      <p class="muted toolbar-text">${plural(decks.length, 'deck')} · ${plural(words, 'word')}</p>
      <a class="btn btn-secondary btn-sm" href="#/import">${icon('upload')}Import</a>
    </div>
    <div class="card deck-list">${[...decks].sort((a, b) => a.title.localeCompare(b.title)).map(deckRow)}</div>
    <button class="btn btn-primary btn-block btn-lg decks-all" data-all>${icon('play')}Practise all ${langName(app.lang)} decks</button>`;

  return {
    title: 'Decks',
    body,
    mount(root) {
      root.querySelector('[data-all]').addEventListener('click', () => openPracticeSheet(app, { decks, title: `All ${langName(app.lang)}` }));
    },
  };
}

function exportSheet(app, deck) {
  const fileText = withStats => {
    const data = deckFile(deck, store.progress, { withStats });
    const lines = data.words.map(w => `    ${JSON.stringify(w)}`).join(',\n');
    const head = Object.entries(data).filter(([k]) => k !== 'words').map(([k, v]) => `  "${k}": ${JSON.stringify(v)},`).join('\n');
    return `{\n${head}\n  "words": [\n${lines}\n  ]\n}\n`;
  };
  app.sheet({
    title: 'Download deck',
    body: html`<p class="sheet-text">A JSON file you can import again here, on another device or into another profile.</p>
      <div class="sheet-stack">
        <button class="btn btn-primary btn-block" data-file="plain">${icon('download')}Words only</button>
        <button class="btn btn-secondary btn-block" data-file="stats">${icon('download')}Words with my stats</button>
      </div>`,
    onMount: (body, close) => body.addEventListener('click', e => {
      const btn = e.target.closest('[data-file]');
      if (!btn) return;
      const withStats = btn.dataset.file === 'stats';
      download(`${slug(deck.title)}${withStats ? '-stats' : ''}.json`, fileText(withStats));
      close();
    }),
  });
}

export function deckView(app, { id }) {
  const deck = app.deck(id);
  if (!deck) return { redirect: 'decks' };
  const s = summarize(deck.words, store.progress);
  const practised = s.total - s.levels.new;

  const body = html`
    <section class="card deck-head">
      <div class="eyebrow">${langName(deck.from)} → ${langName(deck.lang)}</div>
      <div class="deck-stats">
        <div><strong>${s.total}</strong><span>words</span></div>
        <div><strong>${pct(s.levels.mastered, s.total)}%</strong><span>mastered</span></div>
        <div><strong>${s.due}</strong><span>due now</span></div>
      </div>
      ${masteryBar(s.levels)}
      ${masteryLegend(s.levels)}
      <button class="btn btn-primary btn-block" data-practice>${icon('play')}Practise this deck</button>
      <div class="deck-actions">
        <a class="btn btn-secondary" href="#/import?deck=${encodeURIComponent(deck.id)}">${icon('plus')}Add words</a>
        <button class="btn btn-secondary" data-download>${icon('download')}Download</button>
        <button class="btn btn-secondary" data-reset ${practised ? '' : 'disabled'}>${icon('refresh')}Stats to 0</button>
        <button class="btn btn-ghost-danger" data-delete>${icon('trash')}Delete</button>
      </div>
    </section>
    <section class="card">
      <header class="card-head"><h2>Words</h2><span class="card-meta">Correct in a row · right / wrong</span></header>
      <div class="word-list">${deck.words.map(w => wordRow(w, store.progress[w.id]))}</div>
    </section>`;

  return {
    title: deck.title,
    back: 'decks',
    tab: 'decks',
    hideLang: true,
    body,
    mount(root) {
      root.querySelector('[data-practice]').addEventListener('click', () => openPracticeSheet(app, { decks: [deck], title: deck.title }));
      root.querySelector('[data-download]').addEventListener('click', () => exportSheet(app, deck));
      root.querySelector('[data-reset]').addEventListener('click', async () => {
        const ok = await app.confirm({
          title: 'Set every stat to 0?',
          text: `All ${plural(s.total, 'word')} in "${deck.title}" go back to New with no right or wrong answers. Your daily activity history stays. This can't be undone.`,
          confirmLabel: 'Set to 0',
          danger: true,
        });
        if (!ok) return;
        const n = resetStats(deck, store.progress);
        store.save('progress');
        app.toast(`${plural(n, 'word')} set back to 0.`, { kind: 'success' });
        app.render();
      });
      root.querySelector('[data-delete]').addEventListener('click', async () => {
        const ok = await app.confirm({
          title: 'Delete this deck?',
          text: `"${deck.title}" and its stats will be removed from this device. This can't be undone.`,
          confirmLabel: 'Delete deck',
          danger: true,
        });
        if (!ok) return;
        resetStats(deck, store.progress);
        store.decks = store.decks.filter(d => d.id !== deck.id);
        store.save('decks');
        store.save('progress');
        app.reload();
        app.toast(`Deleted "${deck.title}"`, { kind: 'success' });
        app.go('decks');
      });
    },
  };
}
