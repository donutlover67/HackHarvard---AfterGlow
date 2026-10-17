#include "solarlogic.h"
#include <math.h>

namespace solar {

int binSweep(const RawSample* raw, int n, float binV, SweepPoint* out, int maxOut) {
  if (n <= 0 || maxOut <= 0) return 0;
  // samples arrive with rising voltage; walk them and average each bin
  int count = 0;
  int bin = -1; double sumV = 0, sumI = 0; int k = 0;
  SweepPoint tmp[1024];
  for (int s = 0; s < n; s++) {
    int b = (int)floorf(raw[s].v / binV);
    if (b != bin) {
      if (k > 0 && count < 1024) { tmp[count++] = { (float)(sumV / k), (float)(sumI / k) }; }
      bin = b; sumV = 0; sumI = 0; k = 0;
    }
    sumV += raw[s].v; sumI += raw[s].i_ma; k++;
  }
  if (k > 0 && count < 1024) tmp[count++] = { (float)(sumV / k), (float)(sumI / k) };
  if (count <= maxOut) { for (int i = 0; i < count; i++) out[i] = tmp[i]; return count; }
  // decimate evenly, keeping the first and last points
  for (int i = 0; i < maxOut; i++) {
    int src = (int)((long)i * (count - 1) / (maxOut - 1));
    out[i] = tmp[src];
  }
  return maxOut;
}

SweepStats analyzeSweep(const SweepPoint* pts, int n) {
  SweepStats st{0, 0, 0, 0, 0, 0, n};
  if (n <= 0) return st;
  st.isc_ma = pts[0].i_ma;
  st.voc_v = pts[n - 1].v;
  for (int i = 0; i < n; i++) {
    float p = pts[i].v * pts[i].i_ma / 1000.0f;
    if (p > st.pmax_w) { st.pmax_w = p; st.vmp_v = pts[i].v; st.imp_ma = pts[i].i_ma; }
  }
  float denom = st.isc_ma / 1000.0f * st.voc_v;
  st.ff = denom > 0 ? st.pmax_w / denom : 0;
  return st;
}

char predictPairing(const float isc[4]) {
  int order[4] = {0, 1, 2, 3};
  for (int i = 0; i < 4; i++)
    for (int j = i + 1; j < 4; j++)
      if (isc[order[j]] > isc[order[i]]) { int t = order[i]; order[i] = order[j]; order[j] = t; }
  // panel 0's partner decides the pairing: 1 -> A, 2 -> B, 3 -> C
  int partnerOfZero = -1;
  if (order[0] == 0) partnerOfZero = order[1];
  else if (order[1] == 0) partnerOfZero = order[0];
  else if (order[2] == 0) partnerOfZero = order[3];
  else partnerOfZero = order[2];
  return partnerOfZero == 1 ? 'A' : partnerOfZero == 2 ? 'B' : 'C';
}

void slotPanels(char pairing, int out[4]) {
  switch (pairing) {
    case 'B': out[0] = 1; out[1] = 3; out[2] = 2; out[3] = 4; break;
    case 'C': out[0] = 1; out[1] = 4; out[2] = 3; out[3] = 2; break;
    default:  out[0] = 1; out[1] = 2; out[2] = 3; out[3] = 4; break;
  }
}

char gradeLetter(float scorePct) {
  if (scorePct >= 90.0f) return 'A';
  if (scorePct >= 75.0f) return 'B';
  return 'C';
}

void RunningStats::add(double x) {
  n++;
  double delta = x - mean;
  mean += delta / n;
  m2 += delta * (x - mean);
}
double RunningStats::sd() const { return n > 1 ? sqrt(m2 / (n - 1)) : 0.0; }
double RunningStats::ci95() const { return n > 1 ? 1.96 * sd() / sqrt((double)n) : 0.0; }

}  // namespace solar
