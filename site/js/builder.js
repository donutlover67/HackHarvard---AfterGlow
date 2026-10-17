// Array Builder: group panels into series strings of similar current, and check the greedy answer
// against brute force while the pool is small enough to enumerate.
window.SSBuilder = (function () {
  const M = window.SSModel;

  function chunk(list, k) { const out = []; for (let i = 0; i < list.length; i += k) out.push(list.slice(i, i + k)); return out; }

  // greedy: strongest with strongest
  function greedy(panels, k) { return chunk([...panels].sort((a, b) => b.isc_ma - a.isc_ma), k); }
  // naive: the order the panels came in, as an installer would wire a mixed batch
  function naive(panels, k) { return chunk(panels, k); }

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
    const g = greedy(ps, k); const n = naive(ps, k);
    const res = { k, n: ps.length, greedy: { groups: g, pmax: power(g) }, naive: { groups: n, pmax: power(n) }, brute: null };
    const total = countPartitions(ps.length, k);
    if (ps.length <= bruteLimit) {
      const all = partitions(ps, k);
      let best = null, worst = null, sum = 0;
      all.forEach((groups) => { const p = power(groups); sum += p; if (!best || p > best.pmax) best = { groups, pmax: p }; if (!worst || p < worst.pmax) worst = { groups, pmax: p }; });
      res.brute = { count: all.length, best, worst, average: sum / all.length, greedyIsBest: key(best.groups) === key(g) || Math.abs(best.pmax - res.greedy.pmax) < 1e-6 };
    } else {
      // too many groupings to enumerate: estimate the average from random groupings
      let sum = 0; const samples = 200;
      for (let s = 0; s < samples; s++) { const sh = [...ps].sort(() => Math.random() - 0.5); sum += power(chunk(sh, k)); }
      res.sampledAverage = sum / samples; res.totalGroupings = total;
    }
    return res;
  }

  return { analyze, greedy, naive, partitions, countPartitions, key };
})();
