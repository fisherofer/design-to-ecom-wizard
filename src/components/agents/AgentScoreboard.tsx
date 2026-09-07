/**
 * AgentScoreboard — real performance ranking of agents and models, derived
 * from the persisted run log (success, latency, substance, recency-weighted).
 */
import { useEffect, useState } from "react";
import { Trophy, TrendingUp, TrendingDown, Gauge, Cpu, RefreshCw } from "lucide-react";

import { agentRunLog } from "@/lib/agentRunLog";
import { agentScores, modelScores, scoreGrade, type PerfStats } from "@/lib/agentScore";
import { cn } from "@/lib/utils";

const GRADE_STYLE: Record<ReturnType<typeof scoreGrade>, string> = {
  excellent: "border-success/40 bg-success/10 text-success",
  good: "border-primary/40 bg-primary/10 text-primary",
  weak: "border-warning/40 bg-warning/10 text-warning",
  failing: "border-destructive/40 bg-destructive/10 text-destructive",
};

function Row({ s }: { s: PerfStats }) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
      <span
        className={cn(
          "flex h-9 w-11 shrink-0 items-center justify-center rounded border font-mono text-sm font-semibold",
          GRADE_STYLE[scoreGrade(s.score)],
        )}
      >
        {s.score}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{s.name}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {s.runs} runs · {(s.successRate * 100).toFixed(0)}% ok · {(s.avgLatencyMs / 1000).toFixed(1)}s avg ·{" "}
          {(s.p95LatencyMs / 1000).toFixed(1)}s p95 · {Math.round(s.avgOutputChars)} chars
          {s.lastError ? ` · last error: ${s.lastError.slice(0, 60)}` : ""}
        </p>
      </div>
      {s.trend !== 0 && (
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 font-mono text-xs",
            s.trend > 0 ? "text-success" : "text-destructive",
          )}
        >
          {s.trend > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {s.trend > 0 ? "+" : ""}
          {s.trend}
        </span>
      )}
    </li>
  );
}

export function AgentScoreboard() {
  const [agents, setAgents] = useState<PerfStats[]>([]);
  const [models, setModels] = useState<PerfStats[]>([]);

  const refresh = () => {
    setAgents(agentScores());
    setModels(modelScores());
  };

  useEffect(() => {
    refresh();
    window.addEventListener(agentRunLog.EVENT, refresh);
    return () => window.removeEventListener(agentRunLog.EVENT, refresh);
  }, []);

  const empty = agents.length === 0;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Performance scoreboard</h2>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {empty ? (
        <p className="text-sm text-muted-foreground">
          No scored runs yet. Every agent run is measured — reliability, latency and answer substance — and ranked here.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" /> Agents
            </h3>
            <ul className="space-y-1.5">
              {agents.map((s) => (
                <Row key={s.id} s={s} />
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" /> Models
            </h3>
            <ul className="space-y-1.5">
              {models.map((s) => (
                <Row key={s.id} s={s} />
              ))}
            </ul>
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Score = 60% recency-weighted success · 25% latency · 15% answer substance. Trend compares the last 5 runs with
        the 5 before them.
      </p>
    </section>
  );
}
