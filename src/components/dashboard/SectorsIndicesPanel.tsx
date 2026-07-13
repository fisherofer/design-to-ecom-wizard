/**
 * SectorsIndicesPanel
 * ===================
 * Groups the market into four tabs — Indices, Sectors (SPDR), Baskets/Themes,
 * and Funds/ETFs — with live quotes for each constituent. Uses the shared
 * useWidgetData hook so it obeys the global refresh interval and rate-limit
 * guards (2s min-gap + circuit breaker) like every other dashboard widget.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { alpaca, type AlpacaQuote } from "@/lib/alpaca";
import { useWidgetData } from "@/hooks/useWidgetData";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";
import { cn } from "@/lib/utils";

type GroupId = "indices" | "sectors" | "baskets" | "funds";

interface Group {
  id: GroupId;
  label: string;
  subtitle: string;
  items: { symbol: string; name: string }[];
}

const GROUPS: Group[] = [
  {
    id: "indices",
    label: "Indices",
    subtitle: "Major US benchmark ETFs",
    items: [
      { symbol: "SPY", name: "S&P 500" },
      { symbol: "QQQ", name: "Nasdaq 100" },
      { symbol: "DIA", name: "Dow Jones" },
      { symbol: "IWM", name: "Russell 2000" },
      { symbol: "MDY", name: "S&P MidCap" },
      { symbol: "VTI", name: "Total Market" },
      { symbol: "EFA", name: "Developed ex-US" },
      { symbol: "EEM", name: "Emerging Mkts" },
    ],
  },
  {
    id: "sectors",
    label: "Sectors",
    subtitle: "SPDR sector ETFs (SPY breakdown)",
    items: [
      { symbol: "XLK", name: "Technology" },
      { symbol: "XLF", name: "Financials" },
      { symbol: "XLV", name: "Health Care" },
      { symbol: "XLY", name: "Cons. Discret." },
      { symbol: "XLP", name: "Cons. Staples" },
      { symbol: "XLE", name: "Energy" },
      { symbol: "XLI", name: "Industrials" },
      { symbol: "XLU", name: "Utilities" },
      { symbol: "XLB", name: "Materials" },
      { symbol: "XLRE", name: "Real Estate" },
      { symbol: "XLC", name: "Comm. Services" },
    ],
  },
  {
    id: "baskets",
    label: "Baskets",
    subtitle: "Thematic exposure baskets",
    items: [
      { symbol: "SMH", name: "Semiconductors" },
      { symbol: "SOXX", name: "Semis (iShares)" },
      { symbol: "IBB", name: "Biotech" },
      { symbol: "ITA", name: "Aerospace/Def." },
      { symbol: "KRE", name: "Regional Banks" },
      { symbol: "XOP", name: "Oil & Gas E&P" },
      { symbol: "GDX", name: "Gold Miners" },
      { symbol: "TAN", name: "Solar" },
      { symbol: "ICLN", name: "Clean Energy" },
      { symbol: "ARKK", name: "Innovation" },
      { symbol: "IBIT", name: "Bitcoin (Spot)" },
      { symbol: "MAGS", name: "Magnificent 7" },
    ],
  },
  {
    id: "funds",
    label: "Funds",
    subtitle: "Popular ETFs & income funds",
    items: [
      { symbol: "VOO", name: "Vanguard S&P 500" },
      { symbol: "VUG", name: "Vanguard Growth" },
      { symbol: "VTV", name: "Vanguard Value" },
      { symbol: "SCHD", name: "Schwab Div." },
      { symbol: "JEPI", name: "JPM Equity Prem" },
      { symbol: "JEPQ", name: "JPM Nasdaq Prem" },
      { symbol: "TLT", name: "20+ yr Treasuries" },
      { symbol: "HYG", name: "High-Yield Bonds" },
      { symbol: "GLD", name: "Gold" },
      { symbol: "SLV", name: "Silver" },
      { symbol: "USO", name: "Oil" },
      { symbol: "UUP", name: "US Dollar" },
    ],
  },
];

export function SectorsIndicesPanel() {
  const [tab, setTab] = useState<GroupId>("indices");
  const active = GROUPS.find((g) => g.id === tab)!;
  const symbols = active.items.map((i) => i.symbol);

  const { data, loading, updatedAt, intervalMs, nextInMs, source, setSource, refresh } =
    useWidgetData<AlpacaQuote[]>({
      kind: "movers",
      refreshId: "kpi",
      fetcher: () => alpaca.quotes(symbols),
      initial: [],
    });

  const quoteMap = new Map(data.map((q) => [q.symbol, q]));

  return (
    <div className="rounded-xl border border-border glass p-5">
      <WidgetHeader
        title="Sectors · Indices · Baskets · Funds"
        subtitle={active.subtitle}
        Icon={LayoutGrid}
        accent="text-primary"
        kind="movers"
        source={source}
        onSourceChange={setSource}
        updatedAt={updatedAt}
        nextInMs={nextInMs}
        intervalMs={intervalMs}
        loading={loading}
        onRefresh={refresh}
      />

      {/* Tabs */}
      <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setTab(g.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors",
              tab === g.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
        {active.items.map((item) => {
          const q = quoteMap.get(item.symbol);
          const pct = q?.changePct ?? 0;
          const up = pct >= 0;
          return (
            <Link
              key={item.symbol}
              to="/ticker/$symbol"
              params={{ symbol: item.symbol }}
              className={cn(
                "group flex flex-col rounded-md border border-border/40 p-2 transition-transform hover:scale-[1.02] hover:border-primary/60",
                up ? "bg-success/10" : pct < 0 ? "bg-destructive/10" : "bg-muted/20",
              )}
              title={`${item.symbol} · ${item.name}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs font-bold">{item.symbol}</span>
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    up ? "text-success" : pct < 0 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {q ? `${up ? "+" : ""}${pct.toFixed(2)}%` : "—"}
                </span>
              </div>
              <span className="line-clamp-1 text-[10px] text-muted-foreground">{item.name}</span>
              <span className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {q ? `$${q.price.toFixed(2)}` : "—"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
