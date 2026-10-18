#!/usr/bin/env python3
"""The Afterglow Second Use agent, on Chalk's Model Gateway, run against the Second Use eval.

The agent reads a buyer's request in plain words, looks up the panel's measured passport, and decides whether that
used panel can power the device at their site, suggesting what else it could run if not. Two modes, so the eval
can show what the data and the tools are worth:

    --mode tools     the model calls get_passport and check_use (the physics in su.py) through tool calls
    --mode alone     the model gets the same passport numbers, device list and formula in the prompt, no tools
    --mode plain     a plain assistant: the passport numbers and the device list, no formula and no tools

    python3 tools/eval/second_use/agent.py --mode tools --model <id> --out answers-agent-tools.json [--limit 20]
    ~/.cache/afterglow-chalk/bin/python tools/eval/second_use/agent.py --mode tools --tools-in chalk ...   # tools in a Chalk sandbox
    python3 tools/eval/second_use/agent.py --list-models
    python3 tools/eval/second_use/score.py answers-agent-tools.json

The key is read from ~/.config/afterglow/chalk_router_key (or CHALK_ROUTER_API_KEY) and never printed.
Gateway: CHALK_ROUTER_URL (default https://api.chalk.ai/v1/router), CHALK_ENV_ID (default clkdcdaf84e).
Plain Python, no packages: the gateway speaks OpenAI's API; this uses /responses, where the model takes tools.
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

import su

HERE = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.expanduser("~/.config/afterglow/chalk_router_key")
BASE = os.environ.get("CHALK_ROUTER_URL", "https://api.chalk.ai/v1/router").rstrip("/")
ENV_ID = os.environ.get("CHALK_ENV_ID", "clkdcdaf84e")


def key():
    k = os.environ.get("CHALK_ROUTER_API_KEY")
    if not k and os.path.exists(KEY_FILE):
        with open(KEY_FILE) as f:
            k = f.read().strip()
    if not k:
        raise RuntimeError(f"no key: put it in {KEY_FILE} or CHALK_ROUTER_API_KEY")
    return k


def call(path, body=None, tries=4):
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {key()}", "X-Chalk-Env-Id": ENV_ID, "Content-Type": "application/json"},
                                 method="GET" if body is None else "POST")
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:300]
            # a spent budget won't come back in seconds: fail at once so the page can fall back
            if e.code in (429, 500, 502, 503, 504) and "budget" not in msg and attempt < tries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise RuntimeError(f"gateway {e.code}: {msg}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < tries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise RuntimeError(f"gateway unreachable: {e}") from None


DEVICE_LINES = "\n".join(f"- {d}: {n}, about {w:g} W while in use, typically {h:g} h a day" for d, (n, w, h) in su.DEVICES.items())
ANSWER_SPEC = ('Finish with one JSON object and nothing after it: {"device_id": "<id from the list>", "hours_per_day": <number>, '
               '"feasible": true|false, "alternatives": ["<device ids this panel CAN run at their typical hours>"], "note": "<one or two sentences for the buyer>"}')
SYSTEM_TOOLS = f"""You are Afterglow's Second Use advisor. Afterglow tests used solar panels and gives each one a passport of measured data.
A buyer asks whether a used panel can power something. Read the request, pick the device from the list, and the hours a day they want.
Then use the tools: get_passport for the panel's measured data, check_use to compute whether it can run that device at their site.
Never guess the physics: only check_use decides feasible. If it can't, call check_use on other devices and suggest only ones it says are feasible.
Devices:
{DEVICE_LINES}
{ANSWER_SPEC}"""
SYSTEM_ALONE = f"""You are Afterglow's Second Use advisor. Afterglow tests used solar panels and gives each one a passport of measured data.
A buyer asks whether a used panel can power something. Read the request, pick the device from the list, and the hours a day they want.
Decide from the passport: the panel's maximum power is below Voc x Isc (a single-diode panel's fill factor is roughly 0.7-0.8).
Usable energy a day = maximum power x peak sun hours x {su.SYSTEM_EFFICIENCY}. Need = device watts x hours a day. Feasible when usable >= need.
Suggest only alternatives the panel can run at their typical hours.
Devices:
{DEVICE_LINES}
{ANSWER_SPEC}"""

SYSTEM_PLAIN = f"""You are a helpful assistant for a used-solar-panel shop. A buyer asks whether a used panel can power something.
Read the request, pick the device from the list and the hours a day they want, and decide from the panel's numbers whether it can.
Suggest alternatives it can run.
Devices:
{DEVICE_LINES}
{ANSWER_SPEC}"""

TOOLS = [
    {"type": "function", "name": "get_passport", "description": "The panel's passport: measured short-circuit current (mA), open-circuit voltage (V), grade and flags.",
     "parameters": {"type": "object", "properties": {"passport_id": {"type": "string"}}, "required": ["passport_id"], "additionalProperties": False}, "strict": True},
    {"type": "function", "name": "check_use", "description": "Whether this panel can run a device for some hours a day at the buyer's site: its maximum power from the panel model, usable watt-hours a day, the device's need, feasible, margin, and the most hours a day it could run it.",
     "parameters": {"type": "object", "properties": {"passport_id": {"type": "string"}, "device_id": {"type": "string", "enum": sorted(su.DEVICES)},
                                                     "hours_per_day": {"type": "number"}}, "required": ["passport_id", "device_id", "hours_per_day"], "additionalProperties": False}, "strict": True},
]


def parse_answer(text):
    m = re.findall(r"\{[^{}]*\}", text or "", re.S)
    for chunk in reversed(m):
        try:
            a = json.loads(chunk)
            if "feasible" in a:
                return a
        except json.JSONDecodeError:
            continue
    return None


def run_case(c, model, mode, tools=None, log=None):
    """tools: a chalk_sandbox.ChalkTools to run the tool calls in a Chalk sandbox; None runs them here.
    log: optional function given one line per Chalk call (the demo server prints them)."""
    log = log or (lambda line: None)
    p, sun = c["panel"], c["site"]["sun_hours"]
    user = f"Passport ID: {p['id']}. The site gets about {sun:g} peak sun hours a day.\nRequest: {c['request']}"
    if mode in ("alone", "plain"):
        user += f"\nPassport: short-circuit current {p['isc_ma']} mA, open-circuit voltage {p['voc_v']} V, grade {p['grade']}, flags {p['flags']}."
    # OpenAI's Responses API through Chalk's gateway: this model takes function tools there, not in chat completions
    items = [{"role": "user", "content": user}]
    calls, trace, gateway = 0, [], []
    for _ in range(12):
        # the gateway's token quota needs an output limit up front, or it refuses the request (429)
        body = {"model": model, "instructions": {"tools": SYSTEM_TOOLS, "alone": SYSTEM_ALONE, "plain": SYSTEM_PLAIN}[mode], "input": items,
                "max_output_tokens": 1500, "reasoning": {"effort": "low"}}
        if mode == "tools":
            body["tools"] = TOOLS
        t0 = time.time()
        r = call("/responses", body)
        gateway.append({"id": r.get("id"), "ms": round((time.time() - t0) * 1000)})
        log(f"[chalk gateway] /responses {str(r.get('id') or '?')[:28]}… {gateway[-1]['ms']} ms")
        out = r.get("output") or []
        fcs = [o for o in out if o.get("type") == "function_call"]
        if not fcs:
            text = "".join(part.get("text", "") for o in out if o.get("type") == "message" for part in (o.get("content") or []) if part.get("type") == "output_text")
            a = parse_answer(text)
            return {"case_id": c["case_id"], **(a or {"feasible": None, "note": "no parseable answer: " + text[:200]}), "tool_calls": calls, "trace": trace,
                    "gateway": gateway, "sandbox_id": getattr(tools, "id", None)}
        # echo back only what the gateway's quota can size: the tool calls and plain message text, no reasoning
        # items or provider item ids (with those, follow-up turns are refused with a 429 "conservative token estimate")
        for o in out:
            if o.get("type") == "function_call":
                items.append({"type": "function_call", "call_id": o["call_id"], "name": o["name"], "arguments": o.get("arguments", "{}")})
            elif o.get("type") == "message":
                t = "".join(part.get("text", "") for part in (o.get("content") or []) if part.get("type") == "output_text")
                if t:
                    items.append({"role": "assistant", "content": t})
        for fc in fcs:
            calls += 1
            try:
                args = json.loads(fc.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            t0 = time.time()
            where = "local"
            if tools is not None and fc["name"] in ("get_passport", "check_use"):
                res = tools.call(fc["name"], {**args, "sun_hours": sun})   # runs in the Chalk sandbox
                where = "chalk-sandbox"
            elif args.get("passport_id") not in (None, p["id"]):
                res = {"error": f"unknown passport {args.get('passport_id')!r}"}
            elif fc["name"] == "get_passport":
                res = p
            elif fc["name"] == "check_use":
                res = su.check_use(p["isc_ma"], p["voc_v"], sun, args.get("device_id"), args.get("hours_per_day"))
            else:
                res = {"error": "unknown tool"}
            ms = round((time.time() - t0) * 1000)
            if where == "chalk-sandbox":
                log(f"[chalk sandbox {str(tools.id)[:8]}] {fc['name']}({', '.join(f'{k}={v}' for k, v in args.items())}) {ms} ms")
            trace.append({"tool": fc["name"], "args": args, "result": res, "where": where, "ms": ms})
            items.append({"type": "function_call_output", "call_id": fc["call_id"], "output": json.dumps(res)})
    return {"case_id": c["case_id"], "feasible": None, "note": "ran out of turns", "tool_calls": calls, "trace": trace, "gateway": gateway, "sandbox_id": getattr(tools, "id", None)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["tools", "alone", "plain"], default="tools")
    ap.add_argument("--model")
    ap.add_argument("--out")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--list-models", action="store_true")
    ap.add_argument("--tools-in", choices=["local", "chalk"], default="local", help="where the tool calls run: here, or in a Chalk Compute sandbox")
    a = ap.parse_args()
    if a.list_models:
        for m in call("/models").get("data", []):
            print(m.get("id"))
        return
    if not (a.model and a.out):
        sys.exit("--model and --out are required")
    with open(os.path.join(HERE, "cases.json")) as f:
        cases = json.load(f)["cases"]
    if a.limit:
        # keep the real-passport cases, then an even slice of the simulated ones
        real = [c for c in cases if c["kind"] == "real"]
        sim = [c for c in cases if c["kind"] != "real"]
        cases = (real + sim[:: max(1, len(sim) // max(1, a.limit - len(real)))])[: a.limit]
    t0 = time.time()
    answers, errors = [], 0
    tools = None
    if a.tools_in == "chalk" and a.mode == "tools":
        from chalk_sandbox import ChalkTools
        tools = ChalkTools({c["panel"]["id"]: c["panel"] for c in cases})
        print(f"Chalk sandbox ready in {tools.started_s} s", file=sys.stderr)
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(run_case, c, a.model, a.mode, tools): c for c in cases}
        for i, fu in enumerate(cf.as_completed(futs), 1):
            try:
                answers.append(fu.result())
            except Exception as e:  # noqa: BLE001  keep going; a failed case counts as unanswered
                errors += 1
                answers.append({"case_id": futs[fu]["case_id"], "feasible": None, "note": f"error: {e}"[:200]})
            if i % 20 == 0:
                print(f"  {i}/{len(cases)} done, {errors} errors, {time.time() - t0:.0f}s", file=sys.stderr)
    if tools is not None:
        tools.close()
    out = {"advisor": f"chalk-gateway:{a.model}:{a.mode}" + ("@chalk-sandbox" if tools is not None else ""), "cases_run": len(cases), "errors": errors, "seconds": round(time.time() - t0, 1), "answers": answers}
    with open(a.out, "w") as f:
        json.dump(out, f, indent=1)
    print(f"wrote {a.out}: {len(answers)} answers, {errors} errors, {out['seconds']} s")


if __name__ == "__main__":
    main()
