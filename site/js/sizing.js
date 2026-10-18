// String sizing for the Array Builder: how many panels go in series for a given use, by the formulas solar installers
// use. The fewest panels: the working voltage on a hot day must reach what the device or controller needs. The most
// panels: the open-circuit voltage on a cold morning must stay under what it can take.
// Sources:
//   string-length formulas and the 0.88 margin: Greentech Renewables, "Solar Inverter String Design Calculations"
//   cell temperature above the air: Sandia array performance model (King et al. 2004), as published in pvlib
//   an MPPT controller starts at battery + 5 V and keeps running down to battery + 1 V: Victron Energy community
//   125% of short-circuit current for the current limit: US National Electrical Code 690.8(A)(1)
// No DOM here: app.js renders the inputs and the results. size() is pure, so it can be checked on its own.
window.SSSizing = (function () {
  const VMP_RATIO = 0.82;   // working (maximum-power) voltage / open-circuit voltage at 25 °C, the rule tools/eval uses
  const DERATE = 0.88;      // margin on the hot-day working voltage
  const ISC_FACTOR = 1.25;  // design current = 125% of short-circuit current
  const MPPT_START = 5, MPPT_RUN = 1;   // volts above the battery
  // Sandia: module temperature = E * exp(a + b * wind) + air; cell = module + dT at 1000 W/m². Full sun, 1 m/s wind.
  const MOUNTS = {
    rack: { text: "On a rack or pole, open behind", a: -3.56, b: -0.075, dT: 3 },
    gap: { text: "Close to a roof, a small gap behind", a: -2.98, b: -0.0471, dT: 1 },
    flat: { text: "Flat on a roof or surface, no air behind", a: -2.81, b: -0.0455, dT: 0 },
  };
  const riseOf = (m) => 1000 * Math.exp(m.a + m.b * 1) + m.dT;
  const DEFAULTS = { use: "direct", label: "12", devMax: "", batt: "12", vabs: "", ctrl: "mppt", ctrlMax: "", low: "", high: "", maxA: "", tHot: 35, tCold: -12, unit: "C", mount: "rack", bOc: -0.30, bMp: -0.40, kManual: null };
  const USES = [
    { id: "direct", text: "Run a device directly (pump, fan, lights)" },
    { id: "battery", text: "Charge a battery through a charge controller" },
    { id: "converter", text: "Feed an inverter or DC converter" },
    { id: "maxw", text: "Nothing set yet: the most total watts" },
  ];
  const n = (v) => (v === "" || v == null || !isFinite(Number(v)) ? null : Number(v));
  const f1 = (v) => String(Math.round(v * 100) / 100);   // 15.4, 4.15, 100: as many decimals as the number needs, at most two

  // "12", "12 V", "9-30", "9–30 V", "9 to 30 V"
  function parseLabel(text) {
    const t = String(text || "").trim();
    const r = t.match(/(\d+(?:\.\d+)?)\s*v?\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i);
    if (r) { const a = Number(r[1]), b = Number(r[2]); return a > 0 && b > a ? { low: a, high: b, range: true } : null; }
    const one = t.match(/^(\d+(?:\.\d+)?)\s*v?\s*(?:dc)?$/i);
    return one && Number(one[1]) > 0 ? { low: Number(one[1]), high: null, range: false } : null;
  }

  // per-panel voltages at the hot and cold extremes, from the median open-circuit voltage of the pool
  function panelVolts(s, voc) {
    const mount = MOUNTS[s.mount] || MOUNTS.rack;
    const rise = riseOf(mount);
    const tCellHot = s.tHot + rise;
    const vmp25 = VMP_RATIO * voc;
    const vmpHotRaw = vmp25 * (1 + (s.bMp / 100) * (tCellHot - 25));
    return {
      voc, vmp25, rise, tCellHot, mount,
      vmpHotRaw, vmpHot: vmpHotRaw * DERATE,
      vocHot: voc * (1 + (s.bOc / 100) * (tCellHot - 25)),
      vocCold: voc * (1 + (s.bOc / 100) * (s.tCold - 25)),   // before sunrise the cells are at air temperature
    };
  }

  // Returns the allowed string lengths and how to choose among them, or { error } when the inputs are incomplete.
  //   kMin, kMax: the range (kMax may be Infinity when no upper limit was given)
  //   pick: "fewest" (extra voltage is wasted or overdrives the device) or "watts" (most total watts in the range)
  //   deliverV: when set, power actually delivered is estimated at this voltage (PWM charging, a fixed-voltage device)
  //   needs: lines explaining each limit; warn: things that were not checked or look risky
  function size(sIn, voc) {
    const s = { ...DEFAULTS, ...sIn };
    s.tHot = n(s.tHot) ?? DEFAULTS.tHot; s.tCold = n(s.tCold) ?? DEFAULTS.tCold;
    s.bOc = n(s.bOc) ?? DEFAULTS.bOc; s.bMp = n(s.bMp) ?? DEFAULTS.bMp;
    if (s.tCold >= s.tHot) return { error: "The coldest temperature has to be below the hottest." };
    if (s.bOc >= 0 || s.bMp >= 0) return { error: "Temperature coefficients of silicon panels are negative (voltage falls as they heat up)." };
    const pv = panelVolts(s, voc);
    const needs = [], warn = [];
    let kMin = 1, kMax = Infinity, pick = "watts", deliverV = null, deliverWhat = "", maxA = null;
    const atLeast = (volts, per, what, perWhat = "each panel's working voltage on a hot day, after the margin, is") => { const k = Math.max(1, Math.ceil(volts / per - 1e-9)); needs.push({ k, kind: "min", text: `${what} ${f1(volts)} V; ${perWhat} ${f1(per)} V, so at least ${k} in series` }); kMin = Math.max(kMin, k); };
    const atMost = (volts, what) => { const k = Math.floor(volts / pv.vocCold + 1e-9); needs.push({ k, kind: "max", text: `${what} ${f1(volts)} V; each panel reaches ${f1(pv.vocCold)} V open-circuit on the coldest morning, so at most ${k} in series` }); kMax = Math.min(kMax, k); };

    if (s.use === "direct") {
      const lab = parseLabel(s.label);
      if (!lab) return { error: "Type the voltage printed on the device: one number like 12, or a range like 9–30." };
      atLeast(lab.low, pv.vmpHot, lab.range ? "Its lowest input voltage is" : "It is rated");
      const high = lab.range ? lab.high : n(s.devMax);
      if (high) {
        if (high < lab.low) return { error: "The highest voltage it accepts has to be above its rated voltage." };
        atMost(high, lab.range ? "Its highest input voltage is" : "It accepts at most");
      } else warn.push("cold");
      // a fixed-voltage device: more panels in series only push it past its rating. A range: it takes what it needs.
      pick = lab.range ? "watts" : "fewest";
      if (!lab.range) { deliverV = lab.low; deliverWhat = `at the device's ${lab.low} V`; }
      return finish();
    }
    if (s.use === "battery") {
      const batt = n(s.batt);
      if (!(batt > 0)) return { error: "Type the battery voltage on its label, like 12, 24 or 48." };
      const vabs = n(s.vabs) || batt * 1.2;
      if (vabs < batt) return { error: "The charging voltage has to be above the battery's own voltage (about 14.4 V for a 12 V battery)." };
      // not sure which type: meet the MPPT limits (they are stricter than PWM's) and keep the fewest panels (what PWM wants)
      const mppt = s.ctrl === "mppt", unsure = s.ctrl === "unsure";
      if (mppt || unsure) {
        atLeast(vabs + MPPT_RUN, pv.vmpHot, `An MPPT controller keeps charging while the panels stay 1 V above the battery's charging voltage:`);
        atLeast(vabs + MPPT_START, pv.vocHot, `It only starts once the panels reach 5 V above the battery:`, "each panel's open-circuit voltage on a hot day is");
      }
      if (mppt) pick = "watts";
      else if (unsure) { pick = "fewest"; warn.push("unsure"); }
      else {
        atLeast(vabs, pv.vmpHot, `A PWM controller connects the panels straight to the battery, so their working voltage has to reach the charging voltage:`);
        pick = "fewest"; deliverV = vabs; deliverWhat = `into the battery at ${f1(vabs)} V (a PWM controller holds the panels at the battery's voltage)`;
      }
      const cm = n(s.ctrlMax);
      if (cm) atMost(cm, "The controller's maximum panel voltage is"); else warn.push("ctrlMax");
      maxA = n(s.maxA);
      return finish();
    }
    if (s.use === "converter") {
      const lo = n(s.low), hi = n(s.high);
      if (!(lo > 0)) return { error: "Type the lowest input voltage on its label (the start voltage, or the bottom of its MPPT range)." };
      atLeast(lo, pv.vmpHot, "Its lowest input voltage is");
      if (hi) { if (hi <= lo) return { error: "The highest input voltage has to be above the lowest." }; atMost(hi, "Its maximum input voltage is"); } else warn.push("cold");
      maxA = n(s.maxA);
      pick = "watts";
      return finish();
    }
    // maxw: no device yet. Any length works; show the voltages so the user can match a device later.
    pick = "watts";
    return finish();

    function finish() {
      return { s, pv, kMin, kMax, pick, deliverV, deliverWhat, needs, warn, maxA, use: s.use };
    }
  }

  // total design current of an array: each string's largest short-circuit current (its bypass diodes let the strongest
  // panel set it), summed, times 1.25
  function designCurrentA(groups) { return ISC_FACTOR * groups.reduce((sum, g) => sum + Math.max(...g.map((p) => p.isc_ma)), 0) / 1000; }

  return { size, parseLabel, panelVolts, designCurrentA, MOUNTS, USES, DEFAULTS, VMP_RATIO, DERATE, ISC_FACTOR, riseOf };
})();
