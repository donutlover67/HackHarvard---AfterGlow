# Passport site

The public face of the project: a front page that explains the bench and shows the gain, a page and a QR code for every tested panel, the Array Builder, the impact page and a printable sheet of passport cards. Judges open these pages on their phones by scanning a card, so the passport page is the most-seen screen of the project. How it fits with the rest: `docs/architecture.md`. Product brief and hosting decisions: `docs/website-plan.md`. The redesign's spec and plan: `docs/superpowers/specs/2026-10-17-site-redesign-design.md` and `docs/superpowers/plans/2026-10-17-site-redesign.md`.

Plain HTML, CSS and a handful of scripts, hash-routed, no build step, no framework, nothing loaded from the internet.

## Files
- `index.html` — the shell: nav, `#view`, footer, scripts.
- `js/app.js` — data loading, validation, the passport index, passport pages, the builder page, the impact page, the print sheet, the router. `js/routes.js` — the route table (which hash opens which page). `js/front.js` — the front page's markup. `js/front-data.js` — which run supplies each front-page figure: measured runs before simulated ones, the newest among those, the model's demo batch (labelled) when nothing qualifies. `js/motion.js` — every move: entrances, count-ups, the hero re-pairing, the headline's masked line reveal, the four steps lighting in turn as the reader scrolls through them, the sideways strip (zooming in before it slides), route slides, and the drawn cell's pointer driver (it leans toward the pointer, its shadow slides, the sunlit corner of its face reaches further as it turns toward the sun). `js/builder.js` — the Array Builder's grouping (voltage-balanced, with a brute-force check for up to 8 panels). `js/sizing.js` — how many panels go in series for a use (run a device, charge a battery, feed an inverter or converter, or most watts), from installers' hot-day and cold-morning string formulas; pure, sources in its header (from the ui-refresh branch). `js/model.js` — the single-diode panel model (same as `dashboard/js/mock.js`).
- `vendor/qrcode.js` (qrcode-generator, MIT), `vendor/fonts/` (Archivo, OFL).
- `css/site.css` — tokens, type, surfaces, every page, phone (760 px, 480 px) and print rules. `css/front.css` — the front page's sections and its chapter grounds (paper for the problem and the steps, navy for the wirings and the gain). `css/motion.css` — the motion layer, loaded last: transform, opacity and colour only, end states under `prefers-reduced-motion`.
- `data/sample-run.json` — a sample run made by `tools/sim/make_site_sample.py` ("Show example panels"). `data/runs/` — published runs, listed in `data/runs/index.json`.
- `test/*.test.js` — bun tests for the pure parts (routes, figure selection, front-page markup, motion helpers) and the house rules (nothing remote, no gradients or shadows, the print rules intact).

## Routes
| Hash | Page |
|---|---|
| `#/` | front page: the drawn cell under a drawn sun and the headline, four panels re-pairing as you scroll, the problem in three numerals, how the bench works, the three wirings side by side, the gain, the newest passports, the builder teaser |
| `#/passports` | passport index: real panels, then the demo batch kept apart and labelled simulated, import tools, runs table |
| `#/p/SS-0001` | one passport: intro for strangers, QR code of its own URL, measurements, the panel against its run, pairing line |
| `#/build` | Array Builder: say how the power is used and the device's voltage; sizing.js picks the string length and the builder groups the panels; Adjust for overrides |
| `#/impact` | the same four panels wired two ways (simulated, editable), the measured gain across proof runs, sourced background figures |
| `#/print` | four passport cards per printed page |

Anything else opens the front page. `tools/serve.py` sends the dashboard to `#/passports` after an upload.

## Where runs come from
1. On load, the site asks `../api/runs` (only `tools/serve.py` answers it) and polls every 5 s while it does.
2. If that fails, as on GitHub Pages, it loads `data/runs/index.json` and every plain `.json` file name listed there.
3. Runs can also be imported by hand: file, paste, or the example batch.

Every run passes `normalizeRun()` before it is kept: it needs a `run_id` string and at least one passport with a `passport_id`; bad passports and non-string flags are dropped. Runs persist in the browser under `localStorage["ss.site.runs"]`. Runs that arrive while a page is open redraw it in place (`render("data")`), without scrolling the reader; on the front page only the data-bearing sections are redrawn. If a page still throws, the router shows the error and a "Remove imported runs and reload" button instead of a blank page. A passport ID that appears in several runs shows the newest.

## Run and check
- `python3 tools/serve.py` from the repo root, then http://localhost:8000/site/ (API path), or `python3 -m http.server 8000` from the repo root and http://localhost:8000/site/ (the GitHub Pages path).
- `bun test site/test` runs the pure-logic and house-rule tests (bun is installed on the dev Mac; the site itself has no dependency).
- Before saying done: load the example batch; open every route at desktop and phone width (390 px) with no sideways page scroll; the front page's two buttons inside the first screen; the print sheet; console clean apart from the expected 404 for `/api/runs` on a static server.
- Switches for checking: `?motion=off` shows every end state (what reduced-motion readers get). A browser tab that is hidden or occluded throttles frames: judge timing only with the page in view.
- QR codes encode the page's own address. Print cards from the public site, never from localhost.

## Rules
- Everything shown goes through `esc()`. Missing numbers render as a dash through `num()`.
- Say "measured" only for measured numbers. Hand-entered, recorded and simulated runs are labelled as such by their `link` and bench text; keep those labels visible. The front page's figures name the run they come from; with no run they show the model's demo batch and say so.
- House style: Archivo only, ink colours, tabular figures, white surfaces on the pale ground told apart by tone, hairlines only inside tables, `--sun` on one numeral per page, no eyebrow labels above headings, no all-caps labels, no icons, no gradients, no drop shadows (the nav's sun, copied from the ui-refresh branch, is the one exception).
- Motion: transform, opacity and colour only; nothing over 600 ms except the hero intro (lines rise out of their masks, under a second) and scroll-driven moves; every move has a reduced-motion end state; no scroll hijack on touch.
- Don't change the URL scheme: printed QR cards depend on `#/p/<ID>` under `/site/`.
