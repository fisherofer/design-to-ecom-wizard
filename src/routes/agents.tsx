/**
 * Agents route — three-pane builder: list · editor · live preview.
 * "Run now" actually invokes the AI Gateway and records the run in the
 * agentRunLog. "Consensus" runs all running agents on the same task.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Save, Play, Sparkles, Users, Loader2 } from "lucide-react";
import { AgentList } from "@/components/agents/AgentList";
import { AgentEditor } from "@/components/agents/AgentEditor";
import { AgentPreview } from "@/components/agents/AgentPreview";
import { AgentRunHistory } from "@/components/agents/AgentRunHistory";
import { AgentTemplatesModal } from "@/components/agents/AgentTemplatesModal";
import {
  loadBlueprints, upsertBlueprint, deleteBlueprint, newBlueprint,
  type AgentBlueprint,
} from "@/lib/agentBuilder";
import { runAgent } from "@/lib/agentRunner";
import { runConsensus, type ConsensusResult } from "@/lib/agentConsensus";
import type { AgentTemplate } from "@/lib/agentTemplates";
import { notifications } from "@/lib/notifications";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agent Builder — AI Executive OS" },
      { name: "description", content: "Edit prompts, tools, memory, and schedules with live previews." },
    ],
  }),
  component: AgentBuilderPage,
});

function AgentBuilderPage() {
  const [items, setItems] = useState<AgentBlueprint[]>(() => loadBlueprints());
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [taskInput, setTaskInput] = useState("Summarize today's whale flows on ETH.");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"idle" | "run" | "consensus">("idle");
  const [tplOpen, setTplOpen] = useState(false);
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  function update(next: AgentBlueprint) {
    setItems(items.map((i) => (i.id === next.id ? next : i)));
    setDirty(true);
  }

  function save() {
    if (!selected) return;
    const all = upsertBlueprint(selected);
    setItems(all);
    setDirty(false);
  }

  function create() {
    const bp = newBlueprint();
    const all = upsertBlueprint(bp);
    setItems(all);
    setSelectedId(bp.id);
  }

  function remove(id: string) {
    const all = deleteBlueprint(id);
    setItems(all);
    if (selectedId === id) setSelectedId(all[0]?.id ?? null);
  }

  function cloneTemplate(tpl: AgentTemplate) {
    const bp: AgentBlueprint = {
      ...tpl.blueprint,
      id: `agt_${Math.random().toString(36).slice(2, 8)}`,
    };
    const all = upsertBlueprint(bp);
    setItems(all);
    setSelectedId(bp.id);
    notifications.push({ level: "info", title: "Template loaded", message: `${tpl.label} cloned into a new agent.` });
  }

  async function run() {
    if (!selected) return;
    setBusy("run");
    update({ ...selected, status: "running", lastRun: new Date().toISOString() });
    try {
      const rec = await runAgent(selected, { taskInput, source: "manual" });
      update({ ...selected, status: rec.ok ? "idle" : "error", lastRun: rec.finishedAt });
      notifications.push({
        level: rec.ok ? "info" : "warn",
        title: `${selected.name} finished`,
        message: rec.ok ? `Ran in ${rec.durationMs}ms via ${rec.modelId}` : (rec.error ?? "run failed"),
      });
    } finally {
      setBusy("idle");
    }
  }

  async function consensusRun() {
    const running = items.filter((a) => a.status === "running" || a.id === selectedId);
    if (running.length < 2) {
      notifications.push({ level: "warn", title: "Consensus needs ≥2 agents", message: "Mark more agents as running or select alternatives." });
      return;
    }
    setBusy("consensus");
    try {
      const res = await runConsensus(running.slice(0, 5), taskInput);
      setConsensus(res);
      notifications.push({
        level: "info",
        title: "Consensus complete",
        message: `${res.okCount}/${res.runs.length} agents responded · agreement ${(res.agreement * 100).toFixed(0)}%`,
      });
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Agent Builder</h1>
            <p className="text-sm text-muted-foreground font-mono">
              Prompts · Tools · Memory · Schedules · Live runs
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTplOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <Sparkles className="h-4 w-4" /> Templates
          </button>
          <button
            onClick={consensusRun}
            disabled={busy !== "idle"}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50"
          >
            {busy === "consensus" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Consensus
          </button>
          <button
            onClick={save}
            disabled={!dirty}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {dirty ? "Save" : "Saved"}
          </button>
          <button
            onClick={run}
            disabled={!selected || busy !== "idle"}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run now
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
        <AgentList
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={create}
          onDelete={remove}
        />
        {selected ? (
          <div className="space-y-4">
            <AgentEditor value={selected} onChange={update} />
            <AgentRunHistory agentId={selected.id} />
            {consensus && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-mono uppercase text-muted-foreground">
                    Consensus · {consensus.okCount}/{consensus.runs.length} · agreement {(consensus.agreement * 100).toFixed(0)}%
                  </div>
                  <button onClick={() => setConsensus(null)} className="text-[11px] text-muted-foreground hover:text-foreground">clear</button>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px]">
                  {consensus.aggregate || "(no responses)"}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Select or create an agent to start editing.
          </div>
        )}
        <div className="space-y-3">
          {selected && (
            <>
              <label className="block">
                <div className="mb-1 text-xs font-mono uppercase text-muted-foreground">Test task</div>
                <input
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <AgentPreview value={selected} taskInput={taskInput} />
            </>
          )}
        </div>
      </div>

      <AgentTemplatesModal open={tplOpen} onClose={() => setTplOpen(false)} onPick={cloneTemplate} />
    </div>
  );
}
