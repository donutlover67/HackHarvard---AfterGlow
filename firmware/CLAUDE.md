# Firmware

Board: ESP32-WROOM-32 DevKit (classic ESP32, not S2/S3/C3) | env `esp32dev` | platform espressif32@7.1.3 = arduino-esp32 core **2.0.17** (so 2.x APIs: `ledcSetup`/`ledcAttachPin`, not the 3.x `ledcAttach`). Don't change it.
Libraries (pinned in platformio.ini): Adafruit INA219, ArduinoJson 7. No Wi-Fi.
The pin map, relay table and procedures are in docs/spec-v2.md §11.2–11.4; docs/hardware.md records what was actually wired. Read the relevant section before touching any GPIO, I2C or relay code. All pins and tunables live in include/config.h.

## Arduino Uno R3 build (env `uno`)
`src/uno/main_uno.cpp` with `include/config_uno.h`; platform atmelavr@5.3.0. Same commands, procedures, interlocks and messages as `src/main.cpp`; the dashboard can't tell the boards apart. Forced differences: 2 KB RAM, so sweeps are binned while they run (`solar::SweepBinner`, 40 points) and messages are printed field by field (`lib/protocol_out`, all text in flash via `F()`), no ArduinoJson; one I2C bus, so the OUT sensor is at 0x42; EEPROM for the box factors; 10-bit ADC against `uno::VCC_V`. The Uno pin map is a proposal until docs/hardware.md confirms it. Keep RAM under about 1.4 KB at build time (stack needs the rest); `pio run -e uno` prints it. A change to a procedure in one build goes into the other too.

## Pins (classic ESP32)
- I2C `Wire`: SDA 21, SCL 22 — INA219 X1 0x40, X2 0x41, Y1 0x44, Y2 0x45. `Wire1`: SDA 32, SCL 33 — INA219 OUT 0x40.
- Relays: GPIO16 = stage 1 (K1–K4), GPIO17 = stage 2 (K5–K8), 18 K_SHORT, 19 K_CAP, 23 K_DIS, 25 K_LOAD.
- ADC: GPIO34 = MX, GPIO35 = MY (divider ratio 15/115).
- Never use GPIO 6–11 (flash). Avoid 0, 2, 5, 12, 14, 15 for relays (strapping pins / toggle at boot). 34–39 are input-only.

## Loop (cheapest first)
1. `pio run -e esp32dev` and `pio run -e uno` after every change; no new warnings.
2. `pio test -e native` for logic in lib/solarlogic (no Arduino.h there; hardware behind interfaces): pairing prediction, sweep statistics, the confidence interval, the Uno's streaming binner, and the exact JSON lines lib/protocol_out prints.
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
