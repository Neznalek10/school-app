/**
 * Photo test checker screens (#/testcheck/<subjectId>): the setup page (mode, photos, note, run or copy-paste),
 * the saved result page (summary, one card per question) and the small lists other pages use to link to results.
 *
 * Responsibility: UI and wiring only. Prompts, parsing, statistics and flashcards come from js/testcheck.js,
 * photo preparation from js/images.js, the request from js/ai.js. Pure decisions (which answers stay hidden,
 * summary wording, replacing a question) are exported helpers so they can be tested without a page.
 *
 * Fits in: routed from js/app.js as `testcheck`; linked from js/views/subject.js (Practice tab) and
 * js/views/tasks.js (a test's page). Results are saved with app.saveCheck and read with app.checksOf.
 * URLs: `#/testcheck/<subjectId>` starts a check (`?event=<id>` links it to a test); `?check=<id>` opens a saved result.
 * Invariants: photos live only in the memory of the setup page and are never saved; every text from the AI or
 * the student reaches the page through html`` (escaped), never as raw HTML; revealed answers and typed tries are
 * per view and not saved.
 */
import { store, uid } from '../store.js';
import { aiReady, aiSettings, isKeySafeUrl, visionSettings, imageMessages, chat, AiError, languageName, PHOTO_TIMEOUT_MS, PHOTO_MODEL_HINT } from '../ai.js';
import { studentText, audienceText, formatDate } from '../locale.js';
import { checkPrompt, parseCheck, checkStats, newCheck, recheckPrompt, parseRecheck, mistakeCards, addMistakeCards } from '../testcheck.js';
import { prepareImage, MAX_PHOTOS } from '../images.js';
import { html, icon, plural, segmented, onSegmented } from '../ui.js';
import { bindDraft } from '../drafts.js';
import { subjectIcon, copyText } from './parts.js';

/** The two ways to check a test, as shown in the mode switch. */
const MODE_OPTIONS = [{ value: 'check', label: 'My answers are on it' }, { value: 'solve', label: 'It is blank' }];
/** One line under the mode switch explaining what each mode does. */
const MODE_HINTS = {
  check: 'The AI reads the questions and your answers, then marks each one and explains the misses.',
  solve: 'The AI reads the questions and solves them with explanations, so you can practise.',
};
/** What the student sees for each verdict. */
const VERDICT_LABELS = { correct: 'Correct', partial: 'Partly right', wrong: 'Wrong', blank: 'Not answered', unreadable: 'Unclear' };
/** Short count labels in the summary, in display order. */
const COUNT_LABELS = [['correct', 'correct'], ['partial', 'partly right'], ['wrong', 'wrong'], ['blank', 'not answered'], ['unreadable', 'unclear']];
/** Verdicts whose answer stays hidden until the student has tried again or asked for it. */
const TRY_FIRST_VERDICTS = ['wrong', 'partial', 'blank'];
/** Limits of the student's note for the AI, of a retry text and of an edited question, in characters. */
const NOTE_INPUT_MAX = 500;
const TRY_MAX = 400;
const QUESTION_EDIT_MAX = 600;
/** Title of a saved result whose test has no title of its own. */
const FALLBACK_TITLES = { check: 'Checked test', solve: 'Solved test' };
const DATE_FORMAT = { day: 'numeric', month: 'short', year: 'numeric' };
const SHORT_DATE_FORMAT = { day: 'numeric', month: 'short' };

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Builds the link to a checker page.
 *
 * @param {string} subjectId The subject.
 * @param {{ event?: string, check?: string }} [options] `event` links a new check to a test; `check` opens a saved result.
 * @returns {string} A hash link such as "#/testcheck/s1?event=e2".
 * @example
 * checkHref('s1', { check: 'k9' }); // "#/testcheck/s1?check=k9"
 */
export function checkHref(subjectId, options) {
  return `#/${checkRoute(subjectId, options)}`;
}

/**
 * Builds the route of a checker page, the form app.go() takes.
 *
 * @param {string} subjectId The subject.
 * @param {{ event?: string, check?: string }} [options] See checkHref.
 * @returns {string} A route without the leading "#/", such as "testcheck/s1?event=e2".
 */
function checkRoute(subjectId, { event = '', check = '' } = {}) {
  const query = [['event', event], ['check', check]].filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return `testcheck/${encodeURIComponent(subjectId)}${query.length ? `?${query.join('&')}` : ''}`;
}

/**
 * Tells whether a question is one the student should try again before seeing the answer.
 *
 * @param {{ verdict: string }} question A checked question.
 * @param {string} mode The record's mode; a blank test that was solved has nothing to try again, so it never hides.
 * @returns {boolean} true for wrong, partial and blank questions of a checked test.
 */
export function triesFirst(question, mode) {
  return mode === 'check' && TRY_FIRST_VERDICTS.includes(question.verdict);
}

/**
 * Tells whether the correct answer, explanation and tip of a question are hidden right now.
 *
 * @param {{ verdict: string }} question A checked question.
 * @param {{ mode: string, showAll: boolean, phase: string }} view `showAll` is the top toggle; `phase` is the card's
 *   own state: 'closed', 'trying' or 'revealed'.
 * @returns {boolean} true while the answer must stay behind "Try again" / "Show answer".
 */
