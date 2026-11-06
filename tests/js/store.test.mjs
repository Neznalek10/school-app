/**
 * Tests for js/store.js and js/views/setup-apply.js: a new account, saved checks, the student profile
 * (including the one-time migration of the legacy school text) and the chats a setup deletes with the
 * assistants it replaces.
 *
 * Responsibility: protect the store and apply contracts. The store runs on its in-memory fallback (no
 * localStorage under gjs or node). Every test signs out at the end, which also resets the locale, because
 * test files share that state.
 */
import { test, assert } from './harness.mjs';
import { store, ACCOUNT_KEYS } from '../../js/store.js';
import { applySetupAndSave } from '../../js/views/setup-apply.js';
import { setLocale, studentText, currentStudent } from '../../js/locale.js';
import { normalizeStudent } from '../../js/student.js';

/** Saves settings the way an account from before the student profile has them: a `school` text and no `student`. */
function saveLegacySettings(school) {
  const { student, ...legacy } = store.settings;
  store.settings = { ...legacy, school };
  store.save('settings');
}

/** Creates an account, signs in and returns it; sign out with store.signOut(). */
function signInNew(name) {
  const account = store.createAccount(name);
  store.useAccount(account.id);
  return account;
}

test('a new account has no subjects, an empty profile and no checks', () => {
  signInNew('Store One');
  try {
    assert.deepEqual(store.subjects, []);
    assert.deepEqual(store.settings.student, normalizeStudent({}));
    assert.deepEqual(store.checks, []);
    assert.equal(store.settings.ai.visionModel, '');
  } finally {
    store.signOut();
  }
});

test('checks are an account key: saved, reloaded and restored from a backup', () => {
  assert.ok(ACCOUNT_KEYS.includes('checks'));
  const account = signInNew('Store Checks');
  store.checks = [{ id: 'k1', subjectId: 's1' }];
  store.save('checks');
  store.useAccount(account.id);
  assert.deepEqual(store.checks, [{ id: 'k1', subjectId: 's1' }]);
  const restored = store.restoreAccount('Store Restored', { checks: [{ id: 'k2' }], subjects: [] });
  store.useAccount(restored.id);
  assert.deepEqual(store.checks, [{ id: 'k2' }]);
  store.signOut();
});

test('the old school text becomes the profile school when the profile has none, and stays stored', () => {
  const account = signInNew('Store Migrate');
  saveLegacySettings('Old Town School');
  store.useAccount(account.id);
  assert.equal(store.settings.student.school, 'Old Town School');
  assert.equal(store.settings.school, 'Old Town School');
  assert.ok(studentText().includes('Old Town School'));
  store.signOut();
});

test('a profile school wins over the old school text', () => {
  const account = signInNew('Store Keep');
  store.settings = { ...store.settings, school: 'Old Town School', student: { school: 'New School' } };
  store.save('settings');
  store.useAccount(account.id);
  assert.equal(store.settings.student.school, 'New School');
  store.signOut();
});

test('saveStudent cleans the profile, saves it and applies it to the prompts', () => {
  const account = signInNew('Store Student');
  store.saveStudent({ age: 8, year: 2, subjects: ['Math', 'math', ' Art '], notes: 'x', stage: 'bogus' });
  assert.equal(store.settings.student.age, 8);
  assert.equal(store.settings.student.stage, '');
  assert.deepEqual(store.settings.student.subjects, ['Math', 'Art']);
  assert.equal(currentStudent().age, 8);
  assert.ok(studentText().startsWith('an 8-year-old'));
  store.useAccount(account.id);
  assert.equal(store.settings.student.year, 2);
  store.signOut();
});

test('editing one account profile never changes the defaults of the next sign-in', () => {
  signInNew('Store Isolated');
  store.settings.student.subjects.push('Leak');
  store.signOut();
  assert.deepEqual(store.settings.student.subjects, []);
  signInNew('Store Isolated Two');
  assert.deepEqual(store.settings.student.subjects, []);
  store.signOut();
});

test('applying a setup deletes the chats of the setup-made assistants it replaces, and only those', () => {
  signInNew('Store Apply');
  const subject = { id: 'sub1', name: 'Chemistry', assistants: [{ id: 'old1', fromSetup: true }, { id: 'mine', name: 'Mine' }] };
  store.chats = {
    'sub1/old1': { messages: [{ role: 'user', content: 'hi' }] },
    'sub1/mine': { messages: [{ role: 'user', content: 'keep me' }] },
    'sub2/old1': { messages: [] },
  };
  const setup = {
    profile: 'Covers acids and bases this year, tests are short and written.',
    plan: { template: 'general', extra: '' },
    assistants: [],
    tools: [],
    lessons: [],
  };
  let refreshed = 0;
  applySetupAndSave({ refreshSide: () => { refreshed += 1; } }, subject, setup);
  assert.deepEqual(Object.keys(store.chats).sort(), ['sub1/mine', 'sub2/old1']);
  assert.equal(refreshed, 1);
  assert.deepEqual(subject.assistants.map(a => a.id), ['mine']);
  store.signOut();
});

test('a school cleared in the profile stays cleared across saves and sign-ins', () => {
  const account = signInNew('Store Cleared');
  saveLegacySettings('Old Town School');
  store.useAccount(account.id);
  assert.equal(store.settings.student.school, 'Old Town School');
  store.saveStudent({ ...store.settings.student, school: '' });
  assert.ok(!studentText().includes('Old Town School'));
  store.useAccount(account.id);
  assert.equal(store.settings.student.school, '');
  assert.ok(!studentText().includes('Old Town School'));
  store.saveStudent({ ...store.settings.student, age: 9 });
  assert.ok(!studentText().includes('Old Town School'));
  store.signOut();
});

test('the legacy school text does not reach the prompts before it is migrated by a sign-in', () => {
  signInNew('Store Legacy');
  store.settings.school = 'Old Town School';
  store.save('settings');
  assert.ok(!studentText().includes('Old Town School'));
  store.signOut();
});
