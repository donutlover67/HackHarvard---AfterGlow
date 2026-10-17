// Drives the real Uno firmware (src/uno/main_uno.cpp) through a scripted session on the simulated bench and
// writes what it printed to a file. Usage: uno_sim <scenario> <transcript path>. Scenarios: demo (default),
// missing-out, weak-light, dark, no-film. Prints a JSON summary of the bench's observations on stdout.
#include "Arduino.h"
#include "bench.h"
#include <fstream>
#include <iostream>

void setup();
void loop();

static void idle(unsigned long ms) { unsigned long t0 = millis(); while (millis() - t0 < ms) loop(); }
static void cmd(const char* c, unsigned long settle = 400) { Serial.inject(c); loop(); idle(settle); }

int main(int argc, char** argv) {
  std::string scenario = argc > 1 ? argv[1] : "demo";
  std::string outPath = argc > 2 ? argv[2] : "transcript.jsonl";
  if (scenario == "missing-out") bench::cfg.sensorPresent[4] = false;
  if (scenario == "weak-light") bench::cfg.light = 0.08;      // halogen-at-a-distance territory: ~30 mA
  if (scenario == "dark") bench::cfg.light = 0.004;           // room light: ~1.5 mA, the "dark" flag
  if (scenario == "no-film") for (int k = 1; k <= 4; k++) bench::cfg.film[k] = false;
  bench::reset();

  setup(); idle(1000);                         // boot: hello, live
  cmd("STATUS");
  cmd("GRADE");
  cmd("grade");                                // lower case must work
  cmd("SEARCH");
  cmd("PROOF");
  cmd("RUN C"); cmd("RUN BEST");
  cmd("PUMP OFF"); cmd("PUMP ON");
  cmd("SWEEP");
  cmd("RUN Z"); cmd("FOO 1"); cmd("PROOF B");  // errors: bad arg, unknown, baseline == best when best is B
  Serial.inject("SEARCH"); Serial.inject("GRADE", millis() + 800); loop(); idle(400);     // busy rejection
  Serial.inject("PROOF"); Serial.inject("stop", millis() + 2500); loop(); idle(400);      // STOP mid-proof
  for (int box = 1; box <= 4; box++) { bench::cfg.refBox = box; char c[8]; snprintf(c, sizeof c, "CAL %d", box); cmd(c); }   // the person moves panel 1 box to box
  bench::cfg.refBox = 1;
  cmd("CALSAVE");
  setup(); idle(300);                          // reboot: factors must come back from EEPROM
  cmd("STATUS");
  cmd("GRADE");                                // graded with the saved factors
  cmd("PUMPPROOF");                            // refused: a reboot forgets the best wiring until the next SEARCH
  cmd("SEARCH");
  cmd("CALRESET");
  cmd("PUMPPROOF");
  idle(1000);

  std::ofstream f(outPath); f << Serial.out;
  std::cout << "{\"scenario\":\"" << scenario << "\",\"virtual_ms\":" << bench::stats.virtualMs
            << ",\"sensor_reads\":" << bench::stats.sensorReads
            << ",\"violations\":" << bench::stats.violations.size()
            << ",\"max_cap_v_at_cap_close\":" << bench::stats.maxCapVAtCapClose
            << ",\"transitions\":{\"stage1\":" << bench::stats.transitions[4] << ",\"stage2\":" << bench::stats.transitions[5]
            << ",\"short\":" << bench::stats.transitions[6] << ",\"cap\":" << bench::stats.transitions[7]
            << ",\"dis\":" << bench::stats.transitions[8] << ",\"load\":" << bench::stats.transitions[9] << "}"
            << ",\"model_isc_ma\":[" << bench::panelIsc_mA(1) << "," << bench::panelIsc_mA(2) << "," << bench::panelIsc_mA(3) << "," << bench::panelIsc_mA(4) << "]}\n";
  for (auto& v : bench::stats.violations) std::cerr << "VIOLATION " << v << "\n";
  return bench::stats.violations.empty() ? 0 : 1;
}