export function answerHidden(question, { mode, showAll, phase }) {
  return triesFirst(question, mode) && !showAll && phase !== 'revealed';
}

/**
 * Lists the non-zero verdict counts of a result for the summary line.
 *
 * @param {{ correct: number, partial: number, wrong: number, blank: number, unreadable: number }} stats From checkStats.
 * @returns {{ verdict: string, count: number, label: string }[]} One entry per verdict that occurs, in display order.
 */
export function summaryParts(stats) {
  return COUNT_LABELS.filter(([verdict]) => stats[verdict] > 0).map(([verdict, label]) => ({ verdict, count: stats[verdict], label }));
}

/**
 * Words the points of a result.
 *
 * @param {{ earned: number|null, max: number|null }} stats From checkStats.
 * @returns {string} "7 of 10 points", or '' when the test shows no points.
 */
export function pointsLabel(stats) {
  return stats.earned === null ? '' : `${stats.earned} of ${stats.max} points`;
}

/**
 * One-line result for lists: "3 of 5 correct · 7 of 10 points".
 *
 * @param {object} stats From checkStats.
 * @param {string} [mode='check'] The record's mode; a solved test shows how many questions were solved instead of a score.
 * @returns {string} The line.
 */
export function checkLine(stats, mode = 'check') {
  if (mode === 'solve') return solvedLabel(stats);
  return [`${stats.correct} of ${stats.total} correct`, pointsLabel(stats)].filter(Boolean).join(' · ');
}

/**
 * Words the size of a solved (blank) test, which has no score to show.
 *
 * @param {{ total: number }} stats From checkStats.
 * @returns {string} "5 questions solved".
 */
export function solvedLabel(stats) {
  return `${plural(stats.total, 'question')} solved`;
}

/**
 * The name shown for a saved result.
 *
 * @param {{ mode: string, result?: { title?: string } }} record A saved check.
 * @returns {string} The AI's title for the test, or "Checked test" / "Solved test".
 */
export function checkTitle(record) {
  return record.result?.title || FALLBACK_TITLES[record.mode] || FALLBACK_TITLES.check;
}

/**
 * Decides how many of the picked files fit into the free photo slots.
 *
 * @param {number} picked How many files the student chose.
 * @param {number} have How many photos are already added.
 * @param {number} [max=MAX_PHOTOS] The most photos one check takes.
 * @returns {{ take: number, skipped: number }} Files to prepare (from the start of the list) and files left out.
 */
export function splitPicked(picked, have, max = MAX_PHOTOS) {
  const take = Math.max(0, Math.min(picked, max - have));
  return { take, skipped: picked - take };
}

/**
 * Reserves photo slots for files that are still being prepared, so two picks made in a row cannot together
 * exceed the limit. Each prepared (or failed) file must give its slot back by lowering `state.pending`.
 *
 * @param {{ photos: unknown[], pending: number }} state Photos added so far and slots reserved by unfinished picks; `pending` is raised here.
 * @param {number} picked How many files the student chose.
 * @param {number} [max=MAX_PHOTOS] The most photos one check takes.
 * @returns {{ take: number, skipped: number }} As splitPicked.
 */
export function reservePhotoSlots(state, picked, max = MAX_PHOTOS) {
  const split = splitPicked(picked, state.photos.length + state.pending, max);
  state.pending += split.take;
  return split;
}

/**
 * Names the host of an AI address that would receive photos without encryption.
 *
 * @param {string} url The AI address from settings.
 * @returns {string} The host (with port) for plain http on another machine, or '' for https and for localhost.
 */
export function insecureHost(url) {
  const text = String(url || '').trim();
  if (!text || isKeySafeUrl(text)) return '';
  const host = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(text)?.[1] || text;
  return host.split('@').pop();
}

/**
 * Adds the model hint to an AI error that probably comes from a model that cannot read photos.
 *
 * @param {Error} error The error of a photo request.
 * @returns {string} The error message; for AiError kinds 'http' and 'format' followed by PHOTO_MODEL_HINT.
 */
export function photoErrorText(error) {
  const guessable = error instanceof AiError && (error.kind === 'http' || error.kind === 'format');
  return guessable ? `${error.message} ${PHOTO_MODEL_HINT}` : error.message;
}

/**
 * Returns a copy of a record with one question replaced.
 *
 * @param {object} record A saved check.
 * @param {number} index Position of the question in record.result.questions.
 * @param {object} question The new question.
 * @returns {object} A new record; the old one is not changed.
 * @throws {RangeError} When there is no question at `index`.
 */
export function replaceQuestion(record, index, question) {
  const questions = record.result.questions;
  if (!Number.isInteger(index) || index < 0 || index >= questions.length) throw new RangeError(`There is no question at position ${index}.`);
  return { ...record, result: { ...record.result, questions: questions.map((old, i) => (i === index ? question : old)) } };
}

/**
 * Applies the student's corrections to a question before it is rechecked.
 *
 * @param {object} question The question as the AI read it.
 * @param {{ fixQuestion: string, fixAnswer: string }} edits The edited question and answer texts.
 * @returns {object} A copy with trimmed, edited text; the verdict and the rest are kept until the recheck replaces them.
 */
