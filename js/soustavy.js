/**
 * Číselné soustavy (number systems): a built-in lesson whose exercises are generated, so every result and
 * every step of the solution is correct by construction.
 *
 * Fits in: js/store.js no longer seeds it; js/views/setup-apply.js and the New subject sheet add it to a
 * subject with addBuiltInLesson; js/views/exercises.js uses GENERATORS to make new exercise sets.
 */

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sub = n => String(n).replace(/\d/g, d => SUB[d]);
const sup = n => String(n).replace(/\d/g, d => SUP[d]);
const based = (digits, base) => `${digits}${sub(base)}`;
const SYSTEM = { 2: 'dvojkové', 3: 'trojkové', 5: 'pětkové', 8: 'osmičkové', 10: 'desítkové', 16: 'šestnáctkové' };
const code = lines => `\`\`\`\n${lines.join('\n')}\n\`\`\``;

export const toBase = (n, base) => n.toString(base).toUpperCase();
const digitValue = d => parseInt(d, 36);
const int = (lo, hi, rand) => lo + Math.floor(rand() * (hi - lo + 1));

function toDecimal(digits, base) {
  const n = parseInt(digits, base);
  const len = digits.length;
  const letters = [...new Set([...digits].filter(d => /[A-F]/.test(d)))];
  const terms = [...digits].map((d, i) => `${digitValue(d)} · ${base}${sup(len - 1 - i)}`);
  const values = [...digits].map((d, i) => digitValue(d) * base ** (len - 1 - i));
  return {
    task: `Převeď číslo ${based(digits, base)} do desítkové soustavy.`,
    answer: `${based(digits, base)} = ${based(n, 10)}`,
    values: [n],
    hint: `Rozepiš číslo podle mocnin základu ${base}. Pozice čísluj zprava od nuly.`,
    solution: [
      ...(letters.length ? [`Písmena nahradíme jejich hodnotami: ${letters.map(l => `${l} = ${digitValue(l)}`).join(', ')}.`] : []),
      `Každou číslici vynásobíme mocninou základu ${base} podle její pozice (zprava 0, 1, 2…): ${terms.join(' + ')}`,
      `= ${values.join(' + ')}`,
      `= ${n}, tedy ${based(digits, base)} = ${based(n, 10)}`,
    ],
  };
}

function divisionSteps(n, base) {
  const lines = [];
  let q = n;
  const width = String(n).length;
  while (q > 0) {
    const r = q % base;
    const next = Math.floor(q / base);
    lines.push(`${String(q).padStart(width)} : ${base} = ${String(next).padStart(width)}   zbytek ${r}${r > 9 ? ` = ${toBase(r, base)}` : ''}`);
    q = next;
  }
  return lines;
}

function fromDecimal(n, base) {
  const digits = toBase(n, base);
  const back = [...digits].map((d, i) => ({ v: digitValue(d), p: digits.length - 1 - i })).filter(t => t.v);
  return {
    task: `Převeď číslo ${based(n, 10)} do ${SYSTEM[base]} soustavy.`,
    answer: `${based(n, 10)} = ${based(digits, base)}`,
    accept: [digits],
    hint: `Děl číslo opakovaně základem ${base} a zapisuj zbytky.`,
    solution: [
      `Číslo opakovaně dělíme základem ${base} a zapisujeme zbytky, dokud nevyjde podíl 0.${base === 16 ? ' Zbytky 10 až 15 zapíšeme písmeny A až F.' : ''}`,
      code(divisionSteps(n, base)),
      `Zbytky čteme odspodu nahoru: ${based(digits, base)}`,
      `Kontrola: ${back.map(t => `${t.v} · ${base}${sup(t.p)}`).join(' + ')} = ${n}`,
    ],
  };
}

// Binary <-> octal or hex: one octal digit is 3 bits, one hex digit is 4 bits.
const groupsOf = (bin, size) => bin.padStart(Math.ceil(bin.length / size) * size, '0').match(new RegExp(`.{${size}}`, 'g'));

