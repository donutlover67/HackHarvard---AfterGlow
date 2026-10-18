"""SecondLife opportunity discovery via Chalk Model Gateway."""

import json
import os
from pathlib import Path

from openai import OpenAI

HERE = Path(__file__).resolve().parent

MODEL = "openai/gpt-6.1-sol"
ENV_ID = "clkdcdaf84e"


def discover_opportunities(data):
    key = os.environ.get("CHALK_ROUTER_API_KEY")

    if not key:
        raise RuntimeError("CHALK_ROUTER_API_KEY is not set.")

    # Follow Chalk's official OpenAI SDK example.
    client = OpenAI(
        base_url="https://api.chalk.ai/v1/router",
        api_key=key,
        default_headers={
            "X-Chalk-Env-Id": ENV_ID
        },
        timeout=60.0,
        max_retries=1,
    )

    context = {
        "panel": data["panel"],
        "customer": data["customer"],
        "existing_products": [
            offer["product"]
            for offer in data["offers"]
        ],
        "known_limitations": [
            "Voc times Isc is not measured usable power.",
            "Actual output under load is unknown.",
            "Battery and voltage regulator requirements are unknown.",
            "Catalog prices are illustrative.",
        ],
    }

    response = client.chat.completions.create(
        model=MODEL,
        max_completion_tokens=900,
        messages=[
            {
                "role": "system",
                "content": (
                    "You help discover circular-economy uses "
                    "for underperforming solar panels. "
                    "Suggest up to two NEW low-power product "
                    "concepts relevant to the customer, "
                    "excluding existing catalog products. "
                    "For each concept explain why it may be "
                    "useful and what technical evidence is "
                    "needed before testing. "
                    "Do not invent measured specifications, "
                    "market prices, savings, reliable runtime, "
                    "or safety approvals. "
                    "Do not claim any proposed device is "
                    "compatible with the panel. "
                    "Reply concisely in English."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(context),
            },
        ],
    )

    content = response.choices[0].message.content

    if not content:
        raise RuntimeError(
            "Model Gateway returned no text content."
        )

    return {
        "source": "CHALK_MODEL_GATEWAY",
        "model": MODEL,
        "status": "UNVERIFIED_CONCEPTS",
        "ideas": content,
        "hardware_verified": False,
        "needs_compute_screening": True,
    }


if __name__ == "__main__":
    request_path = HERE / "second_life_request.json"
    data = json.loads(request_path.read_text())

    print("Calling Chalk Model Gateway...", flush=True)

    result = discover_opportunities(data)

    print("\n=== SECOND LIFE AI DISCOVERY ===")
    print(json.dumps(result, indent=2))
