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

SYNC_SCOPES = ("system", "hive", "user", "media", "chat", "fleet")
ROW_SCOPES = ("chat", "fleet")  # rows of messages / fleet_tasks, not kv
SECRET_PREFIXES = ("ofer.secret.", "ofer.keys.", "mcp.token", "telegram.token", "hive.relay")
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
    """CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, direction TEXT NOT NULL,
        peer TEXT, via TEXT, scope TEXT, key TEXT, hlc INTEGER, outcome TEXT)""",
]
LOG_KEEP = 5000


def _init() -> None:
    conn = local_store.connect()
    try:
        for s in SCHEMA:
            conn.execute(s)
        for stmt in ("ALTER TABLE sync_peers ADD COLUMN folder TEXT",
                     "ALTER TABLE sync_peers ADD COLUMN via TEXT",
                     "ALTER TABLE messages ADD COLUMN sync_uid TEXT"):
            try:
                conn.execute(stmt)
            except Exception:
                pass  # column already exists
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS messages_sync_uid ON messages(sync_uid)")
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


def apply_changes(changes: list[dict[str, Any]], origin: str = "peer", via: str = "peer") -> dict[str, Any]:
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
                _log(conn, "in", origin, via, scope, key, hlc, "skipped:older")
                continue
            deleted = int(bool(c.get("deleted")))
            outcome = "applied"
            conn.execute(
                "INSERT INTO sync_changes(hlc, station_id, scope, key, value, deleted) VALUES (?,?,?,?,?,?)"
                " ON CONFLICT(scope, key) DO UPDATE SET hlc=excluded.hlc, station_id=excluded.station_id,"
                " value=excluded.value, deleted=excluded.deleted",
                (hlc, sid, scope, key, c.get("value"), deleted))
            if scope in ROW_SCOPES:
                outcome = _apply_row(conn, scope, key, c.get("value"), deleted)
            elif deleted:
                conn.execute("DELETE FROM kv WHERE scope=? AND key=?", (scope, key))
            else:
                conn.execute(
                    "INSERT INTO kv(scope, key, value, updated_at) VALUES (?,?,?,?)"
                    " ON CONFLICT(scope, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                    (scope, key, c.get("value") or "null", hlc / 1000))
            applied += 1
            _log(conn, "in", origin, via, scope, key, hlc, outcome)
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


def upsert_peer(sid: str, name: str | None = None, url: str | None = None, cursor: int | None = None,
                folder: str | None = None, via: str | None = None) -> None:
    conn = local_store.connect()
    try:
        conn.execute(
            "INSERT INTO sync_peers(station_id, name, url, last_seen, cursor, folder, via) VALUES (?,?,?,?,COALESCE(?,0),?,?)"
            " ON CONFLICT(station_id) DO UPDATE SET name=COALESCE(excluded.name,name),"
            " url=COALESCE(excluded.url,url), last_seen=excluded.last_seen,"
            " cursor=COALESCE(?, cursor), folder=COALESCE(excluded.folder,folder), via=COALESCE(excluded.via,via)",
            (sid, name, url, time.time(), cursor, folder, via, cursor))
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
        res = apply_changes(data.get("changes", []), origin=data.get("station_id", base), via="http")
        total += res["applied"]
        cursor = int(data.get("cursor", cursor))
        upsert_peer(str(data.get("station_id", base)), url=base, cursor=cursor, via="http")
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


# ------------------------------------------------------------ row-level sync
def _log(conn, direction: str, peer: str | None, via: str | None, scope: str, key: str,
         hlc: int, outcome: str) -> None:
    conn.execute("INSERT INTO sync_log(ts, direction, peer, via, scope, key, hlc, outcome) VALUES (?,?,?,?,?,?,?,?)",
                 (time.time(), direction, peer, via, scope, key, hlc, outcome))


def _trim_log(conn) -> None:
    conn.execute("DELETE FROM sync_log WHERE id <= (SELECT MAX(id) FROM sync_log) - ?", (LOG_KEEP,))


def _apply_row(conn, scope: str, key: str, raw: Any, deleted: int) -> str:
    """Write a synced message / fleet task into its real table (idempotent by uid)."""
    if deleted:
        if scope == "chat":
            conn.execute("DELETE FROM messages WHERE sync_uid=?", (key,))
        else:
            conn.execute("DELETE FROM fleet_tasks WHERE sync_uid=?", (key,))
        return "deleted"
    try:
        v = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except json.JSONDecodeError:
        return "error:bad-json"
    if not isinstance(v, dict):
        return "error:bad-row"
    if scope == "chat":
        cid = str(v.get("conversation_id") or "")
        if not cid or not v.get("content"):
            return "error:empty-message"
        ts = float(v.get("created_at") or time.time())
        conn.execute(
            "INSERT INTO conversations(id, scope, channel, title, created_at, updated_at) VALUES (?,?,?,?,?,?)"
            " ON CONFLICT(id) DO UPDATE SET updated_at=MAX(conversations.updated_at, excluded.updated_at)",
            (cid, v.get("scope") or "user", v.get("channel") or "app", str(v.get("content"))[:60], ts, ts))
        conn.execute(
            "INSERT INTO messages(conversation_id, scope, role, content, model, runtime, latency_ms, created_at, sync_uid)"
            " VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(sync_uid) DO NOTHING",
            (cid, v.get("scope") or "user", v.get("role") or "user", v["content"], v.get("model"),
             v.get("runtime"), v.get("latency_ms"), ts, key))
        return "applied"
    # fleet task
    if not v.get("title"):
        return "error:empty-task"
    ensure_fleet_column(conn)
    spec = v.get("spec")
    res = v.get("result")
    conn.execute(
        "INSERT INTO fleet_tasks(title, role, spec, status, worker, result, error, priority, created_at, updated_at, sync_uid)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sync_uid) DO UPDATE SET status=excluded.status,"
        " worker=excluded.worker, result=excluded.result, error=excluded.error, updated_at=excluded.updated_at",
        (v["title"], v.get("role") or "general", spec if isinstance(spec, str) else json.dumps(spec or {}),
         v.get("status") or "queued", v.get("worker"),
         res if (res is None or isinstance(res, str)) else json.dumps(res), v.get("error"),
         int(v.get("priority") or 5), float(v.get("created_at") or time.time()),
         float(v.get("updated_at") or time.time()), key))
    return "applied"


def ensure_fleet_column(conn) -> None:
    try:
        conn.execute("ALTER TABLE fleet_tasks ADD COLUMN sync_uid TEXT")
    except Exception:
        pass
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS fleet_tasks_sync_uid ON fleet_tasks(sync_uid)")


def record_message(row_id: int) -> None:
    """Called after local_store.add_message — assigns a global uid and logs the change."""
    conn = local_store.connect()
    try:
        r = conn.execute("SELECT * FROM messages WHERE id=?", (row_id,)).fetchone()
        if not r:
            return
        d = dict(r)
        uid = d.get("sync_uid") or f"{station_id()}:m{row_id}"
        conn.execute("UPDATE messages SET sync_uid=? WHERE id=?", (uid, row_id))
        c = conn.execute("SELECT channel FROM conversations WHERE id=?", (d["conversation_id"],)).fetchone()
        conn.commit()
    finally:
        conn.close()
    d.pop("id", None); d.pop("sync_uid", None)
    d["channel"] = c["channel"] if c else "app"
    record("chat", uid, d)


def record_task(task_id: int) -> None:
    """Called after every fleet task mutation so the queue is the same on every station."""
    conn = local_store.connect()
    try:
        ensure_fleet_column(conn)
        r = conn.execute("SELECT * FROM fleet_tasks WHERE id=?", (task_id,)).fetchone()
        if not r:
            return
        d = dict(r)
        uid = d.get("sync_uid") or f"{station_id()}:t{task_id}"
        conn.execute("UPDATE fleet_tasks SET sync_uid=? WHERE id=?", (uid, task_id))
        conn.commit()
    finally:
        conn.close()
    d.pop("id", None); d.pop("sync_uid", None)
    record("fleet", uid, d)


def log_sent(changes: list[dict[str, Any]], peer: str, via: str) -> None:
    conn = local_store.connect()
    try:
        for c in changes:
            _log(conn, "out", peer, via, str(c.get("scope")), str(c.get("key")), int(c.get("hlc", 0)), "sent")
        _trim_log(conn)
        conn.commit()
    finally:
        conn.close()


def read_log(limit: int = 300, direction: str | None = None) -> dict[str, Any]:
    conn = local_store.connect()
    try:
        q, args = "SELECT * FROM sync_log", []
        if direction in ("in", "out"):
            q += " WHERE direction=?"; args.append(direction)
        q += " ORDER BY id DESC LIMIT ?"; args.append(int(limit))
        rows = [dict(r) for r in conn.execute(q, args).fetchall()]
        last_in = conn.execute("SELECT MAX(ts) FROM sync_log WHERE direction='in'").fetchone()[0]
        last_out = conn.execute("SELECT MAX(ts) FROM sync_log WHERE direction='out'").fetchone()[0]
        errors = conn.execute("SELECT COUNT(*) FROM sync_log WHERE outcome LIKE 'error:%'").fetchone()[0]
    finally:
        conn.close()
    return {"ok": True, "entries": rows, "last_in": last_in, "last_out": last_out, "errors": errors}


def set_own_folder(folder_id: str, folder_name: str | None = None) -> None:
    local_store.kv_set("system", "station.drive_folder", {"id": folder_id, "name": folder_name})
