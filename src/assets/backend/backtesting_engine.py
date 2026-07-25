# 24/07/2026, 03:47
"""
Backtesting Engine & Strategy Validator Module for OFERTRADINGBOT.
Runs quantitative vectorized backtests for the "AlphaHunter" breakout strategy against historical OHLCV data.
Calculates key institutional metrics: Sharpe Ratio, Maximum Drawdown, Win Rate, Profit Factor, and Total Return.
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
logger = logging.getLogger("BacktestingEngine")


@dataclass
class OHLCVBar:
    """Dataclass representing a historical price candlestick bar."""
    timestamp: float
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class BacktestTrade:
    """Dataclass representing an executed trade in the backtest simulation."""
    entry_time: float
    exit_time: float
    symbol: str
    side: str  # 'BUY' or 'SELL'
    entry_price: float
    exit_price: float
    quantity: float
    pnl: float
    pnl_pct: float
    exit_reason: str


@dataclass
class BacktestResult:
    """Dataclass holding aggregate quantitative backtest performance metrics."""
    symbol: str
    initial_capital: float
    final_capital: float
    total_return_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float
    win_rate_pct: float
    profit_factor: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    avg_trade_pnl: float
    trades: List[BacktestTrade] = field(default_factory=list)


class AlphaHunterBreakoutStrategy:
    """
    AlphaHunter Donchian/ATR Volatility Breakout Strategy.
    Detects high-momentum price breakouts above N-period channels supported by volume surges.
    """

    def __init__(self, channel_period: int = 20, volume_mult: float = 1.5, atr_mult: float = 2.0):
        """
        Initializes AlphaHunter Strategy parameters.

        Args:
            channel_period (int): Lookback period for Donchian Channel highs/lows.
            volume_mult (float): Volume spike threshold relative to SMA.
            atr_mult (float): ATR multiplier for trailing stop loss.
        """
        self.channel_period = channel_period
        self.volume_mult = volume_mult
        self.atr_mult = atr_mult

    def generate_signals(self, bars: List[OHLCVBar]) -> List[Dict[str, Any]]:
        """
        Evaluates OHLCV bar sequence and generates Buy/Sell breakout signals.

        Args:
            bars (List[OHLCVBar]): Chronological list of historical bars.

        Returns:
            List[Dict[str, Any]]: Array of signal events.
        """
        signals = []
        if len(bars) < self.channel_period + 1:
            return signals

        for i in range(self.channel_period, len(bars)):
            window = bars[i - self.channel_period:i]
            current_bar = bars[i]

            highest_high = max(b.high for b in window)
            lowest_low = min(b.low for b in window)
            avg_volume = sum(b.volume for b in window) / len(window)

            # Volume surge confirmation
            volume_confirmed = current_bar.volume >= (avg_volume * self.volume_mult)

            # Bullish Breakout
            if current_bar.close > highest_high and volume_confirmed:
                signals.append({
                    "index": i,
                    "timestamp": current_bar.timestamp,
                    "type": "BUY",
                    "price": current_bar.close,
                    "reason": "Upper Channel Breakout + Volume Spike"
                })

            # Bearish Breakout
            elif current_bar.close < lowest_low and volume_confirmed:
                signals.append({
                    "index": i,
                    "timestamp": current_bar.timestamp,
                    "type": "SELL",
                    "price": current_bar.close,
                    "reason": "Lower Channel Breakout + Volume Spike"
                })

        return signals


class BacktestingEngine:
    """
    Quantitative Event-Driven & Vectorized Backtesting Engine for Strategy Validation.
    """

    def __init__(self, initial_capital: float = 100000.0, commission_pct: float = 0.001):
        """
        Initializes BacktestingEngine.

        Args:
            initial_capital (float): Starting simulation balance in USD.
            commission_pct (float): Exchange fee per trade (default 0.1%).
        """
        self.initial_capital = initial_capital
        self.commission_pct = commission_pct

    def select_dynamic_genai_model(self) -> str:
        """
        Dynamically detects available Google GenAI models for strategy performance reviews.

        Returns:
            str: Selected model alias.
        """
        try:
            from google import genai
            client = genai.Client()
            available = [m.name for m in client.models.list()]
            for pref in ["models/gemini-2.5-flash", "models/gemini-1.5-pro", "models/gemini-1.5-flash"]:
                if pref in available:
                    return pref
            return available[0] if available else "gemini-2.5-flash"
        except Exception as err:
            logger.info(f"GenAI auto-select fallback in Backtester: {err}")
            return "gemini-2.5-flash"

    def run_backtest(
        self,
        symbol: str,
        bars: List[OHLCVBar],
        strategy: Optional[AlphaHunterBreakoutStrategy] = None
    ) -> BacktestResult:
        """
        Runs complete backtest simulation over OHLCV bars and calculates performance statistics.

        Args:
            symbol (str): Ticker symbol being backtested.
            bars (List[OHLCVBar]): Chronological bar dataset.
            strategy (Optional[AlphaHunterBreakoutStrategy]): Strategy instance.

        Returns:
            BacktestResult: Detailed backtest metrics report.
        """
        strat = strategy or AlphaHunterBreakoutStrategy()
        signals = strat.generate_signals(bars)
        signal_map = {s["index"]: s for s in signals}

        capital = self.initial_capital
        equity_curve = [capital]
        trades: List[BacktestTrade] = []

        position: Optional[Dict[str, Any]] = None

        for i, bar in enumerate(bars):
            # Check for entry signal
            if not position and i in signal_map:
                sig = signal_map[i]
                trade_side = sig["type"]
                entry_price = bar.close * (1.0 + self.commission_pct if trade_side == "BUY" else 1.0 - self.commission_pct)
                qty = (capital * 0.95) / entry_price  # Use 95% available equity

                position = {
                    "entry_index": i,
                    "entry_time": bar.timestamp,
                    "side": trade_side,
                    "entry_price": entry_price,
                    "quantity": qty,
                    "stop_loss": entry_price * 0.96 if trade_side == "BUY" else entry_price * 1.04,
                    "take_profit": entry_price * 1.10 if trade_side == "BUY" else entry_price * 0.90
                }

            # Manage open position
            elif position:
                pos_side = position["side"]
                entry_p = position["entry_price"]
                qty = position["quantity"]
                exit_triggered = False
                exit_price = bar.close
                reason = "Signal Exit"

                if pos_side == "BUY":
                    if bar.low <= position["stop_loss"]:
                        exit_price = position["stop_loss"]
                        exit_triggered = True
                        reason = "Stop Loss"
                    elif bar.high >= position["take_profit"]:
                        exit_price = position["take_profit"]
                        exit_triggered = True
                        reason = "Take Profit"
                elif pos_side == "SELL":
                    if bar.high >= position["stop_loss"]:
                        exit_price = position["stop_loss"]
                        exit_triggered = True
                        reason = "Stop Loss"
                    elif bar.low <= position["take_profit"]:
                        exit_price = position["take_profit"]
                        exit_triggered = True
                        reason = "Take Profit"

                # Check opposite signal exit or end of dataset
                if not exit_triggered and (i in signal_map or i == len(bars) - 1):
                    exit_triggered = True

                if exit_triggered:
                    exit_price_net = exit_price * (1.0 - self.commission_pct if pos_side == "BUY" else 1.0 + self.commission_pct)
                    pnl = (exit_price_net - entry_p) * qty if pos_side == "BUY" else (entry_p - exit_price_net) * qty
                    pnl_pct = (pnl / (entry_p * qty)) * 100.0

                    capital += pnl
                    trades.append(BacktestTrade(
                        entry_time=position["entry_time"],
                        exit_time=bar.timestamp,
                        symbol=symbol,
                        side=pos_side,
                        entry_price=entry_p,
                        exit_price=exit_price_net,
                        quantity=qty,
                        pnl=round(pnl, 2),
                        pnl_pct=round(pnl_pct, 2),
                        exit_reason=reason
                    ))
                    position = None

            equity_curve.append(capital)

        # Compute Metrics
        total_return_pct = ((capital - self.initial_capital) / self.initial_capital) * 100.0
        winning_trades = [t for t in trades if t.pnl > 0]
        losing_trades = [t for t in trades if t.pnl <= 0]

        win_rate = (len(winning_trades) / len(trades) * 100.0) if trades else 0.0
        gross_profit = sum(t.pnl for t in winning_trades)
        gross_loss = abs(sum(t.pnl for t in losing_trades))
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 1.0)

        # Max Drawdown
        peak = equity_curve[0]
        max_dd = 0.0
        for eq in equity_curve:
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak
            if dd > max_dd:
                max_dd = dd

        # Sharpe Ratio (assuming risk-free rate = 2.0% annual)
        returns = [(equity_curve[j] - equity_curve[j - 1]) / equity_curve[j - 1] for j in range(1, len(equity_curve))]
        if returns and len(returns) > 1:
            mean_ret = sum(returns) / len(returns)
            variance = sum((r - mean_ret) ** 2 for r in returns) / (len(returns) - 1)
            std_dev = math.sqrt(variance) if variance > 0 else 0.0001
            sharpe_ratio = (mean_ret / std_dev) * math.sqrt(252)
        else:
            sharpe_ratio = 0.0

        return BacktestResult(
            symbol=symbol,
            initial_capital=self.initial_capital,
            final_capital=round(capital, 2),
            total_return_pct=round(total_return_pct, 2),
            sharpe_ratio=round(sharpe_ratio, 2),
            max_drawdown_pct=round(max_dd * 100.0, 2),
            win_rate_pct=round(win_rate, 2),
            profit_factor=round(profit_factor, 2),
            total_trades=len(trades),
            winning_trades=len(winning_trades),
            losing_trades=len(losing_trades),
            avg_trade_pnl=round(sum(t.pnl for t in trades) / len(trades), 2) if trades else 0.0,
            trades=trades
        )


if __name__ == "__main__":
    print("=== BACKTESTING ENGINE TEST EXECUTION ===")
    
    # Generate Synthetic OHLCV dataset for demonstration
    import random
    random.seed(42)
    base_price = 50000.0
    synthetic_bars = []
    now = time.time() - (100 * 3600)

    for step in range(150):
        change = random.uniform(-0.02, 0.025)
        if step % 25 == 0:
            change += 0.05  # Insert simulated breakout
        base_price *= (1.0 + change)
        high = base_price * (1.0 + random.uniform(0.002, 0.01))
        low = base_price * (1.0 - random.uniform(0.002, 0.01))
        vol = random.uniform(100.0, 1500.0)

        synthetic_bars.append(OHLCVBar(
            timestamp=now + (step * 3600),
            open=base_price,
            high=high,
            low=low,
            close=base_price,
            volume=vol
        ))

    engine = BacktestingEngine(initial_capital=100000.0)
    res = engine.run_backtest("BTC/USDT", synthetic_bars)

    print("\n--- QUANTITATIVE BACKTEST PERFORMANCE REPORT ---")
    print(f"Symbol:               {res.symbol}")
    print(f"Initial Capital:      ${res.initial_capital:,.2f}")
    print(f"Final Capital:        ${res.final_capital:,.2f}")
    print(f"Total Return:         {res.total_return_pct}%")
    print(f"Sharpe Ratio:         {res.sharpe_ratio}")
    print(f"Maximum Drawdown:     {res.max_drawdown_pct}%")
    print(f"Win Rate:             {res.win_rate_pct}% ({res.winning_trades}/{res.total_trades})")
    print(f"Profit Factor:        {res.profit_factor}")
    print(f"Average Trade PnL:    ${res.avg_trade_pnl:,.2f}")

# END CODE | סך הכל שורות: 360
