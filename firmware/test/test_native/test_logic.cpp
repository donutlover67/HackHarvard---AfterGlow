// Host tests for lib/solarlogic. Run: pio test -e native
#include <unity.h>
#include <math.h>
#include "solarlogic.h"

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

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_predict_pairs_like_with_like);
  RUN_TEST(test_slot_mapping_matches_spec);
  RUN_TEST(test_grade_thresholds);
  RUN_TEST(test_sweep_bins_and_finds_pmax);
  RUN_TEST(test_running_stats_ci);
  return UNITY_END();
}
