# OFERTRADINGBOT - pytest suite for order_management_system.py
"""
Verifies Stage 1 safety enforcement, slippage guards, and the mandatory
HardRiskManager pre-trade gate on execute_order_with_backoff().
"""

import asyncio
import os

import pytest

from order_management_system import (
    OrderManagementSystem,
    OrderSide,
    OrderStatus,
    OrderType,
)


@pytest.fixture(autouse=True)
def stage_one_env(monkeypatch):
    monkeypatch.setenv("TRADING_STAGE", "1")
    yield


@pytest.fixture()
def oms():
    return OrderManagementSystem(max_slippage_pct=0.01)


def test_assert_stage1_safe_blocks_non_alpaca(oms):
    """Stage 1 must strictly block every exchange except Alpaca paper."""
    for exchange in ("binance", "kraken", "coinbase", "BINANCE"):
        with pytest.raises(RuntimeError):
            oms.assert_stage1_safe(exchange)


def test_assert_stage1_safe_allows_alpaca(oms):
    oms.assert_stage1_safe("alpaca")
    oms.assert_stage1_safe("  Alpaca ")


def test_stage2_allows_other_exchanges(monkeypatch, oms):
    monkeypatch.setenv("TRADING_STAGE", "2")
    oms.assert_stage1_safe("binance")


def test_create_order_rejects_non_alpaca_in_stage1(oms):
    order = oms.create_order("BTC/USDT", OrderSide.BUY, OrderType.MARKET, 1.0, 100.0, exchange="binance")
    assert order.status == OrderStatus.REJECTED
    assert "Stage 1" in order.error_message


def test_slippage_guard_rejects_excessive_move(oms):
    order = oms.create_order("AAPL", OrderSide.BUY, OrderType.LIMIT, 10.0, 100.0, exchange="alpaca")
    filled = asyncio.run(oms.execute_order_with_backoff(order.order_id, market_price=140.0))
    assert filled.status == OrderStatus.REJECTED
    assert "Slippage" in filled.error_message


def test_execution_passes_risk_check_and_fills(oms):
    order = oms.create_order("AAPL", OrderSide.BUY, OrderType.MARKET, 5.0, 100.0, exchange="alpaca")
    filled = asyncio.run(oms.execute_order_with_backoff(order.order_id, market_price=100.2))
    assert filled.status == OrderStatus.FILLED
    assert filled.filled_quantity == 5.0
    assert "AAPL" in oms.positions


def test_risk_halt_blocks_execution(oms):
    order = oms.create_order("AAPL", OrderSide.BUY, OrderType.MARKET, 1.0, 100.0, exchange="alpaca")
    oms.risk_manager.limits.trading_halted = True
    oms.risk_manager.limits.halt_reason = "unit-test halt"
    allowed, reason = oms.run_pre_trade_risk_check(order, 100.0)
    assert allowed is False
    assert "unit-test halt" in reason

    filled = asyncio.run(oms.execute_order_with_backoff(order.order_id, market_price=100.0))
    assert filled.status == OrderStatus.REJECTED
    assert "Risk Manager" in filled.error_message


def test_unknown_order_raises(oms):
    with pytest.raises(ValueError):
        asyncio.run(oms.execute_order_with_backoff("does-not-exist", 100.0))


def test_portfolio_summary_shape(oms):
    summary = oms.get_portfolio_summary()
    assert set(["active_positions_count", "total_unrealized_pnl", "total_realized_pnl", "positions"]).issubset(summary)
