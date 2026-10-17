// Second String firmware for the Arduino Uno R3 (ATmega328P). Same procedures, interlocks and serial protocol as
// the ESP32 build in src/main.cpp, so the dashboard can't tell them apart; differences forced by the board:
//   - 2 KB of RAM: sweeps are binned while they run (solar::SweepBinner, 40 points) instead of buffering 2,500
//     raw samples; messages are printed field by field (lib/protocol_out) instead of through ArduinoJson; all
//     fixed text lives in flash (F()).
//   - One I2C bus: the output sensor moves from 0x40 on a second bus to 0x42 (see include/config_uno.h).
//   - Box factors are stored in EEPROM instead of ESP32 flash preferences.
//   - 10-bit ADC against the 5 V supply for the mid-node dividers.
// Build: pio run -e uno. Procedures: docs/spec-v2.md §11.3; interlocks §11.4; messages protocol/PROTOCOL.md.
//
// NOT YET RUN ON HARDWARE, AND THE PIN MAP IS A PROPOSAL: confirm include/config_uno.h against the wiring first.

#include <Arduino.h>
#include <Wire.h>
#include <EEPROM.h>
#include <Adafruit_INA219.h>
#include <math.h>
#include "config.h"       // shared timing, thresholds and cycle counts
#include "config_uno.h"   // Uno pins, addresses and limits
#include "solarlogic.h"
#include "protocol_out.h"

using namespace solar;

// ---------------------------------------------------------------- state
enum Mode { M_IDLE, M_RUN, M_GRADE, M_SWEEP, M_SEARCH, M_PROOF, M_PUMPPROOF, M_CAL };
static const char* const MODE_NAMES[] = {"IDLE", "RUN", "GRADE", "SWEEP", "SEARCH", "PROOF", "PUMPPROOF", "CAL"};

enum Relay { R_STAGE1, R_STAGE2, R_SHORT, R_CAP, R_DIS, R_LOAD, R_COUNT };
static const uint8_t RELAY_PIN[R_COUNT] = {uno::PIN_STAGE1, uno::PIN_STAGE2, uno::PIN_K_SHORT, uno::PIN_K_CAP, uno::PIN_K_DIS, uno::PIN_K_LOAD};

static Mode mode = M_IDLE;
static char pairing = 'A';
static bool relayOn[R_COUNT] = {false, false, false, false, false, false};
static bool capDischarged = false;
static bool abortRequested = false;
static bool busy = false;
static float factors[4] = {1, 1, 1, 1};
static float calReading[4] = {0, 0, 0, 0};
static bool haveSearch = false;
static char bestPairing = 'A', worstPairing = 'A';
static float lastPmax[3] = {0, 0, 0};   // A, B, C
static unsigned long lastLiveMs = 0;

static Adafruit_INA219 inaX1(uno::ADDR_X1), inaX2(uno::ADDR_X2), inaY1(uno::ADDR_Y1), inaY2(uno::ADDR_Y2), inaOut(uno::ADDR_OUT);
static Adafruit_INA219* const slotSensor[4] = {&inaX1, &inaX2, &inaY1, &inaY2};   // S1..S4

static SweepPoint ptsBuf[uno::SWEEP_POINTS];
static SweepBinner binner;

// EEPROM layout: a magic byte, then four floats.
constexpr int EE_MAGIC_ADDR = 0, EE_FACTORS_ADDR = 1;
constexpr uint8_t EE_MAGIC = 0x5A;

// ---------------------------------------------------------------- output
static bool pumpConnected() { return !relayOn[R_LOAD]; }   // K_LOAD's NC contact feeds the load
static void sendHello() { proto::hello(Serial, FW_VERSION, factors, MODE_NAMES[mode], pairing, pumpConnected()); }
#define LOG(s) proto::log(Serial, F(s))
#define ERR(s) proto::error(Serial, F(s))

