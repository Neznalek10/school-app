/**
 * Chat page: one conversation per subject and assistant, with the notes context picker.
 * For the setup assistant, a proposal in an AI reply gets an "Apply to <subject>" card (see setup-apply.js).
 */
import { store } from '../store.js';
import { aiReady, aiSettings, chat, buildMessages, externalPrompt, AiError } from '../ai.js';
import { assistantsOf, SUBJECT_ICONS } from '../subjects.js';
import { parseSetup, setupSummary } from '../setup.js';
import { markdown, plainText } from '../md.js';
import { upcoming, typeOf, isTask, formatDay } from '../events.js';
import { html, raw, icon, plural } from '../ui.js';
import { subjectIcon, copyText } from './parts.js';
import { applySetupAndSave, setupAppliedText, summaryItem } from './setup-apply.js';

// Only the latest turns go to the model; the whole chat stays saved.
const HISTORY = 30;

const lessonOf = context => (String(context).startsWith('lesson:') ? store.lessons.find(l => `lesson:${l.id}` === context) : null);
const taskOf = context => (String(context).startsWith('event:') ? store.events.find(e => `event:${e.id}` === context) : null);

// A test or homework is read as its description plus the notes attached to it; links and files are listed by name.
export const lessonNote = l => ({
  title: `Lesson: ${l.title}`,
  body: [l.data.overview, l.data.notes, ...l.data.answers.map(a => `Q: ${a.question}\nA: ${a.answer}`)].filter(Boolean).join('\n\n'),
  updated: l.updated,
});

function taskNotes(app, ev) {
  const attached = (ev.materials || []).map(m => (m.kind === 'note' ? app.note(m.id) : m.kind === 'lesson' && app.lesson(m.id) ? lessonNote(app.lesson(m.id)) : null)).filter(Boolean);
  const sources = (ev.materials || []).map(m => (m.kind === 'source' ? store.sources.find(s => s.id === m.id) : null)).filter(Boolean);
  const body = [
    ev.description || '(no description yet)',
    sources.length ? `Other study materials: ${sources.map(s => [s.title, s.url, s.note].filter(Boolean).join(', ')).join('; ')}` : '',
  ].filter(Boolean).join('\n\n');
  return [{ title: `${typeOf(ev.type).label}: ${ev.title} on ${formatDay(ev.date)}`, body, updated: Infinity }, ...attached];
}

// What an assistant reads: all notes and lessons, none, one test with its materials, one lesson, or one note.
export function contextNotes(app, subject, context) {
  if (context === 'none') return [];
  if (context === 'all') return [...app.notesOf(subject.id), ...store.lessons.filter(l => l.subjectId === subject.id).map(lessonNote)];
  const ev = taskOf(context);
  if (ev) return taskNotes(app, ev);
  const lesson = lessonOf(context);
  if (lesson) return [lessonNote(lesson)];
  const note = app.note(context);
  return note ? [note] : [];
}

export function contextLabel(app, subject, context) {
  if (context === 'none') return 'No notes';
  if (context === 'all') return `All notes (${app.notesOf(subject.id).length + store.lessons.filter(l => l.subjectId === subject.id).length})`;
  const ev = taskOf(context);
  if (ev) return `${typeOf(ev.type).label}: ${ev.title}`;
  const lesson = lessonOf(context);
  if (lesson) return `Lesson: ${lesson.title}`;
  return `Note: ${app.note(context)?.title || 'Untitled'}`;
}

/**
 * Reads a setup proposal from an AI message.
 *
 * @param {string} text The AI message.
 * @returns {object|null} The SubjectSetup, or null when the text has no complete proposal (the interview is still running).
 */
function proposalOf(text) {
  try {
    return parseSetup(text, { icons: SUBJECT_ICONS });
  } catch {
    // Not a proposal yet: an interview question parses as an error and shows no card.
    return null;
  }
}

