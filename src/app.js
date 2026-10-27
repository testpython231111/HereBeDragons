/* Here Be Dragons — page. Typed answers with a flag, then the old chart fills with everyone's picks. */
(function () {
  'use strict';
  const E = window.OTM;
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const readJSON = (id) => JSON.parse($(id).textContent);
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const NUM = new Intl.NumberFormat('en-US');
  const fmtKm = (n) => NUM.format(Math.round(n));

  E.init(readJSON('d-countries'), readJSON('d-cities'));
  const TOPO = readJSON('d-topo');
  const SCHEDULE = readJSON('d-schedule');
  const FLAGS = readJSON('d-flags');
  const SITE_URL = '';            // set this once the game has its own address; it goes in the share text
  const SECONDS = E.SECONDS;
  const HEAT_ALPHA = 0.045;          // how much one pick lights up the map

  // ------------------------------------------------------------------ sound: a ship's cabin, all of it synthesised
  // Nothing is downloaded. A quill, parchment, a wax seal, a lute and a ship's bell are made with Web Audio
  // when they are needed. Browsers only allow sound after a touch or a key, so the first one wakes it; the
  // bell button in the corner silences it, and the choice is remembered.
  const SFX = (() => {
    const KEY = 'hbd.sound';
    const AC = window.AudioContext || window.webkitAudioContext;
    let on = !!AC;
    try { if (localStorage.getItem(KEY) === '0') on = false; } catch (e) { /* storage blocked: sound stays on */ }
    let ac = null, out = null, verb = null, noiseBuf = null, armed = false;
    const strings = new Map();
    function wake() {
      if (!on || !AC || !armed) return null;
      if (!ac) {
        try { ac = new AC(); } catch (e) { on = false; return null; }
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
        out = ac.createGain(); out.gain.value = 0.75;
        out.connect(comp); comp.connect(ac.destination);
        // a small wooden room: a second of fading noise is the echo
        const len = Math.floor(ac.sampleRate * 1.1), ir = ac.createBuffer(2, len, ac.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
        verb = ac.createConvolver(); verb.buffer = ir;
        const wet = ac.createGain(); wet.gain.value = 0.2;
        verb.connect(wet); wet.connect(out);
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    // the first touch, click or key arms the sound (iPhones only count some of them, so all are heard)
    const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'];
    const arm = () => { armed = true; if (wake() && ac.state === 'running') for (const e of GESTURES) window.removeEventListener(e, arm, true); };
    for (const e of GESTURES) window.addEventListener(e, arm, true);

    // a gain into the mix with a share sent into the room; every node of a sound is let go when it ends
    function bus(wet, src, nodes) {
      const g = ac.createGain(); g.connect(out);
      const all = nodes.concat([g]);
      if (wet) { const s = ac.createGain(); s.gain.value = wet; g.connect(s); s.connect(verb); all.push(s); }
      src.onended = () => { for (const n of all) { try { n.disconnect(); } catch (e) { /* already gone */ } } };
      return g;
    }
    const env = (g, t0, peak, attack, dur) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); };
    function noise({ t = 0, dur = 0.1, type = 'bandpass', freq = 1000, to, q = 1, gain = 0.1, attack = 0.003, wet = 0.25, rate = 1 }) {
      const c = wake(); if (!c) return;
      const t0 = c.currentTime + t + 0.005;
      const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = rate;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t0);
      if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      const g = c.createGain(); env(g, t0, gain, attack, dur);
      src.connect(f); f.connect(g); g.connect(bus(wet, src, [src, f, g]));
      src.start(t0, Math.random() * 0.6); src.stop(t0 + dur + 0.05);
    }
    function tone({ t = 0, freq = 440, type = 'sine', dur = 0.3, gain = 0.1, attack = 0.005, to, wet = 0.25, lp }) {
      const c = wake(); if (!c) return;
      const t0 = c.currentTime + t + 0.005;
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      const g = c.createGain(); env(g, t0, gain, attack, dur);
      let node = o;
      const nodes = [o, g];
      if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; nodes.push(f); }
      node.connect(g); g.connect(bus(wet, o, nodes));
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
    // a plucked gut string (Karplus–Strong), computed once per note and kept
    function string(freq) {
      let b = strings.get(freq);
      if (b) return b;
      const sr = ac.sampleRate, n = Math.floor(sr * 1.7), N = Math.max(2, Math.round(sr / freq));
      b = ac.createBuffer(1, n, sr);
      const d = b.getChannelData(0), ring = new Float32Array(N);
      let s = 11;
      for (let i = 0; i < N; i++) { s = (s * 16807) % 2147483647; ring[i] = (s / 2147483647) * 2 - 1; }
      for (let pass = 0; pass < 2; pass++) for (let i = 1; i < N; i++) ring[i] = 0.5 * (ring[i] + ring[i - 1]);   // a thumb, not a pick
      const damp = 0.9985 - Math.min(0.004, freq / 250000);
      let peak = 1e-6;
      for (let i = 0, j = 0; i < n; i++) {
        const k = j + 1 === N ? 0 : j + 1, v = ring[j];
        d[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
        ring[j] = damp * 0.5 * (v + ring[k]);
        j = k;
      }
      for (let i = 0; i < n; i++) d[i] /= peak;            // every note as loud as the next
      strings.set(freq, b);
      return b;
    }
    function pluck(freq, t = 0, gain = 0.2, wet = 0.35) {
      const c = wake(); if (!c) return;
      const t0 = c.currentTime + t + 0.005;
      const src = c.createBufferSource(); src.buffer = string(freq);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.min(5200, freq * 6);
      const g = c.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      src.connect(f); f.connect(g); g.connect(bus(wet, src, [src, f, g]));
      src.start(t0); src.stop(t0 + 1.7);
    }
    // a ship's bell: a few bright partials that ring and fade at their own pace
    function bell(freq, t = 0, gain = 0.06) {
      [[1, 1.8], [2, 1.2], [2.76, 0.9], [5.4, 0.5], [8.93, 0.32]].forEach(([m, d], i) => tone({ t, freq: freq * m, dur: d * 1.5, gain: gain / (1 + i * 0.8), attack: 0.002, wet: 0.55 }));
    }
    const N = { A3: 220, D4: 293.66, E4: 329.63, Fs4: 369.99, G4: 392, A4: 440, B4: 493.88, D5: 587.33, Fs5: 739.99, A5: 880, F4: 349.23, F3: 174.61, D3: 146.83 };
    let lastQuill = 0;
    return {
      get on() { return on; },
      available: !!AC,
      set(v) {
        on = !!v && !!AC;
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* not remembered */ }
        if (on) { armed = true; wake(); } else if (ac && ac.state === 'running') ac.suspend();
      },
      // typing: the scratch of a quill, very soft
      quill() {
        const now = performance.now();
        if (now - lastQuill < 45) return;
        lastQuill = now;
        noise({ dur: 0.03 + Math.random() * 0.03, freq: 2800 + Math.random() * 2400, q: 1.3, gain: 0.22, wet: 0.06 });
      },
      // the name was recognised and its flag appears
      found() { pluck(N.D5, 0, 0.32); pluck(N.A5, 0.07, 0.22); },
      // lock in: a wax seal pressed down
      seal() {
        tone({ freq: 118, to: 50, dur: 0.24, gain: 0.32, attack: 0.004, wet: 0.2 });
        tone({ freq: 240, to: 150, dur: 0.09, gain: 0.12, attack: 0.002, wet: 0.2 });
        noise({ dur: 0.07, type: 'lowpass', freq: 1300, gain: 0.3, wet: 0.2 });
        noise({ t: 0.012, dur: 0.14, freq: 650, q: 3, gain: 0.25, wet: 0.35 });
      },
      // a name we do not know: two knocks on the table
      wrong() { for (const t of [0, 0.12]) { noise({ t, dur: 0.08, freq: 360, q: 4, gain: 0.55, wet: 0.15 }); tone({ t, freq: 190, to: 130, dur: 0.1, gain: 0.1, wet: 0.1 }); } },
      // the last seconds: a clock
      tick(odd) { noise({ dur: 0.035, freq: odd ? 2500 : 1700, q: 3, gain: 0.6, wet: 0.2 }); tone({ freq: odd ? 1250 : 850, dur: 0.04, gain: 0.03, wet: 0.1 }); },
      // the chart is unrolled and the ink spreads
      reveal() { noise({ dur: 0.85, type: 'lowpass', freq: 280, to: 2400, q: 0.7, gain: 0.06, attack: 0.22, wet: 0.45 }); bell(N.D4, 0.18, 0.045); },
      // the distance counting up, like a ratchet
      count(p) { noise({ dur: 0.02, freq: 2200 + p * 2600, q: 4, gain: 0.3, wet: 0.08 }); },
      // what the answer was worth: a few notes on a lute
      tier(key) {
        if (key === 'dragon') { this.dragon(); return; }
        const seq = { lost: [N.A3, N.F3], bus: [N.D4], clever: [N.A4, N.F4], boot: [N.D4, N.Fs4], compass: [N.D4, N.Fs4, N.A4], sail: [N.D4, N.Fs4, N.A4, N.D5] }[key] || [N.D4];
        seq.forEach((f, i) => pluck(f, i * (key === 'lost' ? 0.16 : 0.09), key === 'lost' ? 0.36 : 0.45));
        if (key === 'sail') bell(N.D5, 0.34, 0.035);
      },
      // Off the Map: something stirs below, a horn answers, the bell rings
      dragon() {
        noise({ dur: 1.15, freq: 540, to: 170, q: 2.4, gain: 0.2, attack: 0.09, wet: 0.5, rate: 0.5 });
        tone({ freq: 73.4, type: 'sawtooth', dur: 1.05, gain: 0.07, attack: 0.12, lp: 380, wet: 0.4 });
        tone({ t: 0.32, freq: N.D3, type: 'sawtooth', dur: 0.95, gain: 0.08, attack: 0.09, lp: 900, wet: 0.5 });
        tone({ t: 0.32, freq: N.A3, type: 'sawtooth', dur: 0.95, gain: 0.06, attack: 0.09, lp: 900, wet: 0.5 });
        [N.D4, N.Fs4, N.A4, N.D5, N.Fs5].forEach((f, i) => pluck(f, 0.5 + i * 0.075, 0.36));
        bell(N.D5, 0.95, 0.08);
      },
      // a page of the logbook turned
      paper() { [0, 0.045, 0.1, 0.16].forEach((t, i) => noise({ t, dur: 0.07 + Math.random() * 0.05, freq: 1400 + Math.random() * 1600, q: 0.9, gain: 0.26 - i * 0.04, wet: 0.2 })); },
      // a tap on the chart or a button
      tap() { noise({ dur: 0.024, type: 'highpass', freq: 2000, gain: 0.2, wet: 0.1 }); tone({ freq: 1250, dur: 0.05, gain: 0.035, wet: 0.05 }); },
      // the end of the day's voyage
      fanfare() { [N.D4, N.Fs4, N.A4, N.D5, N.Fs5, N.A5].forEach((f, i) => pluck(f, i * 0.09, 0.36)); bell(N.D5, 0.62, 0.07); },
    };
  })();

  // ------------------------------------------------------------------ flags
  // Flags are drawn as inline SVG: no image loading, so a strict preview or a blocked blob: URL
  // can never leave the flag card empty. (The share image still needs a URL: a data: URL.)
  const flagTpl = {};
  let flagSeq = 0;
  function flagSVG(cid, label) {
    if (!cid || !FLAGS[cid]) return null;
    if (!flagTpl[cid]) {
      const doc = new DOMParser().parseFromString(FLAGS[cid], 'image/svg+xml');
      const el = doc.documentElement;
      flagTpl[cid] = el && el.nodeName.toLowerCase() === 'svg' ? el : null;
    }
    if (!flagTpl[cid]) return null;
    const svg = document.importNode(flagTpl[cid], true);
    // each copy gets its own ids, so two flags on one page never borrow each other's clip paths
    const pre = 'f' + (++flagSeq) + '-';
    svg.querySelectorAll('[id]').forEach((n) => { n.id = pre + n.id; });
    svg.querySelectorAll('*').forEach((n) => {
      for (const a of ['clip-path', 'fill', 'mask', 'stroke', 'filter']) {      // only url(#id) references, never colours
        const v = n.getAttribute(a);
        if (v && v.includes('url(#')) n.setAttribute(a, v.replace(/url\(#/g, 'url(#' + pre));
      }
      for (const a of ['href', 'xlink:href']) {
        const v = n.getAttribute(a);
        if (v && v.startsWith('#')) n.setAttribute(a, '#' + pre + v.slice(1));
      }
      const st = n.getAttribute('style');
      if (st && st.includes('url(#')) n.setAttribute('style', st.replace(/url\(#/g, 'url(#' + pre));
    });
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    svg.classList.add('flag');
    if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
    return svg;
  }
  const flagData = {};
  function flagURL(cid) {
    if (!cid || !FLAGS[cid]) return null;
    if (!flagData[cid]) flagData[cid] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(FLAGS[cid]);
    return flagData[cid];
  }
  const countryOf = (ent) => (!ent ? null : ent.c ? ent.c : ent.id);
  function flagBox(cid, cls) {
    const box = make('span', cls);
    const svg = flagSVG(cid);
    if (svg) box.appendChild(svg); else box.textContent = '?';
    return box;
  }
  // the dragon seal in red wax, pressed on a flag (stamp: animate it in)
  function waxSeal(stamp) {
    const w = make('span', 'wax' + (stamp ? ' stamp' : ''));
    w.setAttribute('aria-hidden', 'true');
    w.innerHTML = '<svg viewBox="-56 -56 112 112"><g>' + document.querySelector('.logo g').innerHTML + '</g></svg>';
    return w;
  }
  function territoryNote(ent) {
    if (!ent.par || ent.par === 'disputed') return 'a disputed territory, not a country. Try another.';
    const k = E.SOV.find((x) => x.n === ent.par || (x.al || []).includes(ent.par) || (x.nm || []).includes(ent.par));
    return `part of ${k ? E.theName(k.id) : ent.par}, not a country of its own.`;
  }
  const entityOf = (pr, id) => (id ? E.entity(pr, id) || E.CI[id] || E.CITYI[id] : null);
  const labelOf = (pr, ent) => (!ent ? '' : pr.kind === 'city' && ent.c ? `${ent.n}, ${E.CI[ent.c] ? E.CI[ent.c].n : ''}` : ent.n);

  // ------------------------------------------------------------------ which day
  const todayNo = Math.max(1, E.dayNo());
  const hashDay = /^#day-(\d+)$/.exec(location.hash || '');
  const dayNo = hashDay ? Math.max(1, Math.min(todayNo, parseInt(hashDay[1], 10))) : todayNo;
  const isArchive = dayNo !== todayNo;
  const prompts = E.today(SCHEDULE, dayNo);
  const N = prompts.length;
  const shortDate = E.dayDate(dayNo).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  // ------------------------------------------------------------------ storage (this browser only)
  const store = {
    get(k) { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: keep going */ } },
  };
  const DAY_KEY = 'otm.v2.day.' + dayNo, STATS_KEY = 'otm.v2.stats';
  let record = null;
  const save = () => store.set(DAY_KEY, record);

  const S = { phase: 'intro', slot: 0, raf: 0, shown: null, reviewing: null, locking: false };

  // ------------------------------------------------------------------ the shared crowd (real players on claude.ai)
  const DB = { db: null, uid: null, docs: [], chain: Promise.resolve(), readOnly: false, players: 0 };
  let realBySlot = prompts.map(() => ({ counts: new Map(), total: 0, pins: [] }));
  const DAYKEY = 'v2d' + dayNo;

  function pointFor(pr, ent) { return pr.kind === 'city' ? [ent.lon, ent.lat] : ent.lab; }

  function aggregateReal() {
    realBySlot = prompts.map(() => ({ counts: new Map(), total: 0, pins: [] }));
    const players = new Set();
    for (const doc of DB.docs) {
      if (doc.id === DB.uid) continue;
      const day = doc.data && doc.data.days && doc.data.days[DAYKEY];
      if (!day || !Array.isArray(day.p)) continue;
      players.add(doc.id);
      day.p.forEach((p, slot) => {
        if (!p || slot >= N || !p.i || p.k !== prompts[slot].key) return;
        const pr = prompts[slot], ent = E.entity(pr, p.i);
        if (!ent) return;
        const r = realBySlot[slot];
        r.counts.set(p.i, (r.counts.get(p.i) || 0) + 1);
        r.total += 1;
        r.pins.push({ id: p.i, ll: E.tapPoint(pr, ent, E.rng(doc.id + '|' + slot)), real: true });
      });
    }
    DB.players = players.size;
  }

  async function initShared() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db) return;
      DB.db = db;
      DB.uid = user ? await user.id() : null;
      if (!DB.uid) DB.readOnly = true;
      db.collection('plays').onSnapshot((snap) => {
        DB.docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
        aggregateReal();
        refreshCrowdLines();
      }, () => { /* keep the Machine alone */ });
    } catch (e) { /* shared crowd unavailable */ }
  }

  function writeShared() {
    if (!DB.db || !DB.uid || DB.readOnly) return;
    const mine = DB.docs.find((d) => d.id === DB.uid);
    const days = Object.assign({}, (mine && mine.data && mine.data.days) || {});
    days[DAYKEY] = {
      p: record.answers.map((a) => (a.id ? { k: prompts[a.slot].key, i: a.id } : null)),
      km: record.answers.reduce((s, a) => s + a.km, 0),
    };
    for (const k of Object.keys(days)) { const m = /(\d+)$/.exec(k); if (m && +m[1] < dayNo - 30) delete days[k]; }
    DB.chain = DB.chain.then(() => DB.db.doc('plays/' + DB.uid).set({ v: 2, days })).catch(() => { DB.readOnly = true; });
  }

  // ------------------------------------------------------------------ map (no input; it only shows results)
  const map = makeMap($('map'));

  function makeMap(host) {
    const api = {};
    const ANT = readJSON('d-antique');
    // The chart is a picture in a canvas, and the pictures are stacked. While you zoom or drag they only
    // slide and scale, which the graphics chip does almost for free:
    //   build – where the next picture is drawn, a few layers per frame, hidden under the others
    //   base  – the whole world, drawn once and kept; it fills any edge a gesture uncovers
    //   front – the view you stopped at, swapped in sharp once it is drawn
    //   heat  – everyone's picks: once for the whole world (under the front) and once for the sharp view
    // Flags and labels stay in a light svg on top and follow every frame.
    function layer(cls) {
      const box = document.createElement('div');
      box.className = 'stack ' + cls;
      const c = document.createElement('canvas');
      box.appendChild(c);
      host.appendChild(box);
      return { box, c, R: null, key: '' };
    }
    const build = layer('build'), base = layer('base'), heatB = layer('heat'), front = layer('front'), heatL = layer('heat');
    for (const Ly of [heatB, heatL]) { Ly.c.className = 'heat'; Ly.g = Ly.c.getContext('2d', { willReadFrequently: true }); }
    const over = d3.select(host).append('svg').attr('class', 'over').attr('role', 'img').attr('aria-label', 'World map of everyone\'s answers');
    const gOver = over.append('g');
    const gRoute = gOver.append('g');
    const gMarks = gOver.append('g');
    const gLabels = over.append('g');            // labels live in screen space so they never scale
    const gPickShape = gOver.insert('g', ':first-child').attr('class', 'pick-shape');   // a tapped country's outline, under the flags
    const gPick = over.append('g').attr('class', 'pick');                                // and its name, on top
    const projection = d3.geoNaturalEarth1();
    const fc = topojson.feature(TOPO, TOPO.objects.countries);
    const lakes = topojson.feature(TOPO, TOPO.objects.lakes);
    const rivers = TOPO.objects.rivers ? topojson.feature(TOPO, TOPO.objects.rivers) : { features: [] };
    const coastMesh = topojson.mesh(TOPO, TOPO.objects.countries, (a, b) => a === b);
    const borderMesh = topojson.mesh(TOPO, TOPO.objects.countries, (a, b) => a !== b);
    let W = 0, H = 0, M = 0, dpr = 1, hdpr = 1, T = d3.zoomIdentity, mine = null, routeLL = null;
    let marks = [], labels = [], heatPins = [], heatOn = false, moving = false, pick = null, picker = null;
    let job = null, rafJob = 0, rafWant = 0, rafOver = 0, settle = 0, perFrame = 1, quick = 0, lastFrame = 0;

    // ------------- geometry, projected once in reference units; every view is an affine transform of it.
    // Every line is ranked once (Douglas–Peucker): each point learns how far off the line it is. A zoom level
    // then keeps only the points that matter at its scale, and only for the shapes in view.
    const REF = 2000;
    const refProj = d3.geoNaturalEarth1().scale(REF).translate([0, 0]);
    function record(geo) {            // -> rings of flat [x0, y0, x1, y1, ...] and whether each is closed
      const rings = [];
      let cur = null;
      d3.geoPath(refProj, {
        moveTo(x, y) { cur = { pts: [x, y], closed: false }; rings.push(cur); },
        lineTo(x, y) { cur.pts.push(x, y); },
        closePath() { cur.closed = true; },
        arc() {},
      })(geo);
      return rings;
    }
    const polysOf = (f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []);
    const SRC = {
      countries: fc.features.map((f) => ({ id: f.id, c: ANT.colours[f.id] || 0, polys: polysOf(f).map((poly) => record({ type: 'Polygon', coordinates: poly })) })),
      coast: record(coastMesh),
      borders: record(borderMesh),
      lakes: lakes.features.map((f) => ({ n: f.properties.n || '', rings: record(f) })),
      // rivers by Natural Earth's rank: 1 the great rivers of the world, 6 the regional ones
      rivers: [1, 2, 3, 4, 5, 6].map((s) => rivers.features.filter((f) => Math.max(1, Math.min(6, f.properties.s || 6)) === s).flatMap((f) => record(f))),
    };
    const bboxOf = (rings) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const r of rings) for (let i = 0; i < r.pts.length; i += 2) { const x = r.pts[i], y = r.pts[i + 1]; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } return b; };
    for (const c of SRC.countries) c.b = bboxOf(c.polys.flat());
    for (const l of SRC.lakes) l.b = bboxOf(l.rings);
    for (const r of SRC.coast) { const n = r.pts.length; r.loop = n > 6 && r.pts[0] === r.pts[n - 2] && r.pts[1] === r.pts[n - 1]; }
    const spanOf = (r) => { if (r.span === undefined) { const b = bboxOf([r]); r.span = Math.max(b[2] - b[0], b[3] - b[1]); } return r.span; };
    function rank(r) {                // for every point, the tolerance below which it is kept
      if (r.imp) return r.imp;
      const pts = r.pts, n = pts.length / 2, imp = new Float32Array(n);
      imp[0] = imp[n - 1] = Infinity;
      if (n > 2) {
        const st = new Int32Array(2 * n + 4), pst = new Float32Array(n + 2);
        let sp = 0, pp = 0;
        st[sp++] = 0; st[sp++] = n - 1; pst[pp++] = Infinity;
        while (sp) {
          const b = st[--sp], a = st[--sp], parent = pst[--pp];
          if (b - a < 2) continue;
          const ax = pts[2 * a], ay = pts[2 * a + 1], dx = pts[2 * b] - ax, dy = pts[2 * b + 1] - ay, L2 = dx * dx + dy * dy;
          let best = -1, bi = a + 1;
          for (let i = a + 1; i < b; i++) {
            const px = pts[2 * i] - ax, py = pts[2 * i + 1] - ay;
            let d;
            if (L2 === 0) d = px * px + py * py;
            else { const u = Math.max(0, Math.min(1, (px * dx + py * dy) / L2)); const qx = px - u * dx, qy = py - u * dy; d = qx * qx + qy * qy; }
            if (d > best) { best = d; bi = i; }
          }
          const v = Math.min(Math.sqrt(best), parent);   // never more important than the point that split it off
          imp[bi] = v;
          st[sp++] = a; st[sp++] = bi; pst[pp++] = v;
          st[sp++] = bi; st[sp++] = b; pst[pp++] = v;
        }
      }
      r.imp = imp;
      return imp;
    }
    function addRing(path, r, t, close) {
      const imp = rank(r), pts = r.pts, n = imp.length;
      let first = true;
      for (let i = 0; i < n; i++) {
        if (imp[i] <= t) continue;
        if (first) { path.moveTo(pts[2 * i], pts[2 * i + 1]); first = false; } else path.lineTo(pts[2 * i], pts[2 * i + 1]);
      }
      if (close) path.closePath();
    }
    // lines cut into pieces by area, so a zoomed view strokes only what it shows
    function cellsOf(rings, cell) {
      const cells = new Map();
      for (const r of rings) {
        const key = Math.floor(r.pts[0] / cell) + ',' + Math.floor(r.pts[1] / cell);
        let c = cells.get(key);
        if (!c) { c = { rings: [] }; cells.set(key, c); }
        c.rings.push(r);
      }
      return [...cells.values()].map((c) => ({ rings: c.rings, b: bboxOf(c.rings) }));
    }
    const CELLS = { coast: cellsOf(SRC.coast, 260), borders: cellsOf(SRC.borders, 260) };
    for (let s = 1; s <= 6; s++) CELLS['r' + s] = cellsOf(SRC.rivers[s - 1], 260);
    const LOD = new Map();
    function lod(tol) {                     // one zoom level: its paths are made as views need them, and kept
      const key = Math.max(-6, Math.min(6, Math.round(Math.log2(tol))));
      let L = LOD.get(key);
      if (!L) {
        L = { t: Math.pow(2, key), country: new Map(), coast: new Map(), rings: new Map(), borders: new Map(), lakes: null };
        for (let s = 1; s <= 6; s++) L['r' + s] = new Map();
        LOD.set(key, L);
      }
      return L;
    }
    function countryPath(L, c) {
      let p = L.country.get(c.id);
      if (!p) {
        p = new Path2D();
        for (const poly of c.polys) for (const r of poly) if (spanOf(r) >= L.t * 1.2) addRing(p, r, L.t, r.closed);   // specks under a pixel are skipped
        L.country.set(c.id, p);
      }
      return p;
    }
    function cellPath(L, kind, i) {
      let p = L[kind].get(i);
      if (!p) {
        p = new Path2D();
        if (kind === 'rings') {          // water lines: coarser, and none round specks under a pixel
          for (const r of CELLS.coast[i].rings) if (!r.loop || spanOf(r) >= L.t * 1.2) addRing(p, r, L.t * 2, r.loop);
        } else for (const r of CELLS[kind][i].rings) addRing(p, r, L.t, false);
        L[kind].set(i, p);
      }
      return p;
    }
    function lakesPath(L) {
      // lakes smaller than about three pixels are left out: they would only be dots of outline
      if (!L.lakes) { L.lakes = new Path2D(); for (const l of SRC.lakes) for (const r of l.rings) if (spanOf(r) >= L.t * 5) addRing(L.lakes, r, L.t, true); }
      return L.lakes;
    }
    const G = { sphere: new Path2D(), grat: new Path2D(), eq: new Path2D(), tropics: new Path2D(), polar: new Path2D() };
    const par = (lat) => ({ type: 'LineString', coordinates: d3.range(-180, 180.01, 2.5).map((lon) => [lon, lat]) });
    for (const [p, geo] of [[G.sphere, { type: 'Sphere' }], [G.grat, d3.geoGraticule().step([15, 15])()], [G.eq, par(0)],
      [G.tropics, { type: 'MultiLineString', coordinates: [par(23.436).coordinates, par(-23.436).coordinates] }],
      [G.polar, { type: 'MultiLineString', coordinates: [par(66.563).coordinates, par(-66.563).coordinates] }]]) {
      for (const r of record(geo)) { p.moveTo(r.pts[0], r.pts[1]); for (let i = 2; i < r.pts.length; i += 2) p.lineTo(r.pts[i], r.pts[i + 1]); if (r.closed) p.closePath(); }
    }

    // ------------- colours from the stylesheet
    let C = null;
    function colours() {
      const cs = getComputedStyle(document.documentElement);
      const v = (n, f) => cs.getPropertyValue(n).trim() || f;
      C = {
        sea: v('--sea', '#c5cdb2'), ink: v('--ink', '#3a2a1b'), gold: v('--gold', '#9c3a24'), ochre: v('--ochre', '#c99a3e'),
        wash: [0, 1, 2, 3, 4].map((i) => v('--wash-' + i, ['#c8705c', '#d2a443', '#7fa35c', '#6f97b8', '#a07aa6'][i])),
        // the pale washes inside the borders: rose, straw, olive, grey-blue and mauve at one lightness, spaced
        // evenly round the paper's tint, so two neighbours read apart even where their bands are thin
        // (closest pair ΔE 7.5; plain paper mixed with each wash left blue and mauve at 3.5)
        fill: ['#f8d7bb', '#f3dfb8', '#dfdfb9', '#dedfd7', '#f2d7cf'],
        red: '#a8402a', green: '#4f7a4a', outside: '#ecdfbf', mineFill: '#f0cfa6', river: v('--river', '#46646d'),
        display: v('--f-display', '"IM Fell English", Georgia, serif'), sc: v('--f-sc', '"IM Fell English SC", Georgia, serif'),
      };
    }

    // ------------- the engraver's dots: one tile, drawn once per pixel density
    let stip = null;
    function stippleTile() {
      if (stip && stip.dpr === dpr) return stip.tile;
      let a = 11 >>> 0;
      const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const size = 140, tile = document.createElement('canvas');
      tile.width = tile.height = Math.round(size * dpr);
      const g = tile.getContext('2d');
      g.scale(dpr, dpr);
      g.fillStyle = C.ink;
      for (let i = 0; i < 720; i++) {
        const x = rnd() * size, y = rnd() * size, r = 0.34 + rnd() * 0.34, op = 0.22 + rnd() * 0.33;
        g.globalAlpha = op;
        for (const dx of [0, -size, size]) for (const dy of [0, -size, size]) {
          if (x + dx < -2 || x + dx > size + 2 || y + dy < -2 || y + dy > size + 2) continue;
          g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill();
        }
      }
      stip = { dpr, tile };
      return tile;
    }

    // ------------- the drawings (roses, ships, beasts, the title scroll) as pictures, made once per size
    const BOX = {};
    (function measure() {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('style', 'position:absolute;left:-9999px;top:0;width:10px;height:10px;visibility:hidden');
      document.body.appendChild(s);
      for (const [k, markup] of Object.entries(ANT.svg)) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.innerHTML = markup;
        s.appendChild(g);
        const bb = g.getBBox();
        BOX[k] = [bb.x - 4, bb.y - 4, bb.width + 8, bb.height + 8];
      }
      s.remove();
    })();
    const sprites = new Map();
    let fontsOk = false;
    function sprite(kind, px) {          // px = device pixels per drawing unit
      const q = Math.pow(1.2, Math.round(Math.log(Math.max(0.05, px)) / Math.log(1.2)));
      const key = kind + '|' + q.toFixed(4);
      let s = sprites.get(key);
      if (!s) {
        const [x0, y0, w, h] = BOX[kind];
        const img = new Image();
        s = { img: null, ready: false, failed: false, q, kind };
        sprites.set(key, s);
        const pw = Math.ceil(w * q), ph = Math.ceil(h * q);
        const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="${x0} ${y0} ${w} ${h}">${ANT.svg[kind]}</svg>`;
        // once decoded, the drawing is painted into a bitmap of its own, so every later use only copies pixels
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = pw; c.height = ph;
          c.getContext('2d').drawImage(img, 0, 0, pw, ph);
          s.img = c; s.ready = true;
          invalidate();
        };
        img.onerror = () => { s.failed = true; };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
      }
      return s;
    }
    function drawSprite(g, kind, x, y, k, flip, alpha) {
      let s = sprite(kind, k * dpr);
      if (!s.ready) {                    // not ready yet: the nearest finished size of the same drawing will do
        let best = null;
        for (const o of sprites.values()) if (o.ready && o.kind === kind && (!best || Math.abs(Math.log(o.q / s.q)) < Math.abs(Math.log(best.q / s.q)))) best = o;
        s = best;
      }
      if (!s) return;
      const [x0, y0, w, h] = BOX[kind];
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y);
      if (flip) g.scale(-1, 1);
      g.drawImage(s.img, x0 * k, y0 * k, w * k, h * k);
      g.restore();
    }
    // text with letter-spacing, or stretched to a length, drawn letter by letter
    function spaced(g, str, x, y, size, spacing, len) {
      const chars = [...str];
      const widths = chars.map((ch) => g.measureText(ch).width);
      const natural = widths.reduce((a, b) => a + b, 0);
      const gap = len && chars.length > 1 ? (len - natural) / (chars.length - 1) : spacing;
      const total = natural + gap * (chars.length - 1);
      let cx = x - total / 2;
      chars.forEach((ch, i) => { g.fillText(ch, cx, y); cx += widths[i] + gap; });
      return total;
    }
    function spacedStroke(g, str, x, y, spacing, len) {
      const chars = [...str];
      const widths = chars.map((ch) => g.measureText(ch).width);
      const natural = widths.reduce((a, b) => a + b, 0);
      const gap = len && chars.length > 1 ? (len - natural) / (chars.length - 1) : spacing;
      let cx = x - (natural + gap * (chars.length - 1)) / 2;
      chars.forEach((ch, i) => { g.strokeText(ch, cx, y); cx += widths[i] + gap; });
    }

    // ------------- drawing the chart for one view, a layer at a time (each yield lets a frame through)
    const RINGS = [[10.4, 0.14], [7.8, 0.27], [5.2, 0.42], [2.6, 0.6]];
    const LAKE_RINGS = [[6.2, 0.2], [4.2, 0.32], [2.2, 0.5]];         // finer water lines inside large lakes
    const RIVER_W = [1.5, 1.25, 1.05, 0.9, 0.8, 0.7];                  // river width in px by rank, before zoom
    const fadeOf = (k) => Math.max(0, Math.min(1, 1 - (k - 1.1) * 2.5));    // the drawings fade as you zoom in
    function* paint(g, V, j) {
      const k = V.k, bs = projection.scale() / REF, [bx, by] = projection.translate();
      const sc = k * bs;                                     // css px per reference unit
      const viewMatrix = () => g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (M + V.x + k * bx), dpr * (M + V.y + k * by));
      const screen = () => g.setTransform(dpr, 0, 0, dpr, dpr * M, dpr * M);
      const lw = (px) => px / sc;                            // a line px wide on screen, in reference units
      // what is in view, in reference units (with room for the widest water line)
      const pad = 18 / sc;
      const vx0 = ((-M - V.x) / k - bx) / bs - pad, vy0 = ((-M - V.y) / k - by) / bs - pad;
      const vx1 = ((W + M - V.x) / k - bx) / bs + pad, vy1 = ((H + M - V.y) / k - by) / bs + pad;
      const seen = (b) => !(b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1);
      const L = lod(0.55 / sc);                              // simplified to about half a screen pixel
      const coastI = [], borderI = [];
      CELLS.coast.forEach((c, i) => { if (seen(c.b)) coastI.push(i); });
      CELLS.borders.forEach((c, i) => { if (seen(c.b)) borderI.push(i); });
      const lands = SRC.countries.filter((c) => seen(c.b));
      const fade = fadeOf(k), f = projection.scale() / ANT.scale;
      const P = (ll) => { const q = projection(ll); return [V.x + k * q[0], V.y + k * q[1]]; };
      // the drawings this view needs are asked for now, so they are ready by the last step
      const orn = fade > 0 ? ANT.ornaments.map((o) => { const [x, y] = P(o.ll); return { o, x, y, s: (o.k === 'rose' ? o.r / 100 : o.size / ANT.unit[o.k]) * f * k }; }) : [];
      const bottom = projection([0, -90])[1], room = H - 10 - bottom;
      let scroll = null;
      if (fade > 0 && room > 70 && W > 500) {
        const ks = Math.min(1, (room - 16) / 128, (W - 80) / 400) * k;
        scroll = { ks, cx: V.x + k * (W / 2), cy: V.y + k * (bottom + room / 2) };
      }
      const need = orn.map((d) => sprite(d.o.k, d.s * dpr));
      if (scroll) need.push(sprite('cartouche', scroll.ks * dpr), sprite('seal', 0.34 * scroll.ks * dpr));

      // sea, the engraver's dots (they travel with the chart), the graticule and the winds
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.fillStyle = C.sea;
      g.fillRect(0, 0, g.canvas.width, g.canvas.height);
      screen();
      const pat = g.createPattern(stippleTile(), 'repeat');
      const ox = ((V.x % 140) + 140) % 140, oy = ((V.y % 140) + 140) % 140;
      if (pat.setTransform) pat.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, ox, oy]));
      g.fillStyle = pat;
      g.fillRect(-M, -M, W + 2 * M, H + 2 * M);
      viewMatrix();
      g.lineCap = 'butt'; g.lineJoin = 'round';
      g.strokeStyle = C.ink; g.globalAlpha = 0.28; g.lineWidth = lw(0.5); g.setLineDash([lw(1), lw(2.6)]);
      g.stroke(G.grat);
      g.setLineDash([]);
      screen();
      for (const o of ANT.ornaments) {                       // the 32 winds from each compass rose run under the land
        if (o.k !== 'rose') continue;
        const [x, y] = P(o.ll), len = 3 * Math.max(W, H) * k;
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2, w = i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : 2;
          g.strokeStyle = w === 0 ? C.ink : w === 1 ? C.green : C.red;
          g.globalAlpha = w === 0 ? 0.34 : 0.3; g.lineWidth = w === 0 ? 0.6 : 0.5;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
        }
      }
      yield;

      // the engraved water lines along every coast: wide strokes from the outside in, each cut back with sea
      viewMatrix();
      g.lineJoin = 'bevel';
      const ringLines = coastI.map((i) => cellPath(L, 'rings', i));
      for (const [r, op] of RINGS) {
        g.strokeStyle = C.ink; g.globalAlpha = op; g.lineWidth = lw(2 * r);
        for (const p of ringLines) g.stroke(p);
        g.strokeStyle = C.sea; g.globalAlpha = 1; g.lineWidth = lw(2 * r - 1.3);
        for (const p of ringLines) g.stroke(p);
        yield;
      }

      // the lands: a warm wash, and a band of the country's colour just inside its border. Countries of one
      // colour never touch, so zoomed out each colour is one shape clipped to itself: five layers, not 239
      g.globalAlpha = 1;
      g.lineWidth = lw(6.4);
      const band = (p, fill, edge) => { g.fillStyle = fill; g.fill(p); g.save(); g.clip(p); g.globalAlpha = 0.86; g.strokeStyle = edge; g.stroke(p); g.restore(); g.globalAlpha = 1; };
      if (lands.length > 24) {
        for (let c = 0; c < 5; c++) {
          const p = new Path2D();
          for (const d of lands) if (d.c === c) p.addPath(countryPath(L, d));
          band(p, C.fill[c], C.wash[c]);
          yield;
        }
      } else {
        for (let i = 0; i < lands.length; i++) { const c = lands[i]; band(countryPath(L, c), C.fill[c.c], C.wash[c.c]); if (i % 6 === 5) yield; }
      }
      const mineC = mine ? lands.find((c) => c.id === mine) : null;
      if (mineC) band(countryPath(L, mineC), C.mineFill, C.gold);
      yield;

      // rivers: the great ones on the whole map, more of them as you come closer; a wide one is drawn as a
      // channel of water between two ink lines
      const ppd = sc * REF * Math.PI / 180;                          // screen px per degree
      const maxRank = Math.max(1, Math.min(6, Math.floor(1 + 1.2 * Math.log2(ppd / 1.5))));
      const grow = Math.max(0.75, Math.min(1.6, 1 + 0.18 * Math.log2(ppd / 3)));
      g.lineJoin = 'round'; g.lineCap = 'round';
      for (let s = maxRank; s >= 1; s--) {                           // the small ones first, the great rivers on top
        const kind = 'r' + s, w = RIVER_W[s - 1] * grow, cells = [];
        CELLS[kind].forEach((c, i) => { if (seen(c.b)) cells.push(i); });
        if (!cells.length) continue;
        g.globalAlpha = 0.9; g.strokeStyle = C.river; g.lineWidth = lw(w);
        for (const i of cells) g.stroke(cellPath(L, kind, i));
        if (w >= 1.6) { g.globalAlpha = 1; g.strokeStyle = C.sea; g.lineWidth = lw(w - 1.1); for (const i of cells) g.stroke(cellPath(L, kind, i)); }
      }
      g.lineCap = 'butt';
      yield;

      // lakes and inland seas: water like the sea, with its dots; the large ones get water lines along the shore
      const lk = lakesPath(L), toScreen = new DOMMatrix([sc, 0, 0, sc, V.x + k * bx, V.y + k * by]);
      const lkS = new Path2D(); lkS.addPath(lk, toScreen);
      screen();
      g.globalAlpha = 1; g.fillStyle = C.sea; g.fill(lkS, 'evenodd'); g.fillStyle = pat; g.fill(lkS, 'evenodd');
      const big = new Path2D();
      let nBig = 0;
      for (const l of SRC.lakes) { if (!seen(l.b)) continue; for (const r of l.rings) if (spanOf(r) * sc >= 36) { addRing(big, r, L.t, true); nBig++; } }
      viewMatrix();
      if (nBig) {
        g.save(); g.clip(big, 'evenodd'); g.lineJoin = 'bevel';
        for (const [r, op] of LAKE_RINGS) {
          g.strokeStyle = C.ink; g.globalAlpha = op; g.lineWidth = lw(2 * r); g.stroke(big);
          g.strokeStyle = C.sea; g.globalAlpha = 1; g.lineWidth = lw(2 * r - 1.1); g.stroke(big);
        }
        g.restore();
      }
      g.globalAlpha = 0.8; g.strokeStyle = C.ink; g.lineWidth = lw(0.65); g.lineJoin = 'round'; g.stroke(lk);
      // borders and coast
      g.globalAlpha = 0.88; g.lineWidth = lw(0.8); g.lineCap = 'round';
      for (const i of borderI) g.stroke(cellPath(L, 'borders', i));
      g.globalAlpha = 1; g.lineWidth = lw(1.05); g.lineCap = 'butt';
      for (const i of coastI) g.stroke(cellPath(L, 'coast', i));
      yield;

      // the equator, tropics and polar circles; the paper outside the oval, and the oval itself
      g.globalAlpha = 0.7; g.strokeStyle = C.ink; g.lineWidth = lw(2.6); g.stroke(G.eq);
      g.globalAlpha = 0.9; g.strokeStyle = '#efe2c0'; g.lineWidth = lw(1.3); g.stroke(G.eq);
      g.globalAlpha = 0.85; g.strokeStyle = C.red; g.setLineDash([lw(6), lw(6)]); g.stroke(G.eq); g.setLineDash([]);
      g.globalAlpha = 0.75; g.lineWidth = lw(0.8); g.stroke(G.tropics);
      g.setLineDash([lw(5), lw(3)]); g.stroke(G.polar); g.setLineDash([]);
      screen();
      const outside = new Path2D();
      outside.rect(-M - 2, -M - 2, W + 2 * M + 4, H + 2 * M + 4);
      outside.addPath(G.sphere, new DOMMatrix([sc, 0, 0, sc, V.x + k * bx, V.y + k * by]));
      g.globalAlpha = 1; g.fillStyle = C.outside; g.fill(outside, 'evenodd');
      viewMatrix();
      g.strokeStyle = C.ink; g.lineWidth = lw(6); g.stroke(G.sphere);
      g.strokeStyle = C.ochre; g.lineWidth = lw(3.4); g.stroke(G.sphere);
      g.globalAlpha = 1;
      if (fade <= 0) return;

      // the drawings and sea names belong to the whole chart; zoomed in they fade away
      yield;
      for (let n = 0; n < 40 && need.some((s) => !s.ready && !s.failed); n++) yield 'wait';    // they decode in a moment
      if (!fontsOk || need.some((s) => !s.ready && !s.failed)) j.incomplete = true;      // drawn again when they arrive
      screen();
      for (const d of orn) drawSprite(g, d.o.k, d.x, d.y, d.s, d.o.flip, fade);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      for (const l of ANT.labels) {
        const size = l.size * f;
        if (size < (l.red ? 6.5 : 7)) continue;          // too small to read on this screen
        const [x, y] = P(l.ll);
        g.font = `${l.red ? '' : 'italic '}${size * k}px ${C.display}`;
        if (l.red) {
          g.globalAlpha = fade; g.strokeStyle = C.sea; g.lineWidth = 3; g.lineJoin = 'round';
          spacedStroke(g, l.s, x, y, (l.ls || 0) * f * k, l.len ? l.len * f * k : 0);
        }
        g.globalAlpha = fade * l.op; g.fillStyle = l.red ? '#9c3a24' : C.ink;
        spaced(g, l.s, x, y, size * k, (l.ls || 0) * f * k, l.len ? l.len * f * k : 0);
      }
      // the title on a scroll, in the paper below the world when there is room for it
      if (scroll) {
        const { ks, cx, cy } = scroll;
        drawSprite(g, 'cartouche', cx, cy, ks, false, fade);
        drawSprite(g, 'seal', cx, cy - 60 * ks, 0.34 * ks, false, fade);
        g.globalAlpha = fade; g.textAlign = 'left';
        g.fillStyle = C.gold; g.font = `${10 * ks}px ${C.display}`; spaced(g, 'TYPVS ORBIS TERRARVM', cx, cy - 24 * ks, 10 * ks, 3.4 * ks);
        g.fillStyle = C.ink; g.font = `${34 * ks}px ${C.sc}`; spaced(g, 'Here Be Dragons', cx, cy + 12 * ks, 34 * ks, 0.5 * ks);
        g.fillStyle = C.gold; g.font = `italic ${13 * ks}px ${C.display}`;
        spaced(g, `No. ${dayNo} · ${E.dayDate(dayNo).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`, cx, cy + 34 * ks, 13 * ks, 0);
      }
      g.globalAlpha = 1;
    }

    // ------------- which picture each layer shows, and drawing the missing one in the background
    const same = (a, b) => !!a && !!b && a.k === b.k && a.x === b.x && a.y === b.y;
    const isIdent = (v) => v.k === 1 && v.x === 0 && v.y === 0;
    const IDENT = { k: 1, x: 0, y: 0 };
    const keyFor = () => [mine, C ? C.sea + C.ink : ''].join('|');
    function place(Ly) {                 // slide and scale a layer from the view it was drawn for to the current one
      if (!Ly.R) { Ly.box.style.visibility = 'hidden'; return; }
      Ly.box.style.visibility = '';
      const s = T.k / Ly.R.k, tx = T.x - Ly.R.x * s, ty = T.y - Ly.R.y * s;
      Ly.box.style.transform = Math.abs(s - 1) < 1e-6 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01 ? '' : `translate(${tx}px,${ty}px) scale(${s})`;
    }
    function placeAll() { place(base); place(heatB); place(front); place(heatL); }
    function stopJob() { cancelAnimationFrame(rafJob); rafJob = 0; job = null; }
    function startJob(V, key, ident, pan) {
      stopJob();
      const c = build.c;
      if (c.width !== base.c.width || c.height !== base.c.height) { c.width = base.c.width; c.height = base.c.height; }
      job = { V: { k: V.k, x: V.x, y: V.y }, key, ident, pan: !!pan, c, incomplete: false, drew: false };
      job.it = paint(c.getContext('2d'), job.V, job);
      lastFrame = 0;
      perFrame = perFrame >= 8 ? 4 : 1;          // a device that has shown it is quick starts quick
      rafJob = requestAnimationFrame(runJob);
    }
    function runJob(now) {
      rafJob = 0;
      if (!job || (moving && !job.pan)) return;
      // as many layers per frame as keep frames quick: a fast graphics chip finishes in a frame or two,
      // a slow phone gets one layer per frame and stays smooth
      if (lastFrame && job.drew) {
        const dt = now - lastFrame;
        quick = dt < 20 ? quick + 1 : 0;
        if (quick >= 2) { perFrame = Math.min(16, perFrame * 2); quick = 0; } else if (dt > 34) perFrame = Math.max(1, perFrame >> 1);
      }
      lastFrame = now;
      job.drew = false;
      for (let i = 0; i < perFrame; i++) {
        const r = job.it.next();
        if (!r.done) { if (r.value === 'wait') break; job.drew = true; continue; }
        const j = job;
        job = null;
        finish(j);
        want();                           // the world picture may still need its update
        return;
      }
      rafJob = requestAnimationFrame(runJob);
    }
    function finish(j) {
      // the finished canvas moves up into its layer; the one it replaces goes down to be drawn on next time
      const Ly = j.ident ? base : front, old = Ly.c;
      Ly.box.replaceChild(j.c, old);
      build.box.appendChild(old);
      build.c = old; Ly.c = j.c;
      Ly.R = j.V; Ly.key = j.key + (j.incomplete ? '~' : '');
      Ly.box.style.opacity = '1';                // the first picture after a new size fades in
      if (isIdent(T)) { front.R = null; heatL.R = null; }
      if (j.pan && moving && heatOn) drawHeatFor(heatL, j.V);       // a long drag: the ink follows the new picture
      placeAll();
      if (heatWait && chartReady()) heatWait();
    }
    // make sure the current view ends up sharp, and the world picture up to date
    function want() {
      rafWant = 0;
      if (!W || moving) return;
      if (!C) colours();
      const V = { k: T.k, x: T.x, y: T.y }, key = keyFor(), ident = isIdent(V);
      if (heatOn) {
        if (!heatB.R) drawHeatFor(heatB, IDENT);
        if (ident) { if (heatL.R) { heatL.R = null; place(heatL); } } else if (!same(heatL.R, V)) drawHeatFor(heatL, V);
      }
      if (job && job.pan) { if (!rafJob) rafJob = requestAnimationFrame(runJob); return; }   // let it land; this runs again after
      const sharp = ident ? base.key === key : same(front.R, V) && front.key === key;
      if (sharp) {
        if (ident && front.R) { front.R = null; placeAll(); }
        if (!ident && base.key !== key && !job) startJob(IDENT, key, true);
        return;
      }
      if (job && same(job.V, V) && job.key === key) { if (!rafJob) rafJob = requestAnimationFrame(runJob); return; }
      startJob(V, key, ident);
    }
    function invalidate() { if (!rafWant) rafWant = requestAnimationFrame(want); }
    function overlay() {
      if (rafOver) return;
      rafOver = requestAnimationFrame(() => { rafOver = 0; gOver.attr('transform', T); rescale(); drawLabels(); placePick(); });
    }
    const zoom = d3.zoom().scaleExtent([1, 24])
      .on('start', () => { moving = true; clearTimeout(settle); })
      .on('zoom', (ev) => {
        T = ev.transform;
        if (job && !job.pan) stopJob();          // the view moved: what was being drawn is out of date
        placeAll();
        overlay();
        // a long drag on a quick device: the view it has reached is drawn while it goes on, so the far side
        // comes in sharp (a slow one keeps every frame for the drag itself)
        if (moving && !job && perFrame >= 4 && front.R && front.R.k === T.k && Math.max(Math.abs(T.x - front.R.x), Math.abs(T.y - front.R.y)) > M * 0.5) startJob(T, keyFor(), false, true);
      })
      .on('end', (ev) => {
        moving = false;
        clearTimeout(settle);
        if (pick && pick.card) gPickShape.select('path').attr('d', outlineOf(pick.lake ? pick.lake.rings : pick.country.polys.flat()));
        // a jump made by the page is drawn at once; a hand gesture gets a moment to finish
        if (!ev.sourceEvent) want(); else settle = setTimeout(want, 70);
      });
    over.call(zoom).on('dblclick.zoom', null);
    over.on('click.pick', (ev) => {
      if (!W || !picker) return;
      const [sx, sy] = d3.pointer(ev, over.node());
      const hit = pickAt(sx, sy);
      const id = hit ? (hit.lake ? 'lake:' + hit.lake.n : hit.country.id) : null;
      if (!hit || (pick && pick.id === id)) { if (pick) { SFX.tap(); setPick(null); } return; }   // the sea, or a second tap, puts it away
      const info = hit.lake ? { title: hit.lake.n } : picker(hit.country.id);
      if (!info || !info.title) { setPick(null); return; }
      SFX.tap();
      setPick({ x: (sx - T.x) / T.k, y: (sy - T.y) / T.k, id, lake: hit.lake || null, country: hit.country || null, title: info.title, sub: info.sub || '', flag: info.flag || null });
    });

    function layout(force) {
      const r = host.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return false;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const resized = Math.abs(r.width - W) >= 1 || Math.abs(r.height - H) >= 1 || ratio !== layout.ratio;
      if (!force && !resized) return false;
      if (resized) {
        layout.ratio = ratio;
        W = r.width; H = r.height;
        colours();
        over.attr('viewBox', `0 0 ${W} ${H}`);
        // the pictures reach a little past each edge, so a short drag shows chart, not the world picture
        M = Math.round(Math.max(W, H) * 0.15);
        const cw = W + 2 * M, ch = H + 2 * M;
        dpr = ratio;
        if (cw * ch * dpr * dpr > 6e6) dpr = Math.max(1, Math.sqrt(6e6 / (cw * ch)));
        hdpr = Math.min(0.75, dpr);          // the ink is soft: a coarser canvas looks the same and costs less
        stopJob();
        for (const c of [build.c, base.c, front.c, heatB.c, heatL.c]) { c.style.left = -M + 'px'; c.style.top = -M + 'px'; c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
        for (const c of [build.c, base.c, front.c]) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
        for (const c of [heatB.c, heatL.c]) { c.width = Math.round(cw * hdpr); c.height = Math.round(ch * hdpr); }
        base.R = front.R = heatB.R = heatL.R = null; base.key = front.key = '';
        setPick(null);
        base.box.style.opacity = '0'; front.box.style.opacity = '0';
        projection.fitExtent([[10, 10], [W - 10, H - 10]], fc);
        for (const list of [heatPins, marks, labels]) for (const p of list) { const q = projection(p.ll); p.x = q[0]; p.y = q[1]; }
        zoom.extent([[0, 0], [W, H]]).translateExtent([[0, 0], [W, H]]);
      }
      T = d3.zoomIdentity;
      over.call(zoom.transform, T);          // ends in want(): the world picture, from the cache when it can
      placeAll();
      drawRoute(); drawMarks(); drawLabels();
      return true;
    }
    function rescale() { gMarks.selectAll('g.mark').attr('transform', (d) => `translate(${d.x},${d.y}) scale(${1 / T.k})`); }
    const sealMark = (g, r, cx, cy) => { const n = document.createElementNS('http://www.w3.org/2000/svg', 'g'); n.setAttribute('transform', `translate(${cx || 0} ${cy || 0}) scale(${r / 50})`); n.innerHTML = ANT.svg.seal; g.node().appendChild(n); };

    // ------------- flags, the hidden place and real players
    function drawMarks() {
      const sel = gMarks.selectAll('g.mark').data(marks, (d) => d.key);
      sel.exit().remove();
      sel.enter().append('g').attr('class', (d) => 'mark ' + d.type).each(function (d) {
        if (d.type === 'real') { d3.select(this).append('circle').attr('r', 3.6); return; }
        // flags and seals sit in an inner group that can pop up from the pin; numbered ones follow their order
        const g = d3.select(this).append('g').attr('class', 'mk-in');
        if (d.num) g.style('animation-delay', (0.15 + d.num * 0.09).toFixed(2) + 's');
        if (d.type === 'jackpot') { g.append('circle').attr('class', 'seal-ring').attr('r', 16); sealMark(g, 12); return; }
        const s = d.small ? 0.78 : 1;
        g.append('path').attr('class', 'flagframe').attr('d', `M${-18 * s} ${-41 * s}h${36 * s}v${28 * s}h${-12 * s}l${-6 * s} ${7 * s}l${-6 * s} ${-7 * s}h${-12 * s}z`);
        const fs = flagSVG(d.flag);
        if (fs) { fs.setAttribute('x', -16 * s); fs.setAttribute('y', -39 * s); fs.setAttribute('width', 32 * s); fs.setAttribute('height', 24 * s); g.node().appendChild(fs); }
        if (d.num) { g.append('circle').attr('class', 'numdot').attr('cx', -18 * s).attr('cy', -41 * s).attr('r', 8); g.append('text').attr('class', 'num').attr('x', -18 * s).attr('y', -41 * s).attr('dy', '0.35em').attr('text-anchor', 'middle').text(d.num); }
        // you found the hidden place: the dragon sits on your flag
        if (d.dragon) sealMark(g, 10 * s, 18 * s, -41 * s);
      });
      gMarks.selectAll('g.mark').sort((a, b) => (a.z || 0) - (b.z || 0));
      rescale();
    }
    function drawRoute() {
      gRoute.selectAll('*').remove();
      if (routeLL && routeLL.length > 1) gRoute.append('path').attr('class', 'route').attr('d', d3.geoPath(projection)({ type: 'LineString', coordinates: routeLL }));
    }
    // ------------- tap a country (or a lake) to see its name
    // The tap is tested against the same shapes the chart is drawn from: lakes first, then countries, with a
    // few pixels of slack so small islands can be hit. The name sits on a little parchment label that
    // follows the chart as you zoom; the country gets a dashed outline.
    const hitCtx = document.createElement('canvas').getContext('2d');
    function fullPath(o, rings) {
      if (!o.full) { o.full = new Path2D(); for (const r of rings) addRing(o.full, r, 0, true); }
      return o.full;
    }
    const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
    function hitAt(rx, ry, sc) {
      for (const l of SRC.lakes) {
        if (!l.n || !inBox(l.b, rx, ry) || Math.max(l.b[2] - l.b[0], l.b[3] - l.b[1]) * sc < 6) continue;   // named lakes you can see
        if (hitCtx.isPointInPath(fullPath(l, l.rings), rx, ry, 'evenodd')) return { lake: l };
      }
      for (const c of SRC.countries) if (inBox(c.b, rx, ry) && hitCtx.isPointInPath(fullPath(c, c.polys.flat()), rx, ry, 'evenodd')) return { country: c };
      return null;
    }
    function pickAt(sx, sy) {
      const k = T.k, bs = projection.scale() / REF, [bx, by] = projection.translate();
      const toRef = (px, py) => [((px - T.x) / k - bx) / bs, ((py - T.y) / k - by) / bs];
      for (const rad of [0, 5, 10]) {
        for (let a = 0; a < (rad ? 8 : 1); a++) {
          const [rx, ry] = toRef(sx + rad * Math.cos((a * Math.PI) / 4), sy + rad * Math.sin((a * Math.PI) / 4));
          const hit = hitAt(rx, ry, k * bs);
          if (hit) return hit;
        }
      }
      return null;
    }
    function outlineOf(rings) {                 // the shape as an svg path at the detail of the current zoom
      const bs = projection.scale() / REF, [bx, by] = projection.translate(), t = 0.55 / (T.k * bs);
      let d = '';
      for (const r of rings) {
        if (spanOf(r) * T.k * bs < 1.5) continue;
        const imp = rank(r), pts = r.pts;
        let first = true;
        for (let i = 0; i < imp.length; i++) {
          if (imp[i] <= t) continue;
          d += (first ? 'M' : 'L') + (pts[2 * i] * bs + bx).toFixed(1) + ' ' + (pts[2 * i + 1] * bs + by).toFixed(1);
          first = false;
        }
        if (!first) d += 'Z';
      }
      return d;
    }
    function setPick(p) {
      pick = p;
      gPickShape.selectAll('*').remove();
      gPick.selectAll('*').remove();
      if (!p) return;
      gPickShape.append('path').attr('class', 'pick-outline' + (p.lake ? ' lake' : '')).attr('d', outlineOf(p.lake ? p.lake.rings : p.country.polys.flat()));
      const at = gPick.append('g').attr('class', 'pick-at');
      const inner = at.append('g').attr('class', 'pick-in');
      const card = inner.append('g').attr('class', 'pick-card');
      const box = card.append('path').attr('class', 'pick-box');
      const rule = card.append('path').attr('class', 'pick-rule');
      let x0 = 11;
      const fs = p.flag ? flagSVG(p.flag) : null;
      if (fs) { fs.setAttribute('width', 22); fs.setAttribute('height', 16.5); fs.classList.add('pick-flag'); card.node().appendChild(fs); x0 = 39; }
      const title = card.append('text').attr('class', 'pick-title').attr('x', x0).text(p.title);
      const sub = p.sub ? card.append('text').attr('class', 'pick-sub').attr('x', x0).text(p.sub) : null;
      const w = Math.ceil(Math.max(title.node().getComputedTextLength(), sub ? sub.node().getComputedTextLength() : 0)) + x0 + 12;
      const h = sub ? 44 : 30;
      p.w = w; p.h = h;
      title.attr('y', sub ? 19 : 20);
      if (sub) sub.attr('y', 35);
      if (fs) { fs.setAttribute('x', 11); fs.setAttribute('y', (h - 16.5) / 2); }
      box.attr('d', `M0 0H${w}V${h}H0Z`);
      rule.attr('d', `M3 3H${w - 3}V${h - 3}H3Z`);
      inner.insert('circle', ':first-child').attr('class', 'pick-dot').attr('r', 3.4);
      p.pointer = inner.insert('path', ':first-child').attr('class', 'pick-pointer');
      p.card = card;
      placePick();
    }
    // the label above the spot, or below it near the top edge, and kept inside the chart
    function placePick() {
      if (!pick || !pick.card) return;
      const sx = pick.x * T.k + T.x, sy = pick.y * T.k + T.y;
      gPick.select('g.pick-at').attr('transform', `translate(${sx.toFixed(1)},${sy.toFixed(1)})`).style('display', sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20 ? 'none' : null);
      const below = sy - 12 - pick.h < 8;
      const cx = Math.max(8 - sx, Math.min(W - 8 - sx - pick.w, -pick.w / 2));
      const cy = below ? 12 : -12 - pick.h;
      pick.card.attr('transform', `translate(${cx.toFixed(1)},${cy})`);
      const px = Math.max(cx + 8, Math.min(cx + pick.w - 8, 0));
      pick.pointer.attr('d', below ? `M${px - 6} 12.5L0 4L${px + 6} 12.5Z` : `M${px - 6} -12.5L0 -4L${px + 6} -12.5Z`);
    }

    // labels for the popular answers: right of the spot, or left near the edge, and never on top of each other
    function drawLabels() {
      const k = T.k, boxes = [], show = [];
      for (const m of marks) {          // keep labels off the flags and the dragon
        if (m.type === 'real') continue;
        const sx = m.x * k + T.x, sy = m.y * k + T.y;
        boxes.push(m.type === 'jackpot' ? [sx - 13, sy - 13, sx + 13, sy + 13] : [sx - 19, sy - (m.dragon ? 52 : 43), sx + (m.dragon ? 29 : 19), sy - 13]);
      }
      const hit = (b) => boxes.some((o) => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]));
      for (const l of labels) {
        const sx = l.x * k + T.x, sy = l.y * k + T.y;
        if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
        const w = (l.name.length + l.pct.length + 1) * 7.1 + 4;
        let side = 'r', b = [sx + 8, sy - 8, sx + 8 + w, sy + 8];
        if (b[2] > W - 4 || hit(b)) { side = 'l'; b = [sx - 8 - w, sy - 8, sx - 8, sy + 8]; }
        if (b[0] < 4 || hit(b)) continue;
        boxes.push(b); show.push(Object.assign({}, l, { sx, sy, side }));
      }
      const sel = gLabels.selectAll('g.lab').data(show, (d) => d.key);
      sel.exit().remove();
      const ent = sel.enter().append('g').attr('class', 'lab');
      ent.append('circle').attr('class', 'ldot').attr('r', 2.4);
      const t = ent.append('text').attr('class', 'mlabel').attr('y', 4);
      t.append('tspan').attr('class', 'n');
      t.append('tspan').attr('class', 'pct');
      gLabels.selectAll('g.lab').attr('transform', (d) => `translate(${d.sx},${d.sy})`).each(function (d) {
        const g = d3.select(this);
        g.select('text').attr('x', d.side === 'r' ? 8 : -8).attr('text-anchor', d.side === 'r' ? 'start' : 'end').classed('me', !!d.me);
        g.select('tspan.n').text(d.name + ' ');
        g.select('tspan.pct').text(d.pct);
      });
    }

    // ------------- everyone's picks as ink: drawn once per view, coloured only where there is ink
    const brushes = {};
    function brush(r) {
      if (brushes[r]) return brushes[r];
      const c = document.createElement('canvas'); c.width = c.height = r * 2;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(r, r, 0, r, r, r);
      grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.45, 'rgba(0,0,0,.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, r * 2, r * 2);
      brushes[r] = c; return c;
    }
    let lutPlain = null, lutLive = null;
    api.drawHeatOn = (o, w, h, pts, R2, alpha) => heatInto(o, w, h, pts, R2, alpha, lutPlain || (lutPlain = heatLUT(null)));
    function heatInto(o, cw, ch, pts, Rb, alpha, lut) {
      o.clearRect(0, 0, cw, ch);
      const b = brush(Rb);
      o.globalAlpha = alpha;
      let x0 = cw, y0 = ch, x1 = 0, y1 = 0;
      for (const p of pts) {
        if (p[0] <= -Rb || p[1] <= -Rb || p[0] >= cw + Rb || p[1] >= ch + Rb) continue;
        o.drawImage(b, p[0] - Rb, p[1] - Rb);
        if (p[0] - Rb < x0) x0 = p[0] - Rb; if (p[1] - Rb < y0) y0 = p[1] - Rb;
        if (p[0] + Rb > x1) x1 = p[0] + Rb; if (p[1] + Rb > y1) y1 = p[1] + Rb;
      }
      o.globalAlpha = 1;
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(cw, Math.ceil(x1)); y1 = Math.min(ch, Math.ceil(y1));
      if (x1 <= x0 || y1 <= y0) return;
      const img = o.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data;
      for (let i = 3; i < d.length; i += 4) {
        const a = d[i];
        if (!a) continue;
        const j = a * 4;
        d[i - 3] = lut[j]; d[i - 2] = lut[j + 1]; d[i - 1] = lut[j + 2]; d[i] = lut[j + 3];
      }
      o.putImageData(img, x0, y0);
    }
    // everyone's picks for one view, into one of the two heat layers
    function drawHeatFor(Ly, V) {
      const c = Ly.c, o = Ly.g, cw = c.width, ch = c.height;
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, cw, ch);
      Ly.R = { k: V.k, x: V.x, y: V.y };
      place(Ly);
      if (!heatOn || !heatPins.length || !W) return;
      const k = V.k;
      const Rb = Math.round(Math.max(7, Math.min(22, 7 + 3.2 * Math.log2(k))) * hdpr);
      const pts = heatPins.map((p) => [(p.x * k + V.x + M) * hdpr, (p.y * k + V.y + M) * hdpr]);
      heatInto(o, cw, ch, pts, Rb, HEAT_ALPHA, lutLive || (lutLive = heatLUT([0.918, 0.863, 0.761])));
    }

    // ------------- public
    api.layout = layout;
    api.setMine = (id) => { if (mine !== id) { mine = id; invalidate(); } };
    api.marks = (list) => { marks = list.map((m) => { const q = projection(m.ll); return Object.assign({}, m, { x: q[0], y: q[1] }); }); drawMarks(); drawLabels(); };
    api.labels = (list) => { labels = list.map((l) => { const q = projection(l.ll); return Object.assign({}, l, { x: q[0], y: q[1] }); }); drawLabels(); };
    api.route = (lls) => { routeLL = lls; drawRoute(); };
    let heatTimer = 0;
    // the ink waits for the chart: after a new size the chart is drawn first and fades in, then the ink spreads
    let heatWait = null;
    const chartReady = () => (isIdent(T) ? !!base.R : (!!front.R && same(front.R, T)) || !!base.R);
    api.heat = (pins, animate, done) => {
      clearTimeout(heatTimer);
      heatPins = pins.map((p) => { const q = projection(p.ll); return { ll: p.ll, x: q[0], y: q[1] }; });
      heatWait = () => {
        heatWait = null;
        heatOn = true;
        // the ink for the view on screen is drawn now; the world's ink only shows past the edges of a zoomed
        // view, so then it follows a frame later
        const ident = isIdent(T), shown = ident ? heatB : heatL, other = ident ? heatL : heatB;
        other.R = null; place(other);
        other.c.style.transition = 'none'; other.c.style.opacity = '1';
        drawHeatFor(shown, ident ? IDENT : T);
        if (!ident) invalidate();
        // the ink seeps in as one picture: no per-frame work
        const c = shown.c;
        c.style.transition = 'none';
        if (!animate || reduceMotion || !heatPins.length) { c.style.opacity = '1'; if (done) done(); return; }
        c.style.opacity = '0';
        void c.offsetWidth;
        c.style.transition = 'opacity 1s ease-out'; c.style.opacity = '1';
        heatTimer = setTimeout(() => { if (done) done(); }, 950);
      };
      if (chartReady()) heatWait();
    };
    api.clear = () => {
      clearTimeout(heatTimer);
      heatPins = []; heatOn = false; heatWait = null; marks = []; labels = []; routeLL = null;
      setPick(null);
      for (const Ly of [heatB, heatL]) { Ly.g.setTransform(1, 0, 0, 1, 0, 0); Ly.g.clearRect(0, 0, Ly.c.width, Ly.c.height); Ly.R = null; place(Ly); }
      if (mine !== null) { mine = null; invalidate(); }
      drawMarks(); drawLabels(); drawRoute();
    };
    // frame the part of the world where the answers are; a world-wide spread keeps the whole map
    api.frame = (lls, extra) => frameFor(projection, W, H, lls, extra);
    api.focusOn = (lls, extra, animate) => {
      if (!W) return;
      const fr = frameFor(projection, W, H, lls, extra);
      if (!fr) return;
      const t = d3.zoomIdentity.translate(fr.tx, fr.ty).scale(fr.k);
      (animate && !reduceMotion ? over.transition().duration(650) : over).call(zoom.transform, t);
    };
    api.reset = () => over.call(zoom.transform, d3.zoomIdentity);
    api.collection = fc;
    api.setPicker = (fn) => { picker = fn; if (pick) setPick(null); };
    api.colours = ANT.colours;
    api.seal = ANT.svg.seal;
    // sea names and the title wait for their typeface; meanwhile a stand-in is used and the chart redrawn after
    (function () {
      const ok = () => { if (!fontsOk) { fontsOk = true; invalidate(); } };
      if (!document.fonts || !document.fonts.load) { fontsOk = true; return; }
      if (!C) colours();
      Promise.all([`12px ${C.display}`, `italic 12px ${C.display}`, `12px ${C.sc}`].map((f) => document.fonts.load(f))).then(ok, ok);
      setTimeout(ok, 5000);
    })();
    // a window being resized is laid out again once it settles
    let resizeT = 0;
    new ResizeObserver(() => { clearTimeout(resizeT); resizeT = setTimeout(() => layout(false), W ? 120 : 0); }).observe(host);
    return api;
  }

  // accumulated coverage -> colour: a gamma lifts single picks into a dim ember, crowds go white-hot
  // tint: the paper the ink lands on. The live map draws its ink normally (blending a whole layer with the chart
  // under it costs every frame of a gesture), so the colours are darkened by the paper here instead: over the
  // land that gives exactly what multiplying would, at no cost.
  function heatLUT(tint) {
    const cs = getComputedStyle(document.documentElement);
    const col = (n, f) => cs.getPropertyValue(n).trim() || f;
    const c = document.createElement('canvas'); c.width = 256; c.height = 1;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 256, 0);
    grd.addColorStop(0, col('--heat-1', '#4a1606')); grd.addColorStop(0.35, col('--heat-2', '#c2410c'));
    grd.addColorStop(0.7, col('--heat-3', '#fb923c')); grd.addColorStop(1, col('--heat-4', '#fff1c9'));
    g.fillStyle = grd; g.fillRect(0, 0, 256, 1);
    const pal = g.getImageData(0, 0, 256, 1).data;
    const out = new Uint8ClampedArray(1024);
    for (let a = 1; a < 256; a++) {
      const t = Math.pow(a / 255, 0.5), j = Math.min(255, Math.round(t * 255)) * 4;
      const [tr, tg, tb] = tint || [1, 1, 1];
      out[a * 4] = pal[j] * tr; out[a * 4 + 1] = pal[j + 1] * tg; out[a * 4 + 2] = pal[j + 2] * tb;
      out[a * 4 + 3] = Math.round(255 * Math.min(0.95, 0.2 + 0.85 * t));
    }
    return out;
  }
  // zoom and offset that frame a set of points (used by the map and the share image)
  function frameFor(projection, W, H, lls, extra) {
    const pts = lls.map((ll) => projection(ll)).filter(Boolean);
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]).sort((a, b) => a - b), ys = pts.map((p) => p[1]).sort((a, b) => a - b);
    const trim = pts.length >= 40 ? 0.03 : 0;
    const q = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(f * (arr.length - 1))))];
    let x0 = q(xs, trim), x1 = q(xs, 1 - trim), y0 = q(ys, trim), y1 = q(ys, 1 - trim);
    for (const ll of extra || []) {
      if (!ll) continue;
      const p = projection(ll);
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    const pad = 44;
    const bw = Math.max(40, x1 - x0), bh = Math.max(30, y1 - y0 + 34);   // room for the flag above the top pin
    let k = Math.max(1, Math.min(9, Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh)));
    if (k < 1.5) k = 1;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - 12;
    let tx = W / 2 - k * cx, ty = H / 2 - k * cy;
    tx = Math.min(0, Math.max(W - W * k, tx)); ty = Math.min(0, Math.max(H - H * k, ty));
    return { k, tx, ty };
  }

  // ------------------------------------------------------------------ helpers
  const tierOf = (key) => [E.SPECIAL.jackpot, E.SPECIAL.clever, E.SPECIAL.lost].concat(E.TIERS).find((t) => t.key === key) || E.SPECIAL.lost;
  const shareText = (share) => (share >= 0.0095 ? `${Math.round(share * 100)}% of players` : `1 in ${Math.max(2, Math.round(1 / share)).toLocaleString('en-US')} players`);
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function setPhase(phase) {
    S.phase = phase;
    $('app').dataset.phase = phase;
    for (const v of ['intro', 'play', 'reveal', 'summary']) $('v-' + v).hidden = v !== phase;
    $('legend').hidden = phase !== 'reveal';
    $('panel').scrollTop = 0;
  }
  function renderSteps() {
    const ol = $('steps');
    ol.textContent = '';
    prompts.forEach((pr, i) => {
      const a = record.answers[i];
      const li = make('li');
      if (a) li.className = 't' + ({ lost: 0, bus: 1, clever: 1, boot: 2, compass: 3, sail: 4, dragon: 5 }[a.tier] || 0) + (S.phase === 'reveal' && S.reviewing == null && i === record.answers.length - 1 ? ' fresh' : '');
      else if (S.phase === 'play' && S.slot === i) li.className = 'now';
      li.title = a ? `${i + 1}: ${tierOf(a.tier).name}` : `Prompt ${i + 1}`;
      ol.appendChild(li);
    });
  }

  // ------------------------------------------------------------------ playing a prompt
  const input = $('answer');

  function startDay() {
    if (record.answers.length >= N) return showSummary(false);
    const slot = record.answers.length;
    record.current = { slot, startedAt: Date.now() };
    save();
    playSlot(slot, true);
  }

  function playSlot(slot, gesture) {
    const pr = prompts[slot];
    S.slot = slot; S.shown = null; S.locking = false;
    setPhase('play');
    renderSteps();
    $('q-label').textContent = `Prompt ${slot + 1} of ${N} · ${pr.kind === 'city' ? 'City' : 'Country'}`;
    const qt = $('q-text');
    qt.textContent = pr.text;
    qt.classList.remove('ink'); void qt.offsetWidth; qt.classList.add('ink');
    renderClue(pr);
    input.value = '';
    input.placeholder = pr.kind === 'city' ? 'Type a city' : 'Type a country';
    input.disabled = false;
    $('btn-lock').disabled = false;
    $('feedback').textContent = '';
    showFlag(null);
    if (gesture) input.focus({ preventScroll: true });
    startClock(record.current.startedAt);
  }

  const capFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const isNewPlayer = () => Object.keys((store.get(STATS_KEY) || { days: {} }).days).length < 2;

  // the dragon clue: one small gold line between the prompt and the flag
  function renderClue(pr) {
    const el = $('q-clue');
    el.textContent = '';
    el.hidden = false;
    if (pr.clue) {
      el.className = 'q-clue';
      el.appendChild(make('span', 'e', '🐉'));
      el.appendChild(document.createTextNode(' Hidden place: '));
      el.appendChild(make('b', null, pr.clue.text));
    } else {
      el.className = 'q-clue none';
      el.textContent = E.validSet(pr).length > E.CLUE_MAX_VALID ? 'No dragon on this one: too many places fit.' : 'No dragon on this one.';
    }
  }

  function showFlag(res) {
    const card = $('flagcard'), name = $('flag-name'), sub = $('flag-sub');
    const ent = res && (res.status === 'ok' || res.status === 'territory') ? res.ent : null;
    const pr = prompts[S.slot];
    if (!ent) {
      let note = '', cls = 'flag-sub hint';
      if (res && res.status === 'wrongKind' && res.other) { note = `${res.other.n} is a ${pr.kind === 'city' ? 'country' : 'city'}, not a ${pr.kind}.`; cls = 'flag-sub warn'; }
      else if (!input.value.trim() && isNewPlayer()) note = 'The flag appears when we recognise the name.';
      if (S.shown === null && card.classList.contains('empty') && sub.textContent === note) return;
      S.shown = null;
      card.className = 'flagcard empty';
      card.textContent = '';
      card.appendChild(make('span', 'flag-empty', '?'));
      name.textContent = ''; sub.textContent = note; sub.className = cls;
      return;
    }
    const key = ent.id + res.status;
    if (S.shown === key) return;
    S.shown = key;
    card.className = 'flagcard';
    card.textContent = '';
    const svg = flagSVG(countryOf(ent), `Flag of ${E.CI[countryOf(ent)] ? E.CI[countryOf(ent)].n : ent.n}`);
    if (svg) card.appendChild(svg);
    void card.offsetWidth;
    card.classList.add('pop');
    SFX.found();
    name.textContent = ent.n;
    sub.className = 'flag-sub';
    if (res.status === 'territory') { sub.textContent = capFirst(territoryNote(ent)); sub.classList.add('warn'); }
    else sub.textContent = pr.kind === 'city' && E.CI[ent.c] ? E.CI[ent.c].n : '';
  }

  // Exact names show their flag at once; after a short pause a near miss ("Burkna Faso") does too.
  let fuzzyTimer = 0;
  input.addEventListener('input', () => {
    if (S.phase !== 'play') return;
    SFX.quill();
    $('feedback').textContent = '';
    clearTimeout(fuzzyTimer);
    const pr = prompts[S.slot];
    const res = E.resolve(pr, input.value, true);
    showFlag(res);
    if (res.status === 'unknown' && E.norm(input.value).length >= 5) {
      fuzzyTimer = setTimeout(() => {
        if (S.phase !== 'play' || prompts[S.slot] !== pr) return;
        const r2 = E.resolve(pr, input.value, false);
        if (r2.status === 'ok' || r2.status === 'territory') showFlag(r2);
      }, 650);
    }
  });
  // Lock in without relying on form submission: sandboxed previews block it before any submit event fires.
  $('answer-form').addEventListener('submit', (ev) => { ev.preventDefault(); tryLock(false); });
  $('btn-lock').addEventListener('click', (ev) => { ev.preventDefault(); tryLock(false); });
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); tryLock(false); } });

  function tryLock(timeUp) {
    if (S.phase !== 'play' || S.locking) return;
    const pr = prompts[S.slot];
    const res = E.resolve(pr, input.value, false);
    if (res.status === 'ok') { showFlag(res); commit(res.ent.id, timeUp, res.how === 'fuzzy' ? input.value.trim() : null); return; }
    if (timeUp) {
      const typed = input.value.trim() || null;
      const why = res.status === 'territory' ? `Time ran out. ${res.ent.n} is ${territoryNote(res.ent)}`
        : res.status === 'wrongKind' ? `Time ran out. ${res.other.n} is a ${pr.kind === 'city' ? 'country' : 'city'}, not a ${pr.kind}.`
          : typed ? `Time ran out, and “${typed}” is not a place we know.` : 'Time ran out before you locked in an answer.';
      commit(null, true, typed, why);
      return;
    }
    if (res.status === 'territory' || res.status === 'wrongKind') showFlag(res);
    const fb = $('feedback');
    const msg = {
      empty: 'Type an answer first.',
      unknown: pr.kind === 'city' ? 'That city is not in our atlas. Check the spelling, or try another.' : 'We do not know that country. Check the spelling.',
      territory: '',
      wrongKind: '',
    }[res.status] || '';
    fb.textContent = msg;
    SFX.wrong();
    const form = $('answer-form');
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
  }

  function startClock(startedAt) {
    cancelAnimationFrame(S.raf);
    const dur = SECONDS * 1000;
    const bar = $('q-bar'), num = $('q-clock'), wrap = $('q-barwrap');
    let shown = -1;
    const tick = () => {
      if (S.phase !== 'play') return;
      const left = Math.max(0, dur - (Date.now() - startedAt));
      bar.style.transform = `scaleX(${left / dur})`;
      const sec = Math.ceil(left / 1000);
      if (sec !== shown) {
        // the last five seconds tick like a clock
        if (shown !== -1 && sec <= 5 && sec > 0) { SFX.tick(sec % 2); num.classList.remove('beat'); void num.offsetWidth; num.classList.add('beat'); }
        shown = sec;
      }
      num.textContent = String(sec);
      const low = left < 6000;
      num.classList.toggle('low', low); wrap.classList.toggle('low', low);
      if (left <= 0) { tryLock(true); return; }
      S.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function commit(id, timedOut, typed, whyNoAnswer) {
    if (S.phase !== 'play' || S.locking) return;
    S.locking = true;
    clearTimeout(fuzzyTimer);
    cancelAnimationFrame(S.raf);
    input.blur();
    input.disabled = true; $('btn-lock').disabled = true;
    if (id) { const card = $('flagcard'); card.classList.add('locked'); card.appendChild(waxSeal(true)); SFX.seal(); }
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* no haptics */ }
    const pr = prompts[S.slot];
    const jackpotId = E.findJackpot(pr, dayNo, pr.slot, pr.jh);
    const ent = id ? E.entity(pr, id) : null;
    const res = id ? E.score(pr, pr.seed, id, realBySlot[pr.slot], jackpotId) : { ok: false, km: 0, tier: E.SPECIAL.lost, share: 0 };
    const ans = {
      slot: pr.slot, id, km: res.km, tier: res.tier.key, share: res.share, ok: !!res.ok,
      jackpot: !!res.jackpot, clever: !!res.clever, timedOut: !!timedOut, typed: typed || null, at: Date.now(),
      why: ent ? E.explain(pr, ent, res.ok) : (whyNoAnswer || 'Time ran out before you locked in an answer.'),
    };
    record.answers.push(ans);
    record.current = null;
    save();
    writeShared();
    if (record.answers.length === N) logDay();
    // a short beat so the flag registers before the map switches on
    setTimeout(() => reveal(pr, ans, true), ent ? 560 : 150);
  }

  // what a tap on the chart says about a country: its name, and on a result how it did in this prompt
  function pickerFor(pr, counts, total) {
    return (id) => {
      const c = E.CI[id];
      if (!c) return null;
      const info = { title: c.n, flag: id, sub: '' };
      if (!pr || !counts) { if (!c.s && c.par) info.sub = `Part of ${c.par}`; return info; }
      if (pr.kind === 'country') {
        const n = counts.get(id) || 0, named = n ? `${pctText(n / total)} named it` : 'nobody named it';
        info.sub = !c.s ? `${c.par ? 'Part of ' + c.par : 'Not a country'} · ${named}` : `${E.isValid(pr, c) ? 'Fits' : 'Does not fit'} · ${named}`;
      } else {
        let n = 0;
        for (const [cid, m] of counts) { const city = E.CITYI[cid]; if (city && city.c === id) n += m; }
        info.sub = n ? `${pctText(n / total)} of answers were here` : 'No answers here';
      }
      return info;
    };
  }

  // ------------------------------------------------------------------ reveal
  function tally(pr, ans) {
    const m = E.machine(pr, pr.seed);
    const real = realBySlot[pr.slot];
    const counts = new Map(m.counts);
    for (const [id, n] of real.counts) counts.set(id, (counts.get(id) || 0) + n);
    if (ans && ans.id) counts.set(ans.id, (counts.get(ans.id) || 0) + 1);
    return { counts, total: E.MACHINE + real.total + (ans && ans.id ? 1 : 0), realTotal: real.total };
  }

  function reveal(pr, ans, animate) {
    setPhase('reveal');
    renderSteps();
    const ui = renderReveal(pr, ans, animate);
    const jackpotId = E.findJackpot(pr, dayNo, pr.slot, pr.jh);
    const myEnt = ans.id ? E.entity(pr, ans.id) : null;
    const myLL = myEnt ? pointFor(pr, myEnt) : null;
    const jEnt = jackpotId ? E.entity(pr, jackpotId) : null;
    const jLL = jEnt ? pointFor(pr, jEnt) : null;
    const pins = allPins(pr, myEnt);
    const { counts, total } = tally(pr, ans);
    const top = [...counts.entries()].filter(([id]) => E.isValid(pr, entityOf(pr, id))).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labs = [];
    if (myEnt) labs.push({ key: 'me', me: true, name: myEnt.n, pct: pctText((counts.get(ans.id) || 1) / total), ll: myLL });
    for (const [id, n] of top) {
      if (id === ans.id) continue;
      const ent = entityOf(pr, id);
      if (ent) labs.push({ key: 'l' + id, name: ent.n, pct: pctText(n / total), ll: pointFor(pr, ent) });
    }
    if (animate) SFX.reveal();
    requestAnimationFrame(() => {
      map.layout(false);
      map.clear();
      map.setPicker(pickerFor(pr, counts, total));
      map.setMine(pr.kind === 'country' ? ans.id : null);
      map.focusOn(pins.filter((p) => p.ok !== false).map((p) => p.ll), [myLL, jLL], false);
      const after = () => {
        const mk = realBySlot[pr.slot].pins.map((p, i) => ({ key: 'r' + i, type: 'real', ll: p.ll, z: 1 }));
        if (jLL && !ans.jackpot) mk.push({ key: 'jp', type: 'jackpot', ll: jLL, z: 3 });
        if (myLL) mk.push({ key: 'me', type: 'me', flag: countryOf(myEnt), ll: myLL, z: 4, dragon: !!ans.jackpot });
        map.marks(mk);
        map.labels(labs);
        if (animate) countUp(ui.km, ans.km, ui.tier, ans.tier);
        if (animate && ans.jackpot) { try { if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 80]); } catch (e) { /* no haptics */ } }
      };
      // the ink is drawn a frame later, so the panel and the chart get this frame to themselves
      requestAnimationFrame(() => map.heat(pins, animate, after));
    });
  }
  // everyone's picks for a prompt: the Machine, real players and you; ok=false marks wrong answers
  function allPins(pr, myEnt) {
    const okOf = new Map();
    const ok = (id) => { if (!okOf.has(id)) okOf.set(id, E.isValid(pr, entityOf(pr, id))); return okOf.get(id); };
    return E.machinePins(pr, pr.seed).map((p) => ({ ll: p.ll, ok: ok(p.id) }))
      .concat(realBySlot[pr.slot].pins.map((p) => ({ ll: p.ll, ok: ok(p.id) })))
      .concat(myEnt ? [{ ll: E.tapPoint(pr, myEnt, E.rng('me|' + dayNo + '|' + pr.slot)), ok: true }] : []);
  }
  const pctText = (p) => (p >= 0.0095 ? Math.round(p * 100) + '%' : p >= 0.001 ? (p * 100).toFixed(1) + '%' : '<0.1%');

  function countUp(el, km, tierEl, tierKey) {
    const txt = el.firstChild;
    const done = () => {
      txt.nodeValue = (km ? '+' : '') + fmtKm(km);
      tierEl.classList.remove('wait'); tierEl.classList.add('stamped'); el.classList.add('landed');
      SFX.tier(tierKey);
    };
    if (reduceMotion || !km) { done(); return; }
    const t0 = performance.now(), dur = 750;
    let lastTick = 0;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      txt.nodeValue = '+' + fmtKm(km * (1 - Math.pow(1 - t, 3)));
      if (now - lastTick > 55 && t < 0.97) { lastTick = now; SFX.count(t); }
      if (t < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }

  // valid answers almost nobody gave: the "I should have said that" line
  function missedAnswers(pr, counts, skip) {
    const V = E.validSet(pr).filter((x) => !skip.includes(x.id) && (pr.kind === 'country' || (x.sr <= 5 && !String(x.id).startsWith('gn'))));
    return V.slice().sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0) || b.sal - a.sal).slice(0, 3);
  }

  function renderReveal(pr, ans, animate) {
    const root = $('v-reveal');
    root.textContent = '';
    const tier = tierOf(ans.tier);
    const { counts, total, realTotal } = tally(pr, ans);
    const ent = ans.id ? E.entity(pr, ans.id) : null;

    const head = make('div', 'res-head');
    const rf = flagBox(countryOf(ent), 'res-flag');
    if (ans.jackpot) { rf.classList.add('jackpot'); rf.appendChild(waxSeal(animate)); }
    head.appendChild(rf);
    const mid = make('div');
    mid.appendChild(make('div', 'res-name', ent ? labelOf(pr, ent) : 'No answer'));
    const shareLine = ent ? shareText((counts.get(ans.id) || 1) / total) + ' named it' : ans.timedOut ? 'Time ran out' : '';
    mid.appendChild(make('div', 'res-share', shareLine + (ans.typed ? ` · you typed “${ans.typed}”` : '')));
    head.appendChild(mid);
    const km = make('div', 'res-km' + (ans.km ? '' : ' zero') + (ans.jackpot ? ' dragon' : ans.tier === 'sail' ? ' far' : ''), animate && ans.km ? '+0' : (ans.km ? '+' : '') + fmtKm(ans.km));
    km.appendChild(make('small', null, 'km'));
    head.appendChild(km);
    root.appendChild(head);

    const trow = make('div', 'tier-row');
    const t = make('span', 'tier ' + tier.key + (animate && ans.km ? ' wait' : ''));
    t.appendChild(make('span', 'e', tier.emoji));
    t.appendChild(make('span', null, tier.name));
    trow.appendChild(t);
    if (ans.slot > 0) {
      const soFar = record.answers.slice(0, ans.slot + 1).reduce((a, x) => a + x.km, 0);
      const sf = make('span', 'so-far');
      sf.appendChild(make('b', null, fmtKm(soFar) + ' km'));
      sf.appendChild(document.createTextNode(' so far'));
      trow.appendChild(sf);
    }
    root.appendChild(trow);
    root.appendChild(make('p', 'why', ans.why));

    if (ans.clever) root.appendChild(make('p', 'note', `${Math.round(ans.share * 100)}% of players had the same idea, so it was not so obscure after all.`));
    const jackpotId = E.findJackpot(pr, dayNo, pr.slot, pr.jh);
    if (jackpotId) {
      const jEnt = E.entity(pr, jackpotId);
      const jn = counts.get(jackpotId) || 0;
      const foundBy = jn >= 1 ? `${capFirst(shareText(jn / total))} found it.` : 'Nobody found it.';
      const p = make('p', 'note' + (ans.jackpot ? ' dragon' : ''));
      const say = (s) => p.appendChild(document.createTextNode(s));
      if (ans.jackpot) { say('🐉 Off the Map! '); p.appendChild(make('b', null, labelOf(pr, jEnt))); say(` was the hidden place. +${fmtKm(E.JACKPOT_KM)} km.`); }
      else {
        say('🐉 The hidden place was '); p.appendChild(make('b', null, labelOf(pr, jEnt))); say('. ');
        // the near miss: your answer fit the clue too, and still scores as usual
        if (ent && E.fitsClue(pr, ent)) say(ans.ok ? `Your ${ent.n} matched the clue too. ` : `Your ${ent.n} matched the clue, but not the prompt. `);
        say(foundBy);
      }
      if (pr.clue) p.appendChild(make('span', 'clue-was', `Clue: ${pr.clue.text} · ${pr.clue.n} places fit` + (ans.jackpot ? ' · ' + foundBy : '')));
      root.appendChild(p);
    }

    root.appendChild(make('p', 'tops-head', 'Most popular answers'));
    const list = make('ol', 'tops');
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const maxN = top.length ? top[0][1] : 1;
    const row = (rank, id, n) => {
      const e = entityOf(pr, id);
      const li = make('li');
      if (id === ans.id) li.classList.add('me');
      if (!E.isValid(pr, e)) li.classList.add('bad');
      li.appendChild(make('span', 'rank', rank));
      li.appendChild(flagBox(countryOf(e), 'mini'));
      li.appendChild(make('span', 'nm', (e ? e.n : id) + (id === ans.id ? ' (you)' : '')));
      const bar = make('span', 'bar'); const f = make('span'); f.style.width = Math.max(2, (n / maxN) * 100) + '%'; bar.appendChild(f); li.appendChild(bar);
      li.appendChild(make('span', 'pct', pctText(n / total)));
      list.appendChild(li);
    };
    top.forEach(([id, n], i) => row(String(i + 1), id, n));
    if (ans.id && !top.some(([id]) => id === ans.id)) row(String(sorted.findIndex(([id]) => id === ans.id) + 1), ans.id, counts.get(ans.id) || 1);
    root.appendChild(list);

    const V = E.validSet(pr);
    const miss = missedAnswers(pr, counts, [ans.id, jackpotId]);
    const mp = make('p', 'missed');
    mp.appendChild(document.createTextNode(`${V.length.toLocaleString('en-US')} ${pr.kind === 'city' ? (V.length === 1 ? 'city' : 'cities') : (V.length === 1 ? 'country' : 'countries')} fit. `));
    if (miss.length) {
      mp.appendChild(document.createTextNode('Almost nobody said '));
      miss.forEach((x, i) => {
        if (i) mp.appendChild(document.createTextNode(i === miss.length - 1 ? ' or ' : ', '));
        mp.appendChild(make('b', null, x.n));
      });
      mp.appendChild(document.createTextNode('.'));
    }
    root.appendChild(mp);
    root.appendChild(make('p', 'crowd-line', crowdLine(realTotal)));

    const last = pr.slot === N - 1 || record.answers.length >= N;
    const bar = make('div', 'next-bar');
    const btn = make('button', 'btn gold big', S.reviewing != null ? 'Back to your journey' : last ? 'See your journey' : 'Next prompt');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      SFX.paper();
      if (S.reviewing != null) { S.reviewing = null; showSummary(false); return; }
      if (record.answers.length >= N) { showSummary(true); return; }
      record.current = { slot: record.answers.length, startedAt: Date.now() };
      save();
      playSlot(record.answers.length, true);
    });
    bar.appendChild(btn);
    root.appendChild(bar);
    renderLegend(pr, ans);
    setTimeout(() => { try { btn.focus({ preventScroll: true }); } catch (e) { /* old browsers */ } }, 0);
    return { km, tier: t };
  }

  function renderLegend(pr, ans) {
    const lg = $('legend');
    lg.textContent = '';
    const a = make('span'); a.appendChild(make('i', 'swatch')); a.appendChild(document.createTextNode('everyone\'s answers'));
    lg.appendChild(a);
    if (pr.jh) {
      const sp = make('span');
      sp.innerHTML = `<svg viewBox="-52 -52 104 104" aria-hidden="true">${map.seal}</svg>`;
      sp.appendChild(document.createTextNode(ans && ans.jackpot ? 'on your flag: you found it' : 'the hidden place'));
      lg.appendChild(sp);
    }
    if (DB.db) lg.appendChild(make('span', null, '● real players'));
  }

  function crowdLine(realOthers) {
    const machine = `the Machine (${E.MACHINE.toLocaleString('en-US')} simulated players)`;
    if (!DB.db || !realOthers) return `The map shows ${machine} and you.`;
    return `The map shows ${machine}, you and ${realOthers} other real ${realOthers === 1 ? 'player' : 'players'}.`;
  }
  function refreshCrowdLines() {
    const slot = S.phase === 'reveal' ? (S.reviewing != null ? S.reviewing : S.slot) : null;
    if (slot != null) document.querySelectorAll('.crowd-line').forEach((n) => { n.textContent = crowdLine(realBySlot[slot].total); });
    const n = $('sum-crowd');
    if (n) n.textContent = summaryCrowd();
  }

  // ------------------------------------------------------------------ summary
  const totalKm = () => record.answers.reduce((s, a) => s + a.km, 0);
  const emojiLine = () => record.answers.map((a) => tierOf(a.tier).emoji).join('');
  function milestone(km) { let m = E.MILESTONES[0]; for (const x of E.MILESTONES) if (km >= x.km) m = x; return m; }
  function summaryCrowd() {
    if (!DB.db) return `Every map includes the Machine: ${E.MACHINE.toLocaleString('en-US')} simulated players who take the obvious answers before the day begins.`;
    const n = DB.players || 0;
    return `${n ? `${n} other real ${n === 1 ? 'player has' : 'players have'}` : 'No other real players have'} played today's map so far, on top of the Machine's ${E.MACHINE.toLocaleString('en-US')} simulated players.`;
  }

  function showSummary(animate) {
    S.reviewing = null;
    setPhase('summary');
    renderSteps();
    const root = $('v-summary');
    root.textContent = '';
    const km = totalKm();
    root.appendChild(make('p', 'eyebrow', `Here Be Dragons No. ${dayNo} · ${shortDate}`));
    const total = make('div', 'sum-total');
    const big = make('span', 'big', fmtKm(animate && !reduceMotion ? 0 : km));
    total.appendChild(big);
    if (animate) {
      SFX.fanfare();
      if (!reduceMotion && km) {
        const t0 = performance.now(), dur = 1300;
        let lastTick = 0;
        const step = (now) => {
          const t = Math.min(1, (now - t0) / dur);
          big.textContent = fmtKm(km * (1 - Math.pow(1 - t, 3)));
          if (now - lastTick > 70 && t < 0.95) { lastTick = now; SFX.count(t); }
          if (t < 1 && big.isConnected) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }
    total.appendChild(make('span', 'unit', 'km off the beaten path'));
    root.appendChild(total);
    const ms = milestone(km);
    const next = E.MILESTONES.find((x) => x.km > km);
    const reached = make('p', 'reached');
    reached.appendChild(document.createTextNode('You made it to '));
    reached.appendChild(make('b', null, ms.name));
    reached.appendChild(document.createTextNode(next ? `, ${fmtKm(next.km - km)} km short of ${next.name}.` : '. Nobody goes further than that.'));
    root.appendChild(reached);
    root.appendChild(scaleBar(km, animate));

    const strip = make('div', 'strip' + (animate ? ' enter' : ''));
    record.answers.forEach((a, i) => {
      const pr = prompts[a.slot];
      const cell = make('div', 'cell');
      cell.style.setProperty('--i', i);
      cell.appendChild(flagBox(a.id ? countryOf(E.entity(pr, a.id)) : null, 'f'));
      cell.appendChild(make('span', 'e', tierOf(a.tier).emoji));
      strip.appendChild(cell);
    });
    root.appendChild(strip);

    const btns = make('div', 'btn-row');
    const copy = make('button', 'btn gold', 'Copy result'); copy.type = 'button';
    copy.addEventListener('click', () => { SFX.tap(); copyResult(copy); });
    const img = make('button', 'btn', 'Save image'); img.type = 'button';
    img.addEventListener('click', () => { SFX.tap(); saveImage(img); });
    btns.appendChild(copy); btns.appendChild(img);
    root.appendChild(btns);
    const fb = make('textarea', 'copybox'); fb.id = 'copy-fallback'; fb.hidden = true; fb.readOnly = true;
    root.appendChild(fb);

    const list = make('ol', 'list');
    record.answers.forEach((a) => {
      const pr = prompts[a.slot];
      const ent = a.id ? E.entity(pr, a.id) : null;
      const li = make('li');
      li.appendChild(flagBox(countryOf(ent), 'lf'));
      const midc = make('div');
      midc.appendChild(make('div', 'q', pr.text));
      midc.appendChild(make('div', 'a', ent ? labelOf(pr, ent) : 'No answer'));
      li.appendChild(midc);
      const k = make('div', 'k', fmtKm(a.km) + ' km');
      k.appendChild(make('span', null, tierOf(a.tier).name));
      li.appendChild(k);
      li.title = 'See this map again';
      li.addEventListener('click', () => review(a.slot));
      list.appendChild(li);
    });
    root.appendChild(list);
    root.appendChild(make('p', 'fine', 'Tap a prompt to see its map again.'));

    const nx = make('p', 'next');
    if (isArchive) nx.textContent = `This was an earlier map. Today's is No. ${todayNo}.`;
    else { nx.appendChild(document.createTextNode('Next map in ')); const b = make('b'); b.id = 'countdown'; nx.appendChild(b); }
    root.appendChild(nx);
    tickCountdown();

    const st = statsNow();
    const row = make('div', 'stat-row');
    [['Played', st.played], ['Streak', st.streak], ['Best', fmtKm(st.best)], ['Average', fmtKm(st.avg)]].forEach(([l, v]) => {
      const s = make('div', 'stat'); s.appendChild(make('b', null, String(v))); s.appendChild(make('span', null, l)); row.appendChild(s);
    });
    root.appendChild(row);
    const crowd = make('p', 'fine'); crowd.id = 'sum-crowd'; crowd.textContent = summaryCrowd();
    root.appendChild(crowd);

    // the map: your seven answers, joined in order
    requestAnimationFrame(() => {
      map.layout(false);
      map.clear();
      map.setPicker(pickerFor(null));
      const pts = [];
      const mk = [];
      record.answers.forEach((a) => {
        const pr = prompts[a.slot];
        const ent = a.id ? E.entity(pr, a.id) : null;
        if (!ent) return;
        const ll = pointFor(pr, ent);
        pts.push(ll);
        mk.push({ key: 's' + a.slot, type: 'me', small: true, num: String(a.slot + 1), flag: countryOf(ent), ll, z: 4, dragon: !!a.jackpot });
      });
      map.route(pts);
      map.marks(mk);
      if (pts.length) map.focusOn(pts, [], animate); else map.reset();
    });
  }

  function review(slot) {
    const a = record.answers[slot];
    if (!a) return;
    S.reviewing = slot;
    reveal(prompts[slot], a, false);
  }

  function scaleBar(km, animate) {
    const max = E.SCALE_KM;
    const wrap = make('div', 'scale' + (animate ? ' sail' : ''));
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `${fmtKm(km)} km on a scale from 0 to ${fmtKm(max)} km`);
    const track = make('div', 'scale-track');
    const pct = Math.min(100, (km / max) * 100);
    const fill = make('div', 'scale-fill'); fill.style.width = pct + '%';
    track.appendChild(fill);
    wrap.appendChild(track);
    const you = make('div', 'scale-you', km >= 6000 ? '🐉' : '⛵'); you.style.left = Math.max(3, Math.min(97, pct)) + '%';
    wrap.appendChild(you);
    const ticks = make('div', 'scale-ticks');
    for (let v = 0; v <= max; v += 1000) { const s = make('span', null, v === 0 ? '0 km' : fmtKm(v)); s.style.left = (v / max) * 100 + '%'; ticks.appendChild(s); }
    wrap.appendChild(ticks);
    return wrap;
  }

  let cdTimer = 0;
  function tickCountdown() {
    clearTimeout(cdTimer);
    const el = $('countdown');
    if (!el) return;
    const left = Math.max(0, E.EPOCH + todayNo * 86400000 - Date.now());
    const h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000), s = Math.floor((left % 60000) / 1000);
    el.textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (left > 0) cdTimer = setTimeout(tickCountdown, 1000); else el.textContent = 'now. Reload to play.';
  }

  // ------------------------------------------------------------------ share
  function resultText() {
    const lines = [`Here Be Dragons No. ${dayNo} 🗺️`, emojiLine(), `${fmtKm(totalKm())} km off the beaten path`];
    if (SITE_URL) lines.push(SITE_URL);
    return lines.join('\n');
  }
  function copyResult(btn) {
    const text = resultText();
    const fallback = () => { const box = $('copy-fallback'); box.hidden = false; box.value = text; box.focus(); box.select(); toast('Select the text and copy it'); };
    try {
      navigator.clipboard.writeText(text).then(() => { btn.textContent = 'Copied'; toast('Result copied. Paste it anywhere.'); setTimeout(() => { btn.textContent = 'Copy result'; }, 2200); }, fallback);
    } catch (e) { fallback(); }
  }

  async function saveImage(btn) {
    btn.disabled = true;
    try {
      let blob;
      try { blob = await renderShareImage(true); } catch (e) { blob = await renderShareImage(false); }
      const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
      if (dl) {
        try { await dl.save({ filename: `here-be-dragons-${dayNo}.png`, data: blob }); toast('Saved'); btn.disabled = false; return; }
        catch (e) { if (e && e.code === 'declined') { btn.disabled = false; return; } }
      }
      $('share-img').src = URL.createObjectURL(blob);
      openSheet('sheet-image');
    } catch (e) { toast('Could not draw the image here.'); }
    btn.disabled = false;
  }

  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

  // The share card: your seven flags, your distance, and the map where you went furthest.
  async function renderShareImage(withFlags) {
    try { await document.fonts.ready; } catch (e) { /* fonts are optional */ }
    const W = 1080, H = 1350, L = 72;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const col = { bg: '#ecdfbf', card: '#e2d0a4', sea: '#c5cdb2', land: '#f1e3c4', edge: '#3a2a1b', text: '#2b1f14', text2: '#4c3a28', text3: '#6b553b', gold: '#9c3a24', bad: '#8e1b12' };
    const WASH = ['#c8705c', '#d2a443', '#7fa35c', '#6f97b8', '#a07aa6'];
    const disp = '"IM Fell English", Georgia, serif', ui = '"EB Garamond", Georgia, serif';
    const emo = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.fillStyle = col.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = col.gold; g.font = `400 40px ${disp}`; g.fillText('Here Be Dragons', L, 100);
    g.fillStyle = col.text2; g.font = `500 30px ${ui}`; g.textAlign = 'right'; g.fillText(`No. ${dayNo} · ${shortDate}`, W - L, 100); g.textAlign = 'left';
    g.fillStyle = col.text; g.font = `400 176px ${disp}`; g.fillText(fmtKm(totalKm()), L - 8, 300);
    g.fillStyle = col.text2; g.font = `500 36px ${ui}`; g.fillText(`km off the beaten path · ${milestone(totalKm()).name}`, L, 356);
    // flags and tiers
    const fw = 120, fh = 90, gap = (W - 2 * L - 7 * fw) / 6, fy = 404;
    for (let i = 0; i < record.answers.length; i++) {
      const a = record.answers[i], x = L + i * (fw + gap);
      const pr = prompts[a.slot], ent = a.id ? E.entity(pr, a.id) : null;
      g.fillStyle = col.card; g.beginPath(); g.roundRect(x, fy, fw, fh, 10); g.fill();
      if (withFlags && ent && flagURL(countryOf(ent))) {
        const im = await loadImg(flagURL(countryOf(ent)));
        g.save(); g.beginPath(); g.roundRect(x, fy, fw, fh, 10); g.clip(); g.drawImage(im, x, fy, fw, fh); g.restore();
      } else if (!ent) {
        g.fillStyle = col.text3; g.font = `400 44px ${disp}`; g.textAlign = 'center'; g.fillText('?', x + fw / 2, fy + fh / 2 + 16); g.textAlign = 'left';
      }
      g.font = `52px ${emo}`; g.textAlign = 'center'; g.fillText(tierOf(a.tier).emoji, x + fw / 2, fy + fh + 64); g.textAlign = 'left';
    }
    // the map of the answer that went furthest, framed on where people answered
    const best = record.answers.filter((a) => a.id).sort((a, b) => b.km - a.km)[0] || record.answers[0];
    const pr = prompts[best.slot];
    let y = 640;
    g.fillStyle = col.text3; g.font = `700 24px ${ui}`; g.fillText(`MY FURTHEST ANSWER · PROMPT ${best.slot + 1}`, L, y);
    g.fillStyle = col.text; g.font = `400 44px ${disp}`; y = wrapText(g, pr.text, L, y + 52, W - 2 * L, 48);
    const mx = 40, my = y + 34, mw = W - 80, mh = H - 132 - my;
    g.fillStyle = col.sea; g.beginPath(); g.roundRect(mx, my, mw, mh, 18); g.fill();
    const ent = best.id ? E.entity(pr, best.id) : null;
    const myLL = ent ? pointFor(pr, ent) : null;
    const pins = allPins(pr, ent);
    const p0 = d3.geoNaturalEarth1().fitExtent([[16, 16], [mw - 16, mh - 16]], map.collection);
    const f = frameFor(p0, mw, mh, pins.filter((q) => q.ok).map((q) => q.ll), [myLL]) || { k: 1, tx: 0, ty: 0 };
    const proj = d3.geoNaturalEarth1().scale(p0.scale() * f.k).translate([p0.translate()[0] * f.k + f.tx + mx, p0.translate()[1] * f.k + f.ty + my]);
    const path = d3.geoPath(proj, g);
    g.save(); g.beginPath(); g.roundRect(mx, my, mw, mh, 18); g.clip();
    // the chart: hand-coloured countries with ink borders, the crowd's ink multiplied on top
    for (const ft of map.collection.features) { g.beginPath(); path(ft); g.fillStyle = col.land; g.fill(); g.save(); g.clip(); g.lineWidth = 9; g.strokeStyle = WASH[map.colours[ft.id] || 0]; g.globalAlpha = 0.8; g.stroke(); g.restore(); }
    g.beginPath(); path(map.collection); g.lineWidth = 1.3; g.strokeStyle = col.edge; g.stroke();
    g.globalCompositeOperation = 'multiply';
    const off = document.createElement('canvas'); off.width = mw; off.height = mh;
    const R = Math.round((7 + 3.2 * Math.log2(f.k)) * mw / 400);
    map.drawHeatOn(off.getContext('2d', { willReadFrequently: true }), mw, mh, pins.map((q) => { const s = proj(q.ll); return [s[0] - mx, s[1] - my]; }), R, HEAT_ALPHA);
    g.drawImage(off, mx, my);
    g.globalCompositeOperation = 'source-over';
    g.restore();
    g.lineWidth = 3; g.strokeStyle = col.edge; g.beginPath(); g.roundRect(mx, my, mw, mh, 18); g.stroke();
    if (ent) {
      const q = proj(myLL);
      g.fillStyle = '#f3e8cb'; g.strokeStyle = col.edge; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(q[0] - 33, q[1] - 72); g.lineTo(q[0] + 33, q[1] - 72); g.lineTo(q[0] + 33, q[1] - 21); g.lineTo(q[0] + 10, q[1] - 21); g.lineTo(q[0], q[1] - 9); g.lineTo(q[0] - 10, q[1] - 21); g.lineTo(q[0] - 33, q[1] - 21); g.closePath(); g.fill(); g.stroke();
      if (withFlags && flagURL(countryOf(ent))) { const im = await loadImg(flagURL(countryOf(ent))); g.drawImage(im, q[0] - 30, q[1] - 69, 60, 45); }
    }
    g.fillStyle = col.text2; g.font = `italic 400 32px ${disp}`;
    g.fillText(ent ? `The ink is everyone else. I said ${ent.n}.` : 'The ink is everyone else.', L, my + mh + 50);
    g.fillStyle = col.gold; g.font = `700 30px ${ui}`;
    g.fillText(SITE_URL ? `Where would you go? ${SITE_URL}` : 'Where would you go? Play Here Be Dragons.', L, H - 36);
    return await new Promise((res, rej) => { try { c.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'); } catch (e) { rej(e); } });
  }
  function wrapText(g, text, x, y, maxW, lh) {
    let line = '';
    for (const w of text.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t;
    }
    if (line) g.fillText(line, x, y);
    return y;
  }

  // ------------------------------------------------------------------ stats (this browser)
  function logDay() {
    const st = store.get(STATS_KEY) || { days: {} };
    st.days[dayNo] = totalKm();
    store.set(STATS_KEY, st);
  }
  function statsNow() {
    const st = store.get(STATS_KEY) || { days: {} };
    const days = Object.keys(st.days).map(Number).sort((a, b) => a - b);
    const vals = days.map((d) => st.days[d]);
    let streak = 0;
    for (let d = todayNo; st.days[d] != null; d--) streak++;
    if (!streak) for (let d = todayNo - 1; st.days[d] != null; d--) streak++;
    return {
      played: days.length, streak, best: vals.length ? Math.max(...vals) : 0,
      avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      days: days.slice(-10).reverse().map((d) => ({ d, km: st.days[d] })),
    };
  }
  function renderStatsSheet() {
    const st = statsNow();
    const row = $('stats-row'); row.textContent = '';
    [['Played', st.played], ['Streak', st.streak], ['Best', fmtKm(st.best)], ['Average', fmtKm(st.avg)]].forEach(([l, v]) => {
      const s = make('div', 'stat'); s.appendChild(make('b', null, String(v))); s.appendChild(make('span', null, l)); row.appendChild(s);
    });
    const list = $('stats-list'); list.textContent = '';
    if (!st.days.length) { const li = make('li'); li.style.cursor = 'default'; li.appendChild(make('span')); li.appendChild(make('div', 'q', 'Finish a map to start your logbook.')); list.appendChild(li); return; }
    for (const x of st.days) {
      const li = make('li'); li.style.cursor = 'default';
      li.appendChild(make('span', 'lf', String(x.d)));
      const mid = make('div');
      mid.appendChild(make('div', 'a', `No. ${x.d}`));
      mid.appendChild(make('div', 'q', E.dayDate(x.d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })));
      li.appendChild(mid);
      li.appendChild(make('div', 'k', fmtKm(x.km) + ' km'));
      list.appendChild(li);
    }
  }
  function renderTierTable() {
    const ul = $('tier-table'); ul.textContent = '';
    const rows = [
      [E.TIERS[3], 'The answers most people give', '20 to 166 km'],
      [E.TIERS[2], 'Off the main road', '167 to 411 km'],
      [E.TIERS[1], 'Few got here', '412 to 705 km'],
      [E.TIERS[0], 'Almost nobody named it', '706 to 1,000 km'],
      [E.SPECIAL.clever, 'The "obscure" answer lots of people gave', 'low'],
      [E.SPECIAL.jackpot, 'The hidden place the clue points to', '1,500 km'],
      [E.SPECIAL.lost, 'Wrong, or time ran out', '0 km'],
    ];
    for (const [t, d, r] of rows) {
      const li = make('li');
      li.appendChild(make('span', 'e', t.emoji));
      const mid = make('span'); mid.appendChild(make('b', null, t.name)); mid.appendChild(document.createTextNode(d)); li.appendChild(mid);
      li.appendChild(make('span', 'r', r));
      ul.appendChild(li);
    }
  }

  // ------------------------------------------------------------------ sheets
  let lastFocus = null;
  function openSheet(id) { lastFocus = document.activeElement; const s = $(id); s.hidden = false; const b = s.querySelector('[data-close]'); if (b) b.focus(); }
  function closeSheet(s) { s.hidden = true; if (lastFocus && lastFocus.focus && S.phase !== 'play') lastFocus.focus(); else if (S.phase === 'play') input.focus(); }
  document.querySelectorAll('.sheet').forEach((s) => s.addEventListener('click', (ev) => { if (ev.target === s || ev.target.closest('[data-close]')) closeSheet(s); }));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') document.querySelectorAll('.sheet:not([hidden])').forEach(closeSheet);
    if (ev.key === 'Enter' && S.phase === 'reveal' && document.activeElement === document.body) { const b = $('v-reveal').querySelector('.btn.gold'); if (b) b.click(); }
  });
  $('btn-help').addEventListener('click', () => { SFX.paper(); openSheet('sheet-help'); });
  $('btn-stats').addEventListener('click', () => { SFX.paper(); renderStatsSheet(); openSheet('sheet-stats'); });
  $('btn-start').addEventListener('click', () => { SFX.paper(); startDay(); });
  // the ship's bell in the corner: sound on or off
  const sb = $('btn-sound');
  const showSound = () => { sb.classList.toggle('off', !SFX.on); sb.setAttribute('aria-pressed', SFX.on ? 'true' : 'false'); sb.setAttribute('aria-label', SFX.on ? 'Sound on' : 'Sound off'); };
  if (!SFX.available) sb.hidden = true;
  sb.addEventListener('click', () => { SFX.set(!SFX.on); showSound(); if (SFX.on) SFX.tier('compass'); });
  showSound();

  // keep the answer box above the phone keyboard
  const vv = window.visualViewport;
  if (vv) {
    const onVV = () => {
      const kb = vv.height < window.innerHeight * 0.8;
      $('app').classList.toggle('kbd', kb);
      document.documentElement.style.setProperty('--vvh', vv.height + 'px');
    };
    vv.addEventListener('resize', onVV);
  }

  // ------------------------------------------------------------------ intro: the map at night
  function introLights() {
    const big = E.CITY.slice().sort((a, b) => b.p - a.p).slice(0, 700);
    const pins = [];
    const rnd = E.rng('lights');
    for (const c of big) {
      const n = 1 + Math.round(Math.max(0, Math.log10(c.p / 2e5)) * 2.2);
      for (let i = 0; i < n; i++) pins.push({ ll: [c.lon + (rnd() - 0.5) * 0.6, c.lat + (rnd() - 0.5) * 0.45] });
    }
    return pins;
  }

  // ------------------------------------------------------------------ boot
  function boot(hot) {
    record = (hot && hot.day === dayNo && hot.record) || store.get(DAY_KEY) || { answers: [], current: null };
    $('edition').textContent = `No. ${dayNo} · ${shortDate}${isArchive ? ' · archive' : ''}`;
    $('intro-eyebrow').textContent = isArchive ? `Archive · No. ${dayNo}` : `Today's map · No. ${dayNo}`;
    renderTierTable();
    initShared();
    if (record.answers.length >= N) { map.layout(true); map.setPicker(pickerFor(null)); showSummary(false); return; }
    if (record.current && record.current.slot === record.answers.length) { playSlot(record.current.slot, false); return; }
    setPhase('intro');
    renderSteps();
    if (record.answers.length) $('btn-start').textContent = `Continue: prompt ${record.answers.length + 1} of ${N}`;
    map.setPicker(pickerFor(null));
    requestAnimationFrame(() => { map.layout(true); });      // the bare chart, with its ships and serpent
  }

  const hotApi = window.claude && window.claude.hot;
  if (hotApi && hotApi.snapshot) hotApi.snapshot(() => ({ day: dayNo, record }));
  if (hotApi && hotApi.ready) hotApi.ready(boot); else boot((hotApi && hotApi.data) || {});
})();
