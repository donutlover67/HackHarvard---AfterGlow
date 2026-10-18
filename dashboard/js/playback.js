// Play a recorded bench session from a file, so a real run can be shown on the real dashboard without the board.
// The file's lines go through the stand-in port from js/replay.js and SerialLink's own read loop, so they are
// decoded, split, parsed and dispatched exactly like bytes from the board on USB. Nothing here renders anything.
//
// Accepted files:
//  - a capture from tools/capture.py: one serial line per line, boot noise and partial lines included;
//  - the dashboard's "Download all messages (JSONL)": the received lines as they came, one per line;
//  - the dashboard's "Export passports (JSON)" run file: its grade entries, sweeps, search and last proof are the
//    messages as received, so they are sent again as those messages (a run file holds no live power).
// The dashboard's download keeps every line since the page loaded, so it can start with the mock bench, which runs
// until a board is connected. Lines from a `hello` with fw "mock" up to the next `hello` from real firmware are
// simulated and are left out, so a replay never shows mock numbers as a recorded run.
// Timing comes from the messages' `t` (ms since the board booted). Lines without `t` follow the previous line at once;
// when `t` goes backwards (a reset, or files joined together) the next line follows at once too.

import { SerialLink } from "./serial.js";
import { replayPort } from "./replay.js";

const TYPES = new Set(["hello", "live", "grade", "sweep", "search", "proof", "cal", "error", "log"]);
const MAX_GAP_MS = 5000;   // a longer silence (captures joined end to end) is shortened to this
const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

function parse(text) { try { return JSON.parse(text); } catch (_) { return undefined; } }

// A run file from buildRun() in app.js, back into the messages it was built from.
function runToLines(run) {
  const out = [];
  if (Array.isArray(run.factors)) out.push({ type: "cal", factors: run.factors });
  if (Array.isArray(run.panels) && run.panels.length) {
    out.push(typeof run.predicted === "string" ? { type: "grade", panels: run.panels, predicted: run.predicted } : { type: "grade", panels: run.panels });
  }
  const sweeps = isObj(run.sweeps) ? Object.values(run.sweeps).filter(isObj) : [];
  sweeps.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).forEach((s) => out.push({ ...s, type: "sweep" }));
  if (isObj(run.search)) out.push({ ...run.search, type: "search" });
  if (isObj(run.proof)) out.push({ ...run.proof, type: "proof" });
  return out.map((m) => JSON.stringify(m));
}

// File text -> { kind, lines, messages, chunks, timed, seconds }, or an Error whose message is for the person.
export function readRecording(text, name) {
  if (!text || !text.trim()) throw new Error(`${name} is empty.`);
  const whole = /^\s*[[{]/.test(text) ? parse(text) : undefined;
  let kind = "lines";
  let lines;
  if (isObj(whole) && whole.type == null && ("run_id" in whole || "passports" in whole || "sweeps" in whole)) {
    kind = "run"; lines = runToLines(whole);
  } else if (Array.isArray(whole)) {
    lines = whole.map((m) => JSON.stringify(m));        // a JSON array of messages
  } else if (isObj(whole)) {
    lines = [JSON.stringify(whole)];                    // one message, perhaps pretty-printed
  } else {
    lines = text.split("\n");
    if (lines[lines.length - 1].trim() === "") lines.pop();   // the file's final newline
  }

  const chunks = [];
  const enc = new TextEncoder();
  let messages = 0; let lastT = null; let timed = false; let pauseMs = 0; let mock = false; let skipped = 0;
  for (const line of lines) {
    const m = parse(line);
    if (isObj(m) && m.type === "hello") mock = m.fw === "mock";
    if (mock) { skipped++; continue; }
    if (isObj(m) && TYPES.has(m.type)) messages++;
    if (isObj(m) && typeof m.t === "number" && Number.isFinite(m.t)) {
      if (lastT != null && m.t > lastT) { const gap = Math.min(m.t - lastT, MAX_GAP_MS); chunks.push(gap); pauseMs += gap; }
      lastT = m.t; timed = true;
    }
    chunks.push(enc.encode(line.replace(/\r$/, "") + "\n"));
  }
  if (!messages) {
    if (skipped) throw new Error(`${name} holds only the mock bench (simulated panels), which is not played as a recording.`);
    throw new Error(kind === "run"
      ? `${name} is a run file with no grades, sweeps, search or proof in it.`
      : `No bench messages in ${name}: ${lines.length} ${lines.length === 1 ? "line" : "lines"}, none of them a message from protocol/PROTOCOL.md. `
        + "Choose a capture from tools/capture.py, the dashboard's message download (JSONL) or an exported run (JSON).");
  }
  return { kind, lines: lines.length, messages, skipped, chunks, timed, seconds: pauseMs / 1000 };
}

// Plays one recording at a time through a SerialLink. `speed` is read at every pause, so it can change mid-playback;
// 0 means as fast as possible.
export class RecordingPlayer {
  constructor(onLine) { this.onLine = onLine; this.link = null; this.speed = 4; }

  get playing() { return !!this.link; }

  // onEnd("done") when the file has been read to the end; onEnd("lost", detail) if the read loop gave up.
  // Not called after stop().
  async play(rec, onEnd) {
    await this.stop();
    const port = replayPort([rec.chunks], { speed: () => this.speed, baud: !rec.timed });
    const link = new SerialLink(this.onLine, (status, detail) => {
      if (status === "lost" && this.link === link) { this.link = null; onEnd("lost", detail); }
    });
    this.link = link;
    await link.connect(port);
    port.finished.then(() => {
      if (this.link !== link) return;
      this.link = null;
      link.disconnect();
      onEnd("done");
    });
  }

  async stop() {
    const link = this.link;
    this.link = null;
    if (link) await link.disconnect();
  }
}
