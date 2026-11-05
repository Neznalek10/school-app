# Architecture

This document describes how the school app is built as of version 2.0.0. Read the README first for what the app does and how to run it.

## 1. Overview

The app is a set of static files (HTML, ES modules, CSS) that runs in the browser with no build step. A small Python server on the same computer serves those files and keeps one data file in sync with the browser.

```
 Browser, http://127.0.0.1:8767/                        Python, serve.py (standard library)
 +-------------------------------------------------+    +------------------------------------+
 | index.html, apps/french, apps/vocab             |    | server/app.py     routes, static   |
 |   js/sync/page.js        starts the engine      |    | server/guard.py   Host, Origin,    |
 |   js/sync/engine.js      revisions, debounce,   | /api |                  static allowlist |
 |                          conflicts, keys        |<-->| server/datastore.py  data file,    |
 |   js/sync/snapshot.js    localStorage <-> entries|JSON|                  revisions, lock  |
 |                          redact and fill keys   |    | server/envfile.py    .env (AI key) |
 |   js/sync/client.js      fetch wrapper for /api |    +----------------+-------------------+
 |                                                 |                     |
 |   app code (store.js, apps' stores) uses        |    data/school-data.json   (tracked)
 |   localStorage exactly as before                |    data/conflicts/*.json   (tracked)
 |   js/setup.js, views/setup.js, chat apply card  |    .env                    (git-ignored)
 +-------------------------------------------------+
```

Two rules shape everything else:

- The app code never talks to the server. It reads and writes `localStorage` as it always did. The sync layer watches those writes.
- The server never talks to the AI provider. The browser calls the AI service directly with the key it got from `.env`.

## 2. Components

### Server (Python, `server/` and `serve.py`)

| File | Responsibility |
|---|---|
| `serve.py` | Command-line entry point. Parses options, refuses non-loopback addresses, starts the server, prints the URL and data file path, stops cleanly on Ctrl+C. |
| `server/app.py` | HTTP layer. The request handler runs the guard checks, routes `/api/...` to `SchoolApi`, and serves static files. `create_server` builds the server. Enforces the 25 MB body limit and the response headers. |
| `server/guard.py` | Pure request checks: Host header (DNS rebinding defence), Origin and JSON content type for writes, and the static file allowlist, including symlink resolution. |
| `server/datastore.py` | The data file. Loads and validates it, saves it atomically behind a revision check, writes conflict copies. Holds the rules for which keys are allowed and that no AI key may be stored. |
| `server/envfile.py` | Reads and writes the allowlisted `.env` keys (today only `AI_API_KEY`). Keeps unrelated lines, creates the file with mode 0600. |

### Browser sync (`js/sync/`)

| File | Responsibility |
|---|---|
| `page.js` | The only sync file that touches `window`, `localStorage` and `sessionStorage`. Starts the engine on every page and swallows all errors, so sync can never break a page. |
| `engine.js` | The state machine: startup reconciliation, the storage hooks, the debounce, pushes, conflicts, key capture and fill, and the shared `syncState` that Account reads. |
| `snapshot.js` | Pure helpers. Decides which keys are tracked, converts each stored string to a JSON value and back byte for byte, redacts and fills AI keys, builds the canonical text and hash used for comparisons. |
| `client.js` | Fetch wrapper for `/api`: timeouts, JSON bodies, and typed errors (`SyncHttpError`, `ConflictError`). |

### App code

| File | Responsibility |
|---|---|
| `js/store.js` | Account store. Saves per-account data under `school.` keys in `localStorage`. |
| `js/subjects.js` | Default subjects (Languages only), starter kits (`KITS`), `subjectFromKit`, `hasTool`, the preset assistants. |
| `js/setup.js` | Subject setup: the interview prompt, `parseSetup`, `applySetup`, `setupSummary`. Imports no store, to avoid an import cycle. |
| `js/views/setup.js`, `js/views/setup-apply.js` | The setup page and the shared "apply a setup" step used by the chat card and the setup page. |
| `js/views/chat.js` | Chat. Shows an "Apply to <subject>" card under a setup proposal. |
| `js/ai.js`, `js/study.js` | AI client (OpenRouter, Ollama, LM Studio), system and copy-paste prompts, subject profile, lesson templates. |
| `js/views/account.js` | Account page: AI settings, the Storage card (mode, last save, "Save now"), "Forget key". |
| `js/apps.js` | Registry of the embedded apps (French and English): path, storage prefix, language. |
| `apps/french`, `apps/vocab` | The two language apps. Each has its own store and prefix, and loads `js/sync/page.js` with one script tag. |

