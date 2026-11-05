/**
 * Názvosloví views: the Czech chemistry nomenclature and elements trainer (practice, quiz, theory, periodic table).
 *
 * Responsibility: the chem and chemquiz routes and the practice card shown on a subject that has the
 * 'nazvoslovi' tool. Progress lives in store.chem and is scheduled by srs.js.
 * Fits in: routed from js/app.js, card embedded by js/views/subject.js; content comes from nazvoslovi.js,
 * elements.js and chem-theory.js. UI text is Czech by design.
 * Invariant: the tool belongs to whichever subject hasTool(subject, 'nazvoslovi'), not to a fixed id.
 */
import { store } from '../store.js';
import { hasTool } from '../subjects.js';
import { html, raw, icon, segmented, onSegmented, masteryBar, levelDots, pct } from '../ui.js';
import { record, levelOf, summarize, pickSession, shuffle } from '../srs.js';
import { dayKey } from '../events.js';
import { check } from '../check.js';
import {
  CATEGORIES, GROUPS, LEVELS_CZ, COMPOUNDS, groupOf, compoundsIn, within, pickCompounds, directionOf,
  explain, checkItemFormula, checkName, cleanFormula, formulaHtml, itemFormula, splitCharge, ion,
} from '../nazvoslovi.js';
import { ELEMENTS, ELEMENT_SETS, CATEGORIES as KINDS, elementsIn, cellOf } from '../elements.js';
import { THEORY, theoryPage } from '../chem-theory.js';

// Názvosloví: a Czech nomenclature and elements trainer inside the Chemistry subject.

const LEVEL_CZ = { new: 'Nové', learning: 'Učím se', familiar: 'Skoro umím', mastered: 'Umím' };
const COUNTS = [5, 10, 15, 20, 30, 50];
const cz = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

function data() {
  store.chem.progress ??= {};
  store.chem.activity ??= {};
  store.chem.last ??= {};
  return store.chem;
}

function streakDays(activity, now = new Date()) {
  const day = new Date(now);
  if (!activity[dayKey(day)]) day.setDate(day.getDate() - 1);
  let n = 0;
  while (activity[dayKey(day)]) {
    n++;
    day.setDate(day.getDate() - 1);
  }
  return n;
}

export function chemStats() {
  const d = data();
  return {
    today: d.activity[dayKey(new Date())] || 0,
    mastered: Object.values(d.progress).filter(p => levelOf(p) === 'mastered').length,
    streak: streakDays(d.activity),
    started: Object.keys(d.progress).length > 0,
  };
}

const statsLine = s => (s.started
  ? `Dnes ${cz(s.today, 'odpověď', 'odpovědi', 'odpovědí')} · umíš ${s.mastered}${s.streak ? ` · série ${cz(s.streak, 'den', 'dny', 'dní')}` : ''}`
  : 'Ještě jsi nezačal(a)');

export function chemPracticeCard() {
  return html`<div class="app-grid"><a class="app-card" href="#/chem">
    <span class="app-flag">🧪</span>
    <span class="app-main"><strong>Názvosloví a prvky</strong><small>Vzorce a názvy sloučenin, chemické prvky, teorie a periodická tabulka</small><small class="app-stats">${statsLine(chemStats())}</small></span>
    ${icon('chevronRight', 'chevron')}
  </a></div>`;
}

/**
 * Route of the page the Back button returns to.
 *
 * @returns {string} The practice tab of the first subject that has the Názvosloví tool (Chemistry, or any subject set up with it), else 'home'.
 */
const backToSubject = () => {
  const owner = store.subjects.find(s => hasTool(s, 'nazvoslovi'));
  return owner ? `subject/${encodeURIComponent(owner.id)}?tab=practice` : 'home';
};

function mistakes() {
  const p = data().progress;
  return [
    ...COMPOUNDS.filter(c => p[c.id] && !p[c.id].lastOk).map(item => ({ item, dir: directionOf('mix') })),
    ...ELEMENTS.filter(e => p[`e:${e.symbol}`] && !p[`e:${e.symbol}`].lastOk).map(el => ({ el, dir: Math.random() < 0.5 ? 'sn' : 'ns' })),
  ];
}

