# How Second String fits together

Read this first if you are new to the repo. It explains what each part does, how data moves from a solar panel to a QR code on a judge's phone, and where to look when you change something. Each area has its own guide with the details:

| Area | Guide |
|---|---|
| Firmware (ESP32 and Arduino Uno) | `firmware/CLAUDE.md` |
| Laptop dashboard | `dashboard/CLAUDE.md` |
| Passport site | `site/CLAUDE.md` |
| Server, capture, simulation, eval | `tools/README.md` |
| Serial messages between board and laptop | `protocol/PROTOCOL.md` |
| Demo-day steps | `docs/runbook.md` |

## What the project does

Four used solar panels are wired as two pairs: each pair in series, the pairs in parallel. In a series pair both panels carry the same current, so a weak panel drags its partner down. There are exactly three ways to split four panels into two pairs:

| Wiring | Pairs |
|---|---|
| A | 1+2, 3+4 |
| B | 1+3, 2+4 |
| C | 1+4, 2+3 |

The bench measures each panel's short-circuit current and open-circuit voltage at the same moment under the same light, grades the panels against each other, predicts which wiring matches like with like, then switches relays through all three wirings, sweeps each one's current-voltage curve, and keeps the one with the most power. It proves the gain by alternating the best and worst wirings for 20 cycles. Every panel gets a passport: an ID, a public page with its measurements, and a printed QR card.

Grading is relative, panel against panel under the same light, which is why no calibrated lamp is needed. It only works for panels of the same model tested together.

## The pieces and how data moves

```
 panels + relays + current sensors
            │  (wires)
 ┌──────────▼──────────┐   USB serial, 115200 baud, one JSON object per line
 │ board: ESP32 or Uno │ ───────────────────────────────────────────────┐
 │ firmware/           │ ◄─── commands as text: GRADE, SEARCH, PROOF, RUN B│
 └─────────────────────┘                                                  │
                                                                          ▼
                                              ┌───────────────────────────────────┐
                                              │ dashboard/ in Chrome (Web Serial) │
                                              │ grades, curves, gain, passports   │
                                              └──────────────┬────────────────────┘
                                                             │ POST /api/runs (after a proof)
                                              ┌──────────────▼────────────────────┐
                                              │ tools/serve.py on the same laptop │
                                              │ stores site/data/runs/<run>.json  │
                                              │ rewrites site/data/runs/index.json│
                                              └──────────────┬────────────────────┘
                              git commit + push              │  GET /api/runs (local site, every 5 s)
                              to feat/dashboard-and-skeleton │
                                                             ▼
                          ┌──────────────────────────────────────────────────┐
                          │ site/ : front page, passports, builder, cards     │
                          │ local:  http://localhost:8000/site/               │
                          │ public: https://mscl741.github.io/HackHarvard/site/│
                          └──────────────────────────────────────────────────┘
```

1. **Board to laptop.** The firmware does the physical work: reads five INA219 current sensors, switches relays with the safety interlocks, charges a capacitor across the array for each sweep. It never uses a network. It talks to the laptop only over USB serial, in the messages defined in `protocol/PROTOCOL.md`: `hello`, `live` (five times a second), `grade`, `sweep`, `search`, `proof`, `cal`, `error`, `log`.
2. **Dashboard.** Opens the board's port with Web Serial (Chrome or Edge only), sends commands, validates every incoming message, draws the charts, assigns passport IDs, and builds a run: the grades, sweeps, search result, proof and passports.
3. **Local server.** `tools/serve.py` serves the dashboard and the site and accepts uploaded runs. The local site shows a new run within five seconds, with no internet.
4. **Public site.** GitHub Pages publishes the repository from the branch `feat/dashboard-and-skeleton` about a minute after each push. The site has no server there; it reads `site/data/runs/index.json` and loads each run file it lists. The QR codes point at these public pages.

## Four ways a run can enter the system

The hardware may not work on the day, so the same pipeline accepts four sources. Each is labelled where it is shown, and the run file records which one it was in its `link` field.

| Source | How | `link` |
|---|---|---|
| The bench | Connect ESP32 (works for the Uno too), then Run the demo | `serial` |
| Multimeter readings | Dashboard → Enter readings by hand | `manual` |
| A recording | Dashboard → Data → Play a recording… (a `tools/capture.py` log, a messages download or an exported run) | `recording` |
| Simulation | Use mock bench; optionally Simulate measured panels… to run the model on real readings | `mock` |

Mock runs are rehearsal data: `tools/sim/make_runs_index.py` leaves them out of the public list unless `--include-mock` is given. Recordings never upload by themselves.

## One physics model everywhere

The single-diode panel model in `tools/sim/pv2s2p.py` is the source of the numbers in the spec. The same model is reimplemented in `dashboard/js/mock.js` (the mock bench), `site/js/model.js` (the Array Builder) and `tools/eval/model.py` (the eval harness), and it generated `protocol/samples/`. If you change the model in one place, change it in all of them, or the mock bench, the site and the eval will disagree.

## Branches and deploys

- All work lives on `feat/dashboard-and-skeleton`; `main` is kept identical to it by fast-forwarding.
- GitHub Pages is in "Deploy from a branch" mode from `feat/dashboard-and-skeleton`. `.github/workflows/pages.yml` is for the other mode (source: GitHub Actions); while Pages is in branch mode it checks the configuration and skips the deploy on purpose.
- Switching the Pages mode changes every passport URL (the `/site/` part disappears). Never switch after QR cards are printed.

## Where to change what

| You want to | Change | Then check |
|---|---|---|
| Change what the board measures or how | `firmware/src/main.cpp` and `firmware/src/uno/main_uno.cpp` (keep them in step) | `pio run -e esp32dev`, `pio run -e uno`, `pio test -e native` |
| Add or change a message field | Write it in `docs/NOTES.md` first: firmware and dashboard are built by different people against `protocol/PROTOCOL.md` | both builds and the dashboard's `?replay=1` self-test |
| Change a dashboard chart or control | `dashboard/` | mock mode with a clean console, then `?replay=1` |
| Change the front page, passport pages or the Array Builder | `site/` | `bun test site/test`, the example batch, every route, phone width |
| Publish real runs | `site/data/runs/`, then commit and push | the public site on a phone |
| Score the advisor agent | `tools/eval/` | `python3 tools/eval/score.py` |
