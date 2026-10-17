# Project description v2 (paste this whole file into the code generator)

## 0. Instructions for the code generator

Generate two deliverables from this description.

1. **ESP32 firmware.** Use the Arduino framework (arduino-esp32 core 2.x or 3.x) with the Adafruit_INA219 and ArduinoJson (v7) libraries. Turn Wi-Fi off.
2. **Dashboard.** `dashboard/index.html`, `css/style.css` and ES modules under `js/`. Charts are drawn by hand in SVG; the only vendored asset is a font. Don't load anything from a CDN: the dashboard must work with no internet. It talks to the ESP32 over USB through Chrome's Web Serial API and is served locally with `python3 -m http.server`.

Follow the pin map, relay table, interlocks and serial protocol in section 11 exactly. They match the wiring the hardware team is building. Every number in this document is a default: put each one in a named constant at the top of its file. The dashboard must include a mock mode that generates realistic fake messages, so the UI can be built before the hardware exists.

---

## 1. Pitch

We grade used solar panels by measuring them, then automatically find the wiring that gets the most power out of them. We prove the gain live: the system measures the maximum power of every possible wiring, picks the best one, and runs a water pump from it.

## 2. The problem

Solar panels lose about 0.5 to 0.75% of their output per year, so after 25 years most still produce 80 to 88% of their rated power. Many are retired even earlier, when plants are upgraded; NREL says early-retired panels often still produce 70 to 95%. Yet NREL estimates that most retired US panels are landfilled, fewer than 10% are recycled, and about 1% are reused.

A major barrier is testing. A lab flash test plus electroluminescence imaging costs about €16 to €31 per panel, against roughly €50 for a new panel, and there is no agreed pass/fail retest for used panels yet; an IEC specification is still in progress. So buyers can't cheaply tell which used panels are worth reusing. (The other big barrier is simply that new panels are cheap.)

The second problem is mismatch. When panels with different output currents are wired in series, the whole string carries only about the current of the lowest-current panel, so the higher-current panels' extra current is wasted. Manufacturers already sort new panels into current classes so installers can put one class per string, and research has shown that rewiring degraded plants helps. Used panels arrive in mixed batches with no trustworthy data, so there is nothing to sort by. We measure that data in place, cheaply, and verify the wiring automatically.

Microinverters and DC (direct current) optimizers fix mismatch with a power converter on every panel. That costs about $50 to $65 per 400 W panel (NREL, 2021 prices), which can be more than a used panel is worth.

## 3. What we're building

1. **Grade.** Measure every panel's short-circuit current, all four at the same instant, and each panel's open-circuit voltage. Compute a relative current score and flag weak panels.
2. **Optimize.** Predict the best pairing from the scores: panels with similar current go in the same series pair. Then verify the prediction by measuring the maximum power of all 3 possible pairings with an I-V sweep, and select the best one. Report whether the prediction matched the measurement.
3. **Prove and use.** Alternate between the best and the worst pairing, measuring each at its maximum power point, and report the average gain with a 95% confidence interval. Run a 12 V pump from the best pairing so the power is visibly used.

## 4. Key physics

- **Series:** the same current flows through every panel, so the lowest-current panel limits the whole string.
- **Parallel:** every string has the same voltage, so a string with lower current still adds its current without reducing the others'.
- **Why series:** one 6 V panel's voltage is too low for the 12 V pump.
- **Our setup:** 4 panels arranged as 2 series pairs, with the two pairs connected in parallel (2S2P). There are exactly 3 ways to split 4 panels into two pairs, so we measure all 3.

**Idealized example.** Take 2 panels producing 1.0 unit of current each and 2 producing 0.5. Pairing each high-current panel with a low-current one gives each pair 0.5 units of current, for 2 units of power in total. Pairing the two high-current panels together and the two low-current panels together gives 1.0 + 0.5, for 3 units, which is 50% more.