function homeBody() {
  const d = data();
  const s = chemStats();
  const wrong = mistakes();
  const levels = list => summarize(list, d.progress).levels;
  const allElements = ELEMENTS.map(e => ({ id: `e:${e.symbol}` }));
  return html`
    <section class="card chem-intro">
      <p>Procvičuj vzorce a názvy anorganických sloučenin a chemické prvky, podobně jako na nazvoslovi.cz. Ke každé odpovědi dostaneš postup, jak se k ní dojít. Co ti nejde, se ti vrací častěji.</p>
      <p class="chem-intro-stats">${statsLine(s)}</p>
    </section>
    <h3 class="group-title">Procvičování</h3>
    <div class="app-grid">
      <a class="app-card" href="#/chem/slouceniny"><span class="app-flag">⚗️</span>
        <span class="app-main"><strong>Sloučeniny</strong><small>Název → vzorec a vzorec → název, ${CATEGORIES.length} skupin a ${GROUPS.length} podskupin, úroveň ZŠ, SŠ i VŠ</small></span>${icon('chevronRight', 'chevron')}</a>
      <a class="app-card" href="#/chem/prvky"><span class="app-flag">🔬</span>
        <span class="app-main"><strong>Prvky</strong><small>Značka ↔ název a poloha v periodické tabulce</small></span>${icon('chevronRight', 'chevron')}</a>
      ${wrong.length ? html`<button class="app-card app-card-btn" data-mistakes><span class="app-flag">🔁</span>
        <span class="app-main"><strong>Opakovat chyby</strong><small>${cz(wrong.length, 'otázka, kterou jsi naposledy nevěděl(a)', 'otázky, které jsi naposledy nevěděl(a)', 'otázek, které jsi naposledy nevěděl(a)')}</small></span>${icon('chevronRight', 'chevron')}</button>` : ''}
    </div>
    <h3 class="group-title">Začni tady</h3>
    <div class="card note-list">
      ${['zaklady', 'rozliseni'].map(id => theoryPage(id)).map(t => html`<a class="note-row" href="#/chem/teorie/${t.id}"><span class="assistant-icon">${icon('book')}</span>
        <span class="note-row-main"><strong>${t.title}</strong><small>${t.sub}</small></span>${icon('chevronRight', 'chevron')}</a>`)}
    </div>
    <h3 class="group-title">Skupiny sloučenin <span>teorie a jak ti to jde</span></h3>
    <div class="card note-list chem-progress">
      ${CATEGORIES.map(c => {
        const list = compoundsIn('v', c.subs.map(([id]) => id));
        const l = levels(list);
        const page = theoryPage(c.id);
        return html`<a class="note-row" href="#/chem/teorie/${c.id}">
          <span class="note-row-main"><strong>${c.label}</strong><small>${c.subs.length > 1 ? page.sub : `${list.length} sloučenin`} · umíš ${l.mastered} z ${list.length}</small>${masteryBar(l, { thin: true })}</span>${icon('chevronRight', 'chevron')}</a>`;
      })}
    </div>
    <h3 class="group-title">Prvky</h3>
    <div class="card note-list">
      <a class="note-row" href="#/chem/teorie/prvky"><span class="assistant-icon">${icon('book')}</span>
        <span class="note-row-main"><strong>Prvky a periodická tabulka</strong><small>umíš ${levels(allElements).mastered} z ${ELEMENTS.length}</small>${masteryBar(levels(allElements), { thin: true })}</span>${icon('chevronRight', 'chevron')}</a>
      <a class="note-row" href="#/chem/psp"><span class="assistant-icon">${icon('atom')}</span>
        <span class="note-row-main"><strong>Periodická tabulka</strong><small>Všech 118 prvků, klepni na prvek pro podrobnosti</small></span>${icon('chevronRight', 'chevron')}</a>
    </div>`;
}

