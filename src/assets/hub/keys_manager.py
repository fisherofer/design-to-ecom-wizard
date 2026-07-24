# 24/07/2026, 14:00
"""
OFERTRADINGBOT - Secure API Keys Manager Module
Manages encrypted storage and status verification for all system API providers.
Root path is determined dynamically at runtime.
"""

import os
import json
import base64
from pathlib import Path
from typing import Dict, Optional

try:
    from cryptography.fernet import Fernet
except ImportError:
    raise RuntimeError("cryptography package is required for Fernet encryption in keys_manager.py")

# All known providers required across OFERTRADINGBOT architecture
KNOWN_PROVIDERS = [
    'gemini',
    'alpaca',
    'oauth',
    'ollama',
    'telegram',
    'custom',
    'groq',
    'alphavantage',
    'finnhub',
    'eodhd',
    'newsapi',
    'twelvedata',
    'openai',
    'claude',
    'perplexity'
]

def _get_root_dir() -> Path:
    """
    Calculates the dynamic root directory of the project at runtime.
    """
    return Path(__file__).resolve().parent.parent

def _get_fernet() -> Fernet:
    """
    Retrieves or generates the master Fernet encryption key.
    """
    root_dir = _get_root_dir()
    master_key_file = root_dir / ".master.key"
    if master_key_file.exists():
        with open(master_key_file, "rb") as f:
            key = f.read().strip()
    else:
        key = Fernet.generate_key()
        with open(master_key_file, "wb") as f:
            f.write(key)
    return Fernet(key)

def _get_storage_path() -> Path:
    """
    Returns path to encrypted key storage file.
    """
    return _get_root_dir() / ".keys.enc"

def _load_encrypted_store() -> Dict[str, str]:
    """
    Loads and decrypts all keys from storage.
    """
    storage_file = _get_storage_path()
    if not storage_file.exists():
        return {}
    
    try:
        fernet = _get_fernet()
        with open(storage_file, "rb") as f:
            encrypted_data = f.read()
        if not encrypted_data:
            return {}
        decrypted_bytes = fernet.decrypt(encrypted_data)
        return json.loads(decrypted_bytes.decode('utf-8'))
    except Exception as e:
        print(f"[KEYS_MANAGER ERROR] Failed to load key store: {e}")
        return {}

def _save_encrypted_store(store: Dict[str, str]) -> bool:
    """
    Encrypts and saves all keys to storage file.
    """
    try:
        fernet = _get_fernet()
        json_bytes = json.dumps(store).encode('utf-8')
        encrypted_bytes = fernet.encrypt(json_bytes)
        storage_file = _get_storage_path()
        with open(storage_file, "wb") as f:
            f.write(encrypted_bytes)
        return True
    except Exception as e:
        print(f"[KEYS_MANAGER ERROR] Failed to save key store: {e}")
        return False

def get_key_status() -> Dict[str, str]:
    """
    Returns status ('SET' or 'MISSING') for all known providers.
    Never exposes actual key values.
    """
    store = _load_encrypted_store()
    status_map = {}
    for provider in KNOWN_PROVIDERS:
        val = store.get(provider) or os.environ.get(f"{provider.upper()}_API_KEY") or os.environ.get(f"{provider.upper()}_KEY")
        if val and str(val).strip():
            status_map[provider] = 'SET'
        else:
            status_map[provider] = 'MISSING'
    return status_map

def set_key(provider: str, value: str) -> bool:
    """
    Encrypts and saves a key for the specified provider.
    """
    clean_provider = provider.lower().strip()
    clean_val = value.strip()
    if not clean_val:
        return delete_key(clean_provider)
    
    store = _load_encrypted_store()
    store[clean_provider] = clean_val
    return _save_encrypted_store(store)

def get_key(provider: str) -> Optional[str]:
    """
    Decrypts and returns key for internal backend usage.
    """
    clean_provider = provider.lower().strip()
    store = _load_encrypted_store()
    if clean_provider in store and store[clean_provider]:
        return store[clean_provider]
    
    env_key = os.environ.get(f"{clean_provider.upper()}_API_KEY") or os.environ.get(f"{clean_provider.upper()}_KEY")
    return env_key

def delete_key(provider: str) -> bool:
    """
    Removes key for specified provider.
    """
    clean_provider = provider.lower().strip()
    store = _load_encrypted_store()
    if clean_provider in store:
        del store[clean_provider]
        return _save_encrypted_store(store)
    return True

if __name__ == "__main__":
    print("=== TESTING KEYS MANAGER ===")
    print("Initial Key Statuses:")
    print(get_key_status())
    set_key("gemini", "TEST_GEMINI_SECRET_VAL")
    print("Status after setting Gemini:")
    print(get_key_status())
    print("Decrypted Gemini key test:", get_key("gemini"))
    delete_key("gemini")
    print("Status after deleting Gemini:")
    print(get_key_status())

# END CODE | סך הכל שורות: 168
