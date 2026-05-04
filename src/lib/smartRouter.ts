/**
 * Smart Router
 * ============
 * Picks the best API key for a given use-case based on tier (primary →
 * fallback → emergency), live rate-limit headroom, and cost (paid keys
 * deferred until free pool is exhausted).
 *
 * Pure function — no side effects beyond consulting rateLimits.snapshot().
 */
import type { ApiKey, UseCase } from "./api";
import { rateLimits, utilization } from "./rateLimits";

export interface RouteDecision {
  chosen: ApiKey | null;
  considered: { key: ApiKey; score: number; reason: string }[];
  reason: string;
}

const TIER_WEIGHT: Record<ApiKey["tier"], number> = {
  primary: 100,
  fallback: 60,
  emergency: 20,
  disabled: 0,
};

export function routeFor(
  keys: ApiKey[],
  useCase: UseCase,
  tokensNeeded = 0,
): RouteDecision {
  const eligible = keys.filter(
    (k) => k.tier !== "disabled" && k.status !== "err" && k.useCases.includes(useCase),
  );

  const scored = eligible.map((k) => {
    const snap = rateLimits.snapshot(k.id);
    const util = utilization(snap.rpmUsed, snap.budget.rpm || k.rpmLimit || 60);
    const dailyUtil = utilization(snap.rpdUsed, snap.budget.rpd);
    const headroom = 1 - Math.max(util, dailyUtil);

    let score = TIER_WEIGHT[k.tier] * headroom;
    let reason = `${k.tier} · ${(headroom * 100).toFixed(0)}% headroom`;

    // Penalize paid keys when free alternatives exist with headroom.
    if (k.paid) {
      score -= 25;
      reason += " · paid";
    }
    if (k.status === "warn") {
      score -= 10;
      reason += " · warn";
    }
    if (!rateLimits.canUse(k.id, tokensNeeded)) {
      score = -1;
      reason = "exhausted";
    }
    return { key: k, score, reason };
  });

  scored.sort((a, b) => b.score - a.score);
  const chosen = scored[0]?.score >= 0 ? scored[0].key : null;

  return {
    chosen,
    considered: scored,
    reason: chosen
      ? `Routed to ${chosen.provider} (${chosen.id}) — ${scored[0].reason}`
      : "All eligible keys exhausted or failing — manual intervention required.",
  };
}
