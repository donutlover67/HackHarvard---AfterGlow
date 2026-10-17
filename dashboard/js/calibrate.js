// Calibrate the mock bench to real panels: type each panel's measured short-circuit current and open-circuit
// voltage, and the simulation runs on those four panels instead of the default identical ones with film.
// The result is still a simulation and is labelled as one everywhere (link readout, bench notes, passports).
// The sheet is built here so index.html only carries the button that opens it.

const KEY = "ss.mockCalib";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function savedCalibration() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    return validate(c) ? c : null;
  } catch (_) { return null; }
}

function validate(c) {
  if (!c || typeof c !== "object") return false;
  return [1, 2, 3, 4].every((k) => c[k] && Number.isFinite(c[k].isc_ma) && c[k].isc_ma >= 1 && c[k].isc_ma <= 5000
    && Number.isFinite(c[k].voc_v) && c[k].voc_v >= 0.5 && c[k].voc_v <= 30);
}

export function describeCalibration(c) {
  return [1, 2, 3, 4].map((k) => `P${k} ${c[k].isc_ma} mA ${c[k].voc_v} V`).join(", ");
}

// onChange(calib | null) is called after Apply or Clear; the caller restarts the mock bench with it.
export function initCalibration({ onChange }) {
  const sheet = document.createElement("dialog");
  sheet.className = "sheet";
  sheet.id = "calib-sheet";
  sheet.innerHTML = `<form method="dialog">
    <h2>Simulate your measured panels</h2>
    <p>Type each panel's short-circuit current and open-circuit voltage, measured with a multimeter under the same light. The mock bench then simulates those four panels, so the search and proof show what the bench would find for them. It is still a simulation, and is labelled as one.</p>
    <div class="passport-grid">
      ${[1, 2, 3, 4].map((k) => `<label>Panel ${k}, mA <input data-calib-isc="${k}" inputmode="decimal" spellcheck="false"></label>`).join("")}
      ${[1, 2, 3, 4].map((k) => `<label>Panel ${k}, V <input data-calib-voc="${k}" inputmode="decimal" spellcheck="false"></label>`).join("")}
    </div>
    <div class="sheet__actions">
      <button type="button" class="btn btn--primary" id="btn-calib-apply">Simulate these panels</button>
      <button type="button" class="btn" id="btn-calib-clear">Back to the default panels</button>
      <button type="submit" class="btn btn--quiet">Close</button>
      <span class="sheet__status" id="calib-status"></span>
    </div>
  </form>`;
  document.body.appendChild(sheet);
  const status = sheet.querySelector("#calib-status");
  const fill = () => {
    const c = savedCalibration();
    [1, 2, 3, 4].forEach((k) => {
      sheet.querySelector(`[data-calib-isc="${k}"]`).value = c ? c[k].isc_ma : "";
      sheet.querySelector(`[data-calib-voc="${k}"]`).value = c ? c[k].voc_v : "";
    });
    status.textContent = c ? "Simulating measured panels." : "Using the default panels.";
    status.classList.remove("is-bad");
  };
  sheet.querySelector("#btn-calib-apply").addEventListener("click", () => {
    const c = {};
    for (const k of [1, 2, 3, 4]) {
      const isc = Number(String(sheet.querySelector(`[data-calib-isc="${k}"]`).value).replace(",", "."));
      const voc = Number(String(sheet.querySelector(`[data-calib-voc="${k}"]`).value).replace(",", "."));
      c[k] = { isc_ma: isc, voc_v: voc };
    }
    if (!validate(c)) {
      status.textContent = "Each panel needs a current from 1 to 5000 mA and a voltage from 0.5 to 30 V.";
      status.classList.remove("is-bad"); void status.offsetWidth; status.classList.add("is-bad");
      return;
    }
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) { /* private mode: applies for this session only */ }
    onChange(c);
    status.classList.remove("is-bad");
    status.textContent = `Simulating ${esc(describeCalibration(c))}.`;
  });
  sheet.querySelector("#btn-calib-clear").addEventListener("click", () => {
    try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
    onChange(null);
    fill();
  });
  return { open() { fill(); sheet.showModal(); } };
}
