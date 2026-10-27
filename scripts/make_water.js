// Lakes, inland seas and rivers for the map, written into data/world.topo.json beside the countries.
// The countries' arcs are left exactly as they are: the water gets its own simplification and is quantized
// with the topology's existing transform, then appended.
// Usage: node scripts/make_water.js <npm dir> <raw dir> <data dir>
//   needs raw/ne/ne_10m_lakes.geojson and raw/ne/ne_50m_rivers_lake_centerlines.geojson (Natural Earth)
const fs = require('fs'), path = require('path');
const [npmDir, rawDir, dataDir] = process.argv.slice(2);
const req = (m) => require(path.join(path.resolve(npmDir), 'node_modules', m));
const { topology } = req('topojson-server');
const { presimplify, simplify } = req('topojson-simplify');

const topoFile = path.join(dataDir, 'world.topo.json');
const world = JSON.parse(fs.readFileSync(topoFile, 'utf8'));
const load = (f) => JSON.parse(fs.readFileSync(path.join(rawDir, 'ne', f), 'utf8')).features;
const lakesIn = load('ne_10m_lakes.geojson');
const riversIn = load('ne_50m_rivers_lake_centerlines.geojson');

// ---------------------------------------------------------------- which lakes
// every lake Natural Earth ranks 0-3, the larger ones ranked 4-5, very large reservoirs, and a few small
// lakes everybody knows. The Caspian is left out: the countries already leave it open as sea.
const FAMOUS = new Set(['Mjøsa', 'Lago di Garda', 'Lago di Como', 'Dongting Hu', 'Lago Poopó', 'Biwa Ko', 'Femunden',
  'Lago Nahuel Huapí', 'Sea of Galilee', 'Lake Balaton', 'Bodensee', 'Lake Geneva', 'Lough Neagh', 'Lake Taupo', 'Danau Toba']);
// the name shown when a lake is tapped: Natural Earth's name, in the form an English reader knows
const RENAME = { 'Bodensee': 'Lake Constance', 'Lac Moeru': 'Lake Mweru', 'Inarijrvi': 'Lake Inari', 'Kaliningradskiy Zaliv': 'Vistula Lagoon',
  'Zalew Wislany': 'Vistula Lagoon', 'Professor Doctor Ingenieur W. J. Van Blommestein Meer': 'Brokopondo Reservoir', "Lake Il'Men'": 'Lake Ilmen',
  'Pääjärvi': 'Lake Pyaozero', 'Toktogul Suu Saktagychy': 'Toktogul Reservoir', 'Buhayrat ath Tharthar': 'Lake Tharthar', 'Lago Buenos Aires': 'Lake General Carrera',
  'Lake Taupo': 'Lake Taupō', 'Tai Hu': 'Lake Tai', 'Lac Tumba': 'Lake Tumba' };
function lakeName(p) {
  const n = (p.name || p.name_en || '').trim();
  if (RENAME[n]) return RENAME[n];
  let m;
  if ((m = /^Ozero (.+)$/.exec(n))) return 'Lake ' + m[1];
  if ((m = /^(.+) Hu$/.exec(n))) return m[1] + ' Lake';
  if ((m = /^(.+) Nuur$/.exec(n))) return 'Lake ' + m[1];
  if ((m = /^(.+) (Köli|Kli)$/.exec(n))) return 'Lake ' + m[1];
  if ((m = /^Lago (?:de |di )?(.+)$/.exec(n))) return 'Lake ' + m[1];
  if ((m = /^Danau (.+)$/.exec(n))) return 'Lake ' + m[1];
  if ((m = /^(.+) Ko$/.exec(n))) return 'Lake ' + m[1];
  if ((m = /^(?:Represa|Repressa|Réservoir) (?:de )?(.+)$/.exec(n))) return m[1] + ' Reservoir';
  return n;
}
const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % n]; a += x0 * y1 - x1 * y0; } return Math.abs(a / 2); };
const areaOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).reduce((s, p) => s + ringArea(p[0]) - p.slice(1).reduce((t, h) => t + ringArea(h), 0), 0);
const lakes = lakesIn.filter((f) => {
  const p = f.properties, sr = p.scalerank == null ? 9 : p.scalerank, a = areaOf(f.geometry), name = p.name || '';
  if (name.startsWith('Caspian')) return false;
  return sr <= 3 || (sr <= 5 && a >= 0.04) || a >= 0.25 || FAMOUS.has(name);
}).map((f) => ({ type: 'Feature', properties: { n: lakeName(f.properties) }, geometry: f.geometry }));

// ---------------------------------------------------------------- which rivers
// the rivers of the 1:50m set (not the lines through lakes); the page shows the bigger ones first
const rivers = riversIn.filter((f) => f.properties.featurecla === 'River' && f.geometry)
  .map((f) => ({ type: 'Feature', properties: { s: f.properties.scalerank, n: f.properties.name_en || f.properties.name || '' }, geometry: f.geometry }));

// ---------------------------------------------------------------- simplify, quantize with the world's transform, append
let water = topology({ lakes: { type: 'FeatureCollection', features: lakes }, rivers: { type: 'FeatureCollection', features: rivers } });
water = presimplify(water);
water = simplify(water, 4e-4);           // planar triangle area in square degrees: bends of a couple of kilometres stay
// earlier water (the arcs after the last one the countries use) is dropped, so the script can be run again
const used = (a, m) => (typeof a === 'number' ? Math.max(m, a >= 0 ? a : ~a) : a.reduce((mm, b) => used(b, mm), m));
const lastCountryArc = world.objects.countries.geometries.reduce((m, g) => (g.arcs ? used(g.arcs, m) : m), -1);
world.arcs.length = lastCountryArc + 1;
delete world.objects.lakes; delete world.objects.rivers;
const [sx, sy] = world.transform.scale, [tx, ty] = world.transform.translate;
const off = world.arcs.length;
for (const arc of water.arcs) {
  const out = [];
  let px = 0, py = 0;
  for (const [x, y] of arc) {
    const qx = Math.round((x - tx) / sx), qy = Math.round((y - ty) / sy);
    if (out.length && qx === px && qy === py) continue;
    out.push(out.length ? [qx - px, qy - py] : [qx, qy]);
    px = qx; py = qy;
  }
  if (out.length < 2) out.push([0, 0]);
  world.arcs.push(out);
}
const shift = (a) => (a >= 0 ? a + off : ~(~a + off));
const remap = (arcs) => (typeof arcs[0] === 'number' ? arcs.map(shift) : arcs.map(remap));
for (const key of ['lakes', 'rivers']) {
  const o = water.objects[key];
  for (const g of o.geometries) if (g.arcs) g.arcs = remap(g.arcs);
  world.objects[key] = o;
}
const text = JSON.stringify(world);
fs.writeFileSync(topoFile, text);
const pts = (o) => o.geometries.length;
console.log('lakes', pts(world.objects.lakes), 'rivers', pts(world.objects.rivers), 'arcs', world.arcs.length, 'bytes', text.length);