// ----- setup pages -----

const LEVEL_ORDER = ['z', 's', 'v'];

function compoundSetup(app, params) {
  const d = data();
  const saved = d.last.c || {};
  const wanted = params.groups ? params.groups.split(',').filter(groupOf) : null;
  const state = {
    level: wanted ? LEVEL_ORDER[Math.max(LEVEL_ORDER.indexOf(saved.level || 'z'), ...wanted.map(g => LEVEL_ORDER.indexOf(groupOf(g).level)))] : saved.level || 'z',
    dir: saved.dir || 'mix',
    count: saved.count || 10,
    groups: wanted || saved.groups?.filter(groupOf) || GROUPS.map(g => g.id),
  };
  const available = () => GROUPS.filter(g => within(state.level, g.level));
  const chosen = () => available().map(g => g.id).filter(id => state.groups.includes(id));
  const count = ids => compoundsIn(state.level, ids).length;
  const box = (attr, id, label, n, checked) => html`<label class="chem-check"><input type="checkbox" ${attr}="${id}" ${checked ? 'checked' : ''}><span>${label}</span><span class="chip-count">${n}</span></label>`;
  // Like nazvoslovi.cz: a category with one checkbox, its subcategories indented below.
  const tree = () => html`${CATEGORIES.map(c => {
    const subs = c.subs.map(([id]) => groupOf(id)).filter(g => within(state.level, g.level));
    if (!subs.length) return '';
    const ids = subs.map(g => g.id);
    return html`<div class="chem-cat">
      ${box('data-cat', c.id, c.label, count(ids), ids.every(id => state.groups.includes(id)))}
      ${c.subs.length > 1 ? html`<div class="chem-subs">${subs.map(g => box('data-group', g.id, g.label, count([g.id]), state.groups.includes(g.id)))}</div>` : ''}
    </div>`;
  })}`;
  return {
    title: 'Sloučeniny',
    back: 'chem',
    body: html`<form class="card chem-form" novalidate>
      <div class="field-label">Úroveň</div>
      ${segmented('level', Object.entries(LEVELS_CZ).map(([value, label]) => ({ value, label })), state.level)}
      <div class="field-label">Zadání</div>
      ${segmented('dir', [{ value: 'nf', label: 'Název → vzorec' }, { value: 'fn', label: 'Vzorec → název' }, { value: 'mix', label: 'Obojí' }], state.dir)}
      <div class="field-label">Počet otázek</div>
      ${segmented('count', COUNTS.map(n => ({ value: String(n), label: String(n) })), String(state.count))}
      <div class="field-label chem-groups-head"><span>Skupiny</span><span><button type="button" class="link-btn" data-all>Vybrat vše</button> · <button type="button" class="link-btn" data-none>Zrušit</button></span></div>
      <div class="chem-tree"></div>
      <p class="muted small chem-pool"></p>
      <button class="btn btn-primary btn-block btn-lg" type="submit">${icon('play')}Spustit test</button>
    </form>`,
    mount(root) {
      const redraw = () => {
        root.querySelector('.chem-tree').innerHTML = tree().s;
        root.querySelectorAll('[data-cat]').forEach(input => {
          const ids = categoryIds(input.dataset.cat);
          const some = ids.some(id => state.groups.includes(id));
          input.indeterminate = some && !input.checked;
        });
        const n = count(chosen());
        root.querySelector('.chem-pool').textContent = n ? `Vybráno ${cz(n, 'sloučenina', 'sloučeniny', 'sloučenin')}.` : 'Vyber aspoň jednu skupinu.';
      };
      const categoryIds = id => CATEGORIES.find(c => c.id === id).subs.map(([sub]) => sub).filter(sub => within(state.level, groupOf(sub).level));
      onSegmented(root, (name, value) => {
        state[name] = name === 'count' ? Number(value) : value;
        if (name === 'level') redraw();
      });
      root.querySelector('.chem-tree').addEventListener('change', e => {
        const input = e.target;
        const ids = input.dataset.cat ? categoryIds(input.dataset.cat) : [input.dataset.group];
        state.groups = input.checked ? [...new Set([...state.groups, ...ids])] : state.groups.filter(g => !ids.includes(g));
        redraw();
      });
      root.querySelector('[data-all]').addEventListener('click', () => {
        state.groups = GROUPS.map(g => g.id);
        redraw();
      });
      root.querySelector('[data-none]').addEventListener('click', () => {
        state.groups = [];
        redraw();
      });
      root.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        const groups = chosen();
        if (!groups.length) return app.toast('Vyber aspoň jednu skupinu.');
        d.last.c = { ...state, groups: state.groups };
        store.save('chem');
        const restart = () => pickCompounds(data().progress, { level: state.level, groups, count: state.count }).map(item => ({ item, dir: directionOf(state.dir) }));
        startChemQuiz(app, { questions: restart(), title: 'Sloučeniny', restart });
      });
      redraw();
    },
  };
}

