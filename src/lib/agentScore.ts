/**
 * agentScore — real performance scoring for agents and models, computed from
 * the persisted run log (no synthetic numbers). Recency-weighted so a recently
 * failing agent loses standing quickly.
 *
 * Score (0-100) = 60% reliability + 25% latency + 15% substance,
 * where reliability is the recency-weighted success ratio, latency is scored
 * against a 20s reference, and substance rewards non-empty, non-trivial output.
 */
import { agentRunLog, type AgentRunRecord } from "./agentRunLog";

const HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 3; // 3 days
const LATENCY_REF_MS = 20_000;

export interface PerfStats {
  id: string;
  name: string;
  runs: number;
  successes: number;
  failures: number;
  successRate: number; // 0..1 raw
  weightedSuccess: number; // 0..1 recency-weighted
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgOutputChars: number;
  tokensIn: number;
  tokensOut: number;
  lastRunAt: string | null;
  lastError?: string;
  score: number; // 0..100
  trend: number; // score(last 5) - score(previous 5), percentage points
}

function weight(rec: AgentRunRecord, now: number): number {
  const age = Math.max(0, now - new Date(rec.startedAt).getTime());
  return Math.pow(0.5, age / HALF_LIFE_MS);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function scoreOf(runs: AgentRunRecord[], now: number): number {
  if (runs.length === 0) return 0;
  let wSum = 0;
  let wOk = 0;
  for (const r of runs) {
    const w = weight(r, now);
    wSum += w;
    if (r.ok) wOk += w;
  }
  const reliability = wSum > 0 ? wOk / wSum : 0;
  const avgLatency = runs.reduce((s, r) => s + r.durationMs, 0) / runs.length;
  const latency = Math.max(0, Math.min(1, 1 - avgLatency / (LATENCY_REF_MS * 2)));
  const okRuns = runs.filter((r) => r.ok);
  const avgChars = okRuns.length ? okRuns.reduce((s, r) => s + r.output.length, 0) / okRuns.length : 0;
  const substance = Math.max(0, Math.min(1, avgChars / 600));
  return Math.round((reliability * 0.6 + latency * 0.25 + substance * 0.15) * 100);
}

function statsFor(id: string, name: string, runs: AgentRunRecord[]): PerfStats {
  const now = Date.now();
  const sorted = [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)); // newest first
  const successes = sorted.filter((r) => r.ok).length;
  const durations = sorted.map((r) => r.durationMs);
  const okRuns = sorted.filter((r) => r.ok);
  const recent = sorted.slice(0, 5);
  const previous = sorted.slice(5, 10);

  return {
    id,
    name,
    runs: sorted.length,
    successes,
    failures: sorted.length - successes,
    successRate: sorted.length ? successes / sorted.length : 0,
    weightedSuccess: (() => {
      let wSum = 0;
      let wOk = 0;
      for (const r of sorted) {
        const w = weight(r, now);
        wSum += w;
        if (r.ok) wOk += w;
      }
      return wSum > 0 ? wOk / wSum : 0;
    })(),
    avgLatencyMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    p95LatencyMs: percentile(durations, 95),
    avgOutputChars: okRuns.length ? okRuns.reduce((s, r) => s + r.output.length, 0) / okRuns.length : 0,
    tokensIn: sorted.reduce((s, r) => s + (r.tokensIn ?? 0), 0),
    tokensOut: sorted.reduce((s, r) => s + (r.tokensOut ?? 0), 0),
    lastRunAt: sorted[0]?.startedAt ?? null,
    lastError: sorted.find((r) => !r.ok)?.error,
    score: scoreOf(sorted, now),
    trend: previous.length ? scoreOf(recent, now) - scoreOf(previous, now) : 0,
  };
}

/** Scoreboard per agent, best first. */
export function agentScores(): PerfStats[] {
  const runs = agentRunLog.all();
  const byAgent = new Map<string, AgentRunRecord[]>();
  for (const r of runs) {
    const arr = byAgent.get(r.agentId) ?? [];
    arr.push(r);
    byAgent.set(r.agentId, arr);
  }
  return [...byAgent.entries()]
    .map(([id, list]) => statsFor(id, list[0]?.agentName ?? id, list))
    .sort((a, b) => b.score - a.score);
}

/** Scoreboard per model id, best first. */
export function modelScores(): PerfStats[] {
  const runs = agentRunLog.all();
  const byModel = new Map<string, AgentRunRecord[]>();
  for (const r of runs) {
    const key = r.modelId || "unknown";
    const arr = byModel.get(key) ?? [];
    arr.push(r);
    byModel.set(key, arr);
  }
  return [...byModel.entries()].map(([id, list]) => statsFor(id, id, list)).sort((a, b) => b.score - a.score);
}

/** Best model observed so far, if there is enough evidence (>= 3 runs). */
export function bestModel(minRuns = 3): PerfStats | null {
  return modelScores().find((m) => m.runs >= minRuns) ?? null;
}

export function scoreGrade(score: number): "excellent" | "good" | "weak" | "failing" {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 35) return "weak";
  return "failing";
}
