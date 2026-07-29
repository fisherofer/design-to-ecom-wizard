/**
 * OrchestratorPanel — fleet scheduling controls for Agent Studio.
 * Mode (manual / semi / auto / AI), tick cadence, concurrency, presets,
 * per-agent participation, approval queue, and "Run all now".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, Loader2, Play, Timer, X, Zap } from "lucide-react";
import type { AgentBlueprint } from "@/lib/agentBuilder";
import {
  DEFAULT_SETTINGS,
  ORCHESTRATOR_EVENT,
  RECOMMENDED_PRESETS,
  dismissApproval,
  isAgentEnabled,
  lastTickAt,
  listApprovals,
  loadSettings,
  nextDueLabel,
  saveSettings,
  tick,
  type ApprovalRequest,
  type OrchestratorMode,
  type OrchestratorSettings,
} from "@/lib/agentOrchestrator";

const MODES: Array<{ id: OrchestratorMode; label: string; hint: string }> = [
  { id: "manual", label: "Manual", hint: "Nothing runs unless you press Run all" },
  { id: "semi", label: "Semi-auto", hint: "Due agents queue for your approval" },
  { id: "auto", label: "Automatic", hint: "Due agents run on their own schedule" },
  { id: "ai", label: "AI-driven", hint: "A model picks which agents run each cycle" },
];

export function OrchestratorPanel({
  agents,
  running,
  onRunAll,
  onRunAgent,
}: {
  agents: AgentBlueprint[];
  running: boolean;
  onRunAll: (task: string) => void | Promise<void>;
  onRunAgent: (agent: AgentBlueprint, task: string) => void | Promise<void>;
}) {
  const [settings, setSettings] = useState<OrchestratorSettings>(DEFAULT_SETTINGS);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [ticking, setTicking] = useState(false);
  const [lastTick, setLastTick] = useState<number | null>(null);
  const [tickNote, setTickNote] = useState<string>("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    setSettings(loadSettings());
    setApprovals(listApprovals());
    setLastTick(lastTickAt());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(ORCHESTRATOR_EVENT, refresh);
    return () => window.removeEventListener(ORCHESTRATOR_EVENT, refresh);
  }, [refresh]);

  const patch = (p: Partial<OrchestratorSettings>) => {
    const next = { ...settings, ...p };
    setSettings(next);
    saveSettings(next);
  };

  const runTick = useCallback(async () => {
    setTicking(true);
    try {
      setTickNote(await tick());
    } catch (e) {
      setTickNote((e as Error).message);
    } finally {
      setTicking(false);
      refresh();
    }
  }, [refresh]);

  // scheduler loop
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (settings.mode === "manual") return;
    timer.current = setInterval(runTick, Math.max(15, settings.tickSeconds) * 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [settings.mode, settings.tickSeconds, runTick]);

  const enabledCount = useMemo(
    () => agents.filter((a) => isAgentEnabled(settings, a)).length,
    [agents, settings],
  );

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
            <CalendarClock className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold">Fleet Scheduler</h2>
            <p className="text-[11px] font-mono text-muted-foreground">
              {enabledCount}/{agents.length} agents enabled · {settings.mode}
              {lastTick ? ` · last tick ${new Date(lastTick).toLocaleTimeString()}` : ""}
              {tickNote ? ` · ${tickNote}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runTick}
            disabled={ticking || settings.mode === "manual"}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-mono disabled:opacity-50"
          >
            {ticking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Timer className="h-3.5 w-3.5" />}
            Tick now
          </button>
          <button
            onClick={() => onRunAll(settings.defaultTask)}
            disabled={running || enabledCount === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run all ({enabledCount})
          </button>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => patch({ mode: m.id })}
            className={`rounded-lg border p-2.5 text-left ${
              settings.mode === m.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
            }`}
          >
            <div className="text-xs font-semibold">{m.label}</div>
            <div className="mt-0.5 text-[10px] font-mono text-muted-foreground">{m.hint}</div>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block">
          <div className="mb-1 text-[10px] font-mono uppercase text-muted-foreground">Tick interval (s)</div>
          <input
            type="number"
            min={15}
            value={settings.tickSeconds}
            onChange={(e) => patch({ tickSeconds: Number(e.target.value) })}
            className={inp}
          />
        </label>
        <label className="block">
          <div className="mb-1 text-[10px] font-mono uppercase text-muted-foreground">Max concurrent</div>
          <input
            type="number"
            min={1}
            max={10}
            value={settings.maxConcurrent}
            onChange={(e) => patch({ maxConcurrent: Number(e.target.value) })}
            className={inp}
          />
        </label>
        <label className="block">
          <div className="mb-1 text-[10px] font-mono uppercase text-muted-foreground">Fleet task</div>
          <input
            value={settings.defaultTask}
            onChange={(e) => patch({ defaultTask: e.target.value })}
            className={inp}
          />
        </label>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-[10px] font-mono uppercase text-muted-foreground">Recommended presets</div>
        <div className="flex flex-wrap gap-2">
          {RECOMMENDED_PRESETS.map((p) => (
            <button
              key={p.id}
              title={p.description}
              onClick={() => {
                const next = p.apply(settings);
                setSettings(next);
                saveSettings(next);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] hover:border-primary/50"
            >
              <Zap className="h-3 w-3 text-primary" /> {p.label}
            </button>
          ))}
        </div>
      </div>

      {approvals.length > 0 && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <div className="mb-2 text-[11px] font-mono uppercase text-warning">
            Pending approvals ({approvals.length})
          </div>
          <div className="space-y-1.5">
            {approvals.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-card px-2.5 py-1.5">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{a.agentName}</div>
                  <div className="truncate text-[10px] font-mono text-muted-foreground">{a.reason} · {a.task}</div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={async () => {
                      const agent = agents.find((x) => x.id === a.agentId);
                      dismissApproval(a.id);
                      if (agent) await onRunAgent(agent, a.task);
                      refresh();
                    }}
                    className="inline-flex items-center gap-1 rounded border border-success/50 bg-success/10 px-2 py-1 text-[11px] text-success"
                  >
                    <Check className="h-3 w-3" /> Approve
                  </button>
                  <button
                    onClick={() => { dismissApproval(a.id); refresh(); }}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    <X className="h-3 w-3" /> Skip
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1.5 text-[10px] font-mono uppercase text-muted-foreground">Participation</div>
        <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => {
            const on = isAgentEnabled(settings, a);
            return (
              <label
                key={a.id}
                className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                  on ? "border-border" : "border-dashed border-border opacity-60"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => patch({ enabled: { ...settings.enabled, [a.id]: e.target.checked } })}
                  />
                  <span className="truncate">{a.name}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{nextDueLabel(a)}</span>
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const inp = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
