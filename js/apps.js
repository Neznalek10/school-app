// The language apps live in apps/ and keep their own data; the dashboard only reads it for the summary cards.
export const APPS = {
  french: {
    name: 'French',
    flag: '🇫🇷',
    path: 'apps/french/index.html',
    prefix: 'school-fr.',
    lang: 'fr',
    blurb: 'Course, grammar, writing, speaking and vocabulary',
    owns: key => /^(local\/)?fr\//.test(key),
  },
  english: {
    name: 'English',
    flag: '🇬🇧',
    path: 'apps/vocab/index.html',
    prefix: 'vocab2.',
    lang: 'en',
    params: { lang: 'en' },
    blurb: 'Vocabulary trainer for the word lists you import',
    owns: key => /^[^/]*-en\//.test(key),
  },
};

export function appUrl(key, account, back = '#/subject/languages') {
  const app = APPS[key];
  const home = new URL(`./index.html${back}`, location.href).href;
  const params = new URLSearchParams({ profile: account.id, name: account.name, ...app.params, home });
  return `${app.path}?${params}`;
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function appStats(key, accountId, now = new Date()) {
  const app = APPS[key];
  const activity = readJson(`${app.prefix}${accountId}.activity`) || {};
  const progress = readJson(`${app.prefix}${accountId}.progress`) || {};
  const answersOn = date => activity[dayKey(date)]?.[app.lang]?.[0] || 0;
  const day = new Date(now);
  const today = answersOn(day);
  if (!today) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (answersOn(day)) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  const words = Object.entries(progress).filter(([k]) => app.owns(k));
  return {
    today,
    streak,
    practised: words.length,
    mastered: words.filter(([, p]) => p?.streak >= 5).length,
    started: !!readJson(`${app.prefix}accounts`)?.some(a => a.id === accountId),
  };
}
