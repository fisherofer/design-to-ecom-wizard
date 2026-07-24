# 24/07/2026, 14:00
"""
OFERTRADINGBOT - System Orchestrator & Bootstrapper
Uses hub.venv_manager as single source of truth for isolated virtual environment management.
100% OS Independent & Idempotent.
"""

import os
import sys
import subprocess
from pathlib import Path
from dotenv import load_dotenv

from hub.venv_manager import heal, get_python_executable, _get_root_dir

def initialize_environment() -> Path:
    """
    Ensures environment variables and .env template exist.
    Calculates dynamic root directory at runtime.
    """
    root_dir = _get_root_dir()
    env_path = root_dir / ".env"
    
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        with open(env_path, "w", encoding="utf-8") as f:
            f.write("GEMINI_API_KEY=\nOPENAI_API_KEY=\nAPI_PORT=8000\n")
        print(f"[SYSTEM] Created template .env at {env_path}.")
    
    return root_dir

def launch_system(python_exec: Path, root_dir: Path) -> None:
    """
    Launches the FastAPI backend service using the isolated Python executable.
    """
    api_server_path = root_dir / "backend" / "main.py"
    
    if not api_server_path.exists():
        api_server_path.parent.mkdir(parents=True, exist_ok=True)
        with open(api_server_path, "w", encoding="utf-8") as f:
            f.write("""# OFERTRADINGBOT Backend Entrypoint
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
""")
            
    print(f"[SYSTEM] Launching OFERTRADINGBOT Orchestrator on {python_exec}...")
    try:
        subprocess.Popen([str(python_exec), str(api_server_path)])
        print("[SYSTEM] System backend launched successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to launch backend: {e}")

def main():
    """
    Orchestrator entry point:
    1. Initialize runtime environment
    2. Delegate VENV setup & auto-healing to hub.venv_manager.heal()
    3. Launch backend services
    """
    print("=== OFERTRADINGBOT PRODUCTION ORCHESTRATOR BOOTSTRAPPER ===")
    root_dir = initialize_environment()
    
    # Delegate VENV creation, path resolution, and requirement installation to VenvManager
    venv_status = heal()
    python_exec = get_python_executable()
    
    print(f"[ORCHESTRATOR] VENV Path: {venv_status['venvPath']}")
    print(f"[ORCHESTRATOR] Python Executable: {python_exec}")
    
    launch_system(python_exec, root_dir)

if __name__ == '__main__':
    main()

# END CODE | סך הכל שורות: 95
