import { createFileRoute } from "@tanstack/react-router";
import { Layers, Plus, Play, Pause, Copy } from "lucide-react";

export const Route = createFileRoute("/strategy")({
  head: () => ({
    meta: [
      { title: "Strategy Builder — AI Executive OS" },
      { name: "description", content: "Compose, backtest and deploy algorithmic strategies." },
    ],
  }),
  component: StrategyBuilder,
});

const STRATEGIES = [
  { name: "Momentum Breakout", asset: "Equities", status: "live", sharpe: 1.84, ytd: 22.4, dd: -8.1 },
  { name: "Mean Reversion RSI", asset: "Equities", status: "live", sharpe: 1.42, ytd: 11.7, dd: -5.2 },
  { name: "Crypto Trend Follow", asset: "Crypto", status: "live", sharpe: 2.11, ytd: 64.3, dd: -19.4 },
  { name: "Pairs Trading SP500", asset: "Equities", status: "paused", sharpe: 0.98, ytd: 4.2, dd: -3.1 },
  { name: "FX Carry Basket", asset: "FX", status: "draft", sharpe: 0, ytd: 0, dd: 0 },
];

function StrategyBuilder() {
  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Strategy Builder</h1>
            <p className="text-sm text-muted-foreground font-mono">
              Compose · backtest · deploy
            </p>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />
          New Strategy
        </button>
      </div>

      <div className="rounded-xl border border-border glass overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-card/50 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Strategy</th>
              <th className="px-3 py-3">Asset</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Sharpe</th>
              <th className="px-3 py-3 text-right">YTD</th>
              <th className="px-3 py-3 text-right">Max DD</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {STRATEGIES.map((s) => (
              <tr key={s.name} className="hover:bg-card/40 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">id: stg_{s.name.toLowerCase().replace(/\s+/g, "_").slice(0, 12)}</div>
                </td>
                <td className="px-3 py-3.5 text-sm text-muted-foreground">{s.asset}</td>
                <td className="px-3 py-3.5">
                  <StatusPill status={s.status} />
                </td>
                <td className="px-3 py-3.5 text-right font-mono tabular-nums">{s.sharpe.toFixed(2)}</td>
                <td className={`px-3 py-3.5 text-right font-mono tabular-nums ${s.ytd > 0 ? "text-success" : s.ytd < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {s.ytd > 0 ? "+" : ""}{s.ytd.toFixed(1)}%
                </td>
                <td className="px-3 py-3.5 text-right font-mono tabular-nums text-destructive">
                  {s.dd.toFixed(1)}%
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <IconBtn icon={s.status === "live" ? Pause : Play} />
                    <IconBtn icon={Copy} />
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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    live: "bg-success/15 text-success border-success/30",
    paused: "bg-warning/15 text-warning border-warning/30",
    draft: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${map[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-success pulse-dot" : status === "paused" ? "bg-warning" : "bg-muted-foreground"}`} />
      {status}
    </span>
  );
}

function IconBtn({ icon: Icon }: { icon: typeof Play }) {
  return (
    <button className="flex h-7 w-7 items-center justify-center rounded border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors">
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
