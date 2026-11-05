/**
 * Prompts page: every assistant's prompt of a subject, ready to copy into ChatGPT, Gemini or Claude.
 */
import { store } from '../store.js';
import { externalPrompt, languageName } from '../ai.js';
import { assistantsOf } from '../subjects.js';
import { TEMPLATES, planOf, promptFor } from '../study.js';
import { upcoming, typeOf, isTask } from '../events.js';
import { html, icon } from '../ui.js';
import { copyText } from './parts.js';
import { contextNotes, contextLabel } from './chat.js';
import { formatNumber } from '../locale.js';

const OPEN = [
  ['ChatGPT', 'https://chatgpt.com/'],
  ['Gemini', 'https://gemini.google.com/app'],
  ['Claude', 'https://claude.ai/new'],
];

// Every prompt of a subject, ready to paste into ChatGPT, Gemini or Claude, so the assistants work without an API key.
export function promptsView(app, { id, read, part }) {
  const subject = app.subject(id);
  if (!subject) return { redirect: 'home' };
  const tasks = upcoming(store.events.filter(e => e.subjectId === subject.id && isTask(e)));
  const lessons = store.lessons.filter(l => l.subjectId === subject.id);
  const notes = app.notesOf(subject.id);
  const choices = [
    { value: 'all', label: contextLabel(app, subject, 'all') },
    { value: 'none', label: 'No notes' },
    ...tasks.map(e => ({ value: `event:${e.id}`, label: `${typeOf(e.type).label}: ${e.title}` })),
    ...lessons.map(l => ({ value: `lesson:${l.id}`, label: `Lesson: ${l.title}` })),
    ...notes.map(n => ({ value: n.id, label: `Note: ${n.title || 'Untitled'}` })),
  ];
  const picked = choices.some(c => c.value === read);
  const context = picked ? read : 'all';
  const language = store.settings.aiLanguage;
  const events = upcoming(store.events.filter(e => e.subjectId === subject.id), { days: 60 });
  const plan = planOf(subject);

  // Assistants that don't need notes (the setup interview) only get them when the student picked a context.
  const notesFor = a => (a.useNotes === false && !picked ? [] : contextNotes(app, subject, context));

  const cards = [
    {
      key: 'lesson',
      name: `Lesson from ${TEMPLATES[plan.template].source.from}`,
      icon: 'learn',
      blurb: TEMPLATES[plan.template].source.blurb || `${TEMPLATES[plan.template].source.attach} Paste the answer in Lessons › New lesson to get notes and flashcards.`,
      text: promptFor(subject),
    },
    ...assistantsOf(subject).map(a => ({
      key: a.id,
      name: a.name,
      icon: a.icon,
      blurb: a.blurb,
      text: externalPrompt({ assistant: a, subject, notes: notesFor(a), events, language }),
    })),
  ];
  const active = cards.some(c => c.key === part) ? part : null;
  const base = `prompts/${encodeURIComponent(subject.id)}`;

  const body = html`
    <p class="muted prompts-intro">Paste one into ChatGPT, Gemini or Claude as the first message. ${subject.name}'s notes and upcoming tests are already filled in.</p>
    <section class="card settings">
      <label class="setting prompts-read">
        <span class="setting-text"><span class="setting-label">What the AI should read</span><span class="setting-hint">Answers in ${languageName(language)} (change in Account)</span></span>
        <select class="input" name="read">${choices.map(c => html`<option value="${c.value}" ${c.value === context ? 'selected' : ''}>${c.label}</option>`)}</select>
      </label>
    </section>
    ${cards.map((c, i) => html`<section class="card prompt-card ${c.key === active ? 'is-open' : ''}" id="prompt-${c.key}">
      <header class="prompt-head">
        <span class="assistant-icon">${icon(c.icon)}</span>
        <span class="note-row-main"><strong>${c.name}</strong><small>${c.blurb}</small></span>
      </header>
      <div class="wizard-actions">
        <button class="btn btn-primary" data-copy-prompt="${i}">${icon('copy')}Copy</button>
        ${OPEN.map(([label, url]) => html`<a class="btn btn-secondary btn-sm" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)}
      </div>
      <details class="help" ${c.key === active ? 'open' : ''}><summary>${icon('eye')}See the prompt · ${formatNumber(c.text.length)} characters</summary><pre class="prompt-preview">${c.text}</pre></details>
    </section>`)}`;

  return {
    title: `${subject.name} prompts`,
    back: `subject/${encodeURIComponent(subject.id)}?tab=ai`,
    tab: 'home',
    body,
    mount(root) {
      root.querySelector('[name=read]').addEventListener('change', e => app.go(`${base}?read=${encodeURIComponent(e.target.value)}`, { replace: true }));
      root.querySelectorAll('[data-copy-prompt]').forEach(btn => btn.addEventListener('click', () => {
        const card = cards[Number(btn.dataset.copyPrompt)];
        copyText(app, card.text, `${card.name} prompt copied. Paste it into ChatGPT, Gemini or Claude.`);
      }));
      if (active) root.querySelector(`#prompt-${active}`)?.scrollIntoView({ block: 'start' });
    },
  };
}
