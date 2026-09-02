# -*- coding: utf-8 -*-
"""
OFERTRADINGBOT - Local SQL Vault on VENV / User Data
Manages local SQLite persistent storage (user_data/ofer_local_vault.db) for:
- Encrypted API Keys (Fernet 128-bit)
- User Profile & Preferences
- Trading & Risk Configurations
- Realtime Execution & Compliance Audit Logs
"""

import os
import json
import sqlite3
import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

def _get_db_path() -> Path:
    user_data_dir = Path(__file__).resolve().parent.parent / "user_data"
    user_data_dir.mkdir(parents=True, exist_ok=True)
    return user_data_dir / "ofer_local_vault.db"

def init_local_sql_db():
    """
    Initializes database tables if they do not exist.
    """
    db_path = _get_db_path()
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # 1. API Keys Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_api_keys (
            provider TEXT PRIMARY KEY,
            key_ciphertext TEXT NOT NULL,
            status TEXT DEFAULT 'SET',
            category TEXT DEFAULT 'GENERAL',
            is_free_tier INTEGER DEFAULT 0,
            metadata_json TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 2. User Profiles & Preferences Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id TEXT PRIMARY KEY,
            email TEXT,
            display_name TEXT,
            role TEXT DEFAULT 'TRADER_OWNER',
            preferences_json TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 3. User Trading Settings & Invariants
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_trading_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NOT NULL,
            category TEXT DEFAULT 'SYSTEM',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 4. Execution Audit Logs Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS execution_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            message TEXT NOT NULL,
            category TEXT DEFAULT 'SYSTEM',
            severity TEXT DEFAULT 'INFO',
            actor TEXT DEFAULT 'SYSTEM',
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()

# Auto-initialize tables
init_local_sql_db()

def get_connection():
    init_local_sql_db()
    return sqlite3.connect(str(_get_db_path()))

def save_key_to_sql(provider: str, key_ciphertext: str, category: str = "GENERAL", is_free_tier: bool = False, metadata: Optional[Dict[str, Any]] = None) -> bool:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        meta_str = json.dumps(metadata or {})
        cursor.execute("""
            INSERT INTO user_api_keys (provider, key_ciphertext, category, is_free_tier, metadata_json, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(provider) DO UPDATE SET
                key_ciphertext = excluded.key_ciphertext,
                category = excluded.category,
                is_free_tier = excluded.is_free_tier,
                metadata_json = excluded.metadata_json,
                updated_at = CURRENT_TIMESTAMP
        """, (provider, key_ciphertext, category, 1 if is_free_tier else 0, meta_str))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[SQL VAULT ERROR] save_key_to_sql: {e}")
        return False

def get_all_keys_from_sql() -> Dict[str, str]:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT provider, key_ciphertext FROM user_api_keys")
        rows = cursor.fetchall()
        conn.close()
        return {r[0]: r[1] for r in rows}
    except Exception as e:
        print(f"[SQL VAULT ERROR] get_all_keys_from_sql: {e}")
        return {}

def delete_key_from_sql(provider: str) -> bool:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_api_keys WHERE provider = ?", (provider,))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[SQL VAULT ERROR] delete_key_from_sql: {e}")
        return False

def save_user_profile(user_id: str, email: str, display_name: str, preferences: Dict[str, Any]) -> bool:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO user_profiles (user_id, email, display_name, preferences_json, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                email = excluded.email,
                display_name = excluded.display_name,
                preferences_json = excluded.preferences_json,
                updated_at = CURRENT_TIMESTAMP
        """, (user_id, email, display_name, json.dumps(preferences)))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[SQL VAULT ERROR] save_user_profile: {e}")
        return False

def get_user_profile(user_id: str = "default_user") -> Optional[Dict[str, Any]]:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT user_id, email, display_name, role, preferences_json, updated_at FROM user_profiles WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return {
                "user_id": row[0],
                "email": row[1],
                "display_name": row[2],
                "role": row[3],
                "preferences": json.loads(row[4] or "{}"),
                "updated_at": row[5]
            }
        return None
    except Exception as e:
        print(f"[SQL VAULT ERROR] get_user_profile: {e}")
        return None

def log_execution_to_sql(action: str, message: str, category: str = "SYSTEM", severity: str = "INFO", actor: str = "SYSTEM"):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO execution_audit_logs (action, message, category, severity, actor, timestamp)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (action, message, category, severity, actor))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[SQL VAULT ERROR] log_execution_to_sql: {e}")
