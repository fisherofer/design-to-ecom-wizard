# hub/wallet_manager.py
"""
Payout wallets for the growth treasury.

The system NEVER holds private keys. The owner registers watch-only addresses
(TON from the Telegram wallet, plus BTC / ETH / SOL if wanted) and the system
reads the public chain to confirm real incoming funds.

Balances come from public explorers only. If an explorer is unreachable the
balance is reported as unavailable — never guessed, never cached as truth.

Note on Google: Google Wallet has no cryptocurrency support, so it cannot be
used for mining payouts. It is intentionally not offered here.
"""
from __future__ import annotations

import json
import re
import time
import urllib.request
from typing import Any

from hub import local_store

WALLETS_KEY = "payout_wallets"
HTTP_TIMEOUT = 12

CHAINS: dict[str, dict[str, Any]] = {
    "ton": {
        "label": "TON (Telegram Wallet)",
        "decimals": 9,
        "symbol": "TON",
        "pattern": r"^(?:[EU]Q[A-Za-z0-9_-]{46}|0:[0-9a-fA-F]{64})$",
        "hint": "Telegram → Wallet → Receive → copy your TON address",
    },
    "btc": {"label": "Bitcoin", "decimals": 8, "symbol": "BTC",
            "pattern": r"^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$", "hint": "any BTC receive address"},
    "eth": {"label": "Ethereum / EVM", "decimals": 18, "symbol": "ETH",
            "pattern": r"^0x[a-fA-F0-9]{40}$", "hint": "any EVM receive address"},
    "sol": {"label": "Solana", "decimals": 9, "symbol": "SOL",
            "pattern": r"^[1-9A-HJ-NP-Za-km-z]{32,44}$", "hint": "any Solana receive address"},
}


def _get(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "ofer-wallets"})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as res:
        return json.loads(res.read().decode("utf-8"))


def _wallets() -> list[dict[str, Any]]:
    stored = local_store.kv_get("system", WALLETS_KEY)
    return (stored.get("value") or []) if stored.get("found") else []


def _save(wallets: list[dict[str, Any]]) -> None:
    local_store.kv_set("system", WALLETS_KEY, wallets)


def validate(chain: str, address: str) -> dict[str, Any]:
    spec = CHAINS.get(chain)
    if not spec:
        return {"ok": False, "error": f"unsupported chain: {chain}"}
    if not re.match(spec["pattern"], address.strip()):
        return {"ok": False, "error": f"address does not look like a valid {spec['label']} address"}
    return {"ok": True}


def add_wallet(chain: str, address: str, label: str = "", make_default: bool = False) -> dict[str, Any]:
    check = validate(chain, address)
    if not check["ok"]:
        return check
    address = address.strip()
    wallets = [w for w in _wallets() if not (w["chain"] == chain and w["address"] == address)]
    if make_default or not wallets:
        for w in wallets:
            w["default"] = False
    wallets.append({
        "chain": chain, "address": address, "label": label or CHAINS[chain]["label"],
        "default": bool(make_default or not wallets), "added_at": time.time(),
    })
    _save(wallets)
    local_store.log_event("wallets", f"wallet registered on {chain}", "info")
    return {"ok": True, "wallets": wallets}


def remove_wallet(chain: str, address: str) -> dict[str, Any]:
    wallets = [w for w in _wallets() if not (w["chain"] == chain and w["address"] == address)]
    if wallets and not any(w.get("default") for w in wallets):
        wallets[0]["default"] = True
    _save(wallets)
    return {"ok": True, "wallets": wallets}


def set_default(chain: str, address: str) -> dict[str, Any]:
    wallets = _wallets()
    for w in wallets:
        w["default"] = w["chain"] == chain and w["address"] == address
    _save(wallets)
    return {"ok": True, "wallets": wallets}


# ------------------------------------------------------------------ balances
def _balance(chain: str, address: str) -> dict[str, Any]:
    try:
        if chain == "ton":
            data = _get(f"https://toncenter.com/api/v2/getAddressBalance?address={address}")
            if not data.get("ok"):
                return {"ok": False, "error": data.get("error") or "toncenter rejected the request"}
            return {"ok": True, "raw": int(data["result"]), "amount": int(data["result"]) / 1e9, "symbol": "TON"}
        if chain == "btc":
            data = _get(f"https://blockstream.info/api/address/{address}")
            funded = data["chain_stats"]["funded_txo_sum"] - data["chain_stats"]["spent_txo_sum"]
            return {"ok": True, "raw": funded, "amount": funded / 1e8, "symbol": "BTC"}
        if chain == "eth":
            data = _get(f"https://eth.blockscout.com/api/v2/addresses/{address}")
            wei = int(data.get("coin_balance") or 0)
            return {"ok": True, "raw": wei, "amount": wei / 1e18, "symbol": "ETH"}
        if chain == "sol":
            req = urllib.request.Request(
                "https://api.mainnet-beta.solana.com",
                data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "getBalance",
                                 "params": [address]}).encode(),
                headers={"content-type": "application/json", "User-Agent": "ofer-wallets"},
            )
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as res:
                data = json.loads(res.read().decode())
            lamports = int(data["result"]["value"])
            return {"ok": True, "raw": lamports, "amount": lamports / 1e9, "symbol": "SOL"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
    return {"ok": False, "error": f"unsupported chain: {chain}"}


def list_wallets(with_balance: bool = True) -> dict[str, Any]:
    wallets = _wallets()
    out = []
    for w in wallets:
        entry = dict(w)
        entry["balance"] = _balance(w["chain"], w["address"]) if with_balance else None
        out.append(entry)
    return {"ok": True, "chains": CHAINS, "wallets": out,
            "note": "Watch-only. The system never stores a private key or seed phrase."}


def record_receipt(chain: str, address: str, amount: float, note: str = "") -> dict[str, Any]:
    """Log a confirmed on-chain payout into the treasury ledger."""
    if amount <= 0:
        return {"ok": False, "error": "amount must be positive"}
    symbol = CHAINS.get(chain, {}).get("symbol", chain.upper())
    return local_store.add_ledger_entry(
        f"mining:{chain}", amount, symbol, note or f"payout to {address[:10]}…", None
    )
