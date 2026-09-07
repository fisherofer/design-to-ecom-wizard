/**
 * secureVault — passphrase-encrypted at-rest storage for browser-held secrets.
 *
 * Replaces plaintext localStorage for API keys / credentials:
 *   • AES-GCM 256 with a key derived from the operator passphrase (PBKDF2-SHA256, 250k iters)
 *   • Only the ciphertext is persisted; plaintext exists in memory while unlocked
 *   • Locking (manual, idle auto-lock, reload) wipes the in-memory copy
 *
 * Consumers use `getSection`/`setSection` synchronously; persistence is async
 * and fire-and-forget. When the vault is OFF, callers fall back to their own
 * legacy localStorage keys (kept for backwards compatibility).
 */

const BLOB_KEY = "ofer.secureVault.v1";
export const VAULT_EVENT = "ofer:secure-vault-changed";
const ITERATIONS = 250_000;

export type VaultStatus = "off" | "locked" | "unlocked";

interface VaultBlob {
  v: 1;
  salt: string; // base64
  iv: string; // base64
  ct: string; // base64
  createdAt: string;
  updatedAt: string;
  sections: string[];
}

type VaultData = Record<string, unknown>;

let memKey: CryptoKey | null = null;
let memData: VaultData | null = null;

const b64 = {
  enc(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  },
  dec(s: string): Uint8Array {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

function readBlob(): VaultBlob | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(BLOB_KEY);
    return raw ? (JSON.parse(raw) as VaultBlob) : null;
  } catch {
    return null;
  }
}

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(VAULT_EVENT));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function persist(salt: Uint8Array, key: CryptoKey, data: VaultData, createdAt?: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(data)),
  );
  const now = new Date().toISOString();
  const blob: VaultBlob = {
    v: 1,
    salt: b64.enc(salt),
    iv: b64.enc(iv),
    ct: b64.enc(ct),
    createdAt: createdAt ?? now,
    updatedAt: now,
    sections: Object.keys(data),
  };
  localStorage.setItem(BLOB_KEY, JSON.stringify(blob));
  emit();
}

let currentSalt: Uint8Array | null = null;
let currentCreatedAt: string | undefined;

function flush() {
  if (!memKey || !memData || !currentSalt) return;
  void persist(currentSalt, memKey, memData, currentCreatedAt);
}

export const secureVault = {
  EVENT: VAULT_EVENT,

  status(): VaultStatus {
    if (!readBlob()) return "off";
    return memKey && memData ? "unlocked" : "locked";
  },

  info(): { createdAt?: string; updatedAt?: string; sections: string[] } {
    const b = readBlob();
    return { createdAt: b?.createdAt, updatedAt: b?.updatedAt, sections: b?.sections ?? [] };
  },

  isUnlocked(): boolean {
    return this.status() === "unlocked";
  },

  /** Create the vault, importing (and erasing) the given plaintext localStorage keys. */
  async enable(passphrase: string, migrateKeys: string[] = []): Promise<{ ok: boolean; detail: string }> {
    if (passphrase.length < 8) return { ok: false, detail: "Passphrase must be at least 8 characters." };
    if (readBlob()) return { ok: false, detail: "Vault already exists — unlock it instead." };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    const data: VaultData = {};
    let migrated = 0;
    for (const k of migrateKeys) {
      const raw = localStorage.getItem(k);
      if (raw == null) continue;
      try {
        data[k] = JSON.parse(raw);
      } catch {
        data[k] = raw;
      }
      localStorage.removeItem(k);
      migrated += 1;
    }
    currentSalt = salt;
    currentCreatedAt = undefined;
    memKey = key;
    memData = data;
    await persist(salt, key, data);
    return { ok: true, detail: `Vault created — ${migrated} secret store(s) encrypted and removed from plain storage.` };
  },

  async unlock(passphrase: string): Promise<{ ok: boolean; detail: string }> {
    const blob = readBlob();
    if (!blob) return { ok: false, detail: "No vault configured." };
    try {
      const salt = b64.dec(blob.salt);
      const key = await deriveKey(passphrase, salt);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64.dec(blob.iv) as unknown as BufferSource },
        key,
        b64.dec(blob.ct) as unknown as BufferSource,
      );
      memKey = key;
      memData = JSON.parse(new TextDecoder().decode(plain)) as VaultData;
      currentSalt = salt;
      currentCreatedAt = blob.createdAt;
      emit();
      return { ok: true, detail: "Vault unlocked." };
    } catch {
      return { ok: false, detail: "Wrong passphrase — vault stays locked." };
    }
  },

  lock() {
    memKey = null;
    memData = null;
    currentSalt = null;
    emit();
  },

  /** Decrypt and write everything back as plaintext localStorage, then delete the vault. */
  async disable(passphrase: string): Promise<{ ok: boolean; detail: string }> {
    const res = await this.unlock(passphrase);
    if (!res.ok) return res;
    for (const [k, v] of Object.entries(memData ?? {})) {
      localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    localStorage.removeItem(BLOB_KEY);
    this.lock();
    return { ok: true, detail: "Vault removed — secrets restored to plain browser storage." };
  },

  async changePassphrase(oldPass: string, newPass: string): Promise<{ ok: boolean; detail: string }> {
    if (newPass.length < 8) return { ok: false, detail: "New passphrase must be at least 8 characters." };
    const res = await this.unlock(oldPass);
    if (!res.ok) return res;
    const data = memData ?? {};
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(newPass, salt);
    memKey = key;
    currentSalt = salt;
    await persist(salt, key, data, currentCreatedAt);
    return { ok: true, detail: "Passphrase changed." };
  },

  /** Synchronous read of a section. Returns null when the vault is off or locked. */
  getSection<T>(name: string): T | null {
    if (!memData) return null;
    return (memData[name] as T) ?? null;
  },

  /** Synchronous write; encryption is flushed asynchronously. */
  setSection(name: string, value: unknown): boolean {
    if (!memData) return false;
    memData[name] = value;
    flush();
    return true;
  },
};

/** React helper. */
import { useEffect, useState } from "react";

export function useVaultStatus(): VaultStatus {
  const [s, setS] = useState<VaultStatus>("off");
  useEffect(() => {
    const sync = () => setS(secureVault.status());
    sync();
    window.addEventListener(VAULT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(VAULT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return s;
}
