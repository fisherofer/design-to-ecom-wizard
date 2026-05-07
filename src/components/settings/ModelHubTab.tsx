/**
 * ModelHubTab — Browse Hugging Face & friends with policy filtering and
 * conflict detection vs locally installed Ollama models.
 */
import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { searchHuggingFace, type HubModel, HUB_LABELS } from "@/lib/modelHub";
import { applyPolicy, loadPolicy } from "@/lib/modelFilters";
import { detectConflicts } from "@/lib/modelConflicts";
import { discoverModels, type DiscoveredModel } from "@/lib/modelDiscovery";

const TASKS = ["text-generation", "text-to-image", "feature-extraction", "image-text-to-text", "automatic-speech-recognition"];

export function ModelHubTab() {
  const [query, setQuery] = useState("llama");
  const [task, setTask] = useState<string>("text-generation");
  const [models, setModels] = useState<HubModel[]>([]);
  const [installed, setInstalled] = useState<DiscoveredModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true); setErr(null);
    try {
      const [hub, ollama] = await Promise.all([
        searchHuggingFace({ query, task, limit: 30 }),
        discoverModels("ollama", ""),
      ]);
      setModels(hub);
      setInstalled(ollama.models);
    } catch (e) { setErr(e instanceof Error ? e.message : "search failed"); }
    setLoading(false);
  }
  useEffect(() => { run(); /* eslint-disable-next-line */ }, []);

  const policy = loadPolicy();
  const filtered = useMemo(() => applyPolicy(models, policy), [models, policy]);
  const conflicts = useMemo(() => detectConflicts(models, installed), [models, installed]);
  const conflictById = new Map(conflicts.map((c) => [c.hub.id, c]));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Search Hugging Face…"
              className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <select
            value={task}
            onChange={(e) => setTask(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {TASKS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Source: {HUB_LABELS.huggingface} · Filters from <span className="font-mono">Model Filters</span> tab applied below.
        </div>
        {err && <div className="mt-2 text-xs text-destructive">{err}</div>}
      </div>

      <div className="grid gap-2">
        {filtered.map(({ model, passed, reasons, aiScore }) => {
          const c = conflictById.get(model.id);
          return (
            <div key={model.id} className={`rounded-md border p-3 ${passed ? "border-border bg-card" : "border-destructive/30 bg-destructive/5"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{model.id}</span>
                <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{model.task}</span>
                <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">{model.origin}</span>
                {model.license && <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">{model.license}</span>}
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  ↓ {model.downloads?.toLocaleString() ?? 0} · ♥ {model.likes ?? 0}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${aiScore >= 70 ? "bg-success/20 text-success" : aiScore >= 50 ? "bg-warning/20 text-warning" : "bg-destructive/20 text-destructive"}`}>
                  AI {aiScore}
                </span>
              </div>
              {!passed && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-destructive">
                  <ShieldAlert className="h-3 w-3" /> Blocked: {reasons.join(", ")}
                </div>
              )}
              {c && c.kind !== "ok" && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-warning">
                  <AlertTriangle className="h-3 w-3" /> {c.recommendation}
                </div>
              )}
              {c?.kind === "ok" && passed && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-success">
                  <CheckCircle2 className="h-3 w-3" /> {c.recommendation}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
