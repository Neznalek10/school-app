/**
 * Subject page and its sheets: tabs (calendar, lessons, notes, sources, practice, AI), the New/Edit
 * subject sheet with starter kits, and the custom assistant sheet.
 *
 * Responsibility: the #/subject/<id> route and the sheets that create or edit subjects and assistants.
 * Fits in: routed from js/app.js; panels come from calendar.js, lessons.js, sources.js, chem.js and
 * exercises.js; subjectSheet is also opened from the home view; data from store.js and subjects.js.
 * Invariants: creating a subject always ends on its setup page; the kit lessons are added once
 * per subject (addBuiltInLesson refuses duplicates).
 */
import { store, uid } from '../store.js';
import { APPS, appUrl, appStats } from '../apps.js';
import { aiReady, aiSettings, externalPrompt } from '../ai.js';
import { COLORS, SUBJECT_ICONS, kitsFor, assistantsOf, hasTool, subjectFromKit } from '../subjects.js';
import { addBuiltInLesson } from '../soustavy.js';
import { html, icon, plural, pct, segmented, onSegmented, emptyState, masteryBar } from '../ui.js';
import { upcoming, whenLabel, isTask, isOpen } from '../events.js';
import { deleteFile } from '../files.js';
import { timeAgo, subjectIcon, noteRow, copyText } from './parts.js';
import { contextNotes } from './chat.js';
import { calendarPanel, mountCalendar, eventsOf, calendarHref } from './calendar.js';
import { sourcesPanel, mountSources, sourcesOf } from './sources.js';
import { taskHref } from './tasks.js';
import { lessonsPanel, mountLessons, lessonsOf, lessonStats, lessonHref } from './lessons.js';
import { startStudy } from './study.js';
import { checkHref, checkList } from './testcheck.js';
import { chemPracticeCard } from './chem.js';
import { exerciseStats, startExercises } from './exercises.js';
import { bindDraft } from '../drafts.js';
import { formatDate } from '../locale.js';
import { isCzechSchool } from '../locale.js';

const chatKey = (subjectId, assistantId) => `${subjectId}/${assistantId}`;

/**
 * Opens the New subject / Edit subject sheet.
 *
 * When creating, a "Start from" chip row offers the starter kits; picking one fills the name, icon and
 * colour (all still editable). Creating a subject adds its kit's built-in lessons and opens its setup page.
 *
 * @param {object} app The app shell.
 * @param {object|null} [subject] The subject to edit; null creates a new one.
 */