function binaryToGroup(n, base) {
  const size = base === 16 ? 4 : 3;
  const bin = toBase(n, 2);
  const groups = groupsOf(bin, size);
  const digits = toBase(n, base);
  return {
    task: `Převeď číslo ${based(bin, 2)} do ${SYSTEM[base]} soustavy.`,
    answer: `${based(bin, 2)} = ${based(digits, base)}`,
    accept: [digits],
    hint: `${base} = 2${sup(size)}, takže jedna číslice odpovídá ${size === 4 ? 'čtveřici' : 'trojici'} bitů. Seskupuj zprava.`,
    solution: [
      `${base} = 2${sup(size)}, proto bity rozdělíme zprava po ${size === 4 ? 'čtyřech' : 'třech'} a zleva doplníme nuly: ${groups.join(' ')}`,
      `Každou skupinu převedeme na jednu číslici: ${groups.map(g => `${g} = ${toBase(parseInt(g, 2), base)}`).join(', ')}`,
      `Výsledek: ${based(digits, base)}`,
    ],
  };
}

function groupToBinary(n, base) {
  const size = base === 16 ? 4 : 3;
  const digits = toBase(n, base);
  const bin = toBase(n, 2);
  const parts = [...digits].map(d => parseInt(d, base).toString(2).padStart(size, '0'));
  return {
    task: `Převeď číslo ${based(digits, base)} do dvojkové soustavy.`,
    answer: `${based(digits, base)} = ${based(bin, 2)}`,
    accept: [bin],
    hint: `Každou číslici přepiš na ${size} bity.`,
    solution: [
      `${base} = 2${sup(size)}, takže každou číslici přepíšeme na ${size} bity: ${[...digits].map((d, i) => `${d} = ${parts[i]}`).join(', ')}`,
      `Skupiny spojíme: ${parts.join(' ')}`,
      `Nuly na začátku vynecháme: ${based(bin, 2)}`,
    ],
  };
}

function viaBinary(n, from, to) {
  const a = groupToBinary(n, from);
  const b = binaryToGroup(n, to);
  const digits = toBase(n, to);
  return {
    task: `Převeď číslo ${based(toBase(n, from), from)} do ${SYSTEM[to]} soustavy.`,
    answer: `${based(toBase(n, from), from)} = ${based(digits, to)}`,
    accept: [digits],
    hint: 'Nejkratší cesta vede přes dvojkovou soustavu.',
    solution: [
      `Obě soustavy mají základ mocninou dvojky, proto převádíme přes dvojkovou soustavu.`,
      ...a.solution,
      ...b.solution.map(s => s.replace(/^Výsledek/, 'Výsledek po převodu')),
    ],
  };
}

function binaryAddition(x, y) {
  const a = toBase(x, 2);
  const b = toBase(y, 2);
  const sum = toBase(x + y, 2);
  const width = sum.length + 2;
  let carry = 0;
  let carries = '';
  // The carry written above a column is the one coming from the column to its right.
  for (let i = 0; i < sum.length; i++) {
    carries = (carry ? '1' : ' ') + carries;
    const bit = Number(a[a.length - 1 - i] || 0) + Number(b[b.length - 1 - i] || 0) + carry;
    carry = bit > 1 ? 1 : 0;
  }
  return {
    task: `Sečti ve dvojkové soustavě: ${based(a, 2)} + ${based(b, 2)}`,
    answer: based(sum, 2),
    accept: [sum],
    hint: 'Sčítej pod sebou zprava jako v desítkové soustavě. 1 + 1 = 10, takže píšeš 0 a 1 přenášíš.',
    solution: [
      'Sčítáme pod sebou zprava. Platí 0 + 0 = 0, 0 + 1 = 1, 1 + 1 = 10 (píšeme 0, 1 přenášíme), 1 + 1 + 1 = 11 (píšeme 1, 1 přenášíme).',
      code([`${carries.padStart(width)}  ← přenosy`, a.padStart(width), `+${b.padStart(width - 1)}`, '-'.repeat(width), sum.padStart(width)]),
      `Kontrola v desítkové soustavě: ${x} + ${y} = ${x + y} a ${based(sum, 2)} = ${based(x + y, 10)}`,
      `Výsledek: ${based(sum, 2)}`,
    ],
  };
}

