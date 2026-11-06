/**
 * Learning-plan templates, lesson prompts and lesson JSON parsing.
 *
 * Responsibility: the prompt templates (TEMPLATES), promptFor (template + subject profile + plan extras),
 * and parsing/repairing the AI's lesson JSON (extractJson finds the JSON object in a chat answer). Pure logic:
 * no storage or network. Used by lesson views, setup.js, curriculum.js, testcheck.js and ai.js (which
 * re-exports profileLine). Czech school conventions in the prompts live only in [CZ] lines
 * (see localizePrompt); every other line is written for any student, who is described by {student}.
 */
import { normalize, check } from './check.js';
import { shuffle } from './srs.js';
import { localizePrompt, fillStudent, audienceText } from './locale.js';
import { clip } from './text.js';

// A learning plan is the prompt a subject uses to turn a presentation into a lesson: notes, visuals, timeline, answers and flashcards.
// Every template asks for the same JSON shape, so one parser and one lesson page serve all subjects.
const SHAPE = `{
  "title": "short title of the presentation",
  "overview": "3 to 5 sentences: what the whole presentation is about and its main idea",
  "notes": "complete study notes in Markdown: a ## heading per topic, bullet points, **bold** key names, terms and dates. Cover every slide.",
  "visuals": [
    { "slide": 3, "kind": "photo", "title": "short name", "description": "1 to 2 sentences: what it shows and why it matters" }
  ],
  "timeline": [
    { "date": "1348", "year": 1348, "event": "what happened", "slide": 5 }
  ],
  "terms": [
    { "term": "key term", "definition": "one-sentence definition" }
  ],
  "answers": [
    { "question": "question or task exactly as in the presentation", "answer": "full answer", "slide": 7 }
  ],
  "cards": [
    { "type": "qa", "q": "question", "a": "short answer" },
    { "type": "cloze", "text": "Charles University was founded in {{1348}}." },
    { "type": "choice", "q": "question", "options": ["A", "B", "C", "D"], "a": "B" },
    { "type": "compare", "q": "Compare X and Y", "a": "model answer in 2 to 4 bullet points" }
  ]
}`;

// Maths and Physics lessons add exercises, each with a result the app can check and a solution opened on request.
const SHAPE_EXERCISES = SHAPE.replace(/\n}$/, `,
  "exercises": [
    {
      "task": "the complete assignment with every number needed",
      "topic": "the ## topic of the notes it practises",
      "level": 1,
      "answer": "the result as written in a school notebook, e.g. x = 7/2",
      "values": [3.5],
      "unit": "",
      "hint": "one sentence that points to the first step without giving the result",
      "solution": ["one step: what to do, why, and the full calculation", "the next step", "the result"]
    }
  ]
}`);

const PROBLEMS_START = `I am {student}, studying {subject}. Make me a lesson on the key topics I give you: notes I can learn from, with solved examples, and exercises I solve myself. Every exercise needs a detailed step-by-step solution that I only open when I need it.
If I attach a worksheet, textbook pages or a presentation, use it: its tasks become the first exercises, solved in detail, and then add more of the same kind. If the key topics are missing, take them from what I attached. If nothing is attached either, reply with one short sentence asking for the topics, and make the lesson once I send them.

The key topics are at the end of this message between <<< and >>>.

Reply with ONE JSON object inside a single \`\`\`json code block and nothing else, in exactly this shape:

${SHAPE_EXERCISES}

Rules:`;

const EXERCISE_FIELDS = `- For every exercise:
  - task: the complete assignment, as it would appear in a textbook.
  - topic: the ## heading of the notes it practises.
  - level: 1, 2 or 3 as described above.
  - answer: the final result written as in a school notebook.
  - values: the final result(s) as JSON numbers, so the app can check what I type, e.g. [-3, 2] or [12.5]. Use [] when the result is not a number or a list of numbers (an expression, an interval, a graph, an explanation); I then compare with answer myself.
  - unit: the unit of values, or "".
  - hint: one sentence that points to the first step without giving the result away.
  - solution: the detailed solution as a list of steps. One step = one action: what to do, why, and the full calculation. Never skip a step. The last step states the result exactly as in answer.
- Solve every exercise twice, in two different ways where you can, before writing it down. answer, values and the last step of solution must agree. Never include an exercise you have not solved completely.
- terms: the key terms and formulas: "term" is the name, "definition" the formula or definition with what each letter means.
- cards: 10 to 20 flashcards on definitions, formulas, units and rules (not whole exercises). Mix qa, cloze and choice. A cloze sentence marks the missing part with {{double braces}}. A choice card has 3 or 4 options and "a" is exactly one of them.
- timeline: []. answers: []. slide is always null.
- Write everything in the language I wrote the topics in.
- The JSON must be valid: double quotes, no comments, no trailing commas, \\n for line breaks inside strings.`;

