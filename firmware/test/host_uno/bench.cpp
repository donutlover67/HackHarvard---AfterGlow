// See bench.h. Everything the firmware can observe is derived from the relay pins it drives and the model.
#include "Arduino.h"
#include "Wire.h"
#include "EEPROM.h"
#include "Adafruit_INA219.h"
#include "bench.h"
#include <random>
#include <algorithm>
#include <cmath>

FakeSerial Serial;
TwoWire Wire;
EEPROMClass EEPROM;

namespace bench {

Config cfg;
Stats stats;

namespace {
// same constants as dashboard/js/mock.js and tools/sim/pv2s2p.py
constexpr double VT = 0.025693, NS = 12, N_ID = 1.3, ISC_SUN = 0.38, VOC_CELL = 0.6;
const double I0 = ISC_SUN / std::exp(VOC_CELL / (N_ID * VT));
constexpr double RS_PANEL = 0.05 * NS, BYPASS_V = -0.35;
constexpr double CAP_F = 0.01;                 // 10,000 µF
constexpr double DIS_TAU_S = 4.7 * CAP_F;      // 4.7 Ω discharge
constexpr double PUMP_R = 40, PUMP_KNEE = 1.0; // the brushed pump as 40 Ω above a 1 V knee
constexpr double SHUNT_OHM = 0.1, DIVIDER_GAIN = 115.0 / 15.0, VCC = 5.0;
// pins and addresses from include/config_uno.h
enum { P_STAGE1 = 4, P_STAGE2 = 5, P_SHORT = 6, P_CAP = 7, P_DIS = 8, P_LOAD = 9, P_MX = 14, P_MY = 15 };
constexpr uint8_t ADDR_X1 = 0x40, ADDR_X2 = 0x41, ADDR_Y1 = 0x44, ADDR_Y2 = 0x45, ADDR_OUT = 0x42;

unsigned long nowMs = 0;
std::mt19937 rng(7);
std::normal_distribution<double> normal(0, 1);
bool level[32], isOutput[32];
double capV = 0;

double noisy(double x) { return x * (1 + normal(rng) * cfg.noisePct / 100); }
bool relayOn(int pin) { return isOutput[pin] && level[pin] == LOW; }   // active-low boards
double iph(int k) { int box = (k == 1) ? cfg.refBox : k; return ISC_SUN * cfg.light * cfg.boxLamp[box] * (cfg.film[k] ? cfg.filmT : 1); }
double panelV(int k, double I) {
  double ip = iph(k);
  if (I >= ip) return BYPASS_V;
  double v = NS * N_ID * VT * std::log((ip - I) / I0 + 1) - I * RS_PANEL;
  return std::max(v, BYPASS_V);
}
double stringV(int a, int b, double I) { return panelV(a, I) + panelV(b, I); }
double stringI(int a, int b, double V) {
  if (V >= stringV(a, b, 0)) return 0;
  double lo = 0, hi = std::max(iph(a), iph(b)) + 0.01;
  for (int n = 0; n < 50; n++) { double mid = (lo + hi) / 2; if (stringV(a, b, mid) > V) lo = mid; else hi = mid; }
  return lo;
}
void slots(char p, int s[4]) {
  switch (p) {
    case 'B': s[0] = 1; s[1] = 3; s[2] = 2; s[3] = 4; break;
    case 'C': s[0] = 1; s[1] = 4; s[2] = 3; s[3] = 2; break;
    default:  s[0] = 1; s[1] = 2; s[2] = 3; s[3] = 4; break;
  }
}
char pairingNow() { bool s1 = relayOn(P_STAGE1), s2 = relayOn(P_STAGE2); return s1 ? 'B' : s2 ? 'C' : 'A'; }
double arrayI(char p, double V) { int s[4]; slots(p, s); return stringI(s[0], s[1], V) + stringI(s[2], s[3], V); }
double arrayVoc(char p) { int s[4]; slots(p, s); return std::max(stringV(s[0], s[1], 0), stringV(s[2], s[3], 0)); }

struct Node { double outV = 0, outI = 0, slotI[4] = {0, 0, 0, 0}, mx = 0, my = 0; };

// The electrical state right now, from the relays: shorted, on the capacitor, on the pump, or open.
Node solve() {
  char p = pairingNow(); int s[4]; slots(p, s); Node n;
  double ix = 0, iy = 0;
  if (relayOn(P_SHORT)) {
    // output shorted: each panel sits near 0 V behind its slot's bypass diode, so each slot reads its own Isc
    n.outV = 0; n.outI = arrayI(p, 0);
    for (int k = 0; k < 4; k++) n.slotI[k] = iph(s[k]);
    ix = std::max(iph(s[0]), iph(s[1])); iy = std::max(iph(s[2]), iph(s[3]));
  } else {
    double v;
    if (relayOn(P_CAP)) v = capV;
    else if (!relayOn(P_LOAD)) {   // K_LOAD's NC contact: relay off = pump connected
      double lo = 0, hi = arrayVoc(p);
      for (int i = 0; i < 50; i++) {
        double mid = (lo + hi) / 2;
        double ipump = mid > PUMP_KNEE ? (mid - PUMP_KNEE) / PUMP_R : 0;
        if (arrayI(p, mid) > ipump) lo = mid; else hi = mid;
      }
      v = lo;
    } else v = arrayVoc(p);
    n.outV = v; n.outI = arrayI(p, v);
    ix = stringI(s[0], s[1], v); iy = stringI(s[2], s[3], v);
    n.slotI[0] = std::min(ix, iph(s[0])); n.slotI[1] = std::min(ix, iph(s[1]));
    n.slotI[2] = std::min(iy, iph(s[2])); n.slotI[3] = std::min(iy, iph(s[3]));
  }
  n.mx = panelV(s[1], ix); n.my = panelV(s[3], iy);   // the mid node is the bottom panel's voltage
  return n;
}

void advance(unsigned long ms) {
  for (unsigned long i = 0; i < ms; i++) {
    nowMs++;
    if (relayOn(P_DIS)) capV *= std::exp(-0.001 / DIS_TAU_S);
    else if (relayOn(P_CAP) && !relayOn(P_SHORT)) {
      double i_a = arrayI(pairingNow(), capV);
      capV = std::min(capV + i_a / CAP_F * 0.001, arrayVoc(pairingNow()));
    }
  }
  stats.virtualMs = nowMs;
}
}  // namespace

void reset() {
  nowMs = 0; capV = 0; rng.seed(cfg.seed); stats = Stats();
  for (int i = 0; i < 32; i++) { level[i] = HIGH; isOutput[i] = false; }
}
unsigned long now() { return nowMs; }
double panelIsc_mA(int panel) { return iph(panel) * 1000; }

}  // namespace bench

