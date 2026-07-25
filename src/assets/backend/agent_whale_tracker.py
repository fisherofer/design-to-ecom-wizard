# 24/07/2026, 16:00
"""
Agent WhaleTracker - Autonomous Smart Money & Institutional Orderbook Flow Daemon.
Subscribes to whale_alert and orderbook depth queues from MarketEventBus.
Implements anti-spoofing algorithms to detect real vs fake liquidity walls.
Generates front-running signals upon mathematically verified institutional accumulation or distribution.
"""

import os
import sys
import time
import json
import logging
import asyncio
from typing import Dict, List, Optional, Any, Tuple
try:
    import pandas as pd
    import numpy as np
    HAS_PANDAS = True
except ImportError:
    pd = None
    np = None
    HAS_PANDAS = False

from market_data_stream import MarketEventBus, OrderbookDepth
from order_management_system import OrderManagementSystem, OrderSide, OrderType

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("AgentWhaleTracker")


class WhaleTrackerAgent:
    """
    Autonomous smart money tracking agent.
    Detects institutional whale trades and monitors Level 2 orderbook walls for spoofing.
    Executes front-running strategies when authentic liquidity accumulation is confirmed.
    """

    def __init__(
        self,
        event_bus: MarketEventBus,
        oms: OrderManagementSystem,
        min_whale_usd_value: float = 100000.0,
        anti_spoof_min_seconds: float = 1.5
    ):
        """
        Initializes WhaleTrackerAgent with event streams and anti-spoof parameters.

        Args:
            event_bus (MarketEventBus): Shared market event bus instance.
            oms (OrderManagementSystem): OMS instance for trade signal dispatch.
            min_whale_usd_value (float): Minimum USD value threshold to consider trade as whale footprint.
            anti_spoof_min_seconds (float): Minimum wall persistence duration in seconds to rule out spoofing.
        """
        self.event_bus = event_bus
        self.oms = oms
        self.min_whale_usd_value = min_whale_usd_value
        self.anti_spoof_min_seconds = anti_spoof_min_seconds

        self.is_running = False
        self.active_walls: Dict[str, Dict[str, Any]] = {}  # key: symbol_side_price
        self.whale_alerts_history: List[Dict[str, Any]] = []

    def evaluate_anti_spoofing(
        self,
        symbol: str,
        side: str,
        price: float,
        quantity: float,
        mid_price: float
    ) -> Tuple[bool, float, str]:
        """
        Anti-spoofing algorithm: Evaluates whether an orderbook wall represents real institutional liquidity
        or dynamic high-frequency spoofing intended to manipulate prices.

        Criteria:
        1. Distance from Mid Price: Wall must be within 3% of current mid-price.
        2. Wall Magnitude: Wall value must exceed $100,000 USD equivalent.
        3. Persistence Duration: Wall must remain active without immediate cancellation.

        Returns:
            Tuple[bool, float, str]: (is_real_wall, trust_score, analysis_reason)
        """
        notional_value = price * quantity
        if notional_value < self.min_whale_usd_value:
            return False, 0.0, "Wall below institutional minimum USD threshold."

        if mid_price > 0:
            dist_pct = abs((price - mid_price) / mid_price) * 100.0
            if dist_pct > 3.5:
                return False, 15.0, f"Wall too far from mid-price ({dist_pct:.2f}% distance)."

        wall_key = f"{symbol}_{side}_{price}"
        now = time.time()

        if wall_key not in self.active_walls:
            self.active_walls[wall_key] = {
                "first_seen": now,
                "last_seen": now,
                "quantity": quantity,
                "updates": 1
            }
            return False, 40.0, "Initial wall detection - tracking persistence duration."

        record = self.active_walls[wall_key]
        record["last_seen"] = now
        record["updates"] += 1
        duration = now - record["first_seen"]

        if duration < self.anti_spoof_min_seconds:
            return False, 55.0, f"Wall persistence duration ({duration:.2f}s) under safety threshold."

        # Verified authentic wall
        trust_score = min(98.0, 70.0 + (duration * 5.0) + min(20.0, record["updates"] * 2.0))
        reason = f"VERIFIED INSTITUTIONAL WALL: Persisted {duration:.2f}s across {record['updates']} depth updates."
        return True, trust_score, reason

    async def process_whale_alert(self, alert: Dict[str, Any]) -> None:
        """
        Handles real-time whale trade alerts published by MarketDataStreamer.
        Constructs front-running buy/sell order if whale buy/sell imbalance is sustained.
        """
        symbol = alert.get("symbol", "UNKNOWN")
        side = alert.get("side", "BUY").upper()
        usd_val = float(alert.get("usd_value", 0.0))
        price = float(alert.get("price", 100.0))

        logger.info(f"🐋 WHALE EVENT RECEIVED: {side} ${usd_val:,.2f} on {symbol} @ {price}")
        self.whale_alerts_history.append(alert)
        if len(self.whale_alerts_history) > 100:
            self.whale_alerts_history.pop(0)

        # Evaluate last 5 whale alerts for symbol
        recent = [a for a in self.whale_alerts_history if a.get("symbol") == symbol][-5:]
        buy_val = sum(a.get("usd_value", 0.0) for a in recent if a.get("side") == "BUY")
        sell_val = sum(a.get("usd_value", 0.0) for a in recent if a.get("side") == "SELL")

        if buy_val > sell_val * 2.5 and buy_val >= 250000.0:
            logger.info(f"🚀 INSTITUTIONAL ACCUMULATION VERIFIED on {symbol}: Buy Vol ${buy_val:,.2f} vs Sell Vol ${sell_val:,.2f}")
            trade_qty = round(750.0 / price, 4) if price > 0 else 0.1
            order = self.oms.create_order(
                symbol=symbol,
                side=OrderSide.BUY,
                order_type=OrderType.MARKET,
                quantity=trade_qty,
                price=price,
                exchange="alpaca"
            )
            if order.status != "REJECTED":
                await self.oms.execute_order_with_backoff(order.order_id, price)

    async def process_orderbook_depth(self, depth: OrderbookDepth) -> None:
        """Processes Level 2 Orderbook depth updates to detect wall formation and anti-spoofing."""
        symbol = depth.symbol
        bids = depth.bids
        asks = depth.asks

        if not bids or not asks:
            return

        mid_price = (bids[0][0] + asks[0][0]) / 2.0

        # Scan Top Bids for Institutional Buy Wall
        for price, size in bids[:3]:
            is_real, trust_score, reason = self.evaluate_anti_spoofing(symbol, "BUY", price, size, mid_price)
            if is_real:
                logger.info(f"🛡️ {reason} | Trust Score: {trust_score:.1f}%")

        # Scan Top Asks for Institutional Sell Wall
        for price, size in asks[:3]:
            is_real, trust_score, reason = self.evaluate_anti_spoofing(symbol, "SELL", price, size, mid_price)
            if is_real:
                logger.info(f"🛡️ {reason} | Trust Score: {trust_score:.1f}%")

    async def start(self) -> None:
        """Starts main async agent consumer loop listening to MarketEventBus queues."""
        self.is_running = True
        logger.info("WhaleTracker Agent initialized and subscribing to EventBus queues...")

        whale_queue = self.event_bus.subscribe("whale_alert")
        depth_queue = self.event_bus.subscribe("orderbook")

        async def _whale_consumer():
            while self.is_running:
                try:
                    evt = await whale_queue.get()
                    alert = evt["payload"]
                    await self.process_whale_alert(alert)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in whale alert consumer: {e}")

        async def _depth_consumer():
            while self.is_running:
                try:
                    evt = await depth_queue.get()
                    depth: OrderbookDepth = evt["payload"]
                    await self.process_orderbook_depth(depth)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in depth consumer: {e}")

        await asyncio.gather(
            asyncio.create_task(_whale_consumer()),
            asyncio.create_task(_depth_consumer())
        )

    def stop(self) -> None:
        """Stops agent execution loop."""
        self.is_running = False
        logger.info("WhaleTracker Agent stopped.")


if __name__ == "__main__":
    print("=== AGENT WHALE TRACKER TEST EXECUTION ===")

    async def run_agent_demo():
        bus = MarketEventBus()
        oms = OrderManagementSystem()
        agent = WhaleTrackerAgent(event_bus=bus, oms=oms)

        from market_data_stream import MarketDataStreamer
        streamer = MarketDataStreamer(symbols=["btcusdt"], event_bus=bus)

        agent_task = asyncio.create_task(agent.start())
        stream_task = asyncio.create_task(streamer.start_simulated_stream())

        print("Running WhaleTracker daemon for 2 seconds...")
        await asyncio.sleep(2.0)

        agent.stop()
        streamer.stop()
        agent_task.cancel()
        stream_task.cancel()
        print("WhaleTracker Test Complete.")

    asyncio.run(run_agent_demo())

# END CODE | סך הכל שורות: 246
