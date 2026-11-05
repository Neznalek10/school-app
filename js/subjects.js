/**
 * Subjects: the default subject, starter kits, tool gating and the assistants of a subject.
 *
 * Responsibility: what a new account starts with (Languages only), the optional starter kits offered by the
 * New subject sheet, `hasTool` (replaces the old subject-id special cases) and `assistantsOf`.
 *
 * Fits in: js/store.js uses defaultSubjects and addLaterDefaults; js/views/subject.js, chat.js and prompts.js
 * use KITS, subjectFromKit, hasTool and assistantsOf. Uses setupAssistant from js/setup.js.
 *
 * Invariants: this file must not import js/store.js (store.js imports this file), so callers pass the id
 * generator. Every kit plan is a key of TEMPLATES in js/study.js, every kit icon is in SUBJECT_ICONS and
 * every kit colour is in COLORS (tests/js/subjects.test.mjs checks this).
 */
import { setupAssistant } from './setup.js';

// Every new account starts with this; it can be renamed, recoloured or deleted.
const DEFAULTS = [
  { id: 'languages', name: 'Languages', icon: 'globe', color: 'blue', apps: ['french', 'english'] },
];

/**
 * Builds the subjects a new account starts with.
 *
 * @returns {object[]} Fresh subject objects (safe to mutate).
 */
export const defaultSubjects = () => DEFAULTS.map(s => ({ ...s, apps: s.apps ? [...s.apps] : [], assistants: [], created: 0 }));

export const COLORS = ['blue', 'violet', 'red', 'orange', 'teal', 'green', 'brown', 'indigo', 'cyan', 'pink'];
export const SUBJECT_ICONS = ['book', 'math', 'atom', 'flask', 'leaf', 'scroll', 'scale', 'map', 'code', 'globe', 'music', 'palette', 'ball', 'notes'];

/**
 * Optional starter kits for the New subject sheet. `plan` is a learning-plan template key, `tools` are
 * built-in tools (see hasTool) and `lessons` are built-in lesson ids the caller adds with addBuiltInLesson.
 * `czech` kits are offered only to Czech accounts and `intl` kits only to all others (see kitsFor).
 */
export const KITS = [
  { id: 'math', name: 'Mathematics', icon: 'math', color: 'violet', plan: 'math' },
  { id: 'physics', name: 'Physics', icon: 'atom', color: 'orange', plan: 'physics' },
  { id: 'chemistry', name: 'Chemistry', icon: 'flask', color: 'teal', plan: 'research', tools: ['nazvoslovi'] },
  { id: 'czech', name: 'Czech', icon: 'book', color: 'red', plan: 'literature', czech: true },
  { id: 'language', name: 'Language and literature', icon: 'book', color: 'red', plan: 'research', intl: true },
  { id: 'history', name: 'History', icon: 'scroll', color: 'brown', plan: 'history' },
  { id: 'zsv', name: 'ZSV', icon: 'scale', color: 'indigo', plan: 'highlights', czech: true },
  { id: 'social', name: 'Social studies', icon: 'scale', color: 'indigo', plan: 'highlights', intl: true },
  { id: 'biology', name: 'Biology', icon: 'leaf', color: 'green', plan: 'research' },
  { id: 'geography', name: 'Geography', icon: 'map', color: 'cyan', plan: 'research' },
  { id: 'informatics', name: 'Computer science', icon: 'code', color: 'pink', plan: 'general', lessons: ['soustavy'] },
];

/** Tools and built-in lessons written in Czech or for Czech school rules: Názvosloví and Číselné soustavy. */
const CZECH_ONLY = new Set(['nazvoslovi', 'soustavy']);

/**
 * The starter kits for an account: all Czech ones for a Czech school, otherwise the neutral set without
 * the Czech-only tools and lessons.
 *
 * @param {boolean} czech True for an account whose country is the Czech Republic.
 * @returns {object[]} Entries of KITS, copied when a tool or lesson was taken out.
 */
export function kitsFor(czech) {
  if (czech) return KITS.filter(k => !k.intl);
  const keep = list => list?.filter(x => !CZECH_ONLY.has(x));
  return KITS.filter(k => !k.czech).map(k => (k.tools || k.lessons ? { ...k, tools: keep(k.tools), lessons: keep(k.lessons) } : k));
}

/**
 * Creates a subject, optionally from a starter kit.
 *
 * @param {object|null} kit An entry of KITS, or null for a plain subject.
 * @param {{ name: string, icon: string, color: string, id: string, now?: number }} fields The values chosen in the sheet; `id` is required (callers pass `uid('s')`).
 * @returns {object} The new subject; with a kit it also has `kit`, `plan: {template}` and, when the kit has tools, `tools`.
 * @throws {TypeError} When `id` is missing.
 * @example
 * const subject = subjectFromKit(KITS[0], { name: 'Maths', icon: 'math', color: 'violet', id: uid('s') });
 */
export function subjectFromKit(kit, { name, icon, color, id, now = Date.now() } = {}) {
  if (typeof id !== 'string' || !id) throw new TypeError('subjectFromKit needs an id: pass { id: uid(\'s\') }.');
  const subject = { id, name, icon, color, apps: [], assistants: [], created: now };
  if (!kit) return subject;
  subject.kit = kit.id;
  subject.plan = { template: kit.plan };
  if (kit.tools?.length) subject.tools = [...kit.tools];
  return subject;
}

