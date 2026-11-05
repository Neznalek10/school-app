/**
 * Lessons: the Lessons tab of a subject, the lesson page (notes, flashcards, exercises) and the
 * new-lesson flow that turns an AI answer into a lesson.
 *
 * Responsibility: lesson list, learning-plan sheet, lesson reading and the new lesson page.
 * Fits in: routed from js/app.js (lesson, newlesson) and embedded by js/views/subject.js; parsing and
 * templates come from study.js, scheduling from srs.js, exercises from views/exercises.js.
 * Invariant: lessons belong to a subject (subjectId); a subject's plan keeps the setup's `extra` text.
 */
import { store, uid } from '../store.js';
import { TEMPLATES, planOf, promptFor, parseLesson, lessonCounts, cardsOf, exercisesOf, slideHref, clozeParts, clozeAnswer, unitLabel, templateOf } from '../study.js';
import { readHighlights, highlightsText } from '../docx.js';
import { summarize } from '../srs.js';
import { markdown } from '../md.js';
import { html, raw, icon, plural, pct, segmented, onSegmented, emptyState, masteryBar, masteryLegend, levelDots } from '../ui.js';
import { startStudy } from './study.js';
import { exercisesPart, mountExercisesPart } from './exercises.js';
import { copyText } from './parts.js';

export const lessonHref = l => `#/lesson/${encodeURIComponent(l.id)}`;
export const lessonsOf = subjectId => store.lessons.filter(l => l.subjectId === subjectId).sort((a, b) => b.created - a.created);
export const lessonStats = l => summarize(cardsOf(l), l.progress || {});

const VISUAL_ICONS = { photo: 'eye', painting: 'palette', statue: 'user', building: 'home', map: 'map', diagram: 'atom', chart: 'stats', other: 'eye' };
const DAY_FMT = { day: 'numeric', month: 'short' };

/**
 * Opens the learning-plan sheet: pick a template and edit the lesson prompt.
 *
 * Side effects: on save it sets `subject.plan` (keeping the setup's `extra`), saves subjects, toasts and re-renders.
 *
 * @param {object} app The app shell.
 * @param {object} subject The subject whose plan is edited; mutated on save.
 * @returns {void}
 */