const COMMON_RULES = `- answers: every question or task that appears in the presentation, answered fully. If the presentation itself does not answer it, use reliable general knowledge and add "(not in the presentation)". Use [] if there are no questions.
- cards: 25 to 40 flashcards covering the whole presentation. Mix qa, cloze, choice and compare. A cloze sentence marks the missing word, name or date with {{double braces}}. A choice card has 3 or 4 options and "a" is exactly one of them.
- slide is the slide number as shown in the presentation, first slide = 1. Use null if you are not sure.
- Only use facts you are sure of. Never invent dates, names or numbers.
- Write everything in the language of the presentation.
- The JSON must be valid: double quotes, no comments, no trailing commas, \\n for line breaks inside notes.`;

// What the lesson is made from, worded for the New lesson page and the copy-paste prompts.
const PRESENTATION = {
  noun: 'presentation',
  from: 'a presentation',
  attach: 'Attach the PowerPoint or PDF. For Google Slides use File › Download, or share the link with Gemini.',
  link: 'https://docs.google.com/presentation/d/…',
  linkHelp: 'With a Google Slides link, every slide number in the lesson opens that slide.',
  empty: 'Copy the prompt, give it to ChatGPT or Gemini with your presentation, and paste the answer back. You get notes, the pictures with their slides, a timeline, answers and flashcards.',
};

