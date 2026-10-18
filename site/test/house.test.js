// House rules for the passport site, checked as files: nothing remote, no gradients or shadows,
// the print rules intact. Run: bun test site/test
import { test, expect } from "bun:test";
import { readdirSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname; // site/
const read = (p) => Bun.file(root + p).text();
const cssFiles = readdirSync(root + "css").filter((f) => f.endsWith(".css"));

test("every stylesheet has balanced braces (a stray brace silently drops the next rule)", async () => {
  for (const f of cssFiles) {
    const css = (await read("css/" + f)).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(`${f}: ${(css.match(/{/g) || []).length}`).toBe(`${f}: ${(css.match(/}/g) || []).length}`);
  }
});


test("nothing loads from the internet", async () => {
  const html = await read("index.html");
  expect(html).not.toMatch(/<script[^>]+src="https?:/);
  expect(html).not.toMatch(/<link[^>]+href="https?:/);
  for (const f of cssFiles) expect(await read(`css/${f}`)).not.toMatch(/@import\s+url\(\s*["']?https?:/);
});

test("house style: no gradients, shadows or uppercase labels", async () => {
  for (const f of cssFiles) {
    const css = await read(`css/${f}`);
    const gradients = css.split("\n").filter((l) => !l.trim().startsWith("/*") && (l.includes("gradient(") || l.includes("box-shadow")));
    expect(gradients).toEqual([]);   // the night-to-day sky is solid colours blended by motion.js, and the nav's sun is drawn
    expect(css).not.toContain("text-transform: uppercase");
  }
});

test("print rules survive", async () => {
  const css = await read("css/site.css");
  for (const s of ["@media print", ".sheet, .sheet + .sheet", "grid-template-columns: 38mm 1fr", "break-after: page"]) expect(css).toContain(s);
});

// WCAG contrast of two hex colours
const lum = (hex) => { const c = hex.replace("#", "").match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
test("labels read at AA on both grounds", async () => {
  const css = await read("css/site.css");
  const token = (name) => css.match(new RegExp(name + ":\\s*(#[0-9a-f]{6})"))[1];
  expect(css).toMatch(/\.label \{[^}]*color: var\(--ink-2\)/);
  expect(contrast(token("--ink-2"), token("--page"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(token("--ink-2"), token("--surface"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(token("--ink-3"), token("--surface"))).toBeGreaterThanOrEqual(4.5);
});

test("print keeps the type metrics the passport pages were checked with", async () => {
  const css = await read("css/site.css");
  expect(css).toMatch(/@media print \{[^}]*html \{ font-size: 16px; \}/);
});

test("runs index parses", async () => {
  const idx = JSON.parse(await read("data/runs/index.json"));
  expect(Array.isArray(idx.runs)).toBe(true);
});

// the nav: sticky on every page; its sun is a drawn disc with eight rays that light as the page scrolls (motion.js)
test("the nav is sticky and its sun is drawn, with eight rays", async () => {
  const css = await read("css/site.css");
  expect(css).toMatch(/\.nav \{[^}]*position: sticky; top: 0;/);
  expect(css).toContain(".nav__sun line.is-lit { stroke: var(--sun); }");
  expect(css).toContain("  .nav { position: static; }");   // print
  const html = await read("index.html");
  const sun = html.slice(html.indexOf('<svg class="nav__sun"'), html.indexOf("</svg>", html.indexOf('<svg class="nav__sun"')));
  expect((sun.match(/<line /g) || []).length).toBe(8);
  expect(sun).toContain("<circle");
  expect(html).toMatch(/<a class="nav__name" href="#\/"><svg class="nav__sun"[\s\S]*?<\/svg>Second String<\/a>/);
});

test("the sky layer: stars, a moon and a sun, drawn, nothing remote", async () => {
  const html = await read("index.html");
  for (const c of ["sky__stars", "sky__moon", "sky__sun", "sky__disc"]) expect(html).toContain(`class="${c}"`);
  const css = await read("css/front.css");
  expect(css).toContain('body[data-page="front"] .sky { display: block; }');   // the sky shows on the front page only
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
});
