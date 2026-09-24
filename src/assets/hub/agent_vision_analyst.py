# hub/agent_vision_analyst.py
"""Vision analyst agent — reads images from the OWNER's machine, analyses them
with the LOCAL AI only, and can turn an analysis (or a plain script) into a
full video script with scenes.

Rules honoured here:
  * images are read from the local disk only, inside an allow-listed root
    (src/assets/user_data/vision by default, plus any absolute path the owner
    passes explicitly) — no uploads, no cloud vision APIs;
  * every analysis runs on the local engine (hub.local_ai_manager.generate);
    when no local model is ready the caller gets an explicit unavailable
    result instead of an invented description;
  * results are logged as agent runs in the local SQL store and distilled
    into learning memory; nothing is applied to the system by itself.
"""
from __future__ import annotations

import base64
import json
import time
from pathlib import Path
from typing import Any

from hub import ai_memory, local_ai_manager, local_store

ROOT = Path(__file__).resolve().parent.parent
VISION_DIR = ROOT / "user_data" / "vision"
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"}
MAX_BYTES = 25 * 1024 * 1024
AGENT = "VisionAnalyst"


def _ensure_dir() -> None:
    VISION_DIR.mkdir(parents=True, exist_ok=True)


def _safe_path(raw: str) -> Path:
    """Resolve a user-supplied image path, rejecting anything unreadable."""
    if not raw or not raw.strip():
        raise ValueError("path required")
    candidate = Path(raw.strip()).expanduser()
    if not candidate.is_absolute():
        candidate = (VISION_DIR / candidate).resolve()
    else:
        candidate = candidate.resolve()
    if candidate.suffix.lower() not in IMAGE_EXT:
        raise ValueError(f"unsupported image type: {candidate.suffix or 'none'}")
    if not candidate.exists() or not candidate.is_file():
        raise ValueError("file not found on this machine")
    if candidate.stat().st_size > MAX_BYTES:
        raise ValueError("image larger than 25 MB")
    return candidate


def status() -> dict[str, Any]:
    """Report which local vision capabilities are actually installed."""
    _ensure_dir()
    packages: dict[str, str | None] = {}
    for name in ("PIL", "pytesseract", "numpy"):
        try:
            mod = __import__(name)
            packages[name] = str(getattr(mod, "__version__", "installed"))
        except Exception:
            packages[name] = None
    ai = local_ai_manager.venv_ai_status()
    return {
        "ok": True,
        "vision_dir": str(VISION_DIR),
        "packages": packages,
        "missing": [k for k, v in packages.items() if v is None],
        "local_ai": ai,
    }


def list_images(limit: int = 100) -> dict[str, Any]:
    """List the images sitting in the local vision folder."""
    _ensure_dir()
    items: list[dict[str, Any]] = []
    for p in sorted(VISION_DIR.rglob("*"), key=lambda x: x.name):
        if p.is_file() and p.suffix.lower() in IMAGE_EXT:
            st = p.stat()
            items.append({
                "name": p.name,
                "path": str(p),
                "bytes": st.st_size,
                "modified": int(st.st_mtime),
            })
        if len(items) >= limit:
            break
    return {"ok": True, "dir": str(VISION_DIR), "count": len(items), "images": items}


