#!/usr/bin/env python3
"""Build tools/eval/cases.json: the Panel Advisor eval set.

Two kinds of case:
- sim:   random batches of passports from the single-diode model, ground truth by brute force
         over every grouping (so the truth is exact for the model);
- bench: real runs exported by the dashboard (tools/eval/runs/*.json and site/data/sample-run.json),
         ground truth = the wiring the bench measured as best.

Each case gives the advisor the passports and a need; the answer is a grouping. Run from anywhere:
    python3 tools/eval/make_cases.py [--sim 200] [--seed 7]
"""
import argparse
import glob
import json
import os
import sys
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import builder  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
OUT = os.path.join(HERE, "cases.json")
PAIR_SLOTS = {"A": [[1, 2], [3, 4]], "B": [[1, 3], [2, 4]], "C": [[1, 4], [2, 3]]}

# needs: what the buyer wants, and the string length that implies for 6 V panels
NEEDS = [
    {"id": "pump_12v", "text": "Run a 12 V DC water pump (2–5 W) straight from the panels.", "k": 2, "min_vmp_v": 9.0},
    {"id": "shed_light_18v", "text": "Charge an 18 V tool battery through its charger.", "k": 3, "min_vmp_v": 14.0},
    {"id": "fence_24v", "text": "Feed a 24 V electric-fence energizer.", "k": 4, "min_vmp_v": 19.0},
]


def grade_for(score):
    return "A" if score >= 90 else "B" if score >= 75 else "C"


def sim_case(rng, idx):
    need = rng.choice(NEEDS)
    k = need["k"]
    n = rng.choice([x for x in (4, 6, 8, 9) if x % k == 0 and x <= 9] or [k * 2])
    # a mixed second-life batch: most panels near full output, some aged, one or two poor
    panels = []
    for i in range(n):
        r = rng.random()
        isc = 150 * (rng.uniform(0.92, 1.0) if r < 0.5 else rng.uniform(0.7, 0.92) if r < 0.85 else rng.uniform(0.3, 0.7))
        voc = rng.uniform(6.5, 6.9)
        if rng.random() < 0.06:
            voc *= 2 / 3   # a failed cell group
        panels.append({"id": f"SIM-{idx:04d}-{i + 1}", "isc_ma": round(isc, 1), "voc_v": round(voc, 2)})
    top = max(p["isc_ma"] for p in panels)
    med = sorted(p["voc_v"] for p in panels)[len(panels) // 2]
    for p in panels:
        p["score_pct"] = round(p["isc_ma"] / top * 100, 1)
        p["grade"] = grade_for(p["score_pct"])
        p["flags"] = [f for f, on in (("weak", p["score_pct"] < 75), ("low_voc", p["voc_v"] < 0.8 * med)) if on]
    res = builder.analyze(panels, k)
    b = res["brute"]
    return {
        "case_id": f"sim-{idx:04d}", "kind": "sim", "need": need, "panels": panels,
        "truth": {
            "k": k,
            "best_groups": [[p["id"] for p in g] for g in b["best"]["groups"]],
            "best_pmax_w": round(b["best"]["pmax"], 4),
            "worst_pmax_w": round(b["worst"]["pmax"], 4),
            "average_pmax_w": round(b["average"], 4),
            "naive_pmax_w": round(res["naive"]["pmax"], 4),
            "n_groupings": b["count"],
        },
    }


def bench_cases():
    files = sorted(glob.glob(os.path.join(HERE, "runs", "*.json"))) + [os.path.join(ROOT, "site", "data", "sample-run.json")]
    cases = []
    for path in files:
        if not os.path.exists(path):
            continue
        with open(path) as f:
            run = json.load(f)
        if not run.get("search") or len(run.get("passports", [])) != 4:
            continue
        by_pos = {int(p["panel_label"].lstrip("P")): p for p in run["passports"]}
        panels = [{"id": p["passport_id"], "isc_ma": p["isc_ma"], "voc_v": p["voc_v"], "score_pct": p["score_pct"],
                   "grade": p["grade"], "flags": p.get("flags", [])} for _, p in sorted(by_pos.items())]
        best = run["search"]["best"]
        pm = run["search"]["pmax_w"]
        cases.append({
            "case_id": f"bench-{run['run_id']}", "kind": "bench", "need": NEEDS[0], "panels": panels,
            "bench": {"run_id": run["run_id"], "bench": run.get("bench", ""), "pairing_pmax_w": pm,
                      "pairing_groups": {L: [[by_pos[a]["passport_id"], by_pos[b]["passport_id"]] for a, b in pairs] for L, pairs in PAIR_SLOTS.items()},
                      "proof": run.get("proof")},
            "truth": {
                "k": 2,
                "best_groups": [[by_pos[a]["passport_id"], by_pos[b]["passport_id"]] for a, b in PAIR_SLOTS[best]],
                "best_pmax_w": pm[best], "worst_pmax_w": min(pm.values()),
                "average_pmax_w": round(sum(pm.values()) / 3, 4), "naive_pmax_w": pm["A"], "n_groupings": 3,
                "measured": True,
            },
        })
    return cases


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sim", type=int, default=200)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    cases = [sim_case(rng, i + 1) for i in range(args.sim)] + bench_cases()
    with open(OUT, "w") as f:
        json.dump({"version": 1, "seed": args.seed, "answer_format": {"case_id": "sim-0001", "groups": [["id", "id"]], "notes": "optional"},
                   "cases": cases}, f, indent=1)
    n_bench = sum(1 for c in cases if c["kind"] == "bench")
    print(f"wrote {OUT}: {len(cases)} cases ({len(cases) - n_bench} simulated, {n_bench} bench)")


if __name__ == "__main__":
    main()
