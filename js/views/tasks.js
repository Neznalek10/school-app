import { store } from '../store.js';
import { typeOf, isTask, isOpen, isOverdue, firstLine, dayKey, parseDay, whenLabel, formatDay, sortEvents, shortMonth } from '../events.js';
import { markdown, plainText } from '../md.js';
import { html, raw, icon, plural, emptyState } from '../ui.js';
import { eventSheet } from './calendar.js';
import { sourceSheet, sourcesOf, hostOf, openFile, SOURCE_KINDS } from './sources.js';
import { timeAgo } from './parts.js';
import { checkHref, checkList } from './testcheck.js';

export const taskHref = ev => `#/task/${encodeURIComponent(ev.id)}`;
const STATUSES = [{ key: 'todo', label: 'To do' }, { key: 'done', label: 'Done' }, { key: 'all', label: 'All' }];
const KINDS = [{ key: 'all', label: 'Tests & homework' }, { key: 'test', label: 'Tests' }, { key: 'homework', label: 'Homework' }];

// Materials point at the subject's own notes and sources, so one textbook page can serve several tests.
export function materialsOf(app, ev) {
  return (ev.materials || []).map(m => {
    const item = m.kind === 'note' ? app.note(m.id) : m.kind === 'lesson' ? app.lesson(m.id) : store.sources.find(s => s.id === m.id);
    return item ? { kind: m.kind, item } : null;
  }).filter(Boolean);
}

function dueLabel(ev, today) {
  if (isOverdue(ev, today)) return `Overdue · ${whenLabel(ev.date, today).toLowerCase()}`;
  if (ev.done) return ev.grade ? `Done · grade ${ev.grade}` : 'Done';
  return whenLabel(ev.date, today);
}

export function taskTable(app, list, { showSubject = true } = {}) {
  const today = dayKey();
  return html`<table class="task-table">
    <thead><tr>
      <th>Due</th><th>What</th>${showSubject ? html`<th class="wide">Subject</th>` : ''}<th class="t-num" title="Study materials">${icon('clip')}</th><th class="t-num">Done</th>
    </tr></thead>
    <tbody>${list.map(ev => {
      const type = typeOf(ev.type);
      const subject = app.subject(ev.subjectId);
      const d = parseDay(ev.date);
      const count = materialsOf(app, ev).length;
      const desc = firstLine(ev.description);
      return html`<tr class="task-row ${ev.done ? 'is-done' : ''} ${isOverdue(ev, today) ? 'is-overdue' : ''}" data-href="${taskHref(ev)}">
        <td class="t-due"><span class="ev-date ev-${type.key}"><strong>${d.getDate()}</strong><small>${shortMonth(ev.date)}</small></span></td>
        <td class="t-what">
          <a href="${taskHref(ev)}"><strong>${ev.title}</strong></a>
          <small>${showSubject ? html`<span class="narrow"><span class="dot c-${subject?.color}"></span>${subject?.name} · </span>` : ''}${type.label} · <span class="t-when">${dueLabel(ev, today)}</span>${ev.time ? ` · ${ev.time}` : ''}</small>
          ${desc ? html`<small class="t-desc">${desc}</small>` : ''}
        </td>
        ${showSubject ? html`<td class="wide"><span class="dot c-${subject?.color}"></span>${subject?.name}</td>` : ''}
        <td class="t-num t-mat">${count || html`<span class="muted">–</span>`}</td>
        <td class="t-num"><button type="button" class="tick ${ev.done ? 'on' : ''}" data-tick="${ev.id}" aria-pressed="${String(!!ev.done)}" aria-label="${ev.done ? 'Mark as not done' : 'Mark as done'}">${icon('check')}</button></td>
      </tr>`;
    })}</tbody>
  </table>`;
}

function filterTasks(app, { status = 'todo', kind = 'all', subject = null }) {
  const today = dayKey();
  const list = store.events.filter(e => isTask(e) && app.subject(e.subjectId)
    && (!subject || e.subjectId === subject)
    && (kind === 'all' || e.type === kind)
    && (status === 'all' || (status === 'todo') === isOpen(e, today)));
  const sorted = sortEvents(list);
  return status === 'todo' ? sorted : sorted.reverse();
}

