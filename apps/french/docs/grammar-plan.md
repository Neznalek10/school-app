# Grammar: plan for a French grammar reference inside the app

Date: 2026-10-21 · App version at the time: 1.8.0 · Status: built in 1.9.0 (all 11 chapters), decisions at the end

> **Update 2026-10-23 (1.14.0):** three more path chapters after *Tenses and moods*: the imperative, the conditional with *si* sentences, and the subjunctive. 18 articles and about 210 practice questions. User asked for imperative and "subjonctive (kdybych byl býval)". The Czech structure is really si + plus-que-parfait → conditionnel passé (step 5 of the conditional path), so the subjunctive got its own path. The Tenses articles link to the matching step.
>
> **Update 2026-10-22 (1.14.0):** new chapter 3, *Object pronouns step by step*: 16 articles, 201 checks plus 38 inline *Try it* checks. A guided path from finding the function (COD, COI, y, en, stressed) through each pronoun in every situation to two pronouns, commands and mixed rounds. User asked for it from a COD/COI/y/en brief. The reference articles in chapter 2 stay as they were and link to step 1.
>
> **Update 2026-10-22:** 1.13.0 added 70 articles (185 in 12 chapters, 1,178 checks) after comparing the plan with the DELF A1/A2/B1 grammar lists and the Lawless French A1/A2/B1 lessons: pronoun position, verb families, the subjunctive in use, connectors, negation and question guides, expressions and confusable verbs, homophones. Practice for pronouns, negation and questions lives in the Drills (README, Sentence drills).
>
> **Update 2026-10-21:** the articles are now written in English (chapter, article and section titles, explanations, example translations, check prompts and the labels in the Grammar screens). The catalogue and article shape below were drafted with Czech names (*V kostce*, *Pozor*, *Vyzkoušej si*, *Souvisí*); in the app they are *In short*, *Watch out*, *Try it yourself* and *Related*. Learn is still explained in Czech.

## 1. What we're building

A **Grammar** section: a complete French grammar book for A1, A2 and the basics of B1, written in Czech, readable on the phone in a few minutes per topic, and always one tap away.

- **Learn** teaches in order and makes you produce French. **Grammar** is where you look things up: "where does *lui* go?", "passé composé or imparfait?", "why *pas de* and not *pas du*?".
- **Everything is open.** No locks. Your class is at A2 now, so you need the A2 pages today, whatever Learn has reached.
- **Every article answers the same questions** in the same order: what it is, what forms it has, when to use it, where it goes in the sentence, examples, what Czech speakers get wrong, then a quick self-check.
- **Word order gets a picture.** French word order is fixed and differs from Czech, so position is shown as coloured sentence slots (subject, negation, pronoun, verb...), not only described in text.
- **Not passive.** Every article ends with 3 to 6 checks (typed French, the same exercise types as Learn) and a link to practice the matching Learn topics.

## 2. Catalogue (11 chapters, 115 articles)

By the level where an article starts: **A1** 65 · **A2** 37 · **B1** 13. An article can contain a section marked with a higher level (for example the B1 agreement rule inside the A2 passé composé article). Ids are fixed forever; progress is keyed by them.

### 1 · Stavba věty (sentence structure) · 10

| id | Article | Level | Covers |
|---|---|---|---|
| `word-order` | Základní slovosled | A1 | Fixed order: subject, verb, object. French has no cases, so order carries the meaning (*Le chien mord Paul* ≠ *Paul mord le chien*). Czech moves words for emphasis; French doesn't. |
| `subject-required` | Podmět nesmí chybět | A1 | The biggest Czech mistake: *Jsem doma* → ***Je** suis à la maison*. Every finite verb needs a subject. Empty *il* in *il pleut, il est huit heures, il faut*. Only the imperative has no subject. |
| `sentence-map` | Mapa věty: kam co patří | A1–B1 | The master slot diagram for a statement: (time) · subject · *ne* · object pronouns · verb / auxiliary · *pas* · short adverb · participle / infinitive · object · place · time. Each slot links to its own article. *Hier, je n'ai pas bien dormi. Je ne l'ai jamais vu à Prague.* |
| `time-place` | Kde stojí čas a místo | A1 | Time at the start or the very end; place before time at the end. *Demain, je vais à Paris. / Je vais à Paris demain.* |
| `c-est-il-est` | C'est, nebo il est? | A1 | *C'est* + noun with determiner / name / stressed pronoun; *il est* + adjective / profession without article. *C'est un médecin. Il est médecin.* |
| `il-y-a` | Il y a | A1 | "there is / there are", always singular, *il n'y a pas de*. (Time meaning "ago" is in chapter 9.) |
| `impersonal` | Neosobní věty | A1 | *il faut, il fait beau, il pleut, il neige, il est tard, il est important de*. |
| `conjunctions` | Spojky: et, mais, ou, donc, parce que | A1 | Joining two clauses, *parce que* vs *car*, *parce qu'il*. Word order doesn't change after a conjunction. |
| `complex-sentences` | Souvětí: quand, si, que, comme | A2 | Subordinate clauses keep normal order. *Je pense que...*, *Quand je rentre, je mange.* Czech comma before *že*; French none before *que*. |
| `reported-speech` | Nepřímá řeč (základ) | B1 | *Il dit que...*, *Elle demande si...*, *Il veut savoir où...*. Present-tense reporting only, person changes (*je* → *il*). Tense shift is out of scope. |

