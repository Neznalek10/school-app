import { store } from '../store.js';
import { cardsOf, checkWhen, checkCloze, clozeParts, clozeAnswer, orderQuiz, slideHref, unitLabel } from '../study.js';
import { pickSession, record, levelOf, shuffle, LEVELS } from '../srs.js';
import { markdown } from '../md.js';
import { html, raw, icon, plural, pct, levelDots } from '../ui.js';

const LABELS = { term: 'Explain the term', qa: 'Question', cloze: 'Fill in the blank', choice: 'Choose the answer', compare: 'Compare', when: 'When did it happen?', visual: 'What is it?', order: 'Put in order, oldest first' };
// One "put in order" round after every few cards, when the lessons have enough dated events.
const ORDER_EVERY = 6;

// Cards from several lessons share one session, so each is keyed by lesson and card.
export function startStudy(app, { lessons, mode = 'smart', count = 10, title, cards: chosen }) {
  const pool = lessons.flatMap(l => cardsOf(l).map(c => ({ ...c, id: `${l.id}|${c.id}`, key: c.id })));
  const progress = Object.fromEntries(pool.map(c => [c.id, lessons.find(l => l.id === c.lessonId).progress?.[c.key]]).filter(([, p]) => p));
  const picked = chosen || pickSession(pool, progress, { mode, count });
  if (!picked.length) {
    app.toast(mode === 'mistakes' ? 'No mistakes to practise. Nice.' : 'No flashcards here yet.');
    return;
  }
  const timeline = lessons.flatMap(l => l.data.timeline);
  const items = [];
  picked.forEach((card, i) => {
    items.push(card);
    if ((i + 1) % ORDER_EVERY === 0) {
      const quiz = orderQuiz(timeline);
      if (quiz) items.push(quiz);
    }
  });
  app.study = {
    title,
    lessons: lessons.map(l => l.id),
    items,
    index: 0,
    results: [],
    restart: { lessonIds: lessons.map(l => l.id), mode, count, title },
    returnTo: location.hash.startsWith('#/study') ? app.study?.returnTo : location.hash,
  };
  app.go('study');
}

function summary(session) {
  const total = session.results.length;
  const right = session.results.filter(r => r.ok).length;
  const missed = session.results.filter(r => !r.ok && r.card.type !== 'order');
  const score = pct(right, total);
  const ups = session.results.filter(r => r.ok && r.after && LEVELS.findIndex(l => l.key === levelOf(r.after)) > LEVELS.findIndex(l => l.key === levelOf(r.prev))).length;
  return html`<div class="summary">
    <div class="summary-ring" style="--p:${score}"><span>${score}%</span></div>
    <h2>${score === 100 ? 'Perfect' : score >= 80 ? 'Great work' : score >= 50 ? 'Good progress' : 'Keep at it'}</h2>
    <p class="summary-sub">${right} of ${plural(total, 'card')} right${ups ? ` · ${plural(ups, 'card')} leveled up` : ''}</p>
    ${missed.length ? html`<section class="card summary-missed"><header class="card-head"><h2>Review these</h2></header>
      <div class="note-list">${missed.map(r => html`<div class="card-row"><span class="note-row-main"><strong>${front(r.card)}</strong><small>${back(r.card)}</small></span></div>`)}</div></section>` : ''}
    <div class="summary-actions">
      ${missed.length ? html`<button class="btn btn-primary btn-block btn-lg" data-again>${icon('repeat')}Practise missed cards (${missed.length})</button>` : ''}
      <button class="btn ${missed.length ? 'btn-secondary' : 'btn-primary'} btn-block btn-lg" data-next>${icon('play')}New session</button>
      <button class="btn btn-text btn-block" data-done>Done</button>
    </div>
  </div>`;
}

const front = c => (c.type === 'cloze' ? clozeParts(c.text).join('____') : c.type === 'when' ? c.event : c.type === 'visual' ? c.description : c.q);
const back = c => (c.type === 'cloze' ? clozeAnswer(c.text) : c.type === 'when' ? c.date : c.a);

