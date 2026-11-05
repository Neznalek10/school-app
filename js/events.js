// Calendar dates are local "YYYY-MM-DD" strings, so a test on the 3rd stays on the 3rd in any timezone.
export const EVENT_TYPES = [
  { key: 'test', label: 'Test', icon: 'target' },
  { key: 'homework', label: 'Homework', icon: 'edit' },
  { key: 'event', label: 'Event', icon: 'calendar' },
];

export const typeOf = key => EVENT_TYPES.find(t => t.key === key) || EVENT_TYPES[2];

// Tests and homework get their own page with a description, study materials, done and grade; plain events stay on the calendar.
export const isTask = e => e.type === 'test' || e.type === 'homework';

// Still to do: not ticked off, and either still ahead or homework that is overdue. A test in the past counts as done.
export const isOpen = (e, today = dayKey()) => !e.done && (e.date >= today || e.type === 'homework');
export const isOverdue = (e, today = dayKey()) => e.type === 'homework' && !e.done && e.date < today;

export const firstLine = text => String(text || '').split('\n').map(l => l.replace(/^[#\-*\s]+/, '').trim()).find(Boolean) || '';

// 1.1.0 called homework "deadline" and kept a one-line "note"; both are carried over once.
export function migrateEvents(list) {
  let changed = 0;
  for (const e of list) {
    if (e.type === 'deadline') {
      e.type = 'homework';
      changed++;
    }
    if (e.note !== undefined) {
      if (e.note && !e.description) e.description = e.note;
      delete e.note;
      changed++;
    }
  }
  return changed;
}

const pad = n => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export function parseDay(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

export const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && dayKey(parseDay(s)) === s;
export const isMonth = s => /^\d{4}-\d{2}$/.test(s) && monthKey(parseDay(s)) === s;
export const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function addMonths(key, n) {
  const d = parseDay(key);
  return monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

// Rounding absorbs the hour lost or gained on daylight-saving days.
export const daysUntil = (key, today = dayKey()) => Math.round((parseDay(key) - parseDay(today)) / 864e5);

export function whenLabel(key, today = dayKey()) {
  const n = daysUntil(key, today);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

export const formatDay = (key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => parseDay(key).toLocaleDateString('en-GB', opts);
export const formatMonth = key => parseDay(key).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

// Weeks start on Monday, as in Czech school calendars. Always six rows so the grid doesn't jump between months.
export function monthGrid(key) {
  const first = parseDay(key);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const month = first.getMonth();
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
    return { key: dayKey(d), day: d.getDate(), inMonth: d.getMonth() === month };
  }));
}

export const sortEvents = list => [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title));

export function upcoming(events, { today = dayKey(), days = Infinity, limit = Infinity } = {}) {
  return sortEvents(events.filter(e => e.date >= today && daysUntil(e.date, today) <= days)).slice(0, limit);
}

export const past = (events, today = dayKey()) => sortEvents(events.filter(e => e.date < today)).reverse();
