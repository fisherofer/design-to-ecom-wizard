# OFERTRADINGBOT - Market Microstructure Router
"""
Options chain, quote depth (Level 1/2 where available) and time & sales.

Data source: yfinance (free, delayed). Rules of the house:
  * Zero fabricated prices. If a field is unavailable the response says so
    explicitly via `available: false` + `reason`, never a synthetic number.
  * yfinance exposes NBBO (bid/ask/size) only -> that is Level 1. True Level 2
    depth requires a paid feed (Polygon / Alpaca / IEX DEEP); the endpoint
    reports `depth_available: false` in that case so the UI can label it.
  * Time & sales is reconstructed from 1-minute intraday bars (yfinance has no
    tick tape). Each row is flagged `granularity: "1m-bar"` for honesty.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Microstructure"])


def _yf():
    try:
        import yfinance as yf  # noqa: PLC0415 - optional dependency
        return yf
    except Exception as exc:  # pragma: no cover - env dependent
        logger.warning("yfinance unavailable: %s", exc)
        return None


# --------------------------------------------------------------------------
# Options chain
# --------------------------------------------------------------------------
@router.get("/options/{symbol}")
def options_chain(symbol: str, expiry: str | None = Query(default=None)) -> Dict[str, Any]:
    yf = _yf()
    symbol = symbol.upper().strip()
    if yf is None:
        return {"success": False, "symbol": symbol, "available": False,
                "reason": "yfinance is not installed in the backend venv."}
    try:
        ticker = yf.Ticker(symbol)
        expiries: List[str] = list(ticker.options or [])
        if not expiries:
            return {"success": True, "symbol": symbol, "available": False,
                    "reason": "No listed options for this symbol.", "expiries": []}
        chosen = expiry if expiry in expiries else expiries[0]
        chain = ticker.option_chain(chosen)

        def rows(frame) -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            for rec in frame.to_dict("records"):
                out.append({
                    "contract": rec.get("contractSymbol"),
                    "strike": _f(rec.get("strike")),
                    "last": _f(rec.get("lastPrice")),
                    "bid": _f(rec.get("bid")),
                    "ask": _f(rec.get("ask")),
                    "volume": _i(rec.get("volume")),
                    "open_interest": _i(rec.get("openInterest")),
                    "iv": _f(rec.get("impliedVolatility")),
                    "in_the_money": bool(rec.get("inTheMoney", False)),
                })
            return out

        calls = rows(chain.calls)
        puts = rows(chain.puts)
        call_oi = sum(c["open_interest"] or 0 for c in calls)
        put_oi = sum(p["open_interest"] or 0 for p in puts)
        return {
            "success": True, "symbol": symbol, "available": True,
            "expiries": expiries, "expiry": chosen,
            "calls": calls, "puts": puts,
            "put_call_oi_ratio": round(put_oi / call_oi, 3) if call_oi else None,
            "source": "yfinance", "delayed": True,
        }
    except Exception as exc:
        logger.exception("options_chain failed")
        return {"success": False, "symbol": symbol, "available": False, "reason": str(exc)}


# --------------------------------------------------------------------------
# Book / depth (Level 1 via yfinance, Level 2 only with a paid feed)
# --------------------------------------------------------------------------
@router.get("/book/{symbol}")
def order_book(symbol: str) -> Dict[str, Any]:
    yf = _yf()
    symbol = symbol.upper().strip()
    if yf is None:
        return {"success": False, "symbol": symbol, "available": False,
                "reason": "yfinance is not installed in the backend venv."}
    try:
        raw = yf.Ticker(symbol).info or {}
        bid = _f(raw.get("bid"))
        ask = _f(raw.get("ask"))
        bid_size = _i(raw.get("bidSize"))
        ask_size = _i(raw.get("askSize"))
        last = _f(raw.get("currentPrice") or raw.get("regularMarketPrice"))
        spread = round(ask - bid, 4) if (bid and ask) else None
        return {
            "success": True, "symbol": symbol,
            "available": bool(bid or ask),
            "level": 1,
            "depth_available": False,
            "reason": None if (bid or ask) else "No NBBO quote returned (market closed or unsupported symbol).",
            "note": "Level 2 depth requires a paid feed (Polygon / Alpaca / IEX DEEP).",
            "bid": bid, "ask": ask, "bid_size": bid_size, "ask_size": ask_size,
            "last": last, "spread": spread,
            "spread_bps": round((spread / last) * 10000, 2) if (spread and last) else None,
            "source": "yfinance", "delayed": True,
        }
    except Exception as exc:
        logger.exception("order_book failed")
        return {"success": False, "symbol": symbol, "available": False, "reason": str(exc)}


# --------------------------------------------------------------------------
# Time & sales (reconstructed from 1m bars)
# --------------------------------------------------------------------------
@router.get("/tape/{symbol}")
def time_and_sales(symbol: str, limit: int = Query(default=60, ge=1, le=390)) -> Dict[str, Any]:
    yf = _yf()
    symbol = symbol.upper().strip()
    if yf is None:
        return {"success": False, "symbol": symbol, "available": False,
                "reason": "yfinance is not installed in the backend venv."}
    try:
        hist = yf.Ticker(symbol).history(period="1d", interval="1m")
        if hist is None or hist.empty:
            return {"success": True, "symbol": symbol, "available": False,
                    "reason": "No intraday bars (market closed or unsupported symbol).", "prints": []}
        prints: List[Dict[str, Any]] = []
        prev_close = None
        for ts, row in hist.tail(limit).iterrows():
            close = _f(row.get("Close"))
            side = "flat"
            if prev_close is not None and close is not None:
                side = "buy" if close > prev_close else "sell" if close < prev_close else "flat"
            prints.append({
                "ts": ts.isoformat(),
                "price": close,
                "size": _i(row.get("Volume")),
                "side": side,
                "granularity": "1m-bar",
            })
            prev_close = close
        prints.reverse()
        buy_vol = sum(p["size"] or 0 for p in prints if p["side"] == "buy")
        sell_vol = sum(p["size"] or 0 for p in prints if p["side"] == "sell")
        total = buy_vol + sell_vol
        return {
            "success": True, "symbol": symbol, "available": True,
            "prints": prints,
            "buy_volume": buy_vol, "sell_volume": sell_vol,
            "buy_pressure_pct": round(buy_vol / total * 100, 1) if total else None,
            "source": "yfinance", "delayed": True,
            "note": "Tick tape unavailable on free feeds - rows are 1-minute bars.",
        }
    except Exception as exc:
        logger.exception("time_and_sales failed")
        return {"success": False, "symbol": symbol, "available": False, "reason": str(exc)}


def _f(v: Any) -> float | None:
    try:
        f = float(v)
        return None if f != f else round(f, 4)
    except (TypeError, ValueError):
        return None


def _i(v: Any) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None