### 2 · Zájmena (pronouns) · 20

| id | Article | Level | Covers |
|---|---|---|---|
| `pronouns-overview` | Jak se zájmena dělí | A1–B1 | **Classification tree** of every pronoun type: personal (subject, stressed, reflexive, object direct / indirect, *y*, *en*), possessive, demonstrative, interrogative, relative, indefinite. One example each, linked to its article. Also: what is a pronoun vs a determiner (*mon* is a determiner, *le mien* a pronoun). |
| `subject-pronouns` | Osobní zájmena v podmětu | A1 | *je (j'), tu, il, elle, on, nous, vous, ils, elles*. *Ils* for any mixed group. Position: always right before the verb (only *ne* and object pronouns can stand between). |
| `tu-vous` | Tu, nebo vous? | A1 | Who gets *tu*, who gets *vous*, *vous* as plural. |
| `on` | On | A1 | *on* = we (speech), people in general, someone. Verb in 3rd person singular. *On va au cinéma ?* |
| `stressed-pronouns` | Samostatná zájmena: moi, toi, lui... | A1 | *moi, toi, lui, elle, nous, vous, eux, elles*. Used alone (*Et toi ? Moi aussi*), after prepositions (*chez moi, avec eux*), for emphasis (*Moi, je...*), after *c'est*. |
| `reflexive-pronouns` | Zvratná zájmena: me, te, se | A1 | Change with the person (Czech *se* doesn't): *je me lève, tu te lèves, nous nous levons*. Before the verb, *m' t' s'* before a vowel. |
| `possessive-determiners` | Přivlastňovací: mon, ma, mes | A1 | Agree with the **thing owned**, not the owner: *son père* = his or her father. *mon amie* (vowel). Full table *mon... leurs*. |
| `direct-object` | Předmětová zájmena: le, la, les | A2 | Replace an object without a preposition. **Before the verb**, before the infinitive in *aller / vouloir + inf*, before the auxiliary in passé composé. *Je le vois. Je vais la regarder. Je l'ai vu.* |
| `indirect-object` | Předmětová zájmena: lui, leur | A2 | Replace *à + person*. Verbs where French and Czech differ: *téléphoner à*, *demander à*, but *aider quelqu'un*, *attendre quelqu'un*. *lui* = him **and** her. |
| `y` | Zájmeno y | A2 | *à + thing / place*: *J'y vais. On y va. J'y pense.* |
| `en` | Zájmeno en | A2 | *de + thing*, partitive, quantity: *J'en veux. J'en ai deux. Je n'en ai pas.* |
| `pronouns-imperative` | Zájmena v rozkazu | A2 | Positive: after the verb with a hyphen, *me* → *moi* (*Regarde-moi. Donne-le-moi.*). Negative: normal position (*Ne me regarde pas.*). |
| `pronoun-order` | Pořadí více zájmen | B1 | *me te se nous vous* → *le la les* → *lui leur* → *y* → *en*. *Je te le donne. Je le lui donne. Il y en a.* |
| `ca-cela-ce` | Ça, cela, ce | A1 | *ça va, c'est ça, j'aime ça*, *ce* only before *être*. |
| `demonstratives` | Ukazovací: ce, cet, cette, ces | A2 | *cet ami* before a vowel, *-ci / -là*. |
| `demonstrative-pronouns` | Ukazovací: celui, celle | B1 | *celui-ci, celle de Paul, ceux qui...*. |
| `possessive-pronouns` | Přivlastňovací: le mien, la tienne | B1 | Full table, *C'est le mien.* |
| `relative-qui-que` | Vztažná zájmena qui, que | A2 | *qui* = subject of the next verb, *que* = object. Quick test: verb right after → *qui*. *Le garçon qui joue... Le film que je regarde...* |
| `relative-ou-dont` | Vztažná zájmena où, dont | B1 | *où* for place and time (*le jour où...*), *dont* for *de* (basic cases only: *le livre dont je parle*). |
| `indefinites` | Neurčitá: quelqu'un, rien, tout... | A2 | *quelqu'un, quelque chose, personne, rien, chaque, chacun, autre, plusieurs*. *quelque chose de bon*. |

(The interrogatives *qui, que, quel, lequel* live in chapter 8; the overview tree links there.)

### 3 · Slovesa (verbs) · 13

| id | Article | Level | Covers |
|---|---|---|---|
| `verbs-overview` | Jak se slovesa dělí | A1 | **Tree:** 1st group *-er*, 2nd group *-ir* (*finir*), 3rd group irregular; plus reflexive; plus auxiliaries *être / avoir*. How to tell which group a new verb is in. |
| `conjugation-basics` | Časování: osoby a infinitiv | A1 | What a stem and an ending are, the six persons, why the endings are often silent. |
| `er-verbs` | Slovesa na -er | A1 | Table from `conjugations/fr.json` (*parler*), silent endings, *j'* before a vowel. |
| `er-spelling` | Pravopisné změny u -er | A1 | *manger → nous mangeons, commencer → nous commençons, acheter → j'achète, appeler → j'appelle, préférer → je préfère, payer → je paie*. |
| `ir-verbs` | Slovesa na -ir (finir) | A1 | *-is, -is, -it, -issons, -issez, -issent*. *partir / dormir / sortir* look similar but are irregular. |
| `irregular-core` | Être, avoir, aller, faire | A1 | The four verbs every tense is built on. Tables from the conjugation data. |
| `irregular-more` | Další nepravidelná slovesa | A1/A2 | *prendre, venir, partir, sortir, dormir, mettre, voir, boire, dire, lire, écrire, connaître*: tables + groups that share a pattern (*prendre / apprendre / comprendre*). |
| `modals` | Pouvoir, vouloir, devoir, savoir | A1/A2 | Modal + infinitive. *savoir* (know how) vs *pouvoir* (be able) vs *connaître* (know a person or place). |
| `reflexive-verbs` | Zvratná slovesa | A1 | Pronoun before the verb, negation around both (*je ne me lève pas*), with infinitive (*je vais me coucher*), verbs reflexive in French but not in Czech and vice versa. |
| `verb-infinitive` | Dvě slovesa za sebou | A2 | *aimer jouer* (nothing), *commencer à*, *arrêter de*, *essayer de*, *apprendre à*. |
| `verb-constructions` | Vazby jiné než v češtině | A2 | *attendre qn* (čekat **na**), *aider qn* (pomoci **komu**), *téléphoner à*, *demander à*, *penser à*, *jouer à / de*, *se souvenir de*, *avoir besoin de*. |
| `avoir-faire-expressions` | Vazby s avoir a faire | A1 | *avoir faim, soif, froid, chaud, peur, ans, mal à, envie de, besoin de*; *faire du sport, faire beau, faire les courses, faire la vaisselle*. |
| `passive` | Trpný rod (základ) | B1 | *être + participe, par*. Recognise it; *on* is the everyday alternative. |

### 4 · Časy a způsoby (tenses and moods) · 17

Every tense article embeds its table straight from `conjugations/fr.json` (never typed by hand) and has a **"Procvičit tento čas"** button that opens the existing Tenses drill.

| id | Article | Level | Covers |
|---|---|---|---|
| `tenses-overview` | Mapa časů | A1–B1 | One timeline: past (plus-que-parfait, passé composé, imparfait), now (présent), future (futur proche, futur simple), plus the moods (impératif, conditionnel, subjonctif). Which to use for what, with levels. Passé simple: "you'll only read it in books". |
| `present` | Přítomný čas (présent) | A1 | Uses: now, habits, general truths. *depuis* + présent (*J'habite ici depuis trois ans*), *être en train de*. |
| `imperative` | Rozkazovací způsob | A1 | *tu / nous / vous*, *-er* verbs lose *-s* (*Regarde !*), *être, avoir, savoir* irregular, negative. |
| `futur-proche` | Blízká budoucnost | A1 | *aller* + infinitive, negation around *aller*. |
| `passe-recent` | Právě jsem udělal: venir de | A2 | *venir de* + infinitive. |
| `passe-compose-avoir` | Passé composé s avoir | A2 | Auxiliary + participle, uses, word order with negation, adverbs and pronouns (links to chapter 1 map). |
| `participles` | Příčestí minulé | A2 | *-é, -i, -u* rules + the irregular list: *été, eu, fait, pris, mis, dit, écrit, vu, bu, lu, pu, voulu, dû, su, venu, né, mort*. |
| `passe-compose-etre` | Passé composé s être | A2 | The ~15 movement / state verbs (*la maison d'être*), all reflexive verbs, agreement with the subject (*elle est allée*). |
| `pc-agreement` | Shoda příčestí | A2/B1 | With *être*: always (A2). With *avoir*: only when the direct object comes before (*la pomme que j'ai mangée*, *je l'ai vue*) (B1). |
| `imparfait` | Imparfait | A2 | Formation from *nous* (*nous faisons → je faisais*), *être → j'étais*. Uses: description, habits, ongoing background. |
| `pc-vs-imparfait` | Passé composé, nebo imparfait? | A2/B1 | **Decision tree** + timeline picture: event vs background, once vs repeatedly, *quand* sentences (*Je dormais quand le téléphone a sonné*). Signal words. |
| `futur-simple` | Futur simple | A2 | Infinitive + endings, irregular stems (*ser-, aur-, ir-, fer-, pourr-, voudr-, viendr-, verr-, devr-, saur-*). Futur simple vs futur proche. |
| `conditionnel` | Podmiňovací způsob | A2 | *je voudrais*, polite requests, advice (*tu devrais*), wishes. Same stems as futur simple + imparfait endings. |
| `plus-que-parfait` | Plus-que-parfait | B1 | Past before past. *J'avais déjà mangé quand il est arrivé.* |
| `si-clauses` | Podmínkové věty se si | B1 | *si* + présent → futur; *si* + imparfait → conditionnel. Never conditionnel after *si*. |
| `subjonctif-basics` | Subjonctif: základy | B1 | Formation from *ils* (*ils finissent → que je finisse*), *être / avoir / aller / faire* irregular. Only after *il faut que, vouloir que, pour que, avant que, bien que*. |
| `gerondif` | Gérondif | B1 | *en + -ant*: doing two things at once, how. *En faisant mes devoirs, j'écoute de la musique.* |

### 5 · Podstatná jména a členy (nouns and articles) · 10

| id | Article | Level | Covers |
|---|---|---|---|
| `gender` | Rod podstatných jmen | A1 | Only two genders, endings that predict gender (*-tion, -té* f; *-age, -ment* m), gender differs from Czech (*le lit* × postel). Learn every noun with its article. |
| `plural` | Množné číslo | A1 | *-s*, *-x*, *-al → -aux*, *-eau → -eaux*, *-s / -x / -z* unchanged. The plural is silent; the article carries it. |
| `article-definite` | Určitý člen: le, la, l', les | A1 | Czech has no articles. Use with likes and general statements (*J'aime **le** chocolat*), with known things. |
| `article-indefinite` | Neurčitý člen: un, une, des | A1 | One / some countable thing, first mention. |
| `partitive` | Dělivý člen: du, de la, de l' | A1 | Uncountable amounts (*du pain, de l'eau*). Likes take *le*, eating takes *du* (*J'aime le pain. Je mange du pain.*). |
| `article-negation` | Pas de | A1 | *un / une / du / des → de* after negation. Not after *être*: *ce n'est pas un chien*. |
| `contractions` | Stažené členy: au, aux, du, des | A1 | *à + le = au, à + les = aux, de + le = du, de + les = des*; *à la, à l'* stay. |
| `quantities` | Množství: beaucoup de, un kilo de | A1 | Quantity + *de* without article: *beaucoup de pain, une bouteille d'eau*. |
| `no-article` | Kdy se člen nepíše | A2 | Professions and nationalities after *être*, after *en* (*en France, en bus*), with *sans*, in lists and signs. |
| `choosing-article` | Který člen? | A2 | **Decision tree** that pulls the five articles above together. |

### 6 · Přídavná jména a příslovce (adjectives and adverbs) · 12

| id | Article | Level | Covers |
|---|---|---|---|
| `adj-agreement` | Shoda přídavných jmen | A1 | *+e* feminine, *+s* plural, mixed group → masculine plural. What you hear vs what you write. |
| `adj-forms` | Nepravidelné tvary | A1/A2 | *-eux / -euse, -if / -ive, -en / -enne, -er / -ère, -el / -elle, blanc / blanche, long / longue, gentil / gentille*. |
| `adj-position` | Kde stojí přídavné jméno | A1 | After the noun by default (opposite of Czech). Before: **BANGS** (beauty, age, number, goodness, size): *un petit chien, une belle maison*. |
| `beau-nouveau-vieux` | Beau, nouveau, vieux | A2 | *bel, nouvel, vieil* before a vowel. |
| `colors` | Barvy | A1 | Agreement; *orange, marron* never change; *bleu clair* never changes. |
| `comparative` | Přirovnání: plus, moins, aussi... que | A2 | Adjectives and adverbs, *plus de / moins de / autant de* + noun. |
| `superlative` | Nejvyšší stupeň: le plus | A2 | *le plus grand, la plus grande*, position, *de* after (*le plus grand **de** la classe*). |
| `bon-bien` | Bon, meilleur, bien, mieux | A2 | Adjective vs adverb, irregular comparison. *C'est bon / C'est bien*. |
| `adverbs-ment` | Příslovce na -ment | A2 | From the feminine (*lent → lentement*), *-amment / -emment*, irregular (*vraiment, gentiment*). |
| `adverb-position` | Kde stojí příslovce | A2 | After the verb; in passé composé short adverbs between auxiliary and participle (*j'ai **bien** dormi*); time adverbs at the start or end. |
| `frequency` | Jak často: toujours, souvent, jamais | A1 | Frequency adverbs and expressions (*tous les jours, une fois par semaine*). |
| `tout` | Tout, toute, tous, toutes | A2 | As adjective (*tous les jours*) and as pronoun (*c'est tout*). |

### 7 · Zápor (negation) · 7

| id | Article | Level | Covers |
|---|---|---|---|
| `ne-pas` | Ne... pas | A1 | Around the conjugated verb, *n'* before a vowel. Pattern diagram. |
| `negation-position` | Kde stojí zápor ve složité větě | A2 | Passé composé (*je n'ai pas mangé*), futur proche (*je ne vais pas sortir*), pronouns (*je ne le vois pas*), infinitive (*ne pas fumer*), *personne* after the participle (*je n'ai vu personne*). |
| `negation-words` | Ne... jamais, plus, rien, personne | A2 | Meanings, *rien / personne* as subject (*Personne ne vient.*), Czech double negation is fine here too, but **never** *ne... pas* + *jamais* together. |
| `ne-que` | Ne... que | B1 | Means "only", not a negation (*Je n'ai que deux euros.*). |
| `si-yes` | Si místo oui | A1 | Yes to a negative question: *Tu n'aimes pas ça ? Si !* |
| `spoken-negation` | Mluvená francouzština bez ne | A2 | *J'sais pas, c'est pas grave*: understand it, don't write it. |
| `pas-de-vs-pas-un` | Pas de, nebo pas un? | A2 | When *pas un* is correct (*pas un seul*, after *être*). Links to `article-negation`. |

### 8 · Otázky (questions) · 7

| id | Article | Level | Covers |
|---|---|---|---|
| `question-types` | Tři způsoby, jak se zeptat | A1 | Intonation (*Tu viens ?*), *est-ce que* (*Est-ce que tu viens ?*), inversion (*Viens-tu ?*). Spoken vs written; slot diagram for each. |
| `question-words` | Tázací slova a jejich místo | A1 | *qui, quoi, où, quand, comment, pourquoi, combien (de)*. Where they go in each of the three styles (*Tu vas où ? Où est-ce que tu vas ? Où vas-tu ?*). |
| `quel` | Quel, quelle, quels, quelles | A1 | Agreement, *Quel âge as-tu ? Quelle heure est-il ?*, *quel* + *être*. |
| `inversion` | Inverze | A2 | Pronoun inversion, *-t-* (*A-t-il... ?*), noun subject (*Paul vient-il ?*). |
| `qui-que-quoi` | Qui, que, quoi, qu'est-ce que | A2/B1 | Person vs thing, subject vs object: *qui est-ce qui, qu'est-ce qui, qu'est-ce que*. |
| `lequel` | Lequel | B1 | *lequel, laquelle, lesquels, lesquelles*. |
| `indirect-questions` | Nepřímé otázky | B1 | *Je ne sais pas où il est. Dis-moi si tu viens. Je me demande ce que tu fais.* No inversion, no *est-ce que*. |

### 9 · Předložky (prepositions) · 7

| id | Article | Level | Covers |
|---|---|---|---|
| `a-de` | Předložky à a de | A1 | Main meanings (to / at / in; from / of), with articles (links to contractions). |
| `cities-countries` | Města a země | A1 | *à Prague, en France, au Canada, aux États-Unis*; from: *de Prague, de France, du Canada, des États-Unis*. |
| `place` | Předložky místa | A1 | *dans, sur, sous, devant, derrière, entre, à côté de, en face de, près de, loin de*. |
| `chez` | Chez | A1 | *chez moi, chez le médecin*. |
| `transport` | Doprava: en, à | A1 | *en bus, en voiture, en train*; *à pied, à vélo*. |
| `time-prepositions` | Čas: depuis, pendant, il y a, dans | A2 | *à 8 heures, en mai, en 2026, le lundi*; *depuis* (+ présent), *pendant*, *il y a* (ago), *dans* (in, future), *pour*. |
| `pour-par-avec` | Pour, par, avec, sans | A2 | Common uses and set phrases. |

### 10 · Čísla, čas, datum (numbers, time, dates) · 6

| id | Article | Level | Covers |
|---|---|---|---|
| `numbers-0-69` | Čísla 0 až 69 | A1 | Patterns, *et un*, hyphens. |
| `numbers-70-100` | Čísla 70 až 100 | A1 | *soixante-dix, quatre-vingts, quatre-vingt-dix*, the logic behind them. |
| `big-numbers` | Stovky, tisíce, ceny | A1 | *cent / cents, mille* never *-s*, prices *3,50 €*, decimal comma. |
| `ordinals` | Řadové číslovky | A1 | *premier / première, deuxième, -ième*, *le 1er mai*. |
| `clock` | Hodiny | A1 | *Il est huit heures et quart / moins le quart / et demie*, 24-hour time. |
| `dates` | Datum, dny a měsíce | A1 | *le lundi 3 mars*, no capitals, *en mars / au printemps / en été*. |

### 11 · Výslovnost a pravopis (pronunciation and spelling) · 6

| id | Article | Level | Covers |
|---|---|---|---|
| `accents` | Akcenty a cédille | A1 | *é, è, ê, à, ù, ë, ç*: what each does to the sound (or doesn't). |
| `elision` | Elize: l', j', n', qu' | A1 | Which words drop their vowel, *si → s'il* only. |
| `liaison` | Vázání (liaison) | A1 | When to link (*les amis, vous avez*), when never (*et*, *h aspiré*). |
| `silent-letters` | Němá písmena | A1 | Final consonants (CaReFuL), silent *-e*, *-ent* in verbs. |
| `capitals` | Velká písmena | A1 | *un Français* but *il est français*, no capitals for days, months, languages. |
| `punctuation` | Interpunkce | A1 | Space before *? ! : ;*, « guillemets ». |

**Exactly what B1 means here** (and nothing more): `reported-speech`, `pronoun-order`, `demonstrative-pronouns`, `possessive-pronouns`, `relative-ou-dont`, `passive`, `pc-agreement` (avoir part), `pc-vs-imparfait` (harder cases), `plus-que-parfait`, `si-clauses`, `subjonctif-basics`, `gerondif`, `ne-que`, `qui-que-quoi` (*qu'est-ce qui*), `lequel`, `indirect-questions`. Anything else waits.

## 3. One article, one shape

Every article is a scroll page of sections. The headings are always the same, in this order; a section that doesn't apply is left out.

| # | Section | Required | What goes in |
|---|---|---|---|
| 1 | **V kostce** | yes | One or two sentences + the one table or comparison you'd want on a cheat sheet |
| 2 | **Co to znamená** | | Meaning, compared with Czech |
| 3 | **Tvary** | | Forms table (conjugations always from `conjugations/fr.json`) |
| 4 | **Kdy to použít** | | Rules of use, signal words |
| 5 | **Kde to stojí ve větě** | | Slot diagram (`pattern`) |
| 6 | **Příklady** | yes, 4+ | French + Czech |
| 7 | **Pozor** | | What Czech speakers get wrong, as Czech vs French pairs (`compare`) |
| 8 | **Vyzkoušej si** | yes, 3 to 6 | Typed checks, run as a short exercise session |
| 9 | **Souvisí** | auto | Related articles, Learn lessons that teach it, verb tables |

**Length cap:** an article reads in 2 to 3 minutes. If it gets longer, it's two articles.

### New card types (in `js/learn/blocks.js`, next to the existing ones)

Existing blocks reused as they are: `text`, `table` (incl. verb tables), `examples`, `tip`, `check`.

| Block | What it shows | Why |
|---|---|---|
| `pattern` | Sentences split into coloured slots with a label under each: podmět, zápor, zájmeno, sloveso, pomocné sloveso, příčestí, infinitiv, předmět, příslovce, místo, čas, tázací slovo. An optional formula row on top. | "Where does it go" becomes something you see. Several rows show the same skeleton with different fillings. Wide rows scroll sideways inside the card, never the page. |
| `compare` | Czech sentence, French sentence, the difference highlighted (`[[...]]` in the data), an optional note. | Shows the trap directly: *Jsem doma* → *[[Je]] suis à la maison*. |
| `tree` | Nested classification with a one-line description and a link per node. | "How do we split them": pronouns, verbs, articles, passé composé vs imparfait. |
| `see` | Links to other articles and verb tables. | Cross-references inside the text. |

### Data example (shortened)

```json
{
  "id": "direct-object",
  "title": "Předmětová zájmena: le, la, les",
  "fr": "les pronoms COD",
  "level": "A2",
  "keywords": ["le", "la", "l'", "les", "me", "te", "COD", "přímý předmět", "ho", "ji", "je"],
  "topics": [],
  "sections": [
    {"title": "V kostce", "blocks": [
      {"type": "text", "cs": "*Le, la, les* nahrazují předmět bez předložky (koho? co?). Stojí **před slovesem**, ne za ním jako v češtině."},
      {"type": "compare", "items": [{"cs": "Vidím ho.", "fr": "Je [[le]] vois."}]}
    ]},
    {"title": "Tvary", "blocks": [
      {"type": "table", "head": ["", "jednotné", "množné"], "firstCs": true,
       "rows": [["1. osoba", "me (m')", "nous"], ["2. osoba", "te (t')", "vous"], ["3. osoba", "le, la (l')", "les"]]}
    ]},
    {"title": "Kde to stojí ve větě", "blocks": [
      {"type": "pattern", "formula": ["S", "neg", "pron", "V", "neg"], "rows": [
        {"parts": [["S", "Je"], ["pron", "le"], ["V", "vois"]], "cs": "Vidím ho."},
        {"parts": [["S", "Je"], ["neg", "ne"], ["pron", "le"], ["V", "vois"], ["neg", "pas"]], "cs": "Nevidím ho."},
        {"parts": [["S", "Je"], ["pron", "l'"], ["aux", "ai"], ["part", "vu"]], "cs": "Viděl jsem ho."},
        {"parts": [["S", "Je"], ["V", "vais"], ["pron", "la"], ["inf", "regarder"], ["time", "ce soir"]], "cs": "Podívám se na něj dnes večer."}
      ]},
      {"type": "tip", "cs": "S infinitivem stojí zájmeno před **infinitivem**, ne před *vais*."}
    ]}
  ],
  "checks": [
    {"id": "g-direct-object-01", "type": "transform", "task_cs": "Nahraď *le film* zájmenem", "fr": "Je regarde le film.", "a": ["Je le regarde."]},
    {"id": "g-direct-object-02", "type": "build", "cs": "Neznám ji.", "a": ["Je ne la connais pas."]},
    {"id": "g-direct-object-03", "type": "build", "cs": "Viděl jsem je včera.", "a": ["Je les ai vus hier.", "Je les ai vues hier."]}
  ]
}
```

- `topics` ties an article to Learn topic ids (`pronouns`, `negation`, `partitive`...) so both sides can link to each other with no extra lists.
- `keywords` feed search: French forms and Czech terms, so typing *lui*, *dont*, *COD* or *zápor* finds the page.
- Check items use the existing exercise types and checker, `{a|b}` alternatives included.

## 4. Screens

Same look as the rest of the app: cards, one blue accent, light and dark.

```
Grammar (tab)                     Chapter                         Article
┌──────────────────────────┐      ┌──────────────────────────┐    ┌──────────────────────────┐
│ Grammar        🇫🇷 French ▾│      │ ‹  Zájmena               │    │ ‹  Zájmena               │
│ ┌──────────────────────┐ │      │ 20 articles              │    │ Předmětová zájmena:      │
│ │ 🔍 lui, dont, zápor… │ │      │ ┌──────────────────────┐ │    │ le, la, les         A2   │
│ └──────────────────────┘ │      │ │ Jak se zájmena dělí  │ │    │ les pronoms COD          │
│ [ All | A1 | A2 | B1 ]   │      │ │ A1–B1                │ │    │ [V kostce][Tvary][Kde…]  │
│ ┌──────────────────────┐ │      │ ├──────────────────────┤ │    │ ─ V kostce ───────────── │
│ │ ▦ Verb tables & drill│ │      │ │ Osobní zájmena       │ │    │ …                        │
│ └──────────────────────┘ │      │ │ v podmětu   A1       │ │    │ ─ Kde to stojí ve větě ─ │
│ 1 Stavba věty      10 ›  │      │ ├──────────────────────┤ │    │ [Je][ne][le][vois][pas]  │
│ 2 Zájmena          20 ›  │      │ │ le, la, les   A2     │ │    │ podmět zápor zájm. slov. │
│ 3 Slovesa          13 ›  │      │ ├──────────────────────┤ │    │ …                        │
│ 4 Časy a způsoby   17 ›  │      │ │ …                    │ │    │ [▶ Vyzkoušej si (5)]     │
│ …                        │      │ └──────────────────────┘ │    │ Souvisí: lui/leur · y ·  │
└──────────────────────────┘      └──────────────────────────┘    │ Lekce 1.1-3 · être tab.  │
                                                                  │ ‹ předchozí   další ›    │
                                                                  └──────────────────────────┘
```

- **Home:** search on top, level filter (remembered), the verb tables entry, chapters with article counts.
- **Level filter** hides articles above the chosen level (B1 shows everything). Section-level badges still appear inside articles.
- **Search** is accent-insensitive (same normalising as answer checking) over titles, French names and keywords. Results show chapter and level.
- **Article:** chips at the top jump to sections; "Vyzkoušej si" starts the article's checks as a short session with the normal results screen, then returns to the article; previous / next article at the bottom.
- **"Practice more"** under the checks runs the linked Learn topics (only lessons you've reached, same rule as the Topics view).

## 5. How it connects to the rest

| From | To | How |
|---|---|---|
| Grammar article | Learn | "Souvisí" lists the lessons whose `topics` match, with lock state shown. |
| Learn lesson | Grammar | The last Learn card shows "V gramatice: ..." chips for matching articles. Lesson Learn cards stay short; the full explanation lives in Grammar. |
| Unit test results | Grammar | Wrong answers are grouped by topic with a "Read: <article>" link. The fastest route from a failed test to the rule you missed. |
| Tense article | Tenses | Tables come from the same `conjugations/fr.json`; "Procvičit tento čas" opens the Tenses drill for that tense. |
| Tenses tab | Grammar | See decision 1. |

## 6. Files and storage

```
courses/fr/grammar.json               chapter order, titles, file names
courses/fr/grammar/01-phrase.json     one file per chapter, full articles + checks
...
courses/fr/grammar/11-orthographe.json
js/learn/grammar.js                   load on first open of the tab, search, chapter / article lookup, progress
js/views/grammar.js                   home, chapter, article, search views
js/learn/blocks.js                    + pattern, compare, tree, see
tools/check_course.py                 + grammar checks and proofreading
```

- **Loaded when you first open the tab**, not at app start, so startup stays as fast as now. `sw.js` caches the files for offline use.
- **Per-language.** A language without `grammar.json` has no Grammar tab (German, for now), the same way German has no Tenses tab.
- **No progress tracking** (decision 4): Grammar is a pure reference and stores nothing. Practising its checks uses the normal exercise screen; answers count in the daily activity like any other practice, and **I was right** works as in Learn. No existing data is touched.
- **Validator** adds: unique article and check ids, required sections, known block and slot types, every link and topic id resolves, every verb table exists, one gap per cloze, every conjugated form matches the tables, keywords present. `--proofread` sends every French example, pattern row and check answer through LanguageTool, as it does for Learn.

## 7. Build order

> **Update 2026-10-21:** User asked for every chapter at once, so all of it shipped in **1.9.0**: 115 articles, 559 checks, every link, topic and verb table validated, all French sentences proofread with LanguageTool. The table below is the original three-step plan. AI checking moves to a later version.

| Version | What | Done when |
|---|---|---|
| **1.9.0** | Engine (tab, home, chapter, article, search, level filter, 4 new blocks, checks, progress, Learn ↔ Grammar links, validator) + **chapter 1 Stavba věty and chapter 2 Zájmena** (30 articles) | You can look up any pronoun and the full sentence map on the phone, and check yourself |
| 1.10.0 | Chapters 3 Slovesa and 4 Časy a způsoby (30 articles) | Every tense you'll meet up to B1 has a page |
| 1.11.0 | Chapters 5 to 11 (55 articles) | Catalogue complete |
| later | AI checking (was 1.9.0), A2 lessons, Review | |

Chapters 1 and 2 go first because you named them, and because they're the format test: the pronoun articles use every new block type. If the article shape feels wrong, we change it before 115 articles depend on it.

## 8. Where I'd push back

- **Reading grammar isn't knowing it.** A reference you only read changes nothing at test time. That's why every article ends with checks, and why the length cap is strict. Use Grammar when Learn or school confuses you, then go and produce French.
- **Two explanations of one rule will drift apart.** Learn already explains *être*, possessives, negation... From now on Grammar is the full version and Learn cards stay short and link to it. I won't rewrite the Learn cards now; that's work with no new value.
- **A wrong rule costs more than a wrong exercise.** You'd learn it and build on it. Same quality pipeline as Learn (validator, LanguageTool, tables only from `conjugate.py`), and the content still needs a check against school material, B1 first. LanguageTool catches grammar mistakes in the examples, not a wrong explanation.
- **B1 is capped at the list in section 2.** "Just one more topic" is how a 115-article reference becomes 300.
- **Your class is at A2 now.** If school tests are on passé composé, imparfait or object pronouns this term, chapter 4 first may help more than chapter 1. Decision 3.

## Decisions (answered 2026-10-21)

User chose: Grammar replaces the Tenses tab (1), everything open (2), pure reference without tracking but with practice buttons (4), and all chapters built now instead of in three versions (3). Nothing for German.

The options as they were offered:


1. **Where it lives:** Grammar **replaces the Tenses tab** (verb tables and drill move inside Grammar as "Verb tables & drill", tab bar stays at 7, recommended) / an 8th tab / a third view inside Learn next to Path and Topics.
2. **Locks:** everything open (recommended) / follow Learn's progress.
3. **First chapters:** Stavba věty + Zájmena (recommended, what you asked for) / Časy a způsoby first (what school is on now).
4. **Progress:** store check results and show ✓ (recommended) / no tracking, pure reference.
