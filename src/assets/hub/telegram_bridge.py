# -*- coding: utf-8 -*-
"""
OFERTRADINGBOT - Telegram <-> Local AI bridge.

Runs INSIDE the local venv, next to the model, so the user can talk to their
own on-device model from a phone without exposing the machine to the internet:
the bridge long-polls Telegram (outbound HTTPS only, no open ports, no webhook).

Every inbound and outbound message is written to the local SQLite store under
scope="user", subject to the 'telegram_bridge' + 'store_conversations' consent
flags. If consent is missing the bridge refuses to start.
"""

from __future__ import annotations

import json
import threading
import time
import urllib.parse
import urllib.request
from typing import Any

from hub import local_ai_manager, local_store

API = "https://api.telegram.org/bot{token}/{method}"
HISTORY_TURNS = 8

_state: dict[str, Any] = {
    "running": False,
    "started_at": None,
    "last_update_id": 0,
    "last_error": None,
    "messages_in": 0,
    "messages_out": 0,
    "allowed_chat_ids": [],
    "model": None,
    "thread": None,
}
_stop = threading.Event()


def _call(token: str, method: str, payload: dict[str, Any], timeout: int = 60) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API.format(token=urllib.parse.quote(token, safe=""), method=method),
        data=data,
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def check_token(token: str) -> dict[str, Any]:
    try:
        res = _call(token, "getMe", {}, timeout=15)
        if not res.get("ok"):
            return {"ok": False, "error": res.get("description", "getMe failed")}
        return {"ok": True, "bot": res["result"].get("username")}
    except Exception as e:  # network / bad token
        return {"ok": False, "error": str(e)}


def _history(conv_id: str) -> str:
    rows = local_store.get_messages(conv_id, limit=HISTORY_TURNS * 2).get("messages", [])
    lines = [f"{r['role'].upper()}: {r['content']}" for r in rows[-HISTORY_TURNS * 2:]]
    return "\n".join(lines)


def _answer(chat_id: int, text: str, model: str | None) -> tuple[str, dict[str, Any]]:
    conv_id = f"telegram:{chat_id}"
    local_store.add_message(conv_id, "user", text, scope="user", channel="telegram")
    prompt = (
        "You are the on-device assistant of the OFERTRADINGBOT trading system. "
        "Answer briefly and factually. Never invent market numbers: if you were not "
        "given data, say which data you need.\n\n"
        f"Conversation so far:\n{_history(conv_id)}\n\nASSISTANT:"
    )
    t0 = time.time()
    result = local_ai_manager.generate(prompt, model, max_tokens=512, temperature=0.3)
    latency = int((time.time() - t0) * 1000)
    if not result.get("ok"):
        reply = f"Local model unavailable: {result.get('error', 'unknown error')}"
    else:
        reply = (result.get("text") or "").strip() or "(empty reply from local model)"
    local_store.add_message(
        conv_id, "assistant", reply, scope="user", channel="telegram",
        model=result.get("model"), runtime=result.get("runtime"), latency_ms=latency,
    )
    return reply, result


def _loop(token: str, allowed: list[int], model: str | None) -> None:
    _state["running"] = True
    _state["started_at"] = time.time()
    local_store.log_event("telegram_bridge", "bridge started", "info")
    while not _stop.is_set():
        try:
            res = _call(
                token,
                "getUpdates",
                {"offset": _state["last_update_id"] + 1, "timeout": 25, "allowed_updates": ["message"]},
                timeout=40,
            )
            for update in res.get("result", []):
                _state["last_update_id"] = update["update_id"]
                msg = update.get("message") or {}
                chat_id = (msg.get("chat") or {}).get("id")
                text = (msg.get("text") or "").strip()
                if chat_id is None or not text:
                    continue
                if allowed and int(chat_id) not in allowed:
                    _call(token, "sendMessage", {"chat_id": chat_id, "text": "This bridge is private."})
                    continue
                _state["messages_in"] += 1
                reply, _ = _answer(int(chat_id), text, model)
                _call(token, "sendMessage", {"chat_id": chat_id, "text": reply[:4000]}, timeout=30)
                _state["messages_out"] += 1
            _state["last_error"] = None
        except Exception as e:
            _state["last_error"] = str(e)
            local_store.log_event("telegram_bridge", f"poll error: {e}", "warn")
            time.sleep(5)
    _state["running"] = False
    local_store.log_event("telegram_bridge", "bridge stopped", "info")


def start(token: str, allowed_chat_ids: list[int] | None = None, model: str | None = None) -> dict[str, Any]:
    if _state["running"]:
        return {"ok": False, "error": "bridge already running"}
    if not local_store.consent("telegram_bridge"):
        return {"ok": False, "error": "consent 'telegram_bridge' is not granted"}
    if not local_store.consent("store_conversations"):
        return {"ok": False, "error": "consent 'store_conversations' is required to keep chat history"}
    probe = check_token(token)
    if not probe["ok"]:
        return {"ok": False, "error": probe["error"]}
    _stop.clear()
    _state["allowed_chat_ids"] = allowed_chat_ids or []
    _state["model"] = model
    thread = threading.Thread(target=_loop, args=(token, _state["allowed_chat_ids"], model), daemon=True)
    _state["thread"] = thread
    thread.start()
    return {"ok": True, "bot": probe["bot"], "allowed_chat_ids": _state["allowed_chat_ids"]}


def stop() -> dict[str, Any]:
    _stop.set()
    return {"ok": True, "stopping": True}


def status() -> dict[str, Any]:
    return {
        "ok": True,
        "running": bool(_state["running"]),
        "started_at": _state["started_at"],
        "messages_in": _state["messages_in"],
        "messages_out": _state["messages_out"],
        "allowed_chat_ids": _state["allowed_chat_ids"],
        "model": _state["model"],
        "last_error": _state["last_error"],
        "consent_telegram": local_store.consent("telegram_bridge"),
        "consent_history": local_store.consent("store_conversations"),
    }
