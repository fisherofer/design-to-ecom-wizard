# hub/station_sync_routes.py — mount at /api/station-sync
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from hub import station_sync

router = APIRouter()
_LOCAL = ("127.0.0.1", "::1", "localhost")


def _authorized(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in _LOCAL or request.headers.get("authorization", "") == f"Bearer {station_sync.token()}"


def _deny():
    return JSONResponse({"ok": False, "error": "unauthorized — use this station's sync token"}, status_code=401)


class ApplyBody(BaseModel):
    changes: list[dict[str, Any]]
    origin: str = "peer"
    origin_name: str | None = None
    via: str = "peer"
    folder: str | None = None


class SentBody(BaseModel):
    changes: list[dict[str, Any]]
    peer: str = "drive"
    via: str = "drive"
    folder: str | None = None


class PullBody(BaseModel):
    url: str
    token: str
    cursor: int = 0


@router.get("/status")
def status(request: Request):
    if not _authorized(request):
        return _deny()
    from hub import local_store
    own = local_store.kv_get("system", "station.drive_folder")
    return {**station_sync.list_peers(), "head": station_sync.changes_since(0, 1_000_000)["cursor"],
            "folder": own.get("value") if own.get("ok") else None}


@router.get("/changes")
def changes(request: Request, cursor: int = 0, peer: str | None = None):
    if not _authorized(request):
        return _deny()
    res = station_sync.changes_since(cursor)
    if peer:  # a remote station pulled — log what left this station
        station_sync.log_sent(res["changes"], peer, "http")
    return res


@router.post("/sent")
def sent(body: SentBody, request: Request):
    if not _authorized(request):
        return _deny()
    station_sync.log_sent(body.changes, body.peer, body.via)
    if body.folder:
        station_sync.set_own_folder(body.folder)
    return {"ok": True, "logged": len(body.changes)}


@router.get("/log")
def log(request: Request, limit: int = 300, direction: str | None = None):
    if not _authorized(request):
        return _deny()
    return station_sync.read_log(min(max(limit, 1), 2000), direction)


@router.post("/apply")
def apply(body: ApplyBody, request: Request):
    if not _authorized(request):
        return _deny()
    res = station_sync.apply_changes(body.changes, origin=body.origin, via=body.via)
    station_sync.upsert_peer(body.origin, name=body.origin_name, folder=body.folder, via=body.via)
    return res


@router.post("/pull")
def pull(body: PullBody, request: Request):
    if not _authorized(request):
        return _deny()
    if not body.url.startswith(("http://", "https://")):
        return JSONResponse({"ok": False, "error": "url must be http(s)"}, status_code=400)
    try:
        return station_sync.pull_from_peer(body.url, body.token, body.cursor)
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"peer unreachable: {e}"}, status_code=502)