// The same table serves the Tests tab (all subjects) and each subject's calendar; `base` keeps the filters on the right page.
export function tasksSection(app, { base, subject = null, status, kind, subjectFilter }) {
  const st = STATUSES.some(s => s.key === status) ? status : 'todo';
  const kd = KINDS.some(k => k.key === kind) ? kind : 'all';
  const only = subject?.id || (app.subject(subjectFilter) ? subjectFilter : null);
  const list = filterTasks(app, { status: st, kind: kd, subject: only });
  const link = (over = {}) => {
    const q = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(base.split('?')[1] || '')), status: st, kind: kd, ...(only && !subject ? { subject: only } : {}), ...over });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return `#/${base.split('?')[0]}?${q}`;
  };
  const used = subject ? [] : store.subjects.filter(s => store.events.some(e => isTask(e) && e.subjectId === s.id));
  const empty = {
    todo: { title: 'Nothing to do', text: 'No tests or homework ahead. Add one when it is announced.' },
    done: { title: 'Nothing done yet', text: 'Ticked-off homework and past tests show up here, with your grades.' },
    all: { title: 'No tests or homework yet', text: 'Add a test or homework, describe what it covers and attach your study materials.' },
  }[st];

  return html`
    <div class="task-filters">
      <div class="segmented seg-links">${STATUSES.map(s => html`<a class="${s.key === st ? 'active' : ''}" href="${link({ status: s.key })}">${s.label}</a>`)}</div>
      <div class="chips">${KINDS.map(k => html`<a class="chip ${k.key === kd ? 'active' : ''}" href="${link({ kind: k.key })}">${k.label}</a>`)}</div>
      ${used.length > 1 ? html`<div class="chips">${[{ id: '', name: 'All subjects' }, ...used].map(s => html`
        <a class="chip ${(s.id || null) === only ? 'active' : ''}" href="${link({ subject: s.id })}">${s.id ? html`<span class="dot c-${s.color}"></span>` : ''}${s.name}</a>`)}</div>` : ''}
    </div>
    <button class="btn btn-primary btn-block task-add" data-add-task="${kd === 'all' ? 'test' : kd}">${icon('plus')}Add ${kd === 'homework' ? 'homework' : kd === 'test' ? 'a test' : 'a test or homework'}</button>
    ${list.length
      ? html`<div class="card task-card">${taskTable(app, list, { showSubject: !subject })}</div>`
      : emptyState({ iconName: 'clipboard', ...empty })}`;
}

export function pickSubject(app, then) {
  app.sheet({
    title: 'Which subject?',
    body: html`<div class="lang-list">${store.subjects.map(s => html`
      <button class="lang-row" data-subject="${s.id}"><span class="dot c-${s.color}"></span><span class="lang-row-main"><strong>${s.name}</strong></span></button>`)}</div>`,
    onMount: (body, close) => body.addEventListener('click', e => {
      const row = e.target.closest('[data-subject]');
      if (!row) return;
      close();
      then(app.subject(row.dataset.subject));
    }),
  });
}

export function mountTasks(app, root, { subject = null } = {}) {
  root.querySelector('[data-add-task]')?.addEventListener('click', e => {
    const type = e.currentTarget.dataset.addTask;
    const open = s => eventSheet(app, s, null, { type });
    if (subject) open(subject);
    else pickSubject(app, open);
  });
  root.querySelectorAll('[data-tick]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const ev = store.events.find(x => x.id === btn.dataset.tick);
    ev.done = !ev.done;
    store.save('events');
    app.toast(ev.done ? `"${ev.title}" is done.` : `"${ev.title}" is back on your list.`, { kind: 'success' });
    app.render();
  }));
  root.querySelectorAll('.task-row').forEach(row => row.addEventListener('click', e => {
    if (!e.target.closest('a, button')) location.hash = row.dataset.href;
  }));
}

