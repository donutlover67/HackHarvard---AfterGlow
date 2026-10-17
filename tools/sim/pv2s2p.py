"""Single-diode simulation of four small 6 V panels wired 2S2P.
Pure Python (no numpy). Answers: does re-pairing give the claimed gain, and how does
the answer depend on light level, bypass diodes and the load?"""
import math, bisect

VT = 0.025693            # thermal voltage at 25 C
NS = 12                  # cells per 6 V panel
N_ID = 1.3               # diode ideality
ISC_SUN = 0.38           # A, a 6 V 2 W panel at 1000 W/m^2
VOC_CELL_SUN = 0.60      # V per cell at full sun
I0 = ISC_SUN / math.exp(VOC_CELL_SUN / (N_ID * VT))
RS_CELL = 0.05           # ohm
RSH_CELL = 200.0         # ohm
BYP_IS, BYP_N = 2e-6, 1.05   # Schottky bypass diode (~0.3 V at 0.1 A)

def panel_iv(iph, bypass, r_ext=0.0):
    """Return (V list ascending, I list) for one panel (+ optional bypass diode and series R)."""
    pts = []
    vj = -1.6
    while vj < 0.75:
        i = iph - I0 * (math.exp(vj / (N_ID * VT)) - 1) - vj / RSH_CELL
        v = NS * (vj - i * RS_CELL) - i * r_ext
        pts.append((v, i))
        vj += 0.0005
    pts.sort()
    vs = [p[0] for p in pts]; is_ = [p[1] for p in pts]
    if bypass:
        is_ = [i + (BYP_IS * (math.exp(min(-v / (BYP_N * VT), 40.0)) - 1) if v < 0 else 0.0)
               for v, i in zip(vs, is_)]
        keep = [k for k, i in enumerate(is_) if i < 5.0]
        vs = [vs[k] for k in keep]; is_ = [is_[k] for k in keep]
    return vs, is_

def interp(x, xs, ys):
    """Linear interpolation, xs ascending; clamps at the ends."""
    if x <= xs[0]: return ys[0]
    if x >= xs[-1]: return ys[-1]
    k = bisect.bisect_left(xs, x)
    x0, x1 = xs[k - 1], xs[k]; y0, y1 = ys[k - 1], ys[k]
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0)

def v_of_i(curve, i):
    vs, is_ = curve                     # I decreases as V increases
    return interp(-i, [-x for x in is_], vs)  # invert via ascending -I

def string_iv(c1, c2, imax):
    """Series string: V(I) = V1(I) + V2(I). Return (V ascending, I) for V >= 0."""
    pts = []
    n = 3000
    for k in range(n + 1):
        i = imax * k / n
        pts.append((v_of_i(c1, i) + v_of_i(c2, i), i))
    pts = [p for p in pts if p[0] >= -0.01]
    pts.sort()
    return [p[0] for p in pts], [p[1] for p in pts]

def array_iv(sx, sy):
    vmax = min(sx[0][-1], sy[0][-1]) + 2.0
    vs, is_ = [], []
    v = 0.0
    while v <= vmax:
        ix = max(interp(v, *sx), -1.0); iy = max(interp(v, *sy), -1.0)
        vs.append(v); is_.append(ix + iy)
        v += 0.005
    return vs, is_

def pmax(arr):
    best = max(((v * i, v, i) for v, i in zip(*arr) if i > 0), default=(0, 0, 0))
    return best

def op_resistor(arr, r):
    vs, is_ = arr
    for v, i in zip(vs, is_):
        if i <= v / r:
            return v * i, v, i
    return 0, 0, 0

def op_pump(arr, ra=6.0, k_e=0.008, t0=0.0004, kq=1.57e-9, i_start=0.08):
    """Brushed 12 V pump: V = I*Ra + Ke*w, Kt*I = T0 + kq*w^2. Returns (P, V, I, rpm)."""
    vs, is_ = arr
    best = None
    for v, i in zip(vs, is_):
        # motor current needed at this voltage: solve I*Ra + Ke*sqrt((Ke*I - T0)/kq) = V
        lo, hi = 0.0, 3.0
        for _ in range(60):
            mid = (lo + hi) / 2
            w = math.sqrt(max(k_e * mid - t0, 0) / kq)
            vm = mid * ra + (k_e * w if mid > t0 / k_e else 0)
            if vm < v: lo = mid
            else: hi = mid
        im = lo
        if im >= i:     # array can no longer supply what the motor draws
            w = math.sqrt(max(k_e * i - t0, 0) / kq)
            running = i >= i_start
            return v * i, v, i, (w * 60 / (2 * math.pi) if running else 0.0)
    return 0, 0, 0, 0

