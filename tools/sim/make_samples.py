#!/usr/bin/env python3
"""Generate protocol/samples/*.jsonl from the single-diode model in pv2s2p.py.

Scenario: lamp boxes giving a clear panel Isc of 150 mA, panels 2 and 4 behind
35% film. Pairing A (the positions as plugged in) is then mismatched; B is best.
Run from the repo root: python3 tools/sim/make_samples.py
"""
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pv2s2p import PAIRINGS, config, interp, op_pump, panel_iv, pmax, v_of_i  # noqa: E402

OUT_DIR = os.path.join(HERE, "..", "..", "protocol", "samples")
ISC_CLEAR = 0.150          # A, under one lamp box
FILM = 0.35                # visible-light transmission of the film
IPH = [ISC_CLEAR, ISC_CLEAR * FILM, ISC_CLEAR, ISC_CLEAR * FILM]
SLOTS = {"A": [1, 2, 3, 4], "B": [1, 3, 2, 4], "C": [1, 4, 3, 2]}   # slot -> panel, spec §11.2
random.seed(7)


def noisy(x, pct=1.0):
    return x * (1 + random.gauss(0, pct / 100))


def r(x, nd=2):
    return round(x, nd)


def write(name, objs):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with open(path, "w") as f:
        for o in objs:
            f.write(json.dumps(o, separators=(",", ":")) + "\n")
    print(f"wrote {path} ({len(objs)} lines)")


def main():
    panels = [panel_iv(i, True) for i in IPH]
    imax = max(IPH) * 1.6
    t = 5000

    hello = {"type": "hello", "fw": "0.2", "panels": 4, "factors": [1, 1, 1, 1],
             "mode": "RUN", "pairing": "A", "pump": True}

    # GRADE: Isc from the array shorted, Voc from open circuit.
    isc = [noisy(i * 1000, 0.8) for i in IPH]
    voc = [v_of_i(p, 0.0) for p in panels]
    top = max(isc)
    grade_panels = []
    for k in range(4):
        score = isc[k] / top * 100
        g = "A" if score >= 90 else "B" if score >= 75 else "C"
        flags = []
        if score < 75:
            flags.append("weak")
        if voc[k] < 0.8 * sorted(voc)[2]:
            flags.append("low_voc")
        if isc[k] < 5:
            flags.append("dark")
        grade_panels.append({"id": k + 1, "isc_ma": r(isc[k], 1), "isc_raw_ma": r(isc[k] / 1.0, 1),
                             "voc_v": r(voc[k], 2), "score": r(score, 1), "grade": g, "flags": flags})
    order = sorted(range(4), key=lambda k: -isc[k])
    pairs = {tuple(sorted(order[:2])), tuple(sorted(order[2:]))}
    pred = next(name for name, pr in PAIRINGS.items() if {tuple(pr[0]), tuple(pr[1])} == {tuple(sorted(p)) for p in pairs})[0]
    grade = {"type": "grade", "t": t, "panels": grade_panels, "predicted": pred}

    # SWEEP per pairing
    sweeps, pm = [], {}
    for name, pr in PAIRINGS.items():
        key = name[0]
        arr = config(panels, pr, imax)
        p, vmp, imp = pmax(arr)
        vs, is_ = arr
        pts = []
        v = 0.0
        while v <= vs[-1]:
            i = max(interp(v, vs, is_), 0.0)
            pts.append([r(v, 2), r(noisy(i * 1000, 0.6), 1)])
            v += 0.2
        pts = pts[:80]
        isc_a = pts[0][1]
        voc_a = pts[-1][0]
        pm[key] = r(p, 3)
        t += 1200
        sweeps.append({"type": "sweep", "t": t, "pairing": key, "pmax_w": r(p, 3), "vmp_v": r(vmp, 2),
                       "imp_ma": r(imp * 1000, 1), "voc_v": r(voc_a, 2), "isc_ma": r(isc_a, 1),
                       "ff": r(p / (isc_a / 1000 * voc_a), 3), "n": 400 + random.randint(0, 40), "pts": pts})
    best = max(pm, key=pm.get)
    worst = min(pm, key=pm.get)
    search = {"type": "search", "t": t, "pmax_w": pm, "best": best, "predicted": pred, "match": best == pred}

    # PROOF: 20 ABBA cycles
    proofs, ratios = [], []
    for c in range(1, 21):
        pb = noisy(pm[best], 1.0)
        pw = noisy(pm[worst], 1.0)
        ratios.append(pb / pw - 1)
        mean = sum(ratios) / len(ratios)
        sd = math.sqrt(sum((x - mean) ** 2 for x in ratios) / max(len(ratios) - 1, 1)) if len(ratios) > 1 else 0.0
        ci = 1.96 * sd / math.sqrt(len(ratios))
        t += 2600
        proofs.append({"type": "proof", "t": t, "kind": "sweep", "best": best, "base": worst, "cycle": c,
                       "p_best_w": r(pb, 3), "p_base_w": r(pw, 3), "gain_pct": r(mean * 100, 1), "ci95_pct": r(ci * 100, 1)})

    # LIVE: running on the best pairing with the pump
    lives = []
    arr = config(panels, PAIRINGS[next(n for n in PAIRINGS if n[0] == best)], imax)
    p, v, i, rpm = op_pump(arr)
    for k in range(10):
        t += 200
        pv = noisy(v, 0.5)
        pi = noisy(i * 1000, 1.0)
        slot_panels = SLOTS[best]
        lives.append({"type": "live", "t": t, "mode": "RUN", "pairing": best, "pump": True,
                      "out": {"v": r(pv, 2), "i_ma": r(pi, 1), "p_w": r(pv * pi / 1000, 3)},
                      "panels": [{"id": slot_panels[s], "slot": f"S{s + 1}",
                                  "i_ma": r(noisy(IPH[slot_panels[s] - 1] * 1000 * 0.95, 1.0), 1)} for s in range(4)]})

    cal = [{"type": "cal", "box": 2, "reading_ma": 147.1},
           {"type": "cal", "factors": [1.0, 1.02, 0.99, 1.01]}]
    errors = [{"type": "error", "msg": "INA219 0x44 on Wire not found"},
              {"type": "error", "msg": "sweep timed out after 4000 ms"}]
    logs = [{"type": "log", "msg": "sweep A: 412 samples in 0.81 s"}]

    write("hello.jsonl", [hello])
    write("grade.jsonl", [grade])
    write("sweep.jsonl", sweeps)
    write("search.jsonl", [search])
    write("proof.jsonl", proofs)
    write("live.jsonl", lives)
    write("cal.jsonl", cal)
    write("error.jsonl", errors)
    write("log.jsonl", logs)
    write("demo-sequence.jsonl", [hello] + lives[:3] + [grade] + sweeps + [search] + proofs + lives)
    print(f"best={best} predicted={pred} pmax={pm} gain vs worst={(pm[best]/pm[worst]-1)*100:.1f}%")


if __name__ == "__main__":
    main()
