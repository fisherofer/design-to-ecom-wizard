/** Smart AI Router — task→model policy, live decision preview, and observed telemetry. */
import { useEffect, useMemo, useState } from "react";
import { Route as RouteIcon, RotateCcw, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  aiRouter,
  decideModel,
  type RouterMode,
  type RouterTask,
  type TaskPolicy,
} from "@/lib/aiRouterPolicy";

const MODES: RouterMode[] = ["auto", "cost", "quality", "latency", "manual"];

export function SmartAiRouterPanel() {
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<RouterMode>("auto");
  const [policies, setPolicies] = useState<TaskPolicy[]>([]);
  const [task, setTask] = useState<RouterTask>("chat");

  useEffect(() => {
    const sync = () => {
      setMode(aiRouter.mode());
      setPolicies(aiRouter.policies());
      setTick((n) => n + 1);
    };
    sync();
    window.addEventListener(aiRouter.event, sync);
    return () => window.removeEventListener(aiRouter.event, sync);
  }, []);

  const decision = useMemo(
    () => (policies.length ? decideModel(task, mode) : null),
    [task, mode, policies, tick],
  );
  const stats = useMemo(() => (policies.length ? aiRouter.stats() : []), [policies, tick]);
  const policy = policies.find((p) => p.task === task);

  return (
    <div className="rounded-xl border border-border glass">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
            Smart AI Router
          </h3>
        </div>
        <button
          onClick={() => aiRouter.resetPolicies()}
          className="flex items-center gap-1.5 rounded border border-border px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => aiRouter.setMode(m)}
              className={cn(
                "rounded border px-2.5 py-1 font-mono text-[10px] uppercase transition-colors",
                mode === m
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {policies.map((p) => (
            <button
              key={p.task}
              onClick={() => setTask(p.task)}
              className={cn(
                "rounded border px-2.5 py-1 text-[11px] transition-colors",
                task === p.task
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {policy && decision && (
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
            <p className="text-xs text-muted-foreground">{policy.description}</p>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <span className="font-mono text-sm text-primary break-all">{decision.model}</span>
              <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
                {decision.reason}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {decision.chain.map((m, i) => (
                <span
                  key={m}
                  className="rounded border border-border bg-card/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {i + 1}. {m}
                </span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] text-muted-foreground">
              <span>tier · {policy.tier}</span>
              <span>temp · {policy.temperature}</span>
              <span>max · {policy.maxTokens}</span>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Observed telemetry
            </span>
          </div>
          {stats.length === 0 ? (
            <p className="rounded border border-dashed border-border/60 p-3 text-center font-mono text-[11px] text-muted-foreground">
              No routed calls recorded yet — metrics appear after real runs.
            </p>
          ) : (
            <div className="space-y-1.5">
              {stats.map((s) => (
                <div
                  key={s.model}
                  className="flex items-center justify-between rounded border border-border/50 bg-card/30 px-2.5 py-2 font-mono text-[11px]"
                >
                  <span className="truncate">{s.model}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-muted-foreground">{s.calls} calls</span>
                    <span className="text-muted-foreground">{s.avgLatencyMs}ms</span>
                    <span className={s.successRate >= 0.9 ? "text-success" : "text-warning"}>
                      {(s.successRate * 100).toFixed(0)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
