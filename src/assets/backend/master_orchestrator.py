# 24/07/2026, 17:00
"""
Master Orchestrator - Main Central Nervous System & Entry Point for OFERTRADINGBOT.
Bootstraps MarketDataStreamer, OrderManagementSystem, HardRiskManager, TimeseriesDatabase,
LiveTelemetryWS Bridge, and AI Agent daemons (AlphaHunterAgent, WhaleTrackerAgent, MetaSupervisorAgent).
Handles concurrent asyncio execution, event routing, real-time telemetry streaming, and signal-driven graceful shutdown.
Adheres strictly to the Ofer Fisher Protocol with zero brevity and dynamic GenAI model selection.
"""

import os
import sys
import time
import signal
import logging
import asyncio
from typing import Dict, List, Optional, Any, Union
from datetime import datetime

from market_data_stream import MarketDataStreamer, MarketEventBus
from order_management_system import OrderManagementSystem
from hard_risk_manager import HardRiskManager
from llm_cognitive_engine import CognitiveEngine
from timeseries_db import TimeseriesDatabase
from live_telemetry_ws import LiveTelemetryServer
from agent_alpha_hunter import AlphaHunterAgent
from agent_whale_tracker import WhaleTrackerAgent
from agent_meta_supervisor import MetaSupervisorAgent

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("MasterOrchestrator")


class MasterOrchestrator:
    """
    Central Nervous System and Master Entry Point for OFERTRADINGBOT.
    Manages system lifecycle, async event routing, real-time UI telemetry, and graceful shutdown.
    """

    def __init__(
        self,
        symbols: Optional[List[str]] = None,
        db_path: str = "timeseries_trading.db",
        telemetry_port: int = 8000
    ):
        """
        Initializes MasterOrchestrator and dependent trading infrastructure modules.

        Args:
            symbols (Optional[List[str]]): Target trading symbols list.
            db_path (str): Database path for TimeseriesDatabase persistence.
            telemetry_port (int): Port for LiveTelemetryWS bridge server.
        """
        self.symbols = symbols or ["btcusdt", "ethusdt", "solusdt", "nvda", "pltr"]
        self.db_path = db_path
        self.telemetry_port = telemetry_port
        self.is_running = False

        logger.info("Initializing Master Orchestrator core components...")

        # 1. Event Bus
        self.event_bus = MarketEventBus()

        # 2. Risk Manager & OMS
        self.risk_manager = HardRiskManager(initial_balance=100000.0)
        self.oms = OrderManagementSystem()
        self.oms.risk_manager = self.risk_manager

        # 3. Time-Series Database
        self.ts_db = TimeseriesDatabase(db_path=self.db_path, flush_interval_sec=1.0, batch_size=50)

        # 4. Cognitive Engine
        self.cognitive_engine = CognitiveEngine(default_provider="auto")

        # 5. Live Telemetry WS Bridge
        self.telemetry_server = LiveTelemetryServer(
            host="0.0.0.0",
            port=self.telemetry_port,
            event_bus=self.event_bus
        )

        # 6. Market Data Streamer
        self.streamer = MarketDataStreamer(symbols=self.symbols, event_bus=self.event_bus)

        # 7. Autonomous AI Agents
        self.alpha_hunter = AlphaHunterAgent(
            event_bus=self.event_bus,
            oms=self.oms,
            cognitive_engine=self.cognitive_engine
        )

        self.whale_tracker = WhaleTrackerAgent(
            event_bus=self.event_bus,
            oms=self.oms
        )

        self.meta_supervisor = MetaSupervisorAgent(
            event_bus=self.event_bus,
            oms=self.oms,
            risk_manager=self.risk_manager,
            cognitive_engine=self.cognitive_engine,
            alpha_hunter_agent=self.alpha_hunter,
            evaluation_interval_sec=5.0
        )

        self.tasks: List[asyncio.Task] = []
        self._router_task: Optional[asyncio.Task] = None

    def select_dynamic_genai_model(self) -> str:
        """
        Dynamically discovers and selects the best available Google GenAI model.

        Returns:
            str: Selected model name.
        """
        try:
            import google.generativeai as genai
            api_key = os.getenv("GEMINI_API_KEY", "")
            if api_key:
                genai.configure(api_key=api_key)
                models = [m.name for m in genai.list_models() if "generateContent" in m.supported_generation_methods]
                for candidate in ["models/gemini-2.5-flash", "models/gemini-1.5-flash", "models/gemini-1.5-pro"]:
                    if candidate in models:
                        return candidate
                if models:
                    return models[0]
            return "gemini-2.5-flash"
        except Exception as err:
            logger.info(f"GenAI discovery fallback in MasterOrchestrator: {err}")
            return "gemini-2.5-flash"

    async def _event_router_loop(self) -> None:
        """
        Subscribes to global event stream and routes events to TimeseriesDB for persistence.
        """
        logger.info("Event Router Loop started. Routing market & agent events to TimeseriesDB...")
        tick_queue = self.event_bus.subscribe("tick")

        while self.is_running:
            try:
                event = await tick_queue.get()
                payload = event.get("payload")
                ts = event.get("ts", time.time())

                if payload and hasattr(payload, "symbol"):
                    await self.ts_db.log_tick_buffered(
                        symbol=getattr(payload, "symbol", "UNKNOWN"),
                        price=getattr(payload, "price", 0.0),
                        quantity=getattr(payload, "quantity", 0.0),
                        side=getattr(payload, "side", "BUY"),
                        exchange=getattr(payload, "exchange", "binance"),
                        ts=ts
                    )

                tick_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as err:
                logger.error(f"Error in Event Router loop: {err}")
                await asyncio.sleep(0.5)

    async def start(self) -> None:
        """
        Boots DB, Telemetry WS server, Streamer, and Agent daemons concurrently into asyncio loop.
        """
        self.is_running = True
        logger.info("Initializing TimeseriesDB storage layer...")
        await self.ts_db.initialize_db()

        logger.info("Launching Live Telemetry WebSocket Server...")
        await self.telemetry_server.start()

        logger.info("Starting Master Orchestrator concurrent event loops...")

        # Spawn Agent Tasks
        alpha_task = asyncio.create_task(self.alpha_hunter.start(), name="Agent_AlphaHunter")
        whale_task = asyncio.create_task(self.whale_tracker.start(), name="Agent_WhaleTracker")
        meta_task = asyncio.create_task(self.meta_supervisor.start(), name="Agent_MetaSupervisor")

        # Spawn Streamer Task
        stream_task = asyncio.create_task(self.streamer.start_simulated_stream(), name="Market_Data_Streamer")

        # Spawn Router Task
        self._router_task = asyncio.create_task(self._event_router_loop(), name="Event_Router")

        self.tasks = [alpha_task, whale_task, meta_task, stream_task]

        await self.telemetry_server.publish_thought(
            agent_name="MasterOrchestrator",
            level="EXECUTION",
            message="🚀 OFERTRADINGBOT Central Master Orchestrator Online",
            details=f"Subsystems active: TimeseriesDB, TelemetryWS ({self.telemetry_port}), AlphaHunter, WhaleTracker, MetaSupervisor."
        )

        logger.info("All OFERTRADINGBOT daemons launched successfully.")
        logger.info("System operational. Press Ctrl+C or send SIGTERM to trigger graceful shutdown.")

        try:
            await asyncio.gather(*self.tasks)
        except asyncio.CancelledError:
            logger.info("Master Orchestrator tasks cancellation sequence invoked.")

    async def shutdown(self) -> None:
        """
        Executes a rigorous graceful shutdown: cancels open orders, stops agents & WS servers, flushes DB.
        """
        if not self.is_running:
            return

        logger.warning("Initiating rigorous graceful shutdown sequence...")
        self.is_running = False

        # Emit shutdown notification to telemetry
        try:
            await self.telemetry_server.publish_thought(
                agent_name="MasterOrchestrator",
                level="WARN",
                message="⚠️ System Shutdown Triggered - Closing Positions & Saving State",
                details="Executing SIGINT/SIGTERM cancellation procedures across all active orders and streams."
            )
        except Exception:
            pass

        # 1. Stop Agents
        try:
            self.alpha_hunter.stop()
            self.whale_tracker.stop()
            await self.meta_supervisor.stop()
        except Exception as err:
            logger.error(f"Error stopping agents: {err}")

        # 2. Stop Data Streamer
        try:
            self.streamer.stop()
        except Exception as err:
            logger.error(f"Error stopping streamer: {err}")

        # 3. Cancel Open OMS Orders if any
        try:
            from order_management_system import OrderStatus
            canceled_count = 0
            for order in self.oms.orders.values():
                if order.status in [OrderStatus.NEW, OrderStatus.PENDING]:
                    order.status = OrderStatus.CANCELED
                    canceled_count += 1
            logger.info(f"Canceled {canceled_count} active open orders in OMS.")
        except Exception as err:
            logger.error(f"Error canceling OMS orders: {err}")

        # 4. Flush and Close TimeseriesDB
        try:
            if self._router_task and not self._router_task.done():
                self._router_task.cancel()
            await self.ts_db.close()
        except Exception as err:
            logger.error(f"Error closing TimeseriesDB: {err}")

        # 5. Stop Telemetry Server
        try:
            await self.telemetry_server.stop()
        except Exception as err:
            logger.error(f"Error stopping Telemetry server: {err}")

        # 6. Cancel remaining asyncio tasks
        for t in self.tasks:
            if not t.done():
                t.cancel()

        logger.info("Shutdown sequence completed. All connections and databases closed safely.")

    def stop(self) -> None:
        """Synchronous wrapper trigger for graceful shutdown."""
        asyncio.create_task(self.shutdown())


