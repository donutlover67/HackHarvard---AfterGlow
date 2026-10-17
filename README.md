# Second String

Grades used solar panels, then rewires them for the most power. HackHarvard 2026.

Four small panels sit in lamp boxes. An ESP32 measures every panel's short-circuit current at the same instant and its open-circuit voltage, scores them against each other, predicts which panels belong in series together, then verifies the prediction by sweeping the I-V curve of all three possible pairings with relays and a capacitor. It keeps the best pairing, runs a 12 V pump from it, and proves the gain by alternating the best and worst wirings and measuring each at its maximum power point. A laptop dashboard over USB serial shows the grades, the curves and the gain with a confidence interval.

## Why

Panels lose about 0.5–0.75% of their output a year, so after 25 years most still make 80–88% of their rating, and panels retired early for upgrades often make 70–95%. Yet most retired US panels are landfilled and about 1% are reused. One reason is testing: a lab flash test plus imaging costs €16–31 per panel against roughly €50 for a new one, and there is no agreed cheap retest yet. The other problem is mismatch: in a series string every panel carries the same current, so the weakest panel limits the string. Manufacturers sort new panels into current classes to avoid this; used panels arrive in mixed batches with no data. We measure that data in place, cheaply, and verify the wiring automatically.

With two of four panels at 50% output, the best pairing makes about 38–41% more maximum power than the worst and about 22–24% more than the average of the three; with realistic aging (80% panels) the gain is about 5–7%. We report the measured number, not the idealized 50%.

## Repository

| Folder | What | Owner |
|---|---|---|
| `dashboard/` | The laptop dashboard: plain HTML, CSS and ES modules, hand-drawn SVG charts, Web Serial, a built-in mock bench. No build step, works offline. | C |
| `firmware/` | ESP32 firmware (PlatformIO, Arduino framework): grading, pairing relays, I-V sweeps, proof cycles, serial JSON. Pure logic in `lib/solarlogic` with host tests. | B |
| `protocol/` | The serial contract (`PROTOCOL.md`) and sample messages (`samples/*.jsonl`) that both sides are built against. | B |
| `docs/` | `spec-v2.md` (the full project description), `hardware.md` (wiring as built), `feasibility-report.md`, `NOTES.md` (cross-area requests). | A, D |
| `tools/` | `capture.py` (bounded serial capture for logs) and `sim/` (the single-diode model behind the numbers above; regenerates the protocol samples). | B |
| `solar_pairing/` | An earlier Python stand-in from before the spec rewrite. Superseded by `dashboard/`. | — |

## Run the demo laptop

```bash
python3 tools/serve.py
```

Then open http://localhost:8000/dashboard/ and http://localhost:8000/site/ in Chrome. The dashboard starts on the mock bench (simulated panels, same physics model as the firmware's design) and runs a search; press **Prove** for the confidence interval. **Connect ESP32** uses Web Serial (Chrome or Edge, 115200 baud). The mock bench row at the bottom lets you change the light level and which panels carry film. Data → **Upload run** sends the run's passports to the local server, and the site shows them within a few seconds; **Export passports** writes the same JSON to a file for a site hosted elsewhere.

The site works from any static host too (GitHub Pages serves `site/` as is); without the local API it imports run files by hand.

## Build and test the firmware

```bash
cd firmware && pio test -e native      # host tests for the logic
cd firmware && pio run -e esp32dev     # compile for the ESP32
```

Flashing (`pio run -e esp32dev -t upload`) switches relays on real panels, so a person does it. Capture serial output with `python3 tools/capture.py --seconds 20 --out logs/serial.log`; never open a serial monitor from an agent session.

## Status

- Dashboard: working on the mock bench; assigns passport IDs, exports a run as JSON (passports + search + proof) and can POST it to an upload address. Web Serial path written but not yet tested against the ESP32.
- Firmware: compiles (arduino-esp32 2.0.17, no warnings) and host tests pass. Not yet run on hardware. Relay logic level, sensor addresses and divider ratio must be confirmed in `docs/hardware.md` first.
- Site: passport pages with QR codes and the Array Builder work from imported run JSON; the impact page is a stub for D. Plan in `docs/website-plan.md`.
- Hardware: being built. Lamp-box brightness test is the gating risk (see `docs/feasibility-report.md`).

## Team

Four people: A hardware and wiring, B firmware and protocol, C dashboard and data, D light, water, story and Devpost. Working rules for people and for Claude Code sessions are in `CLAUDE.md`.
