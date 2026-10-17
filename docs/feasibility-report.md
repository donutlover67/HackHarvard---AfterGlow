# HackHarvard 2026: feasibility review of the solar re-pairing project

Written Fri Oct 16, ~5 PM, about an hour after hacking started. The paste-ready corrected spec is `spec-v2.md` in this folder. The simulation is `pv2s2p.py` and `extra.py` (pure Python 3; run `python3 pv2s2p.py`).

## 1. Verdict

**Feasible, with changes, and only if the parts are bought tonight.** As written, the demo would most likely fail at the venue, for two reasons:

- **Indoor light.** Canopy Hall gets no direct sun at the judging tables. Room light is about 0.5% of sunlight; in simulation the four panels then make about 5 mW in total, the pump can't turn, and the pairing effect disappears into noise.
- **The proof is load-dependent.** "Highest measured output power while the panels run a water pump" can overstate the gain (about +90% into a fixed load) or even reverse it. Under weak light, with bypass diodes, the mismatched wiring runs the pump while the "optimized" wiring stalls it.

The physics is sound, but three numbers in the spec need correcting:

- A 50% film gives a gain of about **38 to 41%** at maximum power, best pairing against worst, not 50%.
- Against the average of the three pairings (what you get by wiring without measuring), the gain is about **22 to 24%**.
- With realistic aging (panels at 80%), the gain is only **5 to 7%**.

Your Isc and Voc measurements also can't detect the series-resistor "corroded connection" you plan to simulate.

The time budget is the other constraint. The venue closes **strictly at 8 PM every night**, so you have about 15 to 16 hours on site. Rule 2 lets you keep working off-site until Sunday 8 AM.

## 2. What the event allows (from both PDFs)

- **Hacking window:** Fri 4 PM to Sun 8 AM. Devpost needs a public GitHub repo created Oct 16–18; a demo video under 3 minutes is optional but recommended. You can't start building before the opening ceremony; having the idea in advance is fine.
- **Venue hours:** closes strictly at 8 PM nightly, no overnight stays, and Treehouse rule violations mean immediate disqualification. Opening times for Saturday and Sunday aren't published; ask on Discord. Hardware has to go home with you each night.
- **Judging:** in person, Sun 9:00–10:30 or 10:30–12:00 depending on your judging group, in Canopy Hall (room 301, top floor). Judges come to your assigned table; you get a 3-minute live presentation. The four criteria are weighted equally; ties are broken in this order: Innovation/Creativity/Impact, Technical Complexity, Functionality/Usability, Teamwork/Learning.
- **Tracks that fit:**
  - **Sustainability · ASUS "Save the Earth"**: 1st ASUS motherboard, 2nd ROG keyboard, 3rd ZenScreen monitor.
  - **Hardware for Good**: a drone for each member of the winning team.
  - **ASUS Content Challenge**: a public social post about building for the ASUS track. It is labelled a Sustainability-track bonus.
  - The other tracks and sponsor challenges (Regeneron, Digital Trust, Daytona, SpaceX/Cursor, Chalk, Factory, Nessie, Photon) don't fit.
- **Hardware support:** none. There's no hardware lab and no MLH; the guide says to bring your own. No written rule on soldering, water, heat lamps or table power; Harvard generally bans open flame.
- **Other time sinks:** the Saturday 10 AM–12 PM sponsor fair is marked "in-person attendance required" (check what that means). The Head of the Charles Regatta (Oct 16–18) will slow traffic.

**Open questions to post on Discord tonight:**
1. What time does the venue open on Saturday and Sunday?
2. Can one project enter both the Sustainability and Hardware tracks? The guide's wording ("enter your project in 1 of our tracks") is ambiguous.
3. Is soldering allowed in the venue?
4. Do judging tables have power outlets? The lamps need about 200–400 W.
5. Is a small sealed water container OK at the table?
6. Can hardware stay at the venue overnight?

## 3. Feasibility by area

### 3a. Parts and cost

There's no hardware lab, so you buy everything. Budget roughly **$270–450**, less if you already own an ESP32, a multimeter and a soldering iron. The lamps are the biggest line item. See `spec-v2.md` §11.1 for the full list.

- **Electronics** (~$80–120): ESP32 ×2, INA219 ×6, an 8-channel and a 4-channel relay module, Schottky diodes, a 10,000 µF capacitor, resistors, a 5 V 2 A supply, wire, Wago lever nuts.
- **Panels** (~$30–60): 5 identical 6 V 1–2 W panels.
- **Lamps** (~$120–200): 4 identical 100 W-class LED floods.
- **Film, acrylic, foam board, foil** (~$40–60).
- **Pump and fallback** (~$15–30): a 12 V pump and a 12 V fan.
- **Tools, if needed** (~$40).

