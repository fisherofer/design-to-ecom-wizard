import math
import logging
from typing import Dict, Any

logger = logging.getLogger("PortfolioRiskManager")

class PortfolioRiskManager:
    def __init__(self, initial_balance: float = 100000.0, max_trade_risk_pct: float = 0.02):
        self.balance = initial_balance
        self.max_trade_risk_pct = max_trade_risk_pct
        
    def compute_kelly_position_size(
        self,
        symbol: str,
        current_price: float,
        win_probability: float,
        expected_win_loss_ratio: float = 1.5,
        fraction: float = 0.5
    ) -> float:
        """
        Fractional Kelly Criterion for position sizing.
        kelly_pct = win_prob - ((1 - win_prob) / win_loss_ratio)
        """
        if win_probability <= 0.5 or current_price <= 0:
            return 0.0
            
        kelly_pct = win_probability - ((1.0 - win_probability) / expected_win_loss_ratio)
        if kelly_pct <= 0:
            return 0.0
            
        # Apply fractional Kelly
        fractional_kelly = kelly_pct * fraction
        
        # Apply hard cap (e.g. max 2% of portfolio per trade)
        safe_kelly_pct = min(fractional_kelly, self.max_trade_risk_pct)
        
        capital_to_deploy = self.balance * safe_kelly_pct
        qty = capital_to_deploy / current_price
        
        # round to 4 decimals (crypto friendly) or 0 (stock friendly). Let's use 4.
        return round(qty, 4)
# END CODE | סך הכל שורות: 33
