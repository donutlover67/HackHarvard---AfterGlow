// A simulated bench (stands in for the Uno or ESP32 board). Same single-diode model as tools/sim/pv2s2p.py, same
// serial protocol as protocol/PROTOCOL.md, same timing as the firmware procedures.

const VT = 0.025693;
const NS = 12;              // cells per 6 V panel
const N_ID = 1.3;
const ISC_SUN = 0.38;       // A at full sun for a 2 W panel
const VOC_CELL = 0.6;
const I0 = ISC_SUN / Math.exp(VOC_CELL / (N_ID * VT));
const RS_PANEL = 0.05 * NS;
const BYPASS_V = -0.35;
const SLOTS = { A: [1, 2, 3, 4], B: [1, 3, 2, 4], C: [1, 4, 3, 2] };
const LIVE_MS = 200;
const SWEEP_MS = 1100;
const GRADE_MS = 600;
const PROOF_CYCLES = 20;
const PUMPPROOF_CYCLES = 10;
const PUMP_R = 40;          // the brushed pump as a 40 Ω load above a 1 V knee
const PUMP_KNEE = 1.0;
const BOX_LAMPS = [1.0, 0.98, 1.03, 0.99];   // hidden lamp differences the CAL wizard should find

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const noisy = (x, pct) => x * (1 + (gauss() * pct) / 100);
const r = (x, nd = 2) => Number(x.toFixed(nd));

export class MockBench {
  constructor(onLine) {
    this.onLine = onLine;
    this.light = 0.4;                 // fraction of full sun reaching a clear panel
    this.film = { 1: false, 2: true, 3: false, 4: true };
    // Measured panels, e.g. { 1: { isc_ma: 148, voc_v: 6.8 }, ... }: when set, each simulated panel takes its
    // short-circuit current and open-circuit voltage from real readings, and light, film and lamp differences are ignored.
    this.calib = null;
    this.filmT = 0.35;
    this.factors = [1, 1, 1, 1];
    this.pairing = "A";
    this.pump = true;
    this.mode = "RUN";
    this.lastSearch = null;
    this.cal = {};
    this.t0 = performance.now();
    this.timers = [];
    this.liveTimer = null;
  }

  // ---- link ----
  connect() {
    this.emit(this.hello());
    this.liveTimer = setInterval(() => this.emit(this.live()), LIVE_MS);
  }
  disconnect() {
    clearInterval(this.liveTimer);
    this.clearTimers();
  }
  emit(obj) { this.onLine(JSON.stringify(obj)); }
  log(msg) { this.emit({ type: "log", msg }); }
  err(msg) { this.emit({ type: "error", msg }); }
  now() { return Math.round(performance.now() - this.t0); }
  after(ms, fn) { const id = setTimeout(() => { this.timers = this.timers.filter((t) => t !== id); fn(); }, ms); this.timers.push(id); return id; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }

