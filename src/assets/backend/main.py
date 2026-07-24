# OFERTRADINGBOT Backend Entrypoint
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

app = FastAPI(title="OFERTRADINGBOT Production Backend Engine")

frontend_origin = os.environ.get("FRONTEND_ORIGIN", "http://127.0.0.1:3000")
allowed_origins = [frontend_origin, "http://localhost:3000", "http://127.0.0.1:3000"]

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

@app.get("/api/health")
def health_check():
    return {"status": "ACTIVE", "system": "OFERTRADINGBOT"}

if __name__ == "__main__":
    port = int(os.environ.get("API_PORT", 8000))
    host = os.environ.get("API_HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port)
