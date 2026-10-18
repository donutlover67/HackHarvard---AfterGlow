# Runbook: recording, publishing and the judging table

What to do, in order, for the demo. Every command runs from the repo root on the demo laptop. Public site: https://mscl741.github.io/HackHarvard/site/ (published from `feat/dashboard-and-skeleton` about a minute after a push).

## Saturday: get one real run

Indoor lamps can't light the panels enough for the pump, so record a real run outdoors while there is sun. Grading, the three sweeps and the proof work in weak light; only the pump needs strong sun.

1. Start the server: `python3 tools/serve.py`, then open http://localhost:8000/dashboard/ in Chrome.
2. **With the bench:** flash the board once (a person does it, since it switches relays): `cd firmware && pio run -e uno -t upload` for the Uno, `-e esp32dev` for an ESP32 DevKit. Then Connect Uno in the dashboard (it works for an ESP32 DevKit too) and Run the demo. The run uploads itself when the proof ends. Keep a serial capture as a backup recording: `python3 tools/capture.py --seconds 120 --send SEARCH --out logs/outdoor-run.log` (stop it before flashing; never open a serial monitor).
3. **Without the bench:** measure each panel with a multimeter (short-circuit current on the 10 A range, open-circuit voltage), and if possible the power of each wiring. Type them into the dashboard with **Enter readings by hand** (deck, next to Data): they become real passports marked as hand-entered. The same readings can calibrate the simulation, below.
4. In the dashboard's Data sheet, write the bench notes (where, when, light, any film) and choose what the array powers (pump, fan, resistor or nothing). Both go into the run.

## Publish runs to the public site

1. Delete test and rehearsal runs from `site/data/runs/` that should not be public. Mock-bench runs are never listed; the server rewrites `site/data/runs/index.json` after every upload. To rebuild it by hand: `python3 tools/sim/make_runs_index.py`.
2. `git add site/data/runs`, commit with the `site:` prefix, push to `feat/dashboard-and-skeleton` (and fast-forward `main`).
3. After a minute, open the public site on a phone that is not on the laptop's Wi-Fi and check the passports are there.

## Print the passport cards

1. Open https://mscl741.github.io/HackHarvard/site/#/print from the public site, never from localhost: a card's QR code holds the address it was printed from.
2. Print, cut along the borders, stick each card on the panel with the matching ID (the Data sheet shows which ID is which position).
3. Scan one card with a phone to check.

## Sunday at the table

1. Laptop on power, `python3 tools/serve.py`, dashboard and site open in Chrome. Phone hotspot ready if the venue Wi-Fi is bad: the dashboard and the local site need no internet; only the public site does.
2. What runs live depends on the hardware: the bench under the lamps; or the mock bench calibrated to the real panels (Use mock bench, then Simulate measured panels… in the mock bench row at the bottom), labelled as a simulation; or a recorded run played back with Data → **Play a recording…** (a `tools/capture.py` log, a messages download or an exported run), shown as "Recording", never as live.
3. Judges scan a card: it opens that panel's passport on the public site.

## Second Use at the table

Second Use (`#/reuse`) answers "what can this weak panel still run?". Steps 1 and 2 (the panel's usable energy and the list of devices it can run) work everywhere, including the public site on a judge's phone, from `site/data/second-use.json`. Step 3, "Ask the agent", needs the agent server on the demo laptop and a page opened from localhost:

1. In a second Terminal window, from the repo root: `AFTERGLOW_MODEL=openai/gpt-6.1-sol python3 tools/eval/second_use/serve.py`. Check it with `curl localhost:8767/health`, which answers `{"ok": true, ...}`. To run the tools in a Chalk sandbox instead of on the laptop (needs `chalk login` on that laptop): `AFTERGLOW_MODEL=openai/gpt-6.1-sol AFTERGLOW_TOOLS=chalk ~/.cache/afterglow-chalk/bin/python tools/eval/second_use/serve.py`.
2. Open http://localhost:8000/site/#/reuse (not the public site: the agent server only answers pages on localhost), keep SS-0002, and ask in plain words, for example "a light on my garden path for four hours each evening". The answer shows the agent's steps: the passport it read and each device it checked.
3. If the gateway key's token budget is spent, the status line says "The agent's Chalk quota is used up for now" and the page shows an answer recorded from the eval run, labelled as recorded. Ask a Chalk mentor to raise the budget on the key before the table, and say "recorded" out loud if it happens.

The numbers to quote, from `tools/eval/second_use/README.md` (212 requests, 12 on the bench's own passports): the agent with the passport and physics tools was right 99.5% of the time and never said yes when the panel could not run the device; a plain assistant given the same numbers was right 94.0% of the 166 requests it answered and said yes wrongly 3.2% of the time; the first prototype's rule (device watts under Voc × Isc) was right 62.7% of the time.

## The pitch in four lines

- Most retired panels still work, but testing one in a lab costs €16–31, so they get landfilled.
- We grade used panels against each other under the same light, so the light level cancels out and no calibrated lamp is needed: tens of dollars of electronics instead of a lab.
- In a series string the weakest panel limits the current, so we measure all three ways to pair four panels and keep the best. With two degraded panels that is about 40% more power than the worst pairing; with normal aging, 5 to 7%.
- Every panel gets a passport with its measured numbers and a QR code.

Say "measured" only for measured numbers. Simulated results are labelled as simulated on screen; say so out loud too.

## When something fails

| Problem | Do this |
|---|---|
| Lamps too weak or panels overheating | Outdoor recording and passports; drop the pump; halogen lamps heat panels before lighting them |
| Sweep times out in weak light | Smaller sweep capacitor, or raise `SWEEP_TIMEOUT_MS` in `firmware/include/config.h` |
| Relays fail | Wire the pairings by hand, or enter the multimeter readings by hand |
| The Uno won't connect | Chrome or Edge only; unplug and replug; the dashboard shows "Link lost" and Connect reopens the port |
| Public site shows old data | Wait a minute after the push; refresh; GitHub Pages caches files for about ten minutes |
| A browser shows "This page could not be drawn" | Press "Remove imported runs and reload" |
