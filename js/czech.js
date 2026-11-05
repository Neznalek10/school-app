import { dayKey, parseDay } from './events.js';

// Public holidays and important days follow Act 245/2000 Sb. (as amended); Easter moves, everything else is fixed.
const HOLIDAYS = [
  ['01-01', 'Nový rok, Den obnovy samostatného českého státu', "New Year's Day, Restoration of the Czech State"],
  ['05-01', 'Svátek práce', 'Labour Day'],
  ['05-08', 'Den vítězství', 'Victory Day'],
  ['07-05', 'Den slovanských věrozvěstů Cyrila a Metoděje', 'Saints Cyril and Methodius Day'],
  ['07-06', 'Den upálení mistra Jana Husa', 'Jan Hus Day'],
  ['09-28', 'Den české státnosti', 'St. Wenceslas Day, Czech Statehood Day'],
  ['10-28', 'Den vzniku samostatného československého státu', 'Independent Czechoslovak State Day'],
  ['11-17', 'Den boje za svobodu a demokracii a Mezinárodní den studentstva', "Struggle for Freedom and Democracy Day, International Students' Day"],
  ['12-24', 'Štědrý den', 'Christmas Eve'],
  ['12-25', '1. svátek vánoční', 'Christmas Day'],
  ['12-26', '2. svátek vánoční', "St. Stephen's Day"],
];

const IMPORTANT = [
  ['01-16', 'Den památky Jana Palacha', 'Jan Palach Remembrance Day'],
  ['01-27', 'Den památky obětí holocaustu a předcházení zločinům proti lidskosti', 'Holocaust Remembrance Day'],
  ['03-08', 'Mezinárodní den žen', "International Women's Day"],
  ['03-09', 'Den památky obětí vyhlazení terezínského rodinného tábora v Osvětimi-Březince', 'Remembrance of the Terezín family camp victims'],
  ['03-12', 'Den přístupu České republiky k Severoatlantické smlouvě (NATO)', 'Czech Republic joined NATO'],
  ['03-28', 'Den narození Jana Ámose Komenského', "Comenius's birthday, Teachers' Day"],
  ['03-30', 'Den české vlajky', 'Czech Flag Day', '2026-05-13'],
  ['04-07', 'Den vzdělanosti', 'Day of Education'],
  ['05-01', 'Den přistoupení České republiky k Evropské unii', 'Czech Republic joined the EU'],
  ['05-05', 'Květnové povstání českého lidu', 'May Uprising of the Czech people'],
  ['05-15', 'Den rodin', 'Day of Families'],
  ['05-27', 'Den národního vzdoru', 'Day of National Resistance'],
  ['06-10', 'Den památky obětí vyhlazení obce Lidice', 'Lidice Remembrance Day'],
  ['06-18', 'Den hrdinů druhého odboje', 'Heroes of the Second Resistance Day'],
  ['06-25', 'Den odchodu okupačních vojsk', 'Departure of the occupation troops'],
  ['06-27', 'Den památky obětí komunistického režimu', 'Victims of the Communist Regime Day'],
  ['08-21', 'Den památky obětí invaze a následné okupace vojsky Varšavské smlouvy', 'Victims of the 1968 invasion Day'],
  ['10-08', 'Památný den sokolstva', 'Sokol Remembrance Day'],
  ['10-12', 'Den samizdatu', 'Samizdat Day'],
  ['11-11', 'Den válečných veteránů', 'Veterans Day'],
];

// Spring break: the districts move one week later every year, and the last group comes round to the first week.
export const SPRING_GROUPS = [
  ['Česká Lípa', 'Jablonec nad Nisou', 'Liberec', 'Semily', 'Havlíčkův Brod', 'Jihlava', 'Pelhřimov', 'Třebíč', 'Žďár nad Sázavou', 'Kladno', 'Kolín', 'Kutná Hora', 'Písek', 'Náchod', 'Bruntál'],
  ['Mladá Boleslav', 'Příbram', 'Tábor', 'Prachatice', 'Strakonice', 'Ústí nad Labem', 'Chomutov', 'Most', 'Jičín', 'Rychnov nad Kněžnou', 'Olomouc', 'Šumperk', 'Opava', 'Jeseník'],
  ['Benešov', 'Beroun', 'Rokycany', 'České Budějovice', 'Český Krumlov', 'Klatovy', 'Trutnov', 'Pardubice', 'Chrudim', 'Svitavy', 'Ústí nad Orlicí', 'Ostrava-město', 'Prostějov'],
  ['Praha 1–5', 'Blansko', 'Brno-město', 'Brno-venkov', 'Břeclav', 'Hodonín', 'Vyškov', 'Znojmo', 'Domažlice', 'Tachov', 'Louny', 'Karviná'],
  ['Praha 6–10', 'Cheb', 'Karlovy Vary', 'Sokolov', 'Nymburk', 'Jindřichův Hradec', 'Litoměřice', 'Děčín', 'Přerov', 'Frýdek-Místek'],
  ['Kroměříž', 'Uherské Hradiště', 'Vsetín', 'Zlín', 'Praha-východ', 'Praha-západ', 'Mělník', 'Rakovník', 'Plzeň-město', 'Plzeň-sever', 'Plzeň-jih', 'Hradec Králové', 'Teplice', 'Nový Jičín'],
];
export const DISTRICTS = SPRING_GROUPS.flat().sort((a, b) => a.localeCompare(b, 'cs'));