  // ---- physics ----
  drift() { return 1 + 0.02 * Math.sin(this.now() / 9000); }
  iph(k) {
    if (this.calib) return (this.calib[k].isc_ma / 1000) * this.drift();
    return ISC_SUN * this.light * BOX_LAMPS[k - 1] * (this.film[k] ? this.filmT : 1) * this.drift();
  }
  // Diode saturation current: shared by identical panels, or fitted per panel so its open-circuit voltage matches the reading.
  i0(k) {
    if (!this.calib) return I0;
    const c = this.calib[k];
    return (c.isc_ma / 1000) / (Math.exp(c.voc_v / (NS * N_ID * VT)) - 1);
  }
  panelV(k, I) {
    const iph = this.iph(k);
    if (I >= iph) return BYPASS_V;
    const v = NS * N_ID * VT * Math.log((iph - I) / this.i0(k) + 1) - I * RS_PANEL;
    return Math.max(v, BYPASS_V);
  }
  stringV(a, b, I) { return this.panelV(a, I) + this.panelV(b, I); }
  stringI(a, b, V) {
    if (V >= this.stringV(a, b, 0)) return 0;
    let lo = 0, hi = Math.max(this.iph(a), this.iph(b)) + 0.01;
    for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2; if (this.stringV(a, b, mid) > V) lo = mid; else hi = mid; }
    return lo;
  }
  arrayI(p, V) { const s = SLOTS[p]; return this.stringI(s[0], s[1], V) + this.stringI(s[2], s[3], V); }
  arrayVoc(p) { const s = SLOTS[p]; return Math.max(this.stringV(s[0], s[1], 0), this.stringV(s[2], s[3], 0)); }
  curve(p) {
    const voc = this.arrayVoc(p);
    const pts = [];
    for (let v = 0; v < voc; v += 0.2) pts.push([r(v, 2), r(noisy(this.arrayI(p, v) * 1000, 0.6), 1)]);
    pts.push([r(voc, 2), 0]);
    if (pts.length > 80) { const step = pts.length / 80; const out = []; for (let i = 0; i < 80; i++) out.push(pts[Math.floor(i * step)]); return out; }
    return pts;
  }
  sweep(p) {
    const pts = this.curve(p);
    let pmax = 0, vmp = 0, imp = 0;
    pts.forEach(([v, i]) => { const w = (v * i) / 1000; if (w > pmax) { pmax = w; vmp = v; imp = i; } });
    const isc = pts[0][1]; const voc = pts[pts.length - 1][0];
    return { type: "sweep", t: this.now(), pairing: p, pmax_w: r(pmax, 3), vmp_v: r(vmp, 2), imp_ma: r(imp, 1), voc_v: r(voc, 2), isc_ma: r(isc, 1), ff: r(pmax / ((isc / 1000) * voc || 1), 3), n: 380 + Math.floor(Math.random() * 60), pts };
  }
  opPoint(p) {
    // intersection of the array curve with the pump load line
    let lo = 0, hi = this.arrayVoc(p);
    for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2; const load = Math.max(0, (mid - PUMP_KNEE) / PUMP_R); if (this.arrayI(p, mid) > load) lo = mid; else hi = mid; }
    const v = lo; const i = this.arrayI(p, v);
    return { v, i, p: v * i };
  }

  // ---- messages ----
  hello() { return { type: "hello", fw: "mock", panels: 4, factors: this.factors.map((f) => r(f, 3)), mode: this.mode, pairing: this.pairing, pump: this.pump }; }
  live() {
    const s = SLOTS[this.pairing];
    let out, ix, iy;
    if (this.pump && this.mode !== "SWEEP") {
      const op = this.opPoint(this.pairing);
      out = { v: r(noisy(op.v, 0.4)), i_ma: r(noisy(op.i * 1000, 1), 1), p_w: r(op.p, 3) };
      ix = this.stringI(s[0], s[1], op.v); iy = this.stringI(s[2], s[3], op.v);
    } else {
      out = { v: r(this.arrayVoc(this.pairing)), i_ma: 0, p_w: 0 }; ix = 0; iy = 0;
    }
    out.p_w = r((out.v * out.i_ma) / 1000, 3);
    const cur = [ix, ix, iy, iy];
    return { type: "live", t: this.now(), mode: this.mode, pairing: this.pairing, pump: this.pump, out, panels: s.map((id, k) => ({ id, slot: `S${k + 1}`, i_ma: r(noisy(cur[k] * 1000, 1), 1) })) };
  }
  grade() {
    const isc = [1, 2, 3, 4].map((k) => noisy(this.iph(k) * 1000, 0.8));
    const corrected = isc.map((v, k) => v * this.factors[k]);
    const voc = [1, 2, 3, 4].map((k) => this.panelV(k, 0));
    const top = Math.max(...corrected);
    const sortedVoc = [...voc].sort((a, b) => a - b);
    const median = (sortedVoc[1] + sortedVoc[2]) / 2;
    const panels = corrected.map((c, k) => {
      const score = top > 0 ? (c / top) * 100 : 0;
      const flags = [];
      if (score < 75) flags.push("weak");
      if (voc[k] < 0.8 * median) flags.push("low_voc");
      if (isc[k] < 5) flags.push("dark");
      return { id: k + 1, isc_ma: r(c, 1), isc_raw_ma: r(isc[k], 1), voc_v: r(voc[k], 2), score: r(score, 1), grade: score >= 90 ? "A" : score >= 75 ? "B" : "C", flags };
    });
    const order = [1, 2, 3, 4].sort((a, b) => corrected[b - 1] - corrected[a - 1]);
    const want = [[order[0], order[1]].sort().join(""), [order[2], order[3]].sort().join("")].sort().join("|");
    const predicted = Object.keys(SLOTS).find((p) => { const s = SLOTS[p]; return [[s[0], s[1]].sort().join(""), [s[2], s[3]].sort().join("")].sort().join("|") === want; }) || "A";
    return { type: "grade", t: this.now(), panels, predicted };
  }
  setPairing(p, pumpAfter) {
    this.pump = false;
    this.pairing = p;
    this.after(80, () => { this.pump = !!pumpAfter; });
  }

  // ---- commands ----
  send(line) {
    const [cmd, arg] = line.trim().toUpperCase().split(/\s+/);
    switch (cmd) {
      case "GRADE": return this.doGrade(() => {});
      case "SWEEP": return this.doSweep(this.pairing, () => { this.mode = "RUN"; });
      case "SEARCH": return this.doSearch();
      case "RUN": return this.doRun(arg);
      case "PROOF": return this.doProof(arg, "sweep");
      case "PUMPPROOF": return this.doProof(arg, "pump");
      case "STOP": this.clearTimers(); this.mode = "RUN"; this.pump = true; return this.log("stopped");
      case "PUMP": this.pump = arg === "ON"; return this.log(`pump ${this.pump ? "on" : "off"}`);
      case "CAL": return this.doCal(Number(arg));
      case "CALSAVE": {
        const vals = [1, 2, 3, 4].map((k) => this.cal[k]);
        if (vals.some((v) => v == null)) return this.err("measure all four boxes before CALSAVE");
        const mean = vals.reduce((a, b) => a + b, 0) / 4;
        this.factors = vals.map((v) => mean / v);
        return this.emit({ type: "cal", factors: this.factors.map((f) => r(f, 3)) });
      }
      case "CALRESET": this.factors = [1, 1, 1, 1]; this.cal = {}; return this.emit({ type: "cal", factors: this.factors });
      case "STATUS": return this.emit(this.hello());
      default: return this.err("unknown command");
    }
  }
  doGrade(done) {
    this.clearTimers();
    const prev = this.mode;
    this.mode = "GRADE"; this.pump = false;
    this.after(GRADE_MS, () => { this.emit(this.grade()); this.mode = prev === "GRADE" ? "RUN" : prev; this.pump = prev === "RUN"; done(); });
  }
  doSweep(p, done) {
    this.mode = "SWEEP"; this.pump = false;
    this.after(SWEEP_MS, () => { const sw = this.sweep(p); this.emit(sw); this.log(`sweep ${p}: ${sw.n} samples`); done(sw); });
  }
  doSearch() {
    this.clearTimers();
    this.mode = "SEARCH"; this.pump = false;
    const result = {};
    const order = ["A", "B", "C"];
    let predicted = "A";
    this.after(GRADE_MS, () => {
      const g = this.grade(); predicted = g.predicted; this.emit(g);
      const next = (i) => {
        if (i >= order.length) {
          const best = order.reduce((a, b) => (result[b] > result[a] ? b : a));
          this.lastSearch = { pmax: { ...result }, best, worst: order.reduce((a, b) => (result[b] < result[a] ? b : a)) };
          this.emit({ type: "search", t: this.now(), pmax_w: result, best, predicted, match: best === predicted });
          this.setPairing(best, true); this.mode = "RUN";
          return;
        }
        this.setPairing(order[i], false);
        this.mode = "SEARCH";
        this.after(120, () => this.doSweep(order[i], (sw) => { result[order[i]] = sw.pmax_w; this.mode = "SEARCH"; next(i + 1); }));
      };
      next(0);
    });
  }
  doRun(arg) {
    this.clearTimers();
    let p = arg;
    if (arg === "BEST") p = this.lastSearch ? this.lastSearch.best : this.pairing;
    if (!SLOTS[p]) return this.err("RUN needs A, B, C or BEST");
    this.setPairing(p, true); this.mode = "RUN";
    this.log(`running wiring ${p}`);
  }
  doProof(arg, kind) {
    this.clearTimers();
    if (!this.lastSearch) return this.err("run SEARCH first so PROOF knows the best and worst wirings");
    const best = this.lastSearch.best;
    const base = arg && SLOTS[arg] ? arg : this.lastSearch.worst;
    if (base === best) return this.err("baseline is the same as the best wiring");
    const ratios = [];
    const total = kind === "sweep" ? PROOF_CYCLES : PUMPPROOF_CYCLES;
    this.mode = kind === "sweep" ? "PROOF" : "PUMPPROOF";
    const report = (cycle, pb, pw) => {
      ratios.push(pb / pw - 1);
      const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      const sd = ratios.length > 1 ? Math.sqrt(ratios.reduce((a, x) => a + (x - mean) ** 2, 0) / (ratios.length - 1)) : 0;
      this.emit({ type: "proof", t: this.now(), kind, best, base, cycle, p_best_w: r(pb, 3), p_base_w: r(pw, 3), gain_pct: r(mean * 100, 1), ci95_pct: r((1.96 * sd * 100) / Math.sqrt(ratios.length), 1) });
    };
    const cycle = (c) => {
      if (c > total) { this.setPairing(best, true); this.mode = "RUN"; this.log("proof finished"); return; }
      const first = c % 2 === 1 ? best : base;
      const second = first === best ? base : best;
      const vals = {};
      const measure = (p, done) => {
        this.setPairing(p, kind === "pump");
        this.mode = kind === "sweep" ? "PROOF" : "PUMPPROOF";
        if (kind === "sweep") {
          this.after(120, () => this.doSweep(p, (sw) => { vals[p] = sw.pmax_w; this.mode = "PROOF"; done(); }));
        } else {
          const samples = [];
          const start = this.now();
          const tick = () => {
            if (this.now() - start > 1500) samples.push(this.opPoint(p).p);
            if (this.now() - start < 5000) this.after(200, tick); else { vals[p] = samples.reduce((a, b) => a + b, 0) / samples.length; done(); }
          };
          tick();
        }
      };
      measure(first, () => measure(second, () => { report(c, vals[best], vals[base]); cycle(c + 1); }));
    };
    cycle(1);
  }
  doCal(k) {
    if (!(k >= 1 && k <= 4)) return this.err("CAL needs a box number 1-4");
    this.clearTimers();
    const prev = this.mode; this.mode = "CAL"; this.pump = false;
    this.after(GRADE_MS, () => {
      // the reference panel (clear) sits in box k, so its current reflects that box's lamp
      const reading = noisy(ISC_SUN * this.light * BOX_LAMPS[k - 1] * this.drift() * 1000, 0.8);
      this.cal[k] = reading;
      this.emit({ type: "cal", box: k, reading_ma: r(reading, 1) });
      this.mode = prev; this.pump = prev === "RUN";
    });
  }
}
