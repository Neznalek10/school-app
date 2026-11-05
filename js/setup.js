/**
 * Subject setup: the AI interview prompt, the parser for its JSON proposal and the code that applies it.
 *
 * Responsibility: everything about "Set up this subject" that is not UI. `setupAssistant` is the preset
 * assistant shown on every subject, `setupPrompt` is its interview script, `parseSetup` turns the pasted
 * or chat answer into a clean SubjectSetup, `applySetup` writes it onto a subject and `setupSummary`
 * renders preview lines.
 *
 * Fits in: js/subjects.js puts `setupAssistant` into assistantsOf; js/views/setup.js and js/views/chat.js
 * call parseSetup, setupSummary and applySetup. Uses TEMPLATES and extractJson from js/study.js.
 *
 * Invariants: this file must not import js/store.js or js/subjects.js (that would create the cycle
 * store -> subjects -> setup -> store), so applySetup receives its id generator from the caller.
 * The prompt contains no personal names and no `{subject}` placeholder, because the chat replaces that
 * placeholder everywhere in an assistant prompt, which would damage the instructions about it.
 */
import { TEMPLATES, extractJson } from './study.js';
import { studentText, isCzechSchool } from './locale.js';

/** Id of the setup assistant; it is a preset, so it is never stored on the subject. */
export const SETUP_ID = 'setup';

/** Built-in tools a setup may switch on: key -> description shown to the AI (text before ":" is the short name). */
export const SETUP_TOOLS = { nazvoslovi: 'Názvosloví: chemistry naming and elements trainer' };

/** Built-in lessons a setup may add: key -> description shown to the AI (text before ":" is the short name). */
export const SETUP_LESSONS = { soustavy: 'Číselné soustavy: built-in number systems lesson with generated exercises' };

/** The most custom assistants one setup may create. */
export const MAX_SETUP_ASSISTANTS = 4;

/** Ids that custom assistants must never take: the setup assistant and the presets defined in js/subjects.js. */
const RESERVED_IDS = [SETUP_ID, 'tutor', 'quiz', 'sheet', 'research', 'check'];

/** How often applySetup asks the id generator for a fresh id before it gives up. */
const MAX_ID_ATTEMPTS = 20;

const PROFILE_MIN = 40;
const PROFILE_MAX = 2000;
const EXTRA_MAX = 1500;
const NAME_MAX = 40;
const BLURB_MAX = 120;
const PROMPT_MIN = 20;
const PROMPT_MAX = 3000;

/** Shown when the pasted text has no JSON object, which usually means the interview is still running. */
const NOT_FINAL_MESSAGE = 'Paste the JSON block from the AI\'s final answer, once the interview has finished.';

/** Template used when the AI names one that does not exist. */
const FALLBACK_TEMPLATE = 'general';

/** Icon used when the AI names one the app does not have. */
const FALLBACK_ICON = 'bulb';

/** The exact shape the interview must end with; shown to the AI inside the prompt. */
const SETUP_SHAPE = `{
  "profile": "40 to 2000 characters of plain facts about this subject in this class",
  "plan": { "template": "one template key from the list", "extra": "0 to 1500 characters of extra instructions for lesson prompts, or an empty string" },
  "assistants": [
    { "name": "short name", "blurb": "one line about what it does", "icon": "bulb", "prompt": "instructions for the assistant" }
  ],
  "tools": ["tool key"],
  "lessons": ["lesson key"]
}`;

/**
 * Lists the keys of an object as prompt lines: `- "key": description`.
 *
 * @param {Record<string, string>} descriptions Key -> description text.
 * @returns {string} One line per key, or "- none" when the object is empty.
 */
function describeKeys(descriptions) {
  const lines = Object.entries(descriptions).map(([key, text]) => `- "${key}": ${text}`);
  return lines.length ? lines.join('\n') : '- none';
}

/**
 * Builds the interview script for one subject.
 *
 * @param {{ name: string, profile?: string }} subject The subject being set up; its name and current profile are quoted.
 * @returns {string} The full assistant prompt in English (the chat appends the answer language and the notes).
 * @example
 * const prompt = setupPrompt({ name: 'Chemistry' });
 */
