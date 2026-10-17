import json
from panel_advisor import run_advisor


def classify_question(question):
    q = question.lower()

    wiring_words = (
        "pair", "wiring", "wire", "configuration",
        "series", "parallel", "connect"
    )

    health_words = (
        "weak", "health", "condition",
        "degraded", "grade", "quality"
    )

    load_words = (
        "pump", "12v", "18v", "24v",
        "shed", "light", "load"
    )

    if any(word in q for word in wiring_words):
        return "wiring_recommendation"

    if any(word in q for word in health_words):
        return "panel_condition"

    if any(word in q for word in load_words):
        return "load_feasibility"

    return "general"


def prepare_context(panels):
    return run_advisor(
        "Analyze solar panels",
        panels
    )


def answer_question(question, context):
    category = classify_question(question)
    passports = context["panel_passports"]
    pairing = context["recommended_pairing"]

    if category == "panel_condition":
        weakest = min(
            passports,
            key=lambda p: p["relative_current_score"]
        )

        response = (
            f"Panel {weakest['id']} has the lowest "
            f"relative current score of "
            f"{weakest['relative_current_score']}%. "
            "This is a comparison within the current "
            "batch, not a certified health assessment."
        )

    elif category == "wiring_recommendation":
        response = (
            f"The current-matching heuristic recommends "
            f"{pairing}. The final configuration should "
            "be chosen using actual power measurements "
            "and electrical compatibility checks."
        )

    elif category == "load_feasibility":
        response = (
            f"The preliminary pairing is {pairing}. "
            "However, the available measurements do not "
            "confirm whether the panels can operate "
            "the requested load. Operating voltage, "
            "startup current and controller requirements "
            "must be verified."
        )

    else:
        response = (
            "I can help compare panel measurements, "
            "review wiring options and explain what "
            "information is needed to assess a load."
        )

    return {
        "question": question,
        "category": category,
        "response": response,
        "recommended_pairing": pairing,
        "warnings": context["warnings"],
        "ai_enabled": False,
        "hardware_verified": False,
        "data_source": context["data_source"]
    }


if __name__ == "__main__":
    with open("advisor_input.json") as f:
        data = json.load(f)

    print("Preparing panel context...", flush=True)
    context = prepare_context(data["panels"])
    context["data_source"] = data.get(
        "data_source", "UNSPECIFIED"
    )

    questions = [
        "Which solar panel is the weakest?",
        "Which wiring configuration produces the most power?",
        "Can these panels power a 12V water pump?"
    ]

    for question in questions:
        result = answer_question(question, context)

        print("\n--- PANEL ADVISOR V3 ---")
        print(json.dumps(result, indent=2))
