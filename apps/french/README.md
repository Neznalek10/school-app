# Vocab

A vocabulary trainer that runs as an installable web app (PWA). You edit it on the PC, push to GitHub, and the phone picks up the new version the next time you open it.

- Any number of languages and decks (verbs, adjectives, topics...) without collisions
- Words move through levels by how many times in a row you got them right: New, Learning (0-2), Familiar (3-4), Mastered (5)
- Smart sessions (due words first, then new ones), mistake review, accent-lenient checking, stats
- Grammar: a French grammar reference in English, A1 to basic B1 (115 articles in 11 chapters), with sentence diagrams, typical mistakes and a practice button on every rule
- Tenses: conjugation practice for every verb in all 18 French tenses, by tense, verb category or single verbs, with full reference tables (inside Grammar)
- Learn: a French course taught like at school. Each unit has lessons (explanation, then active practice) and a test you pass at 70%. A Topics view lets you practice any grammar or vocabulary topic on its own
- Add single words or verbs on any device, with unit and difficulty level, and see the exact format for the repository
- Profiles: pick who's learning when the app opens, each with separate progress (names only, no passwords)
- Works offline after the first visit

## Files

| File | What it is |
|---|---|
| `index.html` | The app shell |
| `version.js` | The version number shown in the app. Bump it on every push |
| `words.json` | List of languages and deck files |
| `words/<lang>/<deck>.json` | One file per deck |
| `conjugations/fr.json` | Generated conjugation tables for every verb in the verb decks |
| `tools/conjugate.py` | Regenerates the conjugation tables |
| `courses/<lang>/course.json` | The course: unit order, titles, topics |
| `courses/<lang>/NN-name.json`, `a2-name.json` | One file per course part: lessons and test |
| `courses/<lang>/grammar.json` | The grammar reference: chapter order |
| `courses/<lang>/grammar/NN-name.json` | One file per grammar chapter: articles and their checks |
| `courses/<lang>/writing.json` | The writing topics for the Write tab |
| `courses/<lang>/speaking.json` | The speaking scenarios for the Speak tab |
| `courses/<lang>/drills.json` + `drills/*.json` | The sentence drills: pronouns, negation, questions |
| `courses/<lang>/translate.json` | The Czech sentences to translate into French |
| `prompts/*.md` | The instructions the AI gets: `check-write` (essay check), `make-topic` (topic generator), `free-chat` (free writing chat), `check-answer` ("Ask AI" on Learn exercises) |
| `tools/check_course.py` | Checks the course, grammar and writing files, optionally proofreads them |
| `docs/learn-plan.md`, `docs/grammar-plan.md` | The plans for Learn and Grammar |
| `manifest.json` | Install info for Android (name, icons, `start_url: ./`, `scope: ./`) |
| `sw.js` | Service worker: offline support, always fetches the newest files first |
| `css/`, `js/`, `icons/` | Styles, code, app icons |

All paths are relative (`./`), so the app works inside a GitHub Pages subfolder like `username.github.io/language-app/`.

## 1. Create the GitHub account and repository

