import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cpu, Cloud, Layers, RefreshCw, HardDrive, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  TOKEN_PRIORITY_HIERARCHY,
  LOCAL_MODEL_CATALOG,
  CLOUD_MODEL_CATALOG,
  getLocalAiSettings,
  setLocalAiSettings,
  type LocalAiRuntimeSettings,
} from "@/data/localAiCatalog";
import { getQuantApiBase } from "@/lib/apiConfig";

export const Route = createFileRoute("/ai-models")({
  head: () => ({
    meta: [
      { title: "AI Model Catalog — Local, PC & Cloud Tiers" },
      {
        name: "description",
        content:
          "Token-priority hierarchy, curated local Ollama/LM Studio model catalog and cloud fallback models for the trading desk.",
      },
      { property: "og:title", content: "AI Model Catalog — Local, PC & Cloud Tiers" },
      {
        property: "og:description",
        content: "Local-first model routing: sovereign local AI, GPU offload and controlled cloud failover.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiModelsPage,
});

interface InstalledState {
  loading: boolean;
  installed: string[];
  error?: string;
}

function AiModelsPage() {
  const [settings, setSettings] = useState<LocalAiRuntimeSettings>(getLocalAiSettings());
  const [state, setState] = useState<InstalledState>({ loading: true, installed: [] });

  const probe = async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${getQuantApiBase()}/api/local-ai/models`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`hub returned ${res.status}`);
      const json = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
      const names = (json.models ?? []).map((m) => (m.name ?? m.model ?? "").trim()).filter(Boolean);
      setState({ loading: false, installed: names });
    } catch (e) {
      setState({ loading: false, installed: [], error: (e as Error).message });
    }
  };

  useEffect(() => {
    void probe();
  }, []);

  const update = (patch: Partial<LocalAiRuntimeSettings>) => setSettings(setLocalAiSettings(patch));

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Cpu className="h-5 w-5 text-primary" />
            קטלוג מודלים
          </h1>
          <p className="text-sm text-muted-foreground">
            היררכיית עדיפות טוקנים: מקומי → האצת חומרה → ענן. הקטלוג יובא מהמערכת הקודמת.
          </p>
        </div>
        <button
          onClick={() => void probe()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className={state.loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          בדוק מה מותקן
        </button>
      </header>

      <section className="grid gap-3 lg:grid-cols-3">
        {TOKEN_PRIORITY_HIERARCHY.map((t) => (
          <div key={t.id} className="rounded-xl border border-border glass p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Tier {t.tier}</span>
              {t.isPrimary && (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">ראשי</span>
              )}
            </div>
            <h2 className="mt-1 text-sm font-semibold">{t.nameHe}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t.descriptionHe}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">עלות / 1K</dt>
                <dd className="font-mono">${t.costPer1kTokens.toFixed(5)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">שיהוי</dt>
                <dd className="font-mono">{t.latency.replace(/_/g, " ")}</dd>
              </div>
            </dl>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {t.useCases.map((u) => (
                <li key={u}>• {u}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border glass p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <HardDrive className="h-4 w-4 text-primary" />
          מודלים מקומיים
        </h2>
        {state.error && (
          <p className="mt-2 flex items-center gap-2 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            אין חיבור לשרת המקומי ({state.error}) — מוצג הקטלוג בלבד, ללא מצב התקנה.
          </p>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-2 text-start">מודל</th>
                <th className="p-2 text-start">גודל</th>
                <th className="p-2 text-start">Context</th>
                <th className="p-2 text-start">Runtime</th>
                <th className="p-2 text-start">TPS</th>
                <th className="p-2 text-start">התאמה למסחר</th>
                <th className="p-2 text-start">מצב</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {LOCAL_MODEL_CATALOG.map((m) => {
                const installed = state.installed.some((n) => n.startsWith(m.id.split(":")[0]));
                const active = settings.selectedModelId === m.id;
                return (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="p-2">
                      <div className="font-medium">{m.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{m.id}</div>
                      <div className="text-xs text-muted-foreground">{m.descriptionHe}</div>
                    </td>
                    <td className="p-2 font-mono text-xs">{m.parameterSize}</td>
                    <td className="p-2 font-mono text-xs">{(m.contextWindow / 1024).toFixed(0)}K</td>
                    <td className="p-2 text-xs">{m.runtime}</td>
                    <td className="p-2 font-mono text-xs">{m.benchmarkTps}</td>
                    <td className="p-2 font-mono text-xs">{m.fitScoreForTrading}</td>
                    <td className="p-2 text-xs">
                      {state.loading ? (
                        <span className="text-muted-foreground">בודק…</span>
                      ) : installed ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> מותקן
                        </span>
                      ) : (
                        <span className="text-muted-foreground">לא מותקן</span>
                      )}
                    </td>
                    <td className="p-2 text-end">
                      <button
                        onClick={() => update({ selectedModelId: m.id, contextWindow: m.contextWindow })}
                        className={
                          active
                            ? "rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                            : "rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                        }
                      >
                        {active ? "פעיל" : "בחר"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border glass p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Cloud className="h-4 w-4 text-primary" />
            גיבוי ענן (Tier 3)
          </h2>
          <ul className="mt-3 space-y-2">
            {CLOUD_MODEL_CATALOG.map((c) => (
              <li key={c.id} className="rounded-lg border border-border/60 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{c.id}</div>
                  </div>
                  <button
                    onClick={() => update({ cloudFallbackModelId: c.id })}
                    className={
                      settings.cloudFallbackModelId === c.id
                        ? "rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                        : "rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    }
                  >
                    {settings.cloudFallbackModelId === c.id ? "ברירת מחדל" : "קבע"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{c.useCase} · {c.recommendation}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border glass p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-primary" />
            תצורת ריצה מקומית
          </h2>
          <div className="mt-3 grid gap-3 text-sm">
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Endpoint</span>
              <input
                value={settings.endpointUrl}
                onChange={(e) => update({ endpointUrl: e.target.value })}
                className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Temperature</span>
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  value={settings.temperature}
                  onChange={(e) => update({ temperature: Number(e.target.value) })}
                  className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Max tokens</span>
                <input
                  type="number"
                  value={settings.maxTokens}
                  onChange={(e) => update({ maxTokens: Number(e.target.value) })}
                  className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">GPU layers</span>
                <input
                  type="number"
                  value={settings.gpuOffloadLayers}
                  onChange={(e) => update({ gpuOffloadLayers: Number(e.target.value) })}
                  className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Threads</span>
                <input
                  type="number"
                  value={settings.threads}
                  onChange={(e) => update({ threads: Number(e.target.value) })}
                  className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={settings.fallbackToCloud}
                onChange={(e) => update({ fallbackToCloud: e.target.checked })}
              />
              אפשר נפילה לענן כשהשרת המקומי מנותק
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
