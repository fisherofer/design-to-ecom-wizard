# Path: tests/test_mock_data_guard.py
# Timestamp: 2026-08-06 16:40:00 UTC
# Estimated Lines: 95

"""
Unit tests for OFERTRADINGBOT Mock Data Guard & Dynamic Watchlist Engine.
Tests assertion safety gates, dynamic watchlist loading, and simulation transparency flags.
"""

import sys
import os
import pytest
from pathlib import Path
from datetime import datetime, timezone

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.backend.core.mock_data_guard_engine import (
    RuntimePathResolver,
    DatabasePersistenceEngine,
    MockDataGuardEngine,
    WatchlistEntry
)


@pytest.fixture
def temp_db_engine(tmp_path: Path) -> DatabasePersistenceEngine:
    """Fixture providing an isolated SQLite database for unit tests."""
    db_file = tmp_path / "test_trading_system.sqlite"
    return DatabasePersistenceEngine(db_file)


def test_dynamic_watchlist_loading(temp_db_engine: DatabasePersistenceEngine):
    """Verifies dynamic watchlist initialization and custom ticker additions."""
    guard = MockDataGuardEngine(temp_db_engine)
    watchlist = guard.get_active_watchlist()
    assert len(watchlist) > 0, "Default dynamic watchlist should be populated"

    # Add new dynamic ticker PLTR
    success = guard.add_symbol_to_watchlist("PLTR", asset_type="STOCK", source="USER")
    assert success is True

    updated_watchlist = guard.get_active_watchlist()
    symbols = [item.symbol for item in updated_watchlist]
    assert "PLTR" in symbols, "PLTR should be dynamically added to active watchlist"


def test_live_snapshot_caching_and_flag(temp_db_engine: DatabasePersistenceEngine):
    """Verifies live snapshot caching generates is_simulated=False."""
    guard = MockDataGuardEngine(temp_db_engine)
    payload = guard.generate_market_snapshot("NVDA", live_price=135.50, live_volume=50000.0)

    assert payload["symbol"] == "NVDA"
    assert payload["price"] == 135.50
    assert payload["is_simulated"] is False
    assert payload["fallback_reason"] is None


def test_simulated_snapshot_transparency(temp_db_engine: DatabasePersistenceEngine):
    """Verifies missing live stream triggers transparent is_simulated=True payload."""
    guard = MockDataGuardEngine(temp_db_engine)
    payload = guard.generate_market_snapshot("TSLA", live_price=None, live_volume=None)

    assert payload["symbol"] == "TSLA"
    assert payload["is_simulated"] is True
    assert payload["fallback_reason"] == "LIVE_STREAM_OFFLINE_OR_UNREACHABLE"
    assert "timestamp_utc" in payload


def test_safety_gate_blocks_live_trade_on_simulated_data(temp_db_engine: DatabasePersistenceEngine):
    """Verifies assert_safe_for_live_order raises RuntimeError for LIVE mode on simulated data."""
    guard = MockDataGuardEngine(temp_db_engine)
    simulated_payload = guard.generate_market_snapshot("AMD", live_price=None, live_volume=None)

    # PAPER mode should allow simulated data
    assert guard.assert_safe_for_live_order(simulated_payload, execution_mode="PAPER") is True

    # LIVE mode must block simulated data
    with pytest.raises(RuntimeError) as exc_info:
        guard.assert_safe_for_live_order(simulated_payload, execution_mode="LIVE")

    assert "CRITICAL EXECUTION BLOCK" in str(exc_info.value)


if __name__ == "__main__":
    pytest.main([__file__, "-vv"])

# END OF FULL CODE | Total Lines: 95
