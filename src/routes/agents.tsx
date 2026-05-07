/**
 * Agents route — three-pane builder: list · editor · live preview.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Save, Play } from "lucide-react";
import { AgentList } from "@/components/agents/AgentList";
import { AgentEditor } from "@/components/agents/AgentEditor";
import { AgentPreview } from "@/components/agents/AgentPreview";
import {
  loadBlueprints, upsertBlueprint, deleteBlueprint, newBlueprint,
  type AgentBlueprint,
} from "@/lib/agentBuilder";

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

  function run() {
    if (!selected) return;
    update({ ...selected, status: "running", lastRun: new Date().toISOString() });
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-end justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Agent Builder</h1>
            <p className="text-sm text-muted-foreground font-mono">
              Prompts · Tools · Memory · Schedules · Live preview
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={!dirty}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {dirty ? "Save" : "Saved"}
          </button>
          <button
            onClick={run}
            disabled={!selected}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Play className="h-4 w-4" /> Run now
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
          <AgentEditor value={selected} onChange={update} />
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
    </div>
  );
}
