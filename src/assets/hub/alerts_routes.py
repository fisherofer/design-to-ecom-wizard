# OFERTRADINGBOT - Alerts API Routes
"""
Alerts hub: persistent alert store with deterministic de-duplication.

Design rules (Ofer protocol):
  * ROOT is resolved dynamically from __file__ - never a hardcoded drive letter.
  * No mock alerts are ever generated. An empty database returns an empty list.
  * De-duplication is content-hash based with a configurable cooldown window,
    so the same signal firing repeatedly does not spam downstream channels.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter()

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("OFER_DATA_DIR", ROOT_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "alerts.db"

DEFAULT_COOLDOWN_SEC = int(os.environ.get("ALERT_DEDUP_COOLDOWN_SEC", "900"))
VALID_LEVELS = ("info", "success", "warn", "critical")


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alerts (
                id           TEXT PRIMARY KEY,
                fingerprint  TEXT NOT NULL,
                level        TEXT NOT NULL,
                source       TEXT NOT NULL,
                symbol       TEXT,
                title        TEXT NOT NULL,
                message      TEXT NOT NULL,
                payload      TEXT,
                created_at   REAL NOT NULL,
                acknowledged INTEGER NOT NULL DEFAULT 0,
                hit_count    INTEGER NOT NULL DEFAULT 1,
                last_seen_at REAL NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_fp ON alerts(fingerprint)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC)")


_init_db()


def _fingerprint(source: str, symbol: Optional[str], title: str, message: str) -> str:
    raw = f"{source}|{symbol or ''}|{title}|{message}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def _row_to_alert(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "fingerprint": row["fingerprint"],
        "level": row["level"],
        "source": row["source"],
        "symbol": row["symbol"],
        "title": row["title"],
        "message": row["message"],
        "payload": json.loads(row["payload"]) if row["payload"] else None,
        "created_at": row["created_at"],
        "acknowledged": bool(row["acknowledged"]),
        "hit_count": row["hit_count"],
        "last_seen_at": row["last_seen_at"],
    }


@router.get("/health")
def alerts_health() -> Dict[str, Any]:
    """Reports store location and row counts. Never fabricates data."""
    try:
        with _conn() as conn:
            total = conn.execute("SELECT COUNT(*) AS c FROM alerts").fetchone()["c"]
            unacked = conn.execute(
                "SELECT COUNT(*) AS c FROM alerts WHERE acknowledged = 0"
            ).fetchone()["c"]
        return {
            "ok": True,
            "db_path": str(DB_PATH),
            "root_dir": str(ROOT_DIR),
            "total": total,
            "unacknowledged": unacked,
            "dedup_cooldown_sec": DEFAULT_COOLDOWN_SEC,
        }
    except sqlite3.Error as exc:  # pragma: no cover - surfaced to caller
        raise HTTPException(status_code=500, detail=f"alerts store unavailable: {exc}")


@router.get("/list")
def list_alerts(
    limit: int = Query(100, ge=1, le=1000),
    level: Optional[str] = Query(None),
    symbol: Optional[str] = Query(None),
    unacknowledged_only: bool = Query(False),
) -> Dict[str, Any]:
    """Returns stored alerts newest-first. Empty store returns an empty list."""
    clauses: List[str] = []
    params: List[Any] = []
    if level:
        if level not in VALID_LEVELS:
            raise HTTPException(status_code=400, detail=f"level must be one of {VALID_LEVELS}")
        clauses.append("level = ?")
        params.append(level)
    if symbol:
        clauses.append("symbol = ?")
        params.append(symbol.upper())
    if unacknowledged_only:
        clauses.append("acknowledged = 0")

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    with _conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM alerts {where} ORDER BY created_at DESC LIMIT ?", params
        ).fetchall()
    return {"ok": True, "count": len(rows), "alerts": [_row_to_alert(r) for r in rows]}


@router.post("/push")
def push_alert(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """
    Ingests an alert with content de-duplication.

    If an identical alert (same source/symbol/title/message) was seen inside the
    cooldown window, the existing row's hit_count is incremented and
    `deduplicated: true` is returned instead of creating a duplicate.
    """
    level = str(data.get("level", "info"))
    if level not in VALID_LEVELS:
        raise HTTPException(status_code=400, detail=f"level must be one of {VALID_LEVELS}")

    source = str(data.get("source") or "").strip()
    title = str(data.get("title") or "").strip()
    message = str(data.get("message") or "").strip()
    if not source or not title or not message:
        raise HTTPException(status_code=400, detail="source, title and message are required")

    symbol = data.get("symbol")
    symbol = symbol.upper() if isinstance(symbol, str) and symbol else None
    cooldown = int(data.get("cooldown_sec", DEFAULT_COOLDOWN_SEC))
    payload = data.get("payload")
    now = time.time()
    fp = _fingerprint(source, symbol, title, message)

    with _conn() as conn:
        existing = conn.execute(
            "SELECT * FROM alerts WHERE fingerprint = ? ORDER BY created_at DESC LIMIT 1", (fp,)
        ).fetchone()
        if existing and (now - float(existing["last_seen_at"])) < cooldown:
            conn.execute(
                "UPDATE alerts SET hit_count = hit_count + 1, last_seen_at = ? WHERE id = ?",
                (now, existing["id"]),
            )
            refreshed = conn.execute(
                "SELECT * FROM alerts WHERE id = ?", (existing["id"],)
            ).fetchone()
            return {
                "ok": True,
                "deduplicated": True,
                "cooldown_remaining_sec": round(cooldown - (now - float(existing["last_seen_at"])), 2),
                "alert": _row_to_alert(refreshed),
            }

        alert_id = f"al_{fp[:12]}_{int(now * 1000)}"
        conn.execute(
            """
            INSERT INTO alerts
              (id, fingerprint, level, source, symbol, title, message, payload,
               created_at, acknowledged, hit_count, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)
            """,
            (
                alert_id,
                fp,
                level,
                source,
                symbol,
                title,
                message,
                json.dumps(payload) if payload is not None else None,
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()

    logger.info("alert stored id=%s level=%s source=%s", alert_id, level, source)
    return {"ok": True, "deduplicated": False, "alert": _row_to_alert(row)}


@router.post("/acknowledge")
def acknowledge(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Marks one alert (by id) or every alert as acknowledged."""
    alert_id = data.get("id")
    with _conn() as conn:
        if alert_id:
            cur = conn.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?", (alert_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="alert not found")
            return {"ok": True, "acknowledged": 1}
        cur = conn.execute("UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0")
        return {"ok": True, "acknowledged": cur.rowcount}


