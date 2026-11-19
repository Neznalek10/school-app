# Learn: plan for a French course inside the app

Date: 2026-10-20 · App version at the time: 1.6.1 · Status: partly built, see the update notes in sections 3, 6 and 9

## 1. What we're building

A **Learn** section that teaches French the way school does, then makes the learner produce it.

- **Course → Unit → Lesson.** One unit = one school topic (greetings, family, food...). Each unit has 2 to 4 lessons and ends with a test.
- **Every lesson has two parts:**
  1. **Learn:** short explanation in the learner's language (Czech in the first version), examples, tables, "Watch out" boxes for typical mistakes of Czech speakers, and the new words.
  2. **Practice:** active exercises. You type French, you don't pick it.
- **Unit test:** 70% to pass. If you fail, you can retake the test (new random questions) or redo the whole unit. If you pass, the next unit unlocks.
- **Test out:** every unit's test can be taken at any time. Pass it and the unit counts as done. Learners often know the basics from school, so they shouldn't have to click through greetings to reach what they are actually learning.
- **Active over passive.** Most points come from writing French: sentence in the learner's language → French sentence, gaps, transforming sentences, answering questions about yourself, short essays. Multiple choice only appears inside Learn as a quick check, never in tests.

## 2. What's in the database now (French, 624 words, 24 decks)

Strong: food (92), clothing (48), basics (48), shopping (38), geography (34), school (32), personality (28), body (27).
Thin: home (7), animals (11), transport (10), celebrations (10).

**Gaps that block a school-style course:**

