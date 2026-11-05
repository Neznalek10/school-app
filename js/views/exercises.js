import { store } from '../store.js';
import { exercisesOf } from '../study.js';
import { checkResult, checkText, splitResults, splitAnswer, evaluate } from '../mathcheck.js';
import { GENERATORS } from '../soustavy.js';
import { pickSession, record, levelOf, summarize, LEVELS } from '../srs.js';
import { markdown } from '../md.js';
import { html, raw, icon, plural, pct, levelDots, masteryBar } from '../ui.js';

// Exercises from Maths and Physics lessons: solve, type the result, and open the hint or the solution only when you ask.

export const LEVEL_LABELS = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const md = text => raw(markdown(text));
const fmtNumber = n => n.toLocaleString('cs-CZ', { maximumSignificantDigits: 6 });

export function exerciseStats(lessons) {
  const items = lessons.flatMap(l => exercisesOf(l).map(x => ({ id: `${l.id}|${x.key}`, x })));
  const progress = Object.fromEntries(items.map(it => [it.id, store.lessons.find(l => l.id === it.x.lessonId)?.progress?.[it.x.key]]).filter(([, p]) => p));
  return { items, progress, summary: summarize(items, progress) };
}

export function startExercises(app, { lessons, mode = 'smart', count = 10, title, chosen }) {
  const { items, progress } = exerciseStats(lessons);
  const picked = chosen || pickSession(items, progress, { mode, count });
  if (!picked.length) {
    app.toast(mode === 'mistakes' ? 'No exercises to redo. Nice.' : 'No exercises here yet.');
    return;
  }
  // A set climbs from easy to hard, like a worksheet.
  const ordered = [...picked].sort((a, b) => a.x.level - b.x.level || a.x.i - b.x.i);
  app.exercise = {
    title,
    items: ordered,
    index: 0,
    results: [],
    restart: { lessonIds: lessons.map(l => l.id), mode, count, title },
    returnTo: location.hash.startsWith('#/exercise') ? app.exercise?.returnTo : location.hash,
  };
  app.go('exercise');
}

const solutionList = (x, shown = x.solution.length) => html`<ol class="ex-steps md">${x.solution.slice(0, shown).map(step => html`<li>${md(step)}</li>`)}</ol>`;

// The Exercises part of a lesson page: every task with its hint, result and solution folded away.
export function exercisesPart(app, lesson) {
  const { items, summary: s } = exerciseStats([lesson]);
  const solved = s.total - s.levels.new;
  const byLevel = [1, 2, 3].map(level => [level, items.filter(it => it.x.level === level)]).filter(([, list]) => list.length);
  return html`<section class="card">
      <header class="card-head"><h2>Exercises</h2><span class="card-meta">${plural(s.total, 'exercise')} · ${solved} tried · ${s.levels.mastered} mastered</span></header>
      ${masteryBar(s.levels)}
      <button class="btn btn-primary btn-block" data-ex="smart">${icon('play')}Practise</button>
      ${GENERATORS[lesson.generator] ? html`<button class="btn btn-secondary btn-block ex-new" data-new-set>${icon('refresh')}New exercises</button>` : ''}
      <div class="deck-actions">
        <button class="btn btn-secondary" data-ex="mistakes" ${s.mistakes ? '' : 'disabled'}>${icon('repeat')}Mistakes (${s.mistakes})</button>
        <button class="btn btn-secondary" data-ex="all">${icon('target')}All in order</button>
      </div>
    </section>
    ${byLevel.map(([level, list]) => html`<h3 class="group-title">${LEVEL_LABELS[level]}<span>${plural(list.length, 'exercise')}</span></h3>
      ${list.map(({ x }) => html`<section class="card ex-item">
        <div class="ex-head"><span class="qa-n">${x.i + 1}</span><span class="ex-topic">${x.topic}</span>${levelDots(lesson.progress?.[x.key])}</div>
        <div class="md ex-task">${md(x.task)}</div>
        <div class="ex-tools">
          ${x.hint ? html`<details class="ex-fold"><summary>${icon('bulb')}Hint</summary><div class="md">${md(x.hint)}</div></details>` : ''}
          <details class="ex-fold"><summary>${icon('check')}Result</summary><div class="md ex-answer">${md(x.answer)}</div></details>
          <details class="ex-fold"><summary>${icon('notes')}Detailed solution</summary>${solutionList(x)}</details>
        </div>
        <button class="btn btn-secondary btn-sm" data-solve="${x.i}">${icon('play')}Solve it</button>
      </section>`)}`)}`;
}

