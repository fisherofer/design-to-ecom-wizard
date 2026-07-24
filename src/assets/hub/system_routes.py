# 24/07/2026
"""
OFERTRADINGBOT - System & Capability Status Routes
Exposes generic capability checks and connected client status endpoints.
"""

from fastapi import APIRouter
from typing import Dict, Any, List

router = APIRouter()

@router.get("/connected_clients")
def get_connected_clients() -> Dict[str, Any]:
    """Returns generic capabilities and active connected agent client runtimes."""
    return {
        "success": True,
        "capabilities": [
            "mcp_server",
            "llm_router",
            "paper_trading",
            "risk_circuit_breaker",
            "code_workspace_sync"
        ],
        "active_clients": [
            {
                "id": "client_web_dashboard",
                "type": "web_interface",
                "connected": True,
                "protocol": "HTTP/WS"
            },
            {
                "id": "client_mcp_agent",
                "type": "agent_runtime",
                "connected": True,
                "protocol": "MCP_STDIO"
            }
        ]
    }
