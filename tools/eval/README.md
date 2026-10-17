# Panel Advisor eval harness

Plain Python 3, no dependencies. Whoever builds the Chalk agent calls these scripts; nothing here depends on Chalk.

The task the advisor is scored on: given a batch of panel passports (`isc_ma`, `voc_v`, score, grade, flags) and a buyer's need, return how to wire them into series strings. The truth is exact: for simulated batches every grouping is enumerated with the same single-diode model the bench dashboard and the site use; for bench cases the truth is the wiring the ESP32 bench measured as best.

```bash
python3 tools/eval/make_cases.py                       # writes tools/eval/cases.json (200 simulated + bench runs)
python3 tools/eval/advisor_reference.py > tools/eval/answers-reference.json
python3 tools/eval/advisor_reference.py --naive > tools/eval/answers-naive.json
python3 tools/eval/score.py tools/eval/answers-reference.json --json tools/eval/report-reference.json
python3 tools/eval/advisor_voltage.py > tools/eval/answers-voltage.json      # about 30 s
python3 tools/eval/score.py tools/eval/answers-voltage.json --json tools/eval/report-voltage.json
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

`advisor_reference.py` is the first deterministic advisor (sort by current, cut into strings). `advisor_voltage.py` is the voltage-balanced one, the same logic as the site's Array Builder: it matches current within a string and balances voltage across strings (below). Both take the same flags and write the same answer format; whichever one the agent calls as a tool, its score is the bar. `--naive` is the baseline the agent must beat.

## Scores so far (seed 7, 200 simulated + 1 bench case)

| Advisor | agree | exact | lost vs best, mean | lost, worst | gain over naive | need met |
|---|---|---|---|---|---|---|
| voltage-balanced (`advisor_voltage.py`) | 99.0% | 98.5% | 0.01% | 1.0% | +5.4% | 98.5% |
| voltage-balanced rule alone (`--rules-only`, no model) | 89.6% | 72.1% | 0.22% | 4.6% | +5.2% | 97.5% |
| reference (sort by current) | 85.6% | 67.2% | 0.63% | 20.8% | +4.7% | 96.5% |
| naive (as they came) | 26.4% | 20.4% | 4.80% | 27.4% | 0 | 97.5% |

All four have 0 invalid answers and agree with the one bench case (wiring B).

Where the reference loses: on batches with no `low_voc` panel it agrees with brute force 98.5% of the time. On the 67 batches that contain a panel with a failed cell group it agrees only 40 times. Sorting by current puts two low-voltage panels in the same string, and that string then sits far below the array's operating voltage and contributes almost nothing (worst case: 20.8% lost); 7 of those batches also miss the need.

What `advisor_voltage.py` does about it: a panel is low-voltage when its Voc is under 0.8 × the pool's median (the `low_voc` rule). (1) Spread the low-voltage panels as evenly as possible, one per string while there are fewer of them than strings; the healthy strings take the strongest panels by current and the voltage-limited strings take the weakest. (2) Three more starting points: the same spread with each low-voltage string taking the panels closest to it in current (better when the failed-cell-group panel is a strong one), plain sort by current, and the low-voltage panels packed into the last strings. (3) From each start, swap pairs of panels between strings while the panel model says the swap gains power; keep the best result. Step 1 alone (`--rules-only`) lifts the `low_voc` batches from 40 to 48 of 67 and the worst loss from 20.8% to 4.6%. With the model's swaps it agrees on 65 of 67 `low_voc` batches and all 134 others. The two it misses (sim-0084, sim-0182) lose 0.9% and 1.0%: one swap at a time can't reach the best grouping. On a held-out set of 150 brute-forced batches drawn differently (20% failed-cell-group panels, more weak panels) it agreed 100% against 71.3% for sort by current.

Leaving panels out doesn't help here: in the model a string can't pull power out of the others, so every panel left out costs power, and the 3 cases still missing the need (sim-0018, sim-0098, sim-0106) are ones where the best grouping misses it too; dropping their short strings would cost 10–27% of the power. Because the swaps use the same model as the brute-force truth, the simulated score mostly measures search, not physics: the bench case is the real check, and the bench measures every wiring for that reason. Where an agent can still add something: explaining the grouping from the flags, and the cases where the need, not maximum power, should decide.

## Case fields

```
case_id, kind ("sim" | "bench"), need {id, text, k, min_vmp_v},
panels [{id, isc_ma, voc_v, score_pct, grade, flags}],
truth {k, best_groups, best_pmax_w, worst_pmax_w, average_pmax_w, naive_pmax_w, n_groupings},
bench (bench cases only) {run_id, bench, pairing_pmax_w {A,B,C}, pairing_groups {A,B,C}, proof}
```
