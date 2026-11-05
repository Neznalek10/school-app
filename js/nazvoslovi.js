import { check } from './check.js';
import { pickSession, shuffle } from './srs.js';
import { esc } from './ui.js';

// Inorganic nomenclature as taught at Czech schools, with the categories of nazvoslovi.cz.
// Most compounds are generated from a cation and an anion, so the formula, the name and the explanation always agree.
// The rest are fixed examples, mostly the ones nazvoslovi.cz itself uses.

export const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export const ENDINGS = [
  null,
  { cation: '-ný', acid: '-ná', anion: '-nan' },
  { cation: '-natý', acid: '-natá', anion: '-natan' },
  { cation: '-itý', acid: '-itá', anion: '-itan' },
  { cation: '-ičitý', acid: '-ičitá', anion: '-ičitan' },
  { cation: '-ičný, -ečný', acid: '-ičná, -ečná', anion: '-ičnan, -ečnan' },
  { cation: '-ový', acid: '-ová', anion: '-an' },
  { cation: '-istý', acid: '-istá', anion: '-istan' },
  { cation: '-ičelý', acid: '-ičelá', anion: '-ičelan' },
];
export const PREFIXES = { 1: 'mono', 2: 'di', 3: 'tri', 4: 'tetra', 5: 'penta', 6: 'hexa', 7: 'hepta', 8: 'okta', 9: 'nona', 10: 'deka', 12: 'dodeka', 18: 'oktadeka' };

export const LEVELS_CZ = { z: 'Základní škola', s: 'Střední škola', v: 'Vysoká škola' };
const RANK = { z: 0, s: 1, v: 2 };
export const within = (level, itemLevel) => RANK[itemLevel] <= RANK[level];
const higher = (...levels) => levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'z');

// The categories and subcategories of nazvoslovi.cz; a subcategory's level is where it first appears.
export const CATEGORIES = [
  { id: 'oxidy', label: 'Oxidy', subs: [['oxidy', 'Oxidy', 'z'], ['podvojne-oxidy', 'Podvojné oxidy', 's']] },
  { id: 'hydroxidy', label: 'Hydroxidy', subs: [['hydroxidy', 'Hydroxidy', 'z']] },
  { id: 'kyslik', label: 'Další sloučeniny kyslíku', subs: [['hyperoxidy', 'Hyperoxidy', 's'], ['ozonidy', 'Ozonidy', 'v'], ['peroxidy', 'Peroxidy', 's'], ['hydrogenperoxidy', 'Hydrogenperoxidy', 'v']] },
  {
    id: 'nekovy',
    label: 'Sloučeniny nekovů a polokovů',
    subs: [['boridy', 'Boridy', 'v'], ['acetylidy', 'Acetylidy', 's'], ['karbidy', 'Karbidy', 's'], ['silicidy', 'Silicidy', 'v'], ['nitridy', 'Nitridy', 's'], ['amidy', 'Amidy', 'v'], ['imidy', 'Imidy', 'v'], ['fosfidy', 'Fosfidy', 's'], ['arsenidy', 'Arsenidy', 'v']],
  },
  { id: 'hydridy', label: 'Hydridy', subs: [['iontove-hydridy', 'Iontové hydridy', 's'], ['kovalentni-hydridy', 'Kovalentní hydridy', 's']] },
  { id: 'bezkyslikate', label: 'Bezkyslíkaté kyseliny', subs: [['bezkyslikate', 'Bezkyslíkaté kyseliny', 'z']] },
  {
    id: 'kyslikate',
    label: 'Kyslíkaté kyseliny',
    subs: [['kyslikate', 'Kyslíkaté kyseliny', 'z'], ['thiokyseliny', 'Thiokyseliny', 's'], ['peroxokyseliny', 'Peroxokyseliny', 'v'], ['halogenkyseliny', 'Halogenkyseliny', 'v'], ['amidokyseliny', 'Amidokyseliny', 'v'], ['isopolykyseliny', 'Isopolykyseliny', 's']],
  },
  { id: 'halogenidy', label: 'Halogenidy', subs: [['halogenidy', 'Halogenidy', 'z']] },
  { id: 'sulfidy', label: 'Sulfidy', subs: [['sulfidy', 'Sulfidy', 'z'], ['hydrogensulfidy', 'Hydrogensulfidy', 's'], ['disulfidy', 'Disulfidy', 's']] },
  {
    id: 'dalsi-soli',
    label: 'Další soli bezkyslíkatých kyselin',
    subs: [['telluridy', 'Telluridy', 'v'], ['hydrogentelluridy', 'Hydrogentelluridy', 'v'], ['selenidy', 'Selenidy', 's'], ['hydrogenselenidy', 'Hydrogenselenidy', 'v'], ['kyanidy', 'Kyanidy', 's'], ['azidy', 'Azidy', 'v']],
  },
  { id: 'soli', label: 'Soli kyslíkatých kyselin', subs: [['soli', 'Soli', 'z'], ['hydrogensoli', 'Hydrogensoli', 's'], ['thiosoli', 'Thiosoli', 's'], ['podvojne-soli', 'Podvojné soli', 's'], ['smisene-soli', 'Smíšené soli', 'v']] },
  { id: 'derivaty', label: 'Funkční deriváty kyselin', subs: [['derivaty', 'Funkční deriváty kyselin', 'v']] },
  { id: 'ionty', label: 'Ionty a atomové skupiny', subs: [['kationty', 'Kationty', 's'], ['anionty', 'Anionty', 's'], ['atomove-skupiny', 'Atomové skupiny', 'v']] },
  { id: 'hydraty', label: 'Krystalohydráty', subs: [['hydraty', 'Krystalohydráty', 's']] },
  { id: 'komplexy', label: 'Komplexní sloučeniny', subs: [['komplexy', 'Komplexní sloučeniny', 's']] },
];
export const GROUPS = CATEGORIES.flatMap(c => c.subs.map(([id, label, level]) => ({ id, label, level, category: c.id })));
export const groupOf = id => GROUPS.find(g => g.id === id);
export const categoryOf = id => CATEGORIES.find(c => c.id === id);

// symbol, oxidation number, adjective, where it is used, level.
// o oxid · h all halides · c fluoride and chloride only · f fluoride only · s sulfid · x hydroxid · a salts · y hydrogen salts · p peroxid · d hydrid
const CATIONS = `
Li 1 lithný ohsxaypd z
Na 1 sodný ohsxaypd z
K 1 draselný ohsxaypd z
Rb 1 rubidný ohsxa s
Cs 1 cesný ohsxa s
Ag 1 stříbrný ohsa z
Cu 1 měďný ohs s
NH4 1 amonný hsay z
N 1 dusný o s
Cl 1 chlorný o s
Be 2 beryllnatý ohxad s
Mg 2 hořečnatý ohsxaypd z
Ca 2 vápenatý ohsxaypd z
Sr 2 strontnatý ohsxapd s
Ba 2 barnatý ohsxaypd z
Zn 2 zinečnatý ohsxa z
Cd 2 kademnatý ohsxa s
Hg 2 rtuťnatý ohsa s
Cu 2 měďnatý ohsxa z
Fe 2 železnatý ohsxa z
Co 2 kobaltnatý ohsxa s
Ni 2 nikelnatý ohsxa s
Mn 2 manganatý ohsxa s
Pb 2 olovnatý ohsxa z
Sn 2 cínatý ohsxa s
C 2 uhelnatý o z
N 2 dusnatý o z
Al 3 hlinitý ohsxa z
Fe 3 železitý ohsxa z
Cr 3 chromitý ohsxa s
Co 3 kobaltitý o s
Bi 3 bismutitý ohsxa s
Au 3 zlatitý oh s
B 3 boritý ohs s
Ga 3 gallitý oh s
N 3 dusitý o s
P 3 fosforitý oh s
As 3 arsenitý ohs s
Sb 3 antimonitý ohs s
Mn 3 manganitý o s
C 4 uhličitý ohs z
Si 4 křemičitý oh z
Sn 4 cíničitý ohs s
Pb 4 olovičitý oc s
Ti 4 titaničitý oh s
Mn 4 manganičitý o z
S 4 siřičitý o z
S 4 siřičitý f s
Se 4 seleničitý o s
N 4 dusičitý o z
Ge 4 germaničitý oh s
Te 4 telluričitý o s
Cl 4 chloričitý o s
Zr 4 zirkoničitý oh s
P 5 fosforečný ocs z
N 5 dusičný o s
V 5 vanadičný o s
As 5 arseničný os s
Sb 5 antimoničný oc s
I 5 jodičný o s
S 6 sírový o z
S 6 sírový f s
Cr 6 chromový o s
Mo 6 molybdenový o s
W 6 wolframový oc s
Se 6 selenový o s
Te 6 tellurový o s
U 6 uranový of s
Cl 7 chloristý o s
Mn 7 manganistý o s
I 7 jodistý o s
Re 7 rhenistý o s
Os 8 osmičelý o s
Ru 8 rutheničelý o s
Xe 8 xenoničelý o s`.trim().split('\n').map(line => {
  const [symbol, ox, adj, uses, level] = line.split(' ');
  return { symbol, ox: Number(ox), adj, uses, level };
});
const cationOf = (symbol, ox) => CATIONS.find(c => c.symbol === symbol && c.ox === ox);
const cationsFrom = list => list.split(' ').map(s => {
  const [symbol, ox] = s.split(':');
  return cationOf(symbol, Number(ox));
});

