/* Off the Map — game engine.
 * Prompts, automatic validation, the Machine crowd, rarity scoring and the daily schedule.
 * Runs in the browser (window.OTM) and in Node (require) so the build step and the
 * page use exactly the same rules.
 */
(function (root) {
  'use strict';
  const E = {};

  // ------------------------------------------------------------------ constants
  E.EPOCH = Date.UTC(2026, 9, 26);          // day No. 1 = 26 Oct 2026 (UTC)
  E.PROMPTS_PER_DAY = 7;
  E.SECONDS = 20;                           // per prompt, like Krillion's 25
  E.MACHINE = 1000;                         // simulated players who answer before the day starts
  E.JACKPOT_KM = 1500;
  // r = normalised rarity: 0 for the day's most common answer, 1 for an answer nobody else gave
  E.TIERS = [
    { key: 'sail', name: 'Uncharted', emoji: '⛵', min: 0.7, blurb: 'Almost nobody came this way' },
    { key: 'compass', name: 'Explorer', emoji: '🧭', min: 0.4, blurb: 'Few made it here' },
    { key: 'boot', name: 'Backpacker', emoji: '🥾', min: 0.15, blurb: 'Off the main road' },
    { key: 'bus', name: 'Tour Bus', emoji: '🚌', min: -1, blurb: 'Where everyone goes' },
  ];
  E.SPECIAL = {
    jackpot: { key: 'dragon', name: 'Off the Map', emoji: '🐉', blurb: 'The hidden spot' },
    clever: { key: 'clever', name: 'Too Clever', emoji: '🤓', blurb: 'The "obscure" pick everyone had' },
    lost: { key: 'lost', name: 'Lost', emoji: '❌', blurb: 'Not a valid answer' },
  };
  E.MILESTONES = [
    { km: 0, name: 'Hotel Lobby' }, { km: 1000, name: 'City Limits' }, { km: 2000, name: 'Back Roads' },
    { km: 3000, name: 'Wilderness' }, { km: 4500, name: 'Uncharted Waters' }, { km: 6000, name: 'Here Be Dragons' },
  ];
  E.SCALE_KM = 7000;

  // ------------------------------------------------------------------ small utils
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = (typeof seed === 'string' ? fnv1a(seed) : seed) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const fold = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const letters = (s) => fold(s).replace(/^the\s+/i, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const firstLetter = (s) => letters(s).charAt(0);
  E.fnv1a = fnv1a; E.rng = rng; E.shuffle = shuffle;

  function listJoin(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }
  function fmtPop(p) {
    if (p >= 1e9) return (p / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' billion';
    if (p >= 1e6) return (p / 1e6).toFixed(p >= 1e8 ? 0 : 1).replace(/\.0$/, '') + ' million';
    if (p >= 1e4) return Math.round(p / 1000) + ',000';
    return String(Math.round(p / 100) * 100);
  }
  function fmtArea(a) {
    if (a >= 1e6) return (a / 1e6).toFixed(1).replace(/\.0$/, '') + ' million km²';
    return Math.round(a).toLocaleString('en-US') + ' km²';
  }
  const fmtLat = (lat) => Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S');
  E.fmtPop = fmtPop; E.fmtArea = fmtArea; E.fmtLat = fmtLat;

  // ------------------------------------------------------------------ data
  let C = [], CI = {}, CITY = [], CITYI = {}, SOV = [], CONT_NOTE = {}, TINY = [];
  const FAME_C = ['VAT', 'MCO', 'LIE', 'SMR', 'AND', 'LUX', 'MLT', 'ISL', 'BTN', 'NPL', 'MNG', 'MDG', 'TUV',
    'NRU', 'KIR', 'FJI', 'DJI', 'BFA', 'KGZ', 'COM', 'LSO', 'SWZ', 'BRN', 'TLS', 'SUR', 'BLZ', 'URY', 'PRY',
    'ERI', 'CPV', 'STP', 'SYC', 'MDV', 'PLW', 'TON', 'WSM', 'VUT', 'PNG', 'GNQ', 'BWA', 'NAM', 'KAZ', 'TKM',
    'LAO', 'BHS', 'JAM', 'GRD', 'EST', 'SVN', 'MNE', 'CYP'];
  const FAME_CITY = ['Reykjavík', 'Ushuaia', 'Longyearbyen', 'Timbuktu', 'Ulaanbaatar', 'Nuuk', 'Hobart',
    'Tromsø', 'Murmansk', 'Valparaíso', 'Zanzibar', 'Kathmandu', 'Lhasa', 'Vladivostok', 'Norilsk', 'Punta Arenas',
    'Stanley', 'Funafuti', 'Thimphu', 'Vaduz', 'Valletta', 'Monaco', 'Vatican City', 'Ouagadougou', 'Djibouti',
    'Nouakchott', 'Belmopan', 'Canberra', 'Wellington', 'Bern', 'Astana', 'Naypyidaw', 'Yamoussoukro', 'Rovaniemi',
    'Kiruna', 'Darwin', 'Perth', 'Anchorage', 'Fairbanks', 'Honolulu', 'Apia', 'Suva', 'Malé', 'Port Louis',
    'Praia', 'Windhoek', 'Asmara', 'La Paz', 'Sucre', 'Andorra', 'San Marino', 'Ulan Bator', 'Yakutsk', 'Bodø',
    'Dili', 'Majuro', 'Tarawa', 'Palikir', "Nuku'alofa", 'Port Vila', 'Honiara', 'Victoria'];

  const FAME_BOOST = ['Kyoto', 'Yokohama', 'Kobe', 'Nara', 'Venice', 'Florence', 'Milan', 'Naples', 'Barcelona', 'Seville',
    'Munich', 'Hamburg', 'Krakow', 'Edinburgh', 'Liverpool', 'Manchester', 'Salzburg', 'Bruges', 'Dubrovnik', 'Porto', 'Nice',
    'Marseille', 'Marrakesh', 'Casablanca', 'Cancun', 'Las Vegas', 'Miami', 'Honolulu', 'San Francisco', 'Seattle', 'Boston',
    'Chicago', 'New Orleans', 'Vancouver', 'Montreal', 'Toronto', 'Rio de Janeiro', 'Cusco', 'Cape Town', 'Agra', 'Varanasi',
    'Jaipur', 'Siem Reap', 'Chiang Mai', 'Phuket', 'Melbourne', 'Dubai', 'Jerusalem', 'Mecca', 'Alexandria', 'Luxor',
    'Saint Petersburg', 'Shanghai', 'Hong Kong', 'Sydney', 'Los Angeles', 'Istanbul', 'Bergen', 'Gothenburg', 'Frankfurt'];
  let FAME_N = new Set();
  // Classic "clever" answers the Machine piles onto for prompts that come up often.
  // (Real players' data replaces this guesswork as soon as there is enough of it.)
  const MAGNET_HINTS = {
    'flagHas:red': ['NPL', 'ALB', 'MNE'], 'landlocked:': ['VAT', 'LSO', 'SMR'], 'oneNeighbour:': ['LSO', 'VAT', 'SMR'],
    'noBorders:': ['NRU', 'TUV', 'ISL'], 'line:eq': ['STP', 'KIR', 'MDV'], 'continent:Europe': ['LIE', 'ISL', 'MLT'],
    'continent:Africa': ['COM', 'STP', 'DJI'], 'continent:Asia': ['BTN', 'MNG', 'TLS'], 'popUnder:1000000': ['TUV', 'NRU', 'VAT'],
    'cCoastal:': ['Reykjavík', 'Valparaíso', 'Zanzibar'], 'cArctic:': ['Longyearbyen', 'Rovaniemi', 'Norilsk'],
    'cCapital:': ['Ulaanbaatar', 'Thimphu', 'Ouagadougou'], 'cFarSouth:': ['Ushuaia', 'Stanley', 'Hobart'],
  };

  const MULTI_CITY_CONT = {
    RUS: (c) => (c.lon < 60 ? ['Europe'] : ['Asia']),
    TUR: (c) => (c.lat > 40.7 && c.lon < 29.05 ? ['Europe'] : ['Asia']),
    KAZ: (c) => (c.lon < 51.5 ? ['Europe'] : ['Asia']),
    EGY: (c) => (c.lon > 32.3 ? ['Asia', 'Africa'] : ['Africa']),
    FRA: (c) => (c.lon < -40 && c.lat < 10 ? ['South America'] : c.lon < -40 ? ['North America'] : c.lon > 40 && c.lat < 0 ? ['Africa'] : ['Europe']),
    ESP: (c) => (c.lat < 36 ? ['Africa'] : ['Europe']),
    USA: (c) => (c.lon < -150 && c.lat < 30 ? ['Oceania'] : ['North America']),
    CHL: (c) => (c.lon < -100 ? ['Oceania'] : ['South America']),
    NLD: (c) => (c.lat < 20 ? ['North America'] : ['Europe']),
    IDN: (c) => (c.lon > 130 ? ['Oceania'] : ['Asia']),
  };

  E.init = function (countryData, cityRows) {
    C = countryData.countries;
    CONT_NOTE = countryData.contNote || {};
    TINY = countryData.tiny || [];
    CI = {};
    for (const c of C) CI[c.id] = c;
    SOV = C.filter((c) => c.s);
    CITY = cityRows.map((r, i) => ({
      i, id: r[0], n: r[1], c: r[2], lat: r[3], lon: r[4], p: r[5], sr: r[6], f: r[7], ck: r[8], ini: r[9], ty: r[10], sal: r[11],
    }));
    // Natural Earth ranks cities for map labels, not fame: lift the ones every traveller knows
    const fame = new Set(FAME_BOOST.map((n) => E.norm(n)));
    for (const c of CITY) if (c.sr <= 7 && fame.has(E.norm(c.n)) && !String(c.id).startsWith('gn')) c.sal = Math.max(c.sal, 0.7);
    CITYI = {};
    for (const c of CITY) {
      CITYI[c.id] = c;
      const k = CI[c.c];
      c.ct = MULTI_CITY_CONT[c.c] ? MULTI_CITY_CONT[c.c](c) : (k ? k.ct.slice(0, 1) : []);
    }
    // capital vs largest city (primary capital = first NE capital point)
    const largest = {};
    for (const c of CITY) if (!largest[c.c] || c.p > largest[c.c].p) largest[c.c] = c;
    const FIX = { MYS: false, SSD: false, PHL: true };   // NE populations that disagree with today's facts
    for (const k of C) {
      const cap = CITY.find((c) => c.c === k.id && (c.f & 32)) || CITY.find((c) => c.c === k.id && (c.f & 1));
      const big = largest[k.id];
      k.capCity = cap ? cap.n : k.cp[0];
      k.bigCity = k.id === 'PHL' ? 'Quezon City' : big ? big.n : null;
      k.capNotLargest = k.id in FIX ? FIX[k.id] : !!(cap && big && big.p > cap.p * 1.05 && big.id !== cap.id);
    }
    // "A city in <country>": well-known countries with a sensible number of cities in the atlas
    const perCountry = {};
    for (const c of CITY) if (!String(c.id).startsWith('gn')) perCountry[c.c] = (perCountry[c.c] || 0) + 1;   // Natural Earth's cities only
    T.cCountry.params = SOV.filter((k) => perCountry[k.id] >= 12 && perCountry[k.id] <= 150 && k.sal >= 0.68)
      .sort((a, b) => b.sal - a.sal).map((k) => k.id);
    NAMEIDX = null;
    FAME_N = new Set(FAME_CITY.map((n) => E.norm(n)));
    E.C = C; E.CI = CI; E.CITY = CITY; E.CITYI = CITYI; E.SOV = SOV; E.TINY = TINY;
    return E;
  };

  // ------------------------------------------------------------------ flag helpers
  const majorColors = (k) => Object.keys(k.fc || {}).filter((c) => c !== 'brown' || k.fc[c] >= 0.02)
    .filter((c) => k.fc[c] >= 0.01).sort((a, b) => k.fc[b] - k.fc[a]);
  const flagHas = (k, col) => !!k.fc && (k.fc[col] || 0) >= 0.003;
  const flagDescr = (k) => `${k.n}'s flag is ${listJoin(majorColors(k))}.`;
  E.majorColors = majorColors;

  // ------------------------------------------------------------------ prompt templates
  const CONTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
  const cross = (a, b) => a.flatMap((x) => b.map((y) => [x, y]));
  const LINE = { eq: 'Equator', tcn: 'Tropic of Cancer', tcp: 'Tropic of Capricorn', arc: 'Arctic Circle', pm: 'Prime Meridian' };
  const cname = (id) => (CI[id] ? CI[id].n : id);
  // "a city in the Netherlands", "borders the United States"
  const THE = new Set(['GBR', 'USA', 'NLD', 'PHL', 'DOM', 'ARE', 'BHS', 'GMB', 'MDV', 'MHL', 'SLB', 'CAF', 'COM', 'COG', 'SYC', 'VAT']);
  const theName = (id) => (THE.has(id) ? 'the ' : '') + cname(id);
  E.theName = theName;
  const cityLabel = (c) => `${c.n}, ${cname(c.c)}`;
  E.cityLabel = cityLabel;

  const T = {
    // ---------------- countries
    flagHas: {
      kind: 'country', params: ['red', 'white', 'blue', 'green', 'yellow', 'black', 'orange'],
      text: (c) => `A country with ${c} in its flag`,
      ok: (k, c) => flagHas(k, c),
      // the obvious red flag is one where red is the main colour (Japan, China, Canada)
      proto: (k, c) => 0.3 + 1.5 * (k.fc[c] || 0) + (majorColors(k).filter((x) => x !== 'white')[0] === c ? 0.6 : 0),
      why: (k, c, ok) => (ok ? ((k.fc[c] >= 0.01) ? `${k.n}'s flag has ${c}.` : `${k.n}'s flag has a touch of ${c} in its emblem.`) : flagDescr(k)),
    },
    flagNo: {
      kind: 'country', params: ['red', 'white', 'blue', 'green', 'yellow'],
      text: (c) => `A country with no ${c} in its flag`,
      ok: (k, c) => !!k.fc && (k.fc[c] || 0) < 0.01,
      why: (k, c, ok) => (ok ? flagDescr(k) + ((k.fc[c] || 0) >= 0.003 ? ` (a speck of ${c} in the emblem doesn't count).` : '') : `${k.n}'s flag has ${c}.`),
    },
    flagOnly: {
      kind: 'country', params: [['red', 'white'], ['blue', 'white'], ['green', 'white'], ['red', 'yellow']],
      text: (p) => `A country whose flag is only ${p[0]} and ${p[1]}`,
      ok: (k, p) => { const m = majorColors(k); return m.length === 2 && m.includes(p[0]) && m.includes(p[1]); },
      why: (k) => flagDescr(k),
    },
    continent: {
      kind: 'country', params: ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'],
      text: (c) => `A country in ${c}`,
      ok: (k, c) => k.ct.includes(c),
      why: (k, c, ok) => {
        if (ok && k.ct[0] !== c) return `${k.n} counts: ${CONT_NOTE[k.id + '|' + c] || 'it spans two continents'}.`;
        return ok ? `${k.n} is in ${c}.` : `${k.n} is in ${listJoin(k.ct)}.`;
      },
    },
    landlocked: {
      kind: 'country', params: [null], text: () => 'A landlocked country',
      ok: (k) => !!k.ll,
      proto: (k) => (['CHE', 'AUT', 'MNG', 'BOL', 'PRY', 'NPL', 'CZE', 'HUN'].includes(k.id) ? 2.5 : 1),
      why: (k, p, ok) => (ok ? `${k.n} has no coastline.` : `${k.n} has a coastline.`),
    },
    noBorders: {
      kind: 'country', params: [null], text: () => 'A country with no land borders',
      ok: (k) => k.b.length === 0,
      why: (k, p, ok) => (ok ? `${k.n} has no land neighbours.` : neighbourText(k)),
    },
    oneNeighbour: {
      kind: 'country', params: [null], text: () => 'A country that borders exactly one other country',
      ok: (k) => k.b.length === 1,
      why: (k, p, ok) => (ok ? `${k.n}'s only neighbour is ${cname(k.b[0])}.` : neighbourText(k)),
    },
    manyNeighbours: {
      kind: 'country', params: [7, 8], text: (n) => `A country with ${n} or more neighbours`,
      ok: (k, n) => k.b.length >= n,
      why: (k) => `${k.n} borders ${k.b.length} ${k.b.length === 1 ? 'country' : 'countries'}.`,
    },
    borders: {
      kind: 'country', params: ['RUS', 'CHN', 'BRA', 'DEU', 'COD', 'FRA', 'AUT', 'TZA', 'ZMB', 'SRB', 'TUR', 'SDN', 'HUN', 'NER', 'MLI', 'SAU', 'UKR', 'IRN', 'POL', 'DZA', 'IND', 'ARG', 'KEN'],
      text: (x) => `A country that borders ${theName(x)}`,
      ok: (k, x) => k.b.includes(x),
      why: (k, x, ok) => {
        if (k.id === x) return `That's ${cname(x)} itself.`;
        if (ok && k.id === 'FRA' && (x === 'BRA' || x === 'SUR')) return `France borders ${cname(x)} through French Guiana.`;
        if (ok && (k.id === 'NLD' || x === 'NLD') && (k.id === 'FRA' || x === 'FRA')) return 'France and the Netherlands meet on the island of Saint Martin.';
        return ok ? `${k.n} borders ${cname(x)}.` : `${k.n} doesn't border ${cname(x)}.`;
      },
    },
    language: {
      kind: 'country', params: ['English', 'French', 'Spanish', 'Arabic', 'Portuguese', 'German'],
      text: (l) => `A country where ${l} is an official language`,
      ok: (k, l) => k.lg.includes(l),
      why: (k, l, ok) => (ok ? `${l} is official in ${k.n}.` : `${k.n}'s official language${k.lg.length > 1 ? 's are' : ' is'} ${listJoin(k.lg)}.`),
    },
    popUnder: {
      kind: 'country', params: [1e6], text: () => 'A country with fewer than 1 million people',
      ok: (k, n) => k.p < n * 1.05,
      why: (k) => `${k.n} has about ${fmtPop(k.p)} people.`,
    },
    popOver: {
      kind: 'country', params: [1e8, 5e7], text: (n) => `A country with more than ${fmtPop(n)} people`,
      ok: (k, n) => k.p >= n * 0.85,     // lenient: populations keep growing after the data was made
      why: (k) => `${k.n} has about ${fmtPop(k.p)} people.`,
    },
    areaOver: {
      kind: 'country', params: [1e6], text: () => 'A country larger than 1 million km²',
      ok: (k, n) => k.a >= n * 0.98,
      why: (k) => `${k.n} covers ${fmtArea(k.a)}.`,
    },
    areaUnder: {
      kind: 'country', params: [1000], text: () => 'A country smaller than 1,000 km²',
      ok: (k, n) => k.a <= n,
      why: (k) => `${k.n} covers ${fmtArea(k.a)}.`,
    },
    line: {
      kind: 'country', params: ['eq', 'tcn', 'tcp', 'arc', 'pm'],
      text: (l) => `A country the ${LINE[l]} passes through`,
      ok: (k, l) => k.ln.includes(l),
      proto: (k, l) => (l === 'eq' && k.id === 'ECU' ? 6 : 1),   // Ecuador is named after it
      why: (k, l, ok) => (ok ? `The ${LINE[l]} crosses ${k.n}${l === 'eq' && ['PER', 'MDV', 'KIR'].includes(k.id) ? ' (or its waters)' : ''}.` : `The ${LINE[l]} misses ${k.n}.`),
    },
    southern: {
      kind: 'country', params: [null], text: () => 'A country entirely in the Southern Hemisphere',
      ok: (k) => k.bb[3] <= 0.3,
      why: (k, p, ok) => (ok ? `All of ${k.n} lies south of the Equator.` : `${k.n} reaches ${fmtLat(k.bb[3])}.`),
    },
    nameStarts: {
      kind: 'country', params: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      text: (l) => `A country whose name starts with ${l}`,
      ok: (k, l) => k.al.some((a) => firstLetter(a) === l),
      why: (k, l, ok) => {
        const hit = k.al.find((a) => firstLetter(a) === l);
        return ok ? (hit === k.n ? `${k.n} starts with ${l}.` : `${k.n} is also called ${hit}.`) : `${k.n} doesn't start with ${l}.`;
      },
    },
    nameEnds: {
      kind: 'country', params: ['ia', 'land', 'stan', 'an'],
      text: (s) => `A country whose name ends in “-${s}”`,
      ok: (k, s) => k.al.some((a) => letters(a).endsWith(s.toUpperCase())),
      why: (k, s, ok) => { const hit = k.al.find((a) => letters(a).endsWith(s.toUpperCase())); return ok ? `${hit} ends in “-${s}”.` : `${k.n} doesn't end in “-${s}”.`; },
    },
    nameHas: {
      kind: 'country', params: ['Z', 'J', 'K', 'Q', 'X', 'W', 'V'],
      text: (l) => `A country with the letter ${l} in its name`,
      ok: (k, l) => k.al.some((a) => letters(a).includes(l)),
      why: (k, l, ok) => { const hit = k.al.find((a) => letters(a).includes(l)); return ok ? `${hit} has a ${l}.` : `No ${l} in ${k.n}.`; },
    },
    nameNoA: {
      kind: 'country', params: [null], text: () => 'A country whose name has no letter A',
      ok: (k) => k.al.some((a) => !letters(a).includes('A') && letters(a).length > 3),
      why: (k, p, ok) => { const hit = k.al.find((a) => !letters(a).includes('A') && letters(a).length > 3); return ok ? `No A in ${hit}.` : `${k.n} has an A.`; },
    },
    nameLen: {
      kind: 'country', params: [4, 5],
      text: (n) => `A country with a ${n}-letter name`,
      ok: (k, n) => k.al.some((a) => /^[^ -]+$/.test(a.replace(/^The /, '')) && letters(a).length === n),
      why: (k, n, ok) => { const hit = k.al.find((a) => /^[^ -]+$/.test(a.replace(/^The /, '')) && letters(a).length === n); return ok ? `${hit} has ${n} letters.` : `${k.n} has ${letters(k.n).length} letters.`; },
    },
    capSameLetter: {
      kind: 'country', params: [null], text: () => 'A country whose capital starts with the same letter',
      ok: (k) => k.cp.some((cap) => k.al.some((a) => firstLetter(a) === firstLetter(cap))),
      why: (k, p, ok) => (ok ? `${k.n} → ${k.cp.find((cap) => k.al.some((a) => firstLetter(a) === firstLetter(cap)))}.` : `${k.n}'s capital is ${listJoin(k.cp)}.`),
    },
    capCoastal: {
      kind: 'country', params: [null], text: () => 'A country whose capital is by the sea',
      ok: (k) => !!k.cpc,
      why: (k, p, ok) => (ok ? `${k.capCity} is on the coast.` : `${k.capCity || k.cp[0]} is inland.`),
    },
    capNotLargest: {
      kind: 'country', params: [null], text: () => "A country whose capital isn't its largest city",
      ok: (k) => !!k.capNotLargest,
      why: (k, p, ok) => (ok ? `${k.bigCity} is bigger than ${k.capCity}.` : `${k.capCity} is ${k.n}'s largest city.`),
    },

    // ---------------- cities
    cCoastal: {
      kind: 'city', params: [null], text: () => 'A city by the sea',
      ok: (c) => !!(c.f & 2),
      why: (c, p, ok) => (ok ? `${c.n} is on the coast.` : c.f & 16 ? `${c.n} sits on a river or estuary, away from the open sea.` : `${c.n} is about ${c.ck} km from the sea.`),
    },
    cCapital: {
      kind: 'city', params: [null], text: () => 'A capital city',
      ok: (c) => !!(c.f & 1),
      why: (c, p, ok) => (ok ? `${c.n} is a capital of ${cname(c.c)}.` : `${c.n} is not a national capital.`),
    },
    cCapCoastal: {
      kind: 'city', params: [null], text: () => 'A capital city by the sea',
      ok: (c) => !!(c.f & 1) && !!(c.f & 2),
      why: (c, p, ok) => (ok ? `${c.n} is a coastal capital.` : !(c.f & 1) ? `${c.n} is not a national capital.` : `${c.n} is inland.`),
    },
    cBig: {
      kind: 'city', params: [1e7], text: () => 'A city with more than 10 million people',
      ok: (c, n) => c.p >= n * 0.85,
      why: (c) => `Greater ${c.n} has about ${fmtPop(c.p)} people.`,
    },
    cMillionIn: {
      kind: 'city', params: ['Africa', 'Europe', 'South America', 'North America'],
      text: (ct) => `A city in ${ct} with over a million people`,
      ok: (c, ct) => c.p >= 0.85e6 && c.ct.includes(ct),
      why: (c, ct, ok) => (!c.ct.includes(ct) ? `${c.n} is in ${listJoin(c.ct)}.` : `Greater ${c.n} has about ${fmtPop(c.p)} people.`),
    },
    cCoastIn: {
      kind: 'city', params: ['Europe', 'Africa', 'Asia', 'South America', 'North America', 'Oceania'],
      text: (ct) => `A city in ${ct} by the sea`,
      ok: (c, ct) => !!(c.f & 2) && c.ct.includes(ct),
      why: (c, ct, ok) => (!c.ct.includes(ct) ? `${c.n} is in ${listJoin(c.ct)}.` : ok ? `${c.n} is on the coast.` : `${c.n} is about ${c.ck} km from the sea.`),
    },
    cSouth: {
      kind: 'city', params: [null], text: () => 'A city in the Southern Hemisphere',
      ok: (c) => c.lat < 0,
      why: (c) => `${c.n} is at ${fmtLat(c.lat)}.`,
    },
    cSouthCap: {
      kind: 'city', params: [null], text: () => 'A capital city in the Southern Hemisphere',
      ok: (c) => c.lat < 0 && !!(c.f & 1),
      why: (c, p, ok) => (!(c.f & 1) ? `${c.n} is not a national capital.` : `${c.n} is at ${fmtLat(c.lat)}.`),
    },
    cArctic: {
      kind: 'city', params: [null], text: () => 'A city north of the Arctic Circle',
      ok: (c) => c.lat >= 66.46,
      why: (c, p, ok) => (ok && c.lat < 66.563 ? `${c.n} sits right on the Arctic Circle, so it counts.` : `${c.n} is at ${fmtLat(c.lat)}; the Arctic Circle is at 66.6°N.`),
    },
    cFarSouth: {
      kind: 'city', params: [null], text: () => 'A city south of 40°S',
      ok: (c) => c.lat <= -39.9,
      why: (c) => `${c.n} is at ${fmtLat(c.lat)}.`,
    },
    cEquator: {
      kind: 'city', params: [null], text: () => 'A city within 100 km of the Equator',
      ok: (c) => Math.abs(c.lat) <= 0.9,
      why: (c) => `${c.n} is ${Math.round(Math.abs(c.lat) * 111)} km from the Equator.`,
    },
    cLetter: {
      kind: 'city', params: 'ABCDEFGHIJKLMNOPRSTUVWYZ'.split(''),
      text: (l) => `A city whose name starts with ${l}`,
      ok: (c, l) => c.ini.includes(l),
      why: (c, l, ok) => (ok ? (firstLetter(c.n) === l ? `${c.n} starts with ${l}.` : `${c.n} also goes by a name starting with ${l}.`) : `${c.n} doesn't start with ${l}.`),
    },
    cLandlocked: {
      kind: 'city', params: [null], text: () => 'A city in a landlocked country',
      ok: (c) => !!(CI[c.c] && CI[c.c].ll && CI[c.c].s),
      why: (c, p, ok) => (ok ? `${cname(c.c)} has no coastline.` : `${cname(c.c)} has a coastline.`),
    },

    // ---------------- two conditions at once
    contFlag: {
      kind: 'country', params: cross(CONTS, ['red', 'white', 'blue', 'green', 'yellow', 'black']),
      text: (p) => `A country in ${p[0]} with ${p[1]} in its flag`,
      ok: (k, p) => k.ct.includes(p[0]) && flagHas(k, p[1]),
      proto: (k, p) => 0.3 + 1.5 * ((k.fc && k.fc[p[1]]) || 0),
      why: (k, p, ok) => (!k.ct.includes(p[0]) ? contWhy(k) : T.flagHas.why(k, p[1], ok)),
    },
    contLandlocked: {
      kind: 'country', params: CONTS, text: (c) => `A landlocked country in ${c}`,
      ok: (k, c) => k.ct.includes(c) && !!k.ll,
      why: (k, c, ok) => (!k.ct.includes(c) ? contWhy(k) : ok ? `${k.n} has no coastline.` : `${k.n} has a coastline.`),
    },
    contNoBorders: {
      kind: 'country', params: CONTS, text: (c) => `A country in ${c} with no land borders`,
      ok: (k, c) => k.ct.includes(c) && k.b.length === 0,
      why: (k, c, ok) => (!k.ct.includes(c) ? contWhy(k) : ok ? `${k.n} has no land neighbours.` : neighbourText(k)),
    },
    contCapCoastal: {
      kind: 'country', params: CONTS, text: (c) => `A country in ${c} whose capital is by the sea`,
      ok: (k, c) => k.ct.includes(c) && !!k.cpc,
      why: (k, c, ok) => (!k.ct.includes(c) ? contWhy(k) : ok ? `${k.capCity} is on the coast.` : `${k.capCity || k.cp[0]} is inland.`),
    },
    contLanguage: {
      kind: 'country', params: cross(CONTS, ['English', 'French', 'Spanish', 'Arabic', 'Portuguese']),
      text: (p) => `A country in ${p[0]} where ${p[1]} is an official language`,
      ok: (k, p) => k.ct.includes(p[0]) && k.lg.includes(p[1]),
      why: (k, p, ok) => (!k.ct.includes(p[0]) ? contWhy(k) : T.language.why(k, p[1], ok)),
    },
    contPop: {
      kind: 'country', params: CONTS, text: (c) => `A country in ${c} with more than 50 million people`,
      ok: (k, c) => k.ct.includes(c) && k.p >= 5e7 * 0.85,
      why: (k, c) => (!k.ct.includes(c) ? contWhy(k) : `${k.n} has about ${fmtPop(k.p)} people.`),
    },
    cCapitalIn: {
      kind: 'city', params: CONTS, text: (c) => `A capital city in ${c}`,
      ok: (x, c) => !!(x.f & 1) && x.ct.includes(c),
      why: (x, c) => (!(x.f & 1) ? `${x.n} is not a national capital.` : !x.ct.includes(c) ? `${x.n} is in ${listJoin(x.ct)}.` : `${x.n} is a capital of ${cname(x.c)}.`),
    },
    cCountry: {
      kind: 'city', params: [], text: (id) => `A city in ${theName(id)}`,
      ok: (x, id) => x.c === id,
      why: (x, id, ok) => (ok ? `${x.n} is in ${cname(id)}.` : `${x.n} is in ${cname(x.c)}.`),
    },
    cLetterCoastal: {
      kind: 'city', params: 'ABCDEFGHIJKLMNOPRSTVZ'.split(''), text: (l) => `A city by the sea whose name starts with ${l}`,
      ok: (x, l) => !!(x.f & 2) && x.ini.includes(l),
      why: (x, l, ok) => (!x.ini.includes(l) ? `${x.n} doesn't start with ${l}.` : ok ? `${x.n} is on the coast.` : x.f & 16 ? `${x.n} sits on a river or estuary, away from the open sea.` : `${x.n} is about ${x.ck} km from the sea.`),
    },
  };
  E.T = T;

  function contWhy(k) { return `${k.n} is in ${listJoin(k.ct)}.`; }

  function neighbourText(k) {
    if (!k.b.length) return `${k.n} has no land borders.`;
    const names = k.b.map(cname);
    if (names.length <= 3) return `${k.n} borders ${listJoin(names)}.`;
    return `${k.n} borders ${names.length} countries, including ${names.slice(0, 2).join(' and ')}.`;
  }

  // ------------------------------------------------------------------ typed answers
  E.norm = function (s) {
    let t = String(s || '').toLowerCase()
      .replace(/\u00f8/g, 'o').replace(/\u00e6/g, 'ae').replace(/\u00e5/g, 'a').replace(/\u00df/g, 'ss').replace(/\u0153/g, 'oe')
      .replace(/\u0142/g, 'l').replace(/\u0111/g, 'd').replace(/\u0131/g, 'i').replace(/\u00fe/g, 'th');
    t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/[\u2019\u2018\u02bb'`\u00b4]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    t = t.replace(/^the /, '').replace(/^(st|ste|sankt|saint|sainte|san|sao) /, 'saint ');
    return t;
  };
  let NAMEIDX = null;
  function addName(map, key, ent) {
    if (!key) return;
    let a = map.get(key);
    if (!a) { a = []; map.set(key, a); }
    if (!a.includes(ent)) a.push(ent);
  }
  const CITY_NICK = {
    'Rio': 'Rio de Janeiro', 'NYC': 'New York', 'LA': 'Los Angeles', 'SF': 'San Francisco', 'San Fran': 'San Francisco',
    'KL': 'Kuala Lumpur', 'DC': 'Washington, D.C.', 'Washington DC': 'Washington, D.C.', 'Saigon': 'Ho Chi Minh City',
    'HCMC': 'Ho Chi Minh City', 'Calcutta': 'Kolkata', 'Madras': 'Chennai', 'Rangoon': 'Yangon', 'Philly': 'Philadelphia',
    'Vegas': 'Las Vegas', 'Joburg': 'Johannesburg', 'Jo burg': 'Johannesburg', 'Mexico': 'Mexico City', 'Panama': 'Panama City',
    'Guatemala': 'Guatemala City', 'Bangalore': 'Bengaluru', 'Peking': 'Beijing', 'Canton': 'Guangzhou',
    'Utqiagvik': 'Barrow', 'Capetown': 'Cape Town', 'Marseilles': 'Marseille', 'Bombay': 'Mumbai',
  };
  E.buildNames = function () {
    const country = new Map(), city = new Map();
    for (const k of C) for (const n of [k.n].concat(k.nm || [], k.al || [])) addName(country, E.norm(n), k);
    for (const c of CITY) for (const n of [c.n].concat(c.ty ? c.ty.split('|') : [])) addName(city, E.norm(n), c);
    for (const [nick, full] of Object.entries(CITY_NICK)) {
      const hit = (city.get(E.norm(full)) || []).slice().sort((a, b) => b.sal - a.sal)[0];
      if (hit && !city.has(E.norm(nick))) addName(city, E.norm(nick), hit);
    }
    NAMEIDX = { country, city, countryList: [...country.entries()], cityList: [...city.entries()] };
  };
  // optimal string alignment distance, giving up early past `max`
  function osa(a, b, max) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let p2 = new Array(lb + 1).fill(0), p1 = new Array(lb + 1), cur = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) p1[j] = j;
    for (let i = 1; i <= la; i++) {
      cur[0] = i;
      let rowMin = i;
      for (let j = 1; j <= lb; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + cost);
        if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, p2[j - 2] + 1);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      const t = p2; p2 = p1; p1 = cur; cur = t;
    }
    return p1[lb];
  }
  E.osa = osa;
  function fuzzy(list, q) {
    const max = q.length < 5 ? 0 : q.length < 8 ? 1 : 2;
    if (!max) return [];
    let best = max + 1, hits = [];
    for (const [key, ents] of list) {
      if (Math.abs(key.length - q.length) > max) continue;
      const d = osa(q, key, max);
      if (d < best) { best = d; hits = ents.slice(); } else if (d === best) for (const e of ents) if (!hits.includes(e)) hits.push(e);
    }
    return best <= max ? hits : [];
  }
  function rankFor(prompt) {
    return (e) => (prompt && E.isValid(prompt, e) ? 4 : 0) + (e.s ? 2 : 0) + (e.sal || 0);
  }
  // What did the player mean? exactOnly is for the live preview while typing.
  E.resolve = function (prompt, text, exactOnly) {
    if (!NAMEIDX) E.buildNames();
    const kind = prompt.kind;
    const q = E.norm(text);
    if (!q) return { status: 'empty' };
    const idx = NAMEIDX[kind];
    let cands = idx.get(q) || [];
    let how = 'exact';
    if (!cands.length && kind === 'city') {
      cands = idx.get(q.endsWith(' city') ? q.slice(0, -5) : q + ' city') || [];
      if (!cands.length && String(text).includes(',')) {        // "Valencia, Spain"
        const parts = String(text).split(',');
        const cq = E.norm(parts[0]), kq = E.norm(parts.slice(1).join(' '));
        const ctry = (NAMEIDX.country.get(kq) || (exactOnly ? [] : fuzzy(NAMEIDX.countryList, kq)))[0];
        const cc = NAMEIDX.city.get(cq) || (exactOnly ? [] : fuzzy(NAMEIDX.cityList, cq));
        cands = ctry ? cc.filter((c) => c.c === ctry.id) : [];
      }
    }
    if (!cands.length && !exactOnly) { cands = fuzzy(NAMEIDX[kind + 'List'], q); how = 'fuzzy'; }
    if (!cands.length) {
      const other = (kind === 'city' ? NAMEIDX.country : NAMEIDX.city).get(q);
      return other && other.length ? { status: 'wrongKind', other: other[0] } : { status: 'unknown' };
    }
    const r = rankFor(prompt);
    const sorted = cands.slice().sort((a, b) => r(b) - r(a));
    const ent = sorted[0];
    if (kind === 'country' && !ent.s) return { status: 'territory', ent };
    return { status: 'ok', ent, how, others: sorted.length - 1 };
  };

  // ------------------------------------------------------------------ prompts
  E.promptKey = (t, p) => t + ':' + (Array.isArray(p) ? p.join('+') : p === null ? '' : p);
  E.makePrompt = function (t, p) {
    const tpl = T[t];
    return { key: E.promptKey(t, p), t, p, kind: tpl.kind, text: tpl.text(p) };
  };
  E.parseKey = function (key) {
    const i = key.indexOf(':');
    const t = key.slice(0, i), raw = key.slice(i + 1);
    const tpl = T[t];
    const p = tpl.params.find((x) => E.promptKey(t, x) === key);
    return E.makePrompt(t, p === undefined ? null : p);
  };
  E.universe = (prompt) => (prompt.kind === 'country' ? SOV : CITY);
  E.entity = (prompt, id) => (prompt.kind === 'country' ? CI[id] : CITYI[id]);
  E.isValid = (prompt, ent) => {
    if (!ent) return false;
    if (prompt.kind === 'country' && !ent.s) return false;
    return !!T[prompt.t].ok(ent, prompt.p);
  };
  E.explain = (prompt, ent, ok) => T[prompt.t].why(ent, prompt.p, ok);
  E.validSet = function (prompt) {
    if (prompt._valid) return prompt._valid;
    prompt._valid = E.universe(prompt).filter((x) => E.isValid(prompt, x));
    return prompt._valid;
  };

  // the bank: every template x parameter whose answer set is a good size
  E.bank = function () {
    const out = [];
    for (const t of Object.keys(T)) {
      for (const p of T[t].params) {
        const pr = E.makePrompt(t, p);
        const n = E.validSet(pr).length;
        const lim = pr.kind === 'country' ? [7, 160] : [12, 3000];
        if (n >= lim[0] && n <= lim[1]) { pr.n = n; out.push(pr); }
      }
    }
    return out;
  };

  // ------------------------------------------------------------------ the Machine crowd
  // 1,000 simulated players answer before the day starts. Most pick familiar places
  // (weighted by how prominent a place is), a slice tries to be clever and piles onto
  // the same "obscure" favourites, and a few get it wrong. Deterministic per day + slot.
  // When the prompt has a dragon clue, a share of them (CHASE) goes after the clue instead.
  //
  // The continent prompts are generous: France counts for Africa through Réunion and Mayotte. That is a clever
  // answer, not a familiar one, so the Machine seldom gives it (without this, France topped "A country in
  // Africa" and the United States "A country in Oceania"). Russia for Asia or Türkiye for Europe is much less
  // of a stretch than islands half a world away, and only those can be the hidden place.
  const FAR_PARTS = new Set(['FRA', 'ESP', 'USA', 'CHL', 'NLD']);
  const promptCont = (prompt) => {
    if (prompt.kind !== 'country') return null;
    const c = Array.isArray(prompt.p) ? prompt.p[0] : prompt.p;
    return CONTS.includes(c) ? c : null;
  };
  const byPart = (x, cont) => !!cont && !!x.ct && x.ct[0] !== cont;
  const partWeight = (x, cont) => (!byPart(x, cont) ? 1 : FAR_PARTS.has(x.id) ? 0.04 : x.id === 'RUS' || x.id === 'TUR' ? 0.5 : 0.2);
  const farPart = (x, cont) => byPart(x, cont) && FAR_PARTS.has(x.id);
  E.machine = function (prompt, seedKey) {
    const base = baseMachine(prompt, seedKey);
    const clue = prompt.clue;
    if (!clue) return base;
    if (prompt._machine && prompt._machine.seed === seedKey && prompt._machine.clue === clue) return prompt._machine;
    // clue chasers pick among the right answers that fit the clue; they lean towards places
    // they know, but much less than everyone else does
    const rnd = rng('chase|' + seedKey + '|' + prompt.key);
    const fits = clue.ids.map((id) => E.entity(prompt, id)).filter(Boolean);
    const cont = promptCont(prompt);
    const w = fits.map((x) => Math.exp(2 * (x.sal || 0)) * (0.75 + 0.5 * rnd()) * partWeight(x, cont));
    const sw = w.reduce((a, b) => a + b, 0) || 1;
    const counts = new Map();
    for (const [id, n] of base.counts) counts.set(id, n * (1 - E.CHASE));
    fits.forEach((x, i) => counts.set(x.id, (counts.get(x.id) || 0) + E.CHASE * E.MACHINE * w[i] / sw));
    const res = Object.assign({}, base, { counts, clue });
    prompt._machine = res;
    return res;
  };

  function baseMachine(prompt, seedKey) {
    if (prompt._base && prompt._base.seed === seedKey) return prompt._base;
    const rnd = rng('machine|' + seedKey + '|' + prompt.key);
    const V = E.validSet(prompt);
    const isCity = prompt.kind === 'city';
    const beta = isCity ? 11 : 7.5;
    const TAU = 0.12, EPS = 0.04;
    const base = new Map();
    let sum = 0;
    const proto = T[prompt.t].proto;
    const cont = promptCont(prompt);
    for (const x of V) {
      const w = Math.exp(beta * x.sal) * (0.75 + 0.5 * rnd()) * (proto ? proto(x, prompt.p) : 1) * partWeight(x, cont);
      base.set(x.id, w); sum += w;
    }
    const share = new Map();
    for (const [id, w] of base) share.set(id, (w / sum) * (1 - TAU - EPS));
    const baseShare = new Map(share);
    // too-clever magnets
    const fameIds = isCity ? V.filter((x) => FAME_N.has(E.norm(x.n))).map((x) => x.id) : V.filter((x) => FAME_C.includes(x.id)).map((x) => x.id);
    const hint = (MAGNET_HINTS[prompt.key] || []).map((h) => (isCity ? (V.find((x) => E.norm(x.n) === E.norm(h)) || {}).id : V.find((x) => x.id === h) && h)).filter(Boolean);
    let magnets = hint.concat(shuffle(fameIds.filter((id) => !hint.includes(id)), rnd)).slice(0, 3);
    if (magnets.length < 3) {
      // "clever" picks are places people have heard of: no GeoNames suburbs
      const sorted = V.filter((x) => !isCity || (x.sr <= 7 && !String(x.id).startsWith('gn'))).sort((a, b) => b.sal - a.sal);
      const band = sorted.slice(Math.floor(sorted.length * 0.35), Math.ceil(sorted.length * 0.7)).filter((x) => !magnets.includes(x.id));
      magnets = magnets.concat(shuffle(band, rnd).slice(0, 3 - magnets.length).map((x) => x.id));
    }
    const mw = [0.5, 0.3, 0.2];
    const topBase = Math.max(...share.values());
    let spare = 0;
    magnets.forEach((id, i) => {
      const add = Math.min(TAU * mw[i], Math.max(0, 0.8 * topBase - (share.get(id) || 0)));
      spare += TAU * mw[i] - add;
      share.set(id, (share.get(id) || 0) + add);
    });
    if (spare > 0) for (const [id, v] of share) share.set(id, v + spare * (baseShare.get(id) || 0) / (1 - TAU - EPS));
    // honest mistakes: prominent places that don't fit
    const pool = (isCity ? CITY.filter((c) => c.sr <= 2) : SOV).filter((x) => !E.isValid(prompt, x));
    const wrong = shuffle(pool.filter((x) => x.sal > 0.6), rnd).slice(0, 6);
    const invalid = new Map();
    const ws = wrong.reduce((a, x) => a + x.sal, 0) || 1;
    for (const x of wrong) invalid.set(x.id, (x.sal / ws) * EPS);
    const counts = new Map();
    for (const [id, s] of share) counts.set(id, s * E.MACHINE);
    for (const [id, s] of invalid) counts.set(id, s * E.MACHINE);
    const res = { seed: seedKey, counts, baseShare, magnets, invalid: [...invalid.keys()] };
    prompt._base = res;
    return res;
  }

  // integer pins for the heatmap (largest remainder over expected counts)
  E.machinePins = function (prompt, seedKey) {
    const m = E.machine(prompt, seedKey);
    const rnd = rng('pins|' + seedKey + '|' + prompt.key);
    const entries = [...m.counts.entries()];
    const floor = entries.map(([id, v]) => [id, Math.floor(v), v - Math.floor(v)]);
    let left = E.MACHINE - floor.reduce((a, e) => a + e[1], 0);
    floor.sort((a, b) => b[2] - a[2]);
    for (let i = 0; i < floor.length && left > 0; i++, left--) floor[i][1] += 1;
    const pins = [];
    for (const [id, n] of floor) {
      const ent = E.entity(prompt, id) || CI[id];
      if (!ent) continue;
      for (let j = 0; j < n; j++) pins.push({ id, ll: E.tapPoint(prompt, ent, rnd) });
    }
    return shuffle(pins, rnd);
  };

  E.tapPoint = function (prompt, ent, rnd) {
    if (prompt.kind === 'city') {
      return [ent.lon + (rnd() - 0.5) * 0.35, ent.lat + (rnd() - 0.5) * 0.25];
    }
    const tp = ent.tp && ent.tp.length ? ent.tp : [ent.lab];
    const base = tp[Math.floor(rnd() * tp.length)];
    const spread = Math.min(1.2, Math.sqrt(ent.a || 1000) / 900);
    return [base[0] + (rnd() - 0.5) * spread, base[1] + (rnd() - 0.5) * spread * 0.8];
  };

  // ------------------------------------------------------------------ scoring
  // real = { counts: Map(id -> n other real players), total: n other real players }
  E.score = function (prompt, seedKey, answerId, real, jackpotId) {
    const ent = E.entity(prompt, answerId);
    const ok = E.isValid(prompt, ent);
    const m = E.machine(prompt, seedKey);
    const rc = real && real.counts ? (real.counts.get(answerId) || 0) : 0;
    const rt = real ? real.total || 0 : 0;
    const same = (m.counts.get(answerId) || 0) + rc + 1;
    const total = E.MACHINE + rt + 1;
    const share = same / total;
    // the most common answer right now, counting this one
    let topCount = same;
    for (const [id, n] of m.counts) {
      const v = n + (real && real.counts ? (real.counts.get(id) || 0) : 0) + (id === answerId ? 1 : 0);
      if (v > topCount) topCount = v;
    }
    if (real && real.counts) for (const [id, n] of real.counts) if (!m.counts.has(id) && n + (id === answerId ? 1 : 0) > topCount) topCount = n + (id === answerId ? 1 : 0);
    const pTop = topCount / total, pMin = 1 / total;
    const r = Math.max(0, Math.min(1, Math.log(pTop / share) / Math.log(pTop / pMin)));
    if (!ok) return { ok, share, r, km: 0, tier: E.SPECIAL.lost, clever: false, jackpot: false };
    if (jackpotId && answerId === jackpotId) return { ok, share, r, km: E.JACKPOT_KM, tier: E.SPECIAL.jackpot, clever: false, jackpot: true };
    const km = Math.round(20 + 980 * r);
    const naive = m.baseShare.get(answerId) || 0;
    const clever = share >= 0.02 && share >= 3 * naive && naive < 0.012;
    const tier = E.TIERS.find((t) => r >= t.min);
    return { ok, share, r, km, tier: clever ? E.SPECIAL.clever : tier, baseTier: tier, clever, jackpot: false };
  };

  E.tierFor = (r) => E.TIERS.find((t) => r >= t.min);

  // ------------------------------------------------------------------ jackpot (the dragon)
  E.jackpotHash = (dayNo, slot, id) => fnv1a(`otm|${dayNo}|${slot}|${id}|x-marks-the-spot`).toString(36);
  // Returns the hidden place's id, or null when the prompt gets no dragon: too many right
  // answers, or no candidate with a workable clue.
  E.pickJackpot = function (prompt, seedKey, dayNo, slot) {
    if (E.validSet(prompt).length > E.CLUE_MAX_VALID) return null;
    const m = baseMachine(prompt, seedKey);
    const rnd = rng('jackpot|' + seedKey + '|' + prompt.key);
    // the hidden place is a real, findable place: for cities, one from Natural Earth's atlas
    const cont = promptCont(prompt);
    const V = E.validSet(prompt).filter((x) => !m.magnets.includes(x.id) && (prompt.kind !== 'city' || !String(x.id).startsWith('gn')) && !farPart(x, cont));
    if (!V.length) return null;
    const sh = (x) => (m.counts.get(x.id) || 0) / E.MACHINE;
    let pool = null, pick = null;
    // cities: a place people have heard of that few will say (1 to 8 in 1,000 Machine players)
    if (prompt.kind === 'city') {
      const known = V.filter((x) => x.sr <= 5 && sh(x) >= 0.001 && sh(x) <= 0.008).sort((a, b) => b.sal - a.sal).slice(0, 30);
      if (known.length >= 3) { pool = known; pick = known[Math.floor(rnd() * known.length)]; }
    }
    if (!pick) {
      const ranked = V.slice().sort((a, b) => sh(b) - sh(a));
      const lo = Math.floor(ranked.length * 0.12) + 3, hi = Math.max(lo + 3, Math.floor(ranked.length * 0.45) + 5);
      let cand = ranked.slice(lo, hi).filter((x) => prompt.kind !== 'city' || x.sr <= 6);
      if (!cand.length) cand = ranked.slice(lo, hi);
      if (!cand.length) cand = ranked.slice(Math.floor(ranked.length / 2));
      pool = cand;
      pick = cand[Math.floor(rnd() * cand.length)] || V[0];
    }
    // the dragon needs a clue: keep the usual pick when it has one, otherwise try the others
    const order = [pick].concat(shuffle(pool.filter((x) => x !== pick), rng('jackpot2|' + seedKey + '|' + prompt.key)));
    for (const x of order) if (E.makeClue(prompt, x.id)) return x.id;
    return null;
  };
  // the page stores only a hash and finds the spot by testing candidates
  E.findJackpot = function (prompt, dayNo, slot, hash) {
    if (!hash) return null;
    for (const x of E.validSet(prompt)) if (E.jackpotHash(dayNo, slot, x.id) === hash) return x.id;
    return null;
  };

  // ------------------------------------------------------------------ dragon clues
  // One short clue under each prompt, made from the hidden place's own data. The game tries
  // single facts first (continent or region, first letter, neighbours, population, latitude,
  // country...), then pairs of facts, and keeps the shortest clue that leaves CLUE_MIN to
  // CLUE_MAX right answers: narrow enough to reason toward, wide enough not to give it away.
  E.CLUE_MIN = 4;
  E.CLUE_MAX = 12;
  E.CLUE_MAX_VALID = 600;   // a prompt with more right answers than this gets no dragon
  E.CHASE = 0.15;           // share of the Machine that goes after the clue

  // Regions with a clear core. Countries at the fuzzy edges are left out, so a region clue
  // never hangs on a contested definition.
  const REGIONS = {
    eas: ['East Asia', 'CHN JPN KOR PRK MNG TWN'],
    sea: ['Southeast Asia', 'BRN KHM IDN LAO MYS MMR PHL SGP THA TLS VNM'],
    sas: ['South Asia', 'AFG BGD BTN IND MDV NPL PAK LKA'],
    cas: ['Central Asia', 'KAZ KGZ TJK TKM UZB'],
    mde: ['the Middle East', 'BHR IRN IRQ ISR JOR KWT LBN OMN PSE QAT SAU SYR ARE YEM'],
    cau: ['the Caucasus', 'ARM AZE GEO'],
    nor: ['the Nordic countries', 'DNK FIN ISL NOR SWE', 'a Nordic country'],
    bal: ['the Baltic states', 'EST LVA LTU', 'a Baltic state'],
    bkn: ['the Balkans', 'ALB BIH BGR HRV MNE MKD SRB UNK'],
    bnl: ['the Benelux', 'BEL NLD LUX'],
    naf: ['North Africa', 'DZA EGY LBY MAR TUN'],
    waf: ['West Africa', 'BEN BFA CPV CIV GMB GHA GIN GNB LBR MLI MRT NER NGA SEN SLE TGO'],
    caf: ['Central Africa', 'CMR CAF TCD COG COD GNQ GAB STP'],
    eaf: ['East Africa', 'BDI DJI ERI ETH KEN RWA SOM SSD TZA UGA'],
    saf: ['Southern Africa', 'AGO BWA LSO MWI MOZ NAM ZAF SWZ ZMB ZWE'],
    car: ['the Caribbean', 'ATG BHS BRB CUB DMA DOM GRD HTI JAM KNA LCA VCT TTO'],
    cam: ['Central America', 'BLZ CRI SLV GTM HND NIC PAN'],
    pac: ['the Pacific Islands', 'FJI KIR MHL FSM NRU PLW PNG WSM SLB TON TUV VUT', 'a Pacific island nation'],
  };
  const REGION_OF = {};
  for (const [key, r] of Object.entries(REGIONS)) for (const id of r[1].split(' ')) REGION_OF[id] = key;
  const regionText = (key, kind) => { const r = REGIONS[key]; return r[2] ? (kind === 'city' ? 'in ' + r[2] : r[2]) : 'in ' + r[0]; };
  const MED = new Set('ALB DZA BIH HRV CYP EGY FRA GRC ISR ITA LBN LBY MLT MCO MNE MAR SVN ESP SYR TUN TUR PSE'.split(' '));
  E.REGIONS = REGIONS; E.REGION_OF = REGION_OF;

  const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
  const LAT_MARKS = [[66.563, 'the Arctic Circle', 0.9], [60, '60°N', 0.85], [50, '50°N', 0.85], [40, '40°N', 0.85], [30, '30°N', 0.85],
    [23.436, 'the Tropic of Cancer', 0.9], [10, '10°N', 0.8], [0, 'the Equator', 0.9], [-10, '10°S', 0.8],
    [-23.436, 'the Tropic of Capricorn', 0.9], [-30, '30°S', 0.85], [-40, '40°S', 0.85], [-50, '50°S', 0.85]];
  const CLUE_LANG = ['English', 'French', 'Spanish', 'Arabic', 'Portuguese', 'Russian'];
  // a clue's continent is where the country mainly lies: France is in Europe, not in Africa
  // because of Réunion (the continent prompts stay generous; clues should not need footnotes)
  const clueConts = (k) => (k.id === 'RUS' ? ['Europe', 'Asia'] : k.ct.slice(0, 1));
  // places a player could reason toward: every country, and cities from Natural Earth's atlas
  const findable = (prompt, y) => prompt.kind !== 'city' || !String(y.id).startsWith('gn');
  const CLUE_FLAG = ['red', 'white', 'blue', 'green', 'yellow', 'black', 'orange'];

  // Every true fact about the hidden place that could serve as a clue part.
  // f = family (two parts of one clue never share a family), w = how fair a clue it makes.
  function clueParts(prompt, x) {
    const P = [];
    const add = (f, key, w, text, m) => P.push({ f, key, w, text, m });
    const L = firstLetter(x.n);
    if (prompt.kind === 'country') {
      for (const ct of clueConts(x)) add('place', 'cont:' + ct, 1, 'in ' + ct, (y) => clueConts(y).includes(ct));
      const rg = REGION_OF[x.id];
      if (rg) add('place', 'reg:' + rg, 1.05, regionText(rg, 'country'), (y) => REGION_OF[y.id] === rg);
      if (MED.has(x.id)) add('med', 'med', 0.95, 'on the Mediterranean', (y) => MED.has(y.id));
      add('ini', 'ini:' + L, 0.9, 'starts with ' + L, (y) => firstLetter(y.n) === L);
      const nb = x.b.length;
      add('nb', 'nb:' + nb, 0.9, nb === 0 ? 'has no land borders' : nb === 1 ? 'borders one country' : `borders ${NUMW[nb] || nb} countries`, (y) => y.b.length === nb);
      for (const t of [1e6, 5e6, 1e7, 2e7, 5e7, 1e8]) {      // only when the hidden place is clearly on one side
        if (x.p > t * 1.25) add('pop', 'pop>' + t, 0.85, `more than ${fmtPop(t)} people`, (y) => y.p > t);
        if (x.p < t / 1.25) add('pop', 'pop<' + t, 0.85, `fewer than ${fmtPop(t)} people`, (y) => y.p < t);
      }
      for (const t of [1e4, 1e5, 1e6]) {
        if (x.a > t * 1.3) add('area', 'area>' + t, 0.65, 'larger than ' + fmtArea(t), (y) => y.a > t);
        if (x.a < t / 1.3) add('area', 'area<' + t, 0.65, 'smaller than ' + fmtArea(t), (y) => y.a < t);
      }
      // (the Tropic and Equator prompts accept near misses, so their data is too loose for a clue)
      if (x.bb[3] < 0) add('lat', 'south', 0.85, 'entirely south of the Equator', (y) => y.bb[3] < 0);
      add('coast', 'll:' + (x.ll ? 1 : 0), 0.75, x.ll ? 'landlocked' : 'has a coastline', (y) => !!y.ll === !!x.ll);
      add('capsea', 'cpc:' + (x.cpc ? 1 : 0), 0.65, x.cpc ? 'its capital is by the sea' : 'its capital is inland', (y) => !!y.cpc === !!x.cpc);
      for (const l of CLUE_LANG) if (x.lg.includes(l)) add('lang', 'lang:' + l, 0.75, l + '-speaking', (y) => y.lg.includes(l));
      // flag colours only when they are a clear part of the flag, not a speck in an emblem
      for (const col of CLUE_FLAG) if (x.fc && (x.fc[col] || 0) >= 0.05) add('flag', 'flag:' + col, 0.75, col + ' in its flag', (y) => !!y.fc && (y.fc[col] || 0) >= 0.05);
    } else {
      for (const ct of x.ct) add('place', 'cont:' + ct, 1, 'in ' + ct, (y) => y.ct.includes(ct));
      const rg = REGION_OF[x.c];
      if (rg) add('place', 'reg:' + rg, 1.05, regionText(rg, 'city'), (y) => REGION_OF[y.c] === rg);
      add('place', 'ctry:' + x.c, 1, 'in ' + theName(x.c), (y) => y.c === x.c);
      add('ini', 'ini:' + L, 0.9, 'starts with ' + L, (y) => firstLetter(y.n) === L);
      for (const [lat, name, w] of LAT_MARKS) {
        if (x.lat > lat + 0.6) add('lat', 'n' + lat, w, 'north of ' + name, (y) => y.lat > lat);
        if (x.lat < lat - 0.6) add('lat', 's' + lat, w, 'south of ' + name, (y) => y.lat < lat);
      }
      for (const t of [1e5, 5e5, 1e6, 5e6]) {
        if (x.p > t * 1.25) add('pop', 'pop>' + t, 0.85, `more than ${fmtPop(t)} people`, (y) => y.p > t);
        if (x.p < t / 1.25) add('pop', 'pop<' + t, 0.85, `fewer than ${fmtPop(t)} people`, (y) => y.p < t);
      }
      add('coast', 'sea:' + (x.f & 2 ? 1 : 0), 0.75, x.f & 2 ? 'by the sea' : 'inland', (y) => !!(y.f & 2) === !!(x.f & 2));
      if (x.f & 32) add('cap', 'cap', 0.85, 'a capital city', (y) => !!(y.f & 32));     // the main capital, not a seat of government
    }
    return P;
  }

  // the best clue for this hidden place, or null when none leaves a handful of right answers
  E.makeClue = function (prompt, id) {
    const x = E.entity(prompt, id);
    if (!x || !E.isValid(prompt, x)) return null;
    const V = E.validSet(prompt);
    if (V.length > E.CLUE_MAX_VALID || !findable(prompt, x)) return null;
    const K = V.filter((y) => findable(prompt, y));
    const fit = (n) => -0.05 * Math.max(0, Math.abs(n - 7) - 1);     // 6 to 8 places is ideal
    const said = prompt.text.toLowerCase();
    const parts = [];
    for (const p of clueParts(prompt, x)) {
      if (said.includes(p.text.toLowerCase())) continue;               // never repeat the prompt
      const ids = new Set(K.filter(p.m).map((y) => y.id));
      if (ids.size < K.length && ids.size >= E.CLUE_MIN) parts.push(Object.assign(p, { ids }));   // drop facts every right answer shares
    }
    const better = (a, b) => !b || a.score > b.score + 1e-9 || (Math.abs(a.score - b.score) <= 1e-9 && a.text < b.text);
    let best = null;
    for (const p of parts) {
      const n = p.ids.size;
      if (n > E.CLUE_MAX) continue;
      const c = { parts: [p], n, score: p.w + fit(n), text: p.text };
      if (better(c, best)) best = c;
    }
    if (!best) {
      // two facts from different families; the more natural order puts the place first
      const ORDER = ['place', 'med', 'lat', 'coast', 'cap', 'capsea', 'nb', 'lang', 'flag', 'pop', 'area', 'ini'];
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i], b = parts[j];
          if (a.f === b.f) continue;
          let n = 0;
          for (const k of a.ids) if (b.ids.has(k)) n++;
          if (n < E.CLUE_MIN || n > E.CLUE_MAX || n === a.ids.size || n === b.ids.size) continue;   // each fact must narrow it
          const pr = ORDER.indexOf(a.f) <= ORDER.indexOf(b.f) ? [a, b] : [b, a];
          const c = { parts: pr, n, score: (a.w + b.w) / 2 + fit(n), text: pr.map((q) => q.text).join(', ') };
          if (better(c, best)) best = c;
        }
      }
    }
    if (!best) return null;
    const ids = K.filter((y) => best.parts.every((p) => p.m(y))).map((y) => y.id);
    return { id, text: best.text, parts: best.parts.map((p) => ({ key: p.key, text: p.text, m: p.m })), ids, n: ids.length };
  };
  // does a place fit the clue? (whether or not it fits the prompt)
  E.fitsClue = (prompt, ent) => !!(prompt.clue && ent && prompt.clue.parts.every((p) => p.m(ent)));

  // ------------------------------------------------------------------ schedule
  E.dayNo = (now) => Math.floor(((now || Date.now()) - E.EPOCH) / 86400000) + 1;
  E.dayDate = (dayNo) => new Date(E.EPOCH + (dayNo - 1) * 86400000);
  E.seedKey = (dayNo, slot) => `d${dayNo}s${slot}`;

  // Seven slots: a warm-up, then cities and countries alternating, getting narrower.
  const SLOTS = [
    { kind: 'country', min: 35, max: 160 },
    { kind: 'city', min: 40, max: 3000 },
    { kind: 'country', min: 12, max: 60 },
    { kind: 'city', min: 12, max: 300 },
    { kind: 'country', min: 8, max: 40 },
    { kind: 'city', min: 12, max: 150 },
    { kind: 'country', min: 7, max: 25 },
  ];
  E.FIRST_DAYS = {
    1: ['flagHas:red', 'cCoastal:', 'contLandlocked:Africa', 'cCountry:JPN', 'capNotLargest:', 'cArctic:', 'oneNeighbour:'],
  };

  // how often each kind of prompt comes up: geography and two-condition prompts first, word play now and then
  const WEIGHT = {
    flagHas: 0.8, flagNo: 0.8, flagOnly: 0.7, continent: 0.4, landlocked: 0.7, noBorders: 0.8, oneNeighbour: 1,
    manyNeighbours: 0.7, borders: 1.2, language: 0.6, popUnder: 0.8, popOver: 0.8, areaOver: 0.7, areaUnder: 0.7,
    line: 1, southern: 0.8, nameStarts: 0.3, nameEnds: 0.4, nameHas: 0.3, nameNoA: 0.3, nameLen: 0.3,
    capSameLetter: 0.4, capCoastal: 0.8, capNotLargest: 1,
    contFlag: 1.4, contLandlocked: 1, contNoBorders: 0.9, contCapCoastal: 0.9, contLanguage: 1, contPop: 0.9,
    cCoastal: 0.8, cCapital: 0.7, cCapCoastal: 1, cBig: 1, cMillionIn: 1, cCoastIn: 1, cSouth: 0.6, cSouthCap: 1,
    cArctic: 1, cFarSouth: 1, cEquator: 1, cLetter: 0.4, cLandlocked: 0.8, cCapitalIn: 1, cCountry: 1.4, cLetterCoastal: 0.5,
  };

  const FAMILY = {
    popOver: 'pop', popUnder: 'pop', contPop: 'pop', cBig: 'citypop', cMillionIn: 'citypop',
    flagHas: 'flag', flagNo: 'flag', flagOnly: 'flag', contFlag: 'flag',
    language: 'lang', contLanguage: 'lang', landlocked: 'land', contLandlocked: 'land', cLandlocked: 'land',
    noBorders: 'border', contNoBorders: 'border', oneNeighbour: 'border', manyNeighbours: 'border', borders: 'border',
    capCoastal: 'capsea', contCapCoastal: 'capsea', cCoastal: 'sea', cCoastIn: 'sea', cLetterCoastal: 'sea',
    cCapital: 'cap', cCapitalIn: 'cap', cSouthCap: 'cap', cCapCoastal: 'cap', capNotLargest: 'cap2', capSameLetter: 'name',
    nameStarts: 'name', nameEnds: 'name', nameHas: 'name', nameNoA: 'name', nameLen: 'name', cLetter: 'cname',
    continent: 'cont', southern: 'hemi', cSouth: 'hemi', cFarSouth: 'hemi', line: 'line', cEquator: 'line', cArctic: 'line',
    areaOver: 'area', areaUnder: 'area',
  };
  const fam = (t) => FAMILY[t] || t;

  E.buildSchedule = function (days) {
    const bank = E.bank();
    const recentKeys = [], recentT = [];   // same prompt not within 8 days, same type not within 2
    const out = [];
    for (let d = 1; d <= days; d++) {
      const rnd = rng('schedule|' + d);
      let keys;
      if (E.FIRST_DAYS[d]) keys = E.FIRST_DAYS[d];
      else {
        keys = [];
        const usedT = new Set();
        for (const slot of SLOTS) {
          const fits = (pr) => pr.kind === slot.kind && !usedT.has(fam(pr.t)) && !keys.includes(pr.key);
          const inRange = (pr) => pr.n >= slot.min && pr.n <= slot.max;
          const tries = [
            (pr) => fits(pr) && inRange(pr) && !recentKeys.includes(pr.key) && !recentT.includes(pr.t),
            (pr) => fits(pr) && inRange(pr) && !recentKeys.includes(pr.key),
            (pr) => fits(pr) && inRange(pr),
            fits,
          ];
          let pool = [];
          for (const f of tries) { pool = bank.filter(f); if (pool.length) break; }
          // weighted pick of a template, then one of its prompts
          const temps = [...new Set(pool.map((pr) => pr.t))];
          const tot = temps.reduce((a, t) => a + (WEIGHT[t] || 1), 0);
          let x = rnd() * tot, t = temps[temps.length - 1];
          for (const tt of temps) { x -= WEIGHT[tt] || 1; if (x <= 0) { t = tt; break; } }
          const opts = pool.filter((pr) => pr.t === t);
          const pick = opts[Math.floor(rnd() * opts.length)];
          keys.push(pick.key); usedT.add(fam(pick.t));
        }
      }
      const jackpots = keys.map((k, slot) => {
        const pr = E.parseKey(k);
        const id = E.pickJackpot(pr, E.seedKey(d, slot), d, slot);
        return id ? E.jackpotHash(d, slot, id) : null;     // null: no dragon on this prompt
      });
      out.push({ d, k: keys, j: jackpots });
      recentKeys.push(...keys);
      recentT.push(...keys.map((k) => k.split(':')[0]));
      while (recentKeys.length > E.PROMPTS_PER_DAY * 10) recentKeys.shift();
      while (recentT.length > E.PROMPTS_PER_DAY * 2) recentT.shift();
    }
    return out;
  };

  E.today = function (schedule, dayNo) {
    const entry = schedule.find((s) => s.d === dayNo) || schedule[(dayNo - 1) % schedule.length];
    return entry.k.map((k, slot) => {
      const pr = E.parseKey(k);
      pr.slot = slot; pr.seed = E.seedKey(dayNo, slot); pr.jh = entry.j[slot] || null;
      if (entry.d !== dayNo) {     // past the pre-built schedule: recompute the hidden spot
        const id = E.pickJackpot(pr, pr.seed, dayNo, slot);
        pr.jh = id ? E.jackpotHash(dayNo, slot, id) : null;
      }
      // the clue comes from the hidden place itself; no workable clue means no dragon
      const jid = E.findJackpot(pr, dayNo, slot, pr.jh);
      pr.clue = jid ? E.makeClue(pr, jid) : null;
      if (!pr.clue) pr.jh = null;
      return pr;
    });
  };

  root.OTM = E;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
