# hub/venv_routes.py
# Updated: 2026-07-19 09:20
"""
FastAPI router exposing hub/venv_manager.py over HTTP.

This is the real replacement for the AI Studio Express prototype's fake
`venvPackages` in-memory array. VenvManager.tsx (Lovable or AI Studio side,
either can consume this) should call these endpoints and render whatever
comes back — it must not compute or fabricate venv state client-side.

Mount with: app.include_router(venv_routes.router, prefix="/api/venv")
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hub import venv_manager

router = APIRouter(tags=["venv"])


class PackageRequest(BaseModel):
    package: str


@router.get("/status")
def status() -> dict:
    """Full, real venv status — OS, python version, packages, health."""
    return venv_manager.get_status()


@router.post("/create")
def create() -> dict:
    """Create the venv if it doesn't exist yet. Idempotent."""
    return venv_manager.create_venv()


@router.post("/heal")
def heal() -> dict:
    """Create if missing + install anything requirements.txt says is missing."""
    result = venv_manager.heal()
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result)
    return result


@router.post("/recreate")
def recreate() -> dict:
    """Delete and rebuild the venv from scratch, then reinstall requirements."""
    result = venv_manager.recreate_venv()
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result)
    return result


@router.post("/install")
def install(body: PackageRequest) -> dict:
    """Install a single package (e.g. 'pandas==2.2.0')."""
    result = venv_manager.install_package(venv_manager.DEFAULT_VENV_DIR, body.package)
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result)
    return result


@router.post("/uninstall")
def uninstall(body: PackageRequest) -> dict:
    """Uninstall a single package."""
    result = venv_manager.uninstall_package(venv_manager.DEFAULT_VENV_DIR, body.package)
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result)
    return result


@router.get("/packages")
def packages() -> dict:
    """List installed packages only (lighter than /status for polling)."""
    return {"packages": venv_manager.get_installed_packages()}
# END CODE | סך הכל שורות: 79