const BINARY_ANIONS = {
  O: { symbol: 'O', charge: 2, noun: 'oxid', rule: 'Kyslík má v oxidech vždy −II.' },
  S: { symbol: 'S', charge: 2, noun: 'sulfid', rule: 'Síra má v sulfidech −II (sulfidy vznikají z H₂S odtržením obou vodíků).' },
  F: { symbol: 'F', charge: 1, noun: 'fluorid', rule: 'Fluor má v halogenidech −I.' },
  Cl: { symbol: 'Cl', charge: 1, noun: 'chlorid', rule: 'Chlor má v halogenidech −I.' },
  Br: { symbol: 'Br', charge: 1, noun: 'bromid', rule: 'Brom má v halogenidech −I.' },
  I: { symbol: 'I', charge: 1, noun: 'jodid', rule: 'Jod má v halogenidech −I.' },
  H: { symbol: 'H', charge: 1, noun: 'hydrid', rule: 'Vodík má v hydridech kovů −I.' },
};

// Anions that combine with a cation like O or Cl do: subgroup, anion, the cations used.
const SIMPLE_ANIONS = [
  ['hyperoxidy', { symbol: 'O2', charge: 1, noun: 'hyperoxid', alt: 'superoxid', rule: 'Hyperoxidový anion O₂⁻ má náboj −I (pro celou skupinu O₂).' }, 'Na:1 K:1 Rb:1 Cs:1'],
  ['ozonidy', { symbol: 'O3', charge: 1, noun: 'ozonid', rule: 'Ozonidový anion O₃⁻ má náboj −I (pro celou skupinu O₃).' }, 'Li:1 Na:1 K:1 Rb:1 Cs:1'],
  ['hydrogenperoxidy', { symbol: 'HO2', charge: 1, noun: 'hydrogenperoxid', rule: 'Hydrogenperoxidový anion HO₂⁻ vznikne z H₂O₂ odtržením jednoho vodíku, náboj −I.' }, 'Li:1 Na:1 K:1'],
  ['acetylidy', { symbol: 'C2', charge: 2, noun: 'acetylid', rule: 'Acetylidový anion C₂²⁻ vznikne z acetylenu C₂H₂ odtržením obou vodíků, náboj −II.' }, 'Li:1 Na:1 K:1 Ag:1 Cu:1 Mg:2 Ca:2 Sr:2 Ba:2'],
  ['karbidy', { symbol: 'C', charge: 4, noun: 'karbid', rule: 'Karbidový anion C⁴⁻ je odvozený od methanu CH₄, uhlík má −IV.' }, 'Be:2 Al:3 Si:4'],
  ['nitridy', { symbol: 'N', charge: 3, noun: 'nitrid', rule: 'Nitridový anion N³⁻ je odvozený od amoniaku NH₃, dusík má −III.' }, 'Li:1 Na:1 Mg:2 Ca:2 Ba:2 Al:3 Ga:3 B:3 Si:4'],
  ['amidy', { symbol: 'NH2', charge: 1, noun: 'amid', rule: 'Amidová skupina NH₂⁻ vznikne z amoniaku NH₃ odtržením jednoho vodíku, náboj −I.' }, 'Li:1 Na:1 K:1 Ca:2 Ba:2'],
  ['imidy', { symbol: 'NH', charge: 2, noun: 'imid', rule: 'Imidová skupina NH²⁻ vznikne z amoniaku NH₃ odtržením dvou vodíků, náboj −II.' }, 'Li:1 Na:1 Ca:2 Sr:2 Ba:2'],
  ['fosfidy', { symbol: 'P', charge: 3, noun: 'fosfid', rule: 'Fosfidový anion P³⁻ je odvozený od fosfanu PH₃, fosfor má −III.' }, 'Na:1 K:1 Mg:2 Ca:2 Zn:2 Al:3 Ga:3'],
  ['arsenidy', { symbol: 'As', charge: 3, noun: 'arsenid', rule: 'Arsenidový anion As³⁻ je odvozený od arsanu AsH₃, arsen má −III.' }, 'Na:1 K:1 Mg:2 Zn:2 Al:3 Ga:3'],
  ['hydrogensulfidy', { symbol: 'HS', charge: 1, noun: 'hydrogensulfid', rule: 'Hydrogensulfidový anion HS⁻ vznikne z H₂S odtržením jednoho vodíku, náboj −I.' }, 'Li:1 Na:1 K:1 NH4:1 Mg:2 Ca:2 Ba:2'],
  ['disulfidy', { symbol: 'S2', charge: 2, noun: 'disulfid', rule: 'Disulfidový anion S₂²⁻ má náboj −II (pro celou skupinu S₂).' }, 'Na:1 K:1 NH4:1 Ba:2 Fe:2'],
  ['telluridy', { symbol: 'Te', charge: 2, noun: 'tellurid', rule: 'Telluridový anion Te²⁻ vznikne z tellanu H₂Te odtržením obou vodíků, náboj −II.' }, 'Na:1 K:1 Ag:1 Zn:2 Cd:2 Ba:2 Pb:2 As:3 Bi:3'],
  ['hydrogentelluridy', { symbol: 'HTe', charge: 1, noun: 'hydrogentellurid', rule: 'Hydrogentelluridový anion HTe⁻ vznikne z H₂Te odtržením jednoho vodíku, náboj −I.' }, 'Li:1 Na:1 K:1'],
  ['selenidy', { symbol: 'Se', charge: 2, noun: 'selenid', rule: 'Selenidový anion Se²⁻ vznikne ze selanu H₂Se odtržením obou vodíků, náboj −II.' }, 'Na:1 K:1 Ag:1 Zn:2 Cd:2 Ba:2 Pb:2 Al:3'],
  ['hydrogenselenidy', { symbol: 'HSe', charge: 1, noun: 'hydrogenselenid', rule: 'Hydrogenselenidový anion HSe⁻ vznikne z H₂Se odtržením jednoho vodíku, náboj −I.' }, 'Li:1 Na:1 K:1'],
  ['kyanidy', { symbol: 'CN', charge: 1, noun: 'kyanid', rule: 'Kyanidový anion CN⁻ vznikne z kyseliny kyanovodíkové HCN, náboj −I.' }, 'Li:1 Na:1 K:1 NH4:1 Ag:1 Cu:1 Ca:2 Ba:2 Zn:2 Hg:2 Pb:2 Ni:2'],
  ['azidy', { symbol: 'N3', charge: 1, noun: 'azid', rule: 'Azidový anion N₃⁻ vznikne z azidovodíku HN₃, náboj −I.' }, 'Li:1 Na:1 K:1 Ag:1 Ca:2 Ba:2 Pb:2'],
];

// formula, charge, salt noun, acid adjective, level, the acid's other common name.
const ANIONS = `
NO3 1 dusičnan dusičná z
NO2 1 dusitan dusitá z
SO4 2 síran sírová z
SO3 2 siřičitan siřičitá z
CO3 2 uhličitan uhličitá z
PO4 3 fosforečnan trihydrogenfosforečná z fosforečná
SiO3 2 křemičitan křemičitá z
ClO 1 chlornan chlorná z
ClO3 1 chlorečnan chlorečná z
ClO4 1 chloristan chloristá z
MnO4 1 manganistan manganistá z
ClO2 1 chloritan chloritá s
BrO 1 bromnan bromná s
BrO3 1 bromičnan bromičná s
BrO4 1 bromistan bromistá s
IO 1 jodnan jodná s
IO3 1 jodičnan jodičná s
IO4 1 jodistan jodistá s
SeO3 2 seleničitan seleničitá s
SeO4 2 selenan selenová s
MnO4 2 manganan manganová s
CrO4 2 chroman chromová s
Cr2O7 2 dichroman dichromová s
AsO4 3 arseničnan trihydrogenarseničná s arseničná
BO3 3 boritan trihydrogenboritá s boritá`.trim().split('\n').map(line => {
  const [formula, charge, noun, acid, level, alt] = line.split(' ');
  const h = Number(charge);
  return { formula, charge: h, noun, acid, level, alt, acidFormula: `H${h > 1 ? h : ''}${formula}` };
});

const THIO_ANIONS = [
  { formula: 'S2O3', charge: 2, noun: 'thiosíran', acid: 'thiosírová', acidFormula: 'H2S2O3', level: 's' },
  { formula: 'SCN', charge: 1, noun: 'thiokyanatan', acid: 'thiokyanatá', acidFormula: 'HSCN', level: 's' },
];

// Acid anions keep some of the acid's hydrogens.
const HYDROGEN_ANIONS = [
  { formula: 'HSO4', charge: 1, noun: 'hydrogensíran', acidFormula: 'H2SO4', acid: 'sírová', left: 1 },
  { formula: 'HSO3', charge: 1, noun: 'hydrogensiřičitan', acidFormula: 'H2SO3', acid: 'siřičitá', left: 1 },
  { formula: 'HCO3', charge: 1, noun: 'hydrogenuhličitan', acidFormula: 'H2CO3', acid: 'uhličitá', left: 1 },
  { formula: 'HPO4', charge: 2, noun: 'hydrogenfosforečnan', acidFormula: 'H3PO4', acid: 'trihydrogenfosforečná', left: 1 },
  { formula: 'H2PO4', charge: 1, noun: 'dihydrogenfosforečnan', acidFormula: 'H3PO4', acid: 'trihydrogenfosforečná', left: 2 },
];

const EXTRA_ACIDS = [
  ['kyslikate', 'H4SiO4', 'kyselina tetrahydrogenkřemičitá', 's'],
  ['kyslikate', 'H5IO6', 'kyselina pentahydrogenjodistá', 's'],
  ['kyslikate', 'H2TeO4', 'kyselina tellurová', 's'],
  ['kyslikate', 'H6TeO6', 'kyselina hexahydrogentellurová', 's'],
  ['isopolykyseliny', 'H2S2O5', 'kyselina disiřičitá', 's'],
  ['isopolykyseliny', 'H2S2O7', 'kyselina disírová', 's'],
  ['isopolykyseliny', 'H4P2O7', 'kyselina tetrahydrogendifosforečná', 's'],
  ['isopolykyseliny', 'H5P3O10', 'kyselina pentahydrogentrifosforečná', 'v'],
  ['isopolykyseliny', 'H2B4O7', 'kyselina tetraboritá', 'v'],
];

