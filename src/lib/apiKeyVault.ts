/**
 * Multi-key vault — stores an array of API keys per provider in localStorage
 * with a rotation cursor so callers can round-robin between keys when one
 * hits rate-limits / quota. Values never leave the browser.
 */
import type { ProviderId } from "./modelDiscovery";

const KEY = "ai-os.settings.providerKeyVault.v1";
const EVENT = "ai-os:provider-key-vault-changed";

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

function read(): VaultState {
  if (typeof window === "undefined") return { keys: {}, cursor: {} };
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "") as VaultState;
  } catch {
    return { keys: {}, cursor: {} };
  }
}

function write(state: VaultState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(EVENT));
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