// ---------------------------------------------------------------- relays with interlocks (spec §11.4)
static void relayRaw(Relay r, bool on) {
  digitalWrite(RELAY_PIN[r], (on != RELAY_ACTIVE_LOW) ? HIGH : LOW);
  relayOn[r] = on;
}
static bool relaySet(Relay r, bool on) {
  if (on) {
    // spec §11.4: never K_SHORT and K_CAP together; never K_CAP onto a charged capacitor; never both stages
    if (r == R_SHORT && relayOn[R_CAP]) { ERR("interlock: K_SHORT while K_CAP closed"); return false; }
    if (r == R_CAP && relayOn[R_SHORT]) { ERR("interlock: K_CAP while K_SHORT closed"); return false; }
    if (r == R_CAP && !capDischarged) { ERR("interlock: K_CAP before discharge"); return false; }
    if (r == R_STAGE1 && relayOn[R_STAGE2]) { ERR("interlock: both stages"); return false; }
    if (r == R_STAGE2 && relayOn[R_STAGE1]) { ERR("interlock: both stages"); return false; }
    if (r == R_CAP) capDischarged = false;
  }
  relayRaw(r, on);
  return true;
}
static void setPump(bool connected) { relayRaw(R_LOAD, !connected); }

// ---------------------------------------------------------------- sensors
static float readCurrentMa(Adafruit_INA219& ina) { return ina.getShuntVoltage_mV() / SHUNT_OHM; }
static float readBusV(Adafruit_INA219& ina) { return ina.getBusVoltage_V() + ina.getShuntVoltage_mV() / 1000.0f; }
static float readNodeV(uint8_t pin) { return analogRead(pin) * (uno::VCC_V / 1023.0f) * DIVIDER_GAIN; }

struct Steady { float slotMa[4]; float outV; float outMa; float mx; float my; };

static void serviceLive();
static void serviceSerial();

// Wait while still sending live messages and listening for STOP.
static bool waitMs(unsigned long ms) {
  unsigned long t0 = millis();
  while (millis() - t0 < ms) {
    serviceSerial();
    serviceLive();
    if (abortRequested) return false;
    delay(1);
  }
  return !abortRequested;
}

static Steady readSteady() {
  Steady s{{0, 0, 0, 0}, 0, 0, 0, 0};
  int n = 0;
  unsigned long t0 = millis();
  while (millis() - t0 < STEADY_MS) {   // average over 12 cycles of 120 Hz lamp flicker
    for (int k = 0; k < 4; k++) s.slotMa[k] += fabsf(readCurrentMa(*slotSensor[k]));
    s.outV += readBusV(inaOut);
    s.outMa += readCurrentMa(inaOut);
    s.mx += readNodeV(uno::PIN_MX);
    s.my += readNodeV(uno::PIN_MY);
    n++;
  }
  if (n == 0) n = 1;
  for (int k = 0; k < 4; k++) s.slotMa[k] /= n;
  s.outV /= n; s.outMa /= n; s.mx /= n; s.my /= n;
  return s;
}

// ---------------------------------------------------------------- pairing
static bool setPairing(char p, bool pumpAfter) {
  relaySet(R_CAP, false);
  relaySet(R_SHORT, false);
  setPump(false);
  if (!waitMs(SWITCH_GAP_MS)) return false;   // break before make
  // never both stages: turn the other one off first (spec §11.4)
  if (p == 'B') { relaySet(R_STAGE2, false); relaySet(R_STAGE1, true); }
  else if (p == 'C') { relaySet(R_STAGE1, false); relaySet(R_STAGE2, true); }
  else { relaySet(R_STAGE1, false); relaySet(R_STAGE2, false); }
  pairing = p;
  if (!waitMs(SWITCH_SETTLE_MS)) return false;
  setPump(pumpAfter);
  return true;
}

