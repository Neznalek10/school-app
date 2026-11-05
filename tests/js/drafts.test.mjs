/**
 * Tests for js/drafts.js: a draft is kept only when something changed, comes back when the form opens
 * again, can be discarded, and is gone after clear(). The DOM is a small fake with the parts the module uses.
 */
import { test, assert } from './harness.mjs';
import { bindDraft, clearDraft } from '../../js/drafts.js';

/** An in-memory Storage. */
function memoryStorage() {
  const items = new Map();
  return {
    getItem: k => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => items.set(k, String(v)),
    removeItem: k => items.delete(k),
    size: () => items.size,
  };
}

/** A fake element with event listeners. */
function target(extra = {}) {
  const listeners = {};
  return {
    ...extra,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    dispatchEvent(e) { (listeners[e.type] || []).forEach(fn => fn(e)); },
  };
}

/** A fake form holding text fields with these starting values. */
function fakeForm(values) {
  const fields = Object.entries(values).map(([name, value]) => target({ name, value, type: 'text' }));
  const form = target({
    isConnected: true,
    prepended: [],
    querySelectorAll: () => fields,
    prepend(el) { this.prepended.push(el); },
  });
  return { form, field: name => fields.find(f => f.name === name) };
}

/** Minimal globals the module touches: document (note element, visibility) and Event. */
globalThis.Event ??= class { constructor(type) { this.type = type; } };
globalThis.document ??= {
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ className: '', innerHTML: '', querySelector: () => target(), remove() {} }),
};

test('an unchanged form leaves no draft', () => {
  const storage = memoryStorage();
  const { form } = fakeForm({ title: 'Test' });
  bindDraft(form, 'event:new:s1', { storage });
  form.dispatchEvent(new Event('input'));
  assert.equal(storage.size(), 0);
});

test('typed text comes back when the form opens again, with a Discard note', async () => {
  const storage = memoryStorage();
  const first = fakeForm({ title: '' });
  bindDraft(first.form, 'event:new:s1', { storage });
  first.field('title').value = 'Test: cells';
  first.form.dispatchEvent(new Event('input'));
  await new Promise(resolve => setTimeout(resolve, 350));
  const again = fakeForm({ title: '' });
  bindDraft(again.form, 'event:new:s1', { storage });
  assert.equal(again.field('title').value, 'Test: cells');
  assert.equal(again.form.prepended.length, 1);
});

test('a quiet draft restores without the note, and clear() removes it', async () => {
  const storage = memoryStorage();
  const first = fakeForm({ text: '' });
  bindDraft(first.form, 'chat:a', { storage, quiet: true });
  first.field('text').value = 'Explain osmosis';
  first.form.dispatchEvent(new Event('input'));
  await new Promise(resolve => setTimeout(resolve, 350));
  const again = fakeForm({ text: '' });
  const draft = bindDraft(again.form, 'chat:a', { storage, quiet: true });
  assert.equal(again.field('text').value, 'Explain osmosis');
  assert.equal(again.form.prepended.length, 0);
  draft.clear();
  assert.equal(storage.size(), 0);
});

test('clearDraft removes a saved draft by key', async () => {
  const storage = memoryStorage();
  const { form, field } = fakeForm({ name: '' });
  bindDraft(form, 'subject:new', { storage });
  field('name').value = 'Biology';
  form.dispatchEvent(new Event('input'));
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(storage.size(), 1);
  clearDraft('subject:new', storage);
  assert.equal(storage.size(), 0);
});
