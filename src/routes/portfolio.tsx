import { createFileRoute } from "@tanstack/react-router";
import { HOLDINGS, DIVIDEND_CALENDAR, totalReturn } from "@/lib/trackedAssets";
import { Calendar, Wallet, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PortfolioCommandCenter } from "@/components/trading/PortfolioCommandCenter";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio & Dividends — AI Executive OS" },
      { name: "description", content: "Holdings, total return, and upcoming ex-dividend calendar." },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const totals = HOLDINGS.reduce(
    (acc, h) => {
      const r = totalReturn(h);
      acc.cost += r.cost;
      acc.value += r.value;
      acc.pnl += r.pnl;
      return acc;
    },
    { cost: 0, value: 0, pnl: 0 },
  );
  const totalPct = (totals.pnl / totals.cost) * 100;
  const monthlyDiv = DIVIDEND_CALENDAR.reduce((sum, d) => {
    const h = HOLDINGS.find((x) => x.symbol === d.symbol);
    return sum + (h ? h.qty * d.amount : 0);
  }, 0);

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Portfolio &amp; Dividends</h1>
        <p className="text-sm text-muted-foreground font-mono">
          Live holdings · Projected income · Ex-dividend tracking
        </p>
      </div>

      <PortfolioCommandCenter />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Portfolio Value" value={`$${totals.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatCard icon={TrendingUp} label="Total P/L" value={`${totals.pnl >= 0 ? "+" : ""}$${totals.pnl.toFixed(0)}`} sub={`${totalPct.toFixed(2)}%`} positive={totals.pnl >= 0} />
        <StatCard icon={Calendar} label="Monthly Div (proj)" value={`$${monthlyDiv.toFixed(0)}`} />
        <StatCard icon={TrendingUp} label="Positions" value={String(HOLDINGS.length)} />
      </div>

      <div className="rounded-xl border border-border glass">
        <div className="border-b border-border/60 p-5">
          <h3 className="font-display text-base font-semibold">Holdings</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card/40">
              <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left">Symbol</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Buy</th>
                <th className="px-5 py-3 text-right">Current</th>
                <th className="px-5 py-3 text-right">Value</th>
                <th className="px-5 py-3 text-right">Return</th>
              </tr>
            </thead>
            <tbody>
              {HOLDINGS.map((h) => {
                const r = totalReturn(h);
                const up = r.pnl >= 0;
                return (
                  <tr key={h.symbol} className="border-t border-border/30 hover:bg-card/30">
                    <td className="px-5 py-3 font-mono font-semibold">{h.symbol}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{h.qty}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">${h.buyPrice.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">${h.currentPrice.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">${r.value.toFixed(0)}</td>
                    <td className={cn("px-5 py-3 text-right font-mono tabular-nums", up ? "text-success" : "text-destructive")}>
                      {up ? "+" : ""}${r.pnl.toFixed(0)} <span className="text-[10px]">({r.pct.toFixed(1)}%)</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border glass">
        <div className="border-b border-border/60 p-5 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="font-display text-base font-semibold">Dividend Calendar</h3>
        </div>
        <div className="divide-y divide-border/30">
          {DIVIDEND_CALENDAR.map((d) => {
            const h = HOLDINGS.find((x) => x.symbol === d.symbol);
            const projected = h ? h.qty * d.amount : 0;
            return (
              <div key={d.symbol + d.exDate} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono font-semibold">{d.symbol}</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Ex {d.exDate} · Pay {d.payDate}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span>${d.amount.toFixed(2)}/sh</span>
                  <span className="text-success">{d.yieldPct.toFixed(1)}% yld</span>
                  <span className="rounded-md bg-success/10 px-2 py-1 text-success">≈ ${projected.toFixed(0)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, positive }: {
  icon: typeof Wallet; label: string; value: string; sub?: string; positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border glass p-4">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</div>
      {sub && (
        <div className={cn("text-xs font-mono mt-0.5", positive ? "text-success" : "text-destructive")}>{sub}</div>
      )}
    </div>
  );
}