**Real panels give less than this idealized 50%.** When a strong panel is held to a weak panel's current, its voltage rises toward open circuit, so it still adds some extra power. Our single-diode simulation of four 6 V panels, with two of them at 50% light, predicts:

- the best pairing gives about 38 to 41% more maximum power than the worst pairing;
- it gives about 22 to 24% more than the average of the three pairings, which is what you get, on average, by wiring without measuring;
- with realistic aging (two panels at 80%), the gain is only about 5 to 7%.
- with our actual 35% film the prediction is about the same (+38% vs worst, +22% vs average), because the mismatched wiring's best point moves to bypassing the dark panels, at about 5.4 V.

**Which pairing is best depends on the operating voltage.** Real panels, and our rig, have a bypass diode on each panel. If a load pulls a mismatched string's voltage low, the weak panel is bypassed and the strong panel delivers its full current, so at low voltage the mismatched pairing can deliver more power. We therefore compare pairings at each pairing's own maximum power point, measured with an I-V sweep, so the result doesn't depend on the load.

## 5. What we measure

**Short-circuit current, in milliamps, all panels at once.** This is the current a panel produces when its terminals are connected directly together: the most current it can make at the present light level. It drops when less light reaches working cells or fewer cells work, for example when the protective plastic yellows, dirt builds up, or cracks electrically cut off parts of cells.

To measure it, a relay (K_SHORT) shorts the array output. Each panel has a bypass diode, as full-size panels do, so every panel sits within about half a volt of short circuit, and the INA219 sensor in that panel's position reads that panel's own current. All four readings are taken at the same instant, so a change in light can't skew the comparison. The INA219 breakout has a 0.1 ohm shunt resistor; the chip measures the voltage across it (current = voltage ÷ 0.1 ohm). At 0.3 amps the shunt drops only 0.03 volts, so the panel is effectively shorted. This is safe because a solar panel's current is limited by the light reaching it.

**Open-circuit voltage, in volts.** This is the panel's voltage when no current flows. To measure it, the relays to the load, the capacitor and the short are all opened, and each panel's voltage is calculated from the node voltages (section 11.3). It changes little with light, but drops about 0.3% per °C as the panel heats up.

On full-size panels the cells are wired in 2 or 3 groups, each with a bypass diode. If one group fails, open-circuit voltage drops by roughly a third to a half. Our small demo panels have no internal cell groups, so the "possible failed cell group" flag is implemented but not demonstrated.

**I-V sweep of the whole array, for each pairing.** A discharged 10,000 µF capacitor is connected to the array output. As it charges from 0 V to open-circuit voltage, the array's operating point sweeps from short circuit to open circuit in about 0.3 to 1 second, while the output INA219 samples voltage and current about 1,000 times per second. The maximum power is the highest voltage × current on that curve.

**Power into the pump, in watts.** This is measured continuously while the pump runs. It is reported separately and labelled "power into our pump", because it depends on the pump, not just on the panels.

## 6. Relative current score

- **Score** = this panel's short-circuit current ÷ the highest short-circuit current among the panels × 100%, after the lamp-box correction factors.
- **Grades:** A ≥ 90%, B 75–90%, C < 75% (flag: "weak").
- **Other flags:** "possible failed cell group" if a panel's open-circuit voltage is below 80% of the median; "no light or disconnected" if its short-circuit current is below 5 mA.

**Why relative.** A panel's current is proportional to light intensity. A reading of 200 milliamps could be a reduced-output panel in bright light or a full-output panel in dim light. Comparing panels with each other under the same light removes light intensity from the comparison. This assumes all panels are the same model.

If panels are different models, a reading can only be compared with the rated short-circuit current on the label if we also know the light intensity. That needs a reference: a small calibrated reference cell, or a known-good panel of known current measured at the same time. Our demo uses 4 identical panels.

**Equal light.** Each panel sits in its own identical lamp box (section 8). Calibration: move one reference panel, with no film, through all 4 boxes and record its short-circuit current in each. The correction factor for box k is the average of the four readings ÷ the reading in box k. A quick re-check is to swap two panels and confirm the readings move with the panels, not the boxes.

