#!/usr/bin/env python3
"""Two non-agent baselines for the Second Use eval. Both are handed the right device and hours (no reading of the
request), so they measure the physics alone:

    python3 tools/eval/second_use/baselines.py --naive > answers-naive.json    # the first prototype's rule: watts <= Voc x Isc
    python3 tools/eval/second_use/baselines.py --tool  > answers-tool.json     # su.check_use, the agent's tool (an upper bound)
"""
import argparse
import json
import os

import su

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--naive", action="store_true")
    g.add_argument("--tool", action="store_true")
    a = ap.parse_args()
    with open(os.path.join(HERE, "cases.json")) as f:
        cases = json.load(f)["cases"]
    out = []
    for c in cases:
        p, t, sun = c["panel"], c["truth"], c["site"]["sun_hours"]
        if a.naive:
            feas = su.naive_feasible(p["isc_ma"], p["voc_v"], t["device_id"])
            alts = [d for d in su.DEVICES if d != t["device_id"] and su.naive_feasible(p["isc_ma"], p["voc_v"], d)]
        else:
            feas = su.check_use(p["isc_ma"], p["voc_v"], sun, t["device_id"], t["hours_per_day"])["feasible"]
            alts = [d for d in su.DEVICES if d != t["device_id"] and su.check_use(p["isc_ma"], p["voc_v"], sun, d)["feasible"]]
        out.append({"case_id": c["case_id"], "device_id": t["device_id"], "feasible": feas, "alternatives": alts})
    print(json.dumps({"advisor": "naive-voc-x-isc" if a.naive else "tool-check_use", "answers": out}))


if __name__ == "__main__":
    main()
