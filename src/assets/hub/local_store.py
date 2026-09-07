# -*- coding: utf-8 -*-
"""
OFERTRADINGBOT - Local Store (VENV SQLite)

Single local database for EVERYTHING the system remembers, with a hard
separation between two scopes:

  scope = "user"    -> personal data: chats, prompts, preferences, journal notes.
                       Never leaves the machine, never sent to a cloud model
                       unless the user explicitly allows it per-request.
  scope = "system"  -> operational data: agent runs, code-upgrade proposals,
                       telemetry, treasury ledger. Redacted of personal
                       identifiers before it is written.

Privacy rules implemented here (GDPR-style, enforced in code, not in docs):
  * consent flags per purpose, stored locally (privacy_settings)
  * retention windows per table with a purge routine
  * right to export  -> export_user_data()
  * right to erasure -> erase_user_data()
  * automatic redaction of emails / phones / card-like numbers / API keys
    on anything written with scope="system"
"""

from __future__ import annotations

import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Any, Iterable

DB_NAME = "ofer_local_store.db"

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_PHONE = re.compile(r"(?<!\d)(?:\+?\d[\d\-\s()]{7,}\d)(?!\d)")
_CARD = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
_SECRET = re.compile(r"\b(sk-[A-Za-z0-9]{8,}|PK[A-Z0-9]{10,}|AIza[0-9A-Za-z_\-]{10,}|[A-Za-z0-9_\-]{32,})\b")


def db_path() -> Path:
    d = Path(__file__).resolve().parent.parent / "user_data"
    d.mkdir(parents=True, exist_ok=True)
    return d / DB_NAME


def redact(text: str) -> str:
    """Strip personal identifiers and secret-shaped tokens from system rows."""
    if not text:
        return text
    out = _EMAIL.sub("[email]", text)
    out = _CARD.sub("[card]", out)
    out = _PHONE.sub("[phone]", out)
    out = _SECRET.sub("[secret]", out)
    return out


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


