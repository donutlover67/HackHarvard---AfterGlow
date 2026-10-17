// Which run supplies each front-page figure, and what it falls back to. Run: bun test site/test
import { test, expect } from "bun:test";

const root = new URL("..", import.meta.url).pathname;
const win = {};
new Function("window", await Bun.file(root + "js/front-data.js").text())(win);
const { gainFigure, stripFigures, latestPassports, sourceWord } = win.SSFrontData;
const sample = JSON.parse(await Bun.file(root + "data/sample-run.json").text());
const real = { ...sample, run_id: "run-real", link: "serial", measured_at: "2026-10-18T09:00:00-04:00", proof: { ...sample.proof, gain_pct: 12.4 } };

test("with no runs the gain is the model's 37%, labelled", () => {
  expect(gainFigure([])).toEqual({ pct: 37, source: "model", run: null, model: true });
});

test("the sample run supplies a simulated gain", () => {
  const g = gainFigure([sample]);
  expect(g).toMatchObject({ pct: 37.1, source: "simulated", model: false });
  expect(g.run.run_id).toBe("run-20261016-sample");
});

test("a measured run is preferred over a simulated one, newer or older", () => {
  expect(gainFigure([sample, real])).toMatchObject({ pct: 12.4, source: "measured on the bench" });
  const older = { ...real, measured_at: "2026-10-15T09:00:00-04:00" };
  expect(gainFigure([sample, older]).pct).toBe(12.4);
  expect(stripFigures([sample, { ...older, search: { ...sample.search, pmax_w: { A: 1.1, B: 1.3, C: 1.2 } } }]).watts.B).toBe(1.3);
});

test("the newest qualifying run wins and a string gain_pct is read as a number", () => {
  const newer = { ...real, measured_at: "2026-10-19T09:00:00-04:00", proof: { ...real.proof, gain_pct: "20.5" } };
  expect(gainFigure([real, newer]).pct).toBe(20.5);
  expect(gainFigure([newer, real]).pct).toBe(20.5);
});

test("runs without a usable sweep proof fall back to the model", () => {
  expect(gainFigure([{ ...real, proof: { ...real.proof, gain_pct: "nan" } }]).model).toBe(true);
  expect(gainFigure([{ ...real, proof: { ...real.proof, kind: "pump" } }]).model).toBe(true);
  expect(gainFigure([{ ...real, proof: undefined }]).model).toBe(true);
});

test("a missing or odd measured_at never throws", () => {
  expect(gainFigure([{ ...real, measured_at: undefined }]).pct).toBe(12.4);
  expect(gainFigure([{ ...real, measured_at: 42 }]).pct).toBe(12.4);
  expect(gainFigure([{ ...real, measured_at: undefined }, sample]).pct).toBe(12.4);
});

test("with no runs the strip shows the model's three wirings", () => {
  expect(stripFigures([])).toMatchObject({ watts: { A: 1.48, B: 2.04, C: 1.48 }, best: "B", model: true, source: "model", run: null });
});

test("the sample run supplies the strip's watts", () => {
  expect(stripFigures([sample])).toMatchObject({ watts: sample.search.pmax_w, best: "B", source: "simulated", model: false });
});

test("a wiring without a finite figure disqualifies the run", () => {
  expect(stripFigures([{ ...sample, search: { pmax_w: { A: 1, B: "x", C: 2 } } }]).model).toBe(true);
  expect(stripFigures([{ ...sample, search: undefined }]).model).toBe(true);
});

test("the best wiring is the run's best, or the largest figure when it names none", () => {
  expect(stripFigures([{ ...sample, search: { pmax_w: { A: 3, B: 1, C: 2 } } }]).best).toBe("A");
  expect(stripFigures([{ ...sample, search: { pmax_w: { A: 3, B: 1, C: 2 }, best: "C" } }]).best).toBe("C");
  expect(stripFigures([{ ...sample, search: { pmax_w: { A: 3, B: 1, C: 2 }, best: "Z" } }]).best).toBe("A");
});

test("latestPassports returns the newest first, undated ones last, four by default, without touching the input", () => {
  const ps = [
    { passport_id: "SS-0001", measured_at: "2026-10-16T10:00:00-04:00" },
    { passport_id: "SS-0002", measured_at: "2026-10-16T12:00:00-04:00" },
    { passport_id: "SS-0003" },
    { passport_id: "SS-0004", measured_at: "2026-10-16T11:00:00-04:00" },
  ];
  expect(latestPassports(ps, 2).map((p) => p.passport_id)).toEqual(["SS-0002", "SS-0004"]);
  expect(latestPassports(ps).map((p) => p.passport_id)).toEqual(["SS-0002", "SS-0004", "SS-0001", "SS-0003"]);
  expect(latestPassports([...ps, { passport_id: "SS-0005", measured_at: "2026-10-17T00:00:00-04:00" }]).length).toBe(4);
  expect(ps[0].passport_id).toBe("SS-0001");
});

test("sourceWord names where a run came from", () => {
  expect(sourceWord("serial")).toBe("measured on the bench");
  expect(sourceWord("manual")).toBe("entered by hand");
  expect(sourceWord("recording")).toBe("from a recording");
  expect(sourceWord("mock")).toBe("simulated");
  expect(sourceWord("sample")).toBe("simulated");
  expect(sourceWord(undefined)).toBe("unlabelled");
  expect(sourceWord("")).toBe("unlabelled");
});
