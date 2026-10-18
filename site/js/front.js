// The front page: what Afterglow is, in one screen, with the gain shown happening.
// Markup only. app.js supplies the data and helpers (ctx), motion.js drives the moves, hero3d.js lights the slab.
// ctx: { runs, passports, loading, esc, num, cellSvg, fmtDay }
window.SSFront = (function () {
  const PAIRS = { A: [[1, 2], [3, 4]], B: [[1, 3], [2, 4]], C: [[1, 4], [2, 3]] };
  const PAIR_WORDS = { A: "1+2 and 3+4", B: "1+3 and 2+4", C: "1+4 and 2+3" };
  const DEMO_STRONG = [1, 3]; // the demo batch: panels 1 and 3 strong, 2 and 4 weak behind film

  // ---------- drawings ----------
  const octagon = (x, y, w, h, c) => `${x + c},${y} ${x + w - c},${y} ${x + w},${y + c} ${x + w},${y + h - c} ${x + w - c},${y + h} ${x + c},${y + h} ${x},${y + h - c} ${x},${y + c}`;
  // one cell inside a larger svg: navy slab, fingers, busbars, its number; weak cells wear the film
  function miniCell(x, y, w, h, n, strong) {
    const c = Math.min(w, h) * 0.13;
    const pts = octagon(x, y, w, h, c);
    let fingers = "";
    for (let fy = y + 7; fy < y + h - 4; fy += 7) fingers += `<line x1="${x + 3}" y1="${fy}" x2="${x + w - 3}" y2="${fy}" stroke="rgba(255,255,255,0.09)"/>`;
    const bus = [0.3, 0.7].map((f) => `<line x1="${x + w * f}" y1="${y + 2}" x2="${x + w * f}" y2="${y + h - 2}" stroke="rgba(255,255,255,0.42)" stroke-width="1.5"/>`).join("");
    return `<polygon points="${pts}" fill="var(--cell)"/>${fingers}${bus}${strong ? "" : `<polygon points="${pts}" fill="var(--film)"/>`}<text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle">${n}</text>`;
  }
  // The hero's drawing. Both svgs share the slot's box; the sun's frame reaches 14% above it (400x342 against the
  // panel's 400x300, so nothing is stretched), which puts the sun in the hero's top left corner without meeting text.
  // The panel is drawn after the sun, so the beams end where they land on its face.
  const SUN = { cx: 30, cy: 58, r: 18 };
  const FACE = { x: 48, y: 64, w: 304, h: 172, c: 30 };
  function sunSvg() {
    const { cx, cy, r } = SUN;
    const rays = Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2 - 0.4, len = 7 + ((i * 7) % 5), r0 = r + 7 + ((i * 3) % 3);   // uneven, as if drawn by hand
      const p = (rr) => `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
      return `<path d="M${p(r0)} L${p(r0 + len)}" pathLength="1" style="--i:${i}"/>`;
    }).join("");
    // three beams fan out from the disc's edge and run down onto the face (sun frame = panel frame shifted down by 42)
    const beams = [[130, 172], [205, 156], [285, 146]].map(([ex, ey], i) => {
      const a = Math.atan2(ey - cy, ex - cx), sx = cx + Math.cos(a) * (r + 9), sy = cy + Math.sin(a) * (r + 9);
      const mx = (sx + ex) / 2, my = (sy + ey) / 2 - 12;   // a slight sag, like a drawn line
      return `<path class="sun__beam" style="--b:${i}" d="M${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex} ${ey}"/>`;
    }).join("");
    const d = `M${cx} ${cy - r} C${cx + 12} ${cy - r - 1} ${cx + r + 1} ${cy - 11} ${cx + r} ${cy + 1} C${cx + r - 1} ${cy + 13} ${cx + 10} ${cy + r + 1} ${cx - 1} ${cy + r} C${cx - 13} ${cy + r - 1} ${cx - r - 1} ${cy + 10} ${cx - r} ${cy - 1} C${cx - r + 1} ${cy - 12} ${cx - 11} ${cy - r + 1} ${cx} ${cy - r} Z`;
    return `<svg class="hero__sun" viewBox="0 0 400 342" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g class="sun__rays">${rays}</g>
      <path class="sun__disc" d="${d}" pathLength="1"/>
      <g class="sun__beams">${beams}</g>
    </svg>`;
  }
  // A landscape drawn by hand along the bottom of a white block. Everything is pen work: each ridge is a line sampled
  // every few units with a tremor, inked twice a little out of register, hatched on its shaded slope; grass is tufts of
  // three strokes; trees are a bent trunk and a scribbled crown. The same seed every time, so the drawing never changes.
  function landscape() {
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const jit = (k) => (rnd() - 0.5) * k;
    const W = 1600;
    const ridge = (y0, a1, w1, p1, a2, w2, p2) => { const pts = []; for (let x = -24; x <= W + 24; x += 14) pts.push([x + jit(3), y0 + a1 * Math.sin(x / w1 + p1) + a2 * Math.sin(x / w2 + p2) + jit(3)]); return pts; };
    const line = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const hill = (pts, cls) => {
      const shifted = pts.map(([x, y]) => [x + 3 + jit(2), y - 3 + jit(2)]);
      let hatch = "";
      for (let i = 2; i < pts.length - 2; i += 2) {   // short strokes down the slopes that face away from the light
        const slope = pts[i + 1][1] - pts[i - 1][1];
        if (slope > 1.5) { const [x, y] = pts[i]; hatch += `M${(x + jit(2)).toFixed(1)} ${(y + 7).toFixed(1)} L${(x - 9 + jit(3)).toFixed(1)} ${(y + 24 + jit(4)).toFixed(1)} `; }
      }
      return `<path class="land__fill ${cls}" d="${line(pts)} L${W + 24} 330 L-24 330 Z"/><path class="land__ink" d="${line(pts)}"/><path class="land__ink land__ink--2" d="${line(shifted)}"/><path class="land__hatch" d="${hatch}"/>`;
    };
    const tuft = (x, y) => `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l ${(-4 + jit(2)).toFixed(1)} ${(-13 + jit(4)).toFixed(1)} M${(x + 3).toFixed(1)} ${y.toFixed(1)} l ${jit(2).toFixed(1)} ${(-16 + jit(4)).toFixed(1)} M${(x + 6).toFixed(1)} ${y.toFixed(1)} l ${(4 + jit(2)).toFixed(1)} ${(-12 + jit(4)).toFixed(1)}"/>`;
    const tree = (x, y, h) => {
      let crown = "";
      for (let k = 0; k < 7; k++) { const cx = x + jit(h * 0.5), cy = y - h * 0.78 + jit(h * 0.4), rx = h * 0.26 + jit(h * 0.1), ry = h * 0.2 + jit(h * 0.08), t = jit(1); crown += `M${(cx - rx).toFixed(1)} ${cy.toFixed(1)} C ${(cx - rx).toFixed(1)} ${(cy - ry * 1.3 + t).toFixed(1)}, ${(cx + rx).toFixed(1)} ${(cy - ry * 1.3 - t).toFixed(1)}, ${(cx + rx).toFixed(1)} ${cy.toFixed(1)} C ${(cx + rx).toFixed(1)} ${(cy + ry * 1.3).toFixed(1)}, ${(cx - rx).toFixed(1)} ${(cy + ry * 1.3).toFixed(1)}, ${(cx - rx).toFixed(1)} ${cy.toFixed(1)} `; }
      return `<path class="land__trunk" d="M${x} ${y.toFixed(1)} C ${(x + 2 + jit(3)).toFixed(1)} ${(y - h * 0.2).toFixed(1)}, ${(x - 2 + jit(3)).toFixed(1)} ${(y - h * 0.4).toFixed(1)}, ${(x + jit(2)).toFixed(1)} ${(y - h * 0.62).toFixed(1)}"/><path class="land__crown" d="${crown}"/>`;
    };
    const back = ridge(196, 26, 190, 0.6, 12, 73, 2.1), mid = ridge(236, 20, 240, 2.4, 9, 61, 0.3), front = ridge(268, 12, 300, 1.1, 6, 47, 1.7);
    const yAt = (pts, x) => { const i = Math.max(0, Math.min(pts.length - 1, Math.round((x + 24) / 14))); return pts[i][1]; };
    const tufts = [90, 210, 330, 470, 560, 690, 820, 940, 1060, 1190, 1290, 1420, 1530].map((x) => tuft(x + jit(20), yAt(front, x) - 2)).join("");
    return `<svg class="landscape" viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      ${hill(back, "land__back")}${tree(1180, yAt(back, 1180) + 4, 70)}${tree(1225, yAt(back, 1225) + 3, 48)}
      ${hill(mid, "land__mid")}${tree(330, yAt(mid, 330) + 3, 62)}
      ${hill(front, "land__front")}
      <g class="land__grass">${tufts}</g>
    </svg>`;
  }
  // the cell as a drawing: its shadow, its thickness, its face with fingers and busbars, and the sunlight on the face
  // as an amber wash and hatching from the top left corner, whose reach motion.js sets from the way the panel turns.
  // Under a fine pointer a liquid window follows the cursor and shows what the bench sees under the skin: the cell's
  // electroluminescence image, fingers glowing (after the Lando Norris site's helmet reveal).
  function panelSvg() {
    const { x, y, w, h, c } = FACE, face = octagon(x, y, w, h, c);
    let fingers = "", glow = "";
    for (let fy = y + 12; fy < y + h - 6; fy += 10) {
      fingers += `<path d="M${x + 8} ${fy} Q ${x + w / 2} ${fy + ((fy / 10) % 2 ? 0.8 : -0.8)} ${x + w - 8} ${fy}" stroke="rgba(255,255,255,0.1)" stroke-width="1.4"/>`;
      glow += `<path d="M${x + 8} ${fy} Q ${x + w / 2} ${fy + ((fy / 10) % 2 ? 0.8 : -0.8)} ${x + w - 8} ${fy}" stroke-width="1.1" opacity="${(0.55 + ((fy * 7) % 5) * 0.08).toFixed(2)}"/>`;
    }
    const bus = [0.25, 0.5, 0.75].map((f) => `<line x1="${x + w * f}" y1="${y + 4}" x2="${x + w * f}" y2="${y + h - 4}" stroke="rgba(255,255,255,0.46)" stroke-width="5"/>`).join("");
    let hatch = "";
    for (let hx = x - h; hx < x + w; hx += 13) hatch += `<line x1="${hx}" y1="${y + h}" x2="${hx + h}" y2="${y}"/>`;   // 45° strokes, lit from the top left
    return `<svg class="hero__panel" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="pnl-face"><polygon points="${face}"/></clipPath>
        <clipPath id="pnl-lit"><polygon data-lit-poly points="0,0 400,0 0,300"/></clipPath>
      </defs>
      <polygon class="pnl__shadow" points="${face}" fill="var(--ink)" opacity="0.12"/>
      <polygon points="${octagon(x, y + 9, w, h, c)}" fill="#0e1838"/>
      <polygon points="${face}" fill="var(--cell)" stroke="#0e1838" stroke-width="2.5" stroke-linejoin="round"/>
      <g clip-path="url(#pnl-face)" fill="none">${fingers}${bus}</g>
      <g class="pnl__lit" clip-path="url(#pnl-face)"><g clip-path="url(#pnl-lit)"><polygon points="${face}" fill="var(--sun)" opacity="0.2"/><g stroke="var(--sun)" stroke-width="1.8" opacity="0.55" stroke-linecap="round">${hatch}</g></g></g>
      <clipPath id="pnl-blob"><path class="pnl__blob" data-blob-at transform="translate(-999 -999)" d="M0 -62 C 40 -70, 78 -40, 72 -4 C 66 34, 36 66, -4 62 C -46 58, -74 30, -70 -10 C -66 -46, -38 -58, 0 -62 Z"/></clipPath>
      <g class="pnl__xray" clip-path="url(#pnl-blob)">
        <polygon points="${face}" fill="#070c22"/>
        <g clip-path="url(#pnl-face)" fill="none" stroke="var(--sun)" stroke-linecap="round">
          ${glow}
          ${[0.25, 0.5, 0.75].map((f) => `<line x1="${x + w * f}" y1="${y + 4}" x2="${x + w * f}" y2="${y + h - 4}" stroke-width="5" opacity="0.95"/>`).join("")}
        </g>
      </g>
    </svg>`;
  }
  // four cells in two rows for one wiring; strong: the panel numbers drawn without film
  function wiringSvg(letter, strong) {
    const rows = PAIRS[letter] || PAIRS.A;
    const cell = (n, col, row) => miniCell(40 + col * 110, 14 + row * 70, 80, 56, n, strong.includes(n));
    const wires = rows.map((_, r) => { const cy = 14 + r * 70 + 28; return `<path class="w-wire" d="M14,${cy} H40 M120,${cy} H150 M230,${cy} H256"/>`; }).join("");
    const rails = `<path class="w-rail" d="M14,42 V112 M256,42 V112"/>`;
    const cells = rows.map((pair, r) => pair.map((n, c) => cell(n, c, r)).join("")).join("");
    return `<svg class="wiring__svg" viewBox="0 0 270 154" role="img" aria-label="Wiring ${letter}: panels ${PAIR_WORDS[letter] || ""}">${rails}${wires}${cells}</svg>`;
  }
  // the signature drawing: four panels wired A, which the scroll re-pairs into B (cells 2 and 3 swap places)
  function repairingSvg(gainText) {
    const slot = { L: 70, R: 210 }, rowY = { 1: 20, 2: 110 }, W = 100, H = 70;
    const at = { 1: ["L", 1], 2: ["R", 1], 3: ["L", 2], 4: ["R", 2] }; // wiring A
    const cells = [1, 2, 3, 4].map((n) => `<g class="rp-cell${DEMO_STRONG.includes(n) ? " is-strong" : " is-weak"}" data-cell="${n}">${miniCell(slot[at[n][0]], rowY[at[n][1]], W, H, n, DEMO_STRONG.includes(n))}</g>`).join("");
    const wires = [1, 2].map((r) => `<path class="rp-wire" data-row="${r}" d="M30,${rowY[r] + H / 2} H350"/>`).join("");
    return `<svg class="rp" viewBox="0 0 640 200" role="img" aria-label="Four panels re-paired from wiring A into wiring B, the matched one">
      <path class="rp-rail" d="M30,55 V145 M350,55 V145"/>
      ${wires}${cells}
      <text class="rp-num" x="392" y="104" data-rp-num>${gainText}</text>
      <text class="rp-label" x="394" y="134">more power than wiring A</text>
      <text class="rp-label" x="394" y="154">once the strong pair shares a string</text>
    </svg>`;
  }

  // ---------- figures ----------
  const gainText = (g) => `+${Math.round(g.pct)}%`;
  function strongOf(run) {
    if (!run || !Array.isArray(run.passports)) return DEMO_STRONG;
    const strong = run.passports.map((p) => (p && p.grade !== "C" ? Number(String(p.panel_label || "").replace("P", "")) : NaN)).filter((n) => n >= 1 && n <= 4);
    return strong.length ? strong : DEMO_STRONG;
  }
  // where a figure comes from, as a sentence: the run and its day, then what kind of run it was
  const fromRun = (fig, ctx) => `from ${ctx.esc(fig.run.run_id)}, ${ctx.fmtDay(fig.run.measured_at)}: ${ctx.esc(fig.source)}`;
  const sourceLine = (fig, ctx, what) => fig.model
    ? `${what} from our panel model for the demo batch, two of four panels behind 35% film. The first published bench run replaces them.`
    : `${what} ${fromRun(fig, ctx)}.`;

  // ---------- sections ----------
  // "recycle", written by hand behind the problem's numerals: one connected cursive line in nineteen pen strokes,
  // each with a pressure curve (weight at its start, middle and end). Every stroke is sampled into short pieces whose
  // width follows that curve, so the line swells and tapers like a brush; the pieces are drawn one after another at a
  // steady pen speed (--d, --t per piece). The word is slanted and set at 14 degrees in the numbers themselves, and the
  // viewBox is fitted to it, so nothing is ever cut off.
  const RECYCLE = [
    ["M60 372 C 76 326, 94 278, 112 232", 5, 11, 20],                                           // r: up, from a hairline
    ["M112 232 C 122 216, 142 214, 146 230", 20, 22, 18],                                       //    a short shoulder
    ["M140 238 C 144 278, 148 320, 152 360", 18, 34, 24],                                       //    down
    ["M152 360 C 172 318, 198 270, 228 262", 20, 11, 18],                                       // e: up
    ["M228 262 C 254 258, 258 292, 230 300 C 202 308, 192 340, 214 356 C 232 368, 258 352, 272 336", 18, 31, 15],
    ["M272 336 C 294 302, 320 272, 350 262", 14, 11, 17],                                       // c: up
    ["M354 264 C 324 252, 302 286, 306 318 C 310 346, 340 356, 368 332", 17, 31, 15],
    ["M368 332 C 390 302, 412 270, 434 252", 14, 11, 17],                                       // y: up
    ["M434 252 C 428 282, 422 312, 430 336 C 438 352, 462 338, 476 314", 17, 25, 15],
    ["M492 248 C 484 300, 472 370, 456 440", 15, 35, 22],                                       //    the descender, swelling
    ["M456 440 C 448 474, 416 472, 420 446 C 422 428, 442 420, 462 418", 20, 11, 10],          //    and its thin return
    ["M462 418 C 502 380, 542 310, 586 262", 10, 11, 17],                                       // c: long up
    ["M590 264 C 560 252, 538 286, 542 318 C 546 346, 576 356, 604 332", 17, 31, 15],
    ["M604 332 C 634 292, 664 220, 678 120", 14, 11, 15],                                       // l: tall up
    ["M678 120 C 684 86, 718 90, 708 132 C 696 186, 668 282, 652 360", 15, 34, 22],            //    loop and down
    ["M652 360 C 662 372, 682 366, 694 352", 22, 17, 15],
    ["M694 352 C 714 314, 740 270, 770 262", 15, 11, 18],                                       // e: up
    ["M770 262 C 796 258, 800 292, 772 300 C 744 308, 734 340, 756 356 C 774 368, 800 352, 816 336", 18, 31, 15],
    ["M816 336 C 848 306, 898 290, 954 300", 15, 12, 4],                                        // the flourish out, to a hairline
  ];
  const PEN_SPEED = 450;   // drawing units per second: about seven seconds for the word
  // the cubic beziers of one stroke, sampled every ~10 units, then slanted (skew 16°) and set at 14 degrees
  function samplePen(d) {
    const n = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number), pts = [];
    const push = (x, y) => { const sx = x - Math.tan(16 * Math.PI / 180) * y, sy = y, a = -14 * Math.PI / 180; pts.push([sx * Math.cos(a) - sy * Math.sin(a), sx * Math.sin(a) + sy * Math.cos(a)]); };
    let x0 = n[0], y0 = n[1];
    push(x0, y0);
    for (let i = 2; i + 5 < n.length; i += 6) {
      const [x1, y1, x2, y2, x3, y3] = n.slice(i, i + 6);
      const approx = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2), steps = Math.max(8, Math.round(approx / 4));   // dense, so the taper is smooth and the edge clean
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
      x0 = x3; y0 = y3;
    }
    return pts;
  }
  function recycleSvg() {
    let at = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pieces = [];
    RECYCLE.forEach(([d, w0, w1, w2]) => {
      const pts = samplePen(d), lens = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(L); total += L; }
      let run = 0;
      for (let i = 1; i < pts.length; i++) {
        const t = (run + lens[i - 1] / 2) / total, dur = lens[i - 1] / PEN_SPEED;
        const ease = (v) => v * v * (3 - 2 * v), w = t < 0.5 ? w0 + (w1 - w0) * ease(t * 2) : w1 + (w2 - w1) * ease((t - 0.5) * 2);   // pressure: start, middle, end
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx); minY = Math.min(minY, ay, by); maxY = Math.max(maxY, ay, by);
        pieces.push(`<path d="M${ax.toFixed(1)} ${ay.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}" pathLength="1" stroke-width="${w.toFixed(1)}" style="--d:${at.toFixed(3)}s;--t:${dur.toFixed(3)}s"/>`);
        run += lens[i - 1]; at += dur;
      }
    });
    const pad = 40;
    return `<svg class="recycle" viewBox="${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(maxX - minX + 2 * pad).toFixed(0)} ${(maxY - minY + 2 * pad).toFixed(0)}" preserveAspectRatio="xMinYMax meet" aria-hidden="true" focusable="false">${pieces.join("")}</svg>`;   // from the bottom left corner
  }
  // small drawn marks that end a block of text, the way a signature ends a note: a sun, a cell, a loop of string
  const DOODLES = {
    sun: `<svg class="doodle doodle--sun" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="6.5"/>${Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + 0.3, r0 = 10.5, r1 = 14 + (i % 3); return `<path d="M${(20 + Math.cos(a) * r0).toFixed(1)} ${(20 + Math.sin(a) * r0).toFixed(1)} L${(20 + Math.cos(a) * r1).toFixed(1)} ${(20 + Math.sin(a) * r1).toFixed(1)}"/>`; }).join("")}</svg>`,
    cell: `<svg class="doodle doodle--cell" viewBox="0 0 44 34" aria-hidden="true" focusable="false"><path d="M9 4 H35 L41 10 V24 L35 30 H9 L3 24 V10 Z"/><path d="M16 6 V28 M28 6 V28"/></svg>`,
    string: `<svg class="doodle doodle--string" viewBox="0 0 64 34" aria-hidden="true" focusable="false"><path d="M3 24 C 12 4, 20 4, 24 18 S 34 34, 40 16 S 52 2, 61 20"/></svg>`,
  };
  const doodle = (k) => DOODLES[k] || "";
  // The first screen is the scene alone: the sun draws itself, comes alive, and the cell slides into place under it
  // (motion.js, intro). The headline and the two ways in sit below the fold and show as the reader scrolls to them.
  function hero() {
    return `<section class="hero" data-in>
      <div class="hero__scene">
        <div class="hero__slot fade" data-reveal data-hero-slot>${sunSvg()}${panelSvg()}</div>
      </div>
      <div class="hero__text">
          <h1 class="display" data-reveal><span class="wipe"><span class="wipe__in">Used panels</span></span> <span class="wipe wipe--rtl" style="--d:140ms"><span class="wipe__in">still <span class="hollow">work.</span></span></span></h1>
          <p class="lede rise" data-reveal style="--d:260ms">Nobody can tell which ones, so most are landfilled. Afterglow grades them against each other and wires them so no good panel is wasted on a weak partner.</p>
          <div class="hero__actions rise" data-reveal style="--d:380ms"><a class="btn btn--primary" href="#/passports">See the passports</a><a class="btn" href="#/build">Try the Array Builder</a></div>
      </div>
    </section>`;
  }
  // The comparison: on large screens its own screen that pins. As the reader scrolls, a navy bubble at the bottom centre
  // of the screen (its radius --r, from motion.js) swells until it has filled the whole screen, the four panels appear large and
  // re-pair while the screen holds, and the band of facts runs along the bottom edge. Phones get a plain navy section.
  function repair(ctx, gain) {
    return `<section class="repair" data-hero data-gain="${ctx.esc(Math.round(gain.pct))}" data-in>
      <div class="repair__pin">
        <div class="repair__fill" aria-hidden="true"></div>
        <div class="repair__stage">
          ${repairingSvg(gainText(gain))}
          <p class="hero__caption label">more power than wiring A, once the strong pair shares a string</p>
        </div>
        ${ticker()}
      </div>
    </section>`;
  }
  // a slow band of sourced facts under the hero; it pauses under the pointer
  // other facts than the three numerals that follow (sources: the impact page)
  const TICKER = ["Panels lose about 0.5–0.75% of their output a year", "Panels retired early for upgrades often still make 70–95% of their rating", "About 83% of retired US panels are headed to landfill, 9.5% are recycled", "In a series string the weakest panel sets the current for all of them", "Matched wiring: up to 37% more power from the same four panels, simulated"];
  const ticker = () => `<div class="ticker" aria-hidden="true"><div class="ticker__track">${[...TICKER, ...TICKER].map((t) => `<span class="ticker__item">${t}</span>`).join("")}</div></div>`;
  const problem = () => `<section class="problem" data-in>
      <div class="wrap">
        <div class="problem__grid">
          <div class="fig"><div class="num-big" data-count>80–88%</div><p class="fig__line">of rated output is what most panels still make after 25 years${fn(1)}</p></div>
          <div class="fig"><div class="num-big" data-count>1.2%</div><p class="fig__line">of retired US panels are reused; most are landfilled${fn(3)}</p></div>
          <div class="fig"><div class="num-big" data-count>$17–34</div><p class="fig__line">for a lab test of one used panel, against about $55 for a new one${fn(4)}</p></div>
        </div>
        <p class="problem__text">In a series string every panel carries the same current, so the weakest panel limits the string. Factories sort new panels into current classes; used ones arrive mixed and untested. ${doodle("sun")}</p>
      </div>
    </section>`;
  // the white block: the problem and the steps on one sheet of paper, with "recycle" written across it from the
  // sheet's bottom left corner, behind both
  const paper = () => `<div class="paper">${landscape()}${recycleSvg()}${problem()}${how()}</div>`;
  // the bench's four steps hang in order on one wire, the way panels hang on a string; each carries a drawing of what happens
  const tiny = (x, y, w, h, strong) => `<polygon points="${octagon(x, y, w, h, Math.min(w, h) * 0.18)}" fill="var(--cell)"/>${strong ? "" : `<polygon points="${octagon(x, y, w, h, Math.min(w, h) * 0.18)}" fill="var(--film)"/>`}`;
  const GLYPHS = {
    // four panels read at the same instant: one bracket over all of them
    measure: `<path d="M5,9 V5 H67 V9" class="g-line"/>${tiny(5, 14, 13, 10, true)}${tiny(21, 14, 13, 10, false)}${tiny(37, 14, 13, 10, true)}${tiny(53, 14, 13, 10, false)}<path d="M2,32 H70" class="g-line g-rail"/>`,
    // the two strong ones belong together: a plate under the matched pair
    predict: `<rect x="3" y="11" width="34" height="18" rx="2" fill="var(--surface)"/>${tiny(6, 14, 13, 10, true)}${tiny(21, 14, 13, 10, true)}${tiny(41, 14, 13, 10, false)}${tiny(56, 14, 13, 10, false)}<path d="M2,32 H70" class="g-line g-rail"/>`,
    // relays switch, a capacitor sweeps the curve from short circuit to open circuit
    sweep: `${tiny(4, 6, 13, 10, true)}${tiny(4, 22, 13, 10, true)}<path d="M17,11 H26 M17,27 H26 M26,11 V27" class="g-line"/><path d="M34,32 H68 M34,32 V4" class="g-line g-rail"/><path d="M36,8 C 52,8 58,13 62,18 C 65,22 66,28 66,31" class="g-curve"/>`,
    // best against worst, twenty times: the gain stands
    prove: `<path d="M4,32 H68" class="g-line g-rail"/><rect x="12" y="6" width="16" height="26" fill="var(--cell)"/><rect x="34" y="16" width="16" height="16" fill="var(--busbar)"/><path d="M12,4 H28" class="g-line"/>`,
  };
  const glyph = (name) => `<svg class="step__glyph" viewBox="0 0 72 40" aria-hidden="true" focusable="false"><rect width="72" height="40" fill="var(--page)"/>${GLYPHS[name]}</svg>`;
  const how = () => `<section class="how" data-in>
      <div class="wrap">
        <h2 class="title">Four panels, three ways to pair them.</h2>
        <div class="string-box">
          <svg class="string__wire string__wire--h" viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0,1 H100" pathLength="1"/></svg>
          <svg class="string__wire string__wire--v" viewBox="0 0 2 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M1,0 V100" pathLength="1"/></svg>
        <ol class="string">
          <li class="step">${glyph("measure")}<h3>Measure</h3><p>Every panel's current at the same instant, and its voltage.</p></li>
          <li class="step">${glyph("predict")}<h3>Predict</h3><p>The scores say which pairs match.</p></li>
          <li class="step">${glyph("sweep")}<h3>Switch and sweep</h3><p>Relays try all three wirings; a capacitor sweeps each one's power curve.</p></li>
          <li class="step">${glyph("prove")}<h3>Keep and prove</h3><p>The best wiring stays on; alternating best and worst twenty times proves the gain. ${doodle("cell")}</p></li>
        </ol>
        </div>
      </div>
    </section>`;
  function stripInner(ctx, strip) {
    const strong = strongOf(strip.run);
    const cards = ["A", "B", "C"].map((L) => `<article class="wiring${L === strip.best ? " is-best" : ""}" data-wiring="${L}">
        <div class="wiring__head"><span class="wiring__letter pair-${L}">${L}</span>${L === strip.best ? `<span class="wiring__best label">best wiring</span>` : ""}</div>
        ${wiringSvg(L, strong)}
        <div class="wiring__w">${ctx.num(strip.watts[L], 2)} W</div>
        <p class="wiring__label label">maximum power, panels ${PAIR_WORDS[L]}</p>
      </article>`).join("");
    return `<div class="strip__track">${cards}</div><p class="wrap strip__note label">${sourceLine(strip, ctx, "Figures")}${strip.model ? fn(5) : ""}</p>`;
  }
  const strip = (ctx, s) => `<section class="strip" data-strip data-in>
      <div class="strip__pin"><div class="strip__stage">
        <div class="wrap"><h2 class="title">Three ways to wire four panels.</h2></div>
        <div id="front-strip">${stripInner(ctx, s)}</div>
      </div></div>
    </section>`;
  function gainInner(ctx, g) {
    const proof = g.run && g.run.proof;
    const detail = g.model ? "" : proof && Number.isFinite(Number(proof.ci95_pct)) ? ` ±${ctx.num(proof.ci95_pct, 1)} over ${ctx.esc(proof.cycle)} cycles` : "";
    return `<div class="wrap">
        <div class="band__num" data-count>${gainText(g)}</div>
        <p class="band__text">more power than the worst wiring of the same panels, ${g.model ? "" : "measured "}at each wiring's maximum power point. With normal aging the gain is about 5 to 7%.</p>
        <p class="band__note">${g.model ? `A model figure for the demo batch, two of four panels behind 35% film. The first published bench run replaces it.${fn(5)}` : `${ctx.num(g.pct, 1)}%${detail}, ${fromRun(g, ctx)}.`} ${doodle("string")}</p>
      </div>`;
  }
  const gainBand = (ctx, g) => `<section class="band front-band" id="front-gain" data-in>${gainInner(ctx, g)}</section>`;
  function passportsInner(ctx) {
    const latest = window.SSFrontData.latestPassports(ctx.passports, 4);
    const card = (p) => `<a class="ppass" href="#/p/${encodeURIComponent(p.passport_id)}">${ctx.cellSvg({ label: p.passport_id, dim: p.grade === "C" })}<span class="ppass__id">${ctx.esc(p.passport_id)}</span><span class="ppass__grade grade g-${ctx.esc(p.grade)}">${ctx.esc(p.grade || "—")}</span><span class="ppass__facts label">${ctx.num(p.isc_ma, 0)} mA, ${ctx.num(p.voc_v, 2)} V</span></a>`;
    const body = ctx.loading
      ? `<p class="muted">Loading passports…</p>`
      : latest.length
        ? `<div class="ppass-row">${latest.map(card).join("")}</div>
           <div class="row fpass__actions"><a class="btn btn--primary" href="#/passports">See all passports</a><a class="btn" href="#/print">Print cards</a></div>`
        : `<p class="muted">No panels published yet.</p>
           <div class="row fpass__actions"><button type="button" class="btn" id="btn-sample-front">Show example panels</button><span class="label">A simulated batch, not a real measurement.</span><span class="status" id="front-status"></span></div>`;
    return `<div class="wrap">
        <h2 class="title">Every panel gets a passport.</h2>
        <p class="lede">An ID, a QR code and the record of what the bench measured, so the next owner knows what they are buying.</p>
        ${body}
      </div>`;
  }
  const passportsSection = (ctx) => `<section class="fpass" id="front-passports" data-in>${passportsInner(ctx)}</section>`;
  const teaser = () => `<section class="teaser" data-in>
      <div class="wrap"><div class="teaser__box"><p class="teaser__text">Have passports? The Array Builder groups them into strings so no strong panel is held back.</p><a class="btn" href="#/build">Try the Array Builder</a></div></div></section>`;
  // a numbered footnote marker, linking to the notes at the foot of the page
  const fn = (n) => `<sup class="fn"><a href="#fn-${n}" aria-label="Footnote ${n}">${n}</a></sup>`;
  // the notes: what each number rests on, with a formatted citation and a link where the source has a stable address
  const FOOTNOTES = [
    { note: "80–88% of rated output after 25 years, from a median loss of 0.5–0.75% a year.", cites: [
      { text: "Jordan, D. C., & Kurtz, S. R. (2013). Photovoltaic degradation rates: an analytical review. <i>Progress in Photovoltaics</i>, 21(1), 12–29.", url: "https://doi.org/10.1002/pip.1182" },
      { text: "Jordan, D. C., et al. (2022). Photovoltaic fleet degradation insights. <i>Progress in Photovoltaics</i>, 30(10), 1166–1175.", url: "https://doi.org/10.1002/pip.3566" } ] },
    { note: "Panels retired early, for upgrades or damage, often still produce 70–95% of their rating.", cites: [
      { text: "National Renewable Energy Laboratory (NREL), photovoltaic end-of-life and reuse research.", url: "https://www.nrel.gov/pv/" } ] },
    { note: "About 83% of retired US modules landfilled, 9.5% recycled, 1.2% reused (baseline scenario, 2020–2050).", cites: [
      { text: "Walzberg, J., Carpenter, A., & Heath, G. A. (2021). Role of the social factors in success of solar photovoltaic reuse and recycle programmes. <i>Nature Energy</i>, 6, 913–924.", url: "https://doi.org/10.1038/s41560-021-00888-5" } ] },
    { note: "A lab test of a used module (flash test plus electroluminescence imaging) costs about €16–31, against about €50 for a new one; shown in dollars at about 1.08 $/€.", cites: [
      { text: "IEA PVPS Task 13, Performance, Operation and Reliability of Photovoltaic Systems (2026).", url: "https://iea-pvps.org/research-tasks/performance-operation-and-reliability-of-photovoltaic-systems/" },
      { text: "German test laboratories' published price lists.", url: "" } ] },
    { note: "The gain is a figure from our single-diode panel model for the demo batch, two of four panels behind 35% film; bench runs replace it as they are published, and measured numbers are labelled as such.", cites: [
      { text: "Afterglow, panel model and bench method.", url: "https://github.com/mscl741/HackHarvard" } ] },
  ];
  const cite = (c) => c.url ? `<a href="${c.url}" rel="noopener">${c.text}</a>` : c.text;
  // the page's name, line and note are in the site footer (index.html), which follows straight after
  const close = () => `<section class="close" data-in>
    <ol class="footnotes wrap" aria-label="Notes and sources">${FOOTNOTES.map((f, i) => `<li id="fn-${i + 1}">${f.note} ${f.cites.map(cite).join(" · ")}</li>`).join("")}</ol>
  </section>`;

  // ---------- the page ----------
  function page(ctx) {
    const D = window.SSFrontData;
    const g = D.gainFigure(ctx.runs), s = D.stripFigures(ctx.runs);
    return hero() + repair(ctx, g) + paper() + strip(ctx, s) + gainBand(ctx, g) + passportsSection(ctx) + teaser() + close();
  }
  // runs arrived while the page is open: redraw the data-bearing parts in place, leave the hero and the reader's scroll alone
  function refresh(root, ctx) {
    const D = window.SSFrontData;
    const g = D.gainFigure(ctx.runs), s = D.stripFigures(ctx.runs);
    const set = (sel, html) => { const el = root.querySelector(sel); if (el) el.innerHTML = html; };
    set("#front-strip", stripInner(ctx, s));
    set("#front-gain", gainInner(ctx, g));
    set("#front-passports", passportsInner(ctx));
    const heroEl = root.querySelector("[data-hero]");
    if (heroEl) heroEl.dataset.gain = String(Math.round(g.pct));   // motion.js redraws the numeral at the current scroll position
    wire(root, refresh.hooks || {});
  }
  function wire(root, hooks) {
    refresh.hooks = hooks;
    const btn = root.querySelector("#btn-sample-front");
    if (btn && hooks.loadSample) btn.addEventListener("click", () => hooks.loadSample(root.querySelector("#front-status")));
  }
  return { page, refresh, wire };
})();