// ---------------------------------------------------------------- live
static void serviceLive() {
  if (millis() - lastLiveMs < LIVE_MS) return;
  lastLiveMs = millis();
  int sp[4]; slotPanels(pairing, sp);
  float ma[4];
  for (int k = 0; k < 4; k++) ma[k] = fabsf(readCurrentMa(*slotSensor[k]));
  proto::live(Serial, millis(), MODE_NAMES[mode], pairing, pumpConnected(), readBusV(inaOut), readCurrentMa(inaOut), sp, ma);
}

// ---------------------------------------------------------------- GRADE (spec §11.3)
static bool doGrade(char& predicted) {
  Mode prev = mode; mode = M_GRADE;
  bool pumpWas = pumpConnected();
  setPump(false);
  relaySet(R_CAP, false);
  if (!relaySet(R_SHORT, true)) return false;
  if (!waitMs(SHORT_SETTLE_MS)) { relaySet(R_SHORT, false); return false; }
  Steady sc = readSteady();
  relaySet(R_SHORT, false);
  if (!waitMs(OC_SETTLE_MS)) return false;
  Steady oc = readSteady();

  int sp[4]; slotPanels(pairing, sp);
  float raw[4], isc[4], voc[4], score[4]; char letters[4]; unsigned flags[4];
  for (int k = 0; k < 4; k++) {
    int panel = sp[k];
    raw[panel - 1] = sc.slotMa[k];
    isc[panel - 1] = sc.slotMa[k] * factors[panel - 1];
    float mid = (k < 2) ? oc.mx : oc.my;          // top slots (S1, S3) see out − mid; bottom slots (S2, S4) see mid
    voc[panel - 1] = (k % 2 == 0) ? (oc.outV - mid) : mid;
  }
  float top = 0; for (int k = 0; k < 4; k++) top = fmaxf(top, isc[k]);
  float sorted[4]; for (int k = 0; k < 4; k++) sorted[k] = voc[k];
  for (int i = 0; i < 4; i++) for (int j = i + 1; j < 4; j++) if (sorted[j] < sorted[i]) { float t = sorted[i]; sorted[i] = sorted[j]; sorted[j] = t; }
  float medianVoc = (sorted[1] + sorted[2]) / 2;
  for (int k = 0; k < 4; k++) {
    score[k] = top > 0 ? isc[k] / top * 100 : 0;
    letters[k] = gradeLetter(score[k]);
    flags[k] = 0;
    if (score[k] < GRADE_B_PCT) flags[k] |= proto::F_WEAK;
    if (voc[k] < LOW_VOC_FRACTION * medianVoc) flags[k] |= proto::F_LOW_VOC;
    if (isc[k] < DARK_ISC_MA) flags[k] |= proto::F_DARK;
  }
  predicted = predictPairing(isc);
  proto::grade(Serial, millis(), isc, raw, voc, score, letters, flags, predicted);
  mode = (prev == M_GRADE) ? M_RUN : prev;
  if (mode == M_RUN) setPump(pumpWas);
  return true;
}

// ---------------------------------------------------------------- SWEEP (spec §11.3)
static bool discharge() {
  relaySet(R_CAP, false);
  relaySet(R_DIS, true);
  bool ok = waitMs(DISCHARGE_MS);
  relaySet(R_DIS, false);
  capDischarged = true;
  return ok;
}

