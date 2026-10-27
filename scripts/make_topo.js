// GeoJSON -> simplified, quantized TopoJSON for the game map.
// Usage: node make_topo.js <npm dir> <data dir> <keep fraction> <quantization>
const fs = require('fs');
const path = require('path');
const [npmDir, dataDir, keepArg, qArg] = process.argv.slice(2);
const req = (m) => require(path.join(path.resolve(npmDir), 'node_modules', m));
const { topology } = req('topojson-server');
const { presimplify, simplify, quantile } = req('topojson-simplify');
const { quantize } = req('topojson-client');

const countries = JSON.parse(fs.readFileSync(path.join(dataDir, 'geo50.geojson'), 'utf8'));
const lakes = JSON.parse(fs.readFileSync(path.join(dataDir, 'lakes.geojson'), 'utf8'));
let topo = topology({ countries, lakes });
topo = presimplify(topo);
const keep = parseFloat(keepArg || '0.4');
topo = simplify(topo, quantile(topo, keep)); // quantile(p) keeps roughly the fraction p of points
topo = quantize(topo, parseFloat(qArg || '1e4'));
const out = JSON.stringify(topo);
fs.writeFileSync(path.join(dataDir, 'world.topo.json'), out);
console.log('keep', keep, 'topo bytes', out.length, 'points', topo.arcs.reduce((n, a) => n + a.length, 0));
