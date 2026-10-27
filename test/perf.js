// Frame-time check for the map: loads the page with local fonts and libraries, slows the CPU
// like a mid-range phone, and records every animation frame while the map animates, while
// you zoom and pan, and while the reveal lights up.
// Usage: node perf.js <page.html> <otm dir with raw/> <out dir> [throttle=4] [desk|phone]
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [page, otm, out, rateArg, only] = process.argv.slice(2);
const RATE = +(rateArg || 4);
fs.mkdirSync(out, { recursive: true });
const wrap = (body) => `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}</style></head><body>${body}</body></html>`;
const tmp = path.join(out, 'page.html');
fs.writeFileSync(tmp, wrap(fs.readFileSync(page, 'utf8')));
const npm = path.join(otm, 'raw/npm/node_modules');
const fontDir = path.join(otm, 'raw/fonts/node_modules/@fontsource');
const libs = { 'd3.min.js': path.join(npm, 'd3/dist/d3.min.js'), 'topojson.min.js': path.join(npm, 'topojson/dist/topojson.min.js') };
function fontCSS() {
  const faces = [];
  const add = (fam, dir, w, style) => {
    const f = `${dir}-latin-${w}-${style}.woff2`;
    if (fs.existsSync(path.join(fontDir, dir, 'files', f))) faces.push(`@font-face{font-family:"${fam}";font-weight:${w};font-style:${style};font-display:swap;src:url(https://fonts.gstatic.com/local/${dir}/${f}) format("woff2")}`);
  };
  for (const w of [400, 500, 600, 700, 800]) for (const st of ['normal', 'italic']) add('EB Garamond', 'eb-garamond', w, st);
  add('IM Fell English', 'im-fell-english', 400, 'normal'); add('IM Fell English', 'im-fell-english', 400, 'italic');
  add('IM Fell English SC', 'im-fell-english-sc', 400, 'normal');
  return faces.join('\n');
}
const stats = (xs) => {
  if (!xs.length) return 'no frames';
  const s = xs.slice().sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `frames ${xs.length}, median ${q(0.5).toFixed(1)} ms, p90 ${q(0.9).toFixed(1)} ms, worst ${s[s.length - 1].toFixed(0)} ms, over 50 ms: ${xs.filter((x) => x > 50).length}`;
};
(async () => {
  const browser = await chromium.launch();
  const runs = [['desk', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }]].filter(([n]) => !only || n === only);
  for (const [label, opts] of runs) {
    const ctx = await browser.newContext(Object.assign({ reducedMotion: 'no-preference' }, opts));
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
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
    await p.addInitScript(() => {
      window.__f = []; window.__long = [];
      let last = 0;
      const loop = (t) => { if (last) window.__f.push(t - last); last = t; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* no longtask api */ }
    });
    const t0 = Date.now();
    await p.goto('file://' + tmp);
    await p.waitForFunction(() => document.querySelector('#map svg, #map canvas'));
    const loadMs = Date.now() - t0;
    const window_ = async (name, fn) => {
      await p.evaluate(() => { window.__f.length = 0; window.__long.length = 0; });
      const t = Date.now();
      await fn();
      const fr = await p.evaluate(() => window.__f.slice());
      const lt = await p.evaluate(() => window.__long.slice());
      console.log(`[${label} x${RATE}] ${name} (${Date.now() - t} ms): ${stats(fr)} | long tasks ${lt.length}, total ${lt.reduce((a, b) => a + b, 0).toFixed(0)} ms`);
    };
    console.log(`[${label} x${RATE}] page ready in ${loadMs} ms`);
    await window_('intro: map appears and lights up', async () => { await p.waitForTimeout(2600); });
    await p.screenshot({ path: path.join(out, `${label}-intro.png`) });
    await p.click('#btn-start');
    await p.fill('#answer', 'Norway');
    await window_('lock in and reveal', async () => { await p.press('#answer', 'Enter'); await p.waitForTimeout(3200); });
    await p.screenshot({ path: path.join(out, `${label}-reveal.png`) });
    const box = await p.$eval('#map', (n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    await window_('zoom in with the wheel (8 steps)', async () => {
      await p.mouse.move(cx, cy);
      for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, -160); await p.waitForTimeout(60); }
      await p.waitForTimeout(500);
    });
    await window_('drag the map (40 moves)', async () => {
      await p.mouse.move(cx, cy); await p.mouse.down();
      for (let i = 0; i < 40; i++) { await p.mouse.move(cx - i * 6, cy - i * 3); await p.waitForTimeout(16); }
      await p.mouse.up(); await p.waitForTimeout(500);
    });
    await window_('zoom back out', async () => {
      for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(60); }
      await p.waitForTimeout(500);
    });
    await p.screenshot({ path: path.join(out, `${label}-after.png`) });
    if (errs.length) console.log('ERRORS', errs.join(' | '));
    await ctx.close();
  }
  await browser.close();
})();