static bool doSweep(SweepStats& st, bool send) {
  Mode prev = mode; mode = M_SWEEP;
  setPump(false);
  relaySet(R_SHORT, false);
  if (!discharge()) return false;
  if (!waitMs(10)) return false;
  if (!relaySet(R_CAP, true)) return false;
  binner.begin(ptsBuf, uno::SWEEP_POINTS, BIN_V);
  unsigned long t0 = millis();
  int n = 0; float firstI = -1; unsigned long lastFlatCheck = t0; float lastFlatV = -1; bool stop = false;
  while (!stop) {
    unsigned long t = millis() - t0;
    float v = readBusV(inaOut); float i = readCurrentMa(inaOut);
    if (t >= SWEEP_IGNORE_MS) {
      binner.add(v, i); n++;
      if (firstI < 0 && t > 20) firstI = i;
    }
    if (t > SWEEP_TIMEOUT_MS) stop = true;
    if (firstI > 0 && t > 50 && i < 0.01f * firstI) stop = true;
    if (t > 100 && millis() - lastFlatCheck >= SWEEP_FLAT_MS) {
      if (lastFlatV >= 0 && fabsf(v - lastFlatV) < SWEEP_FLAT_V) stop = true;
      lastFlatV = v; lastFlatCheck = millis();
    }
  }
  unsigned long took = millis() - t0;
  relaySet(R_CAP, false);
  discharge();
  int m = binner.finish();
  st = analyzeSweep(ptsBuf, m);
  st.n_raw = n;
  if (send) {
    proto::sweep(Serial, millis(), pairing, st.pmax_w, st.vmp_v, st.imp_ma, st.voc_v, st.isc_ma, st.ff, n, ptsBuf, m);
    Serial.print(F("{\"type\":\"log\",\"msg\":\"sweep ")); Serial.print(pairing); Serial.print(F(": "));
    Serial.print(n); Serial.print(F(" samples in ")); Serial.print(took); Serial.println(F(" ms\"}"));
  }
  mode = (prev == M_SWEEP) ? M_RUN : prev;
  return !abortRequested;
}

// ---------------------------------------------------------------- SEARCH
static int idx(char p) { return p - 'A'; }

static void doSearch() {
  mode = M_SEARCH;
  char predicted = 'A';
  if (!doGrade(predicted)) return;
  mode = M_SEARCH;
  const char order[3] = {'A', 'B', 'C'};
  for (int k = 0; k < 3; k++) {
    if (!setPairing(order[k], false)) return;
    SweepStats st;
    if (!doSweep(st, true)) return;
    mode = M_SEARCH;
    lastPmax[k] = st.pmax_w;
  }
  bestPairing = 'A'; worstPairing = 'A';
  for (int k = 1; k < 3; k++) {
    if (lastPmax[k] > lastPmax[idx(bestPairing)]) bestPairing = order[k];
    if (lastPmax[k] < lastPmax[idx(worstPairing)]) worstPairing = order[k];
  }
  haveSearch = true;
  proto::search(Serial, millis(), lastPmax, bestPairing, predicted);
  setPairing(bestPairing, true);
  mode = M_RUN;
}

// ---------------------------------------------------------------- PROOF and PUMPPROOF
static float measurePumpPower(char p) {
  if (!setPairing(p, true)) return 0;
  if (!waitMs(PUMP_SETTLE_MS)) return 0;
  float sum = 0; int n = 0; unsigned long t0 = millis();
  while (millis() - t0 < PUMP_WINDOW_MS - PUMP_SETTLE_MS) {
    sum += readBusV(inaOut) * readCurrentMa(inaOut) / 1000.0f; n++;
    if (!waitMs(50)) return 0;
  }
  return n ? sum / n : 0;
}

