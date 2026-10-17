// Which run supplies each front-page figure. A measured run always beats a simulated one; among
// equals the newest wins; with nothing usable, the single-diode model's demo batch stands in, labelled.
window.SSFrontData = (function () {
  // tools/sim: lamp boxes at 40% of sun, 35% film on two of four panels
  const MODEL_DEMO = { gain_pct: 37, watts: { A: 1.48, B: 2.04, C: 1.48 }, best: "B" };
  const LINK_WORD = { serial: "measured on the bench", manual: "entered by hand", recording: "from a recording", mock: "simulated", sample: "simulated" };
  const SIMULATED = ["mock", "sample"];
  const WIRINGS = ["A", "B", "C"];

  const sourceWord = (link) => LINK_WORD[link] || (typeof link === "string" && link ? link : "unlabelled");
  const isReal = (run) => !SIMULATED.includes(run.link);
  const stamp = (x) => (typeof x.measured_at === "string" ? x.measured_at : "");
  const finite = (x) => Number.isFinite(Number(x));

  // the newest run passing ok; measured runs first whenever one passes
  function newest(runs, ok) {
    const good = (Array.isArray(runs) ? runs : []).filter((r) => r && typeof r === "object" && ok(r));
    const pool = good.some(isReal) ? good.filter(isReal) : good;
    return pool.reduce((best, r) => (!best || stamp(r) > stamp(best) ? r : best), null);
  }

  function gainFigure(runs) {
    const run = newest(runs, (r) => r.proof && r.proof.kind === "sweep" && finite(r.proof.gain_pct));
    if (!run) return { pct: MODEL_DEMO.gain_pct, source: "model", run: null, model: true };
    return { pct: Number(run.proof.gain_pct), source: sourceWord(run.link), run, model: false };
  }

  function stripFigures(runs) {
    const run = newest(runs, (r) => r.search && r.search.pmax_w && WIRINGS.every((L) => finite(r.search.pmax_w[L])));
    if (!run) return { watts: { ...MODEL_DEMO.watts }, best: MODEL_DEMO.best, source: "model", run: null, model: true };
    const watts = Object.fromEntries(WIRINGS.map((L) => [L, Number(run.search.pmax_w[L])]));
    const best = WIRINGS.includes(run.search.best) ? run.search.best : WIRINGS.reduce((a, b) => (watts[b] > watts[a] ? b : a));
    return { watts, best, source: sourceWord(run.link), run, model: false };
  }

  // newest first; passports without a date come last
  function latestPassports(passports, n = 4) {
    return [...(Array.isArray(passports) ? passports : [])].sort((a, b) => stamp(b).localeCompare(stamp(a))).slice(0, n);
  }

  return { gainFigure, stripFigures, latestPassports, sourceWord, MODEL_DEMO };
})();
