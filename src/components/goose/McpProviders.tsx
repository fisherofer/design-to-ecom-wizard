import { useEffect, useState } from "react";
import { Bird, Terminal, Package, Cpu, Zap, Boxes, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getApiBase } from "@/lib/apiConfig";

/**
 * McpProviders — Multi-provider MCP awareness panel.
 * Detects which coding/agent runtime the backend is currently proxying
 * (Goose, OpenCode, Cline, Ollama, bolt.diy…). All detection is done
 * server-side via GET {API_BASE}/api/mcp/providers. Falls back to a
 * curated catalog when the backend is offline.
 */

type ProviderKind = "coder" | "runtime" | "toolchain";

interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  icon: typeof Bird;
  detail: string;
  repo?: string;
  status: "online" | "offline" | "unknown";
  version?: string;
  models?: string[];
}

const CATALOG: Provider[] = [
  { id: "goose",    name: "Goose",     kind: "coder",     icon: Bird,     detail: "Block's MCP agent runtime",             repo: "block/goose",         status: "unknown" },
  { id: "opencode", name: "OpenCode",  kind: "coder",     icon: Terminal, detail: "Open-source Claude Code alternative",   repo: "opencode-ai/opencode", status: "unknown" },
  { id: "cline",    name: "Cline",     kind: "coder",     icon: Zap,      detail: "Autonomous coding agent (VSCode)",      repo: "cline/cline",         status: "unknown" },
  { id: "boltdiy",  name: "bolt.diy",  kind: "coder",     icon: Boxes,    detail: "Self-hosted Bolt fork (multi-LLM)",     repo: "stackblitz-labs/bolt.diy", status: "unknown" },
  { id: "ollama",   name: "Ollama",    kind: "runtime",   icon: Cpu,      detail: "Local LLM runtime · 11434",             repo: "ollama/ollama",       status: "unknown" },
  { id: "venv",     name: "Python venv", kind: "toolchain", icon: Package, detail: "Isolated Python env for backend",     status: "unknown" },
  { id: "docker",   name: "Docker",    kind: "toolchain", icon: Package,  detail: "Container runtime for services",        status: "unknown" },
];

export function McpProviders() {
  const [providers, setProviders] = useState<Provider[]>(CATALOG);
  const [loading, setLoading] = useState(false);

  const scan = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/mcp/providers`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { providers: Partial<Provider>[] };
      setProviders(CATALOG.map((c) => {
        const hit = data.providers.find((p) => p.id === c.id);
        return hit ? { ...c, ...hit } : c;
      }));
    } catch {
      // keep catalog with unknown status
    } finally { setLoading(false); }
  };

  useEffect(() => { void scan(); }, []);

  const groups: Record<ProviderKind, Provider[]> = {
    coder: providers.filter((p) => p.kind === "coder"),
    runtime: providers.filter((p) => p.kind === "runtime"),
    toolchain: providers.filter((p) => p.kind === "toolchain"),
  };

  return (
    <section className="rounded-xl border border-border glass p-5" dir="ltr">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            MCP Providers & Runtimes
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground font-mono">
            GET {`${getApiBase()}/api/mcp/providers`}
          </p>
        </div>
        <button
          onClick={scan}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs font-mono uppercase tracking-wider hover:bg-card"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Rescan"}
        </button>
      </div>

      {(["coder", "runtime", "toolchain"] as ProviderKind[]).map((k) => (
        <div key={k} className="mb-4 last:mb-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            {k === "coder" ? "Coding Agents" : k === "runtime" ? "Model Runtimes" : "Toolchain"}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {groups[k].map((p) => (
              <ProviderCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ProviderCard({ p }: { p: Provider }) {
  const Icon = p.icon;
  const StatusIcon = p.status === "online" ? CheckCircle2 : p.status === "offline" ? XCircle : Loader2;
  return (
    <div className={cn(
      "rounded-lg border p-3 transition-colors",
      p.status === "online" ? "border-success/40 bg-success/5" :
      p.status === "offline" ? "border-border bg-card/30 opacity-60" :
      "border-border bg-card/40",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{p.name}</div>
            <div className="text-[10px] font-mono text-muted-foreground truncate">
              {p.version ?? p.repo ?? "—"}
            </div>
          </div>
        </div>
        <StatusIcon className={cn(
          "h-3.5 w-3.5 shrink-0",
          p.status === "online" && "text-success",
          p.status === "offline" && "text-muted-foreground",
          p.status === "unknown" && "text-warning",
        )} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{p.detail}</p>
      {p.models && p.models.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.models.slice(0, 4).map((m) => (
            <span key={m} className="rounded border border-border bg-card/60 px-1.5 py-0.5 text-[9px] font-mono">
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