export const TEMPLATES = {
  history: {
    label: 'History',
    input: 'presentation',
    unit: 'slide',
    source: PRESENTATION,
    hint: 'Notes, every picture, statue and map with its slide, a timeline of dated events, answers and flashcards',
    prompt: `I am {student}, studying {subject}. I am giving you a presentation (PowerPoint, Google Slides or PDF). Read every slide, including the pictures, captions and speaker notes.

Reply with ONE JSON object inside a single \`\`\`json code block and nothing else, in exactly this shape:

${SHAPE}

Rules:
- overview and notes: describe the whole presentation, then write notes I can learn from without the slides.
- visuals: every photograph, painting, statue, building, map, diagram and chart, in slide order. kind is one of photo, painting, statue, building, map, diagram, chart, other.
- timeline: every event that has a date, oldest first. year is a number for sorting (negative for BC, the first year of a century or range). date is how the date is written ("1415", "6. 7. 1415", "9th century").
- terms: the important names and terms, if any; otherwise [].
${COMMON_RULES}`,
  },
  general: {
    label: 'General',
    input: 'presentation',
    unit: 'slide',
    source: PRESENTATION,
    hint: 'Notes, key terms, diagrams with their slide, answers and flashcards',
    prompt: `I am {student}, studying {subject}. I am giving you a presentation (PowerPoint, Google Slides or PDF). Read every slide, including the pictures, captions and speaker notes.

Reply with ONE JSON object inside a single \`\`\`json code block and nothing else, in exactly this shape:

${SHAPE}

Rules:
- overview and notes: describe the whole presentation, then write notes I can learn from without the slides. Keep formulas, rules and worked examples.
- visuals: every diagram, chart, photo or illustration that matters for learning, in slide order. kind is one of photo, painting, statue, building, map, diagram, chart, other.
- terms: every key term, law, formula or rule with a one-sentence definition.
- timeline: dated events if the topic has any (for example discoveries); otherwise [].
${COMMON_RULES}`,
  },
  highlights: {
    label: 'Highlighted document',
    short: 'Highlights',
    input: 'document',
    unit: 'page',
    source: {
      noun: 'document',
      from: 'a highlighted document',
      attach: 'Attach the document.',
      blurb: 'Attach the document. For the app to read the yellow parts itself, use Lessons › New lesson instead.',
      link: 'https://docs.google.com/document/d/…',
      linkHelp: 'Shown on the lesson so you can open the document. A link to a PDF also makes page numbers clickable.',
      empty: 'Upload a Word document with yellow highlights, copy the prompt into ChatGPT or Gemini, and paste the answer back. You get notes, terms and flashcards from the yellow parts only.',
    },
    hint: 'A long document where only the yellow parts must be learned: notes, terms, answers and flashcards from those parts only',
    prompt: `I am {student}, studying {subject}. I am giving you a long study document (Word, Google Docs or PDF). Some parts are highlighted in yellow. Only the yellow parts are required, so build everything ONLY from them.

How to find the yellow parts:
- If the highlighted parts are pasted at the end of this message between <<< and >>>, use them and ignore any attachment. There, text between == and == is highlighted. The rest of each line is surrounding context that helps you understand it, but it must not become notes or flashcards on its own. Lines starting with ## are the document's headings.
- Otherwise read the attached file's formatting. In a .docx a highlighted run has a yellow highlight (python-docx: run.font.highlight_color == WD_COLOR_INDEX.YELLOW) or yellow shading (fill FFFF00). In a PDF look for yellow highlight marks. Do not guess from the plain text.
- If you cannot see any yellow highlighting, reply with exactly NO_HIGHLIGHTS and nothing else.

Reply with ONE JSON object inside a single \`\`\`json code block and nothing else, in exactly this shape:

${SHAPE}

Rules:
- overview: 3 to 5 sentences on what the highlighted parts cover.
- notes: notes of every highlighted passage, in document order, under the document's headings (a ## heading for each). Make them easy to learn: short bullet points, **bold** key terms, and keep definitions word for word. Do not add topics that are not highlighted.
- terms: every highlighted term, concept or name, with a one-sentence definition from the document.
- timeline: dated events from the highlighted parts, if any; otherwise [].
- visuals: [] unless a highlighted part refers to a picture, chart or table.
- answers: every question or task inside the highlighted parts, answered; otherwise [].
- cards: one to three flashcards for every highlighted passage, 25 to 60 in total. Mix qa, cloze, choice and compare. A cloze sentence marks the missing word, name or date with {{double braces}}. A choice card has 3 or 4 options and "a" is exactly one of them.
- slide is the page number if you know it, otherwise null.
- Only use facts from the document. Never invent dates, names or numbers.
- Write everything in the language of the document.
- The JSON must be valid: double quotes, no comments, no trailing commas, \\n for line breaks inside notes.`,
  },
  literature: {
    label: 'Literature',
    input: 'pages',
    unit: 'page',
    source: {
      noun: 'book pages',
      from: 'book pages',
      attach: 'Attach the photos of the book pages, in page order. Turn on web search if the AI has it, so it can check authors, dates and plots.',
      link: 'https://drive.google.com/…',
      linkHelp: 'Shown on the lesson so you can open the photos. A link to a PDF also makes page numbers clickable.',
      empty: 'Photograph the textbook pages, give them to ChatGPT or Gemini with the prompt, and paste the answer back. You get the literary movement, then its poets, philosophers, prose writers and dramatists with their lives, works, plots and how to tell the works apart, plus flashcards.',
    },
    hint: 'Photos of book pages: the literary movement, then poets, philosophers, prose writers and dramatists, each with life, works, plot and how to recognise them, plus flashcards',
    prompt: `I am {student}, studying {subject} literature. I am giving you photos of pages from my textbook about a literary movement or period, for example Romanticism. Read every page, including captions, boxes, excerpts and pictures. The pages decide which movement, authors and works the lesson covers. Then research every author and work from reliable knowledge so the notes are complete enough for a test or exam at my level.

Reply with ONE JSON object inside a single \`\`\`json code block and nothing else, in exactly this shape:

${SHAPE}

Rules:
- overview: 3 to 5 sentences on the movement: when and where, what it reacted against, and its main ideals.
- notes: Markdown in exactly this structure, repeated for each movement on the pages:
  # name of the movement
  [CZ]## Charakteristika směru
  [INTL]## Characteristics of the movement
  Bullet points: time and countries, historical and philosophical background, ideals, main features, genres and their hierarchy, rules of form and style, and how it differs from the movement before it and after it.
  [CZ]## Básníci
  [INTL]## Poets
  [CZ]## Filozofové
  [INTL]## Philosophers
  [CZ]## Prozaici
  [INTL]## Prose writers
  [CZ]## Dramatici
  [INTL]## Dramatists
  Under each group, one heading per author: ### Name (birth–death), country. Then:
  [CZ]- **Život:** 3 to 6 bullet points: origin, education, career, key events, and how the life shows in the work.
  [INTL]- **Life:** 3 to 6 bullet points: origin, education, career, key events, and how the life shows in the work.
  [CZ]- **Díla:** every work the pages mention, plus the author's most important works if they are missing.
  [INTL]- **Works:** every work the pages mention, plus the author's most important works if they are missing.
  Then one heading per main work: #### Title (year), genre. Under it:
  [CZ]- **O čem je:** theme and main idea. If the pages tell the story or the work is one of the author's main works, give the plot in 4 to 8 sentences with the main characters by name.
  [INTL]- **What it is about:** theme and main idea. If the pages tell the story or the work is one of the author's main works, give the plot in 4 to 8 sentences with the main characters by name.
  [CZ]- **Jak ho poznat:** 2 to 4 features that tell this work apart from the other works of the same movement: form (verse or prose, number of acts, metre), setting, characters, theme, tone, a famous line or the opening.
  [INTL]- **How to recognise it:** 2 to 4 features that tell this work apart from the other works of the same movement: form (verse or prose, number of acts, metre), setting, characters, theme, tone, a famous line or the opening.
  Put each author in one group only, the group of their main work, and mention their other kinds of writing there. Leave out a group with no authors. Order authors as the pages do, otherwise by year of birth.
- You may add a few important representatives the pages leave out. Mark every author and work that is not on the pages with "(not in the book)", written in the language of the book.
- visuals: portraits, illustrations, title pages and other pictures on the pages, in page order. kind is painting for portraits and illustrations, photo for photographs, building, or other.
- timeline: the start and end of the movement, the historical events the pages connect to it, and the first publication or premiere of every work in the notes, oldest first. Write events as "Author: Title". year is a number for sorting (the first year of a range). date is how the date is written. Births and deaths stay in the notes.
- terms: every literary term and genre (for example ode, fable, tragedy, the three unities), with a one-sentence definition.
- answers: every question or task on the pages, for example under an excerpt, answered fully. If the pages do not answer it, use reliable knowledge and add "(not in the book)". Use [] if there are none.
- cards: 30 to 60 flashcards covering every author and main work. Include:
  - qa: who wrote each main work, and its genre.
  - choice: "Which work is this?" with a plot detail, a character or a famous line as the question, and only works from the same movement as options, so I learn to tell them apart. Also "Which author is this?" from a life detail.
  - cloze: years, names, titles and characters, marked with {{double braces}}.
  - compare: authors or works that are easy to confuse.
  A choice card has 3 or 4 options and "a" is exactly one of them.
- slide is the page number printed in the book if you can read it, otherwise null.
- Only use facts you are sure of. Never invent dates, names, titles, characters or plots. If you are unsure of a detail, leave it out.
- Write everything in the language of the book.
- The JSON must be valid: double quotes, no comments, no trailing commas, \\n for line breaks inside notes.`,
  },
  research: {
    label: 'Research',
    input: 'topics',
    unit: 'page',
    source: {
      noun: 'key topics',
      from: 'key topics',
      attach: 'Turn on web search if the AI has it, so it researches your topics. You can also attach your own materials.',
      blurb: 'The AI first asks for your key topics. To put them into the prompt yourself, use Lessons › New lesson. Paste the answer there to get notes and flashcards.',
      empty: 'Write the key topics, copy the prompt into ChatGPT or Gemini, and paste the answer back. The AI researches the topics and you get notes, key terms, typical test questions and flashcards.',
      topicsExample: 'The cell: structure and types\nPhotosynthesis\nCellular respiration',
    },
    hint: 'You write the key topics, the AI researches them: notes at your school level, key terms, typical test questions and flashcards',
    prompt: `I am {student}, studying {subject}. Research the key topics I give you and write study notes I can learn from for tests. Search the web and use reliable sources: encyclopedias, textbooks, and university, museum or government sites. If you cannot search, use reliable knowledge and say so in the overview. If I attach my own materials, use them too.

The key topics are at the end of this message between <<< and >>>. If they are missing, reply with one short sentence asking for them, and make the lesson once I send them.

Reply with ONE JSON object inside a single \`\`\`json code block and nothing else, in exactly this shape:

${SHAPE}

Rules:
- Pitch everything at the level of {student}: what a test there expects, not university level.
- overview: 3 to 5 sentences on what the topics cover and how they fit together.
- notes: one ## heading per key topic, in my order, with ### subheadings where useful. Explain each topic clearly and correctly: the key facts, numbers and examples (examples from my country where they fit), processes step by step, and the differences between things that are easy to confuse. Use short bullet points and **bold** key terms. End with a ## section listing the sources you used, with their title and web address.
- visuals: diagrams, maps or pictures that are essential for these topics (for example the structure of a cell or a climate map), so I can look them up and recognise them. description says what it shows and what to notice. kind is one of photo, painting, statue, building, map, diagram, chart, other. Use [] if none are essential.
- timeline: dated events if the topics have any (for example discoveries); otherwise [].
- terms: every key term with a one-sentence definition.
- answers: 5 to 10 typical test questions on these topics, with full model answers.
- cards: 25 to 40 flashcards covering every topic. Mix qa, cloze, choice and compare. A cloze sentence marks the missing word, name or number with {{double braces}}. A choice card has 3 or 4 options and "a" is exactly one of them.
- slide is always null.
- Only use facts you are sure of and that your sources confirm. Never invent numbers, names or dates. Where sources disagree, use the value school textbooks in my country teach.
- Write everything in the language I wrote the topics in.
- The JSON must be valid: double quotes, no comments, no trailing commas, \\n for line breaks inside notes.`,
  },
  math: {
    label: 'Maths',
    input: 'topics',
    unit: 'page',
    source: {
      noun: 'key topics',
      from: 'key topics',
      attach: 'You can also attach a worksheet, textbook pages or a presentation: the AI solves its tasks first.',
      blurb: 'The AI first asks for your key topics or a worksheet. To put the topics into the prompt yourself, use Lessons › New lesson. Paste the answer there to get notes, exercises and flashcards.',
      empty: 'Write the topics (or attach a worksheet), copy the prompt into ChatGPT or Gemini, and paste the answer back. You get notes with solved examples and 12 to 18 exercises from easy to hard, each with a hint and a step-by-step solution.',
      topicsExample: 'Linear equations\nEquations with fractions\nWord problems about shared work',
    },
    hint: 'Notes with solved examples, then exercises from easy to hard: you type the result, the hint and the step-by-step solution open when you ask',
    prompt: `${PROBLEMS_START}
- [CZ]Pitch everything at the level of {student} and use Czech school conventions: decimal comma, K = {…} for solution sets, intervals like (2; 5⟩, and the check of an equation (zkouška).
- [INTL]Pitch everything at the level of {student} and use the maths conventions taught there: the usual decimal separator, notation for solution sets and intervals, and a check of every equation's solution.
- Write maths in plain text with Unicode, never LaTeX: x², x³, √(x + 1), (a + b)/(2c), ·, :, ≤, ≥, ≠, ±, ∞, π, ∈, ∉, ∪, ∩, ∅, ℝ, ℕ. Never use $ signs or backslashes.
- overview: 3 to 5 sentences on what the topics are and how they connect.
- notes: one ## heading per topic, in my order. For each: definitions and rules in short bullets, every formula on its own line with what each letter means, the typical mistakes to avoid, and one or two fully solved examples under a ### Solved example heading, written step by step like the solutions.
- visuals: graphs or diagrams that are essential (for example the graph of a function), described so I can sketch them; otherwise [].
- exercises: 12 to 18 exercises that cover every topic, ordered from easy to hard:
  - level 1 (about a third): one rule or formula, nice numbers, a few lines of work.
  - level 2 (about a third): two or three steps, or combining two rules.
  - level 3 (the rest): word problems, tasks that combine topics, or explain-why tasks.
  Vary the kind of task: computing, simplifying, solving equations, word problems, and a few where I find the mistake in a given solution or decide whether a statement is true and why.
- In the solutions of equations, end with the check. In word problems start with what is given and what we look for, and finish with an answer sentence.
${EXERCISE_FIELDS}`,
  },
  physics: {
    label: 'Physics',
    input: 'topics',
    unit: 'page',
    source: {
      noun: 'key topics',
      from: 'key topics',
      attach: 'You can also attach a worksheet, textbook pages or a presentation: the AI solves its tasks first.',
      blurb: 'The AI first asks for your key topics or a worksheet. To put the topics into the prompt yourself, use Lessons › New lesson. Paste the answer there to get notes, exercises and flashcards.',
      empty: 'Write the topics (or attach a worksheet), copy the prompt into ChatGPT or Gemini, and paste the answer back. You get notes with laws, units and solved examples, and 12 to 18 exercises from easy to hard, each with a hint and a step-by-step solution.',
      topicsExample: 'Uniform motion\nUniformly accelerated motion\nFree fall',
    },
    hint: 'Notes with laws, units and solved examples, then exercises from easy to hard with the given values, units and a step-by-step solution that opens when you ask',
    prompt: `${PROBLEMS_START}
- [CZ]Pitch everything at the level of {student} and use Czech school conventions: decimal comma, quantities with their symbols and SI units, and g = 10 m/s² unless the task says to use 9,81 m/s² (always say in the task which value to use).
- [INTL]Pitch everything at the level of {student}, with the usual decimal separator, quantities with their symbols and SI units, and say in each task which value of g to use.
- Write formulas in plain text with Unicode, never LaTeX: v = s/t, s = ½ · a · t², m/s², kg·m/s, Δt, ·, ≈. Never use $ signs or backslashes.
- overview: 3 to 5 sentences on what the topics are and how they connect.
- notes: one ## heading per topic, in my order. For each: the physical quantities (name, symbol, unit), the laws and formulas each on its own line with what every letter means and its unit, how to read the related graphs, the typical mistakes (especially units), and one or two fully solved examples under a ### Solved example heading, written step by step like the solutions.
- visuals: graphs or diagrams that are essential (for example a v–t graph or a force diagram), described so I can sketch them; otherwise [].
- exercises: 12 to 18 exercises that cover every topic, ordered from easy to hard:
  - level 1 (about a third): one formula, values already in SI units.
  - level 2 (about a third): unit conversion, rearranging the formula, or two steps.
  - level 3 (the rest): word problems from everyday life (sport, transport, music, home), tasks that combine topics, a graph described in words, or explain-why questions.
- [CZ]Every solution follows the Czech school pattern, one step each: "Zápis:" the given quantities with symbols and units and the unknown with "= ?"; "Převod jednotek:" to SI if needed; the formula and why it applies; rearranging for the unknown (letters first, numbers last); substituting with units; the result with its unit, rounded sensibly (2 to 3 significant figures); "Odpověď:" a sentence. Add a quick check of units or a rough estimate where it helps.
- [INTL]Every solution follows the usual school pattern, one step each: the given quantities with symbols and units and the unknown; unit conversion to SI if needed; the formula and why it applies; rearranging for the unknown (letters first, numbers last); substituting with units; the result with its unit, rounded sensibly (2 to 3 significant figures); a one-sentence answer. Add a quick check of units or a rough estimate where it helps.
- values are in the unit given in unit, which is the unit the task asks for.
${EXERCISE_FIELDS}`,
  },
};

