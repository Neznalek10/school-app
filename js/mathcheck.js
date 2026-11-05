// Exercise answers are compared by value, so "2,5", "5/2", "2.5 m/s", "25·10^-1" and "x = 2,5" all count.

const SUPERSCRIPTS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
const EXPRESSION_CHAR = /[0-9\s.,+\-−–*×·/:^()√π⁰¹²³⁴-⁹⁻⁺]/;

function tokenize(text) {
  const s = text
    .replace(/[⁰¹²³⁴-⁹⁻⁺]+/g, m => `^(${[...m].map(c => SUPERSCRIPTS[c]).join('')})`)
    .replace(/[−–]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/:/g, '/')
    .replace(/(\d)\s+(?=\d)/g, '$1')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, '');
  const tokens = [];
  for (let i = 0; i < s.length;) {
    const num = s.slice(i).match(/^\d+(\.\d+)?|^\.\d+/);
    if (num) {
      tokens.push({ n: Number(num[0]) });
      i += num[0].length;
    } else if ('+-*/^()√π'.includes(s[i])) {
      tokens.push({ op: s[i] });
      i++;
    } else return null;
  }
  return tokens;
}

// A small recursive-descent parser: + − · / ^, brackets, √, π and implicit multiplication (2√3, 3(x)).
export function evaluate(text) {
  const tokens = tokenize(String(text));
  if (!tokens?.length) return NaN;
  let i = 0;
  const peek = () => tokens[i];
  const isOp = op => peek()?.op === op;
  const startsPrimary = () => peek() && (peek().n !== undefined || isOp('(') || isOp('√') || isOp('π'));

  function primary() {
    const t = tokens[i++];
    if (!t) return NaN;
    if (t.n !== undefined) return t.n;
    if (t.op === 'π') return Math.PI;
    if (t.op === '√') return Math.sqrt(power());
    if (t.op === '(') {
      const v = expr();
      if (!isOp(')')) return NaN;
      i++;
      return v;
    }
    return NaN;
  }
  function power() {
    const base = primary();
    if (isOp('^')) {
      i++;
      return base ** factor();
    }
    return base;
  }
  function factor() {
    if (isOp('-')) { i++; return -factor(); }
    if (isOp('+')) { i++; return factor(); }
    return power();
  }
  function term() {
    let v = factor();
    for (;;) {
      if (isOp('*')) { i++; v *= factor(); }
      else if (isOp('/')) { i++; v /= factor(); }
      else if (startsPrimary()) v *= power();
      else return v;
    }
  }
  function expr() {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[i++].op;
      v = op === '+' ? v + term() : v - term();
    }
    return v;
  }
  const v = expr();
  return i === tokens.length && Number.isFinite(v) ? v : NaN;
}

// "v = 12,5 m/s" -> { expr: "12,5", unit: "m/s" }
export function splitAnswer(text) {
  const s = String(text).replace(/^[^=]*=/, '').replace(/[{}]/g, '').trim();
  let i = 0;
  while (i < s.length && EXPRESSION_CHAR.test(s[i])) i++;
  return { expr: s.slice(0, i).trim(), unit: s.slice(i).trim() };
}

// Several results are separated by a semicolon, or by "a" / "nebo" ("x = 2 a x = −3").
export const splitResults = text => String(text).replace(/^\s*[A-Za-z]\w*\s*=\s*\{/, '{').split(/;|\s+a\s+|\s+nebo\s+|\s+and\s+|\s+or\s+/).map(s => s.trim()).filter(Boolean);

// Results in other bases are compared as text: "2D", "2d₁₆", "0x2D" and "002D" are the same.
const normDigits = s => String(s).normalize('NFC').replace(/\s+/g, '').replace(/[₀-₉]+$|\(\d+\)$|_\d+$/, '').replace(/^0x/i, '').replace(/[hH]$/, '').toUpperCase().replace(/^0+(?=.)/, '');

export function checkText(input, accept) {
  const given = normDigits(String(input).replace(/^[^=]*=/, ''));
  if (!given) return { ok: false, kind: 'unreadable' };
  return accept.some(a => normDigits(a) === given) ? { ok: true, kind: 'exact' } : { ok: false, kind: 'wrong' };
}

const normUnit = u => u.replace(/\s+/g, '').replace(/[·*.]/g, '').replace(/\^/g, '').replace(/−/g, '-').toLowerCase();
const close = (a, b, tol) => (b === 0 ? Math.abs(a) < 1e-9 : Math.abs(a - b) / Math.abs(b) <= tol);

function matchAll(given, expected, tol) {
  const left = [...given];
  return expected.every(e => {
    const i = left.findIndex(g => close(g, e, tol));
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

// kind: exact | rounded | unit (right number, other unit) | count | sign | magnitude | unreadable | wrong
export function checkResult(input, { values, unit = '', tolerance = 0.01 }) {
  const parts = splitResults(input);
  if (!parts.length) return { ok: false, kind: 'unreadable' };
  const split = parts.map(splitAnswer);
  const given = split.map(p => evaluate(p.expr));
  if (given.some(Number.isNaN)) return { ok: false, kind: 'unreadable' };
  if (given.length !== values.length) return { ok: false, kind: 'count' };
  if (matchAll(given, values, tolerance)) {
    const typed = split.find(p => p.unit)?.unit;
    if (unit && typed && normUnit(typed) !== normUnit(unit)) return { ok: true, kind: 'unit' };
    return { ok: true, kind: matchAll(given, values, 1e-6) ? 'exact' : 'rounded' };
  }
  if (matchAll(given.map(g => -g), values, tolerance)) return { ok: false, kind: 'sign' };
  if ([10, 100, 1000, 1e6, 0.1, 0.01, 0.001, 1e-6].some(k => matchAll(given.map(g => g * k), values, tolerance))) return { ok: false, kind: 'magnitude' };
  return { ok: false, kind: 'wrong' };
}
