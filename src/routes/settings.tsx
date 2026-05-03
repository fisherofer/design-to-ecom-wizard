import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Settings as SettingsIcon,
  Cpu,
  KeyRound,
  Github,
  Palette,
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  Download,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  discoverModels,
  PROVIDER_LABELS,
  CATEGORY_LABELS,
  type DiscoveredModel,
  type DiscoveryResult,
  type ProviderId,
  type ModelCategory,
} from "@/lib/modelDiscovery";
import {
  applyTheme,
  DEFAULT_TOKENS,
  exportTheme,
  importTheme,
  loadTheme,
  resetTheme,
  saveTheme,
  type ThemeTokens,
} from "@/theme/tokens";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AI Executive OS" },
      {
        name: "description",
        content:
          "Manage providers, discover models, configure Ollama, GitHub sync, and theme tokens.",
      },
    ],
  }),
  component: SettingsPage,
});

type TabId = "general" | "api" | "ollama" | "github" | "theme";

const TABS: Array<{ id: TabId; label: string; Icon: typeof SettingsIcon }> = [
  { id: "general", label: "General", Icon: SettingsIcon },
  { id: "api", label: "API Providers", Icon: KeyRound },
  { id: "ollama", label: "Ollama Manager", Icon: Cpu },
  { id: "github", label: "GitHub", Icon: Github },
  { id: "theme", label: "Theme", Icon: Palette },
];

function SettingsPage() {
  const [tab, setTab] = useState<TabId>("api");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Providers · Local Models · GitHub Sync · Theme Engine
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "general" && <GeneralTab />}
      {tab === "api" && <ApiProvidersTab />}
      {tab === "ollama" && <OllamaTab />}
      {tab === "github" && <GithubTab />}
      {tab === "theme" && <ThemeTab />}
    </div>
  );
}

// ====================================================================
// GENERAL
// ====================================================================
function GeneralTab() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-lg font-semibold">General</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Application-wide preferences. Use the dedicated tabs to manage providers,
        Ollama, GitHub, and theme.
      </p>
      <div className="mt-4 grid gap-3 text-sm">
        <Row label="Backend URL" value="http://localhost:8000" />
        <Row label="Theme storage" value="localStorage · ai-os.theme.tokens" />
        <Row label="Discovery mode" value="Browser-direct (CORS permitting) · curated fallback" />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

// ====================================================================
// API PROVIDERS — Discovery
// ====================================================================
const STORAGE_KEYS = "ai-os.settings.providerKeys";
const STORAGE_DISCOVERED = "ai-os.settings.discoveredModels";

type ProviderKeys = Partial<Record<ProviderId, string>>;

