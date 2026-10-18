"""Second Use: can this used panel power that device? The physics the eval's truth and the agent's tool share.

A panel's maximum power comes from its passport (short-circuit current, open-circuit voltage) through the same
single-diode model as the bench, the site and the wiring eval (tools/eval/model.py). Over a day it gives
    energy = pmax x peak sun hours x SYSTEM_EFFICIENCY
into a small battery; a device needs watts x hours of use. It can run the device when energy >= need.

The device list is illustrative (typical average draws, stated as assumptions), and the same list is given to every
advisor, so the eval measures the reasoning, not knowledge of device datasheets.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import model  # noqa: E402  (tools/eval/model.py)

# a small charge controller plus a battery's round trip: what reaches the device out of what the panel can give
SYSTEM_EFFICIENCY = 0.65

# id: (name, average watts while in use, typical hours a day). Illustrative average draws.
DEVICES = {
    "ble_beacon":      ("Bluetooth beacon", 0.01, 24),
    "garden_marker":   ("LED garden marker light", 0.1, 6),
    "soil_sensor":     ("LoRa soil-moisture sensor", 0.05, 24),
    "epaper_sign":     ("E-paper bus-stop sign", 0.2, 24),
    "trail_camera":    ("Trail camera on standby", 0.3, 24),
    "led_path_light":  ("LED path light", 0.5, 6),
    "weather_station": ("Wi-Fi weather station", 0.6, 24),
    "small_fan":       ("Small 5 V fan", 1.0, 6),
    "pi_server":       ("Raspberry Pi camera server", 3.0, 24),
    "fountain_pump":   ("12 V fountain pump", 5.0, 3),
    "phone_charging":  ("Phone charging", 10.0, 1.5),
    "clothes_dryer":   ("Electric clothes dryer", 2500.0, 1),
}


def panel_pmax_w(isc_ma, voc_v):
    """Maximum power of one panel, from its passport, in watts."""
    return model.array_pmax([[model.panel(float(isc_ma), float(voc_v))]])[0]


def panel_energy(isc_ma, voc_v, sun_hours):
    """What the panel can deliver to a device in a day: pmax and usable watt-hours."""
    pmax = panel_pmax_w(isc_ma, voc_v)
    return {"pmax_w": round(pmax, 4), "usable_wh_per_day": round(pmax * float(sun_hours) * SYSTEM_EFFICIENCY, 4)}


def check_use(isc_ma, voc_v, sun_hours, device_id, hours_per_day=None):
    """The tool: can this panel run this device for this many hours a day at this site?"""
    if device_id not in DEVICES:
        return {"error": f"unknown device_id {device_id!r}; known: {sorted(DEVICES)}"}
    name, watts, typical = DEVICES[device_id]
    hours = float(typical if hours_per_day is None else hours_per_day)
    e = panel_energy(isc_ma, voc_v, sun_hours)
    need = watts * hours
    return {
        "device_id": device_id, "device": name, "device_w": watts, "hours_per_day": hours,
        "need_wh_per_day": round(need, 4), **e,
        "feasible": e["usable_wh_per_day"] >= need,
        "margin": round(e["usable_wh_per_day"] / need, 3) if need > 0 else None,   # >= 1 means it can
        "max_hours_per_day": round(min(24.0, e["usable_wh_per_day"] / watts), 2),
    }


def naive_feasible(isc_ma, voc_v, device_id):
    """The rule the first SecondLife prototype used: the device's watts under Voc x Isc. Ignores the curve, the sun
    and the hours of use."""
    return DEVICES[device_id][1] <= float(voc_v) * float(isc_ma) / 1000.0