**Pairing prediction.** Sort panels by corrected short-circuit current, then pair 1st with 2nd and 3rd with 4th. With N panels this scales: sort, then group neighbours into strings. Trying every pairing does not scale: 20 panels can be split into 10 pairs in 654,729,075 ways.

## 7. Simulating reduced-output panels

We cover 2 panels completely and evenly with window tint film rated to pass a known percentage of visible light (35% film, the closest we could buy). Uniform film darkens every cell equally, like browned plastic or even dirt. We don't use cardboard over part of a panel: small hobby panels have no bypass diodes, so shading some cells cuts the whole panel's current to that of the shaded cells and heats them.

Tint film ratings describe visible light. Silicon also uses near-infrared light, which many dyed films let through, so the actual current drop can differ from the rating; it is closer to the rating under LED light, which has almost no infrared. Ceramic films block most infrared, so under sunlight they cut a panel's current much more than a dyed film with the same rating; we use one film type on both dimmed panels. We measure the actual drop with the sensors before the demo.

The film is mounted on removable clear acrylic cards, and plain clear acrylic cards go on the other panels, so every panel has the same extra layer. A judge can choose which 2 panels to dim.

**Series resistance (optional, for Q&A).** Short-circuit current and open-circuit voltage can't detect extra series resistance, such as a corroded connection. In our simulation, adding 5 ohms in series changes short-circuit current by 0.2% and open-circuit voltage not at all, but cuts maximum power by about 12%. That is why we verify every pairing by measuring power instead of trusting the score alone.

## 8. Light

The venue is indoors. Room light is about 0.5% of sunlight; under it the four panels make about 5 milliwatts in total and the pump can't run. So we bring our own light: 4 identical lamp boxes, one per panel.

**Each box:**
- an LED floodlight of the 100 W class, about 8,000–10,000 lumens (flicker-free if possible), facing down, with its heatsink outside the box. A 50 W lamp in the open gives a 2 W panel only about 10–30 mA (estimate), far too little;
- foil- or Mylar-lined walls and vent holes;
- the panel at the bottom.

**Targets:**
- **Brightness:** short-circuit current of a clear panel at least 35% of the label value (at least about 130 mA for a 2 W panel). Below about 30% of sunlight, the pump can stall on the optimized pairing; in our simulation, at 13% of sunlight the optimized pairing stalls the pump while a mismatched pairing still runs it.
- **Evenness:** box-to-box spread of no more than 5% after adjusting lamp heights.
- **Warm-up:** 15 minutes before measuring.
- **Temperature:** panel surface below 55 °C.

On Saturday we also run the full grade, search and proof sequence outdoors in real sun, and record the data for the slides and the video.

## 9. Dashboard

The dashboard runs in Chrome on a laptop and talks to the ESP32 over USB (Web Serial), so it needs neither internet nor Wi-Fi. (Built: see dashboard/.) The ESP32 can't easily join a venue's captive-portal or enterprise Wi-Fi, and a page served from an ESP32 access point can't load scripts from the internet.

It shows:
- a card per panel with short-circuit current, open-circuit voltage, score, grade, flags and live current;
- a diagram of the active wiring;
- a bar chart of the 3 pairings' maximum power, with the best and the predicted pairing marked;
- P-V and I-V curves for each pairing;
- a live output-power chart coloured by pairing;
- the measured gain (mean ± 95% confidence interval, number of cycles), against the worst pairing and against the average of the three pairings.

A stretch goal, only after everything else works: the ESP32 also hosts a minimal status page on its own Wi-Fi access point, with no external scripts.

## 10. How we prove the gain

**PROOF mode.** Alternate I-V sweeps of the best pairing and the baseline (worst) pairing in ABBA order (best, worst, worst, best, …) to cancel slow light drift, for at least 20 cycles (about 1 minute). The gain for each cycle is the best pairing's maximum power ÷ the baseline's maximum power − 1. Report the mean and its 95% confidence interval, plus the gain against the average of all three pairings from SEARCH. The comparison uses the same panels, the same light and the same measurement.

