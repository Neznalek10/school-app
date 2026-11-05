/**
 * Applies a parsed subject setup to the account and saves it.
 *
 * Responsibility: the one place that turns a SubjectSetup into stored data (subject fields, custom
 * assistants, built-in lessons). Used by the chat apply card (views/chat.js) and the setup page
 * (views/setup.js). It uses setup.js for the pure logic, soustavy.js for the lessons and store.js for saving.
 * It also renders the setup summary lines both views show (summaryItem).
 * Invariant: lessons are added at most once per subject (addBuiltInLesson refuses duplicates).
 */
import { store, uid } from '../store.js';
import { applySetup } from '../setup.js';
import { addBuiltInLesson } from '../soustavy.js';
import { html, plural } from '../ui.js';

/**
 * Applies a setup to a subject, adds its built-in lessons, saves subjects and lessons and refreshes the side menu.
 *
 * @param {{ refreshSide: () => void }} app The app shell (refreshes the navigation after the change).
 * @param {object} subject The subject; mutated.
 * @param {object} setup A SubjectSetup from parseSetup.
 * @returns {{ lessons: number }} How many built-in lessons were newly added.
 * @throws {Error} When applySetup cannot create unique assistant ids.
 * @example
 * const { lessons } = applySetupAndSave(app, subject, parseSetup(reply, { icons: SUBJECT_ICONS }));
 */
export function applySetupAndSave(app, subject, setup) {
  const { lessons } = applySetup(subject, setup, { id: () => uid('c') });
  // addBuiltInLesson returns false for a lesson the subject already has, so only new ones are counted.
  const added = lessons.filter(lessonId => addBuiltInLesson(store.lessons, subject.id, lessonId)).length;
  store.save('subjects');
  store.save('lessons');
  app.refreshSide();
  return { lessons: added };
}

/**
 * The message shown after a setup was applied.
 *
 * @param {{ name: string }} subject The subject that was set up.
 * @param {{ lessons: number }} result The result of applySetupAndSave.
 * @returns {string} For example "Chemistry is set up and 1 lesson added."
 */
export function setupAppliedText(subject, result) {
  return `${subject.name} is set up${result.lessons ? ` and ${plural(result.lessons, 'lesson')} added` : ''}.`;
}

/**
 * Renders one summary line with the label before the first ": " in bold.
 *
 * @param {string} line A summary line from setupSummary.
 * @returns {object} html`` fragment (the text is escaped).
 */
export function summaryItem(line) {
  const at = line.indexOf(': ');
  if (at < 1) return html`<li>${line}</li>`;
  return html`<li><strong>${line.slice(0, at)}</strong>${line.slice(at)}</li>`;
}
