/**
 * Compute Router
 * ==============
 * Smart engine that decides whether a given task should run on:
 *   - "local"  → Ollama / on-device model  (free, private, may be weaker)
 *   - "cloud"  → external API (paid or free-tier, stronger, rate-limited)
 *   - "hybrid" → local drafts + cloud verifies (best quality, ~1.3× cost)
 *
 * The decision blends 5 signals:
 *   1. Task profile           (chat / reasoning / code / vision / trading)
 *   2. Policy mode            (auto / local_first / cloud_first / cost_saver / quality_max / offline)
 *   3. Budget headroom        (apiBudget cap vs. spent, per provider)
 *   4. Latency & availability (local online? cloud rate-limit headroom?)
 *   5. Sensitivity            (private / market_data / public)
 *
 * Pure frontend engine — no network calls. Explains every decision so the
 * UI can render a "why this route?" trace.
 */
import { useEffect, useState } from "react";
import { apiBudget, useApiBudget } from "./apiBudget";

const STORAGE_KEY = "ai-os.compute-router.v1";
const EVENT = "ai-os:compute-router-changed";

export type ComputeMode = "local" | "cloud" | "hybrid";
export type PolicyMode =
  | "auto"          // engine picks per task
  | "local_first"   // prefer local, cloud only when local is unfit
  | "cloud_first"   // prefer cloud, local as failover
  | "cost_saver"    // never use cloud if budget < threshold
  | "quality_max"   // always hybrid when both are available
  | "offline";      // hard force local

export type TaskProfile =
  | "chat"
  | "reasoning"
  | "code"
  | "vision"
  | "trading_signal"
  | "summarize"
  | "translate";

export type Sensitivity = "public" | "market_data" | "private";

export interface RouterPolicy {
  mode: PolicyMode;
  /** Reserve at least this % of the monthly cap before allowing cloud (0..1). */
  minBudgetHeadroom: number;
  /** Prefer hybrid when cloud budget is healthy and task benefits from verification. */
  enableHybrid: boolean;
  /** Estimated $ per 1k tokens on cloud (used for cost projection). */
  cloudCostPer1k: number;
  /** Assumed local latency (ms) — used vs cloudLatency for the routing score. */
  localLatencyMs: number;
  /** Assumed cloud latency (ms). */
  cloudLatencyMs: number;
  /** If local engine is offline, still show the recommendation but flag it. */
  markLocalOfflineAsFail: boolean;
  /** Per-task override: force a specific mode. */
  perTask: Partial<Record<TaskProfile, ComputeMode | "auto">>;
}

const DEFAULT_POLICY: RouterPolicy = {
  mode: "auto",
  minBudgetHeadroom: 0.15,
  enableHybrid: true,
  cloudCostPer1k: 0.0025,
  localLatencyMs: 350,
  cloudLatencyMs: 800,
  markLocalOfflineAsFail: true,
  perTask: {},
};

export interface RuntimeSignals {
  /** Local engine reachable (Ollama /health etc). */
  localOnline: boolean;
  /** Cloud provider reachable & under rate limit. */
  cloudAvailable: boolean;
  /** Cloud rate-limit headroom (0..1). */
  cloudHeadroom: number;
  /** Preferred cloud provider id for the current session (used only in traces). */
  cloudProvider?: string;
}

const DEFAULT_SIGNALS: RuntimeSignals = {
  localOnline: true,
  cloudAvailable: true,
  cloudHeadroom: 1,
  cloudProvider: "gemini",
};

// -------------------- storage --------------------

function read(): RouterPolicy {
  if (typeof window === "undefined") return DEFAULT_POLICY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_POLICY;
    return { ...DEFAULT_POLICY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_POLICY;
  }
}

function write(next: RouterPolicy) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const computeRouter = {
  get: read,
  set(patch: Partial<RouterPolicy>) {
    write({ ...read(), ...patch });
  },
  setPerTask(task: TaskProfile, mode: ComputeMode | "auto") {
    const p = read();
    write({ ...p, perTask: { ...p.perTask, [task]: mode } });
  },
  reset() {
    write(DEFAULT_POLICY);
  },
};

// -------------------- decision --------------------

export interface RouteInput {
  task: TaskProfile;
  sensitivity?: Sensitivity;
  estTokens?: number;
  signals?: Partial<RuntimeSignals>;
  /** Optional cloud provider id for budget lookup. */
  provider?: string;
}