export function setupPrompt(subject) {
  const templates = describeKeys(Object.fromEntries(
    Object.entries(TEMPLATES).map(([key, template]) => [key, `${template.label}. ${template.hint}`]),
  ));
  // A profile from an earlier setup is shown so a second interview improves it instead of starting from zero.
  const current = subject.profile
    ? `\nThe student already did a setup. The current profile is: ${subject.profile}\nStart by checking what is still true and what changed, and keep what is still right.\n`
    : '';
  return `You set up the subject "${subject.name}" in a study app for ${studentText()}. You interview the student about this subject in their class, so the app's assistants and learning plans fit it. At the end you produce one JSON setup.
${current}
INTERVIEW RULES
- Ask exactly one question per message. Never put two questions in one message and never send a list of questions. Keep each message short, friendly and easy to read on a phone.
- Plan about 6 to 10 questions in total. Adapt: follow up on vague or surprising answers, and skip anything the student already told you.
- When it helps, add two or three example answers, but let the student answer in their own words.
- Cover these topics, in a natural order: what the course covers this year, the main sources (textbook, presentations, worksheets, Google Classroom), how tests look and how they are graded, what the teacher cares about most, what the student finds hard, the student's goals, and the language the student wants answers in.
- If the student writes "done" or "hotovo" at any time, stop asking and build the setup from what you know now. Say in one sentence which parts you had to guess.
- Never invent facts about the teacher, the school or the course. Leave out what you do not know.

ENDING
When you have enough, say in one short sentence that the setup is ready. Then output ONE \`\`\`json code block in exactly the shape below and write nothing after it.

${SETUP_SHAPE}

FIELD RULES
- profile: plain facts about this subject in this class: topics, sources, test format, teacher's priorities, what is hard, goals, preferred answer language. Write it in English and keep subject terms in the language the class uses. Every assistant reads it, so keep it accurate and compact.
- plan.template: the key of the template that fits how the student gets learning material. Allowed keys:
${templates}
- plan.extra: extra instructions added to every lesson prompt for this subject, for example the test style or what to stress. Use "" if there is nothing.
- assistants: 0 to ${MAX_SETUP_ASSISTANTS}, only helpers that clearly fit what the student told you (for example practice in the teacher's test format). Do not copy the general tutor or quiz assistants, the app already has them. name is at most ${NAME_MAX} characters, blurb at most ${BLURB_MAX}. icon is always "bulb". prompt is ${PROMPT_MIN} to ${PROMPT_MAX} characters of instructions to the assistant, written as "You are ..." and naming the subject "${subject.name}" in plain text.
- tools: keys from this list, only when they clearly help in this subject. Use [] otherwise.
${describeKeys(isCzechSchool() ? SETUP_TOOLS : {})}
- lessons: keys from this list, only when they clearly help in this subject. Use [] otherwise.
${describeKeys(isCzechSchool() ? SETUP_LESSONS : {})}
- The JSON must be valid: double quotes, no comments, no trailing commas, \\n for line breaks inside strings. Add no other fields.`;
}

/**
 * Builds the preset assistant that runs the setup interview.
 *
 * @param {{ name: string, profile?: string }} subject The subject being set up.
 * @returns {object} Assistant record with setup: true and preset: true; its prompt is built for this subject.
 * @example
 * const assistant = setupAssistant(subject);
 */
export function setupAssistant(subject) {
  return {
    id: SETUP_ID,
    name: 'Set up this subject',
    icon: 'sparkle',
    blurb: 'A short interview that tailors this subject to your class',
    useNotes: false,
    starter: 'Start the interview',
    kickoff: 'Greet me in one short sentence and ask your first question now.',
    prompt: setupPrompt(subject),
    setup: true,
    preset: true,
  };
}

/**
 * Trims a value to a string of at most `max` characters; non-strings become ''.
 *
 * @param {unknown} value Any JSON value.
 * @param {number} max Maximum length.
 * @returns {string} Trimmed text.
 */
function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Keeps the entries of `value` that are own keys of `allowed`, without duplicates.
 *
 * @param {unknown} value Expected to be an array of keys; anything else gives [].
 * @param {Record<string, string>} allowed Object whose own keys are the allowed values.
 * @returns {string[]} Allowed keys in the order given.
 */
function allowedKeys(value, allowed) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(key => typeof key === 'string' && Object.hasOwn(allowed, key)))];
}

/**
 * Cleans one proposed assistant.
 *
 * @param {unknown} raw One element of the AI's "assistants" array.
 * @param {string[]} icons Icon names the app has.
 * @returns {{ name: string, blurb: string, icon: string, prompt: string, useNotes: boolean } | null} The assistant, or null when it lacks a name or a usable prompt.
 */
function cleanAssistant(raw, icons) {
  const name = text(raw?.name, NAME_MAX);
  const prompt = text(raw?.prompt, PROMPT_MAX);
  if (!name || prompt.length < PROMPT_MIN) return null;
  const icon = icons.includes(raw.icon) ? raw.icon : FALLBACK_ICON;
  return { name, blurb: text(raw.blurb, BLURB_MAX), icon, prompt, useNotes: true };
}

/**
 * Parses and cleans the AI's final answer into a SubjectSetup.
 *
 * Tolerates prose around the code block, curly quotes and trailing commas (via extractJson). Unknown
 * templates become 'general', unknown tools and lessons are dropped, extra assistants beyond the limit and
 * assistants without a name or prompt are dropped, extra fields are ignored.
 *
 * @param {string} answer The whole reply of the AI.
 * @param {{ icons: string[] }} options `icons`: the icon names the app has.
 * @returns {{ profile: string, plan: { template: string, extra: string }, assistants: object[], tools: string[], lessons: string[] }} The setup.
 * @throws {Error} With a message for the student when there is no JSON, it is not an object or the profile is missing or too short.
 * @example
 * const setup = parseSetup(reply, { icons: SUBJECT_ICONS });
 */
