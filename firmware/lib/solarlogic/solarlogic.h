// Pure logic shared by the firmware and the host tests. No Arduino here.
#pragma once
#include <stddef.h>

namespace solar {

struct RawSample { float v; float i_ma; };
struct SweepPoint { float v; float i_ma; };
struct SweepStats { float pmax_w, vmp_v, imp_ma, voc_v, isc_ma, ff; int n_raw; };

// Bin raw samples into voltage bins of binV (averaging), then keep at most maxOut points.
int binSweep(const RawSample* raw, int n, float binV, SweepPoint* out, int maxOut);

// Maximum power point and the end points of a binned curve.
SweepStats analyzeSweep(const SweepPoint* pts, int n);

// Pair the two highest-current panels together and the two lowest together. Returns 'A', 'B' or 'C'.
char predictPairing(const float isc[4]);

// Which panel sits in each slot (S1..S4) for a pairing. Panels are 1-based.
void slotPanels(char pairing, int out[4]);

char gradeLetter(float scorePct);

// Running mean and 95% confidence half-width (Welford).
struct RunningStats {
  int n = 0; double mean = 0; double m2 = 0;
  void add(double x);
  double sd() const;
  double ci95() const;   // 1.96 * sd / sqrt(n); 0 when n < 2
};

}  // namespace solar
