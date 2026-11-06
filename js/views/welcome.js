/**
 * Get started interview (#/welcome): asks who the student is, one question per screen, then builds the subjects.
 *
 * Responsibility: the wizard steps (languages, country, age and year, school, subjects, goals) and the
 * build step, where an AI turns the answers into subjects with a profile, a plan and a topic outline. With an
 * AI key the app asks the AI itself; without one the student copies the prompt into any chatbot and pastes
 * the answer back. Every answer is saved into `settings.student` at once, so closing the app loses nothing.
 * The pure parts (step list, validation, subject list editing, prompt inputs) are exported and unit tested;
 * the rest only wires them to the page.
 *
 * Fits in: registered in js/app.js as the 'welcome' route (`#/welcome?step=<n>`, n counts from 0); opened
 * after an account is created, from the Home card and from Account > About you. Uses student.js
 * (profile limits), curriculum.js (prompt, parse, apply), ai.js (chat), locale.js (student text),
 * holidays.js (countries) and drafts.js (the paste box). Styles live in css/welcome.css.
 * Invariants: applying never deletes subjects; the profile is marked done only after subjects were written.
 */
import { store, uid } from '../store.js';
import { chat, aiReady, aiSettings, AI_LANGUAGES, languageName } from '../ai.js';
import { html, icon, plural } from '../ui.js';
import { bindDraft } from '../drafts.js';
import { copyText } from './parts.js';
import { COUNTRIES, countryName } from '../holidays.js';
import { UI_LANGUAGES, uiLanguage, studentText, audienceText, isCzechSchool } from '../locale.js';
import {
  STAGES, MAX_SUBJECTS, SUBJECT_NAME_MAX, SCHOOL_MAX, GOALS_MAX, NOTES_MAX, normalizeStudent,
} from '../student.js';
import { clip } from '../text.js';
import { tr } from '../i18n.js';
import { curriculumPrompt, parseCurriculum, applyCurriculum, curriculumSummary, plainSubjects } from '../curriculum.js';

/** The interview screens in order: `key` names the step, `title` is the question, `hint` explains why it is asked. */
export const STEPS = [
  { key: 'language', title: 'Which languages do you want?', hint: 'One for the menus and one for the answers of the AI.' },
  { key: 'country', title: 'Which country do you live in?', hint: 'It decides the school calendar and what a school year covers.' },
  { key: 'level', title: 'How old are you, and which year are you in?', hint: 'The AI explains things at your level.' },
  { key: 'school', title: 'Which school do you go to?', hint: 'Optional. The name or the type of school is enough.' },
  { key: 'subjects', title: 'Which subjects do you have this year?', hint: 'Tap the ones you have and add your own. Pick at least one.' },
  { key: 'goals', title: 'What do you want from the app?', hint: 'Optional. For example "better marks in maths" or "pass the entrance exam".' },
  { key: 'build', title: 'Build your subjects', hint: 'The AI plans each subject for your school year.' },
];

/** Subjects offered as chips; the student's own entries are added next to them. */
export const SUBJECT_SUGGESTIONS = [
  'Maths', 'English', 'Science', 'Biology', 'Chemistry', 'Physics', 'History', 'Geography',
  'Art', 'Music', 'PE', 'Computing', 'German', 'French', 'Spanish', 'Literature',
];

/** Age and year ranges the level step accepts; they match js/student.js. */
const AGE_RANGE = [4, 99];
const YEAR_RANGE = [1, 13];

/** The index of the build step, the last one. */
const BUILD_INDEX = STEPS.length - 1;

/**
 * Turns the `step` query value into a valid step index.
 *
 * @param {unknown} value The raw `?step=` text (or nothing).
 * @returns {number} An integer from 0 to the last step; anything unusable gives 0.
 */
export function clampStep(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? Math.min(Math.max(n, 0), STEPS.length - 1) : 0;
}

/**
 * Finds the step after or before the given one.
 *
 * @param {number} index Current step index.
 * @param {1|-1} direction 1 for next, -1 for back.
 * @returns {number|null} The neighbouring index, or null past either end.
 */
export function neighbourStep(index, direction) {
  const target = index + direction;
  return target >= 0 && target < STEPS.length ? target : null;
}

