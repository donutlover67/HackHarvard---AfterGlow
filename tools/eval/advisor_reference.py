#!/usr/bin/env python3
"""The deterministic Panel Advisor: sort by current, cut into strings. Answers every case in
cases.json in the harness's answer format. The agent should call this as a tool and explain
the result; anything it does on its own is scored against the same truth.

    python3 tools/eval/advisor_reference.py > tools/eval/answers-reference.json
    python3 tools/eval/advisor_reference.py --naive > tools/eval/answers-naive.json   (the baseline to beat)
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import builder  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def advise(panels, need, naive=False):
    """Return (groups, notes). panels: list of passports; need: dict with k."""
    k = need["k"]
    usable = [p for p in panels if "dark" not in p.get("flags", [])]
    usable = usable[: len(usable) - len(usable) % k]   # drop leftovers that can't make a full string
    groups = builder.naive(usable, k) if naive else builder.greedy(usable, k)
    notes = f"{len(groups)} string(s) of {k}, matched by short-circuit current; each string carries its weakest panel's current."
    return [[p["id"] for p in g] for g in groups], notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", default=os.path.join(HERE, "cases.json"))
    ap.add_argument("--naive", action="store_true", help="wire panels in the order they came (baseline)")
    args = ap.parse_args()
    with open(args.cases) as f:
        cases = json.load(f)["cases"]
    answers = []
    for c in cases:
        groups, notes = advise(c["panels"], c["need"], naive=args.naive)
        answers.append({"case_id": c["case_id"], "groups": groups, "notes": notes})
    print(json.dumps({"advisor": "naive" if args.naive else "reference-greedy", "answers": answers}, indent=1))


if __name__ == "__main__":
    main()