const THIO = 'Předpona thio- znamená, že atom kyslíku je nahrazen atomem síry (di-, tri- udává kolik).';
const PEROXO = 'Předpona peroxo- znamená, že jeden kyslík O²⁻ je nahrazen peroxidovou skupinou O₂²⁻, takže ve vzorci přibude jeden kyslík.';
const HALOGENO = 'Předpona chloro-, fluoro-, bromo- znamená, že skupina OH kyseliny je nahrazena halogenem.';
const AMIDO = 'Předpona amido- znamená, že skupina OH kyseliny je nahrazena amidovou skupinou NH₂.';

// subgroup, formula, name, level, steps, other accepted names
const SPECIAL_ACIDS = [
  ['thiokyseliny', 'HSCN', 'kyselina thiokyanatá', 's', [THIO, `Kyselina kyanatá je HOCN, kyslík nahradíme sírou → <b>${'HSCN'}</b>.`]],
  ['thiokyseliny', 'H3PO2S2', 'kyselina trihydrogendithiofosforečná', 'v', [THIO, 'Z kyseliny trihydrogenfosforečné H₃PO₄ nahradíme dva kyslíky sírou (dithio-) → <b>H₃PO₂S₂</b>.']],
  ['thiokyseliny', 'H2CS3', 'kyselina trithiouhličitá', 'v', [THIO, 'Z kyseliny uhličité H₂CO₃ nahradíme tři kyslíky sírou (trithio-) → <b>H₂CS₃</b>.']],
  ['peroxokyseliny', 'HNO4', 'kyselina peroxodusičná', 'v', [PEROXO, 'Z kyseliny dusičné HNO₃ vznikne <b>HNO₄</b>.']],
  ['peroxokyseliny', 'H2SO5', 'kyselina peroxosírová', 'v', [PEROXO, 'Z kyseliny sírové H₂SO₄ vznikne <b>H₂SO₅</b>.']],
  ['peroxokyseliny', 'H2S2O8', 'kyselina peroxodisírová', 'v', [PEROXO, 'Z kyseliny disírové H₂S₂O₇ vznikne <b>H₂S₂O₈</b>.']],
  ['peroxokyseliny', 'H2CO5', 'kyselina diperoxouhličitá', 'v', [PEROXO, 'Diperoxo- = dvě peroxidové skupiny: z kyseliny uhličité H₂CO₃ vznikne <b>H₂CO₅</b>.']],
  ['halogenkyseliny', 'HSO3Cl', 'kyselina chlorosírová', 'v', [HALOGENO, 'Kyselina sírová H₂SO₄ = SO₂(OH)₂, jednu skupinu OH nahradíme chlorem → <b>HSO₃Cl</b>.']],
  ['halogenkyseliny', 'HSO3F', 'kyselina fluorosírová', 'v', [HALOGENO, 'Kyselina sírová H₂SO₄ = SO₂(OH)₂, jednu skupinu OH nahradíme fluorem → <b>HSO₃F</b>.']],
  ['halogenkyseliny', 'HPO2F2', 'kyselina difluorofosforečná', 'v', [HALOGENO, 'Kyselina trihydrogenfosforečná H₃PO₄ = PO(OH)₃, dvě skupiny OH nahradíme fluorem (difluoro-) → <b>HPO₂F₂</b>.']],
  ['halogenkyseliny', 'H2PO3Br', 'kyselina bromofosforečná', 'v', [HALOGENO, 'Kyselina trihydrogenfosforečná H₃PO₄ = PO(OH)₃, jednu skupinu OH nahradíme bromem → <b>H₂PO₃Br</b>.']],
  ['amidokyseliny', 'HSO3NH2', 'kyselina amidosírová', 'v', [AMIDO, 'Kyselina sírová H₂SO₄ = SO₂(OH)₂, jednu skupinu OH nahradíme skupinou NH₂ → <b>HSO₃NH₂</b>.']],
  ['amidokyseliny', 'H2PO3NH2', 'kyselina amidofosforečná', 'v', [AMIDO, 'Kyselina trihydrogenfosforečná H₃PO₄ = PO(OH)₃, jednu skupinu OH nahradíme skupinou NH₂ → <b>H₂PO₃NH₂</b>.']],
  ['amidokyseliny', 'HAsO2(NH2)2', 'kyselina diamidoarseničná', 'v', [AMIDO, 'Kyselina trihydrogenarseničná H₃AsO₄ = AsO(OH)₃, dvě skupiny OH nahradíme skupinami NH₂ (diamido-) → <b>HAsO₂(NH₂)₂</b>.']],
];

const OXYGEN_FREE = [
  ['HF', 'kyselina fluorovodíková', 'z', 'fluorovodíku', 'Fluor má −I, takže stačí jeden vodík.'],
  ['HCl', 'kyselina chlorovodíková', 'z', 'chlorovodíku', 'Chlor má −I, takže stačí jeden vodík. Lidově se jí říká kyselina solná.', ['kyselina solná']],
  ['HBr', 'kyselina bromovodíková', 'z', 'bromovodíku', 'Brom má −I, takže stačí jeden vodík.'],
  ['HI', 'kyselina jodovodíková', 'z', 'jodovodíku', 'Jod má −I, takže stačí jeden vodík.'],
  ['H2S', 'kyselina sulfanová', 'z', 'sulfanu', 'Síra má −II, takže potřebuje dva vodíky. Dříve se říkalo kyselina sirovodíková.', ['kyselina sirovodíková']],
  ['HCN', 'kyselina kyanovodíková', 's', 'kyanovodíku', 'Skupina CN (kyanid) má náboj −I, takže stačí jeden vodík.'],
];

const HYDRIDE_RULES = {
  g3: 'Hydrid prvku III.A skupiny: kmen názvu prvku + -an, počet vodíků = číslo skupiny (3).',
  g4: 'Hydrid prvku IV.A skupiny: kmen názvu prvku + -an, počet vodíků = číslo skupiny (4).',
  g5: 'Hydrid prvku V.A skupiny: kmen názvu prvku + -an, počet vodíků = 8 − 5 = 3.',
  g6: 'Hydrid prvku VI.A skupiny: kmen názvu prvku + -an, počet vodíků = 8 − 6 = 2. Vodík se píše vlevo.',
  g7: 'Halogenovodík: vzorec HX, název = název halogenu s koncovkou -o + vodík.',
  triv: 'Výjimka s triviálním názvem, který se učí zpaměti.',
};
// formula, name, rule, level, other names, more atoms of the element (named by a prefix)
const COVALENT_HYDRIDES = [
  ['BH3', 'boran', 'g3', 's'], ['B2H6', 'diboran', 'g3', 's', [], true], ['B10H14', 'dekaboran', 'g3', 'v', [], true], ['AlH3', 'alan', 'g3', 's', ['hydrid hlinitý']],
  ['CH4', 'methan', 'triv', 's', ['metan']], ['SiH4', 'silan', 'g4', 's'], ['Si2H6', 'disilan', 'g4', 'v', [], true], ['Si4H10', 'tetrasilan', 'g4', 'v', [], true],
  ['GeH4', 'german', 'g4', 's'], ['SnH4', 'stannan', 'g4', 's'], ['Sn2H6', 'distannan', 'g4', 'v', [], true],
  ['NH3', 'amoniak', 'triv', 's', ['azan', 'čpavek']], ['N2H4', 'hydrazin', 'triv', 's', ['diazan']], ['HN3', 'azidovodík', 'triv', 'v', ['azoimid']],
  ['PH3', 'fosfan', 'g5', 's'], ['P2H4', 'difosfan', 'g5', 'v', [], true], ['AsH3', 'arsan', 'g5', 's'], ['SbH3', 'stiban', 'g5', 'v'],
  ['H2O', 'voda', 'triv', 's', ['oxidan']], ['H2S', 'sulfan', 'g6', 's'], ['H2Se', 'selan', 'g6', 's'], ['H2Te', 'tellan', 'g6', 'v'],
  ['HF', 'fluorovodík', 'g7', 's'], ['HCl', 'chlorovodík', 'g7', 's'], ['HBr', 'bromovodík', 'g7', 's'], ['HI', 'jodovodík', 'g7', 's'],
];

// Non-stoichiometric compounds have the counts in the name and the metal in the 2nd case.
const NONSTOICH = [
  ['boridy', 'Mg3B2', 'diborid trihořčíku'], ['boridy', 'Mo2B', 'borid dimolybdenu'], ['boridy', 'UB4', 'tetraborid uranu'],
  ['boridy', 'MgB2', 'diborid hořčíku'], ['boridy', 'CaB6', 'hexaborid vápníku'], ['boridy', 'TiB2', 'diborid titanu'],
  ['silicidy', 'CrSi2', 'disilicid chromu'], ['silicidy', 'U3Si2', 'disilicid triuranu'], ['silicidy', 'Mg2Si', 'silicid dihořčíku'],
  ['silicidy', 'CaSi2', 'disilicid vápníku'], ['silicidy', 'FeSi', 'silicid železa'],
  ['karbidy', 'Fe3C', 'karbid triželeza'], ['karbidy', 'WC', 'karbid wolframu'], ['karbidy', 'B4C', 'karbid tetraboru'],
  ['fosfidy', 'Fe2P', 'fosfid diželeza'], ['fosfidy', 'CuP2', 'difosfid mědi'],
  ['arsenidy', 'Fe2As', 'arsenid diželeza'], ['arsenidy', 'NiAs2', 'diarsenid niklu'],
];

