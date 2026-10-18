#!/usr/bin/env python3
"""Build tools/eval/second_use/cases.json: the Second Use eval set.

Each case: one panel passport, the site's peak sun hours, and a buyer's request in plain words (which device, how
many hours a day). Truth: the device, the hours, and whether the panel can run it (su.check_use), plus every device
it could run instead at that device's typical hours.

Panels come from two places: real passports (site/data/runs/*.json, tools/eval/runs/*.json, site/data/sample-run.json)
and simulated ones drawn like the wiring eval's batches. Run from anywhere:
    python3 tools/eval/second_use/make_cases.py [--sim 200] [--seed 11]
"""
import argparse
import glob
import json
import os
import random

import su

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
OUT = os.path.join(HERE, "cases.json")

# how people ask: {name} is said in their words, {h} the hours
PHRASES = {
    "ble_beacon": ["Keep a Bluetooth beacon broadcasting around the clock.", "Can it run a BLE tracker beacon 24/7 at our shed?"],
    "garden_marker": ["Light a small LED garden marker for {h} hours after dark.", "I want a tiny marker light by the gate on for {h} hours a night."],
    "soil_sensor": ["I want a soil moisture sensor in my garden that reports all day and night.", "Can it keep a LoRa soil probe running around the clock?"],
    "epaper_sign": ["Could this run an e-paper sign at a bus stop, on 24 hours a day?", "We need a low-power e-ink timetable display that never turns off."],
    "trail_camera": ["Power a trail camera that sits on standby all day and night.", "Keep a wildlife camera armed 24/7."],
    "led_path_light": ["Light an LED path light for {h} hours every evening.", "I'd like a garden path lamp on for {h} hours a night."],
    "weather_station": ["Run a Wi-Fi weather station continuously.", "Keep a small weather station online 24 hours a day."],
    "small_fan": ["Run a small 5 V fan for {h} hours in the afternoon.", "Cool a chicken coop with a little USB fan, {h} hours a day."],
    "pi_server": ["Keep a Raspberry Pi camera server running all the time.", "Can it power a Raspberry Pi that records video 24/7?"],
    "fountain_pump": ["Run a 12 V fountain pump for {h} hours a day.", "Power a small pond pump {h} hours daily."],
    "phone_charging": ["Charge a phone for {h} hours each day.", "I want to top up my phone, about {h} hours of charging a day."],
    "clothes_dryer": ["Run an electric clothes dryer for {h} hour(s) a day.", "Could it dry our laundry in an electric dryer, {h} hour(s) daily?"],
}
SUN = [2.5, 3.5, 4.5, 5.5]   # peak sun hours a day: a cloudy northern winter to a sunny summer


def real_passports():
    files = sorted(glob.glob(os.path.join(ROOT, "site", "data", "runs", "*.json"))) + sorted(glob.glob(os.path.join(HERE, "..", "runs", "*.json"))) + [os.path.join(ROOT, "site", "data", "sample-run.json")]
    out, seen = [], set()
    for path in files:
        if not os.path.exists(path) or path.endswith("index.json"):
            continue
        with open(path) as f:
            run = json.load(f)
        for p in run.get("passports", []):
            pid = p.get("passport_id")
            if pid and pid not in seen and float(p.get("isc_ma") or 0) > 0 and float(p.get("voc_v") or 0) > 0:
                seen.add(pid)
                out.append({"id": pid, "isc_ma": p["isc_ma"], "voc_v": p["voc_v"], "grade": p.get("grade"), "flags": p.get("flags", []),
                            "source": run.get("link", "run"), "run_id": run.get("run_id")})
    return out


def sim_passport(rng, idx):
    r = rng.random()
    isc = 150 * (rng.uniform(0.92, 1.0) if r < 0.35 else rng.uniform(0.7, 0.92) if r < 0.65 else rng.uniform(0.25, 0.7))
    voc = rng.uniform(6.5, 6.9)
    flags = []
    if rng.random() < 0.08:
        voc *= 2 / 3
        flags.append("low_voc")
    score = isc / 150 * 100
    grade = "A" if score >= 90 else "B" if score >= 75 else "C"
    if score < 75:
        flags.append("weak")
    return {"id": f"SU-{idx:04d}", "isc_ma": round(isc, 1), "voc_v": round(voc, 2), "grade": grade, "flags": flags, "source": "sim"}


HOUR_CHOICES = [1, 2, 3, 4, 6, 8, 12, 24]


def make_case(rng, cid, panel, kind):
    # half the cases can be run and half can't; most sit near the line (the panel gives a third to three times what
    # the device needs), where reading the request and the physics both matter; a few are obvious either way
    sun = rng.choice(SUN)
    want = rng.random() < 0.5
    combos = []
    for d, (name, watts, typical) in su.DEVICES.items():
        for h in sorted({typical, *[x for x in HOUR_CHOICES if x <= 24]}):
            if typical == 24 and h != 24:
                continue   # always-on devices are asked for all day
            t = su.check_use(panel["isc_ma"], panel["voc_v"], sun, d, h)
            combos.append((d, h, t))
    pool = [c for c in combos if c[2]["feasible"] == want] or combos
    # the device first, evenly among those that can give the wanted answer, then its hours, near the line if possible
    device = rng.choice(sorted({c[0] for c in pool}))
    mine = [c for c in pool if c[0] == device]
    near = [c for c in mine if 1 / 3 <= c[2]["margin"] <= 3]
    device, hours, truth = rng.choice(near if near and rng.random() < 0.85 else mine)
    text = rng.choice(PHRASES[device]).format(h=f"{hours:g}")
    alts = [d for d in su.DEVICES if d != device and su.check_use(panel["isc_ma"], panel["voc_v"], sun, d)["feasible"]]
    return {
        "case_id": cid, "kind": kind,
        "panel": {k: panel[k] for k in ("id", "isc_ma", "voc_v", "grade", "flags")},
        "site": {"sun_hours": sun},
        "request": text,
        "truth": {"device_id": device, "hours_per_day": hours, "feasible": truth["feasible"], "margin": truth["margin"],
                  "pmax_w": truth["pmax_w"], "usable_wh_per_day": truth["usable_wh_per_day"], "need_wh_per_day": truth["need_wh_per_day"],
                  "feasible_alternatives": alts},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sim", type=int, default=200)
    ap.add_argument("--seed", type=int, default=11)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    cases = []
    for i, p in enumerate(real_passports()):
        for j in range(3):   # each real passport asked three different things
            cases.append(make_case(rng, f"real-{i + 1:03d}-{j + 1}", p, "real"))
    for i in range(a.sim):
        cases.append(make_case(rng, f"sim-{i + 1:04d}", sim_passport(rng, i + 1), "sim"))
    meta = {"system_efficiency": su.SYSTEM_EFFICIENCY, "devices": {k: {"name": n, "watts": w, "typical_hours": h} for k, (n, w, h) in su.DEVICES.items()},
            "seed": a.seed, "note": "Device draws are illustrative. Truth: su.check_use (single-diode model, tools/eval/model.py)."}
    with open(OUT, "w") as f:
        json.dump({"meta": meta, "cases": cases}, f, indent=1)
    feas = sum(c["truth"]["feasible"] for c in cases)
    print(f"wrote {OUT}: {len(cases)} cases ({sum(c['kind'] == 'real' for c in cases)} on real passports), {feas} feasible, {len(cases) - feas} not")


if __name__ == "__main__":
    main()
