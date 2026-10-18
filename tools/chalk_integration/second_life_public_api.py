"""Public, quota-limited SecondLife Marketplace demo API."""

import json
import os
import threading
from http.server import ThreadingHTTPServer

import redis

from second_life_marketplace_api import Handler as LocalHandler

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "10000"))
PUBLIC_ORIGIN = "https://mscl741.github.io"
MAX_DAILY_REQUESTS = 20
SLOTS = threading.BoundedSemaphore(1)

LIMIT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""


def reserve_quota():
    url = os.environ.get("REDIS_URL")
    if not url:
        raise RuntimeError("REDIS_URL is not configured")

    client = redis.Redis.from_url(
        url,
        socket_connect_timeout=3,
        socket_timeout=3,
    )

    count = client.eval(
        LIMIT_SCRIPT,
        1,
        "secondlife:public:requests",
        86400,
    )

    return int(count) <= MAX_DAILY_REQUESTS


class PublicHandler(LocalHandler):
    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Vary", "Origin")

        origin = self.headers.get("Origin", "")
        allowed = {PUBLIC_ORIGIN}

        if os.environ.get("ALLOW_LOCAL_ORIGIN") == "1":
            allowed.update({
                "http://localhost:8000",
                "http://127.0.0.1:8000",
            })

        if origin in allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type",
            )
            self.send_header(
                "Access-Control-Allow-Methods",
                "GET, POST, OPTIONS",
            )

        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/marketplace":
            self.send_json(404, {"error": "Not found"})
            return

        origin = self.headers.get("Origin", "")
        allowed = {PUBLIC_ORIGIN}

        if os.environ.get("ALLOW_LOCAL_ORIGIN") == "1":
            allowed.update({
                "http://localhost:8000",
                "http://127.0.0.1:8000",
            })

        if origin not in allowed:
            self.send_json(403, {
                "error": "This demo request origin is not allowed."
            })
            return

        if not SLOTS.acquire(blocking=False):
            self.send_json(429, {
                "error": "Another analysis is running. Try again shortly."
            })
            return

        try:
            try:
                permitted = reserve_quota()
            except Exception:
                self.send_json(503, {
                    "error": "Demo quota service unavailable."
                })
                return

            if not permitted:
                self.send_json(429, {
                    "error": "Today's live AI demo quota has been reached."
                })
                return

            super().do_POST()
        finally:
            SLOTS.release()


if __name__ == "__main__":
    if not os.environ.get("REDIS_URL"):
        raise SystemExit("REDIS_URL is required for public mode")

    server = ThreadingHTTPServer((HOST, PORT), PublicHandler)
    print(f"SecondLife public API listening on {PORT}", flush=True)
    server.serve_forever()