// Legacy map for subjects created before starter kits; subjects made from a kit store plan.template instead.
const DEFAULT_TEMPLATES = { history: 'history', zsv: 'highlights', czech: 'literature', biology: 'research', geography: 'research', chemistry: 'research', math: 'math', physics: 'physics' };
export const defaultTemplate = subject => DEFAULT_TEMPLATES[subject.id] || 'general';

/**
 * A built-in template's prompt for this account's country (see localizePrompt), with {subject} and {student} unfilled.
 *
 * @param {string} key A key of TEMPLATES.
 * @returns {string} The prompt text.
 */
export const templatePrompt = key => localizePrompt(TEMPLATES[key].prompt);

export function planOf(subject) {
  const template = TEMPLATES[subject.plan?.template] ? subject.plan.template : defaultTemplate(subject);
  return { template, custom: !!subject.plan?.prompt, prompt: subject.plan?.prompt || templatePrompt(template) };
}

/**
 * The subject profile as one prompt line (set by the setup interview).
 * Lives here so study.js needs nothing from ai.js; ai.js re-exports it.
 *
 * @param {{ name: string, profile?: string }} subject The subject.
 * @returns {string} "About <name> in my class: <profile>", or '' when there is no profile.
 */
export function profileLine(subject) {
  const profile = typeof subject.profile === 'string' ? subject.profile.trim() : '';
  return profile ? `About ${subject.name} in my class: ${profile}` : '';
}

