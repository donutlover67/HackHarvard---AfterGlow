// A stand-in for the Arduino core, just enough to compile src/uno/main_uno.cpp on a Mac or Linux box and run it
// against the simulated bench in ../bench.cpp. Time is virtual: millis() only moves when the firmware calls
// delay() or reads a sensor. See ../README.md.
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <ctype.h>
#include <math.h>
#include <string>
#include <deque>

#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT 0
#define LED_BUILTIN 13
#define A0 14
#define A1 15
#define A2 16
#define A3 17
#define A4 18
#define A5 19
#define PROGMEM
class __FlashStringHelper;
#define F(s) (reinterpret_cast<const __FlashStringHelper*>(s))

unsigned long millis();
void delay(unsigned long ms);
void pinMode(uint8_t pin, uint8_t mode);
void digitalWrite(uint8_t pin, uint8_t level);
int analogRead(uint8_t pin);

class FakeSerial {
 public:
  std::string out;                                   // everything the firmware printed
  struct Pending { unsigned long at; std::string text; };
  std::deque<Pending> pending;                       // scripted input, delivered once millis() >= at
  std::deque<char> rx;
  void begin(unsigned long) {}
  int available();
  int read();
  void inject(const std::string& line, unsigned long at = 0) { pending.push_back({at, line + "\n"}); }
  size_t print(const char* s) { out += s; return strlen(s); }
  size_t print(const __FlashStringHelper* s) { return print(reinterpret_cast<const char*>(s)); }
  size_t print(char c) { out += c; return 1; }
  size_t print(int v) { return print((long)v); }
  size_t print(unsigned int v) { return print((unsigned long)v); }
  size_t print(long v) { out += std::to_string(v); return 1; }
  size_t print(unsigned long v) { out += std::to_string(v); return 1; }
  size_t print(double v, int digits = 2) { char b[48]; snprintf(b, sizeof b, "%.*f", digits, v); out += b; return 1; }
  size_t println(const char* s) { print(s); out += '\n'; return 1; }
  size_t println(const __FlashStringHelper* s) { return println(reinterpret_cast<const char*>(s)); }
  size_t println() { out += '\n'; return 1; }
 private:
  void deliverDue();
};
extern FakeSerial Serial;