const TASKS = [
  { value: 'sn', label: 'Značka → název' },
  { value: 'ns', label: 'Název → značka' },
  { value: 'mix', label: 'Obojí' },
  { value: 'pos', label: 'Poloha v tabulce' },
];

function elementSetup(app) {
  const d = data();
  const state = { set: 'zs', task: 'mix', count: 10, ...d.last.e };
  return {
    title: 'Prvky',
    back: 'chem',
    body: html`<form class="card chem-form" novalidate>
      <div class="field-label">Které prvky</div>
      ${segmented('set', Object.entries(ELEMENT_SETS).map(([value, s]) => ({ value, label: s.label })), state.set)}
      <p class="muted small chem-set-hint">${ELEMENT_SETS[state.set].hint}</p>
      <div class="field-label">Úkol</div>
      ${segmented('task', TASKS, state.task)}
      <div class="field-label">Počet otázek</div>
      ${segmented('count', COUNTS.map(n => ({ value: String(n), label: String(n) })), String(state.count))}
      <button class="btn btn-primary btn-block btn-lg chem-start" type="submit">${icon('play')}Spustit test</button>
    </form>`,
    mount(root) {
      onSegmented(root, (name, value) => {
        state[name] = name === 'count' ? Number(value) : value;
        if (name === 'set') root.querySelector('.chem-set-hint').textContent = ELEMENT_SETS[value].hint;
      });
      root.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        d.last.e = { ...state };
        store.save('chem');
        const restart = () => pickSession(shuffle(elementsIn(state.set).map(el => ({ ...el, id: `e:${el.symbol}` }))), data().progress, { mode: 'smart', count: state.count })
          .map(el => ({ el, dir: state.task === 'mix' ? (Math.random() < 0.5 ? 'sn' : 'ns') : state.task }));
        startChemQuiz(app, { questions: restart(), title: 'Prvky', restart });
      });
    },
  };
}

// ----- periodic table -----

function pspGrid({ quiz = false } = {}) {
  return html`<div class="psp ${quiz ? 'psp-quiz' : ''}">
    ${ELEMENTS.map(e => {
      const { col, row } = cellOf(e);
      return html`<button type="button" class="psp-cell cat-${e.category}" style="grid-column:${col};grid-row:${row}" data-z="${e.z}" aria-label="${quiz ? `pole ${e.period}. perioda` : `${e.name} (${e.symbol})`}">${quiz ? '' : html`<span class="psp-z">${e.z}</span><span class="psp-sym">${e.symbol}</span>`}</button>`;
    })}
    <div class="psp-gap" style="grid-column:3;grid-row:6">57–71</div>
    <div class="psp-gap" style="grid-column:3;grid-row:7">89–103</div>
    <div class="psp-spacer" style="grid-column:1/-1;grid-row:8"></div>
  </div>`;
}

