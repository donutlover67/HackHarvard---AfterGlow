#!/usr/bin/env python3
"""The voltage-balanced Panel Advisor: match current within a string, balance voltage across strings.
Same answer format and CLI as advisor_reference.py; the logic is identical to site/js/builder.js.

Why: sorting by current alone puts two panels with a failed cell group (low open-circuit voltage)
in one string, which then sits below the array's operating voltage and contributes almost nothing.

1. Low-voltage panels: Voc under 0.8 x the pool's median Voc (the `low_voc` flag's rule).
2. Voltage-balanced grouping: deal the low-voltage panels as evenly as possible across strings
   (one per string while there are fewer of them than strings). The healthy strings come first
   and take the strongest panels by current; the strings that hold a low-voltage panel are
   voltage-limited anyway, so they take the weakest panels.
3. Three more starting points: the same spread but with each low-voltage string taking the panels
   closest to it in current (better when the low-voltage panels are strong), sort by current, and
   the low-voltage panels packed into the last strings.
4. Polish each start: try swapping every pair of panels between two strings, keep any swap the
   panel model says gains power, repeat until none does. Keep the best result by the model.

    python3 tools/eval/advisor_voltage.py > tools/eval/answers-voltage.json
    python3 tools/eval/advisor_voltage.py --rules-only > answers.json   (step 2 alone, no model)
    python3 tools/eval/advisor_voltage.py --naive > answers.json        (the baseline to beat)
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import builder  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LOW_VOC_RATIO = 0.8


def low_voc_ids(panels):
    """Panels whose Voc is under 0.8 x the pool's median (upper median, as make_cases.py flags them)."""
    if not panels:
        return set()
    med = sorted(p["voc_v"] for p in panels)[len(panels) // 2]
    return {p["id"] for p in panels if p["voc_v"] < LOW_VOC_RATIO * med}


def by_current(panels):
    return sorted(panels, key=lambda p: -p["isc_ma"])


def balanced(panels, k):
    """Low-voltage panels spread as evenly as possible; healthy strings take the strongest panels."""
    low = low_voc_ids(panels)
    lows = by_current([p for p in panels if p["id"] in low])
    normals = by_current([p for p in panels if p["id"] not in low])
    m = len(panels) // k
    q, r = divmod(len(lows), m)
    counts = [q] * (m - r) + [q + 1] * r          # low-voltage panels per string, healthiest strings first
    groups = []
    for c in counts:
        groups.append(normals[:k - c] + lows[:c])
        normals, lows = normals[k - c:], lows[c:]
    return groups


def balanced_matched(panels, k):
    """The same spread, but each low-voltage string takes the healthy panels closest to it in current."""
    low = low_voc_ids(panels)
    lows = by_current([p for p in panels if p["id"] in low])
    normals = by_current([p for p in panels if p["id"] not in low])
    m = len(panels) // k
    q, r = divmod(len(lows), m)
    groups = []
    for c in [q + 1] * r + [q] * (m - r):          # strings holding the most low-voltage panels first
        if c == 0:
            break
        g, lows = lows[:c], lows[c:]
        target = sum(p["isc_ma"] for p in g) / c
        for _ in range(k - c):
            n = min(normals, key=lambda p: abs(p["isc_ma"] - target))   # ties: the stronger one
            normals.remove(n)
            g.append(n)
        groups.append(g)
    return builder.chunk(normals, k) + groups


def packed(panels, k):
    """Low-voltage panels together in the last strings, sacrificing as few strings as possible."""
    low = low_voc_ids(panels)
    return builder.chunk(by_current([p for p in panels if p["id"] not in low]) + by_current([p for p in panels if p["id"] in low]), k)


POLISH_LIMIT = 60   # same as site/js/builder.js: the swap search is quadratic in strings, so big pools skip it


def polish(groups, sc):
    """Pairwise swaps between strings while the model says one gains power. Returns (groups, swaps kept)."""
    groups = [list(g) for g in groups]
    if sum(len(g) for g in groups) > POLISH_LIMIT:
        return groups, 0
    best = sc.power(groups)
    kept = 0
    improved = True
    while improved:
        improved = False
        for a in range(len(groups)):
            for b in range(a + 1, len(groups)):
                for i in range(len(groups[a])):
                    for j in range(len(groups[b])):
                        groups[a][i], groups[b][j] = groups[b][j], groups[a][i]
                        p = sc.power(groups)
                        if p > best * (1 + 1e-9):
                            best, kept, improved = p, kept + 1, True
                        else:
                            groups[a][i], groups[b][j] = groups[b][j], groups[a][i]
    return groups, kept


def voltage_balanced(panels, k, rules_only=False):
    """Returns (groups, how): the grouping and which step produced it."""
    if rules_only:
        return balanced(panels, k), "voltage-balanced"
    sc = builder.StringCache(panels, k)
    starts = [("voltage-balanced", balanced(panels, k)), ("voltage-balanced, current-matched", balanced_matched(panels, k)),
              ("sort by current", builder.greedy(panels, k)), ("low-voltage packed", packed(panels, k))]
    best = None
    for how, groups in starts:
        groups, kept = polish(groups, sc)
        p = sc.power(groups)
        if best is None or p > best[0] * (1 + 1e-9):     # ties keep the earlier start
            best = (p, groups, how + (f", then {kept} swap(s)" if kept else ""))
    return best[1], best[2]


def advise(panels, need, naive=False, rules_only=False):
    """Return (groups, notes). panels: list of passports; need: dict with k."""
    k = need["k"]
    usable = [p for p in panels if "dark" not in p.get("flags", [])]
    usable = usable[: len(usable) - len(usable) % k]   # drop leftovers that can't make a full string
    if not usable:
        return [], "not enough usable panels for one string"
    if naive:
        return [[p["id"] for p in g] for g in builder.naive(usable, k)], f"{len(usable) // k} string(s) of {k}, in the order they came."
    groups, how = voltage_balanced(usable, k, rules_only)
    low = low_voc_ids(usable)
    notes = f"{len(groups)} string(s) of {k}, matched by short-circuit current ({how})."
    if low:
        per = [sum(1 for p in g if p["id"] in low) for g in groups]
        notes += f" Low open-circuit voltage, possible failed cell group: {', '.join(sorted(low))} (per string: {', '.join(map(str, per))})."
    return [[p["id"] for p in g] for g in groups], notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", default=os.path.join(HERE, "cases.json"))
    ap.add_argument("--naive", action="store_true", help="wire panels in the order they came (baseline)")
    ap.add_argument("--rules-only", action="store_true", help="the voltage-balanced rule alone, without the model's choice and swaps")
    args = ap.parse_args()
    with open(args.cases) as f:
        cases = json.load(f)["cases"]
    answers = []
    for c in cases:
        groups, notes = advise(c["panels"], c["need"], naive=args.naive, rules_only=args.rules_only)
        answers.append({"case_id": c["case_id"], "groups": groups, "notes": notes})
    name = "naive" if args.naive else "voltage-balanced-rules" if args.rules_only else "voltage-balanced"
    print(json.dumps({"advisor": name, "answers": answers}, indent=1))


if __name__ == "__main__":
    main()