function bitsNeeded(n) {
  const bits = toBase(n, 2).length;
  return {
    task: `Kolik bitů je nejméně potřeba k zápisu čísla ${based(n, 10)} ve dvojkové soustavě?`,
    answer: `${bits} bitů`,
    values: [bits],
    hint: 'Najdi mocninu dvojky, která je těsně větší než dané číslo.',
    solution: [
      `S n bity zapíšeme čísla 0 až 2${sup('n')} − 1.`,
      `2${sup(bits - 1)} = ${2 ** (bits - 1)} ≤ ${n} < ${2 ** bits} = 2${sup(bits)}`,
      `Potřebujeme tedy ${bits} bitů (${based(n, 10)} = ${based(toBase(n, 2), 2)}).`,
    ],
  };
}

// 24 exercises from easy to hard; every set is new.
export function generateExercises(rand = Math.random) {
  const recipes = [
    [1, 'Převod do desítkové soustavy', () => toDecimal(toBase(int(20, 120, rand), 2), 2)],
    [1, 'Převod do desítkové soustavy', () => toDecimal(toBase(int(20, 120, rand), 2), 2)],
    [1, 'Převod do desítkové soustavy', () => toDecimal(toBase(int(64, 255, rand), 2), 2)],
    [1, 'Převod z desítkové soustavy', () => fromDecimal(int(10, 100, rand), 2)],
    [1, 'Převod z desítkové soustavy', () => fromDecimal(int(10, 100, rand), 2)],
    [1, 'Převod z desítkové soustavy', () => fromDecimal(int(100, 255, rand), 2)],
    [1, 'Převod do desítkové soustavy', () => toDecimal(toBase(int(9, 63, rand), 8), 8)],
    [1, 'Převod do desítkové soustavy', () => toDecimal(toBase(int(26, 255, rand), 16), 16)],
    [2, 'Převod z desítkové soustavy', () => fromDecimal(int(100, 999, rand), 16)],
    [2, 'Převod z desítkové soustavy', () => fromDecimal(int(256, 2000, rand), 16)],
    [2, 'Převod z desítkové soustavy', () => fromDecimal(int(64, 500, rand), 8)],
    [2, 'Převod do desítkové soustavy', () => toDecimal(toBase(int(256, 4095, rand), 16), 16)],
    [2, 'Dvojková a šestnáctková soustava', () => binaryToGroup(int(64, 4095, rand), 16)],
    [2, 'Dvojková a šestnáctková soustava', () => binaryToGroup(int(64, 4095, rand), 16)],
    [2, 'Dvojková a šestnáctková soustava', () => groupToBinary(int(26, 4095, rand), 16)],
    [2, 'Dvojková a osmičková soustava', () => binaryToGroup(int(64, 511, rand), 8)],
    [2, 'Dvojková a osmičková soustava', () => groupToBinary(int(64, 511, rand), 8)],
    [3, 'Sčítání ve dvojkové soustavě', () => binaryAddition(int(20, 63, rand), int(10, 63, rand))],
    [3, 'Sčítání ve dvojkové soustavě', () => binaryAddition(int(64, 200, rand), int(20, 120, rand))],
    [3, 'Dvojková a šestnáctková soustava', () => viaBinary(int(64, 511, rand), 8, 16)],
    [3, 'Dvojková a osmičková soustava', () => viaBinary(int(64, 1023, rand), 16, 8)],
    [3, 'Jiné základy', () => toDecimal(toBase(int(30, 600, rand), 5), 5)],
    [3, 'Jiné základy', () => fromDecimal(int(20, 200, rand), 3)],
    [3, 'Bity a bajty', () => bitsNeeded(int(129, 5000, rand))],
  ];
  const seen = new Set();
  const out = [];
  for (const [level, topic, make] of recipes) {
    let x = make();
    for (let n = 0; n < 10 && seen.has(x.task); n++) x = make();
    seen.add(x.task);
    out.push({ unit: '', values: [], ...x, topic, level });
  }
  return out;
}

