// House rules for the passport site, checked as files: nothing remote, no gradients or shadows,
// the print rules intact, the vendored three.js a single minified module. Run: bun test site/test
import { test, expect } from "bun:test";
import { readdirSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname; // site/
const read = (p) => Bun.file(root + p).text();
const cssFiles = readdirSync(root + "css").filter((f) => f.endsWith(".css"));

test("three.js is vendored as one minified module with its licence", async () => {
  const f = Bun.file(root + "vendor/three.module.min.js");
  expect(f.size).toBe(691648);
  const src = await f.text();
  expect(src).toContain("Copyright 2010-2024 Three.js Authors");
  expect(/from"\.\//.test(src)).toBe(false);
  expect(await read("vendor/three-LICENSE.txt")).toContain("MIT License");
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
    expect(css).not.toContain("gradient(");
    expect(css).not.toContain("box-shadow");
    expect(css).not.toContain("text-transform: uppercase");
  }
});

test("print rules survive", async () => {
  const css = await read("css/site.css");
  for (const s of ["@media print", ".sheet, .sheet + .sheet", "grid-template-columns: 38mm 1fr", "break-after: page"]) expect(css).toContain(s);
});

test("runs index parses", async () => {
  const idx = JSON.parse(await read("data/runs/index.json"));
  expect(Array.isArray(idx.runs)).toBe(true);
});
