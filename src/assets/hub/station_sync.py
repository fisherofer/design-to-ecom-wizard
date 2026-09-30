# hub/station_sync.py
"""Hive multi-station sync.

Every station (PC, laptop, Linux server) runs its own VENV with its own full
local SQL copy. Changes to the kv store are appended to a change log with a
hybrid logical clock (HLC). Stations exchange only deltas:
  - direct peer HTTP (pull from /api/station-sync/changes)
  - Google Drive folder (delta JSON files written/read by the app)
  - MCP tools (sync_changes / sync_apply)
Conflict rule: last-writer-wins by (hlc, station_id) — deterministic on every
station. Deletes are tombstones so they propagate too. The 'temp' scope never
syncs. Secrets (ofer.secret.*, ofer.keys.*, mcp.token) never sync.
"""
from __future__ import annotations

import json
import socket
import threading
import time
import urllib.request
import uuid
from typing import Any

from hub import local_store

SYNC_SCOPES = ("system", "hive", "user", "media")
SECRET_PREFIXES = ("ofer.secret.", "ofer.keys.", "mcp.token", "telegram.token")
_lock = threading.Lock()
_last_hlc = 0

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS sync_changes (
        hlc INTEGER NOT NULL, station_id TEXT NOT NULL,
        scope TEXT NOT NULL, key TEXT NOT NULL,
        value TEXT, deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (scope, key))""",
    """CREATE TABLE IF NOT EXISTS sync_peers (
        station_id TEXT PRIMARY KEY, name TEXT, url TEXT,
        last_seen REAL, cursor INTEGER NOT NULL DEFAULT 0)""",
    "CREATE INDEX IF NOT EXISTS sync_changes_hlc ON sync_changes(hlc)",
]


def _init() -> None:
    conn = local_store.connect()
    try:
        for s in SCHEMA:
            conn.execute(s)
        conn.commit()
    finally:
        conn.close()


_init()


def station_id() -> str:
    got = local_store.kv_get("system", "station.id")
    sid = got.get("value") if got.get("ok") else None
    if not sid:
        sid = f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}"
        local_store.kv_set("system", "station.id", sid)
    return str(sid)


def _hlc(remote: int = 0) -> int:
    """Monotonic millisecond clock, advanced past any remote clock seen."""
    global _last_hlc
    with _lock:
        _last_hlc = max(_last_hlc + 1, int(time.time() * 1000), remote + 1)
        return _last_hlc


def _syncable(scope: str, key: str) -> bool:
    return scope in SYNC_SCOPES and not key.startswith(SECRET_PREFIXES) and key != "station.id"


def record(scope: str, key: str, value: Any) -> None:
    """Called by local_store.kv_set for every local write."""
    if not _syncable(scope, key):
        return
    conn = local_store.connect()
    try:
        conn.execute(
            "INSERT INTO sync_changes(hlc, station_id, scope, key, value, deleted) VALUES (?,?,?,?,?,?)"
            " ON CONFLICT(scope, key) DO UPDATE SET hlc=excluded.hlc, station_id=excluded.station_id,"
            " value=excluded.value, deleted=excluded.deleted",
            (_hlc(), station_id(), scope, key,
             None if value is None else json.dumps(value, ensure_ascii=False), int(value is None)))
        conn.commit()
    finally:
        conn.close()


def changes_since(cursor: int = 0, limit: int = 2000) -> dict[str, Any]:
    conn = local_store.connect()
    try:
        rows = conn.execute(
            "SELECT hlc, station_id, scope, key, value, deleted FROM sync_changes WHERE hlc > ?"
            " ORDER BY hlc LIMIT ?", (int(cursor), int(limit))).fetchall()
    finally:
        conn.close()
    items = [dict(r) for r in rows]
    return {"ok": True, "station_id": station_id(), "cursor": items[-1]["hlc"] if items else int(cursor),
            "changes": items, "more": len(items) >= limit}


def apply_changes(changes: list[dict[str, Any]], origin: str = "peer") -> dict[str, Any]:
    applied = skipped = 0
    conn = local_store.connect()
    try:
        for c in changes:
            scope, key = str(c.get("scope", "")), str(c.get("key", ""))
            if not _syncable(scope, key):
                skipped += 1
                continue
            hlc, sid = int(c.get("hlc", 0)), str(c.get("station_id", ""))
            _hlc(hlc)
            cur = conn.execute("SELECT hlc, station_id FROM sync_changes WHERE scope=? AND key=?",
                               (scope, key)).fetchone()
            if cur and (cur["hlc"], cur["station_id"]) >= (hlc, sid):
                skipped += 1  # local copy is newer — keep it
                continue
            deleted = int(bool(c.get("deleted")))
            conn.execute(
                "INSERT INTO sync_changes(hlc, station_id, scope, key, value, deleted) VALUES (?,?,?,?,?,?)"
                " ON CONFLICT(scope, key) DO UPDATE SET hlc=excluded.hlc, station_id=excluded.station_id,"
                " value=excluded.value, deleted=excluded.deleted",
                (hlc, sid, scope, key, c.get("value"), deleted))
            if deleted:
                conn.execute("DELETE FROM kv WHERE scope=? AND key=?", (scope, key))
            else:
                conn.execute(
                    "INSERT INTO kv(scope, key, value, updated_at) VALUES (?,?,?,?)"
                    " ON CONFLICT(scope, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                    (scope, key, c.get("value") or "null", hlc / 1000))
            applied += 1
        conn.commit()
    finally:
        conn.close()
    if applied:
        local_store.log_event("sync", f"applied {applied} changes from {origin}", details={"skipped": skipped})
    return {"ok": True, "applied": applied, "skipped": skipped}


def list_peers() -> dict[str, Any]:
    conn = local_store.connect()
    try:
        rows = conn.execute("SELECT * FROM sync_peers ORDER BY last_seen DESC").fetchall()
    finally:
        conn.close()
    return {"ok": True, "self": station_id(), "peers": [dict(r) for r in rows]}


def upsert_peer(sid: str, name: str | None = None, url: str | None = None, cursor: int | None = None) -> None:
    conn = local_store.connect()
    try:
        conn.execute(
            "INSERT INTO sync_peers(station_id, name, url, last_seen, cursor) VALUES (?,?,?,?,COALESCE(?,0))"
            " ON CONFLICT(station_id) DO UPDATE SET name=COALESCE(excluded.name,name),"
            " url=COALESCE(excluded.url,url), last_seen=excluded.last_seen,"
            " cursor=COALESCE(?, cursor)", (sid, name, url, time.time(), cursor, cursor))
        conn.commit()
    finally:
        conn.close()


def pull_from_peer(url: str, token: str, cursor: int = 0) -> dict[str, Any]:
    """Pull deltas from another station over HTTP (token = that station's sync token)."""
    base = url.rstrip("/")
    total = 0
    for _ in range(50):
        req = urllib.request.Request(f"{base}/api/station-sync/changes?cursor={cursor}",
                                     headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
        res = apply_changes(data.get("changes", []), origin=data.get("station_id", base))
        total += res["applied"]
        cursor = int(data.get("cursor", cursor))
        upsert_peer(str(data.get("station_id", base)), url=base, cursor=cursor)
        if not data.get("more"):
            break
    return {"ok": True, "applied": total, "cursor": cursor}


def token() -> str:
    got = local_store.kv_get("system", "mcp.token")
    tok = got.get("value") if got.get("ok") else None
    if not tok:
        tok = uuid.uuid4().hex + uuid.uuid4().hex
        local_store.kv_set("system", "mcp.token", tok)
    return str(tok)
