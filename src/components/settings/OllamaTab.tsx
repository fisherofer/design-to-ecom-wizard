/** Ollama tab: detect installed models + recommend curated set. */
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import {
  CATEGORY_LABELS,
  discoverModels,
  type DiscoveredModel,
} from "@/lib/modelDiscovery";

const RECOMMENDED = [
  { id: "gemma2:9b", desc: "Google Gemma 2 — balanced general chat", size: "5.4 GB" },
  { id: "gemma2:27b", desc: "Gemma 2 large — deep reasoning", size: "16 GB" },
  { id: "llama3.1:8b", desc: "Meta Llama 3.1 — fast generalist", size: "4.7 GB" },
  { id: "qwen2.5-coder:7b", desc: "Qwen Coder — best small code model", size: "4.4 GB" },
  { id: "qwen2.5-coder:32b", desc: "Qwen Coder XL — production-grade code", size: "19 GB" },
  { id: "deepseek-coder-v2:16b", desc: "DeepSeek Coder v2 — code reasoning", size: "9.1 GB" },
  { id: "mistral-nemo:12b", desc: "Mistral Nemo — multilingual", size: "7.1 GB" },
  { id: "nomic-embed-text", desc: "Embeddings for RAG", size: "274 MB" },
  { id: "llava:13b", desc: "Vision (chart screenshots)", size: "8 GB" },
];

export function OllamaTab() {
  const [installed, setInstalled] = useState<DiscoveredModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = "http://localhost:11434";

  async function refresh() {
    setLoading(true); setError(null);
    const res = await discoverModels("ollama", "");
    if (res.ok) setInstalled(res.models);
    else { setError(res.error ?? "Cannot reach Ollama"); setInstalled([]); }
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);
  const installedIds = new Set(installed.map((m) => m.id));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Ollama Engine</h2>
            <p className="mt-1 text-sm text-muted-foreground">Local model runtime · <span className="font-mono">{endpoint}</span></p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <div className="font-medium">Ollama unreachable.</div>
            <div className="mt-1 text-muted-foreground">
              Install from <span className="font-mono">ollama.com</span> and run <span className="font-mono">ollama serve</span>. Then refresh.
            </div>
          </div>
        )}

        <div className="mt-5">
          <div className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Installed ({installed.length})
          </div>
          {installed.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-surface/50 p-6 text-center text-sm text-muted-foreground">
              No models detected.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {installed.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-success/30 bg-success/5 p-3">
                  <span className="font-mono text-xs">{m.id}</span>
                  <span className="rounded-sm bg-success/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">
                    {CATEGORY_LABELS[m.category]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Recommended Models</h2>
        <p className="mt-1 text-sm text-muted-foreground">Run the command in your terminal to install. Click ⧉ to copy.</p>
        <div className="mt-5 grid gap-2">
          {RECOMMENDED.map((m) => {
            const cmd = `ollama pull ${m.id}`;
            const isInstalled = installedIds.has(m.id);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3">
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{m.id}</span>
                    {isInstalled && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{m.desc}</div>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{m.size}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(cmd)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] hover:bg-surface-elevated"
                  title="Copy install command"
                >
                  ⧉ {cmd}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
