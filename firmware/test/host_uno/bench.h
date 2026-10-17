// The simulated bench the fake Arduino layer talks to: four panels on the single-diode model, the relay network
// read back from the pins the firmware drives, a sweep capacitor, a pump load, lamp-box differences, an interlock
// monitor and virtual time. Pins, addresses and the divider ratio mirror include/config_uno.h; keep them in step.
#pragma once
#include <string>
#include <vector>

namespace bench {

struct Config {
  double light = 0.4;                                   // fraction of full sun on a clear panel
  bool film[5] = {false, false, true, false, true};     // index by panel 1..4; 35% film on 2 and 4 as in the demo
  double filmT = 0.35;
  double boxLamp[5] = {0, 1.0, 0.98, 1.03, 0.99};       // hidden lamp differences the CAL wizard should find
  bool sensorPresent[5] = {true, true, true, true, true};   // X1 X2 Y1 Y2 OUT
  int refBox = 1;        // which lamp box the reference panel (panel 1) sits in; the driver moves it for CAL k
  double noisePct = 0.5;
  unsigned seed = 7;
};

struct Stats {
  std::vector<std::string> violations;   // interlock breaches seen on the relay pins
  long transitions[32] = {0};            // relay switch counts per pin
  long sensorReads = 0;
  double maxCapVAtCapClose = 0;          // capacitor voltage the moment K_CAP closed (should stay near 0)
  unsigned long virtualMs = 0;
};

extern Config cfg;
extern Stats stats;

void reset();                 // apply cfg, zero time and the capacitor, reseed noise
unsigned long now();
double panelIsc_mA(int panel);   // what the model says panel k makes when shorted, for the validator

}  // namespace bench
