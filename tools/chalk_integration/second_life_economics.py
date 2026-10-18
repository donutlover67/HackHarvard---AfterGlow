"""Economics prototype for solar-panel repurposing.

All costs and comparison prices are illustrative.
Technical compatibility has not been verified.
"""

import json
from second_life_engine import analyze_panel

CATALOG = {
    "LED indicator": {
        "electronics_cost": 2.00,
        "labor_cost": 1.50,
        "testing_cost": 1.00,
        "market_reference": 12.00,
    },
    "Environmental sensor": {
        "electronics_cost": 5.00,
        "labor_cost": 2.00,
        "testing_cost": 1.50,
        "market_reference": 20.00,
    },
    "Mini DC fan": {
        "electronics_cost": 4.00,
        "labor_cost": 2.00,
        "testing_cost": 1.00,
        "market_reference": 15.00,
    },
    "Electric dryer": {
        "electronics_cost": 25.00,
        "labor_cost": 8.00,
        "testing_cost": 5.00,
        "market_reference": 40.00,
    },
}


def evaluate_business_options(
    panel,
    panel_cost=3.00,
    target_margin=0.30,
):
    if panel_cost < 0:
        raise ValueError("Panel cost cannot be negative.")

    if not 0 <= target_margin < 1:
        raise ValueError("Target margin must be between 0 and 1.")

    technical = analyze_panel(panel)
    offers = []

    for option in technical["options"]:
        name = option["device"]
        costs = CATALOG[name]

        total_cost = (
            panel_cost
            + costs["electronics_cost"]
            + costs["labor_cost"]
            + costs["testing_cost"]
        )

        minimum_price = total_cost / (1 - target_margin)
        reference_price = costs["market_reference"]

        candidate = option["candidate_for_testing"]
        price_competitive = minimum_price <= reference_price

        if not candidate:
            decision = "NOT_FEASIBLE_BY_POWER_BOUND"
        elif not price_competitive:
            decision = "ECONOMICALLY_UNATTRACTIVE"
        else:
            decision = "REQUIRES_HARDWARE_VERIFICATION"

        offers.append({
            "product": name,
            "technical_candidate": candidate,
            "hardware_verified": False,
            "total_cost_usd": round(total_cost, 2),
            "minimum_price_usd": round(minimum_price, 2),
            "illustrative_market_price_usd": reference_price,
            "potential_price_advantage_usd": round(
                reference_price - minimum_price, 2
            ),
            "decision": decision,
        })

    offers.sort(
        key=lambda item: (
            item["decision"] != "REQUIRES_HARDWARE_VERIFICATION",
            -item["potential_price_advantage_usd"],
        )
    )

    return {
        "panel_id": technical["panel_id"],
        "idealized_power_upper_bound_w":
            technical["upper_bound_w"],
        "target_gross_margin": target_margin,
        "offers": offers,
        "commercially_approved": False,
        "disclaimer": (
            "All prices are illustrative, not live market prices. "
            "No product is approved for sale. Verify operating "
            "power, electrical safety, reliability, and full costs "
            "before making customer claims."
        ),
    }


if __name__ == "__main__":
    sample_panel = {
        "id": "B",
        "voc_v": 6.39,
        "isc_a": 0.0527,
    }

    result = evaluate_business_options(sample_panel)
    print(json.dumps(result, indent=2))