export function subjectSheet(app, subject = null) {
  const kits = kitsFor(isCzechSchool());
  let kit = null;
  let iconName = subject?.icon || 'book';
  let color = subject?.color || COLORS[store.subjects.length % COLORS.length];
  app.sheet({
    title: subject ? 'Edit subject' : 'New subject',
    body: html`<form class="subject-form" novalidate>
      ${subject ? '' : html`<div class="field-label" id="kit-label">Start from</div>
        <div class="chips wrap kit-row" role="group" aria-labelledby="kit-label">
          <button type="button" class="chip active" data-kit="">None</button>
          ${kits.map(k => html`<button type="button" class="chip" data-kit="${k.id}">${icon(k.icon)}${k.name}</button>`)}
        </div>`}
      <label class="field-label" for="subject-name">Name</label>
      <input class="input" id="subject-name" name="name" maxlength="40" value="${subject?.name || ''}" placeholder="e.g. Civics" autocomplete="off">
      <div class="field-label">Icon</div>
      <div class="pick-grid">${SUBJECT_ICONS.map(i => html`<button type="button" class="pick ${i === iconName ? 'active' : ''}" data-icon="${i}" aria-label="${i}">${icon(i)}</button>`)}</div>
      <div class="field-label">Colour</div>
      <div class="pick-grid">${COLORS.map(c => html`<button type="button" class="pick pick-color c-${c} ${c === color ? 'active' : ''}" data-color="${c}" aria-label="${c}"></button>`)}</div>
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-block btn-lg" type="submit">${subject ? 'Save' : 'Add subject'}</button>
      ${subject ? html`<button class="btn btn-ghost-danger btn-block" type="button" data-delete>${icon('trash')}Delete subject</button>` : ''}
    </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const draft = bindDraft(form, `subject:${subject?.id || 'new'}`);
      // Marks the button whose data-<attr> equals `value` as the active one of its group.
      const mark = (attr, value) => body.querySelectorAll(`[data-${attr}]`).forEach(b => b.classList.toggle('active', b.dataset[attr] === value));
      const pick = (attr, set) => body.querySelectorAll(`[data-${attr}]`).forEach(btn => btn.addEventListener('click', () => {
        set(btn.dataset[attr]);
        mark(attr, btn.dataset[attr]);
      }));
      pick('icon', v => { iconName = v; });
      pick('color', v => { color = v; });
      // A kit prefills the name, icon and colour; "None" keeps whatever is typed and picked.
      pick('kit', id => {
        kit = kits.find(k => k.id === id) || null;
        if (!kit) return;
        form.name.value = kit.name;
        iconName = kit.icon;
        color = kit.color;
        mark('icon', iconName);
        mark('color', color);
      });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const name = form.name.value.trim().replace(/\s+/g, ' ');
        const error = body.querySelector('.form-error');
        const clash = store.subjects.find(s => s !== subject && s.name.toLowerCase() === name.toLowerCase());
        if (!name || clash) {
          error.textContent = name ? `You already have ${clash.name}.` : 'Give the subject a name.';
          error.hidden = false;
          return;
        }
        const created = subject ? null : subjectFromKit(kit, { name, icon: iconName, color, id: uid('s') });
        if (subject) Object.assign(subject, { name, icon: iconName, color });
        else {
          store.subjects.push(created);
          for (const lessonId of kit?.lessons || []) addBuiltInLesson(store.lessons, created.id, lessonId);
          store.save('lessons');
        }
        store.save('subjects');
        draft.clear();
        app.refreshSide();
        close();
        // A new subject opens its setup page so the student can personalise it right away.
        if (created) app.go(`setup/${encodeURIComponent(created.id)}`);
        else app.render();
      });
      body.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        const notes = app.notesOf(subject.id).length;
        const ok = await app.confirm({
          title: `Delete ${subject.name}?`,
          text: `The subject, its ${plural(notes, 'note')}, calendar, sources and AI chats are removed from this device.${subject.apps?.length ? ' Your progress inside the language apps stays.' : ''} This can't be undone.`,
          confirmLabel: 'Delete subject',
          danger: true,
        });
        if (!ok) return;
        store.subjects = store.subjects.filter(s => s !== subject);
        store.notes = store.notes.filter(n => n.subjectId !== subject.id);
        store.events = store.events.filter(e => e.subjectId !== subject.id);
        for (const s of sourcesOf(subject.id)) if (s.fileId) deleteFile(s.fileId);
        store.sources = store.sources.filter(s => s.subjectId !== subject.id);
        store.lessons = store.lessons.filter(l => l.subjectId !== subject.id);
        store.checks = store.checks.filter(c => c.subjectId !== subject.id);
        for (const key of Object.keys(store.chats)) if (key.startsWith(`${subject.id}/`)) delete store.chats[key];
        ['subjects', 'notes', 'events', 'sources', 'lessons', 'checks', 'chats'].forEach(k => store.save(k));
        app.refreshSide();
        app.toast(`Deleted ${subject.name}.`, { kind: 'success' });
        app.go('home');
      });
    },
  });
}

