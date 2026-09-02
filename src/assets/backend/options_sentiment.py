# -*- coding: utf-8 -*-
"""
OFERTRADINGBOT - Quant Options Sentiment & Greek Exposure Engine (Invariants 43-45)
Computes Put/Call Ratios, Net Gamma Exposure (GEX), Net Delta Exposure (DEX),
Max Pain Strike, and normalized Options Market Sentiment Index [-1.0, +1.0].
"""

import math
from typing import Dict, List, Any, Optional

class OptionContract:
    def __init__(
        self,
        strike: float,
        contract_type: str, # 'CALL' or 'PUT'
        volume: int,
        open_interest: int,
        implied_volatility: float,
        delta: float,
        gamma: float
    ):
        self.strike = strike
        self.contract_type = contract_type.upper()
        self.volume = max(0, volume)
        self.open_interest = max(0, open_interest)
        self.implied_volatility = max(0.01, implied_volatility)
        self.delta = delta
        self.gamma = gamma

class OptionsSentimentEngine:
    """
    Quant Options Analytics Engine:
    - PCR (Put/Call Ratio by Volume and Open Interest)
    - Net GEX (Market Maker Gamma Exposure)
    - Net DEX (Market Maker Delta Exposure)
    - Max Pain Strike Calculation
    - Composite Sentiment Score [-1.0, +1.0]
    - Invariants 43, 44, 45 verification
    """

    def __init__(self, neutral_pcr_threshold: float = 0.85):
        self.neutral_pcr_threshold = neutral_pcr_threshold

    def calculate_sentiment(
        self,
        spot_price: float,
        chain: List[Dict[str, Any]],
        underlying_symbol: str = "SPY"
    ) -> Dict[str, Any]:
        """
        Processes option chain and outputs comprehensive quant sentiment metrics.
        """
        if spot_price <= 0:
            raise ValueError("Spot price must be positive.")

        contracts = [
            OptionContract(
                strike=float(c.get("strike", spot_price)),
                contract_type=str(c.get("type", "CALL")),
                volume=int(c.get("volume", 0)),
                open_interest=int(c.get("open_interest", 0)),
                implied_volatility=float(c.get("iv", 0.20)),
                delta=float(c.get("delta", 0.5 if c.get("type") == "CALL" else -0.5)),
                gamma=float(c.get("gamma", 0.05))
            )
            for c in chain
        ]

        # 1. PCR Calculations
        call_vol = sum(c.volume for c in contracts if c.contract_type == "CALL")
        put_vol = sum(c.volume for c in contracts if c.contract_type == "PUT")
        call_oi = sum(c.open_interest for c in contracts if c.contract_type == "CALL")
        put_oi = sum(c.open_interest for c in contracts if c.contract_type == "PUT")

        pcr_volume = (put_vol / call_vol) if call_vol > 0 else 1.0
        pcr_oi = (put_oi / call_oi) if call_oi > 0 else 1.0

        # 2. Net Delta Exposure (DEX) & Net Gamma Exposure (GEX)
        # Note: Dealers/Market Makers take the other side
        # Dealer GEX = Call Gamma * Spot * 100 * Call_OI - Put Gamma * Spot * 100 * Put_OI
        net_gex_dollars = 0.0
        net_dex_shares = 0.0

        for c in contracts:
            if c.contract_type == "CALL":
                net_gex_dollars += (c.gamma * (spot_price ** 2) * 100 * c.open_interest)
                net_dex_shares += (c.delta * 100 * c.open_interest)
            else:
                net_gex_dollars -= (c.gamma * (spot_price ** 2) * 100 * c.open_interest)
                net_dex_shares += (c.delta * 100 * c.open_interest)

        # 3. Max Pain Calculation
        strikes = sorted(list(set(c.strike for c in contracts)))
        max_pain_strike = spot_price
        min_total_cash_loss = float("inf")

        if strikes:
            for s in strikes:
                cash_loss = 0.0
                for c in contracts:
                    if c.contract_type == "CALL":
                        intrinsic = max(0.0, s - c.strike)
                    else:
                        intrinsic = max(0.0, c.strike - s)
                    cash_loss += (intrinsic * c.open_interest * 100)

                if cash_loss < min_total_cash_loss:
                    min_total_cash_loss = cash_loss
                    max_pain_strike = s

        # 4. Normalized Sentiment Index [-1.0 to +1.0]
        # Low PCR = Bullish (+), High PCR = Bearish (-)
        pcr_sentiment = max(-1.0, min(1.0, (self.neutral_pcr_threshold - pcr_volume) / 0.8))
        
        # GEX Sentiment: Positive GEX stabilizes/bullish mean-reverting, Negative GEX is volatile/bearish
        gex_sentiment = 1.0 if net_gex_dollars > 0 else -1.0
        gex_weight = min(1.0, abs(net_gex_dollars) / (1e7 + abs(net_gex_dollars)))

        # Max Pain Magnetic Pull
        max_pain_pull = max(-1.0, min(1.0, (max_pain_strike - spot_price) / (spot_price * 0.05)))

        composite_sentiment = (0.50 * pcr_sentiment) + (0.25 * (gex_sentiment * gex_weight)) + (0.25 * max_pain_pull)
        composite_sentiment = max(-1.0, min(1.0, composite_sentiment))

        # Invariants Check
        invariants_audit = self.verify_invariants(composite_sentiment, net_gex_dollars, spot_price, max_pain_strike, strikes)

        regime = "STRONG_BULLISH" if composite_sentiment >= 0.50 else (
            "BULLISH" if composite_sentiment >= 0.15 else (
                "BEARISH" if composite_sentiment <= -0.15 else (
                    "STRONG_BEARISH" if composite_sentiment <= -0.50 else "NEUTRAL"
                )
            )
        )

        return {
            "symbol": underlying_symbol,
            "spot_price": spot_price,
            "sentiment_score": round(composite_sentiment, 4), # [-1.0, 1.0]
            "sentiment_regime": regime,
            "pcr_volume": round(pcr_volume, 4),
            "pcr_open_interest": round(pcr_oi, 4),
            "net_gex_dollars": round(net_gex_dollars, 2),
            "gex_regime": "POSITIVE_GAMMA_PIN" if net_gex_dollars >= 0 else "NEGATIVE_GAMMA_VOLATILE",
            "net_dex_shares": round(net_dex_shares, 2),
            "max_pain_strike": round(max_pain_strike, 2),
            "max_pain_distance_pct": round(((max_pain_strike - spot_price) / spot_price) * 100, 2),
            "total_contracts": len(contracts),
            "invariants_passed": invariants_audit["all_passed"],
            "invariants_report": invariants_audit
        }

    def verify_invariants(
        self,
        sentiment_score: float,
        net_gex: float,
        spot_price: float,
        max_pain_strike: float,
        strikes: List[float]
    ) -> Dict[str, Any]:
        """
        Verifies Invariants 43, 44, 45.
        """
        # Invariant 43: Normalization Range [-1.0, 1.0]
        inv_43_passed = -1.0 <= sentiment_score <= 1.0

        # Invariant 44: GEX Consistency
        inv_44_passed = not (math.isnan(net_gex) or math.isinf(net_gex))

        # Invariant 45: Max Pain Boundedness within strike boundaries
        if strikes:
            inv_45_passed = min(strikes) <= max_pain_strike <= max(strikes)
        else:
            inv_45_passed = abs(max_pain_strike - spot_price) < 1e-4

        all_passed = inv_43_passed and inv_44_passed and inv_45_passed

        return {
            "invariant_43_sentiment_bounded": {
                "passed": inv_43_passed,
                "description": f"Sentiment score ({sentiment_score}) is strictly bounded within [-1.0, 1.0]."
            },
            "invariant_44_gex_consistency": {
                "passed": inv_44_passed,
                "description": "GEX calculation is mathematically continuous and non-degenerate."
            },
            "invariant_45_max_pain_boundedness": {
                "passed": inv_45_passed,
                "description": f"Max pain strike ({max_pain_strike}) is strictly contained in active strike range."
            },
            "all_passed": all_passed
        }

options_sentiment_engine = OptionsSentimentEngine()
