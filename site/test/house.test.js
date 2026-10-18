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
    const gradients = css.split("\n").filter((l) => l.includes("gradient(") || l.includes("box-shadow"));
    expect(gradients.every((l) => l.startsWith(".nav__sun"))).toBe(true);   // the nav's sun, copied from the ui-refresh branch, is the one exception
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

// the nav is the ui-refresh branch's code: these are its site.css lines (25-29, 206-210, 352-358, 141, 260-263, 268 there), verbatim
const UI_REFRESH_NAV = [
  ".nav { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 14px 24px; background: var(--surface); border-bottom: 1px solid var(--busbar); }",
  ".nav__name { font-weight: 700; font-stretch: 118%; color: var(--cell); text-decoration: none; font-size: 1.25rem; }",
  ".nav__links { display: flex; gap: 18px; }",
  ".nav__links a { color: var(--ink-2); text-decoration: none; padding: 4px 0; border-bottom: 2px solid transparent; }",
  ".nav__links a.is-on { color: var(--cell); border-bottom-color: var(--cell); }",
  ".nav { position: sticky; top: 0; z-index: 5; padding: 16px 28px; }",
  ".nav__name { font-size: 1.35rem; }",
  ".nav__links { gap: 22px; }",
  ".nav__links a { font-weight: 500; }",
  ".nav__links a:hover { color: var(--cell); }",
  ".nav { transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }",
  ".nav__name { display: inline-flex; align-items: center; }",
  ".nav__sun { --p: 0; flex: none; width: 17px; height: 17px; margin-right: 10px; border-radius: 50%; background: conic-gradient(var(--sun) calc(var(--p) * 360deg), var(--busbar-2) 0); box-shadow: inset 0 0 0 2px var(--cell); }",
  "body.has-hero .nav { position: fixed; left: 0; right: 0; top: 0; }",
  "body.has-hero .nav.is-tucked { transform: translateY(-100%); opacity: 0; pointer-events: none; }",
  "body.has-hero .view { padding-top: 0; }",
  "  .nav { padding: 12px 16px; gap: 12px; }",
  "  .nav { padding: 12px 16px 8px; flex-wrap: wrap; row-gap: 6px; }",
  "  .nav__name { font-size: 1.15rem; white-space: nowrap; }",
  "  .nav__links { gap: 12px; font-size: 0.92rem; }",
  "  .nav__links a { white-space: nowrap; }",
  "  .nav { position: static; }",
];
test("the nav's CSS is the ui-refresh branch's, line for line", async () => {
  const css = await read("css/site.css");
  for (const line of UI_REFRESH_NAV) expect(css).toContain(line);
  const html = await read("index.html");
  expect(html).toContain('<a class="nav__name" href="#/"><span class="nav__sun" aria-hidden="true"></span>Afterglow</a>');
});
