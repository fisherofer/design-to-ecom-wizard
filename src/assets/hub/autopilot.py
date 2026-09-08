# hub/autopilot.py
"""
Autopilot — the always-on loop that lets the system run by itself.

Jobs (each one is independently enabled and scheduled):
  news      — pull configured news/RSS sources through the local browser
  analysis  — have the LOCAL model summarise what the news job collected
  sources   — discover new data sources for the topics in the catalogue
  code      — search public code hosts for material matching the topic catalogue
  journal   — write a continuity entry so a restart resumes where it stopped

Everything is persisted in the local venv SQLite store, so closing and
re-opening the system restores the schedule, the last run of every job and the
running journal. No job ever fabricates a result: a source that fails is
recorded as failed.
"""
from __future__ import annotations

import json
import threading
import time
from typing import Any
from urllib.parse import quote_plus, urlparse

from hub import ai_memory, browser_agent, local_ai_manager, local_store

CONFIG_KEY = "autopilot_config"
STATE_KEY = "autopilot_state"
JOURNAL_KEY = "autopilot_journal"

DEFAULT_TOPICS: list[str] = [
    "market microstructure", "order execution algorithms", "risk management",
    "options flow", "sentiment analysis", "backtesting frameworks",
    "local llm inference", "trading data sources",
]

DEFAULT_NEWS_SOURCES: list[str] = [
    "https://finance.yahoo.com/topic/stock-market-news/",
    "https://www.reuters.com/markets/",
    "https://www.cnbc.com/finance/",
]

DEFAULT_CONFIG: dict[str, Any] = {
    "enabled": False,
    "jobs": {
        "news": {"enabled": True, "every_min": 30},
        "analysis": {"enabled": True, "every_min": 60},
        "sources": {"enabled": True, "every_min": 720},
        "code": {"enabled": True, "every_min": 1440},
        "journal": {"enabled": True, "every_min": 15},
    },
    "topics": DEFAULT_TOPICS,
    "news_sources": DEFAULT_NEWS_SOURCES,
    "max_pages_per_run": 4,
}

_thread: threading.Thread | None = None
_stop = threading.Event()
_lock = threading.Lock()


# ------------------------------------------------------------------ storage
def config() -> dict[str, Any]:
    stored = local_store.kv_get("system", CONFIG_KEY)
    cfg = (stored.get("value") or {}) if stored.get("found") else {}
    merged = {**DEFAULT_CONFIG, **cfg}
    merged["jobs"] = {**DEFAULT_CONFIG["jobs"], **(cfg.get("jobs") or {})}
    return merged


def set_config(patch: dict[str, Any]) -> dict[str, Any]:
    cfg = config()
    jobs = {**cfg["jobs"], **(patch.get("jobs") or {})}
    cfg = {**cfg, **{k: v for k, v in patch.items() if k != "jobs"}, "jobs": jobs}
    local_store.kv_set("system", CONFIG_KEY, cfg)
    return {"ok": True, "config": cfg}


def _state() -> dict[str, Any]:
    stored = local_store.kv_get("system", STATE_KEY)
    return (stored.get("value") or {}) if stored.get("found") else {}


def _save_state(state: dict[str, Any]) -> None:
    local_store.kv_set("system", STATE_KEY, state)


def journal(limit: int = 100) -> dict[str, Any]:
    stored = local_store.kv_get("system", JOURNAL_KEY)
    entries = (stored.get("value") or []) if stored.get("found") else []
    return {"ok": True, "entries": entries[-limit:][::-1]}


def _journal_append(kind: str, message: str, details: dict[str, Any] | None = None) -> None:
    stored = local_store.kv_get("system", JOURNAL_KEY)
    entries = (stored.get("value") or []) if stored.get("found") else []
    entries.append({"at": time.time(), "kind": kind, "message": message, "details": details or {}})
    local_store.kv_set("system", JOURNAL_KEY, entries[-500:])
    local_store.log_event("autopilot", f"{kind}: {message}", "info", details)


# --------------------------------------------------------------------- jobs
def job_news() -> dict[str, Any]:
    cfg = config()
    urls = cfg.get("news_sources") or []
    limit = int(cfg.get("max_pages_per_run", 4))
    collected: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    for url in urls[:limit]:
        res = browser_agent.fetch(url)
        if not res.get("ok"):
            failures.append({"url": url, "error": res.get("error")})
            continue
        headlines = [
            link for link in res.get("links", [])
            if len(link.get("text", "")) >= 35 and urlparse(link["href"]).netloc == urlparse(url).netloc
        ][:25]
        collected.append({"source": url, "title": res.get("title"), "headlines": headlines})
    local_store.kv_set("system", "autopilot_news_latest",
                       {"at": time.time(), "items": collected, "failures": failures})
    _journal_append("news", f"collected {sum(len(c['headlines']) for c in collected)} headlines "
                            f"from {len(collected)} sources ({len(failures)} failed)",
                    {"failures": failures})
    return {"ok": bool(collected), "sources": len(collected), "failures": failures}


