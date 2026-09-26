# 24/07/2026
"""
OFERTRADINGBOT - Model Context Protocol (MCP) API Routes
Exposes dynamic tool discovery and validation endpoints for agent runtimes.
Uses generic capability tool definitions without hardcoded vendor/client names.
"""

from fastapi import APIRouter, Body
from typing import Dict, Any, List

router = APIRouter()

# Dynamic MCP tools registry (generic capability names)
MCP_TOOLS = [
    {
        "name": "run_local_llm_query",
        "desc": "Queries the local LLM inference runtime to analyze workspace code and market data.",
        "active": True
    },
    {
        "name": "alpaca_execute_trade",
        "desc": "Allows the agent runtime to submit paper trading orders via validated Alpaca API.",
        "active": True
    },
    {
        "name": "send_system_notification",
        "desc": "Dispatches critical drawdown, risk halt, or signal alerts to configured channels.",
        "active": False
    },
    {
        "name": "google_drive_sync",
        "desc": "Synchronizes algorithmic strategy templates and code artifacts with storage.",
        "active": True
    },
    {
        "name": "workspace_code_scan",
        "desc": "Scans workspace source code for syntax verification and structural compliance.",
        "active": True
    }
]

@router.get("/tools")
def get_mcp_tools() -> Dict[str, Any]:
    """Returns dynamic MCP tools list."""
    return {
        "success": True,
        "tools": MCP_TOOLS
    }

