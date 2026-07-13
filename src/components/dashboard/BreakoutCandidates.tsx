/**
 * AI Breakout Candidates — compact tile view
 * ==========================================
 * Ranks by AI profit-potential score (expected move × probability × R/R),
 * shows a big "profit clock" gauge, a small MFI ring, emoji tier badges, and
 * a one-line AI rationale so you know WHY it's on the board.
 */
import { Rocket, Target, Shield, Sparkles, Flame, Info } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { alpaca, type BreakoutCandidate, type CapBucket } from "@/lib/alpaca";
import { useWidgetData } from "@/hooks/useWidgetData";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";
import { TickerLogo } from "@/components/tickers/TickerLogo";
import { PercentGauge } from "@/components/common/PercentGauge";
import { cn } from "@/lib/utils";

type BucketTab = "all" | "large" | "mid" | "small" | "micro";

const BUCKET_TABS: Array<{ id: BucketTab; label: string; hint: string }> = [
  { id: "all",   label: "All",     hint: "Every candidate" },
  { id: "large", label: "Large",   hint: "Mega + Large caps" },
  { id: "mid",   label: "Mid",     hint: "$2B – $10B" },
  { id: "small", label: "Small",   hint: "$300M – $2B" },
  { id: "micro", label: "Micro",   hint: "< $300M · asymmetric" },
];

function bucketMatches(tab: BucketTab, b: CapBucket | undefined): boolean {
  if (tab === "all") return true;
  if (!b) return false;
  if (tab === "large") return b === "mega" || b === "large";
  return b === tab;
}

