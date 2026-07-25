# 24/07/2026, 03:47
"""
Market Data Stream (WebSocket Feed) Module for OFERTRADINGBOT.
Provides zero-latency real-time market data streaming for Tick data and Level 2 Orderbook depth.
Routes streamed market events through an async Event Bus / Queue for consumption by AI trading agents.
"""

import os
import sys
import json
import time
import asyncio
import logging
try:
    import websockets
except ImportError:
    websockets = None
from typing import Dict, List, Optional, Callable, Any, Union, Set
from dataclasses import dataclass, field
from datetime import datetime

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("MarketDataStream")


@dataclass
class TickData:
    """Dataclass representing a real-time trade tick."""
    symbol: str
    price: float
    quantity: float
    timestamp: float
    side: str
    exchange: str


@dataclass
class OrderbookDepth:
    """Dataclass representing Level 2 Orderbook snapshot."""
    symbol: str
    bids: List[List[float]]  # [[price, size], ...]
    asks: List[List[float]]  # [[price, size], ...]
    timestamp: float
    exchange: str


class MarketEventBus:
    """
    Asynchronous Pub/Sub Event Bus for routing live market data feeds
    to AI agent consumers (e.g., AlphaHunter, WhaleTracker).
    """

    def __init__(self):
        """Initializes queues and subscriber mappings."""
        self.subscribers: Dict[str, Set[asyncio.Queue]] = {
            "tick": set(),
            "orderbook": set(),
            "whale_alert": set()
        }
        self.global_queue: asyncio.Queue = asyncio.Queue(maxsize=10000)

    def subscribe(self, topic: str) -> asyncio.Queue:
        """
        Subscribes a listener queue to a specific market event topic.

        Args:
            topic (str): Event topic ('tick', 'orderbook', or 'whale_alert').

        Returns:
            asyncio.Queue: Event queue receiving pushed market events.
        """
        queue: asyncio.Queue = asyncio.Queue(maxsize=5000)
        if topic not in self.subscribers:
            self.subscribers[topic] = set()
        self.subscribers[topic].add(queue)
        logger.info(f"New subscriber registered for topic: '{topic}'")
        return queue

    async def publish(self, topic: str, data: Any) -> None:
        """
        Publishes a market event to topic queues and global event stream.

        Args:
            topic (str): Target event topic.
            data (Any): Event object payload.
        """
        if topic in self.subscribers:
            for q in list(self.subscribers[topic]):
                try:
                    if not q.full():
                        await q.put({"topic": topic, "payload": data, "ts": time.time()})
                except Exception as err:
                    logger.error(f"Error publishing to queue on topic '{topic}': {err}")

        if not self.global_queue.full():
            await self.global_queue.put({"topic": topic, "payload": data, "ts": time.time()})


