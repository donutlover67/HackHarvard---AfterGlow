"""Local-only SecondLife Marketplace API.

Do not expose this server publicly without authentication,
rate limiting, and request-cost controls.
"""

import json
import math
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from second_life_economics import evaluate_business_options
from second_life_decision import assess_decision

HOST = "127.0.0.1"
PORT = 8767

ALLOWED_ORIGINS = {
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}


def positive_number(value, field, allow_zero=False):
    if isinstance(value, bool):
        raise ValueError(f"Invalid {field}")

    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {field}") from None

    if not math.isfinite(number):
        raise ValueError(f"Invalid {field}")

    if number < 0 or (not allow_zero and number == 0):
        raise ValueError(f"Invalid {field}")

    return number


def process_marketplace_request(payload):
    panel_data = payload["panel"]
    customer_data = payload["customer"]

    panel = {
        "id": str(panel_data["id"]).strip(),
        "voc_v": positive_number(
            panel_data["voc_v"], "voc_v"
        ),
        "isc_a": positive_number(
            panel_data["isc_a"], "isc_a"
        ),
    }

    purpose = customer_data["purpose"]

    if not isinstance(purpose, str) or not 3 <= len(purpose.strip()) <= 200:
        raise ValueError("Purpose must contain 3 to 200 characters.")

    customer = {
        "purpose": purpose.strip(),
        "budget_usd": positive_number(
            customer_data["budget_usd"],
            "budget_usd",
            allow_zero=True,
        ),
        "daily_runtime_hours": positive_number(
            customer_data["daily_runtime_hours"],
            "daily_runtime_hours",
        ),
    }

    if customer["daily_runtime_hours"] > 24:
        raise ValueError("Daily runtime cannot exceed 24 hours.")

    economics = evaluate_business_options(panel)

    scenario = {
        "panel": panel,
        "customer": customer,
        "offers": economics["offers"],
    }

    from second_life_chalk import evaluate_second_life_options
    from second_life_ai_agent import discover_opportunities

    compute = json.loads(
        evaluate_second_life_options.remote(
            json.dumps(scenario)
        )
    )

    decision = assess_decision(scenario, compute)
    discovery = discover_opportunities(scenario)

    return {
        "panel": panel,
        "customer": customer,
        "decision": decision,
        "catalog_screening": compute["evaluated_options"],
        "ai_discovery": discovery,
        "next_measurements": compute["next_measurements"],
        "power_upper_bound_w": compute["power_upper_bound_w"],
        "approved_for_sale": False,
        "data_source": "USER_PROVIDED_UNVERIFIED",
        "pricing_source": "ILLUSTRATIVE_DEMO_VALUES",
        "warning": (
            "Voc times Isc is only an idealized upper bound. "
            "New AI ideas have not been technically screened. "
            "No hardware compatibility or market price is verified."
        ),
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")

        origin = self.headers.get("Origin", "")

        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
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

    def do_OPTIONS(self):
        self.send_json(204, {})

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {
                "status": "ok",
                "service": "second-life-marketplace",
            })
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/marketplace":
            self.send_json(404, {"error": "Not found"})
            return

        try:
            size = int(self.headers.get("Content-Length", "0"))

            if not 0 < size <= 10000:
                raise ValueError("Invalid request size.")

            payload = json.loads(
                self.rfile.read(size).decode("utf-8")
            )

            if not isinstance(payload, dict):
                raise ValueError("Expected a JSON object.")

            result = process_marketplace_request(payload)
            self.send_json(200, result)

        except (ValueError, KeyError, TypeError) as error:
            self.send_json(400, {
                "error": f"Invalid input: {error}"
            })

        except Exception as error:
            print(
                "Marketplace processing failed:",
                type(error).__name__,
                flush=True,
            )
            self.send_json(503, {
                "error": "Marketplace service unavailable."
            })


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)

    print(
        f"SecondLife Marketplace API: http://{HOST}:{PORT}",
        flush=True,
    )
    print("Local development only. Ctrl+C to stop.")

    server.serve_forever()
