# hub/hive_relay.py
"""
Headless hive sync: the station itself (no browser needed) sends its change log
to the hosted app's relay, which stores it in the owner's Drive "stations"
folder and returns the other stations' logs; those are applied locally.
Covers settings, hive, user, media, conversations and the agents' task queue.
Config (user kv "hive.relay") and passphrase live in the user scope: the system
scope redacts number runs, which corrupts URLs. Neither key is synced.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from typing import Any

from hub import local_store, station_sync

CFG_KEY = "hive.relay"
PASS_KEY = "hive.relay.passphrase"
EVERY_S = 120
_state: dict[str, Any] = {"running": False, "last_run": None, "last_ok": None, "last_error": None,
                          "pushed": 0, "applied": 0, "stations": 0}


def _get(scope: str, key: str) -> Any:
    r = local_store.kv_get(scope, key)
    return r.get("value") if r.get("found") else None


def config() -> dict[str, Any]:
    c = _get("user", CFG_KEY) or {}
    return {"url": c.get("url"), "folder_id": c.get("folder_id"), "enabled": bool(c.get("enabled")),
            "passphrase_set": bool(_get("user", PASS_KEY))}


def set_config(url: str, folder_id: str, enabled: bool, passphrase: str | None) -> dict[str, Any]:
    if not url.startswith("https://"):
        return {"ok": False, "error": "relay address must start with https://"}
    local_store.kv_set("user", CFG_KEY, {"url": url.rstrip("/"), "folder_id": folder_id, "enabled": enabled})
    if passphrase:
        local_store.kv_set("user", PASS_KEY, passphrase)
    return {"ok": True, **config()}


def run_once() -> dict[str, Any]:
    c = _get("user", CFG_KEY) or {}
    pw = _get("user", PASS_KEY)
    if not (c.get("url") and c.get("folder_id") and pw):
        return {"ok": False, "error": "relay not configured"}
    sid = station_sync.station_id()
    ch = station_sync.changes_since(0).get("changes", [])
    body = json.dumps({"stationId": sid, "folderId": c["folder_id"],
                       "payload": json.dumps({"station_id": sid, "changes": ch})}).encode()
    _state["last_run"] = time.time()
    try:
        req = urllib.request.Request(f"{c['url']}/api/public/hive/relay", data=body, method="POST",
                                     headers={"Content-Type": "application/json", "Authorization": f"Bearer {pw}",
                                              "User-Agent": "OferStation/1.0 (+hive-relay)"})
        with urllib.request.urlopen(req, timeout=90) as res:
            data = json.loads(res.read().decode())
    except urllib.error.HTTPError as e:  # type: ignore[attr-defined]
        msg = e.read().decode(errors="replace")[:300]
        _state.update(last_ok=False, last_error=f"HTTP {e.code}: {msg}")
        return {"ok": False, "error": _state["last_error"]}
    except Exception as e:  # noqa: BLE001
        _state.update(last_ok=False, last_error=str(e))
        return {"ok": False, "error": str(e)}
    if not data.get("ok"):
        _state.update(last_ok=False, last_error=data.get("error"))
        return {"ok": False, "error": data.get("error")}
    station_sync.log_sent(ch, "relay", "relay")
    applied = 0
    for f in data.get("files", []):
        try:
            j = json.loads(f["content"])
            r = station_sync.apply_changes(j.get("changes", []), origin=j.get("station_id", f["name"]), via="relay")
            applied += int(r.get("applied", 0))
            station_sync.upsert_peer(j.get("station_id", f["name"]), name="relay", url=None)
        except Exception as e:  # noqa: BLE001
            local_store.log_event("hive_relay", f"bad station file {f.get('name')}: {e}", "warn")
    _state.update(last_ok=True, last_error=None, pushed=len(ch), applied=applied, stations=len(data.get("files", [])))
    return {"ok": True, "pushed": len(ch), "applied": applied, "stations": len(data.get("files", []))}


def _loop() -> None:
    while True:
        if config()["enabled"]:
            try:
                run_once()
            except Exception as e:  # noqa: BLE001
                _state.update(last_ok=False, last_error=str(e))
        time.sleep(EVERY_S)


def start_background() -> None:
    if _state["running"]:
        return
    _state["running"] = True
    threading.Thread(target=_loop, daemon=True, name="hive-relay").start()


def status() -> dict[str, Any]:
    return {"ok": True, **config(), **_state}