export function parseSetup(answer, { icons }) {
  // Chat replies during the interview have no braces; say what to paste instead of a JSON error.
  if (!String(answer || '').includes('{')) throw new Error(NOT_FINAL_MESSAGE);
  const data = extractJson(answer);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(NOT_FINAL_MESSAGE);
  const profile = text(data.profile, PROFILE_MAX);
  if (profile.length < PROFILE_MIN) {
    throw new Error(`The setup has no subject profile (at least ${PROFILE_MIN} characters). Ask the AI to finish the interview and send the complete JSON.`);
  }
  const template = typeof data.plan?.template === 'string' && Object.hasOwn(TEMPLATES, data.plan.template) ? data.plan.template : FALLBACK_TEMPLATE;
  const assistants = (Array.isArray(data.assistants) ? data.assistants : [])
    .map(raw => cleanAssistant(raw, icons))
    .filter(Boolean)
    .slice(0, MAX_SETUP_ASSISTANTS);
  return {
    profile,
    plan: { template, extra: text(data.plan?.extra, EXTRA_MAX) },
    assistants,
    tools: allowedKeys(data.tools, SETUP_TOOLS),
    lessons: allowedKeys(data.lessons, SETUP_LESSONS),
  };
}

/**
 * Asks the generator for an id that is not reserved and not yet taken.
 *
 * @param {() => string} id Id generator supplied by the caller.
 * @param {Set<string>} taken Ids already in use; the new id is added to it.
 * @returns {string} A fresh id.
 * @throws {Error} When the generator keeps returning used ids.
 */
function freshId(id, taken) {
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const candidate = id();
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  throw new Error('Could not create a unique assistant id. Try applying the setup again.');
}

/**
 * Writes a setup onto a subject.
 *
 * Sets profile, plan and setupAt and adds tools (never removes any). A custom plan prompt from before is dropped, because the chosen
 * template replaces it. Earlier setup-made assistants (fromSetup: true) are replaced; assistants the student
 * made themselves are kept.
 *
 * @param {object} subject The subject; mutated.
 * @param {object} setup A SubjectSetup from parseSetup.
 * @param {{ now?: number, id: () => string }} options `now`: timestamp for setupAt; `id`: required generator of unique ids (callers pass `() => uid('c')`).
 * @returns {{ lessons: string[] }} Keys of the built-in lessons the caller should add.
 * @throws {TypeError} When `id` is not a function.
 * @throws {Error} When the id generator cannot produce unused ids.
 * @example
 * const { lessons } = applySetup(subject, setup, { id: () => uid('c') });
 */
export function applySetup(subject, setup, { now = Date.now(), id } = {}) {
  if (typeof id !== 'function') throw new TypeError('applySetup needs an id generator: pass { id: () => uid(\'c\') }.');
  subject.profile = setup.profile;
  subject.plan = { template: setup.plan.template, ...(setup.plan.extra && { extra: setup.plan.extra }) };
  // Tools are only added: an earlier or legacy tool must not disappear because this interview did not mention it.
  const tools = [...new Set([...(subject.tools || []), ...setup.tools])];
  if (tools.length) subject.tools = tools;
  // Keep the student's own assistants; only those made by an earlier setup are replaced.
  const kept = (subject.assistants || []).filter(assistant => !assistant.fromSetup);
  const taken = new Set([...RESERVED_IDS, ...kept.map(assistant => assistant.id)]);
  const created = setup.assistants.map(assistant => ({ ...assistant, id: freshId(id, taken), fromSetup: true }));
  subject.assistants = [...kept, ...created];
  subject.setupAt = now;
  return { lessons: [...setup.lessons] };
}

/**
 * Names the entries of a key -> description object as short labels (text before the first colon).
 *
 * @param {string[]} keys Keys to describe.
 * @param {Record<string, string>} descriptions Key -> description text.
 * @returns {string} Comma separated short names.
 */
function shortNames(keys, descriptions) {
  return keys.map(key => descriptions[key].split(':')[0]).join(', ');
}

/**
 * Builds the preview lines shown before a setup is applied.
 *
 * @param {object} setup A SubjectSetup from parseSetup.
 * @returns {string[]} One line per part that is present: the full profile, plan, full lesson instructions, each assistant as name and full prompt, tools, lessons.
 */
export function setupSummary(setup) {
  // Everything that gets stored and injected into prompts is shown in full, so nothing is applied unseen.
  const lines = [`Profile: ${setup.profile}`, `Learning plan: ${TEMPLATES[setup.plan.template].label}`];
  if (setup.plan.extra) lines.push(`Lesson instructions: ${setup.plan.extra}`);
  for (const assistant of setup.assistants) lines.push(`Assistant ${assistant.name}: ${assistant.prompt}`);
  if (setup.tools.length) lines.push(`Tools: ${shortNames(setup.tools, SETUP_TOOLS)}`);
  if (setup.lessons.length) lines.push(`Lessons: ${shortNames(setup.lessons, SETUP_LESSONS)}`);
  return lines;
}
