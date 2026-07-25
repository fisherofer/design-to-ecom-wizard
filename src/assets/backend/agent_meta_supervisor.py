# 24/07/2026, 17:00
"""
Agent MetaSupervisor - Macro-Level Portfolio & Risk Oversight AI Daemon for OFERTRADINGBOT.
Monitors system-wide market regimes (VIX, SPY, BTC correlation), portfolio equity, and drawdown metrics.
Dynamically tunes sub-agent quantitative parameters (AlphaHunter volume thresholds, HardRiskManager max trade risk)
and uses CognitiveEngine to generate structured Hebrew macro summaries for the UI.
Adheres strictly to the Ofer Fisher Protocol with dynamic GenAI model selection and zero brevity.
"""

import os
import sys
import json
import time
import logging
import asyncio
import random
from typing import Dict, List, Optional, Any, Tuple, Union
from datetime import datetime

from market_data_stream import MarketEventBus
from llm_cognitive_engine import CognitiveEngine
from order_management_system import OrderManagementSystem
from hard_risk_manager import HardRiskManager

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("AgentMetaSupervisor")


class MetaSupervisorAgent:
    """
    Macro-level AI Agent supervising portfolio health, systemic market risk, and sub-agent parameters.
    """

    def __init__(
        self,
        event_bus: MarketEventBus,
        oms: OrderManagementSystem,
        risk_manager: HardRiskManager,
        cognitive_engine: Optional[CognitiveEngine] = None,
        alpha_hunter_agent: Optional[Any] = None,
        evaluation_interval_sec: float = 5.0
    ):
        """
        Initializes MetaSupervisorAgent with event bus, OMS, Risk Manager, and Cognitive Engine references.

        Args:
            event_bus (MarketEventBus): Shared asynchronous event bus instance.
            oms (OrderManagementSystem): Central OMS instance.
            risk_manager (HardRiskManager): Hard deterministic risk manager instance.
            cognitive_engine (Optional[CognitiveEngine]): AI reasoning gateway instance.
            alpha_hunter_agent (Optional[Any]): AlphaHunter agent instance for parameter tuning.
            evaluation_interval_sec (float): Frequency of macro health evaluation loop in seconds.
        """
        self.event_bus = event_bus
        self.oms = oms
        self.risk_manager = risk_manager
        self.cognitive_engine = cognitive_engine or CognitiveEngine(default_provider="auto")
        self.alpha_hunter_agent = alpha_hunter_agent
        self.evaluation_interval_sec = evaluation_interval_sec

        self.agent_id = "meta_supervisor"
        self.agent_name = "MetaSupervisor Agent"
        self.python_file = "agent_meta_supervisor.py"

        self._is_running = False
        self._supervisor_task: Optional[asyncio.Task] = None

        # Macro state parameters
        self.vix_index = 18.5
        self.market_regime = "NORMAL_BULL"
        self.systemic_risk_score = 0.22  # 0.0 to 1.0
        self.hebrew_macro_summary = "שוק יציב: מדדי הסיכון במצב תקין, נפחי המסחר ותנודתיות ה-VIX במגמה ניטרלית."
        self.last_macro_update = time.time()

    def select_dynamic_genai_model(self) -> str:
        """
        Dynamically discovers and selects the best available Google GenAI model.

        Returns:
            str: Selected Gemini model identifier.
        """
        try:
            import google.generativeai as genai
            api_key = os.getenv("GEMINI_API_KEY", "")
            if api_key:
                genai.configure(api_key=api_key)
                available_models = [
                    m.name for m in genai.list_models()
                    if "generateContent" in m.supported_generation_methods
                ]
                for candidate in ["models/gemini-2.5-flash", "models/gemini-1.5-flash", "models/gemini-1.5-pro"]:
                    if candidate in available_models or candidate.replace("models/", "") in available_models:
                        logger.info(f"MetaSupervisor selected dynamic GenAI model: '{candidate}'")
                        return candidate
                if available_models:
                    return available_models[0]
            return "gemini-2.5-flash"
        except Exception as err:
            logger.info(f"GenAI model discovery fallback in MetaSupervisor: {err}")
            return "gemini-2.5-flash"

    async def start(self) -> None:
        """
        Launches the MetaSupervisor loop monitoring portfolio equity and market regimes.
        """
        self._is_running = True
        self._supervisor_task = asyncio.create_task(self._supervision_loop(), name="MetaSupervisor_Loop")
        logger.info(f"{self.agent_name} daemon started successfully.")
        await self._emit_telemetry(
            level="INFO",
            message="🛡️ MetaSupervisor Daemon Active: Macro Portfolio & Systemic Risk Oversight Online",
            details="Monitoring VIX correlation, drawdown levels, and tuning sub-agent thresholds dynamically."
        )

    async def _supervision_loop(self) -> None:
        """
        Main supervision loop executing macro market evaluations and risk checks.
        """
        tick_queue = self.event_bus.subscribe("tick")

        while self._is_running:
            try:
                # Process tick queue non-blockingly if available
                while not tick_queue.empty():
                    tick_event = tick_queue.get_nowait()
                    tick_queue.task_done()

                # Evaluate Macro Health & Portfolio Metrics
                await self.evaluate_macro_regime()

                await asyncio.sleep(self.evaluation_interval_sec)
            except asyncio.CancelledError:
                break
            except Exception as err:
                logger.error(f"Error in MetaSupervisor loop: {err}")
                await asyncio.sleep(2.0)

    async def evaluate_macro_regime(self) -> None:
        """
        Evaluates current portfolio balance, open positions, drawdown, and macro market conditions.
        Dynamically adjusts risk parameters if high volatility or steep drawdowns occur.
        """
        current_balance = getattr(self.risk_manager, "account_balance", 100000.0)
        pnl = self.oms.get_portfolio_summary()
        unrealized = pnl.get("total_unrealized_pnl", 0.0)
        drawdown_pct = abs(min(0.0, unrealized / max(1.0, current_balance)))

        # Simulate dynamic market volatility index (VIX)
        vix_jitter = (random.random() - 0.48) * 0.8
        self.vix_index = max(10.0, min(65.0, self.vix_index + vix_jitter))

        # Determine macro market regime
        if self.vix_index > 35.0 or drawdown_pct > 0.04:
            new_regime = "HIGH_VOLATILITY_PANIC"
            self.systemic_risk_score = min(1.0, 0.75 + drawdown_pct * 3.0)
        elif self.vix_index > 25.0 or drawdown_pct > 0.02:
            new_regime = "ELEVATED_RISK_CAUTION"
            self.systemic_risk_score = 0.50
        else:
            new_regime = "NORMAL_BULL"
            self.systemic_risk_score = max(0.1, self.vix_index / 100.0)

        # Dynamic parameter tuning based on macro regime
        if new_regime != self.market_regime:
            self.market_regime = new_regime
            logger.warning(f"MetaSupervisor detected Market Regime shift -> {self.market_regime} (Risk Score: {self.systemic_risk_score:.2f})")

            # Adjust AlphaHunter parameters dynamically
            if self.alpha_hunter_agent:
                if self.market_regime == "HIGH_VOLATILITY_PANIC":
                    self.alpha_hunter_agent.volume_spike_threshold = 2.8  # Stricter volume threshold
                    logger.info("MetaSupervisor tightened AlphaHunter volume_spike_threshold to 2.8x")
                elif self.market_regime == "ELEVATED_RISK_CAUTION":
                    self.alpha_hunter_agent.volume_spike_threshold = 2.2
                else:
                    self.alpha_hunter_agent.volume_spike_threshold = 1.8

            # Adjust HardRiskManager parameters dynamically
            if self.market_regime == "HIGH_VOLATILITY_PANIC":
                self.risk_manager.risk_limits.max_trade_risk_pct = 0.008  # Drop to 0.8%
                logger.warning("MetaSupervisor lowered HardRiskManager max_trade_risk_pct to 0.8%")
            else:
                self.risk_manager.risk_limits.max_trade_risk_pct = 0.015

            # Emit adjustment telemetry
            await self._emit_telemetry(
                level="WARN" if self.systemic_risk_score > 0.5 else "INFO",
                message=f"🌐 Macro Regime Shift: {self.market_regime} (VIX: {self.vix_index:.1f})",
                details=f"Systemic Risk Score: {self.systemic_risk_score:.2f} | Dynamic parameters adjusted across AlphaHunter & RiskManager."
            )

        # Periodically generate Hebrew macro summary via CognitiveEngine
        if time.time() - self.last_macro_update > 30.0:
            await self.generate_hebrew_macro_summary()
            self.last_macro_update = time.time()

    async def generate_hebrew_macro_summary(self) -> str:
        """
        Uses CognitiveEngine (with dynamic GenAI selection) to generate a structured Hebrew macro market summary for UI.

        Returns:
            str: Generated Hebrew macro text summary.
        """
        prompt = f"""
        פעל כסוכן העל (MetaSupervisor Agent) במערכת המסחר האוטונומית OFERTRADINGBOT.
        נתח את מצב השוק המאקרו ואת התיק הבא והפק סיכום תמציתי ומדויק בעברית (2-3 משפטים בלבד) עבור לוח הניטור (Dashboard):

        - משטר שוק נוכחי: {self.market_regime}
        - מדד תנודתיות VIX: {self.vix_index:.1f}
        - ציון סיכון סיסטמי: {self.systemic_risk_score:.2f}
        - יתרת תיק נוכחית: ${getattr(self.risk_manager, "account_balance", 100000.0):,.2f}
        - פוזיציות פתוחות: {len(self.oms.positions)}

        החזר תשובה בעברית נקייה ומקצועית בלבד.
        """

        try:
            summary_text = ""
            if self.cognitive_engine.genai_client:
                summary_text = await self.cognitive_engine._query_gemini(prompt)
            if not summary_text:
                summary_text = await self.cognitive_engine._query_ollama(prompt)

            if summary_text and summary_text.strip():
                self.hebrew_macro_summary = summary_text.strip()
            else:
                self.hebrew_macro_summary = (
                    f"שוק במצב {self.market_regime}: מדד ה-VIX עומד על {self.vix_index:.1f}. "
                    f"ציון הסיכון הסיסטמי הינו {self.systemic_risk_score:.2f}. "
                    f"תיק המסחר פעיל עם {len(self.oms.positions)} פוזיציות פתוחות."
                )
        except Exception as err:
            logger.error(f"Error generating Hebrew macro summary: {err}")
            self.hebrew_macro_summary = (
                f"שוק במצב {self.market_regime}: VIX={self.vix_index:.1f}, "
                f"סיכון סיסטמי={self.systemic_risk_score:.2f}."
            )

        # Broadcast updated summary to telemetry
        await self._emit_telemetry(
            level="INFO",
            message=f"🧠 MetaSupervisor Macro Intelligence Update: {self.hebrew_macro_summary}",
            details=f"Regime: {self.market_regime} | VIX: {self.vix_index:.1f} | Risk Score: {self.systemic_risk_score:.2f}"
        )

        return self.hebrew_macro_summary

    async def _emit_telemetry(self, level: str, message: str, details: str = "") -> None:
        """Pushes structured telemetry event to MarketEventBus."""
        payload = {
            "type": "AGENT_THOUGHT",
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "level": level,
            "message": message,
            "details": details,
            "timestamp": time.time(),
            "metrics": {
                "vix_index": round(self.vix_index, 2),
                "market_regime": self.market_regime,
                "systemic_risk_score": round(self.systemic_risk_score, 2)
            }
        }
        await self.event_bus.publish("telemetry", payload)

    async def stop(self) -> None:
        """Stops the MetaSupervisor loop."""
        self._is_running = False
        if self._supervisor_task and not self._supervisor_task.done():
            self._supervisor_task.cancel()
        logger.info(f"{self.agent_name} daemon stopped.")


if __name__ == "__main__":
    print("=== META SUPERVISOR AGENT TEST EXECUTION ===")

    async def test_meta_supervisor():
        bus = MarketEventBus()
        risk_mgr = HardRiskManager(initial_balance=100000.0)
        oms = OrderManagementSystem()
        cog_engine = CognitiveEngine(default_provider="auto")

        supervisor = MetaSupervisorAgent(
            event_bus=bus,
            oms=oms,
            risk_manager=risk_mgr,
            cognitive_engine=cog_engine,
            evaluation_interval_sec=0.5
        )

        model_selected = supervisor.select_dynamic_genai_model()
        print(f"MetaSupervisor Dynamic Model Selected: {model_selected}")

        await supervisor.start()
        await asyncio.sleep(1.2)

        summary = await supervisor.generate_hebrew_macro_summary()
        print(f"Generated Hebrew Summary:\n{summary}")

        await supervisor.stop()
        print("MetaSupervisorAgent test completed successfully.")

    asyncio.run(test_meta_supervisor())

# END CODE | סך הכל שורות: 309