// formula, name, cations [symbol, oxidation number, count, adjective], oxygens
const DOUBLE_OXIDES = [
  ['Fe3O4', 'tetraoxid železnato-železitý', [['Fe', 2, 1, 'železnatý'], ['Fe', 3, 2, 'železitý']], 4],
  ['FeCr2O4', 'tetraoxid železnato-chromitý', [['Fe', 2, 1, 'železnatý'], ['Cr', 3, 2, 'chromitý']], 4],
  ['MgAl2O4', 'tetraoxid hořečnato-hlinitý', [['Mg', 2, 1, 'hořečnatý'], ['Al', 3, 2, 'hlinitý']], 4],
  ['MnPt2O4', 'tetraoxid manganato-platitý', [['Mn', 2, 1, 'manganatý'], ['Pt', 3, 2, 'platitý']], 4],
  ['MgTiO3', 'trioxid hořečnato-titaničitý', [['Mg', 2, 1, 'hořečnatý'], ['Ti', 4, 1, 'titaničitý']], 3],
  ['CaTiO3', 'trioxid vápenato-titaničitý', [['Ca', 2, 1, 'vápenatý'], ['Ti', 4, 1, 'titaničitý']], 3],
  ['FeTiO3', 'trioxid železnato-titaničitý', [['Fe', 2, 1, 'železnatý'], ['Ti', 4, 1, 'titaničitý']], 3],
  ['BePbO3', 'trioxid beryllnato-olovičitý', [['Be', 2, 1, 'beryllnatý'], ['Pb', 4, 1, 'olovičitý']], 3],
  ['KVO3', 'trioxid draselno-vanadičný', [['K', 1, 1, 'draselný'], ['V', 5, 1, 'vanadičný']], 3],
  ['NaNH4O', 'oxid sodno-amonný', [['Na', 1, 1, 'sodný'], ['NH4', 1, 1, 'amonný']], 1],
];

// formula, name, cations, anion [formula, charge, count, noun]
const DOUBLE_SALTS = [
  ['KAl(SO4)2', 'síran draselno-hlinitý', [['K', 1, 1, 'draselný'], ['Al', 3, 1, 'hlinitý']], ['SO4', 2, 2, 'síran']],
  ['KCr(SO4)2', 'síran draselno-chromitý', [['K', 1, 1, 'draselný'], ['Cr', 3, 1, 'chromitý']], ['SO4', 2, 2, 'síran']],
  ['NH4Fe(SO4)2', 'síran amonno-železitý', [['NH4', 1, 1, 'amonný'], ['Fe', 3, 1, 'železitý']], ['SO4', 2, 2, 'síran']],
  ['CaMg(CO3)2', 'uhličitan vápenato-hořečnatý', [['Ca', 2, 1, 'vápenatý'], ['Mg', 2, 1, 'hořečnatý']], ['CO3', 2, 2, 'uhličitan']],
  ['NH4MgPO4', 'fosforečnan amonno-hořečnatý', [['NH4', 1, 1, 'amonný'], ['Mg', 2, 1, 'hořečnatý']], ['PO4', 3, 1, 'fosforečnan']],
  ['NaNH4HPO4', 'hydrogenfosforečnan sodno-amonný', [['Na', 1, 1, 'sodný'], ['NH4', 1, 1, 'amonný']], ['HPO4', 2, 1, 'hydrogenfosforečnan']],
];

const MIXED = 'Smíšená sůl má jeden druh kationtu a dva různé anionty. V názvu jsou anionty spojené pomlčkou.';
const MIXED_SALTS = [
  ['MgCl(OH)', 'chlorid-hydroxid hořečnatý', 'Cl⁻ a OH⁻ dávají −2, to vyrovná jeden Mg²⁺ (hořečnatý).'],
  ['SnCl2I2', 'dichlorid-dijodid cíničitý', '2 Cl⁻ a 2 I⁻ dávají −4, takže cín má IV (cíničitý).'],
  ['Ca5F(PO4)3', 'fluorid-tris(fosforečnan) pentavápenatý', 'F⁻ a 3 PO₄³⁻ dávají −10, takže je potřeba 5 Ca²⁺ (pentavápenatý). Počet víceatomových aniontů se vyjadřuje násobnou předponou tris-.'],
  ['Cu3(CO3)2F2', 'bis(uhličitan)-difluorid triměďnatý', '2 CO₃²⁻ a 2 F⁻ dávají −6, takže jsou potřeba 3 Cu²⁺ (triměďnatý). Dva víceatomové anionty = bis-.'],
];

const THIO_FIXED = [
  ['NH4HS2O3', 'hydrogenthiosíran amonný', 'Z kyseliny thiosírové H₂S₂O₃ se odtrhne jen jeden vodík → HS₂O₃⁻ (hydrogenthiosíran). Kation NH₄⁺ je amonný.'],
  ['Zn3(PO2S2)2', 'dithiofosforečnan zinečnatý', 'Z H₃PO₄ nahradíme dva kyslíky sírou → PO₂S₂³⁻ (dithiofosforečnan). Zn²⁺ a PO₂S₂³⁻ podle křížového pravidla → Zn₃(PO₂S₂)₂.'],
];

// formula, name, other name, the acid written with its OH groups, what replaced them, common name
const DERIVATIVES = [
  ['COCl2', 'dichlorid kyseliny uhličité', 'dichlorid karbonylu', 'CO(OH)2', 'dvě skupiny OH chlorem', 'fosgen'],
  ['CO(NH2)2', 'diamid kyseliny uhličité', 'diamid karbonylu', 'CO(OH)2', 'dvě skupiny OH skupinami NH₂', 'močovina'],
  ['SO2Cl2', 'dichlorid kyseliny sírové', 'dichlorid sulfurylu', 'SO2(OH)2', 'dvě skupiny OH chlorem'],
  ['SO2(NH2)2', 'diamid kyseliny sírové', 'diamid sulfurylu', 'SO2(OH)2', 'dvě skupiny OH skupinami NH₂'],
  ['SOCl2', 'dichlorid kyseliny siřičité', 'dichlorid thionylu', 'SO(OH)2', 'dvě skupiny OH chlorem'],
  ['POF3', 'trifluorid kyseliny fosforečné', 'trifluorid fosforylu', 'PO(OH)3', 'tři skupiny OH fluorem'],
  ['POCl3', 'trichlorid kyseliny fosforečné', 'trichlorid fosforylu', 'PO(OH)3', 'tři skupiny OH chlorem'],
  ['NOCl', 'chlorid kyseliny dusité', 'chlorid nitrosylu', 'NO(OH)', 'skupinu OH chlorem'],
  ['NO2Cl', 'chlorid kyseliny dusičné', 'chlorid nitrylu', 'NO2(OH)', 'skupinu OH chlorem'],
  ['CrO2Cl2', 'dichlorid kyseliny chromové', 'dichlorid chromylu', 'CrO2(OH)2', 'dvě skupiny OH chlorem'],
];

// formula, name, other name, the molecule that took an H+
const ONIUM = [
  ['PH4', 'kation fosfoniový', 'fosfonium', 'PH3'], ['AsH4', 'kation arsoniový', 'arsonium', 'AsH3'], ['SbH4', 'kation stiboniový', 'stibonium', 'SbH3'],
  ['H3O', 'kation oxoniový', 'oxonium', 'H2O'], ['H3S', 'kation sulfoniový', 'sulfonium', 'H2S'], ['H3Se', 'kation selenoniový', 'selenonium', 'H2Se'],
  ['H3Te', 'kation telluroniový', 'telluronium', 'H2Te'], ['H2F', 'kation fluoroniový', 'fluoronium', 'HF'], ['H2I', 'kation jodoniový', 'jodonium', 'HI'],
];

// Simple anions with the ending -idový.
const ID_ANIONS = [
  ['H', 1, 'hydrid'], ['O', 2, 'oxid'], ['O2', 2, 'peroxid'], ['N', 3, 'nitrid'], ['F', 1, 'fluorid'], ['Cl', 1, 'chlorid'], ['Br', 1, 'bromid'],
  ['I', 1, 'jodid'], ['S', 2, 'sulfid'], ['OH', 1, 'hydroxid'], ['CN', 1, 'kyanid'], ['HS', 1, 'hydrogensulfid'], ['N3', 1, 'azid'],
];

const ATOMIC_GROUPS = [
  ['OH', 'hydroxyl'], ['CO', 'karbonyl'], ['NO', 'nitrosyl'], ['NO2', 'nitryl'], ['PO', 'fosforyl'], ['VO', 'vanadyl'], ['SO', 'thionyl'],
  ['SO2', 'sulfuryl'], ['S2O5', 'disulfuryl'], ['SeO', 'seleninyl'], ['SeO2', 'selenonyl'], ['CrO2', 'chromyl'], ['UO2', 'uranyl'],
  ['ClO', 'chlorosyl'], ['ClO2', 'chloryl'], ['ClO3', 'perchloryl'],
];

// cation symbol, its oxidation number, anion, molecules of water, common name
const HYDRATES = [
  ['Cu', 2, 'SO4', 5, 'modrá skalice'], ['Fe', 2, 'SO4', 7, 'zelená skalice'], ['Zn', 2, 'SO4', 7, 'bílá skalice'], ['Ca', 2, 'SO4', 2, 'sádrovec'],
  ['Na', 1, 'SO4', 10, 'Glauberova sůl'], ['Na', 1, 'CO3', 10, 'krystalická soda'], ['Mg', 2, 'SO4', 7, 'hořká sůl'], ['Ni', 2, 'SO4', 7],
  ['Na', 1, 'S2O3', 5], ['Al', 3, 'SO4', 18], ['Co', 2, 'Cl', 6], ['Ca', 2, 'Cl', 6], ['Ba', 2, 'Cl', 2], ['Mg', 2, 'Cl', 6],
  ['Al', 3, 'Cl', 6], ['Fe', 3, 'Cl', 6], ['Cu', 2, 'Cl', 2],
];

