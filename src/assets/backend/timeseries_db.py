# 24/07/2026, 17:00
"""
Time-Series Database Persistence Module for OFERTRADINGBOT.
Provides high-performance asynchronous SQLite storage operating in Write-Ahead Logging (WAL) mode
for zero-latency logging and memory-buffered batch writing of Ticks, Executed Orders, AI Signals, and Risk Events.
Adheres strictly to the Ofer Fisher Protocol with dynamic GenAI model selection and zero brevity.
"""

import os
import sys
import json
import time
import asyncio
import logging
import sqlite3
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass, field
from datetime import datetime

try:
    import aiosqlite
    HAS_AIOSQLITE = True
except ImportError:
    aiosqlite = None
    HAS_AIOSQLITE = False

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("TimeseriesDB")


class TimeseriesDatabase:
    """
    Asynchronous High-Performance SQLite Time-Series Database Manager.
    Configured with Write-Ahead Logging (WAL) mode, memory buffering, and batch flushing for ultra-low latency concurrent I/O.
    """

    def __init__(
        self,
        db_path: str = "timeseries_trading.db",
        flush_interval_sec: float = 1.0,
        batch_size: int = 50
    ):
        """
        Initializes Time-Series Database with connection and buffer configuration.

        Args:
            db_path (str): File path for SQLite database.
            flush_interval_sec (float): Frequency in seconds to flush buffered records to disk.
            batch_size (int): Threshold count to trigger immediate batch write.
        """
        self.db_path = db_path
        self.flush_interval_sec = flush_interval_sec
        self.batch_size = batch_size

        self._is_initialized = False
        self._is_flushing = False

        # In-Memory Buffers for Zero-Latency Batch Writing
        self._tick_buffer: List[Tuple[float, str, float, float, str, str]] = []
        self._order_buffer: List[Tuple[str, float, str, str, float, float, str, str]] = []
        self._signal_buffer: List[Tuple[str, float, str, str, str, float, float, float, str, str]] = []
        self._buffer_lock = asyncio.Lock()
        self._flush_task: Optional[asyncio.Task] = None

    def select_dynamic_genai_model(self) -> str:
        """
        Dynamically detects available Google GenAI models for database analytical reasoning.

        Returns:
            str: Dynamically selected Gemini model identifier.
        """
        try:
            import google.generativeai as genai
            api_key = os.getenv("GEMINI_API_KEY", "")
            if api_key:
                genai.configure(api_key=api_key)
                models = [m.name for m in genai.list_models() if "generateContent" in m.supported_generation_methods]
                for pref in ["models/gemini-2.5-flash", "models/gemini-1.5-flash", "models/gemini-1.5-pro"]:
                    if pref in models:
                        return pref
                if models:
                    return models[0]
            return "gemini-2.5-flash"
        except Exception as err:
            logger.info(f"GenAI model discovery fallback in TimeseriesDB: {err}")
            return "gemini-2.5-flash"

    def _get_raw_connection(self) -> sqlite3.Connection:
        """Helper to create and configure raw sqlite3 connection with WAL mode pragmas."""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA cache_size=-64000;")  # 64MB Cache
        return conn

    async def initialize_db(self) -> None:
        """
        Initializes database schema, creates indexes, sets WAL mode, and launches background batch flusher.
        """
        def _sync_init():
            conn = self._get_raw_connection()
            cursor = conn.cursor()

            # 1. Ticks Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ticks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    symbol TEXT NOT NULL,
                    price REAL NOT NULL,
                    quantity REAL NOT NULL,
                    side TEXT NOT NULL,
                    exchange TEXT NOT NULL
                );
            """)

            # 2. Executed Orders Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT UNIQUE NOT NULL,
                    timestamp REAL NOT NULL,
                    symbol TEXT NOT NULL,
                    side TEXT NOT NULL,
                    price REAL NOT NULL,
                    quantity REAL NOT NULL,
                    status TEXT NOT NULL,
                    exchange TEXT NOT NULL
                );
            """)

            # 3. AI Signals Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ai_signals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    signal_id TEXT UNIQUE NOT NULL,
                    timestamp REAL NOT NULL,
                    symbol TEXT NOT NULL,
                    agent_name TEXT NOT NULL,
                    signal_type TEXT NOT NULL,
                    price REAL NOT NULL,
                    quantity REAL NOT NULL,
                    confidence REAL NOT NULL,
                    status TEXT NOT NULL,
                    metadata_json TEXT
                );
            """)

            # 4. Risk & Circuit Breaker Events Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS risk_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    event_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    symbol TEXT,
                    details TEXT NOT NULL,
                    action_taken TEXT NOT NULL
                );
            """)

            # Indexes for ultra-fast query performance
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts ON ticks(symbol, timestamp);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_symbol_ts ON orders(symbol, timestamp);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_signals_ts ON ai_signals(timestamp);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_risk_ts ON risk_events(timestamp);")

            conn.commit()
            conn.close()

        await asyncio.to_thread(_sync_init)
        self._is_initialized = True
        logger.info(f"TimeseriesDB initialized in WAL mode at '{self.db_path}'")

        # Launch background buffer flushing loop
        self._flush_task = asyncio.create_task(self._buffer_flush_loop(), name="TimeseriesDB_Flusher")

    async def log_tick_buffered(
        self,
        symbol: str,
        price: float,
        quantity: float,
        side: str,
        exchange: str = "binance",
        ts: Optional[float] = None
    ) -> None:
        """
        Buffers a market trade tick in memory for zero-latency non-blocking batch write.

        Args:
            symbol (str): Ticker symbol.
            price (float): Executed price.
            quantity (float): Trade volume.
            side (str): 'BUY' or 'SELL'.
            exchange (str): Source exchange.
            ts (Optional[float]): Timestamp in seconds.
        """
        timestamp = ts or time.time()
        async with self._buffer_lock:
            self._tick_buffer.append((timestamp, symbol, price, quantity, side, exchange))
            should_flush = len(self._tick_buffer) >= self.batch_size

        if should_flush:
            await self.flush()

    async def log_order_buffered(
        self,
        order_id: str,
        symbol: str,
        side: str,
        price: float,
        quantity: float,
        status: str,
        exchange: str = "alpaca",
        ts: Optional[float] = None
    ) -> None:
        """Buffers executed order record into memory queue for batch write."""
        timestamp = ts or time.time()
        async with self._buffer_lock:
            self._order_buffer.append((order_id, timestamp, symbol, side, price, quantity, status, exchange))
            should_flush = len(self._order_buffer) >= self.batch_size

        if should_flush:
            await self.flush()

    async def log_signal_buffered(
        self,
        signal_id: str,
        symbol: str,
        agent_name: str,
        signal_type: str,
        price: float,
        quantity: float,
        confidence: float,
        status: str = "EXECUTED",
        metadata: Optional[Dict[str, Any]] = None,
        ts: Optional[float] = None
    ) -> None:
        """Buffers AI agent trading signal into memory queue for batch write."""
        timestamp = ts or time.time()
        meta_str = json.dumps(metadata) if metadata else "{}"
        async with self._buffer_lock:
            self._signal_buffer.append((
                signal_id, timestamp, symbol, agent_name, signal_type,
                price, quantity, confidence, status, meta_str
            ))
            should_flush = len(self._signal_buffer) >= self.batch_size

        if should_flush:
            await self.flush()

    async def log_risk_event(
        self,
        event_type: str,
        severity: str,
        details: str,
        action_taken: str,
        symbol: Optional[str] = None
    ) -> None:
        """Directly logs risk events and circuit breaker breaches."""
        ts = time.time()
        def _sync_write_risk():
            conn = self._get_raw_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO risk_events (timestamp, event_type, severity, symbol, details, action_taken)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (ts, event_type, severity, symbol, details, action_taken))
            conn.commit()
            conn.close()

        await asyncio.to_thread(_sync_write_risk)
        logger.warning(f"Logged Risk Event ({severity}): {event_type} - {details}")

    async def flush(self) -> None:
        """Flushes all buffered ticks, orders, and AI signals to disk inside a single transaction."""
        async with self._buffer_lock:
            ticks_to_write = list(self._tick_buffer)
            orders_to_write = list(self._order_buffer)
            signals_to_write = list(self._signal_buffer)

            self._tick_buffer.clear()
            self._order_buffer.clear()
            self._signal_buffer.clear()

        if not ticks_to_write and not orders_to_write and not signals_to_write:
            return

        def _sync_flush():
            conn = self._get_raw_connection()
            cursor = conn.cursor()

            if ticks_to_write:
                cursor.executemany("""
                    INSERT INTO ticks (timestamp, symbol, price, quantity, side, exchange)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, ticks_to_write)

            if orders_to_write:
                cursor.executemany("""
                    INSERT OR REPLACE INTO orders (order_id, timestamp, symbol, side, price, quantity, status, exchange)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, orders_to_write)

            if signals_to_write:
                cursor.executemany("""
                    INSERT OR REPLACE INTO ai_signals
                    (signal_id, timestamp, symbol, agent_name, signal_type, price, quantity, confidence, status, metadata_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, signals_to_write)

            conn.commit()
            conn.close()

        try:
            await asyncio.to_thread(_sync_flush)
            total_items = len(ticks_to_write) + len(orders_to_write) + len(signals_to_write)
            logger.debug(f"Flushed {total_items} buffered records to TimeseriesDB.")
        except Exception as err:
            logger.error(f"Error flushing buffers to TimeseriesDB: {err}")

    async def _buffer_flush_loop(self) -> None:
        """Background loop flushing memory buffers at regular intervals."""
        self._is_flushing = True
        while self._is_flushing:
            try:
                await asyncio.sleep(self.flush_interval_sec)
                await self.flush()
            except asyncio.CancelledError:
                break
            except Exception as err:
                logger.error(f"Error in buffer flush loop: {err}")

    async def get_recent_ticks(self, symbol: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Retrieves recent tick history for analytical queries."""
        def _query():
            conn = self._get_raw_connection()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM ticks WHERE symbol = ? ORDER BY timestamp DESC LIMIT ?",
                (symbol, limit)
            )
            rows = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return rows

        return await asyncio.to_thread(_query)

    async def get_recent_orders(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves recent executed order history."""
        def _query():
            conn = self._get_raw_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM orders ORDER BY timestamp DESC LIMIT ?", (limit,))
            rows = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return rows

        return await asyncio.to_thread(_query)

    async def get_recent_signals(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves recent logged AI agent signals."""
        def _query():
            conn = self._get_raw_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ai_signals ORDER BY timestamp DESC LIMIT ?", (limit,))
            rows = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return rows

        return await asyncio.to_thread(_query)

    async def close(self) -> None:
        """Flushes remaining buffers and stops background flusher task."""
        self._is_flushing = False
        if self._flush_task and not self._flush_task.done():
            self._flush_task.cancel()
        await self.flush()
        logger.info("TimeseriesDB closed safely.")


if __name__ == "__main__":
    print("=== TIMESERIES DB TEST EXECUTION ===")

    async def test_timeseries_db():
        test_db_path = "test_timeseries.db"
        if os.path.exists(test_db_path):
            try:
                os.remove(test_db_path)
            except Exception:
                pass

        db = TimeseriesDatabase(db_path=test_db_path, flush_interval_sec=0.2, batch_size=5)
        await db.initialize_db()

        # Test GenAI selection
        model_name = db.select_dynamic_genai_model()
        print(f"Dynamic GenAI Selected Model: {model_name}")

        # Buffer Ticks
        await db.log_tick_buffered("BTCUSDT", 65200.0, 0.25, "BUY")
        await db.log_tick_buffered("BTCUSDT", 65250.0, 0.50, "SELL")

        # Buffer Order
        await db.log_order_buffered("ORD-1001", "BTCUSDT", "BUY", 65200.0, 0.25, "FILLED")

        # Buffer Signal
        await db.log_signal_buffered(
            signal_id="SIG-1001",
            symbol="BTCUSDT",
            agent_name="AlphaHunter",
            signal_type="BUY",
            price=65200.0,
            quantity=0.25,
            confidence=0.92,
            metadata={"strategy": "MomentumBreakout"}
        )

        # Force Flush
        await db.flush()

        ticks = await db.get_recent_ticks("BTCUSDT")
        orders = await db.get_recent_orders()
        signals = await db.get_recent_signals()

        print(f"Retrieved Ticks Count: {len(ticks)}")
        print(f"Retrieved Orders Count: {len(orders)}")
        print(f"Retrieved Signals Count: {len(signals)}")

        await db.close()

        if os.path.exists(test_db_path):
            try:
                os.remove(test_db_path)
            except Exception:
                pass

        print("TimeseriesDB execution test completed successfully.")

    asyncio.run(test_timeseries_db())

# END CODE | סך הכל שורות: 447
