const panelsEl = document.getElementById("panels");
const pairingsEl = document.getElementById("pairings");
const controlsEl = document.getElementById("controls");
const gainEl = document.getElementById("gain");
const gainDetail = document.getElementById("gain-detail");
const activeRole = document.getElementById("active-role");
const activePower = document.getElementById("active-power");
const lightDetail = document.getElementById("light-detail");
const pump = document.getElementById("pump");
const impeller = document.getElementById("impeller");
const pumpDetail = document.getElementById("pump-detail");
const hardwareNote = document.getElementById("hardware-note");
const lightInput = document.getElementById("light");
const lightValue = document.getElementById("light-value");
const chart = document.getElementById("chart");

let latest = null;
let posting = false;

hardwareNote.textContent = "INA219 shunt model: current = voltage / 0.1 ohm. At 0.3 A the shunt drops 0.03 V, so the panel is effectively shorted. The pump indicator uses panel power directly.";

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatGain(state) {
  if (state.measured_gain_pct === null) return "Measuring…";
  const sign = state.measured_gain_pct > 0 ? "+" : "";
  return `${sign}${state.measured_gain_pct.toFixed(1)}%`;
}

function renderPanels(state) {
  panelsEl.innerHTML = state.panels.map((panel) => `
    <article class="panel-card">
      <h3>Panel ${panel.name}</h3>
      <div class="metric"><span>Short-circuit</span><strong>${panel.isc_ma.toFixed(0)} mA</strong></div>
      <div class="metric"><span>Open-circuit</span><strong>${panel.voc_v.toFixed(2)} V</strong></div>
      <div class="metric"><span>Relative score</span><strong>${panel.relative_score.toFixed(0)}%</strong></div>
      ${panel.voltage_flag ? '<p class="flag">Open-circuit voltage is more than 20% below the others. Possible failed cell group.</p>' : ""}
    </article>
  `).join("");
}

function renderPairings(state) {
  pairingsEl.innerHTML = state.pairings.map((row) => {
    const active = row.roles.includes(state.active_role);
    const label = row.pairs.map((pair) => pair.join("–")).join(" ∥ ");
    const roleText = row.roles.length ? row.roles.join(" · ") : "candidate";
    return `
      <article class="pairing-card${active ? " active" : ""}">
        <h3>${label}</h3>
        <p class="watts">${row.power_w.toFixed(2)} W</p>
        <p class="roles">${roleText}</p>
      </article>
    `;
  }).join("");
}

function ensureControls(state) {
  if (controlsEl.childElementCount === state.panels.length) return;
  controlsEl.innerHTML = state.panels.map((panel, index) => `
    <article class="control-card">
      <h3>Panel ${panel.name}</h3>
      <label>Tint transmission
        <input data-field="transmission" data-index="${index}" type="range" min="0.3" max="1" step="0.05" value="${panel.transmission}">
        <span data-readout="transmission">${percent(panel.transmission)}</span>
      </label>
      <label>Series resistance
        <input data-field="series_ohm" data-index="${index}" type="range" min="0" max="5" step="0.5" value="${panel.series_ohm}">
        <span data-readout="series_ohm">${panel.series_ohm.toFixed(1)} Ω</span>
      </label>
      <label>
        <input data-field="cell_group_failed" data-index="${index}" type="checkbox" ${panel.cell_group_failed ? "checked" : ""}>
        Failed cell group
      </label>
    </article>
  `).join("");
  controlsEl.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      const card = input.closest(".control-card");
      const transmission = card.querySelector('[data-field="transmission"]');
      const resistance = card.querySelector('[data-field="series_ohm"]');
      card.querySelector('[data-readout="transmission"]').textContent = percent(Number(transmission.value));
      card.querySelector('[data-readout="series_ohm"]').textContent = `${Number(resistance.value).toFixed(1)} Ω`;
      postConfig();
    });
  });
}

function configFromControls() {
  const panels = [0, 1, 2, 3].map((index) => {
    const card = controlsEl.children[index];
    return {
      transmission: Number(card.querySelector('[data-field="transmission"]').value),
      series_ohm: Number(card.querySelector('[data-field="series_ohm"]').value),
      cell_group_failed: card.querySelector('[data-field="cell_group_failed"]').checked,
    };
  });
  return { light: Number(lightInput.value), panels };
}

async function postConfig() {
  posting = true;
  try {
    const response = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configFromControls()),
    });
    latest = await response.json();
    render(latest);
  } finally {
    posting = false;
  }
}

