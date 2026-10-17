import json
import os
import urllib.request
import urllib.error

from panel_advisor_v3 import prepare_context, answer_question

URL = "https://api.chalk.ai/v1/router/chat/completions"
MODEL = "openai/gpt-6.1-sol"
ENV_ID = "clkdcdaf84e"


def ask_chalk_ai(question, context):
    key = os.environ.get("CHALK_ROUTER_API_KEY")

    if not key:
        raise RuntimeError(
            "CHALK_ROUTER_API_KEY is not set."
        )

    facts = {
        "recommended_pairing": context["recommended_pairing"],
        "panel_passports": context["panel_passports"],
        "warnings": context["warnings"],
        "data_source": context.get(
            "data_source", "UNSPECIFIED"
        ),
        "hardware_verified": False,
    }

    payload = {
        "model": MODEL,
        "max_completion_tokens": 400,
        "stream": False,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a solar panel reuse advisor. "
                    "Explain the supplied analysis in clear, "
                    "simple English. Use only the provided "
                    "panel facts. Do not invent measurements, "
                    "power gains, safety certifications, "
                    "or remaining lifespan. "
                    "The pairing recommendation uses a "
                    "current-matching heuristic, not measured "
                    "maximum power. Voc and Isc alone cannot "
                    "prove a load will operate. "
                    "If data is simulated, say so. "
                    "Keep the answer under 120 words."
                ),
            },
            {
                "role": "user",
                "content": json.dumps({
                    "question": question,
                    "analysis": facts,
                }),
            },
        ],
    }

    request = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "X-Chalk-Env-Id": ENV_ID,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(
        request, timeout=60
    ) as response:
        result = json.load(response)

    return result["choices"][0]["message"]["content"]


if __name__ == "__main__":
    with open("advisor_input.json") as f:
        data = json.load(f)

    question = data["question"]

    print("Running Chalk panel analysis...")
    context = prepare_context(data["panels"])

    context["data_source"] = data.get(
        "data_source", "UNSPECIFIED"
    )

    fallback = answer_question(question, context)

    try:
        print("Asking Chalk GPT-6.1-sol...")
        response = ask_chalk_ai(question, context)
        ai_enabled = True

    except (urllib.error.URLError, ValueError,
            KeyError, RuntimeError) as error:
        print("LLM unavailable:", str(error)[:300])
        response = fallback["response"]
        ai_enabled = False

    output = {
        "question": question,
        "response": response,
        "recommended_pairing": context[
            "recommended_pairing"
        ],
        "panel_passports": context["panel_passports"],
        "warnings": context["warnings"],
        "ai_enabled": ai_enabled,
        "hardware_verified": False,
        "data_source": context["data_source"],
    }

    with open("chalk_ai_output.json", "w") as f:
        json.dump(output, f, indent=2)

    print("\n--- AI SOLAR PANEL ADVISOR ---")
    print(json.dumps(output, indent=2))
