"""Station profile — who runs this station, where, and how well it is protected.

Stored in user scope as `station.profile.<station_id>` so it reaches the owner's
other stations through the normal change log (user scope is never redacted, so
the IP survives). Every value is measured here; unknown values stay None.
"""
from __future__ import annotations

import getpass
import json
import os
import platform
import socket
import sys
import time
import urllib.request
from typing import Any

from hub import local_store, station_sync

PREFIX = "station.profile."


def _public_geo() -> dict[str, Any]:
    try:
        req = urllib.request.Request("https://ipapi.co/json/", headers={"User-Agent": "OferStation/1.0"})
        with urllib.request.urlopen(req, timeout=6) as r:
            j = json.loads(r.read().decode())
        return {"ip": j.get("ip"), "country": j.get("country_name"), "country_code": j.get("country_code"),
                "city": j.get("city"), "isp": j.get("org"), "geo_error": None}
    except Exception as e:  # report, never invent
        return {"ip": None, "country": None, "country_code": None, "city": None, "isp": None,
                "geo_error": f"{type(e).__name__}: {e}"}


def _security() -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    def add(name: str, ok: bool | None, detail: str) -> None:
        checks.append({"name": name, "ok": ok, "detail": detail})

    host = os.environ.get("OFER_HOST", "127.0.0.1")
    add("Server bound to this computer only", host in ("127.0.0.1", "localhost"), f"host={host}")
    add("Sync token set", bool(station_sync.token()), "direct sync needs a token")
    relay = local_store.kv_get("user", "hive.relay.passphrase")
    add("Relay passphrase set", bool(relay.get("ok") and relay.get("value")), "needed for headless relay")
    tg = local_store.kv_get("user", "telegram.allowed_chat_ids")
    tg_ids = tg.get("value") if tg.get("ok") else None
    add("Telegram restricted to allowed chats", bool(tg_ids) if tg_ids is not None else None,
        "allowlist present" if tg_ids else "no allowlist saved")
    add("Running inside a virtual environment", sys.prefix != getattr(sys, "base_prefix", sys.prefix), sys.prefix)
    add("Not running as administrator/root",
        (os.geteuid() != 0) if hasattr(os, "geteuid") else None, "root check unavailable on this OS" if not hasattr(os, "geteuid") else "")
    known = [c for c in checks if c["ok"] is not None]
    score = round(100 * sum(1 for c in known if c["ok"]) / len(known)) if known else None
    level = None if score is None else "high" if score >= 85 else "medium" if score >= 60 else "low"
    return {"score": score, "level": level, "checks": checks}


def build() -> dict[str, Any]:
    try:
        user = getpass.getuser()
    except Exception:
        user = None
    return {
        "station_id": station_sync.station_id(),
        "user": user,
        "hostname": socket.gethostname(),
        "os": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
        **_public_geo(),
        "security": _security(),
        "updated_at": time.time(),
    }


def refresh() -> dict[str, Any]:
    prof = build()
    local_store.kv_set("user", PREFIX + prof["station_id"], prof)
    return {"ok": True, "profile": prof}


def all_profiles() -> dict[str, Any]:
    items = local_store.kv_all("user").get("items", {})
    return {"ok": True, "self": station_sync.station_id(),
            "profiles": [v for k, v in items.items() if k.startswith(PREFIX)]}
