// Second Use (#/reuse, #/reuse/<ID>): what can a panel too weak for a rooftop string still run?
// 1. pick a panel and how sunny the site is; 2. at once, what it can run (the panel model, as the bench uses it);
// 3. ask the agent on Chalk in your own words (tools/eval/second_use/serve.py on the demo laptop, port 8767);
// 4. how the agent is tested (the Second Use eval). Devices, the efficiency and the scores come from
// data/second-use.json, written by tools/eval/second_use/publish.py from the same source the eval uses.
// ctx: { passports, loading, esc, num }
window.SSReuse = (function () {
  const AGENT_URL = "http://127.0.0.1:8767/second-use";
  const SUN = [[2.5, "Cloudy winter"], [3.5, "Mild"], [4.5, "Typical"], [5.5, "Sunny summer"]];
  let data = null, dataP = null, sun = 4.5;
  const load = () => dataP || (dataP = fetch("data/second-use.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))).then((d) => (data = d)));

  const usable = (p) => Number(p.isc_ma) > 0 && Number(p.voc_v) > 0;
  // no ID in the address: start with the weakest grade, the panels this page is for
  function pick(ps, id) {
    const ok = ps.filter(usable);
    return ok.find((p) => p.passport_id === id) || ok.find((p) => p.grade === "C") || ok.find((p) => p.grade === "B") || ok[0] || null;
  }
  // the same physics as su.check_use: maximum power from the panel model, a day's usable energy, each device's need
  function energy(p) {
    const M = window.SSModel;
    const pmax = M.arrayPmax([[M.panel(Number(p.isc_ma), Number(p.voc_v))]]).p;
    return { pmax, wh: pmax * sun * data.system_efficiency };
  }
  const wh = (x) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2));
  const hrs = (h) => (h === 24 ? "all day" : `${h} h a day`);
  // "Bluetooth beacon" and "LED path light" keep their capitals mid-sentence; "Small 5 V fan" becomes "small 5 V fan"
  const lc = (n) => (/^[A-Z][a-z]/.test(n) && !/^(Bluetooth|Raspberry|Wi-Fi|LoRa)/.test(n) ? n[0].toLowerCase() + n.slice(1) : n);

  function panelHtml(ctx, p) {
    if (!data) return `<p class="muted">Loading…</p>`;
    const e = energy(p);
    return `<dl class="facts reuse__facts">
        <div><dt>Most power it gives</dt><dd>${e.pmax.toFixed(2)} W</dd></div>
        <div><dt>Usable energy a day here</dt><dd>${wh(e.wh)} Wh</dd></div>
        <div><dt>${p.run && ["sample", "mock"].includes(p.run.link) ? "Simulated readings" : "Measured"}</dt><dd class="small">${ctx.num(p.isc_ma, 1)} mA, ${ctx.num(p.voc_v, 2)} V, grade ${ctx.esc(p.grade)} · <a href="#/p/${encodeURIComponent(p.passport_id)}">passport</a></dd></div>
      </dl>
      <p class="small muted">Maximum power from the panel's measured current and voltage, through the same panel model as the bench. A day's usable energy is that × ${sun} hours of full sun × ${Math.round(data.system_efficiency * 100)}% (a small charge controller and battery). The bench tests small 6 V panels; a full-size used panel gives hundreds of times more.</p>`;
  }
  function runsHtml(ctx, p) {
    if (!data) return `<p class="muted">Loading…</p>`;
    const e = energy(p);
    const rows = data.devices.map((d) => ({ ...d, need: d.watts * d.hours })).map((d) => ({ ...d, ok: e.wh >= d.need, r: e.wh / d.need }))
      .sort((a, b) => b.ok - a.ok || a.need - b.need);
    const yes = rows.filter((d) => d.ok);
    return `<p class="reuse__answer">${yes.length ? `It can run <b>${yes.map((d) => ctx.esc(lc(d.name))).join("</b>, <b>")}</b>.` : "Nothing on this list, at this much sun."}</p>
      <ul class="reuse__runs">${rows.map((d) => `<li class="${d.ok ? "is-yes" : "is-no"}"><span class="reuse__mark" aria-hidden="true">${d.ok ? "✓" : "✕"}</span>
        <span class="reuse__dev">${ctx.esc(d.name)} <span class="muted small">${d.watts} W, ${hrs(d.hours)}</span></span>
        <span class="reuse__why small">${d.ok ? `needs ${wh(d.need)} Wh of ${wh(e.wh)}` : `needs ${wh(d.need)} Wh: ${d.r < 0.01 ? "far" : `${(1 / d.r).toFixed(d.r > 0.5 ? 1 : 0)}×`} more than it has`}</span></li>`).join("")}</ul>`;
  }
  function scoreHtml(ctx) {
    if (!data) return `<p class="muted">Loading…</p>`;
    // whole numbers as they are, others to one decimal: 99.5% must never show as 100%
    const ev = data.eval, pct = (x) => (x == null ? "—" : `${Number.isInteger(Number(x)) ? x : ctx.num(x, 1)}%`);
    const agentRows = ev.rows.filter((r) => r.advisor.startsWith("chalk-gateway:"));
    return `<p>${ev.cases} requests, each a panel, a site and a request in plain words: ${ev.real_cases} on the demo batch's passports, the rest drawn like it; all simulated until a real bench run is added. The right answer comes from the panel model; ${ev.feasible} of them can be run.</p>
      <div class="reuse__scroll"><table class="table"><thead><tr><th>Advisor</th><th class="num">Verdict right</th><th class="num">Says yes when it can't</th><th class="num">Ideas that work</th></tr></thead>
      <tbody>${ev.rows.map((r) => `<tr class="${r.advisor.includes(":tools") ? "is-fit" : ""}"><td>${ctx.esc(r.label)}${r.cases < ev.cases ? ` <span class="muted small">(${r.cases} requests)</span>` : ""}</td><td class="num">${pct(r.verdict_pct)}</td><td class="num">${pct(r.false_yes_pct)}</td><td class="num">${pct(r.alternatives_valid_pct)}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">"Says yes when it can't" is the costly mistake: a buyer gets a panel that won't run their device. ${agentRows.length ? "" : "The agent's own scores appear here once it has been run on Chalk."}</p>`;
  }

  function page(ctx, id) {
    const ps = ctx.passports;
    const cur = pick(ps, id);
    const head = `<h1 class="page-title">Second Use</h1>
      <p class="lede">A panel too weak for a rooftop string can still run something small. Pick one: its measured numbers say what it can power.</p>`;
    if (!cur) return head + (ctx.loading ? `<p class="muted">Loading passports…</p>` : `<div class="card"><p>No passports are loaded yet. <a href="#/passports">Open the passports</a> and load the demo batch or a bench run, then come back.</p></div>`);
    return `${head}
      <div class="reuse__steps">
        <section class="card">
          <h2>1. The panel and the site</h2>
          <div class="reuse__pick">
            <label class="field use-q">Panel <select id="reuse-panel">${ps.filter(usable).map((p) => `<option value="${ctx.esc(p.passport_id)}" ${p.passport_id === cur.passport_id ? "selected" : ""}>${ctx.esc(p.passport_id)}, grade ${ctx.esc(p.grade)}</option>`).join("")}</select></label>
            <fieldset class="reuse__sun"><legend>How sunny is the site?</legend>${SUN.map(([h, t]) => `<label><input type="radio" name="reuse-sun" value="${h}" ${h === sun ? "checked" : ""}><span class="reuse__chip">${t} <span class="reuse__h">${h} h</span></span></label>`).join("")}</fieldset>
          </div>
          <div id="reuse-facts">${panelHtml(ctx, cur)}</div>
        </section>
        <section class="card">
          <h2>2. What it can run</h2>
          <div id="reuse-runs">${runsHtml(ctx, cur)}</div>
        </section>
        <section class="card">
          <h2>3. Ask the agent</h2>
          <p class="muted">Say what you want to power, in your own words. An agent on Chalk reads it, looks up this panel's passport and checks it with the same physics. It doesn't guess.</p>
          <form id="reuse-ask" class="reuse__ask">
            <input id="reuse-q" class="reuse__q" maxlength="300" required placeholder="e.g. a light on my garden path for four hours each evening" aria-label="What do you want to power?">
            <button type="submit" class="btn btn--primary" id="reuse-go">Ask</button>
          </form>
          <p id="reuse-status" class="status" role="status" aria-live="polite"></p>
          <div id="reuse-answer" hidden></div>
        </section>
        <section class="card">
          <h2>How we test the agent</h2>
          <div id="reuse-score">${scoreHtml(ctx)}</div>
        </section>
      </div>`;
  }

  function answerHtml(ctx, a) {
    const dev = data && data.devices.find((d) => d.id === a.device_id);
    const who = a.recorded ? ctx.esc(a.passport_id) : "this panel";
    const verdict = a.feasible === true ? `Yes: ${who} can run ${ctx.esc(dev ? lc(dev.name) : a.device_id)}${a.hours_per_day ? `, ${ctx.esc(a.hours_per_day)} h a day` : ""}.`
      : a.feasible === false ? `No: ${who} can't run ${ctx.esc(dev ? lc(dev.name) : a.device_id || "that")}${a.hours_per_day ? ` for ${ctx.esc(a.hours_per_day)} h a day` : ""}.` : "The agent didn't reach an answer.";
    const name = (id) => { const d = data && data.devices.find((x) => x.id === id); return d ? d.name : id; };
    const steps = (a.trace || []).map((t) => t.tool === "get_passport" ? `Read passport ${ctx.esc(t.args.passport_id || "")}`
      : t.tool === "check_use" && t.result && !t.result.error ? `Checked ${ctx.esc(name(t.args.device_id))}, ${ctx.esc(t.result.hours_per_day)} h: needs ${wh(t.result.need_wh_per_day)} Wh, the panel gives ${wh(t.result.usable_wh_per_day)} Wh → ${t.result.feasible ? "yes" : "no"}`
      : `${ctx.esc(t.tool)}: ${ctx.esc(JSON.stringify(t.result).slice(0, 120))}`)
      // where each step ran: Chalk's sandbox (with its time) or this laptop
      .map((line, i) => { const t = a.trace[i]; return t && t.where === "chalk-sandbox" ? `${line} <span class="reuse__where">Chalk sandbox, ${ctx.esc(t.ms)} ms</span>` : line; });
    const gw = a.gateway || [];
    const proof = gw.length ? `<div class="reuse__proof small"><b>Run on Chalk.</b> ${gw.length} model call${gw.length > 1 ? "s" : ""} through Chalk's Model Gateway (${gw.map((g) => `<code>${ctx.esc(String(g.id || "").slice(0, 22))}…</code>`).join(", ")})${a.sandbox_id ? `; ${(a.trace || []).filter((t) => t.where === "chalk-sandbox").length} tool calls in Chalk sandbox <code>${ctx.esc(String(a.sandbox_id).slice(0, 8))}</code>` : "; tools ran on this laptop"}.</div>` : "";
    return `${a.recorded ? `<p class="small"><b>Recorded answer</b> from the eval run, not a live one.</p>` : ""}<p class="reuse__answer ${a.feasible ? "is-yes" : ""}">${verdict}</p>
      ${a.note ? `<p>${ctx.esc(a.note)}</p>` : ""}
      ${(a.alternatives || []).length ? `<p class="small">It could run instead: ${a.alternatives.map((x) => ctx.esc(name(x))).join(", ")}.</p>` : ""}
      ${steps.length ? `<ol class="reuse__trace small">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>` : ""}
      ${a.recorded ? "" : proof}
      <p class="small muted">${a.recorded ? `Recorded from the eval run: passport ${ctx.esc(a.passport_id)}, ${ctx.esc(a.sun_hours)} h of sun, asked “${ctx.esc(a.request)}”.` : `${ctx.esc(a.model || "")} through Chalk's Model Gateway${a.tools_in === "chalk" ? "; its tools ran in a Chalk sandbox" : ""}.`}</p>`;
  }

  function wire(view, ctx) {
    const $ = (s) => view.querySelector(s);
    if (!$("#reuse-panel")) return;
    const clearStatus = () => { const st = $("#reuse-status"); st.textContent = ""; st.classList.remove("is-bad"); };
    const current = () => ctx.passports.find((q) => q.passport_id === $("#reuse-panel").value);
    const redraw = () => { const p = current(); if (!p) return; $("#reuse-facts").innerHTML = panelHtml(ctx, p); $("#reuse-runs").innerHTML = runsHtml(ctx, p); $("#reuse-score").innerHTML = scoreHtml(ctx); };
    if (!data) load().then(redraw).catch(() => { $("#reuse-runs").innerHTML = `<p class="status is-bad">The device list (data/second-use.json) didn't load.</p>`; });
    $("#reuse-panel").addEventListener("change", (e) => {
      redraw();
      $("#reuse-answer").hidden = true;
      clearStatus();
      history.replaceState(null, "", `#/reuse/${encodeURIComponent(e.target.value)}`);   // no hashchange: the page stays as it is
    });
    view.querySelectorAll('input[name="reuse-sun"]').forEach((r) => r.addEventListener("change", () => { sun = Number(r.value); redraw(); $("#reuse-answer").hidden = true; clearStatus(); }));
    $("#reuse-ask").addEventListener("submit", async (e) => {
      e.preventDefault();
      const p = current(), q = $("#reuse-q").value.trim();
      if (!p || q.length < 3) return;
      const btn = $("#reuse-go"), st = $("#reuse-status"), out = $("#reuse-answer");
      btn.disabled = true; out.hidden = true; st.classList.remove("is-bad");
      st.textContent = "The agent is reading the passport and checking…";
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 90000);
      try {
        const res = await fetch(AGENT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
          body: JSON.stringify({ passport: { id: p.passport_id, isc_ma: Number(p.isc_ma), voc_v: Number(p.voc_v), grade: p.grade, flags: p.flags || [] }, sun_hours: sun, request: q }) });
        const a = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(a.error || `the agent answered ${res.status}`);
        await load().catch(() => null);
        out.innerHTML = answerHtml(ctx, a);
        out.hidden = false;
        st.textContent = "";
      } catch (err) {
        // the live agent can't answer here (not on the demo laptop, or its quota is spent): show a recorded answer instead, labelled
        const exs = (data && data.examples) || [], ex = exs.find((x) => x.passport_id === p.passport_id) || exs[0];
        if (ex) { out.innerHTML = answerHtml(ctx, { ...ex, recorded: true }); out.hidden = false; }
        st.classList.add("is-bad");
        st.textContent = err.name === "AbortError" ? "No answer after 90 seconds. Try again."
          : err instanceof TypeError ? `The agent runs on the demo laptop (port 8767), so it isn't reachable from here.${ex ? " Here is a recorded answer from the eval run." : ""}`
          : /budget_limit|budget/.test(err.message) ? `The agent's Chalk quota is used up for now.${ex ? " Here is a recorded answer from the eval run." : ""}`
          : `The agent failed: ${err.message}`;
      } finally {
        clearTimeout(timer);
        btn.disabled = false;
      }
    });
  }

  // runs arrived after the page was drawn: redraw only if there was no panel to show before
  function refresh(view, ctx, id) {
    if (view.querySelector("#reuse-panel")) {
      const sel = view.querySelector("#reuse-panel"), keep = sel.value;
      sel.innerHTML = ctx.passports.filter(usable).map((p) => `<option value="${ctx.esc(p.passport_id)}" ${p.passport_id === keep ? "selected" : ""}>${ctx.esc(p.passport_id)}, grade ${ctx.esc(p.grade)}</option>`).join("");
      return;
    }
    view.innerHTML = page(ctx, id);
    wire(view, ctx);
  }

  return { page, wire, refresh };
})();