def config(panels, pairing, imax):
    (a, b), (c, d) = pairing
    return array_iv(string_iv(panels[a], panels[b], imax), string_iv(panels[c], panels[d], imax))

PAIRINGS = {"A (1+2)(3+4)": ((0, 1), (2, 3)),
            "B (1+3)(2+4)": ((0, 2), (1, 3)),
            "C (1+4)(2+3)": ((0, 3), (1, 2))}

def run(iph_list, bypass, label, r_ext=(0, 0, 0, 0)):
    panels = [panel_iv(iph, bypass, r) for iph, r in zip(iph_list, r_ext)]
    imax = max(iph_list) * 1.6
    res = {}
    for name, pr in PAIRINGS.items():
        arr = config(panels, pr, imax)
        res[name] = (arr, pmax(arr))
    best = max(res, key=lambda k: res[k][1][0])
    r_load = res[best][1][1] / res[best][1][2]      # resistor sized for the best pairing's MPP
    print(f"\n=== {label} | Iph={iph_list} A | bypass={bypass} ===")
    print(f"{'pairing':14s} {'Pmax W':>8s} {'Vmp':>6s} {'Imp':>6s} | {'P@R W':>7s} | {'Ppump W':>7s} {'Vpump':>6s} {'rpm':>6s}")
    for name, (arr, (p, v, i)) in res.items():
        pr_, _, _ = op_resistor(arr, r_load)
        pp, vp, ip, rpm = op_pump(arr)
        print(f"{name:14s} {p:8.3f} {v:6.2f} {i:6.3f} | {pr_:7.3f} | {pp:7.3f} {vp:6.2f} {rpm:6.0f}")
    ps = {k: res[k][1][0] for k in res}
    worst = min(ps.values()); avg = sum(ps.values()) / 3
    print(f"best={best}: +{100*(ps[best]/worst-1):.1f}% vs worst, +{100*(ps[best]/avg-1):.1f}% vs average of 3 (R_load={r_load:.1f} ohm)")
    pr_best = op_resistor(res[best][0], r_load)[0]
    pr_worst = min(op_resistor(res[k][0], r_load)[0] for k in res)
    print(f"  into fixed resistor: +{100*(pr_best/max(pr_worst,1e-9)-1):.1f}% best vs worst  <-- load-dependent, overstates")
    pumps = {k: op_pump(res[k][0])[0] for k in res}
    if min(pumps.values()) > 0:
        print(f"  into 12 V pump model: +{100*(pumps[best]/min(pumps.values())-1):.1f}% best vs worst")
    return res

if __name__ == "__main__":
    for light, h in [("full sun", 0.38), ("lamp box ~40% sun", 0.15), ("weak lamp ~13% sun", 0.05),
                     ("room light ~0.5% sun", 0.0019)]:
        for byp in (False, True):
            run([h * 0.5, h * 0.5, h, h], byp, f"{light}, 2 panels at 50% film")
    run([0.15 * 0.8, 0.15 * 0.8, 0.15, 0.15], True, "lamp box, 2 panels at 80% (realistic aging)")
    run([0.15 * 1.0, 0.15 * 0.9, 0.15 * 0.8, 0.15 * 0.7], True, "lamp box, spread 100/90/80/70%")
    # series-resistance defect: Isc unchanged, power drops
    for r in (0.0, 3.0, 5.0):
        c = panel_iv(0.15, True, r)
        isc = interp(0.0, *c)
        best = max((v * i, v, i) for v, i in zip(*c) if v >= 0)
        print(f"single panel, +{r:.0f} ohm series: Isc={isc*1000:.1f} mA, Voc~{v_of_i(c, 0.0):.2f} V, Pmax={best[0]*1000:.0f} mW")
