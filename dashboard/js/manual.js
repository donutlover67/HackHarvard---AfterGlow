// Readings entered by hand (multimeter, outdoors) when the relays or the ESP32 can't run a grade.
// Builds the same `grade` and `search` messages the firmware sends (protocol/PROTOCOL.md), with the
// firmware's own rules: grade thresholds and flags from firmware/src/main.cpp doGrade() and
// firmware/include/config.h, the like-with-like prediction from firmware/lib/solarlogic predictPairing(),
// and the best wiring from doSearch() (the first of A, B, C with the most power wins a tie).
// app.js pushes the messages through its own dispatch(), so they are validated like serial lines.

const GRADE_A_PCT = 90;
const GRADE_B_PCT = 75;
const LOW_VOC_FRACTION = 0.8;
const DARK_ISC_MA = 5;
const PAIRS = ["A", "B", "C"];

// sanity bounds for typed numbers (small 6 V panels); outside them the reading is almost surely in the wrong unit
const MAX_ISC_MA = 5000;
const MAX_VOC_V = 30;
const MAX_PMAX_W = 100;

export const BENCH_PREFIX = "Entered by hand from multimeter readings";

export function benchLine(note) {
  const n = (note || "").trim();
  if (!n || n.toLowerCase().startsWith(BENCH_PREFIX.toLowerCase())) return n || BENCH_PREFIX;
  return `${BENCH_PREFIX}; ${n}`;
}

function gradeLetter(score) {
  if (score >= GRADE_A_PCT) return "A";
  if (score >= GRADE_B_PCT) return "B";
  return "C";
}

// isc[0..3] for panels 1..4; sort by current, pair 1st with 2nd, 3rd with 4th; panel 1's partner names the wiring
export function predictPairing(isc) {
  const order = [0, 1, 2, 3];
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      if (isc[order[j]] > isc[order[i]]) { const t = order[i]; order[i] = order[j]; order[j] = t; }
  let partner;
  if (order[0] === 0) partner = order[1];
  else if (order[1] === 0) partner = order[0];
  else if (order[2] === 0) partner = order[3];
  else partner = order[2];
  return partner === 1 ? "A" : partner === 2 ? "B" : "C";
}

const round = (x, places) => Math.round(x * 10 ** places) / 10 ** places;

// panels: [{id, isc_ma, voc_v}] for ids 1..4. No lamp box is involved, so isc_raw_ma equals isc_ma.
// `t` (ms since the ESP32 booted) is left out: there was no ESP32.
export function gradeMessage(panels) {
  const isc = panels.map((p) => p.isc_ma);
  const voc = panels.map((p) => p.voc_v);
  const top = Math.max(0, ...isc);
  const sorted = [...voc].sort((a, b) => a - b);
  const medianVoc = (sorted[1] + sorted[2]) / 2;
  return {
    type: "grade",
    panels: panels.map((p, k) => {
      const score = top > 0 ? (isc[k] / top) * 100 : 0;
      const flags = [];
      if (score < GRADE_B_PCT) flags.push("weak");
      if (voc[k] < LOW_VOC_FRACTION * medianVoc) flags.push("low_voc");
      if (isc[k] < DARK_ISC_MA) flags.push("dark");
      return { id: p.id, isc_ma: round(isc[k], 1), isc_raw_ma: round(isc[k], 1), voc_v: round(voc[k], 2), score: round(score, 1), grade: gradeLetter(score), flags };
    }),
    predicted: predictPairing(isc),
  };
}

export function searchMessage(pmax, predicted) {
  let best = "A";
  for (const k of PAIRS) if (pmax[k] > pmax[best]) best = k;
  return {
    type: "search",
    pmax_w: Object.fromEntries(PAIRS.map((k) => [k, round(pmax[k], 3)])),
    best, predicted, match: best === predicted,
  };
}

// One typed field -> {value} | {empty} | {error}. `what` names the field in the message.
function readNumber(raw, what) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return { empty: true };
  if (/^[+-]?\d+,\d+$/.test(s)) return { error: `${what}: use a dot for decimals (${s.replace(",", ".")}).` };
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return { error: `${what}: “${s}” is not a number.` };
  return { value: Number(s) };
}

// fields: {isc: {1..4: string}, voc: {1..4: string}, pmax: {A,B,C: string}}
// Returns {errors: [{field, msg}], panels, pmax (or null when all three are empty)}.
export function readEntry(fields) {
  const errors = [];
  const bad = (field, msg) => errors.push({ field, msg });
  const panels = [];
  const empty = [];          // reported together: one line for any number of blank panel fields
  for (let id = 1; id <= 4; id++) {
    const i = readNumber(fields.isc[id], `Panel ${id} short-circuit current`);
    const v = readNumber(fields.voc[id], `Panel ${id} open-circuit voltage`);
    if (i.empty) empty.push([`isc-${id}`, `panel ${id} current`]);
    else if (i.error) bad(`isc-${id}`, i.error);
    else if (i.value < 0) bad(`isc-${id}`, `Panel ${id} short-circuit current can't be negative; swap the meter leads.`);
    else if (i.value > MAX_ISC_MA) bad(`isc-${id}`, `Panel ${id} short-circuit current of ${i.value} mA is too high for these panels; enter milliamps.`);
    if (v.empty) empty.push([`voc-${id}`, `panel ${id} voltage`]);
    else if (v.error) bad(`voc-${id}`, v.error);
    else if (v.value <= 0) bad(`voc-${id}`, `Panel ${id} open-circuit voltage must be more than 0 V.`);
    else if (v.value > MAX_VOC_V) bad(`voc-${id}`, `Panel ${id} open-circuit voltage of ${v.value} V is too high for a 6 V panel; enter volts, not millivolts.`);
    panels.push({ id, isc_ma: i.value, voc_v: v.value });
  }
  if (empty.length) {
    const msg = empty.length === 8 ? "Enter the short-circuit current (mA) and open-circuit voltage (V) of all four panels."
      : `Every panel needs both readings; still empty: ${empty.map(([, w]) => w).join(", ")}.`;
    errors.unshift(...empty.map(([field]) => ({ field, msg })));
  }
  if (!errors.some((e) => e.field.startsWith("isc")) && Math.max(...panels.map((p) => p.isc_ma)) < DARK_ISC_MA) {
    bad("isc-1", `All four currents are under ${DARK_ISC_MA} mA. Enter milliamps (0.150 A is 150 mA), measured in light.`);
  }

  const got = PAIRS.map((k) => [k, readNumber(fields.pmax[k], `Wiring ${k} maximum power`)]);
  const filled = got.filter(([, r]) => !r.empty);
  let pmax = null;
  if (filled.length && filled.length < 3) {
    const missing = got.filter(([, r]) => r.empty).map(([k]) => k);
    missing.forEach((k) => bad(`pmax-${k}`, `Enter the maximum power of all three wirings, or leave all three empty; missing: ${missing.join(" and ")}.`));
  }
  filled.forEach(([k, r]) => {
    if (r.error) bad(`pmax-${k}`, r.error);
    else if (r.value <= 0) bad(`pmax-${k}`, `Wiring ${k} maximum power must be more than 0 W.`);
    else if (r.value > MAX_PMAX_W) bad(`pmax-${k}`, `Wiring ${k} maximum power of ${r.value} W is too high for four small panels; enter watts.`);
  });
  if (filled.length === 3) pmax = Object.fromEntries(got.map(([k, r]) => [k, r.value]));
  return { errors, panels, pmax };
}
