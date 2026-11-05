# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The 1.x history lived in the earlier project (school-learning-app). This file starts at 2.0.0.

## [2.4.0] - 2026-11-06

### Added

- A Calendar tab with every subject together: a month grid that fits a phone, every upcoming and every past item, subject chips to show one subject, and holidays.
- Drafts everywhere: a new test, source, subject, assistant, learning plan, lesson paste, chat message or setup answer is kept when the form is closed, the app is switched away from or the page reloads. "Draft restored" with Discard shows when one comes back.
- Interface language: English or Czech (Account › Appearance), following the browser for new accounts. The Czech texts live in `js/i18n/cs.js`; more languages can be added as one file each.
- The assistants answer in any of 32 languages, and "Your school and year" tells every AI prompt who the student is.

### Changed

- Dates, the first day of the week and numbers follow the account's language and country instead of fixed British English.
- Outside the Czech Republic, prompts describe the student by country and use neutral school conventions, and the starter kits swap Czech and ZSV for Language and literature and Social studies, without the Czech-only Názvosloví and number-systems lesson. Czech accounts keep everything as before.

## [2.3.0] - 2026-11-05

### Added

- The calendar sets up your country's important days on its own. A new account picks the country from the browser's language, and Account › Calendar has a Country setting. The Czech Republic keeps the full built-in calendar (public holidays, MŠMT school breaks, spring break by district, important days). About 200 other countries get their nationwide public holidays from Nager.Date, downloaded once per year and kept for offline use. Existing accounts stay on the Czech calendar.

## [2.2.0] - 2026-11-05

### Changed

- The French app is now the full language app, version 2.1.0, instead of the older 1.16.0 copy. New in it: learn from Czech or English (Settings › I speak), the whole interface in Czech, more lessons and fixes, and an optional save folder. Your French progress carries over, and it still signs in with your school account and saves into the same data file.

## [2.1.1] - 2026-11-05

### Changed

- The home-screen icon on phones and tablets now matches the desktop icon: Android shows the cap at the same size, and iPhone and iPad get a full square icon instead of one with black corners.

## [2.1.0] - 2026-11-05

### Added

- Updates apply on their own. When the app comes back to the screen it checks for a new version, reloads once and shows "Updated to version X". It waits while you are typing, so nothing you write is lost. No reinstall and no Check for updates tap needed.

## [2.0.1] - 2026-11-05

### Changed

- The installed app on Android opens full-screen: the status bar and the back, home and recents buttons hide, and a swipe from the edge brings them back. iPhone and iPad keep the normal home-screen view.
- GitHub Pages is published by `.github/workflows/pages.yml` instead of the built-in branch deploy.

## [2.0.0] - 2026-11-05

### Added

- A local Python server (`serve.py`, `server/`) on 127.0.0.1, port 8767 by default. It serves the app's files and an API for the data file and the `.env` key.
- One data file, `data/school-data.json`. The dashboard and both language apps save their progress there within about 1.5 seconds of a change, and when the page is hidden. Opening the app on another computer with the same folder restores it with one reload.
- A conflicts folder, `data/conflicts/`. Local changes that lose a conflict are kept there with the reason, instead of being dropped, and the dashboard says so once.
- A storage mode indicator in Account: a Storage card with the mode, the data file, the last save time, errors and "Save now". Without the server the app says it is saving in the browser only.
- AI key storage in `.env` (`AI_API_KEY`). A key entered in Account or in the French app's settings is written to `.env`, and at the next start `.env` fills it in again. "Forget key" removes it after a confirmation. Keys for other providers stay in the browser and never reach `.env` or the data file.
- Starter kits in the New subject sheet: Mathematics, Physics, Chemistry, Czech, History, ZSV, Biology, Geography and Computer science. A kit fills in the name, icon, colour, learning-plan template and built-in tools or lessons.
- A "Set up this subject" assistant on every subject. It interviews the user and ends with one setup proposal. Applying it writes the subject profile, the learning-plan template and extra instructions, up to four custom assistants, and built-in tools and lessons.
- The setup page (`#/setup/<subject id>`), which opens after a subject is created. It offers an in-app interview, or a copy-paste prompt for ChatGPT or Gemini with a preview before applying.
- An "Apply to <subject>" card under a setup proposal in the chat.
- The subject profile in every assistant's system prompt, in the copy-paste prompts and in the lesson prompt.
- A "Set up with AI" card on a new subject's page, which becomes a "Profile and setup" row once the subject is set up.
- A built-in lesson for Computer science (Číselné soustavy), added with its kit or a setup, once per subject.
- A desktop shortcut: `launcher.py --install` adds "School app" to the app menu and the Desktop. A click starts the server in the background and opens the app, and the shortcut's "Stop the server" action stops it.
- `tools/test.sh`, which runs the Python and JavaScript test suites.
- `tools/make-public.sh`, which builds a `public` branch and a public folder without data or personal information.
- A GitHub Actions workflow for the public copy that runs the tests on each push and pull request.
- `docs/ARCHITECTURE.md`, the components, the sync protocol and the data formats.

### Changed

- New accounts start with Languages only. Previously they started with nine subjects. Existing accounts keep their subjects.
- The Chemistry naming tool is a subject tool. Existing Chemistry subjects keep it.
- The default port is 8767, the same port the old dashboard used, so browser data already on the computer is picked up on the first start.
- Backups no longer change the AI settings on restore. Export blanks the AI key.
- The example in the Czech days setting hint is now "Flag Day or Teachers' Day".

### Fixed

- A new account with only Languages no longer fails when later default subjects are added.
- Uploaded files of unsafe types (for example HTML or SVG) download instead of opening in the app's own origin.
- A malformed link in the address bar returns to the home page instead of failing.
- The French app's prompt files load again. The server serves them from `apps/**/prompts/`.
- Prompts respect "use notes" for assistants that do not read notes.
- The chat's timeout covers reading the answer body, and array-style answers are read correctly.
- Subject names containing `$&` are kept as typed in prompts.
- Offline edits are marked as unsaved, and a `git pull` no longer overwrites them silently.
- Lone surrogates in text no longer stop saving.

### Security

- The server accepts connections only on 127.0.0.1. It checks the Host header (against DNS rebinding), requires JSON bodies and a matching Origin for writes, caps request bodies at 25 MB, and serves only an allowlist of files. Dotfiles, the data folder, tools, tests, docs and server code are never served.
- Static responses send a Content-Security-Policy, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. API responses send `Cache-Control: no-store`.
- The service workers never cache `/api/`.
- The AI key is kept in `.env` with mode 0600, never in the data file. It is sent only over https or to localhost, and only into AI settings that point at openrouter.ai. Error messages hide anything that looks like a key.
- Backup restore cannot set the AI address, and it keeps only http and https links.
- The public copy build refuses to finish if the public files contain the git user name or email, or a word from the private list.

### Removed

- The nine default subjects for new accounts (replaced by Languages only and starter kits).
- Automatic seeding of built-in lessons into every account.
