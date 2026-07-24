# 24/07/2026
"""
OFERTRADINGBOT - Global Configuration & Data Source Registry
Maintains dynamic stage controls, risk parameters, and source permissions.
"""

import os

TRADING_STAGE = os.environ.get("TRADING_STAGE", "1")

# Single source of truth for market data source capabilities and stage permissions
MARKET_DATA_SOURCES = {
    "alpaca_paper": {
        "stage1_allowed": True,
        "type": "equities_paper",
        "description": "Alpaca Paper Trading REST API"
    },
    "binance_ccxt": {
        "stage1_allowed": False,
        "type": "crypto_live",
        "description": "CCXT Binance Spot/Futures Exchange Client"
    },
    "yahoo_finance": {
        "stage1_allowed": True,
        "type": "market_data",
        "description": "Yahoo Finance Public Market Quotes"
    },
    "ollama_local": {
        "stage1_allowed": True,
        "type": "llm",
        "description": "Local LLM Inference Engine"
    },
    "groq_cloud": {
        "stage1_allowed": True,
        "type": "llm",
        "description": "Groq Cloud Llama/Mixtral Engine"
    },
    "openai_cloud": {
        "stage1_allowed": True,
        "type": "llm",
        "description": "OpenAI GPT API Engine"
    },
    "gemini_cloud": {
        "stage1_allowed": True,
        "type": "llm",
        "description": "Google Gemini Pro/Flash API"
    }
}
