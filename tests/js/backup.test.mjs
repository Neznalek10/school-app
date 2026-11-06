/**
 * Tests for js/backup.js (parseBackup, buildBackup, names) and the safe-type decision in js/views/sources.js.
 *
 * Covers valid backups, hostile files (AI address, javascript: links, non-object records) and malformed files.
 */
import { test, assert } from './harness.mjs';
import { BACKUP_KEYS, buildBackup, parseBackup, restoredName } from '../../js/backup.js';
import { ACCOUNT_KEYS } from '../../js/store.js';
import { safeInlineType } from '../../js/views/sources.js';

/** Wraps data in a minimal valid backup file and returns its JSON text. */
const fileWith = (data, extra = {}) => JSON.stringify({ app: 'school', format: 1, account: { name: 'User' }, data, ...extra });

test('BACKUP_KEYS derives from ACCOUNT_KEYS', () => {
  assert.deepEqual(BACKUP_KEYS, ACCOUNT_KEYS);
});

test('parseBackup keeps valid records and the account name', () => {
  const data = {
    subjects: [{ id: 's1', name: 'Biologie' }],
    notes: [{ id: 'n1', text: 'Příliš žluťoučký kůň' }],
    sources: [{ id: 'r1', kind: 'link', url: 'https://cs.wikipedia.org/wiki/Buňka' }, { id: 'r2', kind: 'book' }],
    lessons: [{ id: 'l1', link: 'http://example.com/a' }],
    chats: { s1: [] },
  };
  const parsed = parseBackup(fileWith(data));
  assert.equal(parsed.name, 'User');
  assert.deepEqual(parsed.data, data);
});

test('parseBackup drops settings.ai and unknown settings, keeps known ones', () => {
  const settings = { theme: 'dark', aiLanguage: 'cs', lastBackup: 5, czech: { holidays: true }, addedDefaults: ['a', 3], ai: { url: 'https://evil.example', key: 'x' }, other: 1 };
  const { data } = parseBackup(fileWith({ settings }));
  assert.deepEqual(data.settings, { theme: 'dark', aiLanguage: 'cs', lastBackup: 5, czech: { holidays: true }, addedDefaults: ['a'] });
});

test('parseBackup keeps saved test checks and drops ones without a list of questions', () => {
  const question = { number: '1', question: 'q', studentAnswer: 'a', correctAnswer: 'b', verdict: 'wrong', explanation: '', tip: '', lowConfidence: true, points: { earned: 0, max: 2 } };
  const result = { title: 'Test', summary: '', focus: [], questions: [question] };
  const good = { id: 'c1', subjectId: 's1', eventId: '', mode: 'check', created: 5, result };
  const { data } = parseBackup(fileWith({ checks: [good, { id: 'c2' }, { id: 'c3', result: { questions: 'x' } }, null, { result: { questions: [] } }] }));
  assert.deepEqual(data.checks, [good]);
  assert.throws(() => parseBackup(fileWith({ checks: {} })), 'checks has the wrong shape');
});

test('parseBackup rebuilds check results and drops checks with bad fields or no usable question', () => {
  const base = { id: 'c', subjectId: 's1', eventId: '', mode: 'check', created: 5 };
  const q = { question: 'q', verdict: 'bogus', studentAnswer: 7 };
  const files = [
    { ...base, id: 'a', result: { questions: [null, q] } },
    { ...base, id: 'b', result: { questions: [null] } },
    { ...base, id: 'c', result: { questions: [] } },
    { ...base, id: 'd', mode: 'other', result: { questions: [q] } },
    { ...base, id: 'e', created: 'x', result: { questions: [q] } },
    { ...base, id: 'f', subjectId: 3, result: { questions: [q] } },
    { ...base, id: 'g', eventId: null, result: { questions: [q] } },
  ];
  const { data } = parseBackup(fileWith({ checks: files }));
  assert.deepEqual(data.checks.map(c => c.id), ['a']);
  assert.equal(data.checks[0].result.questions.length, 1);
  assert.equal(data.checks[0].result.questions[0].verdict, 'unreadable');
  assert.equal(data.checks[0].result.questions[0].studentAnswer, '');
});

test('parseBackup keeps only valid subject topics and drops a topics value that is not a list', () => {
  const topics = [{ id: 't1', title: 'Fractions', detail: 'Add and compare', done: true }, { id: 't2', title: 'Angles', detail: 5, done: 'yes' }, { id: 3, title: 'x' }, { id: 't4' }, null, { id: 't5', title: '  ' }];
  const { data } = parseBackup(fileWith({ subjects: [{ id: 's1', name: 'Maths', topics }, { id: 's2', name: 'Art', topics: 'oops' }, { id: 's3', name: 'PE' }] }));
  assert.deepEqual(data.subjects[0].topics, [
    { id: 't1', title: 'Fractions', detail: 'Add and compare', done: true },
    { id: 't2', title: 'Angles', detail: '', done: false },
  ]);
  assert.equal('topics' in data.subjects[1], false);
  assert.equal('topics' in data.subjects[2], false);
});

