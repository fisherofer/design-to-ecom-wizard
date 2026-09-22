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


HELP = (
    "Agent commands (local only):\n"
    "/help - this list\n"
    "/status - local AI + fleet status\n"
    "/agents - registered workers\n"
    "/tasks - queued / running tasks\n"
    "/task <title> - queue a task for the fleet\n"
    "/proposals - pending code proposals (approval is UI-only)\n"
    "/memory - learned-memory stats\n"
    "Any other text goes to the local model."
)


def _command(chat_id: int, text: str) -> str | None:
    """Handles /commands against the local fleet. Returns None if not a command."""
    if not text.startswith("/"):
        return None
    parts = text.split(maxsplit=1)
    cmd = parts[0].lower().split("@")[0]
    arg = parts[1].strip() if len(parts) > 1 else ""
    try:
        from hub import agent_fleet, ai_memory
        if cmd == "/help":
            return HELP
        if cmd == "/status":
            fs = agent_fleet.status()
            ai = local_ai_manager.get_status()
            counts = fs.get("task_counts") or {}
            runtimes = []
            if (ai.get("ollama") or {}).get("running"):
                runtimes.append("ollama")
            if (ai.get("lmstudio") or {}).get("running"):
                runtimes.append("lmstudio")
            if loaded_local := local_ai_manager.loaded_models().get("models"):
                runtimes.append(f"gguf({len(loaded_local)})")
            return (
                f"Fleet: {fs.get('workers_online', 0)}/{fs.get('workers_total', 0)} workers online, "
                f"tasks {counts}, pending proposals {fs.get('pending_proposals', 0)}\n"
                f"Local AI: {', '.join(runtimes) if runtimes else 'no runtime available'}"
            )
        if cmd == "/agents":
            rows = agent_fleet.list_workers().get("workers", [])
            if not rows:
                return "No workers registered."
            return "\n".join(
                f"- {w.get('name')} ({w.get('role')}) {w.get('status')}"
                + ("" if w.get("online") else " [offline]")
                for w in rows[:25]
            )
        if cmd == "/tasks":
            rows = agent_fleet.list_tasks(limit=15).get("tasks", [])
            if not rows:
                return "Task queue is empty."
            return "\n".join(f"#{t.get('id')} [{t.get('status')}] {t.get('title')}" for t in rows)
        if cmd == "/task":
            if not arg:
                return "Usage: /task <title>"
            res = agent_fleet.submit_task(arg, role="general", spec={"source": f"telegram:{chat_id}"})
            return f"Task queued (#{res.get('id')}): {arg}" if res.get("ok") else f"Failed: {res.get('error')}"
        if cmd == "/proposals":
            rows = agent_fleet.list_proposals(status="pending", limit=10).get("proposals", [])
            if not rows:
                return "No pending proposals."
            return "Approve/reject in the app only:\n" + "\n".join(
                f"#{p.get('id')} {p.get('title')}" for p in rows
            )
        if cmd == "/memory":
            st = ai_memory.stats()
            by_kind = st.get("by_kind") or {}
            total = sum(v.get("count", 0) for v in by_kind.values())
            approved = sum(v.get("approved", 0) for v in by_kind.values())
            return f"Memory items: {total} (approved: {approved})"

        return f"Unknown command. {HELP}"
    except Exception as e:
        return f"Command failed: {e}"


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