static void doProof(char baseArg, bool pumpKind) {
  if (!haveSearch) { ERR("run SEARCH first so PROOF knows the best and worst wirings"); return; }
  char base = (baseArg == 'A' || baseArg == 'B' || baseArg == 'C') ? baseArg : worstPairing;
  if (base == bestPairing) { ERR("baseline is the same as the best wiring"); return; }
  mode = pumpKind ? M_PUMPPROOF : M_PROOF;
  RunningStats rs;
  int cycles = pumpKind ? PUMPPROOF_CYCLES : PROOF_CYCLES;
  for (int c = 1; c <= cycles; c++) {
    char first = (c % 2 == 1) ? bestPairing : base;   // ABBA order
    char second = (first == bestPairing) ? base : bestPairing;
    float val[2] = {0, 0};
    const char seq[2] = {first, second};
    for (int s = 0; s < 2; s++) {
      if (pumpKind) { val[s] = measurePumpPower(seq[s]); }
      else { if (!setPairing(seq[s], false)) return; SweepStats st; if (!doSweep(st, false)) return; val[s] = st.pmax_w; }
      mode = pumpKind ? M_PUMPPROOF : M_PROOF;
      if (abortRequested) return;
    }
    float pBest = (first == bestPairing) ? val[0] : val[1];
    float pBase = (first == bestPairing) ? val[1] : val[0];
    if (pBase > 0) rs.add((double)pBest / pBase - 1.0);
    proto::proof(Serial, millis(), pumpKind, bestPairing, base, c, pBest, pBase, rs.mean * 100, rs.ci95() * 100);
  }
  setPairing(bestPairing, true);
  mode = M_RUN;
}

// ---------------------------------------------------------------- CAL
static void doCal(int box) {
  if (box < 1 || box > 4) { ERR("CAL needs a box number 1-4"); return; }
  Mode prev = mode; mode = M_CAL;
  // the reference panel is panel 1, which sits in slot S1 for every pairing
  setPump(false);
  relaySet(R_CAP, false);
  if (!relaySet(R_SHORT, true)) return;
  if (!waitMs(SHORT_SETTLE_MS)) { relaySet(R_SHORT, false); return; }
  Steady sc = readSteady();
  relaySet(R_SHORT, false);
  calReading[box - 1] = sc.slotMa[0];
  proto::calReading(Serial, box, sc.slotMa[0]);
  mode = (prev == M_CAL) ? M_RUN : prev;
  if (mode == M_RUN) setPump(true);
}

static void saveFactors() {
  for (int k = 0; k < 4; k++) if (calReading[k] <= 0) { ERR("measure all four boxes before CALSAVE"); return; }
  float mean = (calReading[0] + calReading[1] + calReading[2] + calReading[3]) / 4;
  for (int k = 0; k < 4; k++) factors[k] = mean / calReading[k];
  EEPROM.put(EE_FACTORS_ADDR, factors);
  EEPROM.update(EE_MAGIC_ADDR, EE_MAGIC);
  proto::calFactors(Serial, factors);
}

static void loadFactors() {
  if (EEPROM.read(EE_MAGIC_ADDR) != EE_MAGIC) return;   // never saved: keep 1, 1, 1, 1
  float f[4]; EEPROM.get(EE_FACTORS_ADDR, f);
  for (int k = 0; k < 4; k++) if (f[k] > 0.2f && f[k] < 5.0f) factors[k] = f[k];
}

// ---------------------------------------------------------------- serial commands
static char lineBuf[40];
static uint8_t lineLen = 0;

static bool eq(const char* a, const char* b) { return strcmp(a, b) == 0; }

