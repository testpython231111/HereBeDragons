// The sea creatures and ships of the antique chart: original SVG drawings, each centred on 0,0 and facing
// right (the page mirrors them when an ornament says flip). Engraved look: ink outlines, hatching, and
// a few hand-coloured washes.
const INK = '#3a2a1b';
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const PAPER = '#f4ead0', SAIL = '#f6edd5', SAIL2 = '#e6d6b0', RED = '#a8402a', OCHRE = '#c99a3e';

// ---------------------------------------------------------------- curve helpers
const bez = (P, t) => { const u = 1 - t; return [0, 1].map((i) => u * u * u * P[0][i] + 3 * u * u * t * P[1][i] + 3 * u * t * t * P[2][i] + t * t * t * P[3][i]); };
const bezD = (P, t) => { const u = 1 - t; return [0, 1].map((i) => 3 * u * u * (P[1][i] - P[0][i]) + 6 * u * t * (P[2][i] - P[1][i]) + 3 * t * t * (P[3][i] - P[2][i])); };
const poly = (pts) => 'M' + pts.map((p) => f1(p[0]) + ' ' + f1(p[1])).join(' L') + 'Z';
const line = (pts) => 'M' + pts.map((p) => f1(p[0]) + ' ' + f1(p[1])).join(' L');
// a body of varying width along a cubic curve: centre points, normals (pointing to the curve's right-hand
// side, which is the belly of an arch drawn left to right), and the two edges
function tube(P, w0, w1, n = 28) {
  const C = [], N = [], A = [], B = [], W = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = bez(P, t), d = bezD(P, t), L = Math.hypot(d[0], d[1]) || 1;
    const nn = [-d[1] / L, d[0] / L], w = w0 + (w1 - w0) * t;
    C.push(c); N.push(nn); W.push(w);
    A.push([c[0] - nn[0] * w / 2, c[1] - nn[1] * w / 2]);      // back
    B.push([c[0] + nn[0] * w / 2, c[1] + nn[1] * w / 2]);      // belly
  }
  return { C, N, A, B, W, outline: poly(A.concat(B.slice().reverse())) };
}
// little curling waves: a crest that rolls over, at x,y, width w, facing right (dir 1) or left (-1)
function curl(x, y, w, dir = 1) {
  const s = w / 10;
  return `<path d="M${f1(x - 5 * s * dir)} ${f1(y)} C${f1(x - 2 * s * dir)} ${f1(y - 1 * s)} ${f1(x)} ${f1(y - 3.6 * s)} ${f1(x + 2.6 * s * dir)} ${f1(y - 3.6 * s)} C${f1(x + 4.6 * s * dir)} ${f1(y - 3.6 * s)} ${f1(x + 5 * s * dir)} ${f1(y - 1.6 * s)} ${f1(x + 3.4 * s * dir)} ${f1(y - 1.2 * s)}"/>`;
}
const waves = (list, sw = 1) => `<g fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round" stroke-opacity=".85">` +
  list.map(([x, y, w]) => `<path d="M${f1(x)} ${f1(y)} q${f1(w / 4)} ${f1(-w / 7)} ${f1(w / 2)} 0 t${f1(w / 2)} 0"/>`).join('') + '</g>';

