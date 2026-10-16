"""Host the pairing dashboard and the simulated measurement API."""

from __future__ import annotations

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from solar_pairing.sim import Simulator

STATIC_DIR = Path(__file__).resolve().parent / "static"
TICK_S = 0.5


def make_handler(simulator: Simulator):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            path = self.path.split("?", 1)[0]
            if path == "/api/state":
                self._send_json(simulator.snapshot())
                return
            if path == "/":
                self._send_file(STATIC_DIR / "index.html", "text/html; charset=utf-8")
                return
            if path == "/app.js":
                self._send_file(STATIC_DIR / "app.js", "text/javascript; charset=utf-8")
                return
            if path == "/style.css":
                self._send_file(STATIC_DIR / "style.css", "text/css; charset=utf-8")
                return
            self.send_error(404)

        def do_POST(self) -> None:  # noqa: N802
            if self.path.split("?", 1)[0] != "/api/config":
                self.send_error(404)
                return
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8"))
                simulator.update_config(payload)
            except (ValueError, json.JSONDecodeError, KeyError, TypeError) as exc:
                self._send_json({"error": str(exc)}, status=400)
                return
            simulator.tick()
            self._send_json(simulator.snapshot())

        def log_message(self, fmt: str, *args) -> None:
            return

        def _send_json(self, payload: dict, status: int = 200) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_file(self, path: Path, content_type: str) -> None:
            if not path.is_file():
                self.send_error(404)
                return
            body = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def serve(host: str, port: int, simulator: Simulator | None = None) -> ThreadingHTTPServer:
    sim = simulator or Simulator()

    def loop() -> None:
        while True:
            sim.tick()
            threading.Event().wait(TICK_S)

    threading.Thread(target=loop, name="pairing-sim", daemon=True).start()
    server = ThreadingHTTPServer((host, port), make_handler(sim))
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description="Adaptive solar wiring dashboard")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = serve(args.host, args.port)
    print(f"dashboard http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
