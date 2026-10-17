# Website, passports, advisor agent: plan and plumbing

Direction agreed Fri evening. This file is the shared brief so every session builds toward the same thing. Owner: C (website), with D on the impact page and copy.

## What the site is

1. **Panel Passport (must-have).** Every tested panel gets an ID and a QR code. Its page shows short-circuit current, open-circuit voltage, relative score, grade, and the "possible failed cell group" flag. The ESP32 bench produces the data; the site displays it. This is the answer to "there is no cheap standard way to measure a used panel."
2. **Array Builder.** Paste or pick a pool of passports; it groups them into series strings of similar current and shows the estimated power of the matched grouping against a naive one. This is the 4-panel hardware logic generalized to N panels. For small N it checks itself against brute force; the 4-panel bench gives the real-world answer to compare with.
3. **Impact page.** Panels diverted from landfill and power recovered, driven by the gain we measured on the bench, not the 50% idealized figure. Carbon figures only with a source and the assumptions shown.
4. **Panel Advisor agent (Chalk).** Takes passports plus a buyer's need ("run a 12 V pump", "a shed light") and recommends which panels to buy and how to wire them. Its eval scores the recommendation against the bench's measured best pairing: agreement rate and power lost vs best.
5. **Text/voice front door (Photon).** Text the agent your readings or a photo of a label, get back a grade and wiring suggestion. Voice is a stretch goal. One agent, two interfaces.

## The plumbing, settled

The dashboard no longer runs on the ESP32's Wi-Fi. Since spec v2 the ESP32 talks only over **USB serial** to the laptop (`dashboard/`), and the laptop has internet (venue Wi-Fi or a phone hotspot). So:

- **The ESP32 never touches a network.** No access point, no hotspot joining, no captive-portal problems.
- **The dashboard uploads.** After a run it POSTs the run (passports + search + proof) to the site. If the upload fails, nothing on the bench changes; the dashboard keeps working offline.
- **Fallback is already built:** the dashboard's Data sheet downloads every message as JSONL. A static site can import that file by hand.

Hosting has its own section below: `tools/serve.py` at the table, GitHub Pages for the public URL, bench runs committed to `site/data/runs/`.

## Hosting

Two hosts serve the same `site/` folder; there is no build step on either.

**At the table: the demo laptop.** `python3 tools/serve.py` (stdlib Python, no dependencies) serves `dashboard/` and `site/` and stores what the dashboard uploads at `POST /api/runs` as `site/data/runs/<run_id>.json`. The site polls `GET /api/runs` every 5 s, so a new run shows on the passports page within seconds, with no internet.

**For judges' phones: GitHub Pages.** A QR code encodes the page's own URL, so the passport a judge scans must be public. Pages is live in "Deploy from a branch" mode from `feat/dashboard-and-skeleton` (a repo admin enabled it Sat morning): GitHub publishes the repository root from that branch about a minute after each push, so:

- https://mscl741.github.io/HackHarvard/site/ opens the front page; `#/passports` is the passport index, `#/build` and `#/impact` the other pages.
- https://mscl741.github.io/HackHarvard/site/#/p/SS-0001 is what a QR code opens.
- https://mscl741.github.io/HackHarvard/ is the README rendered by Jekyll; `dashboard/` is served over https as well.

`.github/workflows/pages.yml` is the other mode: with Source set to GitHub Actions it publishes `site/` as the root (no `/site/` in the URLs) on every push to `main`, using GitHub's checkout, configure-pages, upload-pages-artifact and deploy-pages actions. While a branch is the source, GitHub rejects deployments from any other branch ("not allowed to deploy to github-pages due to environment protection rules"), so the workflow first reads the Pages configuration and skips the deploy with a notice instead of failing. Switching modes is an admin's choice at Settings → Pages → Build and deployment → Source; it changes every passport URL, so never switch after QR codes have been printed. Show and print passports from the public URL, not from localhost, or the QR codes point at a page phones cannot open.

**Runs on the public site.** Pages is static: there is no `/api/runs`. The site asks `../api/runs` first and, when that fails (404 on Pages, connection refused with no local server), loads `data/runs/index.json` and every run file it lists; the empty states read "Loading passports…" until that first pull is over. Decision, Fri night: **run files are committed**, so `site/data/runs/` is no longer in `.gitignore`. A public passport page with no data defeats the QR code, and importing a file by hand on a judge's phone is not realistic. To publish runs:

1. Upload from the dashboard (Data → Upload run) with `tools/serve.py` running, or copy an exported run file into `site/data/runs/`.
2. Delete test runs that should not be public, then `python3 tools/sim/make_runs_index.py`. It prints every run it lists and rewrites `index.json`.
3. `git add site/data/runs`, commit with the `site:` prefix, push to `feat/dashboard-and-skeleton` (the branch Pages publishes; keep `main` in step by fast-forwarding it). Pages redeploys in about a minute.

