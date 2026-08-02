from fastapi import APIRouter, HTTPException
import logging
import yfinance as yf
from .keys_manager import get_key
import requests

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/{symbol}")
async def get_ownership(symbol: str):
    """
    Fetches ownership data and insider trades.
    Smart routing: Tries yfinance first (free), then falls back to other providers if needed.
    """
    symbol = symbol.upper()
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        
        insider_percent = info.get("heldPercentInsiders", 0)
        inst_percent = info.get("heldPercentInstitutions", 0)
        
        
        if not insider_percent and not inst_percent:
            finnhub_key = get_key("finnhub")
            if finnhub_key and finnhub_key != 'demo':
                try:
                    res = requests.get(f"https://finnhub.io/api/v1/stock/profile2?symbol={symbol}&token={finnhub_key}")
                    if res.status_code == 200:
                        data = res.json()
                        # Finnhub doesn't provide ownership percentages for free, but let's assume we can query another endpoint
                    
                    # Alternatively, Alpha Vantage fallback
                    av_key = get_key("alpha_vantage")
                    if av_key and av_key != 'demo':
                        res = requests.get(f"https://www.alphavantage.co/query?function=OVERVIEW&symbol={symbol}&apikey={av_key}")
                        if res.status_code == 200:
                            data = res.json()
                            inst_percent = float(data.get("InstitutionalOwnership", 0))
                except Exception as e:
                    logger.error(f"Fallback error: {e}")

                
        insider_percent = (insider_percent or 0) * 100
        inst_percent = (inst_percent or 0) * 100
        public_percent = max(100 - insider_percent - inst_percent, 0)
        
        insider_trades = []
        try:
            roster = ticker.insider_transactions
            if roster is not None and not roster.empty:
                for idx, row in roster.head(10).iterrows():
                    insider_trades.append({
                        "insiderName": str(row.get("Insider", "Unknown")),
                        "position": str(row.get("Position", "")),
                        "transaction": str(row.get("Transaction", "Buy/Sell")),
                        "shares": int(row.get("Shares", 0)) if not type(row.get("Shares")) == float or row.get("Shares") == row.get("Shares") else 0,
                        "date": str(row.get("Start Date", idx)).split(" ")[0]
                    })
        except Exception as e:
            logger.error(f"Error fetching insider trades for {symbol} via yfinance: {e}")
            
        return {
            "symbol": symbol,
            "ownership": {
                "institutional": round(inst_percent, 2),
                "insider": round(insider_percent, 2),
                "public": round(public_percent, 2)
            },
            "topInstitutionalHolders": [],
            "recentInsiderTrades": insider_trades
        }
    except Exception as e:
        logger.error(f"Ownership endpoint error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
