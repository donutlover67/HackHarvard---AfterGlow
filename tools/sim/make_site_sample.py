#!/usr/bin/env python3
"""Assemble site/data/sample-run.json from protocol/samples/, in the dashboard's export format.
Run after make_samples.py, from the repo root: python3 tools/sim/make_site_sample.py"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SAMPLES = os.path.join(ROOT, "protocol", "samples")
OUT = os.path.join(ROOT, "site", "data", "sample-run.json")
RUN_ID = "run-20261016-sample"
MEASURED_AT = "2026-10-16T18:30:00-04:00"
BENCH = "sample data from the single-diode model: lamp boxes at 40% of sun, 35% film on panels 2 and 4"


def read(name):
    with open(os.path.join(SAMPLES, name)) as f:
        return [json.loads(line) for line in f if line.strip()]


def main():
    hello = read("hello.jsonl")[0]
    grade = read("grade.jsonl")[0]
    search = read("search.jsonl")[0]
    proof = read("proof.jsonl")[-1]
    sweeps = {s["pairing"]: s for s in read("sweep.jsonl")}
    strongest = max(p["isc_ma"] for p in grade["panels"])
    passports = []
    for p in grade["panels"]:
        passports.append({
            "passport_id": f"SS-{p['id']:04d}",
            "panel_label": f"P{p['id']}",
            "measured_at": MEASURED_AT,
            "run_id": RUN_ID,
            "isc_ma": p["isc_ma"], "isc_raw_ma": p["isc_raw_ma"], "voc_v": p["voc_v"],
            "score_pct": p["score"], "grade": p["grade"], "flags": p["flags"],
            "reference": {"kind": "relative", "strongest_isc_ma": strongest, "box_factor": hello["factors"][p["id"] - 1], "light": BENCH},
            "rated": {"isc_ma": None, "voc_v": None, "model": None},
            "verified": {"best_pairing": search["best"], "pmax_w": search["pmax_w"]},
        })
    run = {
        "run_id": RUN_ID, "measured_at": MEASURED_AT, "bench": BENCH, "link": "sample",
        "factors": hello["factors"], "panels": grade["panels"], "predicted": grade["predicted"],
        "search": search, "proof": proof, "sweeps": sweeps, "passports": passports,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(run, f, indent=1)
    print(f"wrote {OUT}: {len(passports)} passports, best {search['best']}, gain {proof['gain_pct']}% ± {proof['ci95_pct']}")


if __name__ == "__main__":
    main()