/**
 * Parses a whole number typed into a field.
 *
 * @param {unknown} text The field's text; '' means "not answered".
 * @param {[number, number]} range Allowed minimum and maximum.
 * @returns {{ value: number|null, valid: boolean }} `valid` is false for text that is not a whole number in range.
 */
function parseWhole(text, [min, max]) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return { value: null, valid: true };
  const n = Number(trimmed);
  const valid = Number.isInteger(n) && n >= min && n <= max;
  return { value: valid ? n : null, valid };
}

/**
 * Checks whether the student may continue from a step.
 *
 * Only three steps can block: the level step (an age or year that is not a number in range), and the subjects
 * and build steps (at least one subject). Every other answer is optional.
 *
 * @param {string} key The step key from STEPS.
 * @param {import('../student.js').Student} student The saved profile.
 * @param {{ age?: string, year?: string }} [raw] The level fields as typed, to catch text the profile would drop.
 * @returns {string} An error message for the student, or '' when they can continue.
 */
export function validateStep(key, student, raw = {}) {
  if (key === 'level') {
    if (!parseWhole(raw.age, AGE_RANGE).valid) return `Age must be a whole number from ${AGE_RANGE[0]} to ${AGE_RANGE[1]}.`;
    if (!parseWhole(raw.year, YEAR_RANGE).valid) return `Year must be a whole number from ${YEAR_RANGE[0]} to ${YEAR_RANGE[1]}.`;
  }
  if ((key === 'subjects' || key === 'build') && !student.subjects.length) return 'Pick or add at least one subject to continue.';
  return '';
}

/**
 * Reads the level fields into profile values.
 *
 * @param {{ age?: string, year?: string, stage?: string }} raw Field values as typed.
 * @returns {{ age: number|null, year: number|null, stage: string }} Unusable values become null or ''.
 */
export function readLevel(raw) {
  const stage = STAGES.some(stage => stage.value === raw.stage) ? raw.stage : '';
  return { age: parseWhole(raw.age, AGE_RANGE).value, year: parseWhole(raw.year, YEAR_RANGE).value, stage };
}

/**
 * Switches a subject on or off in the profile's list.
 *
 * @param {string[]} subjects The current subject names.
 * @param {string} name The subject to toggle; matched case-insensitively.
 * @returns {string[]} A new list: without the subject if it was there, with it added otherwise.
 */
export function toggleSubject(subjects, name) {
  const key = name.toLowerCase();
  if (subjects.some(subject => subject.toLowerCase() === key)) return subjects.filter(subject => subject.toLowerCase() !== key);
  return normalizeStudent({ subjects: [...subjects, name] }).subjects;
}

/**
 * Adds subjects typed by the student, separated by commas or line breaks.
 *
 * @param {string[]} subjects The current subject names.
 * @param {string} text What was typed, for example "Latin, Drama".
 * @returns {string[]} A new list with the new names added (duplicates ignored, names and list length capped).
 */
export function addSubjects(subjects, text) {
  const names = String(text).split(/[,\n;]/).map(name => clip(name, SUBJECT_NAME_MAX)).filter(Boolean);
  return normalizeStudent({ subjects: [...subjects, ...names] }).subjects;
}

/**
 * Collects what the curriculum prompt needs from the profile and the locale.
 *
 * @param {import('../student.js').Student} student The saved profile.
 * @param {{ studentText: string, audience: string, countryName: string, languageLabel: string, czech: boolean }} env
 *   The description of the student, the style line, the plain English country name, the answer language
 *   and whether the school is Czech (all from js/locale.js and js/ai.js, passed in so tests control them).
 * @param {boolean} external True for the copy-paste prompt, which speaks as the student.
 * @returns {string} The prompt text.
 */
export function buildCurriculumPrompt(student, env, external) {
  return curriculumPrompt({
    studentText: env.studentText,
    audience: env.audience,
    countryName: env.countryName,
    languageLabel: env.languageLabel,
    subjects: student.subjects,
    goals: student.goals,
    notes: student.notes,
    czech: env.czech,
    external,
  });
}

