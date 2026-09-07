# hub/browser_agent.py
"""
Local headless browser (Playwright) that runs inside the project venv.

Purpose: let the system reach sites that have no API — news pages, source
catalogues, code repositories — and to complete connection flows that need a
real browser. Nothing is fabricated: when Playwright or its Chromium build is
missing, every call reports exactly that and returns no content.

Iron rules:
  * no shell=True, no hardcoded paths (ROOT derives from __file__)
  * every mutating call returns a structured dict
  * outbound only; no port is opened
"""
from __future__ import annotations

import re
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from hub import venv_manager

ROOT = Path(__file__).resolve().parent.parent
SHOTS_DIR = ROOT / "user_data" / "browser_shots"
PACKAGES = ["playwright", "beautifulsoup4", "lxml"]
NAV_TIMEOUT_MS = 30_000

_BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"}


def _safe_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("only http/https urls are allowed")
    host = (parsed.hostname or "").lower()
    if host in _BLOCKED_HOSTS or host.endswith(".local") or host.startswith("192.168.") or host.startswith("10."):
        raise ValueError("private/loopback hosts are blocked")
    return url


# --------------------------------------------------------------------- setup
def status() -> dict[str, Any]:
    installed = {p["name"].lower(): p["version"] for p in venv_manager.get_installed_packages()}
    present = {pkg: installed.get(pkg.lower()) for pkg in PACKAGES}
    missing = [k for k, v in present.items() if not v]
    chromium = False
    detail = None
    if not missing:
        try:
            from playwright.sync_api import sync_playwright  # type: ignore

            with sync_playwright() as p:
                chromium = bool(p.chromium.executable_path and Path(p.chromium.executable_path).exists())
        except Exception as e:  # pragma: no cover - depends on host
            detail = str(e)
    return {
        "ok": not missing and chromium,
        "packages": present,
        "missing": missing,
        "chromium_installed": chromium,
        "detail": detail,
        "shots_dir": str(SHOTS_DIR),
    }


def install() -> dict[str, Any]:
    """Install playwright into the venv and download its Chromium build."""
    results = [venv_manager.install_package(venv_manager.DEFAULT_VENV_DIR, pkg) for pkg in status()["missing"]]
    python = venv_manager.venv_python(venv_manager.DEFAULT_VENV_DIR)
    browser: dict[str, Any]
    try:
        proc = subprocess.run(
            [str(python), "-m", "playwright", "install", "chromium"],
            capture_output=True, text=True, timeout=1800,
        )
        browser = {"ok": proc.returncode == 0, "stdout": proc.stdout[-2000:], "stderr": proc.stderr[-2000:]}
    except Exception as e:
        browser = {"ok": False, "error": str(e)}
    return {"ok": all(r.get("ok") for r in results) and browser["ok"], "packages": results, "chromium": browser}


# ----------------------------------------------------------------- browsing
def _extract(html: str, base_url: str) -> dict[str, Any]:
    try:
        from bs4 import BeautifulSoup  # type: ignore
    except Exception:
        text = re.sub(r"<[^>]+>", " ", html)
        return {"title": None, "text": re.sub(r"\s+", " ", text)[:20000], "links": []}
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    links = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = urljoin(base_url, a["href"])
        if href in seen or not href.startswith("http"):
            continue
        seen.add(href)
        links.append({"href": href, "text": " ".join(a.get_text(" ").split())[:160]})
        if len(links) >= 200:
            break
    return {
        "title": (soup.title.string.strip() if soup.title and soup.title.string else None),
        "text": re.sub(r"\s+", " ", soup.get_text(" ")).strip()[:20000],
        "links": links,
    }


def fetch(url: str, wait_selector: str | None = None, screenshot: bool = False,
          timeout_ms: int = NAV_TIMEOUT_MS) -> dict[str, Any]:
    """Render a page in the local headless browser and return its content."""
    url = _safe_url(url)
    st = status()
    if not st["ok"]:
        return {"ok": False, "error": "local browser not installed", "status": st}
    from playwright.sync_api import sync_playwright  # type: ignore

    t0 = time.time()
    shot_path: str | None = None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_context(viewport={"width": 1440, "height": 1200}).new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                if wait_selector:
                    page.wait_for_selector(wait_selector, timeout=timeout_ms)
                html = page.content()
                if screenshot:
                    SHOTS_DIR.mkdir(parents=True, exist_ok=True)
                    name = re.sub(r"[^a-zA-Z0-9]+", "_", urlparse(url).netloc)[:40]
                    shot = SHOTS_DIR / f"{name}_{int(time.time())}.png"
                    page.screenshot(path=str(shot))
                    shot_path = str(shot)
            finally:
                browser.close()
    except Exception as e:
        return {"ok": False, "url": url, "error": str(e)}

    data = _extract(html, url)
    return {"ok": True, "url": url, "elapsed_ms": int((time.time() - t0) * 1000),
            "screenshot": shot_path, **data}


def fetch_many(urls: list[str], limit: int = 8) -> dict[str, Any]:
    pages = [fetch(u) for u in urls[:limit]]
    return {"ok": any(p.get("ok") for p in pages), "pages": pages}
