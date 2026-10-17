// Second String firmware: grades four panels, switches the 2S2P pairing with relays,
// sweeps I-V curves with a capacitor and reports everything as JSON lines over USB serial.
// Procedures follow docs/spec-v2.md §11.3; interlocks §11.4; messages protocol/PROTOCOL.md.
//
// NOT YET RUN ON HARDWARE. It compiles; the relay logic level, the I2C addresses and the
// divider ratio must be checked against docs/hardware.md before the first flash.

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <math.h>
#include "config.h"
#include "solarlogic.h"

using namespace solar;

// ---------------------------------------------------------------- state
enum Mode { M_IDLE, M_RUN, M_GRADE, M_SWEEP, M_SEARCH, M_PROOF, M_PUMPPROOF, M_CAL };
static const char* MODE_NAMES[] = {"IDLE", "RUN", "GRADE", "SWEEP", "SEARCH", "PROOF", "PUMPPROOF", "CAL"};

enum Relay { R_STAGE1, R_STAGE2, R_SHORT, R_CAP, R_DIS, R_LOAD, R_COUNT };
static const int RELAY_PIN[R_COUNT] = {PIN_STAGE1, PIN_STAGE2, PIN_K_SHORT, PIN_K_CAP, PIN_K_DIS, PIN_K_LOAD};

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
static uint32_t lastLiveMs = 0;
static int sensorFails = 0;
static Preferences prefs;

static Adafruit_INA219 inaX1(ADDR_X1), inaX2(ADDR_X2), inaY1(ADDR_Y1), inaY2(ADDR_Y2), inaOut(ADDR_OUT);
static Adafruit_INA219* slotSensor[4] = {&inaX1, &inaX2, &inaY1, &inaY2};   // S1..S4
static bool sensorOk[5] = {false, false, false, false, false};

static RawSample rawBuf[MAX_RAW_SAMPLES];
static SweepPoint ptsBuf[MAX_SWEEP_POINTS];

// ---------------------------------------------------------------- output
static void sendLog(const char* msg) {
  JsonDocument d; d["type"] = "log"; d["msg"] = msg; serializeJson(d, Serial); Serial.println();
}
static void sendError(const String& msg) {
  JsonDocument d; d["type"] = "error"; d["msg"] = msg; serializeJson(d, Serial); Serial.println();
}
static bool pumpConnected() { return !relayOn[R_LOAD]; }   // K_LOAD's NC contact feeds the pump

static void sendHello() {
  JsonDocument d;
  d["type"] = "hello"; d["fw"] = FW_VERSION; d["panels"] = 4;
  JsonArray f = d["factors"].to<JsonArray>();
  for (int k = 0; k < 4; k++) f.add(factors[k]);
  d["mode"] = MODE_NAMES[mode]; d["pairing"] = String(pairing); d["pump"] = pumpConnected();
  serializeJson(d, Serial); Serial.println();
}

// ---------------------------------------------------------------- relays with interlocks (spec §11.4)
static void relayRaw(Relay r, bool on) {
  digitalWrite(RELAY_PIN[r], (on != RELAY_ACTIVE_LOW) ? HIGH : LOW);
  relayOn[r] = on;
}
static bool relaySet(Relay r, bool on) {
  if (on) {
    if (r == R_SHORT && relayOn[R_CAP]) { sendError("interlock: K_SHORT while K_CAP closed"); return false; }
    if (r == R_CAP && relayOn[R_SHORT]) { sendError("interlock: K_CAP while K_SHORT closed"); return false; }
    if (r == R_CAP && !capDischarged) { sendError("interlock: K_CAP before discharge"); return false; }
    if (r == R_STAGE1 && relayOn[R_STAGE2]) { sendError("interlock: both stages"); return false; }
    if (r == R_STAGE2 && relayOn[R_STAGE1]) { sendError("interlock: both stages"); return false; }
    if (r == R_CAP) capDischarged = false;
  }
  relayRaw(r, on);
  return true;
}
static void setPump(bool connected) { relayRaw(R_LOAD, !connected); }

