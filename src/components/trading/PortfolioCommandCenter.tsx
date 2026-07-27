/**
 * Portfolio Command Center
 * ========================
 * Tier-1 institutional account panel. Renders the REAL brokerage account state
 * pulled from the backend `/api/account/summary` endpoint (Alpaca paper in
 * Stage 1). Never fabricates values: if the backend reports `is_simulated`,
 * the panel says so explicitly and shows the reason.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountService, type AccountHealth, type AccountSummary } from "@/services/api";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Activity,
  DollarSign,
  Gauge,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const REFRESH_MS = 15_000;

function money(value: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function PortfolioCommandCenter() {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [health, setHealth] = useState<AccountHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const [nextSummary, nextHealth] = await Promise.all([
        AccountService.getSummary(),
        AccountService.getHealth().catch(() => null),
      ]);
      if (!mounted.current) return;
      setSummary(nextSummary);
      if (nextHealth) setHealth(nextHealth);
      setError(nextSummary.error ?? null);
      setLastSync(new Date().toLocaleTimeString());
    } catch (err) {
      if (!mounted.current) return;
      setSummary(null);
      setError(err instanceof Error ? err.message : "Backend unreachable");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [load]);

  const simulated = summary?.is_simulated ?? true;
  const dayUp = (summary?.day_pnl ?? 0) >= 0;

  return (
    <section className="rounded-xl border border-border glass">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-5">
        <div>
          <h2 className="font-display text-base font-semibold">Portfolio Command Center</h2>
          <p className="font-mono text-[11px] text-muted-foreground">
            {health
              ? `${health.base_url} · Stage ${health.trading_stage}`
              : "Live brokerage account state"}
            {lastSync ? ` · synced ${lastSync}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider",
              simulated
                ? "border-warning/40 text-warning"
                : "border-success/40 text-success",
            )}
          >
            {simulated ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {simulated ? "Simulated" : "Live paper account"}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-mono text-[11px] hover:bg-card/60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="flex items-start gap-2 border-b border-border/60 bg-destructive/10 p-4 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Account data unavailable</p>
            <p className="font-mono text-[11px] opacity-90">{error}</p>
            {health && !health.credentials_present ? (
              <p className="mt-1 font-mono text-[11px] opacity-90">
                Set ALPACA_API_KEY and ALPACA_SECRET_KEY in the backend environment.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={DollarSign}
          label="Equity"
          value={summary ? money(summary.equity, summary.currency) : "—"}
          hint={summary?.account_status}
        />
        <Metric
          icon={Activity}
          label="Buying Power"
          value={summary ? money(summary.buying_power, summary.currency) : "—"}
          hint={summary ? `Cash ${money(summary.cash, summary.currency)}` : undefined}
        />
        <Metric
          icon={dayUp ? TrendingUp : TrendingDown}
          label="Day P&L"
          value={
            summary
              ? `${dayUp ? "+" : ""}${money(summary.day_pnl, summary.currency)}`
              : "—"
          }
          hint={summary ? `${summary.day_pnl_pct.toFixed(2)}%` : undefined}
          tone={summary ? (dayUp ? "positive" : "negative") : undefined}
        />
        <Metric
          icon={Gauge}
          label="Maintenance Margin"
          value={summary ? money(summary.maintenance_margin, summary.currency) : "—"}
          hint={summary?.pattern_day_trader ? "PDT flagged" : undefined}
        />
      </div>

      {summary?.trading_blocked ? (
        <p className="border-t border-border/60 px-5 py-3 font-mono text-[11px] text-destructive">
          Broker has blocked trading on this account — order submission is disabled.
        </p>
      ) : null}
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p
        className={cn(
          "mt-2 font-mono text-xl font-semibold tabular-nums",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default PortfolioCommandCenter;
