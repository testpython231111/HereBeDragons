// Here Be Dragons: the antique map's drawings and colours, written to data/antique.json.
// Usage: node scripts/antique.js <otm dir>
// - every drawing (compass rose, galleons, sea serpent, whale, the dragon seal) is an original SVG,
//   drawn once at unit size; the page places and scales it (the ships and beasts are in ornaments.js)
// - the placements come from the map study, which searched for open water and kept each drawing
//   10-18 px from any land at 1440 px wide; the page scales them with the map, so they stay clear
// - each country gets one of five hand-colouring washes, never the same as a neighbour's
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || '.';
const INK = '#3a2a1b';
const f1 = (v) => (Math.round(v * 10) / 10).toString();

const PAPER = '#f2e7c9', GREEN = '#6f8a5a', RED = '#a8402a', OCHRE = '#c99a3e';

const T = (x, y, k, rot, flip) => `translate(${f1(x)} ${f1(y)})${rot ? ` rotate(${rot})` : ''} scale(${(flip ? -k : k).toFixed(3)} ${k.toFixed(3)})`;

// ---------------------------------------------------------------- compass rose
function fleur() {
  // a fleur-de-lis pointing up, base at 0,0, top at 0,-1
  return `<path d="M0 -1 C.1 -.8 .2 -.62 .15 -.42 C.12 -.31 .06 -.25 0 -.22 C-.06 -.25 -.12 -.31 -.15 -.42 C-.2 -.62 -.1 -.8 0 -1Z` +
    `M.06 -.27 C.16 -.47 .4 -.56 .5 -.42 C.58 -.3 .48 -.17 .37 -.22 C.45 -.27 .42 -.36 .33 -.35 C.22 -.33 .15 -.24 .1 -.16Z` +
    `M-.06 -.27 C-.16 -.47 -.4 -.56 -.5 -.42 C-.58 -.3 -.48 -.17 -.37 -.22 C-.45 -.27 -.42 -.36 -.33 -.35 C-.22 -.33 -.15 -.24 -.1 -.16Z` +
    `M-.24 -.19 H.24 V-.11 H-.24Z M-.1 -.11 C-.16 -.03 -.08 .03 0 0 C.08 .03 .16 -.03 .1 -.11Z"/>`;
}
function point(len, w, a, dark, light) {
  // a two-tone star point from the centre out to len, half-width w, at angle a (degrees, 0 = north)
  return `<g transform="rotate(${a})"><path d="M0 0 L0 ${f1(-len)} L${f1(w)} ${f1(-w * 1.15)}Z" fill="${light}"/><path d="M0 0 L0 ${f1(-len)} L${f1(-w)} ${f1(-w * 1.15)}Z" fill="${dark}"/>` +
    `<path d="M${f1(-w)} ${f1(-w * 1.15)} L0 ${f1(-len)} L${f1(w)} ${f1(-w * 1.15)} L0 0Z" fill="none" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/></g>`;
}
function compassRose(cx, cy, r, opts = {}) {
  // drawn on a radius of 100, then scaled
  const k = r / 100;
  let g = `<g transform="${T(cx, cy, k)}">`;
  g += `<circle r="74" fill="${PAPER}" fill-opacity=".92" stroke="${INK}" stroke-width="1.6"/><circle r="66" fill="none" stroke="${INK}" stroke-width=".9"/>`;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * 360;
    g += i % 2 ? `<path transform="rotate(${a})" d="M-2.6 -73.2 L2.6 -73.2 L2.2 -66.8 L-2.2 -66.8Z" fill="${INK}"/>` : '';
  }
  g += `<circle r="44" fill="none" stroke="${INK}" stroke-width=".6" stroke-dasharray="1.5 2.5"/>`;
  for (let i = 0; i < 16; i++) g += point(48, 6, 11.25 + i * 22.5, GREEN, PAPER);
  for (let i = 0; i < 8; i++) g += point(66, 9, 22.5 + i * 45, RED, '#e9c79b');
  for (let i = 0; i < 8; i++) g += point(i % 2 ? 78 : 96, i % 2 ? 11 : 13, i * 45, INK, PAPER);
  g += `<circle r="8" fill="${OCHRE}" stroke="${INK}" stroke-width="1.2"/><circle r="2.6" fill="${INK}"/>`;
  // north: the fleur-de-lis; east: the cross of the Levant
  g += `<g transform="translate(0 -96) scale(30)" fill="${RED}" stroke="${INK}" stroke-width=".035" stroke-linejoin="round">${fleur()}</g>`;
  g += `<g transform="translate(103 0)" fill="${RED}" stroke="${INK}" stroke-width="1"><path d="M-3 -10 H3 V-3 H10 V3 H3 V10 H-3 V3 H-10 V-3 H-3Z"/></g>`;
  return g + '</g>';
}

