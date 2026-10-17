// Arduino Uno R3 (ATmega328P) build: the pins and the few constants that differ from the ESP32 build.
// Everything else (timing, grading thresholds, proof cycles) comes from config.h and is identical.
//
// PROPOSED PIN MAP, NOT YET WIRED. Nothing here comes from docs/hardware.md yet. Before the first flash, the person
// wiring the bench confirms every pin below, records it in docs/hardware.md, and changes this file if it differs.
#pragma once
#include <stdint.h>

namespace uno {

// D0/D1 are the USB serial port and D13 blinks during the bootloader, so relays use D4 to D9.
constexpr int PIN_STAGE1 = 4;    // K1–K4: swaps P2 and P3
constexpr int PIN_STAGE2 = 5;    // K5–K8: swaps positions 2 and 4
constexpr int PIN_K_SHORT = 6;   // shorts the array output through the sensors (Isc)
constexpr int PIN_K_CAP = 7;     // connects the sweep capacitor
constexpr int PIN_K_DIS = 8;     // discharges the capacitor through 4.7 Ω
constexpr int PIN_K_LOAD = 9;    // NC = load (pump, fan or LED); relay ON disconnects it
constexpr int PIN_MX = A0;       // string X mid-node divider, 100 kΩ over 15 kΩ
constexpr int PIN_MY = A1;       // string Y mid-node divider
constexpr int PIN_LED = LED_BUILTIN;
// I2C is fixed on the Uno: SDA = A4, SCL = A5 (also on the two pins next to AREF). One bus only.

// The Uno has one I2C bus, so the output sensor can't reuse 0x40 on a second bus as on the ESP32.
// 0x42 = the INA219's A0 pin tied to SDA and A1 to GND (datasheet table 1). On a breakout whose A0 jumper only
// reaches VCC, solder a wire from the A0 pad to SDA instead of closing the jumper.
constexpr uint8_t ADDR_X1 = 0x40, ADDR_X2 = 0x41, ADDR_Y1 = 0x44, ADDR_Y2 = 0x45, ADDR_OUT = 0x42;

// The Uno's ADC reads 0–5 V against its own supply in 1024 steps. Measure the 5V pin with a multimeter while
// on USB and put the reading here: USB supplies vary from about 4.7 to 5.2 V, and the error goes straight
// into the bottom panels' open-circuit voltage.
constexpr float VCC_V = 5.0f;

// RAM: the sweep keeps at most this many binned points (8 bytes each) instead of 2,500 raw samples.
constexpr int SWEEP_POINTS = 40;

}  // namespace uno