test('parseBackup keeps the student profile object and drops one of the wrong type', () => {
  const student = { age: 8, year: 2, stage: 'primary', school: '', subjects: ['Maths'], goals: '', notes: '', done: true };
  assert.deepEqual(parseBackup(fileWith({ settings: { student } })).data.settings, { student });
  assert.deepEqual(parseBackup(fileWith({ settings: { student: 'x' } })).data.settings, {});
  assert.deepEqual(parseBackup(fileWith({ settings: { student: [1] } })).data.settings, {});
});

test('buildBackup carries checks and the student profile through a round trip', () => {
  const question = { number: '1', question: 'q', studentAnswer: '', correctAnswer: 'b', verdict: 'blank', explanation: '', tip: '', lowConfidence: false, points: null };
  const check = { id: 'c1', subjectId: 's1', eventId: '', mode: 'solve', created: 1, result: { title: '', summary: '', focus: [], questions: [question] } };
  const source = { checks: [check], settings: { student: { age: 9 } } };
  const file = buildBackup(source, { name: 'User', version: '2.5.0' });
  const parsed = parseBackup(JSON.stringify(file));
  assert.deepEqual(parsed.data.checks, [check]);
  assert.deepEqual(parsed.data.settings.student, { age: 9 });
});

test('parseBackup drops sources with non-http(s) addresses', () => {
  const sources = [
    { id: 'a', kind: 'link', url: 'javascript:alert(1)' },
    { id: 'b', kind: 'link', url: ' JaVaScRiPt:alert(1)' },
    { id: 'c', kind: 'link' },
    { id: 'd', kind: 'book', url: 'data:text/html,x' },
    { id: 'e', kind: 'link', url: 'https://ok.example/x' },
  ];
  const { data } = parseBackup(fileWith({ sources }));
  assert.deepEqual(data.sources.map(s => s.id), ['e']);
});

test('parseBackup clears a lesson link that is not http(s) but keeps the lesson', () => {
  const { data } = parseBackup(fileWith({ lessons: [{ id: 'l1', link: 'javascript:alert(1)', progress: { a: 1 } }] }));
  assert.deepEqual(data.lessons, [{ id: 'l1', link: '', progress: { a: 1 } }]);
});

test('parseBackup drops records that are not objects with an id, and nameless subjects', () => {
  const { data } = parseBackup(fileWith({
    notes: [null, 5, 'x', [], {}, { id: 7 }, { id: 'ok' }],
    subjects: [{ id: 's1' }, { id: 's2', name: 'Math' }],
  }));
  assert.deepEqual(data.notes, [{ id: 'ok' }]);
  assert.deepEqual(data.subjects, [{ id: 's2', name: 'Math' }]);
});

test('parseBackup rejects malformed files with a readable error', () => {
  const bad = [
    ['not json', 'is not valid JSON'],
    ['null', 'not a School backup'],
    ['[]', 'not a School backup'],
    [JSON.stringify({ app: 'other', format: 1, data: {} }), 'not a School backup'],
    [JSON.stringify({ app: 'school', format: 1 }), 'not a School backup'],
    [JSON.stringify({ app: 'school', format: 2, data: {} }), 'newer version'],
    [JSON.stringify({ app: 'school', format: '1', data: {} }), 'newer version'],
    [fileWith({ notes: {} }), 'notes has the wrong shape'],
    [fileWith({ settings: [] }), 'settings has the wrong shape'],
    [fileWith({ chem: 'x' }), 'chem has the wrong shape'],
  ];
  for (const [text, message] of bad) {
    assert.throws(() => parseBackup(text), message);
  }
});

test('parseBackup falls back to "Restored" and trims long names', () => {
  assert.equal(parseBackup(fileWith({}, { account: {} })).name, 'Restored');
  assert.equal(parseBackup(fileWith({}, { account: { name: 'x'.repeat(40) } })).name.length, 24);
});

test('buildBackup blanks the AI key, omits lastBackup and round-trips through parseBackup', () => {
  const source = { subjects: [{ id: 's1', name: 'A' }], settings: { theme: 'dark', lastBackup: 9, ai: { url: 'u', key: 'secret', model: 'm' } } };
  const file = buildBackup(source, { name: 'User', version: '1.0', now: new Date('2026-11-02T10:00:00Z') });
  assert.equal(file.data.settings.ai.key, '');
  assert.equal(file.data.settings.lastBackup, undefined);
  const parsed = parseBackup(JSON.stringify(file));
  assert.deepEqual(parsed.data.subjects, source.subjects);
  assert.equal(parsed.data.settings.ai, undefined);
});

test('restoredName adds a numbered suffix while names are taken', () => {
  const taken = new Set(['User', 'User (restored)']);
  assert.equal(restoredName('User', n => taken.has(n)), 'User (restored 2)');
  assert.equal(restoredName('New', n => taken.has(n)), 'New');
});

test('safeInlineType allows images, PDF and plain text only', () => {
  assert.equal(safeInlineType('image/png'), 'image/png');
  assert.equal(safeInlineType('application/pdf'), 'application/pdf');
  assert.equal(safeInlineType('Text/Plain; charset=utf-8'), 'text/plain');
  for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml', '', undefined, 'image/png/../html']) {
    assert.equal(safeInlineType(type), null);
  }
});