// the galleons, the sea serpent and the whale live in ornaments.js
const ORN = require('./ornaments.js');

// ---------------------------------------------------------------- scroll cartouche: w x h, centred at x,y
function cartouche(x, y, w, h) {
  const hw = w / 2, hh = h / 2, roll = h * 0.36;
  let g = `<g transform="translate(${f1(x)} ${f1(y)})" stroke="${INK}" stroke-linejoin="round">`;
  // shadow
  g += `<path d="M${f1(-hw + roll)} ${f1(-hh + 5)} H${f1(hw - roll + 4)} V${f1(hh + 5)} H${f1(-hw + roll + 4)}Z" fill="#6b4a22" fill-opacity=".18" stroke="none"/>`;
  // the sheet, slightly wavy top and bottom edges
  g += `<path d="M${f1(-hw + roll)} ${f1(-hh)} C${f1(-hw / 3)} ${f1(-hh - 6)} ${f1(hw / 3)} ${f1(-hh + 6)} ${f1(hw - roll)} ${f1(-hh)} V${f1(hh)} C${f1(hw / 3)} ${f1(hh + 6)} ${f1(-hw / 3)} ${f1(hh - 6)} ${f1(-hw + roll)} ${f1(hh)}Z" fill="${PAPER}" stroke-width="1.4"/>`;
  // inner rules
  g += `<path d="M${f1(-hw + roll + 10)} ${f1(-hh + 9)} C${f1(-hw / 3)} ${f1(-hh + 4)} ${f1(hw / 3)} ${f1(-hh + 14)} ${f1(hw - roll - 10)} ${f1(-hh + 9)} V${f1(hh - 9)} C${f1(hw / 3)} ${f1(hh - 4)} ${f1(-hw / 3)} ${f1(hh - 14)} ${f1(-hw + roll + 10)} ${f1(hh - 9)}Z" fill="none" stroke="${RED}" stroke-width=".9" stroke-opacity=".8"/>`;
  // the rolls at each end: a cylinder with a spiral end
  for (const side of [-1, 1]) {
    const cx = side * (hw - roll), rx = roll * 0.62;
    g += `<path d="M${f1(cx)} ${f1(-hh)} C${f1(cx + side * rx * 1.6)} ${f1(-hh)} ${f1(cx + side * rx * 1.6)} ${f1(hh)} ${f1(cx)} ${f1(hh)}" fill="#e3d2a8" stroke-width="1.3"/>`;
    g += `<ellipse cx="${f1(cx + side * rx * 1.2)}" cy="${f1(-hh + roll * 0.65)}" rx="${f1(rx * 0.7)}" ry="${f1(roll * 0.68)}" fill="#e3d2a8" stroke-width="1.2"/>`;
    g += `<path d="M${f1(cx + side * rx * 1.2)} ${f1(-hh + roll * 0.65)} m${f1(-rx * 0.35)} 0 a${f1(rx * 0.35)} ${f1(roll * 0.34)} 0 1 1 ${f1(rx * 0.7)} 0 a${f1(rx * 0.22)} ${f1(roll * 0.22)} 0 1 1 ${f1(-rx * 0.4)} 0" fill="none" stroke-width=".9"/>`;
    g += `<ellipse cx="${f1(cx + side * rx * 1.2)}" cy="${f1(hh - roll * 0.65)}" rx="${f1(rx * 0.7)}" ry="${f1(roll * 0.68)}" fill="#e3d2a8" stroke-width="1.2"/>`;
    g += `<path d="M${f1(cx + side * rx * 1.2)} ${f1(hh - roll * 0.65)} m${f1(-rx * 0.35)} 0 a${f1(rx * 0.35)} ${f1(roll * 0.34)} 0 1 0 ${f1(rx * 0.7)} 0 a${f1(rx * 0.22)} ${f1(roll * 0.22)} 0 1 0 ${f1(-rx * 0.4)} 0" fill="none" stroke-width=".9"/>`;
    g += `<g fill="none" stroke-width=".55" stroke-opacity=".6">${[0.25, 0.45, 0.65].map((u) => `<path d="M${f1(cx + side * rx * 0.2)} ${f1(-hh + h * u)} q${f1(side * rx * 0.6)} 2 ${f1(side * rx * 1.1)} 0"/>`).join('')}</g>`;
  }
  return g + '</g>';
}

