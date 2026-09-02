/**
 * Live Trading — מסך מסחר שוטף.
 * Run statuses of the dual loop, decision summary, bank delta and a one-click
 * arm/disarm control. Guarded by mock_data_guard_engine settings.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Activity,
  Ban,
  CircleDot,
  Gauge,
  Play,
  RotateCcw,
  ShieldAlert,
  Square,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEngineRuns, useGuardConfig, useSmartConfig, summarizeRuns } from "@/lib/engineConfig";
import {
  isLoopRunning,
  resetLedger,
  startDualLoop,
  stopDualLoop,
  useLoopState,
} from "@/lib/dualLoopRunner";
import { isDesktop } from "@/lib/portableStorage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/live-trading")({
  head: () => ({
    meta: [
      { title: "Live Trading Loop — OFERTRADINGBOT" },
      {
        name: "description",
        content:
          "Dual-loop live trading console: run status, decision summary, bank delta and one-click arming with mock-data guard enforcement.",
      },
      { property: "og:title", content: "Live Trading Loop — OFERTRADINGBOT" },
      {
        property: "og:description",
        content: "Arm the slow-AI / fast-execution loop and watch decisions, risk and bank delta in real time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveTradingScreen,
});

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "up" | "down" | "warn";
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={cn(
          "mt-2 font-display text-2xl font-semibold tabular-nums",
          tone === "up" && "text-emerald-500",
          tone === "down" && "text-destructive",
          tone === "warn" && "text-amber-500",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function LiveTradingScreen() {
  const state = useLoopState();
  const runs = useEngineRuns();
  const [guard] = useGuardConfig();
  const [smart] = useSmartConfig();
  const summary = useMemo(() => summarizeRuns(runs), [runs]);

  const pnl = state.equityUsd - state.openingEquityUsd;
  const pnlPct = state.openingEquityUsd ? (pnl / state.openingEquityUsd) * 100 : 0;
  const running = state.running && isLoopRunning();

  const onToggle = () => {
    if (running) {
      stopDualLoop();
      toast.info("Dual loop stopped");
      return;
    }
    startDualLoop();
    toast.success(
      `Dual loop armed — slow ${smart.slowLoopSec}s / fast ${smart.fastLoopMs}ms · guard ${guard.enabled ? guard.mode : "OFF"}`,
    );
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            מסחר שוטף · Dual-Loop Console
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Slow AI loop + fast execution loop, filtered through the Mock Data Guard contract and the
            HardRiskManager circuit breaker.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="lg"
            variant={running ? "destructive" : "default"}
            onClick={onToggle}
            className="gap-2"
          >
            {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Stop loop" : "הפעל לולאה כפולה"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="gap-2"
            onClick={() => {
              resetLedger();
              toast.success("Ledger reset");
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </header>

      {/* ---------- status strip ---------- */}
      <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Badge variant={running ? "default" : "secondary"} className="gap-1.5">
          <CircleDot className={cn("h-3 w-3", running && "animate-pulse")} />
          {running ? `RUNNING · ${state.phase}` : "IDLE"}
        </Badge>
        <Badge variant={guard.enabled ? "outline" : "destructive"} className="gap-1.5">
          <ShieldAlert className="h-3 w-3" />
          Guard {guard.enabled ? guard.mode : "DISABLED"}
        </Badge>
        <Badge variant="outline" className="gap-1.5">
          <Zap className="h-3 w-3" />
          fast {smart.fastLoopMs}ms · slow {smart.slowLoopSec}s
        </Badge>
        <Badge variant="outline" className="gap-1.5">
          <Gauge className="h-3 w-3" />
          AI sentiment {state.aiScore.toFixed(1)}
        </Badge>
        <Badge variant={state.dataSource === "LIVE" ? "default" : "destructive"} className="gap-1.5">
          {state.dataSource === "LIVE" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {state.dataSource === "LIVE"
            ? `LIVE ${state.quoteProvider ?? "quotes_router"} · ${state.quoteAgeSec ?? 0}s`
            : `NO FEED — ${state.feedError ?? "quotes_router offline"}`}
        </Badge>
        <Badge variant={isDesktop() ? "default" : "secondary"}>
          {isDesktop() ? "Portable Mode (SQLite)" : "Browser profile"}
        </Badge>
        {state.breakerTrips > 0 ? (
          <Badge variant="destructive" className="gap-1.5">
            <Ban className="h-3 w-3" />
            breaker × {state.breakerTrips}
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {state.lastTickAt ? `last tick ${new Date(state.lastTickAt).toLocaleTimeString()}` : "no ticks yet"}
        </span>
      </section>

      {/* ---------- bank delta ---------- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={pnl >= 0 ? TrendingUp : TrendingDown}
          label="הפרש בנקאי (Bank delta)"
          value={`${pnl >= 0 ? "+" : ""}${usd(pnl)}`}
          hint={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% vs opening ${usd(state.openingEquityUsd)}`}
          tone={pnl >= 0 ? "up" : "down"}
        />
        <Stat icon={Gauge} label="Equity" value={usd(state.equityUsd)} hint={`peak ${usd(state.peakEquityUsd)}`} />
        <Stat
          icon={TrendingDown}
          label="Drawdown"
          value={`${state.drawdownPct.toFixed(2)}%`}
          hint={`limit ${smart.maxDrawdownPct}%`}
          tone={state.drawdownPct >= smart.maxDrawdownPct ? "down" : "default"}
        />
        <Stat
          icon={ShieldAlert}
          label="Open risk (ATR VaR)"
          value={usd(state.openRiskUsd)}
          hint={`risk/trade ${smart.riskPerTradePct}% · stop ×${smart.atrStopMultiple}`}
          tone="warn"
        />
      </section>

      {/* ---------- live book ---------- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={state.unrealizedPnlUsd >= 0 ? TrendingUp : TrendingDown}
          label="PnL חוטף (Unrealized)"
          value={`${state.unrealizedPnlUsd >= 0 ? "+" : ""}${usd(state.unrealizedPnlUsd)}`}
          hint={`${state.positions.length} open positions`}
          tone={state.unrealizedPnlUsd >= 0 ? "up" : "down"}
        />
        <Stat
          icon={Wallet}
          label="Realized P&L"
          value={`${state.realizedPnlUsd >= 0 ? "+" : ""}${usd(state.realizedPnlUsd)}`}
          tone={state.realizedPnlUsd >= 0 ? "up" : "down"}
        />
        <Stat
          icon={Activity}
          label="Open Interest (notional)"
          value={usd(state.openInterestUsd)}
          hint="sum |qty × last price|"
        />
        <Stat
          icon={Gauge}
          label="Feed"
          value={state.dataSource === "LIVE" ? (state.quoteProvider ?? "quotes_router") : "offline"}
          hint={
            state.dataSource === "LIVE"
              ? `snapshot age ${state.quoteAgeSec ?? 0}s`
              : "guard downgrades ticks to paper"
          }
          tone={state.dataSource === "LIVE" ? "up" : "warn"}
        />
      </section>

      {/* ---------- positions ---------- */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 font-display text-sm font-semibold">
          Positions · live mark-to-market
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-2 text-start">Symbol</th>
                <th className="p-2 text-end">Qty</th>
                <th className="p-2 text-end">Avg</th>
                <th className="p-2 text-end">Last</th>
                <th className="p-2 text-end">Notional</th>
                <th className="p-2 text-end">Unrealized</th>
                <th className="p-2 text-start">Mode</th>
              </tr>
            </thead>
            <tbody>
              {state.positions.map((p) => (
                <tr key={p.symbol} className="border-b border-border/60 last:border-0">
                  <td className="p-2 font-mono text-xs">{p.symbol}</td>
                  <td className="p-2 text-end tabular-nums">{p.qty}</td>
                  <td className="p-2 text-end tabular-nums">{p.avgPrice.toFixed(2)}</td>
                  <td className="p-2 text-end tabular-nums">{p.lastPrice.toFixed(2)}</td>
                  <td className="p-2 text-end tabular-nums">{usd(p.notionalUsd)}</td>
                  <td
                    className={cn(
                      "p-2 text-end tabular-nums",
                      p.unrealizedUsd >= 0 ? "text-emerald-500" : "text-destructive",
                    )}
                  >
                    {p.unrealizedUsd >= 0 ? "+" : ""}
                    {usd(p.unrealizedUsd)}
                  </td>
                  <td className="p-2">
                    <Badge variant={p.simulated ? "secondary" : "default"}>
                      {p.simulated ? "PAPER" : "LIVE"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {state.positions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                    No open positions — the loop opens a position when the blended score clears the threshold.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- decision summary ---------- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Activity} label="Fast ticks" value={String(state.ticks)} hint={`${state.slowCycles} slow AI cycles`} />
        <Stat icon={Zap} label="Decisions" value={String(state.decisions)} hint={`${state.holds} holds`} tone="up" />
        <Stat icon={Ban} label="Blocked by guard" value={String(state.blocked)} hint={guard.mode} tone="warn" />
        <Stat
          icon={Gauge}
          label="Avg ATR VaR"
          value={usd(summary.avgVar)}
          hint={`${summary.total} recorded runs`}
        />
      </section>

      <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {state.lastNote}
      </p>

      {/* ---------- run log ---------- */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 font-display text-sm font-semibold">
          Run statuses · latest 25
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-2 text-start">Time</th>
                <th className="p-2 text-start">Symbol</th>
                <th className="p-2 text-start">Action</th>
                <th className="p-2 text-end">Score</th>
                <th className="p-2 text-end">ATR VaR</th>
                <th className="p-2 text-end">Equity</th>
                <th className="p-2 text-start">Note</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 25).map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="p-2 tabular-nums text-xs text-muted-foreground">
                    {new Date(r.ts).toLocaleTimeString()}
                  </td>
                  <td className="p-2 font-mono text-xs">{r.symbol}</td>
                  <td className="p-2">
                    <Badge
                      variant={
                        r.action === "BLOCKED"
                          ? "destructive"
                          : r.action === "HOLD"
                            ? "secondary"
                            : "default"
                      }
                    >
                      {r.action}
                    </Badge>
                  </td>
                  <td className="p-2 text-end tabular-nums">{r.finalScore.toFixed(1)}</td>
                  <td className="p-2 text-end tabular-nums">{usd(r.atrVarUsd)}</td>
                  <td className="p-2 text-end tabular-nums">{usd(r.equityUsd)}</td>
                  <td className="max-w-[22rem] truncate p-2 text-xs text-muted-foreground">{r.note}</td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                    No runs yet — arm the dual loop to start recording decisions.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