// formula, name, central atom, its oxidation number, ligands [formula, charge, count, name], where the complex is, counter-ion [formula, charge, count]
const COMPLEXES = [
  ['K4[Fe(CN)6]', 'hexakyanoželeznatan draselný', 'Fe', 2, [['CN', -1, 6, 'kyano']], 'anion', ['K', 1, 4]],
  ['K3[Fe(CN)6]', 'hexakyanoželezitan draselný', 'Fe', 3, [['CN', -1, 6, 'kyano']], 'anion', ['K', 1, 3]],
  ['Na[Al(OH)4]', 'tetrahydroxohlinitan sodný', 'Al', 3, [['OH', -1, 4, 'hydroxo']], 'anion', ['Na', 1, 1]],
  ['Na2[Zn(OH)4]', 'tetrahydroxozinečnatan sodný', 'Zn', 2, [['OH', -1, 4, 'hydroxo']], 'anion', ['Na', 1, 2]],
  ['K2[PtCl6]', 'hexachloroplatičitan draselný', 'Pt', 4, [['Cl', -1, 6, 'chloro']], 'anion', ['K', 1, 2]],
  ['K2[Hg(CN)4]', 'tetrakyanortuťnatan draselný', 'Hg', 2, [['CN', -1, 4, 'kyano']], 'anion', ['K', 1, 2]],
  ['Na3[Co(NO2)6]', 'hexanitrokobaltitan sodný', 'Co', 3, [['NO2', -1, 6, 'nitro']], 'anion', ['Na', 1, 3]],
  ['Na[Co(CO)4]', 'tetrakarbonylkobaltid sodný', 'Co', -1, [['CO', 0, 4, 'karbonyl']], 'anion', ['Na', 1, 1]],
  ['Na2[Fe(CN)5(NO)]', 'pentakyano-nitrosylželezitan sodný', 'Fe', 3, [['CN', -1, 5, 'kyano'], ['NO', 0, 1, 'nitrosyl']], 'anion', ['Na', 1, 2]],
  ['K3[Fe(CO)(CN)5]', 'karbonyl-pentakyanoželeznatan draselný', 'Fe', 2, [['CO', 0, 1, 'karbonyl'], ['CN', -1, 5, 'kyano']], 'anion', ['K', 1, 3]],
  ['[Cu(NH3)4]SO4', 'síran tetraamminměďnatý', 'Cu', 2, [['NH3', 0, 4, 'ammin']], 'cation', ['SO4', -2, 1]],
  ['[Ag(NH3)2]Cl', 'chlorid diamminstříbrný', 'Ag', 1, [['NH3', 0, 2, 'ammin']], 'cation', ['Cl', -1, 1]],
  ['[Co(NH3)6]Cl3', 'chlorid hexaamminkobaltitý', 'Co', 3, [['NH3', 0, 6, 'ammin']], 'cation', ['Cl', -1, 3]],
  ['[Ni(NH3)6]I2', 'jodid hexaamminnikelnatý', 'Ni', 2, [['NH3', 0, 6, 'ammin']], 'cation', ['I', -1, 2]],
  ['[Cr(H2O)6]Cl3', 'chlorid hexaaquachromitý', 'Cr', 3, [['H2O', 0, 6, 'aqua']], 'cation', ['Cl', -1, 3]],
  ['[Co(NH3)3(H2O)Cl2]Cl', 'chlorid triammin-aqua-dichlorokobaltitý', 'Co', 3, [['NH3', 0, 3, 'ammin'], ['H2O', 0, 1, 'aqua'], ['Cl', -1, 2, 'chloro']], 'cation', ['Cl', -1, 1]],
  ['[Co(NH3)3Cl3]', 'triammin-trichlorokobaltitý komplex', 'Co', 3, [['NH3', 0, 3, 'ammin'], ['Cl', -1, 3, 'chloro']], 'neutral'],
];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const isPoly = symbol => /\d|[A-Z][^A-Z]*[A-Z]/.test(symbol);
const part = (symbol, n) => (n === 1 ? symbol : isPoly(symbol) ? `(${symbol})${n}` : `${symbol}${n}`);

// The cross rule: each charge becomes the other side's count, then the ratio is reduced.
function cross(cationCharge, anionCharge) {
  const g = gcd(cationCharge, anionCharge);
  return { m: anionCharge / g, n: cationCharge / g, reduced: g > 1 };
}

function item(group, level, formula, name, kind, data = {}, alts = []) {
  return { id: `c:${formula}`, group, level: higher(level, groupOf(group).level), formula, name, names: [name, ...alts], kind, ...data };
}

function binary(group, c, anion) {
  const { m, n, reduced } = cross(c.ox, anion.charge);
  return item(group, c.level, part(c.symbol, m) + part(anion.symbol, n), `${anion.noun} ${c.adj}`, 'binary', { cation: c, anion, m, n, reduced }, anion.alt ? [`${anion.alt} ${c.adj}`] : []);
}

function salt(group, c, anion) {
  const { m, n, reduced } = cross(c.ox, anion.charge);
  return item(group, higher(c.level, anion.level || 's'), part(c.symbol, m) + part(anion.formula, n), `${anion.noun} ${c.adj}`, 'salt', { cation: c, anion, m, n, reduced });
}

const uses = letter => CATIONS.filter(c => c.uses.includes(letter));

function halogensFor(c) {
  if (c.uses.includes('h')) return ['F', 'Cl', 'Br', 'I'];
  if (c.uses.includes('c')) return ['F', 'Cl'];
  if (c.uses.includes('f')) return ['F'];
  return [];
}

const atomsList = formula => [...formula.matchAll(/([A-Z][a-z]?)(\d*)/g)].map(([, el, n]) => ({ el, n: Number(n || 1) }));

// "H2Cr2O7" -> { el: 'Cr', k: 2, o: 7, h: 2 }
function centralOf(formula) {
  const atoms = atomsList(formula);
  const central = atoms.find(a => a.el !== 'O' && a.el !== 'H');
  return { el: central.el, k: central.n, o: atoms.find(a => a.el === 'O')?.n || 0, h: atoms.find(a => a.el === 'H')?.n || 0 };
}

function oxyacid(group, formula, name, level, alts = []) {
  const { el, k, o, h } = centralOf(formula);
  const ox = (2 * o - h) / k;
  const prefix = name.match(/kyselina (\w*?)hydrogen/)?.[1] || '';
  return item(group, level, formula, name, 'oxyacid', { el, k, o, h, ox, prefix }, alts);
}

export const genitive = name => {
  const [noun, adj] = name.split(' ');
  return `${noun}u ${adj.replace(/ý$/, 'ého')}`;
};

const ion = (f, n, sign = '−') => `<span class="ion">${formulaHtml(f)}<sup>${n > 1 ? n : ''}${sign}</sup></span>`;

function ionItem(group, formula, charge, name, data, alts = []) {
  const sign = charge > 0 ? '+' : '-';
  return { ...item(group, 's', formula, name, 'ion', data, alts), id: `i:${formula}^${Math.abs(charge)}${sign}`, charge };
}

