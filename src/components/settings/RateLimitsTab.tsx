/** Rate Limits tab: per-key budgets, usage bars, simulated routing preview. */
import { useEffect, useMemo, useState } from "react";
import { Activity, Loader2, RotateCcw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, USE_CASE_LABELS, type ApiKey, type UseCase } from "@/lib/api";
import { rateLimits, levelFor, utilization } from "@/lib/rateLimits";
import { routeFor, type RouteDecision } from "@/lib/smartRouter";

export function RateLimitsTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [useCase, setUseCase] = useState<UseCase>("trading_decisions");

  // Re-render every 2s to refresh usage bars.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.listKeys().then((k) => {
      if (cancelled) return;
      setKeys(k);
      // Seed budgets for any key that doesn't have one yet.
      k.forEach((key) => {
        rateLimits.setBudget(key.id, {
          rpm: key.rpmLimit || 60,
          rpd: (key.rpmLimit || 60) * 60 * 8, // 8h active window heuristic
          tpd: key.paid ? 5_000_000 : 1_000_000,
        });
      });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const decision: RouteDecision = useMemo(
    () => routeFor(keys, useCase),
    // include tick so usage updates re-score
    [keys, useCase, tick],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Smart Router</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a use-case to preview which key would be selected right now.
              Routing weighs tier (primary/fallback/emergency), live headroom, and cost.
            </p>
          </div>
          <select
            value={useCase}
            onChange={(e) => setUseCase(e.target.value as UseCase)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {(Object.keys(USE_CASE_LABELS) as UseCase[]).map((u) => (
              <option key={u} value={u}>{USE_CASE_LABELS[u]}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-medium">{decision.reason}</span>
          </div>
          {decision.considered.length > 0 && (
            <div className="mt-3 grid gap-1 text-[11px] font-mono">
              {decision.considered.slice(0, 5).map((c) => (
                <div key={c.key.id} className="flex justify-between text-muted-foreground">
                  <span className={cn(decision.chosen?.id === c.key.id && "text-primary font-bold")}>
                    {c.key.provider} · {c.key.id}
                  </span>
                  <span>score {c.score.toFixed(1)} · {c.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Per-Key Usage</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Live rpm / daily / token budgets. Resets automatically.
            </p>
          </div>
          <button
            onClick={() => { rateLimits.reset(); setTick((n) => n + 1); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs hover:bg-surface-elevated"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset all counters
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {keys.map((k) => (
            <KeyUsageRow key={k.id} apiKey={k} onSimulate={() => { rateLimits.record(k.id, 1200); setTick((n) => n + 1); }} />
          ))}
        </div>
      </section>
    </div>
  );
}

function KeyUsageRow({ apiKey, onSimulate }: { apiKey: ApiKey; onSimulate: () => void }) {
  const snap = rateLimits.snapshot(apiKey.id);
  const rpmUtil = utilization(snap.rpmUsed, snap.budget.rpm);
  const rpdUtil = utilization(snap.rpdUsed, snap.budget.rpd);
  const tpdUtil = utilization(snap.tpdUsed, snap.budget.tpd);
  const worst = Math.max(rpmUtil, rpdUtil, tpdUtil);

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-medium text-sm">
            {apiKey.provider}
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
              {apiKey.tier}
            </span>
            {apiKey.paid && (
              <span className="rounded-sm bg-warning/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-warning">
                paid
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{apiKey.maskedKey}</div>
        </div>
        <div className="flex items-center gap-2">
          <Activity className={cn(
            "h-4 w-4",
            levelFor(worst) === "danger" ? "text-destructive" : levelFor(worst) === "warn" ? "text-warning" : "text-success",
          )} />
          <button
            onClick={onSimulate}
            className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] hover:bg-surface-elevated"
            title="Simulate one request (+1200 tokens) to test the limits engine"
          >
            +1 req
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <UsageBar label="RPM" used={snap.rpmUsed} limit={snap.budget.rpm} util={rpmUtil} />
        <UsageBar label="Daily req" used={snap.rpdUsed} limit={snap.budget.rpd} util={rpdUtil} />
        <UsageBar label="Tokens / day" used={snap.tpdUsed} limit={snap.budget.tpd} util={tpdUtil} />
      </div>
    </div>
  );
}

function UsageBar({ label, used, limit, util }: { label: string; used: number; limit: number; util: number }) {
  const lvl = levelFor(util);
  const colorClass = lvl === "danger" ? "bg-destructive" : lvl === "warn" ? "bg-warning" : "bg-success";
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span>{formatNumber(used)} / {formatNumber(limit)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background">
        <div className={cn("h-full transition-all", colorClass)} style={{ width: `${Math.round(util * 100)}%` }} />
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}
