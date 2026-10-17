#!/usr/bin/env python3
"""Score an advisor's answers against cases.json.

    python3 tools/eval/score.py tools/eval/answers-reference.json [--cases tools/eval/cases.json] [--json report.json]

Metrics, overall and split by case kind (sim / bench):
- agreement rate: the answer's grouping gets within 0.5% of the best grouping's power
  (exact same grouping always counts; ties between groupings are common with identical panels);
- power lost vs best: mean and worst, in percent of the best grouping's maximum power;
- gain over naive: how much better than wiring the panels as they came;
- need met: every string's estimated operating voltage (0.82 × ΣVoc) reaches the need's minimum;
- invalid: answers that don't use the right string length, repeat a panel, or name unknown panels.
For bench cases, power comes from the measured maximum power of the pairing the answer corresponds to.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import builder  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
AGREE_TOL = 0.005


def key(groups):
    return " | ".join(sorted("+".join(sorted(g)) for g in groups))


def answer_power(case, groups):
    """Power of the answered grouping: measured if it matches a bench pairing, else from the model."""
    by_id = {p["id"]: p for p in case["panels"]}
    if case["kind"] == "bench":
        for L, pg in case["bench"]["pairing_groups"].items():
            if key(pg) == key(groups):
                return case["bench"]["pairing_pmax_w"][L], True
    return builder.power([[by_id[i] for i in g] for g in groups]), False


def validate(case, groups):
    ids = [i for g in groups for i in g]
    known = {p["id"] for p in case["panels"]}
    k = case["truth"]["k"]
    if not groups:
        return "empty answer"
    if any(len(g) != k for g in groups):
        return f"strings must have {k} panels"
    if len(set(ids)) != len(ids):
        return "a panel is used twice"
    if not set(ids) <= known:
        return "unknown panel id"
    if case["kind"] == "bench" and len(ids) != 4:
        return "bench cases use all four panels"
    return None


def need_met(case, groups):
    by_id = {p["id"]: p for p in case["panels"]}
    vmin = case["need"].get("min_vmp_v", 0)
    return all(0.82 * sum(by_id[i]["voc_v"] for i in g) >= vmin for g in groups)


def score(cases, answers):
    by_case = {a["case_id"]: a for a in answers}
    rows = []
    for c in cases:
        a = by_case.get(c["case_id"])
        row = {"case_id": c["case_id"], "kind": c["kind"]}
        if a is None:
            row.update(invalid="no answer", lost_pct=100.0, agree=False, need_met=False, gain_vs_naive_pct=None)
            rows.append(row)
            continue
        err = validate(c, a["groups"])
        if err:
            row.update(invalid=err, lost_pct=100.0, agree=False, need_met=False, gain_vs_naive_pct=None)
            rows.append(row)
            continue
        p, measured = answer_power(c, a["groups"])
        best = c["truth"]["best_pmax_w"]
        lost = max(0.0, (1 - p / best) * 100) if best > 0 else 0.0
        exact = key(a["groups"]) == key(c["truth"]["best_groups"])
        row.update(invalid=None, pmax_w=round(p, 4), measured=measured, lost_pct=round(lost, 3),
                   agree=exact or lost <= AGREE_TOL * 100, exact=exact, need_met=need_met(c, a["groups"]),
                   gain_vs_naive_pct=round((p / c["truth"]["naive_pmax_w"] - 1) * 100, 2) if c["truth"]["naive_pmax_w"] else None)
        rows.append(row)
    return rows


def summarize(rows):
    def block(sub):
        n = len(sub)
        if not n:
            return None
        valid = [r for r in sub if not r["invalid"]]
        gains = [r["gain_vs_naive_pct"] for r in valid if r["gain_vs_naive_pct"] is not None]
        return {
            "cases": n,
            "invalid": n - len(valid),
            "agreement_rate_pct": round(100 * sum(1 for r in sub if r["agree"]) / n, 1),
            "exact_match_rate_pct": round(100 * sum(1 for r in valid if r.get("exact")) / n, 1),
            "power_lost_vs_best_mean_pct": round(sum(r["lost_pct"] for r in sub) / n, 3),
            "power_lost_vs_best_worst_pct": round(max(r["lost_pct"] for r in sub), 3),
            "gain_over_naive_mean_pct": round(sum(gains) / len(gains), 2) if gains else None,
            "need_met_rate_pct": round(100 * sum(1 for r in sub if r["need_met"]) / n, 1),
        }
    return {"overall": block(rows), "sim": block([r for r in rows if r["kind"] == "sim"]), "bench": block([r for r in rows if r["kind"] == "bench"])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("answers")
    ap.add_argument("--cases", default=os.path.join(HERE, "cases.json"))
    ap.add_argument("--json", help="write the full report here")
    args = ap.parse_args()
    with open(args.cases) as f:
        cases = json.load(f)["cases"]
    with open(args.answers) as f:
        data = json.load(f)
    answers = data["answers"] if isinstance(data, dict) else data
    rows = score(cases, answers)
    summary = summarize(rows)
    name = data.get("advisor", os.path.basename(args.answers)) if isinstance(data, dict) else os.path.basename(args.answers)
    print(f"Advisor: {name}")
    print(f"{'subset':8s} {'cases':>5s} {'invalid':>7s} {'agree %':>8s} {'exact %':>8s} {'lost mean %':>11s} {'lost worst %':>12s} {'vs naive %':>10s} {'need met %':>10s}")
    for sub in ("overall", "sim", "bench"):
        s = summary[sub]
        if not s:
            continue
        print(f"{sub:8s} {s['cases']:5d} {s['invalid']:7d} {s['agreement_rate_pct']:8.1f} {s['exact_match_rate_pct']:8.1f} {s['power_lost_vs_best_mean_pct']:11.3f} {s['power_lost_vs_best_worst_pct']:12.3f} {str(s['gain_over_naive_mean_pct']):>10s} {s['need_met_rate_pct']:10.1f}")
    bad = [r for r in rows if r["invalid"]]
    if bad:
        print(f"\n{len(bad)} invalid answer(s), e.g. {bad[0]['case_id']}: {bad[0]['invalid']}")
    if args.json:
        with open(args.json, "w") as f:
            json.dump({"advisor": name, "summary": summary, "rows": rows}, f, indent=1)
        print(f"report written to {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
