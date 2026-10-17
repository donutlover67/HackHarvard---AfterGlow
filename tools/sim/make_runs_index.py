#!/usr/bin/env python3
"""Write site/data/runs/index.json: the list of run files the site loads when there is no upload API.

    python3 tools/sim/make_runs_index.py

On the demo laptop tools/serve.py answers GET /api/runs, so the site never reads this file there.
On GitHub Pages there is no API: the site fetches data/runs/index.json and loads every file it lists.
Run this after adding or deleting a run in site/data/runs/, check the list it prints, then commit the
folder (see docs/website-plan.md, Hosting). Plain Python, no dependencies.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RUNS_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "site", "data", "runs"))
INDEX = os.path.join(RUNS_DIR, "index.json")


def main():
    os.makedirs(RUNS_DIR, exist_ok=True)
    files, skipped = [], 0
    for name in sorted(os.listdir(RUNS_DIR)):
        if not name.endswith(".json") or name == "index.json":
            continue
        try:
            with open(os.path.join(RUNS_DIR, name)) as f:
                run = json.load(f)
            if not isinstance(run, dict) or not isinstance(run.get("run_id"), str) or not isinstance(run.get("passports"), list):
                raise ValueError("not a run export: no run_id string or no passports array")
        except (OSError, ValueError) as exc:
            print(f"skipping {name}: {exc}", file=sys.stderr)
            skipped += 1
            continue
        files.append(name)
        ids = ", ".join(str(p.get("passport_id", "?")) for p in run["passports"] if isinstance(p, dict))
        print(f"  {name}: {len(run['passports'])} passports ({ids}), measured {run.get('measured_at', 'unknown')}")
    with open(INDEX, "w") as f:
        json.dump({"runs": files}, f, indent=1)
        f.write("\n")
    tail = f", {skipped} skipped (fix or delete them, then rerun)" if skipped else ""
    print(f"wrote {os.path.relpath(INDEX)}: {len(files)} run file{'' if len(files) == 1 else 's'}{tail}")
    return 1 if skipped else 0


if __name__ == "__main__":
    sys.exit(main())
