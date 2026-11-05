import { plainText } from '../md.js';
import { html, icon } from '../ui.js';

export function timeAgo(t, now = Date.now()) {
  const min = Math.round((now - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const subjectIcon = (s, cls = '') => html`<span class="subject-icon c-${s.color} ${cls}">${icon(s.icon)}</span>`;

export function noteRow(app, n, { showSubject = true } = {}) {
  const s = app.subject(n.subjectId);
  const text = plainText(n.body);
  return html`<a class="note-row" href="#/note/${encodeURIComponent(n.id)}" data-search="${`${n.title} ${text}`.toLowerCase()}">
    <span class="note-row-main">
      <strong>${n.title || 'Untitled note'}</strong>
      <small>${showSubject && s ? html`<span class="dot c-${s.color}"></span>${s.name} · ` : ''}${timeAgo(n.updated)}${text ? ` · ${text.slice(0, 80)}` : ''}</small>
    </span>
    ${icon('chevronRight', 'chevron')}
  </a>`;
}

// The clipboard can be blocked (an http page, a strict browser); then the text opens selected so it can be copied by hand.
export async function copyText(app, text, done = 'Copied. Paste it into ChatGPT or Gemini.') {
  try {
    await navigator.clipboard.writeText(text);
    app.toast(done, { kind: 'success', duration: 4500 });
  } catch {
    app.sheet({
      title: 'Copy the prompt',
      body: html`<p class="sheet-text">Copying is blocked here. The whole prompt is selected below: copy it yourself.</p>
        <textarea class="input textarea copy-box" readonly rows="10" aria-label="Prompt">${text}</textarea>`,
      onMount: body => {
        const box = body.querySelector('textarea');
        box.focus();
        box.select();
      },
    });
  }
}
