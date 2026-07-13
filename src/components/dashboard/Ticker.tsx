import { TrendingUp, TrendingDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TickerLogo } from "@/components/tickers/TickerLogo";

const TICKERS = [
  { sym: "NVDA", price: 945.32, chg: 4.12 },
  { sym: "BTC", price: 71240, chg: 5.18 },
  { sym: "AAPL", price: 226.45, chg: 1.22 },
  { sym: "TSLA", price: 178.90, chg: -2.43 },
  { sym: "ETH", price: 3815, chg: 3.07 },
  { sym: "MSFT", price: 421.18, chg: 0.86 },
  { sym: "SPY", price: 548.71, chg: 0.42 },
  { sym: "META", price: 502.13, chg: -1.18 },
  { sym: "GOOGL", price: 173.42, chg: 2.31 },
  { sym: "AMZN", price: 188.95, chg: 1.05 },
  { sym: "SOL", price: 168.22, chg: 6.42 },
  { sym: "AMD", price: 162.81, chg: -3.21 },
];

export function Ticker() {
  const items = [...TICKERS, ...TICKERS];
  return (
    <div className="relative overflow-hidden border-y border-border bg-card/40">
      <div className="ticker-scroll flex gap-6 py-2 whitespace-nowrap">
        {items.map((t, i) => {
          const up = t.chg >= 0;
          const Icon = up ? TrendingUp : TrendingDown;
          return (
            <Link
              key={i}
              to="/ticker/$symbol"
              params={{ symbol: t.sym }}
              title={`${t.sym}\nPrice: ${t.price.toLocaleString()}\nChange: ${up ? "+" : ""}${t.chg.toFixed(2)}%\nClick for full institutional analysis →`}
              className="flex items-center gap-2 font-mono text-xs hover:opacity-80 transition-opacity"
            >
              <TickerLogo symbol={t.sym} size="xs" linkTo={false} />
              <span className="font-semibold text-foreground">{t.sym}</span>
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
                {t.chg.toFixed(2)}%
              </span>
              <span className="text-border-strong">·</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
