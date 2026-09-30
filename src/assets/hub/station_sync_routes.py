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


class PullBody(BaseModel):
    url: str
    token: str
    cursor: int = 0


@router.get("/status")
def status(request: Request):
    if not _authorized(request):
        return _deny()
    return {**station_sync.list_peers(), "head": station_sync.changes_since(0, 1_000_000)["cursor"]}


@router.get("/changes")
def changes(request: Request, cursor: int = 0):
    if not _authorized(request):
        return _deny()
    return station_sync.changes_since(cursor)


@router.post("/apply")
def apply(body: ApplyBody, request: Request):
    if not _authorized(request):
        return _deny()
    res = station_sync.apply_changes(body.changes, origin=body.origin)
    station_sync.upsert_peer(body.origin, name=body.origin_name)
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
