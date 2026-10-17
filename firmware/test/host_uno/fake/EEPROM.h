#pragma once
#include <stdint.h>
#include <string.h>
// The Uno's 1 KB EEPROM, erased (0xFF) at start; survives a simulated reboot (setup() called again).
class EEPROMClass {
 public:
  uint8_t mem[1024];
  EEPROMClass() { memset(mem, 0xFF, sizeof mem); }
  uint8_t read(int a) { return mem[a]; }
  void update(int a, uint8_t v) { mem[a] = v; }
  template <class T> void put(int a, const T& v) { memcpy(mem + a, &v, sizeof v); }
  template <class T> void get(int a, T& v) { memcpy(&v, mem + a, sizeof v); }
};
extern EEPROMClass EEPROM;
