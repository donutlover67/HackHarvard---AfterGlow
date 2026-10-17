// Replay: a hardware-free check of the Web Serial path, shown only with ?replay=1.
// Recorded protocol/samples/*.jsonl lines, plus the malformed input a real ESP32 produces, are cut into
// random chunks and served by a stand-in port. SerialLink reads that port with its own read loop, so the
// bytes go through the same decoder, line splitter, JSON parse and dispatch as a board on USB.
// Nothing here builds message objects: every message is text from protocol/samples/.

const FILES = ["hello", "live", "grade", "sweep", "search", "proof", "cal", "error", "log"];
const enc = new TextEncoder();
const BAUD_BYTES_PER_MS = 11.52;   // 115200 baud, 10 bits per byte on the wire

// Each item is raw bytes plus the lines SerialLink should hand to app.js for them, with the status
// app.js onLine() should return: handled | rejected (known type, bad fields) | unknown (type) | ignored (not a message).
const line = (text, status, eol = "\n") => ({ raw: enc.encode(text + eol), lines: [{ text, status }] });
const bytes = (raw, lines = []) => ({ raw: typeof raw === "string" ? enc.encode(raw) : raw, lines });
const READ_ERROR = { error: true };   // a non-fatal read error between two streams (framing or break at reset)

function failureCases() {
  // Known types with a field missing or wrong. Each must be rejected and leave the page as it was.
  return [
    line('{"type":"live","t":61100,"mode":"RUN","pairing":"B","pump":true,"panels":[]}', "rejected"),
    line('{"type":"grade","t":5100,"panels":[{"id":1,"isc_raw_ma":149.7,"voc_v":6.82,"score":100.0,"grade":"A","flags":[]}],"predicted":"B"}', "rejected"),
    line('{"type":"sweep","t":6300,"pairing":"A","pmax_w":1.479,"vmp_v":5.38,"imp_ma":274.6,"voc_v":15.2,"isc_ma":298.0,"ff":0.326,"n":403}', "rejected"),
    line('{"type":"sweep","t":6400,"pairing":"B","pmax_w":2.038,"imp_ma":184.6,"voc_v":15.2,"isc_ma":298.0,"ff":0.45,"n":403,"pts":[[0.0,298.0],[15.2,0]]}', "rejected"),
    line('{"type":"sweep","t":6500,"pairing":"D","pmax_w":1.0,"vmp_v":5.0,"imp_ma":200,"voc_v":15.2,"isc_ma":298.0,"ff":0.3,"n":403,"pts":[[0.0,298.0],[15.2,0]]}', "rejected"),
    line('{"type":"search","t":8700,"pmax_w":{"A":1.479,"B":2.038,"C":1.479},"predicted":"B","match":true}', "rejected"),
    line('{"type":"proof","t":11300,"kind":"sweep","best":"B","base":"A","cycle":2,"p_best_w":2.04,"p_base_w":1.47,"ci95_pct":1.2}', "rejected"),
    line('{"type":"proof","t":11400,"kind":"sweep","best":"B","base":"A","p_best_w":2.04,"p_base_w":1.47,"gain_pct":38.1}', "rejected"),
    line('{"type":"cal","box":2}', "rejected"),
    line('{"type":"cal"}', "rejected"),
  ];
}

function noiseCases() {
  const garbage = "~°☀ ÿþ garbage from a half-reset UART ☀~";
  const cut = enc.encode(garbage.slice(0, 2)).length + 1;   // a chunk boundary inside the 3-byte U+2600
  return [
    bytes("\n"), bytes("\r\n"), bytes("   \r\n"),                       // blank lines never reach app.js
    { ...line(garbage, "ignored"), cutAt: cut },
    line('{"type":"live","t":61100,"mode":"RUN","pairing":"B","pump":tr', "ignored"),   // invalid JSON
    line('{"type":"telemetry","t":61150,"x":1}', "unknown"),
    line('{"type":"__proto__"}', "unknown"),
    line('{"type":"toString"}', "unknown"),
    line('{"type":5}', "ignored"),
    line("42", "ignored"), line("null", "ignored"), line("[1,2]", "ignored"), line('"live"', "ignored"),
  ];
}