def job_analysis() -> dict[str, Any]:
    stored = local_store.kv_get("system", "autopilot_news_latest")
    payload = (stored.get("value") or {}) if stored.get("found") else {}
    items = payload.get("items") or []
    if not items:
        return {"ok": False, "error": "no collected news to analyse"}
    lines = []
    for src in items:
        for h in src["headlines"][:12]:
            lines.append(f"- {h['text']}")
    prompt = (
        "Summarise today's market news below into: 1) three themes, 2) tickers or sectors named, "
        "3) any risk worth flagging. Use only what is written. If something is unclear, say so.\n\n"
        + "\n".join(lines[:120])
    )
    res = local_ai_manager.generate(prompt, max_tokens=700, temperature=0.2)
    if not res.get("ok"):
        _journal_append("analysis", f"local model unavailable: {res.get('error')}")
        return {"ok": False, "error": res.get("error")}
    text = (res.get("text") or "").strip()
    local_store.kv_set("system", "autopilot_analysis_latest",
                       {"at": time.time(), "text": text, "model": res.get("model")})
    ai_memory.remember("lesson", text[:1200], topic="market news", source="autopilot/analysis")
    _journal_append("analysis", f"news digest written by {res.get('model')}", {"chars": len(text)})
    return {"ok": True, "text": text, "model": res.get("model")}


def job_sources() -> dict[str, Any]:
    """Discover candidate data sources for each catalogued topic (search pages)."""
    cfg = config()
    found: list[dict[str, Any]] = []
    for topic in (cfg.get("topics") or [])[:4]:
        url = f"https://duckduckgo.com/html/?q={quote_plus(topic + ' free market data api')}"
        res = browser_agent.fetch(url)
        if not res.get("ok"):
            continue
        for link in res.get("links", [])[:60]:
            host = urlparse(link["href"]).netloc
            if "duckduckgo" in host or not host:
                continue
            found.append({"topic": topic, "host": host, "url": link["href"], "text": link["text"]})
    dedup: dict[str, dict[str, Any]] = {}
    for f in found:
        dedup.setdefault(f["host"], f)
    catalogue = list(dedup.values())[:60]
    local_store.kv_set("system", "autopilot_sources_latest", {"at": time.time(), "items": catalogue})
    _journal_append("sources", f"catalogued {len(catalogue)} candidate sources")
    return {"ok": bool(catalogue), "count": len(catalogue), "items": catalogue}


def job_code() -> dict[str, Any]:
    """Search public code hosts for repositories matching the topic catalogue."""
    cfg = config()
    hits: list[dict[str, Any]] = []
    for topic in (cfg.get("topics") or [])[:4]:
        url = f"https://github.com/search?q={quote_plus(topic)}&type=repositories&s=stars&o=desc"
        res = browser_agent.fetch(url, wait_selector=None)
        if not res.get("ok"):
            continue
        for link in res.get("links", []):
            path = urlparse(link["href"]).path.strip("/")
            if link["href"].startswith("https://github.com/") and path.count("/") == 1 and link["text"]:
                hits.append({"topic": topic, "repo": path, "url": link["href"], "text": link["text"]})
    dedup: dict[str, dict[str, Any]] = {}
    for h in hits:
        dedup.setdefault(h["repo"], h)
    catalogue = list(dedup.values())[:80]
    local_store.kv_set("system", "autopilot_code_latest", {"at": time.time(), "items": catalogue})
    _journal_append("code", f"found {len(catalogue)} candidate repositories")
    return {"ok": bool(catalogue), "count": len(catalogue), "items": catalogue}


def job_journal() -> dict[str, Any]:
    st = local_store.stats()
    _journal_append("journal", "continuity checkpoint", {
        "messages": st.get("user", {}).get("messages"),
        "agent_runs": st.get("system", {}).get("agent_runs"),
    })
    return {"ok": True}


JOBS = {"news": job_news, "analysis": job_analysis, "sources": job_sources,
        "code": job_code, "journal": job_journal}


def run_job(name: str) -> dict[str, Any]:
    fn = JOBS.get(name)
    if not fn:
        return {"ok": False, "error": f"unknown job: {name}"}
    t0 = time.time()
    try:
        result = fn()
    except Exception as e:  # noqa: BLE001
        result = {"ok": False, "error": str(e)}
        _journal_append(name, f"job crashed: {e}")
    state = _state()
    state.setdefault("last_run", {})[name] = {
        "at": time.time(), "ok": bool(result.get("ok")),
        "ms": int((time.time() - t0) * 1000), "error": result.get("error"),
    }
    _save_state(state)
    return result


# --------------------------------------------------------------------- loop
def _loop() -> None:
    while not _stop.is_set():
        cfg = config()
        if cfg.get("enabled"):
            state = _state()
            now = time.time()
            for name, job_cfg in cfg["jobs"].items():
                if not job_cfg.get("enabled"):
                    continue
                last = (state.get("last_run", {}).get(name) or {}).get("at", 0)
                if now - last >= float(job_cfg.get("every_min", 60)) * 60:
                    run_job(name)
                    state = _state()
        _stop.wait(30)


def start() -> dict[str, Any]:
    global _thread
    with _lock:
        set_config({"enabled": True})
        if _thread and _thread.is_alive():
            return {"ok": True, "already_running": True}
        _stop.clear()
        _thread = threading.Thread(target=_loop, name="autopilot", daemon=True)
        _thread.start()
        _journal_append("system", "autopilot started")
        return {"ok": True, "running": True}


def stop() -> dict[str, Any]:
    with _lock:
        set_config({"enabled": False})
        _stop.set()
        _journal_append("system", "autopilot stopped")
        return {"ok": True, "running": False}


def status() -> dict[str, Any]:
    cfg = config()
    state = _state()
    latest = {}
    for key in ("news", "analysis", "sources", "code"):
        stored = local_store.kv_get("system", f"autopilot_{key}_latest")
        latest[key] = (stored.get("value") or {}) if stored.get("found") else None
    return {
        "ok": True,
        "running": bool(_thread and _thread.is_alive()),
        "config": cfg,
        "last_run": state.get("last_run", {}),
        "latest": latest,
        "browser": browser_agent.status(),
        "json": json.dumps({}),
    }
