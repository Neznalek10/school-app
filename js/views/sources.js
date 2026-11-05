/**
 * Subject sources: websites, uploaded files and books. Renders the list and the add/edit sheet, and opens stored files.
 * Invariant: uploaded files open in the browser only for SAFE_INLINE_TYPES; everything else is download-only.
 */
import { store, uid } from '../store.js';
import { putFile, getFile, deleteFile, fileSize, MAX_FILE_BYTES } from '../files.js';
import { html, icon, plural, segmented, onSegmented, emptyState } from '../ui.js';
import { bindDraft } from '../drafts.js';

export const SOURCE_KINDS = [
  { key: 'link', label: 'Website', plural: 'Websites', icon: 'link' },
  { key: 'file', label: 'File', plural: 'Files', icon: 'file' },
  { key: 'book', label: 'Book or other', plural: 'Books & other', icon: 'book' },
];
const kindOf = key => SOURCE_KINDS.find(k => k.key === key) || SOURCE_KINDS[2];

export const sourcesOf = subjectId => store.sources.filter(s => s.subjectId === subjectId);

// "wikipedia.org/wiki/Cell" becomes https://…; anything that isn't http(s) is refused so a saved link can't run script.
export function cleanUrl(input) {
  let text = String(input || '').trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

export const hostOf = url => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const fileLabel = s => [s.fileType?.split('/').pop()?.toUpperCase().slice(0, 6), s.size ? fileSize(s.size) : ''].filter(Boolean).join(' · ');

function sourceRow(s) {
  const kind = kindOf(s.kind);
  const sub = s.kind === 'link' ? hostOf(s.url) : s.kind === 'file' ? fileLabel(s) : '';
  const meta = [sub, s.note].filter(Boolean).join(' · ') || kind.label;
  const main = html`<span class="assistant-icon">${icon(kind.icon)}</span>
    <span class="note-row-main"><strong>${s.title}</strong><small>${meta}</small></span>`;
  const open = s.kind === 'link'
    ? html`<a class="assistant-main" href="${s.url}" target="_blank" rel="noopener noreferrer">${main}</a>`
    : html`<button type="button" class="assistant-main" data-${s.kind === 'file' ? 'open-file' : 'edit-source'}="${s.id}">${main}</button>`;
  return html`<div class="assistant-row source-row" data-kind="${s.kind}" data-search="${`${s.title} ${s.note || ''} ${s.url || ''}`.toLowerCase()}">
    ${open}
    <button class="icon-btn" data-edit-source="${s.id}" aria-label="Edit ${s.title}">${icon('edit')}</button>
  </div>`;
}

export function sourcesPanel(subject) {
  const list = sourcesOf(subject.id).sort((a, b) => b.added - a.added);
  const kinds = SOURCE_KINDS.filter(k => list.some(s => s.kind === k.key));
  return html`
    ${kinds.length > 1 ? html`<div class="chips notes-chips">${[{ key: 'all', plural: 'All' }, ...kinds].map(k => html`
      <button class="chip ${k.key === 'all' ? 'active' : ''}" data-kind-filter="${k.key}">${k.plural}</button>`)}</div>` : ''}
    <div class="toolbar">
      <label class="search toolbar-search">${icon('search')}<input type="search" placeholder="Search ${plural(list.length, 'source')}" aria-label="Search sources"></label>
      <button class="btn btn-primary" data-add-source>${icon('plus')}Add</button>
    </div>
    ${list.length
      ? html`<div class="card assistant-list">${list.map(sourceRow)}</div><p class="no-results" hidden>Nothing matches.</p>`
      : emptyState({ iconName: 'link', title: 'No sources yet', text: `Save the websites, worksheets, PDFs, photos and textbook pages you use for ${subject.name}.` })}`;
}

export function sourceSheet(app, subject, source = null, { onSave } = {}) {
  let kind = source?.kind || 'link';
  let picked = null;
  const show = body => body.querySelectorAll('[data-for]').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(kind); });
  app.sheet({
    title: source ? 'Edit source' : `New source in ${subject.name}`,
    body: html`<form class="source-form" novalidate>
      ${source ? '' : html`<div class="field-label">Kind</div>${segmented('kind', SOURCE_KINDS.map(k => ({ value: k.key, label: k.label })), kind)}`}
      <div data-for="link"><label class="field-label" for="src-url">Address</label>
        <input class="input" id="src-url" name="url" inputmode="url" autocapitalize="off" spellcheck="false" value="${source?.url || ''}" placeholder="e.g. cs.wikipedia.org/wiki/Buňka"></div>
      ${source ? '' : html`<div data-for="file"><div class="field-label">File</div>
        <label class="dropzone">${icon('upload')}<strong>Choose a file</strong><span>PDF, photo, document… up to ${fileSize(MAX_FILE_BYTES)}</span><input type="file" name="file" hidden></label>
        <div class="file-name muted small"></div></div>`}
      <label class="field-label" for="src-title">Title<span data-for="link file" class="muted"> (optional)</span></label>
      <input class="input" id="src-title" name="title" maxlength="100" value="${source?.title || ''}" placeholder="e.g. Textbook, chapter 4" autocomplete="off">
      <label class="field-label" for="src-note">Note (optional)</label>
      <input class="input" id="src-note" name="note" maxlength="160" value="${source?.note || ''}" placeholder="e.g. pages 34 to 40, good diagrams" autocomplete="off">
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-block btn-lg" type="submit">${source ? 'Save' : 'Add source'}</button>
      ${source ? html`<button class="btn btn-ghost-danger btn-block" type="button" data-delete>${icon('trash')}Delete</button>` : ''}
    </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const draft = bindDraft(form, `source:${source?.id || `new:${subject.id}`}`);
      const error = body.querySelector('.form-error');
      const fail = text => {
        error.textContent = text;
        error.hidden = false;
      };
      show(body);
      onSegmented(body, (name, value) => {
        kind = value;
        error.hidden = true;
        show(body);
      });
      form.file?.addEventListener('change', () => {
        picked = form.file.files[0] || null;
        body.querySelector('.file-name').textContent = picked ? `${picked.name} · ${fileSize(picked.size)}` : '';
        if (picked && !form.title.value.trim()) form.title.value = picked.name.replace(/\.[^.]+$/, '');
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const title = form.title.value.trim().replace(/\s+/g, ' ');
        const note = form.note.value.trim();
        const fields = { title, note };
        if (kind === 'link') {
          const url = cleanUrl(form.url.value);
          if (!url) return fail('Enter a web address, e.g. wikipedia.org.');
          Object.assign(fields, { url, title: title || hostOf(url) });
        } else if (kind === 'file' && !source) {
          if (!picked) return fail('Choose a file.');
          if (picked.size > MAX_FILE_BYTES) return fail(`That file is ${fileSize(picked.size)}. The limit is ${fileSize(MAX_FILE_BYTES)}.`);
          const fileId = uid('f');
          try {
            await putFile(fileId, picked);
          } catch {
            return fail('This browser would not store the file. It may be out of space or in private mode.');
          }
          Object.assign(fields, { fileId, fileName: picked.name, fileType: picked.type, size: picked.size, title: title || picked.name });
        } else if (!title) {
          return fail('Give it a title, e.g. "Textbook, chapter 4".');
        }
        const saved = source
          ? Object.assign(source, fields, { title: fields.title || source.title })
          : { id: uid('r'), subjectId: subject.id, kind, ...fields, added: Date.now() };
        if (!source) store.sources.push(saved);
        store.save('sources');
        draft.clear();
        onSave?.(saved);
        close();
        app.render();
      });
      body.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        const ok = await app.confirm({ title: 'Delete this source?', text: `"${source.title}" is removed${source.kind === 'file' ? ', together with the stored file' : ''}.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        if (source.fileId) await deleteFile(source.fileId);
        store.sources = store.sources.filter(s => s !== source);
        store.save('sources');
        app.render();
      });
    },
  });
}