function bootNoise() {
  const dec = new TextDecoder();
  const bad = new Uint8Array([0xff, 0xfe, ...enc.encode("ets Jun  8 2016 00:22:57")]);
  return [
    // the very first bytes are the tail of a line the board was printing when it reset
    line('.1},{"id":4,"slot":"S4","i_ma":102.4}]}', "ignored", "\r\n"),
    { raw: new Uint8Array([...bad, 0x0d, 0x0a]), lines: [{ text: dec.decode(bad), status: "ignored" }] },
    line("rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)", "ignored", "\r\n"),
    line("load:0x3fff0030,len:1184", "ignored", "\r\n"),
    line("entry 0x400805e4", "ignored", "\r\n"),
  ];
}

async function fetchLines(base, name) {
  const res = await fetch(new URL(`${name}.jsonl`, base));
  if (!res.ok) throw new Error(`${name}.jsonl: ${res.status} (serve the repo root with tools/serve.py)`);
  return (await res.text()).split("\n").filter((l) => l.trim());
}

// Deterministic chunking so a failure reproduces: 1-96 bytes per read, plus the forced cut points.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunk(segment, rand) {
  const out = [];
  const cuts = [...segment.cuts].sort((a, b) => a - b);
  let pos = 0;
  while (pos < segment.bytes.length) {
    let end = Math.min(segment.bytes.length, pos + 1 + Math.floor(rand() * 96));
    const forced = cuts.find((c) => c > pos && c < end);
    if (forced != null) end = forced;
    out.push(segment.bytes.slice(pos, end));
    pos = end;
  }
  return out;
}

export async function buildReplay(base, seed = 2026) {
  const demo = await fetchLines(base, "demo-sequence");
  const files = [];
  for (const name of FILES) files.push(...await fetchLines(base, name));

  const items = [...bootNoise()];
  // a NUL-prefixed hello, as some boards print right after reset; it is not valid JSON, so it is dropped
  items.push(line(`\u0000\u0000${demo[0]}`, "ignored"));
  demo.forEach((text, i) => {
    items.push(line(text, "handled", i % 2 ? "\r\n" : "\n"));   // the firmware's println ends lines with \r\n
    if (i === 0) items.push(...noiseCases());
    if (i === 3) items.push(...failureCases());
  });
  // a line far longer than any message (runaway output); its kept tail is still not JSON
  items.push({ raw: enc.encode("x".repeat(30000) + "\n"), lines: [{ text: null, status: "ignored" }] });
  // a read error in the middle of a line: the cut line is dropped and its remainder is ignored
  const torn = files.find((t) => t.includes('"type":"live"'));
  items.push(bytes(torn.slice(0, 61)), READ_ERROR, line(torn.slice(61), "ignored", "\r\n"));
  files.forEach((text) => items.push(line(text, "handled", "\r\n")));
  items.push(bytes('{"type":"log","msg":"cut off when the replay ends'));   // no newline: never delivered

  const segments = [{ bytes: [], cuts: new Set() }];
  for (const it of items) {
    if (it.error) { segments.push({ bytes: [], cuts: new Set() }); continue; }
    const seg = segments[segments.length - 1];
    if (it.cutAt != null) seg.cuts.add(seg.bytes.length + it.cutAt);
    seg.bytes.push(...it.raw);
  }
  const rand = rng(seed);
  const chunks = segments.map((s) => chunk({ bytes: Uint8Array.from(s.bytes), cuts: s.cuts }, rand));
  const expected = items.flatMap((it) => it.lines || []);
  const handled = expected.filter((e) => e.status === "handled").map((e) => JSON.parse(e.text));
  return { chunks, expected, handled, bytes: segments.reduce((n, s) => n + s.bytes.length, 0) };
}

