/**
 * AgentList — left rail listing all blueprints with status dots.
 */
import { Bot, Plus, Trash2 } from "lucide-react";
import type { AgentBlueprint } from "@/lib/agentBuilder";

export function AgentList({
  items, selectedId, onSelect, onCreate, onDelete,
}: {
  items: AgentBlueprint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-xs font-mono uppercase text-muted-foreground">Agents ({items.length})</span>
        <button onClick={onCreate} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
          <Plus className="h-3 w-3" /> New
        </button>
      </div>
      <ul className="max-h-[60vh] overflow-y-auto">
        {items.map((a) => (
          <li
            key={a.id}
            className={`flex cursor-pointer items-center gap-2 border-b border-border/50 p-3 hover:bg-surface ${selectedId === a.id ? "bg-surface" : ""}`}
            onClick={() => onSelect(a.id)}
          >
            <Bot className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{a.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{a.role}</div>
            </div>
            <span className={`h-2 w-2 rounded-full ${a.status === "running" ? "bg-success" : a.status === "error" ? "bg-destructive" : "bg-muted-foreground/40"}`} />
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(a.id); }}
              className="text-muted-foreground hover:text-destructive"
            ><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
