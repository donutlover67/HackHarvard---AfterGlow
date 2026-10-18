// Second String site: the front page, the passport index, passport pages with QR codes, the Array Builder, the impact page.
// Plain script, hash-routed, no build step; works from a static host or a local http.server.
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const safeDecode = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };
  const num = (x, digits) => (x != null && x !== "" && Number.isFinite(Number(x)) ? Number(x).toFixed(digits) : "—");
  const PAIR_PANELS = { A: "1+2, 3+4", B: "1+3, 2+4", C: "1+4, 2+3" };
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* unavailable or full */ } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* unavailable */ } },
  };

  // ---------- data ----------
  // Keep only what the pages can draw: a run_id string and passports that are objects with a passport_id string.
  // Anything else (a hand-edited file, an older export) is dropped here instead of crashing a page later.
  function normalizeRun(run) {
    if (!run || typeof run !== "object" || !Array.isArray(run.passports)) throw new Error("not a run export: no passports array");
    if (typeof run.run_id !== "string" || !run.run_id) throw new Error("not a run export: no run_id");
    const passports = run.passports
      .filter((p) => p && typeof p === "object" && typeof p.passport_id === "string" && p.passport_id)
      .map((p) => ({ ...p, flags: Array.isArray(p.flags) ? p.flags.filter((f) => typeof f === "string") : [] }));
    if (!passports.length) throw new Error("not a run export: no passport has a passport_id");
    return { ...run, passports };
  }
  let runs = [];
  const stored = LS.get("ss.site.runs", []);
  (Array.isArray(stored) ? stored : []).forEach((r) => { try { runs.push(normalizeRun(r)); } catch (_) { /* stored by an older version: drop it */ } });
  function saveRuns() { LS.set("ss.site.runs", runs); }
  function addRun(raw) {
    const run = normalizeRun(raw);
    runs = runs.filter((r) => r.run_id !== run.run_id);
    runs.push(run);
    runs.sort((a, b) => String(a.measured_at).localeCompare(String(b.measured_at)));
    saveRuns();
  }
  function passports() {
    // latest passport per ID
    const map = new Map();
    runs.forEach((r) => r.passports.forEach((p) => { map.set(p.passport_id, { ...p, run: r }); }));
    return [...map.values()].sort((a, b) => String(a.passport_id).localeCompare(String(b.passport_id)));
  }
  function passport(id) { return passports().find((p) => p.passport_id === id); }
  const SIM_LINKS = ["sample", "mock"];
  const isSim = (run) => !!run && SIM_LINKS.includes(run.link);
  const LINK_WORD = { serial: "Bench", manual: "Typed in by hand", recording: "Recording of a bench run", sample: "Simulated (demo)", mock: "Simulated (demo)" };
  // true until the first pull of runs (the local API, then data/runs/index.json) has finished; empty states say "Loading…" meanwhile
  let loading = true, loadingShown = false;
  const emptyNote = (html) => { if (loading) loadingShown = true; return loading ? `<p class="muted">Loading passports…</p>` : html; };

  // ---------- pieces ----------
  function cellGlyph({ x = 0, y = 0, w = 120, h = 84, name = "", film = false, dim = false }) {
    const c = Math.min(w, h) * 0.13;
    const poly = `${x + c},${y} ${x + w - c},${y} ${x + w},${y + c} ${x + w},${y + h - c} ${x + w - c},${y + h} ${x + c},${y + h} ${x},${y + h - c} ${x},${y + c}`;
    let fingers = "";
    for (let fy = y + 6; fy < y + h - 3; fy += 6) fingers += `<line x1="${x + 3}" y1="${fy}" x2="${x + w - 3}" y2="${fy}" stroke="rgba(255,255,255,0.09)"/>`;
    const bus = [0.25, 0.5, 0.75].map((f) => `<line x1="${x + w * f}" y1="${y + 2}" x2="${x + w * f}" y2="${y + h - 2}" stroke="rgba(255,255,255,0.42)" stroke-width="1.5"/>`).join("");
    return `<g opacity="${dim ? 0.55 : 1}"><polygon points="${poly}" fill="var(--cell)"/>${fingers}${bus}${film ? `<polygon points="${poly}" fill="var(--film)"/>` : ""}${name ? `<text class="cell-name" x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle">${esc(name)}</text>` : ""}</g>`;
  }
  const cellSvg = (opts) => `<svg class="cell-svg" viewBox="0 0 120 84" role="img" aria-label="${esc(opts.label || "panel")}">${cellGlyph({ ...opts, x: 1, y: 1, w: 118, h: 82 })}</svg>`;
  const gradeWord = { A: "strong: within 10% of the best panel in its batch", B: "usable: 75–90% of the best panel", C: "weak: under 75% of the best panel" };
  const flagWord = { weak: "Weak output: under 75% of the strongest panel measured with it.", low_voc: "Open-circuit voltage well below the others: possibly a failed cell group.", dark: "Almost no current: no light, or disconnected." };
  const fmtDay = (iso) => { const d = new Date(typeof iso === "string" || typeof iso === "number" ? iso : NaN); return isNaN(d) ? esc(typeof iso === "string" ? iso : "unknown") : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
  const fmtDate = (iso) => { const d = new Date(typeof iso === "string" || typeof iso === "number" ? iso : NaN); return isNaN(d) ? esc(typeof iso === "string" ? iso : "unknown") : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); };
  function pairingLine(v) {
    if (!v || !v.pmax_w || typeof v.pmax_w !== "object") return "";
    const watts = Object.values(v.pmax_w).map(Number).filter(Number.isFinite);
    const best = Number(v.pmax_w[v.best_pairing]);
    if (!watts.length || !Number.isFinite(best) || best <= 0) return "";
    const worst = Math.min(...watts);
    const gain = worst > 0 ? `, ${((best / worst - 1) * 100).toFixed(0)}% more than the worst wiring` : "";
    return `Best in wiring <b class="pair-${esc(v.best_pairing)}">${esc(v.best_pairing)}</b> (panels ${PAIR_PANELS[v.best_pairing] || ""}): ${best.toFixed(2)} W at maximum power${gain}.`;
  }

  // ---------- pages ----------
  function panelTable(ps) {
    const rows = ps.map((p) => `<tr>
      <td><a href="#/p/${encodeURIComponent(p.passport_id)}">${esc(p.passport_id)}</a></td>
      <td><span class="grade g-${esc(p.grade)}">${esc(p.grade)}</span></td>
      <td class="num">${num(p.isc_ma, 0)} mA</td>
      <td class="num">${num(p.voc_v, 2)} V</td>
      <td class="num">${num(p.score_pct, 0)}%</td>
      <td>${(p.flags || []).map((f) => esc(String(f).replace("_", " "))).join(", ") || "—"}</td>
      <td class="small muted">${fmtDate(p.measured_at)}</td>
    </tr>`).join("");
    return `<table class="table"><thead><tr><th>Passport</th><th>Grade</th><th class="num">Current</th><th class="num">Voltage</th><th class="num">Score</th><th>Flags</th><th>Tested</th></tr></thead><tbody>${rows}</tbody></table>
          <p class="legend">Current is the short-circuit current and voltage the open-circuit voltage, read for every panel at the same instant. Score is a panel's current as a share of the strongest panel tested with it: A within 10%, B 75–90%, C under 75%.</p>`;
  }
  // the passport index: real panels first, the demo kept apart and labelled, the import tools for the team
  function pageIndex() {
    const all = passports();
    const real = all.filter((p) => !isSim(p.run));
    const demo = all.filter((p) => isSim(p.run));
    const demoRun = runs.filter(isSim).slice(-1)[0];
    const firstDemo = demo[0];
    const runRows = runs.map((r) => `<tr><td>${esc(r.run_id)}${isSim(r) ? ` <span class="tag">Simulated</span>` : ""}</td><td class="small">${esc(LINK_WORD[r.link] || "Not recorded")}</td><td class="small muted">${esc(r.bench || "")}</td><td>${r.search ? `<b class="pair-${esc(r.search.best)}">${esc(r.search.best)}</b>` : "—"}</td><td>${r.proof ? `+${num(r.proof.gain_pct, 1)}% ± ${num(r.proof.ci95_pct, 1)} (${r.proof.cycle} cycles)` : r.search ? "search only" : "—"}</td><td>${(r.passports || []).map((p) => `<a href="#/p/${encodeURIComponent(p.passport_id)}">${esc(p.passport_id)}</a>`).join(", ")}</td></tr>`).join("");
    return `
      <h1 class="page-title">Panel passports</h1>
      <p class="lede">Every panel the bench tests gets a passport: an ID, a QR code and the record of what was measured. Real panels sit here; the demo batch is simulated and stays apart.</p>
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:baseline"><h2>Tested panels</h2>${real.length ? `<a class="small no-print" href="#/print">Print passport cards</a>` : ""}</div>
        ${real.length ? panelTable(real) : emptyNote(`<p class="muted">No real panels published yet. Panels tested on the bench appear here with their passports; until then, try the demo below.</p>`)}
      </div>
      <div class="card demo" id="demo">
        <div class="row" style="justify-content:space-between;align-items:baseline"><h2>Demo <span class="tag">Simulated</span></h2>${demo.length ? `<button type="button" class="btn btn--quiet no-print" id="btn-demo-clear">Clear the demo</button>` : ""}</div>
        ${demo.length ? `<p class="muted demo__note">${demoRun && demoRun.bench ? `${esc(String(demoRun.bench).charAt(0).toUpperCase() + String(demoRun.bench).slice(1))}. ` : ""}These numbers come from our panel model, not from a measurement. Open a passport, or group the panels in the Array Builder.</p>
          <div class="row no-print demo__actions">${firstDemo ? `<a class="btn btn--primary" href="#/p/${encodeURIComponent(firstDemo.passport_id)}">Open a demo passport</a>` : ""}<a class="btn" href="#/build">Group them in the Array Builder</a>${demo.length ? `<a class="btn btn--quiet no-print" href="#/print">Print cards</a>` : ""}</div>
          ${panelTable(demo)}`
          : `<p class="muted demo__note">Load four simulated panels, two of them dimmed to act like aged panels, to see passports, grades and the wiring the builder picks. Nothing here is a real measurement.</p>
          <div class="row no-print demo__actions"><button type="button" class="btn btn--primary" id="btn-sample">Load the demo panels</button><span class="status" id="demo-status"></span></div>`}
      </div>
      <details class="card tools no-print">
        <summary>Add a run <span class="muted small">(for the team)</span></summary>
        <p class="muted small">On the bench dashboard, open Data and press “Export passports (JSON)”. Drop that file here, or paste its contents.</p>
        <div class="row" style="margin-top:10px">
          <label class="btn">Choose run file <input type="file" id="run-file" accept="application/json,.json" hidden></label>
          <button type="button" class="btn btn--quiet" id="btn-paste">Paste JSON</button>
          ${runs.length ? `<button type="button" class="btn btn--quiet" id="btn-clear">Remove all ${runs.length} run${runs.length === 1 ? "" : "s"}</button>` : ""}
          <span class="status" id="import-status"></span>
        </div>
        <div id="paste-box" hidden style="margin-top:10px"><label class="field">Run JSON <textarea id="paste-text"></textarea></label><div class="row" style="margin-top:8px"><button type="button" class="btn btn--primary" id="btn-paste-go">Import</button></div></div>
        ${runs.length ? `<h3 class="label" style="margin:16px 0 6px">Runs in this browser</h3><table class="table"><thead><tr><th>Run</th><th>Source</th><th>Notes</th><th>Best wiring</th><th>Gain</th><th>Panels</th></tr></thead><tbody>${runRows}</tbody></table>` : ""}
      </details>`;
  }

  // the simulated example batch; status is the element that reports progress and errors, if any
  function loadSample(status) {
    const say = (text, bad) => { if (!status) return; status.classList.toggle("is-bad", !!bad); status.textContent = text; };
    say("Loading…", false);
    return fetch("data/sample-run.json")
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((run) => { addRun(run); say("", false); render("data"); })
      .catch((err) => say(`Could not import: ${err.message || err}. The sample loads over http, not from a file:// page.`, true));
  }

  function wireIndex() {
    const status = $("#import-status");
    const ok = (run) => { addRun(run); render("data"); };
    const bad = (err) => { status.classList.add("is-bad"); status.textContent = `Could not import: ${err.message || err}`; };
    const importText = (text) => { try { ok(JSON.parse(text)); } catch (err) { bad(err); } };
    $("#run-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (!f) return; f.text().then(importText, bad); });
    const sample = $("#btn-sample");
    if (sample) sample.addEventListener("click", () => loadSample($("#demo-status")));
    const demoClear = $("#btn-demo-clear");
    if (demoClear) demoClear.addEventListener("click", () => { runs = runs.filter((r) => !isSim(r)); saveRuns(); render("data"); });
    $("#btn-paste").addEventListener("click", () => { $("#paste-box").hidden = !$("#paste-box").hidden; });
    $("#btn-paste-go").addEventListener("click", () => importText($("#paste-text").value));
    const clear = $("#btn-clear");
    if (clear) clear.addEventListener("click", () => { if (confirm("Remove every imported run from this browser?")) { runs = []; saveRuns(); render("data"); } });
    document.body.addEventListener("dragover", (e) => { e.preventDefault(); });
    document.body.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) f.text().then(importText, bad); }, { once: true });
  }

  // What someone who just scanned a card needs before the numbers: what tested this panel, and where the rest is.
  const PROJECT_URL = "https://mscl741.github.io/HackHarvard/";
  const passportIntro = (sim) => sim
    ? `<div class="demo-banner" role="note"><b>Demo panel.</b> This passport comes from a simulated batch made by our panel model, not from a real measurement. <a href="#/">What Second String is</a></div>`
    : `<p class="lede passport-intro">This panel was tested by <a href="${PROJECT_URL}">Second String</a>, a bench that grades used solar panels against each other and finds the wiring that wastes the least power. The numbers below were measured, not copied from the label. <a href="#/passports">See every panel tested so far</a>.</p>`;
  // previous / next panel in the same run, so a reader can walk the batch without going back to the list
  function batchNav(p) {
    const batch = p.run && Array.isArray(p.run.passports) ? p.run.passports : [];
    const i = batch.findIndex((q) => q.passport_id === p.passport_id);
    if (batch.length < 2 || i < 0) return "";
    const link = (q, rel, text) => q ? `<a class="pnav__link" rel="${rel}" href="#/p/${encodeURIComponent(q.passport_id)}">${text}</a>` : `<span class="pnav__link is-off">${text}</span>`;
    const prev = batch[i - 1], next = batch[i + 1];
    return `<nav class="pnav no-print" aria-label="Panels in this batch">${link(prev, "prev", `← ${prev ? esc(prev.passport_id) : "Previous"}`)}<span class="pnav__pos">Panel ${i + 1} of ${batch.length} in this batch</span>${link(next, "next", `${next ? esc(next.passport_id) : "Next"} →`)}</nav>`;
  }
  // This panel against the others measured in the same run: relative score bars, this one in ink and the others muted,
  // over the grade bands (C under 75%, B to 90%, A above) so the letter explains itself. Nothing to compare with one panel.
  function batchCard(p) {
    const batch = p.run && Array.isArray(p.run.passports) ? p.run.passports : [];
    if (batch.length < 2) return "";
    const width = (x) => { const v = Number(x); return x != null && x !== "" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0; };
    const pct = (x) => { const s = num(x, 0); return s === "—" ? s : `${s}%`; };
    const rows = batch.map((q) => {
      const me = q.passport_id === p.passport_id;
      const id = me ? `<b class="batch__id" aria-current="page">${esc(q.passport_id)}</b>` : `<a class="batch__id" href="#/p/${encodeURIComponent(q.passport_id)}">${esc(q.passport_id)}</a>`;
      return `<li class="batch__row${me ? " is-me" : ""}">${id}<span class="batch__track"><span class="batch__bar" style="width:${width(q.score_pct)}%"></span></span><span class="batch__pct">${pct(q.score_pct)}</span><span class="grade g-${esc(q.grade)}">${esc(q.grade || "—")}</span></li>`;
    }).join("");
    const scale = `<li class="batch__row batch__scale" aria-hidden="true"><span></span><span class="batch__bands"><span style="width:75%">C</span><span style="width:15%">B</span><span style="width:10%">A</span></span></li>`;
    const word = gradeWord[p.grade];
    return `<div class="card batch-card">
        <h2>Against the panels tested with it</h2>
        <ul class="batch">${rows}${scale}</ul>
        <p class="small muted batch__note">${word ? `<b>Grade ${esc(p.grade)}</b>, ${esc(word)}. ` : ""}Each bar is a panel's short-circuit current as a share of the strongest panel in run ${esc(p.run.run_id)}, all ${isSim(p.run) ? "simulated" : "measured"} at the same instant under the same light.</p>
      </div>`;
  }

  function pagePassport(id) {
    const p = passport(id);
    if (!p) return `<h1 class="page-title">${esc(id)}</h1>${passportIntro(false)}${emptyNote(`<p class="lede">No passport with this ID has been imported into this browser. <a href="#/passports">Back to the list.</a></p>`)}`;
    const url = location.href;
    const qr = window.qrcode(0, "M"); qr.addData(url); qr.make();
    const flags = (p.flags || []).map((f) => `<li>${esc(flagWord[f] || f)}</li>`).join("");
    const sim = isSim(p.run);
    return `
      <div class="row no-print" style="justify-content:space-between;margin-bottom:14px"><a href="#/passports">← ${sim ? "Back to the demo" : "All passports"}</a><button type="button" class="btn btn--quiet" onclick="window.print()">Print this passport</button></div>
      ${passportIntro(sim)}
      ${batchNav(p)}
      <div class="card passport${sim ? " is-sim" : ""}">
        <div class="passport__visual">
          ${cellSvg({ label: p.passport_id, dim: p.grade === "C" })}
          <div class="passport__qr" aria-label="QR code for this passport">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>
          <p class="small muted">Scan to open this passport on another phone.</p>
        </div>
        <div>
          <div class="passport__id">${esc(p.passport_id)}${sim ? ` <span class="tag">Simulated</span>` : ""}</div>
          <div class="passport__grade-line"><span class="passport__grade grade g-${esc(p.grade)}">${esc(p.grade)}</span><span class="muted">${esc(gradeWord[p.grade] || "")}</span></div>
          ${p.verified && pairingLine(p.verified) ? `<p class="passport__wiring">${pairingLine(p.verified)}</p>` : ""}
          <h2 class="passport__section">${sim ? "Simulated readings" : "Measurements"}</h2>
          <dl class="facts">
            <div><dt>Short-circuit current</dt><dd>${num(p.isc_ma, 1)} mA</dd></div>
            <div><dt>Open-circuit voltage</dt><dd>${num(p.voc_v, 2)} V</dd></div>
            <div><dt>Relative current score</dt><dd>${num(p.score_pct, 0)}% <span class="small muted">of the strongest panel in its batch (${num(p.reference && p.reference.strongest_isc_ma, 0)} mA)</span></dd></div>
            ${p.reference && Number.isFinite(Number(p.reference.box_factor)) && Math.abs(Number(p.reference.box_factor) - 1) > 0.005 ? `<div><dt>Before the lamp-box correction</dt><dd class="small">${num(p.isc_raw_ma, 1)} mA × ${num(p.reference.box_factor, 2)}</dd></div>` : ""}
            <div><dt>Light during the test</dt><dd class="small">${esc(p.reference && p.reference.light || "not recorded")}</dd></div>
            <div><dt>Measured</dt><dd class="small">${fmtDate(p.measured_at)}, bench position ${esc(p.panel_label)}, ${esc(p.run_id)}</dd></div>
          </dl>
          ${flags ? `<ul class="flags">${flags}</ul>` : ""}
          <p class="small muted" style="margin-top:14px">A relative score compares panels of the same model measured under the same light at the same instant, which removes light level from the comparison. Rated values from a label: ${p.rated && p.rated.isc_ma ? `${p.rated.isc_ma} mA, ${p.rated.voc_v} V` : "not recorded"}.</p>
        </div>
      </div>
      ${batchCard(p)}`;
  }

  // #/print: one card per passport, four to a sheet (two columns, two rows); each sheet is one printed page.
  // The QR encodes the passport page's own URL, built the way pagePassport sees it (location.href on that page).
  function pagePrint() {
    const ps = passports();
    const base = location.origin + location.pathname;
    const card = (p) => {
      const url = `${base}#/p/${encodeURIComponent(p.passport_id)}`;
      const qr = window.qrcode(0, "M"); qr.addData(url); qr.make();
      return `<article class="pcard">
        <div class="pcard__top">
          ${cellSvg({ label: p.passport_id, dim: p.grade === "C" })}
          <div class="pcard__id">${esc(p.passport_id)}</div>
          <span class="pcard__grade grade g-${esc(p.grade)}">${esc(p.grade)}</span>
        </div>
        <div class="pcard__body">
          <div class="pcard__qr" aria-label="QR code for passport ${esc(p.passport_id)}">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>
          <dl class="pcard__facts">
            <div><dt>Short-circuit current</dt><dd>${num(p.isc_ma, 1)} mA</dd></div>
            <div><dt>Open-circuit voltage</dt><dd>${num(p.voc_v, 2)} V</dd></div>
            <div><dt>Relative score</dt><dd>${num(p.score_pct, 0)}%</dd></div>
            <div><dt>Measured</dt><dd class="small">${fmtDay(p.measured_at)}</dd></div>
          </dl>
        </div>
        <p class="pcard__foot small muted">Second String passport, scan for the full record.<br><span class="pcard__url">${esc(url)}</span></p>
      </article>`;
    };
    const sheets = [];
    for (let i = 0; i < ps.length; i += 4) sheets.push(`<section class="sheet" aria-label="Sheet ${sheets.length + 1}">${ps.slice(i, i + 4).map(card).join("")}</section>`);
    return `
      <div class="row no-print" style="justify-content:space-between;margin-bottom:14px"><a href="#/passports">← All passports</a>${sheets.length ? `<button type="button" class="btn btn--primary" onclick="window.print()">Print</button>` : ""}</div>
      <h1 class="page-title no-print">Passport cards</h1>
      <p class="lede no-print">One card per tested panel, four to a sheet${sheets.length ? ` (${ps.length} card${ps.length === 1 ? "" : "s"}, ${sheets.length} sheet${sheets.length === 1 ? "" : "s"})` : ""}. Print, cut along the borders and put each card next to its panel; the QR code opens that panel's passport.</p>
      ${sheets.length ? sheets.join("") : `<div class="card">${emptyNote(`<p class="muted">No passports yet. <a href="#/passports">Add a run first.</a></p>`)}</div>`}`;
  }

  // ---------- Array Builder ----------
  // The user says how the power will be used and what voltage is printed on the device or controller; sizing.js turns
  // that into the allowed string lengths (installers' hot-day and cold-morning formulas), and the builder groups the
  // panels for the most watts within them. Inputs persist under ss.site.use.
  const SZ = window.SSSizing;
  const medianVoc = (panels) => { const v = panels.map((p) => p.voc_v).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 6.8; };
  function useState() { const v = LS.get("ss.site.use", null); return { ...SZ.DEFAULTS, ...(v && typeof v === "object" ? v : {}) }; }
  const toUnit = (c, unit) => (unit === "F" ? Math.round((c * 9) / 5 + 32) : Math.round(c * 10) / 10);
  const fromUnit = (v, unit) => (unit === "F" ? ((v - 32) * 5) / 9 : v);
  const deg = (c, unit) => `${toUnit(c, unit)} °${unit === "F" ? "F" : "C"}`;

  function useForm(st) {
    const sel = (key, opts, attrs = "") => `<select data-key="${key}" ${attrs}>${opts.map(([v, t]) => `<option value="${v}" ${String(st[key]) === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    const num_ = (key, ph, w = 110, step = "0.5") => `<input data-key="${key}" type="number" min="0" step="${step}" inputmode="decimal" placeholder="${esc(ph)}" value="${esc(st[key] ?? "")}" style="width:${w}px">`;
    const temp = (key) => `<input data-key="${key}" data-temp type="number" step="1" inputmode="numeric" value="${toUnit(st[key], st.unit)}" style="width:90px">`;
    const help = (t) => `<span class="field-help">${t}</span>`;
    return `
      <label class="field use-q">How will the power be used?${sel("use", SZ.USES.map((u) => [u.id, u.text]))}</label>
      <div class="use-part use-grid" data-for="direct">
        <label class="field">Voltage printed on the device <input data-key="label" type="text" inputmode="decimal" autocomplete="off" placeholder="12, or a range like 9–30" value="${esc(st.label)}" style="width:220px"><span class="field-help" id="u-label-read"></span></label>
        <label class="field" id="u-devmax">Highest voltage it accepts <span class="unit-row">${num_("devMax", "optional")} V</span>${help("If the label or manual gives one. Leave blank if not.")}</label>
      </div>
      <div class="use-part use-grid" data-for="battery">
        <label class="field">Battery voltage on its label <span class="unit-row">${num_("batt", "12", 100, "1")} V</span></label>
        <label class="field">Charge controller type ${sel("ctrl", [["mppt", "MPPT (maximum power point tracking)"], ["pwm", "PWM (pulse-width modulation)"], ["unsure", "Not sure"]])}${help("The label says MPPT if it is one; cheaper controllers are usually PWM.")}</label>
        <label class="field">Controller's maximum panel voltage <span class="unit-row">${num_("ctrlMax", "e.g. 100", 110, "1")} V</span>${help("On its label: the 100 in a “100/30” controller.")}</label>
        <label class="field">Battery's charging voltage <span class="unit-row">${num_("vabs", "auto", 110, "0.1")} V</span>${help("From the battery's manual. Blank uses 1.2 × the battery voltage (14.4 V for 12 V), typical for lead-acid and LiFePO4 (lithium iron phosphate).")}</label>
        <label class="field">Controller's maximum panel current <span class="unit-row">${num_("maxA", "optional", 110, "0.1")} A</span>${help("If its label lists one.")}</label>
      </div>
      <div class="use-part use-grid" data-for="converter">
        <label class="field">Lowest input voltage <span class="unit-row">${num_("low", "e.g. 150", 110, "1")} V</span>${help("Its start voltage, or the bottom of its MPPT (maximum power point tracking) range.")}</label>
        <label class="field">Highest input voltage <span class="unit-row">${num_("high", "e.g. 600", 110, "1")} V</span>${help("Its maximum DC (direct current) input voltage.")}</label>
        <label class="field">Maximum input current <span class="unit-row">${num_("maxA", "optional", 110, "0.1")} A</span>${help("If its label lists one.")}</label>
      </div>
      <fieldset class="use-part use-site" data-for="direct battery converter">
        <legend>Where the panels will sit</legend>
        <div class="use-grid">
          <label class="field">Hottest air temperature <span class="unit-row">${temp("tHot")} ${sel("unit", [["C", "°C"], ["F", "°F"]], `aria-label="Temperature unit"`)}</span></label>
          <label class="field">Coldest air temperature <span class="unit-row">${temp("tCold")} <span class="u-unit">°${st.unit === "F" ? "F" : "C"}</span></span></label>
          <label class="field">How they're mounted ${sel("mount", Object.entries(SZ.MOUNTS).map(([k, m]) => [k, m.text]))}</label>
        </div>
        <p class="field-help">Heat lowers a panel's voltage and cold raises it, so the string is sized for both. Use your area's hottest summer day and record low. The defaults, 35 °C and −12 °C, are from an installer's worked example.</p>
      </fieldset>`;
  }

  function pageBuild() {
    const ps = passports();
    const off = new Set(LS.get("ss.site.excluded", []));
    const st = useState();
    const items = ps.map((p) => `<label class="${off.has(p.passport_id) ? "" : "is-on"}"><input type="checkbox" data-pool="${esc(p.passport_id)}" ${off.has(p.passport_id) ? "" : "checked"}>${cellSvg({ label: p.passport_id, dim: p.grade === "C" })}<span class="pool__text"><b>${esc(p.passport_id)}</b>${isSim(p.run) ? ` <span class="tag">Simulated</span>` : ""}<span class="muted small">${num(p.isc_ma, 0)} mA, ${num(p.voc_v, 2)} V, grade ${esc(p.grade)}</span></span></label>`).join("");
    return `
      <h1 class="page-title">Array Builder</h1>
      <p class="lede">Say how the power will be used and the voltage printed on the device. The builder works out how many tested panels go in each series string, groups them so no strong panel is held back by a weaker partner, and shows the power that wiring gives. It updates as you type.</p>
      <div class="card no-print need-card">
        <div class="use-form use-inputs" id="use-form">${useForm(st)}</div>
        ${ps.length ? "" : emptyNote(`<div class="row" style="margin-top:12px"><span class="muted">No panels to group yet.</span><button type="button" class="btn btn--primary" id="btn-build-demo">Load the demo panels</button><span class="small muted">A simulated batch, not a real measurement.</span><span class="status" id="build-status"></span></div>`)}
      </div>
      <div id="build-result"></div>
      <details class="card no-print adjust">
        <summary>Adjust <span class="muted small">(optional: leave panels out, set the string length, add a panel by hand, temperature coefficients)</span></summary>
        ${ps.length ? `<h3 class="label" style="margin:10px 0 8px">Panels included</h3><div class="pool" id="pool">${items}</div>` : ""}
        <div class="row" style="margin-top:14px;align-items:flex-end">
          <label class="field">Panels per string <span class="unit-row"><input id="k" type="number" min="1" max="40" step="1" placeholder="auto" value="${st.kManual || ""}" style="width:80px"><button type="button" class="btn" id="btn-k-auto">Automatic</button></span></label>
          <label class="field">Add a panel by hand <span class="row"><input id="add-isc" type="number" placeholder="mA" style="width:90px"><input id="add-voc" type="number" step="0.01" placeholder="V" style="width:80px"><button type="button" class="btn" id="btn-add">Add</button></span></label>
        </div>
        <p class="small muted" style="margin-top:8px" id="k-note"></p>
        <div class="row use-inputs" style="margin-top:14px">
          <label class="field">Working-voltage change <span class="unit-row"><input data-key="bMp" type="number" step="0.01" max="0" value="${esc(st.bMp)}" style="width:90px"> % per °C</span></label>
          <label class="field">Open-circuit-voltage change <span class="unit-row"><input data-key="bOc" type="number" step="0.01" max="0" value="${esc(st.bOc)}" style="width:90px"> % per °C</span></label>
        </div>
        <p class="small muted" style="margin-top:6px">How much each panel's voltage changes per degree. The passports don't measure this; the defaults are typical for silicon panels. Use the panel's datasheet values if it has one.</p>
      </details>`;
  }

  const extraPanels = [];
  function wireBuild() {
    const pool = $("#pool");
    if (pool) pool.addEventListener("change", () => {
      const off = [...pool.querySelectorAll("[data-pool]:not(:checked)")].map((c) => c.dataset.pool);
      LS.set("ss.site.excluded", off);
      pool.querySelectorAll("label").forEach((l) => l.classList.toggle("is-on", l.querySelector("input").checked));
      runBuild();
    });
    wireUseForm();
    const setK = (v) => { const st = useState(); st.kManual = v; LS.set("ss.site.use", st); runBuild(); };
    $("#k").addEventListener("change", () => { const v = Math.round(Number($("#k").value)); setK(v >= 1 ? v : null); });
    $("#btn-k-auto").addEventListener("click", () => { $("#k").value = ""; setK(null); });
    $("#btn-add").addEventListener("click", () => {
      const isc = Number($("#add-isc").value), voc = Number($("#add-voc").value);
      if (!(isc > 0 && voc > 0)) return;
      extraPanels.push({ id: `hand-${extraPanels.length + 1}`, isc_ma: isc, voc_v: voc });
      $("#add-isc").value = ""; $("#add-voc").value = "";
      runBuild();
    });
    const demo = $("#btn-build-demo");
    if (demo) demo.addEventListener("click", () => loadSample($("#build-status")));
    runBuild();
  }

  // every [data-key] input writes one field of ss.site.use; the parts of the form that don't apply to the chosen use hide
  function wireUseForm() {
    const showParts = (st) => {
      document.querySelectorAll("#use-form [data-for]").forEach((el) => { el.hidden = !el.dataset.for.split(" ").includes(st.use); });
      const lab = SZ.parseLabel(st.label), read = $("#u-label-read");
      if (read) read.textContent = !String(st.label || "").trim() ? "" : !lab ? "Couldn't read that. Type one number like 12, or a range like 9–30." : lab.range ? `Read as: works from ${lab.low} V to ${lab.high} V.` : `Read as: rated ${lab.low} V.`;
      const dm = $("#u-devmax"); if (dm) dm.hidden = !!(lab && lab.range);
    };
    let timer = 0;
    const onEdit = (e) => {
      const el = e.target.closest("[data-key]");
      if (!el) return;
      const st = useState(), key = el.dataset.key, val = el.value;
      if (el.dataset.temp !== undefined) { if (val === "" || !isFinite(Number(val))) return; st[key] = fromUnit(Number(val), st.unit); }
      else if (key === "unit") {
        st.unit = val;
        document.querySelectorAll("#use-form [data-temp]").forEach((t) => { t.value = toUnit(st[t.dataset.key], st.unit); });
        document.querySelectorAll("#use-form .u-unit").forEach((u) => { u.textContent = `°${val}`; });
      } else {
        st[key] = val;
        if (key === "use") { st.kManual = null; const k = $("#k"); if (k) k.value = ""; }
        if (key === "maxA") document.querySelectorAll(`#use-form [data-key="maxA"]`).forEach((m) => { if (m !== el) m.value = val; });
      }
      LS.set("ss.site.use", st);
      showParts(st);
      clearTimeout(timer);
      if (e.type === "input" && el.tagName === "INPUT") timer = setTimeout(runBuild, 200); else runBuild();
    };
    document.querySelectorAll(".use-inputs").forEach((box) => { box.addEventListener("input", onEdit); box.addEventListener("change", onEdit); });
    showParts(useState());
  }

  // the explanation of the string length: each limit, the panel's voltages at the extremes, and what wasn't checked
  function sizingHtml(sz, st, k, why, extra) {
    const pv = sz.pv, u = st.unit;
    const rows = [];
    rows.push(`Each panel works at about <b>${pv.vmp25.toFixed(1)} V</b> at 25 °C: 0.82 × its ${pv.voc.toFixed(2)} V open-circuit voltage (the median of these panels).`);
    if (sz.use !== "maxw") {
      rows.push(`On the hottest day, ${deg(st.tHot, u)} air with the panels ${esc(pv.mount.text.toLowerCase())}, the cells reach about ${deg(pv.tCellHot, u)}: working voltage ${pv.vmpHotRaw.toFixed(2)} V, <b>${pv.vmpHot.toFixed(2)} V</b> after the 0.88 safety margin.`);
      rows.push(`On the coldest morning, ${deg(st.tCold, u)}, each panel's open-circuit voltage rises to <b>${pv.vocCold.toFixed(2)} V</b>.`);
      rows[1] += ` Voltage change per degree: ${st.bMp}% working, ${st.bOc}% open-circuit, typical for silicon; the passports don't measure it (change it under Adjust).`;
      sz.needs.forEach((nd) => rows.push(esc(nd.text) + "."));
    }
    rows.push(`<b>${k} per string</b>: ${why} Each string works at about ${(k * pv.vmp25).toFixed(1)} V${sz.use === "maxw" ? `, and reaches ${(k * pv.vocCold).toFixed(1)} V open-circuit on a ${deg(st.tCold, u)} morning. Pick a device or controller whose input range covers both` : ` and reaches up to ${(k * pv.vocCold).toFixed(1)} V open-circuit on the coldest morning`}.`);
    return `${extra.map(([cls, t]) => `<p class="verdict ${cls}">${t}</p>`).join("")}<details class="sizing" open><summary>Why ${k} panel${k === 1 ? "" : "s"} per string</summary><ol>${rows.map((r) => `<li>${r}</li>`).join("")}</ol></details>`;
  }


  // a string is a row of cells joined by wire; weak panels (grade C) are dimmed
  function chipCell(p, byId) {
    const weak = !!(byId[p.id] && byId[p.id].grade === "C");
    return `<span class="chipcell${weak ? " is-weak" : ""}">${cellSvg({ label: p.id, dim: weak })}<span class="chipcell__id">${esc(p.id)}</span></span>`;
  }
  function groupsHtml(groups, byId) {
    return `<div class="groups">${groups.map((g, i) => `<div class="group"><span class="label">String ${i + 1}</span><span class="group__string">${g.map((p) => chipCell(p, byId)).join('<span class="wire" aria-hidden="true"></span>')}</span><span class="label">limited to ${Math.min(...g.map((p) => p.isc_ma)).toFixed(0)} mA</span></div>`).join("")}</div>`;
  }

  function runBuild() {
    const out = $("#build-result");
    const ps = passports();
    const byId = Object.fromEntries(ps.map((p) => [p.passport_id, p]));
    const off = new Set(LS.get("ss.site.excluded", []));
    const chosen = ps.filter((p) => !off.has(p.passport_id) && Number(p.isc_ma) > 0 && Number(p.voc_v) > 0).map((p) => ({ id: p.passport_id, isc_ma: Number(p.isc_ma), voc_v: Number(p.voc_v) }));
    const pool = [...chosen, ...extraPanels];
    const st = useState();
    const note = $("#k-note");
    if (!pool.length) { out.innerHTML = ""; note.textContent = ""; return; }
    const fail = (msg, more = "") => { out.innerHTML = `<div class="card"><h2>Recommended wiring</h2><p class="status is-bad">${msg}</p>${more}</div>`; note.textContent = ""; };
    const sz = SZ.size(st, medianVoc(pool));
    if (sz.error) { fail(esc(sz.error)); return; }
    // every string needs exactly k panels: leave out the weakest extras and say so
    const plan = (kk) => {
      const keep = Math.floor(pool.length / kk) * kk;
      const leftIds = new Set([...pool].sort((a, b) => b.isc_ma - a.isc_ma).slice(keep).map((p) => p.id));
      const panels = pool.filter((p) => !leftIds.has(p.id));
      return { k: kk, leftIds, panels, res: panels.length ? window.SSBuilder.analyze(panels, kk) : { error: "no panels" } };
    };
    const extra = [];
    let best, why;
    if (st.kManual) {
      if (st.kManual > pool.length) { fail(`${pool.length} panel${pool.length === 1 ? "" : "s"} can't make a ${st.kManual}-panel string. Lower the panels per string under Adjust, or press Automatic.`); return; }
      best = plan(st.kManual);
      why = "set by hand under Adjust.";
      if (sz.use !== "maxw" && (st.kManual < sz.kMin || st.kManual > sz.kMax)) extra.push(["is-bad", st.kManual < sz.kMin ? `Too few for this use: it needs at least ${sz.kMin} in series.` : `Too many for this use: more than ${sz.kMax} in series goes over its voltage limit on a cold morning.`]);
    } else {
      const pv = sz.pv;
      if (sz.kMin > sz.kMax) {
        fail(`No string length fits this device. Reaching its minimum on a hot day takes at least ${sz.kMin} panels in series, but more than ${sz.kMax} goes over its maximum on a cold morning (${(sz.kMin * pv.vocCold).toFixed(1)} V for ${sz.kMin}). A controller or converter with a wider input range would work, or check the temperatures you entered.`, sizingHtml(sz, st, sz.kMin, "the fewest that reach the minimum, but too many for the maximum.", []));
        return;
      }
      if (sz.kMin > pool.length) {
        fail(`This needs at least ${sz.kMin} panels in series and there ${pool.length === 1 ? "is" : "are"} ${pool.length}. Add panels, or choose a lower-voltage device.`, sizingHtml(sz, st, sz.kMin, "the fewest that meet the limits above.", []));
        return;
      }
      const lo = sz.kMin, hi = Math.min(sz.kMax, pool.length, 40);
      if (sz.pick === "fewest") {
        best = plan(lo);
        why = sz.use === "direct" ? "the fewest that reach its rated voltage. More in series would push it past its rating." : sz.warn.includes("unsure") ? "the fewest that meet an MPPT controller's limits, which also suits a PWM one." : "the fewest that reach the charging voltage. A PWM controller wastes any extra voltage, so more strings side by side give more current.";
      } else {
        // the most total watts among the lengths that fit; within 1% of the most, take the longest strings (less current, thinner wire)
        const plans = [];
        for (let kk = lo; kk <= hi; kk++) { const pl = plan(kk); if (!pl.res.error) plans.push(pl); }
        const top = Math.max(...plans.map((pl) => pl.res.greedy.pmax));
        best = plans.filter((pl) => pl.res.greedy.pmax >= 0.99 * top).pop();
        const range = lo === hi ? `the only length that fits` : `of the lengths that fit (${lo} to ${hi}), the one with the most total watts`;
        why = `${range}${best.res.greedy.pmax < top - 1e-9 ? `, within 1% of the most (${top.toFixed(2)} W) at a higher voltage, which means less current and thinner wire` : ""}.`;
      }
    }
    const { k, leftIds, panels, res } = best;
    if (res.error) { fail(esc(res.error)); return; }
    note.textContent = st.kManual ? `Set by hand: ${k} per string. Press Automatic to go back to the worked-out length.` : `Worked out automatically: ${k} per string. Type a number to override it.`;
    // what was not checked, and the current limit
    const pv = sz.pv, vOpen = (k * pv.vocCold).toFixed(1);
    if (sz.warn.includes("cold")) {
      const lab = SZ.parseLabel(st.label);
      extra.push(["", sz.use === "direct" && lab && k * pv.vocCold > lab.low ? `Not checked: with the device off, each string can reach ${vOpen} V on the coldest morning, above the ${lab.low} V on its label. Many devices take this; enter the highest voltage it accepts to have it checked.` : `Not checked: each string can reach ${vOpen} V on the coldest morning. Enter the highest input voltage to have it checked.`]);
    }
    if (sz.warn.includes("ctrlMax")) extra.push(["", `Not checked: each string can reach ${vOpen} V on the coldest morning. Enter the controller's maximum panel voltage to check it against that.`]);
    if (sz.maxA) {
      const amps = SZ.designCurrentA(res.greedy.groups);
      extra.push(amps <= sz.maxA ? ["is-good", `Current: ${amps.toFixed(2)} A design current (125% of the short-circuit current), within the ${sz.maxA} A limit.`] : ["is-bad", `Current: ${amps.toFixed(2)} A design current (125% of the short-circuit current), over the ${sz.maxA} A limit. Split the strings across two controllers, or leave some out under Adjust.`]);
    }
    const useText = (SZ.USES.find((x) => x.id === sz.use) || SZ.USES[0]).text;
    const autoLine = `<p class="build-auto">Grouped automatically: <b>${panels.length} panels</b> into <b>${panels.length / k} string${panels.length / k === 1 ? "" : "s"} of ${k}</b>, to ${esc(useText.charAt(0).toLowerCase() + useText.slice(1))}.${leftIds.size ? ` Left out, as the weakest extra${leftIds.size === 1 ? "" : "s"} that can't fill a string: ${[...leftIds].map(esc).join(", ")}.` : ""}</p>`;
    // power actually delivered when the voltage is held fixed (a PWM controller, a fixed-voltage device), from the same model
    let delivered = "";
    if (sz.deliverV && !st.kManual) {
      const M = window.SSModel;
      const w = sz.deliverV * res.greedy.groups.reduce((sum, g) => sum + M.stringI(g.map((p) => p.model), sz.deliverV), 0);
      delivered = `<div class="stat"><b>${w.toFixed(2)} W</b><span>${esc(sz.deliverWhat)}, at 25 °C</span></div>`;
    }
    const sizing = sizingHtml(sz, st, k, why, extra);
    const naiveGain = (res.greedy.pmax / res.naive.pmax - 1) * 100;
    const avg = res.brute ? res.brute.average : res.sampledAverage;
    const avgGain = (res.greedy.pmax / avg - 1) * 100;
    let verdict = "";
    const oneString = res.brute && res.brute.count === 1;
    if (oneString) {
      verdict = `<div class="verdict">${res.n} panels make one string, so there is only one way to wire them.</div>`;
    } else if (res.brute) {
      verdict = res.brute.greedyIsBest
        ? `<div class="verdict is-good">Checked against all ${res.brute.count} possible groupings: the matched grouping is the best one. Worst grouping: ${res.brute.worst.pmax.toFixed(2)} W.</div>`
        : `<div class="verdict is-bad">Checked against all ${res.brute.count} groupings: a better grouping exists, ${res.brute.best.pmax.toFixed(2)} W. The matched grouping is a heuristic; the bench verifies by measuring.</div>`;
    } else {
      verdict = `<div class="verdict">${res.totalGroupings.toLocaleString()} possible groupings, too many to enumerate here; the average comes from ${res.sampledCount} random groupings.</div>`;
    }
    // bench comparison: the pool is exactly one run's four passports
    let bench = "";
    const run = runs.find((r) => r.search && r.passports && r.passports.length === 4 && panels.length === 4 && r.passports.every((p) => panels.some((q) => q.id === p.passport_id)));
    if (run && k === 2) {
      const pos = Object.fromEntries(run.passports.map((p) => [p.passport_id, Number(String(p.panel_label || "").replace("P", ""))]));
      const keyOf = (groups) => groups.map((g) => g.map((p) => pos[p.id]).sort().join("+")).sort().join(", ");
      const letter = Object.keys(PAIR_PANELS).find((L) => PAIR_PANELS[L] === keyOf(res.greedy.groups));
      const agree = letter === run.search.best;
      bench = `<div class="verdict ${agree ? "is-good" : "is-bad"}">${isSim(run) ? `Check against the simulated run ${esc(run.run_id)}: our model swept all three wirings of these four panels.` : `Bench check: these four panels were measured on the bench in run ${esc(run.run_id)}.`} The builder's grouping is wiring <b class="pair-${esc(letter)}">${esc(letter)}</b>; the ${isSim(run) ? "model" : "bench"} measured wiring <b class="pair-${esc(run.search.best)}">${esc(run.search.best)}</b> as best (${Object.entries(run.search.pmax_w || {}).map(([L, w]) => `${L} ${num(w, 2)} W`).join(", ")}). ${agree ? "They agree." : isSim(run) ? "They disagree." : "They disagree: trust the measurement."}</div>`;
    }
    out.innerHTML = `<div class="card">
      <h2>Recommended wiring</h2>
      ${autoLine}
      <div class="band"><div class="band__num">${res.greedy.pmax.toFixed(2)} W</div><p class="band__text">matched grouping, estimated maximum power</p></div>
      ${delivered || !oneString ? `<div class="stats">
        ${delivered}
        ${oneString ? "" : Math.abs(naiveGain) < 0.05 ? `<div class="stat"><b>Same</b><span>as wiring them in the order they came (${res.naive.pmax.toFixed(2)} W): they already match</span></div>` : `<div class="stat"><b>${naiveGain > 0 ? "+" : ""}${naiveGain.toFixed(1)}%</b><span>against wiring them in the order they came (${res.naive.pmax.toFixed(2)} W)</span></div>`}
        ${oneString ? "" : `<div class="stat"><b>${avgGain > 0 ? "+" : ""}${avgGain.toFixed(1)}%</b><span>against the average grouping (${avg.toFixed(2)} W), what wiring without measuring gets</span></div>`}
      </div>` : ""}
      ${sizing}
      <h3 class="label" style="margin:18px 0 8px">Matched grouping</h3>
      <p class="small muted" style="margin-bottom:8px">How: ${esc(res.greedy.how)}.${res.greedy.lowVoc.length ? ` Low voltage, possibly a failed cell group: ${res.greedy.lowVoc.map(esc).join(", ")}.` : ""}</p>
      ${groupsHtml(res.greedy.groups, byId)}
      <h3 class="label" style="margin:16px 0 8px">As they came</h3>
      ${groupsHtml(res.naive.groups, byId)}
      ${verdict}${bench}
      <p class="small muted" style="margin-top:12px">Estimates use the same single-diode panel model as the bench, fitted to each passport's short-circuit current and open-circuit voltage, with a bypass diode per panel. Each string carries the current of its weakest panel; strings share one voltage. The builder tries four starting groupings, improves each by swapping panels between strings while the model says it gains power, and keeps the best.</p>
    </div>`;
  }

  // The Impact page's demo batch: the four panels in the Chalk advisor's sample (tools/chalk_integration/
  // panel_passports.py on feat/bea-chalk-integration), editable in this browser.
  const CHALK_DEMO = [{ id: "A", isc_ma: 350, voc_v: 6.2 }, { id: "B", isc_ma: 320, voc_v: 6.1 }, { id: "C", isc_ma: 180, voc_v: 6.0 }, { id: "D", isc_ma: 160, voc_v: 5.9 }];
  function impactPanels() {
    const saved = LS.get("ss.site.impact", null);
    const ok = Array.isArray(saved) && saved.length === 4 && saved.every((q) => q && Number(q.isc_ma) > 0 && Number(q.voc_v) > 0);
    return (ok ? saved : CHALK_DEMO).map((q, i) => ({ id: CHALK_DEMO[i].id, isc_ma: Number(q.isc_ma), voc_v: Number(q.voc_v) }));
  }
  // one system = all four in a single series string, the way a mixed batch is usually wired without testing;
  // the controller's wiring = the Array Builder's grouping into two series pairs in parallel (what the bench switches between)
  function renderImpact() {
    const out = $("#impact-result");
    if (!out) return;
    const M = window.SSModel;
    const ps = impactPanels();
    const asIs = M.arrayPmax([ps.map((q) => M.panel(q.isc_ma, q.voc_v))]).p;
    const res = window.SSBuilder.analyze(ps, 2);
    const linked = res.greedy.pmax;
    const gain = asIs > 0 ? (linked / asIs - 1) * 100 : 0;
    const max = Math.max(asIs, linked, 1e-9);
    const pairs = res.greedy.groups.map((g) => g.map((q) => q.id).join(" + ")).join(" and ");
    out.innerHTML = `
      <div class="band impact-hero"><div class="band__num" data-count>${gain >= 0 ? "+" : ""}${gain.toFixed(0)}%</div><p class="band__text">more power from the same panels when the controller links them (simulated)</p></div>
      <div class="impact-bars">
        <div class="impact-bar"><span class="impact-bar__label">Wired as they are, one string of all four</span><span class="impact-bar__track"><span class="impact-bar__fill is-base" style="width:${(asIs / max) * 100}%"></span></span><b>${asIs.toFixed(2)} W</b></div>
        <div class="impact-bar"><span class="impact-bar__label">Linked by the controller: ${esc(pairs)}, the pairs in parallel</span><span class="impact-bar__track"><span class="impact-bar__fill" style="width:${(linked / max) * 100}%"></span></span><b>${linked.toFixed(2)} W</b></div>
      </div>
      <p class="small muted">Maximum power of each wiring from our single-diode panel model, with a bypass diode per panel. Wiring all four in parallel would give about the same power as the controller's wiring, but only one panel's voltage (about 5 V), too low for a 12 V load; that is why the panels go in series pairs.${res.brute && res.brute.worst ? ` The worst way to make two pairs gives ${res.brute.worst.pmax.toFixed(2)} W.` : ""}</p>`;
  }
  function wireImpact() {
    renderImpact();
    document.querySelectorAll(".imp-in").forEach((inp) => inp.addEventListener("input", () => {
      const ps = impactPanels();
      document.querySelectorAll(".imp-in").forEach((el) => { const v = Number(el.value); if (v > 0) ps[Number(el.dataset.i)][el.dataset.f] = v; });
      LS.set("ss.site.impact", ps);
      renderImpact();
    }));
    const reset = $("#btn-imp-reset");
    if (reset) reset.addEventListener("click", () => { LS.del("ss.site.impact"); render("data"); });
  }

  function pageImpact() {
    const withProof = runs.filter((r) => r.proof && r.proof.kind === "sweep");
    const real = withProof.filter((r) => !["mock", "sample"].includes(r.link));
    const shown = real.length ? real : withProof;
    const gains = shown.map((r) => Number(r.proof.gain_pct));
    const mean = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : null;
    const n = shown.length;
    const rowsIn = impactPanels().map((q, i) => `<tr><td><b>${esc(q.id)}</b></td><td class="num"><input class="imp-in" type="number" min="1" step="1" data-i="${i}" data-f="isc_ma" value="${q.isc_ma}" aria-label="Panel ${esc(q.id)} short-circuit current in mA"> mA</td><td class="num"><input class="imp-in" type="number" min="0.1" step="0.1" data-i="${i}" data-f="voc_v" value="${q.voc_v}" aria-label="Panel ${esc(q.id)} open-circuit voltage in volts"> V</td></tr>`).join("");
    return `
      <h1 class="page-title">Impact</h1>
      <p class="lede">Numbers here are either measured on our bench, simulated by our panel model and labelled so, or taken from a named source.</p>
      <div class="card impact-main">
        <h2>The same four panels, wired two ways <span class="tag">Simulated</span></h2>
        <p class="muted">A mixed batch from our Chalk advisor's demo data: two strong panels and two weakened ones. Wired as they are, as one system, the weakest panels set the current for everything. Linked by the Second String controller, panels with similar current share a string.</p>
        <div id="impact-result"></div>
        <details class="impact-edit no-print">
          <summary>Edit the demo panels</summary>
          <table class="table impact-table"><thead><tr><th>Panel</th><th class="num">Short-circuit current</th><th class="num">Open-circuit voltage</th></tr></thead><tbody>${rowsIn}</tbody></table>
          <div class="row" style="margin-top:8px"><button type="button" class="btn btn--quiet" id="btn-imp-reset">Back to the Chalk demo values</button></div>
        </details>
      </div>
      <div class="card">
        <h2>What our bench measured</h2>
        <p>${mean == null ? "No bench run is published yet; the first one fills this in." : real.length ? `Across ${n} bench run${n === 1 ? "" : "s"}, matching panels by current gave <b>${mean.toFixed(1)}% more power</b> than the worst wiring of the same panels, measured at each wiring's maximum power point.` : "No bench run is published yet; the first one fills this in. Until then, the comparison above is simulated."}</p>
        <p class="small muted" style="margin-top:8px">With two of four panels behind 35% film this is deliberately a bad batch. Our model puts the gain for realistic aging (panels at 80%) at about 5–7%, and the gain against the average wiring at about 22% for the film case.</p>
      </div>
      <div class="card">
        <h2>Why reuse matters</h2>
        <ul class="small" style="padding-left:1.2em;display:grid;gap:6px">
          <li>Panels lose about 0.5–0.75% of output a year (NREL fleet study, median 0.75%/yr; literature median 0.5%/yr). After 25 years most still make 80–88% of their rating.</li>
          <li>Panels retired early, for upgrades or damage, often still produce 70–95% of their rating (NREL).</li>
          <li>NREL's baseline for US modules 2020–2050: about 83% landfilled, 9.5% recycled, 1.2% reused.</li>
          <li>Testing a used panel in a lab (flash test plus electroluminescence) costs about €16–31 per module, against about €50 for a new module (IEA PVPS Task 13, 2026; German test labs' price lists).</li>
        </ul>
      </div>
      <div class="card">
        <h2>What we don't claim yet</h2>
        <p class="small muted">How many panels a bench keeps out of landfill, and any carbon figure, depend on a scenario: panels graded per hour, the share that pass, what they displace. We will publish those numbers only with the scenario and a source next to them.</p>
      </div>`;
  }

  // ---------- router ----------
  // the front page's data and helpers; front.js draws it. While the first pull is running it shows a loading
  // note, so say so (loadingShown) and settle() redraws it when the pull ends, as emptyNote does for the other pages.
  const frontCtx = () => { if (loading) loadingShown = true; return { runs, passports: passports(), loading, esc, num, cellSvg, fmtDay }; };
  // reason: "route" when the hash changed (slide in, start at the top), "data" when runs arrived (redraw in place)
  let motionCtl = null, lastPage = null;
  function render(reason = "route") {
    // routes.js is a separate file: if it is missing or stale (a mixed cache after a deploy), show the front page rather than nothing
    const R = window.SSRoutes;
    const r = R ? R.parse(location.hash) : { page: "front", id: null, nav: null };
    const view = $("#view");
    const M = window.SSMotion;
    let inPlace = false;
    const draw = () => {
    loadingShown = false;
    try {
      if (r.page === "passport") view.innerHTML = pagePassport(r.id);
      else if (r.page === "build") { view.innerHTML = pageBuild(); wireBuild(); }
      else if (r.page === "impact") { view.innerHTML = pageImpact(); wireImpact(); }
      else if (r.page === "print") view.innerHTML = pagePrint();
      else if (r.page === "passports") { view.innerHTML = pageIndex(); wireIndex(); }
      else if (reason === "data" && view.querySelector("[data-hero]")) { window.SSFront.refresh(view, frontCtx()); inPlace = true; }
      else { view.innerHTML = window.SSFront.page(frontCtx()); window.SSFront.wire(view, { loadSample }); }
    } catch (err) {
      // never leave a blank page on a judge's phone: say what happened and offer the one fix that always works
      console.error(err);
      view.innerHTML = `<div class="card"><h2>This page could not be drawn</h2><p class="status is-bad">${esc(err && err.message || err)}</p>
        <p class="small muted" style="margin-top:8px">Usually an imported run is malformed. Removing the runs imported into this browser fixes it; nothing on the bench or the server changes.</p>
        <div class="row" style="margin-top:10px"><button type="button" class="btn" id="btn-reset">Remove imported runs and reload</button></div></div>`;
      $("#btn-reset").addEventListener("click", () => { LS.del("ss.site.runs"); LS.del("ss.site.pool"); LS.del("ss.site.excluded"); location.reload(); });
    }
    document.querySelectorAll("[data-route]").forEach((a) => a.classList.toggle("is-on", a.dataset.route === r.nav));
    document.body.dataset.page = r.page;
    if (reason === "route") window.scrollTo(0, 0);
    if (!M) return;
    if (inPlace && motionCtl) motionCtl.refresh();
    else { if (motionCtl) motionCtl.destroy(); motionCtl = M.mount(view, r.page); }
    };
    // the first paint and in-place refreshes draw at once; later route changes slide along the nav
    if (M && reason === "route" && lastPage !== null) M.transition(draw, R ? R.direction(lastPage, r.page) : "fwd");
    else draw();
    lastPage = r.page;
  }
  // When tools/serve.py is serving this site, runs uploaded by the dashboard appear on their own.
  // On a static host (GitHub Pages) there is no API: the site loads the runs committed to data/runs/,
  // listed in data/runs/index.json (regenerate it with python3 tools/sim/make_runs_index.py).
  let apiTimer = null;
  const fetchJson = (url) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: ${r.status}`))));
  function mergeRuns(list) {
    const before = JSON.stringify(runs.map((r) => r.run_id).sort());
    list.forEach((run) => { try { addRun(run); } catch (_) { /* skip malformed */ } });
    return JSON.stringify(runs.map((r) => r.run_id).sort()) !== before;
  }
  // the first pull is over, whatever it found: drop the "Loading…" notes and show what there is
  function settle(changed) {
    const wasLoading = loading && loadingShown;
    loading = false;
    if (changed || wasLoading) render("data");
  }
  function pullFromServer(first) {
    fetchJson("../api/runs")
      .then((list) => {
        const changed = Array.isArray(list) && mergeRuns(list);
        if (first) { settle(changed); apiTimer = setInterval(() => pullFromServer(false), 5000); }
        else if (changed) render("data");
      })
      .catch(() => { if (first) pullFromIndex(); });
  }
  function pullFromIndex() {
    fetchJson("data/runs/index.json")
      .then((index) => {
        const listed = Array.isArray(index) ? index : (index && Array.isArray(index.runs) ? index.runs : []);
        // plain file names only: no paths, nothing but the run files the index script lists
        const files = listed.filter((f) => typeof f === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(f) && f !== "index.json");
        return Promise.all(files.map((f) => fetchJson(`data/runs/${encodeURIComponent(String(f))}`).catch(() => null)));
      })
      .then((list) => settle(mergeRuns(list.filter(Boolean))))
      .catch(() => settle(false)); // neither the API nor an index: import by hand
  }

  try { if (window.SSMotion) window.SSMotion.init(); } catch (err) { console.warn("motion off:", err && err.message); }
  window.addEventListener("hashchange", () => render("route"));
  render("route");
  pullFromServer(true);
  window.secondStringSite = { addRun, passports, runs: () => runs, loadSample };
})();