export function tasksView(app, params) {
  const open = store.events.filter(e => isTask(e) && app.subject(e.subjectId) && isOpen(e));
  const tests = open.filter(e => e.type === 'test').length;
  return {
    title: 'Tests & homework',
    body: html`<p class="muted task-summary">${open.length ? `${plural(tests, 'test')} and ${plural(open.length - tests, 'homework', 'homework')} to do` : 'Everything is done.'}</p>
      ${tasksSection(app, { base: 'tests', status: params.status, kind: params.kind, subjectFilter: params.subject })}`,
    mount: root => mountTasks(app, root),
  };
}

function materialRow(app, m) {
  const remove = html`<button class="icon-btn" data-detach="${m.kind}:${m.item.id}" aria-label="Remove from this test">${icon('x')}</button>`;
  if (m.kind === 'lesson') {
    return html`<div class="assistant-row"><a class="assistant-main" href="#/lesson/${encodeURIComponent(m.item.id)}">
      <span class="assistant-icon">${icon('learn')}</span><span class="note-row-main"><strong>${m.item.title}</strong><small>Lesson · notes and flashcards</small></span></a>${remove}</div>`;
  }
  if (m.kind === 'note') {
    return html`<div class="assistant-row"><a class="assistant-main" href="#/note/${encodeURIComponent(m.item.id)}">
      <span class="assistant-icon">${icon('notes')}</span><span class="note-row-main"><strong>${m.item.title || 'Untitled note'}</strong><small>Note · edited ${timeAgo(m.item.updated)}</small></span></a>${remove}</div>`;
  }
  const s = m.item;
  const kind = SOURCE_KINDS.find(k => k.key === s.kind) || SOURCE_KINDS[2];
  const main = html`<span class="assistant-icon">${icon(kind.icon)}</span><span class="note-row-main"><strong>${s.title}</strong><small>${[kind.label, s.kind === 'link' ? hostOf(s.url) : '', s.note].filter(Boolean).join(' · ')}</small></span>`;
  const open = s.kind === 'link'
    ? html`<a class="assistant-main" href="${s.url}" target="_blank" rel="noopener noreferrer">${main}</a>`
    : s.kind === 'file' ? html`<button type="button" class="assistant-main" data-open-file="${s.id}">${main}</button>` : html`<div class="assistant-main">${main}</div>`;
  return html`<div class="assistant-row source-row">${open}${remove}</div>`;
}

const attached = (ev, kind, id) => (ev.materials || []).some(m => m.kind === kind && m.id === id);

function toggle(ev, kind, id) {
  ev.materials ??= [];
  if (attached(ev, kind, id)) ev.materials = ev.materials.filter(m => !(m.kind === kind && m.id === id));
  else ev.materials.push({ kind, id });
  store.save('events');
}

