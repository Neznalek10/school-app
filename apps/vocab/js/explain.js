import { normalize, stripAccents, variants } from './check.js';
import { html, icon } from './ui.js';

const key = text => stripAccents(normalize(text));
const GENDER = { der: 'masculine', das: 'neuter', die: 'feminine' };
const FRENCH_ARTICLE = /^(?:le |la |les |l'|un |une |des )/;
const REFLEXIVE = /^(?:me |te |se |nous |vous |m'|t'|s')/;

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = saved;
    }
  }
  return row[b.length];
}

// The expected answer with every letter you didn't match highlighted.
export function markedAnswer(given, expected) {
  const a = normalize(given);
  const b = expected.toLowerCase();
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = new Array(b.length).fill(false);
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      matched[j] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const parts = [];
  for (let j = 0; j < expected.length; j++) {
    const ok = matched[j] || expected[j] === ' ';
    const last = parts.at(-1);
    if (last && last.ok === ok) last.text += expected[j];
    else parts.push({ ok, text: expected[j] });
  }
  return html`${parts.map(p => (p.ok ? p.text : html`<mark>${p.text}</mark>`))}`;
}

function accentReason(given, expected, strict) {
  const g = normalize(given);
  const e = normalize(expected);
  const verdict = strict ? 'Strict accent mode counts this as wrong.' : 'It counts, but learn the accents.';
  if (g.length === e.length) {
    const pairs = [...e].flatMap((c, i) => (c !== g[i] ? [`${c} (you wrote ${g[i]})`] : []));
    if (pairs.length) return `Accents: ${pairs.join(', ')}. ${verdict}`;
  }
  return `The correct spelling is "${expected}". Writing ue, oe, ae or ss is only a fallback for ü, ö, ä and ß. ${verdict}`;
}

function typoReason(given, expected) {
  const g = normalize(given);
  const e = normalize(expected);
  const a = stripAccents(g);
  const b = stripAccents(e);
  if (a.length !== g.length || b.length !== e.length) return 'One letter is off.';
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length + 1 === b.length) return `One letter is off: you left out "${e[i]}".`;
  if (a.length === b.length + 1) return `One letter is off: you added an extra "${g[i]}".`;
  return `One letter is off: "${g[i]}" should be "${e[i]}".`;
}

const closeReason = (given, expected) => {
  const d = distance(key(given), key(expected));
  return d <= Math.max(2, Math.floor(key(expected).length / 4)) ? `Close: ${d} letters differ. Compare the highlighted letters.` : null;
};

export function buildIndex(words) {
  const byAnswer = new Map();
  const byPrompt = new Map();
  for (const w of words) {
    for (const a of w.a) if (!byAnswer.has(key(a))) byAnswer.set(key(a), w);
    for (const q of variants(w.q)) if (!byPrompt.has(key(q))) byPrompt.set(key(q), w);
  }
  return { byAnswer, byPrompt };
}

function wordFacts(word) {
  const facts = [];
  const article = word.a[0].match(/^(der|die|das) /);
  if (word.deck.lang === 'de' && article) facts.push(word.note === 'plural' ? 'Noun, plural' : `Noun, ${GENDER[article[1]]}`);
  facts.push(word.deck.title);
  if (word.note && word.note !== 'plural') facts.push(word.note);
  return facts;
}

// Why a vocabulary answer was wrong, plus a short description of the word.
export function explainWord({ given, expected, kind, word, reverse, index, strict }) {
  const reasons = word.why ? [word.why] : [];
  const g = normalize(given);
  const e = normalize(expected);
  let marked = null;
  let category = null;

  if (g && kind === 'accent') {
    reasons.push(accentReason(given, expected, strict));
    marked = markedAnswer(given, expected);
    category = 'accent';
  } else if (g) {
    category = 'mistake';
    const article = !reverse && e.match(/^(der|die|das) (.+)$/);
    const givenArticle = g.match(/^(der|die|das) (.+)$/);
    const other = (reverse ? index.byPrompt : index.byAnswer).get(key(g));
    if (article && key(g) === key(article[2])) {
      reasons.push(`German nouns are learned with their article: ${expected} (${word.note === 'plural' ? 'plural' : GENDER[article[1]]}).`);
    } else if (article && givenArticle && key(givenArticle[2]) === key(article[2])) {
      reasons.push(`${article[2].charAt(0).toUpperCase() + article[2].slice(1)} is ${GENDER[article[1]]}: ${article[1]}, not ${givenArticle[1]}.`);
    } else if (!reverse && FRENCH_ARTICLE.test(g) && key(g.replace(FRENCH_ARTICLE, '')) === key(e)) {
      reasons.push(`Your noun is right, but this answer is written without the article: "${expected}". Use "I was right" if you want it counted.`);
    } else if (REFLEXIVE.test(e) && key(e.replace(REFLEXIVE, '')) === key(g)) {
      reasons.push(`This is a reflexive verb, so the pronoun belongs to it: "${expected}".`);
    } else if (other && key(other.q) !== key(word.q)) {
      reasons.push(reverse
        ? `"${given.trim()}" means ${other.a[0]}. ${word.a[0]} is "${expected}".`
        : `"${given.trim()}" means "${other.q}". "${word.q}" is ${expected}.`);
    } else if (kind === 'typo') {
      reasons.push(typoReason(given, expected));
      marked = markedAnswer(given, expected);
      category = 'typo';
    } else if (g.length >= 3 && key(e).includes(key(g))) {
      reasons.push(`Only part of the answer. The full answer is "${expected}".`);
    } else if (key(g).includes(key(e))) {
      reasons.push(`Your answer has extra words. The answer is just "${expected}".`);
    } else {
      const close = closeReason(given, expected);
      if (close) {
        reasons.push(close);
        marked = markedAnswer(given, expected);
      }
    }
  }
  return { reasons, facts: wordFacts(word), marked, category };
}

export function whyBlock({ reasons = [], facts = [], rule } = {}) {
  if (!reasons.length && !facts.length && !rule) return '';
  return html`<div class="why">
    ${reasons.length ? html`<div class="why-title">${icon('bulb')}Why</div><ul class="why-list">${reasons.map(r => html`<li>${r}</li>`)}</ul>` : ''}
    ${rule ? html`<div class="why-rule">${rule}</div>` : ''}
    ${facts.length ? html`<div class="why-facts">${facts.join(' · ')}</div>` : ''}
  </div>`;
}
