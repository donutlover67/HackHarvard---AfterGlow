import json

DEVICES = [
    {"name": "LED indicator", "power_w": 0.05},
    {"name": "Environmental sensor", "power_w": 0.10},
    {"name": "Mini DC fan", "power_w": 0.50},
    {"name": "Electric dryer", "power_w": 100.0},
]

def analyze_panel(panel):
    voc = float(panel["voc_v"])
    isc = float(panel["isc_a"])
    upper_bound = voc * isc

    options = []

    for device in DEVICES:
        possible = upper_bound >= device["power_w"]

        options.append({
            "device": device["name"],
            "required_power_w": device["power_w"],
            "candidate_for_testing": possible,
            "verified_compatible": False,
        })

    return {
        "panel_id": panel["id"],
        "upper_bound_w": round(upper_bound, 4),
        "options": options,
        "warning": "Verify operating power and voltage under load.",
    }

if __name__ == "__main__":
    panel = {"id": "B", "voc_v": 6.39, "isc_a": 0.0527}
    print(json.dumps(analyze_panel(panel), indent=2))
