// Dragon clues: print the clue for every prompt of the first days, then statistics over the
// whole schedule (how many prompts get a dragon, how many places fit, which clue types win).
// Usage (from the otm folder): node scripts/test_clues.js [days to print] [schedule.json]
const E = require('../src/engine.js');
const fs = require('fs');
E.init(JSON.parse(fs.readFileSync('data/countries.json')), JSON.parse(fs.readFileSync('data/cities.json')));
const show = parseInt(process.argv[2] || '7', 10);
const sched = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3])) : E.buildSchedule(400);
const name = (pr, id) => { const e = E.entity(pr, id); return !e ? '?' : pr.kind === 'city' ? E.cityLabel(e) : e.n; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

let total = 0, dragons = 0, broad = 0, none = 0, pairs = 0;
const nHist = {}, fam = {}, pct = [];
for (const entry of sched) {
  const prompts = E.today(sched, entry.d);
  for (const pr of prompts) {
    total++;
    const V = E.validSet(pr).length;
    const c = pr.clue;
    if (entry.d <= show) {
      if (pr.slot === 0) console.log(`\nDay ${entry.d}`);
      const line = c ? `🐉 ${cap(c.text)}  →  ${name(pr, c.id)}   [${c.n} fit: ${c.ids.map((id) => name(pr, id).split(',')[0]).join(', ')}]`
        : V > E.CLUE_MAX_VALID ? `(no dragon: ${V.toLocaleString('en-US')} answers is too broad)` : '(no dragon: no workable clue)';
      console.log(`  ${String(pr.slot + 1)}. ${pr.text.padEnd(52)} ${String(V).padStart(5)}  ${line}`);
    }
    if (!c) { if (V > E.CLUE_MAX_VALID) broad++; else none++; continue; }
    dragons++;
    nHist[c.n] = (nHist[c.n] || 0) + 1;
    if (c.parts.length > 1) pairs++;
    for (const p of c.parts) { const f = p.key.split(/[:<>]/)[0].replace(/^[ns]-?\d.*/, 'lat'); fam[f] = (fam[f] || 0) + 1; }
    const m = E.machine(pr, pr.seed);
    pct.push((m.counts.get(c.id) || 0) / E.MACHINE);
    // the hidden place must fit its own clue and the prompt
    if (!E.fitsClue(pr, E.entity(pr, c.id)) || !E.isValid(pr, E.entity(pr, c.id))) throw new Error('clue does not fit its own place: ' + pr.key);
  }
}
pct.sort((a, b) => a - b);
const q = (f) => (pct[Math.floor(f * (pct.length - 1))] * 100).toFixed(1) + '%';
console.log(`\n${sched.length} days, ${total} prompts: ${dragons} with a dragon (${(100 * dragons / total).toFixed(1)}%), ${broad} too broad, ${none} with no workable clue`);
console.log('two-part clues:', pairs, `(${(100 * pairs / dragons).toFixed(0)}%)`);
console.log('places that fit the clue:', Object.entries(nHist).map(([n, k]) => `${n}:${k}`).join(' '));
console.log('clue parts used:', Object.entries(fam).sort((a, b) => b[1] - a[1]).map(([f, k]) => `${f} ${k}`).join(', '));
console.log(`Machine players who find the dragon: median ${q(0.5)}, 10th–90th percentile ${q(0.1)}–${q(0.9)}`);
