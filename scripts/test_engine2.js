const E = require('../src/engine.js');
const fs = require('fs');
E.init(JSON.parse(fs.readFileSync('data/countries.json')), JSON.parse(fs.readFileSync('data/cities.json')));
const show = (key) => { const p = E.parseKey(key); const v = E.validSet(p); console.log(`\n[${v.length}] ${p.text}:`, v.map(x => p.kind==='city' ? `${x.n} (${x.c})` : x.n).join(', ')); };
['capNotLargest:', 'cArctic:', 'cFarSouth:', 'capSameLetter:', 'nameLen:5', 'noBorders:', 'flagOnly:red+white', 'flagNo:red', 'cBig:10000000', 'southern:'].forEach(show);
// machine crowd check
const crowd = (key) => {
  const p = E.parseKey(key); const m = E.machine(p, 'd1s0');
  const top = [...m.counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([id,c]) => `${(E.entity(p,id)||E.CI[id]).n} ${(c/10).toFixed(1)}%`);
  const V = E.validSet(p); const sh = V.map(x => (m.counts.get(x.id)||0)/E.MACHINE).sort((a,b)=>a-b);
  console.log(`\nCROWD ${p.text}: magnets=${m.magnets.map(id => (E.entity(p,id)).n)}\n  top: ${top.join(' | ')}\n  min share ${(sh[0]*100).toFixed(3)}% median ${(sh[Math.floor(sh.length/2)]*100).toFixed(3)}%`);
  const jp = E.pickJackpot(p, 'd1s0', 1, 0);
  if (!jp) console.log('  jackpot: none (no dragon on this prompt)');
  else { const c = E.makeClue(p, jp); console.log('  jackpot:', E.entity(p, jp).n, ((m.counts.get(jp)||0)/10).toFixed(2)+'%', '| clue:', c.text, `(${c.n} fit)`); }
  for (const id of [V[0].id, m.magnets[0], top && [...m.counts.keys()][0]]) { const s = E.score(p, 'd1s0', id, null, null); console.log('  score', (E.entity(p,id)||{}).n, s.km, s.tier.name, (s.share*100).toFixed(2)+'%'); }
};
['flagHas:red', 'cCoastal:', 'landlocked:', 'cArctic:', 'oneNeighbour:', 'continent:Europe', 'cCapital:'].forEach(crowd);
