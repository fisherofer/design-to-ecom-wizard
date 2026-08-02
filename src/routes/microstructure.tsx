import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Layers3, BookOpen, Activity, RefreshCw, AlertTriangle } from "lucide-react";
import {
  fetchBook,
  fetchOptionsChain,
  fetchTape,
  summariseChain,
  type BookSnapshot,
  type OptionsChain,
  type OptionRow,
  type TapeSnapshot,
} from "@/lib/microstructure";

export const Route = createFileRoute("/microstructure")({
  head: () => ({
    meta: [
      { title: "Market Microstructure — Options, Book & Tape" },
      {
        name: "description",
        content:
          "Options chain, NBBO quote depth and time & sales tape for any US symbol, served from the local quant backend.",
      },
      { property: "og:title", content: "Market Microstructure — Options, Book & Tape" },
      {
        property: "og:description",
        content: "Options chain, quote depth and time & sales for US equities in one institutional panel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MicrostructurePage,
});

function MicrostructurePage() {
  const [input, setInput] = useState("AAPL");
  const [symbol, setSymbol] = useState("AAPL");
  const [chain, setChain] = useState<OptionsChain | null>(null);
  const [book, setBook] = useState<BookSnapshot | null>(null);
  const [tape, setTape] = useState<TapeSnapshot | null>(null);
  const [expiry, setExpiry] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (sym: string, exp?: string) => {
      setLoading(true);
      const [c, b, t] = await Promise.all([fetchOptionsChain(sym, exp), fetchBook(sym), fetchTape(sym, 60)]);
      setChain(c);
      setBook(b);
      setTape(t);
      setExpiry(c.expiry);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    void load(symbol, expiry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Layers3 className="h-5 w-5 text-primary" />
            Market Microstructure
          </h1>
          <p className="text-xs text-muted-foreground">
            Options chain · NBBO quote · time &amp; sales — free delayed feed (yfinance) via the local backend.
          </p>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const s = input.trim().toUpperCase();
            if (s) {
              setExpiry(undefined);
              setSymbol(s);
            }
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Symbol"
            aria-label="Symbol"
            className="h-8 w-28 rounded-md border border-border bg-background px-2 font-mono text-xs uppercase outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Load
          </button>
        </form>
      </header>

      <BookPanel book={book} />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <ChainPanel
          chain={chain}
          onExpiry={(e) => {
            setExpiry(e);
            void load(symbol, e);
          }}
        />
        <TapePanel tape={tape} />
      </div>
    </div>
  );
}

function Unavailable({ reason }: { reason?: string | null }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <span>{reason || "Data unavailable from the free feed right now."}</span>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider">
        {icon}
        {title}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function BookPanel({ book }: { book: BookSnapshot | null }) {
  return (
    <Card title="Quote Depth (Level 1)" icon={<BookOpen className="h-3.5 w-3.5 text-primary" />}>
      {!book ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !book.available ? (
        <Unavailable reason={book.reason} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Metric label="Bid" value={book.bid} extra={book.bid_size ? `${book.bid_size}×` : undefined} tone="success" />
            <Metric label="Ask" value={book.ask} extra={book.ask_size ? `${book.ask_size}×` : undefined} tone="danger" />
            <Metric label="Last" value={book.last} />
            <Metric label="Spread" value={book.spread} />
            <Metric label="Spread bps" value={book.spread_bps} />
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">{book.note}</p>
        </>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  extra,
  tone,
}: {
  label: string;
  value: number | null;
  extra?: string;
  tone?: "success" | "danger";
}) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 bg-background p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm tabular-nums ${color}`}>
        {value ?? "—"}
        {extra && <span className="ml-1 text-[10px] text-muted-foreground">{extra}</span>}
      </div>
    </div>
  );
}

function ChainPanel({ chain, onExpiry }: { chain: OptionsChain | null; onExpiry: (e: string) => void }) {
  const [side, setSide] = useState<"calls" | "puts">("calls");
  if (!chain) {
    return (
      <Card title="Options Chain" icon={<Layers3 className="h-3.5 w-3.5 text-primary" />}>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </Card>
    );
  }
  if (!chain.available) {
    return (
      <Card title="Options Chain" icon={<Layers3 className="h-3.5 w-3.5 text-primary" />}>
        <Unavailable reason={chain.reason} />
      </Card>
    );
  }
  const s = summariseChain(chain);
  const rows: OptionRow[] = (side === "calls" ? chain.calls : chain.puts) ?? [];
  return (
    <Card title="Options Chain" icon={<Layers3 className="h-3.5 w-3.5 text-primary" />}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Expiry"
          value={chain.expiry}
          onChange={(e) => onExpiry(e.target.value)}
          className="h-7 rounded-md border border-border bg-background px-2 font-mono text-xs"
        >
          {(chain.expiries ?? []).map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <div className="flex rounded-md border border-border">
          {(["calls", "puts"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSide(k)}
              className={`px-3 py-1 text-xs uppercase ${side === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {k}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          P/C OI {chain.put_call_oi_ratio ?? "—"} · call OI {s.callOi.toLocaleString()} · put OI{" "}
          {s.putOi.toLocaleString()}
        </span>
      </div>
      <div className="max-h-[380px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card text-[10px] uppercase text-muted-foreground">
            <tr>
              {["Strike", "Bid", "Ask", "Last", "Vol", "OI", "IV"].map((h) => (
                <th key={h} className="px-2 py-1 text-right first:text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {rows.map((r) => (
              <tr key={r.contract ?? r.strike} className={`border-t border-border/40 ${r.in_the_money ? "bg-primary/5" : ""}`}>
                <td className="px-2 py-1">{r.strike ?? "—"}</td>
                <td className="px-2 py-1 text-right text-success">{r.bid ?? "—"}</td>
                <td className="px-2 py-1 text-right text-destructive">{r.ask ?? "—"}</td>
                <td className="px-2 py-1 text-right">{r.last ?? "—"}</td>
                <td className="px-2 py-1 text-right">{r.volume?.toLocaleString() ?? "—"}</td>
                <td className="px-2 py-1 text-right">{r.open_interest?.toLocaleString() ?? "—"}</td>
                <td className="px-2 py-1 text-right">{r.iv != null ? `${(r.iv * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TapePanel({ tape }: { tape: TapeSnapshot | null }) {
  return (
    <Card title="Time & Sales" icon={<Activity className="h-3.5 w-3.5 text-primary" />}>
      {!tape ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !tape.available ? (
        <Unavailable reason={tape.reason} />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Buy pressure</span>
            <span className="font-mono text-success">{tape.buy_pressure_pct ?? "—"}%</span>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-success" style={{ width: `${tape.buy_pressure_pct ?? 0}%` }} />
          </div>
          <div className="max-h-[340px] overflow-auto">
            <table className="w-full text-xs">
              <tbody className="font-mono tabular-nums">
                {tape.prints.map((p) => (
                  <tr key={p.ts} className="border-t border-border/40">
                    <td className="px-1 py-0.5 text-muted-foreground">{p.ts.slice(11, 19)}</td>
                    <td
                      className={`px-1 py-0.5 text-right ${
                        p.side === "buy" ? "text-success" : p.side === "sell" ? "text-destructive" : ""
                      }`}
                    >
                      {p.price ?? "—"}
                    </td>
                    <td className="px-1 py-0.5 text-right text-muted-foreground">
                      {p.size?.toLocaleString() ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{tape.note}</p>
        </>
      )}
    </Card>
  );
}