function applyPreset(panels) {
  panels.forEach((panel, index) => {
    const card = controlsEl.children[index];
    card.querySelector('[data-field="transmission"]').value = panel.transmission;
    card.querySelector('[data-field="series_ohm"]').value = panel.series_ohm;
    card.querySelector('[data-field="cell_group_failed"]').checked = panel.cell_group_failed;
    card.querySelector('[data-readout="transmission"]').textContent = percent(panel.transmission);
    card.querySelector('[data-readout="series_ohm"]').textContent = `${panel.series_ohm.toFixed(1)} Ω`;
  });
  postConfig();
}

function drawChart(history) {
  const width = chart.clientWidth || 800;
  const height = 280;
  const dpr = window.devicePixelRatio || 1;
  chart.width = Math.floor(width * dpr);
  chart.height = Math.floor(height * dpr);
  const ctx = chart.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!history.length) return;
  const pad = { l: 42, r: 12, t: 16, b: 24 };
  const powers = history.map((point) => point.power_w);
  const maxPower = Math.max(...powers, 0.1) * 1.15;
  const minT = history[0].t;
  const maxT = history[history.length - 1].t;
  const span = Math.max(maxT - minT, 1);

  ctx.strokeStyle = "#31382b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, height - pad.b);
  ctx.lineTo(width - pad.r, height - pad.b);
  ctx.stroke();
  ctx.fillStyle = "#b7b1a2";
  ctx.font = "12px sans-serif";
  ctx.fillText(`${maxPower.toFixed(1)} W`, 2, pad.t + 4);
  ctx.fillText("0", 18, height - pad.b);

  function stroke(role, color) {
    const points = history.filter((point) => point.role === role);
    if (!points.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = pad.l + ((point.t - minT) / span) * (width - pad.l - pad.r);
      const y = height - pad.b - (point.power_w / maxPower) * (height - pad.t - pad.b);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  stroke("arbitrary", "#7f9e8a");
  stroke("optimized", "#e4a04a");
}

function render(state) {
  gainEl.textContent = formatGain(state);
  gainDetail.textContent = state.position_is_optimal
    ? "Position wiring already pairs similar currents, so the measured gain over that arbitrary pairing is about zero."
    : "Average difference in output power, optimized pairing over position wiring, across alternation cycles.";
  activeRole.textContent = state.active_role === "optimized" ? "Optimized pairing" : "Arbitrary pairing";
  activePower.textContent = `${state.active_power_w.toFixed(2)} W`;
  lightDetail.textContent = `Light on the panels now: ${percent(state.light)} of the demo full-sun level.`;
  const spinning = state.active_power_w > 0.05;
  pump.classList.toggle("stopped", !spinning);
  impeller.style.animationDuration = spinning ? `${Math.max(0.35, 2.4 - state.active_power_w / 3).toFixed(2)}s` : "0s";
  pumpDetail.textContent = spinning
    ? "Driven by the panels, not a battery, so the indicator follows output power."
    : "No panel power is reaching the pump.";
  renderPanels(state);
  renderPairings(state);
  ensureControls(state);
  drawChart(state.history);
}

async function poll() {
  if (posting) return;
  try {
    const response = await fetch("/api/state");
    latest = await response.json();
    render(latest);
  } catch (_error) {
    gainEl.textContent = "Offline";
  }
}

lightInput.addEventListener("input", () => {
  lightValue.textContent = percent(Number(lightInput.value));
  postConfig();
});

document.getElementById("preset-mismatch").addEventListener("click", () => {
  applyPreset([
    { transmission: 1, series_ohm: 0, cell_group_failed: false },
    { transmission: 0.5, series_ohm: 0, cell_group_failed: false },
    { transmission: 1, series_ohm: 0, cell_group_failed: false },
    { transmission: 0.5, series_ohm: 0, cell_group_failed: false },
  ]);
});

document.getElementById("preset-together").addEventListener("click", () => {
  applyPreset([
    { transmission: 1, series_ohm: 0, cell_group_failed: false },
    { transmission: 1, series_ohm: 0, cell_group_failed: false },
    { transmission: 0.5, series_ohm: 0, cell_group_failed: false },
    { transmission: 0.5, series_ohm: 0, cell_group_failed: false },
  ]);
});

document.getElementById("preset-clear").addEventListener("click", () => {
  applyPreset([
    { transmission: 1, series_ohm: 0, cell_group_failed: false },
    { transmission: 1, series_ohm: 0, cell_group_failed: false },
    { transmission: 1, series_ohm: 0, cell_group_failed: false },
    { transmission: 1, series_ohm: 0, cell_group_failed: false },
  ]);
});

ensureControls({
  panels: [
    { name: "A", transmission: 1, series_ohm: 0, cell_group_failed: false },
    { name: "B", transmission: 0.5, series_ohm: 0, cell_group_failed: false },
    { name: "C", transmission: 1, series_ohm: 0, cell_group_failed: false },
    { name: "D", transmission: 0.5, series_ohm: 0, cell_group_failed: false },
  ],
});

poll();
setInterval(poll, 500);
