import json
import chalkcompute


@chalkcompute.function
def recommend_solar_pairing(panels_json: str) -> str:
    import json

    panels = json.loads(panels_json)
    names = sorted(panels.keys())

    if len(names) != 4 or any(
        not isinstance(panels[n], (int, float))
        or isinstance(panels[n], bool)
        or not 0 < panels[n] < float("inf")
        for n in names
    ):
        raise ValueError(
            "Provide exactly 4 panels with positive finite currents."
        )

    first = names[0]
    results = []

    for partner in names[1:]:
        remaining = [
            n for n in names
            if n not in (first, partner)
        ]

        pair1 = (first, partner)
        pair2 = tuple(remaining)

        score = (
            min(panels[pair1[0]], panels[pair1[1]])
            + min(panels[pair2[0]], panels[pair2[1]])
        )

        results.append({
            "pairing": "".join(pair1) + "|" + "".join(pair2),
            "estimated_current_a": round(score, 4)
        })

    best = max(
        results,
        key=lambda x: x["estimated_current_a"]
    )

    return json.dumps({
        "recommended_pairing": best["pairing"],
        "method": "current_matching_heuristic",
        "estimated_current_a": best["estimated_current_a"],
        "configurations": results,
        "requires_hardware_validation": True
    })


if __name__ == "__main__":
    panels = {
        "A": 0.35,
        "B": 0.32,
        "C": 0.18,
        "D": 0.16
    }

    print("Deploying Chalk Function...", flush=True)

    result = recommend_solar_pairing.remote(
        json.dumps(panels)
    )

    print("\n--- CHALK RESULT ---")
    print(json.dumps(json.loads(result), indent=2))
