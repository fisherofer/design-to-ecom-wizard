import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from abc import ABC, abstractmethod
import time
import os
import json
import urllib.request
import asyncio

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    httpx = None
    HAS_HTTPX = False

try:
    from hub.keys_manager import get_key
except ImportError:
    def get_key(key_name: str) -> Optional[str]:
        return os.environ.get(key_name.upper())

logger = logging.getLogger("NotificationDispatcher")

@dataclass
class NotificationPayload:
    symbol: str
    action: str  # BUY/SELL
    confidence: float
    price_change_pct: float
    relative_volume: float
    details: str = ""

class NotificationChannel(ABC):
    @abstractmethod
    async def send(self, message: NotificationPayload) -> bool:
        pass

class TelegramChannel(NotificationChannel):
    async def send(self, message: NotificationPayload) -> bool:
        bot_token = get_key("telegram_bot_token")
        chat_id = get_key("telegram_chat_id")
        if not bot_token or not chat_id:
            logger.warning("Telegram keys missing")
            return False
        
        text = f"*{message.action} {message.symbol}*\nConf: {message.confidence*100:.1f}%\nPrice Chg: {message.price_change_pct:.2f}%\nVol: {message.relative_volume:.1f}x\n{message.details}"
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        try:
            if HAS_HTTPX and httpx is not None:
                async with httpx.AsyncClient() as client:
                    res = await client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"})
                    return res.status_code == 200
            else:
                def _send():
                    data = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}).encode('utf-8')
                    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        return resp.status == 200
                return await asyncio.to_thread(_send)
        except Exception as e:
            logger.error(f"Telegram error: {e}")
            return False

class GoogleChatChannel(NotificationChannel):
    async def send(self, message: NotificationPayload) -> bool:
        webhook_url = get_key("google_chat_webhook")
        if not webhook_url:
            return False
            
        color = "#2b8a3e" if message.action.upper() == "BUY" else "#c92a2a"
        title = f"זיהוי מומנטום חיובי" if message.action.upper() == "BUY" else "איתות מכירה"
        body = f"Conf: {message.confidence*100:.1f}%<br>Price Chg: {message.price_change_pct:.2f}%<br>Vol: {message.relative_volume:.1f}x<br>{message.details}"
        
        payload = {
            "cardsV2": [
                {
                    "cardId": "trading_alert_card",
                    "card": {
                        "header": {
                            "title": f"🚨 איתות מסחר: {message.symbol} ({message.action})",
                            "subtitle": "OferTradingBot Real-Time Alert",
                            "imageUrl": "https://fonts.gstatic.com/s/i/short-term/release/googleyota/chat/v1/48px.svg",
                            "imageType": "CIRCLE"
                        },
                        "sections": [
                            {
                                "widgets": [
                                    {
                                        "textParagraph": {
                                            "text": f"<b>{title}</b><br>{body}"
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        }
        
        try:
            if HAS_HTTPX and httpx is not None:
                async with httpx.AsyncClient() as client:
                    res = await client.post(webhook_url, json=payload)
                    return res.status_code == 200
            else:
                def _send():
                    data = json.dumps(payload).encode('utf-8')
                    req = urllib.request.Request(webhook_url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        return resp.status == 200
                return await asyncio.to_thread(_send)
        except Exception as e:
            logger.error(f"Google Chat error: {e}")
            return False

class AndroidEmulatorChannel(NotificationChannel):
    async def send(self, message: NotificationPayload) -> bool:
        try:
            from emulator_alert_sender import AndroidEmulatorNotifier
            notifier = AndroidEmulatorNotifier()
            if not notifier.is_emulator_connected():
                return False
                
            title = f"🚨 איתות מסחר: {message.symbol}"
            body = f"{message.action} בביטחון של {message.confidence*100:.1f}%\n{message.details}"
            
            def _notify():
                notifier.send_system_notification(title=title, message=body)
                alert_payload = {
                    "symbol": message.symbol,
                    "action": message.action,
                    "confidence": message.confidence,
                    "target_group": "VIP_TRADERS"
                }
                notifier.trigger_intent_broadcast(
                    action="com.ofertradingbot.ALERT_ACTION",
                    extra_json=alert_payload
                )
                return True
                
            return await asyncio.to_thread(_notify)
        except Exception as e:
            logger.error(f"Android Emulator error: {e}")
            return False

class NotificationDispatcher:
    def __init__(self, channels: List[NotificationChannel] = None):
        self.channels = channels or [TelegramChannel(), GoogleChatChannel(), AndroidEmulatorChannel()]
        self.last_sent: Dict[str, float] = {}
        self.throttle_window_sec = 15 * 60  # 15 minutes
        
    async def broadcast(self, payload: NotificationPayload) -> Dict[str, bool]:
        now = time.time()
        last = self.last_sent.get(payload.symbol, 0)
        if now - last < self.throttle_window_sec:
            logger.info(f"Notification throttled for {payload.symbol}")
            return {}
            
        self.last_sent[payload.symbol] = now
        results = {}
        for ch in self.channels:
            try:
                name = ch.__class__.__name__
                results[name] = await ch.send(payload)
            except Exception as e:
                logger.error(f"Error in {name}: {e}")
                results[name] = False
        return results
# END CODE | סך הכל שורות: 78
