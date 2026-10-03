"""
OFERTRADINGBOT — one-click start.

Double-click START.bat (Windows), start.command (macOS) or run ./start.sh (Linux).
Works from wherever this folder sits (USB stick, other PC, Linux server):
  1. builds/repairs the local venv next to this file (first run downloads packages)
  2. starts the local server on 127.0.0.1:8050
  3. waits until it answers, then opens the app in your default browser
Only Python 3.10+ is needed. Everything else lives inside this folder.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
PORT = int(os.environ.get("API_PORT", "8050"))
APP_URL = os.environ.get("OFER_APP_URL", "https://id-preview--07243949-5bb1-4142-9dfe-fdfb72c02bb6.lovable.app")
HEALTH = f"http://127.0.0.1:{PORT}/api/health"


def up() -> bool:
    try:
        with urllib.request.urlopen(HEALTH, timeout=2) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001 - "not up yet" is the expected answer here
        return False


def main() -> int:
    if sys.version_info < (3, 10):
        print("Python 3.10 or newer is required."); return 1
    if up():
        print("Server already running."); webbrowser.open(APP_URL); return 0
    from hub import venv_manager
    print("[1/3] Preparing local environment (first run can take several minutes)...")
    res = venv_manager.heal()
    if not res.get("ok"):
        print("Environment setup failed:", res); return 1
    py = venv_manager.get_python_executable()
    print("[2/3] Starting local server on port", PORT)
    env = {**os.environ, "API_PORT": str(PORT), "PYTHONPATH": f"{ROOT}{os.pathsep}{ROOT / 'backend'}"}
    log = open(ROOT / "server.log", "a", encoding="utf-8")
    proc = subprocess.Popen([str(py), str(ROOT / "backend" / "main.py")], cwd=str(ROOT), env=env, stdout=log, stderr=subprocess.STDOUT)
    for _ in range(60):
        if up():
            break
        if proc.poll() is not None:
            print("Server stopped while starting — see server.log:"); print((ROOT / "server.log").read_text(encoding="utf-8")[-3000:]); return 1
        time.sleep(1)
    else:
        print("Server did not answer within 60 s — see server.log"); return 1
    print("[3/3] Opening", APP_URL)
    webbrowser.open(APP_URL)
    print("Running. Close this window to stop the server.")
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
