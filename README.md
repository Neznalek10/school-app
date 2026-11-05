# School

A personal school hub for one student: subjects with notes, AI assistants, learning plans, a calendar and practice apps. Everything you build is saved in one readable JSON file, written by a small local Python server, so it can move between computers with git.

## Features

- **Starts with Languages.** A new account has one subject, Languages, which opens the French and English practice apps. Add, rename, recolour and delete subjects whenever you like. Existing accounts keep their subjects.
- **Starter kits.** The New subject sheet has an optional "Start from" row: Mathematics, Physics, Chemistry, Czech, History, ZSV, Biology, Geography and Computer science. A kit fills in the name, icon, colour and learning-plan template, and adds built-in tools or lessons: the Názvosloví trainer for Chemistry, the Číselné soustavy lesson for Computer science. Without a kit you get a plain subject.
- **"Set up this subject" interview.** Creating a subject opens its setup page (`#/setup/<subject id>`). The AI asks one question at a time about the course, main sources, how tests look, the teacher's style, what is hard, your goals and your answer language. It ends with one setup proposal, which you apply to write the **subject profile**, the learning-plan template and extra instructions, up to four custom assistants, and any built-in tools or lessons. Every assistant, copy-paste prompt and lesson prompt then uses the profile.
  - In the app: "Interview in the app" opens the chat. The proposal gets an "Apply to <subject>" card.
  - Without the server or an API key: "Use ChatGPT or Gemini" copies the prompt, you paste the final answer back, check the preview, and apply.
- **Subject page.** Tabs for Calendar, Notes, Sources, Practice and AI. A subject reopens on the tab you used last.
- **Calendar.** A month grid per subject, weeks start on Monday. Events are tests, deadlines or other events, with an optional time and note. Home lists what is coming up in the next 30 days.
- **Tests and homework.** A table of everything due across subjects, filtered to To do, Done or All. Each item has its own page with a description, attached study material, a done flag and, for tests, a grade. Homework past its date stays in To do as overdue.
- **Lessons from learning plans.** Each subject has a plan that turns a presentation into a lesson: copy the prompt, give it to ChatGPT or Gemini with the presentation, paste the JSON answer back. The parser repairs common chat mistakes such as code fences, trailing commas and curly quotes. Templates cover history, general subjects, highlighted Word documents (ZSV), literature (Czech), research (Biology, Geography), and maths and physics with worked exercises.
- **Exercises.** Maths and physics lessons include numbered exercises, from level 1 to 3. Type the result: the app compares values, allows a rounding tolerance and checks units. Hints and solutions open only on request.
- **Názvosloví.** A Czech inorganic nomenclature and elements trainer, modelled on nazvoslovi.cz. It covers 1,382 compounds and all 118 elements, has tests for name and formula, and includes theory pages. Chemistry subjects get it from their starter kit.
- **Czech calendar.** Month views mark public holidays, school breaks and important days, using the MŠMT school-year dates. Each part can be switched off in Account.
- **Sources.** Websites (http and https only), uploaded files and references. Uploaded files are kept in the browser (IndexedDB), not in the data file.
- **Practice.** The subject's practice apps, quick links to AI quiz and checking, and a reminder when a test is within 30 days.
- **Copy-paste prompts.** Every assistant and the lesson prompt can be copied as one ready message for ChatGPT, Gemini or Claude, with the notes you choose. No API key needed.
- **Notes.** A light Markdown subset (headings, bullets, bold, italic, code). Notes save automatically.
- **AI assistants.** Five presets per subject (Tutor, Quiz me, Study sheet, Research, Check my work), plus your own. You choose what an assistant may read: all notes, one note, or none. The default AI service is OpenRouter (`openrouter/free`). Ollama is also supported. Settings live in Account.
- **One data file.** Progress from the dashboard and both language apps is saved to `data/school-data.json` within about 1.5 seconds of a change, and when the page is hidden. A stale tab cannot overwrite newer data. Data that loses a conflict is kept in `data/conflicts/`.
- **Browser-only mode.** Without the server (for example on GitHub Pages), the app works as before and keeps data in the browser. Account says which mode is active.

