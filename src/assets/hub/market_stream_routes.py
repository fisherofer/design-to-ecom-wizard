# 24/07/2026
"""
OFERTRADINGBOT - Market Data Stream API Routes
Exposes market_data_stream endpoints for live ticker streams, market snapshots, and alerts.
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List

try:
    from market_data_stream import MarketDataStream
    stream_engine = MarketDataStream()
except Exception:
    stream_engine = None

router = APIRouter()

@router.get("/status")
def get_stream_status() -> Dict[str, Any]:
    """Returns streaming engine status."""
    return {
        "status": "ACTIVE" if stream_engine else "SIMULATED",
        "active_symbols": ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "BTC/USDT", "ETH/USDT"],
        "stream_rate_hz": 10
    }

@router.get("/snapshot")
def get_market_snapshot() -> Dict[str, Any]:
    """Returns latest live market snapshot."""
    if stream_engine and hasattr(stream_engine, "get_latest_prices"):
        return stream_engine.get_latest_prices()
    
    return {
        "timestamp": "2026-07-24T14:00:00Z",
        "symbols": {
            "NVDA": {"price": 128.50, "change_pct": 2.4, "volume": 45000000},
            "BTC/USDT": {"price": 64200.0, "change_pct": 1.1, "volume": 12000},
            "AAPL": {"price": 224.30, "change_pct": -0.5, "volume": 32000000}
        }
    }
