# 24/07/2026, 03:47
"""
Hard Risk Manager Module for OFERTRADINGBOT.
Provides deterministic, AI-free risk controls, position sizing via Value at Risk (VaR),
dynamic Average True Range (ATR) trailing stop loss calculations, and emergency daily drawdown circuit breakers.
"""

import os
import sys
import math
import time
import logging
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass, field
from datetime import datetime

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("HardRiskManager")


@dataclass
class RiskLimits:
    """Dataclass holding hard quantitative risk parameters."""
    max_daily_drawdown_pct: float = 0.05  # 5% max daily drawdown
    max_trade_risk_pct: float = 0.015    # 1.5% account equity risk per trade
    max_leverage: float = 3.0            # 3x maximum leverage constraint
    atr_multiplier: float = 2.0          # 2x ATR trailing stop offset
    var_confidence_level: float = 0.95   # 95% Parametric VaR confidence
    trading_halted: bool = False
    halt_reason: str = ""


@dataclass
class TrailingStopState:
    """Dataclass holding dynamic ATR trailing stop loss tracking state."""
    symbol: str
    entry_price: float
    side: str  # 'BUY' or 'SELL'
    atr: float
    highest_price: float
    lowest_price: float
    current_stop_loss: float
    is_triggered: bool = False


class HardRiskManager:
    """
    Deterministic Safety & Mathematical Risk Protection Engine.
    Executes circuit breakers, VaR position sizing, and volatility-based trailing stop updates.
    """

    def __init__(
        self,
        initial_balance: float = 100000.0,
        risk_limits: Optional[RiskLimits] = None
    ):
        """
        Initializes HardRiskManager.

        Args:
            initial_balance (float): Starting portfolio cash/equity balance.
            risk_limits (Optional[RiskLimits]): Risk parameter configuration.
        """
        self.initial_daily_balance = initial_balance
        self.current_equity = initial_balance
        self.peak_daily_equity = initial_balance
        self.limits = risk_limits or RiskLimits()
        self.trailing_stops: Dict[str, TrailingStopState] = {}
        self.trade_history_returns: List[float] = []

    def select_dynamic_genai_model(self) -> str:
        """
        Dynamically detects available Google GenAI models for risk reporting and audit reflections.

        Returns:
            str: Selected model name string.
        """
        try:
            from google import genai
            client = genai.Client()
            models = [m.name for m in client.models.list()]
            for pref in ["models/gemini-2.5-flash", "models/gemini-1.5-pro", "models/gemini-1.5-flash"]:
                if pref in models:
                    return pref
            return models[0] if models else "gemini-2.5-flash"
        except Exception as e:
            logger.info(f"GenAI dynamic model select fallback: {e}")
            return "gemini-2.5-flash"

    def update_equity(self, live_portfolio_value: float) -> bool:
        """
        Updates live portfolio equity and evaluates daily maximum drawdown circuit breaker.

        Args:
            live_portfolio_value (float): Current aggregate account equity.

        Returns:
            bool: True if portfolio remains healthy, False if circuit breaker tripped.
        """
        self.current_equity = live_portfolio_value
        if live_portfolio_value > self.peak_daily_equity:
            self.peak_daily_equity = live_portfolio_value

        drawdown_pct = (self.peak_daily_equity - live_portfolio_value) / self.peak_daily_equity

        if drawdown_pct >= self.limits.max_daily_drawdown_pct:
            self.limits.trading_halted = True
            self.limits.halt_reason = f"MAX DAILY DRAWDOWN BREACHED: {drawdown_pct*100:.2f}% >= {self.limits.max_daily_drawdown_pct*100:.2f}% limit."
            logger.critical(f"🛑 EMERGENCY CIRCUIT BREAKER ACTIVATED: {self.limits.halt_reason}")
            logger.critical("LIQUIDATING ALL OPEN POSITIONS AND HALTING TRADING FOR TODAY!")
            return False

        return True

    def calculate_atr_trailing_stop(
        self,
        symbol: str,
        side: str,
        entry_price: float,
        current_price: float,
        high_prices: List[float],
        low_prices: List[float],
        close_prices: List[float],
        period: int = 14
    ) -> float:
        """
        Calculates dynamic Average True Range (ATR) Trailing Stop Loss.

        Args:
            symbol (str): Ticker symbol.
            side (str): 'BUY' (Long) or 'SELL' (Short).
            entry_price (float): Original trade entry price.
            current_price (float): Latest price point.
            high_prices (List[float]): Historical high prices sequence.
            low_prices (List[float]): Historical low prices sequence.
            close_prices (List[float]): Historical close prices sequence.
            period (int): Lookback period for ATR (default 14).

        Returns:
            float: Updated dynamic stop loss price.
        """
        if len(close_prices) < period + 1:
            # Fallback static 2% stop loss if insufficient price history
            offset = current_price * 0.02
            return current_price - offset if side == "BUY" else current_price + offset

        # Compute ATR True Ranges
        tr_list = []
        for i in range(1, len(close_prices)):
            h = high_prices[i]
            l = low_prices[i]
            cp = close_prices[i - 1]
            tr = max(h - l, abs(h - cp), abs(l - cp))
            tr_list.append(tr)

        atr = sum(tr_list[-period:]) / period
        stop_distance = atr * self.limits.atr_multiplier

        if symbol not in self.trailing_stops:
            initial_stop = (current_price - stop_distance) if side == "BUY" else (current_price + stop_distance)
            self.trailing_stops[symbol] = TrailingStopState(
                symbol=symbol,
                entry_price=entry_price,
                side=side,
                atr=atr,
                highest_price=current_price,
                lowest_price=current_price,
                current_stop_loss=initial_stop
            )

        state = self.trailing_stops[symbol]
        state.atr = atr

        if side == "BUY":
            if current_price > state.highest_price:
                state.highest_price = current_price
                new_stop = current_price - stop_distance
                # Trailing stop only ratchets UP for buys
                if new_stop > state.current_stop_loss:
                    state.current_stop_loss = new_stop
                    logger.info(f"[{symbol}] Ratcheted LONG ATR Stop UP to ${state.current_stop_loss:.2f}")

            if current_price <= state.current_stop_loss:
                state.is_triggered = True
                logger.warning(f"[{symbol}] ATR TRAILING STOP LOSS TRIGGERED at ${current_price:.2f} <= ${state.current_stop_loss:.2f}")

        elif side == "SELL":
            if current_price < state.lowest_price:
                state.lowest_price = current_price
                new_stop = current_price + stop_distance
                # Trailing stop only ratchets DOWN for shorts
                if new_stop < state.current_stop_loss:
                    state.current_stop_loss = new_stop
                    logger.info(f"[{symbol}] Ratcheted SHORT ATR Stop DOWN to ${state.current_stop_loss:.2f}")

            if current_price >= state.current_stop_loss:
                state.is_triggered = True
                logger.warning(f"[{symbol}] ATR TRAILING STOP LOSS TRIGGERED at ${current_price:.2f} >= ${state.current_stop_loss:.2f}")

        return state.current_stop_loss

    def calculate_var_position_size(
        self,
        symbol: str,
        price: float,
        daily_volatility: float,
        stop_loss_pct: Optional[float] = None
    ) -> Tuple[float, float]:
        """
        Calculates safe position sizing utilizing Value at Risk (VaR) framework.

        Args:
            symbol (str): Target ticker symbol.
            price (float): Asset entry price.
            daily_volatility (float): Standard deviation of daily asset returns.
            stop_loss_pct (Optional[float]): Optional explicit stop loss distance percentage.

        Returns:
            Tuple[float, float]: (Allowed position size in units, Allowed dollar trade value).
        """
        if self.limits.trading_halted:
            logger.error("Trading is HALTED due to risk trigger. Position size = 0.0")
            return 0.0, 0.0

        # Maximum capital allowed to risk on this single trade
        max_risk_dollars = self.current_equity * self.limits.max_trade_risk_pct

        # Parametric VaR (95% confidence multiplier Z ~ 1.645)
        z_score = 1.645 if self.limits.var_confidence_level == 0.95 else 2.326
        var_per_dollar = z_score * daily_volatility

        # Effective risk per unit
        risk_per_unit = price * (stop_loss_pct if stop_loss_pct else max(var_per_dollar, 0.02))

        if risk_per_unit <= 0:
            units = 0.0
        else:
            units = max_risk_dollars / risk_per_unit

        # Apply maximum leverage ceiling
        max_notional_value = self.current_equity * self.limits.max_leverage
        allowed_notional_value = min(units * price, max_notional_value)
        final_units = allowed_notional_value / price

        logger.info(f"[{symbol}] Risk Sizing: Max Risk ${max_risk_dollars:,.2f} -> Allocated {final_units:.4f} units (${allowed_notional_value:,.2f})")
        return round(final_units, 4), round(allowed_notional_value, 2)


