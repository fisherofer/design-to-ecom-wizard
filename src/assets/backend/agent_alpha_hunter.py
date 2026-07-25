# 24/07/2026, 16:00
"""
Agent AlphaHunter - Autonomous Momentum & Breakout Trading Daemon.
Subscribes to live Tick and Orderbook queues from MarketEventBus.
Calculates high-frequency technical indicators (RSI, MACD, Volume Profile, VWAP) via pandas/numpy (or native math fallbacks).
Triggers CognitiveEngine validation upon technical threshold breaches and routes executed orders to OMS.
"""

import os
import sys
import time
import json
import logging
import asyncio
import math
from typing import Dict, List, Optional, Any, Tuple, Union

try:
    import pandas as pd
    import numpy as np
    HAS_PANDAS = True
except ImportError:
    pd = None
    np = None
    HAS_PANDAS = False

from market_data_stream import MarketEventBus, TickData, OrderbookDepth
from llm_cognitive_engine import CognitiveEngine
from order_management_system import OrderManagementSystem, OrderSide, OrderType

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("AgentAlphaHunter")


class AlphaHunterAgent:
    """
    Autonomous momentum & breakout trading agent.
    Monitors live streaming ticks and depth snapshots, computes rolling quantitative indicators,
    and submits high-conviction orders to OMS following LLM cognitive validation.
    """

    def __init__(
        self,
        event_bus: MarketEventBus,
        oms: OrderManagementSystem,
        cognitive_engine: Optional[CognitiveEngine] = None,
        rsi_period: int = 14,
        volume_spike_threshold: float = 1.8
    ):
        """
        Initializes AlphaHunterAgent with event queues, OMS, and indicator parameters.

        Args:
            event_bus (MarketEventBus): Shared asynchronous market event bus instance.
            oms (OrderManagementSystem): OMS instance for order creation and execution.
            cognitive_engine (Optional[CognitiveEngine]): AI reasoning gateway instance.
            rsi_period (int): Lookback period for momentum RSI calculation.
            volume_spike_threshold (float): Relative volume ratio threshold for breakout detection.
        """
        self.event_bus = event_bus
        self.oms = oms
        self.cognitive_engine = cognitive_engine or CognitiveEngine()
        self.rsi_period = rsi_period
        self.volume_spike_threshold = volume_spike_threshold

        self.is_running = False
        self.tick_history: Dict[str, List[Dict[str, Any]]] = {}
        self.latest_depth: Dict[str, OrderbookDepth] = {}

    def _calculate_rsi_native(self, price_list: List[float], period: int = 14) -> float:
        """Calculates Relative Strength Index (RSI) using pure Python list math."""
        if len(price_list) < period + 1:
            return 50.0

        gains = []
        losses = []
        for i in range(1, len(price_list)):
            change = price_list[i] - price_list[i - 1]
            if change > 0:
                gains.append(change)
                losses.append(0.0)
            else:
                gains.append(0.0)
                losses.append(abs(change))

        recent_gains = gains[-period:]
        recent_losses = losses[-period:]

        avg_gain = sum(recent_gains) / period
        avg_loss = sum(recent_losses) / period

        if avg_loss == 0.0:
            return 100.0 if avg_gain > 0 else 50.0

        rs = avg_gain / avg_loss
        return 100.0 - (100.0 / (1.0 + rs))

    def _calculate_macd_native(self, price_list: List[float]) -> Tuple[float, float, float]:
        """Calculates MACD Line, Signal Line, and Histogram using pure Python exponential smoothing."""
        if len(price_list) < 26:
            return 0.0, 0.0, 0.0

        def calc_ema(values: List[float], span: int) -> List[float]:
            k = 2.0 / (span + 1.0)
            ema = [values[0]]
            for val in values[1:]:
                ema.append((val * k) + (ema[-1] * (1.0 - k)))
            return ema

        ema12 = calc_ema(price_list, 12)
        ema26 = calc_ema(price_list, 26)

        macd_line = [e12 - e26 for e12, e26 in zip(ema12, ema26)]
        signal_line = calc_ema(macd_line, 9)
        histogram = macd_line[-1] - signal_line[-1]

        return macd_line[-1], signal_line[-1], histogram

    def _calculate_technical_metrics(self, symbol: str) -> Dict[str, Any]:
        """Computes technical analysis summary for symbol tick history using pandas or pure Python fallback."""
        records = self.tick_history.get(symbol, [])
        if not records or len(records) < 10:
            return {
                "rsi": 50.0,
                "macd_hist": 0.0,
                "volume_ratio": 1.0,
                "vwap_distance_pct": 0.0,
                "atr": 1.0,
                "price": records[-1]["price"] if records else 100.0
            }

        prices = [float(r["price"]) for r in records]
        volumes = [float(r["quantity"]) for r in records]
        current_price = prices[-1]

        if HAS_PANDAS:
            s_prices = pd.Series(prices)
            s_vols = pd.Series(volumes)

            delta = s_prices.diff()
            gain = (delta.where(delta > 0, 0.0)).rolling(window=self.rsi_period).mean()
            loss = (-delta.where(delta < 0, 0.0)).rolling(window=self.rsi_period).mean()

            last_gain = gain.iloc[-1]
            last_loss = loss.iloc[-1]
            if last_loss == 0:
                rsi_val = 100.0 if last_gain > 0 else 50.0
            else:
                rsi_val = float(100.0 - (100.0 / (1.0 + (last_gain / last_loss))))

            ema12 = s_prices.ewm(span=12, adjust=False).mean()
            ema26 = s_prices.ewm(span=26, adjust=False).mean()
            macd_line = ema12 - ema26
            signal_line = macd_line.ewm(span=9, adjust=False).mean()
            macd_hist = float((macd_line - signal_line).iloc[-1])

            recent_vol = s_vols.tail(5).mean()
            avg_vol = s_vols.mean()
            vol_ratio = float(recent_vol / avg_vol) if avg_vol > 0 else 1.0

            total_vol = s_vols.sum()
            vwap = float((s_prices * s_vols).sum() / total_vol) if total_vol > 0 else current_price
            vwap_dist = float(((current_price - vwap) / vwap) * 100.0)

            price_range = max(prices) - min(prices)
            atr = float(price_range / 14.0) if price_range > 0 else 1.0
        else:
            rsi_val = self._calculate_rsi_native(prices, self.rsi_period)
            _, _, macd_hist = self._calculate_macd_native(prices)

            recent_vol = sum(volumes[-5:]) / min(5, len(volumes))
            avg_vol = sum(volumes) / len(volumes)
            vol_ratio = recent_vol / avg_vol if avg_vol > 0 else 1.0

            total_vol = sum(volumes)
            vwap = sum(p * v for p, v in zip(prices, volumes)) / total_vol if total_vol > 0 else current_price
            vwap_dist = ((current_price - vwap) / vwap) * 100.0

            price_range = max(prices) - min(prices)
            atr = price_range / 14.0 if price_range > 0 else 1.0

        return {
            "rsi": round(rsi_val, 2),
            "macd_hist": round(macd_hist, 4),
            "volume_ratio": round(vol_ratio, 2),
            "vwap_distance_pct": round(vwap_dist, 2),
            "atr": round(atr, 2),
            "price": current_price
        }

    async def process_tick_event(self, tick: TickData) -> None:
        """
        Processes inbound trade tick, updates rolling window, checks breakout conditions,
        invokes CognitiveEngine verification, and dispatches trade signal to OMS.
        """
        symbol = tick.symbol
        if symbol not in self.tick_history:
            self.tick_history[symbol] = []

        self.tick_history[symbol].append({
            "price": tick.price,
            "quantity": tick.quantity,
            "timestamp": tick.timestamp,
            "side": tick.side
        })

        if len(self.tick_history[symbol]) > 200:
            self.tick_history[symbol].pop(0)

        # Quantitative Breakout Assessment
        metrics = self._calculate_technical_metrics(symbol)
        rsi = metrics["rsi"]
        vol_ratio = metrics["volume_ratio"]
        macd_h = metrics["macd_hist"]

        # Signal Trigger Conditions: Momentum Breakout or oversold rebound
        is_bullish_breakout = (rsi > 60 and vol_ratio >= self.volume_spike_threshold and macd_h > 0)
        is_oversold_rebound = (rsi < 35 and macd_h > 0 and vol_ratio >= 1.2)

        if is_bullish_breakout or is_oversold_rebound:
            logger.info(f"⚡ AlphaHunter Technical Trigger on {symbol}: RSI={rsi}, VolRatio={vol_ratio}, MACD_Hist={macd_h}")

            # Construct orderbook snapshot summary
            depth = self.latest_depth.get(symbol)
            ob_data = {
                "bids": depth.bids[:5] if depth else [],
                "asks": depth.asks[:5] if depth else [],
                "imbalance_ratio": len(depth.bids) / max(1, len(depth.asks)) if depth else 1.0
            }

            # Cognitive Verification Step
            cognitive_res = await self.cognitive_engine.analyze_market_structure(
                symbol=symbol,
                orderbook_data=ob_data,
                technical_indicators=metrics,
                provider="auto"
            )

            action = cognitive_res.get("action", "HOLD")
            confidence = cognitive_res.get("confidence", 0.0)

            if action in ["BUY", "SELL"] and confidence >= 0.60:
                logger.info(f"🎯 COGNITIVE VERIFIED BREAKOUT: {action} {symbol} (Confidence: {confidence*100:.1f}%)")
                side = OrderSide.BUY if action == "BUY" else OrderSide.SELL
                
                # Determine safe quantity
                trade_qty = round(500.0 / tick.price, 4) if tick.price > 0 else 0.1
                
                # Submit to OMS
                order = self.oms.create_order(
                    symbol=symbol,
                    side=side,
                    order_type=OrderType.MARKET,
                    quantity=trade_qty,
                    price=tick.price,
                    exchange="alpaca"
                )

                if order.status != "REJECTED":
                    await self.oms.execute_order_with_backoff(order.order_id, tick.price)

    async def start(self) -> None:
        """Starts main async agent consumer loop listening to MarketEventBus queues."""
        self.is_running = True
        logger.info("AlphaHunter Agent initialized and subscribing to EventBus queues...")

        tick_queue = self.event_bus.subscribe("tick")
        depth_queue = self.event_bus.subscribe("orderbook")

        async def _depth_consumer():
            while self.is_running:
                try:
                    evt = await depth_queue.get()
                    depth: OrderbookDepth = evt["payload"]
                    self.latest_depth[depth.symbol] = depth
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in depth consumer: {e}")

        async def _tick_consumer():
            while self.is_running:
                try:
                    evt = await tick_queue.get()
                    tick: TickData = evt["payload"]
                    await self.process_tick_event(tick)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in tick consumer: {e}")

        await asyncio.gather(
            asyncio.create_task(_depth_consumer()),
            asyncio.create_task(_tick_consumer())
        )

    def stop(self) -> None:
        """Stops agent execution loop."""
        self.is_running = False
        logger.info("AlphaHunter Agent stopped.")


if __name__ == "__main__":
    print("=== AGENT ALPHA HUNTER TEST EXECUTION ===")

    async def run_agent_demo():
        bus = MarketEventBus()
        oms = OrderManagementSystem()
        agent = AlphaHunterAgent(event_bus=bus, oms=oms)

        # Launch simulated market feed and agent task concurrently
        from market_data_stream import MarketDataStreamer
        streamer = MarketDataStreamer(symbols=["btcusdt"], event_bus=bus)

        agent_task = asyncio.create_task(agent.start())
        stream_task = asyncio.create_task(streamer.start_simulated_stream())

        print("Running AlphaHunter daemon for 2 seconds...")
        await asyncio.sleep(2.0)

        agent.stop()
        streamer.stop()
        agent_task.cancel()
        stream_task.cancel()
        print("AlphaHunter Test Complete.")

    asyncio.run(run_agent_demo())

# END CODE | סך הכל שורות: 334
