# Host simulator for the Uno firmware

Runs `src/uno/main_uno.cpp` unchanged on a Mac or Linux box, against `fake/` (a stand-in Arduino core, Wire, EEPROM and INA219) and `bench.cpp` (the simulated bench). See `firmware/CLAUDE.md` for the build line and what it covers. `sim_main.cpp` is the script; `validate.py` checks the transcript. Pins, addresses and the divider ratio in `bench.cpp` mirror `include/config_uno.h`: change both together.
