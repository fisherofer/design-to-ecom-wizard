import pandas as pd
from typing import Dict, Any, Optional
from trading_cost_model import TradingCostModel, TradingCostConfig
from hard_risk_manager import HardRiskManager
import logging

logger = logging.getLogger("ExitStrategyOptimizer")

class ExitStrategyOptimizer:
    def __init__(self, cost_model: TradingCostModel, risk_manager: HardRiskManager):
        self.cost_model = cost_model
        self.risk_manager = risk_manager
        self.config = TradingCostConfig()

    def compute_dynamic_trailing_stop(
        self,
        position: Any, # OpenPosition
        current_price: float,
        current_volume_ratio: float,
        atr: float,
    ) -> float:
        """
        1. ATR (התנודתיות הנוכחית)
        2. נקודת ה-breakeven מ-TradingCostModel
        3. current_volume_ratio
        """
        # calculate base distance
        dist = atr * 2.0
        
        # tighten if volume is high
        if current_volume_ratio > 2.0:
            dist = dist * 0.5
        elif current_volume_ratio < 0.5:
            dist = dist * 1.5
            
        side = getattr(position, "side", "BUY")
        entry_price = getattr(position, "entry_price", current_price)
        
        breakeven = self.cost_model.compute_breakeven_price(entry_price, side, self.config)
        
        if side == "BUY":
            raw_stop = current_price - dist
            # If we are in profit, don't let stop drop below breakeven
            if current_price > breakeven:
                raw_stop = max(raw_stop, breakeven)
            return raw_stop
        else:
            raw_stop = current_price + dist
            if current_price < breakeven:
                raw_stop = min(raw_stop, breakeven)
            return raw_stop

    def evaluate_entry_signal_realtime(
        self,
        symbol: str,
        intraday_volume_series: pd.Series,
        intraday_price_series: pd.Series,
    ) -> Dict[str, Any]:
        """
        לדוגמה, לא להיכנס לפוזיציה גם אם quant_engine נותן BUY, 
        אם הנפח הנוכחי נמוך מ-percentile-70 של הנפח הממוצע לאותה שעה.
        """
        if len(intraday_volume_series) < 10:
            return {"valid": True, "reason": "Not enough data"}
            
        current_vol = intraday_volume_series.iloc[-1]
        p70 = intraday_volume_series.quantile(0.70)
        
        if current_vol < p70:
            return {"valid": False, "reason": f"Volume {current_vol} below 70th percentile {p70}"}
            
        return {"valid": True, "reason": "Volume OK"}
# END CODE | סך הכל שורות: 60
