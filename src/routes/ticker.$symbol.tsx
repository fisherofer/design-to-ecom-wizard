/**
 * Ticker detail — /ticker/:symbol
 * Live quote from Alpaca + TradingView-grade candlestick chart with timeframe
 * selector. Backend fallback keeps mock data flowing if Alpaca is offline.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { TickerLogo } from "@/components/tickers/TickerLogo";
import { CandlestickChart, type ChartMarker } from "@/components/charts/CandlestickChart";
import { alpaca, type AlpacaBar, type AlpacaQuote, type Timeframe } from "@/lib/alpaca";
import { TRACKED_TICKERS } from "@/lib/trackedAssets";
import { tickerColor } from "@/lib/tickerLogo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ticker/$symbol")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.symbol} — Live Chart & Analysis` },
      { name: "description", content: `Live candlestick chart, price snapshot, AI sentiment and research for ${params.symbol}.` },
    ],
  }),
  component: TickerDetail,
});

const TIMEFRAMES: { id: Timeframe; label: string; limit: number }[] = [
  { id: "5Min", label: "1D", limit: 78 },
  { id: "15Min", label: "1W", limit: 130 },
  { id: "1H", label: "1M", limit: 160 },
  { id: "1D", label: "1Y", limit: 260 },
  { id: "1W", label: "5Y", limit: 260 },
];

function TickerDetail() {
  const { symbol } = Route.useParams();
  const sym = symbol.toUpperCase();
  const meta = TRACKED_TICKERS.find((t) => t.symbol === sym);
  const color = tickerColor(sym);

  const [tf, setTf] = useState<Timeframe>("1D");
  const [bars, setBars] = useState<AlpacaBar[]>([]);
  const [quote, setQuote] = useState<AlpacaQuote | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    const cfg = TIMEFRAMES.find((t) => t.id === tf)!;
    Promise.all([alpaca.bars(sym, tf, cfg.limit), alpaca.quotes([sym])])
      .then(([b, q]) => { setBars(b); setQuote(q[0] ?? null); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym, tf]);

  const price = quote?.price ?? meta?.price ?? 0;
  const chgPct = quote?.changePct ?? meta?.change24h ?? 0;
  const up = chgPct >= 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
      </Link>

      <header
        className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-5"
        style={{ background: `linear-gradient(135deg, ${color}22, transparent 60%)` }}
      >
        <TickerLogo symbol={sym} size="md" linkTo={false} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">{sym}</h1>
          <p className="truncate text-sm text-muted-foreground">{meta?.name ?? "Live market data"}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-semibold tabular-nums">${price.toFixed(2)}</div>
          <div className={cn("inline-flex items-center gap-1 font-mono text-sm", up ? "text-success" : "text-destructive")}>
            {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {up ? "+" : ""}{chgPct.toFixed(2)}% · today
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-md border border-border bg-card p-1">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTf(t.id)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors",
                  tf === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1 text-xs font-mono uppercase hover:bg-card/80"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Refresh
          </button>
        </div>
        {bars.length > 0 ? (
          <CandlestickChart bars={bars} height={440} markers={deriveMarkers(bars)} />
        ) : (
          <div className="flex h-[440px] items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Open" value={bars[0]?.o.toFixed(2) ?? "—"} />
        <StatCard label="High" value={Math.max(...(bars.length ? bars.map((b) => b.h) : [0])).toFixed(2)} />
        <StatCard label="Low" value={Math.min(...(bars.length ? bars.map((b) => b.l) : [0])).toFixed(2)} />
        <StatCard label="Volume" value={(bars.reduce((s, b) => s + b.v, 0) / 1e6).toFixed(1) + "M"} />
      </section>

      <InstitutionalAnalysis symbol={sym} bars={bars} price={price} chgPct={chgPct} />


      <section className="rounded-xl border border-border p-5">
        <h2 className="mb-3 font-display text-base font-semibold">External Research</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <ExtLink href={`https://www.tradingview.com/symbols/${sym}/`} label="TradingView" />
          <ExtLink href={`https://finance.yahoo.com/quote/${sym}`} label="Yahoo Finance" />
          <ExtLink href={`https://www.google.com/finance/quote/${sym}`} label="Google Finance" />
          <ExtLink href={`https://seekingalpha.com/symbol/${sym}`} label="Seeking Alpha" />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
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

/** Derive alert markers: bars with unusual volume (>= 2× avg) or large moves (>= 3%). */
function deriveMarkers(bars: AlpacaBar[]): ChartMarker[] {
  if (bars.length < 10) return [];
  const avgVol = bars.reduce((s, b) => s + b.v, 0) / bars.length;
  const out: ChartMarker[] = [];
  for (const b of bars) {
    const movePct = ((b.c - b.o) / b.o) * 100;
    const volSurge = avgVol > 0 ? b.v / avgVol : 1;
    if (volSurge >= 2 && Math.abs(movePct) >= 2) {
      const up = movePct >= 0;
      out.push({
        time: b.t,
        position: up ? "belowBar" : "aboveBar",
        shape: up ? "arrowUp" : "arrowDown",
        color: up ? "#22c55e" : "#ef4444",
        text: `${up ? "▲" : "▼"} ${movePct.toFixed(1)}% · Vol×${volSurge.toFixed(1)}`,
      });
}

/** Institutional-style analysis: SMAs, momentum, RSI, ATR, volume regime, verdict. */
function InstitutionalAnalysis({
  symbol,
  bars,
  price,
  chgPct,
}: {
  symbol: string;
  bars: AlpacaBar[];
  price: number;
  chgPct: number;
}) {
  if (bars.length < 20) {
    return (
      <section className="rounded-xl border border-border p-5">
        <h2 className="mb-2 font-display text-base font-semibold">Institutional Analysis</h2>
        <p className="text-sm text-muted-foreground">Need more history to compute a full report.</p>
      </section>
    );
  }

  const closes = bars.map((b) => b.c);
  const smaN = (n: number) => {
    if (closes.length < n) return null;
    const slice = closes.slice(-n);
    return slice.reduce((s, x) => s + x, 0) / n;
  };
  const sma20 = smaN(20);
  const sma50 = smaN(50);
  const sma150 = smaN(150);

  // RSI(14)
  const period = 14;
  let gains = 0, losses = 0;
  const startIdx = Math.max(1, closes.length - period);
  for (let i = startIdx; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  const rsi = losses === 0 ? 100 : 100 - 100 / (1 + rs);

  // ATR(14) proxy
  const atrPeriod = Math.min(14, bars.length - 1);
  let atrSum = 0;
  for (let i = bars.length - atrPeriod; i < bars.length; i++) {
    const b = bars[i];
    const prevClose = bars[i - 1]?.c ?? b.c;
    atrSum += Math.max(b.h - b.l, Math.abs(b.h - prevClose), Math.abs(b.l - prevClose));
  }
  const atr = atrSum / atrPeriod;
  const atrPct = (atr / price) * 100;

  // Volume regime
  const avgVol = bars.reduce((s, b) => s + b.v, 0) / bars.length;
  const recentVol = bars.slice(-5).reduce((s, b) => s + b.v, 0) / 5;
  const volRegime = recentVol / (avgVol || 1);

  const above = (ma: number | null) => (ma == null ? "—" : price > ma ? "Above" : "Below");
  const trendScore =
    (sma20 && price > sma20 ? 1 : 0) +
    (sma50 && price > sma50 ? 1 : 0) +
    (sma150 && price > sma150 ? 1 : 0);

  const verdict =
    trendScore === 3 && rsi < 75
      ? { label: "Strong Buy", color: "text-success", note: "Aligned uptrend across 20/50/150 SMAs with healthy momentum." }
      : trendScore === 3
      ? { label: "Buy — Overbought", color: "text-warning", note: "Fully aligned trend but RSI stretched; wait for pullback to SMA20." }
      : trendScore === 2
      ? { label: "Accumulate", color: "text-primary", note: "Emerging trend; consider scaling in with tight risk." }
      : trendScore === 1
      ? { label: "Neutral", color: "text-muted-foreground", note: "Mixed structure; wait for confirmation across MAs." }
      : { label: "Avoid / Short bias", color: "text-destructive", note: "Below all key MAs — trend is broken; wait for reclaim." }
    ;

  const suggestedStop = price - 1.5 * atr;
  const target1 = price + 2 * atr;
  const target2 = price + 3.5 * atr;

  return (
    <section className="rounded-xl border border-border p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Institutional Analysis · {symbol}</h2>
        <span className={cn("font-mono text-sm font-semibold uppercase tracking-wider", verdict.color)}>
          {verdict.label}
        </span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{verdict.note}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <AnalysisCell label="SMA 20"  value={sma20  ? `$${sma20.toFixed(2)}`  : "—"} hint={above(sma20)}  color="#38bdf8" />
        <AnalysisCell label="SMA 50"  value={sma50  ? `$${sma50.toFixed(2)}`  : "—"} hint={above(sma50)}  color="#f59e0b" />
        <AnalysisCell label="SMA 150" value={sma150 ? `$${sma150.toFixed(2)}` : "—"} hint={above(sma150)} color="#a855f7" />
        <AnalysisCell label="RSI (14)" value={rsi.toFixed(1)} hint={rsi >= 70 ? "Overbought" : rsi <= 30 ? "Oversold" : "Neutral"} />
        <AnalysisCell label="ATR (14)" value={`$${atr.toFixed(2)}`} hint={`${atrPct.toFixed(2)}% daily range`} />
        <AnalysisCell label="Volume Regime" value={`×${volRegime.toFixed(2)}`} hint={volRegime >= 1.5 ? "Accumulation" : volRegime <= 0.7 ? "Fading" : "Normal"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4 rounded-lg border border-border/60 bg-card/30 p-3">
        <PlanCell label="Entry" value={`$${price.toFixed(2)}`} tone="text-foreground" />
        <PlanCell label="Stop (1.5×ATR)" value={`$${suggestedStop.toFixed(2)}`} tone="text-destructive" />
        <PlanCell label="Target 1 (2×ATR)" value={`$${target1.toFixed(2)}`} tone="text-success" />
        <PlanCell label="Target 2 (3.5×ATR)" value={`$${target2.toFixed(2)}`} tone="text-success" />
      </div>

      <p className="text-[11px] font-mono text-muted-foreground">
        Session move: <span className={chgPct >= 0 ? "text-success" : "text-destructive"}>{chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%</span>
        {" · "}Not investment advice — quantitative summary only.
      </p>
    </section>
  );
}

function AnalysisCell({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </div>
      <div className="mt-1 font-mono text-base font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function PlanCell({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-base font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}
  }
  return out.slice(-12); // cap for legibility
}
