/**
 * Tests for the pure helpers and the question card of js/views/testcheck.js.
 *
 * Covers which answers stay hidden (try first), summary wording, photo slot counting, the model hint on photo
 * errors, replacing a rechecked question, and that the card escapes AI text and hides the answer until revealed.
 */
import { test, assert } from './harness.mjs';
import { AiError, PHOTO_MODEL_HINT } from '../../js/ai.js';
import {
  checkHref, triesFirst, answerHidden, summaryParts, pointsLabel, checkLine, checkTitle, splitPicked,
  photoErrorText, replaceQuestion, correctedQuestion, questionCard, reservePhotoSlots, insecureHost, solvedLabel,
} from '../../js/views/testcheck.js';

const QUESTION = {
  number: '2a', question: 'What is 3 + 4?', studentAnswer: '8', correctAnswer: '7', verdict: 'wrong',
  explanation: 'Three plus four makes seven.', tip: 'Count on.', lowConfidence: false, points: { earned: 0, max: 2 },
};
const RECORD = { id: 'k1', subjectId: 's1', eventId: '', mode: 'check', created: 1, result: { title: '', summary: '', focus: [], questions: [QUESTION, { ...QUESTION, number: '3' }] } };
const closed = { phase: 'closed', attempt: '', fixing: false, fixQuestion: '', fixAnswer: '', fixPaste: '', fixMessage: '', fixBad: false, busy: false };
const CARD_OPTIONS = { mode: 'check', showAll: false, ready: true };

test('checkHref builds the setup, event and saved-result links', () => {
  assert.equal(checkHref('s1'), '#/testcheck/s1');
  assert.equal(checkHref('s 1', { event: 'e2' }), '#/testcheck/s%201?event=e2');
  assert.equal(checkHref('s1', { check: 'k9' }), '#/testcheck/s1?check=k9');
});

test('triesFirst applies to wrong, partial and blank questions of a checked test only', () => {
  for (const verdict of ['wrong', 'partial', 'blank']) assert.equal(triesFirst({ verdict }, 'check'), true);
  for (const verdict of ['correct', 'unreadable']) assert.equal(triesFirst({ verdict }, 'check'), false);
  assert.equal(triesFirst({ verdict: 'blank' }, 'solve'), false);
});

test('answerHidden opens with the toggle or a revealed card, and not for correct answers', () => {
  const wrong = { verdict: 'wrong' };
  assert.equal(answerHidden(wrong, { mode: 'check', showAll: false, phase: 'closed' }), true);
  assert.equal(answerHidden(wrong, { mode: 'check', showAll: false, phase: 'trying' }), true);
  assert.equal(answerHidden(wrong, { mode: 'check', showAll: true, phase: 'closed' }), false);
  assert.equal(answerHidden(wrong, { mode: 'check', showAll: false, phase: 'revealed' }), false);
  assert.equal(answerHidden({ verdict: 'correct' }, { mode: 'check', showAll: false, phase: 'closed' }), false);
});

test('summaryParts lists only the verdicts that occur, in order', () => {
  const stats = { correct: 3, partial: 0, wrong: 2, blank: 1, unreadable: 0 };
  assert.deepEqual(summaryParts(stats), [
    { verdict: 'correct', count: 3, label: 'correct' },
    { verdict: 'wrong', count: 2, label: 'wrong' },
    { verdict: 'blank', count: 1, label: 'not answered' },
  ]);
});

test('pointsLabel and checkLine word the score, with and without points', () => {
  assert.equal(pointsLabel({ earned: null, max: null }), '');
  assert.equal(pointsLabel({ earned: 7, max: 10 }), '7 of 10 points');
  assert.equal(checkLine({ correct: 3, total: 5, earned: 7, max: 10 }), '3 of 5 correct · 7 of 10 points');
  assert.equal(checkLine({ correct: 0, total: 4, earned: null, max: null }), '0 of 4 correct');
});

test('checkTitle uses the test title or a fallback by mode', () => {
  assert.equal(checkTitle({ mode: 'check', result: { title: 'Unit 3 test' } }), 'Unit 3 test');
  assert.equal(checkTitle({ mode: 'check', result: { title: '' } }), 'Checked test');
  assert.equal(checkTitle({ mode: 'solve', result: { title: '' } }), 'Solved test');
});

test('splitPicked fills the free photo slots and reports the rest', () => {
  assert.deepEqual(splitPicked(3, 0), { take: 3, skipped: 0 });
  assert.deepEqual(splitPicked(5, 6), { take: 2, skipped: 3 });
  assert.deepEqual(splitPicked(2, 8), { take: 0, skipped: 2 });
  assert.deepEqual(splitPicked(0, 3), { take: 0, skipped: 0 });
});

test('photoErrorText adds the model hint for http and format errors only', () => {
  assert.equal(photoErrorText(new AiError('http', 'Bad.')), `Bad. ${PHOTO_MODEL_HINT}`);
  assert.equal(photoErrorText(new AiError('format', 'Empty.')), `Empty. ${PHOTO_MODEL_HINT}`);
  assert.equal(photoErrorText(new AiError('auth', 'Key.')), 'Key.');
  assert.equal(photoErrorText(new AiError('network', 'Offline.')), 'Offline.');
  assert.equal(photoErrorText(new Error('Other.')), 'Other.');
});

