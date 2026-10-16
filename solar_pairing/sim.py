"""Simulated panels, relay scan, and alternation between pairings.

The ESP32, relays, and INA219 are not in this repository. This stand-in applies
the same measurement rules: tint and light scale short-circuit current, and the
dashboard alternates the optimized pairing with position wiring.
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from dataclasses import dataclass

from solar_pairing.model import (
    FAILED_GROUP_VOLTAGE_RATIO,
    Panel,
    pairing_key,
    rank_pairings,
    relative_current_scores,
    voltage_flags,
)

BASE_ISC_A = 0.30
BASE_VOC_V = 6.0
ALTERNATION_S = 3.0
HISTORY_LIMIT = 90
POSITION_PAIRING = ((0, 1), (2, 3))


@dataclass
class PanelSetup:
    name: str
    transmission: float = 1.0
    series_ohm: float = 0.0
    cell_group_failed: bool = False


def default_setups() -> list[PanelSetup]:
    """B and D pass half the light, so position wiring mismatches each string."""
    return [
        PanelSetup("A", transmission=1.0),
        PanelSetup("B", transmission=0.5),
        PanelSetup("C", transmission=1.0),
        PanelSetup("D", transmission=0.5),
    ]


def measure_panel(setup: PanelSetup, light: float) -> Panel:
    voltage = BASE_VOC_V * (FAILED_GROUP_VOLTAGE_RATIO if setup.cell_group_failed else 1.0)
    current = BASE_ISC_A * light * setup.transmission
    return Panel(setup.name, current, voltage, setup.series_ohm)


class Simulator:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.setups = default_setups()
        self.light_base = 1.0
        self.drift = True
        self.interval_s = ALTERNATION_S
        self.started = time.monotonic()
        self._latest: dict | None = None
        self._reset_samples()

    def _reset_samples(self) -> None:
        self.history: deque[dict] = deque(maxlen=HISTORY_LIMIT)
        self.optimized_samples: deque[float] = deque(maxlen=40)
        self.arbitrary_samples: deque[float] = deque(maxlen=40)
        self.active_role = "optimized"

    def update_config(self, payload: dict) -> None:
        light = payload.get("light", self.light_base)
        if not isinstance(light, (int, float)) or isinstance(light, bool):
            raise ValueError("light must be a number")
        if not 0.2 <= float(light) <= 1.2:
            raise ValueError("light must be between 0.2 and 1.2")
        raw_panels = payload.get("panels")
        if not isinstance(raw_panels, list) or len(raw_panels) != 4:
            raise ValueError("panels must be four setups")
        setups: list[PanelSetup] = []
        for index, raw in enumerate(raw_panels):
            if not isinstance(raw, dict):
                raise ValueError("each panel setup must be an object")
            transmission = float(raw.get("transmission", 1.0))
            series_ohm = float(raw.get("series_ohm", 0.0))
            failed = bool(raw.get("cell_group_failed", False))
            if not 0.0 <= transmission <= 1.0:
                raise ValueError("transmission must be between 0 and 1")
            if not 0.0 <= series_ohm <= 5.0:
                raise ValueError("series resistance must be between 0 and 5 ohms")
            setups.append(
                PanelSetup(
                    self.setups[index].name,
                    transmission=transmission,
                    series_ohm=series_ohm,
                    cell_group_failed=failed,
                )
            )
        with self._lock:
            self.light_base = float(light)
            self.setups = setups
            self._reset_samples()
            self._latest = None

    def light_at(self, now: float) -> float:
        if not self.drift:
            return self.light_base
        return self.light_base * (0.92 + 0.08 * math.sin((now - self.started) / 8.0))

    def tick(self, now: float | None = None) -> None:
        moment = time.monotonic() if now is None else now
        with self._lock:
            self._tick_unlocked(moment)

    def snapshot(self) -> dict:
        with self._lock:
            if self._latest is None:
                self._tick_unlocked(time.monotonic())
            return self._latest

    def _tick_unlocked(self, moment: float) -> None:
        phase = int(moment // self.interval_s)
        self.active_role = "optimized" if phase % 2 == 0 else "arbitrary"
        light = self.light_at(moment)
        panels = [measure_panel(setup, light) for setup in self.setups]
        ranked = rank_pairings(panels)
        best_pairing = ranked[0][0]
        power_by_key = {pairing_key(pairing): power for pairing, power in ranked}
        active_pairing = best_pairing if self.active_role == "optimized" else POSITION_PAIRING
        active_power = power_by_key[pairing_key(active_pairing)]
        if self.active_role == "optimized":
            self.optimized_samples.append(active_power)
        else:
            self.arbitrary_samples.append(active_power)
        self.history.append(
            {
                "t": round(moment, 3),
                "role": self.active_role,
                "power_w": round(active_power, 4),
            }
        )
        self._latest = self._build_state(panels, ranked, light, active_power)

    def _gain_percent(self) -> float | None:
        if not self.optimized_samples or not self.arbitrary_samples:
            return None
        baseline = sum(self.arbitrary_samples) / len(self.arbitrary_samples)
        if baseline <= 0:
            return None
        optimized = sum(self.optimized_samples) / len(self.optimized_samples)
        return (optimized - baseline) / baseline * 100.0

    def _build_state(self, panels, ranked, light, active_power) -> dict:
        scores = relative_current_scores(panels)
        flags = voltage_flags(panels)
        best_key = pairing_key(ranked[0][0])
        position_key = pairing_key(POSITION_PAIRING)
        gain = self._gain_percent()
        pairing_rows = []
        for pairing, power in ranked:
            key = pairing_key(pairing)
            roles = []
            if key == best_key:
                roles.append("optimized")
            if key == position_key:
                roles.append("arbitrary")
            pairing_rows.append(
                {
                    "key": key,
                    "pairs": [
                        [panels[pairing[0][0]].name, panels[pairing[0][1]].name],
                        [panels[pairing[1][0]].name, panels[pairing[1][1]].name],
                    ],
                    "power_w": round(power, 4),
                    "roles": roles,
                }
            )
        return {
            "light": round(light, 4),
            "light_base": self.light_base,
            "active_role": self.active_role,
            "active_power_w": round(active_power, 4),
            "measured_gain_pct": None if gain is None else round(gain, 2),
            "optimized_samples": len(self.optimized_samples),
            "arbitrary_samples": len(self.arbitrary_samples),
            "position_is_optimal": best_key == position_key,
            "pump_from_panels": True,
            "base_isc_a": BASE_ISC_A,
            "base_voc_v": BASE_VOC_V,
            "panels": [
                {
                    "name": panel.name,
                    "isc_ma": round(panel.isc_a * 1000.0, 1),
                    "voc_v": round(panel.voc_v, 3),
                    "relative_score": round(score, 1),
                    "voltage_flag": flag,
                    "transmission": setup.transmission,
                    "series_ohm": setup.series_ohm,
                    "cell_group_failed": setup.cell_group_failed,
                }
                for panel, setup, score, flag in zip(panels, self.setups, scores, flags, strict=True)
            ],
            "pairings": pairing_rows,
            "history": list(self.history),
        }