export function assistantSheet(app, subject, assistant = null) {
  let useNotes = assistant ? assistant.useNotes : true;
  app.sheet({
    title: assistant ? 'Edit assistant' : 'New assistant',
    body: html`<form class="assistant-form" novalidate>
      <label class="field-label" for="as-name">Name</label>
      <input class="input" id="as-name" name="name" maxlength="40" value="${assistant?.name || ''}" placeholder="e.g. Essay coach" autocomplete="off">
      <label class="field-label" for="as-prompt">Instructions</label>
      <textarea class="input textarea" id="as-prompt" name="prompt" rows="7" maxlength="4000" placeholder="e.g. You help me write essays for {subject}. Ask me for the topic, then give me an outline and check each paragraph I write.">${assistant?.prompt || ''}</textarea>
      <p class="muted small">Write what the AI should do, as if briefing a tutor. {subject} becomes "${subject.name}".</p>
      <div class="field-label">Give it my ${subject.name} notes</div>
      ${segmented('notes', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], useNotes ? 'yes' : 'no')}
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-block btn-lg" type="submit">${assistant ? 'Save' : 'Create assistant'}</button>
      ${assistant ? html`<button class="btn btn-ghost-danger btn-block" type="button" data-delete>${icon('trash')}Delete assistant</button>` : ''}
    </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const draft = bindDraft(form, `assistant:${subject.id}:${assistant?.id || 'new'}`);
      onSegmented(body, (name, value) => { useNotes = value === 'yes'; });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const name = form.name.value.trim().replace(/\s+/g, ' ');
        const prompt = form.prompt.value.trim();
        const error = body.querySelector('.form-error');
        if (!name || !prompt) {
          error.textContent = 'Give the assistant a name and instructions.';
          error.hidden = false;
          return;
        }
        subject.assistants ??= [];
        if (assistant) Object.assign(subject.assistants.find(a => a.id === assistant.id), { name, prompt, useNotes });
        else subject.assistants.push({ id: uid('c'), name, prompt, useNotes });
        store.save('subjects');
        draft.clear();
        close();
        app.render();
      });
      body.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        const ok = await app.confirm({ title: `Delete ${assistant.name}?`, text: 'The assistant and its chat are removed.', confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        subject.assistants = subject.assistants.filter(a => a.id !== assistant.id);
        delete store.chats[chatKey(subject.id, assistant.id)];
        store.save('subjects');
        store.save('chats');
        app.render();
      });
    },
  });
}

/**
 * The card at the top of a subject that links to the setup page.
 *
 * @param {object} subject The subject.
 * @returns {object|string} html`` fragment: the invitation before setup, a compact "Profile and setup" row after it,
 *   or '' for language-app subjects (those are not personalised).
 */
function setupCard(subject) {
  if (subject.apps?.length) return '';
  const href = `#/setup/${encodeURIComponent(subject.id)}`;
  // After setup the same card stays reachable so the student can read the profile or run the interview again.
  const [title, line] = subject.setupAt
    ? ['Profile and setup', `Set up with AI on ${formatDate(subject.setupAt, { day: 'numeric', month: 'short', year: 'numeric' })}. Run the interview again to change it.`]
    : ['Set up with AI', `A short interview tailors ${subject.name}'s plan, assistants and tools to your class`];
  return html`<a class="card prompts-link setup-card" href="${href}">
    <span class="assistant-icon">${icon('sparkle')}</span>
    <span class="note-row-main"><strong>${title}</strong><small>${line}</small></span>
    ${icon('chevronRight', 'chevron')}
  </a>`;
}

function appsSection(subject) {
  const keys = (subject.apps || []).filter(k => APPS[k]);
  if (!keys.length) return '';
  return html`<div class="app-grid">${keys.map(k => {
    const a = APPS[k];
    const s = appStats(k, store.account.id);
    const line = s.started
      ? `Today ${plural(s.today, 'answer')} · ${plural(s.mastered, 'word')} mastered${s.streak ? ` · ${plural(s.streak, 'day')} streak` : ''}`
      : 'Not opened yet';
    return html`<a class="app-card" href="${appUrl(k, store.account, `#/subject/${encodeURIComponent(subject.id)}`)}">
      <span class="app-flag">${a.flag}</span>
      <span class="app-main"><strong>${a.name}</strong><small>${a.blurb}</small><small class="app-stats">${line}</small></span>
      ${icon('chevronRight', 'chevron')}
    </a>`;
  })}</div>`;
}

function notesPanel(app, subject) {
  const notes = app.notesOf(subject.id).sort((a, b) => b.updated - a.updated);
  return html`
    <div class="toolbar">
      <label class="search toolbar-search">${icon('search')}<input type="search" placeholder="Search ${plural(notes.length, 'note')}" aria-label="Search notes"></label>
      <button class="btn btn-primary" data-new-note>${icon('plus')}New note</button>
    </div>
    ${notes.length
      ? html`<div class="card note-list">${notes.map(n => noteRow(app, n, { showSubject: false }))}</div><p class="no-results" hidden>No notes match your search.</p>`
      : emptyState({ iconName: 'notes', title: 'No notes yet', text: `Write down what you learn in ${subject.name}. The AI assistants can use these notes.` })}`;
}

function aiPanel(app, subject) {
  const ready = aiReady(aiSettings());
  return html`
    <a class="card prompts-link" href="#/prompts/${encodeURIComponent(subject.id)}">
      <span class="assistant-icon">${icon('copy')}</span>
      <span class="note-row-main"><strong>Copy-paste prompts</strong><small>Every assistant as a ready prompt for ChatGPT, Gemini or Claude, with your notes inside</small></span>
      ${icon('chevronRight', 'chevron')}
    </a>
    ${ready ? '' : html`<a class="notice notice-warn notice-link" href="#/account">${icon('alert')}<span>To chat here, add your free OpenRouter key in Account. Or use the copy buttons with ChatGPT or Gemini.</span></a>`}
    <div class="card assistant-list">${assistantsOf(subject).map(a => {
      const chat = store.chats[chatKey(subject.id, a.id)];
      return html`<div class="assistant-row">
        <a class="assistant-main" href="#/chat/${encodeURIComponent(subject.id)}/${encodeURIComponent(a.id)}">
          <span class="assistant-icon">${icon(a.icon)}</span>
          <span class="note-row-main"><strong>${a.name}</strong><small>${chat?.messages?.length ? `Last chat ${timeAgo(chat.updated)}` : a.blurb}</small></span>
        </a>
        <button class="icon-btn" data-copy-agent="${a.id}" aria-label="Copy the ${a.name} prompt for ChatGPT or Gemini" title="Copy for ChatGPT or Gemini">${icon('copy')}</button>
        ${a.preset ? '' : html`<button class="icon-btn" data-edit-assistant="${a.id}" aria-label="Edit ${a.name}">${icon('edit')}</button>`}
      </div>`;
    })}</div>
    <button class="btn btn-secondary btn-block" data-new-assistant>${icon('sparkle')}Create your own assistant</button>`;
}

function flashcardsSection(app, subject) {
  const lessons = lessonsOf(subject.id);
  if (!lessons.length) return '';
  return html`<h3 class="group-title">Flashcards<span>${plural(lessons.length, 'lesson')}</span></h3>
    <div class="card note-list">${lessons.map(l => {
      const s = lessonStats(l);
      return html`<div class="assistant-row">
        <a class="assistant-main" href="${lessonHref(l)}?part=cards"><span class="assistant-icon">${icon('learn')}</span>
          <span class="note-row-main"><strong>${l.title}</strong><small>${plural(s.total, 'card')} · ${pct(s.levels.mastered, s.total)}% mastered${s.due ? ` · ${s.due} due` : ''}</small>${masteryBar(s.levels, { thin: true })}</span></a>
        <button class="btn btn-secondary btn-sm" data-study-lesson="${l.id}">${icon('play')}Practise</button>
      </div>`;
    })}</div>
    ${lessons.length > 1 ? html`<button class="btn btn-primary btn-block" data-study-all>${icon('play')}Mix all ${subject.name} lessons</button>` : ''}`;
}

function exercisesSection(subject) {
  const lessons = lessonsOf(subject.id).filter(l => l.data.exercises?.length);
  if (!lessons.length) return '';
  return html`<h3 class="group-title">Exercises<span>with step-by-step solutions</span></h3>
    <div class="card note-list">${lessons.map(l => {
      const s = exerciseStats([l]).summary;
      return html`<div class="assistant-row">
        <a class="assistant-main" href="${lessonHref(l)}?part=exercises"><span class="assistant-icon">${icon('math')}</span>
          <span class="note-row-main"><strong>${l.title}</strong><small>${plural(s.total, 'exercise')} · ${s.total - s.levels.new} tried${s.mistakes ? ` · ${s.mistakes} to redo` : ''}</small>${masteryBar(s.levels, { thin: true })}</span></a>
        <button class="btn btn-secondary btn-sm" data-ex-lesson="${l.id}">${icon('play')}Solve</button>
      </div>`;
    })}</div>
    ${lessons.length > 1 ? html`<button class="btn btn-primary btn-block" data-ex-all>${icon('play')}Mix exercises from all lessons</button>` : ''}`;
}

/**
 * The subject's topics, tolerating a missing or damaged `topics` value.
 *
 * @param {object} subject The subject.
 * @returns {object[]} The topics array, or an empty one.
 */
const topicsOf = subject => (Array.isArray(subject.topics) ? subject.topics : []);

/**
 * The inside of the "Topics this year" card: heading with the progress, then one row per topic with a tick.
 *
 * @param {object} subject The subject; its `topics` are [{ id, title, detail, done }].
 * @returns {object} html`` fragment.
 */
function topicsContent(subject) {
  const topics = topicsOf(subject);
  const done = topics.filter(t => t.done).length;
  return html`<header class="card-head"><h2>Topics this year</h2><span class="card-meta">${done} of ${topics.length} done</span></header>
    ${topics.map(t => html`<div class="topic-row ${t.done ? 'is-done' : ''}">
      <button type="button" class="tick ${t.done ? 'on' : ''}" data-topic="${t.id}" aria-pressed="${String(!!t.done)}" aria-label="${t.done ? 'Mark as not done' : 'Mark as done'}">${icon('check')}</button>
      <span class="note-row-main topic-main"><strong data-no-tr>${t.title}</strong>${t.detail ? html`<small data-no-tr>${t.detail}</small>` : ''}</span>
    </div>`)}`;
}

/**
 * The "Topics this year" card of the Lessons tab.
 *
 * @param {object} subject The subject.
 * @returns {object|string} html`` fragment, or '' when the subject has no topics.
 */
function topicsCard(subject) {
  return topicsOf(subject).length ? html`<section class="card topics-card">${topicsContent(subject)}</section>` : '';
}

/**
 * Makes the ticks of the topics card work: a tap flips `done`, saves the subjects and redraws the card in place.
 *
 * @param {HTMLElement} root The page container.
 * @param {object} subject The subject whose topics are shown; mutated on a tap.
 */
function mountTopics(root, subject) {
  const card = root.querySelector('.topics-card');
  if (!card) return;
  card.addEventListener('click', e => {
    const btn = e.target.closest('[data-topic]');
    const topic = btn && topicsOf(subject).find(t => t.id === btn.dataset.topic);
    if (!topic) return;
    topic.done = !topic.done;
    store.save('subjects');
    card.innerHTML = topicsContent(subject).s;
    // Matched by comparison, not by selector, because a topic id may hold characters a selector would misread.
    [...card.querySelectorAll('[data-topic]')].find(b => b.dataset.topic === topic.id)?.focus();
  });
}

function practicePanel(app, subject) {
  const chatHref = id => `#/chat/${encodeURIComponent(subject.id)}/${id}`;
  const test = upcoming(eventsOf(subject.id).filter(e => e.type === 'test' && isOpen(e)), { days: 30, limit: 1 })[0];
  const notes = app.notesOf(subject.id).length;
  const checks = app.checksOf(subject.id);
  const ai = [
    { href: checkHref(subject.id), icon: 'clipboard', name: 'Check a test from a photo', sub: 'Photograph a test to get the correct answers and see what to fix' },
    { href: chatHref('quiz'), icon: 'target', name: 'Quiz me', sub: notes ? `Questions from your ${plural(notes, 'note')}` : 'Questions on any topic you name' },
    { href: chatHref('check'), icon: 'check', name: 'Check my work', sub: 'Paste an answer or solution and get it marked' },
    { href: chatHref('sheet'), icon: 'notes', name: 'Study sheet', sub: 'Your notes as a sheet to revise from' },
  ];
  return html`
    ${test ? html`<a class="notice notice-test" href="${chatHref('quiz')}?event=${encodeURIComponent(test.id)}">${icon('target')}<span><strong>${test.title}</strong> is ${whenLabel(test.date).toLowerCase()}. Practise for it with a quiz on its study materials.</span>${icon('chevronRight')}</a>` : ''}
    ${hasTool(subject, 'nazvoslovi') ? chemPracticeCard() : ''}
    ${appsSection(subject)}
    ${exercisesSection(subject)}
    ${flashcardsSection(app, subject)}
    <h3 class="group-title">Practise with AI</h3>
    <div class="card assistant-list">${ai.map(a => html`<div class="assistant-row">
      <a class="assistant-main" href="${a.href}"><span class="assistant-icon">${icon(a.icon)}</span>
        <span class="note-row-main"><strong>${a.name}</strong><small>${a.sub}</small></span></a>${icon('chevronRight', 'chevron')}
    </div>`)}</div>
    ${checks.length ? html`<h3 class="group-title">Checked tests<span>${plural(checks.length, 'result')}</span></h3>
      <div class="card">${checkList(checks)}</div>` : ''}`;
}

const TABS = [
  { value: 'calendar', label: 'Calendar' },
  { value: 'lessons', label: 'Lessons' },
  { value: 'notes', label: 'Notes' },
  { value: 'sources', label: 'Sources' },
  { value: 'practice', label: 'Practice' },
  { value: 'ai', label: 'AI' },
];

export function subjectView(app, params) {
  const subject = app.subject(params.id);
  if (!subject) return { redirect: 'home' };
  // The last tab you used in a subject is where it opens next time; Languages opens on its apps.
  const remembered = app.ui.subjectTab[subject.id] || (subject.apps?.length || hasTool(subject, 'nazvoslovi') ? 'practice' : 'calendar');
  const active = TABS.some(t => t.value === params.tab) ? params.tab : remembered;
  app.ui.subjectTab[subject.id] = active;
  const next = upcoming(eventsOf(subject.id), { limit: 1 })[0];
  const counts = [plural(lessonsOf(subject.id).length, 'lesson'), plural(app.notesOf(subject.id).length, 'note'), plural(sourcesOf(subject.id).length, 'source'), plural(upcoming(eventsOf(subject.id)).length, 'event') + ' ahead'];
  const panels = {
    calendar: () => calendarPanel(app, subject, params),
    lessons: () => html`${topicsCard(subject)}${lessonsPanel(app, subject)}`,
    notes: () => notesPanel(app, subject),
    sources: () => sourcesPanel(subject),
    practice: () => practicePanel(app, subject),
    ai: () => aiPanel(app, subject),
  };

  const body = html`
    ${setupCard(subject)}
    <section class="subject-head">
      ${subjectIcon(subject, 'lg')}
      <div class="subject-head-main">
        <div class="eyebrow">${counts.join(' · ')}</div>
        ${next ? html`<a class="next-up" href="${isTask(next) ? taskHref(next) : calendarHref(subject, next.date)}">${icon('calendar')}<span>${next.title} · ${whenLabel(next.date)}</span></a>` : ''}
      </div>
    </section>
    <div class="subject-tabs">${segmented('tab', TABS, active)}</div>
    <div class="subject-panel">${panels[active]()}</div>`;

  return {
    title: subject.name,
    back: 'home',
    tab: 'home',
    action: html`<button class="icon-btn" data-edit-subject aria-label="Edit subject">${icon('dots')}</button>`,
    body,
    mount(root, topbar) {
      topbar.querySelector('[data-edit-subject]').addEventListener('click', () => subjectSheet(app, subject));
      root.querySelector('.subject-tabs').addEventListener('click', e => {
        const btn = e.target.closest('[data-value]');
        if (btn) app.go(`subject/${encodeURIComponent(subject.id)}?tab=${btn.dataset.value}`, { replace: true });
      });
      if (active === 'calendar') return mountCalendar(app, subject, root, params);
      if (active === 'sources') return mountSources(app, subject, root);
      if (active === 'lessons') {
        mountTopics(root, subject);
        return mountLessons(app, subject, root);
      }
      root.querySelectorAll('[data-study-lesson]').forEach(btn => btn.addEventListener('click', () => {
        const lesson = app.lesson(btn.dataset.studyLesson);
        startStudy(app, { lessons: [lesson], title: lesson.title });
      }));
      root.querySelector('[data-study-all]')?.addEventListener('click', () => startStudy(app, { lessons: lessonsOf(subject.id), title: `${subject.name} lessons` }));
      root.querySelectorAll('[data-ex-lesson]').forEach(btn => btn.addEventListener('click', () => {
        const lesson = app.lesson(btn.dataset.exLesson);
        startExercises(app, { lessons: [lesson], title: lesson.title });
      }));
      root.querySelector('[data-ex-all]')?.addEventListener('click', () => startExercises(app, { lessons: lessonsOf(subject.id).filter(l => l.data.exercises?.length), title: `${subject.name} exercises` }));
      root.querySelector('[data-new-note]')?.addEventListener('click', () => app.go(`note/${encodeURIComponent(app.newNote(subject.id).id)}?edit=1`));
      root.querySelector('[data-new-assistant]')?.addEventListener('click', () => assistantSheet(app, subject));
      root.querySelectorAll('[data-copy-agent]').forEach(btn => btn.addEventListener('click', () => {
        const assistant = assistantsOf(subject).find(a => a.id === btn.dataset.copyAgent);
        copyText(app, externalPrompt({
          assistant,
          subject,
          notes: contextNotes(app, subject, assistant.useNotes ? 'all' : 'none'),
          events: upcoming(eventsOf(subject.id), { days: 60 }),
          language: store.settings.aiLanguage,
        }), `${assistant.name} prompt copied${assistant.useNotes ? ' with your notes' : ''}. Paste it into ChatGPT or Gemini.`);
      }));
      root.querySelectorAll('[data-edit-assistant]').forEach(btn => btn.addEventListener('click', () => {
        assistantSheet(app, subject, subject.assistants.find(a => a.id === btn.dataset.editAssistant));
      }));
      const search = root.querySelector('input[type=search]');
      search?.addEventListener('input', () => {
        const term = search.value.trim().toLowerCase();
        let shown = 0;
        root.querySelectorAll('.note-row').forEach(row => {
          row.hidden = !!term && !row.dataset.search.includes(term);
          shown += !row.hidden;
        });
        const empty = root.querySelector('.no-results');
        if (empty) empty.hidden = shown > 0;
      });
    },
  };
}
