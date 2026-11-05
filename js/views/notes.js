import { store } from '../store.js';
import { html, icon, plural, emptyState } from '../ui.js';
import { noteRow } from './parts.js';

function pickSubject(app) {
  app.sheet({
    title: 'New note in…',
    body: html`<div class="lang-list">${store.subjects.map(s => html`
      <button class="lang-row" data-subject="${s.id}"><span class="dot c-${s.color}"></span><span class="lang-row-main"><strong>${s.name}</strong></span></button>`)}</div>`,
    onMount: (body, close) => body.addEventListener('click', e => {
      const row = e.target.closest('[data-subject]');
      if (!row) return;
      close();
      app.go(`note/${encodeURIComponent(app.newNote(row.dataset.subject).id)}?edit=1`);
    }),
  });
}

export function notesView(app, { subject: filter = 'all' }) {
  const used = store.subjects.filter(s => app.notesOf(s.id).length);
  const active = used.some(s => s.id === filter) ? filter : 'all';
  const notes = store.notes.filter(n => active === 'all' || n.subjectId === active).sort((a, b) => b.updated - a.updated);

  const body = html`
    ${used.length > 1 ? html`<div class="chips notes-chips">${[{ id: 'all', name: 'All' }, ...used].map(s => html`
      <a class="chip ${s.id === active ? 'active' : ''}" href="#/notes${s.id === 'all' ? '' : `?subject=${encodeURIComponent(s.id)}`}">${s.name}</a>`)}</div>` : ''}
    <div class="toolbar">
      <label class="search toolbar-search">${icon('search')}<input type="search" placeholder="Search ${plural(notes.length, 'note')}" aria-label="Search notes"></label>
      <button class="btn btn-primary" data-new>${icon('plus')}New</button>
    </div>
    ${notes.length
      ? html`<div class="card note-list">${notes.map(n => noteRow(app, n))}</div><p class="no-results" hidden>No notes match your search.</p>`
      : emptyState({ iconName: 'notes', title: 'No notes yet', text: 'Notes live inside subjects. Start one here or from any subject page.' })}`;

  return {
    title: 'Notes',
    body,
    mount(root) {
      root.querySelector('[data-new]').addEventListener('click', () => pickSubject(app));
      const search = root.querySelector('input[type=search]');
      search.addEventListener('input', () => {
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
