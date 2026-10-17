// Array Builder: group panels into series strings, matching current within a string and balancing
// voltage across strings, and check the answer against brute force while the pool is small enough
// to enumerate. The same logic as tools/eval/advisor_voltage.py.
window.SSBuilder = (function () {
  const M = window.SSModel;
  const LOW_VOC_RATIO = 0.8;
  // The swap search is quadratic in the number of strings: under a second up to 40 panels, 2.6 s at 80, far longer
  // beyond. Above this many panels the best of the four starting groupings is used as it is, and the page says so.
  const POLISH_LIMIT = 60;

  function chunk(list, k) { const out = []; for (let i = 0; i < list.length; i += k) out.push(list.slice(i, i + k)); return out; }
  const byCurrent = (panels) => [...panels].sort((a, b) => b.isc_ma - a.isc_ma);

  // sort by current: strongest with strongest
  function sortByCurrent(panels, k) { return chunk(byCurrent(panels), k); }
  // naive: the order the panels came in, as an installer would wire a mixed batch
  function naive(panels, k) { return chunk(panels, k); }

  // panels whose Voc is under 0.8 x the pool's median: possibly a failed cell group (the low_voc flag's rule)
  function lowVocIds(panels) {
    if (!panels.length) return new Set();
    const med = panels.map((p) => p.voc_v).sort((a, b) => a - b)[Math.floor(panels.length / 2)];
    return new Set(panels.filter((p) => p.voc_v < LOW_VOC_RATIO * med).map((p) => p.id));
  }
  // voltage-balanced: low-voltage panels dealt as evenly as possible across strings (one per string while
  // there are fewer of them than strings); the healthy strings come first and take the strongest panels,
  // the voltage-limited strings take the weakest
  function balanced(panels, k) {
    const low = lowVocIds(panels);
    let lows = byCurrent(panels.filter((p) => low.has(p.id)));
    let normals = byCurrent(panels.filter((p) => !low.has(p.id)));
    const m = panels.length / k, q = Math.floor(lows.length / m), r = lows.length % m;
    const groups = [];
    for (let s = 0; s < m; s++) {
      const c = s < m - r ? q : q + 1;
      groups.push([...normals.slice(0, k - c), ...lows.slice(0, c)]);
      normals = normals.slice(k - c); lows = lows.slice(c);
    }
    return groups;
  }
  // the same spread, but each low-voltage string takes the healthy panels closest to it in current
  // (better when the low-voltage panels are strong)
  function balancedMatched(panels, k) {
    const low = lowVocIds(panels);
    let lows = byCurrent(panels.filter((p) => low.has(p.id)));
    const normals = byCurrent(panels.filter((p) => !low.has(p.id)));
    const m = panels.length / k, q = Math.floor(lows.length / m), r = lows.length % m;
    const groups = [];
    for (let s = 0; s < m; s++) {
      const c = s < r ? q + 1 : q;            // strings holding the most low-voltage panels first
      if (c === 0) break;
      const g = lows.slice(0, c); lows = lows.slice(c);
      const target = g.reduce((t, p) => t + p.isc_ma, 0) / c;
      for (let n = 0; n < k - c; n++) {
        let bi = 0;                             // ties: the stronger one
        normals.forEach((p, i) => { if (Math.abs(p.isc_ma - target) < Math.abs(normals[bi].isc_ma - target)) bi = i; });
        g.push(normals.splice(bi, 1)[0]);
      }
      groups.push(g);
    }
    return [...chunk(normals, k), ...groups];
  }
  // low-voltage panels packed into the last strings, sacrificing as few strings as possible
  function packed(panels, k) {
    const low = lowVocIds(panels);
    return chunk([...byCurrent(panels.filter((p) => !low.has(p.id))), ...byCurrent(panels.filter((p) => low.has(p.id)))], k);
  }

  // sample each string's I(V) once on a shared voltage grid, so a grouping's power is a sum (tools/eval/builder.py StringCache)
  function stringCache(panels, k, steps = 200) {
    const vmax = Math.max(panels.map((p) => p.voc_v).sort((a, b) => b - a).slice(0, k).reduce((s, v) => s + v, 0), 0.1);
    const grid = Array.from({ length: steps + 1 }, (_, i) => (vmax * i) / steps);
    const cache = new Map();
    const currents = (g) => {
      const kk = g.map((p) => p.id).sort().join("+");
      if (!cache.has(kk)) cache.set(kk, grid.map((v) => M.stringI(g.map((p) => p.model), v)));
      return cache.get(kk);
    };
    return (groups) => { const cols = groups.map(currents); let best = 0; grid.forEach((v, i) => { const p = v * cols.reduce((s, c) => s + c[i], 0); if (p > best) best = p; }); return best; };
  }
  // pairwise swaps between strings while the model says one gains power
  function polish(groups, pw) {
    groups = groups.map((g) => [...g]);
    let best = pw(groups), kept = 0, improved = true;
    while (improved) {
      improved = false;
      for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) for (let i = 0; i < groups[a].length; i++) for (let j = 0; j < groups[b].length; j++) {
        [groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]];
        const p = pw(groups);
        if (p > best * (1 + 1e-9)) { best = p; kept++; improved = true; } else [groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]];
      }
    }
    return { groups, kept };
  }
  // the matched grouping: polish four starting points by swaps, keep the best by the model
  function matched(panels, k) {
    const pw = stringCache(panels, k);
    const starts = [["matched by current, low-voltage panels spread across strings", balanced(panels, k)], ["low-voltage panels spread across strings, each with the panels closest to it in current", balancedMatched(panels, k)],
      ["sorted by current", sortByCurrent(panels, k)], ["low-voltage panels kept together in the last strings", packed(panels, k)]];
    let best = null;
    const noPolish = panels.length > POLISH_LIMIT;
    starts.forEach(([how, g]) => {
      const { groups, kept } = noPolish ? { groups: g, kept: 0 } : polish(g, pw);
      const p = pw(groups);
      if (!best || p > best.p * (1 + 1e-9)) best = { p, groups, how: how + (kept ? `, then ${kept} swap${kept === 1 ? "" : "s"}` : "") };   // ties keep the earlier start
    });
    if (noPolish) best.how += `, no swap search above ${POLISH_LIMIT} panels`;
    return { groups: best.groups, how: best.how, lowVoc: [...lowVocIds(panels)] };
  }

  // every way to split items into unordered groups of size k
  function partitions(items, k) {
    const out = [];
    const rec = (rest, acc) => {
      if (!rest.length) { out.push(acc); return; }
      const first = rest[0];
      const others = rest.slice(1);
      const combos = (arr, n, start, cur) => {
        if (cur.length === n) { const used = new Set(cur); rec(others.filter((x) => !used.has(x)), [...acc, [first, ...cur]]); return; }
        for (let i = start; i < arr.length; i++) combos(arr, n, i + 1, [...cur, arr[i]]);
      };
      combos(others, k - 1, 0, []);
    };
    rec(items, []);
    return out;
  }
  function countPartitions(n, k) {
    // n! / ((k!)^(n/k) (n/k)!)
    const f = (x) => (x <= 1 ? 1 : x * f(x - 1));
    return Math.round(f(n) / (f(k) ** (n / k) * f(n / k)));
  }

  function power(groups) { return M.arrayPmax(groups.map((g) => g.map((p) => p.model))).p; }
  function key(groups) { return groups.map((g) => g.map((p) => p.id).sort().join("+")).sort().join(" | "); }

  // panels: [{id, isc_ma, voc_v}] ; k: panels per string
  function analyze(panels, k, bruteLimit = 10) {
    const ps = panels.map((p) => ({ ...p, model: M.panel(p.isc_ma, p.voc_v) }));
    if (ps.length < k || ps.length % k !== 0) return { error: `Pick a multiple of ${k} panels (you picked ${ps.length}).` };
    const mg = matched(ps, k); const g = mg.groups; const n = naive(ps, k);
    // res.greedy is the matched grouping (the name predates the voltage balancing)
    const res = { k, n: ps.length, greedy: { groups: g, pmax: power(g), how: mg.how, lowVoc: mg.lowVoc }, naive: { groups: n, pmax: power(n) }, brute: null };
    const total = countPartitions(ps.length, k);
    if (ps.length <= bruteLimit) {
      const all = partitions(ps, k);
      let best = null, worst = null, sum = 0;
      all.forEach((groups) => { const p = power(groups); sum += p; if (!best || p > best.pmax) best = { groups, pmax: p }; if (!worst || p < worst.pmax) worst = { groups, pmax: p }; });
      res.brute = { count: all.length, best, worst, average: sum / all.length, greedyIsBest: key(best.groups) === key(g) || Math.abs(best.pmax - res.greedy.pmax) < 1e-6 };
    } else {
      // too many groupings to enumerate: estimate the average from random groupings
      let sum = 0; const samples = ps.length > 40 ? 60 : 200;   // fewer random groupings for big pools: each costs a model run per string
      for (let s = 0; s < samples; s++) { const sh = [...ps].sort(() => Math.random() - 0.5); sum += power(chunk(sh, k)); }
      res.sampledAverage = sum / samples; res.sampledCount = samples; res.totalGroupings = total;
    }
    return res;
  }

  return { analyze, matched, balanced, balancedMatched, sortByCurrent, naive, lowVocIds, partitions, countPartitions, key };
})();
