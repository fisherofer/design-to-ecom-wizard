/**
 * AgentTemplatesModal — pick a curated preset and clone it into a new agent.
 */
import { X } from "lucide-react";
import { AGENT_TEMPLATES, type AgentTemplate } from "@/lib/agentTemplates";

export function AgentTemplatesModal({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (tpl: AgentTemplate) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="font-display text-lg font-semibold">Agent Templates</h3>
            <p className="text-xs text-muted-foreground">Clone a curated preset as a starting point.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid max-h-[70vh] gap-2 overflow-y-auto p-4 sm:grid-cols-2">
          {AGENT_TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => { onPick(t); onClose(); }}
              className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-surface"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{t.label}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono uppercase text-muted-foreground">
                  {t.category}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t.description}</p>
              <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-mono text-muted-foreground">
                <span>{t.blueprint.model}</span>
                <span>·</span>
                <span>{t.blueprint.tools.join(", ")}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
