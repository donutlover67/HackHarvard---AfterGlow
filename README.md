# Second String

Grades used solar panels, then rewires them for the most power. HackHarvard 2026.

Four small panels sit in lamp boxes. An Arduino Uno measures every panel's short-circuit current at the same instant and its open-circuit voltage, scores them against each other, predicts which panels belong in series together, then verifies the prediction by sweeping the I-V curve of all three possible pairings with relays and a capacitor. It keeps the best pairing, runs a 12 V pump from it, and proves the gain by alternating the best and worst wirings and measuring each at its maximum power point. A laptop dashboard over USB serial shows the grades, the curves and the gain with a confidence interval.

## Why

Panels lose about 0.5–0.75% of their output a year, so after 25 years most still make 80–88% of their rating, and panels retired early for upgrades often make 70–95%. Yet most retired US panels are landfilled and about 1% are reused. One reason is testing: a lab flash test plus imaging costs €16–31 per panel against roughly €50 for a new one, and there is no agreed cheap retest yet. The other problem is mismatch: in a series string every panel carries the same current, so the weakest panel limits the string. Manufacturers sort new panels into current classes to avoid this; used panels arrive in mixed batches with no data. We measure that data in place, cheaply, and verify the wiring automatically.

With two of four panels at 50% output, the best pairing makes about 38–41% more maximum power than the worst and about 22–24% more than the average of the three; with realistic aging (80% panels) the gain is about 5–7%. We report the measured number, not the idealized 50%.

## Impact

Every working panel that is landfilled is solar power nobody gets to use. A cheap grade and a measured record per panel turn a mixed pile of retired panels into something people can buy, wire and trust.

- **Businesses.** A warehouse roof, a barn, a parking lot or a remote site can add solar with tested used panels for less than new ones. Each panel's passport says what it still makes, and the Array Builder wires a mixed batch to the voltage the site needs.
- **Households.** A few used panels on a balcony, a shed or a backyard can run a pump, light a garden or charge a battery, without starting from a new roof.
- **Governments.** Cities, schools and public agencies own roofs, bus shelters and street furniture that could make power, and they answer for the panels their region throws away. Graded used panels let a public budget buy more solar per dollar. The passports give procurement a measured record to check each panel against, and the weakest panels can still power sensors, chargers and emergency kits through Second Use (`#/reuse`). Where take-back rules already cover panels (the EU counts them as electronic waste under its WEEE directive), a cheap test lets reuse come before recycling, and the bench's runs give a count of panels kept out of landfill to report.

The site's impact page (`#/impact`) tells the same story with the sourced figures from [Why](#why) and the simulated gain on the demo batch, labelled as simulated.

## Repository

