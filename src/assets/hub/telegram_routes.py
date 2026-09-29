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
TOKEN_SCOPE = "user"  # the bot token belongs to the user, not the system


def _saved_token() -> str:
    """Reads the token from user scope; migrates a legacy system-scope token once."""
    stored = local_store.kv_get(TOKEN_SCOPE, TOKEN_KEY)
    value = str(stored.get("value") or "").strip() if stored.get("found") else ""
    if value:
        return value
    legacy = local_store.kv_get("system", TOKEN_KEY)
    legacy_val = str(legacy.get("value") or "").strip() if legacy.get("found") else ""
    if legacy_val:
        local_store.kv_set(TOKEN_SCOPE, TOKEN_KEY, legacy_val)
        local_store.kv_set("system", TOKEN_KEY, "")
    return legacy_val


class StartRequest(BaseModel):
    token: str | None = None
    allowed_chat_ids: list[int] = []
    model: str | None = None
    remember_token: bool = True


class DetectRequest(BaseModel):
    token: str | None = None


@router.get("/status")
def status() -> dict:
    return {**telegram_bridge.status(), "token_saved": bool(_saved_token())}


@router.post("/detect")
def detect(body: DetectRequest) -> dict:
    """Validates the token and lists chats that have messaged the bot."""
    token = (body.token or "").strip() or _saved_token()
    if not token:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "no bot token supplied or saved"})
    probe = telegram_bridge.check_token(token)
    if not probe["ok"]:
        raise HTTPException(status_code=400, detail={"ok": False, "error": f"invalid token: {probe['error']}"})
    if telegram_bridge.status()["running"]:
        return {"ok": True, "bot": probe["bot"], "chats": [], "note": "bridge running; stop it to detect chats"}
    try:
        res = telegram_bridge._call(token, "getUpdates", {"timeout": 0, "allowed_updates": ["message"]}, timeout=20)
    except Exception as e:
        raise HTTPException(status_code=502, detail={"ok": False, "error": f"getUpdates failed: {e}"})
    chats: dict[int, dict] = {}
    for u in res.get("result", []):
        chat = (u.get("message") or {}).get("chat") or {}
        if chat.get("id") is not None:
            chats[int(chat["id"])] = {
                "id": int(chat["id"]),
                "username": chat.get("username"),
                "name": " ".join(x for x in [chat.get("first_name"), chat.get("last_name")] if x) or chat.get("title"),
            }
    local_store.kv_set(TOKEN_SCOPE, TOKEN_KEY, token)
    return {"ok": True, "bot": probe["bot"], "chats": list(chats.values())}


@router.post("/start")
def start(body: StartRequest) -> dict:
    token = (body.token or "").strip() or _saved_token()
    if not token:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "no bot token supplied or saved"})
    result = telegram_bridge.start(token, body.allowed_chat_ids, body.model)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result)
    if body.remember_token:
        local_store.kv_set(TOKEN_SCOPE, TOKEN_KEY, token)
    return result


@router.post("/stop")
def stop() -> dict:
    return telegram_bridge.stop()


@router.delete("/token")
def forget_token() -> dict:
    local_store.kv_set(TOKEN_SCOPE, TOKEN_KEY, "")
    local_store.kv_set("system", TOKEN_KEY, "")
    return {"ok": True, "token_saved": False}
