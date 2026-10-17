# Hardware as built

Owner: A. This file records what is actually wired, so the firmware and the demo match the bench, not the plan. Where it differs from docs/spec-v2.md §11.2, this file wins. Update it every time a wire moves.

## Which controller

Two firmware builds speak the same serial protocol, so the dashboard works with either:

- **ESP32 DevKit** (`pio run -e esp32dev`): the original plan; pin map below.
- **Arduino Uno R3** (`pio run -e uno`): added Saturday because the team's ESP32 is a bare module with no USB. Its pins, addresses and supply constant are in `firmware/include/config_uno.h`, **proposed, not yet wired**: fill in the Uno table below as you wire, and change config_uno.h wherever the table differs.

### Uno pin map (proposed; tick each row once wired and checked)
| Signal | Uno pin | Note |
|---|---|---|
| Stage 1 (K1–K4) | D4 | |
| Stage 2 (K5–K8) | D5 | |
| K_SHORT | D6 | |
| K_CAP | D7 | |
| K_DIS | D8 | |
| K_LOAD | D9 | NC = load (pump, fan or LED) |
| MX divider | A0 | 100 kΩ / 15 kΩ |
| MY divider | A1 | 100 kΩ / 15 kΩ |
| I2C SDA / SCL | A4 / A5 | the only I2C bus: all five INA219s on it |
| INA219 OUT address | 0x42 | A0 tied to SDA, A1 to GND (the ESP32 build puts it at 0x40 on a second bus) |
| 5V pin, measured | ____ V | put the reading in `uno::VCC_V`; the dividers are read against it |

Uno differences that matter on the bench: D0/D1 are the USB serial port and stay free; opening the serial port resets the Uno, so the relays release for about a second (the load stays connected through K_LOAD's NC contact); the Uno's 5 V pins drive 5 V relay boards directly.

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