**Null test.** Run PROOF with no film on any panel. The measured "gain" is our noise floor (we expect it to be within ±3%), and we show it to judges.

**Pump.** The pump runs directly from the panels, with no battery, on the best pairing. An optional pump A/B test (5 seconds per pairing, discarding the first 1.5 seconds) is reported only as "power into our pump". The power chart is the measurement that supports our claim; the pump shows that the power is being used.

---

## 11. Build specification

### 11.1 Hardware

| Item | Qty | Notes |
|---|---|---|
| ESP32-WROOM-32 DevKit | 1 (+1 spare) | 30- or 38-pin. On a WROVER board, use GPIO 26/27 instead of 16/17. |
| INA219 breakout or Adafruit INA219 FeatherWing, 0.1 Ω shunt | 5 (+1 spare) | Addresses set with the A0/A1 solder jumpers. |
| 8-channel 5 V relay module | 1 | Stage relays K1–K8. Opto-isolated, ideally with a high/low-trigger jumper. |
| 4-channel 5 V relay module | 1 | K_SHORT, K_CAP, K_DIS, K_LOAD. |
| 6 V solar panels, 1–2 W, identical | 4 (+1 spare) | Open-circuit voltage ≤ 10 V each, so a series pair stays below the INA219's 26 V absolute limit. Real "6 V" panels have Voc of 7–8.7 V. |
| Schottky diodes 1N5819 or 1N5822 | 4 (+2) | One bypass diode per slot. |
| Electrolytic capacitor, 10,000 µF, ≥ 25 V | 1 | For the I-V sweep. Mind the polarity. Two 4,700 µF or ten 1,000 µF in parallel also work. |
| Resistor, 4.7 Ω, ≥ 5 W | 1 | Discharges the capacitor. |
| Resistors 100 kΩ and 15 kΩ; 100 nF capacitors | 2 each | Mid-node voltage dividers. |
| 12 V DC pump, 2–5 W (brushed preferred) | 1 (+ a 12 V fan as fallback load) | Must be a 12 V load. A 3–6 V pump would run where bypass diodes make the mismatched pairing look better. |
| 5 V ≥ 2 A supply for the relay boards | 1 | Not the ESP32's 5 V pin: up to 6 relays at about 75 mA each. Common ground with the ESP32. |
| Lamp boxes | 4 | Section 8. |
| Film cards | 4–5 | Clear acrylic sheets the size of a panel; 2 with 35% visible-light-transmission film. |

### 11.2 Netlist

**Panels.** P1..P4 have terminals Pk+ and Pk−.

**Stage 1** swaps P2 and P3. GPIO16 drives the IN pins of K1–K4, so all four always switch together.

| Relay | COM | NC (relay off) | NO (relay on) |
|---|---|---|---|
| K1 | Q2+ | P2+ | P3+ |
| K2 | Q2− | P2− | P3− |
| K3 | Q3+ | P3+ | P2+ |
| K4 | Q3− | P3− | P2− |

Q1 = P1 and Q4 = P4 are plain wires.

**Stage 2** swaps positions 2 and 4. GPIO17 drives the IN pins of K5–K8.

| Relay | COM | NC (relay off) | NO (relay on) |
|---|---|---|---|
| K5 | S2+ | Q2+ | Q4+ |
| K6 | S2− | Q2− | Q4− |
| K7 | S4+ | Q4+ | Q2+ |
| K8 | S4− | Q4− | Q2− |

S1 = Q1 and S3 = Q3 are plain wires.

**Pairings** (slot S1 and S3 are string tops, S2 and S4 are string bottoms):

| Pairing | Stage 1 (GPIO16) | Stage 2 (GPIO17) | String X (S1 top / S2 bottom) | String Y (S3 top / S4 bottom) |
|---|---|---|---|---|
| A | off | off | P1 / P2 | P3 / P4 |
| B | on | off | P1 / P3 | P2 / P4 |
| C | off | on | P1 / P4 | P3 / P2 |