def inspect(path: str) -> dict[str, Any]:
    """Extract real, measurable facts from one image — no interpretation."""
    p = _safe_path(path)
    out: dict[str, Any] = {
        "ok": True,
        "path": str(p),
        "name": p.name,
        "bytes": p.stat().st_size,
    }
    try:
        from PIL import Image  # type: ignore

        with Image.open(p) as img:
            out["width"], out["height"] = img.size
            out["mode"] = img.mode
            out["format"] = img.format
            small = img.convert("RGB").resize((48, 48))
            pixels = list(small.getdata())
            total = len(pixels) or 1
            avg = tuple(round(sum(px[i] for px in pixels) / total) for i in range(3))
            out["average_rgb"] = avg
            out["brightness"] = round(sum(avg) / 3 / 255, 3)
            counts: dict[tuple[int, int, int], int] = {}
            for px in pixels:
                key = (px[0] // 32 * 32, px[1] // 32 * 32, px[2] // 32 * 32)
                counts[key] = counts.get(key, 0) + 1
            top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
            out["dominant_colors"] = [
                {"rgb": list(rgb), "share": round(n / total, 3)} for rgb, n in top
            ]
    except ImportError:
        out["pillow"] = "unavailable — run the local AI stack install to add Pillow"
    except Exception as err:  # unreadable / corrupted file
        return {"ok": False, "path": str(p), "error": f"cannot read image: {err}"}

    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore

        with Image.open(p) as img:
            text = pytesseract.image_to_string(img)
        text = text.strip()
        out["ocr_text"] = text
        out["ocr_chars"] = len(text)
    except Exception:
        out["ocr_text"] = None
        out["ocr_note"] = "OCR unavailable (pytesseract or the tesseract binary is missing)"
    return out


def _local_json(prompt: str, max_tokens: int = 700) -> dict[str, Any]:
    """Ask the local model for JSON and parse it defensively."""
    res = local_ai_manager.generate(prompt, max_tokens=max_tokens, temperature=0.2)
    if not res.get("ok"):
        return {"ok": False, "error": res.get("error", "local model unavailable"),
                "runtime": res.get("runtime")}
    raw = str(res.get("text", "")).strip()
    start, end = raw.find("{"), raw.rfind("}")
    parsed: Any = None
    if start >= 0 and end > start:
        try:
            parsed = json.loads(raw[start:end + 1])
        except Exception:
            parsed = None
    return {"ok": True, "runtime": res.get("runtime"), "model": res.get("model"),
            "text": raw, "json": parsed}


def analyze(path: str, question: str | None = None) -> dict[str, Any]:
    """Inspect an image, then have the LOCAL model interpret the real facts."""
    started = time.time()
    try:
        facts = inspect(path)
    except ValueError as err:
        return {"ok": False, "error": str(err)}
    if not facts.get("ok"):
        return facts

    ask = (question or "").strip() or "What does this image show and what matters in it?"
    prompt = (
        "You are a vision analyst. You cannot see the image directly; you receive "
        "measured facts and any text extracted by OCR. Never invent details that "
        "the facts do not support — say 'not determinable from the provided data' "
        "instead.\n\n"
        f"QUESTION: {ask}\n\n"
        f"MEASURED FACTS (JSON):\n{json.dumps(facts, ensure_ascii=False)[:6000]}\n\n"
        "Reply with JSON only:\n"
        '{"summary": "...", "observations": ["..."], "text_found": "...", '
        '"uncertain": ["..."], "suggested_use": "..."}'
    )
    out = _local_json(prompt)
    elapsed = int((time.time() - started) * 1000)
    if not out.get("ok"):
        return {"ok": False, "path": facts.get("path"), "facts": facts,
                "error": out.get("error"), "elapsed_ms": elapsed}

    result = {
        "ok": True,
        "path": facts.get("path"),
        "facts": facts,
        "analysis": out.get("json"),
        "raw": out.get("text"),
        "runtime": out.get("runtime"),
        "model": out.get("model"),
        "elapsed_ms": elapsed,
    }
    try:
        local_store.log_agent_run({
            "agent": AGENT,
            "task": f"analyze:{facts.get('name')}",
            "status": "ok",
            "scope": "user",
            "latency_ms": elapsed,
            "output": json.dumps(out.get("json") or out.get("text"), ensure_ascii=False)[:4000],
        })
    except Exception:
        pass
    summary = ((out.get("json") or {}).get("summary") if isinstance(out.get("json"), dict) else None)
    if summary:
        try:
            ai_memory.remember("fact", f"Image {facts.get('name')}: {summary}",
                               topic="vision", source="agent_vision_analyst", weight=0.6)
        except Exception:
            pass
    return result


def thumbnail(path: str, max_side: int = 480) -> dict[str, Any]:
    """Return a small base64 preview so the UI can show the local image."""
    try:
        p = _safe_path(path)
    except ValueError as err:
        return {"ok": False, "error": str(err)}
    try:
        import io

        from PIL import Image  # type: ignore

        with Image.open(p) as img:
            img = img.convert("RGB")
            img.thumbnail((max_side, max_side))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=80)
        return {"ok": True, "name": p.name, "mime": "image/jpeg",
                "data_url": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}
    except ImportError:
        return {"ok": False, "error": "Pillow is not installed in the local venv"}
    except Exception as err:
        return {"ok": False, "error": f"cannot render preview: {err}"}