const legend = () => html`<div class="psp-legend">${Object.entries(KINDS).map(([k, label]) => html`<span><i class="cat-${k}"></i>${label}</span>`)}</div>`;

const placeText = e => (e.group ? `${e.group}. skupina, ${e.period}. perioda` : `${e.period}. perioda, ${KINDS[e.category]}`);

function elementSheet(app, e) {
  const p = data().progress[`e:${e.symbol}`];
  app.sheet({
    title: e.name[0].toUpperCase() + e.name.slice(1),
    body: html`<div class="psp-detail">
      <div class="psp-big cat-${e.category}"><span class="psp-z">${e.z}</span><span class="psp-sym">${e.symbol}</span></div>
      <dl class="psp-facts">
        <dt>Protonové číslo</dt><dd>${e.z}</dd>
        <dt>Latinsky</dt><dd>${e.latin}</dd>
        <dt>Poloha</dt><dd>${placeText(e)}</dd>
        <dt>Skupina prvků</dt><dd>${KINDS[e.category]}</dd>
        <dt>Tvoje úroveň</dt><dd>${levelDots(p)} ${LEVEL_CZ[levelOf(p)]}</dd>
      </dl>
    </div>`,
  });
}

function pspView(app) {
  return {
    title: 'Periodická tabulka',
    back: 'chem',
    body: html`<section class="card psp-card">${pspGrid()}${legend()}</section>
      <a class="btn btn-secondary btn-block" href="#/chem/prvky">${icon('play')}Procvičit prvky</a>`,
    mount(root) {
      root.querySelector('.psp').addEventListener('click', e => {
        const cell = e.target.closest('[data-z]');
        if (cell) elementSheet(app, ELEMENTS[Number(cell.dataset.z) - 1]);
      });
    },
  };
}

function theoryView(app, id) {
  const page = theoryPage(id);
  if (!page) return { redirect: 'chem' };
  const i = THEORY.indexOf(page);
  const next = THEORY[i + 1];
  const practice = page.id === 'prvky' ? '#/chem/prvky' : page.groups.length ? `#/chem/slouceniny?groups=${page.groups.join(',')}` : '#/chem/slouceniny';
  return {
    title: page.title,
    back: 'chem',
    body: html`<article class="card chem-theory md">${raw(page.body())}</article>
      <div class="chem-theory-actions">
        <a class="btn btn-primary btn-block btn-lg" href="${practice}">${icon('play')}Procvičit</a>
        ${next ? html`<a class="btn btn-secondary btn-block" href="#/chem/teorie/${next.id}">Další: ${next.title}${icon('chevronRight')}</a>` : ''}
      </div>`,
  };
}

export function chemView(app, params) {
  if (params.id === 'slouceniny') return compoundSetup(app, params);
  if (params.id === 'prvky') return elementSetup(app);
  if (params.id === 'psp') return pspView(app);
  if (params.id === 'teorie') return theoryView(app, params.sub);
  return {
    title: 'Názvosloví',
    back: backToSubject(),
    body: homeBody(),
    mount(root) {
      root.querySelector('[data-mistakes]')?.addEventListener('click', () => {
        const restart = () => shuffle(mistakes()).slice(0, 20);
        startChemQuiz(app, { questions: restart(), title: 'Chyby', restart });
      });
    },
  };
}

// ----- the quiz -----

export function startChemQuiz(app, { questions, title, restart }) {
  if (!questions.length) return app.toast('Tady zatím nic není.');
  app.chem = { title, questions, index: 0, results: [], restart, returnTo: app.chem?.returnTo && location.hash.startsWith('#/chemquiz') ? app.chem.returnTo : location.hash };
  app.go('chemquiz');
}

const keyOf = q => (q.item ? q.item.id : `e:${q.el.symbol}`);
const PROMPTS = { nf: 'Napiš vzorec', fn: 'Napiš název', sn: 'Jak se prvek jmenuje?', ns: 'Jaká je značka prvku?', pos: 'Najdi prvek v tabulce' };