// ---- the fake Arduino core, routed to the bench ----
using namespace bench;

unsigned long millis() { return bench::now(); }
void delay(unsigned long ms) { advance(ms); }
void pinMode(uint8_t pin, uint8_t mode) { isOutput[pin] = (mode == OUTPUT); }

void digitalWrite(uint8_t pin, uint8_t v) {
  bool wasOn = relayOn(pin);
  level[pin] = v;
  bool on = relayOn(pin);
  if (on != wasOn && pin >= P_STAGE1 && pin <= P_LOAD) stats.transitions[pin]++;
  char buf[120];
  if (relayOn(P_STAGE1) && relayOn(P_STAGE2)) { snprintf(buf, sizeof buf, "t=%lu both relay stages energised", nowMs); stats.violations.push_back(buf); }
  if (relayOn(P_SHORT) && relayOn(P_CAP)) { snprintf(buf, sizeof buf, "t=%lu K_SHORT and K_CAP closed together", nowMs); stats.violations.push_back(buf); }
  if (pin == P_CAP && on && !wasOn) {
    stats.maxCapVAtCapClose = std::max(stats.maxCapVAtCapClose, capV);
    if (capV > 0.3) { snprintf(buf, sizeof buf, "t=%lu K_CAP closed onto a charged capacitor (%.2f V)", nowMs, capV); stats.violations.push_back(buf); }
  }
}

int analogRead(uint8_t pin) {
  Node n = solve();
  double v = pin == P_MX ? n.mx : pin == P_MY ? n.my : 0;
  double counts = v / DIVIDER_GAIN / VCC * 1023.0;
  return (int)std::lround(std::max(0.0, std::min(1023.0, counts)));
}

bool Adafruit_INA219::begin(TwoWire*) {
  int idx = addr_ == ADDR_X1 ? 0 : addr_ == ADDR_X2 ? 1 : addr_ == ADDR_Y1 ? 2 : addr_ == ADDR_Y2 ? 3 : addr_ == ADDR_OUT ? 4 : -1;
  return idx >= 0 && cfg.sensorPresent[idx];
}
static int sensorIndex(uint8_t addr) {
  return addr == ADDR_X1 ? 0 : addr == ADDR_X2 ? 1 : addr == ADDR_Y1 ? 2 : addr == ADDR_Y2 ? 3 : addr == ADDR_OUT ? 4 : -1;
}
float Adafruit_INA219::getShuntVoltage_mV() {
  advance(1); stats.sensorReads++;
  int idx = sensorIndex(addr_);
  if (idx < 0 || !cfg.sensorPresent[idx]) return 0;
  Node n = solve();
  double amps = idx == 4 ? n.outI : n.slotI[idx];
  return (float)(noisy(amps) * 1000 * SHUNT_OHM);   // mA × 0.1 Ω
}
float Adafruit_INA219::getBusVoltage_V() {
  advance(1); stats.sensorReads++;
  int idx = sensorIndex(addr_);
  if (idx < 0 || !cfg.sensorPresent[idx]) return 0;
  Node n = solve();
  return (float)(idx == 4 ? n.outV + normal(rng) * 0.005 : 0);
}

void FakeSerial::deliverDue() {
  while (!pending.empty() && pending.front().at <= bench::now()) {
    for (char c : pending.front().text) rx.push_back(c);
    pending.pop_front();
  }
}
int FakeSerial::available() { deliverDue(); return (int)rx.size(); }
int FakeSerial::read() { deliverDue(); if (rx.empty()) return -1; char c = rx.front(); rx.pop_front(); return c; }
