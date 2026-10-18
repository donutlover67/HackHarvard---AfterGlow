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