export function planSheet(app, subject) {
  const plan = planOf(subject);
  let template = plan.template;
  // Lesson instructions written by the AI setup: shown read-only and kept when the plan is saved.
  const extra = subject.plan?.extra || '';
  app.sheet({
    title: `${subject.name} learning plan`,
    body: html`<form class="plan-form" novalidate>
      <p class="sheet-text">The prompt you paste into ChatGPT or Gemini with a presentation, document or book pages. Its answer becomes a lesson with notes and flashcards.</p>
      <div class="field-label">Template</div>
      ${segmented('template', Object.entries(TEMPLATES).map(([value, t]) => ({ value, label: t.short || t.label })), template)}
      <p class="muted small plan-hint">${TEMPLATES[template].hint}</p>
      <label class="field-label" for="plan-prompt">Prompt${plan.custom ? ' (edited)' : ''}</label>
      <textarea class="input textarea plan-prompt" id="plan-prompt" name="prompt" rows="12" spellcheck="false">${plan.prompt}</textarea>
      <p class="muted small">{subject} becomes "${subject.name}". Keep the JSON shape so the app can read the answer.</p>
      ${extra ? html`<div class="field-label">Extra instructions from the setup</div><p class="muted small plan-extra">${extra}</p>` : ''}
      <button class="btn btn-primary btn-block btn-lg" type="submit">Save plan</button>
      <button class="btn btn-text btn-block" type="button" data-reset>Reset to the ${TEMPLATES[template].label} template</button>
    </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      onSegmented(body, (name, value) => {
        const wasDefault = form.prompt.value.trim() === TEMPLATES[template].prompt.trim();
        template = value;
        body.querySelector('.plan-hint').textContent = TEMPLATES[template].hint;
        body.querySelector('[data-reset]').textContent = `Reset to the ${TEMPLATES[template].label} template`;
        if (wasDefault) form.prompt.value = TEMPLATES[template].prompt;
      });
      body.querySelector('[data-reset]').addEventListener('click', () => { form.prompt.value = TEMPLATES[template].prompt; });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const prompt = form.prompt.value.trim();
        subject.plan = {
          template,
          ...(prompt && prompt !== TEMPLATES[template].prompt.trim() ? { prompt } : {}),
          ...(extra ? { extra } : {}),
        };
        store.save('subjects');
        close();
        app.toast('Learning plan saved.', { kind: 'success' });
        app.render();
      });
    },
  });
}

export function lessonsPanel(app, subject) {
  const lessons = lessonsOf(subject.id);
  const plan = planOf(subject);
  return html`
    <section class="card plan-card">
      <div class="plan-row">
        <span class="assistant-icon">${icon('sparkle')}</span>
        <span class="note-row-main"><strong>Learning plan: ${TEMPLATES[plan.template].label}${plan.custom ? ' (edited)' : ''}</strong><small>${TEMPLATES[plan.template].hint}</small></span>
        <button class="btn btn-secondary btn-sm" data-plan>Edit</button>
      </div>
      <a class="btn btn-primary btn-block" href="#/newlesson/${encodeURIComponent(subject.id)}">${icon('plus')}New lesson from ${TEMPLATES[plan.template].source.from}</a>
    </section>
    ${lessons.length
      ? html`<div class="card note-list">${lessons.map(l => {
        const s = lessonStats(l);
        return html`<a class="note-row lesson-row" href="${lessonHref(l)}">
          <span class="assistant-icon">${icon('learn')}</span>
          <span class="note-row-main"><strong>${l.title}</strong>
            <small>${new Date(l.created).toLocaleDateString('en-GB', DAY_FMT)}${l.data.exercises?.length ? ` · ${plural(l.data.exercises.length, 'exercise')}` : ''} · ${plural(s.total, 'card')} · ${pct(s.levels.mastered, s.total)}% mastered${s.due ? ` · ${s.due} due` : ''}</small>
            ${masteryBar(s.levels, { thin: true })}</span>
          ${icon('chevronRight', 'chevron')}
        </a>`;
      })}</div>`
      : emptyState({ iconName: 'learn', title: 'No lessons yet', text: TEMPLATES[plan.template].source.empty })}`;
}

export function mountLessons(app, subject, root) {
  root.querySelector('[data-plan]').addEventListener('click', () => planSheet(app, subject));
}

function highlightResult(h) {
  if (!h) return '';
  if (!h.passages) {
    return html`<div class="notice notice-warn">${icon('alert')}<span>No yellow highlighting found in ${h.fileName}. The parts must be highlighted in yellow (Word's highlighter or Google Docs' highlight colour), not just coloured text.</span></div>`;
  }
  return html`<div class="notice notice-good">${icon('check')}<span><strong>${plural(h.passages, 'highlighted passage')}</strong> from ${h.fileName}${h.sections > 1 ? ` · ${plural(h.sections, 'heading')}` : ''} · ${h.chars.toLocaleString('en-US')} characters. They are now inside the prompt.</span></div>
    <details class="help"><summary>${icon('eye')}See what was found</summary><pre class="prompt-preview">${h.text}</pre></details>`;
}

// Three steps on one page: describe the presentation or document, copy the prompt, paste the answer.
export function newLessonView(app, { id, lesson: replaceId }) {
  const subject = app.subject(id);
  if (!subject) return { redirect: 'home' };
  const existing = replaceId ? app.lesson(replaceId) : null;
  const draftKey = existing ? `lesson:${existing.id}` : subject.id;
  const draft = (app.ui.lessonDraft[draftKey] ??= { title: existing?.title || '', link: existing?.link || '', topics: existing?.topics || '', answer: '' });
  const plan = planOf(subject);
  const doc = TEMPLATES[plan.template].input === 'document';
  const topics = TEMPLATES[plan.template].input === 'topics';
  const source = TEMPLATES[plan.template].source;
  const promptNow = () => promptFor(subject, { highlights: doc ? draft.highlights?.text : '', topics: topics ? draft.topics : '' });
  const links = store.sources.filter(s => s.subjectId === subject.id && s.kind === 'link');

  const body = html`<div class="wizard">
    <section class="card">
      <header class="card-head"><h2><span class="step">1</span>The ${source.noun}</h2></header>
      ${doc ? html`<div class="field-label">The Word file with your yellow highlights</div>
        <label class="dropzone">${icon('upload')}<strong>Choose the .docx</strong><span>From Google Docs: File › Download › Microsoft Word (.docx)</span>
          <input type="file" name="docx" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></label>
        <div class="highlight-result">${highlightResult(draft.highlights)}</div>
        <p class="muted small">The app reads the yellow parts itself and puts them into the prompt, because chat apps often lose highlighting. Nothing is uploaded anywhere.</p>` : ''}
      ${topics ? html`<label class="field-label" for="nl-topics">Key topics</label>
        <textarea class="input textarea" id="nl-topics" name="topics" rows="6" placeholder="${source.topicsExample || ''}">${draft.topics}</textarea>
        <p class="muted small">One topic per line, for example from the test announcement. They go into the prompt, and the more specific they are, the better the notes.</p>`
      : html`<label class="field-label" for="nl-link">Link to it (optional)</label>
        <input class="input" id="nl-link" name="link" inputmode="url" autocapitalize="off" spellcheck="false" list="nl-links" value="${draft.link}" placeholder="${source.link}">
        <datalist id="nl-links">${links.map(s => html`<option value="${s.url}">${s.title}</option>`)}</datalist>
        <p class="muted small">${source.linkHelp}</p>`}
      <label class="field-label" for="nl-title">Title (optional)</label>
      <input class="input" id="nl-title" name="title" maxlength="120" value="${draft.title}" placeholder="Taken from the AI's answer" autocomplete="off">
    </section>

    <section class="card">
      <header class="card-head"><h2><span class="step">2</span>Copy the prompt</h2><button class="card-link link-btn" data-plan>${TEMPLATES[plan.template].label} plan${icon('chevronRight')}</button></header>
      <ol class="wizard-steps">
        <li>Open ChatGPT or Gemini.</li>
        ${doc
          ? html`<li class="doc-step-with">The highlighted parts are inside the prompt, so you don't need to attach anything.</li>
            <li class="doc-step-without">${source.attach} Without the .docx above, the AI has to find the yellow parts itself and may miss them.</li>`
          : html`<li>${source.attach}</li>`}
        <li>Paste the prompt and send.</li>
      </ol>
      <div class="wizard-actions">
        <button class="btn btn-primary" data-copy>${icon('copy')}Copy prompt</button>
        <a class="btn btn-secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">${icon('external')}ChatGPT</a>
        <a class="btn btn-secondary" href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer">${icon('external')}Gemini</a>
      </div>
      <details class="help"><summary>${icon('eye')}See the prompt</summary><pre class="prompt-preview prompt-full">${promptNow()}</pre></details>
    </section>

    <section class="card">
      <header class="card-head"><h2><span class="step">3</span>Paste the answer</h2><span class="card-meta parse-status"></span></header>
      <textarea class="input textarea answer-paste" name="answer" rows="8" spellcheck="false" placeholder="Paste the AI's whole answer here, code block included.">${draft.answer}</textarea>
      <div class="parse-result"></div>
      <button class="btn btn-primary btn-block btn-lg" data-create disabled>${icon('check')}${existing ? 'Update lesson' : 'Create lesson'}</button>
      ${existing ? html`<p class="muted small">Flashcards that stay the same keep their progress.</p>` : ''}
    </section>
  </div>`;

  return {
    title: existing ? 'Replace answer' : 'New lesson',
    back: existing ? `lesson/${encodeURIComponent(existing.id)}` : `subject/${encodeURIComponent(subject.id)}?tab=lessons`,
    tab: 'home',
    body,
    mount(root) {
      const $ = sel => root.querySelector(sel);
      let parsed = null;
      const update = () => {
        draft.answer = $('.answer-paste').value;
        const status = $('.parse-status');
        const result = $('.parse-result');
        parsed = null;
        if (!draft.answer.trim()) {
          status.textContent = '';
          result.innerHTML = '';
        } else {
          try {
            parsed = parseLesson(draft.answer);
            status.textContent = 'Ready';
            result.innerHTML = html`<div class="notice notice-good">${icon('check')}<span><strong>${parsed.title || 'Untitled'}</strong><br>${['notes', ...lessonCounts(parsed)].join(' · ')}</span></div>`.s;
          } catch (e) {
            status.textContent = 'Not readable yet';
            result.innerHTML = html`<div class="notice notice-bad">${icon('alert')}<span>${e.message}</span></div>`.s;
          }
        }
        $('[data-create]').disabled = !parsed;
      };
      $('.answer-paste').addEventListener('input', update);
      $('[name=title]').addEventListener('input', e => { draft.title = e.target.value; });
      $('[name=link]')?.addEventListener('input', e => { draft.link = e.target.value; });
      $('[name=topics]')?.addEventListener('input', e => {
        draft.topics = e.target.value;
        $('.prompt-full').textContent = promptNow();
      });
      $('[data-copy]').addEventListener('click', () => copyText(app, promptNow(), topics ? 'Prompt copied. Paste it into the AI.' : `Prompt copied. Paste it into the AI with your ${source.noun}.`));
      const showDocSteps = () => {
        root.querySelectorAll('.doc-step-with').forEach(li => { li.hidden = !draft.highlights?.passages; });
        root.querySelectorAll('.doc-step-without').forEach(li => { li.hidden = !!draft.highlights?.passages; });
      };
      showDocSteps();
      $('[name=docx]')?.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const found = await readHighlights(file);
          draft.highlights = { fileName: file.name, passages: found.passages, chars: found.chars, sections: found.sections.length, text: highlightsText(found) };
          if (!draft.title && found.sections[0]?.heading) draft.title = found.sections[0].heading;
        } catch (err) {
          draft.highlights = null;
          app.toast(err.message, { kind: 'error', duration: 6000 });
        }
        $('.highlight-result').innerHTML = highlightResult(draft.highlights).s || '';
        $('.prompt-full').textContent = promptNow();
        if (draft.title && !$('[name=title]').value) $('[name=title]').value = draft.title;
        showDocSteps();
      });
      $('[data-plan]').addEventListener('click', () => planSheet(app, subject));
      update();
      $('[data-create]').addEventListener('click', () => {
        const link = /^https?:\/\//i.test(draft.link.trim()) ? draft.link.trim() : '';
        const now = Date.now();
        const fields = { title: draft.title.trim() || parsed.title || 'Untitled lesson', link, template: plan.template, answer: draft.answer, data: parsed, updated: now, ...(topics ? { topics: draft.topics.trim() } : {}) };
        let lesson = existing;
        if (lesson) Object.assign(lesson, fields);
        else {
          lesson = { id: uid('l'), subjectId: subject.id, progress: {}, created: now, ...fields };
          store.lessons.push(lesson);
        }
        store.save('lessons');
        delete app.ui.lessonDraft[draftKey];
        const exercises = exercisesOf(lesson).length;
        app.toast(existing ? 'Lesson updated.' : `Lesson created with ${exercises ? `${plural(exercises, 'exercise')} and ` : ''}${plural(cardsOf(lesson).length, 'flashcard')}.`, { kind: 'success' });
        app.go(`lesson/${encodeURIComponent(lesson.id)}`, { replace: true });
      });
    },
  };
}

function slideBadge(lesson, n) {
  if (!n) return '';
  const href = slideHref(lesson.link, n);
  const label = unitLabel(lesson, n);
  return href
    ? html`<a class="slide-badge" href="${href}" target="_blank" rel="noopener noreferrer" title="Open ${label.toLowerCase()}">${label}${icon('external')}</a>`
    : html`<span class="slide-badge">${label}</span>`;
}

const cardFront = c => (c.type === 'cloze' ? clozeParts(c.text).join('____') : c.type === 'when' ? c.event : c.type === 'visual' ? c.description : c.q);
const cardBack = c => (c.type === 'cloze' ? clozeAnswer(c.text) : c.type === 'when' ? c.date : c.a);
const CARD_LABELS = { term: 'Term', qa: 'Question', cloze: 'Fill in', choice: 'Choice', compare: 'Compare', when: 'When?', visual: 'Picture' };

const PARTS = [
  { key: 'notes', label: 'Notes', has: d => d.overview || d.notes },
  { key: 'exercises', label: 'Exercises', has: d => d.exercises?.length },
  { key: 'visuals', label: 'Visuals', has: d => d.visuals.length },
  { key: 'timeline', label: 'Timeline', has: d => d.timeline.length },
  { key: 'terms', label: 'Terms', has: d => d.terms.length },
  { key: 'answers', label: 'Q&A', has: d => d.answers.length },
  { key: 'cards', label: 'Cards', has: () => true },
];

function partBody(app, lesson, part) {
  const d = lesson.data;
  if (part === 'visuals') {
    return html`<div class="card note-list">${d.visuals.map(v => html`<div class="visual-row">
      <span class="assistant-icon">${icon(VISUAL_ICONS[v.kind] || 'eye')}</span>
      <span class="note-row-main"><strong>${v.title || v.kind}</strong><small class="visual-kind">${v.kind}</small><span class="visual-desc">${v.description}</span></span>
      ${slideBadge(lesson, v.slide)}
    </div>`)}</div>`;
  }
  if (part === 'timeline') {
    return html`<ol class="timeline">${d.timeline.map(t => html`<li>
      <span class="tl-date">${t.date}</span>
      <span class="tl-event">${t.event}${t.slide ? html` ${slideBadge(lesson, t.slide)}` : ''}</span>
    </li>`)}</ol>`;
  }
  if (part === 'terms') {
    return html`<dl class="card terms">${d.terms.map(t => html`<dt>${t.term}</dt><dd>${t.definition}</dd>`)}</dl>`;
  }
  if (part === 'answers') {
    return html`<div class="qa-list">${d.answers.map((a, i) => html`<section class="card qa-item">
      <div class="qa-q"><span class="qa-n">${i + 1}</span><strong>${a.question}</strong>${slideBadge(lesson, a.slide)}</div>
      <div class="md qa-a">${raw(markdown(a.answer))}</div>
    </section>`)}</div>`;
  }
  if (part === 'exercises') return exercisesPart(app, lesson);
  if (part === 'cards') {
    const cards = cardsOf(lesson);
    const s = summarize(cards, lesson.progress || {});
    return html`<section class="card">
        <header class="card-head"><h2>Flashcards</h2><span class="card-meta">${plural(s.total, 'card')}${s.due ? ` · ${s.due} due` : ''}</span></header>
        ${masteryBar(s.levels)}
        ${masteryLegend(s.levels)}
        <button class="btn btn-primary btn-block" data-study="smart">${icon('play')}Practise</button>
        <div class="deck-actions">
          <button class="btn btn-secondary" data-study="mistakes" ${s.mistakes ? '' : 'disabled'}>${icon('repeat')}Mistakes (${s.mistakes})</button>
          <button class="btn btn-secondary" data-study="all">${icon('target')}All cards</button>
        </div>
      </section>
      <section class="card note-list">${cards.map(c => html`<div class="card-row">
        <span class="card-type">${CARD_LABELS[c.type]}</span>
        <span class="note-row-main"><strong>${cardFront(c)}</strong><small>${cardBack(c)}</small></span>
        ${levelDots(lesson.progress?.[c.id])}
      </div>`)}</section>`;
  }
  return html`<section class="card">
      ${d.overview ? html`<p class="lesson-overview">${d.overview}</p>` : ''}
      ${d.notes ? html`<article class="md note-body">${raw(markdown(d.notes))}</article>` : ''}
    </section>`;
}

export function lessonView(app, { id, part }) {
  const lesson = app.lesson(id);
  const subject = lesson && app.subject(lesson.subjectId);
  if (!lesson || !subject) return { redirect: 'home' };
  const parts = PARTS.filter(p => p.has(lesson.data));
  const active = parts.some(p => p.key === part) ? part : parts[0].key;
  const base = `#/lesson/${encodeURIComponent(lesson.id)}`;
  const counts = { visuals: lesson.data.visuals.length, timeline: lesson.data.timeline.length, terms: lesson.data.terms.length, answers: lesson.data.answers.length, exercises: lesson.data.exercises?.length || 0, cards: cardsOf(lesson).length };

  const body = html`
    <section class="lesson-head">
      <a class="chip" href="#/subject/${encodeURIComponent(subject.id)}?tab=lessons"><span class="dot c-${subject.color}"></span>${subject.name}</a>
      <h2 class="task-title">${lesson.title}</h2>
      <div class="lesson-links">
        ${lesson.link ? html`<a class="btn btn-secondary btn-sm" href="${lesson.link}" target="_blank" rel="noopener noreferrer">${icon('external')}Open ${templateOf(lesson).source.noun}</a>` : ''}
        ${lesson.generator ? '' : html`<a class="btn btn-secondary btn-sm" href="#/newlesson/${encodeURIComponent(subject.id)}?lesson=${encodeURIComponent(lesson.id)}">${icon('refresh')}Replace answer</a>`}
        <button class="btn btn-ghost-danger btn-sm" data-delete>${icon('trash')}Delete</button>
      </div>
    </section>
    <nav class="part-tabs" aria-label="Lesson parts">${parts.map(p => html`<a class="chip ${p.key === active ? 'active' : ''}" href="${base}?part=${p.key}">${p.label}${counts[p.key] ? html`<span class="chip-count">${counts[p.key]}</span>` : ''}</a>`)}</nav>
    <div class="lesson-part">${partBody(app, lesson, active)}</div>`;

  return {
    title: 'Lesson',
    back: `subject/${encodeURIComponent(subject.id)}?tab=lessons`,
    tab: 'home',
    body,
    mount(root) {
      if (active === 'exercises') mountExercisesPart(app, lesson, root);
      root.querySelectorAll('[data-study]').forEach(btn => btn.addEventListener('click', () => {
        const mode = btn.dataset.study;
        startStudy(app, { lessons: [lesson], mode, count: mode === 'all' ? Infinity : 10, title: lesson.title });
      }));
      root.querySelector('[data-delete]').addEventListener('click', async () => {
        const ok = await app.confirm({ title: 'Delete this lesson?', text: `"${lesson.title}", its notes and flashcard progress are removed.${lesson.link ? ` The ${templateOf(lesson).source.noun} itself is not touched.` : ''}`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        store.lessons = store.lessons.filter(l => l !== lesson);
        store.save('lessons');
        app.go(`subject/${encodeURIComponent(subject.id)}?tab=lessons`);
      });
    },
  };
}