Two gotchas: INA219 breakouts ship with headers **unsoldered**, and the I2C addresses are set by solder jumpers. Plan one soldering session tonight, off-site if venue rules are unclear.

### 3a-bis. Where to buy tonight (checked 4:40–5:30 PM Fri; stock is from store websites, not phoned)

**Trip 1 — Arsenal St, Watertown (about 1.1–1.4 mi; everything on one road):**
- **Home Depot #2602, 615 Arsenal St** (open to 10 PM):
  - Husky 12,000 lm LED work light, $69.97, 12 in stock. **Buy 1 now, test, then buy 3 more.**
  - HDX 250 W halogen work light, $17.98, 7 in stock. Buy 1 to compare. Halogen gives silicon far more current per lux, but it runs very hot, its infrared changes how the film behaves, and it draws a lot of power at the table.
  - Also: Wago lever nuts, 22 AWG wire, acrylic sheets, foam board, foil, zip ties.
- **AutoZone #5006, 450 Arsenal St** (open to 9 PM): Gila window film, **35% VLT** $19.99 or 20% VLT $19.99, plus static-cling Gila JS246 (20%) $21.49. **No 50% film was found anywhere nearby**, so use 35%. In simulation the gain stays about the same (+38% best vs worst, +22% vs average), because with the weak panels this dark, the mismatched wiring's best point moves to bypassing them (around 5.4 V). Say "35% film" in the pitch.
- **Target, 550 Arsenal St** (open to 11 PM): power strip, extension cord, sealed clear container, a 5 V 2 A USB charger.

**Trip 2 — Micro Center, 730 Memorial Dr, Cambridge.** Open 10 AM–9 PM Fri and Sat, but **Memorial Drive closes for the regatta Sat 7 AM to Sun 9 PM**, so go tonight.
- Inland ESP32 ($8–10) ×2.
- Inland 8-channel ($8.99) and 4-channel ($6.99) relay modules.
- Weller 30 W soldering iron kit (~$25), breadboards and jumpers.
- The only INA219 listed is the Adafruit INA219 **FeatherWing** ($7.95). It is the same chip and works as a standalone I2C board, with address jumpers. Buy 5–6 if stocked.
- **Not found at Micro Center:** 1–3 W 6 V panels, Schottky diodes, capacitors of 4,700 µF or more (largest listed is 1,000 µF), and a 12 V mini pump. As a fallback, ten 1,000 µF capacitors in parallel replace the 10,000 µF one. A 12 V PC fan, which Micro Center has, is the dry fallback load.

**Order on Amazon Same-Day tonight, delivered to your lodging, not the venue:**
- 5 identical 6 V 1–2 W panels.
- INA219 modules (a 5–6 pack, if Micro Center runs short).
- 1N5819 or 1N5822 Schottky diodes.
- One 10,000 µF 25 V capacitor.
- A 12 V 2–5 W mini pump.
- 4.7 Ω 5 W resistor.

**Panels are the critical-path item.** Until they arrive, B and A test with fake panels (9 V battery + resistor).

### 3b. Build and wiring risk: **medium-high**

The original spec needs isolation relays per panel, plus pairing relays, plus measurement relays. That is roughly 20 relays, and nothing prevents an illegal relay state.

`spec-v2.md` replaces it with:
- an **8-relay two-stage swap network** that reaches all 3 pairings and can't produce an invalid configuration;
- **sensors fixed to slots** instead of panels, with **bypass diodes**;
- 4 output relays.

That gives 12 relays and 5 INA219s in total, with a wiring table and continuity tests.

The design also fixes a damage risk in the naive layout. A sensor sitting on the middle node of a series pair can be driven to −7 V when the weaker panel is reverse-biased, and the INA219's absolute limit is −0.3 V.

Other gotchas:
- Relay coils draw about 75 mA each, so power the relay boards from a separate 5 V supply.
- Some 5 V opto relay boards won't release with the ESP32's 3.3 V logic.
- Don't use "solid-state relay" boards like the G3MB-202P; they are AC-only and won't turn off on DC.
- Avoid GPIO 0, 2, 5, 12, 14 and 15 for relays; they're boot-strapping pins.
- Five INA219s need two I2C buses, because the breakout's jumpers give only 4 addresses.
- **Build for transport.** Put everything on one rigid baseboard with screw terminals or Wago connectors and no breadboarded power wiring, because you carry it home every night.

