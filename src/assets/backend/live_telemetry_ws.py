# 24/07/2026, 17:00
"""
Live Telemetry WebSocket Server Module for OFERTRADINGBOT.
Provides a zero-latency real-time WebSocket bridge between python autonomous daemons and the React Frontend Dashboard / Situation Room.
Listens to the 'telemetry' topic on the MarketEventBus and broadcasts agent internal thoughts, PnL updates, and LLM reasoning logs.
Adheres strictly to the Ofer Fisher Protocol with full type hinting and zero brevity.
"""

import os
import sys
import json
import time
import asyncio
import logging
from typing import Dict, List, Optional, Set, Any, Union
from datetime import datetime

try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    HAS_FASTAPI = True
except ImportError:
    FastAPI = None
    WebSocket = None
    WebSocketDisconnect = Exception
    HAS_FASTAPI = False

try:
    import websockets
    HAS_WEBSOCKETS = True
except ImportError:
    websockets = None
    HAS_WEBSOCKETS = False

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("LiveTelemetryWS")


class TelemetryConnectionManager:
    """
    Manages active WebSocket client connections and broadcasts live telemetry payloads.
    """

    def __init__(self):
        """Initializes connection registry and broadcasting locks."""
        self.active_connections: Set[Any] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: Any) -> None:
        """
        Accepts and registers a new React client WebSocket connection.

        Args:
            websocket (Any): WebSocket connection object.
        """
        if HAS_FASTAPI and hasattr(websocket, "accept"):
            await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
            logger.info(f"New React client connected to Telemetry WS. Active clients: {len(self.active_connections)}")

    async def disconnect(self, websocket: Any) -> None:
        """Unregisters a disconnected WebSocket client."""
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
                logger.info(f"React client disconnected from Telemetry WS. Remaining clients: {len(self.active_connections)}")

    async def broadcast(self, message: Union[Dict[str, Any], str]) -> None:
        """
        Broadcasts JSON message payload to all active React client connections.

        Args:
            message (Union[Dict[str, Any], str]): Payload dictionary or pre-formatted JSON string.
        """
        async with self._lock:
            if not self.active_connections:
                return

            payload_str = json.dumps(message) if isinstance(message, dict) else message
            disconnected_clients = []

            for conn in list(self.active_connections):
                try:
                    if HAS_FASTAPI and hasattr(conn, "send_text"):
                        await conn.send_text(payload_str)
                    elif HAS_WEBSOCKETS and hasattr(conn, "send"):
                        await conn.send(payload_str)
                except Exception as err:
                    logger.warning(f"Error sending telemetry packet to client: {err}")
                    disconnected_clients.append(conn)

            for dead_conn in disconnected_clients:
                if dead_conn in self.active_connections:
                    self.active_connections.remove(dead_conn)