export interface RouteResult {
  mode: ComputeMode;
  confidence: number;         // 0..1
  estCostUsd: number;
  estLatencyMs: number;
  reason: string;             // short human-readable
  trace: string[];            // ordered decision log
  policy: PolicyMode;
  budget: { spent: number; cap: number; headroom: number };
  fallback?: ComputeMode;     // secondary if primary fails
}

const TASK_DEFAULTS: Record<TaskProfile, ComputeMode> = {
  chat: "local",
  reasoning: "cloud",
  code: "hybrid",
  vision: "cloud",
  trading_signal: "hybrid",
  summarize: "local",
  translate: "local",
};

const TASK_QUALITY_BENEFIT: Record<TaskProfile, number> = {
  chat: 0.1,
  reasoning: 0.6,
  code: 0.5,
  vision: 0.7,
  trading_signal: 0.65,
  summarize: 0.15,
  translate: 0.1,
};

export function decideRoute(input: RouteInput, policy: RouterPolicy = read()): RouteResult {
  const trace: string[] = [];
  const signals: RuntimeSignals = { ...DEFAULT_SIGNALS, ...(input.signals ?? {}) };
  const provider = input.provider ?? signals.cloudProvider ?? "gemini";
  const tokens = Math.max(0, input.estTokens ?? 800);
  const estCostCloud = (tokens / 1000) * policy.cloudCostPer1k;

  // Budget context
  const state = apiBudget.get();
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthUsage = state.usage.months[monthKey]?.total ?? 0;
  const cap = state.caps.perProviderUsd[provider] || state.caps.globalUsd || 0;
  const headroom = cap > 0 ? Math.max(0, 1 - monthUsage / cap) : cap === 0 ? 0 : 1;
  const budget = { spent: monthUsage, cap, headroom };
  trace.push(
    `budget: spent $${monthUsage.toFixed(2)} / cap $${cap.toFixed(2)} → headroom ${(headroom * 100).toFixed(0)}%`,
  );

  // Sensitivity: private → force local
  if (input.sensitivity === "private") {
    trace.push("sensitivity=private → force LOCAL");
    return finalize("local", 0.95, 0, policy.localLatencyMs, "Private data — local only.");
  }

  // Policy hard overrides
  if (policy.mode === "offline") {
    trace.push("policy=offline → force LOCAL");
    return finalize("local", 0.9, 0, policy.localLatencyMs, "Offline mode forced.");
  }
  const perTask = policy.perTask[input.task];
  if (perTask && perTask !== "auto") {
    trace.push(`per-task override for ${input.task} → ${perTask.toUpperCase()}`);
    return finalize(perTask, 0.88, perTask === "local" ? 0 : estCostCloud,
      perTask === "local" ? policy.localLatencyMs : policy.cloudLatencyMs,
      `Manual override for ${input.task}.`);
  }

  // Availability gates
  const localOk = signals.localOnline || !policy.markLocalOfflineAsFail;
  const cloudOk = signals.cloudAvailable && signals.cloudHeadroom > 0.05;
  trace.push(`availability: local=${localOk ? "ok" : "down"} cloud=${cloudOk ? "ok" : "down"} (headroom ${(signals.cloudHeadroom * 100).toFixed(0)}%)`);
  if (!localOk && !cloudOk) {
    return finalize("local", 0.2, 0, policy.localLatencyMs, "Both routes degraded — attempting local.");
  }
  if (!localOk) return finalize("cloud", 0.75, estCostCloud, policy.cloudLatencyMs, "Local engine offline → cloud.");
  if (!cloudOk) return finalize("local", 0.75, 0, policy.localLatencyMs, "Cloud unavailable/rate-limited → local.");

  // Budget guards
  const wouldExceed = cap > 0 && monthUsage + estCostCloud > cap;
  const belowMinHeadroom = cap > 0 && headroom < policy.minBudgetHeadroom;
  if (wouldExceed) {
    trace.push(`cloud cost $${estCostCloud.toFixed(4)} would exceed cap → local`);
    return finalize("local", 0.85, 0, policy.localLatencyMs, "Cloud call would breach monthly cap.");
  }
  if (policy.mode === "cost_saver" && (cap === 0 || belowMinHeadroom)) {
    trace.push(`cost_saver: headroom below ${(policy.minBudgetHeadroom * 100).toFixed(0)}% → local`);
    return finalize("local", 0.8, 0, policy.localLatencyMs, "Cost-saver: preserve remaining budget.");
  }

  // Policy soft preferences
  if (policy.mode === "quality_max" && policy.enableHybrid && !wouldExceed) {
    trace.push("quality_max → HYBRID (local draft + cloud verify)");
    return finalize("hybrid", 0.92, estCostCloud * 0.6, policy.cloudLatencyMs + 120, "Max quality: hybrid pipeline.");
  }
  if (policy.mode === "local_first") {
    trace.push("local_first → LOCAL");
    return finalize("local", 0.7, 0, policy.localLatencyMs, "Policy prefers local.");
  }
  if (policy.mode === "cloud_first") {
    trace.push("cloud_first → CLOUD");
    return finalize("cloud", 0.7, estCostCloud, policy.cloudLatencyMs, "Policy prefers cloud.");
  }

  // AUTO — score each candidate
  const benefit = TASK_QUALITY_BENEFIT[input.task];
  const localScore = 50 + (localOk ? 20 : -40) - benefit * 30;
  const cloudScore = 40 + (cloudOk ? 20 : -40) + benefit * 40 + headroom * 15 - estCostCloud * 200;
  const hybridScore =
    policy.enableHybrid && cloudOk && localOk && !belowMinHeadroom
      ? Math.max(localScore, cloudScore) + benefit * 15 - estCostCloud * 120
      : -Infinity;
  trace.push(`auto scores → local=${localScore.toFixed(1)} cloud=${cloudScore.toFixed(1)} hybrid=${hybridScore.toFixed(1)}`);

  const winner = pickMax({ local: localScore, cloud: cloudScore, hybrid: hybridScore });
  const confidence = clamp((Math.max(localScore, cloudScore, hybridScore) - 40) / 60);
  const cost = winner === "local" ? 0 : winner === "hybrid" ? estCostCloud * 0.6 : estCostCloud;
  const latency = winner === "local" ? policy.localLatencyMs : winner === "hybrid" ? policy.cloudLatencyMs + 120 : policy.cloudLatencyMs;
  const reason =
    winner === "hybrid"
      ? "Auto: hybrid gives quality lift within budget."
      : winner === "cloud"
      ? "Auto: cloud wins on task quality/headroom."
      : "Auto: local is efficient enough for this task.";

  const fallback: ComputeMode = winner === "local" ? "cloud" : "local";
  return { mode: winner, confidence, estCostUsd: cost, estLatencyMs: latency, reason, trace, policy: policy.mode, budget, fallback };

  function finalize(mode: ComputeMode, conf: number, cost: number, latency: number, reason: string): RouteResult {
    return { mode, confidence: conf, estCostUsd: cost, estLatencyMs: latency, reason, trace, policy: policy.mode, budget, fallback: mode === "local" ? "cloud" : "local" };
  }
}