### 3c. Demo risk: **high**, and almost all of it is light

From the venue's floor plan and the building outline (an inference; no source states the window direction): Canopy Hall has floor-to-ceiling glass facing roughly north and west-southwest, so there is **no direct sun at the tables before about 11:30**. The forecast for Sunday is sunny, but only the south terrace gets direct sun.

Simulated pump behaviour (12 V pump, 2 of 4 panels at 50% film, with bypass diodes; light given as clear-panel Isc as a share of full sun):

| Light | Best pairing | Mismatched pairing | What the judges see |
|---|---|---|---|
| Room light (0.5%) | ~5 mW total | — | nothing |
| 13% | **pump stalls** | pump runs | the "optimized" wiring looks worse |
| 18–24% | both run, about equal | | no visible difference |
| 29% | 7,200 rpm | 6,200 rpm | visible |
| 39% | 8,900 rpm | 6,800 rpm | clearly visible (+31%) |

So you need **at least about 35% of sun-equivalent per panel**. That means 4 identical foil-lined lamp boxes with one **100 W-class LED flood (8,000–10,000 lumens) per panel**. A component check estimates a 50 W flood in the open gives a 2 W panel only 10–30 mA, about 3–8% of sun. My estimate for a 100 W flood in a good box is about 40–50%; neither figure is measured. **Test one lamp and one panel tonight with a multimeter** (10 A range across the panel = Isc) before buying all four.

Other demo risks:
- Lamp flicker adds noise; average readings over 100 ms.
- Tables may have no power outlet; ask organizers.
- Water at the table; use a sealed container and keep the 12 V fan as a dry fallback.
- Venue Wi-Fi; avoided entirely with a USB-serial dashboard.

### 3d. Physics, measurement method and the claimed gain

Simulation set-up: a single-diode model of a 12-cell, 6 V, 2 W panel; 2S2P array; two panels at 50% light unless noted. Results:

| Scenario | Best vs worst pairing | Best vs average of 3 |
|---|---|---|
| Max power, lamp or sun, 2 panels at 50% | **+38 to 41%** | **+22 to 24%** |
| Max power, 2 panels at 80% (realistic aging) | +6.6% | +4.3% |
| Max power, panels at 100/90/80/70% | +5.5% | +3.4% |
| Into a fixed resistor sized for the best pairing | +83 to 95% (**overstated**) | |
| Into a 12 V pump | +15% in full sun (pump saturated), +95% at 39% sun, **reversed** at 13% sun | |
| Into a low-voltage (3–6 V) load, with bypass diodes | mismatched wins (best/worst = 0.58 to 0.91) | |
| One panel plus 5 Ω in series | Isc −0.2%, Voc unchanged, **max power −12%** | |

What holds up:
- The series/parallel reasoning.
- The 3-pairings count.
- Using a relative score instead of absolute current.
- Measuring Isc through a 0.1 Ω shunt (safe and effectively a short).
- Using uniform film instead of cardboard (though for a different reason; see below).
- Alternating configurations so changes in light affect both.
- Disclosing the battery.

What doesn't:
1. **50% is the idealized number.** The real figure is about 40% best vs worst.
2. **Power into the pump is not a valid proof.** Compare pairings at each pairing's maximum power point with an I-V sweep (a $3 capacitor plus 2 relays). Report pump power separately.
3. **The score misses series resistance.** Drop the resistor, or use it to explain why power is verified directly.
4. **Comparing to the label's rated Isc needs irradiance.** That requires a reference cell, so it's the same problem the relative score was meant to solve.
5. **Bypass-diode statements.** Small hobby panels usually have no bypass diodes. Partial cardboard shading then cuts the whole panel's current to the shaded cells' current; it doesn't trigger a bypass. The conclusion (use uniform film) stands; the reason changes. The Voc-step flag can't be demonstrated on mini panels.
6. **Novelty.** Rewiring for *degraded* arrays has been studied: Hu 2017 IEEE TPEL; Al Mansur 2022, which sorts by Isc; IIT Bombay 2025, which re-strung a degraded 28 MW plant for +0.3–3.8%. JA Solar already sorts new modules into current classes. A defensible angle: "used panels arrive in mixed batches with no data; we measure in place and verify automatically, which seems little studied for second-life batches." The claim "only studied for shade" is false and judges may know it.
7. **Problem framing.** Most retired panels are young or damaged, not worn out: NREL says early-retired panels often produce 70–95%. NREL's baseline puts 83% landfilled and about 1% reused. Testing is a real barrier (lab flash plus EL costs €16–31 per panel against about €50 for a new one), but so is the low price of new panels; say both. `spec-v2.md` §2 is rewritten with these sources.

