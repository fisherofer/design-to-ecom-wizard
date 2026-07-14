/**
 * AI Recommended Tickers
 * ======================
 * Uses Lovable AI (Gemini) to rank symbols and produce short-term picks
 * with rationale. Persists every batch to `ai_recommendation_log` so the
 * user can review the AI's historical calls and learn its behaviour.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Brain, History, Sparkles, RefreshCw, Info, TrendingUp, TrendingDown, HelpCircle } from "lucide-react";
import { TickerLogo } from "@/components/tickers/TickerLogo";
import { TickerHoverCard } from "@/components/tickers/TickerHoverCard";
import { generateAiRecommendations, listAiRecommendations, type AiPick, type AiRecommendationBatch } from "@/lib/aiRecommendations.functions";
import { alpaca, type Watchlist } from "@/lib/alpaca";
import { cn } from "@/lib/utils";

const HORIZON = 10;

function actionTone(a: AiPick["action"]) {
  if (a === "buy") return "bg-success/15 text-success border-success/40";
  if (a === "avoid") return "bg-destructive/15 text-destructive border-destructive/40";
  return "bg-warning/15 text-warning border-warning/40";
}

export function AiRecommendedTickers() {
  const generate = useServerFn(generateAiRecommendations);
  const listHistory = useServerFn(listAiRecommendations);

  const [current, setCurrent] = useState<AiRecommendationBatch | null>(null);
  const [history, setHistory] = useState<AiRecommendationBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showExplain, setShowExplain] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const rows = await listHistory({ data: { limit: 12 } });
      setHistory(rows);
      if (!current && rows[0]) setCurrent(rows[0]);
    } catch (e) {
      console.warn("[AiRecs] history load failed", e);
    }
  }, [listHistory, current]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Universe = union of Alpaca watchlist symbols + top movers, capped at 30.
      const [lists, movers] = await Promise.all([
        alpaca.listWatchlists().catch(() => [] as Watchlist[]),
        alpaca.movers("active").catch(() => []),
      ]);
      const universe = Array.from(
        new Set([
          ...lists.flatMap((l) => l.symbols),
          ...movers.map((m) => m.symbol),
          "NVDA", "AAPL", "MSFT", "META", "TSLA", "AMD", "GOOGL", "AMZN", "SPY", "QQQ",
        ]),
      ).slice(0, 30);

      const batch = await generate({
        data: { universe, horizonDays: HORIZON, context: "US session, mixed macro backdrop" },
      });
      setCurrent(batch);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI recommendation failed");
    } finally {
      setLoading(false);
    }
  }, [generate, loadHistory]);

  const picks = current?.picks ?? [];
  const generatedLabel = useMemo(() => {
    if (!current?.generatedAt) return "";
    return new Date(current.generatedAt).toLocaleString();
  }, [current]);

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-transparent p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="font-display text-base font-semibold">AI Recommended Tickers</h3>
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-primary">
            <Sparkles className="mr-0.5 inline h-2.5 w-2.5" /> Gemini
          </span>
          <button
            onClick={() => setShowExplain((v) => !v)}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground"
            title="How does this work?"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors",
              showHistory ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <History className="h-3 w-3" /> History ({history.length})
          </button>
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            {loading ? "Thinking…" : "Retrain / Run"}
          </button>
        </div>
      </div>

      {showExplain && (
        <div className="mb-3 rounded-md border border-border/70 bg-card/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <p className="mb-1 text-foreground/90">
            <Info className="mr-1 inline h-3 w-3" /> How the AI picks these tickers
          </p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>We build a universe from your Alpaca watchlists + today's most active tickers.</li>
            <li>Gemini ranks them by risk-adjusted upside over the next {HORIZON} sessions.</li>
            <li>Each pick returns a rationale, catalysts and risks — visible on the card.</li>
            <li>Every run is logged so you can see the AI's track record over time (History tab).</li>
          </ol>
          <p className="mt-2 text-warning/90">Educational only — not investment advice.</p>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {current?.rationale && (
        <p className="mb-3 rounded-md bg-card/40 px-3 py-2 text-[11px] italic leading-relaxed text-muted-foreground">
          <Sparkles className="mr-1 inline h-3 w-3 text-primary/80" />
          {current.rationale}
        </p>
      )}

      {picks.length === 0 && !loading ? (
        <div className="rounded-md border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">
          No AI recommendations yet — press <b>Retrain / Run</b> to generate a fresh batch.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {picks.map((p) => <PickCard key={p.symbol} pick={p} />)}
        </div>
      )}

      {generatedLabel && (
        <p className="mt-3 text-right text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
          Last run · {generatedLabel} · model {current?.model}
        </p>
      )}

      {showHistory && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <h4 className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            AI Recommendation History
          </h4>
          {history.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No history yet.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {history.map((h) => (
                <li key={h.id} className="rounded-md border border-border/50 bg-card/30 p-2">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    <span>{new Date(h.generatedAt).toLocaleString()}</span>
                    <span>{h.model}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {h.picks.map((p) => (
                      <TickerHoverCard key={p.symbol} symbol={p.symbol} extra={<span>🤖 {p.rationale}</span>}>
                        <Link
                          to="/ticker/$symbol"
                          params={{ symbol: p.symbol }}
                          className={cn(
                            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono",
                            actionTone(p.action),
                          )}
                        >
                          {p.action === "buy" ? <TrendingUp className="h-2.5 w-2.5" /> : p.action === "avoid" ? <TrendingDown className="h-2.5 w-2.5" /> : null}
                          {p.symbol} · {p.score}
                        </Link>
                      </TickerHoverCard>
                    ))}
                  </div>
                  {h.rationale && (
                    <p className="mt-1 line-clamp-2 text-[10px] italic text-muted-foreground">{h.rationale}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PickCard({ pick }: { pick: AiPick }) {
  const extra = (
    <div className="space-y-1">
      <p className="text-foreground/90">🤖 {pick.rationale}</p>
      {pick.catalysts && pick.catalysts.length > 0 && (
        <p><b className="text-success">Catalysts:</b> {pick.catalysts.join(" · ")}</p>
      )}
      {pick.risks && pick.risks.length > 0 && (
        <p><b className="text-destructive">Risks:</b> {pick.risks.join(" · ")}</p>
      )}
      <p className="text-muted-foreground">Horizon: {pick.horizonDays} sessions</p>
    </div>
  );

  return (
    <TickerHoverCard symbol={pick.symbol} extra={extra}>
      <Link
        to="/ticker/$symbol"
        params={{ symbol: pick.symbol }}
        className="group flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card/40 p-2.5 hover:border-primary/60 hover:bg-card/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <TickerLogo symbol={pick.symbol} size="sm" linkTo={false} hoverPreview={false} />
          <span className="font-mono text-sm font-bold group-hover:text-primary">{pick.symbol}</span>
          <span className={cn("ml-auto rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase", actionTone(pick.action))}>
            {pick.action}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-lg font-bold tabular-nums">{pick.score}</span>
            <span className="text-[9px] font-mono uppercase text-muted-foreground">/100</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">{pick.horizonDays}d</span>
        </div>
        <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
          {pick.rationale}
        </p>
      </Link>
    </TickerHoverCard>
  );
}