1. Sign up at [github.com](https://github.com/signup).
2. You don't need to create the repository by hand. VS Code does it for you in the next step.

## 2. Link this folder to GitHub (once)

**VS Code (easiest):**

1. Open this folder in VS Code (`File > Open Folder`).
2. Click the **Source Control** icon in the left bar, then **Publish to GitHub**.
3. Sign in to GitHub when asked, choose **Publish to GitHub public repository**, and keep the name `language-app`.

VS Code creates the repository, makes the first commit and pushes it.

**Or with git in the terminal:**

```bash
cd ~/Projects/language-app
git init -b main
git add .
git commit -m "First version"
# create an empty public repo named language-app on github.com first, then:
git remote add origin https://github.com/<username>/language-app.git
git push -u origin main
```

## 3. Turn on GitHub Pages (once)

1. On github.com, open the repository, then **Settings > Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
3. Wait about a minute and refresh. The address appears at the top of the page:
   `https://<username>.github.io/language-app/`

## 4. Install on your Android phone (once)

1. Open the address in **Chrome** on the phone.
2. Tap the **⋮** menu, then **Install app** (on some Chrome versions it's **Add to home screen**, then **Install**).
3. The app now opens full screen from its icon, like a normal app.

## 5. Everyday routine

1. Change something on the PC (code, or words in `words/`).
2. Bump the number in `version.js`, for example `1.0.0` to `1.0.1`.
3. Commit and push. In VS Code: type a message in Source Control, **Commit**, then **Sync Changes**. Or `git add . && git commit -m "New words" && git push`.
4. Open the app on the phone and check the version number at the bottom of the Home screen (also in Settings).

**How long it takes:** GitHub rebuilds the site in about 30 to 90 seconds after a push. You can watch it under the repository's **Actions** tab. GitHub's servers can keep serving an old copy for up to 10 minutes, so normally the change shows up within 1 to 2 minutes, at worst about 10.

**If the phone still shows the old version:**

1. Wait a couple of minutes, then close the app fully (swipe it away from recent apps) and open it again.
2. In the app, go to **Settings > Check for updates**.
3. Still old? Check that the Actions tab shows a green check for your latest push.
4. Last resort: Chrome > Settings > Site settings > All sites > `github.io` > **Clear & reset**. This also deletes the learning progress saved on the phone.

## Adding words

Add a deck file, for example `words/fr/food-2.json`:

```json
{
  "lang": "fr",
  "from": "cs",
  "type": "verbs",
  "title": "Unit 4 verbs",
  "unit": null,
  "level": null,
  "words": [
    {"q": "jíst", "a": "manger"},
    {"q": "pes", "a": ["chien", "le chien"], "unit": "4", "level": "A1"}
  ]
}
```

Then add its path to the `decks` list in `words.json`.

- `lang` is the language you're learning, `from` the language you translate from (both two-letter codes: `fr`, `de`, `es`, `cs`...).
- `type` groups decks in the app: `verbs`, `adjectives`, `nouns`, `phrases`, `topics` or `other`.
- `a` can be one answer or a list of correct answers.
- `unit` puts a word in one of your lesson units (`"4"`, or a name like `"Leçon 4"`). `null` means not in a unit. Set it on the deck to cover every word, or on a single word to override the deck.
- `level` is the difficulty: `A1`, `A2`, `B1`, `B2`, `C1`, `C2` or `null`.
- `why` (optional) is your own explanation, shown first whenever you get that word wrong, e.g. `"why": "False friend: not 'chance'"`.
- For a new language, create a new folder such as `words/de/` and optionally add it to `languages` in `words.json` with a name and flag.

**Why decks never collide:** each word's progress is stored under its deck file path plus its prompt (`fr/verbs#myslet`). The same word in two languages or two decks is tracked separately. Editing answers is safe, but renaming a deck file or changing a prompt starts that word's progress from zero.

**Importing in the app:** Decks > Import accepts pasted text (`pes; chien | le chien`, one per line), CSV, JSON decks, and the old v1 `dictionaries/*.json` files. Imported decks live only on that device. To get one on every device, open the deck, tap **Download JSON**, put the file in `words/` and add it to `words.json`.

## Explanations for mistakes

Every wrong answer comes with a **Why** box built from what you typed: missing or wrong accents, the letter that's off, a word you mixed it up with ("chat" means kočka), a missing or wrong German article, a missing reflexive pronoun, and short facts about the word. In Tenses it also spots the wrong person, the wrong tense, avoir instead of être and missing agreement, and repeats how the tense is formed. A word's own `why` text is shown first.

## Learn

The **Learn** tab has two views.

- **Path** shows 9 units in order. A1 is units 1 to 5, A2 is units 6 to 8, and *Mon avenir* is unit 9 on its own. Most units have two or three parts, for example unit 2 is 2.1 *Ma famille*, 2.2 *Portrait* and 2.3 *Mes loisirs*. Each part has its own lessons and test. A2 is 6.1 *La mode*, 6.2 *Le week-end dernier*, 7.1 *En vacances*, 7.2 *La santé*, 8.1 *Écrans et médias*, 8.2 *Les fêtes* and 9 *Mon avenir*, covering the passé composé with avoir and être, object pronouns, the imparfait and the futur simple.
- **Strict order.** A lesson opens when you have finished practicing the previous one. A part's test opens when all its lessons are practiced, and passing it (70%) opens the next part. Locked lessons can't be opened, not even by a link.
- **A1 final test** sits at the end of the A1 units and can be taken at any time. Passing it (70%) skips A1: every A1 lesson and test opens and A2 starts. A failed attempt changes nothing.
- Units without lessons still show their words, so you can always practice their vocabulary.
- **Topics** lists every grammar, communication and vocabulary topic the lessons teach. Tick any topics you have reached and practice just those, mixed. A topic opens with the first lesson that teaches it.

A lesson is **Learn** (cards with the explanation in Czech, tables, examples, "Pozor" tips and a quick try-it question), then **Practice**. Practice starts with the lesson's words, then active exercises:

| Type | What you do |
|---|---|
| `word` | Czech word → French |
| `cloze` | Fill the gap in a French sentence |
| `form` | Conjugate (uses the Tenses tables) |
| `order` | Build the sentence from word tiles |
| `build` | Write the French sentence for a Czech one |
| `transform` | Rewrite a sentence (formal, plural, pronoun...) |

Wrong answers come back once at the end. **I was right** accepts your answer for that question on this device from then on. The **unit test** takes 20 questions from a separate pool that practice never shows, plus some of the unit's words, and gives no feedback until the end. The results show every mistake with its explanation and a score per lesson, and let you retake the test or redo the unit.

### Words and units

Every French word has a `unit` (set on the deck, or on a single word to override it). The unit's words are its vocabulary, shown on its page and used in its test. A lesson lists the words it introduces as `"deck#prompt"`, for example `"greetings#dobrý den"`.

### Course files

`words.json` points to the course: `"courses": {"fr": "courses/fr/course.json"}`. `course.json` lists the topics, the units in order and the level tests. A unit either has `"parts"` (each with its own `id` like `"2.1"` and `"file"`) or is one part itself with a `"file"`. A part's `tenses` add a tenses drill to its page.

```json
"levels": {"A1": {"title": "A1 final test", "file": "a1-test.json"}},
"units": [
  {"id": 2, "title": "Ma famille et mes loisirs", "level": "A1", "parts": [
    {"id": "2.1", "title": "Ma famille", "file": "02-1-famille.json"},
    {"id": "2.2", "title": "Portrait", "file": "02-2-portrait.json"},
    {"id": "2.3", "title": "Mes loisirs", "tenses": ["present"], "file": "03-loisirs.json"}
  ]},
  {"id": 9, "title": "Mon avenir", "level": "A2", "tenses": ["futur-simple"], "file": "a2-avenir.json"}
]
```

A word's `unit` is the part it belongs to (`"2.1"`, `"9"`).

```json
{
  "id": "fr-01-3",
  "title": "Je suis...",
  "topics": ["pronouns", "etre"],
  "words": ["greetings#Čech, Češka", "basics#ano"],
  "learn": [
    {"title": "Sloveso être", "blocks": [
      {"type": "text", "cs": "*Être* je nepravidelné, takže se ho nauč nazpaměť."},
      {"type": "table", "verb": "être", "tense": "present"},
      {"type": "examples", "items": [{"fr": "Je suis tchèque.", "cs": "Jsem Čech."}]},
      {"type": "tip", "cs": "Národnost se píše malým písmenem."},
      {"type": "check", "item": {"type": "cloze", "fr": "Tu ___ tchèque ?", "a": ["es"]}}
    ]}
  ],
  "practice": [
    {"id": "fr-01-3-01", "type": "cloze", "fr": "Je ___ User.", "a": ["suis"], "hint": "être"},
    {"id": "fr-01-3-08", "type": "build", "cs": "Jsi Francouz?", "a": ["{Tu es français|Es-tu français} ?"]}
  ]
}
```

- In text, `*word*` marks French and `**word**` is bold.
- `{a|b}` in an answer accepts both versions; `{|très }bien` makes a part optional. Capitals, commas and end punctuation are ignored when checking.
- Every exercise has a fixed `id`. Fixing a typo keeps its progress; changing the `id` resets it.
- Conjugation tables in lessons and `form` exercises come from `conjugations/fr.json`, never typed by hand.
- The test is `"test": {"pass": 0.7, "count": 20, "words": 6, "pool": [...]}`, and each pool item names its `"lesson"`. In a level test (`a1-test.json`) each item names its part instead (`"lesson": "2.1"`), so the results show a score per unit.
- Progress is saved per lesson and test `id`. Version 1.8 renumbered the units, and version 1.15 packed them into 9 (old 3 is now 2.3, old 8 is now 5.2, old 15 is now 9). Saved test results, words you added and imported decks move to the new numbers automatically the first time a profile signs in. Lesson ids never change, so the file names and ids of the A1 parts still use the old numbers (`03-loisirs.json`, `fr-3-1`).

Check the files after every change. `--proofread` also sends every French sentence to [LanguageTool](https://languagetool.org) and prints its remarks. It catches grammar and spelling, not a wrong translation, so read the Czech side yourself:

```bash
python3 tools/check_course.py
python3 tools/check_course.py --proofread
```

## Grammar

The **Grammar** tab is a reference, not a course: everything is open, nothing is locked and nothing is tracked. It has 16 chapters (sentence structure, pronouns, object pronouns step by step, verbs, tenses, nouns and articles, adjectives and adverbs, negation, questions, prepositions, numbers and time, spelling, useful structures) with 219 articles from A1 to B1, built from the DELF A1 to B1 grammar lists and the Lawless French A1 to B1 lesson lists. Besides the rules there are guides for the things that trip people up: *How to make a negative sentence*, *How to ask a question*, *Lui, y or en?*, *Which pronoun? Verbs with and without à*, the verb families (-re, -tir, ouvrir, venir, connaître, voir...), the subjunctive and when to use it, every connector (cause, purpose, contrast, time) and a chapter of expressions and look-alike verbs (avoir, faire, aller, partir/quitter, mettre/porter, passer...). The explanations are in English, the examples in French (the Learn lessons are still explained in Czech).

- **Search** at the top finds articles by title, French name or keyword, accents optional (*lui*, *passe compose*, *negation*). One- and two-letter words like *y* or *en* only match whole words.
- **Level filter** (All, A1, A2, B1) hides articles above the chosen level and is remembered per profile. It never hides the steps of *Object pronouns step by step* (chapters with `"path": true` in `grammar.json`), because a path is read in order.
- **Verb tables & drill** at the top opens the old Tenses page (all tables and the conjugation drill).
- Every article starts with **In short** (the rule in brief), then sections such as forms, when to use it, where it goes in the sentence, examples and **Watch out** (typical mistakes). Chips at the top jump to a section.
- **Practice this rule** runs the article's 3 to 6 checks with the normal exercise screen. **More from your Learn lessons** mixes in exercises from lessons you've reached that teach the same topic, and tense articles have **Drill the ...** for the conjugation drill.
- **Object pronouns step by step** (chapter 3) is the one chapter meant to be read in order. Its 16 steps take one pronoun at a time and practise it in each situation: simple tense, infinitive, negative and question, passé composé. They go in this order: find the function, *le / la / les*, *lui / leur*, *le* or *lui*, *me / te / nous / vous*, *y*, *en*, *de lui / à lui*. Step 13 mixes single pronouns, then come two pronouns, commands and a final mix with the quick reference table. Each step has a *Try it* check under every rule, its own practice in the order it teaches, and a drill button. *Practice this chapter* gives 20 mixed questions from all steps. The source is `13-pronoun-path.json`, and the Pronouns articles link to step 1.
- Three more paths come right after *Tenses and moods*, built the same way. **The imperative step by step** has 6 steps: regular forms, irregular forms (*sois, aie, va*), negatives, reflexives, pronouns, polite requests. **Conditional and si step by step** has 6: conditional forms, polite requests and advice, *si* + imparfait, the conditionnel passé, *si* + plus-que-parfait, then all three *si* sentences mixed. **The subjunctive step by step** has 6: regular forms, irregular forms, *il faut que*, wishes and feelings, conjunctions, subjunctive or indicative. Conjugation exercises come from the verb tables, and the validator checks every verb in a cloze against them. The sources are `14-` to `16-*-path.json`.
- **Related** links related articles, verb tables and the Learn lessons that teach the rule. Learn links back: a lesson shows its articles under the cards, a topic page links them, and a failed test lists the rules behind your mistakes.

Articles reuse the Learn card types (`text`, `table`, `examples`, `tip`, `check`) plus four of their own. Explanation text is written in `en` (Learn uses `cs`; every block accepts either), and in tables `textCols` lists the columns that are explanation text rather than French:

| Block | What it shows |
|---|---|
| `pattern` | Sentences split into coloured slots with a label under each word (subject, negation, pronoun, verb...). `formula` adds the skeleton on top; `"neg?"` marks an optional slot |
| `compare` | English sentence, optional wrong French version, right French version with the difference in `[[...]]`, optional note |
| `tree` | A nested classification; nodes with `see` link to an article |
| `see` | Links to articles (`rules`) and verb tables (`verbs`) |

```json
{
  "id": "direct-object",
  "title": "Object pronouns: le, la, les",
  "fr": "les pronoms COD",
  "level": "A2",
  "keywords": ["le", "la", "les", "COD", "him", "her", "it"],
  "topics": [],
  "see": ["indirect-object"],
  "sections": [
    {"title": "In short", "blocks": [
      {"type": "compare", "items": [{"en": "I see him.", "fr": "Je [[le]] vois."}]},
      {"type": "pattern", "formula": ["S", "neg?", "pron", "V", "neg?"], "rows": [
        {"parts": [["S", "Je"], ["neg", "ne"], ["pron", "le"], ["V", "vois"], ["neg", "pas."]], "en": "I don't see him."}
      ]}
    ]}
  ],
  "checks": [
    {"id": "g-direct-object-01", "type": "transform", "task_en": "Replace \"le film\" with a pronoun", "fr": "Je regarde le film.", "a": ["Je le regarde."]}
  ]
}
```

- `level` is where the article starts; `levelTo` marks a range (`"A1"` to `"B1"`). A section can carry its own `level`.
- `topics` are Learn topic ids; they create the links in both directions. `verbs` lists verb tables for **Related**, `tense` adds the drill button.
- Check ids start with `g-<article id>-` and never change. The validator wants **In short** first, at least 4 examples and 3 checks, and every link, topic, verb and tense must exist. `python3 tools/check_course.py --proofread --grammar` proofreads only the grammar.
- A language without `grammar.json` (German for now) has no Grammar tab.

## Sentence drills

**Learn, Drills** (also on Home and on the Grammar page) holds four sets of short sentence exercises, separate from the units. Pick a set, choose a level ("up to"), a unit or a type, how many sentences and which ones (a smart mix, only your mistakes, or random), and start. "Don't know" shows the answer and brings the sentence back once; **I was right** and **Ask AI** work as in Learn. Every sentence remembers how it went, so the smart mix gives you new sentences first, with your recent mistakes mixed in, and the set cards show how much you have practiced.

| Set | What you do | Size |
|---|---|---|
| **Translate into French** | A Czech sentence in, the French sentence out. Filter by unit (1 to 15), level or the grammar rule it practices. It combines the translating exercises already in the unit lessons with a bank of its own. | 680+ |
| **Replace with pronouns** | The underlined words become a pronoun: *J'allais [à Paris].* gives *J'y allais.* 16 types: le, la, les; the passé composé with agreement; lui, leur; me, te, nous, vous; y; en; stressed pronouns; two pronouns together; commands; mixed; le mien...; celui...; and the relative pronouns qui, que, où, dont. After a mistake it shows the rule for that type. | 370+ |
| **Make it negative** | How to form negative sentences: ne... pas, pas de, jamais, plus, rien, personne, aucun, que, ni... ni..., pas encore, nulle part, two negatives, every tense, commands, reflexive verbs, infinitives, pronouns, going back to positive, and spoken French without ne. | 260 |
| **Make it a question** | How to ask questions: est-ce que, intonation, inversion (with -t-, with nouns, in the passé composé), every question word, quel, qui, que, quoi, preposition + question word, negative questions, n'est-ce pas, indirect questions. Ask about the underlined words. | 160+ |

Hints switch on the type or key word for each sentence. A **grammar article** that has a matching drill shows a button for it ("Drill y", "Drill inversion"...), and every rule that has tagged Czech sentences shows "Translate sentences with this rule".

**Add sentences.** Drill sets are `courses/<lang>/drills/<set>.json` (a `tags` list, a `why` text per tag and `items` with `tag`, `level`, `task_en`, `fr` with `[marked words]` and `a` for the answers); `{a|b}` marks alternatives as everywhere. Translation sentences are `{"id", "level", "unit", "cs", "a", "tags"}` in `translate.json`. Ids never change once used. `python3 tools/check_course.py` validates all of it (and `--proofread --drills` proofreads it).

## Write

The Write tab is essay practice with AI checking. Pick a topic (87 built in: A1 48, A2 29, B1 10), choose the expected level, length (30 to 60, 60 to 110 or 110 to 180 words), how strict the check is and the feedback language (English, Czech or French), then write in French. The AI checks the text against the task requirements, grammar, vocabulary and how natural it sounds. You get a score out of 100, the mistakes marked in your text with the rule behind each, better phrasings, and a corrected version. Every score is saved per topic, and an unfinished text is kept as a draft on this device.

Topics are linked both ways: a unit page lists its writing tasks, a grammar article lists the tasks that use its rule, and the "Read up" links in a result point to the grammar articles behind your mistakes.

**Pronouns to practise.** The setup sheet lets you choose pronouns you want to use in the text. Some join two sentences into one (qui, que, où, dont, ce qui / ce que, lequel / auquel) and some replace a repeated word (le / la / les, lui / leur, y, en). Each pronoun you pick becomes one more requirement. The AI only counts it as met when you use it correctly. A missed one links to its grammar article. Your choice is remembered for the next topic. The list lives in `PRONOUNS` in `js/learn/writing.js`.

**Set up AI checking** in Settings: address, key and model. The default is OpenRouter with the model `openrouter/free`, which picks a free model for you, so quality varies; a fixed model gives steadier feedback. Free keys come from openrouter.ai and have a daily limit. "Ollama on this PC" fills in a local server (it only works when you practice on that PC). The key is stored on this device only, never in the repo. Without a key you can still write and keep drafts.

**How the score works.** The AI gives 0 to 10 for task, grammar, vocabulary and natural French. The app turns that into a percentage (task 30%, grammar 30%, vocabulary 20%, natural French 20%). The app, not the AI, checks the shape of the answer: quotes that are not in your text are dropped and unknown rule ids are ignored. To change how the AI grades, edit `prompts/check-write.md`.

**Generate new topic.** Both Write and Speak have this button. Describe what you want to write or talk about (or leave it empty for a surprise), pick a level, and the AI makes a topic in the same format as the built-in ones. It is saved under "My topics" on this device and can be deleted. It needs the AI key.

**Free writing.** The button next to it opens free writing, with no task. "Just correct me" is one text, checked like any other but judged only on the language. "Talk with me" is a typed chat with an AI pen pal that reacts, asks questions and gives opinions; its corrections can show under each of your messages, and "Finish and get feedback" runs the whole conversation through the normal check. The chat is saved on this device until you finish.

**Add a topic** to `courses/<lang>/writing.json`:

```json
{"id": "my-room", "title": "My room", "unit": "6", "level": "A1", "kind": "description",
 "task": "Describe your room to a friend who is visiting.",
 "must": ["Furniture and objects", "Where things are", "Colours"],
 "phrases": ["Dans ma chambre, il y a ..."],
 "grammar": ["il-y-a", "place"]}
```

`unit` is optional (no unit means a free topic), `grammar` lists article ids, and `python3 tools/check_course.py` checks all of it.

## Speak

The Speak tab does not talk to an AI inside the app. It builds a long, detailed prompt for a voice AI you already use (ChatGPT voice mode, Gemini Live, Claude voice). Pick one of 50 scenarios (role plays, interviews, opinions, stories and games, tied to units and grammar), choose level, length, how corrections should work (at the end, repeat it right, every answer), feedback language and speech speed, then copy the prompt. Paste it into a new chat, switch to voice mode, say "Prêt", and say "terminé" when you want your feedback. The AI hears your pronunciation, which the app could not judge.

**Free speech** works the same way with no scenario: either "just correct me" (the AI mostly listens) or "talk with me" (a real conversation).

Copying a prompt needs no AI key. Only "Generate new topic" does. Scenarios live in `courses/<lang>/speaking.json`; they use the same fields as writing topics plus `partner` (who the AI plays) and `starter` (its first line).

## My mistakes

Every real mistake the AI finds in a checked text, and every correction in a free-writing chat, is saved in your notebook (Write tab, "My mistakes"). Each one keeps the wrong phrase, the right one, the reason, the grammar rule behind it and how often you made it. "Practice" turns the ones you repeat most into short exercises where you correct the wrong phrase. Correct a mistake twice in a row and it moves to "Learned"; make it again in a later text and it comes back. The notebook also lists your weak spots: the grammar rules behind most of your open mistakes, each linking to its Grammar article.

## Ask AI

When a sentence or gap exercise in Learn practice marks your answer wrong and you think it is fine, tap **I was right** (you decide) or **Ask AI** (the AI decides). If the AI agrees, your answer is accepted for that exercise on this device and counts as correct. If it disagrees, it tells you why. Tests never offer this. It needs the AI key.

## Home, Stats and backups

**Continue** on Home offers your open free-writing chat, your latest unfinished draft, the next Learn lesson, mistakes to review and, when due, a backup reminder (three at most, in that order).

**Stats** has a Writing and speaking section: texts checked, words written, recent average score, a chart of your last 20 scores, speaking prompts copied, and the link to your mistakes.

**Back up progress** (Settings, Data) saves everything the current profile owns (progress, lessons, writing history, mistakes, settings, imported decks) as one `.json` file in your downloads. The AI key is left out on purpose, so the file is safe to keep or send. **Restore** reads such a file and always makes a **new profile** (for example "User (restored)"), so it can never overwrite what you already have. The profile picker has the same Restore button for a new phone. On Home you get a reminder when you have some progress and no backup in the last 14 days. Progress lives only in your browser, so clearing site data or switching phones loses it unless you have a backup.

## Adding single words

**Decks > Add** (or **Settings > Add word**) adds one item at a time. Choose the type (Word or Verb), the deck, the prompt, all correct answers, an optional note, the unit and the difficulty level. The **Format** box shows the exact line for that deck's file in the repository, ready to copy. Items you add are saved on that device; existing words can't be edited from the app.

## Tenses

**Grammar > Verb tables & drill** drills conjugation for every verb in the decks whose `type` is `verbs`. Pick tenses (grouped by mood, with Core / All presets), verb categories (one per verb deck) or individual verbs, then choose **One form** (one person at a time) or **Full table** (all persons at once). Answers are accepted with or without the pronoun, and feminine/plural agreement counts as correct. Each verb + tense pair has its own level, shown per tense under **Progress by tense**. Every verb also has a reference page with all its tables.

The tables are generated, not typed by hand, using the [verbecc](https://github.com/bretttolbert/verbecc) library (Verbiste data). After adding verbs to a verb deck, regenerate them:

```bash
cd ~/Projects/language-app
python3 -m venv venv
venv/bin/pip install verbecc
venv/bin/python tools/conjugate.py
```

Then push as usual. The script skips verbs it doesn't recognize, so check its output for spelling mistakes.

## Running it on the PC

Opening `index.html` directly doesn't work, because browsers block loading the word files from disk. Start a small local server instead:

```bash
cd ~/Projects/language-app
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Profiles and progress

The app opens on a profile picker. The first time, it walks you through creating a profile (just a name). Each profile has its own progress, imported decks and settings. Switch profiles in **Settings > Switch profile**.

Profiles and progress are saved in the browser on each device (PC and phone separately). GitHub only carries the app and the word list.