## 4. Recommended changes, each with a reason

| # | Change | Reason |
|---|---|---|
| 1 | Bring the sun: 4 identical lamp boxes, one 100 W-class LED flood (8,000–10,000 lm) each, target clear-panel Isc ≥35% of rated; outdoor run Saturday 2–4:30 PM | Room light gives ~0.5% of sun; below ~30% the pump result can reverse |
| 2 | Prove the gain with I-V sweeps at maximum power (10,000 µF capacitor + K_CAP/K_DIS) in ABBA order, ≥20 cycles, mean ± 95% CI; report pump power separately | Power into a fixed load is load-dependent (+15% to +95%, or reversed) |
| 3 | Report the gain vs worst **and** vs average of the three pairings, show a no-film null test, and quote the realistic-aging figure (5–7%) | Honest numbers survive judge questions; inflated ones don't |
| 4 | Two-stage 8-relay swap network; sensors fixed to slots; Schottky bypass diode per slot; isolate per-panel Isc by shorting the array output | All 3 pairings with no illegal states, all four panels measured at the same instant, and no INA219 pin driven below −0.3 V |
| 5 | Use the score to *predict* and the sweep to *verify*, and report whether they matched | The original spec had two selection methods; this shows the method scales to N panels (sorting), where brute force doesn't |
| 6 | Run the dashboard on a laptop over USB (Web Serial), with Chart.js stored locally; the ESP32 access-point page becomes a stretch goal | The ESP32 can't easily join captive-portal or enterprise Wi-Fi, and a page on an ESP32 access point can't load CDN scripts |
| 7 | Use a 12 V pump (with a 12 V fan as fallback), never a 3–6 V pump | With bypass diodes, a low-voltage load makes the mismatched wiring win |
| 8 | Removable film cards on clear acrylic, plus clear cards on the other panels; let a judge pick which panels to dim | Interactive and fair; it also shows the system isn't rigged |
| 9 | Box calibration: rotate one reference panel through all 4 boxes | Lamp-to-lamp differences would otherwise show up as "panel health" |
| 10 | Fix the problem framing and novelty claim (spec §2) | The current novelty claim is false |
| 11 | Pitch the product as a **one-time grading and wiring tool** for installers; the relays are for the demo and for automatic re-checks | Permanent relays per panel recreate the per-panel cost argument you use against optimizers |

## 5. Work split for 4 people

| Person | Role | Deliverables |
|---|---|---|
| **A** | Power path (hardware lead) | Solder the INA219s (headers + address jumpers); panel leads; 8-relay swap network; slot sensors and bypass diodes; output stage (short, capacitor, discharge, pump relay); mid-node dividers; a printed wiring table with labels on every wire; baseboard ready for transport; continuity tests (T2) |
| **B** | Firmware | Generate the firmware from `spec-v2.md` and verify it on hardware: I2C on two buses, relay control with interlocks, GRADE, SWEEP, SEARCH, RUN, PROOF and CAL, JSON serial; test with fake panels (9 V battery + resistor) before the real rig exists; T1, T3–T5 |
| **C** | Dashboard and data | Public GitHub repo (create it tonight); generate `dashboard/` from the spec; mock mode first, then real serial; all charts and the headline gain; CSV export; analyse the outdoor data; README and Devpost figures |
| **D** | Light, water, story | Lead the shopping run; first lamp test tonight; 4 lamp boxes; film cards; pump reservoir and fan fallback; outdoor run Saturday; demo video; Devpost text; pitch script; ASUS Content Challenge post; Discord questions to organizers |

**Dependencies:**
- **B and C** depend only on the fixed JSON protocol, so C builds on mock data from minute one.
- **B and A** share the pin map and relay table in §11.2. B tests on a breadboard with fake panels until A's rig is ready.
- **D's lamp test** decides how many lamps to buy and whether the live demo is lamp-based at all (tonight).
- **D's power measurement** decides which pump to use (Saturday morning).
- **Everyone feeds D's video and pitch**, which need a working system by Saturday evening.

## 6. Timeline (fits the 8 PM closures)

