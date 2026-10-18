# Passport site

The public face of the project: a page and a QR code for every tested panel, the Array Builder, the impact page and a printable sheet of passport cards. Judges open these pages on their phones by scanning a card, so the passport page is the most-seen screen of the project. How it fits with the rest: `docs/architecture.md`. Product brief and hosting decisions: `docs/website-plan.md`.

Plain HTML, CSS and one script, hash-routed, no build step, no framework, nothing loaded from the internet.

## Files
- `index.html` — the shell: nav, `#view`, footer, scripts.
- `js/app.js` — data loading, validation, every page, the router. `js/builder.js` — the Array Builder's grouping (voltage-balanced, with a brute-force check for up to 8 panels). `js/sizing.js` — how many panels go in series for a use (run a device, charge a battery, feed an inverter or converter, or most watts), from installers' hot-day and cold-morning string formulas; pure, sources in its header. `js/model.js` — the single-diode panel model (same as `dashboard/js/mock.js`). `vendor/qrcode.js` — QR generator (qrcode-generator, MIT).
- `css/site.css` — tokens, layout, phone (760 px, 480 px) and print rules. `css/motion.css` — entrance animations, loaded after site.css; transform and opacity only, all switched off by `prefers-reduced-motion`.
- `data/sample-run.json` — a sample run made by `tools/sim/make_site_sample.py` ("Load the sample run"). `data/runs/` — published runs, listed in `data/runs/index.json`.

## Routes
| Hash | Page |
|---|---|
| `#/` | passport index, import, runs table, "Print cards" link |
| `#/p/SS-0001` | one passport: intro for strangers, QR code of its own URL, measurements, the panel against its run, pairing line |
| `#/build` | Array Builder: group a pool of passports into strings |
| `#/impact` | measured gain across proof runs, plus sourced background figures |
| `#/print` | four passport cards per printed page |

Anything else falls back to the index.

## Where runs come from
1. On load, the site asks `../api/runs` (only `tools/serve.py` answers it) and polls every 5 s while it does.
2. If that fails, as on GitHub Pages, it loads `data/runs/index.json` and every plain `.json` file name listed there.
3. Runs can also be imported by hand: file, paste, or the sample run.

Every run passes `normalizeRun()` before it is kept: it needs a `run_id` string and at least one passport with a `passport_id`; bad passports and non-string flags are dropped. Runs persist in the browser under `localStorage["ss.site.runs"]`. If a page still throws, the router shows the error and a "Remove imported runs and reload" button instead of a blank page. A passport ID that appears in several runs shows the newest.

## Run and check
- `python3 tools/serve.py` from the repo root, then http://localhost:8000/site/ (API path), or `python3 -m http.server 8000` from the repo root and http://localhost:8000/site/ (the GitHub Pages path).
- Before saying done: load the sample run; open every route; console clean apart from the expected 404 for `/api/runs` on a static server; phone width (375 px) with no sideways page scroll; the print sheet.
- QR codes encode the page's own address. Print cards from the public site, never from localhost.

## Rules
- Everything shown goes through `esc()`. Missing numbers render as a dash through `num()`.
- Say "measured" only for measured numbers. Hand-entered, recorded and simulated runs are labelled as such by their `link` and bench text; keep those labels visible.
- House style: Archivo only, ink colours, tabular figures, no eyebrow labels above headings, no all-caps labels, no icons, no gradients, no drop shadows.
- Don't change the URL scheme: printed QR cards depend on `#/p/<ID>` under `/site/`.
