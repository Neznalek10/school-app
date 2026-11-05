/**
 * Backup screens logic for the French app: download the current profile and restore a file as a new profile.
 *
 * Used by the profile picker and settings; uses backup.js (format, validation) and store.js. Invariant: a
 * restore never takes AI settings from the file, only from the current profile.
 */
import { store } from '../store.js';
import { BACKUP_KEYS, MAX_BACKUP_BYTES, buildBackup, backupFileName, parseBackup, backupSummary, restoredName } from '../backup.js';
import { html, plural } from '../ui.js';

export function downloadBackup(app, now = new Date()) {
  const source = Object.fromEntries(BACKUP_KEYS.map(key => [key, store[key]]));
  const file = buildBackup(source, { name: store.account.name, version: app.version, now });
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName(store.account.name, now);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  store.settings.lastBackup = now.getTime();
  store.save('settings');
  app.toast('Backup saved to your downloads.', { kind: 'success' });
}

/**
 * Turns the text of a backup file into a new profile, after showing what is in it.
 *
 * @param {object} app App shell (toast, confirm, signIn).
 * @param {string} text Contents of the chosen file.
 * @returns {Promise<boolean>} true when a profile was restored.
 */
export async function restoreFromText(app, text) {
  let backup;
  try {
    backup = parseBackup(text);
  } catch (e) {
    app.toast(e.message, { kind: 'error', duration: 7000 });
    return false;
  }
  const name = restoredName(backup.name, n => store.nameTaken(n));
  const s = backupSummary(backup.data);
  const sentence = [plural(s.words, 'word'), plural(s.lessons, 'lesson'), plural(s.texts, 'checked text')].join(', ');
  const ok = await app.confirm({
    title: 'Restore this backup?',
    text: `It becomes a new profile called "${name}" with ${sentence}. Your other profiles stay as they are.`,
    confirmLabel: 'Restore',
  });
  if (!ok) return false;
  // The file never carries AI settings; the new profile reuses this profile's own so the AI keeps working.
  if (store.account && store.settings.ai?.key) {
    backup.data.settings = { ...backup.data.settings, ai: { ...store.settings.ai } };
  }
  const account = store.restoreAccount(name, backup.data);
  app.toast(`Restored as ${name}.`, { kind: 'success' });
  app.signIn(account.id);
  return true;
}

export function pickBackupFile(app) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      app.toast('That file is too large to be a backup.', { kind: 'error' });
      return;
    }
    restoreFromText(app, await file.text());
  });
  input.click();
}

export const restoreButton = (cls = 'btn btn-text btn-block') => html`<button type="button" class="${cls}" data-restore>Restore from a backup file</button>`;