// ---------------------------------------------------------------- sensors
static float readCurrentMa(Adafruit_INA219& ina) { return ina.getShuntVoltage_mV() / SHUNT_OHM; }
static float readBusV(Adafruit_INA219& ina) { return ina.getBusVoltage_V() + ina.getShuntVoltage_mV() / 1000.0f; }
static float readNodeV(int pin) { return analogReadMilliVolts(pin) / 1000.0f * DIVIDER_GAIN; }

struct Steady { float slotMa[4]; float outV; float outMa; float mx; float my; };

static void serviceLive();   // forward

// Wait while still sending live messages and listening for STOP.
static void serviceSerial();
static bool waitMs(uint32_t ms) {
  uint32_t t0 = millis();
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
  uint32_t t0 = millis();
  while (millis() - t0 < STEADY_MS) {
    for (int k = 0; k < 4; k++) s.slotMa[k] += fabsf(readCurrentMa(*slotSensor[k]));
    s.outV += readBusV(inaOut);
    s.outMa += readCurrentMa(inaOut);
    s.mx += readNodeV(PIN_MX);
    s.my += readNodeV(PIN_MY);
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
  if (!waitMs(SWITCH_GAP_MS)) return false;
  // never both stages: turn the other one off first
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
  JsonDocument d;
  d["type"] = "live"; d["t"] = millis(); d["mode"] = MODE_NAMES[mode];
  d["pairing"] = String(pairing); d["pump"] = pumpConnected();
  float v = readBusV(inaOut); float i = readCurrentMa(inaOut);
  JsonObject out = d["out"].to<JsonObject>();
  out["v"] = roundf(v * 100) / 100; out["i_ma"] = roundf(i * 10) / 10; out["p_w"] = roundf(v * i) / 1000.0f;
  int sp[4]; slotPanels(pairing, sp);
  JsonArray panels = d["panels"].to<JsonArray>();
  for (int k = 0; k < 4; k++) {
    JsonObject p = panels.add<JsonObject>();
    p["id"] = sp[k]; p["slot"] = String("S") + (k + 1);
    p["i_ma"] = roundf(fabsf(readCurrentMa(*slotSensor[k])) * 10) / 10;
  }
  serializeJson(d, Serial); Serial.println();
}

// ---------------------------------------------------------------- GRADE (spec §11.3)
struct GradeResult { float isc[4]; float voc[4]; float score[4]; char predicted; };

static bool doGrade(GradeResult& g) {
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
  float raw[4], corrected[4];
  for (int k = 0; k < 4; k++) {
    int panel = sp[k];
    raw[panel - 1] = sc.slotMa[k];
    corrected[panel - 1] = sc.slotMa[k] * factors[panel - 1];
    // top slots (S1, S3) see out − mid; bottom slots (S2, S4) see mid
    float mid = (k < 2) ? oc.mx : oc.my;
    g.voc[panel - 1] = (k % 2 == 0) ? (oc.outV - mid) : mid;
    g.isc[panel - 1] = corrected[panel - 1];
  }
  float top = 0; for (int k = 0; k < 4; k++) top = fmaxf(top, corrected[k]);
  float sortedVoc[4]; for (int k = 0; k < 4; k++) sortedVoc[k] = g.voc[k];
  for (int i = 0; i < 4; i++) for (int j = i + 1; j < 4; j++) if (sortedVoc[j] < sortedVoc[i]) { float t = sortedVoc[i]; sortedVoc[i] = sortedVoc[j]; sortedVoc[j] = t; }
  float medianVoc = (sortedVoc[1] + sortedVoc[2]) / 2;
  g.predicted = predictPairing(corrected);

  JsonDocument d;
  d["type"] = "grade"; d["t"] = millis();
  JsonArray panels = d["panels"].to<JsonArray>();
  for (int k = 0; k < 4; k++) {
    g.score[k] = top > 0 ? corrected[k] / top * 100 : 0;
    JsonObject p = panels.add<JsonObject>();
    p["id"] = k + 1;
    p["isc_ma"] = roundf(corrected[k] * 10) / 10;
    p["isc_raw_ma"] = roundf(raw[k] * 10) / 10;
    p["voc_v"] = roundf(g.voc[k] * 100) / 100;
    p["score"] = roundf(g.score[k] * 10) / 10;
    p["grade"] = String(gradeLetter(g.score[k]));
    JsonArray flags = p["flags"].to<JsonArray>();
    if (g.score[k] < GRADE_B_PCT) flags.add("weak");
    if (g.voc[k] < LOW_VOC_FRACTION * medianVoc) flags.add("low_voc");
    if (corrected[k] < DARK_ISC_MA) flags.add("dark");
  }
  d["predicted"] = String(g.predicted);
  serializeJson(d, Serial); Serial.println();
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
  uint32_t t0 = millis();
  int n = 0; float firstI = -1; uint32_t lastFlatCheck = t0; float lastFlatV = -1; bool stop = false;
  while (!stop) {
    uint32_t t = millis() - t0;
    float v = readBusV(inaOut); float i = readCurrentMa(inaOut);
    if (t >= SWEEP_IGNORE_MS && n < MAX_RAW_SAMPLES) {
      rawBuf[n++] = {v, i};
      if (firstI < 0 && t > 20) firstI = i;
    }
    if (t > SWEEP_TIMEOUT_MS) stop = true;
    if (firstI > 0 && t > 50 && i < 0.01f * firstI) stop = true;
    if (t > 100 && millis() - lastFlatCheck >= SWEEP_FLAT_MS) {
      if (lastFlatV >= 0 && fabsf(v - lastFlatV) < SWEEP_FLAT_V) stop = true;
      lastFlatV = v; lastFlatCheck = millis();
    }
  }
  uint32_t took = millis() - t0;
  relaySet(R_CAP, false);
  discharge();
  int m = binSweep(rawBuf, n, BIN_V, ptsBuf, MAX_SWEEP_POINTS);
  st = analyzeSweep(ptsBuf, m);
  st.n_raw = n;
  if (send) {
    JsonDocument d;
    d["type"] = "sweep"; d["t"] = millis(); d["pairing"] = String(pairing);
    d["pmax_w"] = roundf(st.pmax_w * 1000) / 1000; d["vmp_v"] = roundf(st.vmp_v * 100) / 100;
    d["imp_ma"] = roundf(st.imp_ma * 10) / 10; d["voc_v"] = roundf(st.voc_v * 100) / 100;
    d["isc_ma"] = roundf(st.isc_ma * 10) / 10; d["ff"] = roundf(st.ff * 1000) / 1000; d["n"] = n;
    JsonArray pts = d["pts"].to<JsonArray>();
    for (int k = 0; k < m; k++) { JsonArray p = pts.add<JsonArray>(); p.add(roundf(ptsBuf[k].v * 100) / 100); p.add(roundf(ptsBuf[k].i_ma * 10) / 10); }
    serializeJson(d, Serial); Serial.println();
    char msg[64]; snprintf(msg, sizeof msg, "sweep %c: %d samples in %lu ms", pairing, n, (unsigned long)took); sendLog(msg);
  }
  mode = (prev == M_SWEEP) ? M_RUN : prev;
  return !abortRequested;
}

// ---------------------------------------------------------------- SEARCH
static int idx(char p) { return p - 'A'; }

static void doSearch() {
  mode = M_SEARCH;
  GradeResult g;
  if (!doGrade(g)) return;
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
  for (int k = 1; k < 3; k++) { if (lastPmax[k] > lastPmax[idx(bestPairing)]) bestPairing = order[k]; if (lastPmax[k] < lastPmax[idx(worstPairing)]) worstPairing = order[k]; }
  haveSearch = true;
  JsonDocument d;
  d["type"] = "search"; d["t"] = millis();
  JsonObject pm = d["pmax_w"].to<JsonObject>();
  pm["A"] = roundf(lastPmax[0] * 1000) / 1000; pm["B"] = roundf(lastPmax[1] * 1000) / 1000; pm["C"] = roundf(lastPmax[2] * 1000) / 1000;
  d["best"] = String(bestPairing); d["predicted"] = String(g.predicted); d["match"] = (bestPairing == g.predicted);
  serializeJson(d, Serial); Serial.println();
  setPairing(bestPairing, true);
  mode = M_RUN;
}

// ---------------------------------------------------------------- PROOF and PUMPPROOF
static float measurePumpPower(char p) {
  if (!setPairing(p, true)) return 0;
  if (!waitMs(PUMP_SETTLE_MS)) return 0;
  double sum = 0; int n = 0; uint32_t t0 = millis();
  while (millis() - t0 < PUMP_WINDOW_MS - PUMP_SETTLE_MS) {
    float v = readBusV(inaOut); float i = readCurrentMa(inaOut);
    sum += v * i / 1000.0; n++;
    if (!waitMs(50)) return 0;
  }
  return n ? (float)(sum / n) : 0;
}

static void doProof(char baseArg, bool pumpKind) {
  if (!haveSearch) { sendError("run SEARCH first so PROOF knows the best and worst wirings"); return; }
  char base = (baseArg == 'A' || baseArg == 'B' || baseArg == 'C') ? baseArg : worstPairing;
  if (base == bestPairing) { sendError("baseline is the same as the best wiring"); return; }
  mode = pumpKind ? M_PUMPPROOF : M_PROOF;
  RunningStats rs;
  int cycles = pumpKind ? PUMPPROOF_CYCLES : PROOF_CYCLES;
  for (int c = 1; c <= cycles; c++) {
    char first = (c % 2 == 1) ? bestPairing : base;
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
    JsonDocument d;
    d["type"] = "proof"; d["t"] = millis(); d["kind"] = pumpKind ? "pump" : "sweep";
    d["best"] = String(bestPairing); d["base"] = String(base); d["cycle"] = c;
    d["p_best_w"] = roundf(pBest * 1000) / 1000; d["p_base_w"] = roundf(pBase * 1000) / 1000;
    d["gain_pct"] = roundf(rs.mean * 1000) / 10; d["ci95_pct"] = roundf(rs.ci95() * 1000) / 10;
    serializeJson(d, Serial); Serial.println();
  }
  setPairing(bestPairing, true);
  mode = M_RUN;
}

// ---------------------------------------------------------------- CAL
static void sendCalFactors() {
  JsonDocument d; d["type"] = "cal";
  JsonArray f = d["factors"].to<JsonArray>();
  for (int k = 0; k < 4; k++) f.add(roundf(factors[k] * 1000) / 1000);
  serializeJson(d, Serial); Serial.println();
}

static void doCal(int box) {
  if (box < 1 || box > 4) { sendError("CAL needs a box number 1-4"); return; }
  Mode prev = mode; mode = M_CAL;
  // the reference panel is panel 1, wired as P1, which sits in slot S1 for every pairing
  setPump(false);
  relaySet(R_CAP, false);
  if (!relaySet(R_SHORT, true)) return;
  if (!waitMs(SHORT_SETTLE_MS)) { relaySet(R_SHORT, false); return; }
  Steady sc = readSteady();
  relaySet(R_SHORT, false);
  calReading[box - 1] = sc.slotMa[0];
  JsonDocument d; d["type"] = "cal"; d["box"] = box; d["reading_ma"] = roundf(sc.slotMa[0] * 10) / 10;
  serializeJson(d, Serial); Serial.println();
  mode = (prev == M_CAL) ? M_RUN : prev;
  if (mode == M_RUN) setPump(true);
}

static void saveFactors() {
  for (int k = 0; k < 4; k++) if (calReading[k] <= 0) { sendError("measure all four boxes before CALSAVE"); return; }
  float mean = (calReading[0] + calReading[1] + calReading[2] + calReading[3]) / 4;
  prefs.begin("second", false);
  for (int k = 0; k < 4; k++) {
    const char key[3] = {'f', (char)('0' + k), 0};
    factors[k] = mean / calReading[k];
    prefs.putFloat(key, factors[k]);
  }
  prefs.end();
  sendCalFactors();
}

static void loadFactors() {
  prefs.begin("second", true);
  for (int k = 0; k < 4; k++) {
    const char key[3] = {'f', (char)('0' + k), 0};
    factors[k] = prefs.getFloat(key, 1.0f);
  }
  prefs.end();
}

// ---------------------------------------------------------------- serial commands
static String lineBuf;

static void handleCommand(String line) {
  line.trim(); line.toUpperCase();
  if (!line.length()) return;
  int sp = line.indexOf(' ');
  String cmd = sp > 0 ? line.substring(0, sp) : line;
  String arg = sp > 0 ? line.substring(sp + 1) : ""; arg.trim();

  if (cmd == "STOP") { if (busy) abortRequested = true; else { mode = M_RUN; setPump(true); sendLog("stopped"); } return; }
  if (cmd == "STATUS") { sendHello(); return; }
  if (cmd == "PUMP") { setPump(arg == "ON"); sendLog(arg == "ON" ? "pump on" : "pump off"); return; }
  if (busy) { sendError("busy: send STOP first"); return; }

  busy = true; abortRequested = false;
  if (cmd == "GRADE") { GradeResult g; doGrade(g); }
  else if (cmd == "SWEEP") { SweepStats st; doSweep(st, true); }
  else if (cmd == "SEARCH") doSearch();
  else if (cmd == "RUN") {
    char p = arg.length() ? arg[0] : pairing;
    if (arg == "BEST") p = haveSearch ? bestPairing : pairing;
    if (p != 'A' && p != 'B' && p != 'C') sendError("RUN needs A, B, C or BEST");
    else { setPairing(p, true); mode = M_RUN; char m[32]; snprintf(m, sizeof m, "running wiring %c", p); sendLog(m); }
  }
  else if (cmd == "PROOF") doProof(arg.length() ? arg[0] : 0, false);
  else if (cmd == "PUMPPROOF") doProof(arg.length() ? arg[0] : 0, true);
  else if (cmd == "CAL") doCal(arg.toInt());
  else if (cmd == "CALSAVE") saveFactors();
  else if (cmd == "CALRESET") { for (int k = 0; k < 4; k++) { factors[k] = 1; calReading[k] = 0; } prefs.begin("second", false); prefs.clear(); prefs.end(); sendCalFactors(); }
  else sendError("unknown command");
  if (abortRequested) { abortRequested = false; relaySet(R_CAP, false); relaySet(R_SHORT, false); relaySet(R_DIS, false); mode = M_RUN; setPump(true); sendLog("stopped"); }
  busy = false;
}

static void serviceSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (lineBuf.length()) {
        String line = lineBuf; lineBuf = "";
        if (busy) {   // inside a procedure only STOP is honoured
          String up = line; up.trim(); up.toUpperCase();
          if (up == "STOP") abortRequested = true; else sendError("busy: send STOP first");
        } else {
          handleCommand(line);
        }
      }
    } else if (lineBuf.length() < 64) {
      lineBuf += c;
    }
  }
}

