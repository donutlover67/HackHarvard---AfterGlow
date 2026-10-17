#pragma once
#include <stdint.h>
class TwoWire;
// Each sensor asks the simulated bench what it would read right now, by its I2C address.
class Adafruit_INA219 {
 public:
  explicit Adafruit_INA219(uint8_t addr) : addr_(addr) {}
  bool begin(TwoWire*);
  void setCalibration_32V_2A() {}
  float getShuntVoltage_mV();
  float getBusVoltage_V();
 private:
  uint8_t addr_;
};