function build() {
  const out = [];
  // Oxidy
  for (const c of uses('o')) out.push(binary('oxidy', c, BINARY_ANIONS.O));
  for (const [formula, name, cations, o] of DOUBLE_OXIDES) out.push(item('podvojne-oxidy', 's', formula, name, 'double', { cations, o }));
  // Hydroxidy
  for (const c of uses('x')) {
    out.push(item('hydroxidy', c.level, c.ox === 1 ? `${c.symbol}OH` : `${c.symbol}(OH)${c.ox}`, `hydroxid ${c.adj}`, 'hydroxide', { cation: c }));
  }
  // Další sloučeniny kyslíku
  for (const c of uses('p')) {
    out.push(item('peroxidy', 's', c.ox === 1 ? `${c.symbol}2O2` : `${c.symbol}O2`, `peroxid ${c.adj}`, 'peroxide', { cation: c }));
  }
  out.push(item('peroxidy', 's', 'H2O2', 'peroxid vodíku', 'fixed', { steps: ['Peroxidová skupina O₂ má náboj −II, každý kyslík má −I.', 'Vodík má +I, takže potřebujeme dva: <b>H₂O₂</b>. U vodíku se říká „peroxid vodíku“.'] }));
  // Anions that pair with a cation by the cross rule, from hyperoxidy to azidy
  for (const [group, anion, list] of SIMPLE_ANIONS) for (const c of cationsFrom(list)) out.push(binary(group, c, anion));
  for (const [group, formula, name] of NONSTOICH) out.push(item(group, 'v', formula, name, 'nonstoich'));
  // Hydridy
  for (const c of uses('d')) out.push(binary('iontove-hydridy', c, BINARY_ANIONS.H));
  for (const [formula, name, rule, level, alts = [], many] of COVALENT_HYDRIDES) {
    const steps = [HYDRIDE_RULES[rule], many ? `Počet atomů prvku vyjadřuje předpona: ${name} → <b>${formulaHtml(formula)}</b>.` : `${name} → <b>${formulaHtml(formula)}</b>`];
    const hydride = item('kovalentni-hydridy', level, formula, name, 'fixed', { steps }, alts);
    // HF, HCl, H2S… are also acids; the hydride keeps its own progress.
    out.push(OXYGEN_FREE.some(([f]) => f === formula) ? { ...hydride, id: `c:${formula}#h` } : hydride);
  }
  // Kyseliny
  for (const [formula, name, level, gas, why, alts] of OXYGEN_FREE) {
    out.push(item('bezkyslikate', level, formula, name, 'fixed', { steps: [`${name.replace('kyselina ', 'Kyselina ')} je vodný roztok plynného <b>${gas}</b> ${formulaHtml(formula)}.`, why] }, alts));
  }
  for (const a of ANIONS) out.push(oxyacid(a.formula === 'Cr2O7' ? 'isopolykyseliny' : 'kyslikate', a.acidFormula, `kyselina ${a.acid}`, a.level, a.alt ? [`kyselina ${a.alt}`] : []));
  for (const [group, formula, name, level] of EXTRA_ACIDS) out.push(oxyacid(group, formula, name, level));
  out.push(item('thiokyseliny', 's', 'H2S2O3', 'kyselina thiosírová', 'fixed', { steps: [THIO, 'Z kyseliny sírové H₂SO₄ nahradíme jeden kyslík sírou → <b>H₂S₂O₃</b>.'] }));
  for (const [group, formula, name, level, steps] of SPECIAL_ACIDS) out.push(item(group, level, formula, name, 'fixed', { steps }));
  // Halogenidy, sulfidy
  for (const c of CATIONS) for (const x of halogensFor(c)) out.push(binary('halogenidy', c, BINARY_ANIONS[x]));
  for (const c of uses('s')) out.push(binary('sulfidy', c, BINARY_ANIONS.S));
  // Soli
  for (const c of uses('a')) for (const a of ANIONS) out.push(salt('soli', c, a));
  for (const c of uses('y')) for (const a of HYDROGEN_ANIONS) out.push(salt('hydrogensoli', c, a));
  for (const c of cationsFrom('Na:1 K:1 NH4:1 Ag:1 Mg:2 Ca:2 Ba:2')) for (const a of THIO_ANIONS) out.push(salt('thiosoli', c, a));
  for (const [formula, name, step] of THIO_FIXED) out.push(item('thiosoli', 'v', formula, name, 'fixed', { steps: [THIO, step] }));
  for (const [formula, name, cations, anion] of DOUBLE_SALTS) out.push(item('podvojne-soli', 's', formula, name, 'double', { cations, anion }));
  for (const [formula, name, step] of MIXED_SALTS) out.push(item('smisene-soli', 'v', formula, name, 'fixed', { steps: [MIXED, step] }));
  // Funkční deriváty
  for (const [formula, name, alt, acid, what, common] of DERIVATIVES) {
    out.push(item('derivaty', 'v', formula, name, 'fixed', {
      steps: [
        'Funkční derivát kyseliny: všechny skupiny OH jsou nahrazené halogenem nebo skupinou NH₂, takže to už není kyselina.',
        `Kyselina zapsaná se skupinami OH je ${formulaHtml(acid)}. Nahradíme ${what} → <b>${formulaHtml(formula)}</b>.`,
        `Místo „${name.split(' ').slice(1).join(' ')}“ se dá říct i název atomové skupiny: <b>${alt}</b>.${common ? ` Triviálně ${common}.` : ''}`,
      ],
    }, [alt]));
  }
  // Ionty
  for (const c of CATIONS.filter(c => c.symbol !== 'NH4' && (c.uses.includes('a') || c.uses.includes('x')))) {
    out.push(ionItem('kationty', c.symbol, c.ox, `kation ${c.adj}`, { ionKind: 'cation', cation: c }));
  }
  out.push(ionItem('kationty', 'NH4', 1, 'kation amonný', { ionKind: 'ammonium' }, ['amonium']));
  for (const [formula, name, alt, parent] of ONIUM) out.push(ionItem('kationty', formula, 1, name, { ionKind: 'onium', parent, level: 'v' }, [alt]));
  for (const [formula, charge, noun] of ID_ANIONS) out.push(ionItem('anionty', formula, -charge, `anion ${noun}ový`, { ionKind: 'id', noun }));
  for (const a of [...ANIONS, ...HYDROGEN_ANIONS, ...THIO_ANIONS]) out.push(ionItem('anionty', a.formula, -a.charge, `anion ${a.noun}ový`, { ionKind: 'acid', anion: a }));
  for (const [formula, name] of ATOMIC_GROUPS) out.push({ ...item('atomove-skupiny', 'v', formula, name, 'fixed', { steps: ['Atomové skupiny obsahující kyslík mají vždy koncovku -yl, bez ohledu na náboj.', `${formulaHtml(formula)} → <b>${name}</b>`] }), id: `g:${formula}` });
  // Krystalohydráty
  for (const [symbol, ox, anion, n, common] of HYDRATES) {
    const c = cationOf(symbol, ox);
    const base = BINARY_ANIONS[anion] ? binary('halogenidy', c, BINARY_ANIONS[anion]) : salt('soli', c, [...ANIONS, ...THIO_ANIONS].find(a => a.formula === anion));
    out.push(item('hydraty', 's', `${base.formula}·${n}H2O`, `${PREFIXES[n]}hydrát ${genitive(base.name)}`, 'hydrate', { base, water: n, common }));
  }
  // Komplexy
  for (const [formula, name, metal, ox, ligands, where, counter] of COMPLEXES) {
    out.push(item('komplexy', 's', formula, name, 'complex', { metal, ox, ligands, where, counter }, name.includes('-') ? [name.replace(/-/g, '')] : []));
  }
  out.push(item('komplexy', 'v', '[Pt(NH3)4][PtCl4]', 'tetrachloroplatnatan tetraamminplatnatý', 'fixed', {
    steps: [
      'Komplexní je kation i anion. Oba se pojmenují podle centrálního atomu a ligandů.',
      'Kation [Pt(NH₃)₄]²⁺: 4 neutrální ligandy ammin, Pt má II → tetraamminplatnatý.',
      'Anion [PtCl₄]²⁻: 4 × Cl⁻ = −4, Pt má II → −2 → tetrachloroplatnatan.',
    ],
  }));
  return out;
}

// ----- formulas -----

export const formulaHtml = f => esc(f).replace(/([A-Za-z)\]])(\d+)/g, '$1<sub>$2</sub>');
export const oxs = (symbol, n) => `${formulaHtml(symbol)}<sup>${n < 0 ? '−' : ''}${ROMAN[Math.abs(n)]}</sup>`;
export { ion };
export const itemFormula = it => (it.kind === 'ion' ? ion(it.formula, Math.abs(it.charge), it.charge > 0 ? '+' : '−') : formulaHtml(it.formula));

export const COMPOUNDS = build();
export const groupsFor = level => GROUPS.filter(g => within(level, g.level));
export const compoundsIn = (level, groups) => COMPOUNDS.filter(c => within(level, c.level) && groups.includes(c.group));

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
export const cleanFormula = text => String(text).normalize('NFC')
  .replace(/[₀-₉]/g, d => SUBSCRIPT_DIGITS.indexOf(d))
  .replace(/[.*×•∙⋅]/g, '·')
  .replace(/\s+/g, '');

const CLOSING = { '(': ')', '[': ']' };

function parseUnits(s, pos, until = '') {
  const units = [];
  const count = () => {
    const m = s.slice(pos.i).match(/^\d+/);
    if (!m) return 1;
    pos.i += m[0].length;
    return Number(m[0]);
  };
  while (pos.i < s.length && s[pos.i] !== until) {
    const c = s[pos.i];
    if (CLOSING[c]) {
      pos.i++;
      const inner = parseUnits(s, pos, CLOSING[c]);
      if (!inner || s[pos.i] !== CLOSING[c]) return null;
      pos.i++;
      units.push({ inner, n: count(), square: c === '[' });
    } else if (/[A-Z]/.test(c)) {
      const m = s.slice(pos.i).match(/^[A-Z][a-z]?/);
      pos.i += m[0].length;
      units.push({ symbol: m[0], n: count() });
    } else return null;
  }
  return units.length ? units : null;
}

// Square brackets of a complex are always kept; round ones only when they multiply.
const serialize = units => units.map(u => {
  if (u.square) return `[${serialize(u.inner)}]${u.n === 1 ? '' : u.n}`;
  if (u.inner) return u.n === 1 ? serialize(u.inner) : `(${serialize(u.inner)})${u.n}`;
  return `${u.symbol}${u.n === 1 ? '' : u.n}`;
}).join('');

function atomsOf(units, times = 1, into = {}) {
  for (const u of units) {
    if (u.inner) atomsOf(u.inner, times * u.n, into);
    else into[u.symbol] = (into[u.symbol] || 0) + times * u.n;
  }
  return into;
}

function parseFormula(text) {
  const parts = cleanFormula(text).split('·');
  const parsed = [];
  for (const p of parts) {
    const coef = p.match(/^\d*/)[0];
    const pos = { i: 0 };
    const rest = p.slice(coef.length);
    const units = parseUnits(rest, pos);
    if (!units || pos.i !== rest.length) return null;
    parsed.push({ coef: Number(coef || 1), units });
  }
  return parsed;
}

export function canonical(text) {
  const parsed = parseFormula(text);
  return parsed ? parsed.map(p => `${p.coef > 1 ? p.coef : ''}${serialize(p.units)}`).join('·') : null;
}

function atoms(text) {
  const parsed = parseFormula(text);
  if (!parsed) return null;
  const all = {};
  for (const p of parsed) atomsOf(p.units, p.coef, all);
  return Object.entries(all).sort().join(';');
}