@router.post("/purge")
def purge(data: Dict[str, Any] = Body(default={})) -> Dict[str, Any]:
    """Deletes acknowledged alerts older than `older_than_sec` (default 7 days)."""
    older_than = int(data.get("older_than_sec", 7 * 24 * 3600))
    cutoff = time.time() - older_than
    with _conn() as conn:
        cur = conn.execute(
            "DELETE FROM alerts WHERE acknowledged = 1 AND created_at < ?", (cutoff,)
        )
    return {"ok": True, "deleted": cur.rowcount, "cutoff": cutoff}


@router.get("/stats")
def stats() -> Dict[str, Any]:
    """Aggregates counts by level and by source for dashboard widgets."""
    with _conn() as conn:
        by_level = {
            r["level"]: r["c"]
            for r in conn.execute("SELECT level, COUNT(*) AS c FROM alerts GROUP BY level")
        }
        by_source = {
            r["source"]: r["c"]
            for r in conn.execute(
                "SELECT source, COUNT(*) AS c FROM alerts GROUP BY source ORDER BY c DESC LIMIT 25"
            )
        }
        deduped = conn.execute(
            "SELECT COALESCE(SUM(hit_count - 1), 0) AS c FROM alerts"
        ).fetchone()["c"]
    return {
        "ok": True,
        "by_level": by_level,
        "by_source": by_source,
        "suppressed_duplicates": deduped,
    }
