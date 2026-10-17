# Panel Advisor eval harness

Plain Python 3, no dependencies. Whoever builds the Chalk agent calls these scripts; nothing here depends on Chalk.

The task the advisor is scored on: given a batch of panel passports (`isc_ma`, `voc_v`, score, grade, flags) and a buyer's need, return how to wire them into series strings. The truth is exact: for simulated batches every grouping is enumerated with the same single-diode model the bench dashboard and the site use; for bench cases the truth is the wiring the ESP32 bench measured as best.

```bash
python3 tools/eval/make_cases.py                       # writes tools/eval/cases.json (200 simulated + bench runs)
python3 tools/eval/advisor_reference.py > tools/eval/answers-reference.json
python3 tools/eval/advisor_reference.py --naive > tools/eval/answers-naive.json
python3 tools/eval/score.py tools/eval/answers-reference.json --json tools/eval/report-reference.json
```

To add real bench runs as cases: export a run from the dashboard (Data → Export passports) and drop the JSON into `tools/eval/runs/`, then re-run `make_cases.py`.

## Answer format

One answer per case, as the agent's final output:

```json
{"advisor": "chalk-panel-advisor", "answers": [
  {"case_id": "sim-0001", "groups": [["SIM-0001-3", "SIM-0001-1"], ["SIM-0001-2", "SIM-0001-4"]], "notes": "free text"}
]}
```

`groups` is a list of series strings; each string lists passport IDs. The string length must match `need.k` (2 for the 12 V pump with 6 V panels). Leftover panels may be left out; bench cases must use all four.

## Metrics (`score.py`)

| Metric | Meaning |
|---|---|
| agreement rate | answer within 0.5% of the best grouping's power (exact match always counts) |
| exact match | the same grouping as the best one |
| power lost vs best | mean and worst, % of the best grouping's maximum power |
| gain over naive | how much better than wiring the panels as they came |
| need met | every string's estimated operating voltage (0.82 × ΣVoc) reaches the need's minimum |
| invalid | wrong string length, a panel used twice, or unknown IDs |

`advisor_reference.py` is the deterministic advisor (sort by current, cut into strings). It is what the agent should call as a tool; its score is the bar. `--naive` is the baseline the agent must beat.

## Scores so far (seed 7, 200 simulated + 1 bench case)

| Advisor | agree | exact | lost vs best, mean | lost, worst | gain over naive | need met |
|---|---|---|---|---|---|---|
| reference (sort by current) | 85.6% | 67.2% | 0.63% | 20.8% | +4.7% | 96.5% |
| naive (as they came) | 26.4% | 20.4% | 4.80% | 27.4% | 0 | 97.5% |

Where the reference loses, and where an agent can win: on batches with no `low_voc` panel it agrees with brute force 98.5% of the time. On the 67 batches that contain a panel with a failed cell group it agrees only 40 times. Sorting by current puts two low-voltage panels in the same string, and that string then sits far below the array's operating voltage and contributes almost nothing (worst case: 20.8% lost). The fix is to match current *within* a string but balance voltage *across* strings: spread `low_voc` panels one per string, or leave them out when the need allows. An agent that reads the flags and reasons about voltage should beat 85.6%. The 7 "need not met" cases are the same issue: a string with a failed-cell-group panel can't reach the pump's voltage.

## Case fields

```
case_id, kind ("sim" | "bench"), need {id, text, k, min_vmp_v},
panels [{id, isc_ma, voc_v, score_pct, grade, flags}],
truth {k, best_groups, best_pmax_w, worst_pmax_w, average_pmax_w, naive_pmax_w, n_groupings},
bench (bench cases only) {run_id, bench, pairing_pmax_w {A,B,C}, pairing_groups {A,B,C}, proof}
```
