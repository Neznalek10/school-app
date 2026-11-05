import { store, streak, lastDays } from '../store.js';
import { summarize } from '../srs.js';
import { html, icon, fmt, pct, plural, masteryBar, masteryLegend, answersText } from '../ui.js';
import { noDecks, deckHref } from './decks.js';

const niceMax = n => {
  if (n <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 2.5, 5, 10].map(m => m * step).find(v => v >= n);
};

const dateLabel = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// items: { value, tip, x }. One series, so no legend; the card title names it.
function barChart(items, max, ticks = [max, max / 2, 0]) {
  const cols = items.map((it, i) => html`<button class="col" data-i="${i}" aria-label="${it.tip}" data-tip="${it.tip}">
      <span class="col-bar" style="height:${(it.value / max) * 100}%"></span>
    </button>`);
  return html`<div class="chart">
    <div class="chart-body">
      <div class="chart-y">${ticks.map(t => html`<span>${fmt(t)}</span>`)}</div>
      <div class="chart-plot">
        <div class="chart-grid">${ticks.map(() => html`<i></i>`)}</div>
        <div class="chart-cols">${cols}</div>
        <div class="chart-tip" hidden></div>
      </div>
    </div>
    <div class="chart-x">${items.map((it, i) => html`<span class="${i === items.length - 1 ? 'today' : ''}">${it.x}</span>`)}</div>
  </div>`;
}

function activityChart(days) {
  const max = niceMax(Math.max(...days.map(d => d.answers)));
  return barChart(days.map(d => ({
    value: d.answers,
    tip: `${dateLabel(d.date)}: ${plural(d.answers, 'answer')}${d.answers ? `, ${pct(d.correct, d.answers)}% correct` : ''}`,
    x: d.date.getDate(),
  })), max);
}

export function statsView(app) {
  const decks = app.decksFor();
  if (!decks.length) return { title: 'Stats', body: noDecks(app) };

  const words = app.wordsOf(decks);
  const s = summarize(words, store.progress);
  const answered = s.right + s.wrong;
  const days = lastDays(14, app.lang);
  const recent = days.reduce((n, d) => n + d.answers, 0);

  const hardest = words
    .map(w => ({ w, p: store.progress[w.id] }))
    .filter(({ p }) => p?.wrong)
    .sort((a, b) => b.p.wrong - a.p.wrong || pct(a.p.right, a.p.right + a.p.wrong) - pct(b.p.right, b.p.right + b.p.wrong))
    .slice(0, 8);

  const body = html`
    <section class="tiles tiles-4">
      <div class="tile"><div class="tile-label">${icon('flame')}Streak</div><div class="tile-value">${plural(streak(), 'day')}</div></div>
      <div class="tile"><div class="tile-label">${icon('bolt')}Answers</div><div class="tile-value">${fmt(answered)}</div></div>
      <div class="tile"><div class="tile-label">${icon('target')}Accuracy</div><div class="tile-value">${answered ? `${pct(s.right, answered)}%` : '–'}</div></div>
      <div class="tile"><div class="tile-label">${icon('trophy')}Mastered</div><div class="tile-value">${fmt(s.levels.mastered)}<small> / ${fmt(s.total)}</small></div></div>
    </section>

    <section class="card">
      <header class="card-head"><h2>Answers per day</h2><span class="card-meta">Last 14 days · ${fmt(recent)} total</span></header>
      ${activityChart(days)}
    </section>

    <section class="card">
      <header class="card-head"><h2>Mastery</h2><span class="card-meta">${plural(s.total, 'word')}</span></header>
      ${masteryBar(s.levels)}
      ${masteryLegend(s.levels, { links: true })}
    </section>

    <section class="card">
      <header class="card-head"><h2>By deck</h2></header>
      <table class="deck-table">
        <thead><tr><th>Deck</th><th>Mastered</th><th>Accuracy</th></tr></thead>
        <tbody>${decks.map(d => {
          const ds = summarize(d.words, store.progress);
          const n = ds.right + ds.wrong;
          return html`<tr>
            <td><a href="${deckHref(d)}">${d.title}</a>${masteryBar(ds.levels, { thin: true })}</td>
            <td>${pct(ds.levels.mastered, ds.total)}%</td>
            <td>${n ? `${pct(ds.right, n)}%` : '–'}</td>
          </tr>`;
        })}</tbody>
      </table>
    </section>

    <section class="card">
      <header class="card-head"><h2>Hardest words</h2><span class="card-meta">Most mistakes</span></header>
      ${hardest.length
        ? html`<div class="word-list">${hardest.map(({ w, p }) => html`<div class="word-row">
            <div class="word-main"><div class="word-q">${w.q}</div><div class="word-a" lang="${w.deck.lang}">${answersText(w.a)}</div></div>
            <div class="word-side"><span class="score-ko">${icon('x')}${p.wrong}</span><span class="muted small">${pct(p.right, p.right + p.wrong)}% right</span></div>
          </div>`)}</div>
          <button class="btn btn-secondary btn-block" data-hardest>${icon('repeat')}Practise these</button>`
        : html`<p class="muted">No mistakes recorded yet.</p>`}
    </section>`;

  return {
    title: 'Stats',
    body,
    mount(root) {
      root.querySelectorAll('.chart-plot').forEach(plot => {
        const tip = plot.querySelector('.chart-tip');
        const show = col => {
          const box = col.getBoundingClientRect();
          const area = plot.getBoundingClientRect();
          tip.textContent = col.dataset.tip;
          tip.hidden = false;
          const x = box.left - area.left + box.width / 2;
          tip.style.left = `${Math.min(Math.max(x, tip.offsetWidth / 2), area.width - tip.offsetWidth / 2)}px`;
          plot.querySelectorAll('.col').forEach(c => c.classList.toggle('active', c === col));
        };
        const hide = () => {
          tip.hidden = true;
          plot.querySelectorAll('.col.active').forEach(c => c.classList.remove('active'));
        };
        plot.querySelectorAll('.col').forEach(col => {
          col.addEventListener('pointerenter', () => show(col));
          col.addEventListener('focus', () => show(col));
          col.addEventListener('click', () => show(col));
        });
        plot.addEventListener('pointerleave', hide);
      });
      root.querySelector('[data-hardest]')?.addEventListener('click', () => {
        app.startSession({ words: hardest.map(h => h.w), decks, title: 'Hardest words' });
      });
    },
  };
}
