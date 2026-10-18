// The front page, from night to day: the problem first, under a night sky; why it matters before dawn; the product in
// the morning light; the drawn cell that follows the pointer at noon. Each section names how far the day has come
// (data-day, 0 night to 1 noon); motion.js draws the sky for that point and blends it as the reader scrolls.
// Markup only. app.js supplies the data and helpers (ctx), motion.js drives the moves.
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
  const SUN = { cx: 30, cy: 58, r: 18 };   // above and left of the face's corner; clear of the nav and the viewport's edge at 1920x1080 and 1440x900
  const FACE = { x: 48, y: 64, w: 304, h: 172, c: 30 };
  function sunSvg() {
    const { cx, cy, r } = SUN;
    const rays = Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2 - 0.4, len = 7 + ((i * 7) % 5), r0 = r + 7 + ((i * 3) % 3);   // uneven, as if drawn by hand
      const p = (rr) => `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
      return `<path d="M${p(r0)} L${p(r0 + len)}"/>`;
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
      <path class="sun__disc" d="${d}"/>
      <g class="sun__beams">${beams}</g>
    </svg>`;
  }
  // the cell as a drawing: its shadow, its thickness, its face with fingers and busbars, and the sunlight on the face
  // as an amber wash and hatching from the top left corner, whose reach motion.js sets from the way the panel turns
  function panelSvg() {
    const { x, y, w, h, c } = FACE, face = octagon(x, y, w, h, c);
    let fingers = "";
    for (let fy = y + 12; fy < y + h - 6; fy += 10) fingers += `<path d="M${x + 8} ${fy} Q ${x + w / 2} ${fy + ((fy / 10) % 2 ? 0.8 : -0.8)} ${x + w - 8} ${fy}" stroke="rgba(255,255,255,0.1)" stroke-width="1.4"/>`;
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
  // the finale: the drawn cell under a drawn sun, leaning toward the pointer, with the two ways in
  function hero() {
    return `<section class="hero" data-hero data-day="1" data-in>
      <div class="hero__pin">
        <div class="hero__slot grow" data-reveal data-hero-slot>${sunSvg()}${panelSvg()}</div>
        <div class="hero__text">
          <h2 class="display" data-reveal><span class="line"><span class="line__in">Put them back</span></span> <span class="line"><span class="line__in">to work.</span></span></h2>
          <p class="lede rise" data-reveal style="--d:260ms">Grade a batch on the bench, give every panel a passport, and let the Array Builder wire them so no good panel is held back by a weak one.</p>
          <div class="hero__actions rise" data-reveal style="--d:380ms"><a class="btn btn--primary" href="#/passports">See the passports</a><a class="btn" href="#/build">Try the Array Builder</a></div>
        </div>
      </div>
    </section>`;
  }
  // the first screen, at night: the problem, listed. The headline, then three figures, then what goes wrong with the ones kept
  const problem = () => `<section class="problem" data-opening data-day="0">
      <div class="wrap problem__in">
        <h1 class="display problem__head" data-reveal><span class="line"><span class="line__in">Most retired solar panels still work.</span></span> <span class="line"><span class="line__in">Most are thrown away anyway.</span></span></h1>
        <ol class="problem__grid rise" data-reveal style="--d:300ms">
          <li class="fig"><div class="num-big" data-count>80–88%</div><p class="fig__line">of their rated power is what most panels still make after 25 years</p></li>
          <li class="fig"><div class="num-big" data-count>1.2%</div><p class="fig__line">of retired US panels are reused; most of the rest go to landfill</p></li>
          <li class="fig"><div class="num-big" data-count>$17–34</div><p class="fig__line">to lab-test one used panel, against about $55 for a new one</p></li>
        </ol>
        <p class="problem__text rise" data-reveal style="--d:420ms">The few that are kept arrive mixed and untested. Wired in a series string, every panel carries the same current, so the weakest one holds back all the rest.</p>
      </div>
      <p class="problem__cue label" aria-hidden="true">Scroll toward sunrise</p>
    </section>`;
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
  const how = () => `<section class="how" data-day="0.72" data-in>
      <div class="wrap">
        <h2 class="title">Second String grades them, then wires them right.</h2>
        <p class="lede how__lede">A bench measures every panel at the same moment, under the same light, so they can be compared fairly. Then it tries each way of pairing them and keeps the one that makes the most power.</p>
        <div class="string-box">
          <svg class="string__wire string__wire--h" viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0,1 H100" pathLength="1"/></svg>
          <svg class="string__wire string__wire--v" viewBox="0 0 2 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M1,0 V100" pathLength="1"/></svg>
        <ol class="string">
          <li class="step">${glyph("measure")}<h3>Measure</h3><p>Every panel's current at the same instant, and its voltage.</p></li>
          <li class="step">${glyph("predict")}<h3>Predict</h3><p>The scores say which pairs match.</p></li>
          <li class="step">${glyph("sweep")}<h3>Switch and sweep</h3><p>Relays try all three wirings; a capacitor sweeps each one's power curve.</p></li>
          <li class="step">${glyph("prove")}<h3>Keep and prove</h3><p>The best wiring stays on; alternating best and worst twenty times proves the gain.</p></li>
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
    return `<div class="strip__track">${cards}</div><p class="wrap strip__note label">${sourceLine(strip, ctx, "Figures")}</p>`;
  }
  const strip = (ctx, s) => `<section class="strip" data-strip data-day="0.82" data-in>
      <div class="strip__pin"><div class="strip__stage">
        <div class="wrap"><h2 class="title">Three ways to wire four panels.</h2></div>
        <div id="front-strip">${stripInner(ctx, s)}</div>
      </div></div>
    </section>`;
  function gainInner(ctx, g) {
    const proof = g.run && g.run.proof;
    const detail = g.model ? "" : proof && Number.isFinite(Number(proof.ci95_pct)) ? ` ±${ctx.num(proof.ci95_pct, 1)} over ${ctx.esc(proof.cycle)} cycles` : "";
    return `<div>
        <div class="band__num" data-count>${gainText(g)}</div>
        <p class="band__text">more power than the worst wiring of the same panels, ${g.model ? "" : "measured "}at each wiring's maximum power point. With normal aging the gain is about 5 to 7%.</p>
        <p class="band__note">${g.model ? "A model figure for the demo batch, two of four panels behind 35% film. The first published bench run replaces it." : `${ctx.num(g.pct, 1)}%${detail}, ${fromRun(g, ctx)}.`}</p>
      </div>`;
  }
  // the gain sits on a navy card in the daylight, the page's one strong colour
  const gainBand = (ctx, g) => `<section class="front-gain" data-day="0.88" data-in><div class="wrap"><div class="band front-band" id="front-gain">${gainInner(ctx, g)}</div></div></section>`;
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
  const passportsSection = (ctx) => `<section class="fpass" id="front-passports" data-day="0.94" data-in>${passportsInner(ctx)}</section>`;
  const close = () => `<section class="close" data-day="1" data-in><div class="wrap">
      <p class="close__name">Second String</p>
      <p class="close__line">Grades used solar panels against each other, then wires them for the most power.</p>
      <p class="close__note label">Measured numbers come from the bench; simulated and hand-entered runs are labelled. Sources: NREL; IEA PVPS Task 13.</p>
    </div></section>`;

  // why we do it, short: solar as something ordinary households can have, not only industrial projects
  const why = () => `<section class="why" data-day="0.3" data-in>
      <div class="wrap why__in">
        <h2 class="title">Solar for everyday people.</h2>
        <p class="why__text">Solar is usually sold as an industrial project: utility farms, new roofs, big budgets. Tested used panels make it something an ordinary household can afford, a few panels on a balcony, a shed or a backyard, and a step toward a cleaner, healthier way of living at home.</p>
      </div>
    </section>`;
  // ---------- the page ----------
  function page(ctx) {
    const D = window.SSFrontData;
    const g = D.gainFigure(ctx.runs), s = D.stripFigures(ctx.runs);
    // night to day: the problem first, why it matters, the product, then the drawn cell and the two ways in
    return problem() + why() + how() + strip(ctx, s) + gainBand(ctx, g) + passportsSection(ctx) + hero() + close();
  }
  // runs arrived while the page is open: redraw the data-bearing parts in place, leave the hero and the reader's scroll alone
  function refresh(root, ctx) {
    const D = window.SSFrontData;
    const g = D.gainFigure(ctx.runs), s = D.stripFigures(ctx.runs);
    const set = (sel, html) => { const el = root.querySelector(sel); if (el) el.innerHTML = html; };
    set("#front-strip", stripInner(ctx, s));
    set("#front-gain", gainInner(ctx, g));
    set("#front-passports", passportsInner(ctx));
    wire(root, refresh.hooks || {});
  }
  function wire(root, hooks) {
    refresh.hooks = hooks;
    const btn = root.querySelector("#btn-sample-front");
    if (btn && hooks.loadSample) btn.addEventListener("click", () => hooks.loadSample(root.querySelector("#front-status")));
  }
  return { page, refresh, wire };
})();