// From MŠMT's "Organizace školního roku" for each year. A new school year is one more entry here.
const SCHOOL_YEARS = {
  2025: { start: '2025-09-01', autumn: ['2025-10-27', '2025-10-29'], christmas: ['2025-12-22', '2026-01-02'], reports: '2026-01-29', half: '2026-01-30', spring: '2026-02-02', end: '2026-06-30' },
  2026: { start: '2026-09-01', autumn: ['2026-10-29', '2026-10-30'], christmas: ['2026-12-23', '2027-01-03'], reports: '2027-01-28', half: '2027-01-29', spring: '2027-02-01', end: '2027-06-30' },
  2027: { start: '2027-09-01', autumn: ['2027-10-27', '2027-10-29'], christmas: ['2027-12-23', '2028-01-02'], reports: '2028-01-31', half: '2028-02-04', spring: '2028-02-07', end: '2028-06-30' },
};
export const SCHOOL_YEAR_RANGE = [Math.min(...Object.keys(SCHOOL_YEARS)), Math.max(...Object.keys(SCHOOL_YEARS))];

const shift = (key, days) => {
  const d = parseDay(key);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
};

// Gregorian Easter Sunday (Meeus/Jones/Butcher).
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const day = (start, kind, cs, en, end = start) => ({ start, end, kind, cs, en });

export function holidaysOf(year) {
  const easter = easterSunday(year);
  return [
    ...HOLIDAYS.map(([md, cs, en]) => day(`${year}-${md}`, 'holiday', cs, en)),
    day(shift(easter, -2), 'holiday', 'Velký pátek', 'Good Friday'),
    day(shift(easter, 1), 'holiday', 'Velikonoční pondělí', 'Easter Monday'),
  ];
}

export const importantOf = year => IMPORTANT
  .filter(([md, , , since]) => !since || `${year}-${md}` >= since)
  .map(([md, cs, en]) => day(`${year}-${md}`, 'important', cs, en));

export function springWeek(startYear, district) {
  const year = SCHOOL_YEARS[startYear];
  const group = SPRING_GROUPS.findIndex(g => g.includes(district));
  if (!year || group < 0) return null;
  const first = (((1 - (startYear + 1 - 2026)) % 6) + 6) % 6;
  const week = (((group - first) % 6) + 6) % 6;
  const start = shift(year.spring, week * 7);
  return { start, end: shift(start, 6) };
}

// Maundy Thursday is the Easter school holiday; Good Friday and Easter Monday are public holidays anyway.
export function schoolDaysOf(startYear, district) {
  const y = SCHOOL_YEARS[startYear];
  if (!y) return [];
  const spring = district ? springWeek(startYear, district) : null;
  return [
    day(y.start, 'school', 'Začátek školního roku', 'First day of school'),
    day(y.autumn[0], 'break', 'Podzimní prázdniny', 'Autumn break', y.autumn[1]),
    day(y.christmas[0], 'break', 'Vánoční prázdniny', 'Christmas break', y.christmas[1]),
    day(y.reports, 'school', 'Pololetní vysvědčení', 'Half-year report cards'),
    day(y.half, 'break', 'Pololetní prázdniny', 'Half-year break'),
    ...(spring ? [day(spring.start, 'break', 'Jarní prázdniny', `Spring break (${district})`, spring.end)] : []),
    day(shift(easterSunday(startYear + 1), -3), 'break', 'Velikonoční prázdniny', 'Easter break'),
    day(y.end, 'school', 'Konec školního roku, vysvědčení', 'Last day of school, report cards'),
    day(`${startYear + 1}-07-01`, 'break', 'Letní prázdniny', 'Summer holidays', `${startYear + 1}-08-31`),
  ];
}

// Everything that touches the days from..to, filtered by the account's calendar settings.
export function czechItems(from, to, { holidays = true, important = true, district = '' } = {}) {
  const first = parseDay(from).getFullYear();
  const last = parseDay(to).getFullYear();
  const items = [];
  for (let y = first - 1; y <= last; y++) {
    if (holidays && y >= first) items.push(...holidaysOf(y));
    if (important && y >= first) items.push(...importantOf(y));
    if (holidays) items.push(...schoolDaysOf(y, district));
  }
  const order = { holiday: 0, break: 1, school: 2, important: 3 };
  return items.filter(i => i.start <= to && i.end >= from).sort((a, b) => a.start.localeCompare(b.start) || order[a.kind] - order[b.kind]);
}

export function czechByDay(from, to, settings) {
  const map = new Map();
  for (const item of czechItems(from, to, settings)) {
    for (let k = item.start < from ? from : item.start; k <= item.end && k <= to; k = shift(k, 1)) {
      map.set(k, [...(map.get(k) || []), item]);
    }
  }
  return map;
}
