# hub/venv_manager.py
# Updated: 2026-07-19 09:00
"""
OferTradingBot Venv Manager — real, OS-independent virtual-environment
control for the project's own Python runtime.

Replaces the simulated/hardcoded venv state that existed in the AI Studio
Express prototype (`venvPackages` in server.ts) with an actual, working
implementation. This module never assumes Windows, D:\\, or any specific
drive letter — ROOT is always derived from __file__, and every OS-specific
branch (activate script name, python executable name) is resolved via
`os.name` / `sys.platform`, never hardcoded.

Iron rules this module enforces:
1. ROOT is always Path(__file__).resolve().parent.parent — dynamic, never
   a literal path string.
2. No shell=True subprocess calls (avoids injection + keeps behavior
   identical across OS shells).
3. Every mutating operation (create/delete/install) is idempotent and
   returns a structured dict — never raises on "already in the desired
   state", only on genuine failure.
4. This module talks to disk and pip only. It never touches keys_manager,
   vault.db, or any secret — venv management and credential management stay
   separate on purpose.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import venv as venv_module
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_VENV_DIR = ROOT / ".venv"
DEFAULT_REQUIREMENTS_FILE = ROOT / "requirements.txt"


# ============ path resolution (OS-independent) ============

def _is_windows() -> bool:
    """Return True if running on Windows. Single source of truth for OS branching."""
    return os.name == "nt"


def venv_python_path(venv_dir: Path) -> Path:
    """Resolve the interpreter path inside a venv, regardless of host OS."""
    if _is_windows():
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def venv_pip_path(venv_dir: Path) -> Path:
    """Resolve the pip executable inside a venv, regardless of host OS."""
    if _is_windows():
        return venv_dir / "Scripts" / "pip.exe"
    return venv_dir / "bin" / "pip"


def venv_activate_script(venv_dir: Path) -> Path:
    """Resolve the activation script path (informational — not sourced by this module)."""
    if _is_windows():
        return venv_dir / "Scripts" / "activate.bat"
    return venv_dir / "bin" / "activate"


def venv_exists(venv_dir: Path = DEFAULT_VENV_DIR) -> bool:
    """Check whether a usable venv already exists at the given path."""
    return venv_python_path(venv_dir).exists()


# ============ subprocess helper ============

def _run(cmd: list[str], timeout: int = 300) -> dict[str, Any]:
    """Run a command with no shell, capture output, never raise on non-zero exit.

    Args:
        cmd: Full argv list. Never build this from string concatenation.
        timeout: Seconds before the call is killed.

    Returns:
        Dict with ok/returncode/stdout/stderr — always structured, never an
        exception the caller has to catch for the common "pip failed" case.
    """
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, shell=False
        )
        return {
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout[-4000:],
            "stderr": result.stderr[-4000:],
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "returncode": None, "stdout": "", "stderr": f"timeout after {timeout}s"}
    except FileNotFoundError as exc:
        return {"ok": False, "returncode": None, "stdout": "", "stderr": str(exc)}


# ============ lifecycle ============

def create_venv(venv_dir: Path = DEFAULT_VENV_DIR, upgrade_pip: bool = True) -> dict[str, Any]:
    """Create the venv if it doesn't already exist. Idempotent.

    Args:
        venv_dir: Target directory for the virtual environment.
        upgrade_pip: If True, upgrade pip immediately after creation.

    Returns:
        Structured result dict including whether a new venv was actually created.
    """
    if venv_exists(venv_dir):
        return {"ok": True, "created": False, "venv_dir": str(venv_dir), "note": "already exists"}

    venv_dir.parent.mkdir(parents=True, exist_ok=True)
    builder = venv_module.EnvBuilder(with_pip=True, upgrade_deps=upgrade_pip)
    builder.create(str(venv_dir))

    if not venv_exists(venv_dir):
        return {"ok": False, "created": False, "venv_dir": str(venv_dir), "error": "venv.EnvBuilder ran but interpreter not found"}

    return {"ok": True, "created": True, "venv_dir": str(venv_dir)}


def delete_venv(venv_dir: Path = DEFAULT_VENV_DIR, confirm: bool = False) -> dict[str, Any]:
    """Delete a venv directory. Requires explicit confirm=True — no accidental wipes.

    Args:
        venv_dir: Directory to remove.
        confirm: Must be True or the call is a safe no-op.
    """
    if not confirm:
        return {"ok": False, "deleted": False, "error": "confirm=True required to delete a venv"}
    if not venv_dir.exists():
        return {"ok": True, "deleted": False, "note": "nothing to delete"}
    shutil.rmtree(venv_dir, ignore_errors=True)
    return {"ok": True, "deleted": True, "venv_dir": str(venv_dir)}


def recreate_venv(
    venv_dir: Path = DEFAULT_VENV_DIR,
    requirements_file: Path = DEFAULT_REQUIREMENTS_FILE,
) -> dict[str, Any]:
    """Delete (if present) and rebuild the venv, then install requirements. Idempotent."""
    delete_venv(venv_dir, confirm=True)
    created = create_venv(venv_dir)
    if not created["ok"]:
        return created
    installed = install_requirements(venv_dir, requirements_file)
    return {"ok": created["ok"] and installed["ok"], "create": created, "install": installed}


# ============ package management ============

def get_installed_packages(venv_dir: Path = DEFAULT_VENV_DIR) -> list[dict[str, str]]:
    """List installed packages inside the venv as [{"name": ..., "version": ...}, ...]."""
    if not venv_exists(venv_dir):
        return []
    result = _run([str(venv_python_path(venv_dir)), "-m", "pip", "list", "--format=json"])
    if not result["ok"]:
        return []
    try:
        raw = json.loads(result["stdout"])
        return [{"name": p["name"], "version": p["version"]} for p in raw]
    except (json.JSONDecodeError, KeyError):
        return []


def install_requirements(
    venv_dir: Path = DEFAULT_VENV_DIR,
    requirements_file: Path = DEFAULT_REQUIREMENTS_FILE,
) -> dict[str, Any]:
    """Install everything in requirements.txt into the venv."""
    if not venv_exists(venv_dir):
        return {"ok": False, "error": "venv does not exist — call create_venv() first"}
    if not requirements_file.exists():
        return {"ok": False, "error": f"requirements file not found: {requirements_file}"}
    return _run([str(venv_pip_path(venv_dir)), "install", "-r", str(requirements_file)], timeout=1800)


def install_package(venv_dir: Path, package_spec: str) -> dict[str, Any]:
    """Install a single package (e.g. 'fastapi==0.110.0') into the venv."""
    if not venv_exists(venv_dir):
        return {"ok": False, "error": "venv does not exist — call create_venv() first"}
    return _run([str(venv_pip_path(venv_dir)), "install", package_spec], timeout=600)


def uninstall_package(venv_dir: Path, package_name: str) -> dict[str, Any]:
    """Uninstall a single package from the venv."""
    if not venv_exists(venv_dir):
        return {"ok": False, "error": "venv does not exist"}
    return _run([str(venv_pip_path(venv_dir)), "uninstall", "-y", package_name], timeout=300)


# ============ health & self-heal ============

def _parse_requirements(requirements_file: Path) -> list[str]:
    """Return required package names (lowercase, no version pin) from requirements.txt."""
    if not requirements_file.exists():
        return []
    names = []
    for line in requirements_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        for sep in ("==", ">=", "<=", "~=", ">", "<", "["):
            if sep in line:
                line = line.split(sep, 1)[0]
                break
        names.append(line.strip().lower())
    return names


def check_health(
    venv_dir: Path = DEFAULT_VENV_DIR,
    requirements_file: Path = DEFAULT_REQUIREMENTS_FILE,
) -> dict[str, Any]:
    """Compare installed packages against requirements.txt. Never installs anything."""
    if not venv_exists(venv_dir):
        return {"ok": False, "venv_exists": False, "missing": _parse_requirements(requirements_file)}

    installed = {p["name"].lower() for p in get_installed_packages(venv_dir)}
    required = _parse_requirements(requirements_file)
    missing = [r for r in required if r not in installed]

    return {
        "ok": len(missing) == 0,
        "venv_exists": True,
        "python_version": get_python_version(venv_dir),
        "installed_count": len(installed),
        "required_count": len(required),
        "missing": missing,
    }


def heal(
    venv_dir: Path = DEFAULT_VENV_DIR,
    requirements_file: Path = DEFAULT_REQUIREMENTS_FILE,
) -> dict[str, Any]:
    """Create the venv if missing, then install anything check_health() flags as missing.

    Idempotent — safe to call on every startup (mirrors GOOSE_TASKS משימה 1's
    `health.py --doctor` pattern, scoped to the venv itself).
    """
    if not venv_exists(venv_dir):
        created = create_venv(venv_dir)
        if not created["ok"]:
            return {"ok": False, "step": "create_venv", "detail": created}

    health_before = check_health(venv_dir, requirements_file)
    if health_before["ok"]:
        return {"ok": True, "action": "none", "health": health_before}

    install_result = install_requirements(venv_dir, requirements_file)
    health_after = check_health(venv_dir, requirements_file)
    return {
        "ok": health_after["ok"],
        "action": "installed_requirements",
        "install_result": install_result,
        "health_before": health_before,
        "health_after": health_after,
    }


# ============ introspection ============

def get_python_version(venv_dir: Path = DEFAULT_VENV_DIR) -> Optional[str]:
    """Return the Python version string reported by the venv's own interpreter."""
    if not venv_exists(venv_dir):
        return None
    result = _run([str(venv_python_path(venv_dir)), "--version"])
    if not result["ok"]:
        return None
    return (result["stdout"] or result["stderr"]).strip()


