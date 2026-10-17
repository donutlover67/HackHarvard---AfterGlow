// The JSON lines of protocol/PROTOCOL.md, printed field by field with no JSON library and no buffer, for boards
// with little RAM (the Uno build). Header-only and templated on the output, so the same code prints to Arduino's
// Serial on the board and to a string in the host tests (test/test_native). Not used by the ESP32 build, which
// keeps ArduinoJson.
//
// O must offer print(const char*) or print(TXT(...)), print(char), print(long), print(unsigned long), print(int),
// print(double, int) and println(). On Arduino, TXT() keeps every key in flash instead of the Uno's 2 KB of RAM.
#pragma once
#include <math.h>

#if defined(ARDUINO)
#include <Arduino.h>
#define TXT(s) F(s)
#else
#define TXT(s) (s)
#endif

namespace proto {

// A number with fixed decimals; NaN or infinity (a failed sensor read) prints null, which the dashboard rejects.
template <class O> void num(O& o, double x, int digits) {
  if (isnan(x) || isinf(x)) { o.print(TXT("null")); return; }
  o.print(x, digits);
}
template <class O> void letter(O& o, char c) { o.print('"'); o.print(c); o.print('"'); }
template <class O> void boolean(O& o, bool b) { o.print(b ? TXT("true") : TXT("false")); }

// flags bits for grade panels
constexpr unsigned F_WEAK = 1, F_LOW_VOC = 2, F_DARK = 4;

template <class O> void hello(O& o, const char* fw, const float factors[4], const char* mode, char pairing, bool pump) {
  o.print(TXT("{\"type\":\"hello\",\"fw\":\"")); o.print(fw); o.print(TXT("\",\"panels\":4,\"factors\":["));
  for (int k = 0; k < 4; k++) { if (k) o.print(','); num(o, factors[k], 3); }
  o.print(TXT("],\"mode\":\"")); o.print(mode); o.print(TXT("\",\"pairing\":")); letter(o, pairing);
  o.print(TXT(",\"pump\":")); boolean(o, pump); o.println(TXT("}"));
}

// slotPanel[k] is the panel in slot S(k+1); slotMa[k] its current.
template <class O> void live(O& o, unsigned long t, const char* mode, char pairing, bool pump,
                             float outV, float outMa, const int slotPanel[4], const float slotMa[4]) {
  o.print(TXT("{\"type\":\"live\",\"t\":")); o.print(t); o.print(TXT(",\"mode\":\"")); o.print(mode);
  o.print(TXT("\",\"pairing\":")); letter(o, pairing); o.print(TXT(",\"pump\":")); boolean(o, pump);
  o.print(TXT(",\"out\":{\"v\":")); num(o, outV, 2); o.print(TXT(",\"i_ma\":")); num(o, outMa, 1);
  o.print(TXT(",\"p_w\":")); num(o, outV * outMa / 1000.0, 3); o.print(TXT("},\"panels\":["));
  for (int k = 0; k < 4; k++) {
    if (k) o.print(',');
    o.print(TXT("{\"id\":")); o.print(slotPanel[k]); o.print(TXT(",\"slot\":\"S")); o.print(k + 1);
    o.print(TXT("\",\"i_ma\":")); num(o, slotMa[k], 1); o.print('}');
  }
  o.println(TXT("]}"));
}

// Arrays are indexed by panel (0 = panel 1).
template <class O> void grade(O& o, unsigned long t, const float isc[4], const float iscRaw[4], const float voc[4],
                              const float score[4], const char gradeOf[4], const unsigned flags[4], char predicted) {
  o.print(TXT("{\"type\":\"grade\",\"t\":")); o.print(t); o.print(TXT(",\"panels\":["));
  for (int k = 0; k < 4; k++) {
    if (k) o.print(',');
    o.print(TXT("{\"id\":")); o.print(k + 1);
    o.print(TXT(",\"isc_ma\":")); num(o, isc[k], 1); o.print(TXT(",\"isc_raw_ma\":")); num(o, iscRaw[k], 1);
    o.print(TXT(",\"voc_v\":")); num(o, voc[k], 2); o.print(TXT(",\"score\":")); num(o, score[k], 1);
    o.print(TXT(",\"grade\":")); letter(o, gradeOf[k]); o.print(TXT(",\"flags\":["));
    bool first = true;
    if (flags[k] & F_WEAK) { o.print(TXT("\"weak\"")); first = false; }
    if (flags[k] & F_LOW_VOC) { if (!first) o.print(','); o.print(TXT("\"low_voc\"")); first = false; }
    if (flags[k] & F_DARK) { if (!first) o.print(','); o.print(TXT("\"dark\"")); }
    o.print(TXT("]}"));
  }
  o.print(TXT("],\"predicted\":")); letter(o, predicted); o.println(TXT("}"));
}

template <class Pt, class O> void sweep(O& o, unsigned long t, char pairing, float pmax, float vmp, float imp, float voc,
                                        float isc, float ff, int nRaw, const Pt* pts, int m) {
  o.print(TXT("{\"type\":\"sweep\",\"t\":")); o.print(t); o.print(TXT(",\"pairing\":")); letter(o, pairing);
  o.print(TXT(",\"pmax_w\":")); num(o, pmax, 3); o.print(TXT(",\"vmp_v\":")); num(o, vmp, 2);
  o.print(TXT(",\"imp_ma\":")); num(o, imp, 1); o.print(TXT(",\"voc_v\":")); num(o, voc, 2);
  o.print(TXT(",\"isc_ma\":")); num(o, isc, 1); o.print(TXT(",\"ff\":")); num(o, ff, 3);
  o.print(TXT(",\"n\":")); o.print(nRaw); o.print(TXT(",\"pts\":["));
  for (int k = 0; k < m; k++) {
    if (k) o.print(',');
    o.print('['); num(o, pts[k].v, 2); o.print(','); num(o, pts[k].i_ma, 1); o.print(']');
  }
  o.println(TXT("]}"));
}

// pmax indexed A, B, C
template <class O> void search(O& o, unsigned long t, const float pmax[3], char best, char predicted) {
  o.print(TXT("{\"type\":\"search\",\"t\":")); o.print(t); o.print(TXT(",\"pmax_w\":{\"A\":")); num(o, pmax[0], 3);
  o.print(TXT(",\"B\":")); num(o, pmax[1], 3); o.print(TXT(",\"C\":")); num(o, pmax[2], 3);
  o.print(TXT("},\"best\":")); letter(o, best); o.print(TXT(",\"predicted\":")); letter(o, predicted);
  o.print(TXT(",\"match\":")); boolean(o, best == predicted); o.println(TXT("}"));
}

template <class O> void proof(O& o, unsigned long t, bool pumpKind, char best, char base, int cycle,
                              float pBest, float pBase, float gainPct, float ciPct) {
  o.print(TXT("{\"type\":\"proof\",\"t\":")); o.print(t);
  o.print(pumpKind ? TXT(",\"kind\":\"pump\"") : TXT(",\"kind\":\"sweep\""));
  o.print(TXT(",\"best\":")); letter(o, best); o.print(TXT(",\"base\":")); letter(o, base);
  o.print(TXT(",\"cycle\":")); o.print(cycle); o.print(TXT(",\"p_best_w\":")); num(o, pBest, 3);
  o.print(TXT(",\"p_base_w\":")); num(o, pBase, 3); o.print(TXT(",\"gain_pct\":")); num(o, gainPct, 1);
  o.print(TXT(",\"ci95_pct\":")); num(o, ciPct, 1); o.println(TXT("}"));
}

template <class O> void calReading(O& o, int box, float ma) {
  o.print(TXT("{\"type\":\"cal\",\"box\":")); o.print(box); o.print(TXT(",\"reading_ma\":")); num(o, ma, 1); o.println(TXT("}"));
}
template <class O> void calFactors(O& o, const float factors[4]) {
  o.print(TXT("{\"type\":\"cal\",\"factors\":["));
  for (int k = 0; k < 4; k++) { if (k) o.print(','); num(o, factors[k], 3); }
  o.println(TXT("]}"));
}

// msg must not contain quotes or backslashes (all callers pass fixed text).
template <class O, class S> void log(O& o, S msg) { o.print(TXT("{\"type\":\"log\",\"msg\":\"")); o.print(msg); o.println(TXT("\"}")); }
template <class O, class S> void error(O& o, S msg) { o.print(TXT("{\"type\":\"error\",\"msg\":\"")); o.print(msg); o.println(TXT("\"}")); }

}  // namespace proto