/**
 * The card under a setup proposal: an Apply button (or a note and a link once applied) above the preview lines.
 *
 * @param {object} subject The subject being set up.
 * @param {object} message The chat message (`applied` marks a proposal that was applied).
 * @param {object} setup The parsed proposal.
 * @param {number} i Index of the message in the chat.
 * @returns {object} html`` fragment.
 */
const applyCard = (subject, message, setup, i) => html`<div class="setup-apply">
  <strong>Setup proposal</strong>
  ${message.applied
    ? html`<p class="setup-applied">${icon('check')}Applied. <a class="setup-open" href="#/subject/${encodeURIComponent(subject.id)}">Open ${subject.name}</a></p>`
    : html`<button class="btn btn-primary btn-sm btn-wrap" data-apply="${i}">${icon('sparkle')}Apply to ${subject.name}</button>`}
  <ul>${setupSummary(setup).map(summaryItem)}</ul>
</div>`;

/**
 * One chat message as html: the student's text, or the AI's Markdown answer with an optional card and actions.
 *
 * @param {{ role: string, content: string }} m The message.
 * @param {number} i Index of the message in the chat (used by the Copy, Save and Apply buttons).
 * @param {object|null} [card] Extra html shown under the AI text, such as the setup apply card.
 * @returns {object} html`` fragment.
 */
const bubble = (m, i, card = null) => (m.role === 'user'
  ? html`<div class="msg msg-user"><div class="msg-text">${m.content}</div></div>`
  : html`<div class="msg msg-ai">
      <div class="md msg-text">${raw(markdown(m.content))}</div>
      ${card}
      <div class="msg-actions">
        <button class="btn btn-text btn-sm" data-copy="${i}">${icon('copy')}Copy</button>
        <button class="btn btn-text btn-sm" data-save="${i}">${icon('notes')}Save as note</button>
      </div>
    </div>`);

/**
 * Route view for #/chat/<subjectId>/<assistantId>: one saved conversation with an assistant.
 *
 * @param {object} app The app shell.
 * @param {{ id: string, sub: string, note?: string, event?: string }} params Route params: subject id, assistant id and the optional notes or test context from the query.
 * @returns {object} View description (title, back, body, mount, leave); redirects to the subject's AI tab or home when the subject or assistant is unknown. Mounting sends messages to the AI and saves the chat in the store.
 */
