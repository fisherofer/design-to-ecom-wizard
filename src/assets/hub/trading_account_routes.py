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


@router.get("/positions")
async def get_positions() -> Dict[str, Any]:
    """
    Live broker positions used by the UI's reconciliation view.

    Never fabricates a book: when credentials or connectivity are missing an
    empty list is returned together with an explicit `error` string so the
    frontend can flag the local book as unverified.
    """
    creds = _credentials()
    if not creds["key"] or not creds["secret"]:
        return {
            "positions": [],
            "is_simulated": True,
            "as_of": _utc_now_iso(),
            "error": "ALPACA_API_KEY / ALPACA_SECRET_KEY are not configured in the environment.",
        }
    if httpx is None:
        return {
            "positions": [],
            "is_simulated": True,
            "as_of": _utc_now_iso(),
            "error": "httpx is not installed in the backend venv.",
        }

    url = f"{_resolve_base_url()}/v2/positions"
    headers = {
        "APCA-API-KEY-ID": creds["key"],
        "APCA-API-SECRET-KEY": creds["secret"],
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
    except Exception as err:
        return {"positions": [], "is_simulated": True, "as_of": _utc_now_iso(), "error": f"Alpaca request failed: {err}"}

    if response.status_code >= 400:
        return {
            "positions": [],
            "is_simulated": True,
            "as_of": _utc_now_iso(),
            "error": f"Alpaca returned HTTP {response.status_code}",
        }

    raw = response.json()
    positions = [
        {
            "symbol": str(item.get("symbol", "")),
            "qty": _to_float(item.get("qty")),
            "avg_entry_price": _to_float(item.get("avg_entry_price")),
            "current_price": _to_float(item.get("current_price")),
            "market_value": _to_float(item.get("market_value")),
            "unrealized_pl": _to_float(item.get("unrealized_pl")),
            "unrealized_plpc": _to_float(item.get("unrealized_plpc")),
            "side": str(item.get("side", "long")),
        }
        for item in (raw if isinstance(raw, list) else [])
    ]
    return {
        "positions": positions,
        "count": len(positions),
        "open_interest": round(sum(abs(p["market_value"]) for p in positions), 2),
        "unrealized_pl": round(sum(p["unrealized_pl"] for p in positions), 2),
        "is_simulated": False,
        "as_of": _utc_now_iso(),
    }


# ---------------------------------------------------------------------------
# Real broker order routing (Alpaca). Stage 1 = paper endpoint only.
# ---------------------------------------------------------------------------

from pydantic import BaseModel, Field  # noqa: E402


class BracketOrderRequest(BaseModel):
    """A parent entry order with optional protective stop and target legs."""

    symbol: str
    side: str = Field(pattern="^(?i)(buy|sell)$")
    qty: float = Field(gt=0)
    type: str = Field(default="market", pattern="^(?i)(market|limit)$")
    time_in_force: str = Field(default="day", pattern="^(?i)(day|gtc|ioc|fok|opg|cls)$")
    limit_price: float | None = None
    stop_price: float | None = None
    target_price: float | None = None
    client_order_id: str | None = None
    extended_hours: bool = False


def _auth_headers() -> Dict[str, str] | None:
    creds = _credentials()
    if not creds["key"] or not creds["secret"]:
        return None
    return {
        "APCA-API-KEY-ID": creds["key"],
        "APCA-API-SECRET-KEY": creds["secret"],
        "Content-Type": "application/json",
    }


def _shape_order(item: Dict[str, Any]) -> Dict[str, Any]:
    """Normalises an Alpaca order payload into the OS contract."""
    legs = item.get("legs") or []
    return {
        "broker_order_id": str(item.get("id", "")),
        "client_order_id": item.get("client_order_id"),
        "symbol": str(item.get("symbol", "")),
        "side": str(item.get("side", "")).upper(),
        "type": str(item.get("type", "")).upper(),
        "time_in_force": str(item.get("time_in_force", "")).upper(),
        "qty": _to_float(item.get("qty")),
        "filled_qty": _to_float(item.get("filled_qty")),
        "filled_avg_price": _to_float(item.get("filled_avg_price")),
        "limit_price": _to_float(item.get("limit_price")) or None,
        "stop_price": _to_float(item.get("stop_price")) or None,
        "status": str(item.get("status", "")).upper(),
        "order_class": str(item.get("order_class", "")),
        "submitted_at": item.get("submitted_at"),
        "filled_at": item.get("filled_at"),
        "canceled_at": item.get("canceled_at"),
        "legs": [_shape_order(leg) for leg in legs if isinstance(leg, dict)],
    }


@router.post("/orders")
async def submit_bracket_order(payload: BracketOrderRequest) -> Dict[str, Any]:
    """
    Submits a real bracket order to the broker.

    Returns `accepted: false` with an explicit `error` when credentials or
    connectivity are missing — the order is never silently pretended to exist.
    """
    headers = _auth_headers()
    if headers is None:
        return {
            "accepted": False,
            "error": "ALPACA_API_KEY / ALPACA_SECRET_KEY are not configured in the environment.",
            "as_of": _utc_now_iso(),
        }
    if httpx is None:
        return {"accepted": False, "error": "httpx is not installed in the backend venv.", "as_of": _utc_now_iso()}

    body: Dict[str, Any] = {
        "symbol": payload.symbol.upper().strip(),
        "side": payload.side.lower(),
        "qty": str(payload.qty),
        "type": payload.type.lower(),
        "time_in_force": payload.time_in_force.lower(),
        "extended_hours": payload.extended_hours,
    }
    if payload.type.lower() == "limit":
        if not payload.limit_price:
            raise HTTPException(status_code=422, detail="limit_price is required for a LIMIT order.")
        body["limit_price"] = str(payload.limit_price)
    if payload.client_order_id:
        body["client_order_id"] = payload.client_order_id[:48]

    has_stop = bool(payload.stop_price)
    has_target = bool(payload.target_price)
    if has_stop and has_target:
        body["order_class"] = "bracket"
        body["stop_loss"] = {"stop_price": str(payload.stop_price)}
        body["take_profit"] = {"limit_price": str(payload.target_price)}
    elif has_stop or has_target:
        body["order_class"] = "oto"
        if has_stop:
            body["stop_loss"] = {"stop_price": str(payload.stop_price)}
        else:
            body["take_profit"] = {"limit_price": str(payload.target_price)}

    url = f"{_resolve_base_url()}/v2/orders"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, json=body)
    except Exception as err:
        return {"accepted": False, "error": f"Alpaca request failed: {err}", "as_of": _utc_now_iso()}

    if response.status_code >= 400:
        detail = ""
        try:
            detail = str(response.json().get("message", ""))
        except Exception:
            detail = response.text[:300]
        return {
            "accepted": False,
            "error": f"Alpaca rejected the order (HTTP {response.status_code}): {detail}",
            "as_of": _utc_now_iso(),
        }

    return {"accepted": True, "order": _shape_order(response.json()), "as_of": _utc_now_iso()}


