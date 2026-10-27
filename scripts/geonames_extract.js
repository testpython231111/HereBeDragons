// Pull a slice of GeoNames (via the all-the-cities npm package, CC BY 4.0) for the atlas:
// towns of 60,000+ anywhere, and towns of 1,500+ in the far north (60°N+) or far south (40°S+),
// which Natural Earth's populated places leave out (Hammerfest, Kirkenes, Ilulissat ...).
// Usage: node geonames_extract.js <dir with node_modules/all-the-cities> <out.json>
const fs = require('fs'), path = require('path');
const [dir, out] = process.argv.slice(2);
const cities = require(path.join(path.resolve(dir), 'node_modules/all-the-cities'));
const KEEP = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLC', 'PPLG', 'PPLS', 'PPLF', 'PPLR']);
const rows = [];
for (const c of cities) {
  if (!KEEP.has(c.featureCode)) continue;
  const [lon, lat] = c.loc.coordinates;
  const far = lat >= 60 || lat <= -40;
  if (!(c.population >= 60000 || (far && c.population >= 1500))) continue;
  rows.push([c.cityId, c.name, c.country, +lat.toFixed(4), +lon.toFixed(4), c.population, c.featureCode, c.altName || '']);
}
fs.writeFileSync(out, JSON.stringify(rows));
console.log('geonames rows', rows.length, 'far', rows.filter((r) => r[3] >= 60 || r[3] <= -40).length);