Never turn both stages on. Slot-to-panel map for the firmware:

- A: S1=P1, S2=P2, S3=P3, S4=P4
- B: S1=P1, S2=P3, S3=P2, S4=P4
- C: S1=P1, S2=P4, S3=P3, S4=P2

**Fixed 2S2P wiring with sensors.** Sensors belong to slots, not panels. This keeps every INA219 pin within about 0.05 V of ground or above it, even when a bypass diode conducts.

- **Slot S1 (top of string X):** S1+ → INA219 "X1" VIN+; X1 VIN− → OUT+. S1− → node MX.
- **Slot S2 (bottom of string X):** S2+ → MX. S2− → INA219 "X2" VIN+; X2 VIN− → GND (OUT−).
- **Slot S3 (top of string Y):** S3+ → INA219 "Y1" VIN+; Y1 VIN− → OUT+. S3− → node MY.
- **Slot S4 (bottom of string Y):** S4+ → MY. S4− → INA219 "Y2" VIN+; Y2 VIN− → GND.

Bypass Schottky diodes, each across a slot and its shunt:

| Diode | Anode | Cathode |
|---|---|---|
| D1 | MX | OUT+ |
| D2 | GND | MX |
| D3 | MY | OUT+ |
| D4 | GND | MY |

The bottom-slot sensors read negative current; the firmware uses the absolute value.

**Output stage.**
- OUT+ → INA219 "OUT" VIN+; OUT VIN− → node LOAD+.
- **K_SHORT** (GPIO18): COM = LOAD+, NO = GND.
- **K_CAP** (GPIO19): COM = LOAD+, NO = capacitor +. Capacitor − → GND.
- **K_DIS** (GPIO23): COM = capacitor +, NO → 4.7 Ω → GND.
- **K_LOAD** (GPIO25): COM = LOAD+, NC = pump +, NO = unconnected. Pump − → GND. With the relay off, the pump runs, so it keeps running if the controller resets.

**Mid-node voltages.** MX → 100 kΩ → GPIO34 → 15 kΩ → GND, with 100 nF from GPIO34 to GND. MY goes to GPIO35 the same way. Use `analogReadMilliVolts()` with 11 dB attenuation; ratio = 15/115 (18 V → 2.35 V).

**I2C.** INA219s X1=0x40, X2=0x41, Y1=0x44, Y2=0x45 go on Wire (SDA 21, SCL 22, 400 kHz). The OUT sensor is at 0x40 on Wire1 (SDA 32, SCL 33). Configure all sensors with the 32 V / 2 A calibration. Compute current as shunt voltage (mV) ÷ 0.1 Ω.

**Relay inputs.** Most modules are active-LOW. Write the "off" level to each relay pin before calling `pinMode(OUTPUT)`, so nothing clicks at boot. Avoid GPIO 0, 2, 5, 12, 14 and 15 for relays. If a relay doesn't release with a 3.3 V HIGH: remove the JD-VCC jumper, feed JD-VCC from the 5 V supply and VCC from the ESP32's 3.3 V, and check the relay still turns on. Otherwise drive IN through an NPN transistor or logic-level MOSFET, or use a 3.3 V-input module. Don't use open-drain outputs: the pin floats toward 5 V, above the ESP32's limit. Never use "solid-state relay" boards such as the G3MB-202P: they are AC-only and won't turn off on DC.

**Onboard LED.** GPIO2 is the status LED: blink when idle, solid while measuring.

### 11.3 Firmware: modes and procedures

**Boot.** All relays off (pairing A, pump connected, capacitor disconnected, no short). Discharge the capacitor once (K_DIS on for 500 ms). Scan both I2C buses, then send `hello` or an `error` for each missing sensor.

**`setPairing(p)`** uses break-before-make:
1. K_CAP off, K_SHORT off, K_LOAD on (pump disconnected).
2. Wait 20 ms.
3. Set the stage pins.
4. Wait 60 ms.
5. Restore the pump only if the caller asks for it.

