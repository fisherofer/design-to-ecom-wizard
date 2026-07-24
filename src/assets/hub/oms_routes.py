# 24/07/2026
"""
OFERTRADINGBOT - Order Management System API Routes
Exposes OrderManagementSystem endpoints for order creation, execution, positions, and portfolio tracking.
"""

from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List, Optional
import asyncio

from order_management_system import OrderManagementSystem, OrderSide, OrderType

router = APIRouter()
oms = OrderManagementSystem()

@router.get("/portfolio")
def get_portfolio() -> Dict[str, Any]:
    """Returns live portfolio summary from OMS."""
    return oms.get_portfolio_summary()

@router.get("/orders")
def get_all_orders() -> Dict[str, Any]:
    """Returns all registered orders."""
    return {
        "count": len(oms.orders),
        "orders": [
            {
                "order_id": o.order_id,
                "symbol": o.symbol,
                "side": o.side.value,
                "order_type": o.order_type.value,
                "quantity": o.quantity,
                "price": o.price,
                "status": o.status.value,
                "filled_quantity": o.filled_quantity,
                "average_fill_price": o.average_fill_price,
                "error_message": o.error_message
            }
            for o in oms.orders.values()
        ]
    }

@router.post("/orders/create")
def create_order(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Creates a new order through OMS validation."""
    symbol = str(data.get("symbol", "BTC/USDT"))
    side_str = str(data.get("side", "BUY")).upper()
    type_str = str(data.get("order_type", "MARKET")).upper()
    quantity = float(data.get("quantity", 1.0))
    price = float(data.get("price", 100.0))
    exchange = str(data.get("exchange", "alpaca"))

    side = OrderSide.BUY if side_str == "BUY" else OrderSide.SELL
    order_type = OrderType.MARKET if type_str == "MARKET" else OrderType.LIMIT

    order = oms.create_order(
        symbol=symbol,
        side=side,
        order_type=order_type,
        quantity=quantity,
        price=price,
        exchange=exchange
    )
    return {
        "order_id": order.order_id,
        "status": order.status.value,
        "symbol": order.symbol,
        "side": order.side.value,
        "quantity": order.quantity,
        "price": order.price,
        "error_message": order.error_message
    }

@router.post("/orders/execute")
async def execute_order(data: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Executes an existing order with exponential backoff and risk checks."""
    order_id = str(data.get("order_id", ""))
    market_price = float(data.get("market_price", 100.0))

    if not order_id or order_id not in oms.orders:
        raise HTTPException(status_code=404, detail=f"Order ID '{order_id}' not found")

    filled_order = await oms.execute_order_with_backoff(order_id, market_price)
    return {
        "order_id": filled_order.order_id,
        "status": filled_order.status.value,
        "filled_quantity": filled_order.filled_quantity,
        "average_fill_price": filled_order.average_fill_price,
        "error_message": filled_order.error_message
    }
