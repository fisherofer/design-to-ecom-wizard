/**
 * Provider Connectors Tab
 * =======================
 * Manage LLM + Data connectors by category, run a live pick simulation
 * against the Compute Router, and probe reachability.
 * Includes an AI-assisted "Add source" flow that suggests category, cost
 * tier, free-tier limits and default model from a name + URL.
 */
import { useMemo, useState } from "react";
import {
  Activity,
  Cloud,
  Cpu,
  Database,
  Globe,
  Newspaper,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  providerRegistry,
  useProviderRegistry,
  pickConnector,
  execute,
} from "@/lib/providerRegistry";
import {
  CATEGORY_LABELS,
  type ConnectorCategory,
  type ConnectorConfig,
} from "@/lib/providerConnectors";
import type { TaskProfile } from "@/lib/computeRouter";
import { analyzeProvider, type ProviderAnalysis } from "@/lib/analyzeProvider.functions";
import { useServerFn } from "@tanstack/react-start";
import { rateLimits } from "@/lib/rateLimits";
import { apiBudget } from "@/lib/apiBudget";

const CATEGORY_ICONS: Record<string, typeof Cpu> = {
  "llm.local":   Cpu,
  "llm.cloud":   Cloud,
  "llm.custom":  Globe,
  "data.market": Database,
  "data.news":   Newspaper,
  "data.custom": Globe,
};

const CATEGORIES: ConnectorCategory[] = [
  "llm.local", "llm.cloud", "llm.custom",
  "data.market", "data.news", "data.custom",
];

export function ProviderConnectorsTab() {
  const { connectors, health } = useProviderRegistry();
  const [simTask, setSimTask] = useState<TaskProfile>("reasoning");
  const [simCat, setSimCat] = useState<ConnectorCategory>("llm.cloud");
  const [simResult, setSimResult] = useState<ReturnType<typeof pickConnector> | null>(null);
  const [testOut, setTestOut] = useState<string>("");

  const grouped = useMemo(() => {
    const g: Record<string, ConnectorConfig[]> = {};
    for (const c of connectors) (g[c.category] ??= []).push(c);
    return g;
  }, [connectors]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Provider Connectors</h2>
          <p className="text-sm text-muted-foreground">
            Physical adapters the Compute Router uses to reach LLMs and data feeds.
            Configure once — routing is automatic.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => providerRegistry.probeAll()}>
            <Activity className="h-4 w-4 mr-1" /> Probe all
          </Button>
          <Button variant="outline" size="sm" onClick={() => providerRegistry.reset()}>
            Reset
          </Button>
        </div>
      </header>

      {/* Live pick simulator */}
      <section className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" /> Live pick simulator
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            value={simCat} onChange={(e) => setSimCat(e.target.value as ConnectorCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <select className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            value={simTask} onChange={(e) => setSimTask(e.target.value as TaskProfile)}>
            {(["chat","reasoning","code","vision","trading_signal","summarize","translate"] as TaskProfile[])
              .map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setSimResult(pickConnector(simCat, { task: simTask }))}>
              <Zap className="h-4 w-4 mr-1" /> Pick
            </Button>
            <Button size="sm" variant="outline" onClick={async () => {
              const r = await execute(simCat, { prompt: "Say hello in 5 words.", symbol: "AAPL" }, { task: simTask });
              setTestOut(JSON.stringify({ ok: r.ok, provider: r.provider, ms: r.latencyMs, cost: r.costUsd, text: r.text, error: r.error, data: r.data ? "…" : undefined }, null, 2));
            }}>
              Invoke
            </Button>
          </div>
        </div>
        {simResult && (
          <div className="rounded-md bg-muted/40 p-2 text-xs font-mono space-y-1">
            <div className="text-primary">{simResult.reason}</div>
            {simResult.trace.map((t, i) => <div key={i} className="text-muted-foreground">· {t}</div>)}
          </div>
        )}
        {testOut && (
          <pre className="rounded-md bg-muted/40 p-2 text-xs overflow-x-auto max-h-48">{testOut}</pre>
        )}
      </section>

      {/* Categories */}
      {CATEGORIES.map((cat) => {
        const Icon = CATEGORY_ICONS[cat];
        const items = grouped[cat] ?? [];
        return (
          <section key={cat} className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Icon className="h-4 w-4" /> {CATEGORY_LABELS[cat]}
                <span className="text-xs text-muted-foreground">({items.length})</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => {
                const id = prompt("Connector id (unique):");
                if (!id) return;
                providerRegistry.upsert({
                  id, name: id, family: cat.startsWith("llm.") ? "llm" : "data",
                  category: cat, baseUrl: "", enabled: true, priority: 5,
                });
              }}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((c) => <ConnectorRow key={c.id} c={c} h={health[c.id]} />)}
              {!items.length && <div className="text-xs text-muted-foreground">No connectors yet.</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ConnectorRow({ c, h }: { c: ConnectorConfig; h?: { online: boolean; latencyMs: number; detail?: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border/50 bg-background/40">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
        <span className={`h-2 w-2 rounded-full ${h?.online ? "bg-emerald-500" : h ? "bg-red-500" : "bg-muted-foreground/40"}`} />
        <span className="text-sm font-medium flex-1">{c.name}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{c.id}</span>
        <label className="flex items-center gap-1 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={c.enabled}
            onChange={(e) => providerRegistry.upsert({ id: c.id, enabled: e.target.checked })} />
          on
        </label>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Base URL" value={c.baseUrl}
              onChange={(v) => providerRegistry.upsert({ id: c.id, baseUrl: v })} />
            <Field label="API Key" value={c.apiKey ?? ""} type="password"
              onChange={(v) => providerRegistry.upsert({ id: c.id, apiKey: v })} />
            {c.family === "llm" && (
              <Field label="Model" value={c.model ?? ""}
                onChange={(v) => providerRegistry.upsert({ id: c.id, model: v })} />
            )}
            <Field label="Priority (lower = preferred)" value={String(c.priority)} type="number"
              onChange={(v) => providerRegistry.upsert({ id: c.id, priority: Number(v) || 5 })} />
            <Field label="Cost per 1k tokens (USD)" value={String(c.costPer1kUsd ?? 0)} type="number"
              onChange={(v) => providerRegistry.upsert({ id: c.id, costPer1kUsd: Number(v) || 0 })} />
          </div>
          {c.notes && <div className="text-muted-foreground italic">{c.notes}</div>}
          {h && (
            <div className="text-muted-foreground">
              Health: {h.online ? "online" : "offline"} · {h.latencyMs}ms · {h.detail}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => providerRegistry.probe(c.id)}>
              <RefreshCw className="h-3 w-3 mr-1" /> Probe
            </Button>
            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => providerRegistry.remove(c.id)}>
              <Trash2 className="h-3 w-3 mr-1" /> Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
      />
    </label>
  );
}
