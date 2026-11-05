import { store, uid } from '../store.js';
import {
  EVENT_TYPES, typeOf, isTask, firstLine, dayKey, parseDay, monthKey, isDay, isMonth, isTime, addMonths, whenLabel, formatDay, formatMonth, monthGrid, sortEvents, upcoming, past,
} from '../events.js';
import { html, icon, plural, segmented, onSegmented } from '../ui.js';
import { tasksSection, mountTasks, taskHref } from './tasks.js';
import { CZECH, calendarItems, calendarByDay, countryName, fetchMissingHolidays } from '../holidays.js';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const CZ_KINDS = { holiday: 'Public holiday', break: 'School break', school: 'School', important: 'Important day' };

const czSpan = item => (item.start === item.end ? formatDay(item.start) : `${formatDay(item.start, { day: 'numeric', month: 'short' })} – ${formatDay(item.end, { day: 'numeric', month: 'short' })}`);

// Czech public holidays, school breaks and important days. They come from the calendar, so they can't be edited or deleted.
export function czRow(item, { today = dayKey() } = {}) {
  const d = parseDay(item.start);
  const when = item.start <= today && item.end >= today ? 'Now' : whenLabel(item.start, today);
  return html`<div class="note-row cz-row cz-${item.kind}">
    <span class="ev-date cz-date"><strong>${d.getDate()}</strong><small>${d.toLocaleDateString('en-GB', { month: 'short' })}</small></span>
    <span class="note-row-main"><strong>${item.cs}</strong><small>${item.en} · ${CZ_KINDS[item.kind]} · ${item.start === item.end ? when : `${czSpan(item)} · ${when}`}</small></span>
  </div>`;
}

export const eventsOf = subjectId => store.events.filter(e => e.subjectId === subjectId);
export const calendarHref = (subject, date) => `#/subject/${encodeURIComponent(subject.id)}?tab=calendar&month=${date.slice(0, 7)}&day=${date}`;

export function eventRow(app, ev, { href = null, showSubject = false } = {}) {
  const type = typeOf(ev.type);
  const subject = showSubject ? app.subject(ev.subjectId) : null;
  const d = parseDay(ev.date);
  const desc = firstLine(ev.description);
  const inner = html`
    <span class="ev-date ev-${type.key}"><strong>${d.getDate()}</strong><small>${d.toLocaleDateString('en-GB', { month: 'short' })}</small></span>
    <span class="note-row-main">
      <strong>${ev.title}</strong>
      <small>${subject ? html`<span class="dot c-${subject.color}"></span>${subject.name} · ` : ''}${type.label} · ${whenLabel(ev.date)}${ev.time ? ` · ${ev.time}` : ''}${desc ? ` · ${desc}` : ''}</small>
    </span>`;
  const link = href || (isTask(ev) ? taskHref(ev) : null);
  return link
    ? html`<a class="note-row ev-row ${ev.done ? 'is-done' : ''}" href="${link}">${inner}${icon('chevronRight', 'chevron')}</a>`
    : html`<button type="button" class="note-row ev-row" data-event="${ev.id}">${inner}${icon('edit', 'chevron')}</button>`;
}

