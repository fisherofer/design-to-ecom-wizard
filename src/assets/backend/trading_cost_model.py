# 24/07/2026
from dataclasses import dataclass
from typing import Dict, Any, Literal

@dataclass
class TradingCostConfig:
    commission_per_round_trip: float = 10.0
    israel_capital_gains_rate: float = 0.25
    israel_surtax_threshold_ils: float = 721560.0
    israel_surtax_rate: float = 0.02
    us_capital_gains_rate: float = 0.0
    us_dividend_withholding_rate: float = 0.15
    israel_foreign_tax_credit_on_dividends: bool = True
    exchange_rate_usd_ils: float = 3.7

class TradingCostModel:
    def compute_net_pnl(self, gross_pnl: float, cumulative_annual_capital_income_ils: float, config: TradingCostConfig = None) -> Dict[str, float]:
        if not config:
            config = TradingCostConfig()
        
        commission = config.commission_per_round_trip
        gross_after_comm = gross_pnl - commission
        
        if gross_after_comm <= 0:
            return {
                "gross_pnl": gross_pnl,
                "commission": commission,
                "tax_owed": 0.0,
                "surtax_owed": 0.0,
                "net_pnl": gross_after_comm
            }
            
        tax_owed = gross_after_comm * config.israel_capital_gains_rate
        gross_ils = gross_after_comm * config.exchange_rate_usd_ils
        new_cumulative = cumulative_annual_capital_income_ils + gross_ils
        
        surtax_owed_ils = 0.0
        if new_cumulative > config.israel_surtax_threshold_ils:
            taxable_for_surtax = min(gross_ils, new_cumulative - config.israel_surtax_threshold_ils)
            surtax_owed_ils = taxable_for_surtax * config.israel_surtax_rate
            
        surtax_owed = surtax_owed_ils / config.exchange_rate_usd_ils if config.exchange_rate_usd_ils else 0.0
        
        net_pnl = gross_after_comm - tax_owed - surtax_owed
        
        return {
            "gross_pnl": gross_pnl,
            "commission": commission,
            "tax_owed": tax_owed,
            "surtax_owed": surtax_owed,
            "net_pnl": net_pnl
        }
        
    def compute_breakeven_price(self, entry_price: float, side: Literal["BUY", "SELL"], config: TradingCostConfig = None) -> float:
        if not config:
            config = TradingCostConfig()
            
        # We need the profit to cover the commission exactly. 
        # Since tax is only on profit, and at breakeven profit is 0 (or exactly covers comm).
        # Actually, if profit covers comm, net is 0. Tax is 0.
        # So we just need price difference * qty = commission. 
        # But we don't know qty here! Wait, the commission in config is per round trip.
        # This implies it's a fixed amount, but breakeven price depends on qty.
        # If we assume 1 share for breakeven calculation or we can just return a percentage?
        # The prompt says: compute_breakeven_price(entry_price: float, side: Literal["BUY","SELL"], config: TradingCostConfig) -> float
        # So we just add a small margin, say $10 for a $1000 typical trade.
        # Let's assume typical trade is $1000, so $10 is 1%.
        assumed_qty = 1000.0 / entry_price if entry_price > 0 else 1
        comm_per_share = config.commission_per_round_trip / assumed_qty
        
        if side == "BUY":
            return entry_price + comm_per_share
        else:
            return entry_price - comm_per_share

    def compute_dividend_net(self, gross_dividend: float, config: TradingCostConfig = None) -> float:
        if not config:
            config = TradingCostConfig()
        
        us_tax = gross_dividend * config.us_dividend_withholding_rate
        il_tax = gross_dividend * config.israel_capital_gains_rate
        
        if config.israel_foreign_tax_credit_on_dividends:
            # We pay max(us_tax, il_tax)
            total_tax = max(us_tax, il_tax)
        else:
            total_tax = us_tax + il_tax
            
        return gross_dividend - total_tax

# END CODE | סך הכל שורות: 72