| Missing | Why it matters |
|---|---|
| **être, avoir, faire, prendre, venir, pouvoir, vouloir, savoir, dire, voir, mettre, partir, sortir, finir, dormir, comprendre, attendre, répondre, s'appeler, préférer, adorer, détester, arriver, rester, tomber, payer, porter, devenir** | These are the verbs of lessons 1 to 10 in every textbook. Without être and avoir there's no unit 1 or 2. They go into the verb decks, and `tools/conjugate.py` builds their tables (never hand-written). |
| Numbers 0 to 19, mille | Age, prices, time |
| Greetings (bonjour, salut, au revoir, merci, s'il te plaît, ça va...) | Unit 1 |
| Days of the week, 10 of the 12 months, seasons | Time, school timetable, weather |
| vert, orange | Basic colours |
| Countries and nationalities (tchèque, français(e)...) | Introducing yourself |
| Rooms and furniture, prepositions of place (dans, sur, sous, derrière, à côté de, à gauche) | Home unit has 7 words |
| Question words (comment, quand, pourquoi, combien, qu'est-ce que) | Every unit |
| Professions | Future unit, and it lets actor, actress, translator and king leave the family deck |
| Everyday interests (les jeux vidéo, jouer en ligne) | Essays about yourself are better when learners can write about their actual life |

The full per-unit list of new words is in section 3. Rough count: about 350 new words, which takes French to roughly 1,000.

**More answer errors found while reading every deck** (separate from the 15 fixed in 1.6.1; fixing them keeps progress):

| Prompt (English gloss of the Czech) | Now | Should be |
|---|---|---|
| ingredient | repas | ingrédient (repas = meal) |
| maybe | possible | peut-être (possible = possible, as in "can be done") |
| goblet, cup | coup | coupe |
| small cannelé cakes | cancrelés | canelés |
| anchovy paste | anchoïde | anchoïade |
| eyelashes | cil | cils |
| advice (plural) | conseil | conseils |
| crazy, mad (person) | folle | fou / folle |
| nervous | inquiet | nerveux (inquiet = worried) |
| addicted | accrochée | accro / accroché(e) |
| computer science (school subject) | technologie | informatique (technologie is a different French subject) |
| eye | oeil | œil |

## 3. Course map (A1 → A2)

> **Update 2026-10-23 (v1.15.0):** The course is now 8 units plus *Mon avenir* as unit 9 on its own, with no unit mixing A1 and A2. A1 is units 1 to 5 (1 = 1.1 + 1.2, 2 = 2.1 + 2.2 + 2.3 Mes loisirs, 3 = 3.1 Au collège + 3.2 Ma journée, 4 = 4.1 À table ! + 4.2 Faire les courses + 4.3 Chez moi, 5 = 5.1 En ville + 5.2 Quel temps fait-il ?). A2 is units 6 to 8 (6.1 La mode + 6.2 Le week-end dernier, 7.1 En vacances + 7.2 La santé, 8.1 Écrans et médias + 8.2 Les fêtes), and 9 is Mon avenir. All A2 parts are written: 35 lessons, 480 practice items, 175 test items, following the grammar column of the table below. Old saved results migrate at sign-in (`REPACK` in `js/learn/course.js`).
>
> **Update 2026-10-20 (v1.8.0):** A1 is now 8 units, some split into parts: 1 = 1.1 Salut ! + 1.2 Je me présente, 2 = 2.1 Ma famille + 2.2 Portrait, 3 = Mes loisirs, 4 = 4.1 Au collège + 4.2 Ma journée, 5 = 5.1 À table ! + 5.2 Faire les courses, 6 = Chez moi, 7 = En ville, 8 = Quel temps fait-il ?. A2 units are 9 to 15. All of A1 is written. Lessons unlock in strict order, and an A1 final test lets you skip A1. The table below is the original 19-unit plan the parts come from.

The order follows a common school A1/A2 sequence: one topic plus one or two grammar points per unit. The order lives in `course.json`, so switching to another sequence (for example a particular textbook's) is a data change, not a code change.

| # | Unit | Topic decks used | Grammar | New words to add | Writing task |
|---|---|---|---|---|---|
| **A1** | | | | | |
| 1 | Salut ! | basics | subject pronouns, **être** (présent), s'appeler, tu vs vous | greetings, ça va, monsieur/madame, numbers 0 to 20, enchanté(e) | none |
| 2 | Je me présente | numbers | **avoir**, age (j'ai 14 ans), habiter à/en, nationalities m/f, numbers to 69 | countries, nationalities, languages, venir de | **Who you are: name, age, where you're from, where you live** |
| 3 | Ma famille | family, animals | possessives (mon/ma/mes...), un/une/des, numbers 70 to 100 | grands-parents, oncle, tante, cousin(e), fils, marié, divorcé | Your family |
| 4 | Portrait | appearance, personality, colors | adjective agreement and position, avoir les cheveux..., **ne...pas** | vert, orange, gentil, drôle, intelligent, sérieux, calme | Describe a friend |
| 5 | Mes loisirs | sports | **-er verbs** (présent), aimer/adorer/détester + le/la, **faire de**, **jouer à/de**, questions (est-ce que) | le foot, le hockey, les jeux vidéo, préférer, sortir | Your hobbies |
| 6 | Au collège | school, time | le/la/les vs un/une, à + le = au, telling the time, days | lundi to dimanche, le prof, l'élève, facile, difficile, préféré, finir | Your timetable and favourite subject |
| 7 | Ma journée | verbs-reflexive, time | **reflexive verbs**, d'abord / ensuite / après / enfin, prendre | petit-déjeuner, déjeuner, dîner, partir | A normal school day |
| 8 | À table ! | food | **du / de la / des** (partitive), pas de, boire, manger, je voudrais | la pomme de terre, la carotte, la banane, le poisson (food sense), l'addition, le serveur | Your favourite meal |
| 9 | Faire les courses | shopping | quantities (une bouteille de, un kilo de), combien, **vouloir / pouvoir**, aller à la / au / chez | l'euro, la couronne, le supermarché, payer, mille | Shopping list + dialogue |
| 10 | Chez moi | home | **il y a**, prepositions of place | rooms, furniture, l'appartement, l'étage | Your room |
| 11 | En ville | transport, geography | **aller + à/en**, **impératif**, **futur proche** | la gare, la poste, le cinéma, le musée, tout droit, tourner, traverser, à pied | Directions to a place |
| 12 | Quel temps fait-il ? | weather | il fait / il pleut / il neige, months, seasons | printemps, été, automne, hiver, the missing months | The weather and what you do in each season |
| **A2** | | | | | |
| 13 | La mode | clothing | **ce / cette / ces**, comparatives (plus... que), porter, mettre | la pointure, essayer, trop grand | What you wear |
| 14 | Le week-end dernier | sports, media | **passé composé with avoir**, past participles | dernier, la semaine dernière, il y a (ago) | Last weekend |
| 15 | En vacances | geography, celebrations | **passé composé with être**, agreement | la plage, la montagne, l'hôtel, le camping, arriver, rester, tomber | Your last holidays |
| 16 | La santé | body, health | **avoir mal à**, il faut + infinitive, devoir | le médecin, malade, la fièvre, le rhume, la grippe | At the doctor's |
| 17 | Écrans et médias | media | **le / la / les as object pronouns**, negations (ne...jamais, ne...plus) | le portable, l'ordinateur, un réseau social, une appli | Your screen time |
| 18 | Les fêtes | celebrations | **imparfait** (quand j'étais petit...) | Noël, le Nouvel An, l'anniversaire, le cadeau | A celebration you remember |
| 19 | Mon avenir | (new) professions | **futur simple**, vouloir devenir | professions (médecin, ingénieur, développeur, agent immobilier...) | What you want to do later |

Tenses already in the Tenses tab get used by the unit that teaches them, so Tenses and Learn share one set of tables.

## 4. Inside a unit

```
Unit 5 · Mes loisirs
├── Lesson 1  -er verbs           Learn → Practice
├── Lesson 2  jouer à / faire de  Learn → Practice
├── Lesson 3  est-ce que          Learn → Practice
├── Writing   "Tes loisirs"       (AI-checked, see section 6)
└── Unit test                     ≥ 70% to pass
```

**Learn** is a short stack of cards you swipe through. Each card is one of:
- `text`: explanation in the learner's language
- `table`: a grammar table (for conjugations it is pulled from `conjugations/fr.json`, never typed in by hand)
- `examples`: French sentence + its meaning in the learner's language
- `tip`: "Watch out" box for typical mistakes made by Czech speakers
- `vocab`: the lesson's new words, with a quick look-cover-write round
- `check`: one or two quick questions so you use the rule immediately

**Practice** is about 12 to 20 exercises per lesson. Wrong answers come back at the end of the session, like the current practice mode. The existing explanations (`explain.js`) still run, plus the lesson's own `why` notes.

**Unit test** is 20 questions drawn from:
- the unit's words (learner's language → French),
- a **separate test pool** of sentences never seen in practice, so the test checks whether you can use the grammar, not whether you remember the sentences,
- the writing task, if AI checking is set up (see section 6).

Scoring: 1 point per question. Accent-only mistakes follow the accent setting. No hints or explanations during the test; the results screen shows everything that was wrong with explanations, a score per lesson, and buttons for **Retake test** and **Redo unit**. The best score and every attempt are saved.

**After passing:** the unit's sentences join a **Review** session (same spaced repetition as words now), so unit 3 doesn't fade while you're on unit 9.

## 5. Exercise types

| Type | What you do | Checked by | Used in |
|---|---|---|---|
| `word` | Word in the learner's language → French (the current practice) | code | practice, test |
| `cloze` | Fill the gap: *Je ___ (avoir) quatorze ans.* | code | practice, test |
| `form` | Conjugate: *nous / être / présent* (uses Tenses tables) | code | practice, test |
| `order` | Build the sentence from word tiles (first exposure, easier) | code | practice only |
| `build` | **Write the French sentence from the one in the learner's language** | code first, AI on request | practice, test (main type) |
| `transform` | Change the sentence: negative, plural, feminine, past... | code | practice, test |
| `answer` | Answer a question about yourself: *Quel âge as-tu ?* | AI (code fallback: pattern) | practice, test |
| `write` | Short essay, 40 to 80 words, with a checklist of what to include | AI | end of unit |
| later: `listen` | Hear French (phone text-to-speech), type it | code | practice |
| later: `speak` | Say the sentence (speech recognition on Android Chrome) | code / AI | practice |

**Many correct answers.** Sentence answers use `{a|b}` alternatives: `"{Je m'appelle|Mon nom est} Camille."` expands to both. Checking ignores capitals, commas and final punctuation. If code says wrong but the learner is sure the sentence is right, **Ask AI** checks it, and if the AI agrees the sentence is added as an accepted answer on this device. That's how sentence items get better the more they are used.

**Voice later** is mostly a different input, not a new exercise: `build` and `answer` take typed text today and speech tomorrow. Every item already has its French text, so listening works with no extra content.

## 6. AI checking

> **Update 2026-10-21:** shipped in 1.10.0 as the Write tab, with 87 topics. Settings holds address, key and model; the prompt is `prompts/check-write.md`. The answer format differs from the sketch below: four 0 to 10 scores, a requirement list, mistakes with rule ids, natural-French suggestions and a corrected text. Appeals ("Ask AI" on sentence and gap exercises, `prompts/check-answer.md`) shipped in 1.12.0; the `answer` exercise type (free questions about yourself) is not built. See the README, section Write.

**Rule: code checks everything it can; AI only checks what code can't.** That means essays, free answers, and appeals. The app keeps working offline and without AI; the learner just skips the essay or checks it against a model answer.

**One client for every provider.** OpenRouter, Ollama and LM Studio all speak the same "OpenAI-compatible chat" API, so the app needs one small client with three settings: address, API key, model.

| Option | Works on phone | Cost | Quality for French grammar | Setup |
|---|---|---|---|---|
| **OpenRouter, free models** | yes | 0 (about 50 checks/day free; 1,000/day after a one-time $10 top-up) | good with 70B+ class models | create key, paste in Settings |
| Ollama on a local PC | **no**, only when practicing on that PC | 0 | noticeably weaker at 7 to 8B, and essay feedback needs to be right | install Ollama, set `OLLAMA_ORIGINS` so the GitHub Pages site may call it |
| Paid model via OpenRouter | yes | cents per month at normal volume | best | same as free |

**Recommendation:** OpenRouter free first, because it's the only free option that works on a phone. Ollama comes free with the same client for offline checking on a PC. Free models get swapped out without warning, so the model is a setting, not code.

**Safety of the key:** it's stored only on the device (Settings), never in the repo. The repo is public on GitHub Pages, so a key in the code would be stolen within days.

**What the AI returns** (validated in code; if the reply isn't valid it shows "couldn't check" instead of guessing). The `_cs` fields hold text in the learner's language (Czech in the first version); the values are shown here in English.

```json
{"score": 0.8, "ok": false,
 "corrected": "J'ai quatorze ans et j'habite à Prague.",
 "errors": [{"wrong": "je suis 14 ans", "right": "j'ai 14 ans", "why_cs": "French expresses age with the verb avoir."}],
 "missing": ["where you are from"],
 "feedback_cs": "Good sentence structure, but it doesn't say where you come from."}
```

Prompts live as files (`prompts/check-write.md`, `prompts/check-answer.md`), so changing how the AI grades means editing a text file, not code.

## 7. Where the content lives

```
courses/fr/course.json          order of units, levels
courses/fr/01-salut.json        one file per unit
prompts/check-write.md
prompts/check-answer.md
tools/check_course.py           validator + grammar proofreading
```

A unit file. The `cs` and `_cs` fields hold text in the learner's language (Czech in the first version); the values are shown here in English.

```json
{
  "schema": 1,
  "id": "fr-01",
  "title": "Salut !",
  "subtitle": "Greetings and introductions",
  "level": "A1",
  "goals": ["Greet people and say goodbye", "Say what your name is", "The verb être in the present tense"],
  "lessons": [
    {
      "id": "fr-01-1",
      "title": "Je suis...",
      "words": ["greetings#hello", "greetings#good day", "basics#yes"],
      "learn": [
        {"type": "text", "cs": "Être means \"to be\". It is irregular, so you learn it by heart."},
        {"type": "table", "verb": "être", "tense": "present"},
        {"type": "examples", "items": [{"fr": "Je suis tchèque.", "cs": "I'm Czech."}]},
        {"type": "tip", "cs": "Watch out: age is not said with être. Not \"je suis 14 ans\" but \"j'ai 14 ans\"."},
        {"type": "check", "item": {"type": "cloze", "fr": "Tu ___ français ?", "a": ["es"]}}
      ],
      "practice": [
        {"id": "fr-01-1-01", "type": "cloze", "fr": "Nous ___ amis.", "a": ["sommes"], "hint": "être"},
        {"id": "fr-01-1-02", "type": "build", "cs": "I'm Camille and I'm Czech.", "a": ["Je suis Camille et je suis tchèque."]},
        {"id": "fr-01-1-03", "type": "transform", "task_cs": "Make it negative", "fr": "Je suis français.", "a": ["Je ne suis pas français."]}
      ]
    }
  ],
  "writing": {"id": "fr-01-w", "task_cs": "Greet someone and introduce yourself (3 to 4 sentences).", "must": ["greeting", "name", "nationality"], "min_words": 15},
  "test": {"pass": 0.7, "count": 20, "pool": [ ... ]}
}
```

- **Words stay in decks.** A lesson only refers to them (`deckId#prompt`, the same IDs progress already uses), so new course words also show up in Decks, Words and Stats, and existing word progress counts in the course.
- **Every item has a fixed `id`.** Fixing a typo in a sentence keeps its progress.
- **`schema`** lets old files be migrated instead of breaking.

**Quality control.** Nobody should learn from unchecked AI French, so every unit goes through:
1. `tools/check_course.py`: required fields, unique IDs, one gap per cloze, every referenced word exists, every conjugated form in an answer matches `conjugations/fr.json`.
2. **LanguageTool** (free grammar checker with good French) proofreads every French sentence in the course, run from the same script.
3. **A human review** of each unit against school material, for anything that looks off. LanguageTool catches grammar, not a wrong translation.

## 8. Code structure (built to change)

```
js/learn/course.js       load course + units, resolve word refs, unit status (locked / open / passed)
js/learn/blocks.js       Learn card renderers, one per block type
js/learn/exercises/      one file per exercise type + index.js registry
js/learn/grade.js        scoring, 70% rule, attempts
js/learn/ai.js           one OpenAI-compatible client + provider presets
js/views/learn.js        course map
js/views/lesson.js       Learn → Practice runner
js/views/test.js         test runner + results
```

| To change | Touch |
|---|---|
| Add or reorder a unit | `course.json` + one unit file, no code |
| New Learn card type | one renderer in `blocks.js` |
| New exercise type | one file in `exercises/` + one line in `index.js` |
| Pass mark, test length | the unit file (`"pass": 0.7`) |
| AI provider or model | Settings in the app |
| How the AI grades | `prompts/*.md` |
| Another language later | `courses/<lang>/`, same code |

Progress is a new per-profile key `learn` (lesson completion, test attempts, sentence spaced repetition), next to the existing `progress` and `conj`, so nothing current is touched.

**The Units tab.** It's empty at the time of writing (every deck has `"unit": null`) and course units cover the same idea. The design proposes that the **Learn** tab replaces **Units**, so the tab bar stays at 7.

## 9. Build order

| Version | What | Done when |
|---|---|---|
| **1.7.0** | Missing core verbs + regenerated tables, greetings and numbers 0 to 20 decks, course loader, Learn tab, lesson runner, `word` / `cloze` / `form` / `order` / `build` / `transform`, unit test + retake, validator + LanguageTool, **unit 1 complete** | Unit 1 can be done on a phone from start to test |
| 1.8.0 | AI settings + client, `answer` + `write`, Ask AI, **unit 2** with the "who are you" essay | An essay gets corrected with explanations in the learner's language |
| 1.9.0 | Units 3 to 6, Review session, "Continue learning" on Home | First month of A1 |
| 1.10.0 | Units 7 to 12 | A1 done |
| 1.11.0 | Units 13 to 19 | A2 done |
| later | `listen` (text-to-speech), `speak` (speech recognition) | Voice practice |

## 10. Design notes

- **Content is the real work, not code.** 19 units × about 70 items = about 1,300 sentences, all of which need to be right. The engine takes a few sessions; the content takes weeks. That's why 1.7.0 ships one finished unit: if the format feels wrong, it changes before 1,300 sentences depend on it.
- **A school-like order pays off twice.** If the app teaches what a class teaches that month, every session also helps at school. A course in a different order means learning everything twice. That is why the unit order is data, not code.
- **AI is not the starting point.** Most exercises have a right answer that code checks instantly, offline and free. AI is for essays only, which is also where it's worth the wait.
- **Typed answers, not multiple choice.** Producing the French form is what the test measures, so tests never use multiple choice.
- **Content is validated.** Tables come only from `tools/conjugate.py`, and every unit passes the validator and LanguageTool before it ships.
- **Other languages wait.** French content can be checked against school material; a second language needs the same kind of reviewer first, or the course would teach its mistakes.