**`readSteady()`** averages each INA219 and ADC channel over 100 ms. This covers 12 cycles of 120 Hz lamp flicker.

**GRADE:**
1. Pump off. K_SHORT on, wait 150 ms, then readSteady. Each slot's |current| is that panel's Isc (map slots to panels with the active pairing). K_SHORT off.
2. Wait 300 ms (open circuit), then readSteady.
   - V_out = OUT bus voltage + shunt drop.
   - V_mid = divider reading ÷ ratio.
   - Bottom-slot panel voltage = V_mid; top-slot panel voltage = V_out − V_mid.
   - These are the Voc values.
3. Corrected Isc = Isc × boxFactor[k]. Then compute scores, grades and flags (section 6), and the predicted pairing.
4. Send `grade`.

**SWEEP** (active pairing):
1. Pump off, K_SHORT off. K_DIS on for 500 ms, then off; wait 10 ms.
2. K_CAP on and start the clock. Sample the OUT sensor (bus V, shunt I) as fast as possible. Stop after 4 s, or when the current falls below 1% of its first good value, or when V changes by less than 0.02 V over 50 ms.
3. K_CAP off, then K_DIS on for 500 ms, then off.
4. Drop the samples from the first 5 ms (contact bounce). Bin the samples into 0.1 V bins and average each bin.
5. Pmax = max(V×I), giving Vmp and Imp. Isc is the first bin; Voc is the last V. FF = Pmax ÷ (Isc × Voc).
6. Send `sweep` with at most 80 points.

**SEARCH:**
1. Run GRADE.
2. For p in A, B, C: setPairing(p), then SWEEP.
3. Best pairing = highest Pmax.
4. Send `search` with predicted, best and whether they match.
5. setPairing(best) with the pump on.

**RUN p:** setPairing(p) with the pump on. Send `live` every 200 ms.

**PROOF [baseline]:**
- The baseline defaults to the worst pairing from the last SEARCH.
- Repeat cycles with ABBA order: even cycles sweep best then baseline, odd cycles baseline then best.
- ratio = Pmax_best ÷ Pmax_base.
- After each cycle, send `proof` with the running mean gain and 95% CI = 1.96 × standard deviation ÷ √n.
- Stop after 20 cycles or on STOP, then return to RUN best.

**PUMPPROOF [baseline]:** pump connected. For 5 s per pairing, alternately, average the output power over the last 3.5 s. Send `proof` with `"kind":"pump"`.

**CAL wizard:**
- `CAL k` measures the reference panel P1 (no film) placed in box k.
- After k = 1 to 4, `CALSAVE` stores boxFactor[k] = mean ÷ reading[k] in NVS (Preferences) and sends `cal`.
- `CALRESET` sets all factors to 1.

**STOP:** abort the current mode, then RUN with the current pairing. **PUMP ON|OFF:** override the pump. **STATUS:** send the mode, pairing and factors.

### 11.4 Safety interlocks (firmware)

- Never close K_SHORT while K_CAP is closed.
- Never close K_CAP unless the capacitor was discharged (K_DIS on for at least 500 ms) since K_CAP last opened.
- Never energize stage 1 and stage 2 together.
- Change pairings only with K_CAP and K_SHORT open and the pump disconnected (setPairing does this).
- Time out every sweep after 4 s. If any sensor read fails 3 times in a row, send `error` and go to the boot state.

### 11.5 Serial protocol

**ESP32 → laptop.** 115200 baud, one JSON object per line.

