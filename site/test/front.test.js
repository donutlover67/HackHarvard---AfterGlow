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

test("the opening, at night, holds the problem headline and both ways in", () => {
  const html = page(ctxEmpty);
  const first = html.slice(0, html.indexOf("</section>"));
  expect(first).toContain('class="opening"');
  expect(first).toContain('data-tone="night"');
  expect(first).toContain('href="#/passports"');
  expect(first).toContain('href="#/build"');
  expect(first).toContain("<h1");
  expect(first.replace(/<[^>]+>/g, "")).toContain("Most retired solar panels still work.");  // the headline is two line spans
});

test("night to day: problem first, then why, then the product, the drawn cell last; skies run from dark to light", () => {
  const html = page(ctxSample);
  const order = ["opening", "problem", "why", "how", "strip", "front-gain", "fpass", "hero", "close"];
  const at = order.map((c) => html.indexOf(`<section class="${c}"`));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect(at).toEqual([...at].sort((x, y) => x - y));
  const skies = [...html.matchAll(/<section class="[a-z-]+"[^>]*data-sky="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
  expect(skies.length).toBe(order.length);
  const lum = (hex) => { const c = hex.slice(1).match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  expect(lum(skies[0])).toBeLessThan(0.02);                 // night
  expect(lum(skies[skies.length - 1])).toBeGreaterThan(0.9); // noon
  expect(lum(skies[1])).toBeLessThan(lum(skies[2]));        // the why is where the sky turns
  expect(html).not.toContain("ticker");   // the facts band repeated the problem's own figures
  expect(html).not.toContain("teaser");   // the finale carries the same two ways in
  expect(html).not.toContain('class="rp"');
});

test("the why is a short paragraph about solar for everyday households", () => {
  const html = page(ctxEmpty);
  const why = html.slice(html.indexOf('<section class="why"'), html.indexOf("</section>", html.indexOf('<section class="why"')));
  const words = why.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length;
  expect(words).toBeLessThan(80);
  expect(why).toContain("household");
});

test("the finale: the drawn cell, a closing line and both ways in", () => {
  const html = page(ctxEmpty);
  const hero = html.slice(html.indexOf('<section class="hero"'), html.indexOf("</section>", html.indexOf('<section class="hero"')));
  expect(hero).toContain("data-hero-slot");
  expect(hero).toContain('href="#/passports"');
  expect(hero).toContain('href="#/build"');
  expect(hero.replace(/<[^>]+>/g, "")).not.toContain("Most retired solar panels still work.");   // not a repeat of the opening
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
  expect((html.match(/data-reveal/g) || []).length).toBe(7);          // opening: headline, lede, buttons; finale: slab, headline, lede, buttons
  expect((html.match(/class="line__in"/g) || []).length).toBe(4);     // two lines in each of the two big headlines
  expect(html).toContain('class="hero__sun"');
  expect((html.match(/class="sun__beam"/g) || []).length).toBe(3);   // three beams of light onto the panel
  expect(html.indexOf('class="hero__sun"')).toBeLessThan(html.indexOf('class="hero__panel"'));   // drawn first, so the panel paints over the beams
  expect(html).toContain('data-lit-poly');                              // the sunlit corner motion.js resizes
  expect(html).not.toContain("hero__svg");
  expect(html).toMatch(/data-count[^>]*>80–88%/);
});
