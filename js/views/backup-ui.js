/**
 * Backup screens logic: download the current account as a file and restore a file as a new account.
 * Used by views/account.js and views/accounts.js; uses backup.js (format, validation) and store.js.
 */
import { store } from '../store.js';
import { BACKUP_KEYS, MAX_BACKUP_BYTES, buildBackup, backupFileName, parseBackup, restoredName } from '../backup.js';
import { plural } from '../ui.js';

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
 * Parses backup text, asks for confirmation and restores it as a new account.
 *
 * @param {object} app App shell (toast, confirm, signIn).
 * @param {string} text Contents of the chosen file.
 * @returns {Promise<boolean>} true when an account was restored.
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
  const { subjects = [], notes = [] } = backup.data;
  const ok = await app.confirm({
    title: 'Restore this backup?',
    text: `It becomes a new account called "${name}" with ${plural(subjects.length, 'subject')} and ${plural(notes.length, 'note')}. Your other accounts stay as they are.`,
    confirmLabel: 'Restore',
  });
  if (!ok) return false;
  // The file never carries AI settings; the new account reuses this account's own so the assistants keep working.
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
