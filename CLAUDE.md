# Second String — HackHarvard 2026 prototype

An ESP32 grades 4 small 6 V solar panels and switches them between the 3 possible 2S2P pairings with relays. A laptop dashboard, connected over USB serial, shows the grades and the measured gain. This is a 40-hour demo, not a product: optimize for one reliable demo run on Sunday 9 AM.

## Source of truth (highest first)
docs/spec-v2.md > protocol/PROTOCOL.md > docs/hardware.md (wiring as actually built) > code.
If the code and the spec disagree, stop and say so; don't work around it.
New to the repo or to your area? Read your section of docs/team-notes.md first: what is built, what to verify first, and the rules per area.
@protocol/PROTOCOL.md

## Layout and owners
- `firmware/` — ESP32, Arduino framework via PlatformIO. Owner: B. See firmware/CLAUDE.md.
- `dashboard/` — static HTML + JS, Web Serial, charts drawn in SVG by hand, no build step. Owner: C. See dashboard/CLAUDE.md.
- `protocol/` — the serial JSON contract and sample messages. Owner: B. Don't edit; propose changes in docs/NOTES.md.
- `docs/hardware.md` — pin map and relay wiring as built. Owner: A. If it disagrees with spec §11.2, it wins (the wiring is real).
- `docs/`, `README.md`, Devpost text — owner: D.
- `tools/` — capture.py (bounded serial capture), sim/ (the physics model behind the numbers in the spec), eval/ (the Panel Advisor eval harness: cases, reference advisor, scorer; see tools/eval/README.md). The Chalk agent itself is built by another teammate outside this repo's tools/eval; don't start it here.
- `site/` — Panel Passport pages with QR codes, Array Builder, impact page; deployed to GitHub Pages from main by .github/workflows/pages.yml. Brief and plumbing decision in docs/website-plan.md. Owner: C. The ESP32 never touches a network; the laptop dashboard uploads runs, and runs committed under site/data/runs/ (indexed by tools/sim/make_runs_index.py) show on the public site.
- `solar_pairing/` — the earlier Python stand-in, written before the spec rewrite. Superseded by dashboard/. Don't extend it.

## Commands
- Demo laptop: `python3 tools/serve.py` serves http://localhost:8000/dashboard/ and http://localhost:8000/site/ and stores runs the dashboard uploads (POST /api/runs → site/data/runs/). Mock mode runs with no ESP32 attached. `cd dashboard && python3 -m http.server 8000` still works for the dashboard alone.
- Firmware build (no hardware needed): `cd firmware && pio run -e esp32dev`
- Firmware host tests: `cd firmware && pio test -e native`
- Serial capture: `python3 tools/capture.py --seconds 20 --out logs/serial.log` (bounded; writes a file)
- Regenerate protocol samples: `python3 tools/sim/make_samples.py`

## Working rules
- Edit only the area you were asked to work in. If another area needs a change, stop and describe it.
- Never change protocol/ to make your side pass: the firmware and dashboard are built by different people against it. Write the mismatch to docs/NOTES.md and stop.
- Don't add dependencies or load anything from a CDN: the demo must run with no internet.
- Don't commit or push unless asked. Commit prefixes: `fw:` `dash:` `proto:` `site:` `docs:` `tools:`.
- Smallest working end-to-end slice first. Mock data must match protocol/samples/.
- Done means the relevant command above passed and you showed its output, plus a list of what you did not verify.
- If a pin, voltage, library API or version isn't written in this repo, say so and ask. Don't guess: guessed pins can burn parts.
- IMPORTANT: never open a serial monitor or read /dev/tty* or /dev/cu* directly (it hangs the session). Use tools/capture.py.
- After Saturday 5 PM (feature freeze), only fix bugs on the demo path; no refactors.

## Things that will bite you
- The INA219 must never see more than 26 V or less than −0.3 V on any pin. Never move a sensor off its slot position (spec §11.2).
- The relay boards are active-LOW: write the off level before pinMode(OUTPUT), or relays click at boot.
- Never energize relay stage 1 and stage 2 together; never close K_SHORT while K_CAP is closed.
- Lamps flicker at 120 Hz: average readings over 100 ms.
- <add a line each time Claude makes the same mistake twice; delete lines that stop mattering>

## When compacting
Keep the list of modified files, the latest command results, and any open protocol questions.
