/**
 * Tests for js/update.js: when an update reloads the page, when it waits, and the toast after the reload.
 *
 * The service worker container, document and sessionStorage are small fakes that record what happens.
 */
import { test, assert } from './harness.mjs';
import { UPDATED_FROM_KEY, announceUpdate, isEditing, watchForUpdates } from '../../js/update.js';

/** A minimal event target: `on` registers listeners, `fire` calls them. */
function emitter(extra = {}) {
  const listeners = {};
  return {
    ...extra,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type) { (listeners[type] || []).forEach(fn => fn()); },
  };
}

/** An in-memory Storage with the three methods the module uses. */
function memoryStorage() {
  const items = new Map();
  return {
    getItem: key => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key),
  };
}

/** Wires watchForUpdates to fakes and returns them with a reload counter. */
function setup({ controlled = true, active = null } = {}) {
  const updates = { count: 0 };
  const sw = emitter({
    controller: controlled ? {} : null,
    getRegistration: async () => ({ update: async () => { updates.count += 1; } }),
  });
  const doc = emitter({ activeElement: active, visibilityState: 'visible' });
  const session = memoryStorage();
  const reloads = { count: 0 };
  watchForUpdates({ sw, doc, session, version: '2.0.1', reload: () => { reloads.count += 1; } });
  return { sw, doc, session, reloads, updates };
}

test('a new version taking control reloads the page and remembers the old version', () => {
  const { sw, session, reloads } = setup();
  sw.fire('controllerchange');
  assert.equal(reloads.count, 1);
  assert.equal(session.getItem(UPDATED_FROM_KEY), '2.0.1');
});

test('the first install taking control does not reload, but a later update does', () => {
  const { sw, reloads } = setup({ controlled: false });
  sw.fire('controllerchange');
  assert.equal(reloads.count, 0);
  sw.fire('controllerchange');
  assert.equal(reloads.count, 1);
});

test('an update while typing waits until the app is hidden', () => {
  const { sw, doc, reloads } = setup({ active: { tagName: 'TEXTAREA' } });
  sw.fire('controllerchange');
  assert.equal(reloads.count, 0);
  doc.visibilityState = 'hidden';
  doc.fire('visibilitychange');
  assert.equal(reloads.count, 1);
});

test('coming back to the screen checks for a new version', async () => {
  const { doc, updates, reloads } = setup();
  doc.fire('visibilitychange');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(updates.count, 1);
  assert.equal(reloads.count, 0);
});

test('isEditing is true for text fields and editable content only', () => {
  assert.equal(isEditing({ tagName: 'INPUT' }), true);
  assert.equal(isEditing({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isEditing({ tagName: 'BUTTON' }), false);
  assert.equal(isEditing(null), false);
});

test('announceUpdate shows the toast once, and only when the version changed', () => {
  const session = memoryStorage();
  const shown = [];
  session.setItem(UPDATED_FROM_KEY, '2.0.0');
  announceUpdate(session, '2.0.1', message => shown.push(message));
  announceUpdate(session, '2.0.1', message => shown.push(message));
  assert.deepEqual(shown, ['Updated to version 2.0.1']);

  session.setItem(UPDATED_FROM_KEY, '2.0.1');
  announceUpdate(session, '2.0.1', message => shown.push(message));
  assert.equal(shown.length, 1);
  assert.equal(session.getItem(UPDATED_FROM_KEY), null);
});