// ---------------------------------------------------------------- galleon, under sail to the right
function galleon() {
  let g = `<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">`;
  // the wake and the sea at her waterline
  g += `<g fill="none" stroke-width="1.5" stroke-opacity=".8">` +
    `<path d="M-62 33 q5 -3.4 10 0 t10 0 t10 0"/><path d="M-52 39 q5 -3 10 0 t10 0 t10 0 t10 0"/>` +
    `<path d="M24 37 q5 -3.4 10 0 t10 0 t10 0"/><path d="M-6 41 q5 -3 10 0 t10 0 t10 0"/></g>`;
  // masts and spars (behind the sails)
  g += `<g fill="none" stroke-width="2"><path d="M-4 10 V-70"/><path d="M22 6 V-56"/><path d="M-31 0 V-44"/><path d="M40 4 L64 -12"/></g>`;
  // standing rigging: shrouds and stays
  g += `<g fill="none" stroke-width=".7" stroke-opacity=".75"><path d="M-4 -70 L-24 2"/><path d="M-4 -70 L14 6"/><path d="M22 -56 L36 2"/>` +
    `<path d="M-4 -70 L22 -56"/><path d="M22 -56 L62 -11"/><path d="M-31 -44 L-4 -60"/><path d="M-31 -44 L-46 -6"/></g>`;
  // a billowing square sail: yard from x0 to x1 at y0, foot at y1, bellied forward by b
  const sail = (x0, x1, y0, y1, b, cross) => {
    const w = x1 - x0, h = y1 - y0;
    const d = `M${x0} ${y0} Q${x0 + w / 2} ${y0 - 2.4} ${x1} ${y0} C${x1 + b} ${y0 + h * 0.3} ${x1 + b} ${y0 + h * 0.75} ${x1 - 1} ${y1} Q${x0 + w / 2} ${y1 + 3.4} ${x0 + 1.5} ${y1} C${x0 + b * 0.7} ${y0 + h * 0.7} ${x0 + b * 0.6} ${y0 + h * 0.3} ${x0} ${y0}Z`;
    let s = `<path d="${d}" fill="${SAIL}" stroke-width="1.6"/>`;
    // the shadowed side and the belly lines of the cloth
    s += `<path d="M${x0 + w * 0.62} ${y0 + 1} C${x0 + w * 0.62 + b} ${y0 + h * 0.35} ${x0 + w * 0.62 + b} ${y0 + h * 0.7} ${x0 + w * 0.6} ${y1 + 1.8} L${x1 - 1} ${y1} C${x1 + b} ${y0 + h * 0.75} ${x1 + b} ${y0 + h * 0.3} ${x1} ${y0}Z" fill="${SAIL2}" stroke="none"/>`;
    s += `<g fill="none" stroke-width=".7" stroke-opacity=".6">` + [0.3, 0.5, 0.74].map((u) => `<path d="M${f1(x0 + w * u)} ${f1(y0 + 1.5)} C${f1(x0 + w * u + b * 0.8)} ${f1(y0 + h * 0.35)} ${f1(x0 + w * u + b * 0.8)} ${f1(y0 + h * 0.7)} ${f1(x0 + w * u - 0.5)} ${f1(y1 + 1.2)}"/>`).join('') + '</g>';
    if (cross) {
      const cx = x0 + w * 0.5 + b * 0.45, cy = y0 + h * 0.5, a = Math.min(w, h) * 0.3;
      s += `<path d="M${f1(cx - 2)} ${f1(cy - a)} H${f1(cx + 2)} V${f1(cy - 2)} H${f1(cx + a * 0.9)} V${f1(cy + 2)} H${f1(cx + 2)} V${f1(cy + a)} H${f1(cx - 2)} V${f1(cy + 2)} H${f1(cx - a * 0.9)} V${f1(cy - 2)} H${f1(cx - 2)}Z" fill="${RED}" stroke-width=".7"/>`;
    }
    s += `<path d="M${x0 - 2} ${y0} H${x1 + 2}" stroke-width="2"/>`;           // the yard
    return s;
  };
  // the mizzen's lateen, then the fore sails, then the main sails in front
  g += `<path d="M-14 -50 L-48 -4 Q-36 -10 -31 -8 Q-28 -30 -14 -50Z" fill="${SAIL}" stroke-width="1.5"/><path d="M-14 -50 L-48 -4" stroke-width="1.8"/>`;
  g += `<path d="M-22 -40 L-40 -10 M-19 -36 L-34 -9" fill="none" stroke-width=".7" stroke-opacity=".6"/>`;
  g += sail(10, 34, -48, -30, 6) + sail(8, 36, -26, -4, 7);
  g += sail(-16, 8, -64, -42, 6) + sail(-19, 11, -38, -6, 8, true);
  // spritsail under the bowsprit
  g += `<path d="M47 -4 L59 -8.5 C61 -3 60 2 57.5 5.5 L48 7 C49.5 3 49.5 -1 47 -4Z" fill="${SAIL}" stroke-width="1.3"/>`;
  // the hull: a high stern castle aft, a lower waist and a forecastle, the beakhead forward
  const hull = 'M-50 -8 L-30 -8 L-28 0 C-14 5 8 6 24 2 L26 -4 L40 -4 L42 4 L56 9 L42 13 C37 24 22 31 2 31 C-20 31 -36 26 -44 17 Z';
  g += `<path d="${hull}" fill="#8b5a34" stroke-width="1.9"/>`;
  // a coloured band with the gun ports, the wales, and hatching on the turn of the hull
  g += `<path d="M-46 6 C-26 12 10 13 41 8 L42 13 C24 18 -22 18 -45 12Z" fill="${OCHRE}" stroke-width="1"/>`;
  g += `<g fill="${INK}" stroke="none">${[-34, -24, -14, -4, 6, 16, 26].map((x) => `<rect x="${x}" y="${f1(9.4 + Math.abs(x - 2) * 0.04)}" width="3.6" height="3.2" rx=".6"/>`).join('')}</g>`;
  g += `<g fill="none" stroke-width=".9"><path d="M-44 17 C-20 24 16 24 40 15"/><path d="M-37 23 C-16 28 14 28 31 22"/></g>`;
  g += `<g fill="none" stroke-width=".6" stroke-opacity=".6">${[-30, -22, -14, -6, 2, 10, 18, 26].map((x) => `<path d="M${x} ${f1(19.5 + Math.abs(x) * 0.02)} l1.4 6.5"/>`).join('')}</g>`;
  // stern castle windows and rail
  g += `<path d="M-50 -8 L-30 -8" stroke-width="2.2"/><g fill="${OCHRE}" stroke-width=".7"><rect x="-46" y="-4" width="3.4" height="4"/><rect x="-40" y="-4" width="3.4" height="4"/><rect x="-34" y="-4" width="3.4" height="4"/></g>`;
  // the stern lantern and the pennants streaming forward
  g += `<path d="M-50 -8 V-16" stroke-width="1.6"/><circle cx="-50" cy="-17.5" r="2.2" fill="${OCHRE}" stroke-width="1"/>`;
  const pennant = (x, y, len) => `<path d="M${x} ${y} C${x + len * 0.3} ${y - 4} ${x + len * 0.6} ${y + 3} ${x + len} ${y - 1} L${x + len * 0.84} ${y + 1.4} L${x + len * 0.96} ${y + 3.4} C${x + len * 0.6} ${y + 6} ${x + len * 0.3} ${y + 1} ${x} ${y + 4}Z" fill="${RED}" stroke-width="1"/>`;
  g += pennant(-4, -76, 30) + pennant(22, -62, 22) + pennant(-31, -50, 18);
  g += `<path d="M-4 -70 V-77 M22 -56 V-63 M-31 -44 V-51" stroke-width="1.8"/>`;
  return g + '</g>';
}