// ---------------------------------------------------------------- the dragon: a small heraldic dragon, 100 x 100 box, facing right
const DRAGON = ["M30 62 C30 50 46 45 60 49 C72 52 75 63 68 70 C59 78 38 77 30 62Z", "M57 53 C60 44 62 36 68 30 C72 26 76 23 82 22 L95 26 C97 27 97 30 95 31 L88 32.5 C84 33 81 35 79 39 C75 46 74 54 71 63Z", "M84 31.5 L95 34.5 L86 36.5Z", "M78 23.5 L69 13.5 L81 21.5Z", "M83 22.5 L78.5 12.5 L87.5 22Z", "M49 55 C46 44 44 30 45 18 L33 2 C33 9 31.5 13 29 16 L15 12 C18 18 20 23 21 27 L9 31 C15 35 20 39 23 44 L18 52 C26 51 33 52 39 57Z", "M33 66 C24 72 16 76 11 79 C6 82 3 77 5 72 C6 69 8 67 11 66 L6.5 59.5 L13 61 L15 56 L16.5 62.5 C14 65 12.5 67 12.5 70 C17 67 25 64 31 60Z", "M37 70 C35 76 34 81 31 85 L28 87.5 L40.5 87.5 C39.5 82 41 77 44 72Z", "M60 70 C62 75 64 79 65 83 L63 86.5 L73.5 85.5 C70.5 80 68.5 74 67 68Z", "M52 48 L55 43 L57 48.5Z", "M60 42 L64 38 L64.5 43.5Z", "M64 35 L68.5 31.5 L68.5 37Z", "M44 48 L46 43.5 L48.5 48Z"];
function wyvernPath() { return DRAGON.join(' '); }
function seal(x, y, r) {
  const k = r / 50;
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${k.toFixed(3)})"><circle r="50" fill="${RED}" stroke="${INK}" stroke-width="3"/>` +
    `<circle r="42" fill="none" stroke="#f2d7a7" stroke-width="2.2" stroke-dasharray="4 3"/>` +
    `<g transform="translate(-32 -31) scale(.64)" fill="#f6e6c2">${DRAGON.map((d) => `<path d="${d}"/>`).join('')}</g></g>`;
}