// New tests and homework open their own page, where you describe them and attach study materials.
export function eventSheet(app, subject, event = null, { date = dayKey(), type: preset = 'test', onSave, onDelete } = {}) {
  let type = event?.type || preset;
  app.sheet({
    title: event ? `Edit ${typeOf(event.type).label.toLowerCase()}` : `New in ${subject.name}`,
    body: html`<form class="event-form" novalidate>
      <div class="field-label">Type</div>
      ${segmented('type', EVENT_TYPES.map(t => ({ value: t.key, label: t.label })), type)}
      <label class="field-label" for="ev-title">What</label>
      <input class="input" id="ev-title" name="title" maxlength="80" value="${event?.title || ''}" placeholder="e.g. Test: cells and tissues" autocomplete="off">
      <div class="form-row">
        <label class="field"><span class="field-label">Date</span><input class="input" type="date" name="date" value="${event?.date || date}"></label>
        <label class="field"><span class="field-label">Time (optional)</span><input class="input" type="time" name="time" value="${event?.time || ''}"></label>
      </div>
      <label class="field-label" for="ev-desc">What it covers (optional)</label>
      <textarea class="input textarea ev-desc" id="ev-desc" name="description" rows="3" maxlength="4000" placeholder="e.g. Chapters 3 to 5, bring a calculator">${event?.description || ''}</textarea>
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-block btn-lg" type="submit">${event ? 'Save' : 'Add to calendar'}</button>
      ${event ? html`<button class="btn btn-ghost-danger btn-block" type="button" data-delete>${icon('trash')}Delete</button>` : ''}
    </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      onSegmented(body, (name, value) => { type = value; });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const title = form.title.value.trim().replace(/\s+/g, ' ');
        const when = form.date.value;
        const time = isTime(form.time.value) ? form.time.value : '';
        const error = body.querySelector('.form-error');
        if (!title || !isDay(when)) {
          error.textContent = title ? 'Pick a date.' : 'Say what it is, e.g. "Test: cells".';
          error.hidden = false;
          return;
        }
        const fields = { title, type, date: when, time, description: form.description.value.trim() };
        const saved = event ? Object.assign(event, fields) : { id: uid('e'), subjectId: subject.id, ...fields, materials: [], done: false, created: Date.now() };
        if (!event) store.events.push(saved);
        store.save('events');
        close();
        if (onSave) onSave(saved);
        else if (!event && isTask(saved)) app.go(taskHref(saved).slice(2));
        else app.go(calendarHref(subject, when).slice(2), { replace: true });
      });
      body.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        const ok = await app.confirm({ title: 'Delete this event?', text: `"${event.title}" on ${formatDay(event.date)} is removed.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        store.events = store.events.filter(x => x !== event);
        store.save('events');
        if (onDelete) onDelete();
        else app.render();
      });
      if (!event) form.title.focus({ preventScroll: true });
    },
  });
}

function viewSwitch(subject, view) {
  const base = `#/subject/${encodeURIComponent(subject.id)}?tab=calendar`;
  return html`<div class="segmented seg-links cal-view">
    <a class="${view === 'month' ? 'active' : ''}" href="${base}">${icon('calendar')}Month</a>
    <a class="${view === 'table' ? 'active' : ''}" href="${base}&view=table">${icon('clipboard')}Tests & homework</a>
  </div>`;
}

