/**
 * AgentFleetManager — control panel for local AI sub-agents.
 * Reads /api/agents from the QuantEngine backend, allows start/stop, and
 * streams live agent thoughts via /api/agents/:id/logs WebSocket.
 *
 * Backend fully wired — this component degrades gracefully if the local
 * FastAPI process is not running (shows offline card, no throws).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, RefreshCw, Terminal, Cpu, AlertTriangle, CircleDot } from "lucide-react";
import { AgentsService, type Agent, type AgentStatus } from "@/services/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: "text-muted-foreground",
  starting: "text-amber-400",
  running: "text-emerald-400",
  stopping: "text-amber-400",
  error: "text-red-400",
};

const STATUS_RING: Record<AgentStatus, string> = {
  idle: "ring-border",
  starting: "ring-amber-500/60",
  running: "ring-emerald-500/70 shadow-[0_0_18px_-4px_var(--color-emerald-500,#10b981)]",
  stopping: "ring-amber-500/60",
  error: "ring-red-500/60",
};

export function AgentFleetManager() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await AgentsService.list();
      setAgents(list);
      if (!selected && list.length) setSelected(list[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Log stream lifecycle
  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setLogs([]);
    if (!selected) return;
    const ws = AgentsService.streamLogs(selected, (line) => {
      setLogs((prev) => {
        const next = [...prev, line];
        if (next.length > 500) next.splice(0, next.length - 500);
        return next;
      });
    });
    if (ws) {
      ws.onerror = () => setLogs((p) => [...p, "[stream] connection error"]);
      ws.onclose = () => setLogs((p) => [...p, "[stream] closed"]);
      wsRef.current = ws;
    }
    return () => {
      ws?.close();
    };
  }, [selected]);

  useEffect(() => {
    logScrollRef.current?.scrollTo({ top: logScrollRef.current.scrollHeight });
  }, [logs]);

  async function toggle(agent: Agent) {
    setBusyId(agent.id);
    try {
      const updated =
        agent.status === "running" || agent.status === "starting"
          ? await AgentsService.stop(agent.id)
          : await AgentsService.start(agent.id);
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? updated : a)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selected) ?? null,
    [agents, selected],
  );

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="rounded-xl border border-border bg-card/60 backdrop-blur">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold tracking-tight">
              AI Agent Fleet
            </h2>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </header>

        {error && (
          <div className="m-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Backend unreachable — {error}</span>
          </div>
        )}

        <ul className="divide-y divide-border">
          {agents.length === 0 && !loading && !error && (
            <li className="px-4 py-6 text-center text-xs text-muted-foreground">
              No agents registered on backend.
            </li>
          )}
          {agents.map((a) => (
            <li
              key={a.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors ring-inset",
                selected === a.id ? "bg-primary/5 ring-1 " + STATUS_RING[a.status] : "hover:bg-muted/30",
              )}
              onClick={() => setSelected(a.id)}
            >
              <CircleDot className={cn("h-3.5 w-3.5", STATUS_COLOR[a.status])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {a.kind}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {a.last_thought ?? (a.model ? `model: ${a.model}` : "—")}
                </p>
              </div>
              <Button
                size="sm"
                variant={a.status === "running" ? "destructive" : "default"}
                disabled={busyId === a.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void toggle(a);
                }}
              >
                {a.status === "running" || a.status === "starting" ? (
                  <>
                    <Square className="h-3.5 w-3.5" /> Stop
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" /> Start
                  </>
                )}
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-h-[360px] flex-col rounded-xl border border-border bg-black/60">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <h2 className="font-display text-sm font-semibold tracking-tight text-emerald-100">
              Live Thought Stream
            </h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {selectedAgent ? `${selectedAgent.name} · ${selectedAgent.status}` : "no agent selected"}
          </span>
        </header>
        <div
          ref={logScrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-emerald-200/90"
        >
          {logs.length === 0 ? (
            <p className="text-emerald-500/40">
              {selectedAgent
                ? "Waiting for output… (agent may be idle)"
                : "Select an agent to attach the log stream."}
            </p>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="whitespace-pre-wrap">
                <span className="mr-2 text-emerald-500/50">›</span>
                {l}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
