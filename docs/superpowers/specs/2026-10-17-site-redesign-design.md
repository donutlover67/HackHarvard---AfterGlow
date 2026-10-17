# Site redesign: "the string"

Design for rebuilding `site/` under one visual and motion system, agreed Sat Oct 17 evening. Approach A of three: the whole site is built around one device, four silicon cells that slide into the matched pairing. Judging is Sunday 9 AM; the current site stays live until the new one is approved and pushed.

## Purpose and success

- **For:** judges and Devpost visitors who open the link, and judges who scan a QR card on a panel.
- **Outcome:** the link opens a front page that explains the project in one screen and shows the gain happening; a scanned card still opens that panel's passport instantly.
- **Success:** a stranger understands the problem, the bench and the gain without reading the README; the two primary actions are reachable in the first screen without waiting for any animation; every existing address still works; the site stays light enough for a phone on venue Wi-Fi.
- **The user's two rules:** sleek and minimal, not "AI generated"; the hero must never make the actual functions annoying to reach.

## Constraints

- Static files on GitHub Pages in branch mode; no build step; nothing loaded from the internet at runtime. three.js is vendored as one file: `three@0.170.0`, `build/three.module.min.js` (691,648 bytes, MIT). It is the last release whose minified module build is a single file; from 0.172 that build imports a separate `three.core.min.js`. Its LICENSE sits alongside.
- Printed QR cards encode `…/site/#/p/<ID>`: those addresses, `#/build`, `#/impact` and `#/print` do not change.
- Data path, validation (`normalizeRun`), the local-API-then-`index.json` fallback and the render safety net stay as they are.
- No gradients, shadows, pictogram icons, eyebrow labels, uppercase labels or emoji. The things that move are drawings of the cell, not icons. One typeface (Archivo). Tabular figures.
- Transform, opacity and filter only for motion; `prefers-reduced-motion` shows end states; animations pause when the tab is hidden.
- Performance: front page first paint before any script-driven motion; the headline is real text (the largest contentful element); three.js loads after first paint and only on the front page; no layout shift from the hero (fixed-size slots).

## Information architecture