### Other

| Path | Responsibility |
|---|---|
| `sw.js` (dashboard and apps) | Offline cache. Never caches `/api/`. |
| `tools/test.sh` | Runs both test suites. |
| `tools/make-public.sh` | Builds the public branch and the public folder. |
| `.github/workflows/tests.yml` | Runs the tests on push and pull request in the public copy. |
| `tests/`, `tests/js/` | Python and JavaScript tests. |

## 3. Main use case: a change is saved

The most common path is a student editing something (a note, a subject, a lesson) in the dashboard or in a language app. Here is what happens, from the first keystroke to the file on disk. File and function names refer to the current code.

1. **The app writes its data.** A view calls the store, which calls `localStorage.setItem` with a key such as `school.<account>.subjects`. Nothing in the app knows about sync.
2. **The hook sees the write.** The engine replaces `setItem`, `removeItem` and `clear` on the `Storage` prototype (`installStorageHooks`). Each wrapper runs the original call and then `noteStorageWrite`. That function ignores untracked keys and writes of the same text again. For a real change it sets `dirty`, bumps the change counter and writes the bookkeeping record `school-sync.meta`. Then it restarts the 1.5 second debounce timer.
3. **The save is triggered.** When the timer fires, or when the page becomes hidden (`visibilitychange`), `pushNow` queues one `pushOnce` behind any save already running.
4. **The browser prepares the entries.** `pushOnce` calls `takeSnapshot`, which reads every tracked key and turns each string into a JSON value (`encodeValue`: parsed when the JSON round-trips exactly, otherwise `{"$raw": text}`). `redactSecrets` then blanks every AI key and replaces lone surrogates.
5. **The key goes to `.env` first.** If the trusted key found in the entries differs from the one the engine knows, `captureKey` calls `PUT /api/keys` before anything else. The data file is never written with the key in it.
6. **Unchanged content is skipped.** The canonical text of the entries is compared with the text of the last successful push. If they are equal, the save stops here.
7. **The request is sent.** `client.putData({ baseRevision, entries })` sends `PUT /api/data` with `Content-Type: application/json`, timed out after 5 seconds.
8. **The server checks the request.** `ThreadingHTTPServer` gives the request to `SchoolHandler._dispatch`, then `_route`:
   - `is_allowed_host` refuses any Host other than `127.0.0.1`, `localhost` or `[::1]` with the server's port (403).
   - For writes, `is_json_request` and `is_allowed_origin` refuse non-JSON bodies and foreign Origins (403).
   - `_read_json_body` requires a `Content-Length` of at most 25 MB and parses the JSON (411, 413 or 400 otherwise).
9. **The payload is validated.** `SchoolApi.put_data` checks that `baseRevision` is an integer, then `validate_entries` checks every key (tracked prefix, at most 200 characters, no control characters), every value (plain JSON, finite numbers, bounded depth, no non-empty AI key, `$raw` text scanned too). A bad payload is a 400.
10. **The revision is checked and the file is written.** `DataStore.save` takes a lock, loads the stored file and compares its revision with `baseRevision`. If they differ it raises `RevisionConflict`, which becomes a 409 carrying the current revision. If they match, it writes `school-data.json.tmp`, flushes it to disk, and moves it into place with `os.replace`. The new revision is the old one plus 1.
11. **The browser records the result.** On a 200 response, `markSynced` stores the new revision, the canonical text of what was saved, and its hash in `school-sync.meta`. Changes that arrived during the request keep `dirty` set and schedule another save. The state object updates, so the Storage card in Account shows the new "last saved" time.

If step 10 finds a stale revision, the browser takes the conflict path in section 5. If the request fails for another reason (network down, timeout, server error), `syncState.error` is set and `dirty` stays on. The next change, a visibility change, or "Save now" retries.

## 4. Starting the app

Every page runs the same startup, `startSync` in `engine.js`. It is non-blocking: the app renders while sync runs.

