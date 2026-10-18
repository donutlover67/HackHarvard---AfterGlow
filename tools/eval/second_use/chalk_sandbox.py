"""The agent's tools, run in a Chalk Compute sandbox.

One sandbox per run: at start it receives the physics (tools/eval/model.py, su.py) and the passports it may serve;
each tool call the model makes (get_passport, check_use) then executes inside it and returns JSON. The model reasons
through Chalk's Model Gateway; the measured data and the physics run in Chalk Compute.

Needs the chalkcompute package and a Chalk login (`chalk login`). Run the agent with that environment's Python:
    ~/.cache/afterglow-chalk/bin/python tools/eval/second_use/agent.py --tools-in chalk ...
"""
import base64
import json
import os
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = "/tmp/afterglow"

# what runs inside the sandbox for each call: python tool.py <name> <json args>
TOOL_PY = r'''
import json, sys
sys.path.insert(0, "/tmp/afterglow")
import su
name, args = sys.argv[1], json.loads(sys.argv[2])
with open("/tmp/afterglow/passports.json") as f:
    passports = json.load(f)
p = passports.get(args.get("passport_id"))
if p is None:
    out = {"error": "unknown passport %r" % args.get("passport_id")}
elif name == "get_passport":
    out = p
elif name == "check_use":
    out = su.check_use(p["isc_ma"], p["voc_v"], args["sun_hours"], args.get("device_id"), args.get("hours_per_day"))
else:
    out = {"error": "unknown tool"}
print(json.dumps(out))
'''


def _read(path):
    with open(path) as f:
        return f.read()


class ChalkTools:
    """Start one sandbox, load the code and passports, then run tool calls in it."""

    def __init__(self, passports, lifetime="1800s"):
        from chalkcompute import Image, Sandbox   # only this path needs the package
        t = time.time()
        self.sb = Sandbox(image=Image.debian_slim("3.12"), lifetime=lifetime).run()
        self.lock = threading.Lock()
        files = {
            "model.py": _read(os.path.join(HERE, "..", "model.py")),
            # su.py imports tools/eval/model.py from its parent folder; in the sandbox both sit side by side
            "su.py": _read(os.path.join(HERE, "su.py")).replace('sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))', "sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))"),
            "tool.py": TOOL_PY,
            "passports.json": json.dumps(passports),
        }
        self._put(files)
        self.started_s = round(time.time() - t, 2)
        self.id = getattr(self.sb, "id", None)   # Chalk's own sandbox ID: shown on the page as proof of where the tools ran

    def _put(self, files):
        blob = base64.b64encode(json.dumps(files).encode()).decode()
        code = ("import base64, json, os\n"
                f"os.makedirs({WORK!r}, exist_ok=True)\n"
                f"files = json.loads(base64.b64decode({blob!r}))\n"
                f"[open(os.path.join({WORK!r}, k), 'w').write(v) for k, v in files.items()]\n"
                "print('ok')")
        r = self.sb.exec("python", "-c", code)
        if "ok" not in (r.stdout_text or ""):
            raise RuntimeError(f"sandbox setup failed: {getattr(r, 'stderr_text', '')[:300]}")

    def add_passports(self, passports):
        """Merge more passports into the sandbox's store (the live server adds the one being asked about)."""
        code = ("import json\n"
                f"p = '{WORK}/passports.json'\n"
                "d = json.load(open(p))\n"
                f"d.update(json.loads({json.dumps(json.dumps(passports))}))\n"
                "json.dump(d, open(p, 'w'))\nprint('ok')")
        with self.lock:
            r = self.sb.exec("python", "-c", code)
        if "ok" not in (r.stdout_text or ""):
            raise RuntimeError("sandbox passport update failed")

    def call(self, name, args):
        with self.lock:
            r = self.sb.exec("python", f"{WORK}/tool.py", name, json.dumps(args))
        try:
            return json.loads(r.stdout_text)
        except (TypeError, ValueError):
            return {"error": f"sandbox tool failed: {(getattr(r, 'stderr_text', '') or '')[:200]}"}

    def close(self):
        try:
            self.sb.terminate()
        except Exception:  # noqa: BLE001
            pass