| Folder | What | Owner |
|---|---|---|
| `dashboard/` | The laptop dashboard: plain HTML, CSS and ES modules, hand-drawn SVG charts, Web Serial, a built-in mock bench. No build step, works offline. | C |
| `firmware/` | Firmware for an ESP32 DevKit or an Arduino Uno R3 (PlatformIO, Arduino framework): grading, pairing relays, I-V sweeps, proof cycles, serial JSON. Both builds speak the same protocol. Pure logic in `lib/solarlogic` with host tests. | B |
| `site/` | The passport site: a page and QR code per panel, the Array Builder, the impact page, printable cards. Public on GitHub Pages. | C |
| `protocol/` | The serial contract (`PROTOCOL.md`) and sample messages (`samples/*.jsonl`) that both sides are built against. | B |
| `docs/` | Start with `architecture.md` (how it all fits). `spec-v2.md` (the full project description), `hardware.md` (wiring as built), `runbook.md` (demo day), `NOTES.md` (cross-area requests); `docs/README.md` lists the rest. | A, C, D |
| `tools/` | `serve.py` (the demo laptop's server), `capture.py` (bounded serial capture), `sim/` (the single-diode model behind the numbers above), `eval/` (the Panel Advisor eval). See `tools/README.md`. | B, C |
| `solar_pairing/` | An earlier Python stand-in from before the spec rewrite. Superseded by `dashboard/`. | — |

## Run the demo laptop

```bash
python3 tools/serve.py
```

Then open http://localhost:8000/dashboard/ and http://localhost:8000/site/ in Chrome. The dashboard starts on the mock bench (simulated panels, same physics model as the firmware's design) and runs a search; press **Prove** for the confidence interval. **Connect Uno** uses Web Serial (it works for an ESP32 build too) (Chrome or Edge, 115200 baud). The mock bench row at the bottom lets you change the light level and which panels carry film. Data → **Upload run** sends the run's passports to the local server, and the site shows them within a few seconds; **Export passports** writes the same JSON to a file for a site hosted elsewhere.

The site also runs as a plain static folder with no server behind it; the public copy on GitHub Pages is described next.

## Public site

A passport's QR code encodes the page's own URL, so the passport a judge scans has to be public. Pages is on, in **"Deploy from a branch"** mode from `feat/dashboard-and-skeleton` (set by a repo admin on Saturday morning): GitHub publishes the whole repository from that branch about a minute after every push to it.

- https://mscl741.github.io/HackHarvard/site/ opens the front page; `#/passports` lists every tested panel, `#/build` is the Array Builder and `#/impact` the impact page.
- https://mscl741.github.io/HackHarvard/site/#/p/SS-0001 is one passport, what a QR code opens.
- https://mscl741.github.io/HackHarvard/ is this README; `dashboard/` and `docs/` are served too.

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) is the other mode. With Source set to **GitHub Actions** (Settings → Pages → Build and deployment, repo admin only) it publishes `site/` as the root of the Pages site on every push to `main`, so the URLs lose the `/site/` part. While a branch is the source, GitHub rejects deployments from any other branch, so the workflow only reads the Pages configuration and skips the deploy with a notice. Switching modes changes every passport URL; don't switch after QR codes have been printed.

The public site has no upload API, so it shows the runs committed to `site/data/runs/`. After the dashboard uploads a run there (or after copying an exported run file in), rebuild the list the site reads:

```bash
python3 tools/sim/make_runs_index.py
```

Delete test runs you don't want public before running it, then `git add site/data/runs`, commit with the `site:` prefix and push to the branch Pages publishes (`feat/dashboard-and-skeleton` today; `main` if the source is ever switched to GitHub Actions). Why runs are committed, and how to undo that, is in `docs/website-plan.md` under Hosting.

## Build and test the firmware

```bash
cd firmware && pio test -e native      # host tests for the logic
cd firmware && pio run -e esp32dev     # compile for the ESP32
```

Flashing (`pio run -e esp32dev -t upload`) switches relays on real panels, so a person does it. Capture serial output with `python3 tools/capture.py --seconds 20 --out logs/serial.log`; never open a serial monitor from an agent session.

## Status

- Dashboard: runs the full demo on the mock bench with one button and uploads the run; also takes readings entered by hand, plays recorded sessions, and simulates measured panels, each labelled. Its serial parser passes a replay test with injected faults, but has not met a real board yet.
- Firmware: the ESP32 and Uno builds compile with no warnings and 8 host tests pass. Not yet run on hardware. The Uno pin map is a proposal; relay logic level, sensor addresses and divider ratio must be confirmed in `docs/hardware.md` first.
- Site: live on GitHub Pages with a front page that explains the bench and shows the gain happening, passports, QR codes, printable cards, the voltage-balanced Array Builder and phone layouts; it shows only the example batch until real runs are committed. The impact page waits on D's sourced figures.
- Hardware: lamps can't light the panels enough indoors (halogen overheats them), so the plan is an outdoor recording or multimeter readings; the team's ESP32 is a bare module, hence the Uno build. See `docs/runbook.md`.

## Team

Four people: A hardware and wiring, B firmware and protocol, C dashboard and data, D light, water, story and Devpost. Working rules for people and for Claude Code sessions are in `CLAUDE.md`.
