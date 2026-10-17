// Web Serial link to the ESP32: 115200 baud, newline-delimited JSON in, commands out.

export class SerialLink {
  constructor(onLine, onStatus) {
    this.onLine = onLine;
    this.onStatus = onStatus;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.closing = false;
  }

  static supported() { return typeof navigator !== "undefined" && "serial" in navigator; }

  describe() {
    if (!this.port) return "";
    const info = this.port.getInfo ? this.port.getInfo() : {};
    const hex = (n) => (n == null ? "?" : n.toString(16).padStart(4, "0"));
    return info.usbVendorId != null ? `USB ${hex(info.usbVendorId)}:${hex(info.usbProductId)}` : "serial port";
  }

  // `port` is only passed by the replay (js/replay.js); the dashboard asks the browser for one.
  async connect(port) {
    this.port = port || await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.closing = false;
    this.writer = this.port.writable.getWriter();
    this.onStatus("connected", this.describe());
    this.readLoop();
    this.port.addEventListener("disconnect", () => this.handleLost());
  }

  async readLoop() {
    while (this.port && this.port.readable && !this.closing) {
      // A fresh decoder and buffer per stream: after a read error the partial line is corrupt anyway.
      const decoder = new TextDecoder();
      let buf = "";
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).replace(/\r$/, "");
            buf = buf.slice(nl + 1);
            if (line.trim()) this.deliver(line);
          }
          if (buf.length > 20000) buf = buf.slice(-5000);   // a runaway partial line
        }
      } catch (err) {
        // Framing, parity, break and overrun errors are non-fatal in Web Serial: the stream errors and
        // port.readable is replaced with a new one, so keep reading. Only a missing readable means the port is gone.
        if (this.closing) break;
        if (!this.port || !this.port.readable) { this.handleLost(err); return; }
      } finally {
        try { reader.releaseLock(); } catch (_) { /* already released */ }
        if (this.reader === reader) this.reader = null;
      }
    }
  }

  // A rendering bug on one line must not stop the read loop or be reported as a lost link.
  deliver(line) {
    try { this.onLine(line); } catch (err) { console.error("dashboard failed on a serial line:", err, line); }
  }

  async send(line) {
    if (!this.writer) throw new Error("not connected");
    await this.writer.write(new TextEncoder().encode(line + "\n"));
  }

  async disconnect() {
    this.closing = true;
    try { if (this.reader) await this.reader.cancel(); } catch (_) { /* already closed */ }
    try { if (this.writer) { this.writer.releaseLock(); this.writer = null; } } catch (_) { /* ignore */ }
    try { if (this.port) await this.port.close(); } catch (_) { /* ignore */ }
    this.port = null;
    this.onStatus("disconnected", "");
  }

  handleLost(err) {
    if (!this.port) return;             // the disconnect event and the read loop can both report it
    const msg = err && err.message ? err.message : "the port went away";
    const port = this.port; const writer = this.writer;
    this.port = null; this.writer = null; this.reader = null;
    // Close what is left so Connect can open the port again ("port is already open" otherwise).
    try { if (writer) writer.releaseLock(); } catch (_) { /* ignore */ }
    try { Promise.resolve(port.close()).catch(() => {}); } catch (_) { /* ignore */ }
    this.onStatus("lost", msg);
  }
}