class MarketDataStreamer:
    """
    High-Performance Zero-Latency WebSocket Feed Client for Crypto and Equity markets.
    """

    def __init__(self, symbols: List[str], event_bus: Optional[MarketEventBus] = None):
        """
        Initializes the WebSocket Market Data Streamer.

        Args:
            symbols (List[str]): List of trading pair symbols (e.g., ['btcusdt', 'ethusdt']).
            event_bus (Optional[MarketEventBus]): Target Event Bus instance.
        """
        self.symbols = [s.lower().replace('/', '') for s in symbols]
        self.event_bus = event_bus or MarketEventBus()
        self.is_running = False
        self._ws_connection = None
        self.reconnect_delay = 1.0
        self.whale_threshold_usd = 100000.0  # $100k+ trades flagged as whale activity

    def select_dynamic_genai_model(self) -> str:
        """
        Dynamically detects available Google GenAI models for market stream analysis.

        Returns:
            str: Selected model identifier string.
        """
        try:
            from google import genai
            client = genai.Client()
            available = [m.name for m in client.models.list()]
            for pref in ["models/gemini-2.5-flash", "models/gemini-1.5-pro", "models/gemini-1.5-flash"]:
                if pref in available:
                    return pref
            return available[0] if available else "gemini-2.5-flash"
        except Exception as e:
            logger.info(f"GenAI auto-detect fallback in DataStream: {e}")
            return "gemini-2.5-flash"

    async def connect_binance_websocket(self) -> None:
        """
        Connects to Binance Combined WebSocket Stream for Ticks and Level 2 Orderbook.
        Includes automatic connection recovery with exponential backoff.
        """
        streams = []
        for s in self.symbols:
            streams.append(f"{s}@trade")
            streams.append(f"{s}@depth10@100ms")

        stream_path = "/".join(streams)
        ws_url = f"wss://stream.binance.com:9443/stream?streams={stream_path}"

        self.is_running = True
        while self.is_running:
            try:
                logger.info(f"Connecting to Binance WS Feed: {ws_url[:60]}...")
                async with websockets.connect(ws_url, ping_interval=20, ping_timeout=10) as ws:
                    self._ws_connection = ws
                    self.reconnect_delay = 1.0
                    logger.info("WebSocket connected. Listening for zero-latency market events...")

                    async for message in ws:
                        if not self.is_running:
                            break
                        await self._process_ws_message(message)

            except (websockets.ConnectionClosed, Exception) as err:
                logger.warning(f"WebSocket disconnected ({err}). Reconnecting in {self.reconnect_delay:.1f}s...")
                await asyncio.sleep(self.reconnect_delay)
                self.reconnect_delay = min(self.reconnect_delay * 2.0, 30.0)

    async def _process_ws_message(self, raw_message: str) -> None:
        """
        Parses WebSocket JSON frame and publishes structured events to EventBus.

        Args:
            raw_message (str): Raw WebSocket frame string payload.
        """
        try:
            msg = json.loads(raw_message)
            stream_type = msg.get("stream", "")
            data = msg.get("data", {})

            # Trade Tick Stream
            if "@trade" in stream_type:
                tick = TickData(
                    symbol=data.get("s", "").upper(),
                    price=float(data.get("p", 0.0)),
                    quantity=float(data.get("q", 0.0)),
                    timestamp=data.get("T", time.time() * 1000) / 1000.0,
                    side="SELL" if data.get("m", False) else "BUY",
                    exchange="binance"
                )
                await self.event_bus.publish("tick", tick)

                # Whale Activity Detection
                notional_value = tick.price * tick.quantity
                if notional_value >= self.whale_threshold_usd:
                    whale_event = {
                        "symbol": tick.symbol,
                        "side": tick.side,
                        "usd_value": round(notional_value, 2),
                        "price": tick.price,
                        "quantity": tick.quantity,
                        "timestamp": tick.timestamp
                    }
                    logger.info(f"🐋 WHALE ALERT DETECTED: {tick.side} ${notional_value:,.2f} on {tick.symbol} @ {tick.price}")
                    await self.event_bus.publish("whale_alert", whale_event)

            # Level 2 Orderbook Depth Stream
            elif "@depth" in stream_type:
                depth = OrderbookDepth(
                    symbol=stream_type.split("@")[0].upper(),
                    bids=[[float(p), float(q)] for p, q in data.get("bids", [])],
                    asks=[[float(p), float(q)] for p, q in data.get("asks", [])],
                    timestamp=time.time(),
                    exchange="binance"
                )
                await self.event_bus.publish("orderbook", depth)

        except Exception as err:
            logger.error(f"Error parsing WS message payload: {err}")

    async def start_simulated_stream(self) -> None:
        """
        Fallback high-frequency simulated market stream generator for testing environments.
        """
        self.is_running = True
        logger.info("Starting simulated zero-latency market stream generator...")
        import random

        prices = {"BTCUSDT": 65000.0, "ETHUSDT": 3500.0, "SOLUSDT": 150.0}

        while self.is_running:
            for symbol in prices:
                delta = random.uniform(-0.002, 0.002)
                prices[symbol] *= (1.0 + delta)
                price = round(prices[symbol], 2)
                qty = round(random.uniform(0.01, 3.5), 4)

                tick = TickData(
                    symbol=symbol,
                    price=price,
                    quantity=qty,
                    timestamp=time.time(),
                    side=random.choice(["BUY", "SELL"]),
                    exchange="simulated"
                )
                await self.event_bus.publish("tick", tick)

                # Occasional simulated whale trade
                if random.random() < 0.05:
                    whale_qty = round(random.uniform(15.0, 50.0), 2)
                    usd_val = price * whale_qty
                    await self.event_bus.publish("whale_alert", {
                        "symbol": symbol,
                        "side": tick.side,
                        "usd_value": round(usd_val, 2),
                        "price": price,
                        "quantity": whale_qty,
                        "timestamp": time.time()
                    })

            await asyncio.sleep(0.1)  # 10 Hz market feed simulation

    def stop(self) -> None:
        """Stops streaming connection loop gracefully."""
        self.is_running = False
        logger.info("Stopping Market Data Streamer...")


if __name__ == "__main__":
    print("=== MARKET DATA STREAM TEST EXECUTION ===")
    
    async def run_stream_demo():
        bus = MarketEventBus()
        streamer = MarketDataStreamer(symbols=["btcusdt", "ethusdt"], event_bus=bus)

        # Register AI Agent Listener Queues
        tick_queue = bus.subscribe("tick")
        whale_queue = bus.subscribe("whale_alert")

        # Consumer Agent Consumer Task
        async def alpha_hunter_consumer():
            for _ in range(5):
                evt = await tick_queue.get()
                tick: TickData = evt["payload"]
                print(f"[AlphaHunter Agent Received Tick] {tick.symbol} -> Price: ${tick.price} | Qty: {tick.quantity} ({tick.side})")

        async def whale_tracker_consumer():
            for _ in range(2):
                evt = await whale_queue.get()
                w = evt["payload"]
                print(f"[WhaleTracker Agent Received Alert] 🐋 {w['symbol']} ${w['usd_value']:,.2f} {w['side']}")

        # Launch streamer and listeners
        task1 = asyncio.create_task(streamer.start_simulated_stream())
        task2 = asyncio.create_task(alpha_hunter_consumer())
        task3 = asyncio.create_task(whale_tracker_consumer())

        await asyncio.gather(task2, task3)
        streamer.stop()
        task1.cancel()
        print("Market Data Stream Test Complete.")

    asyncio.run(run_stream_demo())

# END CODE | סך הכל שורות: 311
