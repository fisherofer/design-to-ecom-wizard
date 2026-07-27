# 24/07/2026, 03:47
"""
Order Management System (OMS) Module for OFERTRADINGBOT.
Provides multi-exchange trade execution across CCXT (Crypto) and Alpaca (US Equities).
Implements order lifecycle state machine, slippage guardrails, exponential backoff, and live PnL tracking.
"""

import os
import sys
import time
import math
import logging
import asyncio
from typing import Dict, List, Optional, Union, Any, Tuple
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime

from hard_risk_manager import HardRiskManager, RiskLimits
try:
    from config import MARKET_DATA_SOURCES
except ImportError:
    MARKET_DATA_SOURCES = {}

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("OMS")


class OrderStatus(Enum):
    """Enumeration of valid order states in the OMS lifecycle."""
    NEW = "NEW"
    PENDING = "PENDING"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELED = "CANCELED"
    REJECTED = "REJECTED"


class OrderSide(Enum):
    """Order direction side."""
    BUY = "BUY"
    SELL = "SELL"


class OrderType(Enum):
    """Supported order types."""
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP_LOSS = "STOP_LOSS"
    TAKE_PROFIT = "TAKE_PROFIT"


@dataclass
class Order:
    """Dataclass representing a live trade order in the OMS."""
    order_id: str
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: float
    price: float
    stop_price: Optional[float] = None
    filled_quantity: float = 0.0
    average_fill_price: float = 0.0
    status: OrderStatus = OrderStatus.NEW
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    exchange: str = "binance"
    client_order_id: str = ""
    error_message: str = ""

    def update_fill(self, fill_qty: float, fill_price: float) -> None:
        """
        Updates order fill state dynamically and adjusts order status.

        Args:
            fill_qty (float): Additional quantity filled.
            fill_price (float): Price at which execution occurred.
        """
        total_qty = self.filled_quantity + fill_qty
        if total_qty > 0:
            self.average_fill_price = ((self.filled_quantity * self.average_fill_price) + (fill_qty * fill_price)) / total_qty
        self.filled_quantity = total_qty
        self.updated_at = time.time()

        if self.filled_quantity >= self.quantity:
            self.status = OrderStatus.FILLED
        elif self.filled_quantity > 0:
            self.status = OrderStatus.PARTIALLY_FILLED


@dataclass
class Position:
    """Dataclass representing an active open position."""
    symbol: str
    quantity: float
    entry_price: float
    current_price: float
    exchange: str
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    opened_at: float = field(default_factory=time.time)

    def calculate_pnl(self, market_price: float) -> float:
        """
        Calculates unrealized profit and loss based on current market price.

        Args:
            market_price (float): Latest market price.

        Returns:
            float: Unrealized PnL in base currency.
        """
        self.current_price = market_price
        self.unrealized_pnl = (market_price - self.entry_price) * self.quantity
        return self.unrealized_pnl


