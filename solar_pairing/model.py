"""Electrical model for four reused panels wired as two series pairs in parallel.

A series string carries only the smaller panel current. Parallel strings share
a bus voltage and their currents add. Four panels have exactly three ways to
split into two unordered pairs.
"""

from __future__ import annotations

from dataclasses import dataclass

SHUNT_OHM = 0.1
# One of three cell groups lost: open-circuit voltage falls by about a third.
FAILED_GROUP_VOLTAGE_RATIO = 2.0 / 3.0
VOLTAGE_FLAG_FRACTION = 0.20


@dataclass(frozen=True)
class Panel:
    name: str
    isc_a: float
    voc_v: float
    series_ohm: float = 0.0


def isc_from_shunt(voltage_v: float, shunt_ohm: float = SHUNT_OHM) -> float:
    """Convert INA219 shunt voltage to current. current = voltage / 0.1 ohm."""
    if shunt_ohm <= 0:
        raise ValueError("shunt resistance must be positive")
    return voltage_v / shunt_ohm


def relative_current_scores(panels: list[Panel]) -> list[float]:
    """Each panel's short-circuit current as a percent of the highest."""
    peak = max((panel.isc_a for panel in panels), default=0.0)
    if peak <= 0:
        return [0.0 for _ in panels]
    return [panel.isc_a / peak * 100.0 for panel in panels]


def voltage_flags(panels: list[Panel], fraction: float = VOLTAGE_FLAG_FRACTION) -> list[bool]:
    """Flag a panel whose open-circuit voltage is more than 20% below the others."""
    flags: list[bool] = []
    for index, panel in enumerate(panels):
        others = [other.voc_v for other_index, other in enumerate(panels) if other_index != index]
        reference = max(others) if others else panel.voc_v
        flags.append(panel.voc_v < reference * (1.0 - fraction))
    return flags


def pairings(panel_count: int = 4) -> tuple[tuple[tuple[int, int], tuple[int, int]], ...]:
    """Every way to split panels into two unordered series pairs."""
    if panel_count != 4:
        raise ValueError("this prototype pairs exactly four panels")
    return (
        ((0, 1), (2, 3)),
        ((0, 2), (1, 3)),
        ((0, 3), (1, 2)),
    )


def pairing_key(pairing: tuple[tuple[int, int], tuple[int, int]]) -> str:
    left, right = pairing
    return f"{left[0]}{left[1]}-{right[0]}{right[1]}"


def string_voltage_current(first: Panel, second: Panel) -> tuple[float, float]:
    """Series pair: current is the lower short-circuit current, voltage is the sum."""
    current_a = min(first.isc_a, second.isc_a)
    open_voltage = first.voc_v + second.voc_v
    drop = current_a * (first.series_ohm + second.series_ohm)
    return max(0.0, open_voltage - drop), current_a


def output_power_w(
    panels: list[Panel],
    pairing: tuple[tuple[int, int], tuple[int, int]],
) -> float:
    """Power at the combined output. Parallel strings share the lower string voltage."""
    (left_a, left_b), (right_a, right_b) = pairing
    voltage_left, current_left = string_voltage_current(panels[left_a], panels[left_b])
    voltage_right, current_right = string_voltage_current(panels[right_a], panels[right_b])
    contributing = [
        (voltage, current)
        for voltage, current in ((voltage_left, current_left), (voltage_right, current_right))
        if voltage > 0 and current > 0
    ]
    if not contributing:
        return 0.0
    bus_voltage = min(voltage for voltage, _current in contributing)
    total_current = sum(current for voltage, current in contributing if voltage >= bus_voltage)
    return bus_voltage * total_current


def rank_pairings(panels: list[Panel]) -> list[tuple[tuple[tuple[int, int], tuple[int, int]], float]]:
    """All three pairings, highest measured output power first."""
    ranked = [(pairing, output_power_w(panels, pairing)) for pairing in pairings(len(panels))]
    ranked.sort(key=lambda item: item[1], reverse=True)
    return ranked