export function correctedQuestion(question, { fixQuestion, fixAnswer }) {
  return { ...question, question: fixQuestion.trim(), studentAnswer: fixAnswer.trim() };
}

// ---------------------------------------------------------------------------------------------------------------
// Lists used by other pages
// ---------------------------------------------------------------------------------------------------------------

/**
 * Builds the list of saved results with title, date and score, each linking to its result page.
 *
 * @param {object[]} records Saved checks, already in the wanted order.
 * @returns {object} html`` fragment (an `assistant-list`); the caller puts it inside a card.
 */
export function checkList(records) {
  return html`<div class="assistant-list">${records.map(record => html`<div class="assistant-row">
    <a class="assistant-main" href="${checkHref(record.subjectId, { check: record.id })}">
      <span class="assistant-icon">${icon('clipboard')}</span>
      <span class="note-row-main"><strong data-no-tr>${checkTitle(record)}</strong><small>${formatDate(record.created, SHORT_DATE_FORMAT)} · ${checkLine(checkStats(record.result), record.mode)}</small></span>
    </a>${icon('chevronRight', 'chevron')}
  </div>`)}</div>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------------------------

/**
 * Collects what every prompt of a subject needs.
 *
 * @param {object} subject The subject.
 * @param {string} mode 'check' or 'solve'.
 * @returns {object} Fields shared by checkPrompt and recheckPrompt.
 */
function promptParts(subject, mode) {
  return {
    subjectName: subject.name,
    profile: subject.profile || '',
    studentText: studentText(),
    audience: audienceText(),
    mode,
    languageLabel: languageName(store.settings.aiLanguage),
  };
}

/**
 * The heading block shared by the setup and result pages.
 *
 * @param {object} subject The subject.
 * @param {string} eyebrow Small text above the name.
 * @returns {object} html`` fragment.
 */
function pageHead(subject, eyebrow) {
  return html`<section class="subject-head">
    ${subjectIcon(subject, 'lg')}
    <div class="subject-head-main"><div class="eyebrow">${eyebrow}</div><h2 class="setup-title" data-no-tr>${subject.name}</h2></div>
  </section>`;
}

/**
 * Where "Back" goes: the linked test's page, or the subject's Practice tab.
 *
 * @param {object} subject The subject.
 * @param {string} eventId Linked test id, or ''.
 * @returns {string} A route without the leading "#/".
 */
function backRoute(subject, eventId) {
  return eventId ? `task/${encodeURIComponent(eventId)}` : `subject/${encodeURIComponent(subject.id)}?tab=practice`;
}

/**
 * Shows one status line in a `.tc-status` element.
 *
 * @param {HTMLElement} el The status element.
 * @param {string} message Text; '' hides the element.
 * @param {boolean} [bad=false] True for an error style.
 */
function say(el, message, bad = false) {
  el.textContent = message;
  el.hidden = !message;
  el.classList.toggle('is-bad', bad);
}

/**
 * Saves a finished result and opens its page.
 *
 * @param {object} app The app shell.
 * @param {object} subject The subject.
 * @param {{ eventId: string, mode: string }} setup How the check was started.
 * @param {object} result A parsed CheckResult.
 */
function saveResult(app, subject, { eventId, mode }, result) {
  const record = newCheck({ subjectId: subject.id, eventId, mode, result, id: uid('k') });
  app.saveCheck(record);
  app.go(checkRoute(subject.id, { check: record.id }));
}

// ---------------------------------------------------------------------------------------------------------------
// Setup page: mode, photos, note, run
// ---------------------------------------------------------------------------------------------------------------

/**
 * Builds the card with the mode switch.
 *
 * @returns {object} html`` fragment.
 */
function modeCard() {
  return html`<section class="card">
    <div class="card-head"><h2>What is on the photos?</h2></div>
    ${segmented('mode', MODE_OPTIONS, 'check')}
    <p class="muted small tc-hint" data-mode-hint>${MODE_HINTS.check}</p>
  </section>`;
}

/**
 * Builds the card for adding photos and the optional note.
 *
 * @returns {object} html`` fragment with the two file inputs, thumbnail list and note box.
 */
function photoCard() {
  return html`<section class="card">
    <div class="card-head"><h2>Add photos</h2><span class="card-meta" data-photo-count>0 of ${MAX_PHOTOS}</span></div>
    <p class="muted small">One photo per page, in order. Photos are only sent to your AI and are not saved.</p>
    <div class="tc-add">
      <button type="button" class="btn btn-secondary" data-pick="gallery">${icon('upload')}Choose photos</button>
      <button type="button" class="btn btn-secondary" data-pick="camera">${icon('eye')}Take a photo</button>
    </div>
    <input type="file" accept="image/*" multiple hidden data-input="gallery" aria-label="Choose photos">
    <input type="file" accept="image/*" capture="environment" hidden data-input="camera" aria-label="Take a photo">
    <ul class="tc-errors" data-photo-errors hidden></ul>
    <ul class="tc-thumbs" data-thumbs></ul>
    <label class="field-label" for="tc-note">Note for the AI (optional)</label>
    <textarea class="input textarea tc-note" id="tc-note" name="note" rows="2" maxlength="${NOTE_INPUT_MAX}" placeholder="e.g. Page 2 is the back of page 1. Answers are in pencil."></textarea>
  </section>`;
}

/**
 * Builds the card that runs the check in the app, or explains how to get a key.
 *
 * @param {boolean} ready True when the AI (with the photo model) is configured.
 * @param {string} [unsafeHost] Host that would get the photos unencrypted (see insecureHost); a warning is shown when set.
 * @returns {object} html`` fragment.
 */
function runCard(ready, unsafeHost = '') {
  return html`<section class="card">
    <div class="card-head"><h2>Check with AI</h2></div>
    ${unsafeHost ? html`<p class="notice notice-warn tc-unsafe">${icon('alert')}<span>${`Photos will be sent without encryption to ${unsafeHost}.`}</span></p>` : ''}
    ${ready
      ? html`<button type="button" class="btn btn-primary btn-block btn-lg" data-run disabled>${icon('sparkle')}Check with AI</button>`
      : html`<p class="muted small">To check here, <a href="#/account">add your free OpenRouter key in Account</a>. Or use ChatGPT or Gemini below.</p>`}
    <p class="tc-status" role="status" data-run-status hidden></p>
  </section>`;
}

/**
 * Builds the copy-and-paste card for students without a key (or whose model cannot read photos).
 *
 * @returns {object} html`` fragment with copy button, paste box and the "Show result" button.
 */
function outsideCard() {
  return html`<section class="card">
    <div class="card-head"><h2>Use ChatGPT or Gemini</h2></div>
    <ol class="setup-steps">
      <li>Add your photos above, so the prompt knows how many there are.</li>
      <li>Copy the prompt, paste it into a new chat and attach the same photos.</li>
      <li>Paste the answer below.</li>
    </ol>
    <button type="button" class="btn btn-secondary" data-copy-prompt>${icon('copy')}Copy prompt</button>
    <label class="field-label" for="tc-paste">Paste the answer</label>
    <textarea class="input textarea setup-paste" id="tc-paste" name="answer" rows="6" placeholder="Paste the whole answer of the AI here" spellcheck="false"></textarea>
    <p class="tc-status" role="status" data-paste-status hidden></p>
    <button type="button" class="btn btn-primary btn-block" data-show-result>${icon('check')}Show result</button>
  </section>`;
}

/**
 * Builds the thumbnails of the added photos.
 *
 * @param {{ dataUrl: string }[]} photos The prepared photos.
 * @returns {object} html`` list items, each with a remove button.
 */
function thumbItems(photos) {
  return html`${photos.map((photo, i) => html`<li class="tc-thumb">
    <img src="${photo.dataUrl}" alt="Photo ${i + 1}">
    <button type="button" class="icon-btn tc-thumb-remove" data-remove="${i}" aria-label="Remove photo ${i + 1}">${icon('x')}</button>
  </li>`)}`;
}

/**
 * Wires photo picking, thumbnails and removal.
 *
 * @param {HTMLElement} root The page container.
 * @param {{ photos: { dataUrl: string }[], pending: number, busy: boolean }} state Shared page state; `photos` and `pending` are changed here.
 * @param {() => void} onChange Called after the photo list changed.
 */
function mountPhotos(root, state, onChange) {
  const thumbs = root.querySelector('[data-thumbs]');
  const errors = root.querySelector('[data-photo-errors]');
  /** Redraws the thumbnails and the count, then tells the page the list changed. */
  const paint = () => {
    thumbs.innerHTML = thumbItems(state.photos).s;
    root.querySelector('[data-photo-count]').textContent = `${state.photos.length} of ${MAX_PHOTOS}`;
    onChange();
  };
  /** Prepares the picked files one by one; a bad file is reported and the others still count. */
  const add = async files => {
    // Slots are reserved before the first await, so a second pick made meanwhile sees them as taken.
    const { take, skipped } = reservePhotoSlots(state, files.length);
    const problems = skipped ? [`Only ${MAX_PHOTOS} photos fit. ${plural(skipped, 'photo')} not added.`] : [];
    for (const file of files.slice(0, take)) {
      try {
        state.photos.push(await prepareImage(file));
      } catch (error) {
        problems.push(error.message);
      } finally {
        state.pending -= 1;
      }
    }
    errors.innerHTML = html`${problems.map(p => html`<li>${p}</li>`)}`.s;
    errors.hidden = !problems.length;
    paint();
  };
  root.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', () => root.querySelector(`[data-input="${btn.dataset.pick}"]`).click()));
  root.querySelectorAll('[data-input]').forEach(input => input.addEventListener('change', () => {
    const files = [...input.files];
    // Cleared so picking the same file again (after removing it) fires change.
    input.value = '';
    add(files);
  }));
  thumbs.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    state.photos.splice(Number(btn.dataset.remove), 1);
    paint();
  });
}

/**
 * Wires the in-app check: sends the photos, parses the answer and opens the saved result.
 *
 * @param {object} ctx Page context: subject, root, state, form (holds the note field) and finish(result).
 */
function mountRun(ctx) {
  const { subject, root, state, form } = ctx;
  const button = root.querySelector('[data-run]');
  const status = root.querySelector('[data-run-status]');
  button.addEventListener('click', async () => {
    if (state.busy || !state.photos.length) return;
    state.busy = true;
    button.disabled = true;
    say(status, 'Reading your test. This can take a minute.');
    const prompt = checkPrompt({ ...promptParts(subject, state.mode), note: form.note.value, photos: state.photos.length });
    let answer;
    try {
      answer = await chat(visionSettings(), imageMessages(prompt, state.photos.map(p => p.dataUrl)), { timeout: PHOTO_TIMEOUT_MS });
    } catch (error) {
      state.busy = false;
      button.disabled = false;
      return say(status, photoErrorText(error), true);
    }
    state.busy = false;
    button.disabled = false;
    // The student left the page while the AI was reading: the answer is dropped, not saved behind their back.
    if (!root.isConnected) return;
    try {
      ctx.finish(parseCheck(answer));
    } catch (error) {
      say(status, `${error.message} Try again, or use ChatGPT or Gemini below.`, true);
    }
  });
}

/**
 * Wires the copy-and-paste route.
 *
 * @param {object} app The app shell.
 * @param {object} ctx Page context (see mountRun).
 */
function mountOutside(app, ctx) {
  const { subject, root, state, form } = ctx;
  const status = root.querySelector('[data-paste-status]');
  root.querySelector('[data-copy-prompt]').addEventListener('click', () => copyText(app, checkPrompt({
    ...promptParts(subject, state.mode),
    note: form.note.value,
    photos: Math.max(1, state.photos.length),
    external: true,
  }), 'Prompt copied. Paste it into ChatGPT or Gemini and attach your photos.'));
  root.querySelector('[data-show-result]').addEventListener('click', () => {
    try {
      ctx.finish(parseCheck(form.answer.value));
    } catch (error) {
      // parseCheck throws messages written for the student, so they are shown as they are.
      say(status, error.message, true);
    }
  });
}

/**
 * The page that starts a check.
 *
 * @param {object} app The app shell.
 * @param {object} subject The subject.
 * @param {object|undefined} event The linked test, if any.
 * @returns {object} View description.
 */
function setupPage(app, subject, event) {
  const ready = aiReady(visionSettings());
  const eventId = event?.id || '';
  return {
    title: 'Check a test',
    back: backRoute(subject, eventId),
    tab: event ? 'tests' : 'home',
    body: html`
      ${pageHead(subject, 'Check a test from a photo')}
      ${event ? html`<p class="notice notice-test">${icon('target')}<span>For <strong data-no-tr>${event.title}</strong></span></p>` : ''}
      <form class="tc-form" novalidate>
        ${modeCard()}
        ${photoCard()}
        ${ready ? html`${runCard(true, insecureHost(visionSettings().url))}${outsideCard()}` : html`${outsideCard()}${runCard(false)}`}
      </form>`,
    /**
     * Wires the page once it is in the DOM.
     *
     * @param {HTMLElement} root The page container.
     */
    mount(root) {
      const form = root.querySelector('form');
      const state = { mode: 'check', photos: [], pending: 0, busy: false };
      const draft = bindDraft(form, `testcheck:${subject.id}:${eventId}`);
      const ctx = {
        subject, root, state, form,
        /** Saves a parsed result, opens its page and drops the draft. */
        finish(result) {
          saveResult(app, subject, { eventId, mode: state.mode }, result);
          draft.clear();
        },
      };
      form.addEventListener('submit', e => e.preventDefault());
      /** Switches the mode and the hint text under the switch. */
      onSegmented(root, (name, value) => {
        state.mode = value;
        root.querySelector('[data-mode-hint]').textContent = MODE_HINTS[value];
      });
      /** Enables the run button only while there is a photo and no request is running. */
      mountPhotos(root, state, () => {
        const run = root.querySelector('[data-run]');
        if (run) run.disabled = state.busy || !state.photos.length;
      });
      if (ready) mountRun(ctx);
      mountOutside(app, ctx);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Result page
// ---------------------------------------------------------------------------------------------------------------

/**
 * A fresh per-card view state (nothing revealed, nothing being edited).
 *
 * @returns {object} State: phase 'closed' | 'trying' | 'revealed', the typed try, and the "fix what the AI read" form.
 */
const newCardView = () => ({ phase: 'closed', attempt: '', fixing: false, fixQuestion: '', fixAnswer: '', fixPaste: '', fixMessage: '', fixBad: false, busy: false });

/**
 * One labelled block of text on a card.
 *
 * @param {string} label The label (UI text).
 * @param {string} text AI or student text; escaped and never translated.
 * @param {string} [empty] UI text shown in grey when `text` is empty.
 * @param {string} [extraClass] Extra CSS class.
 * @returns {object|string} html`` fragment, or '' when there is nothing to show and no `empty` text.
 */
function textBlock(label, text, empty = '', extraClass = '') {
  if (!text && !empty) return '';
  return html`<div class="tc-field ${extraClass}"><div class="tc-label">${label}</div>${text
    ? html`<p class="tc-text" data-no-tr>${text}</p>`
    : html`<p class="tc-text muted">${empty}</p>`}</div>`;
}

/**
 * The buttons or the text box that stand in for a hidden answer.
 *
 * @param {object} view The card's view state.
 * @param {number} index Question position.
 * @returns {object} html`` fragment.
 */
function tryBlock(view, index) {
  if (view.phase === 'trying') {
    return html`<div class="tc-try">
      <label class="tc-label" for="tc-try-${index}">Your new try</label>
      <textarea class="input textarea tc-input" id="tc-try-${index}" data-field="attempt" rows="3" maxlength="${TRY_MAX}">${view.attempt}</textarea>
      <div class="tc-actions"><button type="button" class="btn btn-primary btn-sm" data-action="reveal">Reveal</button><button type="button" class="btn btn-text btn-sm" data-action="try-cancel">Cancel</button></div>
    </div>`;
  }
  return html`<div class="tc-try">
    <p class="muted small">Have another go before you look at the answer.</p>
    <div class="tc-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="try">Try again</button><button type="button" class="btn btn-text btn-sm" data-action="reveal">Show answer</button></div>
  </div>`;
}

/**
 * The "Fix what the AI read" form of a card.
 *
 * @param {object} view The card's view state.
 * @param {number} index Question position.
 * @param {{ mode: string, ready: boolean }} options `ready` is true when the AI can recheck in the app.
 * @returns {object} html`` fragment.
 */
function fixForm(view, index, { mode, ready }) {
  return html`<div class="tc-fix">
    <label class="field-label" for="tc-fq-${index}">Question as printed</label>
    <textarea class="input textarea tc-input" id="tc-fq-${index}" data-field="fixQuestion" rows="3" maxlength="${QUESTION_EDIT_MAX}">${view.fixQuestion}</textarea>
    ${mode === 'check' ? html`<label class="field-label" for="tc-fa-${index}">Your answer</label>
      <textarea class="input textarea tc-input" id="tc-fa-${index}" data-field="fixAnswer" rows="2" maxlength="${TRY_MAX}">${view.fixAnswer}</textarea>` : ''}
    ${ready
      ? html`<div class="tc-actions"><button type="button" class="btn btn-primary btn-sm" data-action="recheck" ${view.busy ? 'disabled' : ''}>${icon('sparkle')}Recheck</button></div>`
      : html`<div class="tc-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="copy-recheck">${icon('copy')}Copy prompt</button></div>
        <label class="field-label" for="tc-fp-${index}">Paste the answer</label>
        <textarea class="input textarea tc-input" id="tc-fp-${index}" data-field="fixPaste" rows="4" spellcheck="false">${view.fixPaste}</textarea>
        <div class="tc-actions"><button type="button" class="btn btn-primary btn-sm" data-action="apply-paste">${icon('check')}Use the answer</button></div>`}
    <p class="tc-status ${view.fixBad ? 'is-bad' : ''}" role="status" ${view.fixMessage ? '' : 'hidden'}>${view.fixMessage}</p>
    <div class="tc-actions"><button type="button" class="btn btn-text btn-sm" data-action="fix-cancel">Close</button></div>
  </div>`;
}

/**
 * Builds the card of one question.
 *
 * @param {object} question A checked question.
 * @param {number} index Its position in the result.
 * @param {object} view The card's view state (see newCardView).
 * @param {{ mode: string, showAll: boolean, ready: boolean }} options Record mode, the top "show all" toggle, and whether the AI is ready.
 * @returns {object} html`` fragment; the root element carries data-index.
 */
export function questionCard(question, index, view, { mode, showAll, ready }) {
  const hidden = answerHidden(question, { mode, showAll, phase: view.phase });
  const shownTry = !hidden && view.attempt.trim() && triesFirst(question, mode);
  return html`<article class="card tc-card v-${question.verdict}" data-index="${index}">
    <header class="tc-card-head">
      <span class="tc-num">Question <span data-no-tr>${question.number}</span></span>
      <span class="tc-verdict v-${question.verdict}">${VERDICT_LABELS[question.verdict] || ''}</span>
      ${question.points ? html`<span class="tc-points" data-no-tr>${question.points.earned}/${question.points.max}</span>` : ''}
    </header>
    ${question.lowConfidence ? html`<p class="tc-warn">${icon('alert')}<span>Check this: the photo was hard to read</span></p>` : ''}
    ${textBlock('Question', question.question)}
    ${mode === 'check' ? textBlock('Your answer', question.studentAnswer, 'Nothing written') : ''}
    ${hidden ? tryBlock(view, index) : html`
      ${shownTry ? textBlock('Your new try', view.attempt) : ''}
      ${textBlock('Correct answer', question.correctAnswer, '', 'tc-correct')}
      ${textBlock('Why', question.explanation)}
      ${textBlock('Next time', question.tip)}`}
    ${view.fixing
      ? fixForm(view, index, { mode, ready })
      : html`<button type="button" class="btn btn-text btn-sm tc-fix-open" data-action="fix">${icon('edit')}Fix what the AI read</button>`}
  </article>`;
}

/**
 * The summary card at the top of a result.
 *
 * @param {object} record The saved check.
 * @param {boolean} showAll State of the "show all answers" toggle.
 * @returns {object} html`` fragment.
 */
function summaryCard(record, showAll) {
  const { result } = record;
  const stats = checkStats(result);
  const points = pointsLabel(stats);
  const mistakes = mistakeCards(result).length;
  const solved = record.mode === 'solve';
  const canHide = result.questions.some(q => triesFirst(q, record.mode));
  return html`<section class="card tc-summary">
    <header class="card-head"><h2 data-no-tr>${checkTitle(record)}</h2><span class="card-meta">${formatDate(record.created, DATE_FORMAT)}</span></header>
    ${solved
      ? html`<p class="tc-total">${solvedLabel(stats)}</p>`
      : html`<div class="tc-counts">${summaryParts(stats).map(p => html`<span class="tc-count v-${p.verdict}"><strong>${p.count}</strong> ${p.label}</span>`)}</div>
        ${points ? html`<p class="tc-total">${points}</p>` : ''}`}
    ${result.summary ? html`<p class="tc-text" data-no-tr>${result.summary}</p>` : ''}
    ${result.focus?.length ? html`<div class="tc-label">Topics to revise</div><ul class="tc-focus">${result.focus.map(f => html`<li data-no-tr>${f}</li>`)}</ul>` : ''}
    <div class="tc-actions">
      ${canHide ? html`<button type="button" class="btn btn-secondary btn-sm" data-action="show-all" aria-pressed="${String(showAll)}">${showAll ? 'Hide answers again' : 'Show all answers'}</button>` : ''}
      ${mistakes ? html`<button type="button" class="btn btn-primary btn-sm" data-action="add-cards">${icon('learn')}Add ${plural(mistakes, solved ? 'question' : 'mistake')} to flashcards</button>` : ''}
    </div>
  </section>`;
}

/**
 * Wires the "Fix what the AI read" actions of the result page.
 *
 * @param {object} app The app shell.
 * @param {object} subject The subject.
 * @param {object} page Page state: `record` (current), `cardView(i)`, `paintCard(i)`, `paintAll()`, `root`, `replace(index, question)`.
 * @returns {Object<string, (index: number) => void|Promise<void>>} Handlers by data-action name.
 */
function fixActions(app, subject, page) {
  /** Builds the recheck prompt from the edited texts, or reports what is missing. */
  const promptFor = index => {
    const view = page.cardView(index);
    const corrected = correctedQuestion(page.record.result.questions[index], view);
    if (!corrected.question) {
      view.fixMessage = 'Write the question as it is printed.';
      view.fixBad = true;
      page.paintCard(index);
      return null;
    }
    return { corrected, prompt: recheckPrompt({ ...promptParts(subject, page.record.mode), question: corrected }) };
  };
  /** Applies an answer text (from the AI or pasted); shows the parser's message when it is unusable. */
  const useAnswer = (index, corrected, answer) => {
    const view = page.cardView(index);
    try {
      page.replace(index, parseRecheck(answer, corrected.number));
    } catch (error) {
      view.busy = false;
      view.fixMessage = error.message;
      view.fixBad = true;
      page.paintCard(index);
    }
  };
  return {
    /** Sends the corrected question to the AI and replaces it in the result with the answer. */
    async recheck(index) {
      const view = page.cardView(index);
      const built = view.busy ? null : promptFor(index);
      if (!built) return;
      view.busy = true;
      view.fixMessage = 'Checking again.';
      view.fixBad = false;
      page.paintCard(index);
      let answer = '';
      let failure = null;
      try {
        answer = await chat(aiSettings(), [{ role: 'user', content: built.prompt }]);
      } catch (error) {
        failure = error;
      }
      // The student left the page meanwhile: there is nothing to repaint or save.
      if (!page.root.isConnected) return;
      if (failure) {
        view.busy = false;
        view.fixMessage = failure.message;
        view.fixBad = true;
        page.paintCard(index);
      } else {
        useAnswer(index, built.corrected, answer);
      }
    },
    /** Copies the recheck prompt for an outside chatbot. */
    'copy-recheck'(index) {
      const built = promptFor(index);
      if (built) copyText(app, built.prompt, 'Prompt copied. Paste it into ChatGPT or Gemini.');
    },
    /** Uses the pasted chatbot answer as the rechecked question. */
    'apply-paste'(index) {
      const built = promptFor(index);
      if (built) useAnswer(index, built.corrected, page.cardView(index).fixPaste);
    },
  };
}

/**
 * Wires the whole result page: card actions, the top toggle, flashcards and delete.
 *
 * @param {object} app The app shell.
 * @param {object} subject The subject.
 * @param {object} initial The saved check to show.
 * @param {HTMLElement} root The page container.
 */
function mountResult(app, subject, initial, root) {
  const region = root.querySelector('[data-result]');
  const views = [];
  const page = {
    record: initial,
    root,
    showAll: false,
    /** The view state of card `index`, created on first use. */
    cardView: index => (views[index] ??= newCardView()),
    /** What every card needs to know about the page: mode, the top toggle and whether the AI is ready. */
    options: () => ({ mode: page.record.mode, showAll: page.showAll, ready: aiReady(aiSettings()) }),
    /** Repaints one card (keeps typing and scroll in the other cards). */
    paintCard(index, focus = '') {
      const old = region.querySelector(`[data-index="${index}"]`);
      old.outerHTML = questionCard(page.record.result.questions[index], index, page.cardView(index), page.options()).s;
      if (focus) region.querySelector(`[data-index="${index}"] ${focus}`)?.focus();
    },
    /** Repaints summary and cards, then puts the page back where it was. */
    paintAll() {
      const top = window.scrollY;
      region.innerHTML = html`${summaryCard(page.record, page.showAll)}${page.record.result.questions.map((q, i) => questionCard(q, i, page.cardView(i), page.options()))}`.s;
      window.scrollTo(0, top);
    },
    /** Stores a rechecked question in the saved result; the student has just edited it, so its answer shows. */
    replace(index, question) {
      page.record = replaceQuestion(page.record, index, question);
      app.saveCheck(page.record);
      views[index] = { ...newCardView(), phase: 'revealed' };
      page.paintAll();
      app.toast('Question updated.', { kind: 'success' });
    },
  };
  page.paintAll();

  /** Merges `patch` into a card's view state and repaints that card, focusing `focus` when given. */
  const updateCard = (index, patch, focus) => {
    Object.assign(page.cardView(index), patch);
    page.paintCard(index, focus);
  };
  /** Click handlers by data-action name; each gets the card's index (undefined for page-level buttons). */
  const actions = {
    ...fixActions(app, subject, page),
    try: i => updateCard(i, { phase: 'trying' }, '[data-field=attempt]'),
    'try-cancel': i => updateCard(i, { phase: 'closed' }),
    reveal: i => updateCard(i, { phase: 'revealed' }),
    /** Opens the "Fix what the AI read" form filled with the current texts. */
    fix(i) {
      const question = page.record.result.questions[i];
      updateCard(i, { fixing: true, fixQuestion: question.question, fixAnswer: question.studentAnswer, fixMessage: '', fixBad: false }, '[data-field=fixQuestion]');
    },
    'fix-cancel': i => updateCard(i, { fixing: false }),
    /** Flips the "Show all answers" toggle. */
    'show-all'() {
      page.showAll = !page.showAll;
      page.paintAll();
    },
    /** Puts the missed questions into the subject's "Mistakes from tests" lesson and tells how many are new. */
    'add-cards'() {
      const { added } = addMistakeCards(store.lessons, {
        subjectId: subject.id,
        subjectName: subject.name,
        cards: mistakeCards(page.record.result),
        id: () => uid('l'),
      });
      store.save('lessons');
      app.toast(added ? `Added ${plural(added, 'card')} to Mistakes from tests.` : 'These mistakes are already in your flashcards.', { kind: 'success' });
    },
  };
  // Typing is kept in the card's view state, so a repaint of the card never loses it.
  root.addEventListener('input', e => {
    const field = e.target.dataset?.field;
    const card = e.target.closest?.('[data-index]');
    if (field && card) page.cardView(Number(card.dataset.index))[field] = e.target.value;
  });
  // One listener serves every card button through its data-action.
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-index]');
    actions[btn.dataset.action]?.(card ? Number(card.dataset.index) : undefined);
  });
  // Deleting asks first; the flashcards already added from the result are separate and stay.
  root.querySelector('[data-delete]').addEventListener('click', async () => {
    const ok = await app.confirm({ title: 'Delete this result?', text: 'The saved result is removed from this device. Flashcards you added from it stay.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    app.deleteCheck(page.record.id);
    app.toast('Result deleted.', { kind: 'success' });
    app.go(backRoute(subject, page.record.eventId));
  });
}

/**
 * The page that shows a saved result.
 *
 * @param {object} app The app shell.
 * @param {object} subject The subject.
 * @param {object} record The saved check.
 * @returns {object} View description.
 */
function resultPage(app, subject, record) {
  return {
    title: record.mode === 'solve' ? 'Solved test' : 'Checked test',
    back: backRoute(subject, record.eventId),
    tab: record.eventId ? 'tests' : 'home',
    body: html`${pageHead(subject, 'Test check')}
      <div data-result></div>
      <button type="button" class="btn btn-ghost-danger btn-block" data-delete>${icon('trash')}Delete this result</button>`,
    mount: root => mountResult(app, subject, record, root),
  };
}

/**
 * Route view for #/testcheck/<subjectId>.
 *
 * @param {object} app The app shell.
 * @param {{ id: string, event?: string, check?: string }} params `id` is the subject id (set by the router),
 *   `event` links a new check to a test, `check` opens a saved result.
 * @returns {object} View description; redirects home for an unknown subject, and to the setup page for an unknown result.
 */
export function testCheckView(app, params) {
  const subject = app.subject(params.id);
  if (!subject) return { redirect: 'home' };
  if (params.check) {
    const record = app.checksOf(subject.id).find(c => c.id === params.check);
    return record ? resultPage(app, subject, record) : { redirect: `testcheck/${encodeURIComponent(subject.id)}` };
  }
  const event = store.events.find(e => e.id === params.event && e.subjectId === subject.id);
  return setupPage(app, subject, event);
}
