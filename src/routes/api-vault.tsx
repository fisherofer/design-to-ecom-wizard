import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  KeyRound,
  Plus,
  X,
  Eye,
  EyeOff,
  Star,
  ShieldAlert,
  Layers,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { api, USE_CASE_LABELS, type ApiKey, type ApiKeyTier, type UseCase } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ApiHealthPanel } from "@/components/vault/ApiHealthPanel";
import { MarketDataSourcesPanel } from "@/components/vault/MarketDataSourcesPanel";

export const Route = createFileRoute("/api-vault")({
  head: () => ({
    meta: [
      { title: "API Vault — AI Executive OS" },
      {
        name: "description",
        content:
          "Smart routing for 20+ keys: primary/fallback/emergency tiers, rate limits, use-case categories.",
      },
    ],
  }),
  component: ApiVault,
});

const TIER_META: Record<ApiKeyTier, { label: string; color: string; Icon: typeof Star }> = {
  primary: { label: "PRIMARY", color: "border-primary/40 bg-primary/15 text-primary", Icon: Star },
  fallback: { label: "FALLBACK", color: "border-success/40 bg-success/10 text-success", Icon: Layers },
  emergency: { label: "EMERGENCY ($)", color: "border-destructive/40 bg-destructive/10 text-destructive", Icon: ShieldAlert },
  disabled: { label: "DISABLED", color: "border-border bg-muted/30 text-muted-foreground", Icon: X },
};