SCHEMA = [
    """CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL DEFAULT 'user',
        channel TEXT NOT NULL DEFAULT 'app',
        external_id TEXT,
        title TEXT,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'user',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT,
        runtime TEXT,
        latency_ms INTEGER,
        created_at REAL NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)",
    """CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL DEFAULT 'system',
        agent TEXT NOT NULL,
        task TEXT,
        output TEXT,
        model TEXT,
        runtime TEXT,
        ok INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        duration_ms INTEGER,
        created_at REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS system_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL DEFAULT 'system',
        kind TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        details TEXT,
        created_at REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS kv (
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at REAL NOT NULL,
        PRIMARY KEY (scope, key)
    )""",
    """CREATE TABLE IF NOT EXISTS treasury_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        amount REAL NOT NULL,
        note TEXT,
        evidence_url TEXT,
        created_at REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS privacy_settings (
        purpose TEXT PRIMARY KEY,
        granted INTEGER NOT NULL DEFAULT 0,
        retention_days INTEGER NOT NULL DEFAULT 365,
        updated_at REAL NOT NULL
    )""",
]

DEFAULT_PURPOSES = [
    ("store_conversations", 1, 365),
    ("share_with_cloud_models", 0, 0),
    ("telegram_bridge", 0, 90),
    ("telemetry", 1, 90),
]


def init_db() -> None:
    conn = connect()
    try:
        for stmt in SCHEMA:
            conn.execute(stmt)
        now = time.time()
        for purpose, granted, days in DEFAULT_PURPOSES:
            conn.execute(
                "INSERT OR IGNORE INTO privacy_settings(purpose, granted, retention_days, updated_at)"
                " VALUES (?,?,?,?)",
                (purpose, granted, days, now),
            )
        conn.commit()
    finally:
        conn.close()


init_db()


# --------------------------------------------------------------------------
# privacy
# --------------------------------------------------------------------------
def get_privacy() -> dict[str, Any]:
    conn = connect()
    try:
        rows = conn.execute("SELECT * FROM privacy_settings ORDER BY purpose").fetchall()
        return {"ok": True, "db": str(db_path()), "settings": [dict(r) for r in rows]}
    finally:
        conn.close()


def set_privacy(purpose: str, granted: bool | None = None, retention_days: int | None = None) -> dict[str, Any]:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM privacy_settings WHERE purpose=?", (purpose,)).fetchone()
        if row is None:
            return {"ok": False, "error": f"unknown purpose '{purpose}'"}
        g = int(granted) if granted is not None else row["granted"]
        r = int(retention_days) if retention_days is not None else row["retention_days"]
        conn.execute(
            "UPDATE privacy_settings SET granted=?, retention_days=?, updated_at=? WHERE purpose=?",
            (g, r, time.time(), purpose),
        )
        conn.commit()
        return {"ok": True, "purpose": purpose, "granted": bool(g), "retention_days": r}
    finally:
        conn.close()


def consent(purpose: str) -> bool:
    conn = connect()
    try:
        row = conn.execute("SELECT granted FROM privacy_settings WHERE purpose=?", (purpose,)).fetchone()
        return bool(row and row["granted"])
    finally:
        conn.close()


def purge_expired() -> dict[str, Any]:
    """Delete rows older than the retention window of their purpose."""
    conn = connect()
    deleted: dict[str, int] = {}
    try:
        settings = {r["purpose"]: r for r in conn.execute("SELECT * FROM privacy_settings").fetchall()}
        conv_days = settings.get("store_conversations", {"retention_days": 365})["retention_days"]
        tel_days = settings.get("telemetry", {"retention_days": 90})["retention_days"]
        now = time.time()
        if conv_days > 0:
            cut = now - conv_days * 86400
            cur = conn.execute("DELETE FROM messages WHERE created_at < ?", (cut,))
            deleted["messages"] = cur.rowcount
            cur = conn.execute(
                "DELETE FROM conversations WHERE id NOT IN (SELECT DISTINCT conversation_id FROM messages)"
            )
            deleted["conversations"] = cur.rowcount
        if tel_days > 0:
            cut = now - tel_days * 86400
            deleted["system_events"] = conn.execute(
                "DELETE FROM system_events WHERE created_at < ?", (cut,)
            ).rowcount
            deleted["agent_runs"] = conn.execute(
                "DELETE FROM agent_runs WHERE created_at < ?", (cut,)
            ).rowcount
        conn.commit()
        return {"ok": True, "deleted": deleted}
    finally:
        conn.close()


# --------------------------------------------------------------------------
# conversations
# --------------------------------------------------------------------------
def upsert_conversation(conv_id: str, channel: str = "app", title: str | None = None,
                        external_id: str | None = None, scope: str = "user") -> None:
    conn = connect()
    try:
        now = time.time()
        conn.execute(
            """INSERT INTO conversations(id, scope, channel, external_id, title, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 updated_at=excluded.updated_at,
                 title=COALESCE(excluded.title, conversations.title)""",
            (conv_id, scope, channel, external_id, title, now, now),
        )
        conn.commit()
    finally:
        conn.close()


def add_message(conv_id: str, role: str, content: str, scope: str = "user",
                model: str | None = None, runtime: str | None = None,
                latency_ms: int | None = None, channel: str = "app") -> dict[str, Any]:
    if not consent("store_conversations"):
        return {"ok": False, "error": "consent 'store_conversations' not granted"}
    upsert_conversation(conv_id, channel=channel, title=content[:60], scope=scope)
    body = redact(content) if scope == "system" else content
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO messages(conversation_id, scope, role, content, model, runtime, latency_ms, created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (conv_id, scope, role, body, model, runtime, latency_ms, time.time()),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


def list_conversations(scope: str | None = None, limit: int = 50) -> dict[str, Any]:
    conn = connect()
    try:
        sql = "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) AS message_count FROM conversations c"
        args: list[Any] = []
        if scope:
            sql += " WHERE c.scope=?"
            args.append(scope)
        sql += " ORDER BY c.updated_at DESC LIMIT ?"
        args.append(limit)
        rows = conn.execute(sql, args).fetchall()
        return {"ok": True, "conversations": [dict(r) for r in rows]}
    finally:
        conn.close()


def get_messages(conv_id: str, limit: int = 200) -> dict[str, Any]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT ?",
            (conv_id, limit),
        ).fetchall()
        return {"ok": True, "conversation_id": conv_id, "messages": [dict(r) for r in rows]}
    finally:
        conn.close()


def delete_conversation(conv_id: str) -> dict[str, Any]:
    conn = connect()
    try:
        n = conn.execute("DELETE FROM messages WHERE conversation_id=?", (conv_id,)).rowcount
        conn.execute("DELETE FROM conversations WHERE id=?", (conv_id,))
        conn.commit()
        return {"ok": True, "deleted_messages": n}
    finally:
        conn.close()


# --------------------------------------------------------------------------
# system scope
# --------------------------------------------------------------------------
def log_agent_run(run: dict[str, Any]) -> dict[str, Any]:
    conn = connect()
    try:
        conn.execute(
            """INSERT OR REPLACE INTO agent_runs
               (id, scope, agent, task, output, model, runtime, ok, error, duration_ms, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                str(run.get("id") or f"run_{int(time.time()*1000)}"),
                "system",
                str(run.get("agent") or "unknown"),
                redact(str(run.get("task") or "")),
                redact(str(run.get("output") or ""))[:20000],
                run.get("model"),
                run.get("runtime"),
                1 if run.get("ok") else 0,
                run.get("error"),
                int(run.get("duration_ms") or 0),
                time.time(),
            ),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


def list_agent_runs(limit: int = 100) -> dict[str, Any]:
    conn = connect()
    try:
        rows = conn.execute("SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return {"ok": True, "runs": [dict(r) for r in rows]}
    finally:
        conn.close()


def log_event(kind: str, message: str, severity: str = "info", details: Any = None) -> dict[str, Any]:
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO system_events(scope, kind, severity, message, details, created_at) VALUES ('system',?,?,?,?,?)",
            (kind, severity, redact(message), json.dumps(details or {}, ensure_ascii=False), time.time()),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


def list_events(limit: int = 200) -> dict[str, Any]:
    conn = connect()
    try:
        rows = conn.execute("SELECT * FROM system_events ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return {"ok": True, "events": [dict(r) for r in rows]}
    finally:
        conn.close()


def kv_set(scope: str, key: str, value: Any) -> dict[str, Any]:
    conn = connect()
    try:
        payload = json.dumps(value, ensure_ascii=False)
        if scope == "system":
            payload = redact(payload)
        conn.execute(
            "INSERT INTO kv(scope, key, value, updated_at) VALUES (?,?,?,?)"
            " ON CONFLICT(scope, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (scope, key, payload, time.time()),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


def kv_get(scope: str, key: str) -> dict[str, Any]:
    conn = connect()
    try:
        row = conn.execute("SELECT value, updated_at FROM kv WHERE scope=? AND key=?", (scope, key)).fetchone()
        if not row:
            return {"ok": True, "found": False, "value": None}
        return {"ok": True, "found": True, "value": json.loads(row["value"]), "updated_at": row["updated_at"]}
    finally:
        conn.close()


# --------------------------------------------------------------------------
# treasury (ads / mining income used to fund infrastructure)
# --------------------------------------------------------------------------
def add_ledger_entry(source: str, amount: float, currency: str = "USD",
                     note: str | None = None, evidence_url: str | None = None) -> dict[str, Any]:
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO treasury_ledger(source, currency, amount, note, evidence_url, created_at) VALUES (?,?,?,?,?,?)",
            (source, currency, float(amount), note, evidence_url, time.time()),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


def ledger_summary(limit: int = 200) -> dict[str, Any]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM treasury_ledger ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        totals: dict[str, float] = {}
        for r in conn.execute("SELECT source, SUM(amount) AS total FROM treasury_ledger GROUP BY source"):
            totals[r["source"]] = round(r["total"], 6)
        return {"ok": True, "entries": [dict(r) for r in rows], "totals_by_source": totals,
                "net_total": round(sum(totals.values()), 6)}
    finally:
        conn.close()


# --------------------------------------------------------------------------
# subject rights
# --------------------------------------------------------------------------
def export_user_data() -> dict[str, Any]:
    conn = connect()
    try:
        def dump(table: str, where: str = "") -> list[dict[str, Any]]:
            return [dict(r) for r in conn.execute(f"SELECT * FROM {table} {where}").fetchall()]

        return {
            "ok": True,
            "exported_at": time.time(),
            "conversations": dump("conversations", "WHERE scope='user'"),
            "messages": dump("messages", "WHERE scope='user'"),
            "preferences": dump("kv", "WHERE scope='user'"),
            "privacy_settings": dump("privacy_settings"),
        }
    finally:
        conn.close()


def erase_user_data() -> dict[str, Any]:
    """Right to erasure: wipes user-scope rows, keeps anonymous system telemetry."""
    conn = connect()
    try:
        deleted = {
            "messages": conn.execute("DELETE FROM messages WHERE scope='user'").rowcount,
            "conversations": conn.execute("DELETE FROM conversations WHERE scope='user'").rowcount,
            "preferences": conn.execute("DELETE FROM kv WHERE scope='user'").rowcount,
        }
        conn.commit()
        return {"ok": True, "deleted": deleted}
    finally:
        conn.close()


def stats() -> dict[str, Any]:
    conn = connect()
    try:
        def count(table: str, where: str = "") -> int:
            return int(conn.execute(f"SELECT COUNT(*) FROM {table} {where}").fetchone()[0])

        return {
            "ok": True,
            "db": str(db_path()),
            "size_bytes": db_path().stat().st_size if db_path().exists() else 0,
            "user": {
                "conversations": count("conversations", "WHERE scope='user'"),
                "messages": count("messages", "WHERE scope='user'"),
                "preferences": count("kv", "WHERE scope='user'"),
            },
            "system": {
                "agent_runs": count("agent_runs"),
                "events": count("system_events"),
                "settings": count("kv", "WHERE scope='system'"),
                "ledger_entries": count("treasury_ledger"),
            },
        }
    finally:
        conn.close()


def iter_tables() -> Iterable[str]:
    conn = connect()
    try:
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'"):
            yield row["name"]
    finally:
        conn.close()