function pickMax(scores: Record<ComputeMode, number>): ComputeMode {
  return (Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as ComputeMode) ?? "local";
}
function clamp(n: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, n)); }

// -------------------- hooks --------------------

export function useComputeRouter(): RouterPolicy {
  const [p, setP] = useState(read);
  useEffect(() => {
    const sync = () => setP(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return p;
}

/** Convenience hook: re-decides on policy or budget change. */
export function useRouteDecision(input: RouteInput): RouteResult {
  const policy = useComputeRouter();
  // budget changes trigger a re-render via useApiBudget subscription
  useApiBudget();
  return decideRoute(input, policy);
}

export const POLICY_LABELS: Record<PolicyMode, string> = {
  auto: "Auto (smart mix)",
  local_first: "Local First",
  cloud_first: "Cloud First",
  cost_saver: "Cost Saver",
  quality_max: "Max Quality (Hybrid)",
  offline: "Offline · Local Only",
};

export const TASK_LABELS: Record<TaskProfile, string> = {
  chat: "Chat",
  reasoning: "Reasoning",
  code: "Code",
  vision: "Vision",
  trading_signal: "Trading Signal",
  summarize: "Summarize",
  translate: "Translate",
};

export const DEFAULT_TASK_MODES = TASK_DEFAULTS;
