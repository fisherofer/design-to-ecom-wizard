/**
 * API Budget Engine
 * =================
 * Tracks estimated spend per provider and per key, enforces a hard cap
 * (default $0 = free tier only) and exposes a React hook for live UI.
 *
 * Storage: localStorage `ai-os.budget.v1`.
 * Spend is *estimated* client-side from a per-model $ / 1k tokens table;
 * real numbers arrive from the backend when it's online.
 */
import { useEffect, useState } from "react";

const STORAGE_KEY = "ai-os.budget.v1";
const EVENT = "ai-os:budget-changed";

export interface BudgetCaps {
  /** Global monthly cap in USD (0 = free-only, refuse anything with cost). */
  globalUsd: number;
  /** Per-provider caps in USD. */
  perProviderUsd: Record<string, number>;
  /** Per-key caps in USD, keyed by ApiKey.id. */
  perKeyUsd: Record<string, number>;
  /** If true, block a request when its estimated cost would exceed the cap. */
  hardStop: boolean;
}

export interface BudgetUsage {
  /** month key like "2026-03" → spent USD */
  months: Record<string, {
    total: number;
    providers: Record<string, number>;
    keys: Record<string, number>;
  }>;
}

export interface BudgetState {
  caps: BudgetCaps;
  usage: BudgetUsage;
}

const DEFAULT: BudgetState = {
  caps: { globalUsd: 0, perProviderUsd: {}, perKeyUsd: {}, hardStop: true },
  usage: { months: {} },
};

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function read(): BudgetState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return {
      caps: { ...DEFAULT.caps, ...(parsed.caps ?? {}) },
      usage: { months: parsed.usage?.months ?? {} },
    };
  } catch {
    return DEFAULT;
  }
}

function write(next: BudgetState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const apiBudget = {
  get: read,
  setGlobal(usd: number) {
    const s = read();
    write({ ...s, caps: { ...s.caps, globalUsd: Math.max(0, usd) } });
  },
  setProvider(provider: string, usd: number) {
    const s = read();
    const per = { ...s.caps.perProviderUsd, [provider]: Math.max(0, usd) };
    write({ ...s, caps: { ...s.caps, perProviderUsd: per } });
  },
  setKey(keyId: string, usd: number) {
    const s = read();
    const per = { ...s.caps.perKeyUsd, [keyId]: Math.max(0, usd) };
    write({ ...s, caps: { ...s.caps, perKeyUsd: per } });
  },
  setHardStop(hard: boolean) {
    const s = read();
    write({ ...s, caps: { ...s.caps, hardStop: hard } });
  },
  record({ provider, keyId, usd }: { provider: string; keyId?: string; usd: number }) {
    const s = read();
    const mk = monthKey();
    const month = s.usage.months[mk] ?? { total: 0, providers: {}, keys: {} };
    month.total += usd;
    month.providers[provider] = (month.providers[provider] ?? 0) + usd;
    if (keyId) month.keys[keyId] = (month.keys[keyId] ?? 0) + usd;
    write({ ...s, usage: { months: { ...s.usage.months, [mk]: month } } });
  },
  /** Return true if a request with the given estimated cost is allowed. */
  canSpend({ provider, keyId, usd }: { provider: string; keyId?: string; usd: number }): {
    ok: boolean; reason?: string;
  } {
    const s = read();
    if (!s.caps.hardStop) return { ok: true };
    const mk = monthKey();
    const month = s.usage.months[mk] ?? { total: 0, providers: {}, keys: {} };
    const global = s.caps.globalUsd;
    if (global >= 0 && month.total + usd > global && global !== Infinity) {
      return { ok: false, reason: `global cap $${global} exceeded` };
    }
    const pCap = s.caps.perProviderUsd[provider];
    if (pCap !== undefined && (month.providers[provider] ?? 0) + usd > pCap) {
      return { ok: false, reason: `${provider} cap $${pCap} exceeded` };
    }
    if (keyId) {
      const kCap = s.caps.perKeyUsd[keyId];
      if (kCap !== undefined && (month.keys[keyId] ?? 0) + usd > kCap) {
        return { ok: false, reason: `key cap $${kCap} exceeded` };
      }
    }
    return { ok: true };
  },
  resetMonth(mk = monthKey()) {
    const s = read();
    const months = { ...s.usage.months };
    delete months[mk];
    write({ ...s, usage: { months } });
  },
  reset() {
    write(DEFAULT);
  },
};

export function useApiBudget(): BudgetState {
  const [s, setS] = useState<BudgetState>(() => read());
  useEffect(() => {
    const sync = () => setS(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return s;
}

export function currentMonthKey(): string {
  return monthKey();
}
