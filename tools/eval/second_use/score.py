#!/usr/bin/env python3
"""Score a Second Use advisor's answers against cases.json.

    python3 tools/eval/second_use/score.py answers.json [--json report.json]

Answer format: {"advisor": "...", "answers": [{"case_id", "device_id", "feasible": true|false,
"alternatives": [device_id, ...], "note": "..."}]}

Metrics, overall and split by kind (real / sim):
- device understood: the request read as the right device;
- verdict accuracy: feasible / not feasible matches the truth;
- false yes: said it can when it can't, as a share of the cases where it can't (the costly mistake: a customer buys
  a panel that won't run their device);
- false no: said it can't when it can, as a share of the cases where it can (a sale lost);
- alternatives valid: of the alternatives suggested, the share this panel can really run at their typical hours
  (checked with su.check_use, so the same device at its typical hours counts when the request asked for more);
- missing answers count as wrong.
"""
import argparse
import json
import os

import su

HERE = os.path.dirname(os.path.abspath(__file__))


def score(cases, answers):
    by_id = {a.get("case_id"): a for a in answers}
    rows = []
    for c in cases:
        a = by_id.get(c["case_id"]) or {}
        t = c["truth"]
        said = a.get("feasible")
        alts = [x for x in (a.get("alternatives") or []) if isinstance(x, str)]
        rows.append({
            "kind": c["kind"], "answered": bool(a), "device_ok": a.get("device_id") == t["device_id"],
            "verdict_ok": said is t["feasible"], "truth": t["feasible"], "said": said,
            # a suggestion is valid when the panel can run it at the device's typical hours (the same device at fewer
            # hours than asked counts: "run it 6 hours, not 24" is a good answer)
            "alts": len(alts), "alts_ok": sum(1 for x in alts if x in su.DEVICES and su.check_use(c["panel"]["isc_ma"], c["panel"]["voc_v"], c["site"]["sun_hours"], x)["feasible"]),
        })
    return rows


def summarize(rows):
    def block(sub):
        n = len(sub)
        no = [r for r in sub if not r["truth"]]
        yes = [r for r in sub if r["truth"]]
        alts = sum(r["alts"] for r in sub)
        return {
            "cases": n,
            "answered_pct": round(100 * sum(r["answered"] for r in sub) / n, 1) if n else None,
            "device_understood_pct": round(100 * sum(r["device_ok"] for r in sub) / n, 1) if n else None,
            "verdict_accuracy_pct": round(100 * sum(r["verdict_ok"] for r in sub) / n, 1) if n else None,
            "false_yes_pct": round(100 * sum(r["said"] is True for r in no) / len(no), 1) if no else None,
            "false_no_pct": round(100 * sum(r["said"] is False for r in yes) / len(yes), 1) if yes else None,
            "alternatives_valid_pct": round(100 * sum(r["alts_ok"] for r in sub) / alts, 1) if alts else None,
            "alternatives_given": alts,
        }
    return {"all": block(rows), "real": block([r for r in rows if r["kind"] == "real"]), "sim": block([r for r in rows if r["kind"] == "sim"])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("answers")
    ap.add_argument("--cases", default=os.path.join(HERE, "cases.json"))
    ap.add_argument("--json")
    a = ap.parse_args()
    with open(a.cases) as f:
        cases = json.load(f)["cases"]
    with open(a.answers) as f:
        ans = json.load(f)
    if ans.get("cases_run") and ans["cases_run"] < len(cases):   # a --limit run: score the cases it was given
        ran = {x.get("case_id") for x in ans.get("answers", [])}
        cases = [c for c in cases if c["case_id"] in ran]
    rep = {"advisor": ans.get("advisor", "?"), **summarize(score(cases, ans.get("answers", [])))}
    print(f"advisor: {rep['advisor']}")
    for k in ("all", "real", "sim"):
        b = rep[k]
        if not b["cases"]:
            continue
        print(f"  {k:4} n={b['cases']:3}  device {b['device_understood_pct']}%  verdict {b['verdict_accuracy_pct']}%  "
              f"false-yes {b['false_yes_pct']}%  false-no {b['false_no_pct']}%  alternatives valid {b['alternatives_valid_pct']}% of {b['alternatives_given']}")
    if a.json:
        with open(a.json, "w") as f:
            json.dump(rep, f, indent=1)


if __name__ == "__main__":
    main()