1. `GET /api/status` with a 2.5 second limit. If there is no answer, or the answer is not from file mode, the page is in **browser mode**. Nothing is patched, and Account says so. A 5xx from this server (for example a damaged data file) also disables saving until the next start, and shows the message.
2. In file mode, the engine reads the key from `GET /api/keys`, and the data file from `GET /api/data` (if the file exists).
3. It compares the file's revision with the revision stored in the browser's `school-sync.meta`. The outcomes are in section 5.
4. Once reconciled, it installs the storage hooks and page listeners. If keys were filled from `.env`, the page reloads once. A session flag (`school-sync.filled`) stops that from repeating.

## 5. Sync protocol

### Revisions

- The data file has an integer `revision`, starting at 1 for the first save. Each successful save adds 1.
- A save sends `baseRevision`, the revision the browser last saw. The server accepts the save only if it equals the stored revision. Otherwise it answers 409 and the browser must reconcile.
- A browser with no data file yet sends `baseRevision` 0. The first save creates the file, so existing browser data is migrated this way.
- There is no merge. The last saved revision wins, and the losing side is kept, not dropped.

### Meta record and hash

- `school-sync.meta` (in `localStorage`, never tracked) holds `{ revision, dirty, hash }`.
- `revision` is the file revision this browser last synced with, `dirty` says there are unsaved changes, and `hash` is `contentHash` (FNV-1a, 8 hex digits) of the canonical redacted content at the last successful sync.
- The hash exists because edits made while no server ran do not set `dirty` (no hooks were installed). At the next start, a mismatch between the hash and the current content shows that edits were made in the meantime.

### Startup decisions

The browser compares both sides with `hash`, the fingerprint of the content it last synced. Revisions only matter for the save itself.