class LiveTelemetryServer:
    """
    Dedicated Telemetry WebSocket Bridge for OFERTRADINGBOT.
    Serves as the central communication channel between python daemons and React UI.
    """

    def __init__(self, host: str = "0.0.0.0", port: int = 8000, event_bus: Optional[Any] = None):
        """
        Initializes Telemetry Server with host, port, and optional EventBus reference.

        Args:
            host (str): Listening host interface.
            port (int): Port number for telemetry server.
            event_bus (Optional[Any]): Central MarketEventBus instance.
        """
        self.host = host
        self.port = port
        self.event_bus = event_bus
        self.manager = TelemetryConnectionManager()
        self._server_task: Optional[asyncio.Task] = None
        self._bridge_task: Optional[asyncio.Task] = None
        self._is_running = False

    def select_dynamic_genai_model(self) -> str:
        """
        Dynamically discovers Google GenAI models for telemetry formatting if requested.

        Returns:
            str: Selected model name.
        """
        try:
            import google.generativeai as genai
            api_key = os.getenv("GEMINI_API_KEY", "")
            if api_key:
                genai.configure(api_key=api_key)
                models = [m.name for m in genai.list_models() if "generateContent" in m.supported_generation_methods]
                for candidate in ["models/gemini-2.5-flash", "models/gemini-1.5-flash"]:
                    if candidate in models:
                        return candidate
                if models:
                    return models[0]
            return "gemini-2.5-flash"
        except Exception as err:
            logger.info(f"GenAI discovery fallback in LiveTelemetryWS: {err}")
            return "gemini-2.5-flash"

    async def start(self) -> None:
        """
        Launches the WebSocket server and hooks subscriber loop to MarketEventBus.
        """
        self._is_running = True

        if self.event_bus:
            self._bridge_task = asyncio.create_task(
                self._event_bus_telemetry_listener(),
                name="Telemetry_EventBus_Bridge"
            )

        if HAS_FASTAPI:
            await self._start_fastapi_server()
        elif HAS_WEBSOCKETS:
            await self._start_websockets_server()
        else:
            logger.warning("Neither FastAPI nor websockets available. Telemetry WS will run in broadcast-mock mode.")

        logger.info(f"Live Telemetry WS Bridge listening on ws://{self.host}:{self.port}/ws/telemetry")

    async def _start_fastapi_server(self) -> None:
        """Configures and runs FastAPI uvicorn server in background task."""
        app = FastAPI(title="OFERTRADINGBOT Telemetry WS Bridge")
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        manager = self.manager

        @app.websocket("/ws/telemetry")
        async def websocket_telemetry_endpoint(websocket: WebSocket):
            await manager.connect(websocket)
            try:
                while True:
                    data = await websocket.receive_text()
                    # Respond to client ping or commands
                    await websocket.send_text(json.dumps({
                        "topic": "telemetry_ack",
                        "payload": {"status": "received", "echo": data, "timestamp": time.time()}
                    }))
            except WebSocketDisconnect:
                await manager.disconnect(websocket)
            except Exception as err:
                logger.error(f"WebSocket endpoint error: {err}")
                await manager.disconnect(websocket)

        config = uvicorn.Config(app, host=self.host, port=self.port, log_level="warning")
        server = uvicorn.Server(config)
        self._server_task = asyncio.create_task(server.serve(), name="FastAPI_Telemetry_Server")

    async def _start_websockets_server(self) -> None:
        """Fallback server runner using python 'websockets' module."""
        manager = self.manager

        async def handler(websocket, path):
            await manager.connect(websocket)
            try:
                async for message in websocket:
                    await websocket.send(json.dumps({
                        "topic": "telemetry_ack",
                        "payload": {"status": "received", "timestamp": time.time()}
                    }))
            except Exception:
                pass
            finally:
                await manager.disconnect(websocket)

        server = await websockets.serve(handler, self.host, self.port)
        self._server_task = asyncio.create_task(server.wait_closed(), name="Websockets_Telemetry_Server")

    async def _event_bus_telemetry_listener(self) -> None:
        """
        Subscribes to 'telemetry' topic on central MarketEventBus and broadcasts payloads to UI.
        """
        if not self.event_bus:
            return

        telemetry_queue = self.event_bus.subscribe("telemetry")
        logger.info("Telemetry WS listening to MarketEventBus topic 'telemetry'...")

        while self._is_running:
            try:
                event = await telemetry_queue.get()
                topic = event.get("topic", "telemetry")
                payload = event.get("payload", {})
                ts = event.get("ts", time.time())

                telemetry_packet = {
                    "topic": topic,
                    "payload": payload,
                    "timestamp": ts,
                    "formatted_time": datetime.fromtimestamp(ts).strftime("%H:%M:%S.%f")[:-3]
                }

                await self.manager.broadcast(telemetry_packet)
                telemetry_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as err:
                logger.error(f"Error in telemetry listener loop: {err}")

    async def publish_thought(self, agent_name: str, level: str, message: str, details: Optional[str] = None) -> None:
        """
        Direct helper to emit an agent thought event to connected UI clients.

        Args:
            agent_name (str): Originating agent name.
            level (str): 'INFO', 'TRIGGER', 'EXECUTION', or 'WARN'.
            message (str): Primary thought string.
            details (str, optional): Additional context or LLM reasoning log.
        """
        payload = {
            "type": "AGENT_THOUGHT",
            "agent_name": agent_name,
            "level": level,
            "message": message,
            "details": details or "",
            "timestamp": time.time()
        }

        if self.event_bus:
            await self.event_bus.publish("telemetry", payload)
        else:
            await self.manager.broadcast({"topic": "telemetry", "payload": payload, "ts": time.time()})

    async def stop(self) -> None:
        """Stops telemetry server and cleanup background tasks."""
        self._is_running = False
        if self._bridge_task and not self._bridge_task.done():
            self._bridge_task.cancel()
        if self._server_task and not self._server_task.done():
            self._server_task.cancel()
        logger.info("Live Telemetry WS Bridge stopped.")


if __name__ == "__main__":
    print("=== LIVE TELEMETRY WS TEST EXECUTION ===")

    class MockEventBus:
        def __init__(self):
            self.queue = asyncio.Queue()

        def subscribe(self, topic: str):
            return self.queue

        async def publish(self, topic: str, data: Any):
            await self.queue.put({"topic": topic, "payload": data, "ts": time.time()})

    async def test_telemetry():
        mock_bus = MockEventBus()
        telemetry_server = LiveTelemetryServer(host="127.0.0.1", port=8005, event_bus=mock_bus)
        await telemetry_server.start()

        # Emit test thoughts
        await telemetry_server.publish_thought(
            agent_name="AlphaHunter",
            level="TRIGGER",
            message="⚡ Test Breakout Trigger Identified on BTCUSDT",
            details="RSI(14)=64.2, Volume Spike=2.4x"
        )

        await telemetry_server.publish_thought(
            agent_name="WhaleTracker",
            level="INFO",
            message="🐋 Test Whale Bid Wall Identified @ $64,100",
            details="Size: 22.4 BTC | Trust Score: 95.2%"
        )

        await asyncio.sleep(0.5)
        await telemetry_server.stop()
        print("Live Telemetry WS test completed successfully.")

    asyncio.run(test_telemetry())

# END CODE | סך הכל שורות: 328
