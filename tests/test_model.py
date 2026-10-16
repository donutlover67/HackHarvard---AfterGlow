import json
import threading
import unittest
import urllib.request

from solar_pairing.model import (
    Panel,
    isc_from_shunt,
    output_power_w,
    pairings,
    rank_pairings,
    relative_current_scores,
    voltage_flags,
)
from solar_pairing.server import make_handler
from solar_pairing.sim import Simulator, measure_panel, default_setups
from http.server import ThreadingHTTPServer


def unit_panels():
    """Two panels at 1.0 current unit and two at 0.5, each at 1 voltage unit."""
    return [
        Panel("A", 1.0, 1.0),
        Panel("B", 1.0, 1.0),
        Panel("C", 0.5, 1.0),
        Panel("D", 0.5, 1.0),
    ]


class ModelTests(unittest.TestCase):
    def test_shunt_converts_ina219_voltage_to_current(self):
        self.assertAlmostEqual(isc_from_shunt(0.03), 0.3)

    def test_exactly_three_pairings(self):
        found = pairings()
        self.assertEqual(len(found), 3)
        covered = {tuple(sorted(pair)) for pairing in found for pair in pairing}
        self.assertEqual(covered, {(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)})

    def test_relative_scores_remove_shared_light(self):
        panels = unit_panels()
        self.assertEqual(relative_current_scores(panels), [100.0, 100.0, 50.0, 50.0])

    def test_pitch_example_is_two_versus_three_power_units(self):
        panels = unit_panels()
        matched = output_power_w(panels, ((0, 1), (2, 3)))
        mismatched = output_power_w(panels, ((0, 2), (1, 3)))
        self.assertAlmostEqual(mismatched, 2.0)
        self.assertAlmostEqual(matched, 3.0)
        gain = (matched - mismatched) / mismatched * 100.0
        self.assertAlmostEqual(gain, 50.0)
        best, best_power = rank_pairings(panels)[0]
        self.assertEqual(best, ((0, 1), (2, 3)))
        self.assertAlmostEqual(best_power, 3.0)

    def test_low_open_circuit_voltage_is_flagged(self):
        panels = [
            Panel("A", 0.3, 6.0),
            Panel("B", 0.3, 6.0),
            Panel("C", 0.3, 6.0),
            Panel("D", 0.3, 4.0),
        ]
        self.assertEqual(voltage_flags(panels), [False, False, False, True])

    def test_series_resistance_reduces_power(self):
        plain = [Panel("A", 0.3, 6.0), Panel("B", 0.3, 6.0), Panel("C", 0.3, 6.0), Panel("D", 0.3, 6.0)]
        corroded = [Panel("A", 0.3, 6.0, series_ohm=5.0), Panel("B", 0.3, 6.0), Panel("C", 0.3, 6.0), Panel("D", 0.3, 6.0)]
        pairing = ((0, 1), (2, 3))
        self.assertLess(output_power_w(corroded, pairing), output_power_w(plain, pairing))

    def test_tint_scales_short_circuit_current(self):
        full = measure_panel(default_setups()[0], light=1.0)
        tinted = measure_panel(default_setups()[1], light=1.0)
        self.assertAlmostEqual(full.isc_a, 0.30)
        self.assertAlmostEqual(tinted.isc_a, 0.15)


class SimulatorTests(unittest.TestCase):
    def test_alternation_measures_about_fifty_percent_gain(self):
        sim = Simulator()
        sim.drift = False
        for step in range(8):
            sim.tick(now=float(step) * 3.0)
        state = sim.snapshot()
        self.assertAlmostEqual(state["measured_gain_pct"], 50.0, places=1)
        self.assertFalse(state["position_is_optimal"])
        scores = [panel["relative_score"] for panel in state["panels"]]
        self.assertEqual(scores, [100.0, 50.0, 100.0, 50.0])

    def test_position_wiring_is_optimal_when_matched_panels_sit_together(self):
        sim = Simulator()
        sim.drift = False
        sim.update_config(
            {
                "light": 1.0,
                "panels": [
                    {"transmission": 1.0, "series_ohm": 0.0, "cell_group_failed": False},
                    {"transmission": 1.0, "series_ohm": 0.0, "cell_group_failed": False},
                    {"transmission": 0.5, "series_ohm": 0.0, "cell_group_failed": False},
                    {"transmission": 0.5, "series_ohm": 0.0, "cell_group_failed": False},
                ],
            }
        )
        sim.tick(now=0.0)
        state = sim.snapshot()
        self.assertTrue(state["position_is_optimal"])
        optimized = next(row for row in state["pairings"] if "optimized" in row["roles"])
        self.assertIn("arbitrary", optimized["roles"])

    def test_config_rejects_partial_shade_resistance_outside_demo_range(self):
        sim = Simulator()
        with self.assertRaises(ValueError):
            sim.update_config(
                {
                    "light": 1.0,
                    "panels": [
                        {"transmission": 1.2, "series_ohm": 0.0, "cell_group_failed": False},
                        {"transmission": 1.0, "series_ohm": 0.0, "cell_group_failed": False},
                        {"transmission": 1.0, "series_ohm": 0.0, "cell_group_failed": False},
                        {"transmission": 1.0, "series_ohm": 0.0, "cell_group_failed": False},
                    ],
                }
            )


class ApiTests(unittest.TestCase):
    def test_state_and_config_round_trip(self):
        sim = Simulator()
        sim.drift = False
        sim.tick(now=0.0)
        sim.tick(now=3.0)
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(sim))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_address[1]
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/state") as response:
                state = json.load(response)
            self.assertEqual(len(state["panels"]), 4)
            self.assertEqual(len(state["pairings"]), 3)
            self.assertTrue(state["pump_from_panels"])
            self.assertAlmostEqual(state["measured_gain_pct"], 50.0, places=1)

            body = json.dumps(
                {
                    "light": 0.8,
                    "panels": [
                        {"transmission": 1.0, "series_ohm": 0.0, "cell_group_failed": True},
                        {"transmission": 1.0, "series_ohm": 0.0, "cell_group_failed": False},
                        {"transmission": 1.0, "series_ohm": 0.0, "cell_group_failed": False},
                        {"transmission": 1.0, "series_ohm": 0.0, "cell_group_failed": False},
                    ],
                }
            ).encode()
            request = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/config",
                data=body,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request) as response:
                updated = json.load(response)
            self.assertTrue(updated["panels"][0]["voltage_flag"])
            self.assertAlmostEqual(updated["panels"][0]["voc_v"], 4.0, places=2)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