| Route | Page |
|---|---|
| `#/` | Front page (new) |
| `#/passports` | Passport index (today's `#/`) |
| `#/p/<ID>` | Passport (unchanged address) |
| `#/build` | Array Builder |
| `#/impact` | Impact |
| `#/print` | Printable cards |
| anything else | Front page |

Nav: wordmark, Passports, Array Builder, Impact. "Back" links on passports and the print sheet point to `#/passports`. The passport intro's "every panel tested so far" link points to `#/passports`. `tools/serve.py`'s upload response points its `site` field at `/site/#/passports`; the dashboard's "open the passports" link reads that field, so the dashboard itself does not change.

## Visual system

- **Palette roles** (existing tokens): page ground `--page`, surfaces white, display ink `--cell` (silicon navy), large flat navy fields for the hero cell slot and the gain band, `--sun` for exactly one numeral per page (front page: the gain band's numeral; the problem numerals stay navy), pairing colours only for A, B, C. No new colours.
- **Type:** Archivo variable. Display: `clamp(2.4rem, 6.5vw, 6rem)`, width 112%, tracking -0.03em, leading 0.95; section titles about 2rem; body 17px / 1.5, measure 60–70ch; labels 0.8rem at width 88%. Two sizes do the visible work on any screen; five sizes on a page is the ceiling. Headlines fit two lines at 390 px; the front page copy deck below is written to that.
- **Surfaces:** white blocks on the pale ground, separated by tone, not borders; tables keep hairlines; radius 3 px as today; buttons flat navy (primary) or ink text with an underline that grows (quiet).
- **Rhythm:** sections 120–160 px apart on desktop, 64 px on phones; gutters 24 px desktop, 16 px phones; text blocks share two left edges per page.
- **The motif:** the cell drawing at three sizes: hero slab (3D or SVG), card (passport, builder chips), inline chip (strings). The current gain block's gradient busbar texture is replaced by SVG lines.

## Motion system

| # | Move | Trigger | Timing | Fallback |
|---|---|---|---|---|
| 1 | **Re-pairing** (signature): four cells wired A slide into B, wires redraw by stroke-dashoffset, the strong pair brightens, the gain numeral counts from 0 to the figure the gain band shows | scroll progress through a sticky hero region, one extra screen tall; reversible | driven by scroll; no fixed duration | end state drawn, numeral at its value |
| 2 | **Dust text**: a 2D canvas of about 1,500 particles converges onto points sampled from the rendered headline (sampled after `document.fonts.ready`, so the vendored Archivo is what is sampled), then the HTML headline fades in and the canvas fades out | front page headline on load; the closing line "Every panel gets a passport" on entering view | ≤ 1.2 s; the real text is present underneath from the start | real text shown at once |
| 3 | **Horizontal strip**: A, B, C side by side; a sticky one-screen section whose vertical scroll translates the track sideways, then releases | scroll, when `(min-width: 760px) and (pointer: fine)` | driven by scroll | otherwise a horizontal scroll-snap row, no hijack |
| 4 | **Entrances**: heading, sentence, figure of a section rise 18 px and fade in, staggered 70 ms, once | IntersectionObserver at 20% visible | 260–400 ms, ease-out | content visible without script (class added at init) |
| 5 | **Route change**: outgoing view slides 24 px and fades out, incoming slides in along the nav axis | hash change | out 160 ms, in 260 ms; View Transitions API when present | CSS class fallback |
| 6 | **Feedback**: 1 px press on buttons, underline grows on links, table rows lift their background | pointer | 150 ms | none needed |
| 7 | **Count-ups**: the three problem numerals and the gain | first view | 600 ms | final value |

Budget: at most two scroll-driven effects on screen at once; nothing longer than 600 ms except dust (1.2 s) and scroll-driven moves; every effect checks `prefers-reduced-motion` and `document.hidden`.

## The three.js hero

- **Scene:** one slab with the cell's octagonal silhouette (extruded a few millimetres), navy material with slight roughness, three raised busbars, the finger pattern as a canvas-drawn texture; one directional "sun" light whose angle follows scroll through the hero (−60° to +60°), soft ambient; on desktop the slab tilts up to 4° toward the pointer. Transparent background; the slot has a fixed aspect so nothing shifts.
- **Loading:** `<script type="module">` imported only when the front page renders, after first paint (`requestIdleCallback` or a 300 ms timeout). Pixel ratio capped at 1.5; render on demand (scroll, pointer) with a 30 fps cap on touch devices; stops when the slot is off screen or the tab is hidden; disposes on route change.
- **Fallback:** no WebGL, reduced motion, `navigator.connection.saveData`, or `deviceMemory < 2`: the slot shows the SVG cell with a CSS light-sweep polygon. The page never waits for three.js; if the module fails to load, the SVG stays.

## Pages

### Front page `#/`
Copy deck (each heading ≤ 2 lines at 390 px):
1. **Hero.** Slab left, text right (stacked on phones). H1 "Used panels still work." Sub: "Nobody can tell which ones, so most are landfilled. Second String grades them against each other and wires them so no good panel is wasted on a weak partner." Buttons: **See the passports** (`#/passports`), **Try the Array Builder** (`#/build`). The re-pairing runs beneath the text as the hero scrolls; a small "scroll" word, nothing else.
2. **The problem.** Numerals: **80–88%** "of rated output after 25 years"; **about 1%** "of retired US panels reused"; **€16–31** "for a lab test, against about €50 for a new panel". Two sentences: in a series string every panel carries the same current, so the weakest limits the string; factories sort new panels into current classes, used ones arrive mixed and untested.
3. **How the bench works.** H2 "Four panels, three ways to pair them." Steps: measure every panel's current at the same instant and its voltage; predict which pairs match; switch relays through all three wirings and sweep each one's power; keep the best and prove it by alternating best and worst.
4. **Strip.** H2 "Three ways to wire four panels." Cards A, B, C: wiring drawn with cells, each wiring's maximum power from the newest run that has `search.pmax_w`, labelled by that run's `link` (measured, hand-entered, recording or simulated); with none, the model's figures for the demo batch, labelled.
5. **Gain band.** Navy field. The numeral is the gain of the newest run with a proof (`proof.gain_pct`; runs whose `link` is not `mock` or `sample` are preferred, the rule the impact page already uses). With no such run it shows the model's figure for the demo batch, 37%, labelled as a model figure. Line: "measured at each wiring's maximum power point; about 5 to 7% with normal aging."
6. **Passports.** Dust line "Every panel gets a passport." Row of up to four of the newest passport cards by `measured_at` (cell, ID, grade, two numbers) linking to their pages; **See all** and **Print cards**. Empty state: "No panels published yet" with "Show example panels" labelled simulated.
7. **Builder teaser.** One sentence and **Try the Array Builder**.
8. **Close.** Wordmark large, the one-line description, the measured-versus-simulated note, source credits (NREL, IEA PVPS Task 13).

### Passports `#/passports`
Today's index under the new system: intro sentence, table on a white surface with the legend, "Add a run (for the team)" folded, runs table. Rows stagger in.

### Passport `#/p/<ID>`
No 3D, no dust, no pinned region. Intro line for strangers; cell drawing large (left on desktop, top on phones) with the ID and grade beside it; datasheet grid of current, voltage, score, measured; QR with "Scan to open this passport on another phone"; batch comparison bars; flags; pairing line; the relative-score note. Prints on one page as today.

### Array Builder `#/build`
Same functions and data. Pool as selectable cell chips; result as a navy stat band (the one numeral) with strings drawn as rows of cells; verdicts and the bench check below; the single-string case stays hidden-comparisons.

### Impact `#/impact`
Article: the gain statement as a numeral band (real runs counted, otherwise the model, labelled), the sourced facts, what we don't claim.

### Print `#/print`
Paper output unchanged; on-screen chrome follows the system.

## Plumbing changes
- `site/js/app.js`: routes (`#/` front, `#/passports` index, fallback to front); links updated; `pageFront()`/`wireFront()`; passport and index markup under the new classes.
- `site/js/motion.js` (new): entrances, count-ups, re-pairing scroll driver, dust text, strip driver, route transition hook; reads `prefers-reduced-motion` and `document.hidden`.
- `site/js/hero3d.js` (new, module): the scene; imports `vendor/three.module.min.js`.
- `site/vendor/three.module.min.js`, `site/vendor/three-LICENSE.txt`.
- `site/css/site.css`, `site/css/motion.css`: the new system; print rules kept.
- `tools/serve.py`: the `site` field of the upload response (the dashboard's link reads it).
- Docs: `site/CLAUDE.md`, `docs/runbook.md`, `docs/architecture.md`, README where `#/` is named.

## Non-goals
No dark theme, no new data, no CMS, no analytics, no changes to the dashboard, no three.js outside the front page, no scroll hijacking on touch.

## Acceptance
- Every route at 1440, 768 and 390 px: no horizontal page scroll, headlines ≤ 2 lines, no console errors beyond the expected `/api/runs` 404 on static hosting.
- Passport and print pages: same content as today, one printed page per passport, QR encodes the unchanged address.
- Front page: buttons in the first screen before any animation finishes; headline readable within 1.2 s; three.js loads after first paint, stops off screen, falls back without WebGL and under reduced motion; strip is a snap row on a 390 px viewport.
- Reduced motion: end states everywhere, nothing hidden.
- The dashboard upload's "open the passports" opens the index; `make_runs_index.py` and the fallback unchanged.
- Hardened-site checks from Saturday still pass: malformed imports, hostile IDs, 500 runs.

## Rollout
Build on this branch with the current site untouched on `main`; preview on the local server at the three widths; the user looks at it; push to `feat/dashboard-and-skeleton` and `main` only on their word, then confirm the live site and re-scan a card.

## Amendments after the build (Sat Oct 17, late)
- The dust text (motion row 2) was replaced at the user's request: it read as decoration. The headline's lines now rise out of their own masks (760 ms, 110 ms apart), the lede and the buttons rise 260 and 380 ms later, the slab settles in over 900 ms, and the passports heading gets the same masked rise when reached. Everything is visible without script; the hidden state exists only under `html.has-motion`.
- The horizontal strip (row 3) gained an approach: over the first 405 px of its pinned scroll the wirings grow from 86% to full size and rise into place, then slide; each card arrives as it reaches the screen. On screens too short for the pinned section it tightens its padding first and only then falls back to the swipe row, which shows a thin scrollbar on a mouse.
- The four steps of the bench lost their numerals: they hang in order on one drawn wire, like panels on a string, each with a small drawing of what happens (four cells read at once, the matched pair on its plate, the sweep curve, the proven gain). The wire draws itself as the section enters and each step lights as the wire reaches it; the list stays an ordered list for screen readers.
- A string runs the length of the front page: one navy line in the left margin (through the steps' column on a phone), drawn by the scroll with a small cell travelling at its tip and a node at every section it reaches; it passes behind the cards and the band. The four steps light one by one as the tip crosses their section, and their rail draws across with it. Without script or under reduced motion the string is simply drawn in full.
