# hub/agent_fleet.py
"""
Agent fleet coordination, shared memory archive and owner-gated code proposals.

Everything lives in the local venv SQLite store (scope: system), so the fleet
keeps working with no cloud service at all.

Three concerns:
  * fleet    — workers register + heartbeat, tasks are queued, claimed and
               completed. A worker is any local process (agent runner, swarm
               worker, notebook) that polls /api/fleet/claim.
  * archive  — periodically digests agent runs into durable lessons in
               hub.ai_memory so the fleet learns across restarts. Digests are
               written as 'lesson' rows (auto-approved, low weight); anything
               that changes behaviour must be a 'rule' and the OWNER approves it.
  * proposals— code upgrade suggestions. Stored only. Never applied by this
               module: status moves pending -> approved/rejected by the owner,
               and applying is a separate, explicit action outside the API.

No fabricated results: a task with no worker stays 'queued' and reports that.
"""
from __future__ import annotations

import json
import time
from typing import Any

from hub import ai_memory, local_store

STALE_WORKER_SEC = 90.0


def _init() -> None:
    with local_store.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS fleet_workers (
                name TEXT PRIMARY KEY,
                role TEXT NOT NULL DEFAULT 'general',
                capabilities TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'idle',
                note TEXT,
                registered_at REAL NOT NULL,
                last_seen REAL NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS fleet_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'general',
                spec TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'queued',
                worker TEXT,
                result TEXT,
                error TEXT,
                priority INTEGER NOT NULL DEFAULT 5,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS code_proposals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                target_path TEXT,
                rationale TEXT NOT NULL DEFAULT '',
                patch TEXT NOT NULL DEFAULT '',
                risk TEXT NOT NULL DEFAULT 'unknown',
                source TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                decided_at REAL,
                created_at REAL NOT NULL
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fleet_tasks_status ON fleet_tasks(status, priority)")
        conn.commit()


_init()

_TASK_COLS = ["id", "title", "role", "spec", "status", "worker", "result", "error",
              "priority", "created_at", "updated_at"]
_PROP_COLS = ["id", "title", "target_path", "rationale", "patch", "risk", "source",
              "status", "decided_at", "created_at"]


def _rows(conn, sql: str, args: tuple, cols: list[str]) -> list[dict[str, Any]]:
    out = []
    for r in conn.execute(sql, args).fetchall():
        item = dict(zip(cols, r))
        for key in ("spec", "result"):
            if key in item and isinstance(item[key], str) and item[key]:
                try:
                    item[key] = json.loads(item[key])
                except json.JSONDecodeError:
                    pass
        out.append(item)
    return out


# ---------------------------------------------------------------- workers
def register_worker(name: str, role: str = "general", capabilities: list[str] | None = None,
                    note: str | None = None) -> dict[str, Any]:
    name = (name or "").strip()
    if not name:
        return {"ok": False, "error": "worker name required"}
    now = time.time()
    with local_store.connect() as conn:
        conn.execute(
            """INSERT INTO fleet_workers(name, role, capabilities, status, note, registered_at, last_seen)
               VALUES (?,?,?,'idle',?,?,?)
               ON CONFLICT(name) DO UPDATE SET role=excluded.role,
                   capabilities=excluded.capabilities, note=excluded.note, last_seen=excluded.last_seen""",
            (name, role, json.dumps(capabilities or []), note, now, now),
        )
        conn.commit()
    local_store.log_event("fleet", f"worker registered: {name} ({role})")
    return {"ok": True, "name": name}


def heartbeat(name: str, status: str = "idle") -> dict[str, Any]:
    with local_store.connect() as conn:
        cur = conn.execute("UPDATE fleet_workers SET last_seen=?, status=? WHERE name=?",
                           (time.time(), status, name))
        conn.commit()
    if not cur.rowcount:
        return {"ok": False, "error": "unknown worker — register first"}
    return {"ok": True}


def remove_worker(name: str) -> dict[str, Any]:
    with local_store.connect() as conn:
        conn.execute("DELETE FROM fleet_workers WHERE name=?", (name,))
        conn.commit()
    return {"ok": True}


def list_workers() -> dict[str, Any]:
    now = time.time()
    with local_store.connect() as conn:
        rows = conn.execute(
            "SELECT name, role, capabilities, status, note, registered_at, last_seen"
            " FROM fleet_workers ORDER BY last_seen DESC"
        ).fetchall()
    workers = []
    for name, role, caps, status, note, reg, seen in rows:
        try:
            caps_list = json.loads(caps or "[]")
        except json.JSONDecodeError:
            caps_list = []
        workers.append({
            "name": name, "role": role, "capabilities": caps_list, "note": note,
            "status": status, "registered_at": reg, "last_seen": seen,
            "online": (now - seen) <= STALE_WORKER_SEC,
        })
    return {"ok": True, "workers": workers,
            "online": sum(1 for w in workers if w["online"]), "total": len(workers)}


# ------------------------------------------------------------------ tasks
def submit_task(title: str, role: str = "general", spec: dict[str, Any] | None = None,
                priority: int = 5) -> dict[str, Any]:
    title = (title or "").strip()
    if not title:
        return {"ok": False, "error": "task title required"}
    now = time.time()
    with local_store.connect() as conn:
        cur = conn.execute(
            "INSERT INTO fleet_tasks(title, role, spec, status, priority, created_at, updated_at)"
            " VALUES (?,?,?,'queued',?,?,?)",
            (title, role, json.dumps(spec or {}), max(1, min(9, priority)), now, now),
        )
        conn.commit()
    return {"ok": True, "id": cur.lastrowid, "status": "queued"}


def claim_task(worker: str, role: str | None = None) -> dict[str, Any]:
    now = time.time()
    with local_store.connect() as conn:
        known = conn.execute("SELECT 1 FROM fleet_workers WHERE name=?", (worker,)).fetchone()
        if not known:
            return {"ok": False, "error": "unknown worker — register first"}
        q = "SELECT id FROM fleet_tasks WHERE status='queued'"
        args: list[Any] = []
        if role:
            q += " AND role=?"
            args.append(role)
        q += " ORDER BY priority ASC, created_at ASC LIMIT 1"
        row = conn.execute(q, args).fetchone()
        if not row:
            conn.execute("UPDATE fleet_workers SET last_seen=?, status='idle' WHERE name=?", (now, worker))
            conn.commit()
            return {"ok": True, "task": None, "note": "queue empty"}
        conn.execute("UPDATE fleet_tasks SET status='claimed', worker=?, updated_at=? WHERE id=?",
                     (worker, now, row[0]))
        conn.execute("UPDATE fleet_workers SET last_seen=?, status='busy' WHERE name=?", (now, worker))
        conn.commit()
        task = _rows(conn, f"SELECT {','.join(_TASK_COLS)} FROM fleet_tasks WHERE id=?",
                     (row[0],), _TASK_COLS)[0]
    return {"ok": True, "task": task}


def complete_task(task_id: int, worker: str, result: Any = None,
                  error: str | None = None) -> dict[str, Any]:
    now = time.time()
    status = "failed" if error else "done"
    with local_store.connect() as conn:
        cur = conn.execute(
            "UPDATE fleet_tasks SET status=?, result=?, error=?, updated_at=? WHERE id=? AND worker=?",
            (status, json.dumps(result) if result is not None else None,
             local_store.redact(error) if error else None, now, task_id, worker),
        )
        conn.execute("UPDATE fleet_workers SET last_seen=?, status='idle' WHERE name=?", (now, worker))
        conn.commit()
    if not cur.rowcount:
        return {"ok": False, "error": "task not found for this worker"}
    return {"ok": True, "status": status}


def list_tasks(status: str | None = None, limit: int = 100) -> dict[str, Any]:
    q = f"SELECT {','.join(_TASK_COLS)} FROM fleet_tasks"
    args: list[Any] = []
    if status:
        q += " WHERE status=?"
        args.append(status)
    q += " ORDER BY created_at DESC LIMIT ?"
    args.append(limit)
    with local_store.connect() as conn:
        tasks = _rows(conn, q, tuple(args), _TASK_COLS)
        counts = dict(conn.execute("SELECT status, COUNT(*) FROM fleet_tasks GROUP BY status").fetchall())
    return {"ok": True, "tasks": tasks, "counts": counts}


def requeue_stale() -> dict[str, Any]:
    """Return tasks held by workers that stopped reporting back to the queue."""
    cutoff = time.time() - STALE_WORKER_SEC
    with local_store.connect() as conn:
        cur = conn.execute(
            """UPDATE fleet_tasks SET status='queued', worker=NULL, updated_at=?
               WHERE status='claimed' AND worker IN (SELECT name FROM fleet_workers WHERE last_seen < ?)""",
            (time.time(), cutoff),
        )
        conn.commit()
    return {"ok": True, "requeued": cur.rowcount}


# ---------------------------------------------------------------- archive
def archive_runs(limit: int = 200) -> dict[str, Any]:
    """Digest recent agent runs into durable lessons.

    Only aggregates that actually exist are written — no invented commentary.
    """
    runs = local_store.list_agent_runs(limit=limit).get("runs", [])
    if not runs:
        return {"ok": True, "written": 0, "note": "no agent runs recorded yet"}
    by_agent: dict[str, dict[str, Any]] = {}
    for r in runs:
        agent = r.get("agent") or r.get("agent_name") or "unknown"
        slot = by_agent.setdefault(agent, {"runs": 0, "failed": 0, "latency": []})
        slot["runs"] += 1
        if r.get("error") or r.get("status") in ("failed", "error"):
            slot["failed"] += 1
        lat = r.get("latency_ms") or r.get("latencyMs")
        if isinstance(lat, (int, float)):
            slot["latency"].append(float(lat))
    written = 0
    for agent, s in by_agent.items():
        avg = round(sum(s["latency"]) / len(s["latency"])) if s["latency"] else None
        parts = [f"{agent}: {s['runs']} runs, {s['failed']} failed"]
        if avg is not None:
            parts.append(f"avg latency {avg}ms")
        res = ai_memory.remember("lesson", "; ".join(parts), topic=f"fleet/{agent}",
                                 source="agent_fleet.archive_runs", weight=0.5)
        written += 1 if res.get("ok") else 0
    return {"ok": True, "written": written, "agents": len(by_agent)}


# -------------------------------------------------------------- proposals
def propose_code(title: str, rationale: str = "", target_path: str | None = None,
                 patch: str = "", risk: str = "unknown", source: str | None = None) -> dict[str, Any]:
    title = (title or "").strip()
    if not title:
        return {"ok": False, "error": "proposal title required"}
    with local_store.connect() as conn:
        cur = conn.execute(
            "INSERT INTO code_proposals(title, target_path, rationale, patch, risk, source, status, created_at)"
            " VALUES (?,?,?,?,?,?,'pending',?)",
            (title, target_path, local_store.redact(rationale), patch, risk, source, time.time()),
        )
        conn.commit()
    local_store.log_event("fleet", f"code proposal queued for approval: {title}")
    return {"ok": True, "id": cur.lastrowid, "status": "pending",
            "note": "stored for owner review; nothing was changed"}


def list_proposals(status: str | None = None, limit: int = 100) -> dict[str, Any]:
    q = f"SELECT {','.join(_PROP_COLS)} FROM code_proposals"
    args: list[Any] = []
    if status:
        q += " WHERE status=?"
        args.append(status)
    q += " ORDER BY created_at DESC LIMIT ?"
    args.append(limit)
    with local_store.connect() as conn:
        items = _rows(conn, q, tuple(args), _PROP_COLS)
    return {"ok": True, "proposals": items}


def decide_proposal(proposal_id: int, approve: bool) -> dict[str, Any]:
    status = "approved" if approve else "rejected"
    with local_store.connect() as conn:
        cur = conn.execute("UPDATE code_proposals SET status=?, decided_at=? WHERE id=? AND status='pending'",
                           (status, time.time(), proposal_id))
        conn.commit()
    if not cur.rowcount:
        return {"ok": False, "error": "proposal not found or already decided"}
    return {"ok": True, "status": status,
            "note": "approval is recorded only; applying the change stays a separate manual step"}


def status() -> dict[str, Any]:
    workers = list_workers()
    tasks = list_tasks(limit=1)
    with local_store.connect() as conn:
        pending = conn.execute("SELECT COUNT(*) FROM code_proposals WHERE status='pending'").fetchone()[0]
    return {
        "ok": True,
        "workers_online": workers["online"],
        "workers_total": workers["total"],
        "task_counts": tasks["counts"],
        "pending_proposals": pending,
        "memory": ai_memory.stats(),
        "constitution": ai_memory.CONSTITUTION,
    }