function expectedOf(q) {
  if (q.dir === 'nf') return raw(itemFormula(q.item));
  if (q.dir === 'fn') return q.item.name;
  if (q.dir === 'sn') return q.el.name;
  if (q.dir === 'ns') return q.el.symbol;
  return html`${q.el.name} (${q.el.symbol}): ${placeText(q.el)}`;
}

const frontOf = q => (q.dir === 'nf' ? q.item.name : q.dir === 'fn' ? raw(itemFormula(q.item)) : q.dir === 'sn' ? q.el.symbol : q.dir === 'ns' ? q.el.name : html`${q.el.name} (${q.el.symbol})`);

function checkElement(input, q) {
  const given = input.trim();
  if (q.dir === 'ns') {
    if (given === q.el.symbol) return { ok: true, kind: 'exact' };
    return { ok: false, kind: given.toLowerCase() === q.el.symbol.toLowerCase() ? 'case' : 'wrong' };
  }
  return check(given, q.el.names);
}

const BAD_TITLES = {
  case: 'Skoro: pozor na velká a malá písmena',
  order: 'Skoro: správné prvky, ale jinak zapsané',
  acid: 'Skoro: chybí slovo „kyselina“',
  typo: 'Skoro, překlep',
  charge: 'Skoro: špatný náboj',
  nocharge: 'Skoro: chybí náboj',
  glued: 'Skoro: náboj odděl stříškou nebo mezerou (SO4^2-)',
  ionword: 'Skoro: chybí slovo „kation“ nebo „anion“',
};

function summaryBody(session) {
  const total = session.results.length;
  const right = session.results.filter(r => r.ok).length;
  const missed = session.results.filter(r => !r.ok);
  const score = pct(right, total);
  return html`<div class="summary">
    <div class="summary-ring" style="--p:${score}"><span>${score}%</span></div>
    <h2>${score === 100 ? 'Výborně, bez chyby' : score >= 80 ? 'Skvělá práce' : score >= 50 ? 'Dobrý základ' : 'Ještě to chce trénink'}</h2>
    <p class="summary-sub">${right} z ${total} správně</p>
    ${missed.length ? html`<section class="card summary-missed"><header class="card-head"><h2>Zopakuj si</h2></header>
      <div class="note-list">${missed.map(r => html`<div class="card-row"><span class="note-row-main"><strong>${frontOf(r.q)}</strong><small>${expectedOf(r.q)}</small></span></div>`)}</div></section>` : ''}
    <div class="summary-actions">
      ${missed.length ? html`<button class="btn btn-primary btn-block btn-lg" data-again>${icon('repeat')}Procvičit chyby (${missed.length})</button>` : ''}
      <button class="btn ${missed.length ? 'btn-secondary' : 'btn-primary'} btn-block btn-lg" data-next>${icon('play')}Nový test</button>
      <button class="btn btn-text btn-block" data-done>Hotovo</button>
    </div>
  </div>`;
}

