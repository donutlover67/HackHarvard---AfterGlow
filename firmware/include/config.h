// Every pin and tunable number for the Second String firmware. docs/spec-v2.md §11 is the source;
// docs/hardware.md records what was actually wired and wins if it differs.
#pragma once
#include <stdint.h>

// ---- pins (classic ESP32-WROOM-32 DevKit) ----
constexpr int PIN_STAGE1 = 16;   // K1–K4: swaps P2 and P3
constexpr int PIN_STAGE2 = 17;   // K5–K8: swaps positions 2 and 4
constexpr int PIN_K_SHORT = 18;  // shorts the array output through the sensors (Isc)
constexpr int PIN_K_CAP = 19;    // connects the sweep capacitor
constexpr int PIN_K_DIS = 23;    // discharges the capacitor through 4.7 Ω
constexpr int PIN_K_LOAD = 25;   // NC = pump; relay ON disconnects the pump
constexpr int PIN_MX = 34;       // string X mid-node divider (input only)
constexpr int PIN_MY = 35;       // string Y mid-node divider (input only)
constexpr int PIN_LED = 2;
constexpr int PIN_SDA0 = 21, PIN_SCL0 = 22;   // Wire: X1 X2 Y1 Y2
constexpr int PIN_SDA1 = 32, PIN_SCL1 = 33;   // Wire1: OUT

// ---- relays ----
constexpr bool RELAY_ACTIVE_LOW = true;       // most 5 V opto boards; check docs/hardware.md

// ---- sensors ----
constexpr uint8_t ADDR_X1 = 0x40, ADDR_X2 = 0x41, ADDR_Y1 = 0x44, ADDR_Y2 = 0x45, ADDR_OUT = 0x40;
constexpr float SHUNT_OHM = 0.1f;
constexpr float DIVIDER_GAIN = 115.0f / 15.0f;  // 100 kΩ over 15 kΩ: node V = ADC V × 7.67
constexpr uint32_t I2C_HZ = 400000;

// ---- timing (ms) ----
constexpr uint32_t LIVE_MS = 200;
constexpr uint32_t STEADY_MS = 100;        // 12 cycles of 120 Hz lamp flicker
constexpr uint32_t SHORT_SETTLE_MS = 150;
constexpr uint32_t OC_SETTLE_MS = 300;
constexpr uint32_t SWITCH_GAP_MS = 20;     // break-before-make
constexpr uint32_t SWITCH_SETTLE_MS = 60;
constexpr uint32_t DISCHARGE_MS = 500;
constexpr uint32_t SWEEP_TIMEOUT_MS = 4000;
constexpr uint32_t SWEEP_IGNORE_MS = 5;    // contact bounce after K_CAP closes
constexpr uint32_t SWEEP_FLAT_MS = 50;     // stop when V moves < SWEEP_FLAT_V over this long
constexpr float SWEEP_FLAT_V = 0.02f;
constexpr uint32_t PUMP_SETTLE_MS = 1500;
constexpr uint32_t PUMP_WINDOW_MS = 5000;

// ---- analysis ----
constexpr float BIN_V = 0.1f;
constexpr int MAX_RAW_SAMPLES = 2500;
constexpr int MAX_SWEEP_POINTS = 80;
constexpr int PROOF_CYCLES = 20;
constexpr int PUMPPROOF_CYCLES = 10;
constexpr float GRADE_A_PCT = 90.0f;
constexpr float GRADE_B_PCT = 75.0f;
constexpr float LOW_VOC_FRACTION = 0.80f;  // below 80% of the median Voc: possible failed cell group
constexpr float DARK_ISC_MA = 5.0f;
constexpr int SENSOR_FAILS_BEFORE_RESET = 3;

constexpr const char* FW_VERSION = "0.2";
