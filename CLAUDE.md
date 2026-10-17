# Second String — HackHarvard 2026 prototype

A microcontroller (an ESP32 DevKit or an Arduino Uno R3; two firmware builds, one protocol) grades 4 small 6 V solar panels and switches them between the 3 possible 2S2P pairings with relays. A laptop dashboard, connected over USB serial, shows the grades and the measured gain; each panel gets a public passport page with a QR code. This is a 40-hour demo, not a product: optimize for one reliable demo run on Sunday 9 AM.

## Source of truth (highest first)
docs/spec-v2.md > protocol/PROTOCOL.md > docs/hardware.md (wiring as actually built) > code.
If the code and the spec disagree, stop and say so; don't work around it.
New to the repo? Read docs/architecture.md first (how the parts fit and where to change what), then your area's guide below and your section of docs/team-notes.md. docs/README.md lists every doc.
@protocol/PROTOCOL.md

## Layout and owners
- `firmware/` — Arduino framework via PlatformIO: `src/main.cpp` for the ESP32 DevKit, `src/uno/main_uno.cpp` for the Uno (pin map in include/config_uno.h is a proposal until docs/hardware.md confirms it). Keep both builds in step. Owner: B. See firmware/CLAUDE.md.
- `dashboard/` — static HTML + JS, Web Serial, charts drawn in SVG by hand, no build step. Owner: C. See dashboard/CLAUDE.md.
- `protocol/` — the serial JSON contract and sample messages. Owner: B. Don't edit; propose changes in docs/NOTES.md.
- `docs/hardware.md` — pin map and relay wiring as built. Owner: A. If it disagrees with spec §11.2, it wins (the wiring is real).
- `docs/`, `README.md`, Devpost text — owner: D.
- `tools/` — serve.py (the demo laptop's server), capture.py (bounded serial capture), sim/ (the physics model, sample generators, the public runs index), eval/ (the Panel Advisor eval harness). See tools/README.md. The Chalk agent itself is built by another teammate outside this repo; don't start it here.
- `site/` — passport pages with QR codes, Array Builder, impact page, printable cards. Public at https://mscl741.github.io/HackHarvard/site/ via GitHub Pages in branch mode from `feat/dashboard-and-skeleton` (keep `main` fast-forwarded to it; .github/workflows/pages.yml skips its deploy while Pages is in branch mode). Owner: C. See site/CLAUDE.md. The board never touches a network; the dashboard uploads runs to tools/serve.py, and runs committed under site/data/runs/ show on the public site.
- `solar_pairing/` — the earlier Python stand-in, written before the spec rewrite. Superseded by dashboard/. Don't extend it.

## Commands
- Demo laptop: `python3 tools/serve.py` serves http://localhost:8000/dashboard/ and http://localhost:8000/site/ and stores runs the dashboard uploads (POST /api/runs → site/data/runs/). Mock mode runs with no ESP32 attached. `cd dashboard && python3 -m http.server 8000` still works for the dashboard alone.
- Firmware build (no hardware needed): `cd firmware && pio run -e esp32dev` and `cd firmware && pio run -e uno`
- Firmware host tests: `cd firmware && pio test -e native`
- Serial capture: `python3 tools/capture.py --seconds 20 --out logs/serial.log` (bounded; writes a file)
- Regenerate protocol samples: `python3 tools/sim/make_samples.py`
- Dashboard serial self-test without a board: open `/dashboard/?replay=1` on the local server, press Replay recording.
- Demo day, publishing runs and printing cards: docs/runbook.md

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
- Lamps flicker at 120 Hz: average readings over 100 ms. Halogen lamps heat the panels before they light them enough; use sunlight or LED floods.
- Uno: 2 KB of RAM (keep `pio run -e uno` under about 1.4 KB), one I2C bus (the OUT sensor is at 0x42, not 0x40), and its ADC reads against the 5 V supply (`uno::VCC_V`, measure it). Opening its serial port resets it.
- GitHub Pages caches files for about 10 minutes, and switching the Pages mode changes every passport URL: never switch after cards are printed.
- <add a line each time Claude makes the same mistake twice; delete lines that stop mattering>

## When compacting
Keep the list of modified files, the latest command results, and any open protocol questions.
