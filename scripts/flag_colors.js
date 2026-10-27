// Render every flag-icons 4x3 SVG without anti-aliasing and measure how much of the
// flag each colour family covers. Output: { cca2: { red: 0.31, white: 0.33, ... } }
// Usage: node flag_colors.js <flag-icons 4x3 dir> <resvg module dir> <out.json>
const fs = require('fs');
const path = require('path');
const [dir, resvgDir, out] = process.argv.slice(2);
const { Resvg } = require(resvgDir);

// Colour names are fuzzy, so hues near a boundary count for BOTH neighbours
// (Uganda's orange-ish red, Armenia's apricot, Kiribati's gold). Generous on purpose:
// a player should never lose points over a shade argument.
function families(r, g, b) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const v = max, s = max === 0 ? 0 : (max - min) / max;
  if (v < 0.22) return ['black'];
  if (s < 0.18) return [v > 0.72 ? 'white' : 'gray'];
  let h;
  const R = r / 255, G = g / 255, B = b / 255, d = max - min;
  if (max === R) h = 60 * (((G - B) / d) % 6);
  else if (max === G) h = 60 * ((B - R) / d + 2);
  else h = 60 * ((R - G) / d + 4);
  if (h < 0) h += 360;
  const warmDark = !(v > 0.62 && s > 0.45);
  if (h >= 335 || h < 10) return ['red'];
  if (h < 18) return warmDark ? ['red', 'brown'] : ['red', 'orange'];
  if (h < 36) return warmDark ? ['brown'] : ['orange'];
  if (h < 46) return warmDark ? ['brown', 'yellow'] : ['orange', 'yellow'];
  if (h < 66) return ['yellow'];
  if (h < 172 || (h < 182 && v <= 0.5)) return ['green'];
  if (h < 182) return ['green', 'blue'];
  if (h < 255) return ['blue'];
  if (h < 300) return ['purple'];
  return ['pink'];
}

const result = {};
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.svg')) continue;
  const code = file.replace('.svg', '');
  const svg = fs.readFileSync(path.join(dir, file), 'utf8');
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: 480 }, shapeRendering: 1, textRendering: 0, background: 'rgba(0,0,0,0)' }).render();
  const px = img.pixels;
  const counts = {}; let total = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    for (const f of families(px[i], px[i + 1], px[i + 2])) counts[f] = (counts[f] || 0) + 1;
    total++;
  }
  const cov = {};
  for (const k of Object.keys(counts)) cov[k] = +(counts[k] / total).toFixed(5);
  result[code] = cov;
}
fs.writeFileSync(out, JSON.stringify(result));
console.log('flags measured:', Object.keys(result).length);