/**
 * The lesson prompt of a subject: its plan template, the subject profile, the style line for young students
 * and the plan's extra instructions, then highlights read from a .docx or the student's key topics, so the AI works from exactly that text.
 *
 * @param {object} subject The subject.
 * @param {{ highlights?: string, topics?: string }} [input] Text to build the lesson from.
 * @returns {string} The prompt to paste into an AI.
 */
export function promptFor(subject, { highlights = '', topics = '' } = {}) {
  // A function replacer keeps `$&` and similar in a subject name literal.
  const base = fillStudent(planOf(subject).prompt.replaceAll('{subject}', () => subject.name));
  // The style line for young students sits after the profile so the extra instructions of the plan still come last.
  const prompt = [base, profileLine(subject), audienceText(), subject.plan?.extra].filter(Boolean).join('\n\n');
  if (highlights) return `${prompt}\n\nTHE HIGHLIGHTED PARTS:\n<<<\n${highlights}\n>>>`;
  return topics.trim() ? `${prompt}\n\nMY KEY TOPICS:\n<<<\n${topics.trim()}\n>>>` : prompt;
}

export const templateOf = lesson => TEMPLATES[lesson?.template] || TEMPLATES.history;
export const unitLabel = (lesson, n) => `${templateOf(lesson).unit === 'page' ? 'Page' : 'Slide'} ${n}`;

