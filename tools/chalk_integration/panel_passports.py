import json
import math
import chalkcompute


@chalkcompute.function
def analyze_panel_passports(payload_json: str) -> str:
    payload = json.loads(payload_json)
    panels = payload["panels"]

    if len(panels) != 4:
        raise ValueError("Exactly 4 panels required.")

    ids = [p["id"] for p in panels]
    if len(set(ids)) != 4:
        raise ValueError("Panel IDs must be unique.")

    for p in panels:
        for field in ("isc_a", "voc_v"):
            value = p[field]
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                or value <= 0
            ):
                raise ValueError(f"Invalid {field}")

    max_current = max(p["isc_a"] for p in panels)
    median_voltage = sorted(p["voc_v"] for p in panels)
    reference_voltage = (
        median_voltage[1] + median_voltage[2]
    ) / 2

    passports = []

    for p in panels:
        score = 100 * p["isc_a"] / max_current

        passports.append({
            "id": p["id"],
            "isc_a": p["isc_a"],
            "voc_v": p["voc_v"],
            "relative_current_score": round(score, 1),
            "preliminary_grade": (
                "A" if score >= 85
                else "B" if score >= 65
                else "C"
            ),
            "possible_voltage_anomaly": (
                p["voc_v"] < 0.8 * reference_voltage
            ),
        })

    return json.dumps({
        "passports": passports,
        "grading_method": "relative_demo_only",
        "safety_certified": False
    })


if __name__ == "__main__":
    sample = {
        "panels": [
            {"id": "A", "isc_a": 0.35, "voc_v": 6.2},
            {"id": "B", "isc_a": 0.32, "voc_v": 6.1},
            {"id": "C", "isc_a": 0.18, "voc_v": 6.0},
            {"id": "D", "isc_a": 0.16, "voc_v": 5.9}
        ]
    }

    result = analyze_panel_passports.remote(
        json.dumps(sample)
    )

    print(json.dumps(json.loads(result), indent=2))
