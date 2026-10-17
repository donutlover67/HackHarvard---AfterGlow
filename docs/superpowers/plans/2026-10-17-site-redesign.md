# Site redesign ("the string") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `site/` under one light, navy visual and motion system: a new front page at `#/`, the passport index at `#/passports`, a lazily loaded three.js hero and seven motion moves, with every passport and card address unchanged.

**Architecture:** The site stays a hash-routed static folder of classic scripts. New small scripts carry the new responsibilities: `routes.js` (the route table), `front-data.js` (which run supplies each front-page figure), `front.js` (the front page's markup), `motion.js` (every motion move and the 3D loader), `hero3d.js` (the three.js scene, an ES module imported on demand). `app.js` keeps data, the existing pages and the router and calls into them. Pure logic is tested with `bun test` (bun 1.4.3 is installed on this Mac; the site gains no dependency); DOM and visual behaviour is checked in the built-in browser at 1440, 768 and 390 px.

**Tech Stack:** HTML, CSS, plain JavaScript; three.js 0.170.0 vendored (`build/three.module.min.js`); View Transitions API and IntersectionObserver with fallbacks; `bun test` for logic; `python3 -m http.server` and `tools/serve.py` to preview.

**Spec:** `docs/superpowers/specs/2026-10-17-site-redesign-design.md`

## Global Constraints

- No build step, no dependency, nothing loaded from the internet at runtime. three.js is vendored as `site/vendor/three.module.min.js` from `three@0.170.0` (691,648 bytes, MIT, no import of a companion file), its LICENSE alongside.
- `#/p/<ID>`, `#/build`, `#/impact`, `#/print` keep their addresses; QR codes keep encoding the page's own URL; print stays one page per passport and four cards per sheet, so the `@media print` rules and the `.passport`, `.sheet`, `.pcard` class names are kept verbatim.
- `normalizeRun`, the API-then-`index.json` fallback and the render safety net stay as they are.
- No gradients, shadows, pictogram icons, eyebrow labels, uppercase labels or emoji. Archivo only. Tabular figures. Radius 3 px. `--sun` on exactly one numeral per page (front page: the gain band's).
- Motion uses transform, opacity and filter only; `prefers-reduced-motion` shows end states; loops pause while `document.hidden`; at most two scroll-driven effects on screen; nothing over 600 ms except dust (≤ 1.2 s) and scroll-driven moves.
- Front page: first paint before any script-driven motion; the H1 is real text; three.js loads after first paint and only on the front page; the hero slot has a fixed aspect; no scroll hijack on touch.
- Copy: headings fit two lines at 390 px; "measured" only for measured numbers; model figures labelled as such.
- Commit prefixes `site:` `tools:` `docs:`. Nothing is pushed by this plan; the user says when.

## Review Focus

1. Hash variants a phone may produce (`#/passports/`, `#/build?x=1`, `#/p/SS%2D0001`, bare `#`, a bad escape): the route table lands on the right page and never throws. → Task 2, `routes.test.js`.
2. Runs with a missing or non-string `measured_at`, or `proof.gain_pct` as a string or garbage: the front page picks a figure or falls back to the model, never throws. → Task 2, `front-data.test.js`.
3. A hostile passport ID in the front page's passport row: escaped everywhere. → Task 4, `front.test.js`.
4. Browsers without `IntersectionObserver`, `requestIdleCallback`, `startViewTransition` or WebGL: every entrance shows its end state and the hero shows the SVG. → Task 5 `motion.test.js` (`decide3D`, `supports`), Task 6 `?hero=svg` browser check.
5. A data re-render while the reader is mid-scroll on the front page (the sample loads, the server adds a run): no jump to the top, no second dust, the 3D canvas stays. → Task 4 `SSFront.refresh` with `render("data")`, browser check in Task 8.

---

### Task 1: Vendor three.js and add the house-rules test

**Files:**
- Create: `site/vendor/three.module.min.js`, `site/vendor/three-LICENSE.txt`, `site/test/house.test.js`

**Interfaces:**
- Produces: `site/vendor/three.module.min.js`, imported from `site/js/hero3d.js` as `import * as THREE from "../vendor/three.module.min.js"`.

- [ ] **Step 1: Write `site/test/house.test.js`** (bun; `const root = new URL("..", import.meta.url).pathname`):

```js
test("three.js is vendored as one minified module", async () => {
  const f = Bun.file(root + "vendor/three.module.min.js");
  expect(f.size).toBe(691648);
  const src = await f.text();
  expect(src).toContain("Copyright 2010-2024 Three.js Authors");
  expect(/from"\.\//.test(src)).toBe(false);
  expect(await Bun.file(root + "vendor/three-LICENSE.txt").text()).toContain("MIT License");
});
test("nothing loads from the internet", …)  // index.html: no <script src="http, no <link … href="http; css: no @import url(http
test("house style", …)                      // css/*.css: no "gradient(", "box-shadow", "text-transform: uppercase"
test("print rules survive", …)              // site.css contains "@media print", ".sheet, .sheet + .sheet", "grid-template-columns: 38mm 1fr", "break-after: page"
test("runs index parses", …)                // data/runs/index.json → object with an array "runs"
```

- [ ] **Step 2: Run** `bun test site/test/house.test.js` → the three.js test FAILS (no file), the rest pass.
- [ ] **Step 3: Fetch the npm tarball into an empty scratch directory, check its integrity, extract the two files into `site/vendor/`**

```bash
curl -sL https://registry.npmjs.org/three/0.170.0 | python3 -c 'import json,sys; print(json.load(sys.stdin)["dist"]["integrity"])'
curl -sL -o three-0.170.0.tgz https://registry.npmjs.org/three/-/three-0.170.0.tgz
printf 'sha512-%s\n' "$(openssl dgst -sha512 -binary three-0.170.0.tgz | base64)"   # must equal the line above
tar -xzf three-0.170.0.tgz package/build/three.module.min.js package/LICENSE
```

- [ ] **Step 4: Run the test → PASS. Commit** `site: vendor three.js 0.170.0 for the front-page hero`

### Task 2: Route table, front-page data rules, and the new addresses

**Files:**
- Create: `site/js/routes.js`, `site/js/front-data.js`, `site/test/routes.test.js`, `site/test/front-data.test.js`
- Modify: `site/js/app.js` (router 345–367, bootstrap 405–408, back links 131, 155, 160, 216, 219, 231, `wireIndex` 111–127), `site/index.html` (nav, scripts), `tools/serve.py:77`

**Interfaces:**
- Produces `window.SSRoutes.parse(hash) → { page, id, nav }` with `page ∈ front|passports|passport|build|impact|print`, `id` the decoded passport ID or `null`, `nav ∈ passports|build|impact|null` (passport and print count as passports); `SSRoutes.direction(fromPage, toPage) → "fwd"|"back"` by the order front < passports < build < impact.
- Produces `window.SSFrontData`: `gainFigure(runs) → { pct, source, run, model }`, `stripFigures(runs) → { watts: {A,B,C}, best, source, run, model }`, `latestPassports(passports, n = 4)`, `sourceWord(link)`, `MODEL_DEMO = { gain_pct: 37, watts: { A: 1.48, B: 2.04, C: 1.48 }, best: "B" }` (the single-diode model, 40% sun, 35% film on two panels, `tools/sim`).
- Produces in `app.js`: `render(reason = "route")` (data refreshes call `render("data")`, which neither scrolls nor transitions); `pageFront()` (a placeholder until Task 4); `window.secondStringSite.loadSample(statusEl)` shared by the index and, later, the front page.

- [ ] **Step 1: Write `site/test/routes.test.js`** (load the script with `new Function("window", src)(window = {})`):

```js
const front = { page: "front", id: null, nav: null };
expect(parse("#/")).toEqual(front); expect(parse("")).toEqual(front); expect(parse("#")).toEqual(front); expect(parse("#/nonsense")).toEqual(front);
expect(parse("#/passports")).toEqual({ page: "passports", id: null, nav: "passports" });
expect(parse("#/passports/").page).toBe("passports");
expect(parse("#/p/SS-0001")).toEqual({ page: "passport", id: "SS-0001", nav: "passports" });
expect(parse("#/p/SS%2D0001").id).toBe("SS-0001");
expect(parse("#/p/%E0%A4%A").id).toBe("%E0%A4%A");          // a bad escape is kept raw, never thrown
expect(parse("#/build?x=1").page).toBe("build"); expect(parse("#/impact").nav).toBe("impact");
expect(parse("#/print")).toEqual({ page: "print", id: null, nav: "passports" });
expect(direction("front", "build")).toBe("fwd"); expect(direction("impact", "passport")).toBe("back"); expect(direction("passports", "print")).toBe("fwd");
```

- [ ] **Step 2: Write `site/test/front-data.test.js`.** Fixtures: `sample = JSON.parse(await Bun.file(root + "data/sample-run.json").text())`; `real = { ...sample, run_id: "run-real", link: "serial", measured_at: "2026-10-18T09:00:00-04:00", proof: { ...sample.proof, gain_pct: 12.4 } }`.

```js
expect(gainFigure([])).toEqual({ pct: 37, source: "model", run: null, model: true });
expect(gainFigure([sample])).toMatchObject({ pct: 37.1, source: "simulated", model: false }); expect(gainFigure([sample]).run.run_id).toBe("run-20261016-sample");
expect(gainFigure([sample, real])).toMatchObject({ pct: 12.4, source: "measured on the bench" });
expect(gainFigure([real, { ...real, measured_at: "2026-10-19T09:00:00-04:00", proof: { ...real.proof, gain_pct: "20.5" } }]).pct).toBe(20.5);
expect(gainFigure([{ ...real, proof: { ...real.proof, gain_pct: "nan" } }]).model).toBe(true);
expect(gainFigure([{ ...real, measured_at: undefined }]).pct).toBe(12.4);
expect(gainFigure([{ ...real, proof: { ...real.proof, kind: "pump" } }]).model).toBe(true);   // only sweep proofs count, as on the impact page
expect(stripFigures([])).toMatchObject({ watts: { A: 1.48, B: 2.04, C: 1.48 }, best: "B", model: true });
expect(stripFigures([sample])).toMatchObject({ watts: sample.search.pmax_w, best: "B", source: "simulated", model: false });
expect(stripFigures([{ ...sample, search: { pmax_w: { A: 1, B: "x", C: 2 } } }]).model).toBe(true);
// latestPassports: four passports with measured_at 2026-10-16T10, T11, T12 and one missing → n=2 gives [T12, T11]; the missing one is last; default n is 4
expect(sourceWord("serial")).toBe("measured on the bench"); expect(sourceWord("manual")).toBe("entered by hand"); expect(sourceWord("recording")).toBe("from a recording");
expect(sourceWord("mock")).toBe("simulated"); expect(sourceWord("sample")).toBe("simulated"); expect(sourceWord(undefined)).toBe("unlabelled");
```

- [ ] **Step 3: Run** `bun test site/test` → both new files FAIL (no such file).
- [ ] **Step 4: Implement `site/js/routes.js`** as `window.SSRoutes = (function () { … })()`; `parse` uses `startsWith` on `#/p/`, `#/passports`, `#/build`, `#/impact`, `#/print`, decodes with a try/catch `safeDecode`, and returns the front object for everything else.
- [ ] **Step 5: Implement `site/js/front-data.js`.** The one rule both figure functions share: `newest(runs, ok)` keeps the runs passing `ok`, prefers those whose `link` is not `mock` or `sample` when any such run passes, and returns the greatest `measured_at` (compare `String(measured_at)`; non-strings sort last). `gainFigure` accepts a run when `proof && proof.kind === "sweep" && Number.isFinite(Number(proof.gain_pct))`; `stripFigures` when `search && search.pmax_w` has finite `A`, `B`, `C`, with `best` = `search.best` if it is one of the three, else the argmax.
- [ ] **Step 6: Run** `bun test site/test` → PASS.
- [ ] **Step 7: Rewire `app.js`:** `render(reason = "route")` reads `SSRoutes.parse(location.hash)`, dispatches on `page` (`front` → `pageFront()` returning `<section class="hero"><h1>Used panels still work.</h1><p class="row"><a class="btn btn--primary" href="#/passports">See the passports</a><a class="btn" href="#/build">Try the Array Builder</a></p></section>`), toggles `[data-route]` by `nav`, sets `document.body.dataset.page = page`, and calls `window.scrollTo(0, 0)` only when `reason === "route"`. `settle` and the polling path call `render("data")`. Replace every `href="#/"` in the page functions with `href="#/passports"` (the intro's "See every panel tested so far", "← All passports" twice, "Back to the list", "Import a run first" twice). Lift the `#btn-sample` click handler into `loadSample(status)` and export it on `window.secondStringSite`.
- [ ] **Step 8: `site/index.html`:** nav link `Passports` → `href="#/passports" data-route="passports"`; load `js/routes.js` and `js/front-data.js` before `js/app.js`. **`tools/serve.py:77`:** `"site": "/site/#/passports"`.
- [ ] **Step 9: Verify in the browser** (server: `python3 -m http.server 8041 --bind 127.0.0.1` from the worktree root, background): `http://127.0.0.1:8041/site/#/` shows the placeholder with both buttons; `#/passports` shows the index; `#/p/SS-0001` after loading the sample: its back link's `href` ends in `#/passports`; `#/zzz` shows the placeholder. `grep -c 'href="#/"' site/js/app.js` → 0.
- [ ] **Step 10: Commit** `site: route the front page at #/ and the passport index at #/passports` and `tools: send the dashboard to #/passports after an upload`.

### Task 3: The visual system on the existing pages

**Files:**
- Rewrite: `site/css/site.css`; `site/css/motion.css` (tokens and feedback only; the moves come in Task 5)
- Modify: `site/js/app.js` (`pagePassport`, `pageBuild`/`groupsHtml`/`runBuild`, `pageImpact`), `site/index.html` (footer)

**Interfaces:**
- Produces the classes Task 4 and 5 build on: `.display` (H1 scale), `.title` (section H2), `.lede`, `.label`, `.band`/`.band__num`/`.band__text` (full-bleed navy field, numeral in `--sun`), `.num-big`, `.btn`/`.btn--primary`/`.link-grow`, `.chipcell` (a cell glyph with its ID under it), `.wire` (a short line between cells), `.card` (white surface, no border).

- [ ] **Step 1: Tokens and type in `site.css`.** Keep the colour tokens. Add `--display: clamp(2.4rem, 6.5vw, 6rem); --title: clamp(1.6rem, 2.6vw, 2rem); --body: 17px; --label: 0.8rem; --gutter: 24px; --section: clamp(64px, 10vw, 160px); --measure: 66ch`; `--gutter: 16px` under 480 px. `.display`: weight 700, `font-stretch: 112.5%`, `letter-spacing: -0.03em`, `line-height: 0.95`, colour `--cell`. `.title`: `--title`, 700, stretch 108%, tracking −0.015em. `.label`: `--label`, stretch 88%, `--ink-3`. Body `--body` / 1.5; `.lede` at `--measure`.
- [ ] **Step 2: Surfaces and controls.** `.card { background: var(--surface); border: 0; padding: 22px 24px }`; tables keep hairlines in `--busbar-2`; `.btn` ink text with a 1 px `--busbar` border, 44 px tall; `.btn--primary` flat navy, white text, hover `--cell-deep`; `.link-grow` an inline link whose `::after` underline scales from the left on hover (150 ms); nav white with a hairline under it, wordmark 700 at 118%. `.band { background: var(--cell); color: #fff; margin-inline: calc(50% - 50vw); padding: 56px var(--gutter) }` with an inner `max-width: 1080px`; `.band__num` at `--display` in `--sun`; `.band__text` white at 0.8 opacity.
- [ ] **Step 3: Pages.** Passport: `.passport` grid `minmax(260px, 340px) 1fr`, the cell drawing at the top of the first column with the QR under it; the ID (2.2rem display style) and grade at the head of the second column; `.facts` two columns; the 760 px and print rules carried over verbatim from today's lines 127–136, 146–157, 179–195. Index: `.lede`, the white table card, legend, `details.tools` as today. Builder: pool items show a 36 px `cellSvg`, the ID and the numbers; `groupsHtml` draws each string as a row of `.chipcell` joined by `.wire`; the result head becomes a `.band` whose numeral is the matched grouping's watts, the two percentages as `.stat` rows below it. Impact: a `.band` with the mean gain (`data-count`) and the sentence (real runs counted, else the model, labelled), then the sourced facts as a `.card` list, then "What we don't claim yet". Footer: hidden on the front page by `body[data-page="front"] .foot { display: none }`.
- [ ] **Step 4: Verify in the browser at 1440, 768 and 390** with the sample loaded: `#/passports`, `#/p/SS-0001`, `#/build` (press Group them), `#/impact`, `#/print`: `document.documentElement.scrollWidth <= innerWidth`; every `h1, h2` height ≤ 2.2 line-heights; `bun test site/test/house.test.js` passes (print rules present); console clean except the `/api/runs` 404.
- [ ] **Step 5: Commit** `site: restyle every page under the light navy system`

### Task 4: The front page

**Files:**
- Create: `site/js/front.js`, `site/css/front.css`, `site/test/front.test.js`
- Modify: `site/js/app.js` (replace the placeholder; `ctx()`; `wireFront`; refresh on data), `site/index.html` (link `css/front.css`; load `js/front.js` before `js/app.js`)

**Interfaces:**
- Consumes `SSFrontData` (Task 2), the classes of Task 3.
- Produces `window.SSFront.page(ctx) → html`, `SSFront.refresh(root, ctx)` (replaces the innerHTML of `#front-strip`, `#front-gain`, `#front-passports`), `SSFront.wire(root, hooks)` (`hooks.loadSample(statusEl)` for `#btn-sample-front`). `ctx = { runs, passports, loading, esc, num, cellSvg, fmtDay }`, built by `app.js`.
- Produces the markup Task 5 and 6 drive: `section.hero[data-hero]` > `.hero__pin` > [`.hero__slot[data-hero-slot]` (aspect 4/3) > `svg.hero__svg` with `polygon.hero__sweep`; `.hero__text` > `h1.display[data-dust]` with two `span.line`, `p.lede`, `.hero__actions` > `a.btn.btn--primary[href="#/passports"]` "See the passports", `a.btn[href="#/build"]` "Try the Array Builder"; `svg.rp[viewBox="0 0 600 200"]` > `g.rp-cell[data-cell="1|2|3|4"]` (2 and 4 `.is-weak`), `path.rp-wire[data-row="1|2"]`, `text.rp-num[data-rp-num]`; `p.hero__scroll` "scroll"]. Then `section.problem` (three `.num-big[data-count]`), `section.how` (`ol.steps`), `section.strip[data-strip]` > `.strip__track` > three `article.wiring[data-wiring]` (`.wiring__letter`, a wiring svg of four cells in two rows, `.wiring__w`, `.wiring__label`, `.is-best` on the best) and `p#front-strip-note`, `section.band#front-gain` (`.band__num[data-count]`, `.band__text`), `section.passports#front-passports` (`h2.title[data-dust]`, `.ppass-row` of up to four `a.ppass[href="#/p/<id>"]`, actions, or the empty state with `button#btn-sample-front` and `span.status#front-status`), `section.teaser`, `section.close` (`.close__name`). Every section carries `data-in`.

- [ ] **Step 1: Write `site/test/front.test.js`.** Load `front.js` into a window shim; `ctx` uses the `esc` and `num` one-liners from `app.js`, `cellSvg: () => "<svg></svg>"`, `fmtDay: (s) => String(s)`; `ctxSample` has the sample run and its four passports with `measured_at` staggered by an hour; `ctxFive` adds a fifth passport dated newest; `ctxHostile` has a passport whose `passport_id` is `<img src=x onerror=alert(1)>`.

```js
const html = page(ctxEmpty), hero = html.slice(0, html.indexOf("</section>"));
expect(hero).toContain('href="#/passports"'); expect(hero).toContain('href="#/build"'); expect(hero).toContain("Used panels still work.");
expect(html).toContain("No panels published yet"); expect(html).toContain('id="btn-sample-front"'); expect(html).toContain("+37%"); expect(html).toContain("model");
expect(page(ctxSample)).toContain("2.04 W"); expect(page(ctxSample)).toMatch(/data-wiring="B"[^>]*is-best|is-best[^>]*data-wiring="B"/);
expect(page(ctxSample).match(/class="ppass"/g).length).toBe(4); expect(page(ctxSample)).not.toContain("btn-sample-front"); expect(page(ctxSample)).toContain("simulated");
expect(page(ctxFive).match(/class="ppass"/g).length).toBe(4); expect(page(ctxFive)).toContain("SS-0005"); expect(page(ctxFive)).not.toContain('#/p/SS-0001"');
expect(page(ctxHostile)).toContain("&lt;img"); expect(page(ctxHostile)).not.toContain("<img");
expect(page({ ...ctxEmpty, loading: true })).toContain("Loading passports");
```

- [ ] **Step 2: Run** `bun test site/test/front.test.js` → FAIL (no file).
- [ ] **Step 3: Implement `site/js/front.js`** with the copy below, verbatim. Gain numeral: `"+" + Math.round(pct) + "%"`. Strip watts: `num(w, 2) + " W"`. Problem numerals: `80–88%`, `about 1%`, `€16–31`. Source lines: measured run → "Measured in run <id> on <day>, <sourceWord>." ; model → "Figures from our panel model for the demo batch; the first published bench run replaces them."

  - H1 "Used panels still work." Sub: "Nobody can tell which ones, so most are landfilled. Second String grades them against each other and wires them so no good panel is wasted on a weak partner."
  - Problem lines: "of rated output after 25 years" · "of retired US panels reused" · "for a lab test, against about €50 for a new panel". Sentences: "In a series string every panel carries the same current, so the weakest panel limits the string. Factories sort new panels into current classes; used ones arrive mixed and untested."
  - How: H2 "Four panels, three ways to pair them." Steps: Measure, "Every panel's current at the same instant, and its voltage." / Predict, "The scores say which pairs match." / Switch and sweep, "Relays try all three wirings; a capacitor sweeps each one's power curve." / Keep and prove, "The best wiring stays on; alternating best and worst twenty times proves the gain."
  - Strip: H2 "Three ways to wire four panels." Cards A (1+2, 3+4), B (1+3, 2+4), C (1+4, 2+3), each with its watts and "maximum power".
  - Gain band text: "more power than the worst wiring of the same panels, measured at each wiring's maximum power point. With normal aging the gain is about 5 to 7%." plus the source sentence.
  - Passports: H2 "Every panel gets a passport." Actions "See all passports" (`#/passports`), "Print cards" (`#/print`). Empty: "No panels published yet." button "Show example panels", note "A simulated batch, not a real measurement."
  - Teaser: "Have passports? The Array Builder groups them into strings so no strong panel is held back." button "Try the Array Builder".
  - Close: "Second String", "Grades used solar panels against each other, then wires them for the most power.", "Measured numbers come from the bench; simulated and hand-entered runs are labelled.", "Sources: NREL; IEA PVPS Task 13."

- [ ] **Step 4: `site/css/front.css`.** Hero: `.hero { min-height: 200vh }` and `.hero__pin { position: sticky; top: 0; min-height: 100vh; display: grid; grid-template-columns: 5fr 6fr; gap: 48px; align-content: center }` at ≥ 900 px; below 760 px the hero is not sticky (`min-height: auto`, single column, the slot `width: min(100%, 48vh * 4 / 3)`). `.hero__slot { aspect-ratio: 4 / 3; position: relative }`, the svg and a later canvas both `position: absolute; inset: 0`. Diagram spans both columns, max height 200 px. `.hero__scroll` small `--ink-3`. Problem: three columns of `.num-big` (display size, navy) over their lines; sentences at `--measure`. Steps: two columns ≥ 760 px, numbers in `--ink-3`. Strip: `.strip__track { display: flex; gap: 24px }`, cards `flex: 0 0 min(72vw, 640px)`, white; under 760 px or coarse pointer `.strip__track { overflow-x: auto; scroll-snap-type: x mandatory }` and cards `scroll-snap-align: start`; the sticky driver is added by Task 5. Passports row: four columns ≥ 900 px, two at 480–900, one below. Close: `.close__name` at `--display`. Sections `padding-block: var(--section)`.
- [ ] **Step 5: Wire `app.js`.** `pageFront()` → `window.SSFront.page(ctx())`; after a `front` render `SSFront.wire(view, { loadSample })`; `render("data")` on the front page calls `SSFront.refresh(view, ctx())` instead of replacing the view.
- [ ] **Step 6: Run** `bun test site/test` → PASS. **Browser at 1440×900 and 390×844:** both buttons' `getBoundingClientRect().bottom <= innerHeight` on load; H1 height ≤ 2.2 line-heights at 390; no horizontal scroll; loading the sample from the front page's button while scrolled down leaves `scrollY` unchanged and fills the strip, the band and the passports row.
- [ ] **Step 7: Commit** `site: add the front page`

### Task 5: The motion layer

**Files:**
- Create: `site/js/motion.js`, `site/test/motion.test.js`
- Modify: `site/css/motion.css` (the moves), `site/js/app.js` (`SSMotion.init()` at boot, `transition` around route renders, `mount`/`destroy` per render), `site/index.html` (load `js/motion.js` before `js/app.js`)

**Interfaces:**
- Produces `window.SSMotion = { init(), reduced(), mount(view, page) → { destroy() }, transition(swap, dir) → Promise, parseCount(text), formatCount(parts, t), easeOut(t), decide3D(env), supports(win), progressOf(rect, viewportH) }`. `reduced()` is `matchMedia("(prefers-reduced-motion: reduce)").matches || /[?&]motion=off\b/.test(location.search)`.
- Consumes the Task 4 markup; Task 6 adds `hero3d` into `mount`.

- [ ] **Step 1: Write `site/test/motion.test.js`** (window shim with `matchMedia: () => ({ matches: false })`, `location: { search: "" }`):

```js
expect(formatCount(parseCount("80–88%"), 0.5)).toBe("40–44%"); expect(formatCount(parseCount("80–88%"), 1)).toBe("80–88%");
expect(formatCount(parseCount("+37.1%"), 0)).toBe("+0.0%"); expect(formatCount(parseCount("€16–31"), 1)).toBe("€16–31"); expect(formatCount(parseCount("about 1%"), 0)).toBe("about 0%");
expect(easeOut(0)).toBe(0); expect(easeOut(1)).toBe(1); expect(easeOut(0.5)).toBeCloseTo(0.875);
const ok = { webgl: true, reduced: false, saveData: false, deviceMemory: 4, forceSvg: false };
expect(decide3D(ok)).toBe(true); for (const k of [["webgl", false], ["reduced", true], ["saveData", true], ["deviceMemory", 1], ["forceSvg", true]]) expect(decide3D({ ...ok, [k[0]]: k[1] })).toBe(false);
expect(decide3D({ ...ok, deviceMemory: undefined })).toBe(true);
expect(progressOf({ top: 0, height: 1800 }, 900)).toBe(0); expect(progressOf({ top: -450, height: 1800 }, 900)).toBe(0.5); expect(progressOf({ top: -900, height: 1800 }, 900)).toBe(1); expect(progressOf({ top: 100, height: 1800 }, 900)).toBe(0);
expect(supports({})).toEqual({ io: false, idle: false, viewTransitions: false, fonts: false });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement `site/js/motion.js`** as `window.SSMotion = (function () { … })()` with no DOM access at load. Behaviour:
  - `init()`: adds `html.has-motion`, or `html.reduced` when `reduced()`; a shared rAF scheduler that stops while `document.hidden` and resumes on `visibilitychange`.
  - `mount(view, page)`: entrances: every `[data-in]` gets `.is-in` when 20% visible, once (no `IntersectionObserver` → at once); count-ups: `[data-count]` animate 600 ms with `easeOut` on first view (reduced → final text at once). Page `front` adds the re-pairing driver: `k = progressOf(hero.getBoundingClientRect(), innerHeight)` on scroll, or below 760 px `k = clamp(1 − diagram.top / innerHeight)`; sets `--k` = smoothstep(clamp((k − 0.1) / 0.6)) and `--w` = clamp((k − 0.55) / 0.35) on the hero, the numeral text from `--w` × the gain figure, hides `.hero__scroll` once k > 0.1. The strip driver when `matchMedia("(min-width: 760px) and (pointer: fine)")`: section height `innerHeight + overflow` (`track.scrollWidth − track.clientWidth`), inner sticky, `track.style.transform = translateX(−progress · overflow)`; otherwise nothing (the CSS snap row). Dust on the `h1[data-dust]` once per page load and on the passports `h2[data-dust]` when it enters. Returns `destroy()` that removes listeners, observers and canvases.
  - Dust: a canvas over the headline's box (pixel ratio capped at 2); points sampled from an offscreen canvas drawing each `.line` at its `getBoundingClientRect()` with `ctx.font = "700 semi-expanded <px>px Archivo"` and `ctx.letterSpacing = "-0.03em"` when supported, after `document.fonts.ready` (skipped if fonts are not ready within 600 ms, or when reduced); at most 1,500 points; each particle starts scattered in a box 1.6× the text box with a 0–300 ms delay and a 700 ms eased travel, drawn as 1.5–2.5 px navy squares; then the canvas fades out over 300 ms while the headline (`.is-dusting` → opacity 0) fades in; a resize cancels it and shows the text. Everything finishes within 1.2 s.
  - `transition(swap, dir)`: `html[data-dir=dir]`; with `document.startViewTransition` → `startViewTransition(swap).finished`; else add `.is-leaving` to `#view`, after 160 ms run `swap` and add `.is-entering`, remove it after 260 ms; reduced → `swap()` at once.
- [ ] **Step 4: `motion.css`.** `html.has-motion [data-in]:not(.is-in) > * { opacity: 0; transform: translateY(18px) }`, `.is-in > * { transition: opacity 320ms var(--m-ease), transform 320ms var(--m-ease); transition-delay: calc(var(--i, 0) * 70ms) }` (children get `--i` from their index in `mount`); `.rp-cell[data-cell="2"] { transform: translate(calc(var(--k, 0) * -140px), calc(var(--k, 0) * 90px)) }`, cell 3 the mirror (`140px, -90px`), cells 1 and 4 still; `.rp-wire { stroke-dasharray: var(--len); stroke-dashoffset: calc(var(--len) * (1 - var(--w, 0))) }`; `.rp-cell.is-strong { opacity: calc(0.75 + 0.25 * var(--w, 0)) }`; view transitions: `::view-transition-old(root)` fades and slides 24 px out, `::view-transition-new(root)` in, direction by `html[data-dir="back"]`; `.is-leaving`/`.is-entering` keyframes as the fallback; feedback: 1 px press on `.btn:active`, row background on hover; `@media (prefers-reduced-motion: reduce)` and `html.reduced`: `animation: none; transition: none`, `--k: 1; --w: 1`, `.hero__scroll { display: none }`.
- [ ] **Step 5: `app.js`:** `SSMotion.init()` before the first render; route renders go through `SSMotion.transition(swap, SSRoutes.direction(prev, next))`; keep a `motionCtl`, `destroy()` it before each render and `mount` after.
- [ ] **Step 6: Run** `bun test site/test` → PASS. **Browser:** on `#/` at 1440 scroll one screen: `getComputedStyle(hero).getPropertyValue("--k")` reaches 1 and the numeral reads "+37%"; the strip's track `transform` changes while scrolling through it; at 390 the track scrolls sideways by touch (`scrollWidth > clientWidth`, no sticky); after scrolling to the bottom `document.querySelectorAll("[data-in]:not(.is-in)").length === 0`; `?motion=off`: `html.reduced`, no canvases, numerals final, `--k` resolves to 1; route change `#/` → `#/build` animates and lands scrolled to the top; console clean.
- [ ] **Step 7: Commit** `site: add the motion layer: re-pairing, dust, strip, entrances, route slides`

### Task 6: The three.js hero

**Files:**
- Create: `site/js/hero3d.js` (ES module)
- Modify: `site/js/motion.js` (`hero3d(slot, getK)` inside the front mount)

**Interfaces:**
- Produces `export function mount(slot, opts = { touch: false }) → { setProgress(k), setPointer(nx, ny), setVisible(v), dispose() }`.
- Consumes `site/vendor/three.module.min.js` (Task 1), `decide3D` and the re-pairing driver's `k` (Task 5).

- [ ] **Step 1: Implement the scene.** Octagon `Shape` 1.2 × 0.84 with 0.11 corners; `ExtrudeGeometry({ depth: 0.06, bevelEnabled: false })`; materials `[MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.08 }), MeshStandardMaterial({ color: 0x0e1838, roughness: 0.7 })]`; `map` a 512 × 360 `CanvasTexture` (fill `#15224a`, fingers every 12 px `rgba(255,255,255,0.09)`, busbars at 25/50/75% 6 px `rgba(255,255,255,0.42)`, `colorSpace = SRGBColorSpace`); three raised busbar boxes `0.02 × 0.84 × 0.015` in `0xb9c2d1`. Camera fov 28 at `(0, 1.1, 2.1)` looking at the origin; slab rotation x −0.42. Lights: `AmbientLight(0xffffff, 0.75)`; `DirectionalLight(0xfff3d6, 2.2)` at θ = −60° + 120°·k, `position.set(3 sin θ, 2.4, 1.2)`. Pointer tilt ±4° eased 0.12 per frame on fine pointers. Renderer `{ alpha: true, antialias: true, powerPreference: "low-power" }`, pixel ratio ≤ 1.5, sized from the slot by `ResizeObserver`; render on demand (a dirty flag set by progress, pointer and resize), rAF only while visible and dirty, touch at most every 33 ms; `setVisible(false)` stops; `dispose()` disposes geometry, materials, texture and renderer (`forceContextLoss()`) and removes the canvas.
- [ ] **Step 2: The loader in `motion.js`.** `env = { webgl: !!(canvas.getContext("webgl2") || canvas.getContext("webgl")), reduced: reduced(), saveData: navigator.connection && navigator.connection.saveData, deviceMemory: navigator.deviceMemory, forceSvg: /[?&]hero=svg\b/.test(location.search) }`; when `decide3D(env)`: after first paint (`requestIdleCallback(cb, { timeout: 600 })` or `setTimeout(cb, 300)`) → `import("./js/hero3d.js")` → `mount(slot, { touch: matchMedia("(pointer: coarse)").matches })`; success adds `.has-3d` to the slot (CSS fades the SVG out and the canvas in over 400 ms); `setProgress` follows the re-pairing `k`; an `IntersectionObserver` on the slot and `visibilitychange` drive `setVisible`; failure leaves the SVG and warns once; `destroy()` calls `dispose()`.
- [ ] **Step 3: Verify in the browser.** `#/` at 1440: `slot.querySelector("canvas")` exists within 1.5 s; screenshots at k = 0 and k = 1 differ (light swept); `performance.getEntriesByType("resource")` lists `three.module.min.js` once and after `domContentLoadedEventEnd`; `#/?hero=svg` → no canvas, the `.hero__sweep` polygon moves with scroll; navigate to `#/passports` → `document.querySelectorAll("canvas").length === 0`; `#/passports` and the other routes never request three.js; console clean.
- [ ] **Step 4: Commit** `site: light the hero cell with three.js, SVG when WebGL is off`

### Task 7: Docs and guides

**Files:**
- Modify: `site/CLAUDE.md` (routes table: `#/` front page, `#/passports` index; "anything else falls back to the front page"; files list adds `routes.js`, `front-data.js`, `front.js`, `motion.js`, `hero3d.js`, `css/front.css`, `vendor/three.module.min.js` 0.170.0; run-and-check adds `bun test site/test` and the `?motion=off` / `?hero=svg` hooks; house style adds "three.js on the front page only, loaded after first paint"), `README.md:39` and `docs/website-plan.md:31` ("…/site/ opens the front page; `#/passports` lists every tested panel; `#/build`, `#/impact`"), `docs/architecture.md` (the site's line gains the front page).

- [ ] **Step 1: Make the edits. Step 2: `grep -rn "falls back to the index\|is the passport index" --include='*.md' .` → no matches. Step 3: Commit** `docs: describe the redesigned site and how to check it`

### Task 8: Verification sweep

No code unless something fails (then fix in the owning task's files with a `site:` commit).

- [ ] `bun test site/test` → all pass.
- [ ] Servers: `python3 -m http.server 8041 --bind 127.0.0.1` (static, the Pages path) and `python3 tools/serve.py --port 8045` (the API path), both from the worktree root in the background.
- [ ] Every route (`#/`, `#/passports`, `#/p/SS-0001`, `#/build`, `#/impact`, `#/print`, `#/zzz`) at 1440, 768 and 390: screenshot; `scrollWidth <= innerWidth`; headings ≤ 2 lines; console errors only the `/api/runs` 404 on the static server.
- [ ] Front page: buttons inside the first screen on load (motion on and `?motion=off`); `getComputedStyle(h1).opacity === "1"` 1.3 s after load; three.js lazy and once; `?hero=svg`; the data re-render test from Task 4 Step 6.
- [ ] Passport: the QR on `#/p/SS-0001` decodes to that page's URL (the Vision swift decoder noted in memory); `#/print` has one `.sheet` per four passports and the print CSS is byte-identical to today's blocks.
- [ ] Hardening: import a run without `passport_id`s, a run with a hostile ID, and 500 generated runs → every route renders, the front page shows the four newest passports.
- [ ] `curl -X POST http://127.0.0.1:8045/api/runs -d @site/data/sample-run.json -H 'Content-Type: application/json'` → response `site` is `/site/#/passports`; delete the stored test run from `site/data/runs/` and regenerate `index.json` afterwards so nothing test-made is committed.
- [ ] Report: what passed, what was not verified, and that nothing is pushed.