// ---------------------------------------------------------------- sea serpent, two coils, a curled tail and a raised head
function serpent() {
  const BODY = '#7b9868', DARK = '#4f6844', BELLY = '#c3c48c', FIN = '#b4553a', WL = 30;   // WL: the waterline
  let g = `<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">`;
  g += `<defs><clipPath id="hbd-sea-above"><rect x="-130" y="-90" width="260" height="${90 + WL}"/></clipPath></defs>`;
  const N = 36;
  const part = (P, w0, w1, crest) => {
    const T = tube(P, w0, w1, N);
    let s = '';
    // the crest: a red fin held up by spines, taller in the middle, scalloped between them
    if (crest) {
      const [a, b, hmax] = crest, i0 = Math.round(a * N), i1 = Math.round(b * N);
      const tip = (i) => { const u = (i - i0) / (i1 - i0), h = hmax * (0.45 + 0.55 * Math.sin(Math.PI * u)); return [T.A[i][0] - T.N[i][0] * h, T.A[i][1] - T.N[i][1] * h]; };
      let d = `M${f1(T.A[i0][0])} ${f1(T.A[i0][1])}`, spines = '';
      for (let i = i0; i <= i1; i += 3) {
        const t = tip(i);
        if (i === i0) d += ` L${f1(t[0])} ${f1(t[1])}`;
        else { const m = T.A[i - 1], q = tip(i - 2); d += ` Q${f1((m[0] + q[0]) / 2)} ${f1((m[1] + q[1]) / 2)} ${f1(t[0])} ${f1(t[1])}`; }
        spines += `M${f1(T.A[i][0])} ${f1(T.A[i][1])} L${f1(t[0])} ${f1(t[1])}`;
      }
      d += ` L${f1(T.A[i1][0])} ${f1(T.A[i1][1])} ` + T.A.slice(i0, i1 + 1).reverse().map((p) => `L${f1(p[0])} ${f1(p[1])}`).join(' ') + 'Z';
      s += `<path d="${d}" fill="${FIN}" stroke-width="1"/><path d="${spines}" fill="none" stroke-width=".7"/>`;
    }
    s += `<path d="${T.outline}" fill="${BODY}" stroke="none"/>`;
    // the paler belly along the underside, with its plates
    const inner = T.C.map((c, i) => [c[0] + T.N[i][0] * T.W[i] * 0.24, c[1] + T.N[i][1] * T.W[i] * 0.24]);
    s += `<path d="${poly(inner.concat(T.B.slice().reverse()))}" fill="${BELLY}" stroke="none"/>`;
    s += `<path d="${line(inner)}" fill="none" stroke-width=".7"/>`;
    s += `<g fill="none" stroke-width=".5" stroke-opacity=".55">` + T.C.map((c, i) => (i % 2 ? '' : `<path d="${line([inner[i], T.B[i]])}"/>`)).join('') + '</g>';
    // a shadow along the back, and rows of scales
    const back = T.C.map((c, i) => [c[0] - T.N[i][0] * T.W[i] * 0.22, c[1] - T.N[i][1] * T.W[i] * 0.22]);
    s += `<path d="${poly(T.A.concat(back.slice().reverse()))}" fill="${DARK}" fill-opacity=".5" stroke="none"/>`;
    s += `<g fill="none" stroke-width=".55" stroke-opacity=".8">`;
    for (let i = 1; i < T.C.length - 1; i += 2) {
      const c = T.C[i], n = T.N[i], w = T.W[i], tx = -n[1], ty = n[0];
      for (const off of (i % 4 === 1 ? [-0.3, 0.02] : [-0.14])) {
        const x = c[0] + n[0] * w * off, y = c[1] + n[1] * w * off, r = w * 0.12;
        s += `<path d="M${f1(x - n[0] * r - tx * r)} ${f1(y - n[1] * r - ty * r)} Q${f1(x + tx * r * 0.6)} ${f1(y + ty * r * 0.6)} ${f1(x + n[0] * r - tx * r)} ${f1(y + n[1] * r - ty * r)}"/>`;
      }
    }
    s += '</g>';
    s += `<path d="${T.outline}" fill="none" stroke-width="1.7"/>`;
    return s;
  };
  let body = '';
  // the tail: out of the water, curled back over, ending in a fin held in the air
  {
    const P = [[-88, WL + 6], [-88, WL - 34], [-104, WL - 40], [-118, WL - 32]];
    body += part(P, 7.5, 2.4, null);
    const e = P[3], d = [P[3][0] - P[2][0], P[3][1] - P[2][1]], L = Math.hypot(d[0], d[1]), a = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
    body += `<g transform="translate(${f1(e[0])} ${f1(e[1])}) rotate(${f1(a)})"><path d="M-1 0 C3 -2 7 -7 9 -11 C9 -6 8 -3 10 -1 C8 0 8 1 10 2 C8 4 9 7 9 11 C7 7 3 2 -1 0Z" fill="${FIN}" stroke-width="1"/>` +
      `<path d="M1 0 L8 -8 M1 0 L9 0 M1 0 L8 8" fill="none" stroke-width=".55"/></g>`;
  }
  // two coils, growing toward the head and leaning the way it swims
  body += part([[-80, WL + 6], [-86, WL - 22], [-50, WL - 36], [-46, WL + 6]], 9, 11, [0.22, 0.8, 6]);
  body += part([[-34, WL + 8], [-42, WL - 38], [12, WL - 60], [16, WL + 8]], 12, 14.5, [0.2, 0.8, 8.5]);
  // the neck rising to the head
  body += part([[28, WL + 8], [24, WL - 28], [46, WL - 56], [70, WL - 55]], 16, 12, [0.16, 0.86, 8.5]);
  g += `<g clip-path="url(#hbd-sea-above)">${body}</g>`;
  // the head, jaws open, facing right
  g += `<g transform="translate(68 ${WL - 56})">`;
  // the gill frill and the swept-back horn
  g += `<path d="M0 -6 L-10 -17 L-4 -8 L-15 -9 L-5 -2 L-15 3 L-3 2 L-10 9 L1 5Z" fill="${FIN}" stroke-width="1.1"/>`;
  g += `<path d="M7 -7 C3 -15 -3 -21 -12 -24 C-7 -16 -3 -10 -1 -4Z" fill="${FIN}" stroke-width="1.1"/>`;
  // lower jaw, the open mouth, upper jaw
  g += `<path d="M1 6 C10 9 22 10 34 7 C33 12 26 15 17 16 C9 17 3 14 -1 10Z" fill="${BODY}" stroke-width="1.5"/>`;
  g += `<path d="M2 11 C8 14 16 15 24 13" fill="none" stroke-width=".6" stroke-opacity=".7"/>`;
  g += `<path d="M9 3 L36 2.6 C28 7 18 8.6 9 6.6Z" fill="${RED}" stroke-width=".9"/>`;
  g += `<path d="M-5 -4 C1 -12 12 -13 21 -10 C29 -8 36 -7 42 -4.4 C42 -1.4 40 0.8 37 2 L12 3.2 C6 4 0 3 -5 0Z" fill="${BODY}" stroke-width="1.6"/>`;
  g += `<path d="M1 -9.6 C10 -13 19 -12 26 -8.6 C18 -8.6 10 -7.4 1 -5Z" fill="${DARK}" fill-opacity=".45" stroke="none"/>`;
  g += `<g fill="#fbf4e2" stroke-width=".55">${[15, 20, 25, 30].map((x) => `<path d="M${x} 2.8 L${x + 1.4} 6 L${x + 2.8} 2.7Z"/>`).join('')}${[14, 20, 26].map((x) => `<path d="M${x} 7.6 L${x + 1.3} 4.8 L${x + 2.6} 7.2Z"/>`).join('')}</g>`;
  g += `<path d="M26 5.8 C33 6.6 38 9.4 45 8.6 M45 8.6 L49.5 5.8 M45 8.6 L49 11.6" fill="none" stroke="${RED}" stroke-width="1.4"/>`;
  g += `<ellipse cx="13" cy="-4.6" rx="3.3" ry="2.7" fill="#fbf4e2" stroke-width=".9"/><circle cx="13.9" cy="-4.6" r="1.45" fill="${INK}" stroke="none"/>`;
  g += `<path d="M7 -7.8 C10.6 -10.8 16.4 -10.8 19.6 -8" fill="none" stroke-width="1.5"/>`;
  g += `<path d="M37 -4.8 c1.4 -1.3 3.1 -0.6 2.7 0.9" fill="none" stroke-width=".9"/>`;
  g += `<path d="M2 -1 C6 1 9 1.6 12 1" fill="none" stroke-width=".7" stroke-opacity=".7"/>`;
  g += '</g>';
  // the sea where the coils go in and out
  g += waves([[-128, WL + 2, 14], [-106, WL + 4, 10], [-70, WL + 4, 14], [-42, WL + 1.5, 10], [-14, WL + 4.5, 16], [10, WL + 1.5, 12], [48, WL + 3, 16], [70, WL + 1, 12]], 1.2);
  // foam where the body breaks the surface
  g += `<g fill="none" stroke-width="1.1" stroke-opacity=".9">${[[-94, -1], [-82, 1], [-86, -1], [-40, 1], [-41, -1], [22, 1], [20, -1], [34, 1]].map(([x, d]) => curl(x, WL + 1, 8, d)).join('')}</g>`;
  return g + '</g>';
}