## Quick start

### Requirements

- Python 3.12 (the version the project is tested with). The server uses only the standard library plus `python-dotenv`.
- A current browser (Firefox, Chrome or Edge).
- Optional: `gjs` or `node`, only to run the JavaScript tests. Node is not needed to run the app.

### Install

From the project folder:

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
```

The second command installs `python-dotenv`. There is no build step.

### Run

```bash
venv/bin/python serve.py
```

Expected output:

```
School app: http://127.0.0.1:8767/
Data file: <project folder>/data/school-data.json
```

Open http://127.0.0.1:8767/ in your browser. Press Ctrl+C in the terminal to stop the server.

Use `127.0.0.1`, not `localhost`. Browsers keep separate storage for each address, and the old version of the app ran on `127.0.0.1:8767`, so your existing browser data is found there.

## Usage

### Command-line options

```bash
venv/bin/python serve.py --help
```

```
usage: serve.py [-h] [--port PORT] [--host HOST] [--open] [--verbose]

Run the school app locally and keep its data in data/school-data.json.

options:
  -h, --help   show this help message and exit
  --port PORT  port to listen on (default 8767)
  --host HOST  loopback address to bind (default 127.0.0.1, this computer
               only)
  --open       open the app in the default browser
  --verbose    log every request and internal detail to stderr
```

### First steps in the app

1. Open http://127.0.0.1:8767/ and create your account (a name).
2. You see one subject, Languages. Open **New subject** to add a subject. Pick a starter kit from "Start from", or leave it on None.
3. The setup page opens. Choose **Interview in the app** and answer the questions, or **Use ChatGPT or Gemini** to copy the prompt. Apply the proposal when the preview looks right.
4. To use the AI assistants, open **Account** and enter your OpenRouter key under the AI settings. The app writes it to `.env` and shows "Saved in .env on this computer". The key is never written to the data file.

### Check the server

```bash
curl -i http://127.0.0.1:8767/api/status
```

Example body, before the first save:

```json
{"app": "school-app", "version": "2.0.0", "mode": "file", "dataFile": "data/school-data.json", "exists": false, "revision": 0, "savedAt": null, "hasAiKey": false}
```

After the first save, `exists` is `true` and `revision` counts up with each save.

## Configuration

Settings come from three places: the `.env` file, command-line options and the app's Account page.

| Name | Where | Default | What it does |
|---|---|---|---|
| `AI_API_KEY` | `.env` | empty | OpenRouter API key for the AI assistants. The app writes it when you enter a key in Account. It is never stored in the data file. |
| `--port` | `serve.py` option | `8767` | Port to listen on. Keep the default so existing browser data is picked up. |
| `--host` | `serve.py` option | `127.0.0.1` | Address to bind. Only loopback addresses are accepted. Anything else exits with an error. |
| `--open` | `serve.py` option | off | Opens the app in the default browser at start. |
| `--verbose` | `serve.py` option | off | Logs every request. Request bodies and keys are never logged. |
| `PUBLIC_AUTHOR_NAME`, `PUBLIC_AUTHOR_EMAIL` | environment, read by `tools/make-public.sh` | `School app`, a no-reply address | Author of the commits on the public branch. |
| AI service, model, language | Account page | `https://openrouter.ai/api/v1`, `openrouter/free`, English | Where the AI requests go, which model answers, and the answer language. |

`.env` is git-ignored. To set the key by hand, copy `.env.example` to `.env` and fill in `AI_API_KEY`. Keep the file private: it is created with mode 0600.

"Forget key" in Account empties `.env` and the key fields in this browser. Another browser on the same computer that still holds the key saves it to `.env` again when it opens the app, so clear the key there too. Keys for other providers (not OpenRouter) stay in the browser where you typed them and are never written to `.env`.

## Running the tests

