# hub/ai_memory.py
"""
Learning memory for the local AI — stored in the local venv SQLite database.

Three record kinds, all under scope "system" so personal chat content stays in
the user scope:
  * lesson  — something the model learned from an outcome (auto-written)
  * rule    — a behaviour rule. Rules only take effect after the OWNER approves
              them, so the model can propose but never grant itself permission.
  * fact    — a durable fact about the environment (tickers, sources, paths)

Nothing here calls a model; it is pure storage plus prompt assembly.
"""
from __future__ import annotations

import json
import time
from typing import Any

from hub import local_store

TABLE = "ai_memory"


def _init() -> None:
    with local_store.connect() as conn:
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS {TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                topic TEXT NOT NULL DEFAULT 'general',
                content TEXT NOT NULL,
                source TEXT,
                weight REAL NOT NULL DEFAULT 1.0,
                approved INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )"""
        )
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE}_kind ON {TABLE}(kind, active)")
        conn.commit()


_init()

# Rules the owner sets that the model can never override.
CONSTITUTION: list[str] = [
    "The owner has final authority. Never act against an explicit owner instruction.",
    "Never place, amend or cancel a real broker order without an explicit owner confirmation.",
    "Never send personal user data to a cloud model unless the 'share_with_cloud_models' consent is granted.",
    "Never fabricate market data, prices, fills, earnings or sources. Say 'unavailable' instead.",
    "Never spend money, subscribe, or move funds automatically.",
    "Propose code upgrades as suggestions; never apply them without approval.",
]


def remember(kind: str, content: str, topic: str = "general", source: str | None = None,
             weight: float = 1.0, approved: bool | None = None) -> dict[str, Any]:
    if kind not in ("lesson", "rule", "fact"):
        return {"ok": False, "error": "kind must be lesson, rule or fact"}
    content = local_store.redact((content or "").strip())
    if not content:
        return {"ok": False, "error": "empty content"}
    auto_approved = 0 if kind == "rule" else 1
    if approved is not None:
        auto_approved = 1 if approved else 0
    now = time.time()
    with local_store.connect() as conn:
        dup = conn.execute(
            f"SELECT id FROM {TABLE} WHERE kind=? AND content=? AND active=1", (kind, content)
        ).fetchone()
        if dup:
            conn.execute(f"UPDATE {TABLE} SET weight=weight+0.25, updated_at=? WHERE id=?", (now, dup[0]))
            conn.commit()
            return {"ok": True, "id": dup[0], "reinforced": True}
        cur = conn.execute(
            f"INSERT INTO {TABLE}(kind, topic, content, source, weight, approved, active, created_at, updated_at)"
            " VALUES (?,?,?,?,?,?,1,?,?)",
            (kind, topic, content, source, weight, auto_approved, now, now),
        )
        conn.commit()
        return {"ok": True, "id": cur.lastrowid, "approved": bool(auto_approved)}


def list_memory(kind: str | None = None, limit: int = 200) -> dict[str, Any]:
    q = f"SELECT id,kind,topic,content,source,weight,approved,active,created_at,updated_at FROM {TABLE} WHERE active=1"
    args: list[Any] = []
    if kind:
        q += " AND kind=?"
        args.append(kind)
    q += " ORDER BY approved DESC, weight DESC, updated_at DESC LIMIT ?"
    args.append(limit)
    with local_store.connect() as conn:
        rows = conn.execute(q, args).fetchall()
    cols = ["id", "kind", "topic", "content", "source", "weight", "approved", "active", "created_at", "updated_at"]
    return {"ok": True, "constitution": CONSTITUTION, "items": [dict(zip(cols, r)) for r in rows]}


def approve(mem_id: int, approved: bool = True) -> dict[str, Any]:
    with local_store.connect() as conn:
        conn.execute(f"UPDATE {TABLE} SET approved=?, updated_at=? WHERE id=?",
                     (1 if approved else 0, time.time(), mem_id))
        conn.commit()
    local_store.log_event("ai_memory", f"rule {mem_id} approved={approved}", "info")
    return {"ok": True, "id": mem_id, "approved": approved}


def forget(mem_id: int) -> dict[str, Any]:
    with local_store.connect() as conn:
        conn.execute(f"UPDATE {TABLE} SET active=0, updated_at=? WHERE id=?", (time.time(), mem_id))
        conn.commit()
    return {"ok": True, "id": mem_id, "removed": True}


def system_prompt(topic: str | None = None, max_items: int = 25) -> str:
    """Assemble the local model's standing instructions: constitution first."""
    parts = ["OWNER CONSTITUTION (never violate):"]
    parts += [f"- {c}" for c in CONSTITUTION]
    items = list_memory()["items"]
    rules = [i for i in items if i["kind"] == "rule" and i["approved"]][:max_items]
    if rules:
        parts.append("\nAPPROVED RULES:")
        parts += [f"- {r['content']}" for r in rules]
    scoped = [i for i in items if i["kind"] in ("lesson", "fact")
              and (not topic or i["topic"] in (topic, "general"))][:max_items]
    if scoped:
        parts.append("\nLEARNED CONTEXT:")
        parts += [f"- [{i['topic']}] {i['content']}" for i in scoped]
    return "\n".join(parts)


def stats() -> dict[str, Any]:
    with local_store.connect() as conn:
        rows = conn.execute(
            f"SELECT kind, COUNT(*), SUM(approved) FROM {TABLE} WHERE active=1 GROUP BY kind"
        ).fetchall()
    return {"ok": True, "by_kind": {r[0]: {"count": r[1], "approved": r[2] or 0} for r in rows},
            "constitution_rules": len(CONSTITUTION), "json": json.dumps({})}
