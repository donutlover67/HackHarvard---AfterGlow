# Notes for the rest of the team

Written Friday Oct 16, late evening, by the software side. Read your own section first, then "For everyone". The same text is in the shared doc; this copy is the one Claude Code sessions see.

## Where things stand

Everything built so far is pushed on branch `feat/dashboard-and-skeleton`; `main` still has only the old Python stand-in until the pull request is merged. Pull the branch, then run `python3 tools/serve.py` and open http://localhost:8000/dashboard/ and http://localhost:8000/site/ in Chrome.

| Piece | State | Where |
| --- | --- | --- |
| Spec v2, feasibility report, website plan | Written; the spec is the source of truth | `docs/` |
| Serial protocol and sample messages | Fixed; changes go through `docs/NOTES.md` | `protocol/` |
| ESP32 firmware | Compiles, 5 host tests pass, never run on hardware | `firmware/` |
| Bench dashboard | Works on the mock bench; Web Serial written, untested on a board | `dashboard/` |
| Site: passports, QR codes, Array Builder | Works from imported runs or the local server; impact page is a stub | `site/` |
| Panel Advisor eval harness | 201 cases, reference advisor, scorer, README | `tools/eval/` |
| Local demo server and serial capture | Working | `tools/serve.py`, `tools/capture.py` |

The two things nobody has done yet are the ones that need parts: running the firmware on the real ESP32 and connecting the dashboard to it over USB.

## For A: hardware and wiring

The firmware and the dashboard were written against spec §11.2 (two-stage relay network, sensors fixed to slots, one bypass diode per slot). `docs/hardware.md` is yours and wins over the spec: every time a wire moves, record it there, because the firmware's pin and address constants (`firmware/include/config.h`) are copied from it.

- Tonight's gating test: one LED floodlight over one clear panel, multimeter on the 10 A range across the panel terminals. A 2 W panel needs at least about 130 mA (35% of its rated current) for the pump demo to show the effect. If a 100 W-class light in a foil-lined box doesn't reach that, the live demo moves to the Saturday outdoor data and the lamps are only for grading.
- Sensors stay on slots, never on panels. An INA219 pin must never see more than 26 V or less than −0.3 V; the slot layout and the bypass diodes exist to guarantee that. Panels must be identical, with open-circuit voltage under 10 V each.
- Relay boards: check whether yours are active-low and whether they release cleanly from a 3.3 V signal; if not, split the JD-VCC jumper and feed the coils from the separate 5 V 2 A supply (common ground with the ESP32). No solid-state relay boards: they are AC-only and never turn off on DC.
- K_LOAD's normally-closed contact feeds the pump, so the pump runs when the controller is off or resetting. K_SHORT, K_CAP and K_DIS never close together; the firmware enforces this, the wiring must allow it.
- The sweep capacitor (10,000 µF, 25 V or more) is polarised; its discharge path is 4.7 Ω at 5 W. The mid-node dividers are 100 kΩ over 15 kΩ with 100 nF to ground, into GPIO 34 and 35 only.
- Build on one rigid board with screw terminals or Wago connectors and a label on every wire. It goes home every night.
- Verification order: multimeter continuity for each relay row in `docs/hardware.md`, then the fake-panel test (9 V battery with 220 Ω and 470 Ω) before any real panel touches the sensors.

## For B: firmware and protocol

`firmware/` compiles (PlatformIO, espressif32@7.1.3, which is arduino-esp32 2.0.17, so the 2.x APIs) and its five host tests pass, but it has never run on a board. Every pin, address and timing is a named constant in `include/config.h`; the procedures follow spec §11.3 and the interlocks §11.4. Don't remove an interlock to make something pass.

Verify in this order once the rig exists:

1. `pio run -e esp32dev`, flash, capture 20 s with `python3 tools/capture.py --seconds 20 --out logs/serial.log`, and check the `hello` line and any `error` lines (missing INA219s print their bus and address).
2. Relay logic level and that both stages never energise together; the sign of the bottom-slot currents (the code takes the absolute value); the divider gain 115/15.
3. GRADE on the fake panels, then on real panels: Isc within 3% of a multimeter, Voc within 2% of the sweep's end point.
4. SWEEP timing: with 10,000 µF charging at 150 mA to about 13 V, expect roughly a second; tune `SWEEP_FLAT_MS`, `SWEEP_FLAT_V`, `SWEEP_IGNORE_MS` and the 4 s timeout from what the capture shows. The raw buffer holds 2,500 samples.
5. PROOF: twenty ABBA cycles take about a minute; the pump is disconnected during each sweep, so the live trace drops to zero while proving. That is expected and the dashboard labels it.

Known limits: no `live` messages during a sweep capture (up to 4 s); only `STOP` is honoured while a procedure runs; the box factors persist in NVS under the `second` namespace.

The protocol in `protocol/PROTOCOL.md` is yours, and the dashboard is built against it, so a field change goes into `docs/NOTES.md` first. `dashboard/js/mock.js` is a second implementation of the same protocol with the same timings; if the real board behaves differently from the mock, one of them is wrong and the dashboard will show which.

Serial rules for Claude Code sessions: never open a serial monitor or read `/dev/tty*` or `/dev/cu*` (it hangs the session); use `tools/capture.py`; stop any capture before `pio run -t upload`, and a person confirms every upload because flashing switches the relays.