```
{"type":"hello","fw":"0.2","panels":4,"factors":[1,1,1,1]}
{"type":"live","t":123456,"mode":"RUN","pairing":"A","pump":true,"out":{"v":11.2,"i_ma":205.3,"p_w":2.30},"panels":[{"id":1,"slot":"S1","i_ma":102.1},{"id":2,"slot":"S2","i_ma":101.7},{"id":3,"slot":"S3","i_ma":103.0},{"id":4,"slot":"S4","i_ma":102.4}]}
{"type":"grade","t":123,"panels":[{"id":1,"isc_ma":150.2,"isc_raw_ma":148.9,"voc_v":6.81,"score":100.0,"grade":"A","flags":[]}],"predicted":"A"}
{"type":"sweep","t":123,"pairing":"B","pmax_w":1.64,"vmp_v":11.6,"imp_ma":141,"voc_v":13.6,"isc_ma":152,"ff":0.79,"n":412,"pts":[[0.1,152.1],[0.5,151.9]]}
{"type":"search","t":123,"pmax_w":{"A":2.29,"B":1.64,"C":1.64},"best":"A","predicted":"A","match":true}
{"type":"proof","t":123,"kind":"sweep","best":"A","base":"B","cycle":7,"p_best_w":2.28,"p_base_w":1.65,"gain_pct":38.6,"ci95_pct":1.2}
{"type":"cal","factors":[1.00,0.98,1.03,0.99]}
{"type":"error","msg":"INA219 0x44 on Wire not found"}
{"type":"log","msg":"free text"}
```

**Laptop → ESP32.** One command per line: `GRADE`, `SEARCH`, `SWEEP`, `RUN A|B|C|BEST`, `PROOF [A|B|C|WORST]`, `PUMPPROOF [A|B|C|WORST]`, `STOP`, `PUMP ON|OFF`, `CAL 1..4`, `CALSAVE`, `CALRESET`, `STATUS`.

### 11.6 Dashboard requirements

- **Connection:** a Connect button using `navigator.serial.requestPort()` at 115200 baud, a line splitter and a JSON parser. It ignores malformed lines and shows connection state. Remind the user to close the Arduino Serial Monitor first.
- **Panel cards (4):** Isc, Voc, score bar, grade letter, flags, and live current from `live`.
- **Wiring diagram:** inline SVG of the active pairing, showing two strings with panel numbers coloured by grade.
- **Charts:**
  - a bar chart of `search.pmax_w` with the best pairing highlighted and the predicted one marked;
  - P-V curves for all 3 pairings, with a toggle to I-V;
  - live output power for the last 120 s, line coloured by pairing.
- **Headline:** "+X.X% ± Y.Y% (n cycles) vs worst pairing", plus "+Z% vs average of the three pairings" computed from the last `search`.
- **Controls:** buttons for every command, plus a 4-step calibration wizard.
- **Data:** a Download button for all received lines as JSONL and a CSV of `live`.
- **Mock mode:** a toggle that generates fake `grade`, `sweep`, `search`, `live` and `proof` messages using the numbers in sections 4 and 10.
- **Footer text:** "Gain measured at each pairing's maximum power point (I-V sweep). Lamps stand in for the sun indoors. Two panels covered with 35% window film to simulate aging."

### 11.7 Acceptance tests

| Test | Pass when |
|---|---|
| T1 sensors | Five INA219s found (0x40, 0x41, 0x44, 0x45 on Wire; 0x40 on Wire1). |
| T2 relays | With panels unplugged, a multimeter confirms each pairing's connections in the 11.2 table. Then, with "fake panels" (9 V battery + 220 Ω for strong, + 470 Ω for weak), the dashboard maps slots to the right panels. |
| T3 Isc | Each panel's GRADE Isc is within 3% of a multimeter reading (10 A range) on that panel alone. |
| T4 sweep | Sweep Voc is within 2% of the GRADE open-circuit reading. Sweep Isc is within 3% of the K_SHORT array reading. |
| T5 null test | With no film, the PROOF gain between pairings is within ±3%. |
| T6 film | With 2 film cards, the measured current ratio is close to the film's rating (record the actual value). The best pairing equals the prediction. |
| T7 endurance | The full demo (GRADE → SEARCH → RUN → PROOF) runs 3 times in a row without touching wires. After 20 minutes under the lamps, the panels stay below 55 °C and readings drift less than 5%. |
