"""Customer-context matching for SecondLife Marketplace."""

import json
from second_life_economics import evaluate_business_options


def recommend_for_customer(panel, customer):
    budget = float(customer["budget_usd"])

    if budget < 0:
        raise ValueError("Budget must be non-negative.")

    purpose = str(customer["purpose"]).lower()

    result = evaluate_business_options(panel)
    matches = []

    for offer in result["offers"]:
        name = offer["product"].lower()

        if "sensor" in purpose:
            relevant = "sensor" in name
        elif "light" in purpose or "led" in purpose:
            relevant = "led" in name
        elif "fan" in purpose or "ventilation" in purpose:
            relevant = "fan" in name
        else:
            relevant = False

        within_budget = offer["minimum_price_usd"] <= budget

        eligible_for_testing = (
            relevant
            and within_budget
            and offer["technical_candidate"]
        )

        matches.append({
            "product": offer["product"],
            "customer_relevant": relevant,
            "within_budget": within_budget,
            "candidate_for_testing": eligible_for_testing,
            "hardware_verified": False,
            "minimum_price_usd": offer["minimum_price_usd"],
        })

    return {
        "customer": customer,
        "panel_id": panel["id"],
        "matches": matches,
        "recommendation_status": "PRELIMINARY_ONLY",
        "note": (
            "Matching considers purpose, budget and a power "
            "upper bound only. Runtime, storage, operating "
            "voltage and electrical safety are not verified."
        ),
    }


if __name__ == "__main__":
    panel = {
        "id": "B",
        "voc_v": 6.39,
        "isc_a": 0.0527,
    }

    customer = {
        "purpose": "soil moisture sensor",
        "budget_usd": 25,
        "daily_runtime_hours": 24,
    }

    print(json.dumps(
        recommend_for_customer(panel, customer),
        indent=2
    ))