function lessonOf(app, card) {
  return app.lesson(card.lessonId);
}

export function studyView(app) {
  const session = app.study;
  if (!session) return { redirect: 'home' };
  const total = session.items.length;

  return {
    focus: true,
    tab: 'home',
    body: html`<div class="practice study">
      <header class="practice-top">
        <button class="icon-btn" data-quit aria-label="End session">${icon('x')}</button>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}"><div class="progress-fill"></div></div>
        <div class="practice-count"></div>
      </header>
      <div class="practice-stage"></div>
      <footer class="practice-actions"></footer>
    </div>`,
    mount(root) {
      const $ = sel => root.querySelector(sel);
      let state = 'ask';
      let current = null;

      const quit = () => {
        app.study = null;
        location.hash = session.returnTo || '#/home';
      };

      const finish = () => {
        state = 'done';
        root.innerHTML = summary(session).s;
        const lessons = session.restart.lessonIds.map(id => app.lesson(id)).filter(Boolean);
        root.querySelector('[data-again]')?.addEventListener('click', () => {
          const cards = session.results.filter(r => !r.ok && r.card.type !== 'order').map(r => r.card);
          startStudy(app, { lessons, cards, title: session.title });
        });
        root.querySelector('[data-next]').addEventListener('click', () => startStudy(app, { lessons, ...session.restart }));
        root.querySelector('[data-done]').addEventListener('click', quit);
      };

      const actions = markup => { $('.practice-actions').innerHTML = markup.s; };

      // Every answer moves the card's level, exactly like a vocabulary word.
      const grade = (ok, extra = {}) => {
        const card = current;
        let prev = null;
        let after = null;
        if (card.type !== 'order') {
          const lesson = lessonOf(app, card);
          if (lesson) {
            lesson.progress ??= {};
            prev = lesson.progress[card.key];
            after = record(prev, ok);
            lesson.progress[card.key] = after;
            store.save('lessons');
          }
        }
        session.results.push({ card, ok, prev, after, ...extra });
        state = 'feedback';
        $('.progress-fill').style.width = `${((session.index + 1) / total) * 100}%`;
        $('.q-card').classList.add(ok ? 'is-good' : 'is-bad');
        if (!ok) $('.q-card').classList.add('shake');
      };

      const feedback = (tone, title, body = '') => {
        const fb = $('.feedback');
        fb.className = `feedback tone-${tone}`;
        fb.innerHTML = html`<div class="feedback-head">${icon(tone === 'good' ? 'check' : 'x')}<strong>${title}</strong>
          ${session.results.at(-1)?.after ? html`<span class="feedback-level">${levelDots(session.results.at(-1).after)}<span>${LEVELS.find(l => l.key === levelOf(session.results.at(-1).after)).label}</span></span>` : ''}</div>${body}`.s;
        fb.hidden = false;
      };

      const continueBtn = (extra = html`<span></span>`) => actions(html`${extra}<button class="btn btn-primary btn-lg" data-continue>${session.index + 1 < total ? 'Continue' : 'See results'}</button>`);

      const slideLink = card => {
        const lesson = lessonOf(app, card);
        const href = slideHref(lesson?.link, card.slide);
        const label = unitLabel(lesson, card.slide);
        return href ? html`<a class="slide-badge" href="${href}" target="_blank" rel="noopener noreferrer">${label}${icon('external')}</a>` : card.slide ? html`<span class="slide-badge">${label}</span>` : '';
      };

      const reveal = () => {
        state = 'reveal';
        const card = current;
        const answer = card.type === 'visual'
          ? html`<div class="feedback-answer">${card.a}</div><div class="feedback-also">${slideLink(card)}</div>`
          : html`<div class="md reveal-answer">${raw(markdown(back(card)))}</div>`;
        const fb = $('.feedback');
        fb.className = 'feedback tone-neutral';
        fb.innerHTML = answer.s;
        fb.hidden = false;
        actions(html`<button class="btn btn-secondary btn-lg" data-self="no">${icon('x')}Didn't know</button><button class="btn btn-primary btn-lg" data-self="yes">${icon('check')}Knew it</button>`);
      };

      const typed = () => {
        const input = $('.answer-input');
        const value = input.value;
        if (!value.trim()) return input.focus();
        const card = current;
        const result = card.type === 'when' ? checkWhen(value, card) : checkCloze(value, card.text);
        const ok = result.ok;
        grade(ok, { given: value.trim() });
        input.readOnly = true;
        input.classList.add(ok ? 'is-good' : 'is-bad');
        const expected = back(card);
        const near = result.kind === 'typo' || (result.kind === 'accent' && !ok);
        feedback(ok ? 'good' : 'bad', ok ? (result.kind === 'accent' ? 'Correct, watch the accents' : 'Correct') : near ? 'Almost' : 'Not quite',
          html`${ok && result.kind === 'exact' ? '' : html`<div class="feedback-answer">${expected}</div>`}${!ok ? html`<div class="feedback-given">You wrote: <s>${value.trim()}</s></div>` : ''}${card.slide ? html`<div class="feedback-also">${slideLink(card)}</div>` : ''}`);
        continueBtn(ok ? undefined : html`<button class="btn btn-text" data-override>I was right</button>`);
        input.focus({ preventScroll: true });
      };

      const show = () => {
        state = 'ask';
        current = session.items[session.index];
        const card = current;
        const lesson = card.type === 'order' ? null : lessonOf(app, card);
        $('.progress-fill').style.width = `${(session.index / total) * 100}%`;
        $('.practice-count').textContent = `${session.index + 1} / ${total}`;
        let main = '';
        let foot = html`<button class="btn btn-text" data-skip>Don't know</button><button class="btn btn-primary btn-lg" data-check>Check</button>`;
        if (card.type === 'cloze') {
          const [a, b] = clozeParts(card.text);
          main = html`<div class="q-text">${a}<span class="blank">____</span>${b}</div>`;
        } else if (card.type === 'when') {
          main = html`<div class="q-text">${card.event}</div>`;
        } else if (card.type === 'choice') {
          main = html`<div class="q-text">${card.q}</div>`;
          foot = html`<button class="btn btn-text" data-skip>Don't know</button><span></span>`;
        } else if (card.type === 'order') {
          card.picked = [];
          card.shown = shuffle(card.items);
          // A list that already starts sorted gives the answer away.
          for (let n = 0; n < 8 && card.shown.every((t, i) => t.year === card.correct[i].year); n++) card.shown = shuffle(card.items);
          main = html`<div class="q-text q-small">Tap the events from the oldest to the newest.</div>`;
          foot = html`<button class="btn btn-text" data-reset-order>Start again</button><span></span>`;
        } else if (card.type === 'visual') {
          main = html`<div class="q-kind">${card.kind}</div><div class="q-text">${card.description}</div>`;
          foot = html`<span></span><button class="btn btn-primary btn-lg" data-reveal>Show answer</button>`;
        } else {
          main = html`<div class="q-text">${card.q}</div>`;
          foot = html`<span></span><button class="btn btn-primary btn-lg" data-reveal>Show answer</button>`;
        }
        const lessonProgress = lesson?.progress?.[card.key];
        $('.practice-stage').innerHTML = html`
          <div class="q-card study-card">
            <div class="q-meta"><span>${LABELS[card.type]}</span><span class="q-deck">${lesson?.title || ''}</span></div>
            <div class="study-front">${main}</div>
            ${card.type === 'order' ? '' : html`<div class="q-level">${levelDots(lessonProgress)}</div>`}
          </div>
          ${card.type === 'cloze' || card.type === 'when' ? html`<div class="answer"><input class="answer-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="${card.type === 'when' ? 'Year or date' : 'Missing word'}" aria-label="Your answer"></div>` : ''}
          ${card.type === 'choice' ? html`<div class="choices">${shuffle(card.options).map(o => html`<button class="choice-btn" data-choice="${o}">${o}</button>`)}</div>` : ''}
          ${card.type === 'order' ? html`<div class="choices order-list">${card.shown.map((t, i) => html`<button class="choice-btn order-btn" data-order="${i}"><span class="order-n"></span><span>${t.event}</span></button>`)}</div>` : ''}
          <div class="feedback" hidden aria-live="polite"></div>`.s;
        actions(foot);
        $('.answer-input')?.focus({ preventScroll: true });
      };

      const next = () => {
        session.index++;
        if (session.index >= total) finish();
        else show();
      };

      root.addEventListener('click', e => {
        const t = e.target.closest('button');
        if (!t || state === 'done') return;
        const card = current;
        if (t.matches('[data-quit]')) return quit();
        if (t.matches('[data-continue]')) return next();
        if (t.matches('[data-reveal]') && state === 'ask') return reveal();
        if (t.matches('[data-self]') && state === 'reveal') {
          const ok = t.dataset.self === 'yes';
          grade(ok);
          feedback(ok ? 'good' : 'bad', ok ? 'Nice' : 'It will come back soon', html`<div class="md reveal-answer">${raw(markdown(back(card)))}</div>`);
          return continueBtn();
        }
        if (t.matches('[data-check]') && state === 'ask') return typed();
        if (t.matches('[data-skip]') && state === 'ask') {
          grade(false);
          $('.answer-input')?.setAttribute('readonly', '');
          root.querySelectorAll('[data-choice]').forEach(b => b.classList.toggle('is-right', b.dataset.choice === card.a));
          feedback('bad', 'Here is the answer', html`<div class="feedback-answer">${back(card)}</div>`);
          return continueBtn();
        }
        if (t.matches('[data-override]')) {
          const last = session.results.at(-1);
          const lesson = lessonOf(app, card);
          last.ok = true;
          last.after = record(last.prev, true);
          if (lesson) {
            lesson.progress[card.key] = last.after;
            store.save('lessons');
          }
          $('.q-card').classList.replace('is-bad', 'is-good');
          $('.answer-input')?.classList.replace('is-bad', 'is-good');
          feedback('good', 'Marked as correct', html`<div class="feedback-answer">${back(card)}</div>`);
          return continueBtn();
        }
        if (t.matches('[data-choice]') && state === 'ask') {
          const ok = t.dataset.choice === card.a;
          grade(ok);
          root.querySelectorAll('[data-choice]').forEach(b => {
            b.disabled = true;
            b.classList.toggle('is-right', b.dataset.choice === card.a);
          });
          if (!ok) t.classList.add('is-wrong');
          feedback(ok ? 'good' : 'bad', ok ? 'Correct' : 'Not quite', ok ? '' : html`<div class="feedback-answer">${card.a}</div>`);
          return continueBtn();
        }
        if (t.matches('[data-reset-order]') && state === 'ask') {
          card.picked = [];
          root.querySelectorAll('[data-order]').forEach(b => { b.classList.remove('picked'); b.querySelector('.order-n').textContent = ''; });
          return;
        }
        if (t.matches('[data-order]') && state === 'ask') {
          const i = Number(t.dataset.order);
          if (card.picked.includes(i)) return;
          card.picked.push(i);
          t.classList.add('picked');
          t.querySelector('.order-n').textContent = card.picked.length;
          if (card.picked.length < card.shown.length) return;
          const ok = card.picked.every((p, n) => card.shown[p].year === card.correct[n].year);
          grade(ok);
          root.querySelectorAll('[data-order]').forEach(b => { b.disabled = true; });
          feedback(ok ? 'good' : 'bad', ok ? 'Right order' : 'Not quite. The order is:', html`<ol class="order-answer">${card.correct.map(c => html`<li><strong>${c.date}</strong> ${c.event}</li>`)}</ol>`);
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
