"""
OFERTRADINGBOT - Hub package.

Kept import-free on purpose: the one-click starter imports hub.venv_manager with
the plain host Python *before* the venv (and packages like cryptography) exists.
Convenience names are resolved lazily on first use.
"""
from importlib import import_module

_LAZY = {
    "get_key_status": "hub.keys_manager", "set_key": "hub.keys_manager", "get_key": "hub.keys_manager",
    "delete_key": "hub.keys_manager", "KNOWN_PROVIDERS": "hub.keys_manager",
    "heal": "hub.venv_manager", "install_package": "hub.venv_manager",
}


def __getattr__(name):
    if name == "get_venv_status":
        return import_module("hub.venv_manager").get_status
    if name in _LAZY:
        return getattr(import_module(_LAZY[name]), name)
    raise AttributeError(name)


__all__ = [*_LAZY, "get_venv_status"]
