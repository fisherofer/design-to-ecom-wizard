/**
 * TickerSearchInput — combobox that searches tickers by symbol, company name,
 * and common aliases. Debounced, keyboard-navigable, closes on outside click.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchTickers, type TickerSearchHit } from "@/lib/tickerSearch";
import { cn } from "@/lib/utils";

interface Props {
  onPick: (symbol: string, hit?: TickerSearchHit) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function TickerSearchInput({ onPick, placeholder = "Search by ticker or company…", className, autoFocus }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TickerSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const list = await searchTickers(query, 10);
      if (!cancelled) {
        setHits(list);
        setActive(0);
        setOpen(list.length > 0);
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (hit: TickerSearchHit) => {
    onPick(hit.symbol, hit);
    setQuery("");
    setHits([]);
    setOpen(false);
  };

  const submit = () => {
    if (hits[active]) pick(hits[active]);
    else if (query.trim()) {
      onPick(query.trim().toUpperCase());
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 h-8">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); submit(); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-xs font-mono outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {hits.map((h, i) => (
            <button
              key={h.symbol}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(h)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left text-xs",
                i === active ? "bg-primary/10" : "hover:bg-card",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-mono font-semibold">{h.symbol}</span>
                <span className="truncate text-muted-foreground">{h.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-mono uppercase text-muted-foreground">
                {h.type && <span className="rounded bg-muted px-1">{h.type}</span>}
                {h.exchange && <span>{h.exchange}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
