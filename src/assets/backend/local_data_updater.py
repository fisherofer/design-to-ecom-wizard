# 01/08/2026
import os
import pandas as pd
import datetime
import logging
from pathlib import Path
import yfinance as yf

logger = logging.getLogger("LocalDataUpdater")
logging.basicConfig(level=logging.INFO)

DATA_DIR = Path("user_data/market_data")

def update_local_finance_data(symbols: list, period="1y", interval="1d"):
    """
    Updates local CSV files with free market data from Yahoo/Google finance alternatives.
    Saves to user_data/market_data/<symbol>.csv
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Updating local data for {len(symbols)} symbols...")
    
    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period, interval=interval)
            
            if not df.empty:
                file_path = DATA_DIR / f"{symbol}_{interval}.csv"
                df.to_csv(file_path)
                logger.info(f"Saved {len(df)} rows for {symbol} to {file_path}")
            else:
                logger.warning(f"No data found for {symbol}")
        except Exception as e:
            logger.error(f"Error fetching data for {symbol}: {e}")

if __name__ == "__main__":
    test_symbols = ["AAPL", "MSFT", "NVDA", "TSLA", "SPY", "QQQ"]
    update_local_finance_data(test_symbols)