// A stand-in for a Web Serial port: open/close, getInfo, a writable that records commands, and a readable
// that serves the chunks. Between segments it errors the stream and offers a new one, which is what
// Web Serial does on a non-fatal read error. speed 1 paces reads at 115200 baud; speed 0 does not wait.
// For recordings (js/playback.js): speed may be a function read at every chunk (the speed can change
// mid-playback), a number in a segment is a pause in recorded milliseconds (divided by the speed), and
// baud: false turns the baud pacing off when the recording's own timing is used instead.
export function replayPort(chunks, { speed = 1, baud = true } = {}) {
  const sent = [];
  const rate = typeof speed === "function" ? speed : () => speed;
  let finish;
  let cancelled = false;
  const finished = new Promise((r) => { finish = r; });
  const wait = (ms) => (rate() > 0 && ms >= 1 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  const port = {
    readable: null, writable: null, sent, finished,
    getInfo: () => ({}),
    addEventListener() {},
    async open() { port.readable = stream(0); },
    async close() { cancelled = true; port.readable = null; finish(); },
  };
  port.writable = new WritableStream({ write(c) { sent.push(new TextDecoder().decode(c)); } });
  function stream(si) {
    let i = 0; let owed = 0;
    return new ReadableStream({
      async pull(ctrl) {
        while (typeof chunks[si][i] === "number") {
          const ms = chunks[si][i++];
          if (rate() > 0) await wait(ms / rate());
          if (cancelled) return;
        }
        if (i < chunks[si].length) {
          const c = chunks[si][i++];
          if (baud) {
            owed += c.length / (BAUD_BYTES_PER_MS * (rate() || 1));
            if (owed >= 16) { await wait(owed); owed = 0; }   // timers are coarse; wait in batches
          }
          if (!cancelled) ctrl.enqueue(c);
          return;
        }
        await wait(20);
        if (cancelled) return;
        if (si + 1 < chunks.length) {
          port.readable = stream(si + 1);
          ctrl.error(new DOMException("Framing error (replayed)", "FramingError"));
        } else {
          port.readable = null;
          ctrl.close();
          finish();
        }
      },
      cancel() { cancelled = true; port.readable = null; finish(); },
    });
  }
  return port;
}

// Count console.error calls and uncaught errors while the replay runs.
export function watchErrors() {
  const seen = [];
  const orig = console.error;
  const onErr = (e) => seen.push(`uncaught: ${e.message || e.reason || e}`);
  console.error = (...a) => { seen.push(a.map(String).join(" ")); orig.apply(console, a); };
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onErr);
  let stopped = false;
  return {
    stop() {
      if (!stopped) { stopped = true; console.error = orig; window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onErr); }
      return seen;
    },
  };
}