function materialsSheet(app, ev, subject) {
  const notes = app.notesOf(subject.id).sort((a, b) => b.updated - a.updated);
  const lessons = store.lessons.filter(l => l.subjectId === subject.id).sort((a, b) => b.created - a.created);
  const sources = sourcesOf(subject.id).sort((a, b) => b.added - a.added);
  const row = (kind, item, label, sub, iconName) => html`<button class="lang-row ${attached(ev, kind, item.id) ? 'active' : ''}" data-pick="${kind}:${item.id}">
    <span class="assistant-icon">${icon(iconName)}</span><span class="lang-row-main"><strong>${label}</strong><small>${sub}</small></span><span class="pick-check">${icon('check')}</span></button>`;
  app.sheet({
    title: 'Study materials',
    body: html`
      <div class="sheet-stack">
        <button class="btn btn-secondary btn-block" data-new-note>${icon('notes')}Write a new note for this</button>
        <button class="btn btn-secondary btn-block" data-new-source>${icon('link')}Add a website, file or book</button>
      </div>
      ${notes.length || sources.length || lessons.length ? html`<div class="field-label">Or tick what you already have in ${subject.name}</div>
        <div class="lang-list">
          ${lessons.map(l => row('lesson', l, l.title, 'Lesson · notes and flashcards', 'learn'))}
          ${notes.map(n => row('note', n, n.title || 'Untitled note', `Note · ${plainText(n.body).slice(0, 50) || 'empty'}`, 'notes'))}
          ${sources.map(s => row('source', s, s.title, SOURCE_KINDS.find(k => k.key === s.kind)?.label || '', SOURCE_KINDS.find(k => k.key === s.kind)?.icon || 'book'))}
        </div>` : html`<p class="muted small">Notes and sources you save in ${subject.name} can be ticked here too.</p>`}`,
    onMount(body, close) {
      body.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', () => {
        const [kind, id] = btn.dataset.pick.split(':');
        toggle(ev, kind, id);
        btn.classList.toggle('active', attached(ev, kind, id));
      }));
      body.querySelector('[data-new-note]').addEventListener('click', () => {
        const note = app.newNote(subject.id, { title: `${ev.title}: notes` });
        toggle(ev, 'note', note.id);
        close();
        app.go(`note/${encodeURIComponent(note.id)}?edit=1`);
      });
      body.querySelector('[data-new-source]').addEventListener('click', () => {
        close();
        sourceSheet(app, subject, null, { onSave: source => toggle(ev, 'source', source.id) });
      });
    },
    onClose: () => app.render(),
  });
}

