import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sample = ROOT / "site/data/sample-run.json"

run = json.loads(sample.read_text())
passports = run["passports"]

if len(passports) != 4:
    raise ValueError("This Chalk prototype requires exactly four panels.")

panels = []
id_mapping = {}

for index, passport in enumerate(passports):
    chalk_id = chr(ord("A") + index)
    original_id = passport["passport_id"]

    id_mapping[chalk_id] = original_id

    panels.append({
        "id": chalk_id,
        "isc_a": round(float(passport["isc_ma"]) / 1000, 6),
        "voc_v": float(passport["voc_v"])
    })

request = {
    "question": (
        "Which panels should be paired together, "
        "and what are the limitations of this recommendation?"
    ),
    "mode": "offline",
    "data_source": "SIMULATED",
    "panels": panels
}

output = ROOT / "chalk_site_test.json"
output.write_text(json.dumps(request, indent=2) + "\n")

print("Original passport IDs:", id_mapping)
print("Converted panels:", json.dumps(panels, indent=2))
print("Saved:", output)
