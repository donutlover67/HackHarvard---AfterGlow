#!/usr/bin/env python3
"""One local server for the demo laptop: serves the dashboard and the site, and accepts run uploads.

    python3 tools/serve.py [--port 8000]
    http://localhost:8000/dashboard/     the bench dashboard (Web Serial needs localhost or https)
    http://localhost:8000/site/          passports, Array Builder, impact

    POST /api/runs   a run exported by the dashboard  -> site/data/runs/<run_id>.json
    GET  /api/runs   every stored run as a JSON array  (the site loads this on its own when present)

No dependencies, works offline. Static hosting (GitHub Pages) serves the same folders without the API;
there the site falls back to importing run files by hand.
"""
import argparse
import glob
import json
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RUNS_DIR = os.path.join(ROOT, "site", "data", "runs")
RUN_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # the dashboard may be served from another origin (or file://) while it uploads here
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/api/runs":
            runs = []
            for path in sorted(glob.glob(os.path.join(RUNS_DIR, "*.json"))):
                if os.path.basename(path) == "index.json":
                    continue  # the run list for static hosting (tools/sim/make_runs_index.py), not a run
                try:
                    with open(path) as f:
                        runs.append(json.load(f))
                except (OSError, ValueError):
                    continue
            return self._json(200, runs)
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/runs":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            run = json.loads(self.rfile.read(length).decode("utf-8"))
            run_id = run.get("run_id")
            if not isinstance(run_id, str) or not RUN_ID_RE.match(run_id) or run_id == "index":
                raise ValueError("run_id missing, not a plain identifier, or the reserved name index")
            if not isinstance(run.get("passports"), list):
                raise ValueError("no passports array")
        except (ValueError, UnicodeDecodeError) as exc:
            return self._json(400, {"error": str(exc)})
        os.makedirs(RUNS_DIR, exist_ok=True)
        with open(os.path.join(RUNS_DIR, f"{run_id}.json"), "w") as f:
            json.dump(run, f, indent=1)
        self._json(201, {"ok": True, "run_id": run_id, "passports": len(run["passports"]),
                         "site": "/site/#/", "stored": f"site/data/runs/{run_id}.json"})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    ap = argparse.ArgumentParser(description="Second String local server")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to let phones on the same Wi-Fi open the site")
    args = ap.parse_args()
    os.makedirs(RUNS_DIR, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"dashboard  http://localhost:{args.port}/dashboard/")
    print(f"site       http://localhost:{args.port}/site/")
    print(f"uploads    POST http://localhost:{args.port}/api/runs  ->  {RUNS_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