/** English name of a country for prompts, whatever the interface language is. */
function englishCountryName(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/** Reads the prompt inputs from the current account's settings and locale. */
function promptEnv() {
  const settings = store.settings;
  return {
    studentText: studentText(),
    audience: audienceText(),
    countryName: englishCountryName(settings.country),
    languageLabel: languageName(settings.aiLanguage),
    czech: isCzechSchool(),
  };
}

/**
 * Lists the chips of the subjects step: the suggestions, then the student's own entries.
 *
 * A suggestion is shown in the interface language (`translate`), and a subject saved under either its English
 * or its translated name counts as picked, so no suggestion appears twice.
 *
 * @param {string[]} subjects The subjects saved in the profile.
 * @param {string[]} suggestions The English suggestion names.
 * @param {(text: string) => string} translate Maps an English text to the interface language.
 * @returns {{ label: string, value: string, picked: boolean }[]} `label` is the text on the chip; `value` is
 *   the name stored when the chip is picked (the saved name when already picked, else the label).
 */
export function subjectChipEntries(subjects, suggestions, translate) {
  const saved = new Map(subjects.map(name => [name.toLowerCase(), name]));
  const known = new Set();
  const entries = suggestions.map(name => {
    const label = translate(name);
    const stored = saved.get(label.toLowerCase()) ?? saved.get(name.toLowerCase());
    known.add(label.toLowerCase()).add(name.toLowerCase());
    return { label, value: stored ?? label, picked: stored !== undefined };
  });
  const own = subjects.filter(name => !known.has(name.toLowerCase())).map(name => ({ label: name, value: name, picked: true }));
  return [...entries, ...own];
}

/** Builds the chip buttons of the subjects step from the saved profile. */
function subjectChips(student) {
  return subjectChipEntries(student.subjects, SUBJECT_SUGGESTIONS, tr).map(entry => html`<button type="button" class="chip welcome-chip ${entry.picked ? 'active' : ''}" aria-pressed="${String(entry.picked)}" data-subject="${entry.value}">${entry.label}</button>`);
}

/** Renders the fields of one wizard step (not the build step). */
function stepFields(key, student) {
  const settings = store.settings;
  if (key === 'language') {
    return html`
      <label class="field-label" for="w-ui">Menus and buttons</label>
      <select class="input input-lg" id="w-ui" name="uiLanguage" data-no-tr>
        ${UI_LANGUAGES.map(language => html`<option value="${language.code}" ${language.code === uiLanguage() ? 'selected' : ''}>${language.name}</option>`)}
      </select>
      <label class="field-label" for="w-ai">Answers of the AI</label>
      <select class="input input-lg" id="w-ai" name="aiLanguage" data-no-tr>
        ${AI_LANGUAGES.map(code => html`<option value="${code}" ${code === settings.aiLanguage ? 'selected' : ''}>${languageName(code, code)} · ${languageName(code)}</option>`)}
      </select>`;
  }
  if (key === 'country') {
    const countries = COUNTRIES.map(code => [code, countryName(code)]).sort((a, b) => a[1].localeCompare(b[1], uiLanguage()));
    return html`
      <label class="field-label" for="w-country">Country</label>
      <select class="input input-lg" id="w-country" name="country" data-no-tr>
        <option value="" ${settings.country ? '' : 'selected'}>Not set</option>
        ${countries.map(([code, name]) => html`<option value="${code}" ${code === settings.country ? 'selected' : ''}>${name}</option>`)}
      </select>`;
  }
  if (key === 'level') {
    return html`
      <div class="welcome-pair">
        <div><label class="field-label" for="w-age">Age</label>
          <input class="input input-lg" id="w-age" name="age" type="number" inputmode="numeric" min="${AGE_RANGE[0]}" max="${AGE_RANGE[1]}" value="${student.age ?? ''}" placeholder="e.g. 9"></div>
        <div><label class="field-label" for="w-year">School year</label>
          <input class="input input-lg" id="w-year" name="year" type="number" inputmode="numeric" min="${YEAR_RANGE[0]}" max="${YEAR_RANGE[1]}" value="${student.year ?? ''}" placeholder="e.g. 4"></div>
      </div>
      <div class="field-label" id="w-stage-label">Stage</div>
      <div class="chips wrap" role="group" aria-labelledby="w-stage-label">
        ${STAGES.map(stage => html`<button type="button" class="chip welcome-chip ${stage.value === student.stage ? 'active' : ''}" aria-pressed="${String(stage.value === student.stage)}" data-stage="${stage.value}">${stage.label}</button>`)}
      </div>`;
  }
  if (key === 'school') {
    return html`
      <label class="field-label" for="w-school">School</label>
      <input class="input input-lg" id="w-school" name="school" maxlength="${SCHOOL_MAX}" value="${student.school}" placeholder="e.g. a local primary school" autocomplete="off" data-no-tr>`;
  }
  if (key === 'subjects') {
    return html`
      <div class="chips wrap" data-subject-chips>${subjectChips(student)}</div>
      <form class="welcome-add" novalidate>
        <label class="field-label" for="w-own">Your own subject</label>
        <div class="welcome-add-row">
          <input class="input input-lg" id="w-own" name="own" maxlength="${SUBJECT_NAME_MAX}" placeholder="e.g. Latin" autocomplete="off" data-no-tr>
          <button class="btn btn-secondary btn-lg" type="submit">${icon('plus')}Add</button>
        </div>
      </form>
      <p class="muted small" data-subject-count></p>`;
  }
  return html`
    <label class="field-label" for="w-goals">Your goals</label>
    <textarea class="input textarea welcome-text" id="w-goals" name="goals" rows="3" maxlength="${GOALS_MAX}" data-no-tr>${student.goals}</textarea>
    <label class="field-label" for="w-notes">Anything else the AI should know</label>
    <textarea class="input textarea welcome-text" id="w-notes" name="notes" rows="4" maxlength="${NOTES_MAX}" data-no-tr>${student.notes}</textarea>`;
}

/** Renders the build step: the summary, the AI route or the copy-paste route, the preview and the plain route. */
function buildFields(student, ready) {
  return html`
    <div class="welcome-summary">
      <strong>About you</strong>
      <p>${studentText()}</p>
      <p class="muted small">${plural(student.subjects.length, 'subject')}: ${student.subjects.join(', ') || 'none yet'}</p>
    </div>
    ${ready
      ? html`<button class="btn btn-primary btn-block btn-lg" type="button" data-build>${icon('sparkle')}Build my subjects</button>`
      : html`<div class="welcome-copy">
          <p class="setup-text">No AI key yet. Copy the prompt, paste it into ChatGPT, Gemini or Claude, then paste the answer here. Or <a href="#/account">add a free key in Account</a> to build here.</p>
          <button class="btn btn-secondary btn-block btn-lg" type="button" data-copy>${icon('copy')}Copy prompt</button>
          <div class="welcome-paste">
            <label class="field-label" for="w-paste">Paste the answer</label>
            <textarea class="input textarea" id="w-paste" name="answer" rows="6" placeholder="Paste the whole answer of the AI here" spellcheck="false" data-no-tr></textarea>
          </div>
        </div>`}
    <p class="setup-status" role="status" hidden></p>
    <div class="welcome-preview" hidden></div>
    <button class="btn btn-primary btn-block btn-lg" type="button" data-apply hidden>${icon('check')}Apply</button>
    <button class="btn btn-text btn-block" type="button" data-plain>Create subjects without AI</button>`;
}

/** Renders the progress dots for the step at `index`. */
function progressDots(index) {
  return html`<div class="welcome-dots" role="img" aria-label="Step ${index + 1} of ${STEPS.length}">
    ${STEPS.map((_, i) => html`<i class="${i === index ? 'now' : i < index ? 'done' : ''}"></i>`)}
  </div>`;
}

/** Saves the fields of a step into the profile and the settings, and returns the typed level text for validation. */
function saveStep(key, root) {
  /** Current text of the named field, or '' when this step has no such field. */
  const value = name => root.querySelector(`[name="${name}"]`)?.value ?? '';
  const student = store.settings.student;
  const settings = store.settings;
  if (key === 'language') {
    settings.aiLanguage = AI_LANGUAGES.includes(value('aiLanguage')) ? value('aiLanguage') : 'en';
    settings.uiLanguage = UI_LANGUAGES.some(language => language.code === value('uiLanguage')) ? value('uiLanguage') : 'en';
    store.save('settings');
  } else if (key === 'country') {
    settings.country = COUNTRIES.includes(value('country')) ? value('country') : '';
    store.save('settings');
  } else if (key === 'level') {
    const stage = root.querySelector('[data-stage].active')?.dataset.stage || '';
    store.saveStudent({ ...student, ...readLevel({ age: value('age'), year: value('year'), stage }) });
  } else if (key === 'school') {
    store.saveStudent({ ...student, school: value('school') });
  } else if (key === 'goals') {
    store.saveStudent({ ...student, goals: value('goals'), notes: value('notes') });
  }
  return { age: value('age'), year: value('year') };
}

/** Wires the subject chips and the "own subject" form; every change is saved at once. */
function mountSubjects(root) {
  const chips = root.querySelector('[data-subject-chips]');
  const count = root.querySelector('[data-subject-count]');
  const form = root.querySelector('.welcome-add');
  const input = form.querySelector('input');
  /** Repaints the chips and the counter from the saved profile. */
  const paint = () => {
    chips.innerHTML = subjectChips(store.settings.student).map(c => c.s).join('');
    count.textContent = `${store.settings.student.subjects.length} of ${MAX_SUBJECTS} subjects picked.`;
  };
  /** Saves a new subject list and repaints. */
  const update = subjects => {
    store.saveStudent({ ...store.settings.student, subjects });
    paint();
  };
  paint();
  chips.addEventListener('click', e => {
    const chip = e.target.closest('[data-subject]');
    if (!chip) return;
    // A picked chip is removed by its saved name; a new pick is saved as the student sees it (translated).
    const name = chip.classList.contains('active') ? chip.dataset.subject : chip.textContent.trim() || chip.dataset.subject;
    update(toggleSubject(store.settings.student.subjects, name));
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    update(addSubjects(store.settings.student.subjects, input.value));
    input.value = '';
    input.focus();
  });
}

/** Wires the stage chips of the level step: one can be active, tapping it again clears it. */
function mountStages(root) {
  const stages = root.querySelectorAll('[data-stage]');
  stages.forEach(chip => chip.addEventListener('click', () => {
    const turnOn = !chip.classList.contains('active');
    stages.forEach(c => {
      c.classList.toggle('active', turnOn && c === chip);
      c.setAttribute('aria-pressed', String(turnOn && c === chip));
    });
    saveStep('level', root);
  }));
}

/**
 * Wires the build step: AI call or copy-paste, preview, Apply and the plain route.
 *
 * @param {object} app The app shell (go, toast).
 * @param {HTMLElement} root The step container.
 * @returns {void}
 */
function mountBuild(app, root) {
  const status = root.querySelector('.setup-status');
  const preview = root.querySelector('.welcome-preview');
  const apply = root.querySelector('[data-apply]');
  const paste = root.querySelector('[name=answer]');
  let draft = null;
  let curriculum = null;

  /** Shows one status line; '' hides it. `bad` styles it as an error. */
  const say = (message, bad = false) => {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle('is-bad', bad);
  };
  /** Shows the parsed curriculum as a preview with the Apply button, or clears both when there is none. */
  const show = next => {
    curriculum = next;
    apply.hidden = !next;
    preview.hidden = !next;
    preview.innerHTML = next ? curriculumSummary(next).map(block => html`<pre class="welcome-block">${block}</pre>`.s).join('') : '';
  };
  /** Finishes: saves the subjects, marks the profile done and opens Home. */
  const finish = (added, updated = []) => {
    store.save('subjects');
    store.saveStudent({ ...store.settings.student, done: true });
    draft?.clear();
    const parts = [added.length && `${plural(added.length, 'subject')} added`, updated.length && `${plural(updated.length, 'subject')} updated`];
    app.toast(parts.filter(Boolean).join(', ') || 'Your subjects are up to date.', { kind: 'success' });
    app.go('home');
  };
  root.querySelector('[data-build]')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    show(null);
    say('Asking the AI. This can take up to a minute…');
    try {
      const prompt = buildCurriculumPrompt(store.settings.student, promptEnv(), false);
      show(parseCurriculum(await chat(aiSettings(), [{ role: 'user', content: prompt }])));
      say('');
    } catch (error) {
      // AiError and parser messages are written for the student; a programming error must surface instead.
      if (error instanceof TypeError || error instanceof ReferenceError) throw error;
      say(error.message, true);
    } finally {
      btn.disabled = false;
    }
  });
  root.querySelector('[data-copy]')?.addEventListener('click', () => copyText(app, buildCurriculumPrompt(store.settings.student, promptEnv(), true)));
  paste?.addEventListener('input', () => {
    show(null);
    if (!paste.value.trim()) return say('');
    try {
      show(parseCurriculum(paste.value));
      say('');
    } catch (error) {
      say(error.message, true);
    }
  });
  // Bound after the input listener above, so a restored draft is parsed and its preview and Apply show.
  if (paste) draft = bindDraft(root, 'welcome:answer');
  apply.addEventListener('click', () => {
    const { added, updated } = applyCurriculum(store.subjects, curriculum, { id: () => uid('s') });
    finish(added, updated);
  });
  root.querySelector('[data-plain]').addEventListener('click', () => {
    const { added } = plainSubjects(store.subjects, store.settings.student.subjects, { id: () => uid('s') });
    finish(added);
  });
}

