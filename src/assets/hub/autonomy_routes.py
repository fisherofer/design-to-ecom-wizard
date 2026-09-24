# hub/autonomy_routes.py
"""
FastAPI routers for the autonomous layer:
  /api/browser   — local Playwright browser + manual (user-browser) fallback
  /api/engine    — the self-contained local AI engine (llama-cpp + GGUF)
  /api/memory    — learning memory and owner-approved rules
  /api/autopilot — scheduler, job runs and the continuity journal
  /api/wallets   — watch-only payout wallets

Mount from the FastAPI app:
    app.include_router(autonomy_routes.browser_router, prefix="/api/browser")
    app.include_router(autonomy_routes.engine_router,  prefix="/api/engine")
    app.include_router(autonomy_routes.memory_router,  prefix="/api/memory")
    app.include_router(autonomy_routes.autopilot_router, prefix="/api/autopilot")
    app.include_router(autonomy_routes.wallet_router,  prefix="/api/wallets")
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hub import (agent_fleet, agent_vision_analyst, ai_memory, autopilot, browser_agent,
                 library_learner, local_engine, wallet_manager)

browser_router = APIRouter(tags=["browser"])
engine_router = APIRouter(tags=["local-engine"])
memory_router = APIRouter(tags=["ai-memory"])
autopilot_router = APIRouter(tags=["autopilot"])
wallet_router = APIRouter(tags=["wallets"])
fleet_router = APIRouter(tags=["fleet"])
vision_router = APIRouter(tags=["vision"])


# ------------------------------------------------------------------ browser
class FetchRequest(BaseModel):
    url: str
    wait_selector: str | None = None
    screenshot: bool = False


class FetchManyRequest(BaseModel):
    urls: list[str]
    limit: int = 8


@browser_router.get("/status")
def browser_status() -> dict:
    return browser_agent.status()


@browser_router.post("/install")
def browser_install() -> dict:
    return browser_agent.install()


@browser_router.post("/fetch")
def browser_fetch(body: FetchRequest) -> dict:
    try:
        return browser_agent.fetch(body.url, body.wait_selector, body.screenshot)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"ok": False, "error": str(e)}) from e


@browser_router.post("/fetch-many")
def browser_fetch_many(body: FetchManyRequest) -> dict:
    return browser_agent.fetch_many(body.urls, body.limit)


@browser_router.post("/manual")
def browser_manual(body: FetchRequest) -> dict:
    """Hand a URL back to the UI so the OWNER opens it in their own browser.

    Used for sign-in flows and anything that needs a human. The server never
    drives the user's browser and never receives their credentials.
    """
    try:
        url = browser_agent._safe_url(body.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"ok": False, "error": str(e)}) from e
    return {"ok": True, "mode": "manual", "open_in_user_browser": url,
            "note": "complete the flow in your own browser, then return and confirm"}


# ------------------------------------------------------------- local engine
class ModelIdRequest(BaseModel):
    model_id: str | None = None
    n_ctx: int = 4096


@engine_router.get("/status")
def engine_status() -> dict:
    return local_engine.status()


@engine_router.post("/install")
def engine_install() -> dict:
    return local_engine.install_engine()


@engine_router.post("/download")
def engine_download(body: ModelIdRequest) -> dict:
    if not body.model_id:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "model_id required"})
    return local_engine.download_model(body.model_id)


@engine_router.get("/download/{model_id}")
def engine_progress(model_id: str) -> dict:
    return local_engine.download_progress(model_id)


@engine_router.post("/ensure-ready")
def engine_ready(body: ModelIdRequest) -> dict:
    return local_engine.ensure_ready(body.model_id, body.n_ctx)


# -------------------------------------------------------------------- memory
class MemoryRequest(BaseModel):
    kind: str
    content: str
    topic: str = "general"
    source: str | None = None
    weight: float = 1.0


class ApproveRequest(BaseModel):
    id: int
    approved: bool = True


@memory_router.get("")
def memory_list(kind: str | None = None, limit: int = 200) -> dict:
    return ai_memory.list_memory(kind, limit)


@memory_router.post("")
def memory_add(body: MemoryRequest) -> dict:
    result = ai_memory.remember(body.kind, body.content, body.topic, body.source, body.weight)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result)
    return result


@memory_router.post("/approve")
def memory_approve(body: ApproveRequest) -> dict:
    return ai_memory.approve(body.id, body.approved)


@memory_router.delete("/{mem_id}")
def memory_forget(mem_id: int) -> dict:
    return ai_memory.forget(mem_id)


@memory_router.get("/system-prompt")
def memory_prompt(topic: str | None = None) -> dict:
    return {"ok": True, "prompt": ai_memory.system_prompt(topic)}


# ------------------------------------------------------------------ autopilot
class AutopilotConfig(BaseModel):
    enabled: bool | None = None
    jobs: dict | None = None
    topics: list[str] | None = None
    news_sources: list[str] | None = None
    max_pages_per_run: int | None = None


@autopilot_router.get("/status")
def autopilot_status() -> dict:
    return autopilot.status()


@autopilot_router.post("/start")
def autopilot_start() -> dict:
    return autopilot.start()


@autopilot_router.post("/stop")
def autopilot_stop() -> dict:
    return autopilot.stop()


@autopilot_router.post("/config")
def autopilot_config(body: AutopilotConfig) -> dict:
    return autopilot.set_config({k: v for k, v in body.model_dump().items() if v is not None})


@autopilot_router.post("/run/{job}")
def autopilot_run(job: str) -> dict:
    result = autopilot.run_job(job)
    if not result.get("ok") and "unknown job" in str(result.get("error", "")):
        raise HTTPException(status_code=404, detail=result)
    return result


@autopilot_router.get("/journal")
def autopilot_journal(limit: int = 100) -> dict:
    return autopilot.journal(limit)


# -------------------------------------------------------------------- wallets
class WalletRequest(BaseModel):
    chain: str
    address: str
    label: str = ""
    make_default: bool = False


class ReceiptRequest(BaseModel):
    chain: str
    address: str
    amount: float
    note: str = ""


@wallet_router.get("")
def wallets(with_balance: bool = True) -> dict:
    return wallet_manager.list_wallets(with_balance)


@wallet_router.post("")
def wallet_add(body: WalletRequest) -> dict:
    result = wallet_manager.add_wallet(body.chain, body.address, body.label, body.make_default)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result)
    return result


@wallet_router.post("/default")
def wallet_default(body: WalletRequest) -> dict:
    return wallet_manager.set_default(body.chain, body.address)


@wallet_router.post("/receipt")
def wallet_receipt(body: ReceiptRequest) -> dict:
    result = wallet_manager.record_receipt(body.chain, body.address, body.amount, body.note)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result)
    return result


@wallet_router.delete("/{chain}/{address}")
def wallet_remove(chain: str, address: str) -> dict:
    return wallet_manager.remove_wallet(chain, address)


# -------------------------------------------------------------------- fleet
class WorkerRequest(BaseModel):
    name: str
    role: str = "general"
    capabilities: list[str] | None = None
    note: str | None = None


class HeartbeatRequest(BaseModel):
    name: str
    status: str = "idle"


class TaskRequest(BaseModel):
    title: str
    role: str = "general"
    spec: dict | None = None
    priority: int = 5


class ClaimRequest(BaseModel):
    worker: str
    role: str | None = None


class CompleteRequest(BaseModel):
    task_id: int
    worker: str
    result: object | None = None
    error: str | None = None


class ProposalRequest(BaseModel):
    title: str
    rationale: str = ""
    target_path: str | None = None
    patch: str = ""
    risk: str = "unknown"
    source: str | None = None


@fleet_router.get("/status")
def fleet_status() -> dict:
    return agent_fleet.status()


@fleet_router.get("/workers")
def fleet_workers() -> dict:
    return agent_fleet.list_workers()


@fleet_router.post("/workers")
def fleet_register(body: WorkerRequest) -> dict:
    result = agent_fleet.register_worker(body.name, body.role, body.capabilities, body.note)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result)
    return result


@fleet_router.post("/heartbeat")
def fleet_heartbeat(body: HeartbeatRequest) -> dict:
    return agent_fleet.heartbeat(body.name, body.status)


@fleet_router.delete("/workers/{name}")
def fleet_remove_worker(name: str) -> dict:
    return agent_fleet.remove_worker(name)


@fleet_router.get("/tasks")
def fleet_tasks(status: str | None = None, limit: int = 100) -> dict:
    return agent_fleet.list_tasks(status, limit)


@fleet_router.post("/tasks")
def fleet_submit(body: TaskRequest) -> dict:
    result = agent_fleet.submit_task(body.title, body.role, body.spec, body.priority)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result)
    return result


@fleet_router.post("/claim")
def fleet_claim(body: ClaimRequest) -> dict:
    return agent_fleet.claim_task(body.worker, body.role)


@fleet_router.post("/complete")
def fleet_complete(body: CompleteRequest) -> dict:
    return agent_fleet.complete_task(body.task_id, body.worker, body.result, body.error)


@fleet_router.post("/requeue-stale")
def fleet_requeue() -> dict:
    return agent_fleet.requeue_stale()


@fleet_router.post("/archive-runs")
def fleet_archive(limit: int = 200) -> dict:
    return agent_fleet.archive_runs(limit)


@fleet_router.get("/proposals")
def fleet_proposals(status: str | None = None) -> dict:
    return agent_fleet.list_proposals(status)


@fleet_router.post("/proposals")
def fleet_propose(body: ProposalRequest) -> dict:
    result = agent_fleet.propose_code(body.title, body.rationale, body.target_path,
                                     body.patch, body.risk, body.source)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result)
    return result


@fleet_router.post("/proposals/{proposal_id}/decide")
def fleet_decide(proposal_id: int, approve: bool) -> dict:
    result = agent_fleet.decide_proposal(proposal_id, approve)
    if not result["ok"]:
        raise HTTPException(status_code=404, detail=result)
    return result


# ----------------------------------------------------------------- learning
class LearnRequest(BaseModel):
    url: str
    note: str | None = None


class LearnManyRequest(BaseModel):
    urls: list[str]
    limit: int = 5


@fleet_router.get("/learned")
def fleet_learned(limit: int = 100) -> dict:
    return library_learner.learned(limit)


@fleet_router.post("/learn")
def fleet_learn(body: LearnRequest) -> dict:
    result = library_learner.learn(body.url, body.note)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result)
    return result


@fleet_router.post("/learn-many")
def fleet_learn_many(body: LearnManyRequest) -> dict:
    return library_learner.learn_many(body.urls, body.limit)


# ------------------------------------------------------------------- vision
class ImagePathRequest(BaseModel):
    path: str
    question: str | None = None


class VideoScriptRequest(BaseModel):
    script: str
    title: str | None = None
    image_paths: list[str] | None = None
    scenes: int = 6


@vision_router.get("/status")
def vision_status() -> dict:
    return agent_vision_analyst.status()


@vision_router.get("/images")
def vision_images(limit: int = 100) -> dict:
    return agent_vision_analyst.list_images(limit)


@vision_router.post("/inspect")
def vision_inspect(body: ImagePathRequest) -> dict:
    try:
        return agent_vision_analyst.inspect(body.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"ok": False, "error": str(e)}) from e


@vision_router.post("/analyze")
def vision_analyze(body: ImagePathRequest) -> dict:
    result = agent_vision_analyst.analyze(body.path, body.question)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result)
    return result


@vision_router.post("/thumbnail")
def vision_thumbnail(body: ImagePathRequest) -> dict:
    result = agent_vision_analyst.thumbnail(body.path)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result)
    return result


@vision_router.post("/video-script")
def vision_video_script(body: VideoScriptRequest) -> dict:
    result = agent_vision_analyst.to_video_script(body.script, body.title,
                                                  body.image_paths, body.scenes)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result)
    return result


class NewsBriefRequest(BaseModel):
    sources: list[dict]
    title: str | None = None
    image_paths: list[str] | None = None
    scenes: int = 6
    limit: int = 12


@vision_router.post("/news-brief")
def vision_news_brief(body: NewsBriefRequest) -> dict:
    result = agent_vision_analyst.news_brief(body.sources, body.title, body.image_paths,
                                             body.scenes, body.limit)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result)
    return result