static void handleCommand(char* line) {
  // upper-case and split into command and argument
  for (char* p = line; *p; p++) *p = toupper(*p);
  while (*line == ' ') line++;
  if (!*line) return;
  char* arg = strchr(line, ' ');
  if (arg) { *arg++ = 0; while (*arg == ' ') arg++; } else arg = line + strlen(line);
  char* end = arg + strlen(arg); while (end > arg && end[-1] == ' ') *--end = 0;

  if (eq(line, "STOP")) { if (busy) abortRequested = true; else { mode = M_RUN; setPump(true); LOG("stopped"); } return; }
  if (eq(line, "STATUS")) { sendHello(); return; }
  if (eq(line, "PUMP")) { bool on = eq(arg, "ON"); setPump(on); if (on) LOG("pump on"); else LOG("pump off"); return; }
  if (busy) { ERR("busy: send STOP first"); return; }

  busy = true; abortRequested = false;
  if (eq(line, "GRADE")) { char p; doGrade(p); }
  else if (eq(line, "SWEEP")) { SweepStats st; doSweep(st, true); }
  else if (eq(line, "SEARCH")) doSearch();
  else if (eq(line, "RUN")) {
    char p = *arg ? arg[0] : pairing;
    if (eq(arg, "BEST")) p = haveSearch ? bestPairing : pairing;
    if (p != 'A' && p != 'B' && p != 'C') ERR("RUN needs A, B, C or BEST");
    else {
      setPairing(p, true); mode = M_RUN;
      Serial.print(F("{\"type\":\"log\",\"msg\":\"running wiring ")); Serial.print(p); Serial.println(F("\"}"));
    }
  }
  else if (eq(line, "PROOF")) doProof(*arg ? arg[0] : 0, false);
  else if (eq(line, "PUMPPROOF")) doProof(*arg ? arg[0] : 0, true);
  else if (eq(line, "CAL")) doCal(atoi(arg));
  else if (eq(line, "CALSAVE")) saveFactors();
  else if (eq(line, "CALRESET")) {
    for (int k = 0; k < 4; k++) { factors[k] = 1; calReading[k] = 0; }
    EEPROM.update(EE_MAGIC_ADDR, 0xFF);
    proto::calFactors(Serial, factors);
  }
  else ERR("unknown command");
  if (abortRequested) {
    abortRequested = false; relaySet(R_CAP, false); relaySet(R_SHORT, false); relaySet(R_DIS, false);
    mode = M_RUN; setPump(true); LOG("stopped");
  }
  busy = false;
}

static void serviceSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (!lineLen) continue;
      lineBuf[lineLen] = 0; lineLen = 0;
      if (busy) {   // inside a procedure only STOP is honoured
        char* p = lineBuf; while (*p == ' ') p++;
        char up[6] = {0}; for (int k = 0; k < 5 && p[k]; k++) up[k] = toupper(p[k]);
        if (eq(up, "STOP")) abortRequested = true; else ERR("busy: send STOP first");
      } else {
        handleCommand(lineBuf);
      }
    } else if (lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
    }
  }
}

// ---------------------------------------------------------------- setup / loop
void setup() {
  // relays off before pinMode so nothing clicks at boot (active-LOW boards)
  for (int r = 0; r < R_COUNT; r++) { digitalWrite(RELAY_PIN[r], RELAY_ACTIVE_LOW ? HIGH : LOW); pinMode(RELAY_PIN[r], OUTPUT); relayOn[r] = false; }
  pinMode(uno::PIN_LED, OUTPUT);
  Serial.begin(115200);
  delay(200);

  Wire.begin();
  Wire.setClock(I2C_HZ);
  Adafruit_INA219* const all[5] = {&inaX1, &inaX2, &inaY1, &inaY2, &inaOut};
  static const char n0[] PROGMEM = "INA219 X1 0x40 not found";
  static const char n1[] PROGMEM = "INA219 X2 0x41 not found";
  static const char n2[] PROGMEM = "INA219 Y1 0x44 not found";
  static const char n3[] PROGMEM = "INA219 Y2 0x45 not found";
  static const char n4[] PROGMEM = "INA219 OUT 0x42 not found";
  const char* const names[5] = {n0, n1, n2, n3, n4};
  for (int k = 0; k < 5; k++) {
    if (all[k]->begin(&Wire)) all[k]->setCalibration_32V_2A();
    else proto::error(Serial, reinterpret_cast<const __FlashStringHelper*>(names[k]));
  }
  loadFactors();
  // boot state: pairing A, load connected, capacitor discharged once
  relaySet(R_DIS, true); delay(DISCHARGE_MS); relaySet(R_DIS, false); capDischarged = true;
  setPump(true);
  mode = M_RUN;
  sendHello();
}

void loop() {
  serviceSerial();
  serviceLive();
  digitalWrite(uno::PIN_LED, busy ? HIGH : ((millis() / 500) % 2));
  delay(2);
}
