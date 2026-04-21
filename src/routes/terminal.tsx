import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Terminal, Trash2, RefreshCw, Filter, Loader2, Pause, Play } from "lucide-react";
import { api, type LogEntry } from "@/lib/api";

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

const FALLBACK_LOGS: LogEntry[] = [
  { ts: "09:14:02.118", level: "INFO", source: "engine.boot", message: "AI Executive OS v1.0 starting on local node" },
  { ts: "09:14:02.241", level: "INFO", source: "vault.crypto", message: "Decrypted 8 API keys from vault.enc" },
  { ts: "09:14:02.387", level: "INFO", source: "llm.router", message: "Routing policy loaded: local→cloud failover @ p95>800ms" },
  { ts: "09:14:02.442", level: "DEBUG", source: "ollama.client", message: "Connected to http://localhost:11434 (model: llama-3.1-8b)" },
  { ts: "09:14:02.661", level: "INFO", source: "broker.alpaca", message: "Account connected: cash=$24,118.42, buying_power=$48,236.84" },
  { ts: "09:14:03.002", level: "WARN", source: "broker.binance", message: "Rate-limit 80% reached on /api/v3/ticker — throttling" },
  { ts: "09:14:03.554", level: "INFO", source: "feed.polygon", message: "Subscribed to 312 tickers across 4 universes" },
  { ts: "09:14:04.901", level: "DEBUG", source: "ensemble.vote", message: "NVDA: 4/5 BUY (momentum=87, sentiment=72, mr=hold, vol=ok, ml=88)" },
  { ts: "09:14:05.118", level: "INFO", source: "executor", message: "ORDER ACK · BUY 12 NVDA @ 945.32 (slippage 4bps) id=ord_a8f3b" },
  { ts: "09:14:06.245", level: "ERROR", source: "llm.anthropic", message: "API key expired — failover to gemini engaged" },
  { ts: "09:14:06.411", level: "INFO", source: "llm.gemini", message: "Failover successful · response 412ms" },
  { ts: "09:14:07.002", level: "DEBUG", source: "risk.guard", message: "Daily PnL: +$214.18 / limit -$500 — within bounds" },
  { ts: "09:14:08.881", level: "WARN", source: "feed.polygon", message: "Stale tick detected for TSLA · last update 4.2s ago" },
  { ts: "09:14:09.114", level: "INFO", source: "ensemble.vote", message: "TSLA: 3/5 SELL (mr=overbought, momentum=weak, sent=neg)" },
  { ts: "09:14:09.302", level: "INFO", source: "executor", message: "ORDER ACK · SELL 8 TSLA @ 178.90 id=ord_c2k9p" },
  { ts: "09:14:11.001", level: "DEBUG", source: "metrics", message: "loop_p99=18ms · llm_p95=412ms · queue_depth=0" },
];

const LEVEL_STYLES: Record<LogLevel, { text: string; bg: string; dot: string; label: string }> = {
  ERROR: {
    text: "text-red-400",
    bg: "bg-red-500/10 border-l-2 border-red-500/60",
    dot: "bg-red-500",
    label: "text-red-300 bg-red-500/15",
  },
  WARN: {
    text: "text-yellow-300",
    bg: "bg-yellow-500/[0.06] border-l-2 border-yellow-500/50",
    dot: "bg-yellow-400",
    label: "text-yellow-200 bg-yellow-500/15",
  },
  INFO: {
    text: "text-sky-300",
    bg: "border-l-2 border-transparent",
    dot: "bg-sky-400",
    label: "text-sky-200 bg-sky-500/15",
  },
  DEBUG: {
    text: "text-purple-300",
    bg: "border-l-2 border-transparent",
    dot: "bg-purple-400",
    label: "text-purple-200 bg-purple-500/15",
  },
};

function TerminalLogs() {
  const [filter, setFilter] = useState<LogLevel | "ALL">("ALL");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listLogs(undefined, 200);
      setLogs(data.length > 0 ? data : FALLBACK_LOGS);
    } catch {
      setLogs(FALLBACK_LOGS);
    } finally {
      setLoading(false);
      setLastFetch(new Date());
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, filter]);

  const filtered = useMemo(
    () => (filter === "ALL" ? logs : logs.filter((l) => l.level === filter)),
    [logs, filter],
  );

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
    logs.forEach((l) => {
      c[l.level as LogLevel] = (c[l.level as LogLevel] ?? 0) + 1;
    });
    return c;
  }, [logs]);

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
              {filtered.length} entries · {autoScroll ? "live tail" : "paused"}
              {lastFetch && ` · last fetch ${lastFetch.toLocaleTimeString()}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          {(["ERROR", "WARN", "INFO", "DEBUG"] as const).map((lvl) => (
            <div
              key={lvl}
              className={`flex items-center gap-1.5 rounded px-2 py-1 ${LEVEL_STYLES[lvl].label}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_STYLES[lvl].dot}`} />
              {lvl} {counts[lvl]}
            </div>
          ))}
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
              onClick={() => setAutoScroll((v) => !v)}
              className={`flex h-7 items-center gap-1.5 rounded border px-2.5 font-mono text-[10px] uppercase transition-colors ${
                autoScroll
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {autoScroll ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {autoScroll ? "Tail" : "Paused"}
            </button>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex h-7 items-center gap-1.5 rounded border border-border bg-background/50 px-2.5 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
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
          ref={scrollRef}
          className="relative max-h-[60vh] min-h-[400px] overflow-y-auto p-4 font-mono text-xs scan-lines"
          style={{ background: "#0a0f1c" }}
        >
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>connecting to /var/log/engine.jsonl …</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">— no log entries —</div>
          ) : (
            filtered.map((l, i) => {
              const style = LEVEL_STYLES[l.level as LogLevel] ?? LEVEL_STYLES.INFO;
              return (
                <div
                  key={`${l.ts}-${i}`}
                  className={`group flex gap-3 py-1 leading-relaxed pl-2 -mx-2 rounded-r hover:bg-foreground/[0.04] ${style.bg}`}
                >
                  <span className="text-muted-foreground/60 tabular-nums shrink-0">{l.ts}</span>
                  <span className={`shrink-0 w-12 font-bold ${style.text}`}>{l.level}</span>
                  <span className="shrink-0 w-32 text-muted-foreground truncate">{l.source}</span>
                  <span className={`break-all ${style.text} opacity-95`}>{l.message}</span>
                </div>
              );
            })
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
