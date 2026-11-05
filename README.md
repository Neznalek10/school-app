# School-app

A study hub for one student: your subjects, notes, tests and homework, AI assistants that know how your class works, and practice apps for languages, chemistry naming and maths. Everything runs on your own computer. Your progress is saved in one readable file that you can back up or move to another computer with git.

It was built for a Czech secondary school (gymnázium). The interface is in English. Some tools and prompts are Czech-specific: the Czech chemistry naming trainer (Názvosloví), the Czech literature plan, the ZSV plan and the MŠMT school-year calendar. Everything else works for any school.

## Contents

- [What it does](#what-it-does)
- [Two ways to use it](#two-ways-to-use-it)
- [Installation](#installation)
- [Starting the app](#starting-the-app)
- [First steps](#first-steps)
- [Setting up the AI](#setting-up-the-ai)
- [Your data](#your-data)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [For developers](#for-developers)

## What it does

**Subjects you build yourself.** A new account starts with one subject, Languages, which opens a French course and an English vocabulary trainer. You add the rest. The New subject sheet offers optional starter kits (Mathematics, Physics, Chemistry, Czech, History, ZSV, Biology, Geography, Computer science) that fill in the icon, colour, study plan and built-in tools. You can also start from an empty subject.

**An AI interview that personalises each subject.** Every subject has a "Set up this subject" assistant. It asks one question at a time: what the course covers, your main sources, what tests look like, how your teacher grades, what you find hard and what you want to reach. It ends with a setup proposal. You check a preview, apply it, and from then on every assistant, prompt and lesson for that subject uses this profile. You can run the interview inside the app or copy it into ChatGPT or Gemini.

**Everything a subject needs, in one page.**
- **Calendar** with tests, homework and events, plus Czech public holidays, school breaks and important days.
- **Tests and homework** table across all subjects, with a page per item for the description, study material and grade.
- **Notes** in light Markdown, saved automatically.
- **Sources**: websites, uploaded files (PDF, images, text) and book references.
- **Lessons**: give a presentation, a worksheet or textbook pages to an AI with the subject's prompt, paste the answer back, and get notes, a timeline, key terms, questions and flashcards. Maths and physics lessons become exercises with checked answers, hints and step-by-step solutions on request.
- **AI assistants**: Tutor, Quiz me, Study sheet, Research and Check my work, plus your own. Each one can read all your notes for the subject, one note, or none.

**Practice apps.**
- French course with lessons, vocabulary and conjugation drills, in Czech or English (Settings › I speak).
- English vocabulary trainer for any word list you import (CSV, JSON or pasted text).
- Názvosloví: 1,382 Czech inorganic compounds and all 118 elements, with theory pages and a periodic table.
- Číselné soustavy: number system conversions with generated exercises (Computer science kit).

**Works without an AI key.** Every assistant and lesson prompt can be copied as one ready message for ChatGPT, Gemini or Claude, with your notes included.

**Private by design.** The app only answers requests from your own computer. AI keys are kept in a `.env` file, never in the data file. Nothing is sent anywhere except to the AI service you choose.

## Two ways to use it

| | Online (GitHub Pages) | On your computer |
|---|---|---|
| Install | Nothing, open a link | Python 3.12 and two commands |
| Where progress is saved | In that browser only | In `data/school-data.json`, plus the browser |
| Move to another computer | Back up and restore a file by hand | Copy the folder, or use git |
| AI key | Typed once per browser | Saved in `.env`, filled in for you |

**Online.** If the repository owner has turned on GitHub Pages, open `https://<account>.github.io/school-app/` (replace `<account>` with the GitHub account name). The app runs fully in your browser. Account › Storage says "Saved in this browser only". Use Account › Back up now and then, because clearing the browser's site data deletes your progress. To host your own copy, push it to GitHub and set Settings › Pages › Source to **GitHub Actions**; `.github/workflows/pages.yml` publishes every push to `main`.

**On your computer.** Follow the installation below. This is the full version: progress is written to a file within about two seconds of every change.

## Installation

### Requirements

- **Python 3.12** ([python.org](https://www.python.org/downloads/) on Windows and macOS. On Linux it is usually installed already.)
- **A current browser**: Firefox, Chrome, Edge, Brave or Safari.
- **git** (optional), to download the code and to keep your progress in a repository.

Tested on Linux with Firefox. Windows and macOS should work with the commands below but have not been tested yet.

### 1. Get the code

With git, using the address from the green **Code** button on the repository page:

```bash
git clone <repository URL> school-app
cd school-app
```

Without git: click **Code › Download ZIP**, unpack it and open a terminal in the unpacked folder.

### 2. Create the Python environment

Linux and macOS:

```bash
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

Windows (PowerShell):

```powershell
py -3.12 -m venv venv
venv\Scripts\pip install -r requirements.txt
```

This installs one package, `python-dotenv`. There is no build step and no Node.js needed.

## Starting the app

Linux and macOS:

```bash
venv/bin/python serve.py
```

Windows:

```powershell
venv\Scripts\python serve.py
```

You should see:

```
School app: http://127.0.0.1:8767/
Data file: <project folder>/data/school-data.json
```

Open http://127.0.0.1:8767/ in your browser. Keep the terminal open while you use the app, and press Ctrl+C there to stop it.

Always use the same address, `http://127.0.0.1:8767/`. Browsers keep separate storage per address, so `localhost` or another port would show an empty app.

### Desktop shortcut (Linux)

To start the app with a click instead of a terminal, install the shortcut once:

```bash
venv/bin/python launcher.py --install
```

"School app" appears in the app menu and on the Desktop. If GNOME asks, right-click the Desktop icon once and choose **Allow Launching**. A click starts the server in the background if it is not running yet and opens the app. In Chrome, Chromium, Brave or Edge it opens in its own window without tabs. Firefox has no app-window mode, so it opens a normal window. To stop the server, right-click the shortcut and choose **Stop the server**.

| Command | What it does |
|---|---|
| `venv/bin/python launcher.py` | Start the server if needed, then open the app |
| `venv/bin/python launcher.py --stop` | Stop a server the launcher started |
| `venv/bin/python launcher.py --install [--no-desktop]` | Add the shortcut to the app menu (and the Desktop) |
| `venv/bin/python launcher.py --uninstall` | Remove the shortcuts |

The shortcut remembers where the folder is. After moving the folder, run `--install` again. The server's log is in `~/.local/state/school-app/server.log`. To pick the browser, set `SCHOOL_APP_BROWSER`, for example `SCHOOL_APP_BROWSER="firefox --new-window"`.

## First steps

1. Open the app and type your name. This creates your account (only a name, no password, no sign-up).
2. Your account has one subject, Languages. Open it to reach the French course and the English vocabulary trainer.
3. Click **New subject**. Pick a starter kit under "Start from", or leave it on None, and give the subject a name.
4. The subject's setup page opens. Choose:
   - **Interview in the app**, if you have set up an AI key (see below), or
   - **Use ChatGPT or Gemini**: copy the prompt, paste it into the chat, answer the questions there, and paste the final answer back into the box.
5. Check the preview and click **Apply**. The subject now has its profile, study plan, tailored assistants and tools.
6. Add your next test in the subject's Calendar. Assistants see upcoming tests and use them when they help you.

To change a subject's setup later, open the subject and click **Profile and setup**.

## Setting up the AI

The assistants need an AI service. You have three options.

**OpenRouter (default, free models available).**
1. Create an account at [openrouter.ai](https://openrouter.ai/) and create an API key.
2. In the app, open **Account**, paste the key under AI settings and save. The default model is `openrouter/free`, which costs nothing.
3. With the local server running, the key is saved in `.env` in the project folder ("Saved in .env on this computer") and filled in automatically next time.

**Ollama (runs on your own computer, no key).** Install [Ollama](https://ollama.com/), download a model (for example `ollama pull llama3.2`), then in Account click **Ollama on this PC** (it sets the address to `http://localhost:11434/v1`) and type the name of the model you downloaded.

**No AI service at all.** Use the copy buttons. Every assistant, the setup interview and every lesson prompt can be copied into ChatGPT, Gemini or Claude in your browser.

Keep your key private. It is never written to the data file, backups or the repository. `.env` is git-ignored and readable only by your user.

## Your data

### Where it is

| What | Where |
|---|---|
| Subjects, notes, calendar, lessons, practice progress | `data/school-data.json` (and the browser) |
| Changes that lost a conflict | `data/conflicts/` |
| AI key | `.env` |
| Uploaded files (PDFs, images) | The browser only (IndexedDB) |

The data file is plain, readable JSON. The app saves it within about 1.5 seconds of each change. If two browsers or computers edit at the same time, the newest saved version wins and the other one is kept in `data/conflicts/`, never deleted. The app then shows a message.

Uploaded files are not part of the data file. Keep the originals elsewhere if you want them on another computer.

### Backups

Account › **Back up** downloads one file with your subjects, notes, calendar and sources. **Restore** reads it back. The French and English apps have their own Back up in their settings.

### Moving to another computer

**By hand.** Copy the whole folder, except `venv/`, to the other computer, create the venv there (see Installation) and start the app. Copy `.env` too if you want your AI key there, or type the key again.

**With git (recommended).** The public repository ignores `data/`, so your progress never ends up in it. To keep your progress in git, use a **private** repository of your own:

1. On GitHub, create a new **private** repository with no files in it.
2. In your `school-app` folder:

   ```bash
   git remote rename origin upstream
   git remote add origin <your private repository URL>
   ```

3. Open `.gitignore` and delete the line `data/` under "Personal progress data is never published".
4. Save and push your progress:

   ```bash
   git add .gitignore data
   git commit -m "Save progress"
   git push -u origin main
   ```

5. On the other computer: `git clone <your private repository URL> school-app`, create the venv, copy `.env` by hand (it is never in git) and start the app. It loads your data and reloads once.

From then on, commit and push `data/` when you finish on one computer, and pull before you start on the other. To get updates of the app itself, run `git pull upstream main`.

Never push `data/` to a public repository: it contains your notes and grades.

## Configuration

| Name | Where | Default | What it does |
|---|---|---|---|
| `AI_API_KEY` | `.env` | empty | Your OpenRouter key. The app writes it when you enter a key in Account. To set it by hand, copy `.env.example` to `.env`. |
| `--port` | `serve.py` option | `8767` | Port to listen on. Changing it means a new address with empty browser storage. |
| `--host` | `serve.py` option | `127.0.0.1` | Only `127.0.0.1`, `::1` or `localhost` are accepted. The app is never reachable from other computers. |
| `--open` | `serve.py` option | off | Opens the app in the default browser at start. |
| `--verbose` | `serve.py` option | off | Logs every request. Request bodies and keys are never logged. |
| `SCHOOL_APP_BROWSER` | environment, read by `launcher.py` | automatic | Browser command the shortcut uses. |
| AI address, model, answer language | Account page | OpenRouter, `openrouter/free`, English | Where AI requests go and how assistants answer. |

"Forget key" in Account removes the key from `.env` and from this browser. Another browser on the same computer that still holds the key saves it again when it opens the app, so clear it there too. Keys for services other than OpenRouter stay only in the browser where you typed them.

## Troubleshooting

**"Port 8767 is in use".** Another program uses the port, often a `serve.py` that is still running in another terminal. Stop it with Ctrl+C there, or run `venv/bin/python launcher.py --stop` if the shortcut started it.

**Account says "Saved in this browser only".** The page was opened without the local server, for example from GitHub Pages or as a plain file. Start `serve.py` and open http://127.0.0.1:8767/. Data already in that browser is saved to the file on the first start.

**The app is empty after starting it on another computer or port.** Check the address: it must be exactly `http://127.0.0.1:8767/`. Then check that `data/school-data.json` is in the folder.

**"The stored data file is damaged".** `data/school-data.json` is not valid JSON, most often because a git merge left conflict markers (`<<<<<<<`) in it. Open it in an editor and keep one version, or move it out of the folder, then restart `serve.py`. The app does not save until the file is fixed.

**Some changes are missing.** They were older than the saved file and were kept in `data/conflicts/conflict-<time>.json`, with a `reason` line. Copy the entries you need into `data/school-data.json` by hand while the server is stopped, then start it again.

**The AI says the key is wrong.** Open Account, paste the key again and use **Test**. For OpenRouter the address must be `https://openrouter.ai/api/v1`.

**The Desktop shortcut does nothing.** Right-click it and choose **Allow Launching**. If the folder was moved, run `venv/bin/python launcher.py --install` again. Errors appear as a notification and in `~/.local/state/school-app/server.log`.

## For developers

### Tests

```bash
tools/test.sh
```

It runs the Python unittest suite and the JavaScript suite (under `gjs`, or `node` when `gjs` is missing) and ends with `All tests passed.` The tests use temporary folders and fake browser objects and make no network calls. A GitHub Actions workflow runs them on every push and pull request.

### Project structure

```
school-app/
  serve.py              starts the local server
  launcher.py           desktop shortcut: starts the server in the background and opens the app
  server/               HTTP routes, request guard, data file, .env file
  js/                   dashboard code (views, store, AI, prompts, subject setup)
    sync/               saving browser data to the data file
  css/, icons/          styles and icons
  index.html, sw.js     dashboard page and offline cache
  apps/french/          French course
  apps/vocab/           English vocabulary trainer
  tools/                test.sh, make-public.sh, content sync scripts
  tests/                Python tests and JavaScript tests (tests/js/)
  docs/ARCHITECTURE.md  how the pieces fit together
  data/                 created by the server: school-data.json, conflicts/
  .env                  your AI key (git-ignored, created by the app)
```

### How it works

- The app is plain HTML, CSS and JavaScript modules with no build step. It keeps its data in the browser's `localStorage`.
- `js/sync/` watches the dashboard's and both language apps' data. After about 1.5 seconds without changes, or when the page is hidden, it sends the data to the local server, with AI keys removed.
- The server (`server/`, Python standard library) checks that each request comes from this computer, validates the data and writes `data/school-data.json` with a revision number. A save based on an old revision is refused, and the losing side goes to `data/conflicts/`.
- On start, the browser compares its data with the file and adopts, saves or restores, so another computer's progress loads with one reload.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the components, the sync protocol and the data formats in detail.

### Publishing a clean public copy

For the maintainer of a private copy that tracks `data/`:

```bash
tools/make-public.sh [target-dir]
```

It builds a `public` branch from the current commit without `data/`, with a neutral author (`PUBLIC_AUTHOR_NAME`, `PUBLIC_AUTHOR_EMAIL`), and clones or updates it in the target folder (default `../school-app-public`). It refuses to finish if the files contain your git user name or email, or a word from the git-ignored `tools/private-words.txt`. Nothing on disk is deleted.
