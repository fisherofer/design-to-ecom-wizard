# hub/local_ai_routes.py
"""
FastAPI router exposing hub/local_ai_manager.py over HTTP.

Mount with: app.include_router(local_ai_routes.router, prefix="/api/local-ai")
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hub import local_ai_manager

router = APIRouter(tags=["local-ai"])


class ModelRequest(BaseModel):
    model: str


@router.get("/status")
def status() -> dict:
    """venv AI packages + local weight files + Ollama/LM Studio daemons."""
    return local_ai_manager.get_status()


@router.get("/models")
def models() -> dict:
    return {
        "ollama": local_ai_manager.ollama_status(),
        "lmstudio": local_ai_manager.lmstudio_status(),
        "files": local_ai_manager.list_local_model_files(),
    }


@router.post("/install-stack")
def install_stack() -> dict:
    """Install llama-cpp-python / sentence-transformers / onnxruntime into the venv."""
    result = local_ai_manager.install_local_ai_stack()
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result)
    return result


@router.post("/pull")
def pull(body: ModelRequest) -> dict:
    result = local_ai_manager.pull_ollama_model(body.model)
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result)
    return result


@router.post("/delete")
def delete(body: ModelRequest) -> dict:
    result = local_ai_manager.delete_ollama_model(body.model)
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result)
    return result


class LoadRequest(BaseModel):
    model_path: str
    n_ctx: int = 4096
    n_gpu_layers: int = 0


class GenerateRequest(BaseModel):
    prompt: str
    model: str | None = None
    max_tokens: int = 512
    temperature: float = 0.2


@router.get("/loaded")
def loaded() -> dict:
    """GGUF weights currently resident in memory."""
    return local_ai_manager.loaded_models()


@router.post("/load")
def load(body: LoadRequest) -> dict:
    """Load a GGUF file from the local models dir into llama-cpp."""
    result = local_ai_manager.load_gguf_model(body.model_path, body.n_ctx, body.n_gpu_layers)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result)
    return result


@router.post("/unload")
def unload(body: LoadRequest) -> dict:
    return local_ai_manager.unload_gguf_model(body.model_path)


@router.post("/generate")
def generate(body: GenerateRequest) -> dict:
    """Completion on a LOCAL runtime only (GGUF → Ollama → LM Studio)."""
    result = local_ai_manager.generate(body.prompt, body.model, body.max_tokens, body.temperature)
    if not result["ok"]:
        raise HTTPException(status_code=503, detail=result)
    return result
