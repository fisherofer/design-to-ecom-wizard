import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TrendingUp, Coins, LineChart, Waves, Newspaper } from "lucide-react";
import {
  getQuotes,
  getWhales,
  getSignals,
  getSentiment,
  type AssetClass,
  type Quote,
  type Whale,
  type Signal,
  type SentimentScore,
} from "@/lib/marketData";
import { useRefreshInterval } from "@/lib/refreshIntervals";

export const Route = createFileRoute("/trading")({
  head: () => ({
    meta: [
      { title: "Trading Hub — AI Executive OS" },
      { name: "description", content: "Crypto + equities live signals, whales, sentiment." },
    ],
  }),
  component: TradingHub,
});

function TradingHub() {
  const [tab, setTab] = useState<AssetClass | "all">("all");
  const [quotes, setQuotes] = useState<Quote[]>(() => getQuotes());
  const [whales, setWhales] = useState<Whale[]>(() => getWhales());
  const [signals, setSignals] = useState<Signal[]>(() => getSignals());
  const [sentiment, setSentiment] = useState<SentimentScore[]>(() => getSentiment());
  const ms = useRefreshInterval("ticker");

  useEffect(() => {
    if (!ms) return;
    const t = setInterval(() => {
      setQuotes(getQuotes());
      setWhales(getWhales());
      setSignals(getSignals());
      setSentiment(getSentiment());
    }, ms);
    return () => clearInterval(t);
  }, [ms]);

  const filtered = tab === "all" ? quotes : quotes.filter((q) => q.klass === tab);

  return (
    <div className="px-6 py-6">
      <header className="mb-6 flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">Trading Hub</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Crypto · equities · whales · sentiment — refresh {ms}ms
          </p>
        </div>
        <div className="flex rounded-md border border-border bg-card/40 p-0.5 text-xs font-mono">
          {(["all", "crypto", "stock"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 uppercase tracking-wider transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-xl border border-border glass">
          <Header icon={Coins} title="Live Quotes" hint={`${filtered.length} assets`} />
          <div className="divide-y divide-border">
            {filtered.map((q) => (
              <div key={q.symbol} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted font-mono text-[10px] font-bold uppercase">
                    {q.symbol.slice(0, 3)}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{q.name}</div>
                    <div className="text-[11px] font-mono uppercase text-muted-foreground">
                      {q.klass} · {q.symbol}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono tabular-nums">
                    ${q.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </div>
                  <div
                    className={`text-[11px] font-mono tabular-nums ${
                      q.change24h >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {q.change24h >= 0 ? "+" : ""}
                    {q.change24h.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-xl border border-border glass">
            <Header icon={Waves} title="Whale Activity" hint="last 15m" />
            <div className="divide-y divide-border">
              {whales.map((w, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between text-[11px] font-mono uppercase">
                    <span
                      className={
                        w.side === "buy"
                          ? "text-success"
                          : w.side === "sell"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }
                    >
                      {w.side} · {w.asset}
                    </span>
                    <span className="text-muted-foreground">
                      ${(w.amountUsd / 1_000_000).toFixed(1)}M
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground truncate">
                    {w.from} → {w.to}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border glass">
            <Header icon={Newspaper} title="Sentiment" hint="multi-source" />
            <div className="px-5 py-4 space-y-2.5">
              {sentiment.map((s) => (
                <div key={s.asset}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-mono">{s.asset}</span>
                    <span
                      className={`font-mono tabular-nums ${
                        s.score >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {s.score > 0 ? "+" : ""}
                      {s.score} · {s.sources}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${s.score >= 0 ? "bg-success" : "bg-destructive"}`}
                      style={{ width: `${Math.abs(s.score)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="mt-6 rounded-xl border border-border glass">
        <Header icon={LineChart} title="AI Signal Stream" hint={`${signals.length} fresh`} />
        <div className="divide-y divide-border">
          {signals.map((s, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-md font-mono text-xs font-bold ${
                    s.action === "BUY"
                      ? "bg-success/15 text-success"
                      : s.action === "SELL"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-warning/15 text-warning"
                  }`}
                >
                  {s.action[0]}
                </span>
                <div>
                  <div className="text-sm font-medium">
                    {s.symbol}{" "}
                    <span className="text-[10px] font-mono uppercase text-muted-foreground">
                      {s.klass}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">{s.strategy}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono tabular-nums">
                  ${s.price.toLocaleString()}
                </div>
                <div className="text-[11px] font-mono text-muted-foreground">
                  conf {s.confidence}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Header({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Coins;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider">{title}</h3>
      </div>
      <span className="text-[10px] font-mono uppercase text-muted-foreground">{hint}</span>
    </div>
  );
}
