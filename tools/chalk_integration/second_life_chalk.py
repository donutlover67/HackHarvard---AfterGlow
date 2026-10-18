"""Chalk Compute: evidence-based screening of second-life offers."""

import json
import chalkcompute


@chalkcompute.function
def evaluate_second_life_options(payload_json: str) -> str:
    import json
    import math

    payload = json.loads(payload_json)
    panel = payload["panel"]
    customer = payload["customer"]
    offers = payload["offers"]

    voc = float(panel["voc_v"])
    isc = float(panel["isc_a"])
    budget = float(customer["budget_usd"])
    hours = float(customer["daily_runtime_hours"])
    purpose = customer["purpose"].lower()

    if not all(math.isfinite(v) and v > 0
               for v in (voc, isc, hours)):
        raise ValueError("Invalid electrical values or runtime.")

    if not math.isfinite(budget) or budget < 0 or hours > 24:
        raise ValueError("Invalid budget or daily runtime.")

    power_requirements = {
        "LED indicator": 0.05,
        "Environmental sensor": 0.10,
        "Mini DC fan": 0.50,
        "Electric dryer": 100.0,
    }

    upper_bound = voc * isc
    evaluated = []

    for offer in offers:
        name = offer["product"]
        required_w = power_requirements[name]
        minimum_price = float(offer["minimum_price_usd"])

        if not math.isfinite(minimum_price) or minimum_price < 0:
            raise ValueError("Invalid offer price.")

        relevant = (
            ("sensor" in purpose and name == "Environmental sensor")
            or ("light" in purpose and name == "LED indicator")
            or ("led" in purpose and name == "LED indicator")
            or ("fan" in purpose and name == "Mini DC fan")
            or ("ventilation" in purpose and name == "Mini DC fan")
            or ("dryer" in purpose and name == "Electric dryer")
        )

        if required_w > upper_bound:
            status = "NOT_FEASIBLE_BY_POWER_BOUND"
        elif minimum_price > budget:
            status = "OVER_BUDGET"
        elif not relevant:
            status = "NOT_CUSTOMER_RELEVANT"
        else:
            status = "NEEDS_MORE_EVIDENCE"

        evaluated.append({
            "product": name,
            "required_power_w": required_w,
            "required_energy_wh_per_day": round(
                required_w * hours, 3
            ),
            "minimum_price_usd": minimum_price,
            "status": status,
            "hardware_verified": False,
            "reason": (
                "Maximum usable panel power, daily solar generation, "
                "operating voltage, storage and conversion losses "
                "have not been verified."
                if status == "NEEDS_MORE_EVIDENCE"
                else "Fails at least one preliminary screening condition."
            ),
        })

    return json.dumps({
        "panel_id": panel["id"],
        "power_upper_bound_w": round(upper_bound, 4),
        "customer_purpose": purpose,
        "evaluated_options": evaluated,
        "approved_for_sale": False,
        "data_status": "PRELIMINARY",
        "next_measurements": [
            "Measured maximum power under load",
            "Voltage and current at operating point",
            "Daily solar energy and expected sunlight",
            "Storage capacity and conversion efficiency",
        ],
    })