// Chat apps wrap the answer in fences and models break JSON in the same few ways: raw line breaks inside strings, trailing commas, curly quotes as delimiters.
export function repairJson(text) {
  let out = '';
  let inString = false;
  let curly = false;
  let escaped = false;
  // Czech text uses „ and “ inside strings, so a curly quote only closes a string when JSON punctuation follows it.
  const closes = i => /^\s*[,:}\]]/.test(text.slice(i + 1, i + 20));
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (curly && (c === '”' || c === '“') && closes(i)) { out += '"'; inString = false; continue; }
      else if (c === '"' && curly) { out += '\\"'; continue; }
      else if (c === '"') inString = false;
      else if (c === '\n') { out += '\\n'; continue; }
      else if (c === '\r') continue;
      else if (c === '\t') { out += '\\t'; continue; }
      out += c;
      continue;
    }
    if (c === '"') {
      inString = true;
      curly = false;
    }
    if (c === '“' || c === '”') {
      out += '"';
      inString = true;
      curly = true;
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/** A fenced code block in a chat answer: the capture is the text between the fences, with or without a `json` tag. */
const CODE_FENCE = /```(?:json)?\s*([\s\S]*?)```/gi;

/**
 * Parses text as JSON without throwing.
 *
 * @param {string} text Candidate JSON.
 * @returns {{ data: unknown } | { error: Error }} The parsed value, or the parse error.
 */
function attemptParse(text) {
  try {
    return { data: JSON.parse(text) };
  } catch (error) {
    return { error };
  }
}

/**
 * Parses the outermost {...} span of a text, repairing the usual chat-app damage when plain parsing fails.
 *
 * @param {string} body Text that may hold one JSON object (a code block's content, or a whole answer).
 * @returns {{ data: unknown } | { error: Error } | null} The result, or null when the text has no {...} span.
 */
function parseOuterObject(body) {
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const span = body.slice(start, end + 1);
  const plain = attemptParse(span);
  return plain.error ? attemptParse(repairJson(span)) : plain;
}

/**
 * Finds the JSON object in an AI answer. Every fenced code block is tried in order, then the outermost
 * {...} span of the whole text, and the first one that parses and satisfies `want` is returned. So an
 * example block, or a block that is not valid JSON, before the real answer does not hide it.
 *
 * @param {string} text The AI's whole answer (prose, code fences and all).
 * @param {(data: object) => boolean} [want] Accepts or rejects a parsed object (for example "has a profile");
 *   by default every parsed object is accepted.
 * @returns {object} The parsed object.
 * @throws {Error} With a message for the student: no JSON found (or none that `want` accepts), or the first
 *   candidate's parse error when none could be parsed.
 * @example
 * extractJson('Here:\n```json\n{"profile": "..."}\n```', data => 'profile' in data);
 */
export function extractJson(text, want = () => true) {
  const raw = String(text || '');
  const blocks = [...raw.matchAll(CODE_FENCE)].map(match => match[1]).filter(block => block.includes('{'));
  let failure = null;
  for (const body of [...blocks, raw]) {
    const parsed = parseOuterObject(body);
    if (!parsed) continue;
    if (parsed.error) failure ??= parsed.error;
    else if (want(parsed.data)) return parsed.data;
  }
  if (failure) throw new Error(`The answer is not valid JSON (${failure.message}). Ask the AI to "send the same JSON again, valid".`);
  throw new Error('No JSON found. Copy the whole answer, including the part in the code block.');
}

// Text from the AI, cut by code point so no emoji is split (a lone surrogate would make every later data-file save fail).
const str = (v, max = 20000) => (typeof v === 'string' ? clip(v, max) : typeof v === 'number' ? String(v) : '');
const slideNo = v => (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 1000 ? Number(v) : null);
const list = v => (Array.isArray(v) ? v : []);
export const VISUAL_KINDS = ['photo', 'painting', 'statue', 'building', 'map', 'diagram', 'chart', 'other'];
const CLOZE = /\{\{([^{}]+)\}\}/;

function cleanCard(c) {
  const type = str(c?.type).toLowerCase();
  if (type === 'cloze') {
    const text = str(c.text || c.q, 600);
    return CLOZE.test(text) ? { type, text } : null;
  }
  if (type === 'choice') {
    const options = [...new Set(list(c.options).map(o => str(o, 200)).filter(Boolean))].slice(0, 6);
    const a = str(c.a ?? c.answer, 200);
    return str(c.q, 400) && options.length >= 2 && options.includes(a) ? { type, q: str(c.q, 400), options, a } : null;
  }
  const q = str(c?.q ?? c?.question ?? c?.front, 600);
  const a = str(c?.a ?? c?.answer ?? c?.back, 2000);
  return q && a ? { type: type === 'compare' ? 'compare' : 'qa', q, a } : null;
}

// "12,5" from a chat app is still a number.
const numberOf = v => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim().replace(/\s+/g, '').replace(/−/g, '-').replace(',', '.')) : NaN);

