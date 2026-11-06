/**
 * Tests for js/i18n.js with the Czech dictionary: exact texts, plural nouns, patterns, pieces split by
 * "·", and English staying English when the interface language is English. Also covers the texts of the
 * Get started interview and the photo test checker: counters, error messages and the retired keys.
 */
import { test, assert } from './harness.mjs';
import { tr, nounFor } from '../../js/i18n.js';
import { setLocale } from '../../js/locale.js';
import { WORDS, PATTERNS } from '../../js/i18n/cs.js';

test('English interface leaves every text alone', () => {
  setLocale({ language: 'en' });
  assert.equal(tr('Calendar'), 'Calendar');
  assert.equal(nounFor(5, 'note', 'notes'), 'notes');
});

test('Czech interface translates words, plurals, patterns and dotted pieces', () => {
  setLocale({ language: 'cs', country: 'CZ' });
  assert.equal(tr('Calendar'), 'Kalendář');
  assert.equal(tr('  Coming up '), '  Nadcházející ');
  assert.equal(nounFor(1, 'note', 'notes'), 'poznámka');
  assert.equal(nounFor(3, 'note', 'notes'), 'poznámky');
  assert.equal(nounFor(7, 'note', 'notes'), 'poznámek');
  assert.equal(tr('In 5 days'), 'Za 5 dní');
  assert.equal(tr('Edited 3 min ago'), 'Upraveno před 3 min');
  assert.equal(tr('Homework · '), 'Úkol · ');
  assert.equal(tr('Test · Tomorrow · 08:00'), 'Test · Zítra · 08:00');
  assert.equal(tr('Mein eigener Text'), 'Mein eigener Text');
  setLocale({ language: 'en' });
});

test('no Czech translation is itself an English key, so the translator cannot loop', () => {
  for (const [en, cs] of Object.entries(WORDS)) {
    if (cs !== en) assert.ok(WORDS[cs] === undefined || WORDS[cs] === cs, `${en} -> ${cs}`);
  }
  assert.ok(PATTERNS.every(([re]) => re instanceof RegExp));
});

/** Runs `fn` with the interface in Czech and puts English back afterwards, even when `fn` throws. */
function inCzech(fn) {
  setLocale({ language: 'cs', country: 'CZ' });
  try {
    fn();
  } finally {
    setLocale({ language: 'en' });
  }
}

test('new interview and test check texts are in the dictionary', () => {
  const keys = [
    'Which languages do you want?', 'Skip for now', 'Get started', 'Photograph a test to get the correct answers and see what to fix',
    'Check my marked test', 'Photo model', 'Mistakes from tests', 'Fix what the AI read', 'Primary school', 'Mark as not done',
    'The AI refused the key. Check it in Account.', 'Paste the JSON block from the AI\'s answer.',
  ];
  for (const key of keys) assert.ok(WORDS[key] !== undefined, key);
});

test('texts that left the app are no longer in the dictionary', () => {
  const retired = [
    'Your school and year', 'School saved.', 'Check for updates', 'Reloading the latest version…',
    'Learn with AI and the language apps', 'e.g. 1, 2-, 85 %',
  ];
  for (const key of retired) assert.ok(WORDS[key] === undefined, key);
});

test('new plural nouns follow the Czech three-form rule', () => {
  inCzech(() => {
    assert.equal(nounFor(1, 'photo', 'photos'), 'fotka');
    assert.equal(nounFor(3, 'photo', 'photos'), 'fotky');
    assert.equal(nounFor(8, 'photo', 'photos'), 'fotek');
    assert.equal(nounFor(2, 'result', 'results'), 'výsledky');
    assert.equal(nounFor(5, 'mistake', 'mistakes'), 'chyb');
  });
});

test('counters keep their numbers and use the Czech wording', () => {
  inCzech(() => {
    assert.equal(tr('0 of 8'), '0 z 8');
    assert.equal(tr('7 of 10 points'), '7 z 10 bodů');
    assert.equal(tr('3 of 5 correct'), '3 z 5 správně');
    assert.equal(tr('3 of 5 correct · 7 of 10 points'), '3 z 5 správně · 7 z 10 bodů');
    assert.equal(tr('2 of 6 done'), '2 z 6 hotovo');
    assert.equal(tr('3 of 20 subjects picked.'), 'Vybráno 3 z 20 předmětů.');
    assert.equal(tr('Step 2 of 7'), 'Krok 2 z 7');
  });
});

