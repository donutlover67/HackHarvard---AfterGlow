// Pure logic shared by the firmware and the host tests. No Arduino here.
#pragma once
#include <stddef.h>

namespace solar {

struct RawSample { float v; float i_ma; };
struct SweepPoint { float v; float i_ma; };
struct SweepStats { float pmax_w, vmp_v, imp_ma, voc_v, isc_ma, ff; int n_raw; };

// Bin raw samples into voltage bins of binV (averaging), then keep at most maxOut points.
int binSweep(const RawSample* raw, int n, float binV, SweepPoint* out, int maxOut);

// Streaming version of binSweep for boards with little RAM (the Uno has 2 KB): samples are binned as they
// arrive, in rising-voltage order, into the caller's buffer of `capacity` points. When the buffer fills, neighbouring
// points are averaged in pairs and the bin width doubles, so any sweep fits; the last point is kept unmerged so the
// open-circuit end of the curve is not pulled in.
struct SweepBinner {
  void begin(SweepPoint* buf, int capacity, float binV);
  void add(float v, float i_ma);
  int finish();             // flushes the open bin; returns the number of points in the buffer
  int count() const { return n_; }
  float binWidth() const { return binV_; }
 private:
  void push(float v, float i);
  void compact();
  SweepPoint* buf_ = nullptr; int cap_ = 0; int n_ = 0; float binV_ = 0.1f;
  long bin_ = -1; float sumV_ = 0, sumI_ = 0; int k_ = 0;
};

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
