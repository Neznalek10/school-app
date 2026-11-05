/**
 * Setup page (#/setup/<subjectId>): personalise a subject with an AI interview.
 *
 * Responsibility: shows the current profile (read-only), offers the in-app interview (chat with the setup
 * assistant) and a copy-paste route for ChatGPT or Gemini: copy the interview prompt, paste the JSON answer
 * back, preview it and apply it. Parsing, preview and applying live in js/setup.js and
 * js/views/setup-apply.js; this file only wires them to the page.
 *
 * Fits in: registered in js/app.js as the 'setup' route; reached from the New subject sheet and from the
 * "Profile and setup" card on the subject page. Uses ai.js (externalPrompt, aiReady), subjects.js (SUBJECT_ICONS)
 * and parts.js (copyText, subjectIcon).
 */
import { store } from '../store.js';
import { aiReady, aiSettings, externalPrompt } from '../ai.js';
import { SUBJECT_ICONS } from '../subjects.js';
import { setupAssistant, parseSetup, setupSummary } from '../setup.js';
import { html, icon } from '../ui.js';
import { subjectIcon, copyText } from './parts.js';
import { applySetupAndSave, setupAppliedText, summaryItem } from './setup-apply.js';

/** Outside AI chats that can run the copied interview prompt: [label, address]. */
const OUTSIDE_AI = [
  ['ChatGPT', 'https://chatgpt.com/'],
  ['Gemini', 'https://gemini.google.com/app'],
];

/**
 * Builds the read-only card with the profile a previous setup stored.
 *
 * @param {object} subject The subject.
 * @returns {object|string} html`` fragment, or '' when the subject has no profile yet.
 */
function profileCard(subject) {
  if (!subject.profile) return '';
  return html`<section class="card">
    <div class="card-head"><h2>Current profile</h2></div>
    <p class="setup-profile">${subject.profile}</p>
    <p class="muted small">A new setup replaces it. Assistants you made yourself are kept.</p>
  </section>`;
}

/**
 * Builds the card that starts the in-app interview.
 *
 * @param {object} subject The subject.
 * @param {boolean} ready True when the AI key is set; otherwise the card explains how to add it instead of a dead button.
 * @returns {object} html`` fragment.
 */
function interviewCard(subject, ready) {
  return html`<section class="card">
    <div class="card-head"><h2>Interview in the app</h2></div>
    <p class="setup-text">The assistant asks you about 6 to 10 short questions, one at a time, then proposes a setup you can apply with one tap.</p>
    ${ready
      ? html`<a class="btn btn-primary btn-block" href="#/chat/${encodeURIComponent(subject.id)}/setup">${icon('sparkle')}Start the interview</a>`
      : html`<p class="muted small setup-note">To chat here, <a href="#/account">add your free OpenRouter key in Account</a>. Or use ChatGPT or Gemini.</p>`}
  </section>`;
}

/**
 * Builds the card for the copy-paste route.
 *
 * @returns {object} html`` fragment with the copy button, outside AI links, paste box, status and preview areas.
 */
function outsideCard() {
  return html`<section class="card">
    <div class="card-head"><h2>Use ChatGPT or Gemini</h2></div>
    <ol class="setup-steps">
      <li>Copy the interview prompt and paste it into a new chat.</li>
      <li>Answer its questions. At the end it sends a block of JSON.</li>
      <li>Paste that answer below.</li>
    </ol>
    <div class="setup-actions">
      <button class="btn btn-secondary" type="button" data-copy-prompt>${icon('copy')}Copy prompt</button>
      ${OUTSIDE_AI.map(([label, url]) => html`<a class="btn btn-secondary" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)}
    </div>
    <label class="field-label" for="setup-paste">Paste the answer</label>
    <textarea class="input textarea setup-paste" id="setup-paste" rows="6" placeholder="Paste the whole answer of the AI here" spellcheck="false"></textarea>
    <p class="setup-status" role="status" hidden></p>
    <ul class="setup-preview" hidden></ul>
    <button class="btn btn-primary btn-block" type="button" data-apply disabled>${icon('check')}Apply</button>
  </section>`;
}

/**
 * Wires the paste box: parses the text as the student types, shows the preview or the error, and applies.
 *
 * @param {object} app The app shell.
 * @param {object} subject The subject being set up.
 * @param {HTMLElement} root The page container.
 */
function mountPaste(app, subject, root) {
  const paste = root.querySelector('#setup-paste');
  const status = root.querySelector('.setup-status');
  const preview = root.querySelector('.setup-preview');
  const apply = root.querySelector('[data-apply]');
  let setup = null;

  /**
   * Shows one status line under the paste box.
   *
   * @param {string} message Text to show; an empty string hides the line.
   * @param {boolean} [bad] True to style it as an error.
   */
  const say = (message, bad = false) => {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle('is-bad', bad);
  };

  paste.addEventListener('input', () => {
    setup = null;
    preview.hidden = true;
    apply.disabled = true;
    if (!paste.value.trim()) return say('');
    try {
      setup = parseSetup(paste.value, { icons: SUBJECT_ICONS });
    } catch (error) {
      // parseSetup throws messages written for the student, so they are shown as they are.
      return say(error.message, true);
    }
    say('Looks good. Check the summary, then apply it.');
    preview.innerHTML = html`${setupSummary(setup).map(summaryItem)}`.s;
    preview.hidden = false;
    apply.disabled = false;
  });

  apply.addEventListener('click', () => {
    if (!setup || apply.disabled) return;
    // Disabled first so a quick second click cannot apply the setup twice.
    apply.disabled = true;
    try {
      app.toast(setupAppliedText(subject, applySetupAndSave(app, subject, setup)), { kind: 'success' });
    } catch (error) {
      apply.disabled = false;
      return say(error.message, true);
    }
    app.go(`subject/${encodeURIComponent(subject.id)}`);
  });
}

/**
 * Route view for #/setup/<subjectId>.
 *
 * @param {object} app The app shell.
 * @param {{ id: string }} params Route params; `id` is the subject id.
 * @returns {object} View description (title, back link, body, mount); redirects home for an unknown subject.
 */
export function setupView(app, { id }) {
  const subject = app.subject(id);
  if (!subject) return { redirect: 'home' };
  // Without an AI key the working copy-paste route comes first and the interview card only explains the key.
  const ready = aiReady(aiSettings());
  return {
    title: 'Set up',
    back: `subject/${encodeURIComponent(subject.id)}`,
    tab: 'home',
    body: html`
      <section class="subject-head">
        ${subjectIcon(subject, 'lg')}
        <div class="subject-head-main">
          <div class="eyebrow">${subject.setupAt ? 'Set up again' : 'Personalise'}</div>
          <h2 class="setup-title">${subject.name}</h2>
        </div>
      </section>
      <p class="setup-text">Tell the AI how this subject works in your class. It then tunes the study plan, assistants and tools to it.</p>
      ${profileCard(subject)}
      ${ready ? html`${interviewCard(subject, true)}${outsideCard()}` : html`${outsideCard()}${interviewCard(subject, false)}`}`,
    /**
     * Wires the copy button and the paste box once the page is in the DOM.
     *
     * @param {HTMLElement} root The page container.
     */
    mount(root) {
      root.querySelector('[data-copy-prompt]').addEventListener('click', () => copyText(app, externalPrompt({
        assistant: setupAssistant(subject),
        subject,
        language: store.settings.aiLanguage,
      }), 'Interview prompt copied. Paste it into ChatGPT or Gemini.'));
      mountPaste(app, subject, root);
    },
  };
}