def to_video_script(script: str, title: str | None = None,
                    image_paths: list[str] | None = None,
                    scenes: int = 6) -> dict[str, Any]:
    """Turn a plain script (plus optional local images) into a full video script.

    Produces scenes with narration, on-screen text, visual direction and a
    duration estimate. Nothing is rendered here — rendering stays with the
    external ffmpeg package produced by the studio.
    """
    started = time.time()
    body = (script or "").strip()
    if not body:
        return {"ok": False, "error": "script text required"}
    scenes = max(2, min(int(scenes or 6), 20))

    visuals: list[dict[str, Any]] = []
    for raw in (image_paths or [])[:12]:
        try:
            facts = inspect(raw)
        except ValueError as err:
            visuals.append({"path": raw, "ok": False, "error": str(err)})
            continue
        if facts.get("ok"):
            visuals.append({
                "path": facts.get("path"), "name": facts.get("name"),
                "width": facts.get("width"), "height": facts.get("height"),
                "brightness": facts.get("brightness"),
                "ocr_text": (facts.get("ocr_text") or "")[:400],
            })
        else:
            visuals.append({"path": raw, "ok": False, "error": facts.get("error")})

    prompt = (
        "You are a video producer. Convert the SCRIPT into a shot-by-shot video "
        f"script of about {scenes} scenes. Use only the material given — never "
        "invent numbers, prices or events. If a visual is needed that the "
        "AVAILABLE IMAGES do not cover, describe it as a required asset.\n\n"
        f"TITLE: {(title or '').strip() or 'untitled'}\n\n"
        f"SCRIPT:\n{body[:8000]}\n\n"
        f"AVAILABLE IMAGES (measured facts):\n{json.dumps(visuals, ensure_ascii=False)[:4000]}\n\n"
        "Reply with JSON only:\n"
        '{"title": "...", "logline": "...", "total_seconds": 0, "scenes": '
        '[{"n": 1, "seconds": 0, "narration": "...", "on_screen_text": "...", '
        '"visual": "...", "image": "path or null", "transition": "..."}], '
        '"missing_assets": ["..."]}'
    )
    out = _local_json(prompt, max_tokens=1400)
    elapsed = int((time.time() - started) * 1000)
    if not out.get("ok"):
        return {"ok": False, "error": out.get("error"), "visuals": visuals,
                "elapsed_ms": elapsed}

    payload = out.get("json")
    result = {
        "ok": True,
        "video_script": payload,
        "raw": out.get("text"),
        "visuals": visuals,
        "runtime": out.get("runtime"),
        "model": out.get("model"),
        "elapsed_ms": elapsed,
    }
    try:
        local_store.log_agent_run({
            "agent": AGENT,
            "task": f"video-script:{(title or 'untitled')[:60]}",
            "status": "ok",
            "scope": "user",
            "latency_ms": elapsed,
            "output": json.dumps(payload or out.get("text"), ensure_ascii=False)[:6000],
        })
    except Exception:
        pass
    return result


# ------------------------------------------------------------ news sources
def news_brief(sources: list[dict[str, Any]], title: str | None = None,
               image_paths: list[str] | None = None, scenes: int = 6,
               limit: int = 12) -> dict[str, Any]:
    """Read real news sources (X, YouTube channels, analysts, trading sites)
    with the local browser agent and turn what was actually read into a
    shot-by-shot video script. Unreadable sources are reported, never filled.
    """
    from hub import browser_agent  # local import: optional dependency

    picked = [s for s in (sources or []) if isinstance(s, dict) and s.get("url")][:max(1, min(limit, 30))]
    if not picked:
        return {"ok": False, "error": "no enabled sources supplied"}
    read_ok: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for src in picked:
        try:
            page = browser_agent.fetch(str(src["url"]))
        except Exception as err:  # explicit failure, never silent
            page = {"ok": False, "error": str(err)}
        if page.get("ok") and (page.get("text") or "").strip():
            read_ok.append({
                "name": src.get("name"), "kind": src.get("kind"), "region": src.get("region"),
                "url": src.get("url"), "title": page.get("title"),
                "excerpt": str(page.get("text"))[:1500],
                "headlines": [l.get("text") for l in (page.get("links") or []) if l.get("text")][:15],
            })
        else:
            failed.append({"name": src.get("name"), "url": src.get("url"),
                           "error": page.get("error") or "empty page"})
    if not read_ok:
        return {"ok": False, "error": "no source could be read", "failed": failed}

    digest = "\n\n".join(
        f"[{r['kind']}/{r['region']}] {r['name']} — {r['title'] or ''}\n"
        f"HEADLINES: {' | '.join(h for h in r['headlines'] if h)}\n{r['excerpt']}"
        for r in read_ok
    )
    prompt = (
        "You are a markets news editor. From the SOURCE MATERIAL below write a "
        "tight narration script for a market video. Use ONLY facts present in "
        "the material and name the source for each item. No invented numbers.\n\n"
        f"SOURCE MATERIAL:\n{digest[:12000]}\n\nReply with the plain script only."
    )
    res = local_ai_manager.generate(prompt, max_tokens=1200, temperature=0.2)
    if not res.get("ok"):
        return {"ok": False, "error": res.get("error", "local model unavailable"),
                "read": read_ok, "failed": failed}
    script_text = str(res.get("text", "")).strip()
    video = to_video_script(script_text, title or "Market news brief", image_paths, scenes)
    return {"ok": bool(video.get("ok")), "script": script_text, "read": read_ok,
            "failed": failed, "video": video, "error": video.get("error")}
