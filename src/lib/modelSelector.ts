/**
 * Smart Model Selector
 * ====================
 * Picks the best "chat/reasoning" model for a task by querying the provider's
 * live model list (via modelDiscovery) and scoring each candidate. Avoids the
 * common mistake of hardcoding an outdated model id (e.g. "gemini-1.5-flash")
 * and never selects image/audio/embedding-only models like Nano Banana or
 * Imagen.
 */
import { discoverModels, type DiscoveredModel, type ProviderId } from "./modelDiscovery";

export type Task = "chat" | "reasoning" | "code" | "vision";

// Model families we NEVER want to route text/reasoning through, even if the
// provider returns them in the listing.
const BLOCKLIST = [
  /nano-banana/i,      // image gen
  /imagen/i,           // image gen
  /dall-?e/i,          // image gen
  /whisper/i,          // audio
  /tts/i,              // audio
  /embed/i,            // embeddings
  /aqa/i,              // question answering (RAG-only)
  /tuned/i,            // user-tuned
  /vision-only/i,
  /^text-bison/i,      // legacy
];

function versionScore(id: string): number {
  // Prefer newer generations: 3.x > 2.x > 1.5 > 1.0.
  const m = id.match(/(\d+(?:\.\d+)?)/g);
  if (!m) return 0;
  return Math.max(...m.map((s) => parseFloat(s)));
}

function familyBonus(id: string, task: Task): number {
  const s = id.toLowerCase();
  if (task === "reasoning") {
    if (/\bpro\b|opus|o1|reasoner|thinking/.test(s)) return 30;
    if (/flash|sonnet|haiku|mini/.test(s)) return 10;
  }
  if (task === "chat") {
    if (/flash|mini|haiku|instant/.test(s)) return 20;
    if (/pro|opus/.test(s)) return 8;
  }
  if (task === "code") {
    if (/code|coder/.test(s)) return 25;
  }
  if (task === "vision") {
    if (/vision|multimodal/.test(s)) return 20;
  }
  // General: penalize experimental/preview slightly (still usable).
  if (/exp|preview|alpha|beta/.test(s)) return -3;
  // Latest-stable hints.
  if (/latest|stable/.test(s)) return 8;
  return 0;
}

export interface ModelChoice {
  id: string;
  provider: ProviderId;
  score: number;
  reason: string;
  source: "live" | "curated";
}

export function scoreModels(models: DiscoveredModel[], task: Task): ModelChoice[] {
  return models
    .filter((m) => !BLOCKLIST.some((rx) => rx.test(m.id)))
    .filter((m) => {
      // For non-vision tasks, exclude pure-image/embedding categories.
      if (task !== "vision" && (m.category === "image" || m.category === "embedding")) return false;
      return true;
    })
    .map((m) => {
      const v = versionScore(m.id);
      const bonus = familyBonus(m.id, task);
      const ctxBonus = m.contextWindow ? Math.min(15, Math.log10(m.contextWindow) * 3) : 0;
      const liveBonus = m.source === "live" ? 5 : 0;
      const score = v * 10 + bonus + ctxBonus + liveBonus;
      return {
        id: m.id,
        provider: m.provider,
        score: +score.toFixed(2),
        source: m.source,
        reason: `v${v} +family${bonus} +ctx${ctxBonus.toFixed(1)} +live${liveBonus}`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Query the provider live, then pick the top-scoring model for the task.
 * Falls back to the curated list if the live call fails.
 */
export async function selectBestModel(
  provider: ProviderId,
  apiKey: string,
  task: Task = "chat",
): Promise<ModelChoice | null> {
  const disc = await discoverModels(provider, apiKey);
  const scored = scoreModels(disc.models, task);
  return scored[0] ?? null;
}
