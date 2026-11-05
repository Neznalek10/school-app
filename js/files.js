// Uploaded materials are too big for localStorage, so their contents live in IndexedDB; the list of sources keeps only the id.
const DB = 'school-files';
const STORE = 'files';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

let opening;
function db() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

async function run(mode, action) {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('The file could not be saved.'));
  });
}

export const putFile = (id, blob) => run('readwrite', s => s.put({ id, blob }));
export const getFile = id => run('readonly', s => s.get(id)).then(r => r?.blob || null);
export const deleteFile = id => run('readwrite', s => s.delete(id)).catch(() => {});

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`;
}
