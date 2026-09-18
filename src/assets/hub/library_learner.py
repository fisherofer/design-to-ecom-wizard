# hub/library_learner.py
"""
Learn from open-source code and documentation — locally, with owner approval.

Flow for one source URL:
  1. browser_agent fetches the page locally (HTTP(S) only, private hosts blocked).
  2. The local AI engine summarises what is reusable. If no local model is
     available the run stops and reports it — nothing is invented.
  3. The summary is stored in ai_memory as a 'fact' (topic library/<name>) and,
     when the summary names a concrete change for this codebase, a code proposal
     is queued in agent_fleet. Proposals are never applied here.

Every network read and every model call is local. No cloud provider is used.
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from hub import agent_fleet, ai_memory, browser_agent, local_ai_manager, local_store

MAX_CHARS = 12_000

PROMPT = (
    "You are reviewing external open-source material for a local trading system.\n"
    "Write at most 6 short bullet points covering only what the text actually says:\n"
    "  - what the project/document does\n"
    "  - techniques or patterns worth reusing\n"
    "  - risks or licence notes if stated\n"
    "If the text does not support a point, leave it out. Never invent features, "
    "benchmarks or numbers. End with a line starting 'PROPOSAL:' ONLY if the text "
    "names a concrete, specific change worth making in our own code; otherwise end "
    "with 'PROPOSAL: none'.\n\n"
    "SOURCE: {url}\nTITLE: {title}\n\nTEXT:\n{text}\n"
)


def _topic(url: str) -> str:
    host = (urlparse(url).hostname or "source").replace("www.", "")
    path = [p for p in urlparse(url).path.split("/") if p]
    return f"library/{host}" + (f"/{path[0]}" if path else "")


def learn(url: str, note: str | None = None) -> dict[str, Any]:
    """Read one source locally, store what was learned, queue a proposal if warranted."""
    try:
        page = browser_agent.fetch(url)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    if not page.get("ok"):
        return {"ok": False, "stage": "fetch", "error": page.get("error", "page unavailable")}

    text = (page.get("text") or "").strip()
    if len(text) < 200:
        return {"ok": False, "stage": "fetch", "error": "page carried no readable text"}

    gen = local_ai_manager.generate(
        PROMPT.format(url=url, title=page.get("title") or "", text=text[:MAX_CHARS]),
        max_tokens=600,
        temperature=0.2,
    )
    if not gen.get("ok") or not (gen.get("text") or "").strip():
        return {"ok": False, "stage": "model",
                "error": gen.get("error", "no local model available — install or load one first")}

    summary = gen["text"].strip()
    proposal_line = ""
    for line in summary.splitlines():
        if line.strip().upper().startswith("PROPOSAL:"):
            proposal_line = line.split(":", 1)[1].strip()
            break

    topic = _topic(url)
    body = summary if not note else f"{summary}\n\nowner note: {note}"
    mem = ai_memory.remember("fact", f"{url}\n{body}", topic=topic,
                             source="library_learner", weight=0.8)

    proposal_id = None
    if proposal_line and proposal_line.lower() not in ("none", "n/a", "-"):
        prop = agent_fleet.propose_code(
            title=f"From {topic}: {proposal_line[:120]}",
            rationale=f"Learned from {url}\n\n{summary}",
            risk="review",
            source="library_learner",
        )
        proposal_id = prop.get("id")

    local_store.log_event("library_learner", f"learned from {url}", details={"topic": topic})
    return {
        "ok": True,
        "url": url,
        "title": page.get("title"),
        "topic": topic,
        "summary": summary,
        "memory_id": mem.get("id"),
        "proposal_id": proposal_id,
        "model": gen.get("model"),
        "runtime": gen.get("runtime"),
    }


def learn_many(urls: list[str], limit: int = 5) -> dict[str, Any]:
    results = [learn(u) for u in urls[: max(1, limit)]]
    return {
        "ok": any(r.get("ok") for r in results),
        "results": results,
        "learned": sum(1 for r in results if r.get("ok")),
        "failed": sum(1 for r in results if not r.get("ok")),
    }


def learned(limit: int = 100) -> dict[str, Any]:
    items = [i for i in ai_memory.list_memory("fact", limit=limit).get("items", [])
             if str(i.get("topic", "")).startswith("library/")]
    return {"ok": True, "items": items}
