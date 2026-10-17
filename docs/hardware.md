# Hardware as built

Owner: A. This file records what is actually wired, so the firmware and the demo match the bench, not the plan. Where it differs from docs/spec-v2.md §11.2, this file wins. Update it every time a wire moves.

## Parts actually used
| Part | Model / where bought | Notes |
|---|---|---|
| ESP32 | | |
| INA219 ×5 | | addresses: X1 0x40, X2 0x41, Y1 0x44, Y2 0x45 on Wire; OUT 0x40 on Wire1 |
| Relay modules | | active-LOW? high/low trigger jumper? |
| Panels ×4 | | label Voc / Isc: |
| Capacitor | | µF / V |
| Pump | | V / W |
| Lamps | | model, lumens |
| Film | | VLT % |

## Pin map (fill in; defaults from the spec)
| Signal | GPIO | Note |
|---|---|---|
| Stage 1 (K1–K4) | 16 | |
| Stage 2 (K5–K8) | 17 | |
| K_SHORT | 18 | |
| K_CAP | 19 | |
| K_DIS | 23 | |
| K_LOAD | 25 | NC = pump, so the pump runs with the relay off |
| MX divider | 34 | 100 kΩ / 15 kΩ |
| MY divider | 35 | 100 kΩ / 15 kΩ |
| Wire SDA / SCL | 21 / 22 | |
| Wire1 SDA / SCL | 32 / 33 | |

## Relay table (copy from spec §11.2 and tick each row once verified with a multimeter)
- [ ] K1 COM Q2+ · NC P2+ · NO P3+
- [ ] K2 COM Q2− · NC P2− · NO P3−
- [ ] K3 COM Q3+ · NC P3+ · NO P2+
- [ ] K4 COM Q3− · NC P3− · NO P2−
- [ ] K5 COM S2+ · NC Q2+ · NO Q4+
- [ ] K6 COM S2− · NC Q2− · NO Q4−
- [ ] K7 COM S4+ · NC Q4+ · NO Q2+
- [ ] K8 COM S4− · NC Q4− · NO Q2−

## Measured values
| What | Value | When |
|---|---|---|
| Clear panel Isc under one lamp box | | |
| Film panel Isc under the same box | | |
| Box factors | | |
| Panel temperature after 20 min | | |
