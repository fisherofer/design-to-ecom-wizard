/**
 * Multi-key vault — stores an array of API keys per provider with a rotation
 * cursor so callers can round-robin between keys when one hits rate-limits.
 * Values never leave the browser, and when the encrypted secret vault is
 * enabled they are held only inside it (AES-GCM at rest, plaintext in memory
 * while unlocked). Locked vault ⇒ no keys are readable or writable.
 */
import type { ProviderId } from "./modelDiscovery";
import { secureVault, VAULT_EVENT } from "./secureVault";

const KEY = "ai-os.settings.providerKeyVault.v1";
const EVENT = "ai-os:provider-key-vault-changed";

export const PROVIDER_KEY_STORE = KEY;

export type KeyStatus = "active" | "exhausted" | "invalid";

export interface StoredKey {
  id: string;
  value: string;
  label?: string;
  status: KeyStatus;
  addedAt: string;
  lastUsedAt?: string;
  lastError?: string;
}

interface VaultState {
  keys: Partial<Record<ProviderId, StoredKey[]>>;
  cursor: Partial<Record<ProviderId, number>>;
}

const empty = (): VaultState => ({ keys: {}, cursor: {} });

function read(): VaultState {
  if (typeof window === "undefined") return empty();
  const status = secureVault.status();
  if (status !== "off") {
    return status === "unlocked" ? (secureVault.getSection<VaultState>(KEY) ?? empty()) : empty();
  }
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "") as VaultState;
  } catch {
    return empty();
  }
}

function write(state: VaultState) {
  if (typeof window === "undefined") return;
  if (secureVault.status() !== "off") {
    secureVault.setSection(KEY, state);
  } else {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

if (typeof window !== "undefined") {
  // Unlock / lock changes what is readable — let subscribers refresh.
  window.addEventListener(VAULT_EVENT, () => window.dispatchEvent(new CustomEvent(EVENT)));
}


function newId() {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const keyVault = {
  EVENT,
  list(provider: ProviderId): StoredKey[] {
    return read().keys[provider] ?? [];
  },
  all(): VaultState {
    return read();
  },
  add(provider: ProviderId, value: string, label?: string): StoredKey | null {
    const v = value.trim();
    if (!v) return null;
    const state = read();
    const list = state.keys[provider] ?? [];
    if (list.some((k) => k.value === v)) return null; // dedupe
    const item: StoredKey = { id: newId(), value: v, label, status: "active", addedAt: new Date().toISOString() };
    state.keys[provider] = [...list, item];
    write(state);
    return item;
  },
  /** Bulk-add many keys (paste block or file import). Returns count added. */
  addMany(provider: ProviderId, raw: string): { added: number; skipped: number } {
    const parts = raw
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 6); // minimal sanity
    let added = 0;
    let skipped = 0;
    for (const p of parts) {
      if (this.add(provider, p)) added++;
      else skipped++;
    }
    return { added, skipped };
  },
  remove(provider: ProviderId, id: string) {
    const state = read();
    state.keys[provider] = (state.keys[provider] ?? []).filter((k) => k.id !== id);
    write(state);
  },
  clear(provider: ProviderId) {
    const state = read();
    delete state.keys[provider];
    delete state.cursor[provider];
    write(state);
  },
  markStatus(provider: ProviderId, id: string, status: KeyStatus, error?: string) {
    const state = read();
    state.keys[provider] = (state.keys[provider] ?? []).map((k) =>
      k.id === id ? { ...k, status, lastError: error, lastUsedAt: new Date().toISOString() } : k,
    );
    write(state);
  },
  /** Round-robin over active keys. */
  next(provider: ProviderId): StoredKey | null {
    const state = read();
    const active = (state.keys[provider] ?? []).filter((k) => k.status === "active");
    if (active.length === 0) return null;
    const cur = state.cursor[provider] ?? 0;
    const pick = active[cur % active.length];
    state.cursor[provider] = (cur + 1) % active.length;
    write(state);
    return pick;
  },
  /** Any usable key across the given providers. Returns first found. */
  anyActive(providers: ProviderId[]): { provider: ProviderId; key: StoredKey } | null {
    for (const p of providers) {
      const k = this.next(p);
      if (k) return { provider: p, key: k };
    }
    return null;
  },
};
