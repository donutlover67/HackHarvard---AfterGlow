// Host tests for lib/solarlogic. Run: pio test -e native
#include <unity.h>
#include <math.h>
#include "solarlogic.h"
#include "protocol_out.h"
#include <string>
#include <cstdio>

using namespace solar;

void test_predict_pairs_like_with_like() {
  float a[4] = {150, 52, 150, 52};   // panels 2 and 4 dimmed -> 1+3 and 2+4 -> B
  TEST_ASSERT_EQUAL_CHAR('B', predictPairing(a));
  float b[4] = {150, 150, 52, 52};   // 1+2 and 3+4 -> A
  TEST_ASSERT_EQUAL_CHAR('A', predictPairing(b));
  float c[4] = {150, 52, 52, 150};   // 1+4 and 2+3 -> C
  TEST_ASSERT_EQUAL_CHAR('C', predictPairing(c));
  float d[4] = {100, 90, 80, 70};    // spread: 1+2, 3+4
  TEST_ASSERT_EQUAL_CHAR('A', predictPairing(d));
}

void test_slot_mapping_matches_spec() {
  int s[4];
  slotPanels('A', s); TEST_ASSERT_EQUAL_INT(1, s[0]); TEST_ASSERT_EQUAL_INT(2, s[1]); TEST_ASSERT_EQUAL_INT(3, s[2]); TEST_ASSERT_EQUAL_INT(4, s[3]);
  slotPanels('B', s); TEST_ASSERT_EQUAL_INT(1, s[0]); TEST_ASSERT_EQUAL_INT(3, s[1]); TEST_ASSERT_EQUAL_INT(2, s[2]); TEST_ASSERT_EQUAL_INT(4, s[3]);
  slotPanels('C', s); TEST_ASSERT_EQUAL_INT(1, s[0]); TEST_ASSERT_EQUAL_INT(4, s[1]); TEST_ASSERT_EQUAL_INT(3, s[2]); TEST_ASSERT_EQUAL_INT(2, s[3]);
}

void test_grade_thresholds() {
  TEST_ASSERT_EQUAL_CHAR('A', gradeLetter(100));
  TEST_ASSERT_EQUAL_CHAR('A', gradeLetter(90));
  TEST_ASSERT_EQUAL_CHAR('B', gradeLetter(89.9f));
  TEST_ASSERT_EQUAL_CHAR('B', gradeLetter(75));
  TEST_ASSERT_EQUAL_CHAR('C', gradeLetter(74.9f));
}

void test_sweep_bins_and_finds_pmax() {
  // a crude I-V curve: 300 mA flat, then falling to 0 at 13.6 V; 2 raw samples per 0.1 V
  RawSample raw[400]; int n = 0;
  for (float v = 0; v < 13.6f; v += 0.05f) {
    float i = v < 11.0f ? 300.0f : 300.0f * (13.6f - v) / 2.6f;
    raw[n++] = {v, i};
  }
  SweepPoint pts[80];
  int m = binSweep(raw, n, 0.1f, pts, 80);
  TEST_ASSERT_TRUE(m <= 80);
  TEST_ASSERT_TRUE(m >= 60);
  SweepStats st = analyzeSweep(pts, m);
  TEST_ASSERT_FLOAT_WITHIN(5.0f, 300.0f, st.isc_ma);
  TEST_ASSERT_FLOAT_WITHIN(0.3f, 13.6f, st.voc_v);
  TEST_ASSERT_FLOAT_WITHIN(0.4f, 11.1f, st.vmp_v);   // knee of the curve
  TEST_ASSERT_FLOAT_WITHIN(0.2f, 3.3f, st.pmax_w);
  TEST_ASSERT_TRUE(st.ff > 0.7f && st.ff < 0.9f);
}

void test_running_stats_ci() {
  RunningStats rs;
  double xs[] = {0.38, 0.40, 0.39, 0.41, 0.37};
  for (double x : xs) rs.add(x);
  TEST_ASSERT_EQUAL_INT(5, rs.n);
  TEST_ASSERT_DOUBLE_WITHIN(1e-9, 0.39, rs.mean);
  TEST_ASSERT_DOUBLE_WITHIN(1e-6, 0.0158114, rs.sd());
  TEST_ASSERT_DOUBLE_WITHIN(1e-6, 1.96 * 0.0158114 / sqrt(5.0), rs.ci95());
  RunningStats one; one.add(1.0);
  TEST_ASSERT_EQUAL_DOUBLE(0.0, one.ci95());
}


// ---- SweepBinner: the Uno's streaming sweep (fixed RAM) must find the same maximum power point as binSweep
static float diodeI(float v) { return 200.0f * (1.0f - expf((v - 13.2f) / 0.9f)); }   // a 2S2P-like I-V curve, mA

void test_binner_fits_any_sweep_and_keeps_pmax() {
  static RawSample raw[2400];
  int n = 0;
  for (int k = 0; k < 2400; k++) { float v = 13.2f * k / 2399.0f; float i = diodeI(v); if (i < 0) i = 0; raw[n++] = {v, i}; }
  static SweepPoint ref[80]; int m1 = binSweep(raw, n, 0.1f, ref, 80);
  SweepStats a = analyzeSweep(ref, m1);
  SweepPoint buf[40]; SweepBinner b; b.begin(buf, 40, 0.1f);
  for (int k = 0; k < n; k++) b.add(raw[k].v, raw[k].i_ma);
  int m2 = b.finish();
  TEST_ASSERT_TRUE(m2 <= 40 && m2 >= 20);
  for (int k = 1; k < m2; k++) TEST_ASSERT_TRUE(buf[k].v > buf[k - 1].v);   // still in rising voltage
  SweepStats c = analyzeSweep(buf, m2);
  TEST_ASSERT_FLOAT_WITHIN(0.02f * a.pmax_w, a.pmax_w, c.pmax_w);   // within 2% of the full-resolution curve
  TEST_ASSERT_FLOAT_WITHIN(0.3f, a.voc_v, c.voc_v);                 // the last point is kept unmerged
}

