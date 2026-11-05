/**
 * Drafts: whatever is typed into a form survives closing it, switching apps on the phone or reloading.
 *
 * Used by every sheet and editor with free text (events, sources, subjects, assistants, chat, setup, lessons,
 * tasks). Drafts live in localStorage under `school-draft.<account>.<key>`, outside the synced `school.`
 * prefix: they belong to this device and are dropped after DRAFT_DAYS. A draft is written only once a field
 * differs from what the form opened with, so opening and closing a form leaves nothing behind.
 */
import { store } from './store.js';
import { html } from './ui.js';

const PREFIX = 'school-draft.';
const DRAFT_DAYS = 30;
const SAVE_DELAY_MS = 300;
/** Fields that are never stored: files can't be, and passwords or keys must not be. */
const SKIPPED_TYPES = new Set(['file', 'password', 'hidden', 'submit', 'button', 'checkbox', 'radio']);

const storageKey = key => `${PREFIX}${store.account?.id || 'none'}.${key}`;

function readDraft(key, storage) {
  try {
    const saved = JSON.parse(storage.getItem(storageKey(key)));
    if (!saved || typeof saved.values !== 'object' || Date.now() - saved.at > DRAFT_DAYS * 864e5) return null;
    return saved.values;
  } catch {
    return null;
  }
}

/**
 * Removes a draft, for example after the form was saved somewhere else.
 *
 * @param {string} key The draft's key, as given to bindDraft.
 * @param {Storage} [storage] localStorage, replaced in tests.
 * @returns {void}
 */
export function clearDraft(key, storage = globalThis.localStorage) {
  try { storage.removeItem(storageKey(key)); } catch { /* storage unavailable: nothing was saved */ }
}

/**
 * Keeps the named fields inside `root` as a draft and restores it when the same form opens again.
 * When a draft was restored, a "Draft restored · Discard" note is added at the top of `root`.
 *
 * @param {Element} root The form, or any element holding the fields.
 * @param {string} key What the form edits, for example "event:new:<subject id>" or "source:<id>".
 * @param {{quiet?: boolean, storage?: Storage}} [options] `quiet` restores without the note (for a chat box);
 *   `storage` replaces localStorage in tests.
 * @returns {{clear: () => void}} Call clear() once the form's content was saved.
 */
export function bindDraft(root, key, { quiet = false, storage = globalThis.localStorage } = {}) {
  const fields = [...root.querySelectorAll('input[name], textarea[name], select[name]')].filter(f => !SKIPPED_TYPES.has(f.type));
  const initial = new Map(fields.map(f => [f, f.value]));
  let timer = 0;
  let cleared = false;

  const save = () => {
    if (cleared) return;
    const changed = fields.some(f => f.value !== initial.get(f));
    try {
      if (!changed) storage.removeItem(storageKey(key));
      else storage.setItem(storageKey(key), JSON.stringify({ at: Date.now(), values: Object.fromEntries(fields.map(f => [f.name, f.value])) }));
    } catch { /* storage full or blocked: the form still works, only the draft is lost */ }
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  };

  const restored = readDraft(key, storage);
  if (restored) {
    for (const f of fields) {
      if (typeof restored[f.name] !== 'string' || restored[f.name] === f.value) continue;
      f.value = restored[f.name];
      // Views listen for input (auto-growing boxes, live previews), so they see the restored text too.
      f.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (restored && !quiet) {
    const note = document.createElement('p');
    note.className = 'draft-note';
    note.innerHTML = html`<span>Draft restored</span><button type="button" class="btn btn-text btn-sm" data-discard-draft>Discard</button>`.s;
    note.querySelector('button').addEventListener('click', () => {
      for (const f of fields) {
        f.value = initial.get(f);
        f.dispatchEvent(new Event('input', { bubbles: true }));
      }
      clearDraft(key, storage);
      note.remove();
    });
    root.prepend(note);
  }

  root.addEventListener('input', later);
  root.addEventListener('change', later);
  // A phone may kill a hidden app without warning, so the last keystrokes are saved at once.
  const onHide = () => {
    if (!root.isConnected) document.removeEventListener('visibilitychange', onHide);
    else if (document.visibilityState === 'hidden') save();
  };
  document.addEventListener('visibilitychange', onHide);

  return {
    clear() {
      cleared = true;
      clearTimeout(timer);
      clearDraft(key, storage);
    },
  };
}
