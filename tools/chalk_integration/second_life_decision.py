"""Decision layer for SecondLife Marketplace.

Interprets Chalk Compute results without treating AI ideas
as verified products.
"""


def assess_decision(scenario, compute_result):
    customer = scenario["customer"]
    purpose = customer["purpose"].lower()
    budget = float(customer["budget_usd"])
    options = compute_result["evaluated_options"]

    relevant_names = {
        "soil moisture sensor": "Environmental sensor",
        "electric clothes dryer": "Electric dryer",
    }

    requested_product = relevant_names.get(purpose)

    # Only classify these known requests specifically.
    if requested_product:
        match = next(
            (o for o in options
             if o["product"] == requested_product),
            None
        )

        if match:
            if match["status"] == "NOT_FEASIBLE_BY_POWER_BOUND":
                return {
                    "decision": "UNABLE_TO_MEET_REQUEST_WITH_PANEL",
                    "reason": (
                        "The requested catalog device exceeds "
                        "the panel's idealized power upper bound."
                    ),
                    "alternatives_are_equivalent": False,
                    "approved_for_sale": False,
                }

            if match["status"] == "OVER_BUDGET":
                return {
                    "decision": "NO_CATALOG_OFFER_WITHIN_BUDGET",
                    "reason": (
                        "The relevant catalog option exceeds "
                        f"the customer's ${budget:.2f} budget. "
                        "Other solutions have not been validated."
                    ),
                    "alternatives_are_equivalent": False,
                    "approved_for_sale": False,
                }

    potential = [
        o for o in options
        if o["status"] == "NEEDS_MORE_EVIDENCE"
    ]

    if potential:
        return {
            "decision": "NEEDS_MORE_EVIDENCE",
            "reason": (
                "A catalog option passes preliminary screening, "
                "but measured performance, energy storage, "
                "safety and full costs remain unverified."
            ),
            "alternatives_are_equivalent": False,
            "approved_for_sale": False,
        }

    return {
        "decision": "NO_VALIDATED_CATALOG_MATCH",
        "reason": (
            "No catalog option currently passes preliminary "
            "screening for the stated customer need."
        ),
        "alternatives_are_equivalent": False,
        "approved_for_sale": False,
    }
