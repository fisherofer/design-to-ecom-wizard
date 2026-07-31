# OFERTRADINGBOT - Quotes Router
"""
Unified quote endpoint with provider fallback chain and an in-process TTL cache.

Design rules (Ofer protocol):
  * Zero hardcoded tickers - the caller always supplies the symbols.
  * Zero fabricated prices - if every provider fails the response says so.
  * Credentials come from the environment only; never from the request body.
  * Stage-1 safety: only read-only market-data providers are contacted here.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter()

CACHE_TTL_SEC = float(os.environ.get("QUOTES_CACHE_TTL_SEC", "5"))
HTTP_TIMEOUT_SEC = float(os.environ.get("QUOTES_HTTP_TIMEOUT_SEC", "8"))
MAX_SYMBOLS = int(os.environ.get("QUOTES_MAX_SYMBOLS", "50"))

_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}


def _cache_get(symbol: str) -> Optional[Dict[str, Any]]:
    hit = _cache.get(symbol)
    if not hit:
        return None
    ts, payload = hit
    if (time.time() - ts) > CACHE_TTL_SEC:
        _cache.pop(symbol, None)
        return None
    return payload


def _cache_put(symbol: str, payload: Dict[str, Any]) -> None:
    _cache[symbol] = (time.time(), payload)


def _parse_symbols(symbols: str) -> List[str]:
    out: List[str] = []
    for raw in symbols.split(","):
        s = raw.strip().upper()
        if s and s not in out:
            out.append(s)
    if not out:
        raise HTTPException(status_code=400, detail="at least one symbol is required")
    if len(out) > MAX_SYMBOLS:
        raise HTTPException(status_code=400, detail=f"max {MAX_SYMBOLS} symbols per request")
    return out


# --------------------------------------------------------------------------- #
# Providers. Each returns a normalized dict or raises.                          #
# --------------------------------------------------------------------------- #

def _norm(symbol: str, provider: str, price: float, **extra: Any) -> Dict[str, Any]:
    return {
        "symbol": symbol,
        "provider": provider,
        "price": float(price),
        "ts": time.time(),
        **{k: v for k, v in extra.items() if v is not None},
    }


async def _from_alpaca(client: httpx.AsyncClient, symbol: str) -> Dict[str, Any]:
    key = os.environ.get("ALPACA_API_KEY")
    secret = os.environ.get("ALPACA_SECRET_KEY")
    if not key or not secret:
        raise RuntimeError("ALPACA_API_KEY/ALPACA_SECRET_KEY not set")
    base = os.environ.get("ALPACA_DATA_URL", "https://data.alpaca.markets")
    res = await client.get(
        f"{base}/v2/stocks/{symbol}/quotes/latest",
        headers={"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret},
    )
    res.raise_for_status()
    q = (res.json() or {}).get("quote") or {}
    bid, ask = q.get("bp"), q.get("ap")
    if not bid and not ask:
        raise RuntimeError("empty alpaca quote")
    price = (float(bid or 0) + float(ask or 0)) / (2 if bid and ask else 1)
    return _norm(symbol, "alpaca", price, bid=bid, ask=ask, source_ts=q.get("t"))


async def _from_finnhub(client: httpx.AsyncClient, symbol: str) -> Dict[str, Any]:
    key = os.environ.get("FINNHUB_API_KEY")
    if not key:
        raise RuntimeError("FINNHUB_API_KEY not set")
    res = await client.get(
        "https://finnhub.io/api/v1/quote", params={"symbol": symbol, "token": key}
    )
    res.raise_for_status()
    d = res.json() or {}
    if not d.get("c"):
        raise RuntimeError("empty finnhub quote")
    return _norm(
        symbol,
        "finnhub",
        d["c"],
        change=d.get("d"),
        change_pct=d.get("dp"),
        high=d.get("h"),
        low=d.get("l"),
        open=d.get("o"),
        prev_close=d.get("pc"),
    )


async def _from_twelvedata(client: httpx.AsyncClient, symbol: str) -> Dict[str, Any]:
    key = os.environ.get("TWELVEDATA_API_KEY")
    if not key:
        raise RuntimeError("TWELVEDATA_API_KEY not set")
    res = await client.get(
        "https://api.twelvedata.com/price", params={"symbol": symbol, "apikey": key}
    )
    res.raise_for_status()
    d = res.json() or {}
    if "price" not in d:
        raise RuntimeError(str(d.get("message") or "empty twelvedata quote"))
    return _norm(symbol, "twelvedata", d["price"])


async def _from_alphavantage(client: httpx.AsyncClient, symbol: str) -> Dict[str, Any]:
    key = os.environ.get("ALPHAVANTAGE_API_KEY")
    if not key:
        raise RuntimeError("ALPHAVANTAGE_API_KEY not set")
    res = await client.get(
        "https://www.alphavantage.co/query",
        params={"function": "GLOBAL_QUOTE", "symbol": symbol, "apikey": key},
    )
    res.raise_for_status()
    q = (res.json() or {}).get("Global Quote") or {}
    price = q.get("05. price")
    if not price:
        raise RuntimeError("empty alphavantage quote")
    return _norm(
        symbol,
        "alphavantage",
        price,
        prev_close=q.get("08. previous close"),
        change_pct=(q.get("10. change percent") or "").rstrip("%") or None,
    )


PROVIDER_CHAIN = [
    ("alpaca", _from_alpaca),
    ("finnhub", _from_finnhub),
    ("twelvedata", _from_twelvedata),
    ("alphavantage", _from_alphavantage),
]


def _configured_providers() -> Dict[str, bool]:
    return {
        "alpaca": bool(os.environ.get("ALPACA_API_KEY") and os.environ.get("ALPACA_SECRET_KEY")),
        "finnhub": bool(os.environ.get("FINNHUB_API_KEY")),
        "twelvedata": bool(os.environ.get("TWELVEDATA_API_KEY")),
        "alphavantage": bool(os.environ.get("ALPHAVANTAGE_API_KEY")),
    }


@router.get("/health")
def quotes_health() -> Dict[str, Any]:
    """Reports which providers hold credentials. Never leaks the key values."""
    configured = _configured_providers()
    return {
        "ok": any(configured.values()),
        "providers": configured,
        "chain": [name for name, _ in PROVIDER_CHAIN],
        "cache_ttl_sec": CACHE_TTL_SEC,
        "cached_symbols": len(_cache),
        "missing": [name for name, ready in configured.items() if not ready],
    }


@router.get("/quote")
async def quote(
    symbols: str = Query(..., description="Comma separated symbols, e.g. AAPL,MSFT"),
    provider: Optional[str] = Query(None, description="Force a single provider"),
    fresh: bool = Query(False, description="Bypass the TTL cache"),
) -> Dict[str, Any]:
    """Returns live quotes with per-symbol provider attribution and errors."""
    wanted = _parse_symbols(symbols)
    chain = PROVIDER_CHAIN
    if provider:
        chain = [(n, f) for n, f in PROVIDER_CHAIN if n == provider]
        if not chain:
            raise HTTPException(status_code=400, detail=f"unknown provider '{provider}'")

    if not any(_configured_providers().values()):
        raise HTTPException(
            status_code=503,
            detail="no market-data provider configured; set ALPACA/FINNHUB/TWELVEDATA/ALPHAVANTAGE keys",
        )

    results: Dict[str, Any] = {}
    errors: Dict[str, List[str]] = {}

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SEC) as client:
        for symbol in wanted:
            if not fresh:
                cached = _cache_get(symbol)
                if cached:
                    results[symbol] = {**cached, "cached": True}
                    continue
            attempts: List[str] = []
            for name, fn in chain:
                try:
                    payload = await fn(client, symbol)
                    _cache_put(symbol, payload)
                    results[symbol] = {**payload, "cached": False}
                    break
                except Exception as exc:  # noqa: BLE001 - fallback chain
                    attempts.append(f"{name}: {exc}")
            else:
                errors[symbol] = attempts

    return {
        "ok": len(results) > 0,
        "count": len(results),
        "quotes": results,
        "errors": errors,
        "requested": wanted,
    }


@router.post("/cache/clear")
def clear_cache() -> Dict[str, Any]:
    """Drops every cached quote so the next read hits the providers."""
    n = len(_cache)
    _cache.clear()
    return {"ok": True, "cleared": n}