/**
 * Builds the Get started view.
 *
 * @param {object} app The app shell (go, toast).
 * @param {{ step?: string }} params Route params; `step` is the 0-based step to show.
 * @returns {object} The view: title, back, body, mount.
 */
export function welcomeView(app, params = {}) {
  const index = clampStep(params.step);
  const step = STEPS[index];
  const student = store.settings.student;
  const isBuild = index === BUILD_INDEX;
  const ready = aiReady(aiSettings());
  const blocked = isBuild ? validateStep('build', student) : '';

  const body = html`<div class="welcome">
    ${progressDots(index)}
    <h2 class="welcome-title">${step.title}</h2>
    <p class="muted welcome-hint">${step.hint}</p>
    <div class="welcome-step" data-step="${step.key}">
      ${isBuild ? (blocked ? html`<p class="setup-status is-bad" role="alert">${blocked} <a href="#/welcome?step=4">Go to subjects</a></p>` : buildFields(student, ready)) : stepFields(step.key, student)}
    </div>
    <p class="form-error" role="alert" hidden></p>
    <nav class="welcome-nav" aria-label="Steps">
      ${neighbourStep(index, -1) === null ? '' : html`<button class="btn btn-secondary btn-lg" type="button" data-back>${icon('chevronLeft')}Back</button>`}
      ${isBuild ? '' : html`<button class="btn btn-primary btn-lg welcome-next" type="button" data-next>Next${icon('chevronRight')}</button>`}
    </nav>
    <button class="btn btn-text btn-block" type="button" data-skip>Skip for now</button>
  </div>`;

  return {
    title: 'Get started',
    back: student.done ? 'account' : '',
    focus: true,
    body,
    /**
     * Wires the step: saving on every input, Back, Next and Skip, and the step's own controls.
     *
     * @param {HTMLElement} root The rendered view.
     * @returns {void}
     */
    mount(root) {
      const error = root.querySelector('.form-error');
      /** Opens the step with the given index. */
      const goTo = target => app.go(`welcome?step=${target}`);
      /** Saves the step, then moves on only when validation passes (always when `force` is set). */
      const leaveStep = (target, { force = false } = {}) => {
        const typed = saveStep(step.key, root);
        const message = force ? '' : validateStep(step.key, store.settings.student, typed);
        error.textContent = message;
        error.hidden = !message;
        if (!message) target === null ? app.go('home') : goTo(target);
      };
      if (step.key === 'subjects') mountSubjects(root);
      if (step.key === 'level') mountStages(root);
      if (isBuild && !blocked) mountBuild(app, root);
      // Typing saves at once, so closing the app mid-answer loses nothing.
      root.querySelector('.welcome-step').addEventListener('input', () => saveStep(step.key, root));
      root.querySelector('[data-step="language"] [name=uiLanguage]')?.addEventListener('change', () => {
        saveStep('language', root);
        // Every screen was drawn in the old language, so the page starts again in the new one.
        location.reload();
      });
      root.querySelector('[data-next]')?.addEventListener('click', () => leaveStep(neighbourStep(index, 1)));
      root.querySelector('[data-back]')?.addEventListener('click', () => leaveStep(neighbourStep(index, -1), { force: true }));
      root.querySelector('[data-skip]').addEventListener('click', () => leaveStep(null, { force: true }));
    },
  };
}