function cleanExercise(x) {
  const task = str(x?.task ?? x?.question, 4000);
  const raw = Array.isArray(x?.values) ? x.values : x?.value !== undefined && x?.value !== null ? [x.value] : [];
  const values = raw.map(numberOf).filter(Number.isFinite).slice(0, 10);
  const solution = (Array.isArray(x?.solution) ? x.solution : str(x?.solution, 20000).split(/\n+/)).map(step => str(step, 3000)).filter(Boolean).slice(0, 40);
  const answer = str(x?.answer, 600);
  if (!task || (!answer && !solution.length)) return null;
  const accept = list(x?.accept).map(a => str(a, 100)).filter(Boolean).slice(0, 10);
  const level = Number(x?.level);
  const tolerance = Number(x?.tolerance);
  return {
    task,
    topic: str(x?.topic, 160),
    level: [1, 2, 3].includes(level) ? level : 2,
    answer: answer || solution.at(-1),
    values: values.length === raw.length ? values : [],
    unit: str(x?.unit, 40),
    hint: str(x?.hint, 800),
    solution,
    ...(tolerance > 0 && tolerance < 0.5 ? { tolerance } : {}),
    ...(accept.length ? { accept } : {}),
  };
}

export const exerciseKey = x => `x:${normalize(x.task)}`.slice(0, 300);
export const exercisesOf = lesson => (lesson.data.exercises || []).map((x, i) => ({ ...x, i, key: exerciseKey(x), lessonId: lesson.id }));

