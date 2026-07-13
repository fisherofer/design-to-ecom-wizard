/**
 * Compute Router tab — configure the Local ⇄ Cloud smart routing policy,
 * budget guards, per-task overrides, and simulate any task live.
 */
import { useMemo, useState } from "react";
import { Cpu, Cloud, Blend, Gauge, ShieldAlert, Zap, RotateCcw, PlayCircle } from "lucide-react";
import {
  computeRouter,
  decideRoute,
  useComputeRouter,
  POLICY_LABELS,
  TASK_LABELS,
  type PolicyMode,
  type TaskProfile,
  type ComputeMode,
  type Sensitivity,
  type RouteResult,
} from "@/lib/computeRouter";
import { useApiBudget } from "@/lib/apiBudget";
import { Field } from "@/components/settings/Field";
import { cn } from "@/lib/utils";

const MODE_META: Record<ComputeMode, { icon: typeof Cpu; label: string; tone: string }> = {
  local:  { icon: Cpu,   label: "Local",  tone: "text-success border-success/40 bg-success/10" },
  cloud:  { icon: Cloud, label: "Cloud",  tone: "text-primary border-primary/40 bg-primary/10" },
  hybrid: { icon: Blend, label: "Hybrid", tone: "text-warning border-warning/40 bg-warning/10" },
};