// ---------------------------------------------------------------- colours
// Every country gets one of five washes, never the same as a country it touches. Touching means a shared
// border, a shared corner (Botswana and Zambia), or coasts closer than about 25 km; and a few more pairs
// that face each other across a strait. Coloured with DSATUR: the country with the most differently
// coloured neighbours goes next, and takes the wash used least so far.
const TOPO = JSON.parse(fs.readFileSync(path.join(dir, 'data/world.topo.json'), 'utf8'));
function countryAdjacency() {
  const geos = TOPO.objects.countries.geometries;
  const nb = new Map(geos.map((g) => [g.id, new Set()]));
  const link = (a, b) => { if (a !== b && nb.has(a) && nb.has(b)) { nb.get(a).add(b); nb.get(b).add(a); } };
  // the topology's shared borders
  const owners = new Map();
  const walk = (arcs, id) => { for (const a of arcs) { if (Array.isArray(a)) walk(a, id); else { const j = a < 0 ? ~a : a; if (!owners.has(j)) owners.set(j, new Set()); owners.get(j).add(id); } } };
  for (const g of geos) if (g.arcs) walk(g.arcs, g.id);
  for (const set of owners.values()) for (const a of set) for (const b of set) link(a, b);
  // corners and close coasts, measured on the map's own lines (degrees, east-west shrunk by latitude)
  const [sx, sy] = TOPO.transform.scale, [tx, ty] = TOPO.transform.translate;
  const arcs = TOPO.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
  const segs = [];
  for (const g of geos) {
    const each = (list) => { for (const v of list) { if (Array.isArray(v)) each(v); else { const pts = arcs[v < 0 ? ~v : v]; for (let i = 0; i + 1 < pts.length; i++) segs.push([g.id, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]); } } };
    if (g.arcs) each(g.arcs);
  }
  const CELL = 0.5, R = 0.25, grid = new Map();
  segs.forEach((sg, i) => {
    for (let x = Math.floor(Math.min(sg[1], sg[3]) / CELL); x <= Math.floor(Math.max(sg[1], sg[3]) / CELL); x++)
      for (let y = Math.floor(Math.min(sg[2], sg[4]) / CELL); y <= Math.floor(Math.max(sg[2], sg[4]) / CELL); y++) {
        const k = x + ',' + y;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  });
  const dist = (px, py, sg) => {
    const c = Math.cos((py * Math.PI) / 180), ax = sg[1] * c, ay = sg[2], dx = sg[3] * c - ax, dy = sg[4] - ay, L2 = dx * dx + dy * dy;
    const u = L2 ? Math.max(0, Math.min(1, ((px * c - ax) * dx + (py - ay) * dy) / L2)) : 0;
    return Math.hypot(px * c - (ax + u * dx), py - (ay + u * dy));
  };
  for (const sg of segs) {
    const [id, px, py] = sg;
    for (let x = Math.floor((px - R) / CELL); x <= Math.floor((px + R) / CELL); x++)
      for (let y = Math.floor((py - R) / CELL); y <= Math.floor((py + R) / CELL); y++)
        for (const j of grid.get(x + ',' + y) || []) { const o = segs[j]; if (o[0] !== id && !nb.get(id).has(o[0]) && dist(px, py, o) < R) link(id, o[0]); }
  }
  const NEAR = 'GBR-FRA GBR-IRL DNK-SWE DNK-NOR EST-FIN JPN-KOR JPN-RUS JPN-CHN LKA-IND MDG-MOZ YEM-DJI YEM-ERI SAU-EGY SAU-SDN ITA-TUN CUB-BHS HTI-CUB JAM-CUB TWN-CHN PHL-TWN AUS-IDN AUS-PNG AUS-TLS NZL-AUS ESP-MAR BHR-QAT BHR-SAU CYP-TUR MLT-ITA ISL-GRL GRL-CAN TTO-VEN SGP-MYS SGP-IDN LKA-MDV BHS-USA CUB-USA RUS-USA DEU-SWE DEU-DNK POL-SWE LTU-SWE LVA-SWE KOR-CHN PRK-JPN IRN-ARE OMN-IRN GRC-LBY EGY-GRC EGY-CYP TUR-UKR ROU-TUR BGR-UKR SOM-YEM PHL-MYS PHL-IDN BRN-PHL NOR-GBR NLD-GBR BEL-GBR ESP-DZA FRA-DZA';
  for (const pair of NEAR.split(' ')) { const [a, b] = pair.split('-'); link(a, b); }
  return nb;
}
function colouring(n) {
  const nb = countryAdjacency();
  const ids = [...nb.keys()].sort();
  for (let attempt = 0; attempt < 200; attempt++) {
    let seed = attempt * 7919 + 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const tie = new Map(ids.map((id) => [id, attempt ? rnd() : 0]));
    const col = {}, used = new Array(n).fill(0);
    let ok = true;
    for (let left = ids.length; left > 0; left--) {
      let best = null, bs = -1, bd = -1;
      for (const id of ids) {
        if (col[id] != null) continue;
        const sat = new Set([...nb.get(id)].map((x) => col[x]).filter((x) => x != null)).size, deg = nb.get(id).size;
        if (sat > bs || (sat === bs && (deg > bd || (deg === bd && tie.get(id) > tie.get(best))))) { best = id; bs = sat; bd = deg; }
      }
      const taken = new Set([...nb.get(best)].map((x) => col[x]).filter((x) => x != null));
      let c = -1;
      for (let i = 0; i < n; i++) if (!taken.has(i) && (c < 0 || used[i] < used[c])) c = i;
      if (c < 0) { ok = false; break; }
      col[best] = c; used[c]++;
    }
    if (ok) return col;
  }
  throw new Error('no colouring found: too few colours for the neighbours');
}

const out = {
  // drawings at unit size: rose radius 100, ships 100 wide, serpent 160, whale 120, seal radius 50
  svg: { cartouche: cartouche(0, 0, 370, 112), rose: compassRose(0, 0, 100), galleon: ORN.galleon(), serpent: ORN.serpent(), whale: ORN.whale(), seal: seal(0, 0, 50) },
  unit: { rose: 100, galleon: 124, serpent: 240, whale: 156 },          // drawing units that make up `size`
  // where the study put them (projection scale 248.41112629135839, Natural Earth); labels are the sea names and circles
  scale: 248.41112629135839,
  // each drawing is centred on its spot; the galleons are kept small, like ships far off on a chart
  ornaments: [{"k": "rose", "ll": [-16.469, -34.117], "r": 56}, {"k": "rose", "ll": [164.48, 29.224], "r": 35}, {"k": "serpent", "ll": [-148.16, 35.768], "size": 160, "flip": false}, {"k": "galleon", "ll": [-49.432, 29.211], "size": 56, "flip": true}, {"k": "galleon", "ll": [89.664, -14.708], "size": 48, "flip": false}, {"k": "galleon", "ll": [-109.53, -14.281], "size": 44, "flip": true}, {"k": "whale", "ll": [99.545, -44.252], "size": 100, "flip": true}],
  labels: [{"s": "Mare Pacificum", "ll": [-132.444, 5.446], "size": 27, "ls": 4, "op": 0.85, "len": 233.44, "red": false, "halo": false}, {"s": "Oceanus", "ll": [-36.218, 51.179], "size": 19, "ls": 2.2, "op": 0.85, "len": 77.04, "red": false, "halo": false}, {"s": "Atlanticus", "ll": [-31.837, 46.261], "size": 19, "ls": 2.2, "op": 0.85, "len": 111, "red": false, "halo": false}, {"s": "Oceanus Indicus", "ll": [71.051, -32.058], "size": 21, "ls": 2.6, "op": 0.85, "len": 187.6, "red": false, "halo": false}, {"s": "Oceanus Australis", "ll": [16.091, -62.426], "size": 17, "ls": 6, "op": 0.75, "len": 234.72, "red": false, "halo": false}, {"s": "hic sunt dracones", "ll": [-142.299, 25.509], "size": 11, "ls": 1.2, "op": 0.9, "len": 104, "red": false, "halo": false}, {"s": "CIRCVLVS \u00c6QVINOCTIALIS", "ll": [-150.084, -3.481], "size": 9, "ls": 2.2, "op": 0.95, "len": 169.16, "red": true, "halo": true}, {"s": "TROPICVS CANCRI", "ll": [-134.076, 20.203], "size": 9, "ls": 2.2, "op": 0.95, "len": 114.7, "red": true, "halo": true}, {"s": "TROPICVS CAPRICORNI", "ll": [-131.627, -26.666], "size": 9, "ls": 2.2, "op": 0.95, "len": 145.82, "red": true, "halo": true}, {"s": "CIRCVLVS ANTARCTICVS", "ll": [62.093, -70.375], "size": 9, "ls": 2.2, "op": 0.95, "len": 153.6, "red": true, "halo": true}],
  colours: colouring(5),
};
fs.writeFileSync(path.join(dir, 'data/antique.json'), JSON.stringify(out));
console.log('wrote data/antique.json', JSON.stringify(out).length, 'bytes');