const BAD_TEXT = /NaN|undefined|Infinity|\[object/;

export function checkReplay(plan, got, { errors, sent, conn, doc }) {
  const problems = [];
  const counts = {};
  got.forEach((g) => { counts[g.status] = (counts[g.status] || 0) + 1; });

  // 1. the splitter delivered exactly the expected lines, in order, and app.js classified each one
  const n = Math.max(plan.expected.length, got.length);
  for (let i = 0; i < n; i++) {
    const e = plan.expected[i]; const g = got[i];
    if (!e || !g) { problems.push(`line ${i + 1}: expected ${e ? JSON.stringify(e.text).slice(0, 60) : "nothing"}, got ${g ? JSON.stringify(g.line).slice(0, 60) : "nothing"}`); continue; }
    if (e.text != null && e.text !== g.line) problems.push(`line ${i + 1}: text differs: got ${JSON.stringify(g.line).slice(0, 80)}`);
    if (e.status !== g.status) problems.push(`line ${i + 1}: expected ${e.status}, got ${g.status}: ${String(g.line).slice(0, 80)}`);
  }
  if (errors.length) problems.push(...errors.map((e) => `console error: ${e}`));
  if (conn !== "serial") problems.push(`the link is "${conn}" after the replayed framing error; it should still be connected`);
  if (!sent.some((s) => s === "STATUS\n")) problems.push("STATUS was not written to the port after connecting");

  // 2. every message type rendered, and the bad lines left no trace
  const msgs = plan.handled;
  const last = (type) => [...msgs].reverse().find((m) => m.type === type);
  const panels = doc.querySelectorAll("#panel-row .panel");
  if (panels.length !== 4) problems.push(`${panels.length} panels drawn, expected 4`);
  const lastGrade = last("grade");
  lastGrade.panels.forEach((p) => {
    const el = doc.querySelector(`#panel-row .panel[data-id="${p.id}"] .panel__grade`);
    if (!el || !el.classList.contains(`g-${p.grade}`)) problems.push(`panel ${p.id} does not show grade ${p.grade}`);
  });
  ["A", "B", "C"].forEach((k) => {
    if (!doc.querySelector(`#curves-chart path.series--${k}`)) problems.push(`no ${k} curve in the I-V sweeps chart`);
    if (!doc.querySelector(`#bars-chart .bar[data-k="${k}"]`)) problems.push(`no ${k} bar in the maximum power chart`);
  });
  if (!doc.querySelector("#trace-chart polyline")) problems.push("the output power trace has no line");
  const pr = last("proof");
  const gain = `${pr.gain_pct >= 0 ? "+" : "−"}${Math.abs(pr.gain_pct).toFixed(1)}%`;
  const gainText = doc.querySelector("#gain-number").textContent;
  if (gainText !== gain) problems.push(`gain shows ${gainText}, the last proof says ${gain}`);
  const ci = doc.querySelector("#gain-ci").textContent;
  if (!ci.includes(`±${pr.ci95_pct.toFixed(1)}`) || !ci.includes(`${pr.cycle} cycles`)) problems.push(`confidence line "${ci}" does not match the last proof`);
  const fm = [...msgs].reverse().find((m) => (m.type === "cal" || m.type === "hello") && Array.isArray(m.factors));
  const calText = doc.querySelector("#cal-factors").textContent;
  const wantCal = `Factors: ${fm.factors.map((f) => f.toFixed(2)).join(", ")}`;
  if (calText !== wantCal) problems.push(`calibration shows "${calText}", expected "${wantCal}"`);
  const box = last("cal") && [...msgs].reverse().find((m) => m.type === "cal" && m.box);
  if (box) {
    const span = doc.querySelector(`[data-cal="${box.box}"]`);
    if (!span || span.textContent !== `${box.reading_ma.toFixed(1)} mA`) problems.push(`box ${box.box} reading not shown`);
  }
  const best = doc.querySelector("#fact-best").textContent;
  if (!best.startsWith(`${last("search").best},`)) problems.push(`best wiring shows "${best}"`);

  const scope = doc.querySelectorAll("header, main, footer, #cal-sheet");
  scope.forEach((root) => {
    if (BAD_TEXT.test(root.textContent)) problems.push(`"${root.textContent.match(BAD_TEXT)[0]}" in the text of <${root.tagName.toLowerCase()}${root.id ? "#" + root.id : ""}>`);
    root.querySelectorAll("*").forEach((el) => {
      for (const a of el.attributes) if (BAD_TEXT.test(a.value)) { problems.push(`${a.name}="${a.value.slice(0, 50)}" on <${el.tagName.toLowerCase()}> in ${el.closest("[id]")?.id || "page"}`); break; }
    });
  });

  return { ok: problems.length === 0, problems, counts, lines: got.length, expectedLines: plan.expected.length, bytes: plan.bytes };
}
