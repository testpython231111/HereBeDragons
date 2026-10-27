// Optimise flag-icons SVGs with svgo and pack them as { ISO3: "<svg…>" } for the page.
// Each flag gets the coarsest number precision that still renders the same as the original
// (checked by rasterising both with resvg), so emblems stay intact and simple flags stay tiny.
// Usage: node flags_pack.js <npm dir> <countries.json> <out.json>
const fs = require('fs'), path = require('path');
const [npmDir, countriesFile, out] = process.argv.slice(2);
const req = (m) => require(path.join(path.resolve(npmDir), 'node_modules', m));
const { optimize } = req('svgo');
const { Resvg } = req('@resvg/resvg-js');
const wc = JSON.parse(fs.readFileSync(path.join(path.resolve(npmDir), 'node_modules/world-countries/countries.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(countriesFile, 'utf8')).countries;
const byA3 = Object.fromEntries(wc.map((c) => [c.cca3, c.cca2.toLowerCase()]));
const dir = path.join(path.resolve(npmDir), 'node_modules/flag-icons/flags/4x3');

const W = 160;
const render = (svg) => new Resvg(svg, { fitTo: { mode: 'width', value: W }, background: 'rgba(0,0,0,0)' }).render().pixels;
function differs(a, b) {
  let big = 0, sum = 0;
  const n = a.length / 4;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
    sum += d;
    if (d > 64) big++;
  }
  return { big: big / n, mean: sum / n };
}
function opt(svg, p) {
  return optimize(svg, {
    multipass: true,
    floatPrecision: p,
    js2svg: { indent: 0, pretty: false },
    plugins: [
      { name: 'preset-default', params: { floatPrecision: p, overrides: { removeViewBox: false, convertPathData: { floatPrecision: p }, cleanupNumericValues: { floatPrecision: p } } } },
      'removeDimensions',
      { name: 'removeAttrs', params: { attrs: ['data-name'] } },
    ],
  }).data;
}

const pack = {};
const chosen = {};
let raw = 0, small = 0;
for (const c of C) {
  const code = byA3[c.id] || (c.id === 'UNK' ? 'xk' : null);
  if (!code) continue;
  const f = path.join(dir, code + '.svg');
  if (!fs.existsSync(f)) continue;
  const svg = fs.readFileSync(f, 'utf8');
  raw += svg.length;
  const ref = render(svg);
  let best = null;
  for (const p of [0, 1, 2, 3]) {
    const s = opt(svg, p);
    const d = differs(ref, render(s));
    if (d.big < 0.003 && d.mean < 2) { best = { s, p }; break; }
  }
  if (!best) best = { s: opt(svg, 4), p: 4 };
  pack[c.id] = best.s;
  chosen[best.p] = (chosen[best.p] || 0) + 1;
  small += best.s.length;
}
fs.writeFileSync(out, JSON.stringify(pack));
console.log('flags', Object.keys(pack).length, 'raw KB', (raw / 1024).toFixed(0), 'packed KB', (small / 1024).toFixed(0), 'precision used', JSON.stringify(chosen));
