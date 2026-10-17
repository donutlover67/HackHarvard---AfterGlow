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

  async connect() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.closing = false;
    this.writer = this.port.writable.getWriter();
    this.onStatus("connected", this.describe());
    this.readLoop();
    this.port.addEventListener("disconnect", () => this.handleLost());
  }

  async readLoop() {
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (this.port && this.port.readable && !this.closing) {
        this.reader = this.port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, nl).replace(/\r$/, "");
              buf = buf.slice(nl + 1);
              if (line.trim()) this.onLine(line);
            }
            if (buf.length > 20000) buf = buf.slice(-5000);   // a runaway partial line
          }
        } finally {
          this.reader.releaseLock();
          this.reader = null;
        }
      }
    } catch (err) {
      if (!this.closing) this.handleLost(err);
    }
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
    const msg = err && err.message ? err.message : "the port went away";
    this.port = null; this.writer = null; this.reader = null;
    this.onStatus("lost", msg);
  }
}
