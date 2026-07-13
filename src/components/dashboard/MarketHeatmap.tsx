/**
 * AI Market Heatmap
 * =================
 * Compact NYSE + NASDAQ heatmap showing ONLY AI-selected tickers (not the
 * whole S&P 500) — sourced from breakout candidates + top movers, ranked by
 * opportunity score, colored by % change, sized by cap bucket.
 */
import { useMemo } from "react";
import { Grid3x3, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { alpaca, type BreakoutCandidate, type AlpacaMover } from "@/lib/alpaca";
import { useWidgetData } from "@/hooks/useWidgetData";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";
import { cn } from "@/lib/utils";

type Cell = {
  symbol: string;
  changePct: number;
  score: number;      // opportunity or |change|
  size: "xl" | "lg" | "md" | "sm";
  reason?: string;
};

function heatColor(pct: number): string {
  // -6% → deep red, 0 → neutral, +6% → deep green
  const clamped = Math.max(-6, Math.min(6, pct));
  const t = (clamped + 6) / 12;  // 0..1
  if (t < 0.5) {
    const k = 1 - t * 2;
    return `rgba(239, 68, 68, ${0.15 + k * 0.55})`; // red
  }
  const k = (t - 0.5) * 2;
  return `rgba(34, 197, 94, ${0.15 + k * 0.55})`;   // green
}

function sizeFor(bucket?: string, score?: number): Cell["size"] {
  if (bucket === "mega" || (score ?? 0) >= 70) return "xl";
  if (bucket === "large" || (score ?? 0) >= 50) return "lg";
  if (bucket === "mid" || (score ?? 0) >= 30) return "md";
  return "sm";
}

const SIZE_CLASSES: Record<Cell["size"], string> = {
  xl: "col-span-2 row-span-2 min-h-[100px]",
  lg: "col-span-2 row-span-1 min-h-[68px]",
  md: "col-span-1 row-span-1 min-h-[68px]",
  sm: "col-span-1 row-span-1 min-h-[52px]",
};

export function MarketHeatmap() {
  const breakouts = useWidgetData<BreakoutCandidate[]>({
    kind: "breakouts",
    refreshId: "breakouts",
    fetcher: () => alpaca.breakouts(18),
    initial: [],
  });

  const gainers = useWidgetData<AlpacaMover[]>({
    kind: "movers",
    refreshId: "ticker",
    fetcher: () => alpaca.movers("gainers"),
    initial: [],
  });

  const losers = useWidgetData<AlpacaMover[]>({
    kind: "movers",
    refreshId: "ticker",
    fetcher: () => alpaca.movers("losers"),
    initial: [],
  });

  const cells = useMemo<Cell[]>(() => {
    const byId = new Map<string, Cell>();

    // 1) AI breakouts weighted highest (they carry opportunityScore + capBucket)
    for (const b of breakouts.data) {
      byId.set(b.symbol, {
        symbol: b.symbol,
        changePct: b.changePct,
        score: b.opportunityScore ?? Math.round((b.probability ?? 0) * 100),
        size: sizeFor(b.capBucket, b.opportunityScore),
        reason: `${b.pattern} · ${b.catalyst ?? ""}`.trim(),
      });
    }
    // 2) Fill remaining slots from top movers (skip duplicates)
    const movers = [...gainers.data.slice(0, 6), ...losers.data.slice(0, 4)];
    for (const m of movers) {
      if (byId.has(m.symbol)) continue;
      byId.set(m.symbol, {
        symbol: m.symbol,
        changePct: m.changePct,
        score: Math.abs(m.changePct) * 5,
        size: Math.abs(m.changePct) >= 5 ? "md" : "sm",
      });
    }
    return Array.from(byId.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
  }, [breakouts.data, gainers.data, losers.data]);

  const stats = useMemo(() => {
    const up = cells.filter((c) => c.changePct >= 0).length;
    const down = cells.length - up;
    const avg = cells.reduce((s, c) => s + c.changePct, 0) / (cells.length || 1);
    return { up, down, avg };
  }, [cells]);

  return (
    <div className="rounded-xl border border-border glass p-5">
      <WidgetHeader
        title="AI Market Heatmap"
        subtitle="Curated picks · NYSE + NASDAQ · size = AI conviction · color = live Δ%"
        Icon={Grid3x3}
        accent="text-primary"
        kind="breakouts"
        source={breakouts.source}
        onSourceChange={breakouts.setSource}
        updatedAt={breakouts.updatedAt}
        nextInMs={breakouts.nextInMs}
        intervalMs={breakouts.intervalMs}
        loading={breakouts.loading || gainers.loading || losers.loading}
        onRefresh={() => { breakouts.refresh(); gainers.refresh(); losers.refresh(); }}
        right={
          <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-primary">
            <Sparkles className="mr-1 inline h-3 w-3" /> AI
          </span>
        }
      />

      {/* Aggregate strip */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>{cells.length} picks</span>
        <span className="text-success">▲ {stats.up}</span>
        <span className="text-destructive">▼ {stats.down}</span>
        <span className={cn(stats.avg >= 0 ? "text-success" : "text-destructive")}>
          avg {stats.avg >= 0 ? "+" : ""}{stats.avg.toFixed(2)}%
        </span>
      </div>

      <div className="grid grid-cols-6 auto-rows-min gap-1.5 sm:grid-cols-8">
        {cells.map((c) => {
          const up = c.changePct >= 0;
          return (
            <Link
              key={c.symbol}
              to="/ticker/$symbol"
              params={{ symbol: c.symbol }}
              title={`${c.symbol} · ${up ? "+" : ""}${c.changePct.toFixed(2)}% · score ${c.score}${c.reason ? " · " + c.reason : ""}`}
              className={cn(
                "group relative flex flex-col items-center justify-center rounded-md border border-border/40 p-1.5 text-center transition-transform hover:scale-[1.03] hover:z-10 hover:border-primary/60",
                SIZE_CLASSES[c.size],
              )}
              style={{ background: heatColor(c.changePct) }}
            >
              <span className="font-mono text-[11px] font-bold text-foreground drop-shadow-sm">
                {c.symbol}
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums drop-shadow-sm",
                  up ? "text-success-foreground" : "text-destructive-foreground",
                  "text-foreground/90",
                )}
              >
                {up ? "+" : ""}{c.changePct.toFixed(2)}%
              </span>
              {(c.size === "xl" || c.size === "lg") && c.reason && (
                <span className="mt-0.5 line-clamp-1 text-[8px] font-mono uppercase tracking-wider text-muted-foreground/90">
                  {c.reason.slice(0, 28)}
                </span>
              )}
            </Link>
          );
        })}
        {cells.length === 0 && (
          <div className="col-span-full rounded-md border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">
            Waiting for AI picks…
          </div>
        )}
      </div>
    </div>
  );
}
