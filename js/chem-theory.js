import { formulaHtml as f, ion, oxs, itemFormula, ENDINGS, ROMAN, COMPOUNDS, categoryOf } from './nazvoslovi.js';
import { element } from './elements.js';

// Theory pages for Názvosloví, in Czech: one per category of nazvoslovi.cz, plus basics, an overview and the elements.
// Examples come from the practice data, so the theory and the questions can't disagree. The markup is trusted.

const byKey = Object.fromEntries(COMPOUNDS.map(c => [c.id, c]));
function find(key) {
  const it = byKey[key.includes(':') ? key : `c:${key}`];
  if (!it) throw new Error(`Missing example ${key}`);
  return it;
}

const pairs = list => `<div class="chem-pairs">${list.map(([formula, name, note]) => `<div class="chem-pair"><span class="chem-formula">${formula}</span><span>${name}${note ? ` <small>(${note})</small>` : ''}</span></div>`).join('')}</div>`;
const ex = (...keys) => pairs(keys.map(k => {
  const it = find(k);
  const other = it.names.slice(1).filter(n => n !== it.name.replace(/-/g, ''));
  return [itemFormula(it), it.name, [it.common, other.length ? `také ${other.join(', ')}` : ''].filter(Boolean).join('; ')];
}));
const table = (head, rows) => `<div class="chem-table-wrap"><table class="chem-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const tip = text => `<p class="chem-tip">${text}</p>`;
const example = text => `<p class="chem-example">${text}</p>`;
const steps = list => `<ol>${list.map(s => `<li>${s}</li>`).join('')}</ol>`;
const subsOf = id => categoryOf(id).subs.map(([sub]) => sub);

const ENDING_EXAMPLES = ['', 'Na2O', 'CaO', 'Al2O3', 'CO2', 'P2O5', 'SO3', 'Mn2O7', 'OsO4'];
const LATIN_SYMBOLS = ['H', 'C', 'N', 'O', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'K', 'Mn', 'Fe', 'Cu', 'Ag', 'Sn', 'Sb', 'W', 'Au', 'Hg', 'Pb'];
const LIGANDS = [['H2O', 0, 'aqua'], ['NH3', 0, 'ammin'], ['CO', 0, 'karbonyl'], ['NO', 0, 'nitrosyl'], ['F', 1, 'fluoro'], ['Cl', 1, 'chloro'], ['Br', 1, 'bromo'], ['I', 1, 'jodo'], ['OH', 1, 'hydroxo'], ['CN', 1, 'kyano'], ['NO2', 1, 'nitro'], ['NO3', 1, 'nitrato'], ['O', 2, 'oxo'], ['O2', 2, 'peroxo'], ['S', 2, 'thio'], ['SO4', 2, 'sulfato'], ['CO3', 2, 'karbonato'], ['S2O3', 2, 'thiosulfato'], ['H', 1, 'hydrido'], ['HS', 1, 'merkapto'], ['NH2', 1, 'amido'], ['PO4', 3, 'fosfato']];

const CROSS_RULE = `Oxidační číslo jednoho prvku se stane počtem atomů druhého prvku a vzorec se zkrátí na nejmenší celá čísla: ${oxs('Al', 3)} a ${oxs('O', -2)} → ${f('Al2O3')}.`;

export const THEORY = [
  {
    id: 'zaklady',
    title: 'Základy názvosloví',
    sub: 'Oxidační číslo, koncovky, křížové pravidlo a předpony',
    groups: [],
    body: () => `
      <p>Název anorganické sloučeniny má většinou dvě slova. <b>Podstatné jméno</b> říká, o jaký druh sloučeniny jde (oxid, chlorid, síran…). <b>Přídavné jméno</b> říká, který prvek je v ní kladný a jaké má oxidační číslo (sodný, železitý…).</p>
      <h3>Oxidační číslo</h3>
      <p>Oxidační číslo je náboj, který by atom měl, kdyby vazebné elektrony patřily jen elektronegativnějšímu z atomů. Píše se římskou číslicí vpravo nahoru: ${oxs('Fe', 3)}, ${oxs('O', -2)}. U záporného čísla se znaménko píše vždy.</p>
      <ul>
        <li>Prvek, který není ve sloučenině (Fe, ${f('O2')}, ${f('H2')}), má oxidační číslo <b>0</b>.</li>
        <li><b>Vodík</b> má většinou +I, jen v hydridech kovů −I (NaH).</li>
        <li><b>Kyslík</b> má většinou −II, v peroxidech −I (${f('H2O2')}).</li>
        <li><b>Fluor</b> má ve sloučeninách vždy −I, protože je ze všech prvků nejvíc elektronegativní.</li>
        <li>Kovy mají ve sloučeninách kladná oxidační čísla.</li>
        <li>Součet oxidačních čísel ve sloučenině je <b>0</b>, v iontu se rovná náboji iontu.</li>
      </ul>
      <h3>Koncovky podle oxidačního čísla</h3>
      ${table(['Ox. číslo', 'Kation', 'Kyselina', 'Anion soli', 'Příklad'], ENDINGS.slice(1).map((e, i) => [ROMAN[i + 1], e.cation, e.acid, e.anion, `${f(ENDING_EXAMPLES[i + 1])} ${find(ENDING_EXAMPLES[i + 1]).name}`]))}
      ${tip('Řada koncovek kationtů: <b>ný, natý, itý, ičitý, ičný, ový, istý, ičelý</b>. Vyplatí se ji umět nazpaměť, z ní plyne všechno ostatní.')}
      <h3>Křížové pravidlo</h3>
      <p>${CROSS_RULE}</p>
      <ul>
        <li>${oxs('Sn', 4)} a ${oxs('O', -2)} → ${f('Sn2O4')} → zkrátit → <b>${f('SnO2')}</b></li>
        <li>Víceatomový ion se dá do závorky, když je ve vzorci víckrát: ${ion('Ca', 2, '+')} a ${ion('PO4', 3)} → <b>${f('Ca3(PO4)2')}</b></li>
      </ul>
      <h3>Číslovkové předpony</h3>
      ${table(['Počet', 'Předpona', 'Násobná'], [['½', 'hemi', ''], ['1', 'mono', ''], ['2', 'di', 'bis'], ['3', 'tri', 'tris'], ['4', 'tetra', 'tetrakis'], ['5', 'penta', 'pentakis'], ['6', 'hexa', 'hexakis'], ['7', 'hepta', ''], ['8', 'okta', ''], ['9', 'nona', ''], ['10', 'deka', ''], ['11', 'undeka', ''], ['12', 'dodeka', '']])}
      <p>Násobné předpony (bis, tris…) se používají před složitějšími názvy, které jsou pak v závorce: bis(uhličitan).</p>`,
  },
  {
    id: 'rozliseni',
    title: 'Jak skupiny rozlišit',
    sub: 'Podle názvu i podle vzorce poznáš, se kterou skupinou pracuješ',
    groups: [],
    body: () => `
      <p>Než začneš počítat, urči, do které skupiny sloučenina patří. Podle toho víš, jaký postup použít.</p>
      <h3>Podle názvu</h3>
      ${table(['Název obsahuje', 'Skupina', 'Příklad'], [
        ['oxid + přídavné jméno', 'Oxidy', 'oxid železitý'],
        ['dva kationty s pomlčkou, oxid s předponou', 'Podvojné oxidy', 'tetraoxid železnato-železitý'],
        ['hydroxid', 'Hydroxidy', 'hydroxid vápenatý'],
        ['peroxid, hyperoxid, ozonid, hydrogenperoxid', 'Další sloučeniny kyslíku', 'peroxid sodný'],
        ['borid, acetylid, karbid, silicid, nitrid, amid, imid, fosfid, arsenid', 'Sloučeniny nekovů a polokovů', 'nitrid hlinitý'],
        ['hydrid + přídavné jméno', 'Iontové hydridy', 'hydrid sodný'],
        ['jedno slovo na -an, voda, amoniak, …vodík', 'Kovalentní hydridy', 'silan, chlorovodík'],
        ['kyselina …vodíková', 'Bezkyslíkaté kyseliny', 'kyselina chlorovodíková'],
        ['kyselina + koncovka podle ox. čísla', 'Kyslíkaté kyseliny', 'kyselina sírová'],
        ['kyselina thio…, peroxo…, chloro…, amido…, di…', 'Odvozené kyslíkaté kyseliny', 'kyselina peroxosírová'],
        ['fluorid, chlorid, bromid, jodid', 'Halogenidy', 'chlorid sodný'],
        ['sulfid, hydrogensulfid, disulfid', 'Sulfidy', 'disulfid železnatý'],
        ['selenid, tellurid, kyanid, azid', 'Další soli bezkyslíkatých kyselin', 'kyanid draselný'],
        ['…an + přídavné jméno (síran, dusičnan)', 'Soli kyslíkatých kyselin', 'síran měďnatý'],
        ['hydrogen…an, thio…an, dva kationty nebo dva anionty s pomlčkou', 'Hydrogensoli, thiosoli, podvojné a smíšené soli', 'síran draselno-hlinitý'],
        ['…id kyseliny …, …id …ylu', 'Funkční deriváty kyselin', 'dichlorid kyseliny uhličité'],
        ['kation…, anion…, …yl', 'Ionty a atomové skupiny', 'anion síranový, sulfuryl'],
        ['…hydrát + sůl ve 2. pádě', 'Krystalohydráty', 'pentahydrát síranu měďnatého'],
        ['ligandy jako předpony (hexakyano-, tetraammin-)', 'Komplexní sloučeniny', 'hexakyanoželeznatan draselný'],
      ])}
      <h3>Podle vzorce</h3>
      ${table(['Vzorec', 'Skupina'], [
        [`kov + O: ${f('Fe2O3')}`, 'oxid'],
        [`O₂ nebo O₃ u kovu: ${f('Na2O2')}, ${f('NaO2')}, ${f('KO3')}`, 'peroxid, hyperoxid, ozonid'],
        [`skupiny OH: ${f('Ca(OH)2')}`, 'hydroxid'],
        [`H na začátku: ${f('H2SO4')}, ${f('HCl')}`, 'kyselina'],
        [`H na konci za kovem: ${f('CaH2')}`, 'iontový hydrid'],
        [`kov + C₂, C, N, NH₂, NH, N₃, CN: ${f('CaC2')}, ${f('Na3N')}, ${f('NaN3')}`, 'acetylid, karbid, nitrid, amid, imid, azid, kyanid'],
        [`kov + víceatomový anion s kyslíkem: ${f('Na2SO4')}`, 'sůl kyslíkaté kyseliny'],
        [`H uvnitř aniontu soli: ${f('NaHCO3')}`, 'hydrogensůl'],
        [`· n H₂O: ${f('CuSO4·5H2O')}`, 'krystalohydrát'],
        [`hranatá závorka: ${f('K4[Fe(CN)6]')}`, 'komplexní sloučenina'],
        [`náboj u vzorce: ${ion('SO4', 2)}`, 'ion'],
      ])}
      <h3>Pozor na záměny</h3>
      <ul>
        <li>${f('Na2O')} oxid, ${f('Na2O2')} peroxid, ${f('NaO2')} hyperoxid, ${f('NaO3')} ozonid: stejné prvky, jiný poměr a jiný náboj skupiny.</li>
        <li>${f('Na3N')} nitrid (N³⁻), ${f('NaN3')} azid (N₃⁻), ${f('NaNH2')} amid (NH₂⁻), ${f('Na2NH')} imid (NH²⁻).</li>
        <li>${f('CaC2')} acetylid (C₂²⁻) a ${f('Al4C3')} karbid (C⁴⁻).</li>
        <li>FeS sulfid železnatý a ${f('FeS2')} disulfid železnatý: železo má v obou II, liší se anion.</li>
        <li>CO je oxid uhelnatý, ale jako atomová skupina karbonyl. ${f('SO2')} je oxid siřičitý i skupina sulfuryl.</li>
        <li>HCl jako plyn je chlorovodík (kovalentní hydrid), jeho vodný roztok je kyselina chlorovodíková.</li>
      </ul>`,
  },
  {
    id: 'oxidy',
    title: 'Oxidy',
    sub: 'Oxidy a podvojné oxidy',
    groups: subsOf('oxidy'),
    body: () => `
      <p>Oxidy jsou dvouprvkové sloučeniny kyslíku. Kyslík v nich má vždy ${oxs('O', -2)}. Název je <b>oxid</b> + přídavné jméno druhého prvku s koncovkou podle jeho oxidačního čísla.</p>
      ${table(['Skupina', 'Čím se liší', 'Příklad'], [['Oxidy', 'jeden druh kationtu', `${f('Fe2O3')} oxid železitý`], ['Podvojné oxidy', 'dva různé kationty', `${f('Fe3O4')} tetraoxid železnato-železitý`]])}
      <h3>Oxidy</h3>
      <p><b>Název → vzorec:</b></p>
      ${steps(['Z koncovky přídavného jména urči oxidační číslo prvku.', 'Kyslík má −II.', 'Použij křížové pravidlo a vzorec zkrať.'])}
      ${example(`<b>oxid hlinitý</b>: hlinitý → ${oxs('Al', 3)}, oxid → ${oxs('O', -2)} → <b>${f('Al2O3')}</b>`)}
      <p><b>Vzorec → název:</b> spočítej náboj kyslíků a rozděl ho mezi atomy prvku.</p>
      ${example(`<b>${f('Mn2O7')}</b>: 7 · (−2) = −14, dva atomy Mn mají +14, jeden tedy VII → <b>oxid manganistý</b>`)}
      <ul>
        <li>Jeden prvek může mít víc oxidů. Dusík: ${f('N2O')} dusný, NO dusnatý, ${f('N2O3')} dusitý, ${f('NO2')} dusičitý, ${f('N2O5')} dusičný.</li>
        <li>CO je oxid <b>uhelnatý</b> (ne uhličnatý), ${f('CO2')} oxid uhličitý.</li>
      </ul>
      ${ex('Na2O', 'CaO', 'Al2O3', 'CO2', 'SO3', 'Cl2O7', 'OsO4')}
      <h3>Podvojné oxidy</h3>
      <p>Obsahují dva různé kationty (nebo jeden prvek ve dvou oxidačních číslech). Pravidla:</p>
      <ul>
        <li>Kationty se ve vzorci i v názvu píšou v pořadí <b>rostoucích oxidačních čísel</b>. Při stejném čísle abecedně podle značky, víceatomový kation (NH₄⁺) na konec.</li>
        <li>V názvu se kationty spojí pomlčkou: první dostane koncovku -o (železnato-), druhý normální koncovku (železitý).</li>
        <li>Počet kyslíků se vyjádří předponou: tetraoxid, trioxid.</li>
      </ul>
      <p><b>Postup:</b></p>
      ${steps(['Z přídavných jmen urči oba kationty a jejich oxidační čísla.', 'Sečti všechny kladné náboje.', 'Počet kyslíků = součet : 2.'])}
      ${example(`<b>tetraoxid železnato-železitý</b>: ${oxs('Fe', 2)} a 2 × ${oxs('Fe', 3)} → 2 + 6 = 8 → 4 kyslíky → <b>${f('Fe3O4')}</b>`)}
      ${ex('Fe3O4', 'FeCr2O4', 'MgAl2O4', 'CaTiO3', 'KVO3', 'NaNH4O')}`,
  },
  {
    id: 'hydroxidy',
    title: 'Hydroxidy',
    sub: 'Kov a skupiny OH',
    groups: subsOf('hydroxidy'),
    body: () => `
      <p>Hydroxidy obsahují hydroxidovou skupinu ${ion('OH', 1)} s nábojem −I. Název je <b>hydroxid</b> + přídavné jméno kovu.</p>
      <p>Počet skupin OH se rovná oxidačnímu číslu kovu. Když je skupin víc než jedna, píše se OH do závorky.</p>
      ${steps(['Z koncovky urči oxidační číslo kovu.', 'Napiš tolik skupin OH, kolik je oxidační číslo.', 'Víc než jednu skupinu dej do závorky.'])}
      ${example(`<b>hydroxid hlinitý</b>: ${oxs('Al', 3)} → 3 skupiny OH → <b>${f('Al(OH)3')}</b>`)}
      ${ex('NaOH', 'KOH', 'Ca(OH)2', 'Fe(OH)2', 'Fe(OH)3', 'Al(OH)3')}
      ${tip(`${f('CaOH2')} je špatně: dvojka by patřila jen k vodíku, takže by ve vzorci byl jen jeden kyslík. Dvě celé skupiny OH se píšou ${f('Ca(OH)2')}.`)}`,
  },
  {
    id: 'kyslik',
    title: 'Další sloučeniny kyslíku',
    sub: 'Hyperoxidy, ozonidy, peroxidy a hydrogenperoxidy',
    groups: subsOf('kyslik'),
    body: () => `
      <p>Kromě oxidového aniontu ${ion('O', 2)} tvoří kyslík víceatomové anionty. Rozhoduje <b>náboj celé skupiny</b>, ne jednotlivých atomů. Skupinu ber jako celek a použij křížové pravidlo.</p>
      ${table(['Skupina', 'Anion', 'Náboj', 'Příklad'], [
        ['Peroxidy', ion('O2', 2), '−II (každý O má −I)', `${f('Na2O2')} peroxid sodný`],
        ['Hyperoxidy (superoxidy)', ion('O2', 1), '−I', `${f('NaO2')} hyperoxid sodný`],
        ['Ozonidy', ion('O3', 1), '−I', `${f('NaO3')} ozonid sodný`],
        ['Hydrogenperoxidy', ion('HO2', 1), '−I (H₂O₂ bez jednoho H)', `${f('NaHO2')} hydrogenperoxid sodný`],
      ])}
      ${tip(`U sodíku: ${f('Na2O')} oxid, ${f('Na2O2')} peroxid, ${f('NaO2')} hyperoxid, ${f('NaO3')} ozonid. Stejné prvky, jiný poměr.`)}
      <h3>Peroxidy</h3>
      <p>Peroxidová skupina vznikne z ${f('H2O2')} odtržením obou vodíků. Tvoří je hlavně alkalické kovy a kovy alkalických zemin. Kov s I tvoří ${f('M2O2')}, kov s II tvoří ${f('MO2')}. Vzorec se <b>nekrátí</b>: peroxid sodný je ${f('Na2O2')}, ne NaO.</p>
      ${ex('Na2O2', 'K2O2', 'BaO2', 'CaO2', 'H2O2')}
      <h3>Hyperoxidy</h3>
      <p>Hyperoxidový anion ${ion('O2', 1)} má o elektron víc než molekula kyslíku. Tvoří je hlavně alkalické kovy: ${f('MO2')}. Říká se jim i superoxidy.</p>
      ${ex('NaO2', 'KO2', 'CsO2')}
      <h3>Ozonidy</h3>
      <p>Ozonidový anion ${ion('O3', 1)} odpovídá ozonu s jedním elektronem navíc. Alkalické kovy tvoří ${f('MO3')}.</p>
      ${ex('LiO3', 'NaO3', 'KO3')}
      <h3>Hydrogenperoxidy</h3>
      <p>Anion ${ion('HO2', 1)} vznikne z ${f('H2O2')} odtržením jen jednoho vodíku. Vzorec ${f('MHO2')}.</p>
      ${ex('LiHO2', 'KHO2')}`,
  },
  {
    id: 'nekovy',
    title: 'Sloučeniny nekovů a polokovů',
    sub: 'Boridy, acetylidy, karbidy, silicidy, nitridy, amidy, imidy, fosfidy, arsenidy',
    groups: subsOf('nekovy'),
    body: () => `
      <p>Sloučeniny kovů s borem, uhlíkem, křemíkem, dusíkem, fosforem nebo arsenem, ve kterých je nekov záporný. Podstatné jméno končí na <b>-id</b>. Pojmenovávají se dvěma způsoby:</p>
      <ul>
        <li><b>Stechiometrické</b>: přídavné jméno s koncovkou podle oxidačního čísla a křížové pravidlo, jako u oxidů: nitrid sodný ${f('Na3N')}.</li>
        <li><b>Nestechiometrické</b>: oxidační čísla se nepoužívají. Počty atomů jsou v názvu předponami a kov je ve 2. pádě: karbid triželeza ${f('Fe3C')}. Vzorec se jen přečte z předpon.</li>
      </ul>
      ${table(['Skupina', 'Anion', 'Odvozeno od', 'Příklad'], [
        ['Boridy', 'bor (většinou nestechiometrické)', '', `${f('Mg3B2')} diborid trihořčíku`],
        ['Acetylidy', ion('C2', 2), 'acetylen C₂H₂', `${f('CaC2')} acetylid vápenatý`],
        ['Karbidy', `${ion('C', 4)} nebo nestechiometrické`, 'methan CH₄', `${f('Al4C3')} karbid hlinitý`],
        ['Silicidy', 'křemík (nestechiometrické)', '', `${f('CrSi2')} disilicid chromu`],
        ['Nitridy', ion('N', 3), 'amoniak NH₃', `${f('Na3N')} nitrid sodný`],
        ['Amidy', ion('NH2', 1), 'NH₃ bez jednoho H', `${f('KNH2')} amid draselný`],
        ['Imidy', ion('NH', 2), 'NH₃ bez dvou H', `${f('Na2NH')} imid sodný`],
        ['Fosfidy', `${ion('P', 3)} nebo nestechiometrické`, 'fosfan PH₃', `${f('AlP')} fosfid hlinitý`],
        ['Arsenidy', `${ion('As', 3)} nebo nestechiometrické`, 'arsan AsH₃', `${f('GaAs')} arsenid gallitý`],
      ])}
      <h3>Jak na stechiometrické</h3>
      ${steps(['Urči náboj aniontu podle tabulky (nitrid −III, acetylid −II…).', 'Z koncovky přídavného jména urči oxidační číslo kovu.', 'Použij křížové pravidlo. Víceatomový anion (NH₂, C₂ jen při více kusech) dej do závorky.'])}
      ${example(`<b>nitrid hořečnatý</b>: ${ion('Mg', 2, '+')} a ${ion('N', 3)} → <b>${f('Mg3N2')}</b>`)}
      <h3>Jak na nestechiometrické</h3>
      ${example(`<b>diborid trihořčíku</b>: di-borid → 2 B, tri-hořčíku → 3 Mg → <b>${f('Mg3B2')}</b>`)}
      ${tip(`Pozor na záměny: acetylid ${f('CaC2')} × karbid ${f('Al4C3')}; nitrid ${f('Na3N')} × azid ${f('NaN3')} × amid ${f('NaNH2')} × imid ${f('Na2NH')}.`)}
      <h3>Příklady</h3>
      ${ex('CaC2', 'Ag2C2', 'Al4C3', 'SiC', 'Fe3C', 'WC', 'BN', 'Si3N4', 'Li3N', 'LiNH2', 'SrNH', 'Zn3P2', 'Fe2P', 'Zn3As2', 'NiAs2', 'UB4', 'U3Si2')}`,
  },
  {
    id: 'hydridy',
    title: 'Hydridy',
    sub: 'Iontové a kovalentní hydridy',
    groups: subsOf('hydridy'),
    body: () => `
      ${table(['Skupina', 'S čím', 'Vodík', 'Název', 'Příklad'], [
        ['Iontové hydridy', 'kovy I.A a II.A skupiny', '−I, píše se vpravo', 'hydrid + přídavné jméno', `${f('NaH')} hydrid sodný`],
        ['Kovalentní hydridy', 'prvky III.A až VII.A skupiny', 'píše se vpravo u III.–V.A, vlevo u VI.–VII.A', 'jedno slovo na -an, u halogenů …vodík', `${f('SiH4')} silan`],
      ])}
      <h3>Iontové hydridy</h3>
      <p>Vodík má oxidační číslo −I. Kov s I tvoří MH, kov s II tvoří ${f('MH2')}.</p>
      ${ex('LiH', 'NaH', 'CaH2', 'MgH2', 'BaH2')}
      <h3>Kovalentní hydridy</h3>
      <ul>
        <li>Prvky III.A a IV.A: počet vodíků = číslo skupiny (B, Al: 3; C, Si, Ge, Sn: 4). Název = kmen prvku + -an.</li>
        <li>Prvky V.A a VI.A: počet vodíků = 8 − číslo skupiny (P, As, Sb: 3; S, Se, Te: 2).</li>
        <li>Halogeny (VII.A): vzorec HX, název = halogen s koncovkou -o + vodík (chlorovodík).</li>
        <li>Víc atomů prvku se vyjádří předponou: ${f('B2H6')} diboran, ${f('Si2H6')} disilan.</li>
        <li>Výjimky s triviálními názvy: voda, amoniak, hydrazin, methan, azidovodík.</li>
      </ul>
      ${table(['Skupina', 'Příklady'], [
        ['III.A', `${f('BH3')} boran, ${f('B2H6')} diboran, ${f('AlH3')} alan`],
        ['IV.A', `${f('CH4')} methan, ${f('SiH4')} silan, ${f('GeH4')} german, ${f('SnH4')} stannan`],
        ['V.A', `${f('NH3')} amoniak, ${f('PH3')} fosfan, ${f('AsH3')} arsan, ${f('SbH3')} stiban`],
        ['VI.A', `${f('H2O')} voda, ${f('H2S')} sulfan, ${f('H2Se')} selan, ${f('H2Te')} tellan`],
        ['VII.A', 'HF fluorovodík, HCl chlorovodík, HBr bromovodík, HI jodovodík'],
      ])}
      ${ex('N2H4', 'HN3', 'P2H4', 'Si4H10', 'B10H14')}`,
  },
  {
    id: 'bezkyslikate',
    title: 'Bezkyslíkaté kyseliny',
    sub: 'Vodík a nekov bez kyslíku',
    groups: subsOf('bezkyslikate'),
    body: () => `
      <p>Bezkyslíkaté kyseliny jsou vodné roztoky kovalentních hydridů nekovů. Název je <b>kyselina</b> + název plynu s koncovkou -ová: chlorovodík → kyselina chlorovodíková.</p>
      <p>Počet vodíků odpovídá oxidačnímu číslu nekovu: halogeny mají −I, takže stačí jeden vodík. Síra má −II, takže potřebuje dva.</p>
      ${ex('HF', 'HCl', 'HBr', 'HI', 'H2S', 'HCN')}
      ${tip('HCl jako plyn je chlorovodík. Kyselinou chlorovodíkovou se stává až v roztoku ve vodě.')}`,
  },
  {
    id: 'kyslikate',
    title: 'Kyslíkaté kyseliny',
    sub: 'Kyslíkaté, thio-, peroxo-, halogen-, amido- a isopolykyseliny',
    groups: subsOf('kyslikate'),
    body: () => `
      <p>Kyslíkaté kyseliny (oxokyseliny) mají vzorec H<sub>x</sub>EO<sub>y</sub>: vodík, centrální prvek a kyslík. Ostatní typy vzniknou z nich tím, že se něco nahradí. Vždy začni od základní kyseliny a sleduj, co změnila předpona.</p>
      ${table(['Typ', 'Co se změnilo', 'Příklad'], [
        ['Kyslíkaté kyseliny', 'základ', `${f('H2SO4')} kyselina sírová`],
        ['Thiokyseliny', 'kyslík nahrazen sírou', `${f('H2S2O3')} kyselina thiosírová`],
        ['Peroxokyseliny', 'kyslík nahrazen skupinou O₂', `${f('H2SO5')} kyselina peroxosírová`],
        ['Halogenkyseliny', 'skupina OH nahrazena halogenem', `${f('HSO3Cl')} kyselina chlorosírová`],
        ['Amidokyseliny', 'skupina OH nahrazena skupinou NH₂', `${f('HSO3NH2')} kyselina amidosírová`],
        ['Isopolykyseliny', 'víc centrálních atomů téhož prvku', `${f('H2Cr2O7')} kyselina dichromová`],
      ])}
      <h3>Kyslíkaté kyseliny</h3>
      <p>Název je <b>kyselina</b> + přídavné jméno s koncovkou podle oxidačního čísla centrálního prvku: -ná, -natá, -itá, -ičitá, -ičná/-ečná, -ová, -istá, -ičelá.</p>
      <p><b>Název → vzorec:</b></p>
      ${steps(['Z přídavného jména urči centrální prvek a jeho oxidační číslo.', 'Urči počet vodíků. Když je oxidační číslo <b>liché</b>, je jeden vodík, když je <b>sudé</b>, jsou dva. Když má název předponu (např. trihydrogen-), platí počet z předpony.', 'Počet kyslíků = (počet vodíků + oxidační číslo) : 2.'])}
      <ul class="chem-examples">
        <li><b>kyselina chloristá</b>: ${oxs('Cl', 7)}, liché → 1 H, O = (1 + 7) : 2 = 4 → <b>${f('HClO4')}</b></li>
        <li><b>kyselina sírová</b>: ${oxs('S', 6)}, sudé → 2 H, O = (2 + 6) : 2 = 4 → <b>${f('H2SO4')}</b></li>
        <li><b>kyselina trihydrogenfosforečná</b>: ${oxs('P', 5)}, 3 H, O = (3 + 5) : 2 = 4 → <b>${f('H3PO4')}</b></li>
      </ul>
      <p><b>Vzorec → název:</b> oxidační číslo = (2 · počet O − počet H) : počet atomů centrálního prvku.</p>
      ${example(`<b>${f('HNO2')}</b>: 2 · 2 − 1 = 3 → ${oxs('N', 3)} → <b>kyselina dusitá</b>`)}
      ${ex('HClO', 'HClO3', 'HNO3', 'H2CO3', 'H2SiO3', 'H2SO3', 'H3PO4', 'HMnO4', 'H4SiO4', 'H5IO6')}
      ${tip(`Kyselině ${f('H3PO4')} se běžně říká kyselina fosforečná. Systematický název je trihydrogenfosforečná, protože podle pravidla o lichém čísle by „fosforečná“ byla ${f('HPO3')}.`)}
      <h3>Thiokyseliny</h3>
      <p>Předpona <b>thio-</b> znamená, že atom kyslíku je nahrazen atomem síry. Dithio-, trithio- říká, kolik kyslíků se nahradilo.</p>
      ${example(`${f('H2SO4')} → jeden O za S → <b>${f('H2S2O3')}</b> kyselina thiosírová`)}
      ${ex('H2S2O3', 'HSCN', 'H3PO2S2', 'H2CS3')}
      <h3>Peroxokyseliny</h3>
      <p>Předpona <b>peroxo-</b> znamená, že jeden kyslík je nahrazen peroxidovou skupinou O₂²⁻, takže ve vzorci přibude jeden kyslík.</p>
      ${example(`${f('H2SO4')} → <b>${f('H2SO5')}</b> kyselina peroxosírová`)}
      ${ex('HNO4', 'H2SO5', 'H2S2O8', 'H2CO5')}
      <h3>Halogenkyseliny</h3>
      <p>Předpona <b>fluoro-, chloro-, bromo-</b> znamená, že skupina OH je nahrazena halogenem. Pomůže napsat kyselinu se skupinami OH: ${f('H2SO4')} = ${f('SO2(OH)2')}.</p>
      ${example(`${f('SO2(OH)2')} → jedna OH za Cl → <b>${f('HSO3Cl')}</b> kyselina chlorosírová`)}
      ${ex('HSO3Cl', 'HSO3F', 'HPO2F2', 'H2PO3Br')}
      <h3>Amidokyseliny</h3>
      <p>Předpona <b>amido-</b> znamená, že skupina OH je nahrazena amidovou skupinou NH₂.</p>
      ${example(`${f('SO2(OH)2')} → jedna OH za NH₂ → <b>${f('HSO3NH2')}</b> kyselina amidosírová`)}
      ${ex('HSO3NH2', 'H2PO3NH2', 'HAsO2(NH2)2')}
      <h3>Isopolykyseliny</h3>
      <p>Mají víc atomů téhož centrálního prvku. Jejich počet udává předpona před kmenem (di-, tri-, tetra-). Postup je stejný, jen oxidační číslo se násobí počtem atomů: O = (H + počet atomů · ox. číslo) : 2.</p>
      ${example(`<b>kyselina disírová</b>: 2 × ${oxs('S', 6)}, 2 H → O = (2 + 2 · 6) : 2 = 7 → <b>${f('H2S2O7')}</b>`)}
      ${ex('H2Cr2O7', 'H2S2O5', 'H2S2O7', 'H4P2O7', 'H5P3O10', 'H2B4O7')}`,
  },
  {
    id: 'halogenidy',
    title: 'Halogenidy',
    sub: 'Fluoridy, chloridy, bromidy a jodidy',
    groups: subsOf('halogenidy'),
    body: () => `
      <p>Halogenidy jsou soli halogenovodíkových kyselin. Podstatné jméno je <b>fluorid, chlorid, bromid nebo jodid</b>, halogen má vždy ${oxs('X', -1)}. Přídavné jméno udává kation a jeho oxidační číslo (I až VIII).</p>
      ${steps(['Z koncovky přídavného jména urči oxidační číslo kationtu.', 'Halogen má −I, takže počet atomů halogenu = oxidační číslo kationtu.'])}
      ${example(`<b>bromid hlinitý</b>: ${oxs('Al', 3)} → 3 × Br → <b>${f('AlBr3')}</b>`)}
      ${ex('KCl', 'CaF2', 'AlBr3', 'CCl4', 'SbCl5', 'WCl6', 'NH4Cl', 'SF6')}
      ${tip(`S prvky v oxidačním čísle vyšším než VI tvoří sloučeniny jen fluor. Výjimky v pojmenování jsou sloučeniny fluoru s kyslíkem, protože fluor je elektronegativnější: ${f('OF2')} difluorid kyslíku, ${f('O2F2')} difluorid dikyslíku.`)}`,
  },
  {
    id: 'sulfidy',
    title: 'Sulfidy',
    sub: 'Sulfidy, hydrogensulfidy a disulfidy',
    groups: subsOf('sulfidy'),
    body: () => `
      <p>Sulfidy (dříve sirníky) jsou sloučeniny síry odvozené od sulfanu ${f('H2S')}. Liší se tím, kolik vodíků se z ${f('H2S')} odtrhlo a kolik atomů síry je v aniontu:</p>
      ${table(['Skupina', 'Anion', 'Vznik', 'Příklad'], [
        ['Sulfidy', ion('S', 2), 'H₂S bez obou vodíků', `${f('Na2S')} sulfid sodný`],
        ['Hydrogensulfidy', ion('HS', 1), 'H₂S bez jednoho vodíku', `${f('NaHS')} hydrogensulfid sodný`],
        ['Disulfidy', ion('S2', 2), 'dva atomy síry s nábojem −II', `${f('FeS2')} disulfid železnatý (pyrit)`],
      ])}
      <p>Postup je stejný jako u oxidů: urči náboj aniontu a oxidační číslo kationtu, pak křížové pravidlo.</p>
      ${tip(`FeS je sulfid železnatý a ${f('FeS2')} disulfid železnatý. Železo má v obou II, liší se anion. Obdobně existují polysulfidy ${ion('Sn', 2)}.`)}
      ${ex('Na2S', 'HgS', 'Al2S3', 'CS2', 'P2S5', 'KHS', 'Ca(HS)2', 'FeS2', 'Na2S2')}`,
  },
  {
    id: 'dalsi-soli',
    title: 'Další soli bezkyslíkatých kyselin',
    sub: 'Selenidy, telluridy, kyanidy, azidy a jejich hydrogensoli',
    groups: subsOf('dalsi-soli'),
    body: () => `
      <p>Soli dalších bezkyslíkatých kyselin. Pracuje se s nimi stejně jako se sulfidy a halogenidy: anion má pevný náboj, kation se určí z koncovky a vzorec z křížového pravidla.</p>
      ${table(['Skupina', 'Anion', 'Od kyseliny', 'Příklad'], [
        ['Selenidy', ion('Se', 2), 'selan H₂Se', `${f('Na2Se')} selenid sodný`],
        ['Hydrogenselenidy', ion('HSe', 1), 'H₂Se bez jednoho H', `${f('NaHSe')} hydrogenselenid sodný`],
        ['Telluridy', ion('Te', 2), 'tellan H₂Te', `${f('Ag2Te')} tellurid stříbrný`],
        ['Hydrogentelluridy', ion('HTe', 1), 'H₂Te bez jednoho H', `${f('NaHTe')} hydrogentellurid sodný`],
        ['Kyanidy', ion('CN', 1), 'kyselina kyanovodíková HCN', `${f('KCN')} kyanid draselný`],
        ['Azidy', ion('N3', 1), 'azidovodík HN₃', `${f('NaN3')} azid sodný`],
      ])}
      ${example(`<b>kyanid vápenatý</b>: ${ion('Ca', 2, '+')} a ${ion('CN', 1)} → dva kyanidy v závorce → <b>${f('Ca(CN)2')}</b>`)}
      ${tip(`Azid ${f('NaN3')} (anion N₃⁻) není nitrid ${f('Na3N')} (anion N³⁻).`)}
      ${ex('CdSe', 'Al2Se3', 'BaTe', 'As2Te3', 'LiHTe', 'NH4CN', 'Pb(N3)2')}`,
  },
  {
    id: 'soli',
    title: 'Soli kyslíkatých kyselin',
    sub: 'Soli, hydrogensoli, thiosoli, podvojné a smíšené soli',
    groups: subsOf('soli'),
    body: () => `
      <p>Soli kyslíkatých kyselin vzniknou, když kyselina odevzdá vodíky a místo nich je kov (nebo ${ion('NH4', 1, '+')}). Název je podstatné jméno aniontu + přídavné jméno kationtu: <b>síran sodný</b>.</p>
      ${table(['Typ', 'Čím se liší', 'Příklad'], [
        ['Soli', 'kyselina odevzdala všechny vodíky', `${f('Na2SO4')} síran sodný`],
        ['Hydrogensoli', 'v aniontu zůstaly vodíky', `${f('NaHCO3')} hydrogenuhličitan sodný`],
        ['Thiosoli', 'anion thiokyseliny', `${f('Na2S2O3')} thiosíran sodný`],
        ['Podvojné soli', 'dva různé kationty', `${f('KAl(SO4)2')} síran draselno-hlinitý`],
        ['Smíšené soli', 'dva různé anionty', `${f('MgCl(OH)')} chlorid-hydroxid hořečnatý`],
      ])}
      <h3>Anion z kyseliny</h3>
      <p>Odtržením všech vodíků vznikne anion. Jeho náboj se rovná počtu odtržených vodíků. Koncovka kyseliny <b>-á</b> se změní na <b>-an</b> (sírová → síran, dusičná → dusičnan).</p>
      ${table(['Kyselina', 'Anion', 'Název'], [['HNO3', 'NO3', 1, 'dusičnan'], ['HNO2', 'NO2', 1, 'dusitan'], ['H2SO4', 'SO4', 2, 'síran'], ['H2SO3', 'SO3', 2, 'siřičitan'], ['H2CO3', 'CO3', 2, 'uhličitan'], ['H3PO4', 'PO4', 3, 'fosforečnan'], ['HClO', 'ClO', 1, 'chlornan'], ['HClO3', 'ClO3', 1, 'chlorečnan'], ['HClO4', 'ClO4', 1, 'chloristan'], ['HMnO4', 'MnO4', 1, 'manganistan'], ['H2SiO3', 'SiO3', 2, 'křemičitan'], ['H2Cr2O7', 'Cr2O7', 2, 'dichroman']].map(([acid, a, n, name]) => [f(acid), ion(a, n), name]))}
      <h3>Soli</h3>
      ${steps(['Z podstatného jména urči anion a jeho náboj.', 'Z přídavného jména urči kation a jeho náboj.', 'Použij křížové pravidlo. Víceatomový ion dej do závorky, když je ve vzorci víckrát.'])}
      ${example(`<b>fosforečnan vápenatý</b>: ${ion('PO4', 3)} a ${ion('Ca', 2, '+')} → <b>${f('Ca3(PO4)2')}</b>`)}
      ${example(`<b>${f('Fe2(SO4)3')}</b>: ${ion('SO4', 2)} je síran, 3 · (−2) = −6, dva atomy Fe mají +6, jeden tedy III → <b>síran železitý</b>`)}
      ${ex('NaClO', 'KMnO4', 'CaCO3', 'Al(NO3)3', '(NH4)2SO4', 'K2Cr2O7')}
      <h3>Hydrogensoli</h3>
      <p>Když kyselina odevzdá jen část vodíků, zbylé vodíky zůstanou v aniontu. Označí se předponou <b>hydrogen-</b> (dihydrogen-, …). Náboj aniontu = počet odtržených vodíků.</p>
      ${example(`${f('H3PO4')} → odtrhne se jeden H → ${ion('H2PO4', 1)} dihydrogenfosforečnan → ${f('KH2PO4')} dihydrogenfosforečnan draselný`)}
      ${ex('NaHCO3', 'NaHSO4', 'CaHPO4', 'Ca(H2PO4)2', 'Ca(HCO3)2')}
      <h3>Thiosoli</h3>
      <p>Soli thiokyselin. Anion se pojmenuje podle thiokyseliny: kyselina thiosírová → ${ion('S2O3', 2)} thiosíran, kyselina thiokyanatá → ${ion('SCN', 1)} thiokyanatan.</p>
      ${ex('Na2S2O3', 'KSCN', 'NH4HS2O3', 'Zn3(PO2S2)2')}
      <h3>Podvojné soli</h3>
      <p>Mají dva různé kationty. Řadí se podle <b>rostoucího oxidačního čísla</b>, při stejném čísle abecedně podle značky, NH₄⁺ na konec. V názvu je spojí pomlčka a první dostane koncovku -o.</p>
      ${example(`<b>síran draselno-hlinitý</b>: ${ion('K', 1, '+')} + ${ion('Al', 3, '+')} = +4 → 2 × ${ion('SO4', 2)} → <b>${f('KAl(SO4)2')}</b>`)}
      ${ex('KAl(SO4)2', 'KCr(SO4)2', 'CaMg(CO3)2', 'NH4MgPO4', 'NaNH4HPO4')}
      <h3>Smíšené soli</h3>
      <p>Mají jeden druh kationtu a dva různé anionty. Anionty se v názvu spojí pomlčkou. Počet víceatomových aniontů se vyjádří násobnou předponou (bis, tris) a závorkou.</p>
      ${ex('MgCl(OH)', 'SnCl2I2', 'Ca5F(PO4)3', 'Cu3(CO3)2F2')}`,
  },
  {
    id: 'derivaty',
    title: 'Funkční deriváty kyselin',
    sub: 'Halogenidy a amidy kyselin',
    groups: subsOf('derivaty'),
    body: () => `
      <p>Funkční deriváty kyselin vzniknou, když se v kyselině nahradí <b>všechny</b> skupiny OH halogenem nebo amidovou skupinou NH₂. Nejsou to kyseliny, protože nemají odštěpitelný vodík. Halogen nebo NH₂ v nich má −I.</p>
      <p>Název = halogenid nebo amid (s číslovkovou předponou) + název kyseliny ve 2. pádě. Místo kyseliny se dá použít i název atomové skupiny, která zbude (karbonyl, sulfuryl…).</p>
      <p><b>Jak na to:</b></p>
      ${steps(['Napiš kyselinu se skupinami OH: H₂CO₃ = CO(OH)₂.', 'Nahraď všechny skupiny OH: CO(OH)₂ → COCl₂.', 'Pojmenuj: dichlorid kyseliny uhličité, nebo podle zbytku CO dichlorid karbonylu.'])}
      ${ex('COCl2', 'CO(NH2)2', 'SO2Cl2', 'SO2(NH2)2', 'SOCl2', 'POCl3', 'POF3', 'NOCl', 'NO2Cl', 'CrO2Cl2')}`,
  },
  {
    id: 'ionty',
    title: 'Ionty a atomové skupiny',
    sub: 'Kationty, anionty a skupiny s koncovkou -yl',
    groups: subsOf('ionty'),
    body: () => `
      ${table(['Druh', 'Název', 'Příklad'], [
        ['Jednoatomový kation', 'kation + přídavné jméno s koncovkou podle náboje', `${ion('Fe', 2, '+')} kation železnatý`],
        ['Víceatomový kation', 'koncovka -oniový nebo -onium', `${ion('H3O', 1, '+')} kation oxoniový (oxonium)`],
        ['Jednoatomový anion', 'koncovka -idový', `${ion('Cl', 1)} anion chloridový`],
        ['Anion kyslíkaté kyseliny', 'koncovka -anový (název soli + -ový)', `${ion('SO4', 2)} anion síranový`],
        ['Atomová skupina', 'koncovka -yl', `${f('SO2')} sulfuryl`],
      ])}
      <h3>Kationty</h3>
      <ul>
        <li>Jednoatomové: <b>kation</b> + přídavné jméno prvku s koncovkou podle oxidačního čísla (${ion('Li', 1, '+')} kation lithný, ${ion('Cr', 3, '+')} kation chromitý).</li>
        <li>Víceatomové kationty vzniklé přidáním H⁺ k molekule mají koncovku <b>-oniový</b> nebo jednoslovně <b>-onium</b>: ${f('PH3')} + H⁺ → ${ion('PH4', 1, '+')} kation fosfoniový.</li>
        <li>Výjimka je ${ion('NH4', 1, '+')}, kation amonný (amonium). V solích zůstává přídavné jméno amonný: NH₄Cl chlorid amonný.</li>
        <li>Soli ostatních víceatomových kationtů mají kation ve 2. pádě: PH₄I jodid fosfonia, H₃OClO₄ chloristan oxonia.</li>
      </ul>
      ${ex('i:Na^1+', 'i:Fe^3+', 'i:NH4^1+', 'i:H3O^1+', 'i:PH4^1+', 'i:H2F^1+')}
      <h3>Anionty</h3>
      <ul>
        <li>Jednoatomové a některé víceatomové anionty mají koncovku <b>-idový</b>: ${ion('O', 2)} anion oxidový, ${ion('OH', 1)} anion hydroxidový, ${ion('CN', 1)} anion kyanidový.</li>
        <li>Anionty kyslíkatých kyselin a thiokyselin mají koncovku <b>-anový</b>: vezmi název aniontu soli a přidej -ový (síran → síranový, dusičnan → dusičnanový).</li>
        <li>Vodíky v aniontu vyjádří předpona hydrogen-: ${ion('H2PO4', 1)} anion dihydrogenfosforečnanový.</li>
      </ul>
      ${ex('i:H^1-', 'i:N^3-', 'i:S^2-', 'i:SO4^2-', 'i:NO3^1-', 'i:HCO3^1-', 'i:CrO4^2-')}
      ${tip('V procvičování napiš náboj za vzorec se stříškou nebo mezerou: SO4^2- nebo SO4 2-, NH4+. Bez oddělení by SO42- znamenalo něco jiného.')}
      <h3>Atomové skupiny</h3>
      <p>Neutrální a kladné skupiny s kyslíkem. Bez ohledu na náboj mají vždy koncovku <b>-yl</b>. Používají se hlavně v názvech funkčních derivátů (dichlorid karbonylu).</p>
      ${ex('g:OH', 'g:CO', 'g:NO', 'g:NO2', 'g:SO', 'g:SO2', 'g:PO', 'g:UO2', 'g:CrO2', 'g:ClO2')}`,
  },
  {
    id: 'hydraty',
    title: 'Krystalohydráty',
    sub: 'Soli s vodou v krystalu',
    groups: subsOf('hydraty'),
    body: () => `
      <p>Krystalohydráty jsou soli, které mají v krystalu chemicky vázanou vodu. Ve vzorci se voda píše za vzorec soli a odděluje se tečkou: ${f('CuSO4·5H2O')}.</p>
      <h3>Název</h3>
      <p>Číslovková předpona podle počtu molekul vody + <b>hydrát</b> + název soli ve <b>2. pádě</b>: síran měďnatý → pentahydrát <b>síranu měďnatého</b>.</p>
      ${steps(['Spočítej molekuly vody a vyber předponu (5 → penta).', 'Pojmenuj sůl a dej ji do 2. pádu (síran → síranu, měďnatý → měďnatého).'])}
      ${ex('CuSO4·5H2O', 'FeSO4·7H2O', 'ZnSO4·7H2O', 'CaSO4·2H2O', 'Na2SO4·10H2O', 'Na2CO3·10H2O', 'MgSO4·7H2O', 'CoCl2·6H2O')}
      ${tip('Ve vzorci můžeš místo tečky napsat obyčejnou tečku nebo hvězdičku: CuSO4.5H2O i CuSO4*5H2O se počítá. CaSO₄·½H₂O je hemihydrát síranu vápenatého (sádra).')}`,
  },
  {
    id: 'komplexy',
    title: 'Komplexní sloučeniny',
    sub: 'Centrální atom, ligandy a hranatá závorka',
    groups: subsOf('komplexy'),
    body: () => `
      <p>Komplexní (koordinační) sloučenina obsahuje koordinační částici: <b>centrální atom</b> (většinou přechodný kov, ale i Al nebo P), na který jsou navázané <b>ligandy</b>. Ligandů může být víc, než je oxidační číslo centrálního atomu.</p>
      <h3>Ligandy</h3>
      <p>Neutrální ligandy (H₂O, NH₃, CO, NO) náboj nemění. Aniontové ligandy ho snižují a jejich názvy končí na <b>-o</b>.</p>
      ${table(['Ligand', 'Název', 'Ligand', 'Název'], (() => {
        const rows = [];
        for (let i = 0; i < LIGANDS.length; i += 2) {
          const cell = ([formula, charge, name]) => [charge ? ion(formula, charge) : f(formula), name];
          rows.push([...cell(LIGANDS[i]), ...(LIGANDS[i + 1] ? cell(LIGANDS[i + 1]) : ['', ''])]);
        }
        return rows;
      })())}
      <h3>Vzorec</h3>
      <ul>
        <li>Celá koordinační částice je v <b>hranaté závorce</b>, víceatomové ligandy v kulaté: ${f('[Co(NH3)6]Cl3')}.</li>
        <li>Nejdřív centrální atom, pak ligandy v abecedním pořadí jejich názvů (ch se řadí pod c).</li>
      </ul>
      <h3>Název</h3>
      <ul>
        <li>Ligandy s číslovkovými předponami jdou před název centrálního atomu, ve stejném pořadí jako ve vzorci. Různé ligandy se oddělí pomlčkou: triammin-aqua-dichlorokobaltitý.</li>
        <li><b>Komplexní kation</b>: přídavné jméno s koncovkou -natý, -itý… (chlorid hexaammin<b>kobaltitý</b>).</li>
        <li><b>Komplexní anion</b>: podstatné jméno s koncovkou -natan, -itan… (hexakyano<b>železnatan</b> draselný). Při záporném oxidačním čísle koncovka <b>-id</b>.</li>
        <li><b>Neutrální komplex</b>: přídavné jméno + slovo komplex.</li>
      </ul>
      <h3>Jak na to</h3>
      ${steps(['Urči ligandy a jejich náboje.', 'Oxidační číslo centrálního atomu dopočítej tak, aby součet nábojů celé sloučeniny byl 0.', 'Podle toho, jestli je komplex kation, nebo anion, vyber koncovku.'])}
      ${example(`<b>${f('K4[Fe(CN)6]')}</b>: 4 × K⁺ = +4, takže [Fe(CN)₆] má −4. Šest kyanidů dává −6, Fe tedy má −4 − (−6) = II. Komplex je anion → <b>hexakyanoželeznatan draselný</b>.`)}
      ${example(`<b>síran tetraamminměďnatý</b>: 4 × NH₃ (neutrální), měďnatý → Cu²⁺, částice má +2 → jeden ${ion('SO4', 2)} → <b>${f('[Cu(NH3)4]SO4')}</b>`)}
      ${ex('K3[Fe(CN)6]', 'Na[Al(OH)4]', 'K2[PtCl6]', '[Ag(NH3)2]Cl', '[Cr(H2O)6]Cl3', '[Co(NH3)3(H2O)Cl2]Cl', 'Na[Co(CO)4]', '[Co(NH3)3Cl3]', '[Pt(NH3)4][PtCl4]')}`,
  },
  {
    id: 'prvky',
    title: 'Prvky a periodická tabulka',
    sub: 'Skupiny, periody a proč má sodík značku Na',
    groups: [],
    body: () => `
      <p>Periodická tabulka řadí prvky podle protonového čísla Z. <b>Řádky</b> jsou periody (1–7), <b>sloupce</b> jsou skupiny (1–18). Prvky ve stejné skupině mají podobné vlastnosti.</p>
      <h3>Skupiny s vlastním jménem</h3>
      <ul>
        <li><b>Alkalické kovy</b>, 1. skupina bez vodíku: Li, Na, K, Rb, Cs, Fr.</li>
        <li><b>Kovy alkalických zemin</b>, 2. skupina: Be, Mg, Ca, Sr, Ba, Ra (často se tak označují jen Ca, Sr, Ba a Ra).</li>
        <li><b>Halogeny</b>, 17. skupina: F, Cl, Br, I, At.</li>
        <li><b>Vzácné plyny</b>, 18. skupina: He, Ne, Ar, Kr, Xe, Rn.</li>
        <li><b>Přechodné kovy</b> jsou ve 3. až 12. skupině.</li>
        <li><b>Lanthanoidy</b> (La–Lu) a <b>aktinoidy</b> (Ac–Lr) jsou ve dvou řádcích pod tabulkou.</li>
      </ul>
      <h3>Kovy, polokovy, nekovy</h3>
      <p>Kovy jsou vlevo a uprostřed tabulky, nekovy vpravo nahoře. Na hranici mezi nimi leží polokovy: B, Si, Ge, As, Sb, Te.</p>
      <h3>Proč mají některé prvky „divné“ značky</h3>
      <p>Značky vycházejí z latinských názvů:</p>
      ${table(['Značka', 'Český název', 'Latinsky'], LATIN_SYMBOLS.map(s => element(s)).map(e => [`<b>${e.symbol}</b>`, e.name, e.latin]))}
      <h3>Jak psát značky</h3>
      <p>První písmeno je vždy velké, druhé malé. Na tom záleží: Co je kobalt, CO je oxid uhelnatý. Hf je hafnium, HF fluorovodík.</p>`,
  },
];

export const theoryPage = id => THEORY.find(t => t.id === id);
