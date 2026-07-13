/**
 * Smart Money Tracker
 * ===================
 * Follows institutional & guru activity: 13F filings, Form 4 insider buys,
 * congressional trades, on-chain whales. Ranks by conviction × investor
 * historical alpha so the operator can front-run the next leg.
 */
import { Link } from "@tanstack/react-router";
import { Users, TrendingUp, Landmark, Building2, Bitcoin, Info } from "lucide-react";
import { useWidgetData } from "@/hooks/useWidgetData";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";
import { PercentGauge } from "@/components/common/PercentGauge";
import { getSmartMoneyMoves, type SmartMoneyMove } from "@/lib/smartMoney";
import { cn } from "@/lib/utils";

const TYPE_META: Record<SmartMoneyMove["investorType"], { emoji: string; icon: any; color: string }> = {
  "hedge-fund": { emoji: "🏛️", icon: Landmark, color: "text-primary" },
  "insider":    { emoji: "👤", icon: Users, color: "text-success" },
  "congress":   { emoji: "🏛️", icon: Building2, color: "text-warning" },
  "activist":   { emoji: "⚡", icon: TrendingUp, color: "text-accent-foreground" },
  "whale":      { emoji: "🐋", icon: Bitcoin, color: "text-primary" },
};

const ACTION_EMOJI: Record<SmartMoneyMove["action"], string> = {
  buy: "🟢", add: "➕", "new-position": "🆕", trim: "🟡", sell: "🔴",
};

function fmtUsd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SmartMoneyTracker() {
  const state = useWidgetData<SmartMoneyMove[]>({
    kind: "movers",
    refreshId: "topMovers",
    fetcher: () => getSmartMoneyMoves(),
    initial: [],
  });

  return (
    <div className="rounded-xl border border-border glass p-5">
      <WidgetHeader
        title="💰 Smart Money · Follow the Flow"
        subtitle="13F · Form 4 · Congress · On-chain — front-run the crowd"
        Icon={Users}
        accent="text-warning"
        kind="movers"
        source={state.source}
        onSourceChange={state.setSource}
        updatedAt={state.updatedAt}
        nextInMs={state.nextInMs}
        intervalMs={state.intervalMs}
        loading={state.loading}
        onRefresh={state.refresh}
        right={
          <span className="rounded bg-warning/15 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-warning">
            live
          </span>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2">
        {state.data.slice(0, 6).map((m) => {
          const meta = TYPE_META[m.investorType];
          const Icon = meta.icon;
          return (
            <div
              key={m.id}
              className="group rounded-lg border border-border/60 bg-card/30 p-2.5 hover:bg-card/50 hover:border-primary/40 transition-colors"
              title={`${m.investor} · ${m.action} ${m.symbol} · ${fmtUsd(m.amountUsd)}\n\nWhy this matters (AI):\n${m.rationale}`}
            >
              <div className="flex items-start gap-2">
                <div className={cn("shrink-0 rounded-md bg-muted/50 p-1.5", meta.color)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs font-semibold">
                      {meta.emoji} {m.investor}
                    </span>
                    <Link
                      to="/ticker/$symbol"
                      params={{ symbol: m.symbol }}
                      className="shrink-0 font-mono text-xs font-bold text-primary hover:underline"
                    >
                      {m.symbol}
                    </Link>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                    <span>{ACTION_EMOJI[m.action]} {m.action}</span>
                    <span className="text-success">{fmtUsd(m.amountUsd)}</span>
                    {m.changePct != null && <span>· {m.changePct > 0 ? "+" : ""}{m.changePct}%</span>}
                    <span>· {ago(m.filedAt)}</span>
                    <span className="rounded bg-muted/60 px-1">{m.source}</span>
                  </div>
                </div>
                <PercentGauge value={m.conviction} size={40} mode="unipolar" sublabel="CONV" />
              </div>
              <p className="mt-2 flex items-start gap-1 text-[11px] text-muted-foreground leading-snug">
                <Info className="h-3 w-3 mt-0.5 shrink-0 text-primary/70" />
                <span className="line-clamp-2">{m.rationale}</span>
              </p>
            </div>
          );
        })}
        {state.data.length === 0 && (
          <div className="col-span-full rounded-md border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">
            No smart-money moves yet — waiting on 13F / Form 4 feeds.
          </div>
        )}
      </div>
    </div>
  );
}
