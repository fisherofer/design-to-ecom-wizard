# hub/local_engine.py
"""
Self-contained LOCAL AI engine — no Ollama, no LM Studio, no external daemon.

The engine is llama-cpp-python running inside the project venv plus a GGUF
weight file stored under ROOT/models. Everything is installed and downloaded
by this module, so the machine needs nothing pre-installed except Python.

Honesty rules: a download that fails reports the failure; a missing engine is
reported as missing. Nothing here ever answers with a fabricated completion.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

from hub import local_ai_manager, local_store, venv_manager

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = local_ai_manager.MODELS_DIR
STATE_KEY = "local_engine_state"

# Small, permissively licensed GGUF builds that run on a plain CPU.
CATALOG: list[dict[str, Any]] = [
    {
        "id": "qwen2.5-1.5b-instruct-q4",
        "name": "Qwen2.5 1.5B Instruct (Q4_K_M)",
        "size_mb": 1100,
        "ram_gb": 3,
        "url": "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
        "use": "fast general chat, summaries, journal recaps",
    },
    {
        "id": "qwen2.5-coder-3b-q4",
        "name": "Qwen2.5 Coder 3B (Q4_K_M)",
        "size_mb": 2100,
        "ram_gb": 5,
        "url": "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf",
        "use": "code review and self-upgrade proposals",
    },
    {
        "id": "llama-3.2-3b-instruct-q4",
        "name": "Llama 3.2 3B Instruct (Q4_K_M)",
        "size_mb": 2000,
        "ram_gb": 5,
        "url": "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "use": "balanced reasoning and analysis",
    },
]

_downloads: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def _entry(model_id: str) -> dict[str, Any] | None:
    return next((m for m in CATALOG if m["id"] == model_id), None)


def target_path(model_id: str) -> Path:
    return MODELS_DIR / f"{model_id}.gguf"


def status() -> dict[str, Any]:
    """Is the standalone engine ready: python package + weights + loaded model."""
    installed = {p["name"].lower(): p["version"] for p in venv_manager.get_installed_packages()}
    engine_pkg = installed.get("llama-cpp-python")
    models = []
    for m in CATALOG:
        p = target_path(m["id"])
        models.append({**m, "downloaded": p.exists(), "path": str(p),
                       "bytes": p.stat().st_size if p.exists() else 0,
                       "progress": _downloads.get(m["id"])})
    loaded = local_ai_manager.loaded_models().get("models", [])
    return {
        "ok": bool(engine_pkg) and any(m["downloaded"] for m in models),
        "engine": "llama-cpp",
        "engine_installed": bool(engine_pkg),
        "engine_version": engine_pkg,
        "models_dir": str(MODELS_DIR),
        "disk_free_bytes": local_ai_manager.disk_free_bytes(),
        "models": models,
        "loaded": loaded,
        "standalone": True,
        "requires_ollama": False,
    }


def install_engine() -> dict[str, Any]:
    """Install llama-cpp-python (CPU wheel) into the project venv."""
    res = venv_manager.install_package(venv_manager.DEFAULT_VENV_DIR, "llama-cpp-python")
    local_store.log_event("local_engine", f"engine install ok={res.get('ok')}", "info")
    return res


def _download(model_id: str, url: str, dest: Path) -> None:
    tmp = dest.with_suffix(".part")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ofer-local-engine"})
        with urllib.request.urlopen(req, timeout=60) as res, open(tmp, "wb") as fh:
            total = int(res.headers.get("content-length") or 0)
            done = 0
            while chunk := res.read(1 << 20):
                fh.write(chunk)
                done += len(chunk)
                _downloads[model_id] = {"state": "downloading", "done": done, "total": total,
                                        "pct": round(done / total * 100, 1) if total else None}
        tmp.replace(dest)
        _downloads[model_id] = {"state": "done", "done": dest.stat().st_size, "total": dest.stat().st_size, "pct": 100.0}
        local_store.log_event("local_engine", f"model downloaded: {model_id}", "info")
    except Exception as e:  # noqa: BLE001
        _downloads[model_id] = {"state": "error", "error": str(e)}
        tmp.unlink(missing_ok=True)
        local_store.log_event("local_engine", f"model download failed: {model_id}: {e}", "warn")


def download_model(model_id: str) -> dict[str, Any]:
    entry = _entry(model_id)
    if not entry:
        return {"ok": False, "error": f"unknown model id: {model_id}"}
    dest = target_path(model_id)
    if dest.exists():
        return {"ok": True, "already": True, "path": str(dest)}
    cur = _downloads.get(model_id)
    if cur and cur.get("state") == "downloading":
        return {"ok": True, "already": True, "progress": cur}
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    _downloads[model_id] = {"state": "starting", "done": 0, "total": entry["size_mb"] * 1024 * 1024}
    threading.Thread(target=_download, args=(model_id, entry["url"], dest), daemon=True).start()
    return {"ok": True, "started": True, "model": entry["name"]}


def download_progress(model_id: str) -> dict[str, Any]:
    return {"ok": True, "model_id": model_id, "progress": _downloads.get(model_id)}


def ensure_ready(model_id: str | None = None, n_ctx: int = 4096) -> dict[str, Any]:
    """Install → download → load, so the local model can answer with no daemon."""
    with _lock:
        st = status()
        if not st["engine_installed"]:
            inst = install_engine()
            if not inst.get("ok"):
                return {"ok": False, "step": "install_engine", "error": inst.get("error") or inst}
        chosen = model_id or next((m["id"] for m in st["models"] if m["downloaded"]), CATALOG[0]["id"])
        dest = target_path(chosen)
        if not dest.exists():
            started = download_model(chosen)
            return {"ok": False, "step": "download", "pending": True, "model_id": chosen, "detail": started}
        loaded = {m.get("path") for m in local_ai_manager.loaded_models().get("models", [])}
        if str(dest) not in loaded:
            res = local_ai_manager.load_gguf_model(str(dest), n_ctx=n_ctx)
            if not res.get("ok"):
                return {"ok": False, "step": "load", "error": res.get("error"), "model_id": chosen}
        local_store.kv_set("system", STATE_KEY, {"model_id": chosen, "ready_at": time.time()})
        return {"ok": True, "model_id": chosen, "path": str(dest), "runtime": "llama-cpp"}


def autostart() -> dict[str, Any]:
    """Re-load the model that was in use before the last shutdown (continuity)."""
    stored = local_store.kv_get("system", STATE_KEY)
    prev = (stored.get("value") or {}).get("model_id") if stored.get("found") else None
    if not prev:
        return {"ok": False, "error": "no previous local engine state"}
    return ensure_ready(prev)