export function calendarPanel(app, subject, { month, day, view, status, kind }) {
  if (view === 'table') {
    return html`${viewSwitch(subject, 'table')}${tasksSection(app, { base: `subject/${encodeURIComponent(subject.id)}?tab=calendar&view=table`, subject, status, kind })}`;
  }
  const today = dayKey();
  const selected = isDay(day) ? day : null;
  const shown = isMonth(month) ? month : (selected ? selected.slice(0, 7) : monthKey());
  const events = eventsOf(subject.id);
  const byDay = new Map();
  for (const ev of sortEvents(events)) byDay.set(ev.date, [...(byDay.get(ev.date) || []), ev]);
  const next = upcoming(events);
  const done = past(events);
  const weeks = monthGrid(shown);
  const settings = store.settings;
  const czech = settings.czech;
  const isCzech = settings.country === CZECH;
  fetchMissingHolidays(weeks[0][0].key, weeks[5][6].key, settings, () => app.render());
  const cz = calendarByDay(weeks[0][0].key, weeks[5][6].key, settings);
  // "-31" is a safe upper bound for any month, because dates compare as strings.
  const monthItems = calendarItems(`${shown}-01`, `${shown}-31`, settings);
  const showLegend = settings.country && (czech.holidays || (isCzech && czech.important));

  const grid = html`<div class="cal-grid" role="grid" aria-label="${formatMonth(shown)}">
    ${WEEKDAYS.map(w => html`<span class="cal-wd">${w}</span>`)}
    ${weeks.flat().map(c => {
      const evs = byDay.get(c.key) || [];
      const days = cz.get(c.key) || [];
      const has = kind => days.some(i => i.kind === kind);
      const cls = [c.inMonth ? '' : 'out', c.key === today ? 'today' : '', c.key === selected ? 'sel' : '', evs.some(e => e.type === 'test') ? 'has-test' : '',
        has('holiday') ? 'off' : '', has('break') ? 'brk' : ''].join(' ');
      const names = days.map(i => i.cs).join(', ');
      return html`<button type="button" class="cal-day ${cls}" data-day="${c.key}" title="${names}" aria-label="${formatDay(c.key, { weekday: 'long', day: 'numeric', month: 'long' })}${names ? `, ${names}` : ''}${evs.length ? `, ${plural(evs.length, 'event')}` : ''}">
        <span>${c.day}</span>
        <span class="cal-dots">${evs.slice(0, 3).map(e => html`<i class="ev-${typeOf(e.type).key}"></i>`)}${has('important') || has('school') ? html`<i class="cz-mark ${has('school') ? 'cz-school' : ''}"></i>` : ''}</span>
      </button>`;
    })}
  </div>`;

  const dayEvents = selected ? byDay.get(selected) || [] : [];
  return html`
    ${viewSwitch(subject, 'month')}
    <section class="card cal-card">
      <header class="cal-head">
        <button class="icon-btn" data-month="${addMonths(shown, -1)}" aria-label="Previous month">${icon('chevronLeft')}</button>
        <h2>${formatMonth(shown)}</h2>
        ${shown !== monthKey() ? html`<button class="btn btn-text btn-sm" data-month="${monthKey()}">Today</button>` : ''}
        <button class="icon-btn" data-month="${addMonths(shown, 1)}" aria-label="Next month">${icon('chevronRight')}</button>
      </header>
      ${grid}
      <div class="cal-legend">${EVENT_TYPES.map(t => html`<span><i class="ev-${t.key}"></i>${t.label}</span>`)}</div>
      ${showLegend ? html`<div class="cal-legend cz-legend">
        ${czech.holidays ? html`<span><b class="cz-off">17</b>Holiday</span>${isCzech ? html`<span><b class="cz-brk"></b>School break</span>` : ''}` : ''}
        ${isCzech && czech.important ? html`<span><i class="cz-mark"></i>Important day</span>` : ''}
      </div>` : ''}
    </section>

    ${selected ? html`<section class="card">
      <header class="card-head"><h2>${formatDay(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><span class="card-meta">${whenLabel(selected)}</span></header>
      ${(cz.get(selected) || []).length ? html`<div class="note-list cz-list">${cz.get(selected).map(i => czRow(i))}</div>` : ''}
      ${dayEvents.length ? html`<div class="note-list">${dayEvents.map(ev => eventRow(app, ev))}</div>` : html`<p class="muted">Nothing on this day.</p>`}
      <button class="btn btn-primary btn-block" data-add="${selected}">${icon('plus')}Add on ${formatDay(selected)}</button>
    </section>` : html`<button class="btn btn-primary btn-block cal-add" data-add="${today}">${icon('plus')}Add a test or event</button>`}

    <section class="card">
      <header class="card-head"><h2>Coming up</h2><span class="card-meta">${plural(next.length, 'event')}</span></header>
      ${next.length ? html`<div class="note-list">${next.map(ev => eventRow(app, ev))}</div>` : html`<p class="muted">No tests or events ahead. Tap a day to add one.</p>`}
    </section>

    ${showLegend ? html`<section class="card">
      <header class="card-head"><h2>${isCzech ? 'Czech calendar' : `Holidays in ${countryName(settings.country)}`} · ${formatMonth(shown)}</h2><a class="card-link" href="#/account">Settings${icon('chevronRight')}</a></header>
      ${monthItems.length ? html`<div class="note-list cz-list">${monthItems.map(i => czRow(i))}</div>` : html`<p class="muted">${isCzech ? 'No holidays or school breaks this month.' : 'No public holidays this month.'}</p>`}
      ${isCzech && czech.holidays && !czech.district && ['01', '02', '03'].includes(shown.slice(5)) ? html`<a class="notice notice-warn notice-link cz-hint" href="#/account">${icon('info')}<span>Pick your school's district in Account to see your spring break.</span></a>` : ''}
    </section>` : ''}

    ${done.length ? html`<details class="card cal-past">
      <summary>Past · ${plural(done.length, 'event')}</summary>
      <div class="note-list">${done.map(ev => eventRow(app, ev))}</div>
    </details>` : ''}`;
}

export function mountCalendar(app, subject, root, { day, view }) {
  if (view === 'table') return mountTasks(app, root, { subject });
  const base = `subject/${encodeURIComponent(subject.id)}?tab=calendar`;
  root.querySelectorAll('[data-month]').forEach(btn => btn.addEventListener('click', () => app.go(`${base}&month=${btn.dataset.month}`, { replace: true })));
  root.querySelectorAll('[data-day]').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.day;
    app.go(key === day ? `${base}&month=${key.slice(0, 7)}` : `${base}&month=${key.slice(0, 7)}&day=${key}`, { replace: true });
  }));
  root.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => eventSheet(app, subject, null, { date: btn.dataset.add })));
  root.querySelectorAll('[data-event]').forEach(btn => btn.addEventListener('click', () => {
    eventSheet(app, subject, store.events.find(e => e.id === btn.dataset.event));
  }));
}
