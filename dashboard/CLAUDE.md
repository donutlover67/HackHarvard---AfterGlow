# Dashboard

Plain HTML + CSS + ES modules, no build step and no framework. Charts are drawn by hand in SVG (`js/charts.js`); there is no charting library. The only vendored asset is the Archivo variable font (OFL) in `vendor/fonts/`. Everything must work offline in Chrome.
Requirements are in docs/spec-v2.md §9 and §11.6; messages are in protocol/PROTOCOL.md. How it fits with the board, the server and the site: docs/architecture.md.

## Files
- `index.html` — the page; `css/style.css` — design tokens and layout; `css/motion.css` — the motion layer, loaded after style.css (bars grow, curves fade, panels settle, values cross-blur only when they change; all off under prefers-reduced-motion).
- `js/app.js` — state, rendering and controls. `js/charts.js` — SVG charts. `js/mock.js` — a simulated ESP32 that runs the same single-diode model as tools/sim. `js/serial.js` — Web Serial. `js/replay.js` — the stand-in port and the ?replay=1 self-test. `js/playback.js` — plays a recorded session from a file (Data, Play a recording…) through that port and SerialLink. `js/manual.js` — readings typed in by hand (Enter readings by hand): the firmware's grade, flag and prediction rules in JS, building `grade`/`search` messages that go through the same dispatch(); such runs have `link: "manual"`. `js/calibrate.js` — Simulate measured panels…: the mock bench runs the model on four measured panels (each panel's diode current fitted to its own Voc), still labelled as a simulation. `js/load.js` — what the array powers (pump, fan, load resistor or nothing): changes only the words on screen.

## Where data comes from
One link at a time; starting one stops the others. The run's `link` field records which it was, and the site labels runs by it.

| Link | Started by | Notes |
|---|---|---|
| `serial` | Connect ESP32 | the ESP32 or the Uno build; same protocol |
| `mock` | Use mock bench (starts on load) | simulated; optionally calibrated to measured panels |
| `manual` | Enter readings by hand | typed multimeter readings; no sweeps, no proof |
| `recording` | Data → Play a recording… | never uploads by itself |

Every line, whatever its source, goes through `dispatch()` in app.js: handlers check the fields they use and return false to reject a message, and a handler that throws is logged without ending the read loop.

Browser storage (localStorage, per laptop): `ss.passports` and `ss.passportNext` (passport IDs per panel), `ss.benchNotes`, `ss.uploadUrl`, `ss.autoUpload`, `ss.manualNote`, `ss.mockCalib`, `ss.load`.

## Run and check
- `python3 -m http.server 8000` from this folder, then open http://localhost:8000 in Chrome (Web Serial needs localhost or https; ES modules don't load from file://).
- Mock mode (the default when no port is connected) must exercise every message type, so every chart can be checked without hardware.
- Before saying done: load the page in mock mode, confirm no console errors, and confirm each message type renders.
- Serial parsing without a board: serve the repo root (`python3 tools/serve.py`) and open `/dashboard/?replay=1` (or `?replay=auto&speed=0`), then press Replay recording. js/replay.js feeds protocol/samples/ plus reset noise, torn lines, garbage and bad fields through SerialLink's own read loop and reports pass/fail on the page and in the console.
- Playing a recorded run (Data, Play a recording…): a tools/capture.py log, the Download all messages (JSONL) file or an exported run (JSON). Timing follows the messages' `t` at 1×, 4× or as fast as possible. The Link readout says "Recording: <file> (not live)", the run's `link` is "recording", its bench text says it was replayed, and recordings never upload automatically. Mock-bench lines in a JSONL download (from `hello` with fw "mock" to the next real `hello`) are left out.

## Rules
- Only Chrome/Edge matter (Web Serial). Don't add polyfills or other browsers.
- Ignore malformed lines and unknown message types instead of crashing; the firmware will print partial lines on reset.
- Never invent message fields. If a field you need is missing, write the request to docs/NOTES.md and stop.
- Labels must stay honest: the gain is "at maximum power (I-V sweep)"; load power is labelled with the load chosen in the Data sheet ("power into our pump", "…fan"); hand-entered, recorded and simulated data say so.
- Keep the visual language: panels are drawn as silicon cells, colour follows the pairing (A gold, B blue, C green) and never the rank, numbers use tabular figures in ink colours, no uppercase labels, no cards with drop shadows.