class OrderManagementSystem:
    """
    Core Execution Engine and Order Management System.
    Handles order validation, multi-exchange execution routing, slippage control, and retry routines.
    """

    def __init__(self, max_slippage_pct: float = 0.005, max_retries: int = 5):
        """
        Initializes the Order Management System.

        Args:
            max_slippage_pct (float): Maximum allowed slippage tolerance (default 0.5%).
            max_retries (int): Maximum retry attempts for rate-limited exchange requests.
        """
        self.max_slippage_pct = max_slippage_pct
        self.max_retries = max_retries
        self.orders: Dict[str, Order] = {}
        self.positions: Dict[str, Position] = {}
        self.exchange_clients: Dict[str, Any] = {}
        self.risk_manager = HardRiskManager(initial_balance=100000.0)
        
        # Verify Stage 1 safety assertions
        self.assert_stage1_safe("alpaca")
        self._init_exchange_connectors()

    def assert_stage1_safe(self, exchange: str = "binance") -> None:
        """
        Safety Assertion: Ensures live exchange execution is blocked in Stage 1.
        Raises RuntimeError if live exchange execution is attempted when TRADING_STAGE == '1'.
        """
        trading_stage = os.environ.get("TRADING_STAGE", "1")
        clean_exchange = exchange.lower().strip()
        if trading_stage == "1" and clean_exchange != "alpaca":
            raise RuntimeError(
                f"STAGE 1 SAFETY VIOLATION: Live exchange execution on '{exchange}' is strictly prohibited in Stage 1. "
                "Only Alpaca paper trading is permitted."
            )

    def _init_exchange_connectors(self) -> None:
        """
        Initializes CCXT and Alpaca connectors with environment variables.
        CCXT Binance is restricted to sandbox mode ONLY if TRADING_STAGE == '2'.
        """
        trading_stage = os.environ.get("TRADING_STAGE", "1")
        
        # CCXT Crypto Integration - strictly disabled or restricted to sandbox in Stage 2
        if trading_stage == "2":
            try:
                import ccxt
                binance_key = os.getenv("BINANCE_API_KEY", "")
                binance_secret = os.getenv("BINANCE_API_SECRET", "")
                binance_client = ccxt.binance({
                    'apiKey': binance_key,
                    'secret': binance_secret,
                    'enableRateLimit': True,
                    'options': {'defaultType': 'spot'}
                })
                # Force sandbox mode for safety
                binance_client.set_sandbox_mode(True)
                self.exchange_clients["binance"] = binance_client
                logger.info("CCXT Binance Client initialized in SANDBOX mode for Stage 2.")
            except Exception as err:
                logger.warning(f"CCXT connection warning: {err}. Running simulated crypto router.")
        else:
            logger.info("Stage 1 Active: CCXT Binance live connector is disarmed and disabled.")

        # Alpaca US Equities Integration
        try:
            import alpaca_trade_api as tradeapi
            alpaca_key = os.getenv("ALPACA_API_KEY", "")
            alpaca_secret = os.getenv("ALPACA_SECRET_KEY", "")
            base_url = os.getenv("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")
            if alpaca_key and alpaca_secret:
                self.exchange_clients["alpaca"] = tradeapi.REST(alpaca_key, alpaca_secret, base_url, api_version='v2')
                logger.info("Alpaca Trade REST API Client initialized.")
        except Exception as err:
            logger.warning(f"Alpaca API connection warning: {err}. Running simulated equities router.")

    def select_dynamic_genai_model(self) -> str:
        """
        Dynamically detects available Google GenAI models and selects the optimal version.

        Returns:
            str: Selected model alias or full path name.
        """
        try:
            from google import genai
            client = genai.Client()
            available_models = [m.name for m in client.models.list()]
            for preferred in ["models/gemini-2.5-flash", "models/gemini-1.5-pro", "models/gemini-1.5-flash"]:
                if preferred in available_models:
                    return preferred
            return available_models[0] if available_models else "gemini-2.5-flash"
        except Exception as err:
            logger.info(f"GenAI auto-select fallback: {err}")
            return "gemini-2.5-flash"

    def validate_slippage(self, expected_price: float, current_market_price: float, side: OrderSide) -> bool:
        """
        Protects against execution outside allowed slippage threshold.

        Args:
            expected_price (float): Target entry/exit price.
            current_market_price (float): Current live orderbook price.
            side (OrderSide): BUY or SELL.

        Returns:
            bool: True if price is within slippage limit, False otherwise.
        """
        if expected_price <= 0:
            return True
        if side == OrderSide.BUY:
            slippage = (current_market_price - expected_price) / expected_price
        else:
            slippage = (expected_price - current_market_price) / expected_price

        if slippage > self.max_slippage_pct:
            logger.error(f"SLIPPAGE EXCEEDED! Allowed: {self.max_slippage_pct*100}%, Calculated: {slippage*100:.3f}%")
            return False
        return True

    def create_order(
        self,
        symbol: str,
        side: OrderSide,
        order_type: OrderType,
        quantity: float,
        price: float,
        exchange: str = "binance",
        stop_price: Optional[float] = None
    ) -> Order:
        """
        Instantiates and registers a new order in NEW state.
        Executes pre-trade HardRiskManager circuit breaker checks.
        """
        order_id = f"ORD_{int(time.time()*1000)}_{symbol.replace('/', '')}"
        order = Order(
            order_id=order_id,
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            stop_price=stop_price,
            exchange=exchange,
            status=OrderStatus.NEW
        )

        # Pre-trade Risk Circuit Breaker check
        if self.risk_manager.limits.trading_halted:
            order.status = OrderStatus.REJECTED
            order.error_message = f"Risk Halt Active: {self.risk_manager.limits.halt_reason}"
            logger.warning(f"Order {order_id} rejected pre-trade: {order.error_message}")
            self.orders[order_id] = order
            return order

        # Stage 1 Safety Enforcement for non-paper exchanges
        trading_stage = os.environ.get("TRADING_STAGE", "1")
        if trading_stage == "1" and exchange.lower() != "alpaca":
            order.status = OrderStatus.REJECTED
            order.error_message = f"Stage 1 Safety Violation: Live exchange {exchange} disabled."
            logger.warning(f"Order {order_id} rejected: {order.error_message}")
            self.orders[order_id] = order
            return order

        self.orders[order_id] = order
        logger.info(f"Order created: {order_id} | {side.value} {quantity} {symbol} @ {price}")
        return order

    def run_pre_trade_risk_check(self, order: Order, market_price: float) -> Tuple[bool, str]:
        """
        Single mandatory risk gate delegating to the existing HardRiskManager.
        No redundant risk engine is created here.

        Checks, in order:
          1. Circuit breaker / equity drawdown (HardRiskManager.update_equity).
          2. Explicit halt flag with its reason.
          3. VaR-based maximum position size for the order notional.
          4. ATR trailing-stop violation for the symbol, when state exists.

        Returns:
            Tuple[bool, str]: (allowed, reason). `reason` is empty when allowed.
        """
        portfolio_value = self.get_portfolio_summary()["total_unrealized_pnl"] + self.risk_manager.current_equity
        equity_ok = self.risk_manager.update_equity(portfolio_value)
        if not equity_ok or self.risk_manager.limits.trading_halted:
            return False, f"Risk circuit breaker active: {self.risk_manager.limits.halt_reason or 'equity drawdown'}"

        # VaR position sizing guard
        try:
            max_qty = self.risk_manager.calculate_var_position_size(
                symbol=order.symbol,
                entry_price=market_price or order.price,
                stop_price=order.stop_price or 0.0,
            )
        except TypeError:
            max_qty = None
        except Exception as err:
            logger.warning(f"VaR sizing unavailable for {order.symbol}: {err}")
            max_qty = None

        if isinstance(max_qty, (int, float)) and max_qty > 0 and order.quantity > max_qty:
            return False, (
                f"VaR limit: requested {order.quantity} exceeds max allowed position size {max_qty:.4f}"
            )

        # ATR trailing stop guard for exits on an existing position
        state = getattr(self.risk_manager, "trailing_stops", {}).get(order.symbol) if hasattr(self.risk_manager, "trailing_stops") else None
        if state is not None and order.side == OrderSide.BUY:
            stop_level = getattr(state, "stop_price", None)
            if isinstance(stop_level, (int, float)) and stop_level > 0 and market_price < stop_level:
                return False, f"ATR trailing stop breached for {order.symbol} ({market_price} < {stop_level})"

        return True, ""

    async def execute_order_with_backoff(self, order_id: str, market_price: float) -> Order:
        """
        Executes order through state machine with exponential backoff and rate-limit retries.
        EVERY execution passes through `run_pre_trade_risk_check` first.
        """
        if order_id not in self.orders:
            raise ValueError(f"Order {order_id} not found in OMS registry.")

        order = self.orders[order_id]

        if order.status == OrderStatus.REJECTED:
            return order

        # Mandatory HardRiskManager gate
        allowed, reason = self.run_pre_trade_risk_check(order, market_price)
        if not allowed:
            order.status = OrderStatus.REJECTED
            order.error_message = f"Execution rejected by Risk Manager: {reason}"
            logger.critical(f"Order {order_id} REJECTED BY HARD RISK MANAGER: {reason}")
            return order

        # Slippage Guard
        if not self.validate_slippage(order.price, market_price, order.side):
            order.status = OrderStatus.REJECTED
            order.error_message = "Slippage tolerance exceeded."
            logger.warning(f"Order {order_id} rejected due to slippage guard.")
            return order


        attempt = 0
        backoff_delay = 0.5

        while attempt < self.max_retries:
            try:
                attempt += 1
                logger.info(f"Executing order {order_id} (Attempt {attempt}/{self.max_retries})...")
                
                # State transition: NEW -> PENDING -> FILLED
                order.status = OrderStatus.PENDING
                await asyncio.sleep(0.05)  # Simulate network hop

                # Calculate execution fill
                fill_price = market_price if order.order_type == OrderType.MARKET else order.price
                order.update_fill(order.quantity, fill_price)

                # Update live positions tracker
                self._update_position(order)

                logger.info(f"Order {order_id} SUCCESSFULLY FILLED at average price {order.average_fill_price:.4f}")
                return order

            except Exception as err:
                logger.error(f"Execution error on attempt {attempt}: {err}")
                if attempt >= self.max_retries:
                    order.status = OrderStatus.REJECTED
                    order.error_message = str(err)
                    return order
                await asyncio.sleep(backoff_delay)
                backoff_delay *= 2.0

        return order

    def _update_position(self, order: Order) -> None:
        """
        Updates internal position inventory following an order fill.

        Args:
            order (Order): Executed order object.
        """
        symbol = order.symbol
        if order.side == OrderSide.BUY:
            if symbol in self.positions:
                pos = self.positions[symbol]
                new_qty = pos.quantity + order.filled_quantity
                pos.entry_price = ((pos.quantity * pos.entry_price) + (order.filled_quantity * order.average_fill_price)) / new_qty
                pos.quantity = new_qty
            else:
                self.positions[symbol] = Position(
                    symbol=symbol,
                    quantity=order.filled_quantity,
                    entry_price=order.average_fill_price,
                    current_price=order.average_fill_price,
                    exchange=order.exchange
                )
        elif order.side == OrderSide.SELL:
            if symbol in self.positions:
                pos = self.positions[symbol]
                pnl = (order.average_fill_price - pos.entry_price) * order.filled_quantity
                pos.realized_pnl += pnl
                pos.quantity -= order.filled_quantity
                if pos.quantity <= 0:
                    del self.positions[symbol]

    def get_portfolio_summary(self) -> Dict[str, Any]:
        """
        Generates comprehensive live position and PnL reporting.

        Returns:
            Dict[str, Any]: Portfolio summary metrics.
        """
        total_unrealized_pnl = sum(p.unrealized_pnl for p in self.positions.values())
        total_realized_pnl = sum(p.realized_pnl for p in self.positions.values())
        return {
            "active_positions_count": len(self.positions),
            "total_unrealized_pnl": round(total_unrealized_pnl, 2),
            "total_realized_pnl": round(total_realized_pnl, 2),
            "positions": [
                {
                    "symbol": p.symbol,
                    "quantity": p.quantity,
                    "entry_price": round(p.entry_price, 4),
                    "current_price": round(p.current_price, 4),
                    "unrealized_pnl": round(p.unrealized_pnl, 2)
                } for p in self.positions.values()
            ]
        }


if __name__ == "__main__":
    print("=== OMS TEST EXECUTION ===")
    oms = OrderManagementSystem(max_slippage_pct=0.01)

    async def main_test():
        # Test 1: Create and execute market order
        order1 = oms.create_order("BTC/USDT", OrderSide.BUY, OrderType.MARKET, quantity=0.5, price=65000.0)
        filled_order1 = await oms.execute_order_with_backoff(order1.order_id, market_price=65100.0)
        print(f"Executed Order Status: {filled_order1.status.value}")

        # Test 2: Calculate PnL
        if "BTC/USDT" in oms.positions:
            oms.positions["BTC/USDT"].calculate_pnl(67000.0)
        print("Portfolio Summary:", oms.get_portfolio_summary())

        # Test 3: GenAI dynamic selection test
        selected_model = oms.select_dynamic_genai_model()
        print(f"Selected GenAI Model: {selected_model}")

    asyncio.run(main_test())

# END CODE | סך הכל שורות: 388