| Situation | Action |
|---|---|
| No data file on the server | Push now with `baseRevision` 0. This migrates the browser data. |
| File and browser hold the same content | Adopt the file's revision. Nothing is sent. |
| File unchanged since the last sync (its hash equals `hash`), browser changed | The browser is ahead. Push on top of the file's revision. |
| File changed, browser unchanged | Restore the file's data and reload once. |
| Both changed, or no `hash` and the browser has data | Save the browser's data to `data/conflicts/`, then restore the file's data and reload once. |
| Push rejected with 409 | Fetch the file. Equal contents: adopt the revision. File written by this browser (another page or tab of it, or this tab's last keepalive save): push again on top of it, once. Otherwise: conflict copy, restore and reload. |

- **Reload-loop guard.** The session flag `school-sync.restored` holds the hash of the content last restored. Restoring the same content twice in one session stops with "The data file could not be applied", while a newer file is restored as usual.
- **Conflict notice.** After a conflict copy the session flag `school-sync.conflict` is set. The dashboard shows one message that the older changes were saved in `data/conflicts/`, then clears it.
- **Writes during startup.** The storage hooks are installed before reconcile. While it runs they only count changes, and a change counted then is saved right after.

### Conflict copies

- A conflict copy is `data/conflicts/conflict-<YYYYMMDDTHHMMSSZ>.json`. If that name exists, the server adds `-2`, `-3` and so on, so nothing is overwritten.
- Each copy holds `app`, `format`, `reason` (at most 300 characters), `savedAt` and the entries. The reason says whether the copy came from startup or from a rejected save.

### Key redaction and fill

- **Redaction (browser to file).** `redactSecrets` finds every AI config object: a plain object with a string `key` and a string `url` or `model`. It blanks `key` in the copy that goes to the server. Keys found in the `school.` entries are listed first. Only keys in configs that are allowed to receive the `.env` key (no `url`, or an https URL on `openrouter.ai` or one of its subdomains) are trusted and saved to `.env`. A key for another provider is removed from the data file and never sent anywhere.
- **Second guard (server).** `validate_entries` refuses any entry that still holds a non-empty AI key (400). It also checks `$raw` text, so a key cannot hide in an unparsed string.
- **Fill (file to browser).** `fillSecrets` writes the `.env` key into AI configs that have an empty `key` and are allowed (see above). It runs after every restore and at startup. At startup `.env` wins: an allowed config holding a different key gets the `.env` key, so an old key in one browser cannot overwrite a newer one. Values stored as `$raw` text are skipped.
- **Typed keys.** A key typed in the dashboard or the French app is saved to `.env` when it differs from the `.env` key, and every allowed config then gets it. Keys for other providers stay in this browser: a restore puts them back into the config with the same address.
- **Forget key.** After a confirmation, `forgetKey` removes the key from `.env` and blanks it in the allowed AI settings. Keys for other providers are kept. It does not count as a data change.

## 6. Data model and storage

### localStorage (browser)

| Key | Contents | In the data file |
|---|---|---|
| `school.*` | Dashboard data: accounts, subjects, notes, events, chats, settings. Per-account keys include the account id. | Yes |
| `school-fr.*` | French app data (its prefix). | Yes |
| `vocab2.*` | English app data (its prefix). | Yes |
| `school-sync.meta` | Sync bookkeeping: revision, dirty flag, hash. | No |
| `school-sync.filled` (sessionStorage) | Set once per tab after keys were filled, to stop reload loops. | No |

Tracked prefixes are defined twice, in `js/sync/snapshot.js` (`TRACKED_PREFIXES`) and in `server/datastore.py`. They must match. Keys outside them (other sites, the service worker cache) are never touched.

Files uploaded in Sources are stored in IndexedDB (`school-files`, up to 25 MB each). They are not in the data file.

### The data file

`data/school-data.json` is UTF-8 JSON, written with `indent=1`, sorted keys and a final newline. It is readable and gives line-level git diffs.

```json
{
 "app": "school-app",
 "entries": {
  "school.<account>.subjects": [
   {
    "id": "s1",
    "name": "Mathematics"
   }
  ],
  "school-fr.progress": {
   "$raw": "not valid JSON text stored as it was"
  }
 },
 "format": 1,
 "revision": 7,
 "savedAt": "2026-11-03T10:00:00Z"
}
```

- `format` is 1. A file with another app name or format is refused.
- `entries` maps each localStorage key to its parsed JSON value. A string that is not valid JSON is kept as `{"$raw": "<text>"}`.
- No entry has a non-empty AI key.
- Writes go to `school-data.json.tmp` in the same folder and then `os.replace` moves the file into place. A crash cannot leave a half-written data file.

### .env

- Only the names in `ENV_KEYS` can be read or written. Today that is `AI_API_KEY`.
- A value is one line, without control characters, at most 400 characters. An empty value removes the line.
- The file is created with mode 0600, and the mode is tightened on every write.
- Values are never logged or put in error messages.

### Backups

The dashboard's own backup (`js/backup.js`) is a separate JSON export of one account. Export blanks the AI key and leaves out `lastBackup`. Restore never takes AI settings from the file, so a file cannot change the AI address or key. It also keeps only http or https links and records that are objects with an id. The sync layer does not handle backups.

## 7. Security boundaries

- **Loopback only.** The server binds `127.0.0.1` by default. `serve.py` refuses other addresses. There is no option to expose it.
- **Host check.** Every request must name `127.0.0.1`, `localhost` or `[::1]` with the server's own port. This stops DNS rebinding.
- **Writes.** PUT and POST need `Content-Type: application/json`, and an Origin that is absent or equal to `http://<Host>`. A cross-site form cannot send these.
- **Static files.** Only an allowlist is served: the root files `index.html`, `manifest.json`, `version.js` and `sw.js`, and files with allowed extensions below `css`, `js`, `icons` and `apps`. Dotfiles and the folders `tools`, `docs`, `tests`, `data`, `venv`, `server`, `node_modules` and `__pycache__` are never served. Markdown is served only for the French app's prompt files under `apps/**/prompts/`. Symlinks are resolved and must stay inside the project.
- **Headers.** Static responses send a Content-Security-Policy (`default-src 'self'`, no inline scripts, `connect-src` limited to https and loopback), `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. API responses send `Cache-Control: no-store`.
- **Keys.** The AI key is sent only over https or to localhost, and only into AI settings that point at `openrouter.ai`. Provider error text is cleaned of anything that looks like a key.
- **Uploads.** Uploaded files open in the browser only for safe types (images, PDF, plain text). Everything else downloads.
- **Public copy.** The build refuses to finish if the public files contain the git user name or email, or a word from the private list.

## 8. Key design decisions

- **Sync at the `localStorage` level, with patched Storage methods.** This covers the dashboard and both embedded apps with no changes to their stores. Rejected: a save hook in each app, because the forks would drift further apart.
- **A non-blocking sync script.** Each page loads `js/sync/page.js` as a module that does not block the app. A missing or failing server never stops an app from loading. Rejected: a boot loader that waits for the server, because one failed fetch would block every app.
- **A local Python server with the standard library and `python-dotenv`.** A browser cannot write `.env` or a file on disk in Firefox, and Python is the owner's tool language. Rejected: the File System Access API (no Firefox support), Flask (an extra dependency for seven routes), and Node (not installed).
- **Optimistic concurrency with an integer revision.** Simple, and safe against a stale tab and a second computer. Rejected: merging entries, because per-key merges would mix states of the same app.
- **Parsed JSON values in the data file, pretty-printed with sorted keys.** Readable line-level git diffs. Rejected: raw strings, because each change would rewrite one long line.
- **The key is returned to the same-origin page.** The existing AI client calls the provider from the browser. The server stays loopback-only with Host checks and no CORS. Rejected: proxying AI calls, which would rewrite the AI client for no gain in a single-user local tool.
- **The public copy is built with a temporary index and a `public` branch.** No files are deleted on disk, the history is kept, and the public folder cannot contain data by construction. Rejected: `rsync --delete` into a folder, which deletes files and loses history.
- **Starter kits replace the old default subjects.** The Chemistry naming tool is now a subject tool (`subject.tools`). `LEGACY_TOOLS` keeps it for existing Chemistry subjects that have no `tools` list.
- **The engine never sends a change it has not reconciled.** If startup fails after the status check, the engine installs no hooks and no pushes happen until the next start, so an unreconciled revision is never written.

## 9. Known limits

- No real-time sync between two computers running at the same time. The last saved revision wins, and the other copy is kept in `data/conflicts/`.
- Silent `localStorage` write failures are not reported.
- Two tabs in one browser can still overwrite each other inside that browser.
- Files in Sources (IndexedDB) stay in the browser and are not part of the data file.
- The Node path of the JavaScript tests is not exercised in CI (CI uses `gjs`).

## 10. How to extend the app

Run `tools/test.sh` after every change. Bump `version.js` on every push users should see (it also renames the offline cache).

| To add | Where it goes | Also update |
|---|---|---|
| A starter kit | `KITS` in `js/subjects.js` (name, icon, colour, plan template, optional `tools` and `lessons`) | Tests in `tests/js/subjects.test.mjs`. |
| A lesson template | `TEMPLATES` in `js/study.js`. It appears in the setup prompt automatically. | The prompt wording in `source`, and the setup tests. |
| A built-in tool (like Názvosloví) | Gate it with `hasTool(subject, '<tool>')` in the view. | Add it to `SETUP_TOOLS` in `js/setup.js` so a setup can switch it on. |
| A built-in lesson | Add it with `addBuiltInLesson` in `js/soustavy.js`. | Add its id to `SETUP_LESSONS` in `js/setup.js`, and to the kit if a kit should add it. |
| A preset assistant | `PRESETS` in `js/subjects.js`. | Do not reuse an id in `RESERVED_IDS` in `js/setup.js`. |
| A new embedded app | `apps/<name>/`, an entry in `APPS` in `js/apps.js`, the subject's `apps` list, and `js/sync/page.js` as a script tag in its `index.html`. | Its storage prefix in `TRACKED_PREFIXES` in both `js/sync/snapshot.js` and `server/datastore.py`, its files in the service worker's list, and its `/api/` bypass in its `sw.js`. |
| A new tracked data prefix | The same two `TRACKED_PREFIXES` lists. | The tests in `tests/` that cover the prefixes. |
| A new `.env` key | `ENV_KEYS` in `server/envfile.py`. | A line in `.env.example`, and sync code for it. Only the AI key has fill and redaction rules today. |
| A new API route | `SchoolApi.routes` in `server/app.py` and a method. | The client method in `js/sync/client.js`, and tests in `tests/test_app.py` and `tests/js/client.test.mjs`. Keep the guard rules. |
| A new static folder or file type | `STATIC_DIRS`, `STATIC_EXTENSIONS` or `STATIC_FILES` in `server/guard.py`. | Check `DENIED_SEGMENTS` still covers private folders. Tests in `tests/test_guard.py`. |
| A new AI host allowed to receive the key | `TRUSTED_KEY_HOSTS` in `js/sync/snapshot.js`. | Only add hosts you trust with the key. |
| A new AI provider | The client in `js/ai.js`. | The Account presets and the key rule in section 5. |

Where the code and this document differ, the code is correct. Update this file when a contract changes.
