/**
 * AgentStatusBoard — per-agent operational status table.
 * Shows last run time, active model, temperature, success/failure state and
 * the most recent error, derived from the persisted agentRunLog.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { agentRunLog, type AgentRunRecord } from "@/lib/agentRunLog";
import type { AgentBlueprint } from "@/lib/agentBuilder";

function relTime(iso?: string) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "never";
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function AgentStatusBoard({
  items,
  selectedId,
  onSelect,
}: {
  items: AgentBlueprint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Client-only: the log lives in localStorage, so render after hydration.
  const [runs, setRuns] = useState<AgentRunRecord[] | null>(null);

  useEffect(() => {
    const sync = () => setRuns(agentRunLog.all());
    sync();
    window.addEventListener(agentRunLog.EVENT, sync);
    return () => window.removeEventListener(agentRunLog.EVENT, sync);
  }, []);

  const rows = useMemo(() => {
    const log = runs ?? [];
    return items.map((a) => {
      const mine = log.filter((r) => r.agentId === a.id);
      const last = mine[0];
      const lastError = mine.find((r) => !r.ok && r.error);
      const okCount = mine.filter((r) => r.ok).length;
      return {
        agent: a,
        last,
        lastError,
        total: mine.length,
        rate: mine.length ? okCount / mine.length : 0,
      };
    });
  }, [items, runs]);

  const totals = useMemo(() => {
    const withRuns = rows.filter((r) => r.total > 0);
    const failing = rows.filter((r) => r.last && !r.last.ok).length;
    return { withRuns: withRuns.length, failing };
  }, [rows]);

  return (
    <div className="mb-4 rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="text-xs font-mono uppercase text-muted-foreground">
          Status board · {items.length} agents · {totals.withRuns} with runs
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          {totals.failing > 0 ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> {totals.failing} failing
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> no failures
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] font-mono uppercase text-muted-foreground">
              <th className="px-4 py-2 font-normal">Agent</th>
              <th className="px-3 py-2 font-normal">Last run</th>
              <th className="px-3 py-2 font-normal">Active model</th>
              <th className="px-3 py-2 font-normal">Temp</th>
              <th className="px-3 py-2 font-normal">Status</th>
              <th className="px-3 py-2 font-normal">Success</th>
              <th className="px-3 py-2 font-normal">Last error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ agent, last, lastError, total, rate }) => (
              <tr
                key={agent.id}
                onClick={() => onSelect(agent.id)}
                className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40 ${
                  selectedId === agent.id ? "bg-primary/5" : ""
                }`}
              >
                <td className="px-4 py-2">
                  <div className="font-medium">{agent.name}</div>
                  <div className="text-[10px] text-muted-foreground">{agent.role}</div>
                </td>
                <td className="px-3 py-2 font-mono text-muted-foreground">
                  {runs === null ? "—" : relTime(last?.finishedAt)}
                  {last && <div className="text-[10px]">{last.durationMs}ms · {last.source}</div>}
                </td>
                <td className="px-3 py-2 font-mono">
                  <span title={last?.modelId || agent.model}>
                    {(last?.modelId && last.modelId !== "n/a" ? last.modelId : agent.model) || "—"}
                  </span>
                  {last?.modelId && last.modelId !== "n/a" && last.modelId !== agent.model && (
                    <div className="text-[10px] text-muted-foreground">configured: {agent.model}</div>
                  )}
                </td>
                <td className="px-3 py-2 font-mono">{agent.temperature.toFixed(1)}</td>
                <td className="px-3 py-2">
                  {runs === null || !last ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <CircleDashed className="h-3.5 w-3.5" /> never run
                    </span>
                  ) : last.ok ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> success
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <XCircle className="h-3.5 w-3.5" /> failed
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono">
                  {total === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={rate >= 0.8 ? "text-emerald-400" : rate > 0 ? "text-amber-400" : "text-destructive"}>
                      {(rate * 100).toFixed(0)}% <span className="text-muted-foreground">({total})</span>
                    </span>
                  )}
                </td>
                <td className="max-w-[260px] px-3 py-2">
                  {lastError ? (
                    <span className="line-clamp-2 text-[11px] text-destructive" title={lastError.error}>
                      {lastError.error}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
