# hub/local_ai_manager.py
"""
OferTradingBot Local AI Manager — venv-aware local model runtime control.

Answers the question "does the venv include LOCAL AI models?": yes, this
module owns that side of the environment. It manages the local inference
stack that lives inside the project's own venv (llama-cpp-python, sentence
transformers, ONNX runtime) and the external local daemon (Ollama / LM Studio)
that serves quantised GGUF models.

Iron rules kept identical to venv_manager.py:
1. ROOT is derived from __file__ — never a hardcoded drive letter.
2. Model storage defaults to ROOT/models but is overridable with
   OFER_LOCAL_MODELS_DIR so the user can point at D:\\llm or G:\\ without
   touching code.
3. No shell=True. Every mutating call returns a structured dict.
4. Nothing is fabricated: if Ollama is not running we say so, we never
   invent a model list.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

try:  # optional, only used for the HTTP probes
    import httpx
except Exception:  # pragma: no cover - httpx is in requirements.txt
    httpx = None  # type: ignore[assignment]

from hub import venv_manager

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = Path(os.environ.get("OFER_LOCAL_MODELS_DIR", ROOT / "models"))
OLLAMA_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
LMSTUDIO_URL = os.environ.get("LMSTUDIO_BASE_URL", "http://localhost:1234").rstrip("/")

# Local-AI python packages that belong in the project venv.
LOCAL_AI_PACKAGES: list[str] = [
    "llama-cpp-python",
    "sentence-transformers",
    "onnxruntime",
    "huggingface-hub",
    "tiktoken",
]

HTTP_TIMEOUT = float(os.environ.get("LOCAL_AI_TIMEOUT_SEC", "5"))


# --------------------------------------------------------------------------- #
# venv side                                                                     #
# --------------------------------------------------------------------------- #

def venv_ai_status() -> dict[str, Any]:
    """Which local-AI packages are installed inside the project venv."""
    installed = {p["name"].lower(): p["version"] for p in venv_manager.get_installed_packages()}
    present = {pkg: installed.get(pkg.lower()) for pkg in LOCAL_AI_PACKAGES}
    missing = [pkg for pkg, ver in present.items() if not ver]
    return {
        "ok": not missing,
        "venv_dir": str(venv_manager.DEFAULT_VENV_DIR),
        "venv_exists": venv_manager.DEFAULT_VENV_DIR.exists(),
        "packages": present,
        "missing": missing,
    }


def install_local_ai_stack() -> dict[str, Any]:
    """Install every missing local-AI package into the project venv."""
    results = []
    for pkg in venv_ai_status()["missing"]:
        results.append(venv_manager.install_package(venv_manager.DEFAULT_VENV_DIR, pkg))
    return {"ok": all(r.get("ok") for r in results) if results else True, "results": results}


# --------------------------------------------------------------------------- #
# local model files                                                             #
# --------------------------------------------------------------------------- #

def list_local_model_files() -> dict[str, Any]:
    """GGUF / safetensors / ONNX weights physically present on this machine."""
    if not MODELS_DIR.exists():
        return {"ok": False, "dir": str(MODELS_DIR), "exists": False, "models": []}
    models = []
    for path in sorted(MODELS_DIR.rglob("*")):
        if path.is_file() and path.suffix.lower() in {".gguf", ".safetensors", ".onnx", ".bin"}:
            models.append(
                {
                    "name": path.name,
                    "path": str(path),
                    "size_bytes": path.stat().st_size,
                    "format": path.suffix.lower().lstrip("."),
                }
            )
    return {"ok": True, "dir": str(MODELS_DIR), "exists": True, "models": models}


def disk_free_bytes() -> int:
    target = MODELS_DIR if MODELS_DIR.exists() else ROOT
    return shutil.disk_usage(target).free


# --------------------------------------------------------------------------- #
# local daemons (Ollama / LM Studio)                                            #
# --------------------------------------------------------------------------- #

def _get_json(url: str) -> Any:
    if httpx is None:
        raise RuntimeError("httpx not installed in this environment")
    res = httpx.get(url, timeout=HTTP_TIMEOUT)
    res.raise_for_status()
    return res.json()


def ollama_status() -> dict[str, Any]:
    """Real Ollama daemon state — never a hardcoded model list."""
    try:
        data = _get_json(f"{OLLAMA_URL}/api/tags") or {}
        models = [
            {
                "name": m.get("name"),
                "size_bytes": m.get("size"),
                "family": (m.get("details") or {}).get("family"),
                "parameter_size": (m.get("details") or {}).get("parameter_size"),
                "quantization": (m.get("details") or {}).get("quantization_level"),
                "modified_at": m.get("modified_at"),
            }
            for m in data.get("models", [])
        ]
        return {"ok": True, "running": True, "url": OLLAMA_URL, "models": models}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "running": False, "url": OLLAMA_URL, "models": [], "error": str(exc)}


def lmstudio_status() -> dict[str, Any]:
    try:
        data = _get_json(f"{LMSTUDIO_URL}/v1/models") or {}
        return {
            "ok": True,
            "running": True,
            "url": LMSTUDIO_URL,
            "models": [{"name": m.get("id")} for m in data.get("data", [])],
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "running": False, "url": LMSTUDIO_URL, "models": [], "error": str(exc)}


def pull_ollama_model(model: str) -> dict[str, Any]:
    """Pull a model through the Ollama CLI (streamed, blocking)."""
    exe = shutil.which("ollama")
    if not exe:
        return {"ok": False, "error": "ollama executable not found on PATH"}
    proc = subprocess.run([exe, "pull", model], capture_output=True, text=True)
    return {
        "ok": proc.returncode == 0,
        "model": model,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-4000:],
    }


def delete_ollama_model(model: str) -> dict[str, Any]:
    exe = shutil.which("ollama")
    if not exe:
        return {"ok": False, "error": "ollama executable not found on PATH"}
    proc = subprocess.run([exe, "rm", model], capture_output=True, text=True)
    return {"ok": proc.returncode == 0, "model": model, "stderr": proc.stderr[-2000:]}


def get_status() -> dict[str, Any]:
    """One call the UI can poll: venv packages + weights + daemons."""
    ollama = ollama_status()
    lmstudio = lmstudio_status()
    venv_ai = venv_ai_status()
    files = list_local_model_files()
    return {
        "ok": True,
        "python": sys.version.split()[0],
        "root": str(ROOT),
        "models_dir": str(MODELS_DIR),
        "disk_free_bytes": disk_free_bytes(),
        "venv_ai": venv_ai,
        "local_files": files,
        "ollama": ollama,
        "lmstudio": lmstudio,
        "ready": bool(ollama["running"] or lmstudio["running"] or files["models"]),
    }


if __name__ == "__main__":  # manual smoke test
    print(json.dumps(get_status(), indent=2))