export function chatView(app, { id, sub, note, event }) {
  const subject = app.subject(id);
  const assistant = subject && assistantsOf(subject).find(a => a.id === sub);
  if (!assistant) return { redirect: subject ? `subject/${encodeURIComponent(subject.id)}?tab=ai` : 'home' };
  const key = `${subject.id}/${assistant.id}`;
  const state = (store.chats[key] ??= { messages: [], context: assistant.useNotes ? 'all' : 'none', updated: Date.now() });
  if (note && app.note(note)?.subjectId === subject.id && state.context !== note) {
    state.context = note;
    store.save('chats');
  }
  const task = event && store.events.find(e => e.id === event && e.subjectId === subject.id && isTask(e));
  if (task && state.context !== `event:${task.id}`) {
    state.context = `event:${task.id}`;
    store.save('chats');
  }
  if (!['all', 'none'].includes(state.context) && !app.note(state.context) && !taskOf(state.context) && !lessonOf(state.context)) state.context = 'all';
  /**
   * The setup apply card for an AI message, or null when it holds no complete proposal.
   *
   * @param {object} m The AI message.
   * @param {number} i Index of the message in the chat.
   * @returns {object|null} html`` fragment or null.
   */
  const cardFor = (m, i) => {
    const setup = proposalOf(m.content);
    return setup && applyCard(subject, m, setup, i);
  };
  const ready = aiReady(aiSettings());
  const pending = app.pending[key];

  const intro = html`<div class="chat-intro">
    <span class="assistant-icon lg">${icon(assistant.icon)}</span>
    <h2>${assistant.name}</h2>
    <p>${assistant.blurb}</p>
    ${assistant.starter ? html`<button class="btn btn-secondary" data-starter>${icon('sparkle')}${assistant.starter}</button>` : ''}
  </div>`;

  const body = html`
    <div class="chat-bar">
      <a class="chip" href="#/subject/${encodeURIComponent(subject.id)}?tab=ai">${subjectIcon(subject, 'xs')}${subject.name}</a>
      <button class="chip" data-context>${icon('notes')}${contextLabel(app, subject, state.context)}${icon('chevronDown')}</button>
    </div>
    ${ready ? '' : html`<a class="notice notice-warn notice-link" href="#/account">${icon('alert')}<span>Add your free OpenRouter key in Account, then come back here.</span></a>`}
    <div class="chat-log" aria-live="polite">
      ${state.messages.length ? state.messages.map((m, i) => bubble(m, i, assistant.setup && m.role === 'assistant' ? cardFor(m, i) : null)) : intro}
      ${pending ? html`<div class="msg msg-ai msg-typing"><span></span><span></span><span></span></div>` : ''}
      ${state.error && !pending ? html`<div class="notice notice-bad chat-error">${icon('alert')}<span>${state.error}</span><button class="btn btn-secondary btn-sm" data-retry>${icon('refresh')}Try again</button></div>` : ''}
    </div>
    <form class="composer">
      <textarea class="input composer-input" name="text" rows="1" placeholder="Message ${assistant.name}…" aria-label="Message"></textarea>
      <button class="btn btn-primary composer-send" type="submit" aria-label="Send" ${pending ? 'disabled' : ''}>${icon('send')}</button>
    </form>`;

  return {
    title: assistant.name,
    back: `subject/${encodeURIComponent(subject.id)}?tab=ai`,
    tab: 'home',
    action: html`<button class="icon-btn" data-copy-external aria-label="Copy as a prompt for ChatGPT or Gemini" title="Copy for ChatGPT or Gemini">${icon('copy')}</button>
      ${state.messages.length ? html`<button class="icon-btn" data-reset aria-label="New chat">${icon('refresh')}</button>` : ''}`,
    body,
    mount(root, topbar) {
      const form = root.querySelector('.composer');
      const input = form.text;
      const log = root.querySelector('.chat-log');
      const here = () => location.hash.startsWith(`#/chat/${encodeURIComponent(subject.id)}/${encodeURIComponent(assistant.id)}`);
      requestAnimationFrame(() => { if (state.messages.length) log.lastElementChild?.scrollIntoView({ block: 'end' }); });

      const run = async () => {
        const ai = aiSettings();
        if (!aiReady(ai)) {
          app.toast('Add your AI key in Account first.', { kind: 'error' });
          return;
        }
        state.error = null;
        app.pending[key] = true;
        app.render();
        try {
          const messages = buildMessages({
            assistant,
            subject,
            notes: contextNotes(app, subject, state.context),
            events: upcoming(store.events.filter(e => e.subjectId === subject.id), { days: 60 }),
            language: store.settings.aiLanguage,
            history: state.messages.slice(-HISTORY),
          });
          const reply = await chat(ai, messages);
          state.messages.push({ role: 'assistant', content: reply, at: Date.now() });
        } catch (e) {
          state.error = e instanceof AiError ? e.message : 'Something went wrong while asking the AI.';
        } finally {
          delete app.pending[key];
          state.updated = Date.now();
          store.save('chats');
          if (here()) app.render();
          else if (!state.error) app.toast(`${assistant.name} answered in ${subject.name}.`, { kind: 'success' });
        }
      };

      const send = text => {
        const content = text.trim();
        if (!content || app.pending[key]) return;
        state.messages.push({ role: 'user', content, at: Date.now() });
        state.updated = Date.now();
        store.save('chats');
        run();
      };

      form.addEventListener('submit', e => {
        e.preventDefault();
        send(input.value);
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
      });
      // On a phone Enter makes a new line and the button sends; with a keyboard Enter sends.
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) {
          e.preventDefault();
          send(input.value);
        }
      });
      root.querySelector('[data-starter]')?.addEventListener('click', () => send(assistant.starter));
      root.querySelector('[data-retry]')?.addEventListener('click', () => run());

      log.addEventListener('click', async e => {
        const copy = e.target.closest('[data-copy]');
        const save = e.target.closest('[data-save]');
        const apply = e.target.closest('[data-apply]');
        if (copy) {
          try {
            await navigator.clipboard.writeText(state.messages[copy.dataset.copy].content);
            app.toast('Copied.', { kind: 'success' });
          } catch {
            app.toast('Copying is blocked here. Select the text instead.', { kind: 'error' });
          }
        }
        if (apply) {
          const message = state.messages[apply.dataset.apply];
          const setup = proposalOf(message.content);
          if (!setup || message.applied) return;
          try {
            const result = applySetupAndSave(app, subject, setup);
            message.applied = true;
            store.save('chats');
            app.toast(setupAppliedText(subject, result), { kind: 'success' });
            app.render();
          } catch (err) {
            app.toast(err.message, { kind: 'error' });
          }
        }
        if (save) {
          const i = Number(save.dataset.save);
          const question = [...state.messages.slice(0, i)].reverse().find(m => m.role === 'user');
          const title = `${assistant.name}: ${plainText(question?.content || subject.name).slice(0, 60)}`;
          app.newNote(subject.id, { title, body: state.messages[i].content });
          app.toast(`Saved to your ${subject.name} notes.`, { kind: 'success' });
        }
      });

      root.querySelector('[data-context]').addEventListener('click', () => {
        const notes = app.notesOf(subject.id).sort((a, b) => b.updated - a.updated);
        const options = [
          { value: 'all', label: `All ${subject.name} notes`, sub: plural(notes.length, 'note') },
          { value: 'none', label: 'No notes', sub: 'The assistant only sees this chat' },
          ...upcoming(store.events.filter(e => e.subjectId === subject.id && isTask(e))).map(e => ({ value: `event:${e.id}`, label: `${typeOf(e.type).label}: ${e.title}`, sub: 'Its description and study materials' })),
          ...store.lessons.filter(l => l.subjectId === subject.id).map(l => ({ value: `lesson:${l.id}`, label: `Lesson: ${l.title}`, sub: 'Its notes and answers' })),
          ...notes.map(n => ({ value: n.id, label: n.title || 'Untitled note', sub: 'Only this note' })),
        ];
        app.sheet({
          title: 'What the assistant can read',
          body: html`<div class="lang-list">${options.map(o => html`<button class="lang-row ${o.value === state.context ? 'active' : ''}" data-value="${o.value}">
            <span class="lang-row-main"><strong>${o.label}</strong><small>${o.sub}</small></span>${o.value === state.context ? icon('check', 'accent') : ''}</button>`)}</div>`,
          onMount: (sheet, close) => sheet.addEventListener('click', e => {
            const row = e.target.closest('[data-value]');
            if (!row) return;
            state.context = row.dataset.value;
            store.save('chats');
            close();
            app.render();
          }),
        });
      });

      topbar.querySelector('[data-copy-external]').addEventListener('click', () => copyText(app, externalPrompt({
        assistant,
        subject,
        notes: contextNotes(app, subject, state.context),
        events: upcoming(store.events.filter(e => e.subjectId === subject.id), { days: 60 }),
        language: store.settings.aiLanguage,
      }), `${assistant.name} prompt copied with ${contextLabel(app, subject, state.context).toLowerCase()}. Paste it into ChatGPT or Gemini.`));
      topbar.querySelector('[data-reset]')?.addEventListener('click', async () => {
        const ok = await app.confirm({ title: 'Start a new chat?', text: 'This conversation is cleared. Answers you saved as notes stay.', confirmLabel: 'New chat' });
        if (!ok) return;
        state.messages = [];
        state.error = null;
        store.save('chats');
        app.render();
      });
    },
  };
}
