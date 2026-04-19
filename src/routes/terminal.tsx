import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Terminal, Trash2, RefreshCw, Filter } from "lucide-react";

export const Route = createFileRoute("/terminal")({
  head: () => ({
    meta: [
      { title: "Terminal Logs — AI Executive OS" },
      { name: "description", content: "Deep trace logs for the trading engine." },
    ],
  }),
  component: TerminalLogs,
});

type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

const RAW_LOGS: { ts: string; lvl: LogLevel; src: string; msg: string }[] = [
  { ts: "09:14:02.118", lvl: "INFO", src: "engine.boot", msg: "AI Executive OS v1.0 starting on local node" },
  { ts: "09:14:02.241", lvl: "INFO", src: "vault.crypto", msg: "Decrypted 8 API keys from vault.enc" },
  { ts: "09:14:02.387", lvl: "INFO", src: "llm.router", msg: "Routing policy loaded: local→cloud failover @ p95>800ms" },
  { ts: "09:14:02.442", lvl: "DEBUG", src: "ollama.client", msg: "Connected to http://localhost:11434 (model: llama-3.1-8b)" },
  { ts: "09:14:02.661", lvl: "INFO", src: "broker.alpaca", msg: "Account connected: cash=$24,118.42, buying_power=$48,236.84" },
  { ts: "09:14:03.002", lvl: "WARN", src: "broker.binance", msg: "Rate-limit 80% reached on /api/v3/ticker — throttling" },
  { ts: "09:14:03.554", lvl: "INFO", src: "feed.polygon", msg: "Subscribed to 312 tickers across 4 universes" },
  { ts: "09:14:04.901", lvl: "DEBUG", src: "ensemble.vote", msg: "NVDA: 4/5 BUY (momentum=87, sentiment=72, mr=hold, vol=ok, ml=88)" },
  { ts: "09:14:05.118", lvl: "INFO", src: "executor", msg: "ORDER ACK · BUY 12 NVDA @ 945.32 (slippage 4bps) id=ord_a8f3b" },
  { ts: "09:14:06.245", lvl: "ERROR", src: "llm.anthropic", msg: "API key expired — failover to gemini engaged" },
  { ts: "09:14:06.411", lvl: "INFO", src: "llm.gemini", msg: "Failover successful · response 412ms" },
  { ts: "09:14:07.002", lvl: "DEBUG", src: "risk.guard", msg: "Daily PnL: +$214.18 / limit -$500 — within bounds" },
  { ts: "09:14:08.881", lvl: "WARN", src: "feed.polygon", msg: "Stale tick detected for TSLA · last update 4.2s ago" },
  { ts: "09:14:09.114", lvl: "INFO", src: "ensemble.vote", msg: "TSLA: 3/5 SELL (mr=overbought, momentum=weak, sent=neg)" },
  { ts: "09:14:09.302", lvl: "INFO", src: "executor", msg: "ORDER ACK · SELL 8 TSLA @ 178.90 id=ord_c2k9p" },
  { ts: "09:14:11.001", lvl: "DEBUG", src: "metrics", msg: "loop_p99=18ms · llm_p95=412ms · queue_depth=0" },
];

const LEVEL_COLORS: Record<LogLevel, string> = {
  ERROR: "text-destructive",
  WARN: "text-warning",
  INFO: "text-primary",
  DEBUG: "text-accent",
};

function TerminalLogs() {
  const [filter, setFilter] = useState<LogLevel | "ALL">("ALL");
  const [logs, setLogs] = useState(RAW_LOGS);

  const filtered = useMemo(
    () => (filter === "ALL" ? logs : logs.filter((l) => l.lvl === filter)),
    [logs, filter],
  );

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Terminal className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Deep Trace Terminal</h1>
            <p className="text-sm text-muted-foreground font-mono">
              {filtered.length} entries · live tail
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border-strong overflow-hidden shadow-[0_0_60px_-20px_var(--primary)]">
        <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-destructive/70" />
            <span className="h-3 w-3 rounded-full bg-warning/70" />
            <span className="h-3 w-3 rounded-full bg-success/70" />
            <span className="ml-3 font-mono text-[11px] text-muted-foreground">
              ofer-trading-bot · /var/log/engine.jsonl
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded border border-border bg-background/50 p-0.5">
              <Filter className="ml-1.5 h-3 w-3 text-muted-foreground" />
              {(["ALL", "ERROR", "WARN", "INFO", "DEBUG"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setFilter(l)}
                  className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase transition-colors ${
                    filter === l
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              onClick={() => setLogs([...RAW_LOGS])}
              className="flex h-7 items-center gap-1.5 rounded border border-border bg-background/50 px-2.5 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
            <button
              onClick={() => setLogs([])}
              className="flex h-7 items-center gap-1.5 rounded border border-border bg-background/50 px-2.5 font-mono text-[10px] uppercase text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          </div>
        </div>

        <div
          className="relative max-h-[60vh] overflow-y-auto p-4 font-mono text-xs scan-lines"
          style={{ background: "var(--terminal-bg)" }}
        >
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">— no log entries —</div>
          ) : (
            filtered.map((l, i) => (
              <div
                key={i}
                className="group flex gap-3 py-0.5 leading-relaxed hover:bg-foreground/[0.03] -mx-2 px-2 rounded"
              >
                <span className="text-muted-foreground/60 tabular-nums shrink-0">{l.ts}</span>
                <span className={`shrink-0 w-12 font-bold ${LEVEL_COLORS[l.lvl]}`}>{l.lvl}</span>
                <span className="shrink-0 w-32 text-muted-foreground truncate">{l.src}</span>
                <span className="text-foreground/90 break-all">{l.msg}</span>
              </div>
            ))
          )}
          <div className="mt-2 flex items-center gap-2 text-muted-foreground">
            <span className="text-primary">$</span>
            <span className="inline-block h-3 w-1.5 bg-primary pulse-dot" />
          </div>
        </div>
      </div>
    </div>
  );
}
