# OFERTRADINGBOT - Market Data Stream API Routes
"""
Exposes market_data_stream endpoints for live ticker streams, market snapshots
and alerts.

Zero hardcoding: the active symbol universe is resolved dynamically from the
watchlist persisted in SQLite (or the JSON config fallback). Any response that
is not backed by a live stream is explicitly marked with `is_simulated: true`
and carries a real UTC timestamp.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter

try:
    from market_data_stream import MarketDataStream

    stream_engine = MarketDataStream()
except Exception:  # engine unavailable -> simulated mode
    stream_engine = None

router = APIRouter()


def _utc_now_iso() -> str:
    """Returns the actual current UTC time (never a frozen literal)."""
    return datetime.now(timezone.utc).isoformat()


def _root_dir() -> Path:
    """Dynamic project root — resolved from this file, no drive letters."""
    return Path(__file__).resolve().parent.parent


def _db_path() -> Path:
    return Path(os.environ.get("OFER_DB_PATH", str(_root_dir() / "data" / "ofertradingbot.db")))


def _watchlist_from_sqlite() -> List[str]:
    """Reads the active watchlist symbols from the timeseries/state database."""
    db_file = _db_path()
    if not db_file.exists():
        return []
    try:
        connection = sqlite3.connect(str(db_file))
        try:
            cursor = connection.execute(
                "SELECT symbol FROM watchlist WHERE active = 1 ORDER BY symbol ASC"
            )
            return [str(row[0]).upper() for row in cursor.fetchall() if row and row[0]]
        finally:
            connection.close()
    except Exception:
        return []


def _watchlist_from_config() -> List[str]:
    """Fallback: reads the watchlist from the JSON configuration file."""
    config_file = Path(
        os.environ.get("OFER_WATCHLIST_FILE", str(_root_dir() / "config" / "watchlist.json"))
    )
    if not config_file.exists():
        return []
    try:
        payload = json.loads(config_file.read_text(encoding="utf-8"))
    except Exception:
        return []
    if isinstance(payload, list):
        return [str(item).upper() for item in payload if str(item).strip()]
    if isinstance(payload, dict):
        symbols = payload.get("symbols") or payload.get("watchlist") or []
        if isinstance(symbols, list):
            return [str(item).upper() for item in symbols if str(item).strip()]
    return []


def get_active_symbols() -> List[str]:
    """
    Resolves the active symbol universe dynamically.

    Order: live stream engine subscriptions -> SQLite watchlist -> JSON config
    -> environment override. Returns an empty list when nothing is configured;
    the caller must never substitute hardcoded tickers.
    """
    if stream_engine is not None and hasattr(stream_engine, "get_subscribed_symbols"):
        try:
            live = stream_engine.get_subscribed_symbols()  # type: ignore[attr-defined]
            if live:
                return [str(symbol).upper() for symbol in live]
        except Exception:
            pass

    for resolver in (_watchlist_from_sqlite, _watchlist_from_config):
        symbols = resolver()
        if symbols:
            return symbols

    env_symbols = os.environ.get("OFER_ACTIVE_SYMBOLS", "").strip()
    if env_symbols:
        return [part.strip().upper() for part in env_symbols.split(",") if part.strip()]
    return []


@router.get("/status")
def get_stream_status() -> Dict[str, Any]:
    """Returns streaming engine status with the dynamically resolved universe."""
    symbols = get_active_symbols()
    live = stream_engine is not None
    return {
        "status": "ACTIVE" if live else "SIMULATED",
        "is_simulated": not live,
        "active_symbols": symbols,
        "active_symbol_count": len(symbols),
        "stream_rate_hz": int(os.environ.get("OFER_STREAM_RATE_HZ", "10")),
        "timestamp": _utc_now_iso(),
    }


@router.get("/snapshot")
def get_market_snapshot() -> Dict[str, Any]:
    """
    Returns the latest live market snapshot.

    When the stream engine is unavailable the response is explicitly flagged
    with `is_simulated: true` and contains no fabricated prices.
    """
    if stream_engine is not None and hasattr(stream_engine, "get_latest_prices"):
        try:
            prices = stream_engine.get_latest_prices()
            if isinstance(prices, dict) and "symbols" in prices:
                payload = dict(prices)
            else:
                payload = {"symbols": prices}
            payload.setdefault("timestamp", _utc_now_iso())
            payload["is_simulated"] = False
            return payload
        except Exception as err:
            return {
                "timestamp": _utc_now_iso(),
                "is_simulated": True,
                "symbols": {},
                "error": f"stream engine failure: {err}",
            }

    return {
        "timestamp": _utc_now_iso(),
        "is_simulated": True,
        "symbols": {symbol: None for symbol in get_active_symbols()},
        "error": "Market data stream engine is offline — no live prices available.",
    }


@router.get("/watchlist")
def get_watchlist() -> Dict[str, Any]:
    """Returns the resolved watchlist and where it was loaded from."""
    sqlite_symbols = _watchlist_from_sqlite()
    config_symbols = _watchlist_from_config()
    source = "sqlite" if sqlite_symbols else ("config" if config_symbols else "env-or-empty")
    return {
        "symbols": get_active_symbols(),
        "source": source,
        "db_path": str(_db_path()),
        "timestamp": _utc_now_iso(),
    }