const TABLE = code([
  'des.  dvoj.  šestn.',
  ...Array.from({ length: 16 }, (_, n) => `${String(n).padStart(4)}  ${toBase(n, 2).padStart(4, '0')}   ${toBase(n, 16)}`),
]);

const NOTES = `## Poziční číselné soustavy
- V poziční soustavě záleží na **pozici** číslice: každá pozice má hodnotu mocniny **základu** z.
- Soustava se základem z používá číslice 0 až z − 1.
- **Desítková** (z = 10): 0–9. **Dvojková / binární** (z = 2): 0 a 1. **Osmičková / oktalová** (z = 8): 0–7. **Šestnáctková / hexadecimální** (z = 16): 0–9 a A–F, kde A = 10, B = 11, C = 12, D = 13, E = 14, F = 15.
- Základ se píše dolním indexem: 101₂, 17₈, 1F₁₆, 31₁₀.
## Převod do desítkové soustavy
- Číslo rozepíšeme podle mocnin základu. Pozice číslujeme zprava od 0.
- číslice · z^pozice, a všechno sečteme.
### Vzorový příklad
101101₂ = 1 · 2⁵ + 0 · 2⁴ + 1 · 2³ + 1 · 2² + 0 · 2¹ + 1 · 2⁰ = 32 + 8 + 4 + 1 = 45₁₀
2D₁₆ = 2 · 16¹ + 13 · 16⁰ = 32 + 13 = 45₁₀
## Převod z desítkové soustavy
- Číslo opakovaně **dělíme základem** a zapisujeme **zbytky**, dokud nevyjde podíl 0.
- Zbytky čteme **odspodu nahoru**. Ve šestnáctkové soustavě zbytky 10–15 píšeme jako A–F.
### Vzorový příklad
${code(['45 : 2 = 22   zbytek 1', '22 : 2 = 11   zbytek 0', '11 : 2 =  5   zbytek 1', ' 5 : 2 =  2   zbytek 1', ' 2 : 2 =  1   zbytek 0', ' 1 : 2 =  0   zbytek 1'])}
Odspodu: 45₁₀ = 101101₂
## Dvojková ↔ šestnáctková a osmičková
- 16 = 2⁴, proto jedna šestnáctková číslice odpovídá **čtyřem bitům**. 8 = 2³, proto jedna osmičková číslice odpovídá **třem bitům**.
- Z dvojkové: bity rozdělíme **zprava** do skupin po 4 (nebo 3), zleva doplníme nuly a každou skupinu převedeme na jednu číslici.
- Do dvojkové: každou číslici přepíšeme na 4 (nebo 3) bity.
- Mezi osmičkovou a šestnáctkovou soustavou se převádí přes dvojkovou.
### Vzorový příklad
101101₂ → 0010 1101 → 2D₁₆; 101101₂ → 101 101 → 55₈
### Tabulka 0–15
${TABLE}
## Sčítání ve dvojkové soustavě
- Sčítáme pod sebou zprava jako v desítkové soustavě.
- 0 + 0 = 0, 0 + 1 = 1, 1 + 1 = 10 (píšeme 0, 1 přenášíme), 1 + 1 + 1 = 11 (píšeme 1, 1 přenášíme).
- Výsledek si ověříme převodem do desítkové soustavy.
## Bity a bajty
- **Bit** je jedna dvojková číslice, **bajt** (byte) je 8 bitů.
- S n bity zapíšeme čísla 0 až 2ⁿ − 1, s jedním bajtem tedy 0 až 255 = FF₁₆.
- Mocniny dvojky: 2⁰ = 1, 2¹ = 2, 2² = 4, 2³ = 8, 2⁴ = 16, 2⁵ = 32, 2⁶ = 64, 2⁷ = 128, 2⁸ = 256, 2⁹ = 512, 2¹⁰ = 1024.`;