/** Types that are safe to show in the browser from this origin; anything else (html, svg, xhtml) could run script as the app. */
export const SAFE_INLINE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];

/**
 * Decides how an uploaded file may be opened.
 *
 * @param {string} type MIME type recorded for the file, possibly with parameters or odd casing.
 * @returns {string|null} The bare type from SAFE_INLINE_TYPES when it may open in the browser, else null (download only).
 * @example
 * safeInlineType('Text/Plain; charset=utf-8'); // 'text/plain'
 */
export function safeInlineType(type) {
  const bare = String(type || '').split(';')[0].trim().toLowerCase();
  return SAFE_INLINE_TYPES.includes(bare) ? bare : null;
}

/**
 * Shows a stored file in a sheet: safe types preview and open, others can only be downloaded.
 *
 * @param {object} app App shell (toast, sheet).
 * @param {object} source The file source record.
 * @returns {Promise<void>}
 */
export async function openFile(app, source) {
  const stored = await getFile(source.fileId).catch(() => null);
  if (!stored) return app.toast('This file is not on this device any more.', { kind: 'error' });
  // Re-typing the blob with the vetted type stops a stored type like text/html from being honoured on open.
  const safeType = safeInlineType(stored.type);
  const blob = safeType ? new Blob([stored], { type: safeType }) : stored;
  const url = URL.createObjectURL(blob);
  const image = !!safeType && safeType.startsWith('image/');
  app.sheet({
    title: source.title,
    body: html`${image ? html`<img class="file-preview" src="${url}" alt="${source.title}">` : html`<p class="sheet-text">${source.fileName} · ${fileSize(blob.size)}</p>`}
      <div class="sheet-actions">
        <a class="btn btn-secondary" href="${url}" download="${source.fileName}">${icon('download')}Download</a>
        ${safeType ? html`<a class="btn btn-primary" href="${url}" target="_blank" rel="noopener">${icon('external')}Open</a>` : ''}
      </div>`,
    onClose: () => setTimeout(() => URL.revokeObjectURL(url), 60000),
  });
}

export function mountSources(app, subject, root) {
  const find = id => store.sources.find(s => s.id === id);
  root.querySelector('[data-add-source]').addEventListener('click', () => sourceSheet(app, subject));
  root.querySelectorAll('[data-edit-source]').forEach(btn => btn.addEventListener('click', () => sourceSheet(app, subject, find(btn.dataset.editSource))));
  root.querySelectorAll('[data-open-file]').forEach(btn => btn.addEventListener('click', () => openFile(app, find(btn.dataset.openFile))));

  let kind = 'all';
  const search = root.querySelector('input[type=search]');
  const filter = () => {
    const term = search.value.trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll('.source-row').forEach(row => {
      row.hidden = (kind !== 'all' && row.dataset.kind !== kind) || (!!term && !row.dataset.search.includes(term));
      shown += !row.hidden;
    });
    const empty = root.querySelector('.no-results');
    if (empty) empty.hidden = shown > 0;
  };
  search.addEventListener('input', filter);
  root.querySelectorAll('[data-kind-filter]').forEach(chip => chip.addEventListener('click', () => {
    kind = chip.dataset.kindFilter;
    root.querySelectorAll('[data-kind-filter]').forEach(c => c.classList.toggle('active', c === chip));
    filter();
  }));
}