export function checkFormula(input, formula) {
  const given = cleanFormula(input);
  if (!given) return { ok: false, kind: 'wrong' };
  if (canonical(given) === canonical(formula)) return { ok: true, kind: 'exact' };
  if (given.toLowerCase() === formula.toLowerCase()) return { ok: false, kind: 'case' };
  const a = atoms(given);
  if (a && a === atoms(formula)) return { ok: false, kind: 'order' };
  return { ok: false, kind: 'wrong' };
}

const SUPERSCRIPTS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

// "SO4^2-", "SO4 2-", "SO4(2-)", "SO₄²⁻" and "NO3-" are all understood.
export function splitCharge(text) {
  let s = String(text).normalize('NFC').trim().replace(/[−–]/g, '-');
  const sup = s.search(/[⁰¹²³⁴-⁹⁺⁻]/);
  if (sup >= 0) s = `${s.slice(0, sup)}^${s.slice(sup).replace(/[⁰¹²³⁴-⁹⁺⁻]/g, c => SUPERSCRIPTS[c])}`;
  const m = s.match(/^(.+?)\s*\^\s*(\d?)\s*([+-])$/) || s.match(/^(.+?)\s*\(\s*(\d?)\s*([+-])\s*\)$/) || s.match(/^(.+?)\s+(\d?)\s*([+-])$/);
  if (m) return { formula: m[1], charge: Number(m[2] || 1) * (m[3] === '+' ? 1 : -1), separated: true };
  const bare = s.match(/^(.+?)([+-])$/);
  return bare ? { formula: bare[1], charge: bare[2] === '+' ? 1 : -1, separated: false } : null;
}

export function checkIon(input, it) {
  const given = splitCharge(input);
  if (!given) return { ok: false, kind: canonical(input) === canonical(it.formula) ? 'nocharge' : 'wrong' };
  const formula = checkFormula(given.formula, it.formula);
  if (formula.ok) return given.charge === it.charge ? { ok: true, kind: 'exact' } : { ok: false, kind: 'charge' };
  // "SO42-" glues the charge to the formula, so the 2 reads as a subscript.
  if (!given.separated && Math.abs(it.charge) > 1 && checkFormula(given.formula, `${it.formula}${Math.abs(it.charge)}`).ok) return { ok: false, kind: 'glued' };
  return formula;
}

export const checkItemFormula = (input, it) => (it.kind === 'ion' ? checkIon(input, it) : checkFormula(input, it.formula));

const LEAD_WORDS = ['kyselina', 'kation', 'anion'];

export function checkName(input, names) {
  const result = check(input, names);
  if (result.ok || result.kind === 'typo') return result;
  const word = LEAD_WORDS.find(w => names[0].startsWith(`${w} `));
  if (word && !new RegExp(word, 'i').test(input) && check(`${word} ${input}`, names).ok) return { ok: false, kind: word === 'kyselina' ? 'acid' : 'ionword' };
  return result;
}

// ----- explanations -----

const cationLabel = c => (c.symbol === 'NH4' ? `kation ${ion('NH4', 1, '+')}` : oxs(c.symbol, c.ox));
const cationRule = c => `<b>${c.adj}</b> → ${cationLabel(c)}${c.symbol === 'NH4' ? '' : ` (koncovka ${ENDINGS[c.ox].cation} znamená ${ROMAN[c.ox]})`}`;
const anionLabel = a => (isPoly(a.symbol) ? ion(a.symbol, a.charge) : oxs(a.symbol, -a.charge));
const atomy = n => (n < 5 ? 'atomy' : 'atomů');
const parity = ox => (ox % 2 ? 'liché' : 'sudé');
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

function binarySteps(it, dir) {
  const { cation: c, anion, m, n, reduced } = it;
  const total = n * anion.charge;
  if (dir === 'nf') {
    return [
      cationRule(c),
      `<b>${anion.noun}</b> → ${anionLabel(anion)}. ${anion.rule}`,
      `Křížové pravidlo: ${ROMAN[c.ox]} u ${formulaHtml(c.symbol)} → ${formulaHtml(anion.symbol)} bude ${c.ox}×, ${ROMAN[anion.charge]} u ${formulaHtml(anion.symbol)} → ${formulaHtml(c.symbol)} bude ${anion.charge}×${reduced ? `. Vzorec ${formulaHtml(part(c.symbol, anion.charge) + part(anion.symbol, c.ox))} se zkrátí na <b>${formulaHtml(it.formula)}</b>.` : ` → <b>${formulaHtml(it.formula)}</b>`}`,
    ];
  }
  return [
    `${anion.rule} ${n === 1 ? `Záporný náboj je tedy −${total}.` : `Celkem ${n} · (−${anion.charge}) = −${total}.`}`,
    c.symbol === 'NH4'
      ? `${ion('NH4', 1, '+')} je kation <b>amonný</b>.`
      : `Kladný náboj musí být stejně velký: ${m === 1 ? `${formulaHtml(c.symbol)} má tedy` : `${m} ${atomy(m)} ${formulaHtml(c.symbol)} mají dohromady +${total}, jeden tedy`} ${ROMAN[c.ox]}.`,
    c.symbol === 'NH4' ? `→ <b>${it.name}</b>` : `${ROMAN[c.ox]} → koncovka ${ENDINGS[c.ox].cation} → <b>${it.name}</b>`,
  ];
}

function hydroxideSteps(it, dir) {
  const c = it.cation;
  if (dir === 'nf') {
    return [
      cationRule(c),
      `Hydroxidová skupina ${ion('OH', 1)} má náboj −I.`,
      `${c.ox === 1 ? 'Stačí 1 skupina' : `Na vyrovnání ${ROMAN[c.ox]} jsou potřeba ${c.ox} skupiny`} OH → <b>${formulaHtml(it.formula)}</b>${c.ox === 1 ? ' (jedna skupina se píše bez závorky)' : ''}`,
    ];
  }
  return [
    `Každá skupina ${ion('OH', 1)} má náboj −I a ve vzorci ${c.ox === 1 ? 'je jedna' : `jsou ${c.ox}`}.`,
    `${formulaHtml(c.symbol)} tedy má ${ROMAN[c.ox]} → koncovka ${ENDINGS[c.ox].cation}`,
    `→ <b>${it.name}</b>`,
  ];
}

function acidSteps(it, dir) {
  const { el, k, o, h, ox, prefix } = it;
  const adj = it.name.replace('kyselina ', '');
  if (dir === 'nf') {
    const central = k > 1 ? `Předpona ${PREFIXES[k]}- před kmenem → ${k} ${atomy(k)} ${formulaHtml(el)}. ` : '';
    const hRule = prefix
      ? `Předpona ${prefix}hydrogen- → ${h} ${atomy(h)} vodíku.`
      : k > 1
        ? `Bez předpony hydrogen- jsou ${h === 1 ? 'jeden vodík' : `${h} vodíky`}.`
        : `${ROMAN[ox]} je ${parity(ox)} číslo → ${h === 1 ? '1 vodík' : `${h} vodíky`}.`;
    return [
      `<b>${adj}</b> → ${oxs(el, ox)} (koncovka ${ENDINGS[ox].acid})`,
      central + hRule,
      `Počet kyslíků = (${h} · 1 + ${k > 1 ? `${k} · ` : ''}${ox}) : 2 = ${o} → <b>${formulaHtml(it.formula)}</b>`,
    ];
  }
  return [
    'Vodík má +I, kyslík −II, součet musí být 0.',
    `${formulaHtml(el)}: (${o} · 2 − ${h})${k > 1 ? ` : ${k}` : ''} = ${ox} → ${oxs(el, ox)}`,
    `${ROMAN[ox]} → koncovka ${ENDINGS[ox].acid}${k > 1 ? `, ${k} ${atomy(k)} ${formulaHtml(el)} → předpona ${PREFIXES[k]}-` : ''}${prefix ? `, ${h} ${atomy(h)} vodíku → předpona ${prefix}hydrogen-` : ''} → <b>${it.name}</b>${it.names[1] ? ` (běžně také ${it.names[1]})` : ''}`,
  ];
}

function saltSteps(it, dir) {
  const { cation: c, anion: a, m, n, reduced } = it;
  const anionIon = ion(a.formula, a.charge);
  const from = a.left
    ? `Z kyseliny ${formulaHtml(a.acidFormula)} (kyselina ${a.acid}) se odtrhne jen část vodíků, ${a.left === 1 ? 'jeden zůstane' : `${a.left} zůstanou`} → ${anionIon}, náboj = počet odtržených H.`
    : `Z kyseliny ${formulaHtml(a.acidFormula)} (kyselina ${a.acid}) se ${a.charge === 1 ? 'odtrhne vodík' : a.charge === 2 ? 'odtrhnou oba vodíky' : `odtrhnou všechny ${a.charge} vodíky`} → ${anionIon}.`;
  if (dir === 'nf') {
    return [
      `<b>${a.noun}</b>: ${from}`,
      `<b>${c.adj}</b> → ${c.symbol === 'NH4' ? ion('NH4', 1, '+') : `${ion(c.symbol, c.ox, '+')} (koncovka ${ENDINGS[c.ox].cation} znamená ${ROMAN[c.ox]})`}`,
      `Křížové pravidlo → <b>${formulaHtml(it.formula)}</b>${reduced ? ' (poměr se zkrátil)' : ''}${n > 1 ? '. Víceatomový anion se při počtu větším než 1 dává do závorky.' : ''}`,
    ];
  }
  const total = n * a.charge;
  return [
    `${anionIon} je <b>${a.noun}</b>. ${from}`,
    c.symbol === 'NH4'
      ? `${ion('NH4', 1, '+')} je kation <b>amonný</b>.`
      : `Záporný náboj je ${n === 1 ? '' : `${n} · (−${a.charge}) = `}−${total}, ${m === 1 ? `takže ${formulaHtml(c.symbol)} má` : `${m} ${atomy(m)} ${formulaHtml(c.symbol)} mají dohromady +${total}, jeden tedy`} ${ROMAN[c.ox]}.`,
    c.symbol === 'NH4' ? `→ <b>${it.name}</b>` : `${ROMAN[c.ox]} → koncovka ${ENDINGS[c.ox].cation} → <b>${it.name}</b>`,
  ];
}

