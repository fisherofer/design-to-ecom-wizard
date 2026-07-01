/**
 * Ticker detail page — /ticker/:symbol
 * Shows logo, price snapshot, AI sentiment, recent context and quick actions.
 * Data source: tracked assets + ticker mock; wire to Bridge (/api/quote/:sym) when ready.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { TickerLogo } from "@/components/tickers/TickerLogo";
import { TRACKED_TICKERS } from "@/lib/trackedAssets";
import { tickerColor } from "@/lib/tickerLogo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ticker/$symbol")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.symbol} — Ticker Detail` },
      { name: "description", content: `Live snapshot, AI sentiment and news for ${params.symbol}.` },
    ],
  }),
  component: TickerDetail,
});

function TickerDetail() {
  const { symbol } = Route.useParams();
  const sym = symbol.toUpperCase();
  const asset = TRACKED_TICKERS.find((t) => t.symbol === sym);
  const color = tickerColor(sym);
  const up = (asset?.change24h ?? 0) >= 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <header
        className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-5"
        style={{ background: `linear-gradient(135deg, ${color}22, transparent 60%)` }}
      >
        <TickerLogo symbol={sym} size="md" linkTo={false} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">{sym}</h1>
          <p className="truncate text-sm text-muted-foreground">{asset?.name ?? "Unknown security"}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-semibold tabular-nums">
            ${asset?.price.toFixed(2) ?? "—"}
          </div>
          <div className={cn("inline-flex items-center gap-1 font-mono text-sm", up ? "text-success" : "text-destructive")}>
            {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {up ? "+" : ""}{asset?.change24h.toFixed(2) ?? "0.00"}% · 24h
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="AI Score" value={`${asset?.aiScore ?? "—"}`} tone={asset && asset.aiScore >= 70 ? "good" : "neutral"} />
        <StatCard label="Sentiment" value={asset?.sentiment ?? "N/A"} tone={asset?.sentiment === "Bullish" ? "good" : asset?.sentiment === "Bearish" ? "bad" : "neutral"} />
        <StatCard label="Source" value="Watchlist" tone="neutral" />
      </section>

      <section className="rounded-xl border border-border p-5">
        <h2 className="mb-3 font-display text-base font-semibold">External Research</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <ExtLink href={`https://finance.yahoo.com/quote/${sym}`} label="Yahoo Finance" />
          <ExtLink href={`https://www.tradingview.com/symbols/${sym}/`} label="TradingView" />
          <ExtLink href={`https://www.google.com/finance/quote/${sym}`} label="Google Finance" />
          <ExtLink href={`https://seekingalpha.com/symbol/${sym}`} label="Seeking Alpha" />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "neutral" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 font-display text-xl font-semibold",
        tone === "good" && "text-success",
        tone === "bad" && "text-destructive",
      )}>{value}</div>
    </div>
  );
}

function ExtLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
    </a>
  );
}