@router.get("/orders")
async def list_broker_orders(status: str = "open", limit: int = 100) -> Dict[str, Any]:
    """Lists real broker orders so the local book can be reconciled against them."""
    headers = _auth_headers()
    if headers is None:
        return {"orders": [], "is_simulated": True, "as_of": _utc_now_iso(),
                "error": "ALPACA_API_KEY / ALPACA_SECRET_KEY are not configured in the environment."}
    if httpx is None:
        return {"orders": [], "is_simulated": True, "as_of": _utc_now_iso(),
                "error": "httpx is not installed in the backend venv."}

    url = f"{_resolve_base_url()}/v2/orders"
    params = {"status": status, "limit": max(1, min(limit, 500)), "nested": "true"}
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except Exception as err:
        return {"orders": [], "is_simulated": True, "as_of": _utc_now_iso(), "error": f"Alpaca request failed: {err}"}

    if response.status_code >= 400:
        return {"orders": [], "is_simulated": True, "as_of": _utc_now_iso(),
                "error": f"Alpaca returned HTTP {response.status_code}"}

    raw = response.json()
    orders = [_shape_order(item) for item in (raw if isinstance(raw, list) else []) if isinstance(item, dict)]
    return {"orders": orders, "count": len(orders), "is_simulated": False, "as_of": _utc_now_iso()}


@router.delete("/orders/{broker_order_id}")
async def cancel_broker_order(broker_order_id: str) -> Dict[str, Any]:
    """Cancels a single working broker order."""
    headers = _auth_headers()
    if headers is None:
        return {"cancelled": False, "error": "Alpaca credentials are not configured.", "as_of": _utc_now_iso()}
    if httpx is None:
        return {"cancelled": False, "error": "httpx is not installed in the backend venv.", "as_of": _utc_now_iso()}

    url = f"{_resolve_base_url()}/v2/orders/{broker_order_id}"
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.delete(url, headers=headers)
    except Exception as err:
        return {"cancelled": False, "error": f"Alpaca request failed: {err}", "as_of": _utc_now_iso()}

    ok = response.status_code in (200, 204)
    return {
        "cancelled": ok,
        "broker_order_id": broker_order_id,
        "error": None if ok else f"Alpaca returned HTTP {response.status_code}",
        "as_of": _utc_now_iso(),
    }


@router.delete("/orders")
async def cancel_all_broker_orders() -> Dict[str, Any]:
    """Cancels every working broker order — used by the emergency kill-switch."""
    headers = _auth_headers()
    if headers is None:
        return {"cancelled": 0, "error": "Alpaca credentials are not configured.", "as_of": _utc_now_iso()}
    if httpx is None:
        return {"cancelled": 0, "error": "httpx is not installed in the backend venv.", "as_of": _utc_now_iso()}

    url = f"{_resolve_base_url()}/v2/orders"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.delete(url, headers=headers)
    except Exception as err:
        return {"cancelled": 0, "error": f"Alpaca request failed: {err}", "as_of": _utc_now_iso()}

    if response.status_code >= 400:
        return {"cancelled": 0, "error": f"Alpaca returned HTTP {response.status_code}", "as_of": _utc_now_iso()}

    try:
        body = response.json()
        count = len(body) if isinstance(body, list) else 0
    except Exception:
        count = 0
    return {"cancelled": count, "error": None, "as_of": _utc_now_iso()}
