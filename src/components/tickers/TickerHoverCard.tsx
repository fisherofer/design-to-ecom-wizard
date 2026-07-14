/**
 * TickerHoverCard
 * ===============
 * Wrap any element (logo, symbol chip, table row) — on hover it fetches
 * a live Alpaca quote and shows price, %, volume and quick actions.
 * Fetches lazily on open, caches for 30s per symbol.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { TrendingDown, TrendingUp, ExternalLink, Activity } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { alpaca, type AlpacaQuote } from "@/lib/alpaca";
import { TickerLogo } from "@/components/tickers/TickerLogo";
import { cn } from "@/lib/utils";

const CACHE = new Map<string, { q: AlpacaQuote; at: number }>();
const TTL = 30_000;

async function getQuoteCached(symbol: string): Promise<AlpacaQuote | null> {
  const hit = CACHE.get(symbol);
  if (hit && Date.now() - hit.at < TTL) return hit.q;
  const [q] = await alpaca.quotes([symbol]);
  if (q) CACHE.set(symbol, { q, at: Date.now() });
  return q ?? null;
}

export function TickerHoverCard({
  symbol,
  children,
  extra,
}: {
  symbol: string;
  children: React.ReactNode;
  /** Extra rows appended below the quote — used to inject AI rationale, breakout targets, etc. */
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<AlpacaQuote | null>(() => CACHE.get(symbol)?.q ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getQuoteCached(symbol)
      .then((q) => { if (!cancelled) setQuote(q); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, symbol]);

  const up = (quote?.changePct ?? 0) >= 0;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <HoverCard openDelay={150} closeDelay={80} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>{children as React.ReactElement}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        sideOffset={6}
        className="w-72 border-border/70 bg-popover/95 p-0 shadow-xl backdrop-blur"
      >
        <div className="flex items-center gap-2.5 border-b border-border/60 bg-gradient-to-r from-primary/10 via-transparent to-transparent px-3.5 py-2.5">
          <TickerLogo symbol={symbol} size="md" linkTo={false} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold">{symbol}</span>
              {quote && (
                <span className="font-mono text-xs tabular-nums">${quote.price.toFixed(2)}</span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider">
              {loading && !quote ? (
                <span className="text-muted-foreground">loading…</span>
              ) : quote ? (
                <span className={cn("inline-flex items-center gap-0.5", up ? "text-success" : "text-destructive")}>
                  <Icon className="h-3 w-3" />
                  {up ? "+" : ""}{quote.changePct.toFixed(2)}%
                </span>
              ) : (
                <span className="text-muted-foreground">no quote</span>
              )}
              {quote?.volume ? (
                <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  {(quote.volume / 1e6).toFixed(1)}M
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {extra ? (
          <div className="border-b border-border/40 px-3.5 py-2.5 text-[11px] leading-snug text-muted-foreground">
            {extra}
          </div>
        ) : null}

        <div className="flex items-center justify-between px-3.5 py-2 text-[10px] font-mono uppercase tracking-wider">
          <Link
            to="/ticker/$symbol"
            params={{ symbol }}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open ticker <ExternalLink className="h-3 w-3" />
          </Link>
          <span className="text-muted-foreground">Alpaca · live</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