export function mountExercisesPart(app, lesson, root) {
  // Generated lessons draw a fresh set; progress of the old exercises goes with them.
  root.querySelector('[data-new-set]')?.addEventListener('click', () => {
    lesson.data.exercises = GENERATORS[lesson.generator]();
    lesson.progress = Object.fromEntries(Object.entries(lesson.progress || {}).filter(([k]) => !k.startsWith('x:')));
    store.save('lessons');
    app.toast(`${plural(lesson.data.exercises.length, 'new exercise')} ready.`, { kind: 'success' });
    app.render();
  });
  root.querySelectorAll('[data-ex]').forEach(btn => btn.addEventListener('click', () => {
    const mode = btn.dataset.ex;
    startExercises(app, { lessons: [lesson], mode, count: mode === 'all' ? Infinity : 10, title: lesson.title });
  }));
  root.querySelectorAll('[data-solve]').forEach(btn => btn.addEventListener('click', () => {
    const { items } = exerciseStats([lesson]);
    startExercises(app, { lessons: [lesson], chosen: [items[Number(btn.dataset.solve)]], title: lesson.title });
  }));
}

const VERDICTS = {
  exact: ['good', 'Correct'],
  rounded: ['good', 'Correct (rounded)'],
  unit: ['warn', 'Right number, check the unit'],
  count: ['bad', 'Not quite: check how many results there are'],
  sign: ['bad', 'Almost: check the sign'],
  magnitude: ['bad', 'Almost: check the decimal point or the unit conversion'],
  wrong: ['bad', 'Not quite'],
};

function summaryBody(session) {
  const total = session.results.length;
  const right = session.results.filter(r => r.ok).length;
  const missed = session.results.filter(r => !r.ok);
  const score = pct(right, total);
  return html`<div class="summary">
    <div class="summary-ring" style="--p:${score}"><span>${score}%</span></div>
    <h2>${score === 100 ? 'All solved' : score >= 80 ? 'Great work' : score >= 50 ? 'Good progress' : 'Keep at it'}</h2>
    <p class="summary-sub">${right} of ${plural(total, 'exercise')} solved</p>
    ${missed.length ? html`<section class="card summary-missed"><header class="card-head"><h2>Have another look</h2></header>
      <div class="note-list">${missed.map(r => html`<div class="card-row"><span class="note-row-main"><strong>${r.item.x.task.slice(0, 140)}${r.item.x.task.length > 140 ? '…' : ''}</strong><small>${r.item.x.answer}</small></span></div>`)}</div></section>` : ''}
    <div class="summary-actions">
      ${missed.length ? html`<button class="btn btn-primary btn-block btn-lg" data-again>${icon('repeat')}Redo missed exercises (${missed.length})</button>` : ''}
      <button class="btn ${missed.length ? 'btn-secondary' : 'btn-primary'} btn-block btn-lg" data-next>${icon('play')}New set</button>
      <button class="btn btn-text btn-block" data-done>Done</button>
    </div>
  </div>`;
}

