#!/usr/bin/env python3
"""Check a transcript from uno_sim: every line is valid JSON with exactly the protocol's fields, the values make
physical sense for the scenario, and the session did what the script asked. Usage: validate.py <transcript> <summary.json> [scenario]"""
import json, sys, glob, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = os.path.join(HERE, "..", "..", "..", "protocol", "samples")

def walk(o, acc):
    if isinstance(o, dict):
        for k, v in o.items(): acc.add(k); walk(v, acc)
    elif isinstance(o, list):
        for v in o: walk(v, acc)

def main():
    path, summary_path = sys.argv[1], sys.argv[2]
    scenario = sys.argv[3] if len(sys.argv) > 3 else "demo"
    summary = json.load(open(summary_path))
    sample_keys = collections.defaultdict(set)
    for f in glob.glob(os.path.join(SAMPLES, "*.jsonl")):
        for line in open(f):
            if line.strip():
                m = json.loads(line); walk(m, sample_keys[m["type"]])
    fails, notes = [], []
    msgs = []
    raw = open(path).read().splitlines()
    for i, line in enumerate(raw, 1):
        if not line.strip(): fails.append(f"line {i}: empty"); continue
        try: m = json.loads(line)
        except ValueError as e: fails.append(f"line {i}: invalid JSON ({e}): {line[:80]}"); continue
        if "nan" in line or "inf" in line: fails.append(f"line {i}: nan/inf printed")
        t = m.get("type")
        keys = set(); walk(m, keys)
        if t not in sample_keys: fails.append(f"line {i}: unknown type {t}")
        elif t == "cal":
            if not (keys <= sample_keys[t] | {"type"}): fails.append(f"line {i}: cal has unexpected keys {keys - sample_keys[t]}")
        else:
            extra, missing = keys - sample_keys[t], sample_keys[t] - keys
            if t == "search": missing -= {"A", "B", "C"}; extra -= {"A", "B", "C"}
            if extra: fails.append(f"line {i}: {t} has keys not in the protocol: {sorted(extra)}")
            if missing: fails.append(f"line {i}: {t} is missing {sorted(missing)}")
        msgs.append(m)
    by = collections.defaultdict(list)
    for m in msgs: by[m["type"]].append(m)
    notes.append("lines: " + ", ".join(f"{k} {len(v)}" for k, v in sorted(by.items())))

    # time moves forward within a boot (STATUS after the reboot restarts t)
    ts = [m["t"] for m in msgs if "t" in m]
    back = sum(1 for a, b in zip(ts, ts[1:]) if b < a)
    if back > 2: fails.append(f"t went backwards {back} times (2 reboots expected)")

    # live: pump is a boolean, power is consistent, five per second while idle
    for m in by["live"]:
        if not isinstance(m["pump"], bool): fails.append("live.pump not boolean"); break
        p = m["out"]["v"] * m["out"]["i_ma"] / 1000
        if abs(p - m["out"]["p_w"]) > 0.02: fails.append(f"live p_w {m['out']['p_w']} != v*i {p:.3f}"); break
        if len(m["panels"]) != 4 or sorted(x["id"] for x in m["panels"]) != [1, 2, 3, 4]: fails.append("live.panels malformed"); break

    model = summary["model_isc_ma"]
    grades = by["grade"]
    if not grades: fails.append("no grade message")
    for g in grades:
        ids = sorted(p["id"] for p in g["panels"])
        if ids != [1, 2, 3, 4]: fails.append("grade panels not 1..4")
        for p in g["panels"]:
            if not all(k in p for k in ("isc_ma", "isc_raw_ma", "voc_v", "score", "grade", "flags")): fails.append("grade panel missing a field")
            if scenario != "missing-out" and abs(p["isc_raw_ma"] - model[p["id"] - 1]) > 0.04 * max(model[p["id"] - 1], 1):
                fails.append(f"panel {p['id']} raw Isc {p['isc_raw_ma']} vs model {model[p['id']-1]:.1f} mA")
    g0 = grades[0] if grades else None
    if g0 and scenario in ("demo", "weak-light"):
        letters = "".join(p["grade"] for p in sorted(g0["panels"], key=lambda p: p["id"]))
        if letters != "ACAC": fails.append(f"first grade letters {letters}, expected ACAC (film on 2 and 4)")
        if g0["predicted"] != "B": fails.append(f"predicted {g0['predicted']}, expected B")
        flags = {p["id"]: p["flags"] for p in g0["panels"]}
        if "weak" not in flags[2] or "weak" not in flags[4]: fails.append("filmed panels not flagged weak")
        if any("low_voc" in f for f in flags.values()): fails.append("low_voc flagged on healthy panels")
    if g0 and scenario == "dark":
        if not all("dark" in p["flags"] for p in g0["panels"]): fails.append("dark scenario: panels not flagged dark")

    sweeps = by["sweep"]
    if len(sweeps) < 4: fails.append(f"only {len(sweeps)} sweeps")
    for s in (sweeps if scenario not in ("missing-out", "dark") else []):   # no output sensor / no light: curves are degenerate by design
        pts = s["pts"]
        if len(pts) < 10 or len(pts) > 40: fails.append(f"sweep {s['pairing']}: {len(pts)} points (want 10..40)")
        if any(b[0] <= a[0] for a, b in zip(pts, pts[1:])): fails.append(f"sweep {s['pairing']}: voltages not rising")
        if s["pmax_w"] <= 0 or s["voc_v"] <= 0 or s["isc_ma"] <= 0: fails.append(f"sweep {s['pairing']}: non-positive stats")
        if s["n"] < 40: fails.append(f"sweep {s['pairing']}: only {s['n']} raw samples")
        best = max(p[0] * p[1] / 1000 for p in pts)
        if abs(best - s["pmax_w"]) > 0.02 * max(best, 0.01): fails.append(f"sweep {s['pairing']}: pmax {s['pmax_w']} != max of points {best:.3f}")

    searches = by["search"]
    if not searches: fails.append("no search message")
    for se in searches:
        pm = se["pmax_w"]
        if set(pm) != {"A", "B", "C"}: fails.append("search pmax_w keys")
        if pm[se["best"]] < max(pm.values()) - 0.0015: fails.append("search best is not the max pmax")   # printed to 3 decimals
        if se["match"] != (se["best"] == se["predicted"]): fails.append("search match flag wrong")
        if scenario in ("demo", "weak-light") and se["best"] != "B": fails.append(f"search best {se['best']}, expected B")
        if scenario == "demo":
            gain = pm["B"] / min(pm["A"], pm["C"]) - 1
            if not 0.25 < gain < 0.6: fails.append(f"search gain {gain:.2f} outside 25..60%")

    proofs = by["proof"]
    sweep_proofs = [p for p in proofs if p["kind"] == "sweep"]
    pump_proofs = [p for p in proofs if p["kind"] == "pump"]
    full = [p for p in sweep_proofs if p["cycle"] == 20]
    if not full and scenario != "missing-out": fails.append("no complete 20-cycle sweep proof")
    else:
        last = full[-1]
        if scenario == "demo" and not 25 < last["gain_pct"] < 60: fails.append(f"proof gain {last['gain_pct']}% outside 25..60")
        if last["ci95_pct"] > 5 and scenario != "dark": fails.append(f"proof ci95 {last['ci95_pct']} too wide")
        if last["p_best_w"] <= last["p_base_w"] and scenario == "demo": fails.append("proof best not above base")
    cycles = [p["cycle"] for p in sweep_proofs]
    if cycles and cycles[:20] != list(range(1, 21)) and scenario != "missing-out": fails.append(f"proof cycles not 1..20 in order: {cycles[:22]}")
    if scenario != "missing-out" and not any(p["cycle"] == 10 for p in pump_proofs): fails.append("no complete pump proof")

    errors = [e["msg"] for e in by["error"]]
    want_errors = ["RUN needs A, B, C or BEST", "unknown command", "busy: send STOP first", "run SEARCH first"]
    if scenario in ("demo", "weak-light", "missing-out"): want_errors.append("baseline is the same as the best wiring")   # best is B (or A with no output sensor), so PROOF B is refused
    for w in want_errors:
        if not any(w in e for e in errors): fails.append(f"expected error not seen: {w}")
    if scenario == "missing-out" and not any("OUT 0x42 not found" in e for e in errors): fails.append("missing OUT sensor not reported")
    logs = [l["msg"] for l in by["log"]]
    if not any(l == "stopped" for l in logs): fails.append("STOP did not produce 'stopped'")
    if sum(1 for l in logs if l == "stopped") < 1: fails.append("stopped log missing")
    hellos = by["hello"]
    if len(hellos) < 4: fails.append(f"only {len(hellos)} hello messages (boot, STATUS, reboot, STATUS, ...)")
    cals = by["cal"]
    readings = [c for c in cals if "box" in c]
    factors = [c for c in cals if "factors" in c]
    if len(readings) != 4 and scenario != "missing-out": fails.append(f"{len(readings)} cal readings, expected 4")
    if scenario != "missing-out" and factors:
        f = factors[0]["factors"]
        expected = [1.0 / b for b in (1.0, 0.98, 1.03, 0.99)]
        mean = sum(expected) / 4; expected = [e / mean for e in expected]
        if any(abs(a - b) > 0.02 for a, b in zip(f, expected)): fails.append(f"saved factors {f} vs expected {['%.3f' % e for e in expected]}")
        after = [h for h in hellos if h["factors"] != [1, 1, 1, 1]]
        if not after: fails.append("factors did not survive the reboot (no hello with saved factors)")
    if summary["violations"]: fails.append(f"{summary['violations']} relay interlock violations")
    if summary["max_cap_v_at_cap_close"] > 0.3: fails.append(f"K_CAP closed onto {summary['max_cap_v_at_cap_close']:.2f} V")

    print(f"[{scenario}] {len(raw)} lines, virtual {summary['virtual_ms']/1000:.0f} s, {summary['sensor_reads']} sensor reads, relay switches {summary['transitions']}")
    for n in notes: print("  " + n)
    if fails:
        print(f"  FAIL ({len(fails)}):"); [print("   - " + f) for f in fails[:25]]; return 1
    print("  PASS: valid protocol, physics and session behaviour")
    return 0

if __name__ == "__main__":
    sys.exit(main())