/** Composite profit-potential score 0..100 */
function profitScore(r: BreakoutCandidate): number {
  const move = Math.min(30, Math.max(0, r.expectedMovePct ?? 0));   // cap 30%
  const prob = Math.max(0, Math.min(1, r.probability ?? 0.5));
  const rr = Math.min(5, Math.max(0.5, r.rewardToRisk ?? 1));
  const raw = (move / 30) * 60 + prob * 25 + (rr / 5) * 15;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

function tierEmoji(score: number): string {
  if (score >= 85) return "🚀";
  if (score >= 70) return "🔥";
  if (score >= 55) return "⚡";
  if (score >= 40) return "💎";
  return "🌱";
}

export function BreakoutCandidates() {
  const [tab, setTab] = useState<BucketTab>("all");

  const state = useWidgetData<BreakoutCandidate[]>({
    kind: "breakouts",
    refreshId: "breakouts",
    fetcher: () => alpaca.breakouts(18),
    initial: [],
  });

  const rows = useMemo(() => {
    return state.data
      .filter((r) => bucketMatches(tab, r.capBucket))
      .map((r) => ({ r, score: profitScore(r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [state.data, tab]);

  const counts = useMemo(() => {
    const c: Record<BucketTab, number> = { all: 0, large: 0, mid: 0, small: 0, micro: 0 };
    for (const r of state.data) {
      c.all++;
      if (r.capBucket === "mega" || r.capBucket === "large") c.large++;
      else if (r.capBucket === "mid") c.mid++;
      else if (r.capBucket === "small") c.small++;
      else if (r.capBucket === "micro") c.micro++;
    }
    return c;
  }, [state.data]);

  return (
    <div className="rounded-xl border border-border glass p-5">
      <WidgetHeader
        title="AI Breakout Candidates"
        subtitle="NYSE + NASDAQ · ranked by AI profit-potential score"
        Icon={Rocket}
        accent="text-primary"
        kind="breakouts"
        source={state.source}
        onSourceChange={state.setSource}
        updatedAt={state.updatedAt}
        nextInMs={state.nextInMs}
        intervalMs={state.intervalMs}
        loading={state.loading}
        onRefresh={state.refresh}
        right={
          <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-primary">
            <Sparkles className="mr-1 inline h-3 w-3" /> AI
          </span>
        }
      />

      <div className="mb-3 -mx-1 flex gap-1 overflow-x-auto pb-1">
        {BUCKET_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.hint}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors",
              tab === t.id
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {t.id === "micro" && <Flame className="h-3 w-3" />}
            {t.label}
            <span className="rounded bg-muted/60 px-1 text-[10px] text-muted-foreground">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map(({ r, score }) => <BreakoutTile key={r.symbol} row={r} score={score} />)}
        {rows.length === 0 && (
          <div className="col-span-full rounded-md border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">
            No candidates for this bucket yet — try "All" or wait for the next AI cycle.
          </div>
        )}
      </div>
    </div>
  );
}

function BreakoutTile({ row: r, score }: { row: BreakoutCandidate; score: number }) {
  const prob = Math.round(r.probability * 100);
  const mfi = r.moneyFlowIndex ?? 50;
  const emoji = tierEmoji(score);

  const tooltip = [
    `${emoji} ${r.symbol} · profit-potential ${score}/100`,
    r.pattern,
    r.candlePattern ? `Candle: ${r.candlePattern}` : "",
    r.catalyst ? `⚡ Catalyst: ${r.catalyst}` : "",
    `Price: $${r.price.toFixed(2)}`,
    r.targetPrice != null ? `🎯 Target: $${r.targetPrice.toFixed(2)}` : "",
    r.stopLoss != null ? `🛡️ Stop: $${r.stopLoss.toFixed(2)}` : "",
    r.expectedMovePct != null ? `📈 Projected: +${r.expectedMovePct.toFixed(1)}%` : "",
    `Probability: ${prob}% · R/R ${(r.rewardToRisk ?? 0).toFixed(1)}× · MFI ${mfi}`,
    r.reason ? `\n🤖 AI: ${r.reason}` : "",
    `\nClick for full institutional analysis →`,
  ].filter(Boolean).join("\n");

  return (
    <Link
      to="/ticker/$symbol"
      params={{ symbol: r.symbol }}
      title={tooltip}
      className="group flex flex-col gap-2 rounded-lg border border-border/60 bg-card/30 p-2.5 hover:border-primary/50 hover:bg-card/60 transition-colors"
    >
      <div className="flex items-start gap-2">
        <TickerLogo symbol={r.symbol} size="sm" linkTo={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-mono text-sm font-bold group-hover:text-primary">
              {emoji} {r.symbol}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              ${r.price.toFixed(2)}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[9px] font-mono uppercase text-muted-foreground">
            {r.capBucket && <span className="rounded bg-muted/60 px-1">{r.capBucket}</span>}
            {r.exchange && <span className="rounded bg-primary/10 px-1 text-primary/80">{r.exchange}</span>}
            <span className="truncate text-foreground/70 normal-case">{r.pattern}</span>
          </div>
        </div>
      </div>

      {/* Big profit-potential gauge + small MFI ring + prob */}
      <div className="flex items-center justify-around gap-1">
        <PercentGauge value={score} size={62} mode="unipolar" label="profit" sublabel="POT" />
        <PercentGauge value={r.expectedMovePct ?? 0} size={48} label="move" sublabel="EXP" />
        <PercentGauge value={mfi} size={48} mode="unipolar" label="MFI" sublabel="MFI" />
      </div>

      {/* AI reason snippet */}
      <p className="flex items-start gap-1 text-[10px] leading-snug text-muted-foreground">
        <Info className="h-3 w-3 mt-0.5 shrink-0 text-primary/70" />
        <span className="line-clamp-2">🤖 {r.reason}</span>
      </p>

      {/* Trade levels */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono">
        {r.targetPrice != null && (
          <span className="inline-flex items-center gap-0.5 text-success">
            <Target className="h-2.5 w-2.5" />${r.targetPrice.toFixed(2)}
          </span>
        )}
        {r.stopLoss != null && (
          <span className="inline-flex items-center gap-0.5 text-destructive">
            <Shield className="h-2.5 w-2.5" />${r.stopLoss.toFixed(2)}
          </span>
        )}
        <span className="text-muted-foreground">R/R {(r.rewardToRisk ?? 0).toFixed(1)}×</span>
        {r.volumeSurge != null && r.volumeSurge >= 1.5 && (
          <span className="rounded bg-success/15 px-1 text-success">📊 ×{r.volumeSurge.toFixed(1)}</span>
        )}
        {r.catalyst && (
          <span className="truncate rounded bg-accent/10 px-1 text-accent-foreground/80">⚡ {r.catalyst}</span>
        )}
      </div>
    </Link>
  );
}
