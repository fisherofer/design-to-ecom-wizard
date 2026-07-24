# 24/07/2026
"""
OFERTRADINGBOT - Risk Manager API Routes
Exposes HardRiskManager endpoints for position sizing, ATR stops, circuit breakers, and equity updates.
"""

from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, Optional, List
import logging

from hard_risk_manager import HardRiskManager, RiskLimits

router = APIRouter()
risk_mgr = HardRiskManager(initial_balance=100000.0)

@router.get("/status")
def get_risk_status() -> Dict[str, Any]:
    """Returns live risk manager limits, circuit breaker state, and current equity."""
    return {
        "current_equity": risk_mgr.current_equity,
        "peak_daily_equity": risk_mgr.peak_daily_equity,
        "trading_halted": risk_mgr.limits.trading_halted,
        "halt_reason": risk_mgr.limits.halt_reason,
        "max_daily_drawdown_pct": risk_mgr.limits.max_daily_drawdown_pct,
        "max_trade_risk_pct": risk_mgr.limits.max_trade_risk_pct,
        "max_leverage": risk_mgr.limits.max_leverage,
        "atr_multiplier": risk_mgr.limits.atr_multiplier,
        "var_confidence_level": risk_mgr.limits.var_confidence_level,
    }

@router.post("/update-equity")
def update_equity(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Updates equity value and evaluates daily drawdown circuit breaker."""
    value = float(data.get("live_portfolio_value", risk_mgr.current_equity))
    is_healthy = risk_mgr.update_equity(value)
    return {
        "success": is_healthy,
        "current_equity": risk_mgr.current_equity,
        "trading_halted": risk_mgr.limits.trading_halted,
        "halt_reason": risk_mgr.limits.halt_reason
    }

@router.post("/calculate-position-size")
def calculate_position_size(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Calculates safe VaR position size."""
    symbol = str(data.get("symbol", "BTC/USDT"))
    price = float(data.get("price", 100.0))
    volatility = float(data.get("daily_volatility", 0.03))
    stop_loss_pct = data.get("stop_loss_pct")
    if stop_loss_pct is not None:
        stop_loss_pct = float(stop_loss_pct)

    units, allowed_dollars = risk_mgr.calculate_var_position_size(
        symbol=symbol,
        price=price,
        daily_volatility=volatility,
        stop_loss_pct=stop_loss_pct
    )
    return {
        "symbol": symbol,
        "price": price,
        "allowed_units": units,
        "allowed_notional_dollars": allowed_dollars,
        "trading_halted": risk_mgr.limits.trading_halted
    }

@router.post("/calculate-atr-stop")
def calculate_atr_stop(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Calculates dynamic ATR trailing stop loss."""
    symbol = str(data.get("symbol", "BTC/USDT"))
    side = str(data.get("side", "BUY")).upper()
    entry_price = float(data.get("entry_price", 100.0))
    current_price = float(data.get("current_price", 105.0))
    highs = data.get("high_prices", [100.0, 102.0, 106.0])
    lows = data.get("low_prices", [98.0, 101.0, 104.0])
    closes = data.get("close_prices", [99.0, 102.0, 105.0])

    stop_price = risk_mgr.calculate_atr_trailing_stop(
        symbol=symbol,
        side=side,
        entry_price=entry_price,
        current_price=current_price,
        high_prices=highs,
        low_prices=lows,
        close_prices=closes
    )
    return {
        "symbol": symbol,
        "side": side,
        "current_stop_loss": stop_price,
        "is_triggered": risk_mgr.trailing_stops.get(symbol, None).is_triggered if symbol in risk_mgr.trailing_stops else False
    }

@router.post("/reset-circuit-breaker")
def reset_circuit_breaker() -> Dict[str, Any]:
    """Manually resets circuit breaker state if safe."""
    risk_mgr.limits.trading_halted = False
    risk_mgr.limits.halt_reason = ""
    return {"success": True, "message": "Circuit breaker reset. Trading restored."}