export function ComputeRouterTab() {
  const policy = useComputeRouter();
  useApiBudget();

  const [simTask, setSimTask] = useState<TaskProfile>("reasoning");
  const [simTokens, setSimTokens] = useState(1200);
  const [simSensitivity, setSimSensitivity] = useState<Sensitivity>("market_data");
  const [simLocal, setSimLocal] = useState(true);
  const [simCloud, setSimCloud] = useState(true);
  const [simHeadroom, setSimHeadroom] = useState(0.7);

  const decision = useMemo<RouteResult>(
    () =>
      decideRoute({
        task: simTask,
        estTokens: simTokens,
        sensitivity: simSensitivity,
        signals: { localOnline: simLocal, cloudAvailable: simCloud, cloudHeadroom: simHeadroom },
      }),
    [simTask, simTokens, simSensitivity, simLocal, simCloud, simHeadroom, policy],
  );

  const meta = MODE_META[decision.mode];
  const Icon = meta.icon;

  return (
    <div className="space-y-6">
      {/* Policy */}
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" /> Compute Routing Policy
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Decides when a request goes to your local Ollama, to a paid cloud API, or to a hybrid pipeline.
            </p>
          </div>
          <button
            onClick={() => computeRouter.reset()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-elevated"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset defaults
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {(Object.keys(POLICY_LABELS) as PolicyMode[]).map((m) => (
            <button
              key={m}
              onClick={() => computeRouter.set({ mode: m })}
              className={cn(
                "rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                policy.mode === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface hover:bg-surface-elevated",
              )}
            >
              <div className="font-medium">{POLICY_LABELS[m]}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{describePolicy(m)}</div>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Min budget headroom (%)">
            <input
              type="number" min={0} max={90} step={5}
              value={Math.round(policy.minBudgetHeadroom * 100)}
              onChange={(e) => computeRouter.set({ minBudgetHeadroom: Math.max(0, Math.min(0.9, Number(e.target.value) / 100)) })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Below this reserve, cost-saver blocks cloud.</p>
          </Field>
          <Field label="Cloud cost $ / 1k tok (est.)">
            <input
              type="number" min={0} step={0.0005}
              value={policy.cloudCostPer1k}
              onChange={(e) => computeRouter.set({ cloudCostPer1k: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </Field>
          <Field label="Local latency (ms)">
            <input
              type="number" min={50} step={50}
              value={policy.localLatencyMs}
              onChange={(e) => computeRouter.set({ localLatencyMs: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </Field>
          <Field label="Cloud latency (ms)">
            <input
              type="number" min={50} step={50}
              value={policy.cloudLatencyMs}
              onChange={(e) => computeRouter.set({ cloudLatencyMs: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
            <input
              type="checkbox"
              checked={policy.enableHybrid}
              onChange={(e) => computeRouter.set({ enableHybrid: e.target.checked })}
            />
            <Blend className="h-4 w-4 text-warning" /> Allow Hybrid (local draft + cloud verify)
          </label>
          <label className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
            <input
              type="checkbox"
              checked={policy.markLocalOfflineAsFail}
              onChange={(e) => computeRouter.set({ markLocalOfflineAsFail: e.target.checked })}
            />
            <ShieldAlert className="h-4 w-4 text-warning" /> Treat local-offline as a hard failure
          </label>
        </div>
      </section>

      {/* Per-task overrides */}
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Per-task overrides</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Force a fixed route for a specific task profile. Leave as “Auto” for the smart engine.
        </p>
        <div className="mt-4 grid gap-2">
          {(Object.keys(TASK_LABELS) as TaskProfile[]).map((t) => {
            const current = policy.perTask[t] ?? "auto";
            return (
              <div key={t} className="grid grid-cols-[minmax(0,1fr)_repeat(4,auto)] items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                <div className="text-sm font-medium">{TASK_LABELS[t]}</div>
                {(["auto", "local", "cloud", "hybrid"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => computeRouter.setPerTask(t, m)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
                      current === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {/* Simulator */}
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Live simulator</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Change any input to see the router’s decision update instantly. No requests are sent.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Task">
            <select
              value={simTask}
              onChange={(e) => setSimTask(e.target.value as TaskProfile)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {(Object.keys(TASK_LABELS) as TaskProfile[]).map((t) => (
                <option key={t} value={t}>{TASK_LABELS[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Est. tokens">
            <input
              type="number" min={0} step={100} value={simTokens}
              onChange={(e) => setSimTokens(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </Field>
          <Field label="Sensitivity">
            <select
              value={simSensitivity}
              onChange={(e) => setSimSensitivity(e.target.value as Sensitivity)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="public">Public</option>
              <option value="market_data">Market data</option>
              <option value="private">Private (force local)</option>
            </select>
          </Field>
          <Field label="Local online">
            <label className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <input type="checkbox" checked={simLocal} onChange={(e) => setSimLocal(e.target.checked)} />
              <Cpu className="h-4 w-4 text-success" /> Ollama reachable
            </label>
          </Field>
          <Field label="Cloud available">
            <label className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <input type="checkbox" checked={simCloud} onChange={(e) => setSimCloud(e.target.checked)} />
              <Cloud className="h-4 w-4 text-primary" /> Provider reachable
            </label>
          </Field>
          <Field label={`Cloud headroom: ${Math.round(simHeadroom * 100)}%`}>
            <input
              type="range" min={0} max={100} step={5}
              value={Math.round(simHeadroom * 100)}
              onChange={(e) => setSimHeadroom(Number(e.target.value) / 100)}
              className="w-full"
            />
          </Field>
        </div>

        <div className="mt-5 rounded-md border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold", meta.tone)}>
              <Icon className="h-4 w-4" /> {meta.label.toUpperCase()}
              <span className="ml-2 text-[10px] font-mono opacity-70">conf {(decision.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3" /> ~{decision.estLatencyMs}ms</span>
              <span>~${decision.estCostUsd.toFixed(4)}</span>
              {decision.fallback && <span>fallback → {decision.fallback}</span>}
            </div>
          </div>
          <p className="mt-3 text-sm">{decision.reason}</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
              Decision trace ({decision.trace.length})
            </summary>
            <ul className="mt-2 space-y-1 rounded-md bg-background/60 p-3 font-mono text-[11px] text-muted-foreground">
              {decision.trace.map((line, i) => (
                <li key={i}>· {line}</li>
              ))}
            </ul>
          </details>
        </div>
      </section>
    </div>
  );
}

function describePolicy(m: PolicyMode): string {
  switch (m) {
    case "auto": return "Smart mix — quality × cost × latency.";
    case "local_first": return "Prefer Ollama, cloud only as needed.";
    case "cloud_first": return "Prefer cloud, local as failover.";
    case "cost_saver": return "Block cloud when budget headroom is low.";
    case "quality_max": return "Always hybrid when possible.";
    case "offline": return "Hard force local — no cloud calls.";
  }
}
