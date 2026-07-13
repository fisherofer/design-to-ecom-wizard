/**
 * AI Breakout Candidates
 * ======================
 * Ranked breakout picks with market-cap bucket tabs (giving small/micro caps
 * their own spotlight), candlestick pattern detection, Money Flow Index
 * gauge, volume-surge and AI-projected move fields.
 */
import { Rocket, Target, Shield, Activity, ArrowUpRight, ArrowDownRight, Sparkles, Flame } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { alpaca, type BreakoutCandidate, type CapBucket } from "@/lib/alpaca";
import { useWidgetData } from "@/hooks/useWidgetData";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";
import { TickerLogo } from "@/components/tickers/TickerLogo";
import { cn } from "@/lib/utils";

type BucketTab = "all" | "large" | "mid" | "small" | "micro";

const BUCKET_TABS: Array<{ id: BucketTab; label: string; hint: string }> = [
  { id: "all",   label: "All",     hint: "Every candidate" },
  { id: "large", label: "Large",   hint: "Mega + Large caps" },
  { id: "mid",   label: "Mid",     hint: "$2B – $10B" },
  { id: "small", label: "Small",   hint: "$300M – $2B" },
  { id: "micro", label: "Micro",   hint: "< $300M · asymmetric upside" },
];

function bucketMatches(tab: BucketTab, b: CapBucket | undefined): boolean {
  if (tab === "all") return true;
  if (!b) return false;
  if (tab === "large") return b === "mega" || b === "large";
  return b === tab;
}

function fmtCap(n?: number) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

export function BreakoutCandidates() {
  const [tab, setTab] = useState<BucketTab>("all");

  const state = useWidgetData<BreakoutCandidate[]>({
    kind: "breakouts",
    refreshId: "breakouts",
    fetcher: () => alpaca.breakouts(18),
    initial: [],
  });

  const rows = useMemo(
    () => state.data.filter((r) => bucketMatches(tab, r.capBucket)).slice(0, 8),
    [state.data, tab],
  );

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
        subtitle="Scanning NYSE + NASDAQ · ranked by AI reward-to-risk × probability × flow"
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
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors",
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

      <ul className="space-y-3">
        {rows.map((r) => <BreakoutRow key={r.symbol} row={r} />)}
        {rows.length === 0 && (
          <li className="rounded-md border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">
            No candidates for this bucket yet — try “All” or wait for the next AI cycle.
          </li>
        )}
      </ul>
    </div>
  );
}

function BreakoutRow({ row: r }: { row: BreakoutCandidate }) {
  const prob = Math.round(r.probability * 100);
  const probColor = prob >= 75 ? "bg-success" : prob >= 60 ? "bg-warning" : "bg-primary";
  const mfi = r.moneyFlowIndex ?? 50;
  const mfiColor = mfi >= 65 ? "bg-success" : mfi <= 35 ? "bg-destructive" : "bg-warning";
  const flowIn = r.netMoneyFlow === "in";
  const flowOut = r.netMoneyFlow === "out";

  return (
    <li className="rounded-lg border border-border/60 bg-card/30 p-3 hover:bg-card/50 transition-colors">
      <div className="flex items-start gap-3">
        <TickerLogo symbol={r.symbol} size="sm" linkTo={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <Link
                to="/ticker/$symbol"
                params={{ symbol: r.symbol }}
                className="font-mono font-semibold hover:text-primary"
              >
                {r.symbol}
              </Link>
              {r.capBucket && (
                <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-mono uppercase text-muted-foreground">
                  {r.capBucket} · {fmtCap(r.marketCap)}
                </span>
              )}
            </div>
            <span className="text-xs font-mono tabular-nums text-muted-foreground">${r.price.toFixed(2)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground/80">{r.pattern}</span>
            {r.candlePattern && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                <Activity className="h-3 w-3" /> {r.candlePattern}
              </span>
            )}
            {r.catalyst && (
              <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent-foreground/80">⚡ {r.catalyst}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-bold tabular-nums text-primary">{r.opportunityScore ?? prob}</div>
          <div className="text-[9px] font-mono uppercase text-muted-foreground">opp score</div>
          <div className="mt-0.5 text-[9px] font-mono text-muted-foreground">
            R/R <span className="text-success">{(r.rewardToRisk ?? 0).toFixed(1)}×</span> · P {prob}%
          </div>
        </div>
      </div>

      {/* probability bar */}
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full transition-all", probColor)} style={{ width: `${prob}%` }} />
      </div>

      {/* Money Flow gauge */}
      <div className="mt-2.5 grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2">
        <span className="text-[9px] font-mono uppercase text-muted-foreground">MFI</span>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full transition-all", mfiColor)} style={{ width: `${mfi}%` }} />
        </div>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums">
          {flowIn && <ArrowUpRight className="h-3 w-3 text-success" />}
          {flowOut && <ArrowDownRight className="h-3 w-3 text-destructive" />}
          <span className={cn(flowIn && "text-success", flowOut && "text-destructive")}>{mfi}</span>
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground leading-snug line-clamp-2">{r.reason}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono">
        {r.targetPrice != null && (
          <span className="inline-flex items-center gap-1 text-success">
            <Target className="h-3 w-3" /> Tgt ${r.targetPrice.toFixed(2)}
          </span>
        )}
        {r.stopLoss != null && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <Shield className="h-3 w-3" /> SL ${r.stopLoss.toFixed(2)}
          </span>
        )}
        {r.expectedMovePct != null && (
          <span className="inline-flex items-center gap-1 text-primary">
            <ArrowUpRight className="h-3 w-3" /> +{r.expectedMovePct.toFixed(1)}% proj
          </span>
        )}
        {r.volumeSurge != null && (
          <span className={cn(
            "rounded px-1.5 py-0.5",
            r.volumeSurge >= 2 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
          )}>
            Vol ×{r.volumeSurge.toFixed(1)}
          </span>
        )}
      </div>
    </li>
  );
}
