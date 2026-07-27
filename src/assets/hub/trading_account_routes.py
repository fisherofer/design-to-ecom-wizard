# OFERTRADINGBOT - Real Trading Account Routes
"""
Exposes the real brokerage account state.

Data source: Alpaca `/v2/account` (PAPER TRADING ONLY in Stage 1).
Credentials come exclusively from environment variables — never hardcoded.

Endpoints
---------
GET /api/account/summary  -> equity, buying_power, day_pnl, maintenance_margin
GET /api/account/health   -> connectivity/diagnostic probe
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

try:
    import httpx
except ImportError:  # pragma: no cover - dependency guard
    httpx = None  # type: ignore[assignment]

try:
    from config import MARKET_DATA_SOURCES
except ImportError:  # pragma: no cover - optional registry
    MARKET_DATA_SOURCES: Dict[str, Any] = {}

router = APIRouter()

DEFAULT_PAPER_BASE = "https://paper-api.alpaca.markets"


def _utc_now_iso() -> str:
    """Returns the real current UTC timestamp in ISO-8601 form."""
    return datetime.now(timezone.utc).isoformat()


def _resolve_base_url() -> str:
    """
    Resolves the Alpaca base URL from the market-data source registry or env.
    Stage 1 hard-forces the paper endpoint regardless of configuration.
    """
    registry_entry = MARKET_DATA_SOURCES.get("alpaca", {}) if isinstance(MARKET_DATA_SOURCES, dict) else {}
    base = (
        os.environ.get("ALPACA_BASE_URL")
        or (registry_entry.get("base_url") if isinstance(registry_entry, dict) else None)
        or DEFAULT_PAPER_BASE
    )
    if os.environ.get("TRADING_STAGE", "1") == "1" and "paper-api" not in base:
        base = DEFAULT_PAPER_BASE
    return base.rstrip("/")


def _credentials() -> Dict[str, str]:
    """Reads Alpaca credentials strictly from the environment."""
    key = os.environ.get("ALPACA_API_KEY", "").strip()
    secret = os.environ.get("ALPACA_SECRET_KEY", "").strip()
    return {"key": key, "secret": secret}


def _to_float(raw: Any, default: float = 0.0) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _shape_summary(payload: Dict[str, Any], simulated: bool) -> Dict[str, Any]:
    """Normalizes the raw Alpaca account payload into the OS contract."""
    equity = _to_float(payload.get("equity"))
    last_equity = _to_float(payload.get("last_equity"), equity)
    return {
        "equity": round(equity, 2),
        "buying_power": round(_to_float(payload.get("buying_power")), 2),
        "day_pnl": round(equity - last_equity, 2),
        "day_pnl_pct": round(((equity - last_equity) / last_equity * 100.0) if last_equity else 0.0, 4),
        "maintenance_margin": round(_to_float(payload.get("maintenance_margin")), 2),
        "cash": round(_to_float(payload.get("cash")), 2),
        "currency": payload.get("currency", "USD"),
        "account_status": payload.get("status", "UNKNOWN"),
        "pattern_day_trader": bool(payload.get("pattern_day_trader", False)),
        "trading_blocked": bool(payload.get("trading_blocked", False)),
        "is_simulated": simulated,
        "source": "alpaca-paper" if not simulated else "unavailable",
        "as_of": _utc_now_iso(),
    }


@router.get("/summary")
async def get_account_summary() -> Dict[str, Any]:
    """
    Returns the live paper-trading account summary from Alpaca.

    Never fabricates balances: when credentials or connectivity are missing the
    response is zeroed and explicitly marked with `is_simulated: true`.
    """
    creds = _credentials()
    if not creds["key"] or not creds["secret"]:
        return _shape_summary({}, simulated=True) | {
            "error": "ALPACA_API_KEY / ALPACA_SECRET_KEY are not configured in the environment.",
        }

    if httpx is None:
        return _shape_summary({}, simulated=True) | {"error": "httpx is not installed in the backend venv."}

    url = f"{_resolve_base_url()}/v2/account"
    headers = {
        "APCA-API-KEY-ID": creds["key"],
        "APCA-API-SECRET-KEY": creds["secret"],
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
    except Exception as err:  # network failure
        return _shape_summary({}, simulated=True) | {"error": f"Alpaca request failed: {err}"}

    if response.status_code == 401 or response.status_code == 403:
        raise HTTPException(status_code=502, detail="Alpaca rejected the configured credentials.")
    if response.status_code >= 400:
        return _shape_summary({}, simulated=True) | {
            "error": f"Alpaca returned HTTP {response.status_code}",
        }

    return _shape_summary(response.json(), simulated=False)


@router.get("/health")
async def get_account_health() -> Dict[str, Any]:
    """Lightweight probe used by the UI to render connectivity state."""
    creds = _credentials()
    return {
        "credentials_present": bool(creds["key"] and creds["secret"]),
        "base_url": _resolve_base_url(),
        "trading_stage": os.environ.get("TRADING_STAGE", "1"),
        "http_client": "httpx" if httpx is not None else "missing",
        "checked_at": _utc_now_iso(),
    }
