import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Settings, Sparkles, Search, Pencil, ShieldCheck } from "lucide-react";
import { SafeChangeModal } from "@/components/config/SafeChangeModal";

export const Route = createFileRoute("/config")({
  head: () => ({
    meta: [
      { title: "System Config — AI Executive OS" },
      { name: "description", content: "Manage system parameters with AI-assisted categorization." },
    ],
  }),
  component: SystemConfig,
});

interface Param {
  key: string;
  value: string;
  cat: string;
  color: "primary" | "destructive" | "muted" | "warning" | "accent";
  conf: number;
}

const INITIAL_PARAMS: Param[] = [
  { key: "MAX_OPEN_TRADES", value: "12", cat: "TRADING", color: "primary", conf: 98 },
  { key: "WEBHOOK_SECRET", value: "wh_sec_••••••••", cat: "SECURITY", color: "destructive", conf: 99 },
  { key: "OLLAMA_BASE_URL", value: "http://localhost:11434", cat: "SYSTEM", color: "muted", conf: 96 },
  { key: "RISK_PER_TRADE_PCT", value: "1.5", cat: "RISK", color: "warning", conf: 94 },
  { key: "ENSEMBLE_MIN_VOTES", value: "3", cat: "TRADING", color: "primary", conf: 91 },
  { key: "DAILY_LOSS_LIMIT_USD", value: "500", cat: "RISK", color: "warning", conf: 97 },
  { key: "GEMINI_MODEL_ID", value: "gemini-1.5-pro", cat: "LLM", color: "accent", conf: 99 },
  { key: "JWT_ROTATION_HOURS", value: "24", cat: "SECURITY", color: "destructive", conf: 92 },
  { key: "TICKER_REFRESH_MS", value: "1000", cat: "SYSTEM", color: "muted", conf: 88 },
  { key: "SLIPPAGE_BPS", value: "8", cat: "TRADING", color: "primary", conf: 85 },
  { key: "FALLBACK_LLM", value: "groq:llama-3.3-70b", cat: "LLM", color: "accent", conf: 90 },
];

function SystemConfig() {
  const [params, setParams] = useState<Param[]>(INITIAL_PARAMS);
  const [filter, setFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ key: string; oldValue: string; newValue: string } | null>(null);

  const visible = useMemo(
    () =>
      params.filter(
        (p) =>
          !filter ||
          p.key.toLowerCase().includes(filter.toLowerCase()) ||
          p.cat.toLowerCase().includes(filter.toLowerCase()),
      ),
    [params, filter],
  );

  function requestEdit(key: string) {
    const p = params.find((x) => x.key === key);
    if (!p) return;
    const draft = drafts[key] ?? p.value;
    if (draft.trim() === p.value.trim()) return;
    setPending({ key, oldValue: p.value, newValue: draft });
  }

  function onApplied() {
    if (!pending) return;
    setParams((prev) =>
      prev.map((p) => (p.key === pending.key ? { ...p, value: pending.newValue } : p)),
    );
    setDrafts((d) => {
      const { [pending.key]: _omit, ...rest } = d;
      return rest;
    });
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">System Config</h1>
            <p className="text-sm text-muted-foreground font-mono">
              {params.length} parameters · AI-categorized · Safe-Change enforced
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter parameters…"
              className="h-9 w-56 rounded-md border border-border bg-card/50 pl-9 pr-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
            />
          </div>
          <button className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-accent to-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--accent)] hover:opacity-90 transition-opacity">
            <Sparkles className="h-4 w-4" />
            Categorize via AI
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-mono text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        <span>
          All parameter changes are routed through the <span className="text-primary">Safe-Change Workflow</span>:
          Snapshot → Dry Run → Approval → Apply.
        </span>
      </div>

      <div className="rounded-xl border border-border glass overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-card/50 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Parameter Key</th>
              <th className="px-3 py-3">Value</th>
              <th className="px-3 py-3">AI Category</th>
              <th className="px-5 py-3 w-44">Confidence</th>
              <th className="px-3 py-3 w-24 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((p) => {
              const draft = drafts[p.key] ?? p.value;
              const dirty = draft.trim() !== p.value.trim();
              return (
                <tr key={p.key} className="hover:bg-card/40 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs">{p.key}</td>
                  <td className="px-3 py-3">
                    <input
                      value={draft}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.key]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") requestEdit(p.key);
                        if (e.key === "Escape")
                          setDrafts((d) => {
                            const { [p.key]: _omit, ...rest } = d;
                            return rest;
                          });
                      }}
                      className={`h-7 w-full rounded border px-2 font-mono text-xs transition-colors ${
                        dirty
                          ? "border-warning/60 bg-warning/5 text-warning"
                          : "border-transparent bg-transparent hover:border-border focus:border-primary/50 focus:bg-card/50"
                      } focus:outline-none`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <CategoryTag cat={p.cat} color={p.color} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${p.conf > 95 ? "bg-success" : p.conf > 88 ? "bg-primary" : "bg-warning"}`}
                          style={{ width: `${p.conf}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground w-8 text-right">
                        {p.conf}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => requestEdit(p.key)}
                      disabled={!dirty}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition-all ${
                        dirty
                          ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25 shadow-[0_0_14px_-4px_var(--primary)]"
                          : "border-border bg-card/30 text-muted-foreground/50 cursor-not-allowed"
                      }`}
                    >
                      <Pencil className="h-3 w-3" />
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm font-mono text-muted-foreground">
                  No parameters match "{filter}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pending && (
        <SafeChangeModal
          paramKey={pending.key}
          oldValue={pending.oldValue}
          newValue={pending.newValue}
          onClose={() => setPending(null)}
          onApplied={onApplied}
        />
      )}
    </div>
  );
}

function CategoryTag({
  cat,
  color,
}: {
  cat: string;
  color: "primary" | "destructive" | "muted" | "warning" | "accent";
}) {
  const map = {
    primary: "bg-primary/15 text-primary border-primary/30",
    destructive: "bg-destructive/15 text-destructive border-destructive/30",
    muted: "bg-muted text-muted-foreground border-border",
    warning: "bg-warning/15 text-warning border-warning/30",
    accent: "bg-accent/15 text-accent border-accent/30",
  };
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${map[color]}`}>
      {cat}
    </span>
  );
}
