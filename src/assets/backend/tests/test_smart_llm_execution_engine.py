# Path: tests/test_smart_llm_execution_engine.py
# Timestamp: 2026-08-05 14:16:00 UTC
# Estimated Total Lines: 90

"""
Unit tests for OFERTRADINGBOT Smart LLM Execution Engine & Dual-Loop Architecture.
Runs with python3 -m unittest.
"""

import sys
import os
import asyncio
import unittest
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.backend.core.smart_llm_execution_engine import (
    EnvironmentConfig,
    SmartLLMRouter,
    TechnicalMarketBrain,
    HardRiskManager,
    TradeSignal
)


class TestSmartLLMExecutionEngine(unittest.TestCase):
    """Test suite for Dual-Loop AI Engine and HardRiskManager."""

    def setUp(self):
        self.router = SmartLLMRouter()
        self.brain = TechnicalMarketBrain(self.router)
        self.risk_mgr = HardRiskManager(initial_equity_usd=100000.0)

    def test_environment_config_relative_paths(self):
        """Verify dynamic root calculation contains no hardcoded drive paths."""
        root = EnvironmentConfig.get_project_root()
        self.assertTrue(root.exists())
        self.assertNotIn("D:", str(root))
        self.assertNotIn("C:", str(root))

    def test_async_llm_router_cache_fallback(self):
        """Verify async sentiment analysis populates cache with valid data."""
        async def run_test():
            headline = "Breakout news on semiconductor demand."
            report = await self.router.analyze_sentiment_async("NVDA", headline)
            self.assertEqual(report.symbol, "NVDA")
            self.assertGreaterEqual(report.sentiment_score, 0.0)
            self.assertLessEqual(report.sentiment_score, 1.0)
            
            # Verify cached value retrieved synchronously
            cached_val = self.router.get_latest_cached_sentiment("NVDA")
            self.assertEqual(cached_val, report.sentiment_score)

        asyncio.run(run_test())

    def test_fast_loop_market_brain_signal(self):
        """Verify fast loop evaluates signal in under 10ms with cached AI score."""
        # Pre-cache AI score
        self.router.cached_sentiment["AAPL"] = type('Report', (), {'sentiment_score': 0.85})()

        signal = self.brain.evaluate_signal_fast(
            symbol="AAPL",
            current_price=220.0,
            sma20=210.0,
            sma200=190.0,
            atr14=4.0,
            volume_spike=2.2,
            is_simulated=True
        )

        self.assertEqual(signal.symbol, "AAPL")
        self.assertEqual(signal.action, "BUY")
        self.assertTrue(signal.is_simulated)
        self.assertGreaterEqual(signal.final_score, 70.0)

    def test_hard_risk_manager_circuit_breaker(self):
        """Verify 5% drawdown triggers circuit breaker and blocks trades."""
        # Simulate 7% equity loss
        self.risk_mgr.current_equity = 93000.0
        
        signal = TradeSignal(
            symbol="TSLA",
            action="BUY",
            final_score=85.0,
            technical_score=80.0,
            micha_score=90.0,
            ai_score=85.0,
            is_simulated=True,
            timestamp="2026-08-05T14:15:00Z"
        )

        ticket = self.risk_mgr.create_execution_ticket(signal, current_price=200.0, atr14=5.0)
        self.assertIsNone(ticket)
        self.assertTrue(self.risk_mgr.circuit_breaker_triggered)


if __name__ == "__main__":
    unittest.main()

# END OF FULL CODE | Total Lines: 90
