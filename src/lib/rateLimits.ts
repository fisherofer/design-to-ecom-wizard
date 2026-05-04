/**
 * Rate Limits Engine
 * ==================
 * Tracks per-key budgets across three windows: per-minute (rpm), per-day (rpd),
 * and per-day token budget (tpd). State lives in localStorage so the Smart Router
 * can read it across reloads and tabs.
 *
 * One responsibility: counters + budgets. No routing logic here.
 */

export type LimitWindow = "minute" | "day";

export interface KeyBudget {
  rpm: number;   // requests per minute
  rpd: number;   // requests per day
  tpd: number;   // tokens per day
}

export interface KeyUsageSnapshot {
  rpmUsed: number;
  rpdUsed: number;
  tpdUsed: number;
  rpmReset: number; // epoch ms
  rpdReset: number;
}

interface UsageRecord extends KeyUsageSnapshot {
  budget: KeyBudget;
  history: { ts: number; tokens: number }[]; // last 60 events for sparkline
}

const STORAGE = "ai-os.rateLimits.v1";

function load(): Record<string, UsageRecord> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
  } catch {
    return {};
  }
}

function save(data: Record<string, UsageRecord>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE, JSON.stringify(data));
}

function fresh(budget: KeyBudget): UsageRecord {
  const now = Date.now();
  return {
    rpmUsed: 0,
    rpdUsed: 0,
    tpdUsed: 0,
    rpmReset: now + 60_000,
    rpdReset: now + 86_400_000,
    budget,
    history: [],
  };
}

function rotate(rec: UsageRecord): UsageRecord {
  const now = Date.now();
  if (now >= rec.rpmReset) {
    rec.rpmUsed = 0;
    rec.rpmReset = now + 60_000;
  }
  if (now >= rec.rpdReset) {
    rec.rpdUsed = 0;
    rec.tpdUsed = 0;
    rec.rpdReset = now + 86_400_000;
  }
  return rec;
}

export const rateLimits = {
  setBudget(keyId: string, budget: KeyBudget): void {
    const all = load();
    const existing = all[keyId];
    all[keyId] = existing ? { ...existing, budget } : fresh(budget);
    save(all);
  },

  snapshot(keyId: string): KeyUsageSnapshot & { budget: KeyBudget } {
    const all = load();
    const rec = rotate(all[keyId] ?? fresh({ rpm: 60, rpd: 1500, tpd: 1_000_000 }));
    all[keyId] = rec;
    save(all);
    return {
      rpmUsed: rec.rpmUsed,
      rpdUsed: rec.rpdUsed,
      tpdUsed: rec.tpdUsed,
      rpmReset: rec.rpmReset,
      rpdReset: rec.rpdReset,
      budget: rec.budget,
    };
  },

  /** True if this key still has headroom in every window. */
  canUse(keyId: string, tokensNeeded = 0): boolean {
    const s = rateLimits.snapshot(keyId);
    return (
      s.rpmUsed < s.budget.rpm &&
      s.rpdUsed < s.budget.rpd &&
      s.tpdUsed + tokensNeeded <= s.budget.tpd
    );
  },

  /** Record a request after it executes. */
  record(keyId: string, tokens = 0): void {
    const all = load();
    const rec = rotate(all[keyId] ?? fresh({ rpm: 60, rpd: 1500, tpd: 1_000_000 }));
    rec.rpmUsed += 1;
    rec.rpdUsed += 1;
    rec.tpdUsed += tokens;
    rec.history.push({ ts: Date.now(), tokens });
    if (rec.history.length > 60) rec.history.shift();
    all[keyId] = rec;
    save(all);
  },

  history(keyId: string): { ts: number; tokens: number }[] {
    return load()[keyId]?.history ?? [];
  },

  all(): Record<string, UsageRecord> {
    return load();
  },

  reset(keyId?: string): void {
    if (!keyId) return save({});
    const all = load();
    delete all[keyId];
    save(all);
  },
};

export function utilization(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(1, used / limit);
}

export function levelFor(util: number): "ok" | "warn" | "danger" {
  if (util >= 0.9) return "danger";
  if (util >= 0.7) return "warn";
  return "ok";
}
