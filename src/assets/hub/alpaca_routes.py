from fastapi import APIRouter
from typing import Dict, Any, List
import os
from alpaca.trading.client import TradingClient
from hub.keys_manager import get_key

router = APIRouter()

@router.get("/sync-user")
def sync_alpaca_user():
    """
    Syncs the connected user's Alpaca account, watchlists, and active positions.
    """
    try:
        api_key = get_key("alpaca") or os.environ.get("ALPACA_API_KEY")
        api_secret = get_key("alpaca_secret") or os.environ.get("ALPACA_SECRET_KEY") or os.environ.get("ALPACA_API_SECRET")
        
        if not api_key or not api_secret:
            return {"success": False, "error": "Alpaca API keys are missing in the vault."}

        client = TradingClient(api_key, api_secret, paper=True)
        
        # 1. Get Account Info
        account = client.get_account()
        
        # 2. Get Positions
        positions = client.get_all_positions()
        pos_data = [{"symbol": p.symbol, "qty": float(p.qty), "market_value": float(p.market_value), "unrealized_pl": float(p.unrealized_pl)} for p in positions]
        
        # 3. Get Watchlists
        watchlists = client.get_watchlists()
        wl_data = []
        for wl in watchlists:
            # Get the full watchlist to see assets
            wl_full = client.get_watchlist_by_id(wl.id)
            assets = [item.symbol for item in wl_full.assets] if wl_full.assets else []
            wl_data.append({
                "id": str(wl.id),
                "name": wl.name,
                "assets": assets
            })
            
        return {
            "success": True,
            "account": {
                "id": str(account.id),
                "status": account.status,
                "buying_power": float(account.buying_power),
                "cash": float(account.cash),
                "equity": float(account.equity),
            },
            "positions": pos_data,
            "watchlists": wl_data
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