// Whatever the AI sent, the lesson only keeps what is well formed, so a sloppy answer can't break the page.
export function parseLesson(text) {
  if (/^\s*NO_HIGHLIGHTS\b/.test(text) || (/NO_HIGHLIGHTS/.test(text) && !text.includes('{'))) {
    throw new Error('The AI could not see the yellow highlighting. Upload the .docx in step 1: the app reads the highlights itself and puts them into the prompt.');
  }
  const data = extractJson(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The answer is not a JSON object.');
  const lesson = {
    title: str(data.title, 120),
    overview: str(data.overview, 4000),
    notes: str(data.notes, 60000),
    visuals: list(data.visuals).map(v => ({
      slide: slideNo(v?.slide),
      kind: VISUAL_KINDS.includes(str(v?.kind).toLowerCase()) ? str(v.kind).toLowerCase() : 'other',
      title: str(v?.title, 160),
      description: str(v?.description, 1000),
    })).filter(v => v.title || v.description).slice(0, 200),
    timeline: list(data.timeline).map((t, i) => ({
      date: str(t?.date, 60) || (Number.isFinite(Number(t?.year)) ? String(t.year) : ''),
      year: Number.isFinite(Number(t?.year)) && t?.year !== null && t?.year !== '' ? Number(t.year) : null,
      event: str(t?.event, 600),
      slide: slideNo(t?.slide),
      i,
    })).filter(t => t.date && t.event)
      .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || a.i - b.i)
      .map(({ i, ...t }) => t).slice(0, 300),
    terms: list(data.terms).map(t => ({ term: str(t?.term, 160), definition: str(t?.definition, 1000) })).filter(t => t.term && t.definition).slice(0, 300),
    answers: list(data.answers).map(a => ({ question: str(a?.question, 1000), answer: str(a?.answer, 6000), slide: slideNo(a?.slide) })).filter(a => a.question && a.answer).slice(0, 200),
    exercises: list(data.exercises).map(cleanExercise).filter(Boolean).slice(0, 80),
    cards: list(data.cards).map(cleanCard).filter(Boolean).slice(0, 200),
  };
  if (!lesson.notes && !lesson.overview && !lesson.cards.length && !lesson.timeline.length && !lesson.exercises.length) throw new Error('The JSON has none of the expected parts (notes, exercises, cards…). Check that you copied the right answer.');
  return lesson;
}

export function lessonCounts(d) {
  return [
    d.visuals.length && `${d.visuals.length} visuals`,
    d.timeline.length && `${d.timeline.length} dates`,
    d.terms.length && `${d.terms.length} terms`,
    d.answers.length && `${d.answers.length} answers`,
    d.exercises?.length && `${d.exercises.length} exercises`,
    d.cards.length && `${d.cards.length} flashcards`,
  ].filter(Boolean);
}

export const clozeAnswer = text => text.match(CLOZE)?.[1].trim() || '';
export const clozeParts = text => {
  const m = text.match(CLOZE);
  return m ? [text.slice(0, m.index), text.slice(m.index + m[0].length).replace(/\{\{([^{}]+)\}\}/g, '$1')] : [text, ''];
};

export const cardKey = card => `${card.type}:${normalize(card.q || card.text || card.event || card.description || '')}`.slice(0, 300);

// The AI's cards plus cards the app makes itself from the terms, the timeline and the visuals, all tracked by the same levels.
export function cardsOf(lesson) {
  const d = lesson.data;
  const cards = [
    ...d.cards,
    ...d.terms.map(t => ({ type: 'term', q: t.term, a: t.definition })),
    ...d.timeline.map(t => ({ type: 'when', event: t.event, date: t.date, year: t.year, slide: t.slide })),
    ...d.visuals.filter(v => v.title && v.description).map(v => ({ type: 'visual', description: v.description, a: v.title, kind: v.kind, slide: v.slide })),
  ];
  return cards.map(c => ({ ...c, id: cardKey(c), lessonId: lesson.id }));
}

// "1348", "roku 1348" and "v roce 1348" all count when the year is 1348; otherwise the written date is compared leniently.
export function checkWhen(input, card) {
  const given = normalize(input);
  if (!given) return { ok: false, kind: 'wrong' };
  if (card.year !== null && card.year !== undefined) {
    const nums = given.match(/-?\d+/g) || [];
    const bc = /(př|bc|b\.c)/.test(given);
    if (nums.some(n => Number(n) === card.year || (bc && -Number(n) === card.year))) return { ok: true, kind: 'exact' };
  }
  return check(input, [card.date]);
}

export function checkCloze(input, text) {
  const answer = clozeAnswer(text);
  const result = check(input, [answer]);
  // Years and numbers must match exactly; a typo there is a different date.
  if (/\d/.test(answer) && result.kind === 'typo') return { ...result, kind: 'wrong' };
  return result;
}

export function orderQuiz(timeline, rand = Math.random) {
  const dated = timeline.filter(t => t.year !== null);
  const years = new Set();
  const pool = shuffle(dated, rand).filter(t => !years.has(t.year) && years.add(t.year)).slice(0, 4);
  if (pool.length < 3) return null;
  return { type: 'order', items: pool, correct: [...pool].sort((a, b) => a.year - b.year) };
}

const GOOGLE_SLIDES = /^https:\/\/docs\.google\.com\/presentation\/d\/([\w-]+)/;

// Google Slides opens on a slide with /preview?slide=N; a PDF opens on a page with #page=N.
export function slideHref(link, n) {
  if (!link || !n) return null;
  const g = String(link).match(GOOGLE_SLIDES);
  if (g) return `https://docs.google.com/presentation/d/${g[1]}/preview?rm=minimal&slide=${n}`;
  if (/^https?:\/\/[^#]+\.pdf(\?[^#]*)?$/i.test(link)) return `${link}#page=${n}`;
  return null;
}