def get_status(
    venv_dir: Path = DEFAULT_VENV_DIR,
    requirements_file: Path = DEFAULT_REQUIREMENTS_FILE,
) -> dict[str, Any]:
    """Full status report for the UI (real replacement for the old fake `venvPackages`)."""
    exists = venv_exists(venv_dir)
    disk_bytes = 0
    if exists:
        disk_bytes = sum(f.stat().st_size for f in venv_dir.rglob("*") if f.is_file())

    return {
        "ok": True,
        "os": "windows" if _is_windows() else "posix",
        "host_python": sys.version.split()[0],
        "venv_dir": str(venv_dir),
        "venv_exists": exists,
        "venv_python_version": get_python_version(venv_dir) if exists else None,
        "disk_usage_bytes": disk_bytes,
        "packages": get_installed_packages(venv_dir) if exists else [],
        "health": check_health(venv_dir, requirements_file),
    }


def run_in_venv(args: list[str], venv_dir: Path = DEFAULT_VENV_DIR, timeout: int = 600) -> dict[str, Any]:
    """Run an arbitrary command using the venv's own interpreter (e.g. run_pipeline.py)."""
    if not venv_exists(venv_dir):
        return {"ok": False, "error": "venv does not exist — call create_venv() first"}
    return _run([str(venv_python_path(venv_dir)), *args], timeout=timeout)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="OferTradingBot Venv Manager")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--create", action="store_true")
    parser.add_argument("--heal", action="store_true")
    parser.add_argument("--recreate", action="store_true")
    parser.add_argument("--install", type=str, metavar="PACKAGE")
    parser.add_argument("--uninstall", type=str, metavar="PACKAGE")
    args = parser.parse_args()

    if args.status:
        print(json.dumps(get_status(), indent=2, ensure_ascii=False))
    elif args.create:
        print(json.dumps(create_venv(), indent=2, ensure_ascii=False))
    elif args.heal:
        print(json.dumps(heal(), indent=2, ensure_ascii=False))
    elif args.recreate:
        print(json.dumps(recreate_venv(), indent=2, ensure_ascii=False))
    elif args.install:
        print(json.dumps(install_package(DEFAULT_VENV_DIR, args.install), indent=2, ensure_ascii=False))
    elif args.uninstall:
        print(json.dumps(uninstall_package(DEFAULT_VENV_DIR, args.uninstall), indent=2, ensure_ascii=False))
    else:
        print(json.dumps(get_status(), indent=2, ensure_ascii=False))
# END CODE | סך הכל שורות: 337
