# Solar Panel Reuse Through Adaptive Wiring

## Project Overview

End-of-life solar panels can still produce about 80% of their original rated power, but many are discarded because buyers lack an inexpensive, standard way to assess their remaining output. Even when reused panels are available, wiring panels with different current outputs in series can waste power: the lowest-current panel limits the current through the entire string.

This project measures used panels, automatically selects a wiring arrangement, and compares its measured output with a baseline arrangement. A water pump demonstrates the load being powered, while a live dashboard shows panel measurements and output power. The system is designed to make reuse easier to evaluate and to demonstrate the benefit of matching panels with similar current in each series string.

## How It Works

The prototype is designed around four panels arranged as two series pairs, with the pairs connected in parallel. A single panel does not provide enough voltage for the pump system, so series pairs provide the needed voltage while parallel wiring combines their output current.

1. **Measure each panel.** Relays and an INA219 sensor measure each panel's short-circuit current and open-circuit voltage.
2. **Compare panel current.** The system calculates a relative current score for each panel.
3. **Try every pairing.** Four panels can be split into two unordered pairs in exactly three ways. Relays test each arrangement, and the system selects the one with the highest measured output power.
4. **Show the comparison.** An ESP32-hosted web dashboard displays panel measurements, the active pairing, live output power for the optimized and baseline pairings, and the measured percentage gain.
5. **Run the load.** The panels power a water pump during the demonstration. The pump is a visible demonstration of power use; the power measurements, rather than pump speed, support the comparison.

## Why Pairing Matters

In a series string, every panel carries the same current. A panel with lower current capability therefore limits the current of the other panel in that string. In parallel, the strings share voltage and their currents add, so pairing panels with similar current can increase the combined output.

For illustration, suppose two panels produce 1.0 unit of current and two produce 0.5 units. Pairing each high-current panel with a low-current panel gives two strings limited to 0.5 units each, or 1.0 unit total current. Pairing the high-current panels together and the low-current panels together gives strings carrying 1.0 and 0.5 units, or 1.5 units total current. At the same voltage, that idealized example is a 50% increase in power. Real hardware may show a smaller gain; the prototype measures and reports the actual result instead of assuming this ideal gain.

## Panel Measurements

### Short-circuit current

Short-circuit current is the current produced when a panel's positive and negative terminals are connected through a very low resistance. It is measured in milliamps and changes with the light reaching the panel and the condition of its cells. Yellowed protective material, dirt, or electrically disconnected cell sections can reduce it.

For this measurement, a relay connects the panel through the INA219 sensor's 0.1-ohm shunt resistor. The sensor measures the voltage across the resistor and calculates current using `current = voltage / 0.1 ohm`. At 0.3 A, the resistor drops 0.03 V, so it is effectively a short for the panel. A solar panel is current-limited by the available light.

### Open-circuit voltage

Open-circuit voltage is the voltage measured while no load current flows. It is measured in volts and generally changes less with light than short-circuit current. A voltage substantially below the other panels can indicate a failed cell group: bypass diodes may route current around failed groups, reducing a panel's voltage by roughly one-third to one-half.

For this measurement, a relay disconnects the panel from the rest of the circuit while leaving it connected to the sensor's high-impedance voltage input, which draws very little current.

### Relative current score

The score used to match panels is:

```text
relative current score = panel short-circuit current / highest panel short-circuit current * 100%
```

All panels are measured within about one second under the same light. Comparing them at the same time helps account for changing light intensity, since current is proportional to illumination. This comparison assumes panels are the same model. If they are not, compare each measured current with that panel's rated short-circuit current on its label instead.

The comparison also assumes the panels receive similar light. Check for position-related differences by swapping two panels and confirming that the readings follow the panels rather than their positions. Independently, flag a panel whose open-circuit voltage is more than 20% below the others as a possible failed-cell-group case.

## Measuring the Gain

The system measures power in watts at the combined output. It alternates the optimized and arbitrary baseline pairings every few seconds, using the same panels, light, and load for both. Alternation helps ensure that changing light affects both arrangements similarly.

Report the average percentage difference in measured output power over many alternation cycles. The pump demonstrates the load in use; the power chart is the evidence for the wiring comparison. If the pump is powered by a battery instead of directly from the panels, disclose that during the demo because pump speed would then not track the panels' instantaneous output.

## Demonstrating Reduced-Output Panels

To simulate panels with reduced output, cover two panels evenly with window tint film rated to pass a known percentage of light, such as 50%. This should reduce short-circuit current by approximately the corresponding percentage; verify the actual reduction with the sensor before the demonstration.

Avoid covering only part of a panel with cardboard. Blocking a subset of cells can activate bypass diodes and behave like temporary shade rather than a uniform reduction representative of panel aging. As an optional additional test, place a 1-5 ohm resistor in series with one panel to simulate resistance from a corroded connection.

## Dashboard

The ESP32 hosts a web page over Wi-Fi. The dashboard is intended to show:

- Each panel's short-circuit current, open-circuit voltage, and relative current score
- The currently selected panel pairing
- A live chart of output power in watts for the optimized and arbitrary pairings
- The measured percentage gain of the optimized pairing over the baseline

## Project Status

This README describes the project design and measurement approach. Hardware, firmware, and dashboard setup instructions will be added when their implementation is available.