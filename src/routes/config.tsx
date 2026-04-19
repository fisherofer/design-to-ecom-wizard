import { createFileRoute } from "@tanstack/react-router";
import { Settings, Sparkles, Search } from "lucide-react";

export const Route = createFileRoute("/config")({
  head: () => ({
    meta: [
      { title: "System Config — AI Executive OS" },
      { name: "description", content: "Manage system parameters with AI-assisted categorization." },
    ],
  }),
  component: SystemConfig,
});

const PARAMS = [
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
              {PARAMS.length} parameters · AI-categorized
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
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

      <div className="rounded-xl border border-border glass overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-card/50 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Parameter Key</th>
              <th className="px-3 py-3">Value</th>
              <th className="px-3 py-3">AI Category</th>
              <th className="px-5 py-3 w-48">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PARAMS.map((p) => (
              <tr key={p.key} className="hover:bg-card/40 transition-colors">
                <td className="px-5 py-3 font-mono text-xs">{p.key}</td>
                <td className="px-3 py-3">
                  <input
                    defaultValue={p.value}
                    className="h-7 w-full rounded border border-transparent bg-transparent px-2 font-mono text-xs hover:border-border focus:border-primary/50 focus:bg-card/50 focus:outline-none transition-colors"
                  />
                </td>
                <td className="px-3 py-3">
                  <CategoryTag cat={p.cat} color={p.color as "primary" | "destructive" | "muted" | "warning" | "accent"} />
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
