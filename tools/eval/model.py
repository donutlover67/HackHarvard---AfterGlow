"""Single-diode panel model, identical to site/js/model.js (and the bench dashboard's mock).

A passport gives short-circuit current and open-circuit voltage; the diode saturation current
is fitted so the model's Voc matches the measurement. Each panel has a bypass diode.
"""
import math

VT = 0.025693        # thermal voltage at 25 C
NS = 12              # cells per 6 V panel
N_ID = 1.3           # diode ideality
RS = 0.05 * NS       # series resistance per panel, ohm
BYPASS_V = -0.35     # Schottky bypass diode


def panel(isc_ma, voc_v):
    iph = isc_ma / 1000.0
    i0 = iph / (math.exp(voc_v / (NS * N_ID * VT)) - 1)
    return (iph, i0)


def panel_v(p, i):
    iph, i0 = p
    if i >= iph:
        return BYPASS_V
    return max(NS * N_ID * VT * math.log((iph - i) / i0 + 1) - i * RS, BYPASS_V)


def string_v(ps, i):
    return sum(panel_v(p, i) for p in ps)


def string_i(ps, v):
    if v >= string_v(ps, 0.0):
        return 0.0
    lo, hi = 0.0, max(p[0] for p in ps) + 0.01
    for _ in range(40):
        mid = (lo + hi) / 2
        if string_v(ps, mid) > v:
            lo = mid
        else:
            hi = mid
    return lo


def array_pmax(groups, steps=240):
    """groups: lists of panel tuples; each group is a series string, strings in parallel.
    Returns (pmax_w, vmp_v, imp_a)."""
    voc = max(string_v(g, 0.0) for g in groups)
    best = (0.0, 0.0, 0.0)
    for k in range(steps + 1):
        v = voc * k / steps
        i = sum(string_i(g, v) for g in groups)
        if v * i > best[0]:
            best = (v * i, v, i)
    return best