function peroxideSteps(it, dir) {
  const c = it.cation;
  return [
    'Peroxidová skupina O₂ má náboj −II (každý kyslík má −I).',
    dir === 'nf' ? cationRule(c) : `${c.ox === 1 ? `Dva atomy ${formulaHtml(c.symbol)} vyrovnají náboj −2, každý má tedy I` : `Jeden atom ${formulaHtml(c.symbol)} vyrovná náboj −2, má tedy II`} → koncovka ${ENDINGS[c.ox].cation}`,
    dir === 'nf' ? `Vzorec peroxidu se nekrátí → <b>${formulaHtml(it.formula)}</b>` : `→ <b>${it.name}</b>`,
  ];
}

function hydrateSteps(it, dir) {
  const { base, water, common } = it;
  const prefix = `${PREFIXES[water]}hydrát`;
  const steps = dir === 'nf'
    ? [
      `<b>${prefix}</b> → ${water} ${water < 5 ? 'molekuly' : 'molekul'} vody: ${water} H₂O`,
      `<b>${genitive(base.name)}</b> je 2. pád od „${base.name}“ → ${formulaHtml(base.formula)}`,
      `Sůl a voda se spojí tečkou → <b>${formulaHtml(it.formula)}</b>`,
    ]
    : [
      `${formulaHtml(base.formula)} je ${base.name}.`,
      `${water} H₂O → číslovková předpona ${PREFIXES[water]}- + hydrát`,
      `Sůl jde do 2. pádu → <b>${it.name}</b>`,
    ];
  if (common) steps.push(`Triviální název: ${common}.`);
  return steps;
}

function nonstoichSteps(it) {
  const counts = atomsList(it.formula).map(a => `${a.n} × ${a.el}`).join(', ');
  return [
    'Nestechiometrická sloučenina: oxidační čísla se tu nepoužívají. Počty atomů jsou přímo v názvu (číslovkové předpony) a kov je ve 2. pádě.',
    `${it.name}: ${counts} → <b>${formulaHtml(it.formula)}</b>`,
  ];
}

// Double oxides and double salts list their cations by rising oxidation number (then by symbol, NH4 last).
function doubleSteps(it, dir) {
  const plus = it.cations.reduce((s, [, ox, n]) => s + ox * n, 0);
  const sum = it.cations.map(([, ox, n]) => (n === 1 ? ox : `${n} · ${ox}`)).join(' + ');
  const order = it.cations.map(([symbol, ox, n, adj], i) => `${i < it.cations.length - 1 ? adj.replace(/ý$/, 'o-') : adj} = ${n > 1 ? `${n} × ` : ''}${symbol === 'NH4' ? ion('NH4', 1, '+') : oxs(symbol, ox)}`).join(', ');
  const first = `Podvojná sloučenina má dva kationty, v názvu spojené pomlčkou a seřazené podle rostoucího oxidačního čísla (při stejném čísle podle značky, NH₄⁺ nakonec): ${order}.`;
  if (it.o) {
    return [
      first,
      `Kladný náboj: ${sum} = ${plus} → kyslíků ${plus} : 2 = ${it.o}${it.o > 1 ? ` → předpona ${PREFIXES[it.o]}-` : ''}.`,
      dir === 'nf' ? `→ <b>${formulaHtml(it.formula)}</b>` : `→ <b>${it.name}</b>`,
    ];
  }
  const [formula, charge, n, noun] = it.anion;
  return [
    first,
    `Kladný náboj: ${sum} = ${plus} → ${n === 1 ? 'jeden' : n} ${ion(formula, charge)} (${noun}).`,
    dir === 'nf' ? `→ <b>${formulaHtml(it.formula)}</b>` : `→ <b>${it.name}</b>`,
  ];
}

const ligandText = ([formula, charge, n, name]) => `${n} × ${name} (${charge ? ion(formula, -charge) : formulaHtml(formula)})`;

function complexSteps(it, dir) {
  const { metal, ox, ligands, where, counter } = it;
  const ligandCharge = ligands.reduce((s, [, charge, n]) => s + charge * n, 0);
  const q = ox + ligandCharge;
  const ending = ox < 0 ? 'záporné oxidační číslo → koncovka -id' : where === 'anion' ? `koncovka aniontu ${ENDINGS[ox].anion}` : `koncovka ${ENDINGS[ox].cation}`;
  const kindRule = {
    anion: 'Komplexní je anion: centrální atom dostane koncovku aniontu (-an, při záporném čísle -id), ligandy jsou předpony a kation je přídavné jméno.',
    cation: 'Komplexní je kation: ligandy jsou předpony přídavného jména centrálního atomu, anion je podstatné jméno.',
    neutral: 'Neutrální komplex: ligandy + přídavné jméno centrálního atomu + slovo komplex.',
  }[where];
  const ligandsLine = `Ligandy: ${ligands.map(ligandText).join(', ')}. Píšou se v abecedním pořadí jejich názvů, v hranaté závorce s centrálním atomem.`;
  const chargeLine = `Náboj komplexní částice: ${oxs(metal, ox)} ${ligandCharge ? `a ligandy ${signed(ligandCharge)}` : 'a neutrální ligandy'} → ${signed(q)}.`;
  if (dir === 'nf') {
    return [
      `${ligandsLine} Centrální atom ${oxs(metal, ox)} (${ending}).`,
      chargeLine,
      where === 'neutral' ? `Částice je neutrální → <b>${formulaHtml(it.formula)}</b>` : `${kindRule} Protiion ${counter[2] > 1 ? `${counter[2]} × ` : ''}${counter[1] > 0 ? ion(counter[0], counter[1], '+') : ion(counter[0], -counter[1])} vyrovná náboj → <b>${formulaHtml(it.formula)}</b>`,
    ];
  }
  return [
    where === 'neutral' ? 'Bez protiiontu: komplex je neutrální.' : `Protiion ${counter[2] > 1 ? `${counter[2]} × ` : ''}${counter[1] > 0 ? ion(counter[0], counter[1], '+') : ion(counter[0], -counter[1])} má dohromady ${signed(counter[1] * counter[2])}, takže komplexní částice má ${signed(q)}.`,
    `${ligandsLine} Centrální atom tedy má ${ligandCharge ? `${signed(q)} − (${signed(ligandCharge)}) = ` : ''}${ox < 0 ? '−' : ''}${ROMAN[Math.abs(ox)]} (${ending}).`,
    `${kindRule} → <b>${it.name}</b>`,
  ];
}

function ionSteps(it) {
  const shown = itemFormula(it);
  if (it.ionKind === 'cation') return ['Jednoatomový kation: slovo kation + přídavné jméno prvku s koncovkou podle náboje.', `${shown}: náboj ${ROMAN[it.charge]} → ${ENDINGS[it.charge].cation} → <b>${it.name}</b>`];
  if (it.ionKind === 'ammonium') return ['NH₄⁺ je výjimka: kation amonný (amonium). I v solích zůstává přídavné jméno amonný.', `${shown} → <b>${it.name}</b>`];
  if (it.ionKind === 'onium') return ['Víceatomové kationty, které vzniknou přidáním H⁺ k molekule, mají koncovku -oniový (nebo jednoslovně -onium).', `${formulaHtml(it.parent)} + H⁺ → ${shown} → <b>${it.name}</b>`];
  if (it.ionKind === 'id') return ['Jednoatomové a některé víceatomové anionty mají koncovku -idový.', `${shown} = ${it.noun} → <b>${it.name}</b>`];
  return [
    'Anionty odvozené od kyslíkatých kyselin a thiokyselin mají koncovku -anový: název aniontu soli + -ový.',
    `${formulaHtml(it.anion.acidFormula)} → ${shown} = ${it.anion.noun} → <b>${it.name}</b>`,
  ];
}

export function explain(it, dir) {
  if (it.kind === 'fixed') return it.steps;
  if (it.kind === 'binary') return binarySteps(it, dir);
  if (it.kind === 'hydroxide') return hydroxideSteps(it, dir);
  if (it.kind === 'oxyacid') return acidSteps(it, dir);
  if (it.kind === 'salt') return saltSteps(it, dir);
  if (it.kind === 'peroxide') return peroxideSteps(it, dir);
  if (it.kind === 'hydrate') return hydrateSteps(it, dir);
  if (it.kind === 'nonstoich') return nonstoichSteps(it);
  if (it.kind === 'double') return doubleSteps(it, dir);
  if (it.kind === 'complex') return complexSteps(it, dir);
  if (it.kind === 'ion') return ionSteps(it);
  return [];
}

// ----- picking questions -----

// Each chosen group gets a fair share, so 700 salts don't crowd out 23 hydroxides.
export function pickCompounds(progress, { level, groups, count, rand = Math.random }) {
  const lists = groups.map(g => pickSession(shuffle(compoundsIn(level, [g]), rand), progress, { mode: 'smart', count, rand })).filter(l => l.length);
  const picked = [];
  for (let i = 0; picked.length < count && lists.some(l => l[i]); i++) {
    for (const l of lists) if (l[i] && picked.length < count) picked.push(l[i]);
  }
  return shuffle(picked, rand);
}

export const directionOf = (dir, rand = Math.random) => (dir === 'mix' ? (rand() < 0.5 ? 'nf' : 'fn') : dir);
