// Single-diode panel model, the same one behind the bench dashboard's mock and docs/spec-v2.md.
// A passport gives Isc and Voc; the diode saturation current is fitted so the model's Voc matches.
window.SSModel = (function () {
  const VT = 0.025693;      // thermal voltage at 25 C
  const NS = 12;            // cells per 6 V panel
  const N_ID = 1.3;         // diode ideality
  const RS = 0.05 * NS;     // series resistance per panel
  const BYPASS_V = -0.35;   // a Schottky bypass diode across each panel

  function panel(isc_ma, voc_v) {
    const iph = isc_ma / 1000;
    const i0 = iph / (Math.exp(voc_v / (NS * N_ID * VT)) - 1);
    return { iph, i0, isc_ma, voc_v };
  }
  function panelV(p, I) {
    if (I >= p.iph) return BYPASS_V;
    return Math.max(NS * N_ID * VT * Math.log((p.iph - I) / p.i0 + 1) - I * RS, BYPASS_V);
  }
  function stringV(ps, I) { return ps.reduce((s, p) => s + panelV(p, I), 0); }
  function stringI(ps, V) {
    if (V >= stringV(ps, 0)) return 0;
    let lo = 0, hi = Math.max(...ps.map((p) => p.iph)) + 0.01;
    for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (stringV(ps, m) > V) lo = m; else hi = m; }
    return lo;
  }
  // groups: arrays of panel objects, each group a series string, strings in parallel
  function arrayPmax(groups) {
    const voc = Math.max(...groups.map((g) => stringV(g, 0)));
    let best = { p: 0, v: 0, i: 0 };
    const steps = 240;
    for (let k = 0; k <= steps; k++) {
      const v = (voc * k) / steps;
      const i = groups.reduce((s, g) => s + stringI(g, v), 0);
      if (v * i > best.p) best = { p: v * i, v, i };
    }
    return best;
  }
  return { panel, arrayPmax, stringV, stringI };
})();
