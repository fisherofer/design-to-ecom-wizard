# 24/07/2026
"""
OFERTRADINGBOT - Hive Architecture (MVP)
Handles community signal sharing and weighted consensus.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import sqlite3
import time
import logging
from typing import List, Dict

router = APIRouter()
logger = logging.getLogger(__name__)

DB_PATH = "hive_signals.db"

def _init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS shared_signals (
                signal_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                symbol TEXT,
                action TEXT,
                confidence REAL,
                model_version TEXT,
                created_at REAL,
                resolved_outcome INTEGER DEFAULT -1
            )
        ''')
        # user track record
        conn.execute('''
            CREATE TABLE IF NOT EXISTS user_track_record (
                user_id TEXT PRIMARY KEY,
                total_signals INTEGER DEFAULT 0,
                correct_signals INTEGER DEFAULT 0,
                weight REAL DEFAULT 1.0
            )
        ''')
        conn.commit()

_init_db()

class HiveSignalPayload(BaseModel):
    user_id: str
    symbol: str
    action: str
    confidence: float
    model_version: str

@router.post("/signals")
async def post_signal(payload: HiveSignalPayload):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            # Check rate limiting (max 10 signals per hour per user)
            hour_ago = time.time() - 3600
            cursor = conn.execute("SELECT COUNT(*) FROM shared_signals WHERE user_id = ? AND created_at > ?", (payload.user_id, hour_ago))
            count = cursor.fetchone()[0]
            if count >= 10:
                raise HTTPException(status_code=429, detail="Rate limit exceeded")
            
            conn.execute('''
                INSERT INTO shared_signals (user_id, symbol, action, confidence, model_version, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (payload.user_id, payload.symbol.upper(), payload.action, payload.confidence, payload.model_version, time.time()))
            
            # Ensure user exists in track record
            conn.execute("INSERT OR IGNORE INTO user_track_record (user_id) VALUES (?)", (payload.user_id,))
            conn.commit()
            
            logger.info(f"Hive received signal from {payload.user_id}: {payload.action} {payload.symbol}")
            return {"status": "ok", "message": "Signal added to Hive"}
    except Exception as e:
        logger.error(f"Error posting hive signal: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Database error")

@router.get("/consensus/{symbol}")
async def get_consensus(symbol: str):
    sym = symbol.upper()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            # Get signals from last 24 hours
            day_ago = time.time() - 86400
            cursor = conn.execute('''
                SELECT s.action, s.confidence, u.weight 
                FROM shared_signals s
                JOIN user_track_record u ON s.user_id = u.user_id
                WHERE s.symbol = ? AND s.created_at > ?
            ''', (sym, day_ago))
            
            signals = cursor.fetchall()
            
            if not signals:
                return {"symbol": sym, "consensus": "NONE", "score": 0.0, "sources": 0, "divergence": 0.0}
            
            # Weighted aggregation
            total_weight = 0.0
            weighted_score = 0.0 # BUY is positive, SELL is negative
            
            buy_weights = 0
            sell_weights = 0
            
            for action, conf, weight in signals:
                total_weight += weight
                val = conf * weight
                if action == "BUY":
                    weighted_score += val
                    buy_weights += weight
                elif action == "SELL":
                    weighted_score -= val
                    sell_weights += weight
            
            if total_weight == 0:
                final_score = 0.0
            else:
                final_score = weighted_score / total_weight
                
            consensus = "HOLD"
            if final_score > 0.3:
                consensus = "BUY"
            elif final_score < -0.3:
                consensus = "SELL"
                
            # Divergence (if both buys and sells have high weight)
            divergence = 0.0
            if total_weight > 0:
                divergence = min(buy_weights, sell_weights) / total_weight
                
            return {
                "symbol": sym,
                "consensus": consensus,
                "score": final_score,
                "sources": len(signals),
                "divergence": divergence
            }
    except Exception as e:
        logger.error(f"Error getting consensus for {sym}: {e}")
        raise HTTPException(status_code=500, detail="Database error")

# END CODE | סך הכל שורות: 125