async def main() -> None:
    """Entry point for running Master Orchestrator with signal handling."""
    orchestrator = MasterOrchestrator()
    loop = asyncio.get_running_loop()

    # Register OS Signal Handlers
    def _handle_exit_signal():
        logger.warning("Exit signal received (SIGINT/SIGTERM). Requesting orchestrator shutdown...")
        orchestrator.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_exit_signal)
        except NotImplementedError:
            pass

    try:
        await orchestrator.start()
    except KeyboardInterrupt:
        logger.warning("KeyboardInterrupt caught in main execution block.")
        await orchestrator.shutdown()


if __name__ == "__main__":
    print("=== MASTER ORCHESTRATOR FULL TEST EXECUTION ===")

    async def run_demo_cycle():
        orchestrator = MasterOrchestrator(
            symbols=["btcusdt", "ethusdt", "nvda"],
            db_path="test_master_ts.db",
            telemetry_port=8008
        )

        # Launch orchestrator in background task
        orchestrator_task = asyncio.create_task(orchestrator.start())

        print("Running full autonomous trading system for 3.5 seconds...")
        await asyncio.sleep(3.5)

        print("Triggering graceful shutdown sequence...")
        await orchestrator.shutdown()

        if orchestrator_task and not orchestrator_task.done():
            orchestrator_task.cancel()

        # Clean up test DB
        if os.path.exists("test_master_ts.db"):
            try:
                os.remove("test_master_ts.db")
            except Exception:
                pass

        print("Master Orchestrator full test execution finished successfully.")

    asyncio.run(run_demo_cycle())

# END CODE | סך הכל שורות: 335