// ---------------------------------------------------------------- whale, spouting, its tail raised behind
function whale() {
  const BODY = '#7d9295', DARK = '#5a6e72', BELLY = '#d8d0b2', WL = 26;
  let g = `<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">`;
  // the tail flukes out of the water behind
  g += `<path d="M-50 ${WL + 2} C-50 ${WL - 8} -52 ${WL - 16} -56 ${WL - 22} C-62 ${WL - 22} -68 ${WL - 26} -72 ${WL - 34} C-64 ${WL - 32} -58 ${WL - 31} -54 ${WL - 28} C-52 ${WL - 34} -46 ${WL - 39} -38 ${WL - 41} C-41 ${WL - 34} -46 ${WL - 28} -48 ${WL - 22} C-44 ${WL - 14} -42 ${WL - 6} -42 ${WL + 2}Z" fill="${BODY}" stroke-width="1.6"/>`;
  g += `<path d="M-56 ${WL - 22} C-52 ${WL - 26} -50 ${WL - 26} -48 ${WL - 22}" fill="none" stroke-width=".8"/>`;
  g += `<g fill="none" stroke-width=".6" stroke-opacity=".7"><path d="M-66 ${WL - 30} L-58 ${WL - 26}"/><path d="M-62 ${WL - 31} L-56 ${WL - 27}"/><path d="M-44 ${WL - 37} L-48 ${WL - 30}"/><path d="M-41 ${WL - 39} L-45 ${WL - 32}"/></g>`;
  // the great back and head, rising from the water to the right
  const body = `M-30 ${WL + 2} C-24 ${WL - 14} -6 ${WL - 26} 16 ${WL - 30} C34 ${WL - 33} 48 ${WL - 28} 56 ${WL - 18} C61 ${WL - 12} 63 ${WL - 6} 62 ${WL - 1} L60 ${WL + 2}Z`;
  g += `<path d="${body}" fill="${BODY}" stroke-width="1.9"/>`;
  // the shadowed back, engraved with lines that follow its curve
  g += `<path d="M-30 ${WL + 2} C-24 ${WL - 14} -6 ${WL - 26} 16 ${WL - 30} C26 ${WL - 31.5} 34 ${WL - 31} 40 ${WL - 29} C26 ${WL - 26} 4 ${WL - 20} -12 ${WL - 8} C-18 ${WL - 4} -22 ${WL} -24 ${WL + 2}Z" fill="${DARK}" fill-opacity=".5" stroke="none"/>`;
  g += `<g fill="none" stroke-width=".65" stroke-opacity=".75" stroke-dasharray="5 2.2">` +
    `<path d="M-22 ${WL - 3} C-14 ${WL - 15} 2 ${WL - 23} 20 ${WL - 26} C30 ${WL - 27.5} 40 ${WL - 26} 48 ${WL - 21}"/>` +
    `<path d="M-14 ${WL + 1} C-6 ${WL - 9} 8 ${WL - 16} 24 ${WL - 19}"/>` +
    `<path d="M-4 ${WL + 1} C4 ${WL - 4} 12 ${WL - 8} 22 ${WL - 10}"/></g>`;
  // the jaw: pale, with grooves, the long mouth line and its teeth
  g += `<path d="M30 ${WL + 2} C34 ${WL - 4} 44 ${WL - 8} 62 ${WL - 4} L62 ${WL - 1} L60 ${WL + 2}Z" fill="${BELLY}" stroke-width="1.2"/>`;
  g += `<g fill="none" stroke-width=".55" stroke-opacity=".7"><path d="M38 ${WL - 0.5} C44 ${WL - 3} 50 ${WL - 4} 58 ${WL - 2}"/><path d="M36 ${WL + 1.6} C44 ${WL - 0.8} 52 ${WL - 1.6} 59 ${WL}"/></g>`;
  g += `<path d="M32 ${WL - 7} C40 ${WL - 7} 50 ${WL - 9} 62 ${WL - 5}" fill="none" stroke-width="1.4"/>`;
  g += `<g fill="#fbf4e2" stroke-width=".5">${[38, 43, 48, 53, 58].map((x, i) => `<path d="M${x} ${f1(WL - 7.2 - i * 0.4)} l1.2 2.6 l1.2 -2.8Z"/>`).join('')}</g>`;
  // eye with brow and wrinkles
  g += `<ellipse cx="37" cy="${WL - 14}" rx="2.8" ry="2.3" fill="#fbf4e2" stroke-width=".9"/><circle cx="37.6" cy="${WL - 14}" r="1.3" fill="${INK}" stroke="none"/>`;
  g += `<path d="M32 ${WL - 17} C35 ${WL - 19.4} 40 ${WL - 19.4} 42.5 ${WL - 16.6}" fill="none" stroke-width="1.3"/>`;
  g += `<g fill="none" stroke-width=".6" stroke-opacity=".7"><path d="M42 ${WL - 12} c2 1 3 2.6 3 4.4"/><path d="M45 ${WL - 13} c2 1 3 2.6 3 4.4"/></g>`;
  // flipper
  g += `<path d="M14 ${WL - 4} C20 ${WL - 6} 28 ${WL - 4} 30 ${WL + 2} C24 ${WL - 1} 18 ${WL - 1} 12 ${WL + 2}Z" fill="${BODY}" stroke-width="1.2"/>`;
  // the spout: twin plumes from the blowhole, curling over and falling in drops
  const plume = (dir) => {
    const X = (v) => f1(22 + dir * v);
    return `<path d="M${X(0)} ${WL - 30} C${X(1)} ${WL - 42} ${X(6)} ${WL - 52} ${X(16)} ${WL - 58} C${X(25)} ${WL - 62} ${X(33)} ${WL - 58} ${X(34)} ${WL - 50} C${X(34.5)} ${WL - 45} ${X(31)} ${WL - 43} ${X(28)} ${WL - 45} C${X(30)} ${WL - 48} ${X(28)} ${WL - 52} ${X(23)} ${WL - 51} C${X(14)} ${WL - 49} ${X(8)} ${WL - 40} ${X(5)} ${WL - 30}Z" fill="#f6efdc" stroke-width="1.1"/>` +
      `<path d="M${X(2)} ${WL - 33} C${X(5)} ${WL - 44} ${X(10)} ${WL - 51} ${X(18)} ${WL - 55}" fill="none" stroke-width=".6" stroke-opacity=".7"/>`;
  };
  g += plume(-1) + plume(1);
  g += `<path d="M22 ${WL - 30} C21 ${WL - 40} 23 ${WL - 50} 22 ${WL - 60} M18.5 ${WL - 31} C17 ${WL - 40} 18 ${WL - 47} 17 ${WL - 53} M25.5 ${WL - 31} C27 ${WL - 40} 26 ${WL - 47} 27 ${WL - 53}" fill="none" stroke-width=".7" stroke-opacity=".75"/>`;
  g += `<g fill="#f6efdc" stroke-width=".8">${[[-9, WL - 40, 1.7], [-12, WL - 33, 1.3], [-6, WL - 28, 1], [53, WL - 40, 1.7], [56, WL - 33, 1.3], [50, WL - 28, 1], [22, WL - 64, 1.5], [15, WL - 61, 1], [29, WL - 61, 1]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
  // the sea around it
  g += waves([[-80, WL + 1, 14], [-62, WL + 4, 12], [-38, WL + 1, 12], [-16, WL + 4.5, 14], [8, WL + 2.5, 14], [34, WL + 4.5, 14], [60, WL + 1.5, 14]], 1.2);
  g += `<g fill="none" stroke-width="1.1" stroke-opacity=".9">${curl(-46, WL + 2, 9, -1)}${curl(-28, WL + 2, 9, -1)}${curl(64, WL + 2, 9, 1)}</g>`;
  return g + '</g>';
}

module.exports = { galleon, serpent, whale, INK };