export function soustavyData(rand = Math.random) {
  return {
    title: 'Číselné soustavy',
    overview: 'Jak fungují poziční číselné soustavy a jak převádět čísla mezi desítkovou, dvojkovou, osmičkovou a šestnáctkovou soustavou. Příklady jsou vygenerované aplikací, takže výsledky i postupy jsou vždy správně a tlačítkem Nové příklady dostaneš novou sadu.',
    notes: NOTES,
    visuals: [],
    timeline: [],
    terms: [
      { term: 'poziční soustava', definition: 'Hodnota číslice závisí na její pozici, každá pozice je mocnina základu.' },
      { term: 'základ soustavy', definition: 'Počet různých číslic, které soustava používá (2, 8, 10, 16…).' },
      { term: 'bit', definition: 'Jedna číslice dvojkové soustavy, 0 nebo 1.' },
      { term: 'bajt', definition: 'Skupina 8 bitů, uloží čísla 0 až 255.' },
      { term: 'hexadecimální soustava', definition: 'Šestnáctková soustava s číslicemi 0–9 a A–F.' },
    ],
    answers: [],
    cards: [
      { type: 'cloze', text: '2¹⁰ = {{1024}}' },
      { type: 'cloze', text: '2⁸ = {{256}}' },
      { type: 'cloze', text: '1 bajt = {{8}} bitů' },
      { type: 'cloze', text: 'Největší číslo, které zapíšeme 8 bity, je {{255}}.' },
      { type: 'cloze', text: 'F₁₆ = {{15}}₁₀' },
      { type: 'cloze', text: 'A₁₆ = {{10}}₁₀' },
      { type: 'qa', q: 'Kolik bitů odpovídá jedné šestnáctkové číslici?', a: '4 bity, protože 16 = 2⁴.' },
      { type: 'qa', q: 'Kolik bitů odpovídá jedné osmičkové číslici?', a: '3 bity, protože 8 = 2³.' },
      { type: 'qa', q: 'Jak převedeš číslo z desítkové do dvojkové soustavy?', a: 'Opakovaně dělíš dvěma a zbytky čteš odspodu nahoru.' },
      { type: 'qa', q: 'Jak převedeš číslo do desítkové soustavy?', a: 'Rozepíšeš ho podle mocnin základu a sečteš.' },
      { type: 'choice', q: 'Kolik je 1111₂?', options: ['15', '16', '7', '31'], a: '15' },
      { type: 'choice', q: 'Kolik je FF₁₆?', options: ['255', '256', '15', '160'], a: '255' },
      { type: 'cloze', text: '1 + 1 ve dvojkové soustavě = {{10}}' },
    ],
    exercises: generateExercises(rand),
  };
}

// Built-in lessons by id; a subject gets one only when a starter kit or a setup asks for it.
const BUILT_IN = { soustavy: soustavyData };

/**
 * Adds a built-in lesson to a subject, once per subject.
 *
 * @param {object[]} lessons The account's lessons; mutated.
 * @param {string} subjectId Subject that gets the lesson.
 * @param {string} lessonId Built-in lesson id, for example 'soustavy'.
 * @param {number} [now] Timestamp for created/updated.
 * @returns {boolean} True when added; false for an unknown id or when the subject already has it.
 * @example
 * addBuiltInLesson(store.lessons, subject.id, 'soustavy');
 */
export function addBuiltInLesson(lessons, subjectId, lessonId, now = Date.now()) {
  const make = Object.hasOwn(BUILT_IN, lessonId) ? BUILT_IN[lessonId] : null;
  if (!make) return false;
  if (lessons.some(l => l.subjectId === subjectId && l.generator === lessonId)) return false;
  const data = make();
  // Keep the historical id for the first subject so existing accounts stay consistent; others get a unique one.
  const taken = lessons.some(l => l.id === `builtin-${lessonId}`);
  const id = taken ? `builtin-${lessonId}-${subjectId}` : `builtin-${lessonId}`;
  lessons.push({ id, subjectId, title: data.title, link: '', template: 'general', generator: lessonId, answer: '', data, progress: {}, created: now, updated: now });
  return true;
}

export const GENERATORS = { soustavy: generateExercises };
