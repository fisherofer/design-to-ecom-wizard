import { TrendingUp, TrendingDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TickerLogo } from "@/components/tickers/TickerLogo";
import { alpaca, type AlpacaQuote } from "@/lib/alpaca";
import { useWidgetData } from "@/hooks/useWidgetData";

// Default universe — used only until live quotes arrive. Actual prices/changes
// are fetched live from Alpaca; nothing here is hard-coded numerically.
const DEFAULT_SYMBOLS = [
  "NVDA", "BTC", "AAPL", "TSLA", "ETH", "MSFT",
  "SPY", "META", "GOOGL", "AMZN", "SOL", "AMD",
];

export function Ticker() {
  const state = useWidgetData<AlpacaQuote[]>({
    kind: "movers",
    refreshId: "ticker",
    fetcher: () => alpaca.quotes(DEFAULT_SYMBOLS),
    initial: [],
  });

  const items = state.data.length > 0 ? [...state.data, ...state.data] : [];

  return (
    <div className="relative overflow-hidden border-y border-border bg-card/40">
      <div className="ticker-scroll flex gap-6 py-2 whitespace-nowrap">
        {items.length === 0 && (
          <span className="px-4 text-xs font-mono text-muted-foreground">Loading live quotes…</span>
        )}
        {items.map((t, i) => {
          const up = (t.changePct ?? 0) >= 0;
          const Icon = up ? TrendingUp : TrendingDown;
          return (
            <Link
              key={i}
              to="/ticker/$symbol"
              params={{ symbol: t.symbol }}
              title={`${t.symbol}\nPrice: ${t.price.toLocaleString()}\nChange: ${up ? "+" : ""}${t.changePct.toFixed(2)}%\nClick for full institutional analysis →`}
              className="flex items-center gap-2 font-mono text-xs hover:opacity-80 transition-opacity"
            >
              <TickerLogo symbol={t.symbol} size="xs" linkTo={false} />
              <span className="font-semibold text-foreground">{t.symbol}</span>
              <span className="text-muted-foreground tabular-nums">
                {t.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span
                className={`inline-flex items-center gap-1 tabular-nums ${
                  up ? "text-success" : "text-destructive"
                }`}
              >
                <Icon className="h-3 w-3" />
                {up ? "+" : ""}
                {t.changePct.toFixed(2)}%
              </span>
              <span className="text-border-strong">·</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
