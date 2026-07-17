/**
 * AgentRunHistory — real run log for a single agent (last 50 runs).
 * Reads from agentRunLog and subscribes to change events.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, Trash2 } from "lucide-react";
import { agentRunLog, type AgentRunRecord } from "@/lib/agentRunLog";
import { cn } from "@/lib/utils";

export function AgentRunHistory({ agentId }: { agentId: string }) {
  const [runs, setRuns] = useState<AgentRunRecord[]>(() => agentRunLog.forAgent(agentId));
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setRuns(agentRunLog.forAgent(agentId));
    refresh();
    window.addEventListener(agentRunLog.EVENT, refresh);
    return () => window.removeEventListener(agentRunLog.EVENT, refresh);
  }, [agentId]);

  const rate = agentRunLog.successRate(agentId);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-mono uppercase text-muted-foreground">
          Run history · {runs.length}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono">
            success {(rate * 100).toFixed(0)}%
          </span>
          {runs.length > 0 && (
            <button
              onClick={() => agentRunLog.clear(agentId)}
              className="text-muted-foreground hover:text-destructive"
              title="Clear history"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No runs yet — click "Run now" to record one.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {runs.map((r) => {
            const isOpen = open === r.id;
            return (
              <li key={r.id} className="rounded border border-border/60 bg-background">
                <button
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] font-mono"
                >
                  {r.ok ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                  ) : (
                    <XCircle className="h-3 w-3 shrink-0 text-destructive" />
                  )}
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(r.startedAt).toLocaleTimeString()}
                  </span>
                  <span className="truncate">{r.taskInput || "(no task)"}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" /> {r.durationMs}ms
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border/60 p-2 text-[11px]">
                    <div className="mb-1 flex flex-wrap gap-2 text-muted-foreground">
                      <span>model: {r.modelId}</span>
                      <span>·</span>
                      <span>src: {r.source}</span>
                      {r.tokensIn && <span>· in≈{r.tokensIn}t</span>}
                      {r.tokensOut && <span>· out≈{r.tokensOut}t</span>}
                    </div>
                    {r.error && (
                      <div className={cn("mb-1 rounded bg-destructive/10 p-1.5 text-destructive")}>
                        {r.error}
                      </div>
                    )}
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-surface p-2 font-mono text-[10px]">
                      {r.output || "(empty output)"}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
