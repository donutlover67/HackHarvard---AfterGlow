#!/usr/bin/env python3
"""The Second Use agent for the site, on the demo laptop: POST /second-use on 127.0.0.1:8767.

    AFTERGLOW_MODEL=<model id> python3 tools/eval/second_use/serve.py
    AFTERGLOW_MODEL=<model id> AFTERGLOW_TOOLS=chalk ~/.cache/afterglow-chalk/bin/python tools/eval/second_use/serve.py   # tools in Chalk

Body: {"passport": {"id", "isc_ma", "voc_v", "grade", "flags"}, "sun_hours": 4.5, "request": "..."}
Reply: the agent's answer (device_id, hours_per_day, feasible, alternatives, note) and its tool-call trace.
Local only: it spends the Chalk key's quota, so it listens on 127.0.0.1 and answers pages served from localhost.
"""
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import agent

PORT = 8767
MODEL = os.environ.get("AFTERGLOW_MODEL")
# AFTERGLOW_TOOLS=chalk runs the agent's tool calls in a Chalk Compute sandbox (needs chalkcompute and `chalk login`;
# start the server with ~/.cache/afterglow-chalk/bin/python). The sandbox is made on the first request and remade
# when it is 25 minutes old or a call fails, so a long demo never meets an expired one.
TOOLS_IN = os.environ.get("AFTERGLOW_TOOLS", "local")
_tools, _tools_t = None, 0.0
_tools_lock = threading.Lock()


def chalk_tools(passport):
    global _tools, _tools_t
    from chalk_sandbox import ChalkTools
    with _tools_lock:
        if _tools is None or time.time() - _tools_t > 25 * 60:
            if _tools is not None:
                _tools.close()
            _tools, _tools_t = ChalkTools({}, lifetime="1800s"), time.time()
            print(f"[chalk sandbox] started {_tools.id} in {_tools.started_s} s", flush=True)
        _tools.add_passports({passport["id"]: passport})
        return _tools


def allowed(origin):
    return origin.startswith(("http://localhost:", "http://127.0.0.1:"))


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_json(204, {})

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "model": MODEL, "tools_in": TOOLS_IN})
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/second-use":
            return self.send_json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if not 0 < n <= 10000:
                raise ValueError("bad size")
            b = json.loads(self.rfile.read(n))
            p = b["passport"]
            panel = {"id": str(p["id"])[:40], "isc_ma": float(p["isc_ma"]), "voc_v": float(p["voc_v"]),
                     "grade": str(p.get("grade", ""))[:2], "flags": [str(f)[:20] for f in p.get("flags", [])][:5]}
            if not (panel["isc_ma"] > 0 and panel["voc_v"] > 0):
                raise ValueError("isc_ma and voc_v must be positive")
            sun = float(b.get("sun_hours", 4.5))
            if not 0.5 <= sun <= 9:
                raise ValueError("sun_hours out of range")
            req = str(b["request"]).strip()
            if not 3 <= len(req) <= 300:
                raise ValueError("request must be 3 to 300 characters")
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as e:
            return self.send_json(400, {"error": f"bad request: {e}"})
        if not MODEL:
            return self.send_json(503, {"error": "AFTERGLOW_MODEL is not set on the server"})
        case = {"case_id": "live", "panel": panel, "site": {"sun_hours": sun}, "request": req}
        try:
            tools = chalk_tools(panel) if TOOLS_IN == "chalk" else None
            print(f"[request] {panel['id']}, {sun} h of sun: {req!r}", flush=True)
            ans = agent.run_case(case, MODEL, "tools", tools, log=lambda line: print(line, flush=True))
            print(f"[answer] feasible={ans.get('feasible')} device={ans.get('device_id')} hours={ans.get('hours_per_day')}", flush=True)
        except Exception as e:  # noqa: BLE001
            global _tools
            if "gateway" not in str(e):
                _tools = None   # a sandbox problem: remake it next time (a gateway error leaves it as it is)
            return self.send_json(502, {"error": str(e)[:300]})
        self.send_json(200, {"model": MODEL, "tools_in": TOOLS_IN, **ans})


if __name__ == "__main__":
    print(f"Second Use agent on http://127.0.0.1:{PORT}/second-use (model {MODEL or 'NOT SET'})", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
