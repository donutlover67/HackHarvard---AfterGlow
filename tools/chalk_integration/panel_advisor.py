import json

from chalk_advisor import recommend_solar_pairing
from panel_passports import analyze_panel_passports


def run_advisor(question, panels):
    # Step 1: Analyze panels using Chalk
    passport_data = json.loads(
        analyze_panel_passports.remote(
            json.dumps({"panels": panels})
        )
    )

    # Step 2: Prepare current measurements
    currents = {
        panel["id"]: panel["isc_a"]
        for panel in panels
    }

    # Step 3: Get Chalk pairing recommendation
    pairing_data = json.loads(
        recommend_solar_pairing.remote(
            json.dumps(currents)
        )
    )

    pairing = pairing_data["recommended_pairing"]

    # Step 4: Generate an explanation
    explanation = (
        f"The recommended pairing is {pairing}, "
        "based on the panels' short-circuit currents. "
        "This configuration may reduce mismatch losses "
        "by grouping panels with similar current outputs. "
        "Actual maximum power must be verified through "
        "hardware measurements."
    )

    # Step 5: Check preliminary warnings
    flagged = [
        panel["id"]
        for panel in passport_data["passports"]
        if panel["possible_voltage_anomaly"]
    ]

    warnings = [
        "Voc and Isc alone cannot confirm compatibility "
        "with the requested electrical load.",
        "Verify operating voltage, current limits, "
        "controller compatibility and startup power "
        "before connecting a real load."
    ]

    if flagged:
        warnings.append(
            "Possible voltage anomalies detected in: "
            + ", ".join(flagged)
        )

    # Step 6: Return website-ready JSON
    return {
        "question": question,
        "recommended_pairing": pairing,
        "explanation": explanation,
        "warnings": warnings,
        "panel_passports": passport_data["passports"],
        "pairing_analysis": pairing_data,
        "ai_enabled": False,
        "hardware_verified": False,
        "data_source": "SIMULATED"
    }


if __name__ == "__main__":
    panels = [
        {"id": "A", "isc_a": 0.35, "voc_v": 6.2},
        {"id": "B", "isc_a": 0.32, "voc_v": 6.1},
        {"id": "C", "isc_a": 0.18, "voc_v": 6.0},
        {"id": "D", "isc_a": 0.16, "voc_v": 5.9}
    ]

    question = (
        "Can these panels power my 12V water pump?"
    )

    result = run_advisor(question, panels)

    print("\n--- SOLAR PANEL ADVISOR ---")
    print(json.dumps(result, indent=2))
