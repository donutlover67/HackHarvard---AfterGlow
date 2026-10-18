#!/usr/bin/env python3
"""Write site/data/second-use.json: what the Second Use page needs, from the one source (su.py) and the eval's
reports, so the page's instant check and the eval can never disagree.

    python3 tools/eval/second_use/publish.py

Reports: every report-*.json in this folder (score.py --json), listed in this order when present.
"""
import glob
import json
import os

import su

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "..", "site", "data", "second-use.json")
LABELS = {
    "naive-voc-x-isc": "The first prototype's rule (watts under Voc × Isc)",
    "tool-check_use": "The answer key: the physics tool handed the right device (100% by construction)",
}


def label(adv):
    if adv in LABELS:
        return LABELS[adv]
    if adv.startswith("chalk-gateway:"):
        _, model, mode = adv.split(":", 2)
        mode, _, where = mode.partition("@")
        if where == "chalk-sandbox":
            return f"Agent on Chalk, {model}, with the passport and physics tools running in a Chalk sandbox"
        return f"Agent on Chalk, {model}, " + {"tools": "with the passport and physics tools", "alone": "model alone, told the formula", "plain": "a plain assistant, no formula or tools"}.get(mode, mode)
    return adv


def main():
    with open(os.path.join(HERE, "cases.json")) as f:
        cases = json.load(f)
    rows = []
    for path in sorted(glob.glob(os.path.join(HERE, "report-*.json"))):
        with open(path) as f:
            r = json.load(f)
        a = r["all"]
        rows.append({"advisor": r["advisor"], "label": label(r["advisor"]), "cases": a["cases"],
                     "device_pct": a["device_understood_pct"], "verdict_pct": a["verdict_accuracy_pct"],
                     "false_yes_pct": a["false_yes_pct"], "false_no_pct": a["false_no_pct"], "alternatives_valid_pct": a["alternatives_valid_pct"]})
    order = {"naive-voc-x-isc": 0}
    rows.sort(key=lambda x: (order.get(x["advisor"], 1 if ":plain" in x["advisor"] else 2 if ":alone" in x["advisor"] else 3 if x["advisor"].endswith(":tools") else 4 if "@chalk-sandbox" in x["advisor"] else 5)))
    # recorded answers for the page to show when the live agent can't answer: real-passport cases, one yes and one no
    examples = []
    rec = os.path.join(HERE, "answers-agent-tools.json")
    if os.path.exists(rec):
        with open(rec) as f:
            ans = {x["case_id"]: x for x in json.load(f)["answers"]}
        by_id = {c["case_id"]: c for c in cases["cases"]}
        for want in (False, True):
            for cid, x in sorted(ans.items()):
                c = by_id.get(cid)
                if c and c["kind"] == "real" and x.get("feasible") is want and x.get("trace") and x["feasible"] == c["truth"]["feasible"]:
                    examples.append({"passport_id": c["panel"]["id"], "sun_hours": c["site"]["sun_hours"], "request": c["request"],
                                     **{k: x.get(k) for k in ("device_id", "hours_per_day", "feasible", "alternatives", "note", "trace")}})
                    break
    out = {
        "system_efficiency": su.SYSTEM_EFFICIENCY,
        "devices": [{"id": k, "name": n, "watts": w, "hours": h} for k, (n, w, h) in su.DEVICES.items()],
        "examples": examples,
        "eval": {"cases": len(cases["cases"]), "real_cases": sum(c["kind"] == "real" for c in cases["cases"]),
                 "feasible": sum(c["truth"]["feasible"] for c in cases["cases"]), "rows": rows},
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    print(f"wrote {os.path.normpath(OUT)}: {len(out['devices'])} devices, {len(rows)} eval rows")


if __name__ == "__main__":
    main()
