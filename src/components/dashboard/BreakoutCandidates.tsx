import { useEffect, useState } from "react";
import { Rocket, Target, Shield } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { alpaca, type BreakoutCandidate } from "@/lib/alpaca";
import { useRefreshInterval } from "@/lib/refreshIntervals";
import { DASHBOARD_REFRESH_EVENT } from "./RefreshButton";
import { TickerLogo } from "@/components/tickers/TickerLogo";
import { cn } from "@/lib/utils";

export function BreakoutCandidates() {
  const [rows, setRows] = useState<BreakoutCandidate[]>([]);
  const ms = useRefreshInterval("breakouts");

  useEffect(() => {
    let cancelled = false;
    const load = () => alpaca.breakouts(6).then((n) => !cancelled && setRows(n));
    load();
    const id = ms > 0 ? window.setInterval(load, ms) : null;
    const onManual = () => load();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    return () => {
      cancelled = true;
      if (id) window.clearInterval(id);
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    };
  }, [ms]);

  return (
    <div className="rounded-xl border border-border glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <div>
            <h3 className="font-display text-base font-semibold">AI Breakout Candidates</h3>
            <p className="text-[10px] font-mono text-muted-foreground">Ranked by breakout probability · click for chart</p>
          </div>
        </div>
        <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-primary">
          AI
        </span>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => {
          const prob = Math.round(r.probability * 100);
          const color = prob >= 75 ? "bg-success" : prob >= 60 ? "bg-warning" : "bg-primary";
          return (
            <li key={r.symbol} className="rounded-lg border border-border/60 bg-card/30 p-3 hover:bg-card/50 transition-colors">
              <div className="flex items-center gap-3">
                <TickerLogo symbol={r.symbol} size="sm" linkTo={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link to="/ticker/$symbol" params={{ symbol: r.symbol }} className="font-mono font-semibold hover:text-primary">
                      {r.symbol}
                    </Link>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">${r.price.toFixed(2)}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] font-mono text-muted-foreground">{r.pattern}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-bold tabular-nums">{prob}%</div>
                  <div className="text-[9px] font-mono uppercase text-muted-foreground">probability</div>
                </div>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full transition-all", color)} style={{ width: `${prob}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-snug line-clamp-2">{r.reason}</p>
              <div className="mt-2 flex items-center gap-3 text-[10px] font-mono">
                {r.targetPrice != null && (
                  <span className="inline-flex items-center gap-1 text-success">
                    <Target className="h-3 w-3" /> ${r.targetPrice.toFixed(2)}
                  </span>
                )}
                {r.stopLoss != null && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <Shield className="h-3 w-3" /> ${r.stopLoss.toFixed(2)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
