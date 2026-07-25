# 24/07/2026, 16:00
"""
LLM Cognitive Engine Module for OFERTRADINGBOT.
Unified asynchronous gateway for all LLM reasoning tasks.
Supports dynamic routing between Google GenAI (for complex strategy analysis)
and local Ollama (for fast offline sentiment and orderbook structure analysis).
"""

import os
import sys
import json
import time
import logging
import asyncio
from typing import Dict, List, Optional, Any, Union, Tuple

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("CognitiveEngine")


class CognitiveEngine:
    """
    Unified asynchronous AI reasoning gateway for quantitative trade decisioning.
    Provides dynamic routing across Google GenAI and local Ollama inference models.
    """

    def __init__(self, default_provider: str = "auto", ollama_base_url: str = "http://127.0.0.1:11434"):
        """
        Initializes the Cognitive Engine with provider credentials and endpoints.

        Args:
            default_provider (str): Preferred LLM provider ('auto', 'gemini', 'ollama').
            ollama_base_url (str): Base URL for local Ollama server instance.
        """
        self.default_provider = default_provider
        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", ollama_base_url)
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        self.genai_client = None
        self.preferred_gemini_model = "gemini-2.5-flash"
        
        self._init_genai_client()

    def _init_genai_client(self) -> None:
        """Dynamically discovers and initializes Google GenAI client if credentials exist."""
        if not self.gemini_api_key:
            logger.info("GEMINI_API_KEY not set. Google GenAI route will fall back to Ollama or local rules.")
            return

        try:
            import google.generativeai as genai
            genai.configure(api_key=self.gemini_api_key)
            self.genai_client = genai
            
            # Dynamic Model Discovery as per Ofer Fisher Protocol
            available_models = [m.name for m in genai.list_models() if "generateContent" in m.supported_generation_methods]
            logger.info(f"Discovered {len(available_models)} Google GenAI models: {available_models[:3]}...")
            
            # Select best available model dynamically
            for candidate in ["models/gemini-2.5-flash", "models/gemini-1.5-flash", "models/gemini-1.5-pro", "models/gemini-pro"]:
                if candidate in available_models or candidate.replace("models/", "") in available_models:
                    self.preferred_gemini_model = candidate
                    break
            logger.info(f"Selected preferred Google GenAI model: '{self.preferred_gemini_model}'")
        except Exception as err:
            logger.warning(f"Failed to initialize Google GenAI SDK: {err}. Defaulting to HTTP/Ollama fallback.")
            self.genai_client = None

    async def _query_ollama(self, prompt: str, model_name: str = "qwen2.5-coder:7b") -> str:
        """
        Queries local Ollama inference server asynchronously.

        Args:
            prompt (str): Structured text prompt payload.
            model_name (str): Local Ollama model identifier.

        Returns:
            str: Generated text response.
        """
        import urllib.request
        import urllib.error

        url = f"{self.ollama_base_url}/api/generate"
        payload = json.dumps({
            "model": model_name,
            "prompt": prompt,
            "stream": False,
            "format": "json"
        }).encode("utf-8")

        def _sync_post():
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=8) as response:
                    res_body = response.read().decode("utf-8")
                    data = json.loads(res_body)
                    return data.get("response", "")
            except Exception as e:
                logger.warning(f"Ollama local connection failed: {e}")
                return ""

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _sync_post)

    async def _query_gemini(self, prompt: str) -> str:
        """
        Queries Google GenAI model asynchronously using dynamic model instance.

        Args:
            prompt (str): Structured text prompt payload.

        Returns:
            str: Generated response text from Gemini.
        """
        if not self.genai_client:
            return ""

        def _sync_genai_call():
            try:
                model = self.genai_client.GenerativeModel(self.preferred_gemini_model)
                response = model.generate_content(prompt)
                return response.text if response else ""
            except Exception as err:
                logger.error(f"Error during Google GenAI execution: {err}")
                return ""

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _sync_genai_call)

    async def analyze_market_structure(
        self,
        symbol: str,
        orderbook_data: Dict[str, Any],
        technical_indicators: Dict[str, Any],
        provider: str = "auto"
    ) -> Dict[str, Any]:
        """
        Performs high-level cognitive market structure analysis combining quantitative orderbook
        depth metrics with algorithmic technical indicators to compute trade probabilities.

        Args:
            symbol (str): Ticker identifier (e.g., 'BTC/USDT', 'NVDA').
            orderbook_data (Dict[str, Any]): Level 2 Orderbook bids, asks, and imbalance ratios.
            technical_indicators (Dict[str, Any]): RSI, MACD, VWAP, ATR, and Volume metrics.
            provider (str): LLM provider preference ('auto', 'gemini', 'ollama').

        Returns:
            Dict[str, Any]: Structured trade decision with probabilities, signals, and risk score.
        """
        prompt_payload = f"""
        You are an elite quantitative trading model evaluating live market structure for symbol: {symbol}.
        
        ORDERBOOK DEPTH SUMMARY:
        - Bids count: {len(orderbook_data.get('bids', []))} | Top Bid: {orderbook_data.get('bids', [[0,0]])[0] if orderbook_data.get('bids') else 'N/A'}
        - Asks count: {len(orderbook_data.get('asks', []))} | Top Ask: {orderbook_data.get('asks', [[0,0]])[0] if orderbook_data.get('asks') else 'N/A'}
        - Orderbook Imbalance Ratio: {orderbook_data.get('imbalance_ratio', 1.0)}
        
        TECHNICAL INDICATORS:
        - RSI (14): {technical_indicators.get('rsi', 50.0)}
        - MACD Histogram: {technical_indicators.get('macd_hist', 0.0)}
        - Volume Ratio vs Avg: {technical_indicators.get('volume_ratio', 1.0)}
        - ATR: {technical_indicators.get('atr', 1.5)}
        - VWAP Distance %: {technical_indicators.get('vwap_distance_pct', 0.0)}

        Return strictly valid JSON with the following key structure:
        {{
            "action": "BUY" | "SELL" | "HOLD",
            "confidence": float (0.0 to 1.0),
            "breakout_probability": float (0.0 to 100.0),
            "risk_score": float (1.0 to 10.0),
            "reasoning": "string brief quantitative explanation",
            "key_levels": {{"support": float, "resistance": float}}
        }}
        """

        selected_provider = self.default_provider if provider == "auto" else provider
        raw_response = ""

        if selected_provider in ["gemini", "auto"] and self.genai_client:
            raw_response = await self._query_gemini(prompt_payload)

        if not raw_response and selected_provider in ["ollama", "auto"]:
            raw_response = await self._query_ollama(prompt_payload)

        # Quantitative fallback algorithmic rule-engine if LLM response is unavailable
        if not raw_response:
            logger.info(f"Fallback to quantitative rule engine for {symbol} cognitive evaluation.")
            return self._rule_based_market_analysis(symbol, orderbook_data, technical_indicators)

        try:
            cleaned = raw_response.strip().replace("```json", "").replace("```", "")
            parsed = json.loads(cleaned)
            return parsed
        except Exception as parse_err:
            logger.warning(f"Failed to parse LLM JSON output ({parse_err}). Applying rule fallback.")
            return self._rule_based_market_analysis(symbol, orderbook_data, technical_indicators)

    def _rule_based_market_analysis(
        self,
        symbol: str,
        orderbook: Dict[str, Any],
        indicators: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Deterministic quantitative fallback model evaluating breakout probabilities
        when external or local LLM instances are offline or unreachable.
        """
        rsi = float(indicators.get("rsi", 50.0))
        macd_hist = float(indicators.get("macd_hist", 0.0))
        vol_ratio = float(indicators.get("volume_ratio", 1.0))
        imbalance = float(orderbook.get("imbalance_ratio", 1.0))

        score = 50.0
        if rsi < 35 and macd_hist > 0:
            score += 25.0
        elif rsi > 65 and macd_hist < 0:
            score -= 25.0

        if vol_ratio > 1.8:
            score += 15.0 if score >= 50 else -15.0

        if imbalance > 1.5:
            score += 10.0
        elif imbalance < 0.6:
            score -= 10.0

        score = max(0.0, min(100.0, score))

        if score >= 68.0:
            action = "BUY"
            confidence = round(score / 100.0, 2)
        elif score <= 32.0:
            action = "SELL"
            confidence = round((100.0 - score) / 100.0, 2)
        else:
            action = "HOLD"
            confidence = 0.50

        return {
            "action": action,
            "confidence": confidence,
            "breakout_probability": score,
            "risk_score": round(3.5 if action == "HOLD" else 2.1, 1),
            "reasoning": f"Rule-engine evaluation: RSI={rsi}, MACD_Hist={macd_hist}, VolRatio={vol_ratio}, Imbalance={imbalance}",
            "key_levels": {
                "support": round(indicators.get("price", 100.0) * 0.98, 2),
                "resistance": round(indicators.get("price", 100.0) * 1.02, 2)
            }
        }


if __name__ == "__main__":
    print("=== COGNITIVE ENGINE TEST EXECUTION ===")

    async def run_cognitive_demo():
        engine = CognitiveEngine()
        sample_orderbook = {
            "bids": [[64500.0, 2.5], [64490.0, 5.1]],
            "asks": [[64510.0, 1.2], [64520.0, 3.4]],
            "imbalance_ratio": 1.65
        }
        sample_indicators = {
            "rsi": 32.5,
            "macd_hist": 12.4,
            "volume_ratio": 2.1,
            "atr": 450.0,
            "vwap_distance_pct": 0.85,
            "price": 64505.0
        }

        print("Executing Cognitive Market Analysis for 'BTC/USDT'...")
        result = await engine.analyze_market_structure(
            symbol="BTC/USDT",
            orderbook_data=sample_orderbook,
            technical_indicators=sample_indicators,
            provider="auto"
        )
        print("Cognitive Analysis Result:")
        print(json.dumps(result, indent=2, ensure_ascii=False))

    asyncio.run(run_cognitive_demo())

# END CODE | סך הכל שורות: 287