test('replaceQuestion swaps one question without touching the original record', () => {
  const fixed = { ...QUESTION, number: '3', verdict: 'correct' };
  const next = replaceQuestion(RECORD, 1, fixed);
  assert.equal(next.result.questions[1].verdict, 'correct');
  assert.equal(next.result.questions[0], QUESTION);
  assert.equal(RECORD.result.questions[1].verdict, 'wrong');
  assert.equal(next.id, 'k1');
});

test('replaceQuestion rejects a position outside the result', () => {
  for (const index of [-1, 2, 1.5, NaN]) assert.throws(() => replaceQuestion(RECORD, index, QUESTION), 'no question at position');
});

test('correctedQuestion trims the edited texts and keeps the rest', () => {
  const fixed = correctedQuestion(QUESTION, { fixQuestion: '  What is 4 + 4?  ', fixAnswer: ' 8 ' });
  assert.equal(fixed.question, 'What is 4 + 4?');
  assert.equal(fixed.studentAnswer, '8');
  assert.equal(fixed.correctAnswer, '7');
});

test('questionCard hides the answer of a wrong question behind Try again and Show answer', () => {
  const text = questionCard(QUESTION, 0, closed, CARD_OPTIONS).s;
  assert.ok(text.includes('data-action="try"') && text.includes('data-action="reveal"'));
  assert.ok(!text.includes('Three plus four makes seven.') && !text.includes('Count on.'));
  assert.ok(text.includes('What is 3 + 4?'));
});

test('questionCard shows the answer, explanation and tip once revealed or with show all', () => {
  const revealed = questionCard(QUESTION, 0, { ...closed, phase: 'revealed' }, CARD_OPTIONS).s;
  const all = questionCard(QUESTION, 0, closed, { ...CARD_OPTIONS, showAll: true }).s;
  for (const text of [revealed, all]) assert.ok(text.includes('Three plus four makes seven.') && text.includes('Count on.'));
});

test('questionCard shows a correct question in full from the start', () => {
  const text = questionCard({ ...QUESTION, verdict: 'correct' }, 0, closed, CARD_OPTIONS).s;
  assert.ok(text.includes('Three plus four makes seven.'));
  assert.ok(!text.includes('data-action="try"'));
});

test('questionCard shows the typed try next to the revealed answer', () => {
  const text = questionCard(QUESTION, 0, { ...closed, phase: 'revealed', attempt: 'Is it 7?' }, CARD_OPTIONS).s;
  assert.ok(text.includes('Your new try') && text.includes('Is it 7?'));
});

test('questionCard flags a question the AI could not read clearly', () => {
  const flagged = questionCard({ ...QUESTION, lowConfidence: true }, 0, closed, CARD_OPTIONS).s;
  assert.ok(flagged.includes('Check this: the photo was hard to read'));
  assert.ok(!questionCard(QUESTION, 0, closed, CARD_OPTIONS).s.includes('hard to read'));
});

test('questionCard escapes text from the AI and the student', () => {
  const hostile = { ...QUESTION, question: '<img src=x onerror=alert(1)>', studentAnswer: '<b>8</b>', verdict: 'correct', correctAnswer: '"><script>x</script>' };
  const text = questionCard(hostile, 0, closed, CARD_OPTIONS).s;
  assert.ok(!text.includes('<img') && !text.includes('<script') && !text.includes('<b>8'));
  assert.ok(text.includes('&lt;img src=x'));
});

test('questionCard in solve mode has no "Your answer" and never hides the answer', () => {
  const text = questionCard({ ...QUESTION, studentAnswer: '', verdict: 'blank' }, 0, closed, { ...CARD_OPTIONS, mode: 'solve' }).s;
  assert.ok(!text.includes('Your answer'));
  assert.ok(text.includes('Three plus four makes seven.'));
});

test('questionCard offers the paste route to fix a question when no AI is ready', () => {
  const view = { ...closed, fixing: true, fixQuestion: 'q', fixAnswer: 'a' };
  const ready = questionCard(QUESTION, 0, view, CARD_OPTIONS).s;
  const offline = questionCard(QUESTION, 0, view, { ...CARD_OPTIONS, ready: false }).s;
  assert.ok(ready.includes('data-action="recheck"') && !ready.includes('data-action="copy-recheck"'));
  assert.ok(offline.includes('data-action="copy-recheck"') && offline.includes('data-action="apply-paste"'));
});

test('reservePhotoSlots keeps two overlapping picks within the limit', () => {
  const state = { photos: [1, 2, 3], pending: 0 };
  assert.deepEqual(reservePhotoSlots(state, 4, 8), { take: 4, skipped: 0 });
  assert.deepEqual(reservePhotoSlots(state, 4, 8), { take: 1, skipped: 3 });
  assert.equal(state.pending, 5);
  assert.deepEqual(reservePhotoSlots(state, 1, 8), { take: 0, skipped: 1 });
});

test('insecureHost names plain-http hosts and stays empty for https and localhost', () => {
  assert.equal(insecureHost('https://openrouter.ai/api/v1'), '');
  assert.equal(insecureHost('http://localhost:11434/v1'), '');
  assert.equal(insecureHost('http://127.0.0.1:1234/v1'), '');
  assert.equal(insecureHost('http://192.168.1.5:8080/v1'), '192.168.1.5:8080');
  assert.equal(insecureHost(' HTTP://ai.example.com/v1 '), 'ai.example.com');
  assert.equal(insecureHost(''), '');
});

test('a solved test reads as "N questions solved", not as a score', () => {
  const stats = { correct: 0, total: 5, earned: null, max: null };
  assert.equal(solvedLabel(stats), '5 questions solved');
  assert.equal(checkLine(stats, 'solve'), '5 questions solved');
});
