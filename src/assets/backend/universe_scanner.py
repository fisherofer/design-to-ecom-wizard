# 24/07/2026
"""
OFERTRADINGBOT - Dynamic Universe Scanner
Periodically scans for top active/gainers in the market to feed the live agents.
Resolves the issue where agents were restricted to a hardcoded list of symbols.
"""
import asyncio
import time
import logging
import urllib.request
import json
from typing import List, Set

logger = logging.getLogger(__name__)

class DynamicUniverseScanner:
    def __init__(self, core_symbols: List[str] = None, max_universe_size: int = 50, scan_interval: int = 120):
        self.core_symbols = set([s.upper() for s in (core_symbols or ["NVDA", "PLTR", "BTC-USD", "ETH-USD", "SOL-USD"])])
        self.max_universe_size = max_universe_size
        self.scan_interval = scan_interval
        self.dynamic_universe: Set[str] = set()
        self.is_running = False
        self._task = None
        self._on_universe_change_cb = None

    def set_on_change_callback(self, cb):
        self._on_universe_change_cb = cb

    async def start(self):
        self.is_running = True
        self._task = asyncio.create_task(self._scan_loop())
        logger.info(f"Dynamic Universe Scanner started. Interval: {self.scan_interval}s")

    def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
        logger.info("Dynamic Universe Scanner stopped.")

    def get_active_universe(self) -> List[str]:
        return list(self.core_symbols | self.dynamic_universe)

    async def _scan_loop(self):
        while self.is_running:
            try:
                new_symbols = await self._fetch_top_movers()
                
                # Filter penny stocks and low volume (rudimentary filter via length for now)
                valid_symbols = set()
                if new_symbols:
                    valid_symbols = set([s for s in new_symbols if len(s) <= 5 and "^" not in s])
                
                # Update dynamic universe
                current_universe = self.dynamic_universe.copy()
                limit = self.max_universe_size - len(self.core_symbols)
                self.dynamic_universe = set(list(valid_symbols)[:limit])
                
                if self.dynamic_universe != current_universe:
                    logger.info(f"Universe updated. Total symbols: {len(self.get_active_universe())}")
                    if self._on_universe_change_cb:
                        if asyncio.iscoroutinefunction(self._on_universe_change_cb):
                            await self._on_universe_change_cb(self.get_active_universe())
                        else:
                            self._on_universe_change_cb(self.get_active_universe())
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in universe scanner loop: {e}")
            
            await asyncio.sleep(self.scan_interval)

    async def _fetch_top_movers(self) -> List[str]:
        """Fetches day gainers and most active from Yahoo Finance API."""
        symbols = []
        endpoints = [
            "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&lang=en-US&region=US&scrIds=day_gainers&count=25",
            "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&lang=en-US&region=US&scrIds=most_actives&count=25"
        ]
        
        for url in endpoints:
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                # We use asyncio.to_thread to avoid blocking the event loop
                response = await asyncio.to_thread(urllib.request.urlopen, req, timeout=10)
                data = json.loads(response.read().decode())
                quotes = data.get('finance', {}).get('result', [{}])[0].get('quotes', [])
                symbols.extend([q.get('symbol') for q in quotes if q.get('symbol')])
            except Exception as e:
                logger.warning(f"Failed to fetch from {url}: {e}")
                
        # Deduplicate and return
        return list(set(symbols))

# END CODE | סך הכל שורות: 78
