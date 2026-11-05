import { store } from '../store.js';
import { markdown } from '../md.js';
import { html, raw, icon } from '../ui.js';
import { timeAgo } from './parts.js';

const isEmpty = n => !n.title.trim() && !n.body.trim();

export function noteView(app, { id, edit }) {
  const note = app.note(id);
  if (!note) return { redirect: 'notes' };
  const subject = app.subject(note.subjectId);
  const editing = edit === '1' || isEmpty(note);
  const back = subject ? `subject/${encodeURIComponent(subject.id)}` : 'notes';
  const self = `note/${encodeURIComponent(note.id)}`;

  const body = html`
    <div class="note-meta">${subject ? html`<a class="note-subject" href="#/${back}"><span class="dot c-${subject.color}"></span>${subject.name}</a>` : ''}<span class="muted small note-saved">Edited ${timeAgo(note.updated)}</span></div>
    ${editing
      ? html`<input class="note-title-input" name="title" maxlength="120" placeholder="Title" value="${note.title}" autocomplete="off">
        <textarea class="note-body-input" name="body" placeholder="Write your notes here. # Heading, - bullet, **bold** and \`code\` are formatted when you tap Done.">${note.body}</textarea>`
      : html`<h2 class="note-title">${note.title || 'Untitled note'}</h2>
        <article class="md note-body">${note.body.trim() ? raw(markdown(note.body)) : html`<p class="muted">Empty note. Tap Edit to write.</p>`}</article>`}
    <div class="note-actions">
      ${subject ? html`<a class="btn btn-secondary" href="#/chat/${encodeURIComponent(subject.id)}/tutor?note=${encodeURIComponent(note.id)}">${icon('sparkle')}Ask the tutor</a>
        <a class="btn btn-secondary" href="#/chat/${encodeURIComponent(subject.id)}/quiz?note=${encodeURIComponent(note.id)}">${icon('target')}Quiz me on it</a>` : ''}
      <button class="btn btn-ghost-danger" data-delete>${icon('trash')}Delete</button>
    </div>`;

  let timer;
  const flush = root => {
    clearTimeout(timer);
    const title = root?.querySelector('[name=title]');
    if (!title) return;
    const text = root.querySelector('[name=body]').value;
    if (title.value === note.title && text === note.body) return;
    note.title = title.value;
    note.body = text;
    note.updated = Date.now();
    store.save('notes');
  };
  let root;
  const onHide = () => flush(root);

  return {
    title: editing ? 'Edit note' : '',
    back,
    tab: 'notes',
    action: html`<a class="btn btn-sm ${editing ? 'btn-primary' : 'btn-secondary'}" href="#/${self}${editing ? '' : '?edit=1'}" data-toggle>${icon(editing ? 'check' : 'edit')}${editing ? 'Done' : 'Edit'}</a>`,
    body,
    mount(container, topbar) {
      root = container;
      const fields = root.querySelectorAll('[name=title], [name=body]');
      fields.forEach(f => f.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          flush(root);
          root.querySelector('.note-saved').textContent = 'Saved';
        }, 400);
      }));
      const area = root.querySelector('[name=body]');
      const grow = () => {
        if (!area) return;
        area.style.height = 'auto';
        area.style.height = `${Math.max(area.scrollHeight, 260)}px`;
      };
      area?.addEventListener('input', grow);
      grow();
      if (editing) (note.title ? area : root.querySelector('[name=title]')).focus({ preventScroll: true });
      // The last keystrokes are still waiting for the debounce when Done is tapped or the tab is closed.
      window.addEventListener('pagehide', onHide);
      topbar.querySelector('[data-toggle]').addEventListener('click', () => flush(root));
      root.querySelector('[data-delete]').addEventListener('click', async () => {
        const ok = isEmpty(note) || await app.confirm({ title: 'Delete this note?', text: `"${note.title || 'Untitled note'}" is removed from this device. This can't be undone.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        store.notes = store.notes.filter(n => n !== note);
        store.save('notes');
        app.go(back);
      });
    },
    // A note that was opened with New note and left empty isn't worth keeping.
    leave() {
      window.removeEventListener('pagehide', onHide);
      flush(root);
      if (isEmpty(note) && store.notes.includes(note)) {
        store.notes = store.notes.filter(n => n !== note);
        store.save('notes');
      }
    },
  };
}
