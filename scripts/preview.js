// Render a quick PNG preview of the map data (sanity check).
// Usage: node preview.js <npm dir> <data dir> <out.png> [lon0 lat0 lon1 lat1]
const fs = require('fs'), path = require('path');
const [npmDir, dataDir, out, ...ext] = process.argv.slice(2);
const req = (m) => require(path.join(path.resolve(npmDir), 'node_modules', m));
const d3 = req('d3-geo'), topojson = req('topojson-client'), { Resvg } = req('@resvg/resvg-js');
const topo = JSON.parse(fs.readFileSync(path.join(dataDir, 'world.topo.json')));
const C = JSON.parse(fs.readFileSync(path.join(dataDir, 'countries.json'))).countries;
const cities = JSON.parse(fs.readFileSync(path.join(dataDir, 'cities.json')));
const byId = Object.fromEntries(C.map((c) => [c.id, c]));
const W = 1600, H = 900;
const feats = topojson.feature(topo, topo.objects.countries).features;
const proj = d3.geoNaturalEarth1();
if (ext.length === 4) {
  const [x0, y0, x1, y1] = ext.map(Number);
  proj.fitExtent([[10, 10], [W - 10, H - 10]], { type: 'MultiPoint', coordinates: [[x0, y0], [x1, y1]] });
} else proj.fitExtent([[10, 10], [W - 10, H - 10]], { type: 'Sphere' });
const gp = d3.geoPath(proj);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#bcd6e0"/>`;
for (const f of feats) {
  const c = byId[f.id];
  const fill = !c ? '#f0f' : c.s ? '#efe6cf' : '#d9d2c0';
  svg += `<path d="${gp(f)}" fill="${fill}" stroke="#7a6b55" stroke-width="0.6"/>`;
}
for (const c of cities) {
  if (c[6] > 4) continue;
  const p = proj([c[4], c[3]]); if (!p) continue;
  const col = c[7] & 2 ? '#0a6' : '#c30';
  svg += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${c[7] & 1 ? 3.5 : 2}" fill="${col}"/>`;
}
svg += '</svg>';
fs.writeFileSync(out, new Resvg(svg).render().asPng());
console.log('wrote', out, feats.length, 'features; unmatched:', feats.filter((f) => !byId[f.id]).map((f) => f.id));
