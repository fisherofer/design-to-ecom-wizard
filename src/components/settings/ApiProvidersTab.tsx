/** API Providers tab: keys, Discovery, categorized model list. */
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  PROVIDER_LABELS,
  discoverModels,
  type DiscoveredModel,
  type DiscoveryResult,
  type ModelCategory,
  type ProviderId,
} from "@/lib/modelDiscovery";

const STORAGE_KEYS = "ai-os.settings.providerKeys";
const STORAGE_DISCOVERED = "ai-os.settings.discoveredModels";

type ProviderKeys = Partial<Record<ProviderId, string>>;

export function ApiProvidersTab() {
  const [keys, setKeys] = useState<ProviderKeys>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS) ?? "{}"); } catch { return {}; }
  });
  const [discovering, setDiscovering] = useState<ProviderId | null>(null);
  const [results, setResults] = useState<Partial<Record<ProviderId, DiscoveryResult>>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(STORAGE_DISCOVERED) ?? "{}"); } catch { return {}; }
  });
  const [filter, setFilter] = useState<ModelCategory | "ALL">("ALL");

  function persistKeys(next: ProviderKeys) {
    setKeys(next);
    localStorage.setItem(STORAGE_KEYS, JSON.stringify(next));
  }
  function persistResults(next: typeof results) {
    setResults(next);
    localStorage.setItem(STORAGE_DISCOVERED, JSON.stringify(next));
  }

  async function runDiscovery(provider: ProviderId) {
    setDiscovering(provider);
    const result = await discoverModels(provider, keys[provider] ?? "");
    persistResults({ ...results, [provider]: result });
    setDiscovering(null);
  }
  async function discoverAll() {
    for (const p of Object.keys(PROVIDER_LABELS) as ProviderId[]) await runDiscovery(p);
  }

  const providers = Object.keys(PROVIDER_LABELS) as ProviderId[];
  const allModels: DiscoveredModel[] = useMemo(
    () => Object.values(results).flatMap((r) => r?.models ?? []),
    [results],
  );
  const byCategory = useMemo(() => {
    const map: Record<ModelCategory, DiscoveredModel[]> = {
      chat: [], code: [], vision: [], embedding: [], reasoning: [], image: [],
    };
    for (const m of allModels) map[m.category].push(m);
    return map;
  }, [allModels]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold">Provider API Keys</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Keys are stored in your browser only. "Discover" asks each provider which models its key supports.
            </p>
          </div>
          <button
            onClick={discoverAll}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
          >
            <Sparkles className="h-4 w-4" /> Discover All
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {providers.map((p) => {
            const result = results[p];
            const isOllama = p === "ollama";
            return (
              <div key={p} className="rounded-md border border-border bg-surface p-4">
                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="font-medium">{PROVIDER_LABELS[p]}</div>
                    <div className="mt-0.5 text-[11px] font-mono uppercase text-muted-foreground">{p}</div>
                  </div>
                  <input
                    type={isOllama ? "text" : "password"}
                    placeholder={isOllama ? "(no key needed — local)" : `${p} API key`}
                    value={keys[p] ?? ""}
                    disabled={isOllama}
                    onChange={(e) => persistKeys({ ...keys, [p]: e.target.value })}
                    className="min-w-0 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={() => runDiscovery(p)}
                    disabled={discovering === p}
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
                  >
                    {discovering === p ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Discover
                  </button>
                </div>
                {result && (
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    {result.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-warning" />}
                    <span className={cn("font-mono", result.ok ? "text-success" : "text-warning")}>
                      {result.ok ? `${result.models.length} models live` : `Curated fallback (${result.models.length}) — ${result.error ?? "blocked"}`}
                    </span>
                    <span className="text-muted-foreground">· {result.endpoint || "n/a"}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

       {allModels.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Discovered Models ({allModels.length})</h2>
              <p className="mt-1 text-sm text-muted-foreground">Auto-categorized so the internal AI router can dispatch by use-case.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterPill active={filter === "ALL"} onClick={() => setFilter("ALL")}>All</FilterPill>
              {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((c) => (
                <FilterPill key={c} active={filter === c} onClick={() => setFilter(c)}>
                  {CATEGORY_LABELS[c]} ({byCategory[c].length})
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allModels.filter((m) => filter === "ALL" || m.category === filter).map((m) => (
              <div key={`${m.provider}/${m.id}`} className="flex items-start justify-between rounded-md border border-border bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-xs">{m.id}</span>
                    {m.recommended && <span className="rounded-sm bg-primary/15 px-1 text-[9px] font-bold uppercase text-primary">rec</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono uppercase">{m.provider}</span>
                    <span>·</span>
                    <span>{CATEGORY_LABELS[m.category]}</span>
                    {m.contextWindow && (<><span>·</span><span>{(m.contextWindow / 1000).toFixed(0)}k ctx</span></>)}
                  </div>
                </div>
                <span className={cn("ml-2 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase", m.source === "live" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                  {m.source}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
