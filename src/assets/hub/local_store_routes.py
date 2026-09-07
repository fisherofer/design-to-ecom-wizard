# hub/local_store_routes.py
"""
FastAPI router exposing hub/local_store.py over HTTP.

Mount with: app.include_router(local_store_routes.router, prefix="/api/local-store")

Everything here reads and writes the LOCAL SQLite file inside the venv's
user_data/ directory. Nothing is uploaded anywhere.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hub import local_store

router = APIRouter(tags=["local-store"])


# ---------------------------------------------------------------- privacy
class PrivacyUpdate(BaseModel):
    purpose: str
    granted: bool | None = None
    retention_days: int | None = None


@router.get("/privacy")
def privacy() -> dict:
    return local_store.get_privacy()


@router.post("/privacy")
def update_privacy(body: PrivacyUpdate) -> dict:
    res = local_store.set_privacy(body.purpose, body.granted, body.retention_days)
    if not res["ok"]:
        raise HTTPException(status_code=400, detail=res)
    return res


@router.post("/privacy/purge")
def purge() -> dict:
    return local_store.purge_expired()


@router.get("/privacy/export")
def export_data() -> dict:
    return local_store.export_user_data()


@router.post("/privacy/erase")
def erase() -> dict:
    return local_store.erase_user_data()


# ---------------------------------------------------------- conversations
class MessageIn(BaseModel):
    conversation_id: str
    role: str
    content: str
    scope: str = "user"
    channel: str = "app"
    model: str | None = None
    runtime: str | None = None
    latency_ms: int | None = None


@router.get("/conversations")
def conversations(scope: str | None = None, limit: int = 50) -> dict:
    return local_store.list_conversations(scope, limit)


@router.get("/conversations/{conversation_id}")
def conversation(conversation_id: str, limit: int = 200) -> dict:
    return local_store.get_messages(conversation_id, limit)


@router.post("/messages")
def add_message(body: MessageIn) -> dict:
    res = local_store.add_message(
        body.conversation_id, body.role, body.content, body.scope,
        body.model, body.runtime, body.latency_ms, body.channel,
    )
    if not res["ok"]:
        raise HTTPException(status_code=403, detail=res)
    return res


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str) -> dict:
    return local_store.delete_conversation(conversation_id)


# --------------------------------------------------------------- system
class AgentRunIn(BaseModel):
    id: str | None = None
    agent: str
    task: str | None = None
    output: str | None = None
    model: str | None = None
    runtime: str | None = None
    ok: bool = False
    error: str | None = None
    duration_ms: int | None = None


class EventIn(BaseModel):
    kind: str
    message: str
    severity: str = "info"
    details: dict[str, Any] | None = None


class KvIn(BaseModel):
    scope: str = "system"
    key: str
    value: Any


@router.post("/agent-runs")
def agent_run(body: AgentRunIn) -> dict:
    return local_store.log_agent_run(body.model_dump())


@router.get("/agent-runs")
def agent_runs(limit: int = 100) -> dict:
    return local_store.list_agent_runs(limit)


@router.post("/events")
def event(body: EventIn) -> dict:
    return local_store.log_event(body.kind, body.message, body.severity, body.details)


@router.get("/events")
def events(limit: int = 200) -> dict:
    return local_store.list_events(limit)


@router.post("/kv")
def kv_set(body: KvIn) -> dict:
    return local_store.kv_set(body.scope, body.key, body.value)


@router.get("/kv/{scope}/{key}")
def kv_get(scope: str, key: str) -> dict:
    return local_store.kv_get(scope, key)


# -------------------------------------------------------------- treasury
class LedgerIn(BaseModel):
    source: str
    amount: float
    currency: str = "USD"
    note: str | None = None
    evidence_url: str | None = None


@router.get("/treasury")
def treasury(limit: int = 200) -> dict:
    return local_store.ledger_summary(limit)


@router.post("/treasury")
def treasury_add(body: LedgerIn) -> dict:
    return local_store.add_ledger_entry(
        body.source, body.amount, body.currency, body.note, body.evidence_url
    )


@router.get("/stats")
def stats() -> dict:
    return local_store.stats()
