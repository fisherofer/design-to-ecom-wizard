/**
 * Backtesting — runs backtesting_engine rules over real historical bars and
 * reports equity curve, Sharpe/Sortino, max drawdown and walk-forward folds.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Download,
  LineChart as LineChartIcon,
  Play,
  TrendingDown,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PARAMS,
  getBacktestHistory,
  runBacktest,
  type BacktestParams,
  type BacktestResult,
  type StrategyId,
} from "@/lib/backtest";

export const Route = createFileRoute("/backtesting")({
  head: () => ({
    meta: [
      { title: "Backtesting — OFERTRADINGBOT" },
      {
        name: "description",
        content:
          "Backtest strategies on real historical bars: equity curve, Sharpe, Sortino, max drawdown, profit factor and walk-forward validation.",
      },
      { property: "og:title", content: "Backtesting — OFERTRADINGBOT" },
      {
        property: "og:description",
        content: "Equity curve, risk-adjusted metrics and walk-forward folds for every strategy before it goes live.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BacktestingScreen,
});

const STRATEGIES: Array<{ id: StrategyId; label: string }> = [
  { id: "sma_cross", label: "SMA cross" },
  { id: "momentum", label: "Momentum" },
  { id: "mean_reversion", label: "Mean reversion" },
  { id: "breakout", label: "Breakout" },
];

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-display text-lg font-semibold tabular-nums",
          tone === "up" && "text-emerald-500",
          tone === "down" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function BacktestingScreen() {
  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState(getBacktestHistory());

  const set = <K extends keyof BacktestParams>(k: K, v: BacktestParams[K]) =>
    setParams((p) => ({ ...p, [k]: v }));

  async function run() {
    setRunning(true);
    const r = await runBacktest({ ...params, symbol: params.symbol.trim().toUpperCase() });
    setRunning(false);
    setResult(r);
    setHistory(getBacktestHistory());
    if (!r.ok) toast.error(r.error ?? "Backtest failed");
    else toast.success(`${r.bars} bars · ${r.metrics.trades} trades · Sharpe ${r.metrics.sharpe}`);
  }

  function exportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backtest_${result.params.symbol}_${result.params.strategy}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const m = result?.metrics;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <LineChartIcon className="h-5 w-5 text-primary" />
            Backtesting Lab
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real historical bars from the local backend — equity curve, risk-adjusted metrics and walk-forward
            validation before anything trades live.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void run()} disabled={running} size="lg" className="gap-2">
            <Play className={cn("h-4 w-4", running && "animate-pulse")} />
            {running ? "Running…" : "Run backtest"}
          </Button>
          <Button variant="outline" className="gap-2" disabled={!result?.ok} onClick={exportJson}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---------- params ---------- */}
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h2 className="font-display text-sm font-semibold">Parameters</h2>

          <div>
            <Label htmlFor="bt-sym">Symbol</Label>
            <Input
              id="bt-sym"
              className="font-mono uppercase"
              value={params.symbol}
              onChange={(e) => set("symbol", e.target.value.toUpperCase())}
            />
          </div>

          <div>
            <Label>Strategy</Label>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {STRATEGIES.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={params.strategy === s.id ? "secondary" : "ghost"}
                  onClick={() => set("strategy", s.id)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["fastPeriod", "Fast period"],
                ["slowPeriod", "Slow period"],
                ["lookbackBars", "Lookback bars"],
                ["initialEquity", "Initial equity"],
                ["riskPctPerTrade", "Risk % / trade"],
                ["stopAtrMultiple", "Stop ATR ×"],
                ["feeBps", "Fee bps"],
                ["slippageBps", "Slippage bps"],
                ["walkForwardFolds", "WF folds"],
              ] as Array<[keyof BacktestParams, string]>
            ).map(([key, label]) => (
              <div key={String(key)}>
                <Label htmlFor={`bt-${String(key)}`}>{label}</Label>
                <Input
                  id={`bt-${String(key)}`}
                  inputMode="decimal"
                  value={String(params[key])}
                  onChange={(e) => set(key, Number(e.target.value) as never)}
                />
              </div>
            ))}
          </div>

          <div>
            <Label>Timeframe</Label>
            <div className="mt-1 flex gap-1">
              {(["1D", "1H"] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={params.timeframe === t ? "secondary" : "ghost"}
                  onClick={() => set("timeframe", t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          {history.length > 0 ? (
            <div className="border-t border-border pt-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Recent runs</div>
              <ul className="space-y-1 text-[11px]">
                {history.slice(0, 6).map((h) => (
                  <li key={h.ranAt} className="flex justify-between gap-2">
                    <span className="font-mono">{h.symbol}</span>
                    <span className="text-muted-foreground">{h.strategy}</span>
                    <span className={cn("tabular-nums", h.totalReturnPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                      {h.totalReturnPct}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* ---------- results ---------- */}
        <div className="space-y-6">
          {result && !result.ok ? (
            <div className="flex items-start gap-3 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{result.error}</div>
            </div>
          ) : null}

          {m && result?.ok ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric
                  label="Total return"
                  value={`${m.totalReturnPct}%`}
                  tone={m.totalReturnPct >= 0 ? "up" : "down"}
                />
                <Metric label="CAGR" value={`${m.cagrPct}%`} tone={m.cagrPct >= 0 ? "up" : "down"} />
                <Metric label="Sharpe" value={String(m.sharpe)} tone={m.sharpe >= 1 ? "up" : undefined} />
                <Metric label="Sortino" value={String(m.sortino)} tone={m.sortino >= 1.5 ? "up" : undefined} />
                <Metric label="Max drawdown" value={`${m.maxDrawdownPct}%`} tone="down" />
                <Metric label="Calmar" value={String(m.calmar)} />
                <Metric label="Win rate" value={`${m.winRatePct}%`} />
                <Metric label="Profit factor" value={String(m.profitFactor)} />
                <Metric label="Trades" value={String(m.trades)} />
                <Metric label="Expectancy" value={usd(m.expectancyUsd)} />
                <Metric label="Exposure" value={`${m.exposurePct}%`} />
                <Metric
                  label="Buy & hold"
                  value={`${m.buyHoldReturnPct}%`}
                  tone={m.totalReturnPct >= m.buyHoldReturnPct ? "up" : "down"}
                />
              </div>

              <section className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
                    <Activity className="h-4 w-4 text-primary" />
                    Equity curve · {result.params.symbol} {result.from} → {result.to}
                  </h2>
                  <Badge variant="outline">{result.bars} bars · {result.source}</Badge>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.equity}>
                      <defs>
                        <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} stroke="var(--muted-foreground)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={70} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        name="Strategy"
                        stroke="var(--primary)"
                        fill="url(#eq)"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="buyHold"
                        name="Buy & hold"
                        stroke="var(--muted-foreground)"
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  Drawdown
                </h2>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.equity}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} stroke="var(--muted-foreground)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={50} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="drawdownPct"
                        name="Drawdown %"
                        stroke="var(--destructive)"
                        fill="var(--destructive)"
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card">
                <header className="border-b border-border p-4">
                  <h2 className="font-display text-sm font-semibold">
                    Walk-forward validation{" "}
                    <span className="text-muted-foreground">({result.walkForward.length} folds)</span>
                  </h2>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Fold</th>
                        <th className="px-3 py-2 font-medium">Train</th>
                        <th className="px-3 py-2 font-medium">Test</th>
                        <th className="px-3 py-2 text-right font-medium">Train %</th>
                        <th className="px-3 py-2 text-right font-medium">Test %</th>
                        <th className="px-3 py-2 text-right font-medium">Test Sharpe</th>
                        <th className="px-3 py-2 text-right font-medium">Test DD</th>
                        <th className="px-3 py-2 text-right font-medium">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.walkForward.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                            Not enough history for walk-forward folds — increase the lookback.
                          </td>
                        </tr>
                      ) : (
                        result.walkForward.map((f) => (
                          <tr key={f.fold} className="border-t border-border">
                            <td className="px-4 py-2 font-mono">{f.fold}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {f.trainFrom} → {f.trainTo}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {f.testFrom} → {f.testTo}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{f.trainReturnPct}%</td>
                            <td
                              className={cn(
                                "px-3 py-2 text-right tabular-nums",
                                f.testReturnPct >= 0 ? "text-emerald-500" : "text-destructive",
                              )}
                            >
                              {f.testReturnPct}%
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{f.testSharpe}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{f.testMaxDdPct}%</td>
                            <td className="px-3 py-2 text-right">
                              <Badge
                                variant={
                                  f.verdict === "robust" ? "default" : f.verdict === "fragile" ? "secondary" : "destructive"
                                }
                              >
                                {f.verdict}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card">
                <header className="border-b border-border p-4">
                  <h2 className="font-display text-sm font-semibold">
                    Trades <span className="text-muted-foreground">({result.trades.length})</span>
                  </h2>
                </header>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-4 py-2 font-medium">Entry</th>
                        <th className="px-3 py-2 font-medium">Exit</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">In</th>
                        <th className="px-3 py-2 text-right font-medium">Out</th>
                        <th className="px-3 py-2 text-right font-medium">P&L</th>
                        <th className="px-3 py-2 text-right font-medium">%</th>
                        <th className="px-3 py-2 text-right font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t, i) => (
                        <tr key={`${t.entryDate}-${i}`} className="border-t border-border">
                          <td className="px-4 py-1.5 text-xs">{t.entryDate}</td>
                          <td className="px-3 py-1.5 text-xs">{t.exitDate}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{t.qty}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{t.entryPrice}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{t.exitPrice}</td>
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right tabular-nums",
                              t.pnlUsd >= 0 ? "text-emerald-500" : "text-destructive",
                            )}
                          >
                            {usd(t.pnlUsd)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{t.pnlPct}%</td>
                          <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">{t.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : !result ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Configure the parameters and run a backtest. Bars are pulled from the local backend — no synthetic prices.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
