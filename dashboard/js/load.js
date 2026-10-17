// What the array powers on the bench: the pump in the plan, or a fan, a resistor or nothing when the light is too weak
// for the pump. The choice only changes words on screen (readout, trace note, wiring diagram, pump-proof wording);
// the gain claim is measured from I-V sweeps and never depends on the load.

const KEY = "ss.load";
const LOADS = {
  pump: { noun: "pump", label: "Pump" },
  fan: { noun: "fan", label: "Fan" },
  resistor: { noun: "load resistor", label: "Load" },
  none: { noun: "output", label: "Load" },
};

export function loadKind() {
  try { const k = localStorage.getItem(KEY); return LOADS[k] ? k : "pump"; } catch (_) { return "pump"; }
}
export const loadNoun = () => LOADS[loadKind()].noun;

function applyWords() {
  const { noun, label } = LOADS[loadKind()];
  const lab = document.getElementById("pump-label");
  if (lab) lab.textContent = label;
  const note = document.getElementById("trace-note");
  if (note) note.textContent = loadKind() === "none"
    ? "Power from the combined output. The line changes colour when the relays change the wiring."
    : `Power into our ${noun}, from the combined output. The line changes colour when the relays change the wiring.`;
}

// onChange() redraws whatever shows the load (the wiring diagram, the headline).
export function initLoad(onChange) {
  const sel = document.getElementById("load-kind");
  if (sel) {
    sel.value = loadKind();
    sel.addEventListener("change", () => {
      try { localStorage.setItem(KEY, sel.value); } catch (_) { /* ignore */ }
      applyWords(); onChange();
    });
  }
  applyWords();
}
