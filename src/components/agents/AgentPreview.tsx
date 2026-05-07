/**
 * AgentPreview — live preview of compiled prompts + next run estimate.
 */
import { useMemo } from "react";
import type { AgentBlueprint } from "@/lib/agentBuilder";

export function AgentPreview({ value, taskInput }: { value: AgentBlueprint; taskInput: string }) {
  const compiled = useMemo(
    () => value.userPromptTemplate
      .replaceAll("{{task}}", taskInput || "(empty)")
      .replaceAll("{{context}}", "[live context will be injected at runtime]"),
    [value.userPromptTemplate, taskInput],
  );

  const next = useMemo(() => {
    if (value.schedule.kind === "manual") return "manual trigger only";
    if (value.schedule.kind === "interval") return `every ${value.schedule.everyMinutes}m · next ≈ ${value.schedule.everyMinutes}m`;
    return `cron: ${value.schedule.expr}`;
  }, [value.schedule]);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-5">
      <div className="text-xs font-mono uppercase text-muted-foreground">Live preview</div>
      <div className="rounded-md bg-background p-3 font-mono text-[11px] leading-relaxed">
        <div className="text-muted-foreground">// system</div>
        <pre className="whitespace-pre-wrap text-foreground">{value.systemPrompt}</pre>
        <div className="mt-3 text-muted-foreground">// user</div>
        <pre className="whitespace-pre-wrap text-foreground">{compiled}</pre>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Model" value={value.model} />
        <Stat label="Memory" value={value.memory} />
        <Stat label="Tools" value={value.tools.join(", ") || "—"} />
        <Stat label="Schedule" value={next} />
        <Stat label="Temp / Max" value={`${value.temperature} · ${value.maxTokens}`} />
        <Stat label="Status" value={value.status} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-surface p-2">
      <div className="text-[9px] font-mono uppercase text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-foreground">{value}</div>
    </div>
  );
}