## For D: light, story and the submission

The pitch numbers are only as good as the lamps, so the lamp box is the first thing to settle.

- Lamps: one 100 W-class LED floodlight (8,000–10,000 lm) per panel in a foil-lined box, 15 minutes of warm-up, panel surface under 55 °C, box-to-box spread under 5% after the calibration wizard. The dashboard's Calibrate boxes button walks through moving the clear reference panel through all four boxes.
- Film: 35% visible-light transmission is what the nearby shops stock (no 50%). Use the same film type on both dimmed panels; dyed and ceramic films differ a lot in the infrared the cells use. The spec, the dashboard footer and the site already say "35% film".
- Honest figures: about +38 to 41% more maximum power than the worst wiring and +22 to 24% than the average with two panels behind film; only 5 to 7% for realistic aging (panels at 80%). Always "measured at each wiring's maximum power point from an I-V sweep", never pump speed. Show the no-film null test as the noise floor.
- A new line for the story, from the eval harness: sorting panels by current gets the best wiring 98.5% of the time on batches with no failed-cell-group panel, but only 60% when one is present, because the low-voltage panel sinks its string. That is why the bench measures every wiring instead of trusting the score.
- Impact page: the measured gain is wired in; the sources already on it are NREL (0.5–0.75%/yr loss, 83% landfilled / 9.5% recycled / 1.2% reused), the IEA PVPS 2026 second-life report and the €16–31 per-module test cost. Any carbon figure needs a scenario (panels graded per hour, pass rate, what they displace) and a source, or it stays off the page.
- Submission: the GitHub repo is public; merge the pull request so `main` is what judges open. Devpost closes Sunday 8:00 AM; record the under-3-minute video Saturday evening after the 5 PM feature freeze. The ASUS content challenge post costs little. Saturday's outdoor run is best 2–4:30 PM by the forecast.
- Still to ask on Discord: venue opening times Saturday and Sunday, whether one project may enter both the Sustainability and Hardware tracks, soldering in the venue, power at the judging tables.

## For the Chalk agent builder

The harness in `tools/eval/` is ready to score your agent; nothing in it depends on Chalk. Read `tools/eval/README.md` first.

- `cases.json` holds 201 cases: 200 simulated batches of 4 to 9 passports with exact brute-force ground truth from the same single-diode model the bench and the site use, plus every bench run found in `tools/eval/runs/` (drop the dashboard's exported run files there and re-run `make_cases.py`).
- Each case gives passports (`isc_ma`, `voc_v`, score, grade, flags) and a need (`pump_12v`, `shed_light_18v`, `fence_24v`), which fixes the string length `k`. The answer is one JSON object per case: `{"case_id", "groups": [[ids], …], "notes"}`.
- `python3 tools/eval/score.py answers.json` reports agreement rate, exact matches, power lost vs best (mean and worst), gain over naive, need met, and invalid answers, split into simulated and bench cases.
- Scores to beat: the deterministic reference (`advisor_reference.py`, sort by current) gets 85.6% agreement and loses 0.63% power on average; the naive baseline (wire them as they came) gets 26.4%. The reference is the tool your agent should call; the agent earns its keep by doing better than the tool.
- Where the tool loses, and where an agent can win: on batches containing a `low_voc` panel (a failed cell group) it is right only 40 times out of 67, because sorting by current puts two low-voltage panels in one string and that string then sits below the array's operating voltage. Match current within a string, balance voltage across strings: spread the low-voltage panels one per string, or leave them out when the need allows. The seven "need not met" cases are the same problem.
- Please don't edit the harness internals; if the answer format or a metric needs to change, write it in `docs/NOTES.md` and the C side will adjust the scorer the same day.

## For everyone

- Branch: `git fetch && git switch feat/dashboard-and-skeleton`. One branch per person from there, small commits with the `fw:` `dash:` `proto:` `site:` `docs:` `tools:` prefixes, `git pull --rebase` before pushing, and a person merges to `main`.
- Claude Code: launch `claude` from the repo root (the shared settings are not read from a subfolder) and accept the folder-trust prompt once. Add your own wall in `.claude/settings.local.json`, for example `{"permissions": {"deny": ["Edit(/dashboard/**)"]}}` for the firmware side and the reverse for the dashboard side. `/clear` between tasks; long sessions drift.
- The source of truth, in order: `docs/spec-v2.md`, then `protocol/PROTOCOL.md`, then `docs/hardware.md`, then the code. A request that touches someone else's area goes into `docs/NOTES.md` with the date and both areas; the owner resolves it.
- No dependencies and nothing loaded from the internet at runtime: the demo table may have no Wi-Fi. The whole demo runs from one laptop with `python3 tools/serve.py`.
- Timeline: Saturday 11:00 live grades under the lamps; 14:00–16:30 outdoor run; 17:00 feature freeze, after which only demo-path bug fixes; Sunday 8:00 Devpost deadline, 9:00–12:00 judging in Canopy Hall, 15:00 closing ceremony.
- Fallbacks, in order: hand-wired pairings if the relay network fails; averaged sweeps or a fixed resistor load if the lamps flicker too much; grading only plus Saturday's outdoor data if the lamps are too weak; the 12 V fan if the pump won't start; the video last.