export function chemQuizView(app) {
  const session = app.chem;
  if (!session) return { redirect: 'chem' };
  const total = session.questions.length;

  return {
    focus: true,
    tab: 'home',
    body: html`<div class="practice study chem-quiz">
      <header class="practice-top">
        <button class="icon-btn" data-quit aria-label="Ukončit">${icon('x')}</button>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}"><div class="progress-fill"></div></div>
        <div class="practice-count"></div>
      </header>
      <div class="practice-stage"></div>
      <footer class="practice-actions"></footer>
    </div>`,
    mount(root) {
      const $ = sel => root.querySelector(sel);
      let state = 'ask';
      let q = null;

      const quit = () => {
        app.chem = null;
        location.hash = session.returnTo || '#/chem';
      };
      const actions = markup => { $('.practice-actions').innerHTML = markup.s; };
      const continueBtn = (extra = html`<span></span>`) => actions(html`${extra}<button class="btn btn-primary btn-lg" data-continue>${session.index + 1 < total ? 'Další' : 'Výsledky'}</button>`);

      const save = (ok, prev) => {
        const d = data();
        const after = record(prev, ok);
        d.progress[keyOf(q)] = after;
        return after;
      };

      const grade = (ok, given = '') => {
        const d = data();
        const prev = d.progress[keyOf(q)];
        const after = save(ok, prev);
        const day = dayKey(new Date());
        d.activity[day] = (d.activity[day] || 0) + 1;
        store.save('chem');
        session.results.push({ q, ok, prev, after, given });
        state = 'feedback';
        $('.progress-fill').style.width = `${((session.index + 1) / total) * 100}%`;
        $('.q-card').classList.add(ok ? 'is-good' : 'is-bad');
        if (!ok) $('.q-card').classList.add('shake');
      };

      const why = () => {
        if (q.item) {
          return html`<div class="why"><div class="why-title">${icon('bulb')}Jak na to</div>
            <ol class="why-list">${explain(q.item, q.dir).map(step => html`<li>${raw(step)}</li>`)}</ol></div>`;
        }
        const e = q.el;
        return html`<div class="why-facts">Z = ${e.z}${q.dir === 'pos' ? '' : ` · ${placeText(e)}`} · ${KINDS[e.category]} · latinsky ${e.latin}</div>`;
      };

      const feedback = (tone, title, body = '') => {
        const fb = $('.feedback');
        const last = session.results.at(-1);
        fb.className = `feedback tone-${tone}`;
        fb.innerHTML = html`<div class="feedback-head">${icon(tone === 'good' ? 'check' : 'x')}<strong>${title}</strong>
          ${last?.after ? html`<span class="feedback-level">${levelDots(last.after)}<span>${LEVEL_CZ[levelOf(last.after)]}</span></span>` : ''}</div>${body}${why()}`.s;
        fb.hidden = false;
      };

      const typed = () => {
        const input = $('.answer-input');
        const value = input.value;
        if (!value.trim()) return input.focus();
        const result = q.dir === 'nf' ? checkItemFormula(value, q.item) : q.dir === 'fn' ? checkName(value, q.item.names) : checkElement(value, q);
        grade(result.ok, value.trim());
        input.readOnly = true;
        input.classList.add(result.ok ? 'is-good' : 'is-bad');
        const title = result.ok ? (result.kind === 'accent' ? 'Správně, jen pozor na diakritiku' : 'Správně') : BAD_TITLES[result.kind] || 'Špatně';
        const showExpected = !result.ok || result.kind !== 'exact';
        feedback(result.ok ? 'good' : 'bad', title, html`${showExpected ? html`<div class="feedback-answer">${expectedOf(q)}</div>` : ''}${!result.ok ? html`<div class="feedback-given">Tvoje odpověď: <s>${value.trim()}</s></div>` : ''}`);
        continueBtn(result.ok ? undefined : html`<button class="btn btn-text" data-override>Uznat odpověď</button>`);
        input.focus({ preventScroll: true });
      };

      const show = () => {
        state = 'ask';
        q = session.questions[session.index];
        $('.progress-fill').style.width = `${(session.index / total) * 100}%`;
        $('.practice-count').textContent = `${session.index + 1} / ${total}`;
        const p = data().progress[keyOf(q)];
        const big = q.dir === 'fn' || q.dir === 'sn';
        const placeholder = q.item?.kind === 'ion' && q.dir === 'nf' ? 'Vzorec s nábojem, např. SO4^2-' : { nf: 'Vzorec, např. Fe2O3', fn: 'Název, např. oxid železitý', sn: 'Český název', ns: 'Značka' }[q.dir];
        $('.practice-stage').innerHTML = html`
          <div class="q-card study-card">
            <div class="q-meta"><span>${PROMPTS[q.dir]}</span><span class="q-deck">${q.item ? groupOf(q.item.group).label : session.title}</span></div>
            <div class="q-prompt ${big ? 'chem-big' : 'chem-name'}">${frontOf(q)}</div>
            <div class="q-level">${levelDots(p)}</div>
          </div>
          ${q.dir === 'pos'
            ? pspGrid({ quiz: true })
            : html`<div class="answer"><input class="answer-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="${placeholder}" aria-label="Tvoje odpověď">
              ${q.dir === 'nf' ? html`<div class="formula-preview" aria-live="polite"></div>` : ''}</div>`}
          <div class="feedback" hidden aria-live="polite"></div>`.s;
        actions(q.dir === 'pos'
          ? html`<button class="btn btn-text" data-skip>Nevím</button><span></span>`
          : html`<button class="btn btn-text" data-skip>Nevím</button><button class="btn btn-primary btn-lg" data-check>Zkontrolovat</button>`);
        const input = $('.answer-input');
        input?.focus({ preventScroll: true });
        if (q.dir === 'nf') {
          input.addEventListener('input', () => {
            const charged = q.item.kind === 'ion' && splitCharge(input.value);
            const clean = cleanFormula(charged ? charged.formula : input.value);
            const shown = charged ? ion(clean, Math.abs(charged.charge), charged.charge > 0 ? '+' : '−') : formulaHtml(clean);
            $('.formula-preview').innerHTML = clean ? `Náhled: ${shown}` : '';
          });
        }
      };

      const finish = () => {
        state = 'done';
        root.innerHTML = summaryBody(session).s;
        root.querySelector('[data-again]')?.addEventListener('click', () => {
          startChemQuiz(app, { questions: shuffle(session.results.filter(r => !r.ok).map(r => r.q)), title: session.title, restart: session.restart });
        });
        root.querySelector('[data-next]').addEventListener('click', () => startChemQuiz(app, { questions: session.restart(), title: session.title, restart: session.restart }));
        root.querySelector('[data-done]').addEventListener('click', quit);
      };

      const next = () => {
        session.index++;
        if (session.index >= total) finish();
        else show();
      };

      const markCells = clicked => {
        root.querySelectorAll('.psp-cell').forEach(c => { c.disabled = true; });
        const right = root.querySelector(`.psp-cell[data-z="${q.el.z}"]`);
        right.classList.add('is-right');
        right.innerHTML = html`<span class="psp-sym">${q.el.symbol}</span>`.s;
        if (clicked && clicked !== right) clicked.classList.add('is-wrong');
      };

      root.addEventListener('click', e => {
        const t = e.target.closest('button');
        if (!t || state === 'done') return;
        if (t.matches('[data-quit]')) return quit();
        if (t.matches('[data-continue]')) return next();
        if (t.matches('[data-check]') && state === 'ask') return typed();
        if (t.matches('[data-skip]') && state === 'ask') {
          grade(false);
          $('.answer-input')?.setAttribute('readonly', '');
          if (q.dir === 'pos') markCells(null);
          feedback('bad', 'Tady je správná odpověď', html`<div class="feedback-answer">${expectedOf(q)}</div>`);
          return continueBtn();
        }
        if (t.matches('[data-override]') && state === 'feedback') {
          const last = session.results.at(-1);
          last.ok = true;
          last.after = record(last.prev, true);
          data().progress[keyOf(q)] = last.after;
          store.save('chem');
          $('.q-card').classList.replace('is-bad', 'is-good');
          $('.answer-input')?.classList.replace('is-bad', 'is-good');
          feedback('good', 'Uznáno jako správně', html`<div class="feedback-answer">${expectedOf(q)}</div>`);
          return continueBtn();
        }
        if (t.matches('.psp-cell') && state === 'ask' && q.dir === 'pos') {
          const ok = Number(t.dataset.z) === q.el.z;
          grade(ok);
          markCells(t);
          feedback(ok ? 'good' : 'bad', ok ? 'Správně' : 'Vedle', html`<div class="feedback-answer">${expectedOf(q)}</div>`);
          return continueBtn();
        }
      });
      root.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        if (state === 'ask' && e.target.matches('.answer-input')) typed();
        else if (state === 'feedback') next();
      });

      show();
    },
  };
}
