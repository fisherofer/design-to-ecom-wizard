import { createFileRoute } from "@tanstack/react-router";
import { Brain, Sparkles, BookOpen, Newspaper } from "lucide-react";
import { SmartAiRouterPanel } from "@/components/intelligence/SmartAiRouterPanel";
import { AiPluginsManager } from "@/components/intelligence/AiPluginsManager";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: "Intelligence Hub — AI Executive OS" },
      { name: "description", content: "AI-powered market intelligence and research." },
    ],
  }),
  component: IntelligenceHub,
});

const FEEDS = [
  {
    src: "Bloomberg",
    time: "2m ago",
    title: "NVIDIA's Blackwell architecture sees 47% YoY adoption from hyperscalers",
    sentiment: "bullish",
    tickers: ["NVDA", "MSFT", "META"],
  },
  {
    src: "Reuters",
    time: "11m ago",
    title: "Federal Reserve signals patient approach amid sticky core inflation print",
    sentiment: "neutral",
    tickers: ["SPY", "TLT", "DXY"],
  },
  {
    src: "WSJ",
    time: "32m ago",
    title: "OpenAI in talks to raise $40B at $300B valuation, sources say",
    sentiment: "bullish",
    tickers: ["MSFT", "NVDA"],
  },
  {
    src: "FT",
    time: "1h ago",
    title: "Tesla's China deliveries miss estimates as price war intensifies",
    sentiment: "bearish",
    tickers: ["TSLA", "BYD"],
  },
];

function IntelligenceHub() {
  return (
    <div className="px-6 py-6">
      <PageHeader
        icon={Brain}
        title="Intelligence Hub"
        subtitle="Multi-source AI research · sentiment graph · narrative tracking"
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <SmartAiRouterPanel />
          <AiPluginsManager />

          <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5 glass-strong">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-base font-semibold">AI Daily Brief</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  Markets enter risk-on mode as chip stocks rally on Blackwell adoption data.
                  Crypto correlates with equities at 0.71. Watch <span className="text-primary font-mono">NVDA, BTC, SOL</span>
                  for momentum continuation. Fed minutes Wednesday could reset volatility regime.
                </p>
                <div className="mt-3 flex gap-2">
                  <Tag color="success">Risk-On</Tag>
                  <Tag color="primary">High Conviction</Tag>
                  <Tag color="muted">Generated 09:14 UTC</Tag>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border glass">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                  Live Feed
                </h3>
              </div>
              <span className="text-[10px] font-mono uppercase text-muted-foreground">
                4 sources · 312 today
              </span>
            </div>
            <div className="divide-y divide-border">
              {FEEDS.map((f, i) => (
                <div key={i} className="px-5 py-4 hover:bg-card/40 transition-colors">
                  <div className="flex items-center gap-3 text-[11px] font-mono uppercase">
                    <span className="text-primary">{f.src}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{f.time}</span>
                    <Tag
                      color={
                        f.sentiment === "bullish" ? "success" : f.sentiment === "bearish" ? "destructive" : "muted"
                      }
                    >
                      {f.sentiment}
                    </Tag>
                  </div>
                  <p className="mt-1.5 text-sm text-foreground leading-snug">{f.title}</p>
                  <div className="mt-2 flex gap-1.5">
                    {f.tickers.map((t) => (
                      <span
                        key={t}
                        className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-border glass p-5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                Active Narratives
              </h3>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { name: "AI Infrastructure", strength: 92, dir: "up" },
                { name: "Rate Cut Hopes", strength: 64, dir: "up" },
                { name: "China Reopening", strength: 41, dir: "down" },
                { name: "EV Slowdown", strength: 78, dir: "down" },
                { name: "Crypto ETF Flows", strength: 86, dir: "up" },
              ].map((n) => (
                <div key={n.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-foreground">{n.name}</span>
                    <span
                      className={`font-mono tabular-nums ${
                        n.dir === "up" ? "text-success" : "text-destructive"
                      }`}
                    >
                      {n.dir === "up" ? "↗" : "↘"} {n.strength}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${n.dir === "up" ? "bg-success" : "bg-destructive"}`}
                      style={{ width: `${n.strength}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border glass p-5">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
              Model Coverage
            </h3>
            <div className="mt-4 space-y-2 font-mono text-xs">
              {[
                ["Gemini 1.5 Pro", "online"],
                ["Groq Llama-70B", "online"],
                ["Perplexity Sonar", "online"],
                ["Ollama 8B (local)", "online"],
                ["Claude 3.5 Haiku", "rate-limited"],
              ].map(([n, s]) => (
                <div
                  key={n}
                  className="flex items-center justify-between rounded border border-border/50 bg-card/30 px-2.5 py-2"
                >
                  <span>{n}</span>
                  <span
                    className={`flex items-center gap-1.5 ${
                      s === "online" ? "text-success" : "text-warning"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full pulse-dot ${
                        s === "online" ? "bg-success" : "bg-warning"
                      }`}
                    />
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Brain;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground font-mono">{subtitle}</p>
      </div>
    </div>
  );
}

function Tag({
  children,
  color = "muted",
}: {
  children: React.ReactNode;
  color?: "primary" | "success" | "destructive" | "warning" | "muted";
}) {
  const map = {
    primary: "bg-primary/15 text-primary border-primary/30",
    success: "bg-success/15 text-success border-success/30",
    destructive: "bg-destructive/15 text-destructive border-destructive/30",
    warning: "bg-warning/15 text-warning border-warning/30",
    muted: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${map[color]}`}>
      {children}
    </span>
  );
}
