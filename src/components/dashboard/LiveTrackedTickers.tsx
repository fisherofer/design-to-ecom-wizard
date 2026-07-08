import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { alpaca, type AlpacaQuote } from "@/lib/alpaca";
import { useRefreshInterval } from "@/lib/refreshIntervals";
import { DASHBOARD_REFRESH_EVENT } from "./RefreshButton";
import { TickerLogo } from "@/components/tickers/TickerLogo";
import { TRACKED_TICKERS } from "@/lib/trackedAssets";
import { cn } from "@/lib/utils";

export function LiveTrackedTickers() {
  const symbols = TRACKED_TICKERS.map((t) => t.symbol);
  const [quotes, setQuotes] = useState<AlpacaQuote[]>([]);
  const ms = useRefreshInterval("ticker");

  useEffect(() => {
    let cancelled = false;
    const load = () => alpaca.quotes(symbols).then((q) => !cancelled && setQuotes(q));
    load();
    const id = ms > 0 ? setInterval(load, ms) : null;
    const onManual = () => load();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    return () => { cancelled = true; if (id) clearInterval(id); window.removeEventListener(DASHBOARD_REFRESH_EVENT, onManual); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);

  const rows = TRACKED_TICKERS.map((meta) => {
    const q = quotes.find((x) => x.symbol === meta.symbol);
    return {
      ...meta,
      price: q?.price ?? meta.price,
      change24h: q?.changePct ?? meta.change24h,
    };
  });

  return (
    <div className="rounded-xl border border-border glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold">Tracked Tickers</h3>
          <p className="text-[11px] font-mono text-muted-foreground">
            Live from Alpaca · Auto-refresh: {ms > 0 ? `${ms / 1000}s` : "paused"}
          </p>
        </div>
        <span className={cn("text-xs font-mono", quotes.length > 0 ? "text-success" : "text-muted-foreground")}>
          {quotes.length > 0 ? "LIVE" : "…"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <th className="py-2 text-left font-medium">Symbol</th>
              <th className="py-2 text-right font-medium">Price</th>
              <th className="py-2 text-right font-medium">24h</th>
              <th className="py-2 text-right font-medium hidden sm:table-cell">Sentiment</th>
              <th className="py-2 text-right font-medium">AI Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const up = t.change24h >= 0;
              const Icon = t.change24h === 0 ? Minus : up ? TrendingUp : TrendingDown;
              return (
                <tr key={t.symbol} className="border-b border-border/30 last:border-0 hover:bg-card/30 transition-colors">
                  <td className="py-2.5">
                    <Link to="/ticker/$symbol" params={{ symbol: t.symbol }} className="flex items-center gap-2 hover:opacity-80">
                      <TickerLogo symbol={t.symbol} size="sm" linkTo={false} />
                      <div className="min-w-0">
                        <div className="font-mono font-semibold">{t.symbol}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{t.name}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums">${t.price.toFixed(2)}</td>
                  <td className={cn("py-2.5 text-right font-mono tabular-nums", up ? "text-success" : "text-destructive")}>
                    <span className="inline-flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      {up ? "+" : ""}{t.change24h.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-2.5 text-right hidden sm:table-cell">
                    <span className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-mono uppercase",
                      t.sentiment === "Bullish" && "bg-success/15 text-success",
                      t.sentiment === "Bearish" && "bg-destructive/15 text-destructive",
                      t.sentiment === "Neutral" && "bg-muted text-muted-foreground",
                    )}>
                      {t.sentiment}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full", t.aiScore >= 70 ? "bg-success" : t.aiScore >= 50 ? "bg-warning" : "bg-destructive")}
                          style={{ width: `${t.aiScore}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums w-6 text-right">{t.aiScore}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
