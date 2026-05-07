/**
 * AgentEditor — form for editing a single AgentBlueprint.
 * Pure presentation; bubbles changes up via onChange.
 */
import type { AgentBlueprint, Schedule } from "@/lib/agentBuilder";
import { ALL_TOOLS } from "@/lib/agentBuilder";
import type { AgentTool } from "@/lib/agents";

export function AgentEditor({
  value, onChange,
}: { value: AgentBlueprint; onChange: (next: AgentBlueprint) => void }) {
  const v = value;
  const set = <K extends keyof AgentBlueprint>(k: K, val: AgentBlueprint[K]) => onChange({ ...v, [k]: val });

  function toggleTool(t: AgentTool) {
    set("tools", v.tools.includes(t) ? v.tools.filter((x) => x !== t) : [...v.tools, t]);
  }

  function setSchedule(s: Schedule) { set("schedule", s); }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name"><input value={v.name} onChange={(e) => set("name", e.target.value)} className={inp} /></Field>
        <Field label="Role"><input value={v.role} onChange={(e) => set("role", e.target.value)} className={inp} /></Field>
        <Field label="Model"><input value={v.model} onChange={(e) => set("model", e.target.value)} className={inp} /></Field>
        <Field label="Memory">
          <select value={v.memory} onChange={(e) => set("memory", e.target.value as AgentBlueprint["memory"])} className={inp}>
            <option value="ephemeral">ephemeral</option>
            <option value="session">session</option>
            <option value="persistent">persistent</option>
          </select>
        </Field>
      </div>

      <Field label="Goal"><textarea value={v.goal} onChange={(e) => set("goal", e.target.value)} className={`${inp} min-h-[60px]`} /></Field>
      <Field label="System prompt"><textarea value={v.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} className={`${inp} min-h-[120px] font-mono text-xs`} /></Field>
      <Field label="User prompt template ({{task}}, {{context}})">
        <textarea value={v.userPromptTemplate} onChange={(e) => set("userPromptTemplate", e.target.value)} className={`${inp} min-h-[80px] font-mono text-xs`} />
      </Field>

      <Field label="Tools">
        <div className="flex flex-wrap gap-1.5">
          {ALL_TOOLS.map((t) => (
            <button
              key={t}
              onClick={() => toggleTool(t)}
              className={`rounded border px-2 py-1 text-xs ${v.tools.includes(t) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >{t}</button>
          ))}
        </div>
      </Field>

      <Field label="Schedule">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={v.schedule.kind}
            onChange={(e) => {
              const k = e.target.value as Schedule["kind"];
              setSchedule(k === "manual" ? { kind: "manual" } : k === "interval" ? { kind: "interval", everyMinutes: 15 } : { kind: "cron", expr: "*/15 * * * *" });
            }}
            className={inp}
          >
            <option value="manual">manual</option>
            <option value="interval">interval</option>
            <option value="cron">cron</option>
          </select>
          {v.schedule.kind === "interval" && (
            <input
              type="number" min={1}
              value={v.schedule.everyMinutes}
              onChange={(e) => setSchedule({ kind: "interval", everyMinutes: Number(e.target.value) })}
              className={`${inp} w-28`}
            />
          )}
          {v.schedule.kind === "cron" && (
            <input
              value={v.schedule.expr}
              onChange={(e) => setSchedule({ kind: "cron", expr: e.target.value })}
              className={`${inp} font-mono text-xs`}
              placeholder="*/15 * * * *"
            />
          )}
        </div>
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label={`Temperature (${v.temperature})`}>
          <input type="range" min={0} max={2} step={0.1} value={v.temperature} onChange={(e) => set("temperature", Number(e.target.value))} className="w-full" />
        </Field>
        <Field label="Max tokens">
          <input type="number" value={v.maxTokens} onChange={(e) => set("maxTokens", Number(e.target.value))} className={inp} />
        </Field>
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-mono uppercase text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