| When | Who | What |
|---|---|---|
| **Fri 4:45–5:15** | all | Adopt `spec-v2.md`, assign roles, create the repo, post the Discord questions |
| **Fri 5:15–7:45** | A + D | Shopping run (electronics store, then hardware store for lamps, Wago, acrylic and foam board, then auto parts for tint film). Order backups for next-day delivery to your lodging |
| | B | Firmware skeleton: I2C scan, one INA219, relay click test, JSON stream |
| | C | Dashboard skeleton with mock data and Web Serial |
| **Fri 7:45** | all | Pack up; the venue closes at 8:00 |
| **Fri ~8:30–midnight, off-site** | A | Soldering and harness |
| | D | Lamp test and first box |
| | B | Firmware on real sensors |
| | C | Charts |
| **Checkpoint 0, Fri ~midnight** | | Lamp test passes (≥35% of rated Isc). All 5 sensors read. One relay stage switches |
| **Sat morning** | A | Finish the relay network |
| | B | GRADE and SEARCH on the real rig |
| | C | Real serial integration |
| | D | 4 boxes and film cards |
| **Checkpoint 1, Sat 11:00** | | Live per-panel Isc and Voc on the dashboard under the lamps. All 3 pairings verified (T2) |
| **Sat 2:00–4:30** | D + one other | Outdoor sun run (forecast: cloudy until about noon, then mostly sunny from 2 to 5 PM): grade, search, proof; record data and video b-roll. Sunday is forecast sunny all day, but judging is indoors |
| **Sat 11:30–5:00** | all | SWEEP, PROOF and CAL; pump; final charts; pitch script (around the outdoor run) |
| **Checkpoint 2, Sat 5:00** | all | The full demo runs 3 times in a row without touching wires (T7). **Feature freeze** |
| **Sat 5:00–7:45** | all | Record the backup demo video; run the null and film tests for the Devpost numbers; rehearse the 3-minute pitch 3 times; pack |
| **Sat evening, off-site** | C + D | Devpost, README and video upload. **Submit a complete draft by midnight** |
| | A + B | Bug fixes only |
| **Sun before 8:00 AM** | | Final Devpost edits; the deadline is 8:00 AM |
| **Sun, at opening** | | Set up; lamps warm up for 15 minutes; CAL and null test |
| **Sun 9–12** | | Judging. One person drives the demo, one presents |
| **Sun 3–4** | all | Closing ceremony (in person) |

### Fallback demo plan

Each fallback is a step down:

1. **Full demo:** live grade, then automatic search with I-V curves, then proof with confidence interval, with the pump running.
2. **Relay network fails:** pair panels by hand with labelled Wago leads. Grading and sweeps stay automatic.
3. **Sweeps are noisy (lamp flicker):** average several sweeps, or compare power into a fixed resistor labelled "into this load".
4. **Lamps too weak, or no table power:** live grading only; show the gain from Saturday's outdoor data and video.
5. **Pump won't start:** use the 12 V fan.
6. **Last resort:** the video under 3 minutes, uploaded Saturday night. Bring a spare ESP32 already flashed, a spare INA219 and the fake-panel test kit.

## 7. Against the judging criteria

| Criterion | Estimate | Why |
|---|---|---|
| Innovation, Creativity, Impact (tie-break #1) | **6–7/10**, 8 if framed well | Real problem (second-life PV) with a clever cheap-grading angle. Weakened by prior art and by small realistic gains (5–7%). Lead with grading plus verified wiring for mixed used batches, and use real numbers |
| Technical Complexity | **8/10** if it works | Multi-sensor measurement, a relay swap network, an I-V curve tracer built from a capacitor, a statistical A/B test, physics modelling |
| Functionality and Usability | **5–8/10**, depending entirely on light | A live, judge-interactive demo scores high; a dark table scores low |
| Teamwork and Learning | **7–8/10** | Four clean roles; a real learning story about bypass diodes, I-V curves and the load-dependence surprise |

**Tracks.** Primary: **Sustainability (ASUS)**. It has three podium places, and a working hardware rig with measured watts stands out among software entries. Also enter **Hardware for Good** if both tracks are allowed (ask organizers). The **ASUS Content Challenge** is nearly free: D posts a public build video with the required tags. Skip the sponsor API challenges; bolting on an agent would cost hours and dilute the story.

**Likely judge questions:**
- *"Isn't this just current sorting?"* Yes, for new panels with factory data. Used batches have none.
- *"How much in real life?"* About 5–7% at realistic aging, up to about 40% for badly mismatched batches; the bigger value is cheap grading.
- *"Why lamps?"* The venue is indoors; here is Saturday's outdoor data.
- *"Doesn't the score miss resistive faults?"* Yes, which is why every pairing's power is measured directly.
- *"Doesn't it scale badly?"* No: sort by current; brute force is only a check.
