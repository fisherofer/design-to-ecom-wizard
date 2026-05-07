/**
 * modelFilters.ts — Policy engine for filtering discovered models.
 * Supports geo-block, license allowlist, minimum AI-recommendation score,
 * minimum community signal (downloads/likes), and gated-model handling.
 */
import type { HubModel } from "./modelHub";

export interface FilterPolicy {
  blockedOrigins: string[];      // e.g. ["CN"]
  allowedLicenses: string[];     // empty = allow all
  minDownloads: number;
  minLikes: number;
  minAiScore: number;            // 0–100, applied if scores known
  blockGated: boolean;
}

export const DEFAULT_POLICY: FilterPolicy = {
  blockedOrigins: ["CN"],
  allowedLicenses: [],
  minDownloads: 1000,
  minLikes: 5,
  minAiScore: 60,
  blockGated: false,
};

const KEY = "modelFilters.policy";

export function loadPolicy(): FilterPolicy {
  if (typeof localStorage === "undefined") return DEFAULT_POLICY;
  try { return { ...DEFAULT_POLICY, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; }
  catch { return DEFAULT_POLICY; }
}

export function savePolicy(p: FilterPolicy) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(p));
}

export interface FilterResult {
  model: HubModel;
  passed: boolean;
  reasons: string[];
  aiScore: number;
}

/** Heuristic AI-score: combines popularity, license clarity, and origin trust. */
export function scoreModel(m: HubModel): number {
  const pop = Math.min(60, Math.log10((m.downloads ?? 1) + 1) * 10);
  const liked = Math.min(15, Math.log10((m.likes ?? 1) + 1) * 6);
  const lic = m.license && !/other|unknown/i.test(m.license) ? 10 : 0;
  const origin = m.origin === "CN" ? 0 : m.origin === "??" ? 5 : 15;
  return Math.round(pop + liked + lic + origin);
}

export function applyPolicy(models: HubModel[], policy: FilterPolicy): FilterResult[] {
  return models.map((m) => {
    const reasons: string[] = [];
    if (policy.blockedOrigins.includes(m.origin ?? "??")) reasons.push(`origin:${m.origin}`);
    if (policy.allowedLicenses.length && !policy.allowedLicenses.includes(m.license ?? "")) reasons.push("license");
    if ((m.downloads ?? 0) < policy.minDownloads) reasons.push("downloads<min");
    if ((m.likes ?? 0) < policy.minLikes) reasons.push("likes<min");
    if (policy.blockGated && m.gated) reasons.push("gated");
    const aiScore = scoreModel(m);
    if (aiScore < policy.minAiScore) reasons.push(`score<${policy.minAiScore}`);
    return { model: m, passed: reasons.length === 0, reasons, aiScore };
  });
}
