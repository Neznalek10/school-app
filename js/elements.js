// All 118 elements with their Czech and Latin names, checked against cs.wikipedia "Seznam chemických prvků".
const DATA = `H vodík Hydrogenium
He helium Helium
Li lithium Lithium
Be beryllium Beryllium
B bor Borum
C uhlík Carboneum
N dusík Nitrogenium
O kyslík Oxygenium
F fluor Fluorum
Ne neon Neon
Na sodík Natrium
Mg hořčík Magnesium
Al hliník Aluminium
Si křemík Silicium
P fosfor Phosphorus
S síra Sulphur
Cl chlor Chlorum
Ar argon Argon
K draslík Kalium
Ca vápník Calcium
Sc skandium Scandium
Ti titan Titanium
V vanad Vanadium
Cr chrom Chromium
Mn mangan Manganum
Fe železo Ferrum
Co kobalt Cobaltum
Ni nikl Niccolum
Cu měď Cuprum
Zn zinek Zincum
Ga gallium Gallium
Ge germanium Germanium
As arsen Arsenicum
Se selen Selenium
Br brom Bromum
Kr krypton Krypton
Rb rubidium Rubidium
Sr stroncium Strontium
Y yttrium Yttrium
Zr zirkonium Zirconium
Nb niob Niobium
Mo molybden Molybdenum
Tc technecium Technetium
Ru ruthenium Ruthenium
Rh rhodium Rhodium
Pd palladium Palladium
Ag stříbro Argentum
Cd kadmium Cadmium
In indium Indium
Sn cín Stannum
Sb antimon Stibium
Te tellur Tellurium
I jod Iodum
Xe xenon Xenon
Cs cesium Caesium
Ba baryum Barium
La lanthan Lanthanum
Ce cer Cerium
Pr praseodym Praseodymium
Nd neodym Neodymium
Pm promethium Promethium
Sm samarium Samarium
Eu europium Europium
Gd gadolinium Gadolinium
Tb terbium Terbium
Dy dysprosium Dysprosium
Ho holmium Holmium
Er erbium Erbium
Tm thulium Thulium
Yb ytterbium Ytterbium
Lu lutecium Lutetium
Hf hafnium Hafnium
Ta tantal Tantalum
W wolfram Wolframium
Re rhenium Rhenium
Os osmium Osmium
Ir iridium Iridium
Pt platina Platinum
Au zlato Aurum
Hg rtuť Hydrargyrum
Tl thallium Thallium
Pb olovo Plumbum
Bi bismut Bisemutum
Po polonium Polonium
At astat Astatinum
Rn radon Radon
Fr francium Francium
Ra radium Radium
Ac aktinium Actinium
Th thorium Thorium
Pa protaktinium Protactinium
U uran Uranium
Np neptunium Neptunium
Pu plutonium Plutonium
Am americium Americium
Cm curium Curium
Bk berkelium Berkelium
Cf kalifornium Californium
Es einsteinium Einsteinium
Fm fermium Fermium
Md mendelevium Mendelevium
No nobelium Nobelium
Lr lawrencium Lawrencium
Rf rutherfordium Rutherfordium
Db dubnium Dubnium
Sg seaborgium Seaborgium
Bh bohrium Bohrium
Hs hassium Hassium
Mt meitnerium Meitnerium
Ds darmstadtium Darmstadtium
Rg roentgenium Roentgenium
Cn kopernicium Copernicium
Nh nihonium Nihonium
Fl flerovium Flerovium
Mc moscovium Moscovium
Lv livermorium Livermorium
Ts tennessin Tennessine
Og oganesson Oganesson`;

// Other spellings that are still common in Czech textbooks.
const ALSO = { Ba: ['barium'] };

const PERIOD_ENDS = [2, 10, 18, 36, 54, 86, 118];

export const CATEGORIES = {
  alkali: 'alkalické kovy',
  earth: 'kovy alkalických zemin',
  transition: 'přechodné kovy',
  lanthanoid: 'lanthanoidy',
  actinoid: 'aktinoidy',
  metal: 'ostatní kovy',
  metalloid: 'polokovy',
  nonmetal: 'nekovy',
  halogen: 'halogeny',
  noble: 'vzácné plyny',
};

const NONMETALS = ['H', 'C', 'N', 'O', 'P', 'S', 'Se'];
const METALLOIDS = ['B', 'Si', 'Ge', 'As', 'Sb', 'Te'];

function place(z) {
  const period = PERIOD_ENDS.findIndex(end => z <= end) + 1;
  const offset = z - (PERIOD_ENDS[period - 2] || 0);
  if (period === 1) return { period, group: z === 1 ? 1 : 18 };
  if (period <= 3) return { period, group: offset <= 2 ? offset : offset + 10 };
  if (period <= 5) return { period, group: offset };
  if (offset <= 2) return { period, group: offset };
  // La–Lu and Ac–Lr sit in the two rows under the table, so they have no group column.
  if (offset <= 17) return { period, group: null, fcol: offset };
  return { period, group: offset - 14 };
}

function categoryOf(symbol, z, group, fcol) {
  if (fcol) return z < 89 ? 'lanthanoid' : 'actinoid';
  if (group === 18) return 'noble';
  if (group === 17) return 'halogen';
  if (NONMETALS.includes(symbol)) return 'nonmetal';
  if (METALLOIDS.includes(symbol)) return 'metalloid';
  if (group === 1) return 'alkali';
  if (group === 2) return 'earth';
  if (group >= 3 && group <= 12) return 'transition';
  return 'metal';
}

export const ELEMENTS = DATA.split('\n').map((line, i) => {
  const [symbol, name, latin] = line.split(' ');
  const z = i + 1;
  const { period, group, fcol } = place(z);
  return { z, symbol, name, latin, period, group, fcol: fcol || null, category: categoryOf(symbol, z, group, fcol), names: [name, ...(ALSO[symbol] || [])] };
});

export const element = symbol => ELEMENTS.find(e => e.symbol === symbol);

const BASIC = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Cr Mn Fe Co Ni Cu Zn Br Ag Sn I Ba W Pt Au Hg Pb U'.split(' ');
const HIGH_EXTRA = 'La W Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra U Pu'.split(' ');

export const ELEMENT_SETS = {
  zs: { label: 'Základní škola', hint: `${BASIC.length} nejběžnějších prvků`, has: e => BASIC.includes(e.symbol) },
  ss: { label: 'Střední škola', hint: 'Prvky 1–56 a důležité těžké prvky', has: e => e.z <= 56 || HIGH_EXTRA.includes(e.symbol) },
  all: { label: 'Všechny', hint: 'Všech 118 prvků', has: () => true },
};

export const elementsIn = set => ELEMENTS.filter(ELEMENT_SETS[set].has);

// Grid position in an 18-column table: the f-block rows go below, after one empty row.
export function cellOf(e) {
  if (e.fcol) return { col: e.fcol, row: e.period === 6 ? 9 : 10 };
  return { col: e.group, row: e.period };
}