void test_binner_short_sweep_keeps_every_bin() {
  SweepPoint buf[40]; SweepBinner b; b.begin(buf, 40, 0.1f);
  for (int k = 0; k < 30; k++) b.add(0.05f + 0.1f * k, 100.0f);   // one sample per 0.1 V bin
  TEST_ASSERT_EQUAL_INT(30, b.finish());
  TEST_ASSERT_FLOAT_WITHIN(1e-4f, 0.1f, b.binWidth());
}

// ---- protocol_out: the Uno prints JSON by hand, so pin the exact lines (checked against protocol/samples with Python)
struct StrOut {
  std::string s;
  void print(const char* x) { s += x; }
  void print(char c) { s += c; }
  void print(int x) { s += std::to_string(x); }
  void print(long x) { s += std::to_string(x); }
  void print(unsigned long x) { s += std::to_string(x); }
  void print(double x, int d) { char b[48]; snprintf(b, sizeof b, "%.*f", d, x); s += b; }
  void println(const char* x) { s += x; s += "\n"; }
};

void test_protocol_lines_match_the_protocol() {
  StrOut o;
  int sp[4] = {1, 3, 2, 4}; float ma[4] = {141.2f, 141.4f, 49.1f, 49.8f};
  proto::live(o, 60800, "RUN", 'B', true, 8.2f, 197.6f, sp, ma);
  TEST_ASSERT_EQUAL_STRING("{\"type\":\"live\",\"t\":60800,\"mode\":\"RUN\",\"pairing\":\"B\",\"pump\":true,\"out\":{\"v\":8.20,\"i_ma\":197.6,\"p_w\":1.620},\"panels\":[{\"id\":1,\"slot\":\"S1\",\"i_ma\":141.2},{\"id\":3,\"slot\":\"S2\",\"i_ma\":141.4},{\"id\":2,\"slot\":\"S3\",\"i_ma\":49.1},{\"id\":4,\"slot\":\"S4\",\"i_ma\":49.8}]}" "\n", o.s.c_str());
  o.s.clear();
  float isc[4] = {149.7f, 52.7f, 149.7f, 52.4f}, voc[4] = {6.82f, 6.39f, 6.82f, 5.1f}, sc[4] = {100, 35.2f, 100, 35};
  char g[4] = {'A', 'C', 'A', 'C'}; unsigned fl[4] = {0, proto::F_WEAK, 0, proto::F_WEAK | proto::F_LOW_VOC};
  proto::grade(o, 1200, isc, isc, voc, sc, g, fl, 'B');
  TEST_ASSERT_EQUAL_STRING("{\"type\":\"grade\",\"t\":1200,\"panels\":[{\"id\":1,\"isc_ma\":149.7,\"isc_raw_ma\":149.7,\"voc_v\":6.82,\"score\":100.0,\"grade\":\"A\",\"flags\":[]},{\"id\":2,\"isc_ma\":52.7,\"isc_raw_ma\":52.7,\"voc_v\":6.39,\"score\":35.2,\"grade\":\"C\",\"flags\":[\"weak\"]},{\"id\":3,\"isc_ma\":149.7,\"isc_raw_ma\":149.7,\"voc_v\":6.82,\"score\":100.0,\"grade\":\"A\",\"flags\":[]},{\"id\":4,\"isc_ma\":52.4,\"isc_raw_ma\":52.4,\"voc_v\":5.10,\"score\":35.0,\"grade\":\"C\",\"flags\":[\"weak\",\"low_voc\"]}],\"predicted\":\"B\"}" "\n", o.s.c_str());
  o.s.clear();
  SweepPoint pts[3] = {{0.05f, 198.4f}, {6.1f, 190.2f}, {13.2f, 0}};
  proto::sweep(o, 2300, 'B', 2.04f, 10.6f, 192.4f, 13.2f, 198.4f, 0.778f, 812, pts, 3);
  TEST_ASSERT_EQUAL_STRING("{\"type\":\"sweep\",\"t\":2300,\"pairing\":\"B\",\"pmax_w\":2.040,\"vmp_v\":10.60,\"imp_ma\":192.4,\"voc_v\":13.20,\"isc_ma\":198.4,\"ff\":0.778,\"n\":812,\"pts\":[[0.05,198.4],[6.10,190.2],[13.20,0.0]]}" "\n", o.s.c_str());
  o.s.clear();
  float bad[4] = {NAN, 1, 1, 1};
  proto::calFactors(o, bad);   // a failed read prints null, never "nan", so the line stays valid JSON
  TEST_ASSERT_EQUAL_STRING("{\"type\":\"cal\",\"factors\":[null,1.000,1.000,1.000]}\n", o.s.c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_predict_pairs_like_with_like);
  RUN_TEST(test_slot_mapping_matches_spec);
  RUN_TEST(test_grade_thresholds);
  RUN_TEST(test_sweep_bins_and_finds_pmax);
  RUN_TEST(test_running_stats_ci);
  RUN_TEST(test_binner_fits_any_sweep_and_keeps_pmax);
  RUN_TEST(test_binner_short_sweep_keeps_every_bin);
  RUN_TEST(test_protocol_lines_match_the_protocol);
  return UNITY_END();
}
