// Headless play-through of the typed-answer version.
// Loads the page with local copies of the CDN scripts and fonts, plays all seven prompts
// on a phone and on a desktop, checks the tricky paths (unknown name, typo, territory,
// time running out, reload mid-prompt), and saves screenshots.
// Usage: node run.js <page.html> <otm dir> <out dir> [only]
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [page, otm, out, only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const wrap = (body) => `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}</style></head><body>${body}</body></html>`;
const tmp = path.join(out, 'page.html');
fs.writeFileSync(tmp, wrap(fs.readFileSync(page, 'utf8')));
const npm = path.join(otm, 'raw/npm/node_modules');
const fontDir = path.join(otm, 'raw/fonts/node_modules/@fontsource');
const libs = {
  'd3.min.js': path.join(npm, 'd3/dist/d3.min.js'),
  'topojson.min.js': path.join(npm, 'topojson/dist/topojson.min.js'),
};
function fontCSS() {
  const faces = [];
  const add = (fam, dir, w) => {
    for (const sub of ['latin', 'latin-ext']) {
      const f = `${dir}-${sub}-${w}-normal.woff2`;
      if (fs.existsSync(path.join(fontDir, dir, 'files', f))) faces.push(`@font-face{font-family:"${fam}";font-weight:${w};font-display:swap;src:url(https://fonts.gstatic.com/local/${dir}/${f}) format("woff2")}`);
    }
  };
  for (const w of [600, 700, 800]) add('Bricolage Grotesque', 'bricolage-grotesque', w);
  for (const w of [400, 500, 600, 700, 800]) add('Hanken Grotesk', 'hanken-grotesk', w);
  return faces.join('\n');
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const log = (...a) => console.log(...a);
  async function open(opts, label) {
    const ctx = await browser.newContext(Object.assign({ reducedMotion: 'no-preference' }, opts));
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'null' }).catch(() => {});
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      for (const [name, file] of Object.entries(libs)) if (u.endsWith(name)) return route.fulfill({ path: file, contentType: 'application/javascript' });
      if (u.startsWith('https://fonts.googleapis.com/css2')) return route.fulfill({ body: fontCSS(), contentType: 'text/css', headers: { 'access-control-allow-origin': '*' } });
      const m = /fonts\.gstatic\.com\/local\/([^/]+)\/(.+)$/.exec(u);
      if (m) return route.fulfill({ path: path.join(fontDir, m[1], 'files', m[2]), contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' } });
      if (u.startsWith('file:') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue();
      return route.abort();
    });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(`[${label}] console: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}\n${e.stack}`));
    const t0 = Date.now();
    await p.goto('file://' + tmp);
    await p.waitForFunction(() => document.querySelector('#map .stack.base canvas'));
    log(`[${label}] ready in ${Date.now() - t0} ms`);
    await p.evaluate(() => document.fonts.ready);
    return { ctx, p };
  }
  const shot = (p, name) => p.screenshot({ path: path.join(out, name + '.png') });
  const text = (p, sel) => p.$eval(sel, (n) => n.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');

  async function typeSlowly(p, s) { await p.fill('#answer', ''); await p.type('#answer', s, { delay: 25 }); }

  async function playPrompt(p, label, step, i) {
    const q = await text(p, '#q-text');
    const clue = await text(p, '#q-clue');
    if (step.tries) {
      for (const t of step.tries) {
        await typeSlowly(p, t);
        await p.press('#answer', 'Enter');
        await p.waitForTimeout(250);
        log(`   tried "${t}" -> feedback: ${await text(p, '#feedback')} | flag: ${await text(p, '#flag-name')} ${await text(p, '#flag-sub')}`);
        if (step.shotTry) await shot(p, `${label}-${i + 1}-try`);
      }
    }
    if (step.timeout) {
      if (step.partial) await typeSlowly(p, step.partial);
      await p.waitForSelector('#v-reveal:not([hidden])', { timeout: 25000 });
    } else {
      await typeSlowly(p, step.type);
      await p.waitForTimeout(200);
      const preview = `${await text(p, '#flag-name')} ${await text(p, '#flag-sub')}`.trim();
      if (step.shotTyping) await shot(p, `${label}-${i + 1}-typing`);
      await p.press('#answer', 'Enter');
      await p.waitForSelector('#v-reveal:not([hidden])', { timeout: 5000 });
      log(`   typed "${step.type}" (preview: ${preview || 'none'})`);
    }
    await p.waitForTimeout(2600);
    const res = `${await text(p, '.res-name')} | ${await text(p, '.res-km')} | ${await text(p, '.tier')} | ${await text(p, '.res-share')}`;
    log(` ${i + 1}. ${q}\n   clue: ${clue}\n   -> ${res}\n   why: ${await text(p, '.why')}\n   notes: ${(await p.$$eval('#v-reveal .note', (ns) => ns.map((n) => n.textContent))).join(' / ')}\n   tops: ${(await p.$$eval('.tops li', (ls) => ls.map((l) => l.textContent.replace(/\s+/g, ' ').trim()))).join(' ; ')}`);
    if (step.shotReveal) await shot(p, `${label}-${i + 1}-reveal`);
    if (step.reloadAfter) return;
    await p.click('#v-reveal .btn.gold');
    await p.waitForTimeout(350);
  }

  const DAY1 = [
    { type: 'Norge', shotTyping: true, shotReveal: true },                                   // red in flag
    { type: 'Valparaiso', shotTyping: true, shotReveal: true },                              // city by the sea
    { tries: ['Narnia', 'Puerto Rico', 'Paris'], shotTry: true, type: 'Burkna Faso', shotReveal: true }, // landlocked Africa (typo on purpose)
    { type: 'Sapporo', shotTyping: true, shotReveal: true },                                 // city in Japan
    { type: 'Australia', shotReveal: false },                                                // capital not largest
    { type: 'Tromso', shotReveal: true },                                                    // Arctic
    { timeout: true, partial: 'Port', shotReveal: true },                                    // one neighbour; let time run out
  ];

  if (!only || only === 'phone') {
    const { ctx, p } = await open(PHONE, 'phone');
    await p.waitForTimeout(1600);
    await shot(p, 'phone-0-intro');
    await p.click('#btn-start');
    await p.waitForTimeout(300);
    await shot(p, 'phone-1-empty');
    for (let i = 0; i < DAY1.length; i++) {
      if (i === 4) {             // reload in the middle of a prompt: the clock keeps running, the prompt comes back
        await typeSlowly(p, 'Austr');
        await p.waitForTimeout(1500);
        await p.reload();
        await p.waitForSelector('#v-play:not([hidden])');
        log(`   reload mid-prompt -> clock ${await text(p, '#q-clock')}, prompt "${await text(p, '#q-text')}"`);
      }
      await playPrompt(p, 'phone', DAY1[i], i);
    }
    await p.waitForTimeout(900);
    await shot(p, 'phone-8-summary');
    await p.evaluate(() => { document.querySelector('#panel').scrollTop = 99999; });
    await p.waitForTimeout(200);
    await shot(p, 'phone-9-summary-bottom');
    await p.evaluate(() => { document.querySelector('#panel').scrollTop = 0; });
    log('summary:', await text(p, '.sum-total'), '|', await text(p, '.reached'));
    await p.click('.btn-row .btn.gold');
    await p.waitForTimeout(300);
    log('clipboard:', JSON.stringify(await p.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e.message))));
    await p.click('.btn-row .btn:not(.gold)');
    await p.waitForSelector('#sheet-image:not([hidden])', { timeout: 8000 }).catch(() => log('image sheet did not open'));
    await p.waitForTimeout(400);
    await shot(p, 'phone-10-image-sheet');
    const img = await p.$eval('#share-img', (n) => n.src).catch(() => '');
    if (img) {
      const b64 = await p.evaluate(async (src) => { const r = await fetch(src); const b = await r.blob(); return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(b); }); }, img);
      fs.writeFileSync(path.join(out, 'share-card.png'), Buffer.from(b64, 'base64'));
    }
    await p.keyboard.press('Escape');
    await p.click('.list li:nth-child(2)');
    await p.waitForTimeout(700);
    await shot(p, 'phone-11-review');
    await p.click('#v-reveal .btn.gold');
    await p.waitForTimeout(300);
    await p.click('#btn-help');
    await p.waitForTimeout(250);
    await shot(p, 'phone-12-help');
    await p.keyboard.press('Escape');
    await p.reload();
    await p.waitForTimeout(900);
    log('after reload phase:', await p.$eval('#app', (n) => n.dataset.phase));
    // phone with the keyboard taking the bottom of the screen
    await p.setViewportSize({ width: 390, height: 430 });
    await ctx.close();
  }

  if (!only || only === 'kbd') {
    // a short screen, like a phone with its keyboard open: the prompt, flag and box must all be visible
    const { ctx, p } = await open({ viewport: { width: 390, height: 420 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, 'kbd');
    await p.click('#btn-start');
    await typeSlowly(p, 'Japan');
    await p.waitForTimeout(400);
    const vis = await p.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { q: r('#q-text').top, flag: r('#flagcard').height, input: r('#answer').bottom, h: innerHeight }; });
    log('[kbd] layout', JSON.stringify(vis));
    await shot(p, 'kbd-1-typing');
    await ctx.close();
  }

  if (!only || only === 'se') {
    const { ctx, p } = await open({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, 'se');
    await p.waitForTimeout(1500);
    await shot(p, 'se-0-intro');
    await p.click('#btn-start');
    await typeSlowly(p, 'Denmark');
    await p.waitForTimeout(300);
    await shot(p, 'se-1-typing');
    await p.press('#answer', 'Enter');
    await p.waitForTimeout(3200);
    await shot(p, 'se-2-reveal');
    await ctx.close();
  }

  if (!only || only === 'desk') {
    const { ctx, p } = await open(DESK, 'desk');
    await p.waitForTimeout(1600);
    await shot(p, 'desk-0-intro');
    await p.click('#btn-start');
    // covers the three dragon outcomes: found (South Korea, Hakodate), near miss (Burkina Faso, Turkey), ignored
    const steps = [{ type: 'South Korea', shotTyping: true, shotReveal: true }, { type: 'Hobart', shotReveal: true }, { type: 'Burkina Faso', shotReveal: true },
      { type: 'Hakodate', shotReveal: true }, { type: 'Turkey', shotReveal: true }, { type: 'Murmansk' }, { type: 'Gambia', shotReveal: true }];
    for (let i = 0; i < steps.length; i++) await playPrompt(p, 'desk', steps[i], i);
    await p.waitForTimeout(900);
    await shot(p, 'desk-8-summary');
    await ctx.close();
  }

  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; } else console.log('no page errors');
})();
