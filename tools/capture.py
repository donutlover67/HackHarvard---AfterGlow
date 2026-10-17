#!/usr/bin/env python3
"""Bounded serial capture for Claude Code: read the ESP32 for N seconds, write a log file, exit.

Never leaves the port open, so it can't hang an agent session the way a serial monitor does.
Needs pyserial: python3 -m pip install pyserial
"""
import argparse
import glob
import sys
import time

import serial


def guess_port():
    ports = sorted(glob.glob("/dev/cu.usbserial*") + glob.glob("/dev/cu.SLAB*")
                   + glob.glob("/dev/cu.wchusbserial*") + glob.glob("/dev/ttyUSB*"))
    return ports[0] if ports else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", default=None, help="serial port (default: first USB serial port found)")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--seconds", type=float, default=20.0)
    ap.add_argument("--until", default=None, help="stop early once a line contains this text")
    ap.add_argument("--send", default=None, help="command to send after opening, e.g. GRADE")
    ap.add_argument("--out", default="logs/serial.log")
    args = ap.parse_args()

    port = args.port or guess_port()
    if not port:
        print("No serial port found. Is the ESP32 plugged in?", file=sys.stderr)
        return 2

    lines = []
    deadline = time.monotonic() + args.seconds
    with serial.Serial(port, args.baud, timeout=0.2) as ser:
        if args.send:
            time.sleep(1.5)  # opening the port may reset the ESP32; give it time to boot
            ser.write((args.send + "\n").encode())
        while time.monotonic() < deadline:
            raw = ser.readline()
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace").rstrip()
            lines.append(line)
            if args.until and args.until in line:
                break

    with open(args.out, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"{len(lines)} lines from {port} written to {args.out}")
    errors = [l for l in lines if '"type":"error"' in l]
    if errors:
        print(f"{len(errors)} error line(s); first: {errors[0]}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
