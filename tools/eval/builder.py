"""Grouping logic, identical to site/js/builder.js: greedy (sort by current), naive (as they came),
and brute force over every partition into strings of k panels."""
import math
import random

import model


def chunk(items, k):
    return [items[i:i + k] for i in range(0, len(items), k)]


def greedy(panels, k):
    """Strongest with strongest. panels: list of dicts with isc_ma, voc_v, id."""
    return chunk(sorted(panels, key=lambda p: -p["isc_ma"]), k)


def naive(panels, k):
    return chunk(list(panels), k)


def partitions(items, k):
    """Every way to split items into unordered groups of size k."""
    if not items:
        yield []
        return
    first, rest = items[0], items[1:]
    for combo in _combos(rest, k - 1):
        used = set(id(x) for x in combo)
        remaining = [x for x in rest if id(x) not in used]
        for tail in partitions(remaining, k):
            yield [[first, *combo], *tail]


def _combos(items, n, start=0):
    if n == 0:
        yield []
        return
    for i in range(start, len(items)):
        for tail in _combos(items, n - 1, i + 1):
            yield [items[i], *tail]


def count_partitions(n, k):
    return math.factorial(n) // (math.factorial(k) ** (n // k) * math.factorial(n // k))


def power(groups):
    return model.array_pmax([[model.panel(p["isc_ma"], p["voc_v"]) for p in g] for g in groups])[0]


def key(groups):
    return " | ".join(sorted("+".join(sorted(p["id"] for p in g)) for g in groups))


class StringCache:
    """Brute force visits the same strings many times. Sample each string's I(V) once on a shared
    voltage grid (0 .. the largest string Voc in the pool), then any grouping's power is a sum."""

    def __init__(self, panels, k, steps=200):
        self.models = {p["id"]: model.panel(p["isc_ma"], p["voc_v"]) for p in panels}
        vmax = max(sum(sorted((p["voc_v"] for p in panels), reverse=True)[:k]), 0.1)
        self.grid = [vmax * i / steps for i in range(steps + 1)]
        self.cache = {}

    def string_currents(self, group):
        kk = "+".join(sorted(p["id"] for p in group))
        if kk not in self.cache:
            ps = [self.models[p["id"]] for p in group]
            self.cache[kk] = [model.string_i(ps, v) for v in self.grid]
        return self.cache[kk]

    def power(self, groups):
        cols = [self.string_currents(g) for g in groups]
        return max(v * sum(c[i] for c in cols) for i, v in enumerate(self.grid))


def analyze(panels, k, brute_limit=10):
    if len(panels) < k or len(panels) % k:
        raise ValueError(f"need a multiple of {k} panels, got {len(panels)}")
    sc = StringCache(panels, k)
    g = greedy(panels, k)
    n = naive(panels, k)
    res = {"k": k, "n": len(panels), "greedy": {"groups": g, "pmax": sc.power(g)}, "naive": {"groups": n, "pmax": sc.power(n)}, "brute": None}
    if len(panels) <= brute_limit:
        best = worst = None
        total = 0.0
        count = 0
        for groups in partitions(list(panels), k):
            p = sc.power(groups)
            total += p
            count += 1
            if best is None or p > best["pmax"]:
                best = {"groups": groups, "pmax": p}
            if worst is None or p < worst["pmax"]:
                worst = {"groups": groups, "pmax": p}
        res["brute"] = {"count": count, "best": best, "worst": worst, "average": total / count,
                        "greedy_is_best": key(best["groups"]) == key(g) or abs(best["pmax"] - res["greedy"]["pmax"]) < 1e-6}
    else:
        rng = random.Random(1)
        samples = 200
        total = 0.0
        for _ in range(samples):
            sh = list(panels)
            rng.shuffle(sh)
            total += sc.power(chunk(sh, k))
        res["sampled_average"] = total / samples
        res["total_groupings"] = count_partitions(len(panels), k)
    return res
