// Second Use (#/reuse, #/reuse/<ID>): what can a panel too weak for a rooftop string still power?
// The panel's numbers come from its passport; the customer says what they need; the Second Use service
// (tools/chalk_integration/second_life_marketplace_api.py, port 8767, local only) screens a small catalogue
// with Chalk Compute and asks a model through Chalk Model Gateway for more ideas.
// ctx: { passports, loading, esc, num }
window.SSReuse = (function () {
  const API_URL = "http://127.0.0.1:8767/marketplace";
  const STORE = "ss.site.reuse";
  const DEFAULTS = { purpose: "soil moisture sensor", budget: 25, hours: 24 };
  // the service's codes, in words
  const DECISION = {
    NEEDS_MORE_EVIDENCE: "Possible match: bench-test it before selling",
    UNABLE_TO_MEET_REQUEST_WITH_PANEL: "This panel can't power that",
    NO_CATALOG_OFFER_WITHIN_BUDGET: "It could, but not within your budget",
    NO_VALIDATED_CATALOG_MATCH: "Nothing in the catalogue fits yet",
  };
  const STATUS = {
    NEEDS_MORE_EVIDENCE: "Possible, needs a bench test",
    NOT_FEASIBLE_BY_POWER_BOUND: "Needs more power than this panel has",
    OVER_BUDGET: "Over your budget",
    NOT_CUSTOMER_RELEVANT: "Not what you asked for",
  };
  const IDEAS = ["soil moisture sensor", "LED light", "small fan", "ventilation", "electric clothes dryer"];

  const saved = () => { try { const v = JSON.parse(localStorage.getItem(STORE)); return { ...DEFAULTS, ...(v && typeof v === "object" ? v : {}) }; } catch (_) { return { ...DEFAULTS }; } };
  const save = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (_) { /* unavailable */ } };
  const usable = (p) => Number(p.isc_ma) > 0 && Number(p.voc_v) > 0;
  // no ID in the address: start with the weakest grade, the panels this page is for
  function pick(ps, id) {
    const ok = ps.filter(usable);
    return ok.find((p) => p.passport_id === id) || ok.find((p) => p.grade === "C") || ok.find((p) => p.grade === "B") || ok[0] || null;
  }
  const options = (ctx, ps, cur) => ps.filter(usable).map((p) => `<option value="${ctx.esc(p.passport_id)}" ${cur && p.passport_id === cur.passport_id ? "selected" : ""}>${ctx.esc(p.passport_id)}, grade ${ctx.esc(p.grade)}</option>`).join("");
  function factsHtml(ctx, p) {
    if (!p) return "";
    const bound = (Number(p.voc_v) * Number(p.isc_ma)) / 1000;
    return `<dl class="facts reuse__facts">
        <div><dt>Open-circuit voltage</dt><dd>${ctx.num(p.voc_v, 2)} V</dd></div>
        <div><dt>Short-circuit current</dt><dd>${ctx.num(p.isc_ma, 1)} mA</dd></div>
        <div><dt>Most power it could give</dt><dd>${ctx.num(bound, 2)} W <span class="small muted">voltage × current, an upper bound: under a real load it gives less</span></dd></div>
      </dl>
      <p class="small"><a href="#/p/${encodeURIComponent(p.passport_id)}">Open ${ctx.esc(p.passport_id)}'s passport</a></p>`;
  }

  function page(ctx, id) {
    const ps = ctx.passports;
    const cur = pick(ps, id);
    const st = saved();
    const panelPart = cur
      ? `<label class="field use-q">Panel ${`<select id="reuse-panel">${options(ctx, ps, cur)}</select>`}</label>
         <div id="reuse-facts">${factsHtml(ctx, cur)}</div>`
      : ctx.loading
        ? `<p class="muted">Loading passports…</p>`
        : `<p>No passports are loaded in this browser yet. <a href="#/passports">Open the passports</a> to load the demo batch or a bench run, then come back.</p>`;
    return `
      <h1 class="page-title">Second Use</h1>
      <p class="lede">A panel too weak to stay in a rooftop string still makes a little power, enough for a sensor, a fan or a light. Pick a panel by its passport, say what you need powered, and this page checks whether that panel is strong enough, what the product would cost, and what else it could run.</p>
      <ol class="reuse__how">
        <li><b>The panel's numbers come from its passport.</b> Voltage × current gives the most power it could ever deliver.</li>
        <li><b>That limit is checked against a small catalogue</b> (an LED indicator, a soil sensor, a small fan, a clothes dryer) and your budget. Chalk Compute runs the check.</li>
        <li><b>A language model suggests up to two more uses</b> through Chalk Model Gateway. These are ideas, not checked.</li>
      </ol>
      <form id="reuse-form" class="reuse__form">
        <section class="card">
          <h2>1. The panel</h2>
          <div id="reuse-panel-part">${panelPart}</div>
        </section>
        <section class="card">
          <h2>2. What you need powered</h2>
          <div class="use-grid">
            <label class="field">What should it run? <input id="reuse-purpose" list="reuse-ideas" value="${ctx.esc(st.purpose)}" minlength="3" maxlength="200" required></label>
            <datalist id="reuse-ideas">${IDEAS.map((i) => `<option value="${ctx.esc(i)}">`).join("")}</datalist>
            <label class="field">Most you'd pay <span class="unit-row">$ <input id="reuse-budget" type="number" min="0" step="any" inputmode="decimal" value="${ctx.esc(st.budget)}" style="width:110px" required></span></label>
            <label class="field">Hours a day it must run <span class="unit-row"><input id="reuse-hours" type="number" min="0.1" max="24" step="any" inputmode="decimal" value="${ctx.esc(st.hours)}" style="width:90px" required> h</span></label>
          </div>
        </section>
        <div class="row reuse__go">
          <button type="submit" class="btn btn--primary" id="reuse-go" ${cur ? "" : "disabled"}>Check this panel</button>
          <p id="reuse-status" class="status" role="status" aria-live="polite"></p>
        </div>
      </form>
      <section id="reuse-result" class="reuse__result" hidden aria-label="Result"></section>
      <p class="small muted reuse__note">A research prototype. The power limit is idealised, prices are illustrative, and nothing here is approved for sale.</p>`;
  }

  function resultHtml(ctx, d) {
    const rows = (d.catalog_screening || []).map((o) => `<tr class="${o.status === "NEEDS_MORE_EVIDENCE" ? "is-fit" : ""}">
        <td>${ctx.esc(o.product)}</td><td class="num">${ctx.num(o.required_power_w, 2)} W</td>
        <td class="num">$${ctx.num(o.minimum_price_usd, 2)}</td><td>${ctx.esc(STATUS[o.status] || o.status)}</td></tr>`).join("");
    const dec = d.decision || {};
    return `
      <div class="card reuse__verdict">
        <h2>Verdict</h2>
        <p class="reuse__decision">${ctx.esc(DECISION[dec.decision] || dec.decision || "No verdict returned")}</p>
        <p class="muted">${ctx.esc(dec.reason || "")}</p>
      </div>
      <div class="card">
        <h2>The catalogue, checked against this panel</h2>
        <p class="small muted">This panel can give at most ${ctx.num(d.power_upper_bound_w, 2)} W. Prices are the lowest that cover the panel, parts, labour and testing at a 30% margin.</p>
        <div class="reuse__scroll"><table class="table"><thead><tr><th>Product</th><th class="num">Needs</th><th class="num">Lowest price</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>
      <div class="card">
        <h2>Other uses a model suggested</h2>
        <p class="small muted">From a language model through Chalk Model Gateway. Not checked against the panel.</p>
        <div class="reuse__ideas">${ctx.esc((d.ai_discovery && d.ai_discovery.ideas) || "No ideas returned.")}</div>
      </div>
      <div class="card">
        <h2>Measure these before selling it</h2>
        <ul class="reuse__list">${(d.next_measurements || []).map((m) => `<li>${ctx.esc(m)}</li>`).join("")}</ul>
      </div>`;
  }

  function wire(view, ctx) {
    const $ = (s) => view.querySelector(s);
    const form = $("#reuse-form");
    if (!form) return;
    const fields = () => ({ purpose: $("#reuse-purpose").value.trim(), budget: Number($("#reuse-budget").value), hours: Number($("#reuse-hours").value) });
    form.addEventListener("input", (e) => { if (e.target.id !== "reuse-panel") save(fields()); });
    form.addEventListener("change", (e) => {
      if (e.target.id !== "reuse-panel") return;
      const p = ctx.passports.find((q) => q.passport_id === e.target.value);
      $("#reuse-facts").innerHTML = factsHtml(ctx, p);
      $("#reuse-result").hidden = true;
      history.replaceState(null, "", `#/reuse/${encodeURIComponent(e.target.value)}`);   // no hashchange: the form stays as it is
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sel = $("#reuse-panel");
      const p = sel && ctx.passports.find((q) => q.passport_id === sel.value);
      if (!p) return;
      const f = fields();
      const btn = $("#reuse-go"), status = $("#reuse-status"), out = $("#reuse-result");
      btn.disabled = true; out.hidden = true;
      status.classList.remove("is-bad");
      status.textContent = "Checking with Chalk… the model's ideas can take up to a minute.";
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 90000);
      try {
        const res = await fetch(API_URL, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
          body: JSON.stringify({ panel: { id: p.passport_id, voc_v: Number(p.voc_v), isc_a: Number(p.isc_ma) / 1000 }, customer: { purpose: f.purpose, budget_usd: f.budget, daily_runtime_hours: f.hours } }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `the service answered ${res.status}`);
        out.innerHTML = resultHtml(ctx, data);
        out.hidden = false;
        status.textContent = "";
      } catch (err) {
        status.classList.add("is-bad");
        status.textContent = err.name === "AbortError" ? "No answer after 90 seconds. Try again."
          : err instanceof TypeError ? "The Second Use service isn't reachable. It runs on the demo laptop (port 8767) with the site served by tools/serve.py; it doesn't run on the public site."
          : `The check failed: ${err.message}`;
      } finally {
        clearTimeout(timer);
        btn.disabled = false;
      }
    });
  }

  // runs arrived after the page was drawn: refill the panel part, keep what was typed and any result
  function refresh(view, ctx, id) {
    const part = view.querySelector("#reuse-panel-part");
    const sel = view.querySelector("#reuse-panel");
    const cur = pick(ctx.passports, sel ? sel.value : id);
    if (!part) return;
    if (sel && cur) { sel.innerHTML = options(ctx, ctx.passports, cur); view.querySelector("#reuse-facts").innerHTML = factsHtml(ctx, cur); return; }
    const fresh = document.createElement("div");
    fresh.innerHTML = page(ctx, id);
    part.innerHTML = fresh.querySelector("#reuse-panel-part").innerHTML;
    const go = view.querySelector("#reuse-go");
    if (go) go.disabled = !cur;
  }

  return { page, wire, refresh };
})();