// ---------------------------------------------------------------- setup / loop
void setup() {
  // relays off before pinMode so nothing clicks at boot (active-LOW boards)
  for (int r = 0; r < R_COUNT; r++) { digitalWrite(RELAY_PIN[r], RELAY_ACTIVE_LOW ? HIGH : LOW); pinMode(RELAY_PIN[r], OUTPUT); relayOn[r] = false; }
  pinMode(PIN_LED, OUTPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_MX, ADC_11db);
  analogSetPinAttenuation(PIN_MY, ADC_11db);
  Serial.begin(115200);
  delay(200);

  Wire.begin(PIN_SDA0, PIN_SCL0, I2C_HZ);
  Wire1.begin(PIN_SDA1, PIN_SCL1, I2C_HZ);
  sensorOk[0] = inaX1.begin(&Wire); sensorOk[1] = inaX2.begin(&Wire);
  sensorOk[2] = inaY1.begin(&Wire); sensorOk[3] = inaY2.begin(&Wire);
  sensorOk[4] = inaOut.begin(&Wire1);
  Adafruit_INA219* all[5] = {&inaX1, &inaX2, &inaY1, &inaY2, &inaOut};
  const char* names[5] = {"X1 0x40 on Wire", "X2 0x41 on Wire", "Y1 0x44 on Wire", "Y2 0x45 on Wire", "OUT 0x40 on Wire1"};
  for (int k = 0; k < 5; k++) {
    if (sensorOk[k]) all[k]->setCalibration_32V_2A();
    else sendError(String("INA219 ") + names[k] + " not found");
  }
  loadFactors();
  // boot state: pairing A, pump connected, capacitor discharged once
  relaySet(R_DIS, true); delay(DISCHARGE_MS); relaySet(R_DIS, false); capDischarged = true;
  setPump(true);
  mode = M_RUN;
  sendHello();
}

void loop() {
  serviceSerial();
  serviceLive();
  digitalWrite(PIN_LED, busy ? HIGH : ((millis() / 500) % 2));
  delay(2);
}
