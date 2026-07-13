/**
 * aiModels.server — resolves the best supported chat model from Lovable AI
 * Gateway at runtime, so we never hardcode an id the gateway will reject.
 *
 * Strategy:
 *   1. On first call, GET /v1/models (5-min cache) with LOVABLE_API_KEY.
 *   2. Filter to a curated allowlist (per Lovable model catalog docs).
 *   3. Pick a model by task tier — 'light' | 'default' | 'heavy'.
 *   4. If the network probe fails, fall back to the static default.
 */

type Tier = "light" | "default" | "heavy";

// Curated by tier; ordered by preference. Every id below is in the
// Lovable AI catalog (ai-models-chat) at time of writing.
const CATALOG: Record<Tier, string[]> = {
  light: [
    "google/gemini-3.1-flash-lite",
    "google/gemini-2.5-flash-lite",
    "google/gemini-3-flash-preview",
    "openai/gpt-5-nano",
  ],
  default: [
    "google/gemini-3-flash-preview",
    "google/gemini-3.5-flash",
    "google/gemini-2.5-flash",
    "openai/gpt-5-mini",
  ],
  heavy: [
    "google/gemini-3.1-pro-preview",
    "google/gemini-2.5-pro",
    "openai/gpt-5.5",
    "openai/gpt-5.4",
    "anthropic/claude-sonnet-4.5",
  ],
};

const HARD_FALLBACK = "google/gemini-3-flash-preview";
const CACHE_MS = 5 * 60_000;

let cache: { at: number; ids: Set<string> } | null = null;

async function fetchSupportedIds(apiKey: string): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ids;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/models", {
      headers: {
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });
    if (!r.ok) throw new Error(`gateway ${r.status}`);
    const j = (await r.json()) as { data?: Array<{ id: string }> };
    const ids = new Set((j.data ?? []).map((m) => m.id));
    cache = { at: Date.now(), ids };
    return ids;
  } catch {
    // Fail-open: return empty set → caller uses first curated candidate.
    cache = { at: Date.now(), ids: new Set() };
    return cache.ids;
  }
}

/** Pick the best available model for the given task tier. */
export async function resolveModel(tier: Tier = "default"): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return CATALOG[tier][0] ?? HARD_FALLBACK;
  const supported = await fetchSupportedIds(key);
  if (supported.size === 0) return CATALOG[tier][0] ?? HARD_FALLBACK;
  for (const id of CATALOG[tier]) {
    if (supported.has(id)) return id;
  }
  // Nothing curated is live — fall back to any listed model that matches tier hints.
  const pattern =
    tier === "heavy" ? /pro|gpt-5\.[45]|sonnet/i : tier === "light" ? /lite|nano/i : /flash|mini/i;
  const match = [...supported].find((id) => pattern.test(id));
  return match ?? HARD_FALLBACK;
}

/** Heuristic: choose a tier from a rough context-size / difficulty signal. */
export function tierFor(opts: { inputChars?: number; difficulty?: "low" | "medium" | "high" }): Tier {
  if (opts.difficulty === "high" || (opts.inputChars ?? 0) > 12_000) return "heavy";
  if (opts.difficulty === "low" && (opts.inputChars ?? 0) < 2_000) return "light";
  return "default";
}
