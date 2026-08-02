# 31/07/2026, 21:00
from fastapi import APIRouter
from pydantic import BaseModel
import json
from pathlib import Path
import os

router = APIRouter(tags=["Quant"])

@router.get("/metrics")
async def get_quant_metrics():
    """
    Returns the true Brier Score history from the QuantPredictionEngine.
    Reads from user_data/quant_metrics.json
    """
    metrics_path = Path("user_data/quant_metrics.json")
    if not metrics_path.exists():
        return {"success": True, "data": []}
        
    try:
        with open(metrics_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "error": str(e)}

# END CODE | סך הכל שורות: 22

import subprocess
import logging

@router.post("/update-local-data")
async def update_local_data():
    """
    Triggers the background python script to fetch free local market data via yfinance (Google Finance alternative).
    """
    try:
        from hub.venv_manager import get_python_executable
        python_exec = get_python_executable()
        
        script_path = Path("local_data_updater.py")
        if not script_path.exists():
            return {"success": False, "error": "local_data_updater.py not found"}
            
        # Launch subprocess asynchronously so it doesn't block
        subprocess.Popen([str(python_exec), str(script_path)])
        return {"success": True, "message": "Local market data update started in background."}
    except Exception as e:
        return {"success": False, "error": str(e)}
