# OFERTRADINGBOT Backend Entrypoint
"""
FastAPI application factory and entrypoint.

Security posture:
  * Host binding defaults to 127.0.0.1 (loopback only). External exposure
    requires an explicit API_HOST / HOST environment variable.
  * CORS origins come from FRONTEND_ORIGIN / EXTRA_CORS_ORIGINS — no wildcard.
  * Test-mode shortcuts are gated on TEST_MODE == 'true'. No hardcoded keys.
"""

import os

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hub.venv_routes import router as venv_router
from hub.risk_routes import router as risk_router
from hub.oms_routes import router as oms_router
from hub.market_stream_routes import router as stream_router
from hub.backtest_routes import router as backtest_router
from hub.mcp_routes import router as mcp_router
from hub.system_routes import router as system_router
from hub import trading_account_routes
from hub.alerts_routes import router as alerts_router
from hub.quotes_router import router as quotes_router

app = FastAPI(title="OFERTRADINGBOT Production Backend Engine")

TEST_MODE = os.environ.get("TEST_MODE", "").strip().lower() == "true"

frontend_origin = os.environ.get("FRONTEND_ORIGIN", "http://127.0.0.1:3000")
extra_origins = [
    origin.strip()
    for origin in os.environ.get("EXTRA_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
allowed_origins = list(
    dict.fromkeys([frontend_origin, "http://localhost:3000", "http://127.0.0.1:3000", *extra_origins])
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect system and feature module routers
app.include_router(venv_router)
app.include_router(risk_router, prefix="/api/risk")
app.include_router(oms_router, prefix="/api/trading")
app.include_router(stream_router, prefix="/api/stream")
app.include_router(backtest_router, prefix="/api/backtest")
app.include_router(mcp_router, prefix="/api/mcp")
app.include_router(system_router, prefix="/api/system")
app.include_router(trading_account_routes.router, prefix="/api/account")
app.include_router(alerts_router, prefix="/api/alerts")
app.include_router(quotes_router, prefix="/api/market-data")


@app.get("/api/health")
def health_check():
    return {
        "status": "ACTIVE",
        "system": "OFERTRADINGBOT",
        "test_mode": TEST_MODE,
        "trading_stage": os.environ.get("TRADING_STAGE", "1"),
    }


def resolve_host() -> str:
    """
    Resolves the bind address. Defaults to loopback: binding to 0.0.0.0 must be
    an explicit, deliberate operator decision via API_HOST or HOST.
    """
    return os.environ.get("API_HOST") or os.environ.get("HOST") or "127.0.0.1"


if __name__ == "__main__":
    port = int(os.environ.get("API_PORT", 8000))
    host = resolve_host()
    if host not in ("127.0.0.1", "localhost", "::1"):
        print(f"[SECURITY WARNING] Binding to non-loopback host '{host}' — the API is network exposed.")
    uvicorn.run(app, host=host, port=port)