Costs: `git add -A` sweeps mock runs into a commit (step 2 is the guard), and two people adding runs at once conflict on `index.json` (rerun the script). To reverse the decision, add `site/data/runs/*.json` and `!site/data/runs/index.json` to `.gitignore`, commit the empty index, and import runs by hand on whichever laptop shows the passports. A sponsor host (Modal, Daytona) stays optional, only if a mentor sets it up in minutes.

## Passport schema (draft; becomes protocol/passport.schema.json once B agrees)

```json
{
  "passport_id": "SS-0001",
  "panel_label": "P1",
  "measured_at": "2026-10-17T15:02:11-04:00",
  "run_id": "run-20261017-150211",
  "isc_ma": 150.2,
  "isc_raw_ma": 148.9,
  "voc_v": 6.81,
  "score_pct": 100.0,
  "grade": "A",
  "flags": [],
  "reference": { "kind": "relative", "strongest_isc_ma": 150.2, "box_factor": 1.0, "light": "lamp box, 35% film on P2 and P4" },
  "rated": { "isc_ma": null, "voc_v": null, "model": null },
  "verified": { "best_pairing": "B", "pmax_w": { "A": 1.48, "B": 2.04, "C": 1.48 } }
}
```

- `passport_id` is assigned by the dashboard (a counter persisted in the browser, prefix `SS-`); the QR code encodes the passport page's own URL, on the public site `https://mscl741.github.io/HackHarvard/#/p/SS-0001`.
- `reference.kind` is `relative` for identical panels graded together, `rated` when the label's Isc is known and irradiance was measured.
- One run produces four passports plus the run record (`search`, `proof`, the lamp and film description).

## Array Builder algorithm

- Input: passports with `isc_ma`, `voc_v`; string length k (2 for a 12 V load from 6 V panels); optional target voltage.
- Matched grouping (`site/js/builder.js`, the same logic as `tools/eval/advisor_voltage.py`): match current within a string, balance voltage across strings. Each string's current is roughly its minimum `isc_ma`, and strings share one voltage, so a string with a failed-cell-group panel (Voc under 0.8 × the pool's median) sits below the others. The builder spreads those panels as evenly as possible across strings, gives the healthy strings the strongest panels, and also starts from plain sort-by-`isc_ma` and two other groupings; from each start it swaps pairs of panels between strings while the single-diode model (`site/js/model.js`, the same as `dashboard/js/mock.js`) says the swap gains power, and keeps the best. Plain sort by current lost up to 20.8% on batches with two low-voltage panels in one string; see `tools/eval/README.md` for the scores.
- Naive grouping: the order the passports were entered (how an installer would wire a mixed batch).
- Self-check: for N ≤ 8 enumerate all groupings (N=8, k=2: 105 matchings) and confirm the matched grouping equals the best. For N=4 the bench's `search` message is the real-world check.
- Also show the gain against the average grouping, the honest number for "wiring without measuring".

## Agent and eval

- The deterministic Array Builder is the advisor's tool; the model wraps it and explains. Then the eval can be strict.
- Eval set: (1) the real bench runs (each film placement is one case; ground truth is the `search` best pairing and the `proof` gain); (2) 200 simulated batches from the single-diode model with brute-force ground truth. Metrics: agreement rate with the best grouping; mean power lost vs best (%); for the need ("12 V pump"), whether the recommended string voltage meets it.
- Which Chalk pieces (data integration, evals, gateway) fit is a question for their mentors on Saturday. The Chalk agent is another teammate's piece; the harness it is scored with lives in `tools/eval/` (cases.json, a reference advisor, a scorer; see its README).
- Photon: the same agent behind a text number. Input parsing of a photo of a label is the risky part; start with typed readings.

## Build order (C, with the dashboard already working)

1. ~~Dashboard: assign passport IDs, build the passport JSON per run, add "Upload run" and "Export passports".~~ Done Fri evening (Data sheet in the dashboard).
2. ~~Site skeleton: passport page from JSON, QR codes, index of tested panels.~~ Done Fri evening: `site/`, hash-routed static pages, runs imported from the dashboard's export or `site/data/sample-run.json`.
3. ~~Array Builder page with the brute-force self-check and the bench comparison.~~ Done Fri evening. Headless check: on 60 random 8-panel batches the greedy grouping equalled the brute-force best in 55 and lost 0.01% power on average, so "sort by current" is a safe heuristic to pitch, and the bench measurement is the verification. Sat: replaced by the voltage-balanced grouping above, after the eval harness showed sort by current failing on batches with a failed-cell-group panel (40 of 67 right; the new grouping gets 65 of 67).
4. Impact page with sourced numbers (D writes, C wires; Sat afternoon).
5. Advisor agent + eval (Sat afternoon, only if 1–3 are done; this is where the sponsor prizes are).
6. Photon front door (stretch; Sat evening at the earliest).

Feature freeze for the demo path stays at Sat 5 PM; 5 and 6 may continue off-site after that because they don't touch the bench.

## Honest scope note

Five pieces plus hardware plus firmware in the remaining ~36 hours is a lot for four people. Passports and the Array Builder reuse logic that already exists; the agent and Photon are each a half-day with integration risk. If something has to go, drop Photon first, then the carbon figures on the impact page, never the passport page.