export function exerciseView(app) {
  const session = app.exercise;
  if (!session) return { redirect: 'home' };
  const total = session.items.length;

  return {
    focus: true,
    tab: 'home',
    body: html`<div class="practice study ex-player">
      <header class="practice-top">
        <button class="icon-btn" data-quit aria-label="End session">${icon('x')}</button>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}"><div class="progress-fill"></div></div>
        <div class="practice-count"></div>
      </header>
      <div class="practice-stage ex-stage"></div>
      <footer class="practice-actions"></footer>
    </div>`,
    mount(root) {
      const $ = sel => root.querySelector(sel);
      let item = null;
      // ask -> (self: shown) -> graded; the solution can open at any point.
      let state = 'ask';
      let shownSteps = 0;
      let retrying = false;
      let gradedThis = false;
      let attemptOk = null;

      const lessonOf = it => app.lesson(it.x.lessonId);
      const auto = () => item.x.values.length > 0 || !!item.x.accept?.length;
      const actions = markup => { $('.practice-actions').innerHTML = markup.s; };
      const quit = () => {
        app.exercise = null;
        location.hash = session.returnTo || '#/home';
      };

      const grade = ok => {
        const lesson = lessonOf(item);
        let prev = null;
        let after = null;
        if (lesson) {
          lesson.progress ??= {};
          prev = lesson.progress[item.x.key];
          after = record(prev, ok);
          lesson.progress[item.x.key] = after;
          store.save('lessons');
        }
        session.results.push({ item, ok, prev, after });
        gradedThis = true;
        attemptOk = ok;
        state = 'graded';
        $('.progress-fill').style.width = `${((session.index + 1) / total) * 100}%`;
        $('.q-card').classList.add(ok ? 'is-good' : 'is-bad');
        if (!ok) $('.q-card').classList.add('shake');
      };

      const feedback = (tone, title, body = '') => {
        const fb = $('.feedback');
        const last = session.results.at(-1);
        fb.className = `feedback tone-${tone}`;
        fb.innerHTML = html`<div class="feedback-head">${icon(tone === 'bad' ? 'x' : tone === 'neutral' ? 'eye' : 'check')}<strong>${title}</strong>
          ${last?.item === item && last.after ? html`<span class="feedback-level">${levelDots(last.after)}<span>${LEVELS.find(l => l.key === levelOf(last.after)).label}</span></span>` : ''}</div>${body}`.s;
        fb.hidden = false;
      };

      const footer = () => {
        const solutionBtn = shownSteps < item.x.solution.length ? html`<button class="btn btn-text" data-solution>${icon('notes')}${shownSteps ? 'Whole solution' : 'Show solution'}</button>` : html`<span></span>`;
        if (state === 'ask') {
          return actions(html`${solutionBtn}${item.x.hint ? html`<button class="btn btn-secondary" data-hint>${icon('bulb')}Hint</button>` : ''}<button class="btn btn-primary btn-lg" data-check>${auto() ? 'Check' : 'Show result'}</button>`);
        }
        if (state === 'shown') return actions(html`<button class="btn btn-secondary btn-lg" data-self="no">${icon('x')}I didn't</button><button class="btn btn-primary btn-lg" data-self="yes">${icon('check')}I got it</button>`);
        return actions(html`${solutionBtn}${attemptOk === false && auto() && !shownSteps ? html`<button class="btn btn-secondary" data-retry>${icon('repeat')}Try again</button>` : ''}<button class="btn btn-primary btn-lg" data-continue>${session.index + 1 < total ? 'Next' : 'See results'}</button>`);
      };

      const showSolution = (all = false) => {
        const steps = item.x.solution.length;
        shownSteps = all ? steps : Math.min(steps, shownSteps + 1);
        const box = $('.ex-solution');
        box.hidden = false;
        box.innerHTML = html`<div class="why-title">${icon('notes')}Solution</div>${solutionList(item.x, shownSteps)}
          ${shownSteps < steps
            ? html`<div class="ex-step-actions"><button class="btn btn-secondary btn-sm" data-step>Next step (${shownSteps + 1}/${steps})</button><button class="btn btn-text btn-sm" data-solution>Show all</button></div>`
            : html`<div class="ex-result">Result: ${md(item.x.answer)}</div>`}`.s;
        footer();
      };

      const checkTyped = () => {
        const input = $('.answer-input');
        const value = input.value;
        if (!value.trim()) return input.focus();
        const result = item.x.accept?.length ? checkText(value, item.x.accept) : checkResult(value, item.x);
        if (result.kind === 'unreadable') {
          $('.ex-warning').hidden = false;
          return input.focus();
        }
        $('.ex-warning').hidden = true;
        input.readOnly = true;
        input.classList.remove('is-good', 'is-bad');
        input.classList.add(result.ok ? 'is-good' : 'is-bad');
        const [tone, title] = VERDICTS[result.kind];
        attemptOk = result.ok;
        if (retrying) {
          feedback(result.ok ? tone : 'bad', result.ok ? `${title} on another try` : title, result.ok ? html`<div class="feedback-answer">${md(item.x.answer)}</div>` : '');
        } else {
          grade(result.ok);
          feedback(tone, title, result.ok ? html`<div class="feedback-answer">${md(item.x.answer)}</div>` : html`<div class="feedback-also">Try again, open the hint, or look at the solution.</div>`);
        }
        state = 'graded';
        footer();
      };

      const show = () => {
        state = 'ask';
        shownSteps = 0;
        retrying = false;
        gradedThis = false;
        attemptOk = null;
        item = session.items[session.index];
        const x = item.x;
        const lesson = lessonOf(item);
        $('.progress-fill').style.width = `${(session.index / total) * 100}%`;
        $('.practice-count').textContent = `${session.index + 1} / ${total}`;
        const placeholder = x.accept?.length ? 'Result' : x.values.length > 1 ? 'Results, separated by ;' : x.unit ? `Result in ${x.unit}` : 'Result';
        $('.ex-stage').innerHTML = html`
          <div class="q-card study-card ex-card">
            <div class="q-meta"><span>${LEVEL_LABELS[x.level]}</span><span class="q-deck">${x.topic || lesson?.title || ''}</span></div>
            <div class="md ex-task">${md(x.task)}</div>
            <div class="q-level">${levelDots(lesson?.progress?.[x.key])}</div>
          </div>
          ${auto()
            ? html`<div class="answer"><input class="answer-input" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="${placeholder}" aria-label="Your result">
                <div class="formula-preview ex-preview" aria-live="polite"></div>
                <div class="ex-warning" hidden>Write the result as a number, for example 2,5 or 5/2${x.values.length > 1 ? '. Separate several results with ;' : ''}.</div></div>`
            : html`<p class="ex-self">Solve it on paper, then compare your result.</p>`}
          <div class="ex-hint" hidden><div class="why-title">${icon('bulb')}Hint</div><div class="md">${md(x.hint)}</div></div>
          <div class="feedback" hidden aria-live="polite"></div>
          <div class="ex-solution" hidden></div>`.s;
        footer();
        const input = $('.answer-input');
        input?.focus({ preventScroll: true });
        input?.addEventListener('input', () => {
          if (x.accept?.length) return;
          const parts = splitResults(input.value).map(splitAnswer);
          const nums = parts.map(p => evaluate(p.expr));
          const plain = /^[-−]?\d+(,\d+)?$/.test(input.value.trim());
          $('.ex-preview').textContent = nums.length && nums.every(Number.isFinite) && !plain ? `Reads as: ${nums.map(fmtNumber).join('; ')}` : '';
        });
      };

      const finish = () => {
        state = 'done';
        root.innerHTML = summaryBody(session).s;
        const lessons = session.restart.lessonIds.map(id => app.lesson(id)).filter(Boolean);
        root.querySelector('[data-again]')?.addEventListener('click', () => startExercises(app, { lessons, chosen: session.results.filter(r => !r.ok).map(r => r.item), title: session.title }));
        root.querySelector('[data-next]').addEventListener('click', () => startExercises(app, { lessons, ...session.restart }));
        root.querySelector('[data-done]').addEventListener('click', quit);
      };

      const next = () => {
        session.index++;
        if (session.index >= total) finish();
        else show();
      };

      root.addEventListener('click', e => {
        const t = e.target.closest('button');
        if (!t || state === 'done') return;
        if (t.matches('[data-quit]')) return quit();
        if (t.matches('[data-continue]')) return next();
        if (t.matches('[data-hint]')) {
          $('.ex-hint').hidden = false;
          t.remove();
          return;
        }
        if (t.matches('[data-step]')) return showSolution();
        if (t.matches('[data-solution]')) {
          // Opening the solution before answering counts as not solved.
          if (!gradedThis) {
            if (auto()) $('.answer').hidden = true;
            grade(false);
            feedback('neutral', 'Here is how it goes', html`<div class="feedback-answer">${md(item.x.answer)}</div>`);
          } else if (state === 'ask') {
            $('.answer-input').readOnly = true;
            state = 'graded';
          }
          return showSolution(shownSteps > 0);
        }
        if (t.matches('[data-check]') && state === 'ask') {
          if (auto()) return checkTyped();
          state = 'shown';
          feedback('neutral', 'Result', html`<div class="feedback-answer">${md(item.x.answer)}</div>`);
          return footer();
        }
        if (t.matches('[data-self]') && state === 'shown') {
          const ok = t.dataset.self === 'yes';
          grade(ok);
          feedback(ok ? 'good' : 'bad', ok ? 'Nice' : 'It will come back soon', html`<div class="feedback-answer">${md(item.x.answer)}</div>`);
          return footer();
        }
        if (t.matches('[data-retry]') && state === 'graded') {
          retrying = true;
          state = 'ask';
          const input = $('.answer-input');
          input.readOnly = false;
          input.classList.remove('is-good', 'is-bad');
          input.value = '';
          input.focus();
          $('.feedback').hidden = true;
          return footer();
        }
      });
      root.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        if (state === 'ask' && e.target.matches('.answer-input')) checkTyped();
        else if (state === 'graded') next();
      });

      show();
    },
  };
}
