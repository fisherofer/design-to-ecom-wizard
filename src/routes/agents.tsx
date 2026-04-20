import { createFileRoute } from "@tanstack/react-router";
import { Bot, Plus, Activity, Pause, Rss, Youtube, Newspaper, Whale, Globe, Brain } from "lucide-react";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agent Studio — AI Executive OS" },
      { name: "description", content: "Autonomous AI agents and connected data sources." },
    ],
  }),
  component: AgentStudio,
});

const SOURCES = [
  { name: "Bloomberg RSS", icon: Rss, status: "live", count: "312/day" },
  { name: "YouTube Channels", icon: Youtube, status: "live", count: "47 subs" },
  { name: "SEC 13F Filings", icon: Whale, status: "live", count: "184 funds" },
  { name: "Reuters Wire", icon: Newspaper, status: "live", count: "1.2k/day" },
  { name: "X / Twitter", icon: Globe, status: "paused", count: "128 lists" },
  { name: "Reddit r/wsb", icon: Globe, status: "live", count: "real-time" },
];

const AGENTS = [
  { name: "News Sentiment Scraper", role: "Tags every headline with sentiment, tickers, and confidence", status: "active", calls: "2,148/h" },
  { name: "Whale Watcher", role: "Tracks 13F changes >$50M and pings ensemble", status: "active", calls: "12/h" },
  { name: "Earnings Drift Detector", role: "Monitors post-earnings drift across S&P500", status: "active", calls: "84/h" },
  { name: "Crypto Liquidation Hunter", role: "Surfaces large liquidation clusters from CEX feeds", status: "active", calls: "318/h" },
  { name: "Code Patch Bot", role: "Reviews proposed Safe-Change patches before approval", status: "idle", calls: "0/h" },
  { name: "Risk Sentinel", role: "Hard-kills strategies breaching daily VaR limits", status: "active", calls: "1/min" },
];

function AgentStudio() {
  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-end justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Agent Studio</h1>
            <p className="text-sm text-muted-foreground font-mono">
              {AGENTS.length} autonomous agents · {SOURCES.length} data sources
            </p>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />
          Deploy Agent
        </button>
      </div>

      <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Connected Sources
      </h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SOURCES.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.name} className="rounded-xl border border-border glass p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">{s.count}</div>
                </div>
                <span className={`flex h-2 w-2 rounded-full ${s.status === "live" ? "bg-success pulse-dot" : "bg-warning"}`} />
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Autonomous Agents
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {AGENTS.map((a) => (
          <div key={a.name} className="rounded-xl border border-border glass p-4 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
                  <Brain className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{a.name}</div>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">{a.role}</p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] uppercase shrink-0 ${
                  a.status === "active"
                    ? "border-success/30 bg-success/15 text-success"
                    : "border-muted bg-muted text-muted-foreground"
                }`}
              >
                {a.status === "active" ? <Activity className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                {a.status}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] font-mono text-muted-foreground">
              <span>{a.calls}</span>
              <button className="text-primary hover:underline">configure →</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
