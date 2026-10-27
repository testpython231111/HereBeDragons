const E = require('../src/engine.js');
const fs = require('fs');
E.init(JSON.parse(fs.readFileSync('data/countries.json')), JSON.parse(fs.readFileSync('data/cities.json')));
const bank = E.bank();
console.log('bank size', bank.length, 'country', bank.filter(p=>p.kind==='country').length, 'city', bank.filter(p=>p.kind==='city').length);
for (const p of bank) console.log(String(p.n).padStart(5), p.kind.padEnd(7), p.text);
const all = [];
for (const t of Object.keys(E.T)) for (const p of E.T[t].params) { const pr = E.makePrompt(t,p); const n = E.validSet(pr).length; if (!bank.find(b=>b.key===pr.key)) all.push(`${n} ${pr.text}`); }
console.log('\nREJECTED (size):', all.join(' | '));
