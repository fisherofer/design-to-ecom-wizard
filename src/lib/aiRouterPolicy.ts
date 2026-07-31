/**
 * aiRouterPolicy.ts — Smart AI Router policy layer.
 *
 * Maps a *task* (chat, reasoning, code, research, vision, embeddings) to an
 * ordered chain of gateway model ids, records every routing decision with its
 * latency/outcome, and derives live per-model reliability so the next decision
 * prefers whatever is actually working.
 *
 * Pure client state (localStorage) — no fabricated telemetry: metrics only
 * exist once a real route has been executed.
 */

export type RouterTask =
  | "chat"
  | "reasoning"
  | "code"
  | "research"
  | "vision"
  | "embeddings";

export type RouterMode = "auto" | "cost" | "quality" | "latency" | "manual";

export interface TaskPolicy {
  task: RouterTask;
  label: string;
  /** Ordered fallback chain of gateway model ids. */
  chain: string[];
  /** Tier hint forwarded to the server resolver. */
  tier: "light" | "default" | "heavy";
  temperature: number;
  maxTokens: number;
  description: string;
}

export interface RouteRecord {
  id: string;
  ts: string;
  task: RouterTask;
  mode: RouterMode;
  requestedModel: string;
  servedModel: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface ModelStat {
  model: string;
  calls: number;
  failures: number;
  avgLatencyMs: number;
  successRate: number;
  lastUsed: string | null;
}

const POLICY_KEY = "ai-os.router.policies.v1";
const LOG_KEY = "ai-os.router.log.v1";
const MODE_KEY = "ai-os.router.mode.v1";
const EVENT = "ai-os:router-changed";
const MAX_LOG = 200;

export const DEFAULT_POLICIES: TaskPolicy[] = [
  {
    task: "chat",
    label: "Conversation",
    chain: ["google/gemini-2.5-flash", "openai/gpt-5-mini", "google/gemini-2.5-flash-lite"],
    tier: "default",
    temperature: 0.7,
    maxTokens: 2048,
    description: "Everyday operator chat, summaries, quick Q&A.",
  },
  {
    task: "reasoning",
    label: "Deep Reasoning",
    chain: ["google/gemini-2.5-pro", "openai/gpt-5", "google/gemini-2.5-flash"],
    tier: "heavy",
    temperature: 0.3,
    maxTokens: 8192,
    description: "Strategy synthesis, multi-step trade theses, risk trade-offs.",
  },
  {
    task: "code",
    label: "Code & Patches",
    chain: ["openai/gpt-5", "google/gemini-2.5-pro", "openai/gpt-5-mini"],
    tier: "heavy",
    temperature: 0.15,
    maxTokens: 8192,
    description: "Self-coding proposals, diff generation, backend patches.",
  },
  {
    task: "research",
    label: "Research & News",
    chain: ["google/gemini-2.5-flash", "google/gemini-2.5-pro"],
    tier: "default",
    temperature: 0.4,
    maxTokens: 4096,
    description: "News digestion, narrative extraction, sentiment scoring.",
  },
  {
    task: "vision",
    label: "Chart Vision",
    chain: ["google/gemini-2.5-pro", "google/gemini-2.5-flash"],
    tier: "heavy",
    temperature: 0.2,
    maxTokens: 4096,
    description: "Chart screenshots, pattern recognition, UI diagnostics.",
  },
  {
    task: "embeddings",
    label: "Embeddings / RAG",
    chain: ["google/gemini-2.5-flash-lite", "google/gemini-2.5-flash"],
    tier: "light",
    temperature: 0,
    maxTokens: 512,
    description: "Cheap bulk passes: tagging, dedup, similarity prep.",
  },
];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const aiRouter = {
  event: EVENT,

  policies(): TaskPolicy[] {
    const stored = readJson<TaskPolicy[]>(POLICY_KEY, []);
    if (!stored.length) return DEFAULT_POLICIES;
    // Merge so newly shipped tasks appear without wiping user edits.
    return DEFAULT_POLICIES.map((d) => stored.find((s) => s.task === d.task) ?? d);
  },

  policyFor(task: RouterTask): TaskPolicy {
    return this.policies().find((p) => p.task === task) ?? DEFAULT_POLICIES[0];
  },

  savePolicy(policy: TaskPolicy) {
    const next = this.policies().map((p) => (p.task === policy.task ? policy : p));
    writeJson(POLICY_KEY, next);
  },

  resetPolicies() {
    writeJson(POLICY_KEY, DEFAULT_POLICIES);
  },

  mode(): RouterMode {
    return readJson<RouterMode>(MODE_KEY, "auto");
  },

  setMode(mode: RouterMode) {
    writeJson(MODE_KEY, mode);
  },

  log(): RouteRecord[] {
    return readJson<RouteRecord[]>(LOG_KEY, []);
  },

  record(rec: Omit<RouteRecord, "id" | "ts">) {
    const entry: RouteRecord = {
      ...rec,
      id: `rt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: new Date().toISOString(),
    };
    writeJson(LOG_KEY, [entry, ...this.log()].slice(0, MAX_LOG));
    return entry;
  },

  clearLog() {
    writeJson(LOG_KEY, []);
  },

  stats(): ModelStat[] {
    const byModel = new Map<string, RouteRecord[]>();
    for (const r of this.log()) {
      const list = byModel.get(r.servedModel) ?? [];
      list.push(r);
      byModel.set(r.servedModel, list);
    }
    return [...byModel.entries()]
      .map(([model, recs]) => {
        const failures = recs.filter((r) => !r.ok).length;
        return {
          model,
          calls: recs.length,
          failures,
          avgLatencyMs: Math.round(
            recs.reduce((n, r) => n + r.latencyMs, 0) / Math.max(recs.length, 1),
          ),
          successRate: (recs.length - failures) / Math.max(recs.length, 1),
          lastUsed: recs[0]?.ts ?? null,
        };
      })
      .sort((a, b) => b.calls - a.calls);
  },
};

/**
 * Picks the model to attempt first for a task, honoring the router mode and
 * demoting models whose *observed* success rate has collapsed.
 */
export function decideModel(
  task: RouterTask,
  mode: RouterMode = aiRouter.mode(),
): { model: string; chain: string[]; reason: string } {
  const policy = aiRouter.policyFor(task);
  const stats = new Map(aiRouter.stats().map((s) => [s.model, s]));

  const scored = policy.chain.map((model, idx) => {
    const s = stats.get(model);
    // Chain order is the prior; observed data adjusts it.
    let score = 100 - idx * 12;
    let reason = `chain #${idx + 1}`;
    if (s && s.calls >= 3) {
      score += (s.successRate - 0.9) * 120;
      reason += ` · ${(s.successRate * 100).toFixed(0)}% ok`;
      if (mode === "latency") {
        score -= Math.min(s.avgLatencyMs / 100, 40);
        reason += ` · ${s.avgLatencyMs}ms`;
      }
    }
    if (mode === "cost" && idx === policy.chain.length - 1) {
      score += 25;
      reason += " · cheapest";
    }
    if (mode === "quality" && idx === 0) {
      score += 25;
      reason += " · strongest";
    }
    return { model, score, reason };
  });

  scored.sort((a, b) => b.score - a.score);
  const winner = mode === "manual" ? { model: policy.chain[0], reason: "manual pin" } : scored[0];
  return {
    model: winner.model,
    chain: scored.map((s) => s.model),
    reason: `${mode} · ${winner.reason}`,
  };
}