/** Subjects created before tools existed: the default subject id -> the tools it always had. */
export const LEGACY_TOOLS = { chemistry: ['nazvoslovi'] };

/**
 * Tells whether a subject has a built-in tool.
 *
 * @param {object} subject The subject.
 * @param {string} tool Tool key, for example 'nazvoslovi'.
 * @returns {boolean} True when `subject.tools` lists it or LEGACY_TOOLS gives it to the subject's id.
 */
export function hasTool(subject, tool) {
  // Legacy subjects keep their tools whatever a later setup adds, so both sources count.
  const own = Array.isArray(subject.tools) ? subject.tools : [];
  return own.includes(tool) || (LEGACY_TOOLS[subject.id] || []).includes(tool);
}

// Subjects added to the defaults after accounts already existed; each is added to an account once and never again, so deleting it sticks.
export const LATER_DEFAULTS = [];

/**
 * Adds default subjects that were introduced after an account was created.
 *
 * @param {object[]} subjects The account's subjects; mutated.
 * @param {string[]} [added] Ids already handled for this account.
 * @returns {{ added: string[], changed: boolean }} The updated handled ids and whether anything must be saved.
 */
export function addLaterDefaults(subjects, added = []) {
  const done = [...added];
  let changed = false;
  for (const id of LATER_DEFAULTS) {
    if (done.includes(id)) continue;
    done.push(id);
    if (subjects.some(s => s.id === id)) continue;
    const subject = defaultSubjects().find(s => s.id === id);
    // An id that is not in DEFAULTS is recorded as handled but never inserted (no undefined in the list).
    if (!subject) continue;
    const before = DEFAULTS.findIndex(s => s.id === id) - 1;
    const at = subjects.findIndex(s => s.id === DEFAULTS[before]?.id);
    subjects.splice(at < 0 ? subjects.length : at + 1, 0, subject);
    changed = true;
  }
  return { added: done, changed: changed || done.length !== added.length };
}

// {subject} is filled in with the subject's name. The notes and the answer language are added by the chat.
export const PRESETS = [
  {
    id: 'tutor',
    name: 'Tutor',
    icon: 'learn',
    blurb: 'Explains any topic step by step and checks you understood',
    useNotes: true,
    starter: 'Explain the main idea of my latest notes.',
    kickoff: 'Reply with one short sentence saying you are ready, then wait for my question.',
    prompt: 'You are a patient tutor for {subject}. The student is {student}. Explain step by step with simple examples. Keep answers short enough to read on a phone. End with one short question that checks understanding. If the student\'s notes are given, stay consistent with them and point out anything in them that looks wrong.',
  },
  {
    id: 'quiz',
    name: 'Quiz me',
    icon: 'target',
    blurb: 'Asks one question at a time and grades your answers',
    useNotes: true,
    starter: 'Start the quiz.',
    kickoff: 'Start now: ask me the first question.',
    prompt: 'You quiz the student on {subject}. Ask exactly one question at a time, then wait. When the student answers, say whether it is right, explain briefly, and ask the next question. Mix easy and harder questions. When the student\'s notes are given, take the questions from them.',
  },
  {
    id: 'sheet',
    name: 'Study sheet',
    icon: 'notes',
    blurb: 'Turns your notes into a compact sheet to revise from',
    useNotes: true,
    starter: 'Make a study sheet from my notes.',
    kickoff: 'Make the study sheet now.',
    needsNotes: true,
    prompt: 'You turn the student\'s notes on {subject} into a compact study sheet in Markdown: key terms with one-line definitions, the main ideas as bullet points, formulas, dates or rules where relevant, and five self-test questions at the end. Use only what the notes support and mark anything you add as "Extra".',
  },
  {
    id: 'research',
    name: 'Research',
    icon: 'search',
    blurb: 'Gathers more information on a topic you give it',
    useNotes: false,
    starter: '',
    kickoff: 'Ask me in one short sentence which topic I want to research.',
    prompt: 'You help the student gather more information about a topic in {subject}: key facts, background, how it connects to other topics, common misconceptions, and what to look up to go deeper. Say clearly when you are unsure. Never invent sources, quotes, numbers or dates.',
  },
  {
    id: 'check',
    name: 'Check my work',
    icon: 'check',
    blurb: 'Finds mistakes in an answer or solution you paste',
    useNotes: false,
    starter: '',
    kickoff: 'Ask me in one short sentence to paste my work.',
    prompt: 'The student pastes an answer, solution or text for {subject}. Check it carefully. List each mistake with the corrected version and a one-line reason, then give a short overall verdict. If the student asks only for a hint, give a hint, not the full solution.',
  },
];

/**
 * Lists the assistants of a subject: its setup assistant, the presets, then the student's own.
 *
 * @param {object} subject The subject.
 * @returns {object[]} Assistants in display order.
 */
export function assistantsOf(subject) {
  const custom = (subject.assistants || []).map(a => ({ icon: 'bulb', blurb: 'Your own assistant', starter: '', ...a }));
  return [setupAssistant(subject), ...PRESETS.map(p => ({ ...p, preset: true })), ...custom];
}
