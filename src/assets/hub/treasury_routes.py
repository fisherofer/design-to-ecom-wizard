# hub/treasury_routes.py
"""
FastAPI router for the growth treasury: ad revenue + optional coin mining that
funds future server rent.

Mount with: app.include_router(treasury_routes.router, prefix="/api/treasury")

Honesty rules baked in:
  * No miner is bundled. The user points the system at their own miner binary
    (xmrig, ccminer, ...). Without a configured binary the endpoints report
    'not configured' — they never simulate a hashrate.
  * Earnings are only recorded from a real source: the miner's own HTTP API,
    a pool payout URL, or an ad-network report the user pastes in.
"""
from __future__ import annotations

import json
import shlex
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hub import local_store

router = APIRouter(tags=["treasury"])

CONFIG_KEY = "treasury_config"
_proc: dict[str, Any] = {"popen": None, "started_at": None, "cmd": None}


class MinerConfig(BaseModel):
    binary_path: str = ""
    args: str = ""
    api_url: str = ""          # miner local stats API, e.g. http://127.0.0.1:8080/2/summary
    pool_payout_url: str = ""  # pool API returning real paid balance
    enabled: bool = False


def _config() -> dict[str, Any]:
    stored = local_store.kv_get("system", CONFIG_KEY)
    return stored.get("value") or {}


@router.get("/config")
def get_config() -> dict:
    cfg = _config()
    return {"ok": True, "configured": bool(cfg.get("binary_path")), "config": cfg}


@router.post("/config")
def set_config(body: MinerConfig) -> dict:
    cfg = body.model_dump()
    if cfg["binary_path"] and not Path(cfg["binary_path"]).exists():
        raise HTTPException(status_code=400, detail={"ok": False, "error": "binary_path does not exist"})
    local_store.kv_set("system", CONFIG_KEY, cfg)
    local_store.log_event("treasury", "miner configuration updated", "info")
    return {"ok": True, "config": cfg}


@router.post("/miner/start")
def start_miner() -> dict:
    cfg = _config()
    if not cfg.get("enabled") or not cfg.get("binary_path"):
        raise HTTPException(status_code=400, detail={"ok": False, "error": "miner not configured or disabled"})
    if _proc["popen"] and _proc["popen"].poll() is None:
        return {"ok": True, "already_running": True, "started_at": _proc["started_at"]}
    cmd = [cfg["binary_path"], *shlex.split(cfg.get("args", ""))]
    try:
        _proc["popen"] = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)}) from e
    _proc["started_at"] = time.time()
    _proc["cmd"] = cmd
    local_store.log_event("treasury", "miner started", "info", {"binary": cfg["binary_path"]})
    return {"ok": True, "pid": _proc["popen"].pid, "started_at": _proc["started_at"]}


@router.post("/miner/stop")
def stop_miner() -> dict:
    popen = _proc["popen"]
    if popen and popen.poll() is None:
        popen.terminate()
        local_store.log_event("treasury", "miner stopped", "info")
        return {"ok": True, "stopped": True}
    return {"ok": True, "stopped": False, "detail": "miner was not running"}


@router.get("/miner/status")
def miner_status() -> dict:
    cfg = _config()
    popen = _proc["popen"]
    running = bool(popen and popen.poll() is None)
    stats: dict[str, Any] | None = None
    error: str | None = None
    if running and cfg.get("api_url"):
        try:
            with urllib.request.urlopen(cfg["api_url"], timeout=5) as res:
                stats = json.loads(res.read().decode("utf-8"))
        except Exception as e:
            error = str(e)
    return {
        "ok": True,
        "configured": bool(cfg.get("binary_path")),
        "enabled": bool(cfg.get("enabled")),
        "running": running,
        "started_at": _proc["started_at"],
        "stats": stats,
        "stats_error": error,
    }


class PayoutIn(BaseModel):
    source: str
    amount: float
    currency: str = "USD"
    note: str | None = None
    evidence_url: str | None = None


@router.post("/ledger")
def add_payout(body: PayoutIn) -> dict:
    if body.amount == 0:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "amount must be non-zero"})
    return local_store.add_ledger_entry(
        body.source, body.amount, body.currency, body.note, body.evidence_url
    )


@router.get("/ledger")
def ledger(limit: int = 200) -> dict:
    return local_store.ledger_summary(limit)