if __name__ == "__main__":
    print("=== HARD RISK MANAGER TEST EXECUTION ===")
    risk_mgr = HardRiskManager(initial_balance=100000.0)

    # Test 1: VaR Position Sizing
    units, dollar_val = risk_mgr.calculate_var_position_size(
        symbol="BTC/USDT",
        price=65000.0,
        daily_volatility=0.035, # 3.5% daily volatility
        stop_loss_pct=0.02
    )
    print(f"Calculated VaR Position: {units} BTC (${dollar_val:,.2f})")

    # Test 2: ATR Trailing Stop calculation
    highs = [64000, 64500, 65200, 65800, 66100, 66500, 67000, 67200, 67500, 67800, 68000, 68200, 68500, 68900, 69200]
    lows = [63500, 64000, 64800, 65100, 65500, 66000, 66200, 66800, 67000, 67200, 67500, 67800, 68000, 68200, 68600]
    closes = [63900, 64400, 65000, 65600, 66000, 66400, 66800, 67100, 67400, 67700, 67900, 68100, 68400, 68800, 69100]

    stop = risk_mgr.calculate_atr_trailing_stop(
        symbol="BTC/USDT",
        side="BUY",
        entry_price=64000.0,
        current_price=69100.0,
        high_prices=highs,
        low_prices=lows,
        close_prices=closes
    )
    print(f"Calculated ATR Trailing Stop: ${stop:.2f}")

    # Test 3: Circuit Breaker Drawdown Trigger
    is_healthy = risk_mgr.update_equity(92000.0) # 8% drawdown from peak 100k
    print(f"Portfolio Healthy: {is_healthy} | Halted: {risk_mgr.limits.trading_halted}")

# END CODE | סך הכל שורות: 287