test('sentences built around a translated noun are translated as a whole', () => {
  inCzech(() => {
    assert.equal(tr('Add 3 chyby to flashcards'), 'Přidat do kartiček: 3 chyby');
    assert.equal(tr('Only 8 photos fit. 2 fotky not added.'), 'Vejde se jen 8 fotek. Nepřidáno: 2 fotky.');
    assert.equal(tr('Added 4 kartičky to Mistakes from tests.'), 'Do Chyb z testů přidáno: 4 kartičky.');
    assert.equal(tr('Biology: Mistakes from tests'), 'Biology: Chyby z testů');
    assert.equal(tr('0 předmětů: none yet'), '0 předmětů: zatím žádný');
    assert.equal(tr('2 předměty added'), 'Přidáno: 2 předměty');
    assert.equal(tr('1 předmět updated'), 'Aktualizováno: 1 předmět');
    assert.equal(tr('2 předměty added, 1 předmět updated'), 'Přidáno: 2 předměty, aktualizováno: 1 předmět');
  });
});

test('validation and photo messages with names or numbers are translated', () => {
  inCzech(() => {
    assert.equal(tr('Age must be a whole number from 4 to 99.'), 'Věk musí být celé číslo od 4 do 99.');
    assert.equal(tr('Year must be a whole number from 1 to 13.'), 'Ročník musí být celé číslo od 1 do 13.');
    assert.equal(tr('Photo 2'), 'Fotka 2');
    assert.equal(tr('Remove photo 2'), 'Odebrat fotku 2');
    assert.equal(tr('IMG_0042.jpg is not a photo.'), 'IMG_0042.jpg není fotka.');
    assert.equal(tr('This file is too large.'), 'Tento soubor je moc velký.');
    assert.equal(tr('a.jpg could not be opened as a photo. Pick another one.'), 'a.jpg se nepodařilo otevřít jako fotku. Vyber jinou.');
  });
});

test('AI errors keep their detail and the added hints are translated', () => {
  inCzech(() => {
    assert.equal(tr('The AI answered with an error (500).'), 'AI odpověděla chybou (500).');
    assert.equal(tr('The AI answered with an error (500). overloaded'), 'AI odpověděla chybou (500). overloaded');
    assert.equal(
      tr('The AI sent back an empty answer. The model may not read photos. Pick a model that does in Account › AI assistants › Photo model.'),
      'AI poslala prázdnou odpověď. Model možná neumí číst fotky. V Účtu › AI asistenti › Model pro fotky vyber model, který to umí.',
    );
    assert.equal(
      tr('The AI found no questions. Try clearer photos. Try again, or use ChatGPT or Gemini below.'),
      'AI nenašla žádné otázky. Zkus ostřejší fotky. Zkus to znovu, nebo použij ChatGPT či Gemini níže.',
    );
  });
});

test('the verdict labels and the multi-line placeholders translate', () => {
  inCzech(() => {
    assert.equal(tr('Partly right'), 'Částečně správně');
    assert.equal(tr(' correct'), ' správně');
    assert.equal(tr('Uniform motion Uniformly accelerated motion Free fall'), 'Rovnoměrný přímočarý pohyb\nRovnoměrně zrychlený pohyb\nVolný pád');
  });
});

test('solved-test counts, the unencrypted host warning and question flashcards are translated', () => {
  inCzech(() => {
    assert.equal(nounFor(1, 'question', 'questions'), 'otázka');
    assert.equal(nounFor(3, 'question', 'questions'), 'otázky');
    assert.equal(nounFor(12, 'question', 'questions'), 'otázek');
    assert.equal(tr('12 otázek solved'), 'Vyřešeno: 12 otázek');
    assert.equal(tr('Jan 5 · 3 otázky solved'), 'Jan 5 · Vyřešeno: 3 otázky');
    assert.equal(tr('Add 12 otázek to flashcards'), 'Přidat do kartiček: 12 otázek');
    assert.equal(tr('Photos will be sent without encryption to 192.168.1.5:11434.'), 'Fotky se odešlou bez šifrování na 192.168.1.5:11434.');
  });
});