export function taskView(app, { id, edit }) {
  const ev = store.events.find(e => e.id === id);
  const subject = ev && app.subject(ev.subjectId);
  if (!ev || !subject || !isTask(ev)) return { redirect: 'tests' };
  const type = typeOf(ev.type);
  const today = dayKey();
  const materials = materialsOf(app, ev);
  const editing = edit === '1';
  const self = `task/${encodeURIComponent(ev.id)}`;
  const chat = assistant => `#/chat/${encodeURIComponent(subject.id)}/${assistant}?event=${encodeURIComponent(ev.id)}`;
  const isTest = ev.type === 'test';
  const checks = app.checksOf(subject.id).filter(c => c.eventId === ev.id);

  const body = html`
    <section class="card task-head">
      <div class="task-badges">
        <span class="type-badge ev-${type.key}">${icon(type.icon)}${type.label}</span>
        <a class="chip" href="#/subject/${encodeURIComponent(subject.id)}?tab=calendar">${html`<span class="dot c-${subject.color}"></span>`}${subject.name}</a>
      </div>
      <h2 class="task-title">${ev.title}</h2>
      <div class="task-when ${isOverdue(ev, today) ? 'is-overdue' : ''}">${icon('calendar')}${formatDay(ev.date, { weekday: 'long', day: 'numeric', month: 'long' })}${ev.time ? ` · ${ev.time}` : ''} · ${dueLabel(ev, today)}</div>
      <div class="task-actions">
        <button class="btn ${ev.done ? 'btn-secondary' : 'btn-primary'}" data-done>${icon('check')}${ev.done ? 'Done · undo' : isTest ? 'Mark as written' : 'Mark as done'}</button>
        <button class="btn btn-secondary" data-edit>${icon('edit')}Edit</button>
      </div>
      ${isTest ? html`<label class="task-grade"><span>Grade</span><input class="input" name="grade" maxlength="12" value="${ev.grade || ''}" placeholder="e.g. A, 2, 85 %" autocomplete="off"></label>` : ''}
    </section>

    <section class="card">
      <header class="card-head"><h2>${isTest ? 'What the test covers' : 'What to do'}</h2>
        <a class="card-link" href="#/${self}${editing ? '' : '?edit=1'}" data-desc-toggle>${editing ? 'Done' : 'Edit'}</a></header>
      ${editing
        ? html`<textarea class="input textarea task-desc-input" name="description" rows="8" placeholder="${isTest ? 'e.g.\n- Chapters 3 to 5: cell structure, mitosis\n- Know the diagram of a plant cell\n- Oral part: explain osmosis' : 'e.g. Exercise 4 to 7 on page 52, hand in on paper'}">${ev.description || ''}</textarea>
          <p class="muted small">Formatting: # heading, - bullet, **bold**. Saved as you type.</p>`
        : ev.description?.trim()
          ? html`<article class="md task-desc">${raw(markdown(ev.description))}</article>`
          : html`<p class="muted">Nothing written yet. Tap Edit and describe ${isTest ? 'what the test covers' : 'the task'}, so you and the AI know what to study.</p>`}
    </section>

    <section class="card">
      <header class="card-head"><h2>Study materials</h2><span class="card-meta">${plural(materials.length, 'item')}</span></header>
      ${materials.length
        ? html`<div class="assistant-list">${materials.map(m => materialRow(app, m))}</div>`
        : html`<p class="muted">Attach notes, worksheets, photos of the textbook, websites or book pages you will study from.</p>`}
      <button class="btn btn-secondary btn-block" data-materials>${icon('clip')}Add study materials</button>
    </section>

    <section class="card">
      <header class="card-head"><h2>${isTest ? 'Prepare with AI' : 'Get help with AI'}</h2></header>
      <p class="muted small">The assistant reads the description and your attached notes.</p>
      <div class="assistant-list">
        ${(isTest
          ? [['quiz', 'target', 'Quiz me for this test'], ['sheet', 'notes', 'Make a study sheet from my materials'], ['tutor', 'learn', 'Explain what I don\'t understand']]
          : [['tutor', 'learn', 'Help me with this homework'], ['check', 'check', 'Check my answer']]).map(([a, i, label]) => html`<div class="assistant-row">
          <a class="assistant-main" href="${chat(a)}"><span class="assistant-icon">${icon(i)}</span><span class="note-row-main"><strong>${label}</strong></span></a>${icon('chevronRight', 'chevron')}</div>`)}
      </div>
    </section>

    ${isTest ? html`<section class="card">
      <header class="card-head"><h2>Marked test</h2>${checks.length ? html`<span class="card-meta">${plural(checks.length, 'result')}</span>` : ''}</header>
      <p class="muted small">Photograph the marked test: the AI gives the correct answers and explains each miss.</p>
      ${checks.length ? checkList(checks) : ''}
      <a class="btn btn-secondary btn-block" href="${checkHref(subject.id, { event: ev.id })}">${icon('clipboard')}Check my marked test</a>
    </section>` : ''}`;

  let timer;
  let root;
  const flush = () => {
    clearTimeout(timer);
    const area = root?.querySelector('[name=description]');
    if (!area || area.value === (ev.description || '')) return;
    ev.description = area.value;
    store.save('events');
  };
  const onHide = () => flush();

  return {
    title: type.label,
    back: 'tests',
    tab: 'tests',
    body,
    mount(container) {
      root = container;
      window.addEventListener('pagehide', onHide);
      const area = root.querySelector('[name=description]');
      area?.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(flush, 400);
      });
      area?.focus({ preventScroll: true });
      root.querySelector('[data-desc-toggle]').addEventListener('click', flush);
      root.querySelector('[data-done]').addEventListener('click', () => {
        ev.done = !ev.done;
        store.save('events');
        app.render();
      });
      root.querySelector('[data-edit]').addEventListener('click', () => eventSheet(app, subject, ev, { onSave: () => app.render(), onDelete: () => app.go('tests') }));
      root.querySelector('[name=grade]')?.addEventListener('change', e => {
        ev.grade = e.target.value.trim();
        if (ev.grade) ev.done = true;
        store.save('events');
        app.render();
      });
      root.querySelector('[data-materials]').addEventListener('click', () => materialsSheet(app, ev, subject));
      root.querySelectorAll('[data-detach]').forEach(btn => btn.addEventListener('click', () => {
        const [kind, mid] = btn.dataset.detach.split(':');
        toggle(ev, kind, mid);
        app.render();
      }));
      root.querySelectorAll('[data-open-file]').forEach(btn => btn.addEventListener('click', () => openFile(app, store.sources.find(s => s.id === btn.dataset.openFile))));
    },
    leave() {
      window.removeEventListener('pagehide', onHide);
      flush();
    },
  };
}