function ApiVault() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [filterProvider, setFilterProvider] = useState<string>("ALL");
  const [filterUseCase, setFilterUseCase] = useState<UseCase | "ALL">("ALL");

  useEffect(() => {
    api.listKeys().then((k) => {
      setKeys(k);
      setLoading(false);
    });
  }, []);

  const providers = useMemo(() => {
    const set = new Set(keys.map((k) => k.provider));
    return ["ALL", ...Array.from(set)];
  }, [keys]);

  const filtered = useMemo(
    () =>
      keys.filter(
        (k) =>
          (filterProvider === "ALL" || k.provider === filterProvider) &&
          (filterUseCase === "ALL" || k.useCases.includes(filterUseCase)),
      ),
    [keys, filterProvider, filterUseCase],
  );

  const stats = useMemo(() => {
    const byTier = { primary: 0, fallback: 0, emergency: 0, disabled: 0 };
    keys.forEach((k) => byTier[k.tier]++);
    const totalRpm = keys.reduce((s, k) => s + k.rpmLimit, 0);
    const usedRpm = keys.reduce((s, k) => s + k.rpmUsed, 0);
    return { byTier, totalRpm, usedRpm };
  }, [keys]);

  function setTier(id: string, tier: ApiKeyTier) {
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, tier } : k)));
    api.updateKey(id, { tier }).catch(() => {
      /* ignore */
    });
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">API Vault · Smart Router</h1>
            <p className="text-sm text-muted-foreground font-mono">
              {keys.length} keys · {Math.round((stats.usedRpm / Math.max(1, stats.totalRpm)) * 100)}% rate-limit usage
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll((s) => !s)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAll ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showAll ? "Mask" : "Reveal"}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add API Key
          </button>
        </div>
      </div>

      {/* Shared source registry (mirrors backend config) */}
      <MarketDataSourcesPanel />

      {/* Live provider health probe */}
      <ApiHealthPanel />

      {/* Tier summary */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TierStat tier="primary" count={stats.byTier.primary} desc="In rotation right now" />
        <TierStat tier="fallback" count={stats.byTier.fallback} desc="Auto-engaged on failure" />
        <TierStat tier="emergency" count={stats.byTier.emergency} desc="Costs money — last resort" />
        <div className="rounded-xl border border-border glass p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <Zap className="h-3 w-3" /> Combined RPM
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl tabular-nums">{stats.usedRpm}</span>
            <span className="text-muted-foreground font-mono text-xs">/ {stats.totalRpm} req·min</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full",
                stats.usedRpm / stats.totalRpm > 0.8
                  ? "bg-destructive"
                  : stats.usedRpm / stats.totalRpm > 0.5
                    ? "bg-warning"
                    : "bg-success",
              )}
              style={{ width: `${Math.min(100, (stats.usedRpm / stats.totalRpm) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Filter:</span>
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          className="rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-xs font-mono focus:border-primary/50 focus:outline-none"
        >
          {providers.map((p) => (
            <option key={p} value={p} className="bg-background">
              {p}
            </option>
          ))}
        </select>
        <select
          value={filterUseCase}
          onChange={(e) => setFilterUseCase(e.target.value as UseCase | "ALL")}
          className="rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-xs font-mono focus:border-primary/50 focus:outline-none"
        >
          <option value="ALL" className="bg-background">
            All Use Cases
          </option>
          {Object.entries(USE_CASE_LABELS).map(([id, label]) => (
            <option key={id} value={id} className="bg-background">
              {label}
            </option>
          ))}
        </select>
        <span className="text-[10px] font-mono text-muted-foreground/70">
          showing {filtered.length} / {keys.length}
        </span>
      </div>

      {/* Keys table */}
      <div className="rounded-xl border border-border glass overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-card/50 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Provider · Key</th>
              <th className="px-3 py-3">Tier</th>
              <th className="px-3 py-3">Use Cases</th>
              <th className="px-3 py-3 w-44">Rate Limit</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm font-mono text-muted-foreground">
                  Loading keys…
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((k) => {
                const meta = TIER_META[k.tier];
                const utilization = (k.rpmUsed / Math.max(1, k.rpmLimit)) * 100;
                const utilColor =
                  utilization > 85 ? "bg-destructive" : utilization > 60 ? "bg-warning" : "bg-success";
                return (
                  <tr key={k.id} className="hover:bg-card/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{k.provider}</span>
                        {k.paid && (
                          <span
                            title="Paid key — billing implications"
                            className="inline-flex items-center rounded border border-destructive/30 bg-destructive/10 px-1 font-mono text-[9px] text-destructive"
                          >
                            $
                          </span>
                        )}
                        <TypeTag type={k.type} />
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {showAll ? k.maskedKey.replace(/•+/, "ABCDEFGHIJKL") : k.maskedKey} · {k.quotaTier}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={k.tier}
                        onChange={(e) => setTier(k.id, e.target.value as ApiKeyTier)}
                        className={cn(
                          "rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider cursor-pointer outline-none",
                          meta.color,
                        )}
                      >
                        {(["primary", "fallback", "emergency", "disabled"] as ApiKeyTier[]).map((t) => (
                          <option key={t} value={t} className="bg-background text-foreground">
                            {TIER_META[t].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {k.useCases.map((u) => (
                          <span
                            key={u}
                            className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent"
                          >
                            {USE_CASE_LABELS[u].split(" ")[0]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full ${utilColor}`} style={{ width: `${Math.min(100, utilization)}%` }} />
                        </div>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-16 text-right">
                          {k.rpmUsed}/{k.rpmLimit}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusDot status={k.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
                        edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm font-mono text-muted-foreground">
                  No keys match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Routing matrix */}
      <h2 className="mt-8 mb-3 font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Routing Matrix · Provider × Use Case
      </h2>
      <RoutingMatrix keys={keys} />

      {open && <AddKeyModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function TierStat({ tier, count, desc }: { tier: ApiKeyTier; count: number; desc: string }) {
  const meta = TIER_META[tier];
  return (
    <div className="rounded-xl border border-border glass p-4">
      <div className={cn("flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest", meta.color.split(" ").find((c) => c.startsWith("text-")))}>
        <meta.Icon className="h-3 w-3" /> {meta.label}
      </div>
      <div className="mt-2 font-display text-2xl tabular-nums">{count}</div>
      <div className="mt-1 text-[11px] text-muted-foreground/70">{desc}</div>
    </div>
  );
}

function RoutingMatrix({ keys }: { keys: ApiKey[] }) {
  const providers = Array.from(new Set(keys.map((k) => k.provider)));
  const useCases = Object.keys(USE_CASE_LABELS) as UseCase[];

  function cell(provider: string, uc: UseCase) {
    const matched = keys.filter((k) => k.provider === provider && k.useCases.includes(uc) && k.tier !== "disabled");
    if (matched.length === 0) return null;
    const primary = matched.find((k) => k.tier === "primary");
    const fallbacks = matched.filter((k) => k.tier === "fallback").length;
    const emergency = matched.filter((k) => k.tier === "emergency").length;
    return (
      <div className="flex items-center gap-1 justify-center">
        {primary && <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />}
        {fallbacks > 0 && (
          <span className="rounded-sm bg-success/20 text-success px-1 font-mono text-[9px]">{fallbacks}</span>
        )}
        {emergency > 0 && (
          <span className="rounded-sm bg-destructive/20 text-destructive px-1 font-mono text-[9px]">$ {emergency}</span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border glass overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-card/50 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <th className="px-4 py-2.5 text-left">Provider</th>
            {useCases.map((uc) => (
              <th key={uc} className="px-3 py-2.5 text-center">
                {USE_CASE_LABELS[uc]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {providers.map((p) => (
            <tr key={p} className="hover:bg-card/40 transition-colors">
              <td className="px-4 py-2.5 text-sm font-medium">{p}</td>
              {useCases.map((uc) => (
                <td key={uc} className="px-3 py-2.5 text-center">
                  {cell(p, uc) ?? <span className="text-muted-foreground/30">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border bg-card/30 px-4 py-2 flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
          primary
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-sm bg-success/20 text-success px-1">N</span>
          fallbacks
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-sm bg-destructive/20 text-destructive px-1">$</span>
          paid emergency
        </span>
      </div>
    </div>
  );
}

function TypeTag({ type }: { type: string }) {
  const map: Record<string, string> = {
    LLM: "bg-primary/15 text-primary border-primary/30",
    Data: "bg-warning/15 text-warning border-warning/30",
    Broker: "bg-accent/15 text-accent border-accent/30",
  };
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${map[type]}`}>
      {type}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    ok: { color: "bg-success", label: "Active" },
    warn: { color: "bg-warning", label: "Quota Low" },
    err: { color: "bg-destructive", label: "Expired" },
  };
  const s = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span className={`h-2 w-2 rounded-full ${s.color} ${status === "ok" ? "pulse-dot shadow-[0_0_8px_currentColor]" : ""}`} />
      <span className="text-muted-foreground">{s.label}</span>
    </span>
  );
}

function AddKeyModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border-strong glass-strong p-6 shadow-[0_20px_60px_-20px_var(--primary)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Add API Key</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] font-mono text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Encrypted at rest by your local backend. Never sent to Lovable.
        </div>
        <div className="mt-5 space-y-4">
          <Field label="Provider" placeholder="e.g. Google Gemini, OpenAI, Polygon" />
          <Field label="Type" placeholder="LLM · Data · Broker" />
          <Field label="API Key" placeholder="paste key…" mono />
          <Field label="Quota Tier" placeholder="Free · Pro · Live" />
          <Field label="Routing Tier" placeholder="primary · fallback · emergency" />
          <Field label="Use Cases (comma-separated)" placeholder="trading_decisions, market_analysis" />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-card/50 px-4 py-2 text-sm hover:border-border-strong transition-colors"
          >
            Cancel
          </button>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:opacity-90 transition-opacity">
            Encrypt &amp; Store
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, mono }: { label: string; placeholder: string; mono?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <input
        placeholder={placeholder}
        className={`h-10 w-full rounded-md border border-border bg-card/50 px-3 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
