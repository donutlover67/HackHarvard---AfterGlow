# Tools

Plain Python 3, no dependencies except `pyserial` for `capture.py`. Run everything from the repo root. How these fit with the rest: `docs/architecture.md`.

| Tool | What it does | Command |
|---|---|---|
| `serve.py` | The demo laptop's server: serves `dashboard/` and `site/`, stores runs the dashboard uploads (`POST /api/runs` → `site/data/runs/<run_id>.json`), serves them back (`GET /api/runs`), and rewrites `site/data/runs/index.json` after every upload | `python3 tools/serve.py [--port 8000] [--host 0.0.0.0]` |
| `capture.py` | Reads the board's serial port for a fixed time into a file, then closes it. The only safe way to read serial from a Claude Code session; a serial monitor hangs it. Finds ESP32 DevKits and Uno boards (usbserial, SLAB, wchusbserial, usbmodem). The file can be played back in the dashboard | `python3 tools/capture.py --seconds 20 --out logs/serial.log` (add `--send SEARCH` to send a command, `--until '"type":"proof"'` to stop early) |
| `sim/pv2s2p.py` | The single-diode model behind every number in the spec: does re-pairing give the claimed gain | `python3 tools/sim/pv2s2p.py` |
| `sim/make_samples.py` | Regenerates `protocol/samples/*.jsonl` from the model | `python3 tools/sim/make_samples.py` |
| `sim/make_site_sample.py` | Builds `site/data/sample-run.json` from the samples, in the dashboard's export format | `python3 tools/sim/make_site_sample.py` |
| `sim/make_runs_index.py` | Lists the run files in `site/data/runs/` in `index.json` for the public site. Leaves mock-bench runs out unless `--include-mock` | `python3 tools/sim/make_runs_index.py` |
| `eval/` | The Panel Advisor eval: 200 simulated batches plus bench runs, two deterministic advisors (sort by current; voltage-balanced) and a scorer. Details and scores: `tools/eval/README.md` | `python3 tools/eval/score.py <answers.json>` |

## Notes
- Stop a running capture before flashing: an open port blocks the upload. Opening the port resets an Uno, so its relays release for about a second.
- Mock-bench runs are rehearsal data. Delete runs you don't want public from `site/data/runs/` before committing; the index script prints what it lists.
- The model is reimplemented in `dashboard/js/mock.js`, `site/js/model.js` and `eval/model.py`. Change all of them together.