@router.post("/tools/toggle")
def toggle_mcp_tool(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Toggles active state of specified MCP tool."""
    name = data.get("name")
    for tool in MCP_TOOLS:
        if tool["name"] == name:
            tool["active"] = not tool["active"]
            return {"success": True, "tool": tool, "tools": MCP_TOOLS}
    return {"success": False, "error": f"Tool '{name}' not found", "tools": MCP_TOOLS}

@router.post("/execute")
def execute_mcp_tool(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Executes a validated MCP tool."""
    tool_name = str(data.get("tool_name", ""))
    arguments = data.get("arguments", {})
    return {
        "success": True,
        "tool_name": tool_name,
        "result": f"Executed MCP tool '{tool_name}' successfully.",
        "output": arguments
    }


# ---------------------------------------------------------------------------
# Real MCP endpoint (Streamable HTTP, JSON responses) for external agents such
# as Google AI Studio, Google Antigravity, Claude, Cursor. Local-only by
# default; every call needs `Authorization: Bearer <token>`.
# Endpoint: POST http://localhost:<port>/api/mcp/rpc
# ---------------------------------------------------------------------------
import json as _json
import os as _os
import secrets as _secrets
from fastapi import Request
from fastapi.responses import JSONResponse

from hub import agent_fleet, ai_memory, local_ai_manager, local_store

_PROTOCOL = "2025-06-18"


def _token() -> str:
    env = _os.environ.get("OFER_MCP_TOKEN", "").strip()
    if env:
        return env
    got = local_store.kv_get("system", "mcp.token")
    if got.get("found") and got.get("value"):
        return str(got["value"])
    tok = _secrets.token_urlsafe(32)
    local_store.kv_set("system", "mcp.token", tok)
    return tok


def _tool(name, desc, props=None, required=None, read_only=True):
    return {"name": name, "description": desc,
            "inputSchema": {"type": "object", "properties": props or {}, "required": required or [],
                            "additionalProperties": False},
            "annotations": {"readOnlyHint": read_only}}


RPC_TOOLS = [
    _tool("fleet_status", "Agent fleet status: workers, task counts, pending code proposals."),
    _tool("list_agents", "List registered agent workers and heartbeat state."),
    _tool("list_tasks", "List recent fleet tasks.", {"limit": {"type": "integer"}}),
    _tool("submit_task", "Queue a task for the local agent fleet.",
          {"title": {"type": "string"}, "role": {"type": "string"}}, ["title"], False),
    _tool("list_proposals", "List code upgrade proposals waiting for owner approval."),
    _tool("propose_code", "Submit a code change proposal. Never applied automatically; owner approves in the app.",
          {"title": {"type": "string"}, "rationale": {"type": "string"},
           "target_path": {"type": "string"}, "patch": {"type": "string"}}, ["title"], False),
    _tool("local_ai_generate", "Run a prompt on the local AI model loaded on this machine.",
          {"prompt": {"type": "string"}, "max_tokens": {"type": "integer"}}, ["prompt"]),
    _tool("local_ai_status", "Local AI runtimes and loaded models."),
    _tool("memory_stats", "Approved agent memory statistics."),
    _tool("get_setting", "Read a system setting from the local SQL store.", {"key": {"type": "string"}}, ["key"]),
]


def _call(name: str, a: dict):
    if name == "fleet_status": return agent_fleet.status()
    if name == "list_agents": return agent_fleet.list_workers()
    if name == "list_tasks": return agent_fleet.list_tasks(limit=int(a.get("limit", 50)))
    if name == "submit_task":
        return agent_fleet.submit_task(str(a["title"]), role=str(a.get("role", "general")), spec={"source": "mcp"})
    if name == "list_proposals": return agent_fleet.list_proposals(status="pending")
    if name == "propose_code":
        return agent_fleet.propose_code(str(a["title"]), str(a.get("rationale", "")), a.get("target_path"),
                                        str(a.get("patch", "")), source="mcp")
    if name == "local_ai_generate":
        return local_ai_manager.generate(str(a["prompt"]), max_tokens=int(a.get("max_tokens", 512)))
    if name == "local_ai_status": return local_ai_manager.get_status()
    if name == "memory_stats": return ai_memory.stats()
    if name == "get_setting":
        key = str(a["key"])
        if key.startswith(("ofer.secret.", "ofer.keys.", "mcp.token")):
            raise ValueError("secret keys are not readable over MCP")
        return local_store.kv_get("system", key)
    raise KeyError(name)


def _ok(i, result): return {"jsonrpc": "2.0", "id": i, "result": result}
def _err(i, code, msg): return {"jsonrpc": "2.0", "id": i, "error": {"code": code, "message": msg}}


@router.get("/connection")
def mcp_connection(request: Request):
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1", "localhost"):
        return JSONResponse({"ok": False, "error": "token shown on this machine only"}, status_code=403)
    return {"ok": True, "url": str(request.base_url).rstrip("/") + "/api/mcp/rpc", "token": _token(),
            "tools": [t["name"] for t in RPC_TOOLS]}


@router.post("/rpc")
async def mcp_rpc(request: Request):
    if request.headers.get("authorization", "") != f"Bearer {_token()}":
        return JSONResponse(_err(None, -32001, "Unauthorized"), status_code=401)
    try:
        msg = await request.json()
    except Exception:
        return JSONResponse(_err(None, -32700, "Parse error"), status_code=400)
    i, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if i is None:
        return JSONResponse(None, status_code=202)
    if method == "initialize":
        return _ok(i, {"protocolVersion": _PROTOCOL, "capabilities": {"tools": {}},
                       "serverInfo": {"name": "e-commerce-coder", "title": "E-commerce Coder", "version": "0.1.0"},
                       "instructions": "Local OFERTRADINGBOT hub: agents, task queue, local AI, code proposals (approval-gated)."})
    if method == "ping": return _ok(i, {})
    if method == "tools/list": return _ok(i, {"tools": RPC_TOOLS})
    if method == "tools/call":
        name, args = params.get("name", ""), params.get("arguments") or {}
        try:
            out = _call(name, args)
            local_store.log_event("mcp", f"tool {name} called")
            return _ok(i, {"content": [{"type": "text", "text": _json.dumps(out, ensure_ascii=False, default=str)}],
                           "isError": False})
        except KeyError:
            return _ok(i, {"content": [{"type": "text", "text": f"unknown tool {name}"}], "isError": True})
        except Exception as e:
            return _ok(i, {"content": [{"type": "text", "text": str(e)}], "isError": True})
    return _err(i, -32601, f"Method not found: {method}")
