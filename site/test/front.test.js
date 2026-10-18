// The front page's markup, given the data: the two ways in sit in the hero, figures carry their source,
// the passports row shows the four newest, everything is escaped. Run: bun test site/test
import { test, expect } from "bun:test";

const root = new URL("..", import.meta.url).pathname;
const win = {};
new Function("window", await Bun.file(root + "js/front-data.js").text())(win);
new Function("window", await Bun.file(root + "js/front.js").text())(win);
const { page } = win.SSFront;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (x, d) => (x != null && x !== "" && Number.isFinite(Number(x)) ? Number(x).toFixed(d) : "—");
const base = { esc, num, cellSvg: (o) => `<svg data-cell-label="${esc(o.label || "")}"></svg>`, fmtDay: (s) => String(s), loading: false };
const sample = JSON.parse(await Bun.file(root + "data/sample-run.json").text());
const withRun = (run) => ({ ...base, runs: [run], passports: run.passports.map((p, i) => ({ ...p, measured_at: `2026-10-16T1${i}:00:00-04:00`, run })) });
const ctxEmpty = { ...base, runs: [], passports: [] };
const ctxSample = withRun(sample);
const ctxFive = { ...ctxSample, passports: [...ctxSample.passports, { ...ctxSample.passports[0], passport_id: "SS-0005", measured_at: "2026-10-17T09:00:00-04:00" }] };
const ctxHostile = { ...ctxSample, passports: [{ ...ctxSample.passports[0], passport_id: "<img src=x onerror=alert(1)>" }] };

test("the hero holds the headline and both ways in", () => {
  const html = page(ctxEmpty);
  const hero = html.slice(0, html.indexOf("</section>"));
  expect(hero).toContain('data-sign');                 // the string that signs the shrinking frame
  expect(hero).toContain('class="hero__marquee-row"');
  expect(html).toContain('class="repair" data-hero');  // the re-pairing follows the hero on the navy ground
  expect(html).toContain('class="hero__caption');      // the diagram's caption as text, for phones where the svg's is too small
  expect(hero).toContain('href="#/passports"');
  expect(hero).toContain('href="#/build"');
  expect(hero.replace(/<[^>]+>/g, "")).toContain("Used panels still work.");  // the headline is two line spans
});

test("with nothing published the page says so, offers the example batch and labels the model figures", () => {
  const html = page(ctxEmpty);
  const band = html.slice(html.indexOf('id="front-gain"'), html.indexOf('id="front-passports"'));
  expect(band).not.toContain("measured");   // a model figure is never called measured
  expect(html).toContain("No panels published yet");
  expect(html).toContain('id="btn-sample-front"');
  expect(html).toContain("+37%");
  expect(html).toContain("model");
});

test("a run fills the strip, the band and the passports row", () => {
  const html = page(ctxSample);
  expect(html).toContain("2.04 W");
  expect(html).toContain("1.48 W");
  expect(html).toMatch(/<article class="wiring is-best" data-wiring="B"/);
  expect(html.match(/class="ppass"/g).length).toBe(4);
  expect(html).not.toContain("btn-sample-front");
  expect(html).toContain("simulated");
  expect(html).toContain("+37%");
});

test("the passports row shows the four newest", () => {
  const html = page(ctxFive);
  expect(html.match(/class="ppass"/g).length).toBe(4);
  expect(html).toContain('href="#/p/SS-0005"');
  expect(html).not.toContain('href="#/p/SS-0001"');
});

test("a hostile passport ID is escaped everywhere", () => {
  const html = page(ctxHostile);
  expect(html).toContain("&lt;img");
  expect(html).not.toContain("<img");
});

test("while runs are loading the passports section says so", () => {
  expect(page({ ...ctxEmpty, loading: true })).toContain("Loading passports");
});

test("the four steps hang on a drawn string, with a drawing each and no numerals", () => {
  const html = page(ctxSample);
  expect(html).not.toContain("steps__n");
  expect((html.match(/class="step"/g) || []).length).toBe(4);
  expect((html.match(/class="step__glyph"/g) || []).length).toBe(4);
  expect((html.match(/class="string__wire/g) || []).length).toBe(2);
  expect(html).toContain("<ol class=\"string\"");
});

test("every section can enter, the hero intro and the passports heading reveal, the problem numerals count", () => {
  const html = page(ctxSample);
  expect((html.match(/<section[^>]*data-in/g) || []).length).toBeGreaterThanOrEqual(7);
  expect(html).not.toContain("data-dust");
  expect(html).not.toContain("✦");   // the ticker's separators are drawn, not glyphs
  expect((html.match(/data-reveal/g) || []).length).toBe(7);          // headline, lede, buttons, slot, and the three section titles
  expect((html.match(/class="wipe__in"/g) || []).length).toBe(5);     // two headline lines and three titles, each wiped in by a block
  expect((html.match(/wipe--rtl/g) || []).length).toBe(2);            // every other line sweeps the other way
  expect(html).toContain('<span class="hollow">work.</span>');
  expect((html.match(/class="ticker__item"/g) || []).length).toBe(10); // five facts, doubled for the loop
  expect(html).toContain('class="hero__sun"');
  expect((html.match(/class="sun__beam"/g) || []).length).toBe(3);   // three beams of light onto the panel
  expect(html.indexOf('class="hero__sun"')).toBeLessThan(html.indexOf('class="hero__panel"'));   // drawn first, so the panel paints over the beams
  expect(html).toContain('data-lit-poly');                              // the sunlit corner motion.js resizes
  expect(html).not.toContain("hero__svg");
  expect(html).toMatch(/data-count[^>]*>80–88%/);
});
