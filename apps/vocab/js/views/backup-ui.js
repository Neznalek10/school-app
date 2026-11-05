import { store } from '../store.js';
import { BACKUP_KEYS, MAX_BACKUP_BYTES, buildBackup, backupFileName, parseBackup, backupSummary, restoredName } from '../backup.js';
import { html, plural } from '../ui.js';

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function downloadBackup(app, now = new Date()) {
  const source = Object.fromEntries(BACKUP_KEYS.map(key => [key, store[key]]));
  const file = buildBackup(source, { name: store.account.name, version: app.version, now });
  download(backupFileName(store.account.name, now), JSON.stringify(file));
  store.settings.lastBackup = now.getTime();
  store.save('settings');
  app.toast('Backup saved to your downloads.', { kind: 'success' });
}

// Turns the text of a backup file into a new profile, after showing what is in it.
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
  const ok = await app.confirm({
    title: 'Restore this backup?',
    text: `It becomes a new profile called "${name}" with ${plural(s.decks, 'deck')}, ${plural(s.words, 'word')} and ${plural(s.answers, 'answer')}. Your other profiles stay as they are.`,
    confirmLabel: 'Restore',
  });
  if (!ok) return false;
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
