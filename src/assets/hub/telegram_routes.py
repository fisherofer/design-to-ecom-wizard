# hub/telegram_routes.py
"""
FastAPI router for the local Telegram <-> Local AI bridge.

Mount with: app.include_router(telegram_routes.router, prefix="/api/telegram")

The bot token is stored in the local encrypted key vault, never returned to
the client, and never written to the conversation store.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hub import local_store, telegram_bridge

router = APIRouter(tags=["telegram"])

TOKEN_KEY = "telegram_bot_token"


class StartRequest(BaseModel):
    token: str | None = None
    allowed_chat_ids: list[int] = []
    model: str | None = None
    remember_token: bool = True


@router.get("/status")
def status() -> dict:
    stored = local_store.kv_get("system", TOKEN_KEY)
    return {**telegram_bridge.status(), "token_saved": bool(stored.get("found"))}


@router.post("/start")
def start(body: StartRequest) -> dict:
    token = (body.token or "").strip()
    if not token:
        stored = local_store.kv_get("system", TOKEN_KEY)
        token = str(stored.get("value") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "no bot token supplied or saved"})
    result = telegram_bridge.start(token, body.allowed_chat_ids, body.model)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result)
    if body.remember_token:
        local_store.kv_set("system", TOKEN_KEY, token)
    return result


@router.post("/stop")
def stop() -> dict:
    return telegram_bridge.stop()


@router.delete("/token")
def forget_token() -> dict:
    local_store.kv_set("system", TOKEN_KEY, "")
    return {"ok": True, "token_saved": False}
