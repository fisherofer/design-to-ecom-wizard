import { useEffect, useMemo, useState } from "react";
import { Plus, X, ListFilter, TrendingUp, TrendingDown, Minus, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { alpaca, type AlpacaQuote, type Watchlist } from "@/lib/alpaca";
import { useRefreshInterval } from "@/lib/refreshIntervals";
import { DASHBOARD_REFRESH_EVENT } from "./RefreshButton";
import { TickerLogo } from "@/components/tickers/TickerLogo";
import { cn } from "@/lib/utils";

type FilterKey = "all" | "gainers" | "losers" | "flat";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "gainers", label: "Gainers" },
  { key: "losers", label: "Losers" },
  { key: "flat", label: "Flat" },
];

type SortKey = "symbol" | "price" | "change";

export function WatchlistPanel() {
  const [wls, setWls] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<AlpacaQuote[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("change");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState("");
  const ms = useRefreshInterval("ticker");

  // Load watchlists.
  useEffect(() => {
    alpaca.listWatchlists().then((list) => {
      setWls(list);
      if (list.length > 0 && !activeId) setActiveId(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = wls.find((w) => w.id === activeId) ?? null;

  // Load quotes for active watchlist.
  useEffect(() => {
    if (!active || active.symbols.length === 0) {
      setQuotes([]);
      return;
    }
    let cancelled = false;
    const load = () => alpaca.quotes(active.symbols).then((q) => !cancelled && setQuotes(q));
    load();
    const id = ms > 0 ? window.setInterval(load, ms) : null;
    const onManual = () => load();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    return () => {
      cancelled = true;
      if (id) window.clearInterval(id);
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    };
  }, [active, ms]);

  const rows = useMemo(() => {
    let list = quotes.slice();
    if (search) {
      const q = search.toUpperCase();
      list = list.filter((r) => r.symbol.includes(q));
    }
    if (filter === "gainers") list = list.filter((r) => r.changePct > 0.1);
    if (filter === "losers") list = list.filter((r) => r.changePct < -0.1);
    if (filter === "flat") list = list.filter((r) => Math.abs(r.changePct) <= 0.1);
    list.sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sort === "price") return b.price - a.price;
      return b.changePct - a.changePct;
    });
    return list;
  }, [quotes, filter, sort, search]);

  const addSymbol = async () => {
    const sym = adding.trim().toUpperCase();
    if (!sym || !active) return;
    if (active.symbols.includes(sym)) {
      setAdding("");
      return;
    }
    const next = [...active.symbols, sym];
    const updated = await alpaca.updateWatchlist(active.id, next);
    setWls(wls.map((w) => (w.id === active.id ? { ...w, symbols: updated.symbols } : w)));
    setAdding("");
  };

  const removeSymbol = async (sym: string) => {
    if (!active) return;
    const next = active.symbols.filter((s) => s !== sym);
    const updated = await alpaca.updateWatchlist(active.id, next);
    setWls(wls.map((w) => (w.id === active.id ? { ...w, symbols: updated.symbols } : w)));
  };

  return (
    <div className="rounded-xl border border-border glass p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-warning" />
          <h3 className="font-display text-base font-semibold">My Watchlist</h3>
          {wls.length > 1 && (
            <select
              value={activeId ?? ""}
              onChange={(e) => setActiveId(e.target.value)}
              className="ml-2 rounded-md border border-border bg-card/60 px-2 py-1 text-xs font-mono"
            >
              {wls.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
        </div>
        <Link to="/watchlists" className="text-[10px] font-mono uppercase tracking-wider text-primary hover:underline">
          Manage all →
        </Link>
      </div>

      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors",
              filter === f.key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card/40 text-muted-foreground hover:bg-card",
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-7 w-28 rounded-md border border-border bg-card/60 px-2 text-xs font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-7 rounded-md border border-border bg-card/60 px-2 text-xs font-mono"
            title="Sort by"
          >
            <option value="change">Sort: %Δ</option>
            <option value="price">Sort: Price</option>
            <option value="symbol">Sort: Symbol</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <th className="py-2 text-left font-medium">Symbol</th>
              <th className="py-2 text-right font-medium">Price</th>
              <th className="py-2 text-right font-medium">24h</th>
              <th className="py-2 text-right font-medium">Volume</th>
              <th className="py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-xs font-mono text-muted-foreground">
                  {active?.symbols.length === 0 ? "Watchlist empty — add a symbol below." : "No matches for current filter."}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const up = r.changePct >= 0;
                const Icon = r.changePct === 0 ? Minus : up ? TrendingUp : TrendingDown;
                return (
                  <tr key={r.symbol} className="border-b border-border/30 last:border-0 hover:bg-card/30 transition-colors">
                    <td className="py-2">
                      <Link to="/ticker/$symbol" params={{ symbol: r.symbol }} className="flex items-center gap-2 hover:opacity-80">
                        <TickerLogo symbol={r.symbol} size="sm" linkTo={false} />
                        <span className="font-mono font-semibold">{r.symbol}</span>
                      </Link>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">${r.price.toFixed(2)}</td>
                    <td className={cn("py-2 text-right font-mono tabular-nums", up ? "text-success" : "text-destructive")}>
                      <span className="inline-flex items-center gap-1">
                        <Icon className="h-3 w-3" />
                        {up ? "+" : ""}{r.changePct.toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {r.volume ? `${(r.volume / 1e6).toFixed(1)}M` : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => removeSymbol(r.symbol)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Remove from watchlist"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && addSymbol()}
          placeholder="Add symbol (e.g. NVDA)"
          className="h-8 flex-1 rounded-md border border-border bg-card/60 px-3 text-xs font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50"
        />
        <button
          onClick={addSymbol}
          className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-primary hover:bg-primary/20"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
    </div>
  );
}
