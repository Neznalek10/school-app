import { store } from '../store.js';
import { APPS, appUrl, appStats } from '../apps.js';
import { plainText } from '../md.js';
import { timeAgo, subjectIcon, noteRow } from './parts.js';
import { assistantsOf } from '../subjects.js';
import { html, icon, fmt, plural } from '../ui.js';
import { subjectSheet } from './subject.js';
import { upcoming, isTask, dayKey } from '../events.js';
import { eventRow, calendarHref, czRow } from './calendar.js';
import { calendarItems, fetchMissingHolidays } from '../holidays.js';
import { formatDate } from '../locale.js';

/**
 * Builds the hero card with today's language-app activity.
 *
 * Only apps that some subject lists in `subject.apps` are shown, each linking back to the first subject
 * that holds it; an account whose subjects have no apps gets no hero at all.
 *
 * @param {object} app The app shell (unused beyond the signature shared by the home sections).
 * @returns {object|string} An html fragment, or '' when no subject has an app.
 */
function languageHero(app) {
  const account = store.account;
  // First subject holding each known app, so the app's Home link returns to that subject's page.
  const holder = {};
  for (const subject of store.subjects) {
    for (const key of subject.apps || []) if (APPS[key] && !holder[key]) holder[key] = subject;
  }
  const keys = Object.keys(holder);
  if (!keys.length) return '';
  const stats = Object.fromEntries(keys.map(k => [k, appStats(k, account.id)]));
  const today = keys.reduce((n, k) => n + stats[k].today, 0);
  const best = Math.max(...keys.map(k => stats[k].streak));
  const date = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
  return html`<section class="hero">
    <div class="hero-eyebrow">${date}</div>
    <div class="hero-figure">${fmt(today)}</div>
    <div class="hero-label">${today === 1 ? 'language answer today' : 'language answers today'}</div>
    <div class="hero-sub">${best ? `Best streak: ${plural(best, 'day')}` : 'A few minutes of French or English keeps a streak going'}</div>
    <div class="hero-actions">${keys.map(k => html`<a class="btn btn-on-accent" href="${appUrl(k, account, `#/subject/${encodeURIComponent(holder[k].id)}`)}">${APPS[k].flag} ${APPS[k].name}</a>`)}</div>
  </section>`;
}

export function homeView(app) {
  const subjects = store.subjects;
  const recent = [...store.notes].sort((a, b) => b.updated - a.updated).slice(0, 4);
  const chats = Object.entries(store.chats)
    .filter(([, c]) => c.messages?.length)
    .map(([key, c]) => {
      const [subjectId, assistantId] = key.split('/');
      const subject = app.subject(subjectId);
      const assistant = subject && assistantsOf(subject).find(a => a.id === assistantId);
      return subject && assistant ? { subject, assistant, last: c.messages.at(-1), updated: c.updated || 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 3);
  const soon = upcoming(store.events.filter(e => app.subject(e.subjectId) && !e.done), { days: 30, limit: 5 });
  // Days off in the next two weeks sit between your own tests, by date; important days stay in the calendar.
  const today = dayKey();
  const inTwoWeeks = dayKey(new Date(Date.now() + 14 * 864e5));
  fetchMissingHolidays(today, inTwoWeeks, store.settings, () => app.render());
  const daysOff = calendarItems(today, inTwoWeeks, store.settings).filter(i => i.kind !== 'important').slice(0, 3);
  const coming = [...soon.map(ev => ({ date: ev.date, row: eventRow(app, ev, { href: isTask(ev) ? null : calendarHref(app.subject(ev.subjectId), ev.date), showSubject: true }) })),
    ...daysOff.map(i => ({ date: i.start < today ? today : i.start, row: czRow(i, { today }) }))]
    .sort((a, b) => a.date.localeCompare(b.date));

  // Accounts that have not finished the Get started questions are offered them here; nothing forces them.
  const body = html`
    ${store.settings.student.done ? '' : html`<section class="card">
      <header class="card-head"><h2>Tell the app about you</h2></header>
      <p class="muted">Answer a few short questions about your age, school year and subjects. The AI then fits its answers to you and can plan every subject.</p>
      <a class="btn btn-primary btn-block" href="#/welcome">${icon('sparkle')}Get started</a>
    </section>`}

    ${languageHero(app)}

    ${coming.length ? html`<section class="card">
      <header class="card-head"><h2>Coming up</h2><a class="card-link" href="#/tests">Tests & homework${icon('chevronRight')}</a></header>
      <div class="note-list">${coming.map(c => c.row)}</div>
    </section>` : ''}

    <h3 class="group-title">Subjects<span>${plural(subjects.length, 'subject')}</span></h3>
    <div class="subject-grid">
      ${subjects.map(s => {
        const n = app.notesOf(s.id).length;
        const apps = (s.apps || []).filter(k => APPS[k]).map(k => APPS[k].name);
        return html`<a class="subject-card" href="#/subject/${encodeURIComponent(s.id)}">
          ${subjectIcon(s)}
          <strong>${s.name}</strong>
          <small>${apps.length ? apps.join(' · ') : plural(n, 'note')}</small>
        </a>`;
      })}
      <button class="subject-card subject-add" data-add-subject>${html`<span class="subject-icon">${icon('plus')}</span>`}<strong>Add subject</strong><small>Your own</small></button>
    </div>

    ${chats.length ? html`<section class="card">
      <header class="card-head"><h2>Continue a chat</h2></header>
      <div class="note-list">${chats.map(c => html`<a class="note-row" href="#/chat/${encodeURIComponent(c.subject.id)}/${encodeURIComponent(c.assistant.id)}">
        ${subjectIcon(c.subject, 'sm')}
        <span class="note-row-main"><strong>${c.assistant.name} · ${c.subject.name}</strong><small>${timeAgo(c.updated)} · ${plainText(c.last.content).slice(0, 80)}</small></span>
        ${icon('chevronRight', 'chevron')}
      </a>`)}</div>
    </section>` : ''}

    <section class="card">
      <header class="card-head"><h2>Recent notes</h2><a class="card-link" href="#/notes">All notes${icon('chevronRight')}</a></header>
      ${recent.length
        ? html`<div class="note-list">${recent.map(n => noteRow(app, n))}</div>`
        : html`<p class="muted">No notes yet. Open a subject and tap New note.</p>`}
    </section>

    <footer class="version-footer">School v${app.version}</footer>`;

  return {
    title: `Hi, ${store.account.name}`,
    body,
    mount(root) {
      root.querySelector('[data-add-subject]').addEventListener('click', () => subjectSheet(app));
    },
  };
}
