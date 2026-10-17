# Firmware

Board: ESP32-WROOM-32 DevKit (classic ESP32, not S2/S3/C3) | env `esp32dev` | platform espressif32@7.1.3 = arduino-esp32 core **2.0.17** (so 2.x APIs: `ledcSetup`/`ledcAttachPin`, not the 3.x `ledcAttach`). Don't change it.
Libraries (pinned in platformio.ini): Adafruit INA219, ArduinoJson 7. No Wi-Fi.
The pin map, relay table and procedures are in docs/spec-v2.md §11.2–11.4; docs/hardware.md records what was actually wired. Read the relevant section before touching any GPIO, I2C or relay code. All pins and tunables live in include/config.h.

## Pins (classic ESP32)
- I2C `Wire`: SDA 21, SCL 22 — INA219 X1 0x40, X2 0x41, Y1 0x44, Y2 0x45. `Wire1`: SDA 32, SCL 33 — INA219 OUT 0x40.
- Relays: GPIO16 = stage 1 (K1–K4), GPIO17 = stage 2 (K5–K8), 18 K_SHORT, 19 K_CAP, 23 K_DIS, 25 K_LOAD.
- ADC: GPIO34 = MX, GPIO35 = MY (divider ratio 15/115).
- Never use GPIO 6–11 (flash). Avoid 0, 2, 5, 12, 14, 15 for relays (strapping pins / toggle at boot). 34–39 are input-only.

## Loop (cheapest first)
1. `pio run -e esp32dev` after every change; no new warnings.
2. `pio test -e native` for logic in lib/solarlogic (no Arduino.h there; hardware behind interfaces): pairing prediction, sweep statistics, the confidence interval.
3. A human flashes the board; then read logs/serial.log produced by tools/capture.py.

## Serial and upload
- Flashing switches relays on real panels, so uploads (`-t upload`) always need a human OK.
- Stop any capture first: an open port blocks upload.
- macOS has no `timeout` command; capture.py has its own deadline.

## Output
115200 baud, one JSON object per line, exactly as in protocol/PROTOCOL.md. Print `{"type":"hello",...}` after setup and `{"type":"error",...}` on faults. Nothing else on serial except `{"type":"log",...}` lines.

## Rules
- Every safety interlock in spec §11.4 stays in code, with a comment pointing to it. Don't remove one to make a test pass.
- No blocking delay() in the measurement loop except the fixed settle times in §11.3.
- Every tunable number is a named constant in include/config.h.
