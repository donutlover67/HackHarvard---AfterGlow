# Serial protocol between the ESP32 and the dashboard

Owner: B. Changes go through docs/NOTES.md first, because the firmware and the dashboard are built against this file by different people.

Transport: USB serial, 115200 baud, 8N1. Each message is one JSON object on one line, terminated by `\n`. Receivers ignore lines that are not valid JSON (the ESP32 prints boot noise on reset) and objects whose `type` they don't know.

Conventions:
- `t` is milliseconds since the ESP32 booted (`millis()`).
- Pairings are `"A"`, `"B"` or `"C"` (docs/spec-v2.md §11.2). Panels are numbered 1–4; slots are `"S1"`–`"S4"`.
- Currents are in milliamps (`_ma`), voltages in volts (`_v`), power in watts (`_w`), percentages in percent (`_pct`).
- Numbers are plain JSON numbers; the dashboard rounds for display.

## ESP32 → dashboard

### hello — once after boot, and in reply to STATUS
```json
{"type":"hello","fw":"0.2","panels":4,"factors":[1,1,1,1],"mode":"RUN","pairing":"A","pump":true}
```
`factors` are the lamp-box correction factors (spec §6), multiplied into each panel's corrected Isc.

### live — every 200 ms in every mode
```json
{"type":"live","t":123456,"mode":"RUN","pairing":"A","pump":true,"out":{"v":11.2,"i_ma":205.3,"p_w":2.30},"panels":[{"id":1,"slot":"S1","i_ma":102.1},{"id":2,"slot":"S2","i_ma":101.7},{"id":3,"slot":"S3","i_ma":103.0},{"id":4,"slot":"S4","i_ma":102.4}]}
```
`mode` is one of `IDLE`, `RUN`, `GRADE`, `SWEEP`, `SEARCH`, `PROOF`, `PUMPPROOF`, `CAL`. `out` is the combined output (the OUT sensor). `panels[].i_ma` is the absolute current through that panel, mapped from slot to panel using the active pairing.

### grade — after GRADE and at the start of SEARCH
```json
{"type":"grade","t":123,"panels":[{"id":1,"isc_ma":150.2,"isc_raw_ma":148.9,"voc_v":6.81,"score":100.0,"grade":"A","flags":[]}],"predicted":"B"}
```
`isc_ma` is corrected by the box factor; `isc_raw_ma` is the raw reading. `grade` is `"A"` (score ≥ 90), `"B"` (75–90) or `"C"` (< 75). `flags` may contain `"weak"`, `"low_voc"` (possible failed cell group) and `"dark"` (Isc below 5 mA: no light or disconnected). `predicted` is the pairing the scores predict (sort by Isc, pair 1st with 2nd and 3rd with 4th).

### sweep — after each I-V sweep
```json
{"type":"sweep","t":123,"pairing":"B","pmax_w":2.04,"vmp_v":11.0,"imp_ma":185,"voc_v":13.6,"isc_ma":152,"ff":0.69,"n":412,"pts":[[0.1,152.1],[0.5,151.9]]}
```
`pts` are `[voltage_v, current_ma]` pairs from short circuit to open circuit, binned to 0.1 V, at most 80 points. `n` is the number of raw samples. `ff` is the fill factor, pmax ÷ (Isc × Voc).

### search — after the three sweeps of SEARCH
```json
{"type":"search","t":123,"pmax_w":{"A":1.48,"B":2.04,"C":1.48},"best":"B","predicted":"B","match":true}
```

### proof — after every PROOF or PUMPPROOF cycle
```json
{"type":"proof","t":123,"kind":"sweep","best":"B","base":"A","cycle":7,"p_best_w":2.03,"p_base_w":1.47,"gain_pct":38.1,"ci95_pct":1.2}
```
`kind` is `"sweep"` (maximum power from I-V sweeps) or `"pump"` (average power into the pump). `gain_pct` and `ci95_pct` are the running mean and 95% confidence half-width over all cycles so far. `p_best_w` and `p_base_w` are this cycle's values.

### cal — after CAL k, CALSAVE and CALRESET
```json
{"type":"cal","box":2,"reading_ma":147.1,"factors":[1.00,0.98,1.03,0.99]}
```
`box` and `reading_ma` are present after `CAL k`; `factors` after CALSAVE or CALRESET.

### error — on any fault
```json
{"type":"error","msg":"INA219 0x44 on Wire not found"}
```

### log — free text, for humans
```json
{"type":"log","msg":"sweep A: 412 samples in 0.81 s"}
```

## Dashboard → ESP32

One command per line, terminated by `\n`, case-insensitive. Unknown commands get `{"type":"error","msg":"unknown command"}`.

| Command | Effect |
|---|---|
| `GRADE` | Measure Isc (all panels at once) and Voc; send `grade`. |
| `SWEEP` | One I-V sweep of the active pairing; send `sweep`. |
| `SEARCH` | GRADE, then sweep A, B and C; send `search`; switch to the best pairing with the pump on. |
| `RUN A` / `RUN B` / `RUN C` / `RUN BEST` | Switch pairing, pump on, keep sending `live`. |
| `PROOF` / `PROOF A|B|C|WORST` | Alternate best and baseline sweeps in ABBA order for 20 cycles; send `proof` after each. Default baseline: the worst pairing from the last SEARCH. |
| `PUMPPROOF` / `PUMPPROOF A|B|C|WORST` | Same, measuring average pump power for 5 s per pairing. |
| `STOP` | Abort the current mode and return to RUN with the current pairing. |
| `PUMP ON` / `PUMP OFF` | Override the pump relay. |
| `CAL 1`..`CAL 4` | Measure the reference panel in box k; send `cal`. |
| `CALSAVE` / `CALRESET` | Store the box factors in flash / reset them to 1. |
| `STATUS` | Send `hello`. |