function ApiProvidersTab() {
  const [keys, setKeys] = useState<ProviderKeys>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS) ?? "{}") as ProviderKeys;
    } catch {
      return {};
    }
  });
  const [discovering, setDiscovering] = useState<ProviderId | null>(null);
  const [results, setResults] = useState<Partial<Record<ProviderId, DiscoveryResult>>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(STORAGE_DISCOVERED) ?? "{}");
    } catch {
      return {};
    }
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
    for (const p of Object.keys(PROVIDER_LABELS) as ProviderId[]) {
      await runDiscovery(p);
    }
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
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Provider API Keys</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Keys are stored in your browser only. Use "Discover" to ask each
              provider which models its key supports.
            </p>
          </div>
          <button
            onClick={discoverAll}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4" /> Discover All
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {providers.map((p) => {
            const result = results[p];
            const isOllama = p === "ollama";
            return (
              <div
                key={p}
                className="rounded-md border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[160px]">
                    <div className="font-medium">{PROVIDER_LABELS[p]}</div>
                    <div className="mt-0.5 text-[11px] font-mono uppercase text-muted-foreground">
                      {p}
                    </div>
                  </div>
                  <input
                    type={isOllama ? "text" : "password"}
                    placeholder={isOllama ? "(no key needed — local)" : `${p} API key`}
                    value={keys[p] ?? ""}
                    disabled={isOllama}
                    onChange={(e) => persistKeys({ ...keys, [p]: e.target.value })}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={() => runDiscovery(p)}
                    disabled={discovering === p}
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
                  >
                    {discovering === p ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    Discover
                  </button>
                </div>

                {result && (
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    {result.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-warning" />
                    )}
                    <span className={cn("font-mono", result.ok ? "text-success" : "text-warning")}>
                      {result.ok
                        ? `${result.models.length} models live`
                        : `Curated fallback (${result.models.length}) — ${result.error ?? "blocked"}`}
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
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">
                Discovered Models ({allModels.length})
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Auto-categorized so the internal AI router can dispatch by use-case.
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setFilter("ALL")}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs",
                  filter === "ALL"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
              {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs",
                    filter === c
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {CATEGORY_LABELS[c]} ({byCategory[c].length})
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allModels
              .filter((m) => filter === "ALL" || m.category === filter)
              .map((m) => (
                <div
                  key={`${m.provider}/${m.id}`}
                  className="flex items-start justify-between rounded-md border border-border bg-surface p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs">{m.id}</span>
                      {m.recommended && (
                        <span className="rounded-sm bg-primary/15 px-1 text-[9px] font-bold uppercase text-primary">
                          rec
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono uppercase">{m.provider}</span>
                      <span>·</span>
                      <span>{CATEGORY_LABELS[m.category]}</span>
                      {m.contextWindow && (
                        <>
                          <span>·</span>
                          <span>{(m.contextWindow / 1000).toFixed(0)}k ctx</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "ml-2 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase",
                      m.source === "live"
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
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

// ====================================================================
// OLLAMA
// ====================================================================
const OLLAMA_RECOMMENDED = [
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

function OllamaTab() {
  const [installed, setInstalled] = useState<DiscoveredModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [endpoint] = useState("http://localhost:11434");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    const res = await discoverModels("ollama", "");
    if (res.ok) setInstalled(res.models);
    else {
      setError(res.error ?? "Cannot reach Ollama");
      setInstalled([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const installedIds = new Set(installed.map((m) => m.id));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Ollama Engine</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Local model runtime · <span className="font-mono">{endpoint}</span>
            </p>
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
              Install from <span className="font-mono">ollama.com</span> and run{" "}
              <span className="font-mono">ollama serve</span>. Then refresh.
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
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-md border border-success/30 bg-success/5 p-3"
                >
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
        <p className="mt-1 text-sm text-muted-foreground">
          Run the command in your terminal to install. Click ⧉ to copy.
        </p>
        <div className="mt-5 grid gap-2">
          {OLLAMA_RECOMMENDED.map((m) => {
            const cmd = `ollama pull ${m.id}`;
            const isInstalled = installedIds.has(m.id);
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3"
              >
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{m.id}</span>
                    {isInstalled && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    )}
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

// ====================================================================
// GITHUB
// ====================================================================
const STORAGE_GITHUB = "ai-os.settings.github";

interface GithubConfig {
  pat: string;
  repoUrl: string;
  branch: string;
  autoSync: boolean;
}

function GithubTab() {
  const [cfg, setCfg] = useState<GithubConfig>(() => {
    if (typeof window === "undefined")
      return { pat: "", repoUrl: "", branch: "main", autoSync: false };
    try {
      return JSON.parse(localStorage.getItem(STORAGE_GITHUB) ?? "null") ?? {
        pat: "", repoUrl: "", branch: "main", autoSync: false,
      };
    } catch {
      return { pat: "", repoUrl: "", branch: "main", autoSync: false };
    }
  });
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  function update<K extends keyof GithubConfig>(key: K, value: GithubConfig[K]) {
    const next = { ...cfg, [key]: value };
    setCfg(next);
    localStorage.setItem(STORAGE_GITHUB, JSON.stringify(next));
  }

  async function testConnection() {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${cfg.pat}`, Accept: "application/vnd.github+json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus({ ok: true, msg: `Authenticated as @${data.login}` });
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Failed" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">GitHub Sync</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Personal Access Token (classic or fine-grained, with <code className="font-mono text-xs">repo</code> scope).
          Stored in browser only. Push/pull operations require your local backend
          to expose <span className="font-mono">/api/github/*</span> endpoints.
        </p>

        <div className="mt-5 grid gap-4">
          <Field label="Personal Access Token (PAT)">
            <input
              type="password"
              placeholder="github_pat_..."
              value={cfg.pat}
              onChange={(e) => update("pat", e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="Repository URL">
            <input
              type="text"
              placeholder="https://github.com/user/repo"
              value={cfg.repoUrl}
              onChange={(e) => update("repoUrl", e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Branch">
              <input
                type="text"
                value={cfg.branch}
                onChange={(e) => update("branch", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
              />
            </Field>
            <Field label="Auto-sync on save">
              <label className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  checked={cfg.autoSync}
                  onChange={(e) => update("autoSync", e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">Push every change automatically</span>
              </label>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={testConnection}
              disabled={!cfg.pat || testing}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Test Connection
            </button>
            {cfg.repoUrl && (
              <a
                href={cfg.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-elevated"
              >
                <Github className="h-4 w-4" /> View on GitHub
              </a>
            )}
          </div>

          {status && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                status.ok
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {status.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              <span className="font-mono">{status.msg}</span>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-info/30 bg-info/5 p-4 text-xs text-muted-foreground">
        <div className="font-medium text-info">Backend endpoints expected</div>
        <ul className="mt-2 space-y-1 font-mono">
          <li>POST /api/github/push — commits current source + pushes to {cfg.branch || "main"}</li>
          <li>POST /api/github/pull — pulls latest, returns conflict report</li>
          <li>GET /api/github/status — branch, ahead/behind, last commit</li>
        </ul>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

// ====================================================================
// THEME
// ====================================================================
const THEME_GROUPS: Array<{ title: string; keys: Array<keyof ThemeTokens> }> = [
  { title: "Surfaces", keys: ["background", "foreground", "surface", "surfaceElevated", "card"] },
  { title: "Brand", keys: ["primary", "primaryGlow", "accent"] },
  { title: "Semantic", keys: ["success", "warning", "destructive", "info"] },
  { title: "Sidebar & Terminal", keys: ["sidebar", "sidebarAccent", "terminalBg"] },
];

function ThemeTab() {
  const [tokens, setTokens] = useState<ThemeTokens>(() => loadTheme());
  const [importText, setImportText] = useState("");

  useEffect(() => {
    applyTheme(tokens);
    saveTheme(tokens);
  }, [tokens]);

  function update<K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) {
    setTokens((t) => ({ ...t, [key]: value }));
  }

  function handleExport() {
    const blob = new Blob([exportTheme(tokens)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `theme-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    try {
      setTokens(importTheme(importText));
      setImportText("");
    } catch {
      alert("Invalid JSON");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Theme Engine</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              All design tokens live in <span className="font-mono text-xs">src/theme/tokens.ts</span>.
              Changes here apply live and persist to localStorage so the AI can
              read & modify them without rebuilding.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated"
            >
              <Download className="h-4 w-4" /> Export
            </button>
            <button
              onClick={() => setTokens(resetTheme())}
              className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/15"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {THEME_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {group.title}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.keys.map((k) => (
                  <ColorRow
                    key={k}
                    label={k}
                    value={tokens[k] as string}
                    onChange={(v) => update(k, v as ThemeTokens[typeof k])}
                  />
                ))}
              </div>
            </div>
          ))}

          <div>
            <div className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Geometry
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Border radius (rem)">
                <input
                  type="text"
                  value={tokens.radius}
                  onChange={(e) => update("radius", e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Border opacity (0..1)">
                <input
                  type="text"
                  value={tokens.borderOpacity}
                  onChange={(e) => update("borderOpacity", e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
                />
              </Field>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Import / Export JSON</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a previously exported theme to restore it.
        </p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='{ "primary": "oklch(0.7 0.2 235)", ... }'
          rows={6}
          className="mt-3 w-full rounded-md border border-border bg-background p-3 font-mono text-xs focus:border-primary focus:outline-none"
        />
        <button
          onClick={handleImport}
          disabled={!importText}
          className="mt-2 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Import Theme
        </button>
      </section>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
      <div
        className="h-7 w-7 shrink-0 rounded-md border border-border-strong"
        style={{ background: value }}
      />
      <div className="min-w-[120px] text-xs text-muted-foreground">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] focus:border-primary focus:outline-none"
      />
    </div>
  );
}