```bash
tools/test.sh
```

The script runs the Python unittest suite and then the JavaScript suite, under `gjs` (or `node` when `gjs` is missing). Both always run, and the script exits 1 if either fails. A passing run ends with `All tests passed.`

The tests use temporary folders and fake browser objects. They make no network calls.

## Project structure

```
school-app/
  serve.py              entry point: starts the local server
  server/               HTTP routes, request guard, data file, .env file
  js/                   app code (dashboard views, store, AI, prompts, setup)
    sync/               browser sync: engine, snapshot, client, page entry
  css/, icons/          styles and icons
  index.html, sw.js     dashboard and offline cache
  apps/french/          French practice app (embedded)
  apps/vocab/           English vocabulary app (embedded)
  tools/                test.sh, make-public.sh, content sync scripts
  tests/                Python tests (tests/) and JavaScript tests (tests/js/)
  docs/ARCHITECTURE.md  how the pieces fit together
  data/                 created by the server: school-data.json, conflicts/ (see below)
  .env                  your AI key (git-ignored, created by the app)
```

## How it works

- The app runs in the browser and keeps its data in `localStorage`, as before.
- `js/sync/` watches the keys of the dashboard and both language apps (`school.`, `school-fr.`, `vocab2.`). After about 1.5 seconds without changes, or when the page is hidden, it sends the data to the local server.
- The server checks each request, validates the data and writes `data/school-data.json` with a revision number. A save based on an old revision is refused, and the losing data goes to `data/conflicts/`.
- AI keys are moved to `.env` before any data is saved, so the data file never contains them.

For the components, the sync protocol and the data formats, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Moving to another computer

The data folder is tracked by git in the private repository this app is kept in. The public copy leaves it out.

1. Commit and push the project from the first computer, including `data/`.
2. Pull the repository on the second computer.
3. Copy `.env` by hand. It is git-ignored, so git does not carry it. Use a private channel, or enter the AI key again in Account.
4. Create the venv on the second computer (`python3 -m venv venv && venv/bin/pip install -r requirements.txt`). Do not copy `venv/`.
5. Run `venv/bin/python serve.py` and open http://127.0.0.1:8767/. The app restores the data and reloads once.

If you change data on two computers without syncing in between, the last saved revision wins. The other copy is kept in `data/conflicts/`. The app does not sync in real time.

## Publishing a public copy

```bash
tools/make-public.sh [target-dir]
```

The script builds a `public` branch from the current commit without `data/`, with a neutral author. It clones or updates the copy in `../school-app-public` by default, then prints the commands to push it. It refuses to finish if the public files contain your git user name or email, or any word listed in `tools/private-words.txt` (a git-ignored file, one word per line). Optionally, `tools/public-exclude.txt` lists more paths to leave out.

Nothing on disk is deleted by the script. The public copy includes a GitHub Actions workflow that runs the tests on each push.

## Troubleshooting

**"Port 8767 is in use" when starting `serve.py`.** Another program is using the port, often an earlier `serve.py` still running. Stop that process, or start with `venv/bin/python serve.py --port 8768`. Note that a different port means a different address, so the browser data kept under 8767 will not show up there.

**Account says "Saved in this browser only".** The page runs without the local server, for example from GitHub Pages or a plain static server. Start `venv/bin/python serve.py` and reload http://127.0.0.1:8767/. Data already in the browser is written to the data file on the first start.

**The app says "The stored data file is damaged".** `data/school-data.json` is not valid, most often because a git merge left conflict markers in it. Open the file in an editor and keep one version, or move the file out of the folder. Then restart `serve.py`. Until you restart, the app does not save. If you moved the file out, the next start saves the browser's data as a new file.

**Changes are missing after you used another computer or tab.** The save was refused because the file was newer. Your local copy was kept in `data/conflicts/conflict-<time>.json`, with a `reason` line saying why. The app does not import these files. To recover something, open the file and copy the entries you need into `data/school-data.json` by hand, then restart the server.
