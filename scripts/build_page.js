// Assemble the single-file page: template + CSS + data + engine + app.
// Usage: node build_page.js <otm dir> <out.html>
const fs = require('fs');
const path = require('path');
const [dir, out] = process.argv.slice(2);
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
const json = (p) => JSON.stringify(JSON.parse(read(p)));
// keep the page lean: countries without the fields the page never reads
const countries = JSON.parse(read('data/countries.json'));
for (const c of countries.countries) { delete c.q; delete c.lr; }
const dataTag = (id, body) => `<script type="application/json" id="${id}">${body.replace(/</g, '\\u003c')}</script>`;
const data = [
  dataTag('d-countries', JSON.stringify(countries)),
  dataTag('d-cities', json('data/cities.json')),
  dataTag('d-topo', json('data/world.topo.json')),
  dataTag('d-schedule', json('data/schedule.json')),
  dataTag('d-flags', json('data/flags.json')),
  dataTag('d-antique', json('data/antique.json')),
].join('\n');
let html = read('src/page.html');
const put = (key, val) => { const i = html.indexOf(key); if (i < 0) throw new Error('missing ' + key); html = html.slice(0, i) + val + html.slice(i + key.length); };
put('{{STYLE}}', read('src/style.css'));
put('{{DATA}}', data);
put('{{ENGINE}}', read('src/engine.js'));
put('{{APP}}', read('src/app.js'));
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB');
