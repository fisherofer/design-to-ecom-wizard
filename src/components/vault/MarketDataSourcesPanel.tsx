/**
 * MarketDataSourcesPanel — read-only surfacing of the shared source registry
 * (mirrors backend config.MARKET_DATA_SOURCES). Groups sources by role,
 * shows the iron rule + rate-limit note for each, and flags any Stage-1
 * violation surfaced by assertStage1Safe().
 */
import { useMemo } from "react";
import {
  MARKET_DATA_SOURCES,
  assertStage1Safe,
  type MarketDataSource,
  type SourceRole,
} from "@/lib/marketDataSources";
import { AlertTriangle, ExternalLink, ShieldCheck, ShieldAlert } from "lucide-react";

const ROLE_LABELS: Record<SourceRole, string> = {
  execution: "Execution (Broker)",
  market_data: "Market Data",
  market_data_and_news: "Market Data + News",
  news: "News",
  sentiment_reference: "Sentiment",
  institutional_holdings_reference: "Institutional Holdings",
  reference: "Reference / Click-through",
  llm_fallback_tier2: "LLM Fallback · Tier 2",
  llm_fallback_tier3: "LLM Fallback · Tier 3",
  youtube_channel_addition: "YouTube Channel",
};

const ROLE_TONE: Record<SourceRole, string> = {
  execution: "border-destructive/40 bg-destructive/10 text-destructive",
  market_data: "border-primary/30 bg-primary/10 text-primary",
  market_data_and_news: "border-primary/30 bg-primary/10 text-primary",
  news: "border-accent/30 bg-accent/10 text-accent",
  sentiment_reference: "border-warning/30 bg-warning/10 text-warning",
  institutional_holdings_reference: "border-success/30 bg-success/10 text-success",
  reference: "border-border bg-muted/30 text-muted-foreground",
  llm_fallback_tier2: "border-accent/30 bg-accent/10 text-accent",
  llm_fallback_tier3: "border-destructive/30 bg-destructive/10 text-destructive",
  youtube_channel_addition: "border-border bg-muted/30 text-muted-foreground",
};

export function MarketDataSourcesPanel() {
  const stageError = useMemo(() => {
    try {
      assertStage1Safe();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  const groups = useMemo(() => {
    const map = new Map<SourceRole, MarketDataSource[]>();
    for (const s of MARKET_DATA_SOURCES) {
      const arr = map.get(s.role) ?? [];
      arr.push(s);
      map.set(s.role, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <section className="mb-6 rounded-xl border border-border glass p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest">
            Market Data Sources · Registry
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Mirrors <code className="font-mono">config.MARKET_DATA_SOURCES</code> in the local backend. Every allowed
            external URL lives here — nothing else.
          </p>
        </div>
        {stageError ? (
          <span className="inline-flex items-center gap-1.5 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-destructive">
            <ShieldAlert className="h-3 w-3" /> Stage-1 violation
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded border border-success/40 bg-success/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-success">
            <ShieldCheck className="h-3 w-3" /> Stage 1 safe · paper-only
          </span>
        )}
      </header>

      {stageError && (
        <div className="mb-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="font-mono">{stageError}</span>
        </div>
      )}

      <div className="space-y-4">
        {groups.map(([role, list]) => (
          <div key={role}>
            <div className="mb-1.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <span className={`rounded border px-1.5 py-0.5 ${ROLE_TONE[role]}`}>{ROLE_LABELS[role]}</span>
              <span>{list.length}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((s) => (
                <div key={s.name} className="rounded-lg border border-border bg-card/30 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-sm">{s.name}</div>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{s.url}</span>
                      </a>
                    </div>
                    {s.keyProvider ? (
                      <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                        key: {s.keyProvider}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        no key
                      </span>
                    )}
                  </div>
                  <dl className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                    <div>
                      <dt className="inline font-mono uppercase tracking-widest text-[9px] text-muted-foreground/70">
                        rate limit ·{" "}
                      </dt>
                      <dd className="inline">{s.rateLimit}</dd>
                    </div>
                    <div>
                      <dt className="inline font-mono uppercase tracking-widest text-[9px] text-muted-foreground/70">
                        iron rule ·{" "}
                      </dt>
                      <dd className="inline">{s.ironRule}</dd>
                    </div>
                    {s.preferInstead && (
                      <div className="text-warning">
                        <dt className="inline font-mono uppercase tracking-widest text-[9px]">prefer instead · </dt>
                        <dd className="inline">{s.preferInstead}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
